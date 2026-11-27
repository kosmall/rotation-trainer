// Talent search of build discovery: legal rank maps at a point count, random starts across the
// trees, point moves and a first-improvement hill climb with a per-start tabu list. Only the ranks
// matter at a single level, so a build is a rank map; `canonicalPicks` turns it into an order.
// Framework-free.

import type { Rng } from '../../engine/rng';
import { TALENT_BY_ID, TALENTS, validatePicks, type Ranks, type TalentDef } from '../talents';
import type { Tree } from '../types';

export interface TalentSpace {
  /** Points to spend (all of them). */
  points: number;
  /** Talents and minimum ranks every build keeps. */
  required: Ranks;
}

export interface Scored {
  ranks: Ranks;
  kph: number;
}

const TREES: readonly Tree[] = ['aff', 'demo', 'destro'];

/** Talents in a legal spending order: by row, then column, each prerequisite first. */
const ORDER: readonly TalentDef[] = (() => {
  const sorted = [...TALENTS].sort((a, b) => a.row - b.row || a.col - b.col);
  const out: TalentDef[] = [];
  const add = (t: TalentDef): void => {
    if (out.includes(t)) return;
    if (t.requires) add(TALENT_BY_ID.get(t.requires.talent) as TalentDef);
    out.push(t);
  };
  sorted.forEach(add);
  return out;
})();

const ORDER_INDEX: ReadonlyMap<string, number> = new Map(ORDER.map((t, i) => [t.id, i]));
/** Position of a talent in the legal spending order (rows first): ties go to the lower row. */
export const canonicalIndex = (id: string): number => ORDER_INDEX.get(id) ?? Number.MAX_SAFE_INTEGER;

export function canonicalPicks(r: Ranks): string[] {
  const out: string[] = [];
  for (const t of ORDER) for (let i = 0; i < (r[t.id] ?? 0); i++) out.push(t.id);
  return out;
}

const total = (r: Ranks): number => Object.values(r).reduce((a, b) => a + b, 0);

export function isLegal(r: Ranks, s: TalentSpace): boolean {
  if (total(r) !== s.points) return false;
  for (const [id, n] of Object.entries(s.required)) if ((r[id] ?? 0) < n) return false;
  return validatePicks(canonicalPicks(r)).ok;
}

export function modelledKey(r: Ranks): string {
  return Object.keys(r)
    .filter((id) => (r[id] ?? 0) > 0 && TALENT_BY_ID.get(id)?.status === 'modelled')
    .sort()
    .map((id) => `${id}:${r[id]}`)
    .join(',');
}

export function freePoints(r: Ranks): number {
  let n = 0;
  for (const [id, k] of Object.entries(r)) if (TALENT_BY_ID.get(id)?.status !== 'modelled') n += k;
  return n;
}

export function pointDistance(a: Ranks, b: Ranks): number {
  let d = 0;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[id] ?? 0) - (b[id] ?? 0));
  return d / 2;
}

/** Points of modelled talents moved between two builds (dead points do not count). */
export function modelledDistance(a: Ranks, b: Ranks): number {
  let up = 0;
  let down = 0;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (TALENT_BY_ID.get(id)?.status !== 'modelled') continue;
    const d = (b[id] ?? 0) - (a[id] ?? 0);
    if (d > 0) up += d;
    else down -= d;
  }
  return Math.max(up, down);
}

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng.next() * xs.length)] as T;

/** Whether one more point can go into the talent now (row gate, prerequisite, max rank), spending in this order. */
function canTake(t: TalentDef, r: Ranks, perTree: Record<Tree, number>): boolean {
  if ((r[t.id] ?? 0) >= t.maxRank) return false;
  if (perTree[t.tree] < 5 * t.row) return false;
  if (t.requires && (r[t.requires.talent] ?? 0) < t.requires.rank) return false;
  return true;
}

/** Talents that can take one more point after these ranks (row gate, prerequisite, max rank), in spending order. */
export function legalNext(r: Ranks): string[] {
  const perTree: Record<Tree, number> = { aff: 0, demo: 0, destro: 0 };
  for (const [id, n] of Object.entries(r)) {
    const t = TALENT_BY_ID.get(id);
    if (t) perTree[t.tree] += n;
  }
  return ORDER.filter((t) => canTake(t, r, perTree)).map((t) => t.id);
}

/** The required talents with their prerequisites, as [talent, rank] goals. */
function goals(required: Ranks): [TalentDef, number][] {
  const out = new Map<TalentDef, number>();
  const add = (id: string, n: number): void => {
    const t = TALENT_BY_ID.get(id);
    if (!t) throw new Error(`unknown talent ${id}`);
    out.set(t, Math.max(out.get(t) ?? 0, n));
    if (t.requires) add(t.requires.talent, t.requires.rank);
  };
  for (const [id, n] of Object.entries(required)) add(id, n);
  return [...out.entries()];
}

