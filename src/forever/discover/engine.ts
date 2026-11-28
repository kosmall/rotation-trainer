// Build discovery for one level: every rotation × pet combination gets a short talent search
// (screen), the best get a long one (search), and the best distinct results are re-run on many
// common seeds (final) next to the known builds (baseline). Work is split into tasks that a
// runner executes (inline here, worker threads in the CLI). Framework-free and Node-free.

import { createRng } from '../../engine/rng';
import { loadVariant, ranksAt, VARIANT_IDS, type BuildVariant } from '../builds';
import classicBase from '../data/classic_base.json';
import levelsJson from '../data/levels.json';
import { loadParams } from '../data/load';
import spellsJson from '../data/spells.json';
import talentsJson from '../data/talents.json';
import { pairedDiff, type MetricDiff } from '../duel';
import { runCell, type CellMetrics, type SessionResult } from '../runner';
import { pointsAtLevel, TALENT_BY_ID, TALENTS, validatePicks, type Ranks } from '../talents';
import type { Params, Tree } from '../types';
import { buildRotation, effectiveKey, enumerateCombos, mixVariants, playedLabel, requiredRanks, type Combo, type FillerGene, type SpaceFilter } from './space';
import { canonicalPicks, hillClimb, isLegal, modelledDistance, modelledKey, pointDistance, type Scored } from './talent-search';

export interface StageBudget {
  starts: number;
  /** Talent evaluations per combination (across its starts). */
  evals: number;
  sessions: number;
}

export interface Budget {
  screen: StageBudget;
  /** Combinations taken from the screen to the long search. */
  keep: number;
  /** ... plus at least this many of each filler, so no rotation family is dropped by noise alone. */
  perFamilyMin: number;
  search: StageBudget;
  /** Distinct results re-run on many seeds. */
  final: number;
  finalSessions: number;
  /** Best rotations whose neighbours are tried with mixed fillers and other effect floors (round 1; a third of it in round 2). 0 = no mixing. */
  mixBases: number;
  /** Mixed variants of a round that get the long search. */
  mixKeep: number;
}

export const DEFAULT_BUDGET: Budget = { screen: { starts: 2, evals: 30, sessions: 2 }, keep: 200, perFamilyMin: 3, search: { starts: 8, evals: 200, sessions: 10 }, final: 60, finalSessions: 200, mixBases: 24, mixKeep: 60 };
export const QUICK_BUDGET: Budget = { screen: { starts: 1, evals: 8, sessions: 1 }, keep: 20, perFamilyMin: 1, search: { starts: 2, evals: 20, sessions: 3 }, final: 25, finalSessions: 20, mixBases: 4, mixKeep: 8 };

export interface DiscoverOptions {
  level: number;
  profile: string;
  mobs: 1 | 2 | 3;
  seed: number;
  /** Talented perk rank (extra points). */
  perk: number;
  params: Params;
  top: number;
  budget: Budget;
  space?: SpaceFilter;
}

export type Task =
  | { kind: 'search'; stage: 'screen' | 'search'; combo: Combo }
  | { kind: 'final'; key: string; combo: Combo; ranks: Ranks }
  | { kind: 'baseline'; id: string };

export type TaskResult =
  | { kind: 'search'; comboId: string; found: Scored[]; evals: number }
  | { kind: 'final' | 'baseline'; key: string; metrics: CellMetrics; raw: SessionResult[] };

/** Runs the tasks (in any order or in parallel) and returns the results in task order; `onDone` sees each result as it finishes. */
export type Runner = (tasks: Task[], onDone: (r: TaskResult) => void) => Promise<TaskResult[]>;

export interface DiscoverState {
  hash: string;
  screen: Record<string, TaskResult>;
  search: Record<string, TaskResult>;
}

export interface TopRow {
  rank: number;
  combo: Combo;
  ranks: Ranks;
  label: string;
  perTree: Record<Tree, number>;
  freePoints: number;
  metrics: CellMetrics;
  kphCi: [number, number];
  gainVsBest: MetricDiff & { pct: number; vs: string };
  /** The paired difference to row 1 is not significant. */
  tiedWithFirst: boolean;
  nearestKnown: { id: string; distance: number };
  /** Talents whose point can go to a dead talent without a significant loss (top 5 only). */
  insensitive?: string[];
}

