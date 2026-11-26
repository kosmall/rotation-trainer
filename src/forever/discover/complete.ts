// Completing a found build to a later level (variant B): the points from the found level + 1 to the
// target level that make the whole leveling path fastest. Cost of a path = Σ over its levels of
// 1 / kills per hour (every level weighted the same). Start from the greedy path, then improve the
// whole sequence with local search (replace a point, swap two, replace a block). Framework-free.

import type { Rng } from '../../engine/rng';
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