function tryStart(s: TalentSpace, rng: Rng): Ranks | null {
  const main = pick(TREES, rng);
  const weights: Record<Tree, number> = { aff: 0, demo: 0, destro: 0 };
  weights[main] = 0.4 + 0.6 * rng.next();
  const others = TREES.filter((t) => t !== main);
  const split = rng.next() * (1 - weights[main]);
  weights[others[0] as Tree] = split;
  weights[others[1] as Tree] = 1 - weights[main] - split;
  const r: Ranks = {};
  const perTree: Record<Tree, number> = { aff: 0, demo: 0, destro: 0 };
  const want = goals(s.required);
  const add = (t: TalentDef): void => {
    r[t.id] = (r[t.id] ?? 0) + 1;
    perTree[t.tree]++;
  };
  for (let spent = 0; spent < s.points; spent++) {
    const open = want.filter(([t, n]) => (r[t.id] ?? 0) < n);
    const now = open.filter(([t]) => canTake(t, r, perTree));
    if (now.length > 0) {
      add(pick(now, rng)[0]);
      continue;
    }
    let tree: Tree;
    if (open.length > 0) tree = (open[0] as [TalentDef, number])[0].tree;
    else {
      let u = rng.next();
      tree = main;
      for (const t of TREES) {
        if (u < weights[t]) {
          tree = t;
          break;
        }
        u -= weights[t];
      }
    }
    let avail = TALENTS.filter((t) => t.tree === tree && canTake(t, r, perTree));
    if (avail.length === 0) avail = TALENTS.filter((t) => canTake(t, r, perTree));
    if (avail.length === 0) return null;
    add(pick(avail, rng));
  }
  return isLegal(r, s) ? r : null;
}

/** A random legal build that keeps the required talents; null when none was found in 50 attempts. */
export function randomStart(s: TalentSpace, rng: Rng): Ranks | null {
  for (let i = 0; i < 50; i++) {
    const r = tryStart(s, rng);
    if (r) return r;
  }
  return null;
}

/** Moves 1 point (70%) or 2-5 points of one talent elsewhere; null when the result is not legal. */
export function randomMove(r: Ranks, s: TalentSpace, rng: Rng): Ranks | null {
  const sources = Object.keys(r).filter((id) => (r[id] ?? 0) > (s.required[id] ?? 0));
  if (sources.length === 0) return null;
  const from = pick(sources.sort(), rng);
  const room = (r[from] ?? 0) - (s.required[from] ?? 0);
  const k = rng.next() < 0.7 ? 1 : Math.min(room, 2 + Math.floor(rng.next() * 4));
  const out: Ranks = { ...r };
  out[from] = (out[from] ?? 0) - k;
  if (out[from] === 0) delete out[from];
  let target: TalentDef | null = null;
  for (let i = 0; i < k; i++) {
    if (target === null || rng.next() < 0.5) {
      const open = TALENTS.filter((t) => t.id !== from && (out[t.id] ?? 0) < t.maxRank);
      if (open.length === 0) return null;
      target = pick(open, rng);
    }
    if ((out[target.id] ?? 0) >= target.maxRank) return null;
    out[target.id] = (out[target.id] ?? 0) + 1;
  }
  return isLegal(out, s) ? out : null;
}

export interface ClimbOptions {
  space: TalentSpace;
  evaluate: (r: Ranks) => number;
  starts: number;
  /** Total evaluations across all starts. */
  evals: number;
  rng: Rng;
  /** How many distinct builds to return. */
  keep: number;
}

/** First-improvement hill climbing from random starts; each distinct build (by modelled ranks) is evaluated once. */
export function hillClimb(o: ClimbOptions): Scored[] {
  const cache = new Map<string, number>();
  const found = new Map<string, Scored>();
  let used = 0;
  const score = (r: Ranks): number => {
    const k = modelledKey(r);
    let v = cache.get(k);
    if (v === undefined) {
      v = o.evaluate(r);
      used++;
      cache.set(k, v);
      found.set(k, { ranks: r, kph: v });
    }
    return v;
  };
  const perStart = Math.max(1, Math.floor(o.evals / Math.max(1, o.starts)));
  for (let st = 0; st < o.starts && used < o.evals; st++) {
    const start = randomStart(o.space, o.rng);
    if (!start) return [];
    const budgetEnd = Math.min(o.evals, used + perStart);
    let cur = start;
    let curV = score(cur);
    const tabu = new Set<string>([modelledKey(cur)]);
    let idle = 0;
    while (used < budgetEnd && idle < 2000) {
      const m = randomMove(cur, o.space, o.rng);
      if (!m) {
        idle++;
        continue;
      }
      const k = modelledKey(m);
      if (tabu.has(k)) {
        idle++;
        // moving dead points keeps the build; take it so other rows open up
        if (k === modelledKey(cur)) cur = m;
        continue;
      }
      tabu.add(k);
      idle = 0;
      const v = score(m);
      if (v > curV) {
        cur = m;
        curV = v;
      }
    }
  }
  return [...found.entries()]
    .sort((a, b) => b[1].kph - a[1].kph || (a[0] < b[0] ? -1 : 1))
    .slice(0, o.keep)
    .map(([, x]) => x);
}
