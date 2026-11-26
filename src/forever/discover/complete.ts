// Completing a found build to a later level (variant B): the points from the found level + 1 to the
// target level that make the whole leveling path fastest. Cost of a path = Σ over its levels of
// 1 / kills per hour (every level weighted the same). Start from the greedy path, then improve the
// whole sequence with local search (replace a point, swap two, replace a block). Framework-free.

import { createRng, type Rng } from '../../engine/rng';
import { runCell } from '../runner';
import { pointsAtLevel, validatePicks, type Ranks } from '../talents';
import { TALENT_BY_ID } from '../talents';
import type { Params } from '../types';
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

/** Each level takes the legal point with the best kills per hour at that level (ties: the lower row). */
export function greedyPath(ctx: CompleteCtx, cache: KphCache): string[] {
  const path: string[] = [];
  let r: Ranks = { ...ctx.baseRanks };
  for (let i = 0; i < pathLength(ctx); i++) {
    const level = ctx.fromLevel + 1 + i;
    const options = legalNext(r);
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

export type CompleteTask =
  | { kind: 'complete-greedy'; row: number; ctx: CompleteCtx }
  | { kind: 'complete-improve'; row: number; ctx: CompleteCtx; start: string[]; maxSims: number; seed: number }
  | { kind: 'complete-final'; row: number; ctx: CompleteCtx; path: string[]; which: 'best' | 'greedy' };

export type CompleteResult =
  | { kind: 'complete-path'; row: number; path: string[]; cost: number; from: 'greedy' | 'improve' }
  | { kind: 'complete-final'; row: number; which: 'best' | 'greedy'; kph: number[] };

/** Executes one completion task (pure; runs inside a worker). */
export function runCompleteTask(t: CompleteTask): CompleteResult {
  if (t.kind === 'complete-greedy') {
    const cache: KphCache = new Map();
    const path = greedyPath(t.ctx, cache);
    return { kind: 'complete-path', row: t.row, path, cost: pathCost(t.ctx, path, cache).cost, from: 'greedy' };
  }
  if (t.kind === 'complete-improve') {
    const cache: KphCache = new Map();
    const path = improvePath(t.ctx, t.start, t.maxSims, createRng(t.seed), cache);
    return { kind: 'complete-path', row: t.row, path, cost: pathCost(t.ctx, path, cache).cost, from: 'improve' };
  }
  return { kind: 'complete-final', row: t.row, which: t.which, kph: pathCost(t.ctx, t.path, new Map()).kph };
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
  /** Costs on the search sessions (Σ 1/kph): best ≤ greedy. */
  searchCost: number;
  greedySearchCost: number;
}

export type CompleteRunner = (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) => Promise<CompleteResult[]>;
export type CompleteBase = Omit<CompleteCtx, 'combo' | 'baseRanks' | 'sessions'>;

/** Greedy path per row, then local-search restarts from it, then a final evaluation of the best and the greedy path. */
export async function completeBuilds(rows: readonly CompleteRowInput[], base: CompleteBase, b: CompleteBudget, run: CompleteRunner, progress?: (stage: string, done: number, total: number) => void): Promise<CompletedBuild[]> {
  const ctxOf = (r: CompleteRowInput, sessions: number, seed: number): CompleteCtx => ({ ...base, combo: r.combo, baseRanks: r.ranks, sessions, seed });
  const stage = async (name: string, tasks: CompleteTask[]): Promise<CompleteResult[]> => {
    let done = 0;
    progress?.(name, 0, tasks.length);
    return run(tasks, () => progress?.(name, ++done, tasks.length));
  };
  const greedy = (await stage('greedy', rows.map((r, row) => ({ kind: 'complete-greedy', row, ctx: ctxOf(r, b.sessions, base.seed) })))) as Extract<CompleteResult, { kind: 'complete-path' }>[];
  const improveTasks: CompleteTask[] = [];
  rows.forEach((r, row) => {
    for (let k = 0; k < b.restarts; k++)
      improveTasks.push({ kind: 'complete-improve', row, ctx: ctxOf(r, b.sessions, base.seed), start: (greedy[row] as { path: string[] }).path, maxSims: Math.max(1, Math.floor(b.maxSims / b.restarts)), seed: base.seed * 1000 + row * 10 + k });
  });
  const improved = (await stage('improve', improveTasks)) as Extract<CompleteResult, { kind: 'complete-path' }>[];
  const best = rows.map((_, row) => {
    let pickd = greedy[row] as Extract<CompleteResult, { kind: 'complete-path' }>;
    for (const x of improved) if (x.row === row && x.cost < pickd.cost - 1e-12) pickd = x;
    return pickd;
  });
  const finalSeed = base.seed + 7777;
  const finals = (await stage(
    'final',
    rows.flatMap((r, row): CompleteTask[] => [
      { kind: 'complete-final', row, which: 'best', ctx: ctxOf(r, b.finalSessions, finalSeed), path: (best[row] as { path: string[] }).path },
      { kind: 'complete-final', row, which: 'greedy', ctx: ctxOf(r, b.finalSessions, finalSeed), path: (greedy[row] as { path: string[] }).path },
    ]),
  )) as Extract<CompleteResult, { kind: 'complete-final' }>[];
  return rows.map((r, row) => {
    const kph = finals.find((f) => f.row === row && f.which === 'best')?.kph ?? [];
    const gk = finals.find((f) => f.row === row && f.which === 'greedy')?.kph ?? [];
    const path = (best[row] as { path: string[] }).path;
    return {
      rank: r.rank,
      label: r.label,
      combo: r.combo,
      baseRanks: r.ranks,
      fromLevel: base.fromLevel,
      toLevel: base.toLevel,
      path,
      perLevel: path.map((pick, i) => ({ level: base.fromLevel + 1 + i, pick, kph: kph[i] ?? 0 })),
      avgKph: harmonicKph(kph),
      greedyPath: (greedy[row] as { path: string[] }).path,
      greedyAvgKph: harmonicKph(gk),
      searchCost: (best[row] as { cost: number }).cost,
      greedySearchCost: (greedy[row] as { cost: number }).cost,
    };
  });
}
