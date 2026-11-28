import buildsJson from './data/builds.json';
import { MAX_TALENT_POINTS, pointsAtLevel, TALENT_BY_ID, validatePicks, type Ranks } from './talents';
import { parseGenes, type RotationGenes } from './rotation-genes';
import type { PetKind, Tree } from './types';

export interface BuildVariant {
  id: string;
  order: string;
  pet: PetKind | null;
  sacrificed: PetKind | null;
  rotation: 'affliction' | 'demonology' | 'fire';
  filler: string;
  rank: 1 | 2 | 'max';
  /** Affliction: this build also keeps Immolate up (as the parameter `aff_use_immolate` does for every build). */
  immolate?: boolean;
  /** Affliction: Wrack only while the player's health is above this fraction, Drain Life below (overrides the parameter `wrack_min_hp_pct`). */
  wrack_min_hp_pct?: number;
  /** false: the build never casts Curse of the Elements (overrides the parameter `use_curse_of_elements`). */
  coe?: boolean;
  /** The demon by level and pull size: the first rule that applies wins over `pet`. */
  pet_rules?: PetRule[];
  pre_respec_build: string | null;
  respec_level: number;
  /** A rotation composed from spells (build discovery, custom builds); when set the fight plays it instead of the `rotation` template. */
  genes?: RotationGenes;
}

/** A demon used instead of the build's `pet` between two levels and for some pull sizes (all bounds inclusive, optional). */
export interface PetRule {
  pet: PetKind;
  fromLevel?: number;
  toLevel?: number;
  minMobs?: number;
  maxMobs?: number;
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
let inlineOrders = 0;

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

export const PET_KINDS: readonly PetKind[] = ['imp', 'voidwalker', 'succubus', 'felhunter'];
export const ROTATION_NAMES: readonly BuildVariant['rotation'][] = ['affliction', 'demonology', 'fire'];
/** Fillers a rotation template offers (the first is the default). */
export const ROTATION_FILLERS: Readonly<Record<BuildVariant['rotation'], readonly string[]>> = {
  affliction: ['wrack', 'drain_life'],
  demonology: ['shadow_bolt'],
  fire: ['searing_pain', 'shadow_bolt'],
};
const KNOWN_FILLERS: readonly string[] = [...new Set(Object.values(ROTATION_FILLERS).flat())];

const list = (xs: readonly (string | number)[]): string => xs.map((x) => JSON.stringify(x)).join(', ');
const show = (x: unknown): string => (typeof x === 'string' ? JSON.stringify(x) : String(JSON.stringify(x) ?? x));

/** The scalar fields every build form (a file, the web editor) has; throws a readable error on a bad value. */
function checkCore(o: { rotation: unknown; filler: unknown; rank: unknown; pet: unknown; sacrificed: unknown }): Pick<BuildVariant, 'rotation' | 'filler' | 'rank' | 'pet' | 'sacrificed'> {
  if (!ROTATION_NAMES.includes(o.rotation as never)) throw new Error(`invalid "rotation" ${show(o.rotation)}: expected one of ${list(ROTATION_NAMES)}`);
  if (typeof o.filler !== 'string' || !KNOWN_FILLERS.includes(o.filler)) throw new Error(`invalid "filler" ${show(o.filler)}: expected one of ${list(KNOWN_FILLERS)}`);
  if (o.rank !== 1 && o.rank !== 2 && o.rank !== 'max') throw new Error(`invalid "rank" ${show(o.rank)}: expected 1, 2 or "max"`);
  if (o.pet !== null && !PET_KINDS.includes(o.pet as never)) throw new Error(`invalid "pet" ${show(o.pet)}: expected one of ${list(PET_KINDS)} or null`);
  if (o.sacrificed !== null && !PET_KINDS.includes(o.sacrificed as never)) throw new Error(`invalid "sacrificed" ${show(o.sacrificed)}: expected one of ${list(PET_KINDS)} or null`);
  return { rotation: o.rotation as BuildVariant['rotation'], filler: o.filler, rank: o.rank, pet: o.pet as PetKind | null, sacrificed: o.sacrificed as PetKind | null };
}

/** The optional per-build flags (`immolate`, `coe`, `wrack_min_hp_pct`, `pet_rules`); absent ones stay absent. */
export type BuildFlags = Pick<BuildVariant, 'immolate' | 'coe' | 'wrack_min_hp_pct' | 'pet_rules'>;

export function checkFlags(o: Partial<Record<keyof BuildFlags, unknown>>): BuildFlags {
  const out: BuildFlags = {};
  if (o.immolate !== undefined) {
    if (typeof o.immolate !== 'boolean') throw new Error(`invalid "immolate" ${show(o.immolate)}: expected true or false`);
    out.immolate = o.immolate;
  }
  if (o.coe !== undefined) {
    if (typeof o.coe !== 'boolean') throw new Error(`invalid "coe" ${show(o.coe)}: expected true or false`);
    out.coe = o.coe;
  }
  if (o.wrack_min_hp_pct !== undefined) {
    const w = o.wrack_min_hp_pct;
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1) throw new Error(`invalid "wrack_min_hp_pct" ${show(w)}: expected a fraction from 0 to 1`);
    out.wrack_min_hp_pct = w;
  }
  if (o.pet_rules !== undefined) {
    if (!Array.isArray(o.pet_rules)) throw new Error('invalid "pet_rules": expected a list of rules');
    out.pet_rules = o.pet_rules.map((r, i): PetRule => {
      const bad = (why: string): Error => new Error(`invalid "pet_rules"[${i}]: ${why}`);
      if (r === null || typeof r !== 'object') throw bad('expected an object');
      const x = r as Record<string, unknown>;
      if (!PET_KINDS.includes(x.pet as never)) throw bad(`"pet" ${show(x.pet)} is not one of ${list(PET_KINDS)}`);
      const rule: PetRule = { pet: x.pet as PetKind };
      for (const k of ['fromLevel', 'toLevel', 'minMobs', 'maxMobs'] as const) {
        if (x[k] === undefined) continue;
        if (typeof x[k] !== 'number' || !Number.isFinite(x[k])) throw bad(`"${k}" must be a number`);
        rule[k] = x[k] as number;
      }
      return rule;
    });
  }
  return out;
}

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
  /** A rotation composed from spells; when set it replaces the rotation template. */
  genes?: RotationGenes;
  /** The flags a built-in build can carry; a copy of a built-in build keeps them. */
  immolate?: boolean;
  coe?: boolean;
  wrack_min_hp_pct?: number;
  pet_rules?: PetRule[];
}

