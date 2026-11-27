// Completing a found build to a later level (variant B): the points from the found level + 1 to the
// target level that make the whole leveling path fastest. Cost of a path = Σ over its levels of
// 1 / kills per hour (every level weighted the same). Start from the greedy path, then improve the
// whole sequence with local search (replace a point, swap two, replace a block). A Drain Life build
// that can still reach Wrack is also completed with Wrack as the filler (above a health floor), and
// the fastest rotation wins. Framework-free.

import { createRng, type Rng } from '../../engine/rng';
import { rotationId, type FillerGene } from '../rotation-genes';
import { runCell } from '../runner';
import { rankAt } from '../spells';
import { pointsAtLevel, validatePicks, type Ranks } from '../talents';
import { TALENT_BY_ID } from '../talents';
import type { Params, Tree } from '../types';
import { comboVariant } from './engine';
import { buildRotation, type Combo } from './space';
import { canonicalIndex, canonicalPicks, legalNext, modelledKey } from './talent-search';

export interface CompleteCtx {
  combo: Combo;
  /** The found ranks at `fromLevel` (they stay). */
  baseRanks: Ranks;
  fromLevel: number;
  toLevel: number;
  profile: string;
  mobs: 1 | 2 | 3;
  params: Params;
  sessions: number;
  seed: number;
}

/** Kills per hour cached by level and modelled ranks. */
export type KphCache = Map<string, number>;

const add = (r: Ranks, id: string): Ranks => ({ ...r, [id]: (r[id] ?? 0) + 1 });

export function pathLength(ctx: CompleteCtx): number {
  return Math.max(0, pointsAtLevel(ctx.toLevel) - pointsAtLevel(ctx.fromLevel));
}

export function kphAt(ctx: CompleteCtx, level: number, ranks: Ranks, cache: KphCache): number {
  const key = `${level}|${modelledKey(ranks)}`;
  let v = cache.get(key);
  if (v === undefined) {
    v = runCell({ variant: comboVariant(ctx.combo), level, profile: ctx.profile, params: ctx.params, mobs: ctx.mobs, ranks, rotation: buildRotation(ctx.combo.genes, ctx.params) }, ctx.sessions, ctx.seed).metrics.killsPerHour;
    cache.set(key, v);
  }
  return v;
}

/** Total time of a path (Σ 1/kph over its levels) and the kills per hour at each level. */
export function pathCost(ctx: CompleteCtx, path: readonly string[], cache: KphCache): { cost: number; kph: number[] } {
  let r: Ranks = { ...ctx.baseRanks };
  const kph: number[] = [];
  let cost = 0;
  path.forEach((id, i) => {
    r = add(r, id);
    const k = kphAt(ctx, ctx.fromLevel + 1 + i, r, cache);
    kph.push(k);
    cost += 1 / Math.max(k, 1e-9);
  });
  return { cost, kph };
}

export function harmonicKph(kph: readonly number[]): number {
  if (kph.length === 0) return 0;
  return kph.length / kph.reduce((a, k) => a + 1 / Math.max(k, 1e-9), 0);
}

// ---- rotation switches -----------------------------------------------------------------------

/** The talent a rotation switch waits for. */
const SWITCH_TALENT = 'wrack';
/** Fillers a Drain Life build may switch to: until Wrack is taken, and below the floor, they drain as before. */
export const WRACK_SWITCHES: readonly FillerGene[] = ['wrack_hp70', 'wrack_hp50'];

const treePoints = (r: Ranks, tree: Tree): number => Object.entries(r).reduce((a, [id, n]) => a + (TALENT_BY_ID.get(id)?.tree === tree ? n : 0), 0);

/** Whether `points` more points are enough to have one rank of a talent (its row gate and prerequisite first). */
function reachable(r: Ranks, id: string, points: number): boolean {
  const def = TALENT_BY_ID.get(id);
  if (!def) return false;
  if ((r[id] ?? 0) > 0) return true;
  const gate = 5 * def.row - treePoints(r, def.tree);
  const required = def.requires ? def.requires.rank - (r[def.requires.talent] ?? 0) : 0;
  return Math.max(0, gate, required) + 1 <= points;
}