export interface BaselineRow {
  id: string;
  metrics: CellMetrics;
  kphCi: [number, number];
}

export interface DiscoverResult {
  meta: {
    level: number;
    points: number;
    profile: string;
    mobs: number;
    seed: number;
    perk: number;
    changedParams: Record<string, unknown>;
    hash: string;
    combos: number;
    /** Mixed variants (second filler, other effect floors) screened around the best rotations. */
    mixed?: number;
    searched: number;
    evaluations: number;
  };
  baseline: BaselineRow[];
  top: TopRow[];
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const DATA_TEXT = JSON.stringify([spellsJson, talentsJson, levelsJson, classicBase]);

/** Identifies the inputs of a run: a saved state with another hash is not resumed. */
export function stateHash(o: DiscoverOptions): string {
  const inputs = JSON.stringify([o.params, o.level, o.profile, o.mobs, o.seed, o.perk, o.budget, o.space ?? null]);
  return `${fnv1a(DATA_TEXT).toString(16)}-${fnv1a(inputs).toString(16)}`;
}

const STAGE_SEED = { screen: 1, search: 2, final: 3 } as const;
/** Session seeds of a stage: seed+1..seed+n. Stages and run seeds use disjoint ranges, so the final re-run never reuses the sessions a finalist was selected on. */
export function stageSeed(o: DiscoverOptions, stage: keyof typeof STAGE_SEED): number {
  const offset = STAGE_SEED[stage] * 100_000;
  const plain = o.seed * 1_000_000 + offset;
  // Exact for every seed up to about 9e9 (the CLI allows 2^31-1): such results stay as they were. Beyond that the product is
  // rounded and stages would share sessions, so the seed is hashed to 32 bits first (the stage ranges stay 100 000 apart).
  if (Math.abs(plain) <= Number.MAX_SAFE_INTEGER - 100_000) return plain;
  return fnv1a(`${o.seed}`) * 1_000_000 + offset;
}

/** The variant a combination is simulated as (its pets; the rotation comes as data). */
export function comboVariant(c: Combo): BuildVariant {
  return { id: c.id, order: '', pet: c.pets.pet, sacrificed: c.pets.sacrificed, rotation: 'affliction', filler: '', rank: 'max', pre_respec_build: null, respec_level: 40 };
}

const KNOWN_IDS: readonly string[] = VARIANT_IDS;

function cell(o: DiscoverOptions, combo: Combo, ranks: Ranks, sessions: number, seed: number): { metrics: CellMetrics; raw: SessionResult[] } {
  return runCell({ variant: comboVariant(combo), level: o.level, profile: o.profile, params: o.params, mobs: o.mobs, ranks, rotation: buildRotation(combo.genes, o.params) }, sessions, seed);
}

/** Executes one task (pure; runs inside a worker). */
export function runTask(o: DiscoverOptions, t: Task): TaskResult {
  if (t.kind === 'search') {
    const b = o.budget[t.stage];
    const seed = stageSeed(o, t.stage);
    let evals = 0;
    const rotation = buildRotation(t.combo.genes, o.params);
    const variant = comboVariant(t.combo);
    const evaluate = (ranks: Ranks): number => {
      evals++;
      return runCell({ variant, level: o.level, profile: o.profile, params: o.params, mobs: o.mobs, ranks, rotation }, b.sessions, seed).metrics.killsPerHour;
    };
    const found = hillClimb({
      space: { points: pointsAtLevel(o.level, o.perk), required: requiredRanks(t.combo) },
      evaluate,
      starts: b.starts,
      evals: b.evals,
      rng: createRng((fnv1a(t.combo.id) ^ o.seed) >>> 0),
      keep: 3,
    });
    return { kind: 'search', comboId: t.combo.id, found, evals };
  }
  if (t.kind === 'final') {
    const r = cell(o, t.combo, t.ranks, o.budget.finalSessions, stageSeed(o, 'final'));
    return { kind: 'final', key: t.key, ...r };
  }
  const v = loadVariant(t.id);
  const r = runCell({ variant: v, level: o.level, profile: o.profile, params: o.params, mobs: o.mobs, picks: { legacyPerk: o.perk } }, o.budget.finalSessions, stageSeed(o, 'final'));
  return { kind: 'baseline', key: t.id, ...r };
}

export function inlineRunner(o: DiscoverOptions): Runner {
  return async (tasks, onDone) =>
    tasks.map((t) => {
      const r = runTask(o, t);
      onDone(r);
      return r;
    });
}

interface Row {
  combo: Combo;
  ranks: Ranks;
  metrics: CellMetrics;
  effKey: string;
}

const byKph = (a: Row, b: Row): number => b.metrics.killsPerHour - a.metrics.killsPerHour || a.metrics.deathsPerHour - b.metrics.deathsPerHour;

/** The best rows with at most 2 per effective combination, the 2nd only when more than 2 points of modelled talents are moved. */
export function pickTop<T extends Row>(rows: readonly T[], top: number): T[] {
  const sorted = [...rows].sort(byKph);
  const groups = new Map<string, T[]>();
  const out: T[] = [];
  for (const r of sorted) {
    if (out.length >= top) break;
    const g = groups.get(r.effKey) ?? [];
    if (g.length >= 2) continue;
    if (g.length === 1 && modelledDistance((g[0] as T).ranks, r.ranks) <= 2) continue;
    g.push(r);
    groups.set(r.effKey, g);
    out.push(r);
  }
  return out;
}

const ci = (m: CellMetrics): [number, number] => {
  const half = m.sessions > 1 ? (1.96 * m.killsPerHourStd) / Math.sqrt(m.sessions) : 0;
  return [m.killsPerHour - half, m.killsPerHour + half];
};

function changedParams(p: Params): Record<string, unknown> {
  const def = loadParams() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (JSON.stringify(v) !== JSON.stringify(def[k])) out[k] = v;
  return out;
}

/** Moves one point of `id` to the first dead (unmodelled) talent that keeps the build legal. */
function deadPointVariant(ranks: Ranks, id: string, points: number, required: Ranks): Ranks | null {
  for (const t of TALENTS) {
    if (t.status === 'modelled' || t.id === id) continue;
    const r: Ranks = { ...ranks, [id]: (ranks[id] ?? 0) - 1, [t.id]: (ranks[t.id] ?? 0) + 1 };
    if (r[id] === 0) delete r[id];
    if (isLegal(r, { points, required })) return r;
  }
  return null;
}

export interface DiscoverIo {
  state?: DiscoverState;
  save?: (s: DiscoverState) => void;
  progress?: (stage: string, done: number, total: number) => void;
}

export async function discover(o: DiscoverOptions, run: Runner, io: DiscoverIo = {}): Promise<DiscoverResult> {
  const hash = stateHash(o);
  const state: DiscoverState = io.state && io.state.hash === hash ? io.state : { hash, screen: {}, search: {} };
  const points = pointsAtLevel(o.level, o.perk);
  const combos = enumerateCombos(o.level, o.space);

  const searchStage = async (stage: 'screen' | 'search', list: Combo[], label: string = stage): Promise<void> => {
    const store = state[stage];
    const todo = list.filter((c) => !store[c.id]);
    let done = list.length - todo.length;
    io.progress?.(label, done, list.length);
    await run(
      todo.map((combo) => ({ kind: 'search', stage, combo })),
      (r) => {
        if (r.kind !== 'search') return;
        store[r.comboId] = r;
        done++;
        io.progress?.(label, done, list.length);
        if (done % 50 === 0) io.save?.(state);
      },
    );
    io.save?.(state);
  };
  const bestOf = (r: TaskResult | undefined): number => (r && r.kind === 'search' && r.found[0] ? r.found[0].kph : -Infinity);

  // 1. screen every combination
  await searchStage('screen', combos);

  // 2. long search for the best ones (and the best few of every filler)
  const ranked = combos.filter((c) => bestOf(state.screen[c.id]) > -Infinity).sort((a, b) => bestOf(state.screen[b.id]) - bestOf(state.screen[a.id]) || (a.id < b.id ? -1 : 1));
  const chosen = new Set(ranked.slice(0, o.budget.keep).map((c) => c.id));
  const perFiller = new Map<FillerGene, number>();
  for (const c of ranked) {
    const n = perFiller.get(c.genes.filler) ?? 0;
    if (n < o.budget.perFamilyMin) chosen.add(c.id);
    perFiller.set(c.genes.filler, n + 1);
  }
  const searchList = combos.filter((c) => chosen.has(c.id));
  await searchStage('search', searchList);

  // 2b. mixing: the neighbours of the best rotations (a second filler under a condition, other floors per effect),
  // screened and searched like the rest; round 2 mixes the winners of round 1 again (the two kinds combine)
  const searched = [...searchList];
  const known = new Set(combos.map((c) => c.id));
  let screenedExtra = 0;
  let roundBases = searchList;
  for (let round = 1; round <= 2 && o.budget.mixBases > 0; round++) {
    const n = round === 1 ? o.budget.mixBases : Math.max(1, Math.ceil(o.budget.mixBases / 3));
    const bases = roundBases
      .filter((c) => bestOf(state.search[c.id]) > -Infinity)
      .sort((a, b) => bestOf(state.search[b.id]) - bestOf(state.search[a.id]) || (a.id < b.id ? -1 : 1))
      .slice(0, n);
    const variants: Combo[] = [];
    for (const b of bases) {
      const r = state.search[b.id];
      const ranks = r && r.kind === 'search' && r.found[0] ? r.found[0].ranks : {};
      for (const v of mixVariants(b, o.level, ranks)) {
        if (known.has(v.id)) continue;
        known.add(v.id);
        variants.push(v);
      }
    }
    if (variants.length === 0) break;
    screenedExtra += variants.length;
    await searchStage('screen', variants, 'mix');
    const best = variants
      .filter((c) => bestOf(state.screen[c.id]) > -Infinity)
      .sort((a, b) => bestOf(state.screen[b.id]) - bestOf(state.screen[a.id]) || (a.id < b.id ? -1 : 1))
      .slice(0, o.budget.mixKeep);
    await searchStage('search', best, 'mix-search');
    searched.push(...best);
    roundBases = best;
  }

  // 3. distinct results, re-run on many common seeds next to the known builds
  const cands = new Map<string, { combo: Combo; ranks: Ranks; kph: number; effKey: string }>();
  for (const c of searched) {
    const r = state.search[c.id];
    if (!r || r.kind !== 'search') continue;
    for (const f of r.found) {
      const effKey = effectiveKey(c, o.level, f.ranks);
      const key = `${effKey}#${modelledKey(f.ranks)}`;
      const prev = cands.get(key);
      if (!prev || f.kph > prev.kph) cands.set(key, { combo: c, ranks: f.ranks, kph: f.kph, effKey });
    }
  }
  // the same diversity rule as the top list, so the re-run slots go to results that can make it
  const pool = [...cands.entries()].map(([key, c]) => ({ key, ...c, metrics: { killsPerHour: c.kph, deathsPerHour: 0 } as CellMetrics }));
  pool.sort((a, b) => (a.key < b.key ? -1 : 1));
  const finalists = pickTop(pool, o.budget.final).map((c): [string, (typeof pool)[number]] => [c.key, c]);
  const finalTasks: Task[] = [
    ...finalists.map(([key, c]): Task => ({ kind: 'final', key, combo: c.combo, ranks: c.ranks })),
    ...KNOWN_IDS.map((id): Task => ({ kind: 'baseline', id })),
  ];
  let finalDone = 0;
  const finalRes = await run(finalTasks, () => io.progress?.('final', ++finalDone, finalTasks.length));
  const raws = new Map<string, SessionResult[]>();
  const rows: (Row & { key: string })[] = [];
  const baselineRaw: { id: string; metrics: CellMetrics; raw: SessionResult[] }[] = [];
  finalRes.forEach((r, i) => {
    if (r.kind === 'search') return;
    raws.set(r.key, r.raw);
    const t = finalTasks[i] as Task;
    if (t.kind === 'final') {
      const c = cands.get(t.key) as { effKey: string };
      rows.push({ key: t.key, combo: t.combo, ranks: t.ranks, metrics: r.metrics, effKey: c.effKey });
    } else baselineRaw.push({ id: r.key, metrics: r.metrics, raw: r.raw });
  });

  const picked = pickTop(rows, o.top);
  const best = [...baselineRaw].sort((a, b) => b.metrics.killsPerHour - a.metrics.killsPerHour)[0];
  const knownRanks = KNOWN_IDS.flatMap((id) => {
    try {
      return [{ id, ranks: ranksAt(loadVariant(id), o.level, { legacyPerk: o.perk }) }];
    } catch {
      return [];
    }
  });
  const first = picked[0];
  const top: TopRow[] = picked.map((p, i) => {
    const raw = raws.get(p.key) as SessionResult[];
    const gain = best ? pairedDiff(raw, best.raw).killsPerHour : { mean: 0, ci95: [0, 0] as [number, number], significant: false };
    let nearest = { id: '', distance: Infinity };
    for (const k of knownRanks) {
      const d = pointDistance(p.ranks, k.ranks);
      if (d < nearest.distance) nearest = { id: k.id, distance: d };
    }
    const check = validatePicks(canonicalPicks(p.ranks));
    let free = 0;
    for (const [id, n] of Object.entries(p.ranks)) if (TALENT_BY_ID.get(id)?.status !== 'modelled') free += n;
    return {
      rank: i + 1,
      combo: p.combo,
      ranks: p.ranks,
      label: playedLabel(p.combo, o.level, p.ranks),
      perTree: check.pointsPerTree,
      freePoints: free,
      metrics: p.metrics,
      kphCi: ci(p.metrics),
      gainVsBest: { ...gain, pct: best && best.metrics.killsPerHour > 0 ? (100 * gain.mean) / best.metrics.killsPerHour : 0, vs: best?.id ?? '' },
      tiedWithFirst: i > 0 && first !== undefined && !pairedDiff(raws.get(first.key) as SessionResult[], raw).killsPerHour.significant,
      nearestKnown: nearest,
    };
  });

  // 4. which talents of the best 5 do not matter (a point moved to a dead talent costs nothing significant)
  const insTasks: Task[] = [];
  const insOwner: { row: number; talent: string }[] = [];
  top.slice(0, 5).forEach((row, ri) => {
    const required = requiredRanks(row.combo);
    for (const id of Object.keys(row.ranks).sort()) {
      if (TALENT_BY_ID.get(id)?.status !== 'modelled' || (row.ranks[id] ?? 0) <= (required[id] ?? 0)) continue;
      const r = deadPointVariant(row.ranks, id, points, required);
      if (!r) continue;
      insTasks.push({ kind: 'final', key: `ins:${ri}:${id}`, combo: row.combo, ranks: r });
      insOwner.push({ row: ri, talent: id });
    }
    row.insensitive = [];
  });
  let insDone = 0;
  const insRes = await run(insTasks, () => io.progress?.('insensitivity', ++insDone, insTasks.length));
  insRes.forEach((r, i) => {
    if (r.kind === 'search') return;
    const own = insOwner[i] as { row: number; talent: string };
    const row = top[own.row] as TopRow;
    const d = pairedDiff(raws.get((picked[own.row] as Row & { key: string }).key) as SessionResult[], r.raw).killsPerHour;
    if (!d.significant) row.insensitive?.push(own.talent);
  });

  const evaluations =
    [...Object.values(state.screen), ...Object.values(state.search)].reduce((a, r) => a + (r.kind === 'search' ? r.evals : 0), 0) + finalTasks.length + insTasks.length;
  return {
    meta: { level: o.level, points, profile: o.profile, mobs: o.mobs, seed: o.seed, perk: o.perk, changedParams: changedParams(o.params), hash, combos: combos.length, mixed: screenedExtra, searched: searched.length, evaluations },
    baseline: baselineRaw.map((b) => ({ id: b.id, metrics: b.metrics, kphCi: ci(b.metrics) })).sort((a, b) => b.metrics.killsPerHour - a.metrics.killsPerHour),
    top,
  };
}

