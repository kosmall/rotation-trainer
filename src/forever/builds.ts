import buildsJson from './data/builds.json';
import scenariosJson from './data/scenarios.json';
import { MAX_TALENT_POINTS, pointsAtLevel, TALENT_BY_ID, validatePicks, type Ranks } from './talents';
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

const CUSTOM_ORDERS = new Map<string, [string, number][]>();
for (const [id, runs] of Object.entries((scenariosJson as unknown as { orders: Record<string, [string, number][]> }).orders)) CUSTOM_ORDERS.set(id, runs);

/** Registers an inline order (a custom build from a file) under a unique id. */
export function registerOrder(id: string, runs: [string, number][]): void {
  CUSTOM_ORDERS.set(id, runs);
}

export function loadOrder(id: string): string[] {
  const runs = CUSTOM_ORDERS.get(id) ?? RAW.orders[id];
  if (!runs) throw new Error(`unknown talent order ${id}`);
  return expandOrder(runs);
}

const CUSTOM_VARIANTS = new Map<string, BuildVariant>();

/** Leveling builds taken from public guides (data/scenarios.json), simulated like the built-in ones. */
export interface Scenario extends BuildVariant {
  title: string;
  source: string;
  note: string;
}
export const SCENARIOS: readonly Scenario[] = (scenariosJson as unknown as { scenarios: (Omit<BuildVariant, 'pre_respec_build' | 'respec_level'> & { title: string; source: string; note: string })[] }).scenarios.map((x) => ({
  ...x,
  pre_respec_build: null,
  respec_level: 40,
}));
export const SCENARIO_IDS: readonly string[] = SCENARIOS.map((x) => x.id);
for (const x of SCENARIOS) CUSTOM_VARIANTS.set(x.id, { id: x.id, order: x.order, pet: x.pet, sacrificed: x.sacrificed, rotation: x.rotation, filler: x.filler, rank: x.rank, pre_respec_build: null, respec_level: 40 });

export function loadVariant(id: string): BuildVariant {
  const v = RAW.variants.find((x) => x.id === id) ?? CUSTOM_VARIANTS.get(id);
  if (!v) throw new Error(`unknown build ${id}; known: ${VARIANT_IDS.join(', ')}`);
  return { ...v };
}

/** A user-made build: the talent points in the order they are spent (level 10 first) plus a rotation template. */
export interface CustomBuildData {
  /** Display name; the build's id is `customId(name)`. */
  name: string;
  /** One talent id per point, at most 51; it may be unfinished (unspent points do nothing). */
  picks: string[];
  rotation: BuildVariant['rotation'];
  filler: string;
  rank: BuildVariant['rank'];
  pet: PetKind | null;
  sacrificed: PetKind | null;
}

/** The id a custom build is simulated under (a star keeps it apart from the built-in ids). */
export const customId = (name: string): string => `★ ${name}`;

/** Registers a custom build (idempotent) and returns its variant. Throws on an illegal order. */
export function customVariant(d: CustomBuildData): BuildVariant {
  if (d.picks.length > MAX_TALENT_POINTS) throw new Error(`at most ${MAX_TALENT_POINTS} points, got ${d.picks.length}`);
  const check = validatePicks(d.picks);
  if (!check.ok) throw new Error(`invalid talent order: ${check.errors.join('; ')}`);
  const id = customId(d.name);
  const runs: [string, number][] = [];
  for (const t of d.picks) {
    const last = runs[runs.length - 1];
    if (last && last[0] === t) last[1]++;
    else runs.push([t, 1]);
  }
  const orderId = `custom:${id}`;
  registerOrder(orderId, runs);
  const v: BuildVariant = { id, order: orderId, pet: d.pet, sacrificed: d.sacrificed, rotation: d.rotation, filler: d.filler, rank: d.rank, pre_respec_build: null, respec_level: 40 };
  CUSTOM_VARIANTS.set(id, v);
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

/**
 * Builds a variant from a JSON object (custom builds for the duel): `order` is either the id of a
 * known order or a list of `[talent, points]` runs; the rest defaults to a Shadow Bolt rank 1 spam
 * with a Succubus. The order is validated for all 51 points.
 */
export function variantFromJson(obj: Record<string, unknown>): BuildVariant {
  const id = String(obj.id ?? 'CUSTOM');
  let orderId: string;
  if (typeof obj.order === 'string') orderId = obj.order;
  else if (Array.isArray(obj.order)) {
    orderId = `custom:${id}`;
    registerOrder(orderId, obj.order as [string, number][]);
  } else throw new Error('build needs an "order" (order id or [[talent, points], ...])');
  const picks = loadOrder(orderId);
  if (picks.length !== MAX_TALENT_POINTS) throw new Error(`a build needs exactly ${MAX_TALENT_POINTS} points (level 10 to 60), got ${picks.length}`);
  const check = validatePicks(picks);
  if (!check.ok) throw new Error(`invalid talent order: ${check.errors.join('; ')}`);
  return {
    id,
    order: orderId,
    pet: (obj.pet ?? 'succubus') as BuildVariant['pet'],
    sacrificed: (obj.sacrificed ?? null) as BuildVariant['sacrificed'],
    rotation: (obj.rotation ?? 'demonology') as BuildVariant['rotation'],
    filler: String(obj.filler ?? 'shadow_bolt'),
    rank: (obj.rank ?? 1) as BuildVariant['rank'],
    pre_respec_build: (obj.pre_respec_build ?? null) as string | null,
    respec_level: Number(obj.respec_level ?? 40),
  };
}