/**
 * The rotations a completion tries for a build: its own first, then, for a Drain Life build that can have Wrack by
 * the last level, the same effects and pets with Wrack above a health floor as the filler. Such a rotation also covers
 * the levels before Wrack (it drains), so a completed build keeps a single rotation.
 */
export function rotationChoices(combo: Combo, ranks: Ranks, fromLevel: number, toLevel: number): Combo[] {
  const points = pointsAtLevel(toLevel) - pointsAtLevel(fromLevel);
  if (combo.genes.filler !== 'drain_life' || !rankAt(SWITCH_TALENT, 'max', toLevel) || !reachable(ranks, SWITCH_TALENT, points)) return [combo];
  const pets = combo.id.slice(combo.id.indexOf('|'));
  return [
    combo,
    ...WRACK_SWITCHES.map((filler): Combo => {
      const genes = { ...combo.genes, filler };
      return { id: `${rotationId(genes)}${pets}`, genes, pets: combo.pets };
    }),
  ];
}

/** The picks that lead to a talent as early as possible: it as soon as it is legal, until then its tree (the prerequisite before the gate opens without it). */
function toward(goal: string, r: Ranks, options: string[]): string[] {
  if (options.includes(goal)) return [goal];
  const def = TALENT_BY_ID.get(goal);
  if (!def) return options;
  const inTree = options.filter((id) => TALENT_BY_ID.get(id)?.tree === def.tree);
  const req = def.requires;
  const missing = req ? req.rank - (r[req.talent] ?? 0) : 0;
  if (req && missing > 0 && treePoints(r, def.tree) >= 5 * def.row - missing && inTree.includes(req.talent)) return [req.talent];
  return inTree.length > 0 ? inTree : options;
}

/** Each level takes the legal point with the best kills per hour at that level (ties: the lower row); with a `goal` talent, only the points that lead to it until it is taken. */
export function greedyPath(ctx: CompleteCtx, cache: KphCache, goal?: string): string[] {
  const path: string[] = [];
  let r: Ranks = { ...ctx.baseRanks };
  for (let i = 0; i < pathLength(ctx); i++) {
    const level = ctx.fromLevel + 1 + i;
    const legal = legalNext(r);
    const options = goal && !r[goal] ? toward(goal, r, legal) : legal;
    if (options.length === 0) break;
    let best = options[0] as string;
    let bestKph = -Infinity;
    const seen = new Set<string>();
    for (const id of options) {
      const next = add(r, id);
      const key = modelledKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const k = kphAt(ctx, level, next, cache);
      if (k > bestKph + 1e-9 || (Math.abs(k - bestKph) <= 1e-9 && canonicalIndex(id) < canonicalIndex(best))) {
        best = id;
        bestKph = k;
      }
    }
    path.push(best);
    r = add(r, best);
  }
  return path;
}

const legalPath = (ctx: CompleteCtx, base: readonly string[], path: readonly string[]): boolean => validatePicks([...base, ...path]).ok;

function ranksBefore(ctx: CompleteCtx, path: readonly string[], i: number): Ranks {
  let r: Ranks = { ...ctx.baseRanks };
  for (let k = 0; k < i; k++) r = add(r, path[k] as string);
  return r;
}

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng.next() * xs.length)] as T;

/**
 * Local search over the whole path: replace one point (40%), swap two (30%) or replace a block of 2-5
 * points with new legal ones (30%, pays dead points for a row that pays off later). A move is kept
 * when it shortens the total time. Stops after `maxSims` new simulations or 400 moves without gain.
 */