/** The id a custom build is simulated under (a star keeps it apart from the built-in ids). */
export const customId = (name: string): string => `★ ${name}`;

/** Registers a custom build (idempotent) and returns its variant. Throws on an illegal order. */
export function customVariant(d: CustomBuildData): BuildVariant {
  if (d.picks.length > MAX_TALENT_POINTS) throw new Error(`at most ${MAX_TALENT_POINTS} points, got ${d.picks.length}`);
  const check = validatePicks(d.picks);
  if (!check.ok) throw new Error(`invalid talent order: ${check.errors.join('; ')}`);
  const core = checkCore(d);
  const flags = checkFlags(d);
  const id = customId(d.name);
  const runs: [string, number][] = [];
  for (const t of d.picks) {
    const last = runs[runs.length - 1];
    if (last && last[0] === t) last[1]++;
    else runs.push([t, 1]);
  }
  const orderId = `custom:${id}`;
  registerOrder(orderId, runs);
  const v: BuildVariant = { id, order: orderId, ...core, pre_respec_build: null, respec_level: 40, ...flags, ...(d.genes ? { genes: { ...d.genes } } : {}) };
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
  lastPickId: string | null;
  nextPickId: string | null;
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
    lastPickId: picks[picks.length - 1] ?? null,
    nextPickId: full[picks.length] ?? null,
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
    // unique per call: two builds without an id (or with the same one) must not share a talent order
    orderId = `custom:${id}#${++inlineOrders}`;
    registerOrder(orderId, obj.order as [string, number][]);
  } else throw new Error('build needs an "order" (order id or [[talent, points], ...])');
  const picks = loadOrder(orderId);
  if (picks.length !== MAX_TALENT_POINTS) throw new Error(`a build needs exactly ${MAX_TALENT_POINTS} points (level 10 to 60), got ${picks.length}`);
  const check = validatePicks(picks);
  if (!check.ok) throw new Error(`invalid talent order: ${check.errors.join('; ')}`);
  const genes = obj.genes === undefined ? undefined : parseGenes(obj.genes);
  if (obj.genes !== undefined && !genes) throw new Error('invalid rotation genes');
  const core = checkCore({ rotation: obj.rotation ?? 'demonology', filler: obj.filler ?? 'shadow_bolt', rank: obj.rank ?? 1, pet: obj.pet ?? 'succubus', sacrificed: obj.sacrificed ?? null });
  const pre = obj.pre_respec_build ?? null;
  if (pre !== null && (typeof pre !== 'string' || !(CUSTOM_ORDERS.has(pre) || pre in RAW.orders))) throw new Error(`invalid "pre_respec_build" ${show(pre)}: not a known talent order`);
  const rl = obj.respec_level ?? 40;
  const respecLevel = typeof rl === 'number' ? rl : typeof rl === 'string' && rl.trim() !== '' ? Number(rl) : NaN;
  if (!Number.isFinite(respecLevel)) throw new Error(`invalid "respec_level" ${show(rl)}: expected a level number`);
  return {
    id,
    order: orderId,
    ...core,
    pre_respec_build: pre,
    respec_level: respecLevel,
    ...checkFlags(obj),
    ...(genes ? { genes } : {}),
  };
}
