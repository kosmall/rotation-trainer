import buildsJson from './data/builds.json';
import { pointsAtLevel, TALENT_BY_ID, validatePicks, type Ranks } from './talents';
import type { PetKind, Tree } from './types';

export interface BuildVariant {
  id: string;
  order: string;
  pet: PetKind | null;
  sacrificed: PetKind | null;
  rotation: 'affliction' | 'demonology' | 'fire';
  filler: string;
  rank: 1 | 2 | 'max';
  pre_respec_build: string | null;
  respec_level: number;
}

type RawBuilds = {
  orders: Record<string, [string, number][]>;
  variants: BuildVariant[];
};
const RAW = buildsJson as unknown as RawBuilds;

export const ORDER_IDS: readonly string[] = Object.keys(RAW.orders);
export const VARIANT_IDS: readonly string[] = RAW.variants.map((v) => v.id);

/** Expands a `[talent, points]` run list to one entry per point. */
export function expandOrder(runs: readonly [string, number][]): string[] {
  const out: string[] = [];
  for (const [id, n] of runs) for (let i = 0; i < n; i++) out.push(id);
  return out;
}

export function loadOrder(id: string): string[] {
  const runs = RAW.orders[id];
  if (!runs) throw new Error(`unknown talent order ${id}`);
  return expandOrder(runs);
}

export function loadVariant(id: string): BuildVariant {
  const v = RAW.variants.find((x) => x.id === id);
  if (!v) throw new Error(`unknown build ${id}; known: ${VARIANT_IDS.join(', ')}`);
  return { ...v };
}

export interface PicksOptions {
  legacyPerk?: number;
  respecLevel?: number;
  preRespecBuild?: string | null;
}

/**
 * The picks a variant has at a level. Below `respec_level` the `pre_respec_build` order is used
 * (when set); from `respec_level` the variant's own order (a respec hands out every point at once).
 */
export function picksAt(variant: BuildVariant, level: number, opts: PicksOptions = {}): string[] {
  const perk = opts.legacyPerk ?? 0;
  const respecLevel = opts.respecLevel ?? variant.respec_level;
  const pre = opts.preRespecBuild === undefined ? variant.pre_respec_build : opts.preRespecBuild;
  const orderId = pre && level < respecLevel ? pre : variant.order;
  return loadOrder(orderId).slice(0, pointsAtLevel(level, perk));
}

/** Ranks of every talent for a variant at a level; throws when the picks are illegal. */
export function ranksAt(variant: BuildVariant, level: number, opts: PicksOptions = {}): Ranks {
  const picks = picksAt(variant, level, opts);
  const r = validatePicks(picks);
  if (!r.ok) throw new Error(`${variant.id} at level ${level}: ${r.errors.join('; ')}`);
  return r.ranks;
}

export interface BuildSnapshot {
  level: number;
  points: number;
  perTree: Record<Tree, number>;
  ranks: Ranks;
  lastPick: string | null;
  nextPick: string | null;
}

export function describeBuild(variant: BuildVariant, level: number, opts: PicksOptions = {}): BuildSnapshot {
  const picks = picksAt(variant, level, opts);
  const r = validatePicks(picks);
  const orderId = opts.preRespecBuild !== undefined ? opts.preRespecBuild : variant.pre_respec_build;
  const respecLevel = opts.respecLevel ?? variant.respec_level;
  const full = loadOrder(orderId && level < respecLevel ? orderId : variant.order);
  const nameOf = (id: string | undefined): string | null => (id ? (TALENT_BY_ID.get(id)?.name ?? id) : null);
  return {
    level,
    points: picks.length,
    perTree: r.pointsPerTree,
    ranks: r.ranks,
    lastPick: nameOf(picks[picks.length - 1]),
    nextPick: nameOf(full[picks.length]),
  };
}