export function improvePath(ctx: CompleteCtx, start: readonly string[], maxSims: number, rng: Rng, cache: KphCache): string[] {
  const base = canonicalPicks(ctx.baseRanks);
  let cur = [...start];
  if (cur.length === 0) return cur;
  let curCost = pathCost(ctx, cur, cache).cost;
  const before = cache.size;
  let idle = 0;
  while (cache.size - before < maxSims && idle < 400) {
    const n = cur.length;
    const u = rng.next();
    let cand: string[] | null = null;
    if (u < 0.4) {
      const i = Math.floor(rng.next() * n);
      const options = legalNext(ranksBefore(ctx, cur, i)).filter((id) => id !== cur[i]);
      if (options.length > 0) {
        cand = [...cur];
        cand[i] = pick(options, rng);
      }
    } else if (u < 0.7 && n >= 2) {
      const i = Math.floor(rng.next() * n);
      let j = Math.floor(rng.next() * (n - 1));
      if (j >= i) j++;
      if (cur[i] !== cur[j]) {
        cand = [...cur];
        [cand[i], cand[j]] = [cand[j] as string, cand[i] as string];
      }
    } else {
      const i = Math.floor(rng.next() * n);
      const k = Math.min(n - i, 2 + Math.floor(rng.next() * 4));
      let r = ranksBefore(ctx, cur, i);
      const block: string[] = [];
      for (let b = 0; b < k; b++) {
        const options = legalNext(r);
        if (options.length === 0) break;
        const id = pick(options, rng);
        block.push(id);
        r = add(r, id);
      }
      if (block.length === k) cand = [...cur.slice(0, i), ...block, ...cur.slice(i + k)];
    }
    if (!cand || cand.join() === cur.join() || !legalPath(ctx, base, cand)) {
      idle++;
      continue;
    }
    const c = pathCost(ctx, cand, cache).cost;
    if (c < curCost - 1e-12) {
      cur = cand;
      curCost = c;
      idle = 0;
    } else idle++;
  }
  return cur;
}

/** A talent's name for the path table. */
export const talentName = (id: string): string => TALENT_BY_ID.get(id)?.name ?? id;

// ---- tasks and orchestration -----------------------------------------------------------------

export interface CompleteBudget {
  /** Independent local searches per row, from the greedy path. */
  restarts: number;
  sessions: number;
  /** New simulations per row (split across the restarts). */
  maxSims: number;
  /** Sessions of the final evaluation of the best and the greedy path. */
  finalSessions: number;
}

export const COMPLETE_FULL: CompleteBudget = { restarts: 4, sessions: 10, maxSims: 1500, finalSessions: 40 };
export const COMPLETE_QUICK: CompleteBudget = { restarts: 2, sessions: 4, maxSims: 300, finalSessions: 20 };

/** `choice`: which of the row's rotations (`rotationChoices`, 0 = its own) the task plays. */
export type CompleteTask =
  | { kind: 'complete-greedy'; row: number; choice: number; ctx: CompleteCtx; goal?: string }
  | { kind: 'complete-improve'; row: number; choice: number; ctx: CompleteCtx; start: string[]; maxSims: number; seed: number }
  | { kind: 'complete-final'; row: number; choice: number; ctx: CompleteCtx; path: string[]; which: 'best' | 'greedy' };

export type CompleteResult =
  | { kind: 'complete-path'; row: number; choice: number; path: string[]; cost: number; from: 'greedy' | 'goal' | 'improve' }
  | { kind: 'complete-final'; row: number; choice: number; which: 'best' | 'greedy'; kph: number[] };

/** Executes one completion task (pure; runs inside a worker). */
export function runCompleteTask(t: CompleteTask): CompleteResult {
  if (t.kind === 'complete-greedy') {
    const cache: KphCache = new Map();
    const path = greedyPath(t.ctx, cache, t.goal);
    return { kind: 'complete-path', row: t.row, choice: t.choice, path, cost: pathCost(t.ctx, path, cache).cost, from: t.goal ? 'goal' : 'greedy' };
  }
  if (t.kind === 'complete-improve') {
    const cache: KphCache = new Map();
    const path = improvePath(t.ctx, t.start, t.maxSims, createRng(t.seed), cache);
    return { kind: 'complete-path', row: t.row, choice: t.choice, path, cost: pathCost(t.ctx, path, cache).cost, from: 'improve' };
  }
  return { kind: 'complete-final', row: t.row, choice: t.choice, which: t.which, kph: pathCost(t.ctx, t.path, new Map()).kph };
}

export interface CompleteRowInput {
  rank: number;
  label: string;
  combo: Combo;
  ranks: Ranks;
}

export interface CompletedBuild {
  rank: number;
  label: string;
  combo: Combo;
  baseRanks: Ranks;
  fromLevel: number;
  toLevel: number;
  path: string[];
  /** The best path's points with the kills per hour at each level (final evaluation). */
  perLevel: { level: number; pick: string; kph: number }[];
  /** Harmonic mean of kills per hour over the path's levels (final evaluation). */
  avgKph: number;
  greedyPath: string[];
  greedyAvgKph: number;
  /** Costs on the search sessions (Σ 1/kph) with the rotation used: best ≤ greedy. */
  searchCost: number;
  greedySearchCost: number;
  /** Set when another filler won: from this level (Wrack taken) the rotation differs from the found one; `combo` carries it. */
  switched?: { filler: FillerGene; level: number };
  /** Kills per hour with the found rotation kept, when a switch was tried. */
  fixedAvgKph?: number;
}

export type CompleteRunner = (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) => Promise<CompleteResult[]>;
export type CompleteBase = Omit<CompleteCtx, 'combo' | 'baseRanks' | 'sessions'>;

/**
 * For every row and each of its rotations: greedy paths, local-search restarts from the better one, and a final
 * evaluation. The found rotation wins unless a switched one, whose path really takes Wrack, is faster.
 */
export async function completeBuilds(rows: readonly CompleteRowInput[], base: CompleteBase, b: CompleteBudget, run: CompleteRunner, progress?: (stage: string, done: number, total: number) => void): Promise<CompletedBuild[]> {
  type Path = Extract<CompleteResult, { kind: 'complete-path' }>;
  type Final = Extract<CompleteResult, { kind: 'complete-final' }>;
  const choices = rows.map((r) => rotationChoices(r.combo, r.ranks, base.fromLevel, base.toLevel));
  const plans = choices.flatMap((list, row) => list.map((combo, choice) => ({ row, choice, combo, input: rows[row] as CompleteRowInput })));
  const ctxOf = (p: (typeof plans)[number], sessions: number, seed: number): CompleteCtx => ({ ...base, combo: p.combo, baseRanks: p.input.ranks, sessions, seed });
  const stage = async (name: string, tasks: CompleteTask[]): Promise<CompleteResult[]> => {
    let done = 0;
    progress?.(name, 0, tasks.length);
    return run(tasks, () => progress?.(name, ++done, tasks.length));
  };
  /** The cheapest path of a row's rotation; the first one wins ties. */
  const cheapest = (list: readonly Path[], row: number, choice: number): Path =>
    list.filter((x) => x.row === row && x.choice === choice).reduce((a, x) => (x.cost < a.cost - 1e-12 ? x : a));

  const greedy = (await stage(
    'greedy',
    plans.flatMap((p): CompleteTask[] => {
      const free: CompleteTask = { kind: 'complete-greedy', row: p.row, choice: p.choice, ctx: ctxOf(p, b.sessions, base.seed) };
      // a switched rotation also tries the straight way to its talent, which a greedy path may never find
      return p.choice === 0 ? [free] : [free, { ...free, goal: SWITCH_TALENT }];
    }),
  )) as Path[];
  const improveTasks = plans.flatMap((p) =>
    Array.from({ length: b.restarts }, (_, k): CompleteTask => ({
      kind: 'complete-improve',
      row: p.row,
      choice: p.choice,
      ctx: ctxOf(p, b.sessions, base.seed),
      start: cheapest(greedy, p.row, p.choice).path,
      maxSims: Math.max(1, Math.floor(b.maxSims / b.restarts)),
      seed: base.seed * 1000 + p.input.rank * 10 + k + p.choice * 100_000,
    })),
  );
  const improved = (await stage('improve', improveTasks)) as Path[];
  const best = (row: number, choice: number): Path => cheapest([cheapest(greedy, row, choice), ...improved], row, choice);
  const finalSeed = base.seed + 7777;
  const finals = (await stage(
    'final',
    plans.flatMap((p): CompleteTask[] => {
      const task = (which: 'best' | 'greedy', path: string[]): CompleteTask => ({ kind: 'complete-final', row: p.row, choice: p.choice, which, ctx: ctxOf(p, b.finalSessions, finalSeed), path });
      const own = task('best', best(p.row, p.choice).path);
      return p.choice === 0 ? [own, task('greedy', cheapest(greedy, p.row, 0).path)] : [own];
    }),
  )) as Final[];
  const finalKph = (row: number, choice: number, which: 'best' | 'greedy'): number[] => finals.find((f) => f.row === row && f.choice === choice && f.which === which)?.kph ?? [];

  return rows.map((r, row) => {
    const greedy0 = cheapest(greedy, row, 0);
    const gk = finalKph(row, 0, 'greedy');
    let chosen = { choice: 0, path: best(row, 0).path, kph: finalKph(row, 0, 'best'), cost: best(row, 0).cost, greedyCost: greedy0.cost, level: 0 };
    // the search picked on few sessions; when greedy wins on the final ones, greedy is kept
    if (gk.length === chosen.kph.length && harmonicKph(gk) > harmonicKph(chosen.kph)) chosen = { ...chosen, path: greedy0.path, kph: gk };
    const fixedAvgKph = harmonicKph(chosen.kph);
    const list = choices[row] as Combo[];
    for (let choice = 1; choice < list.length; choice++) {
      const found = best(row, choice);
      const at = found.path.indexOf(SWITCH_TALENT);
      // without the talent the switched rotation plays like the found one: nothing to switch
      if (!r.ranks[SWITCH_TALENT] && at < 0) continue;
      const kph = finalKph(row, choice, 'best');
      if (harmonicKph(kph) > harmonicKph(chosen.kph))
        chosen = { choice, path: found.path, kph, cost: found.cost, greedyCost: cheapest(greedy, row, choice).cost, level: r.ranks[SWITCH_TALENT] ? base.fromLevel : base.fromLevel + 1 + at };
    }
    const combo = list[chosen.choice] as Combo;
    return {
      rank: r.rank,
      label: r.label,
      combo,
      baseRanks: r.ranks,
      fromLevel: base.fromLevel,
      toLevel: base.toLevel,
      path: chosen.path,
      perLevel: chosen.path.map((pick, i) => ({ level: base.fromLevel + 1 + i, pick, kph: chosen.kph[i] ?? 0 })),
      avgKph: harmonicKph(chosen.kph),
      greedyPath: greedy0.path,
      greedyAvgKph: harmonicKph(gk),
      searchCost: chosen.cost,
      greedySearchCost: chosen.greedyCost,
      ...(chosen.choice > 0 ? { switched: { filler: combo.genes.filler, level: chosen.level } } : {}),
      ...(list.length > 1 ? { fixedAvgKph } : {}),
    };
  });
}

export interface CompleteEtaInput {
  stage: string;
  done: number;
  total: number;
  stageElapsedSec: number;
  budget: CompleteBudget;
  rows: number;
  /** Rotations tried over all rows (`rotationChoices`); the number of rows when no row can switch. */
  choices?: number;
  pathLength: number;
}

/** Candidate points tried per level by the greedy path (a rough mean). */
const GREEDY_CANDIDATES = 20;

/** Seconds left in the whole completion, in simulated sessions priced at the current stage's speed. Null before there is a speed. */
export function completeEtaSec(i: CompleteEtaInput): number | null {
  if (i.done <= 0 || i.stageElapsedSec <= 0) return null;
  const b = i.budget;
  const order = ['greedy', 'improve', 'final'];
  const unit: Record<string, number> = { greedy: i.pathLength * GREEDY_CANDIDATES * b.sessions, improve: (b.maxSims / Math.max(1, b.restarts)) * b.sessions, final: i.pathLength * b.finalSessions };
  const choices = i.choices ?? i.rows;
  const tasks: Record<string, number> = { greedy: 2 * choices - i.rows, improve: choices * b.restarts, final: choices + i.rows };
  const at = order.indexOf(i.stage);
  if (at < 0) return null;
  const rate = (i.done * (unit[i.stage] as number)) / i.stageElapsedSec;
  let left = (i.total - i.done) * (unit[i.stage] as number);
  for (const s of order.slice(at + 1)) left += (tasks[s] as number) * (unit[s] as number);
  return rate > 0 ? left / rate : null;
}
