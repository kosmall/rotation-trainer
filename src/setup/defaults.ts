// The setup catalog, the default setup and the validation of untrusted setup data (stage 1.5
// Part C). Framework-free; nothing here throws.

import { warlockItemBuffs } from '../data/classes/warlock/buffs';
import { DEFAULT_WARLOCK_OPTIONS, type WarlockOptions } from '../data/classes/warlock/destruction';
import { ROTATION_PRESETS, type CurseChoice, type RotationConfig } from '../data/classes/warlock/rotation';
import { commonBuffs, consumables, cooldowns, debuffs, deepFreeze, EXCLUDES } from '../data/common/buffs';
import { DEFAULT_DISTANCE_FROM_TARGET_YD } from '../data/common/target';
import type { BuffDef } from '../data/types';
import type { SetupConfig, TimedSetting } from './types';

/**
 * Every buff the setup can enable, in a fixed order (also the order `applySetup` folds effects,
 * composes hooks and fills the item row in): raid/party/individual buffs, consumables, target
 * debuffs, cooldowns (Heroism, then the potion and rune item actions; src/data/common/buffs.ts),
 * then the warlock's item effects (the Icon's item action, the Band; src/data/classes/warlock/
 * buffs.ts). The UI, the storage and the tests all use this list.
 */
export function buildSetupCatalog(): readonly BuffDef[] {
  return Object.freeze([...commonBuffs, ...consumables, ...debuffs, ...cooldowns, ...warlockItemBuffs]);
}

/** The catalog of the app (`buildSetupCatalog()`, built once). */
export const SETUP_CATALOG: readonly BuffDef[] = buildSetupCatalog();

/** Accepted ranges; out-of-range numbers are clamped into them (Review Focus 5). */
export const SETUP_LIMITS = Object.freeze({
  distanceYd: Object.freeze({ min: 0, max: 100 }),
  startSec: Object.freeze({ min: 0, max: 600 }),
  durationSec: Object.freeze({ min: 1, max: 600 }),
  lifeTapBelowMana: Object.freeze({ min: 0, max: 100000 }),
  fightDurationSec: Object.freeze({ min: 10, max: 600 }),
});

/** The default fight length in seconds (the stage 1 fight; the engine's own default too). */
export const DEFAULT_FIGHT_DURATION_SEC = 60;

const CURSES: readonly CurseChoice[] = ['elements', 'agony', 'doom', 'none'];
const ARMORS: readonly WarlockOptions['armor'][] = ['fel', 'demon', 'none'];
const DEFAULT_ROTATION: RotationConfig = ROTATION_PRESETS.dot.config;

/** The catalog defaults of every timed buff. */
function defaultTimed(catalog: readonly BuffDef[]): Record<string, TimedSetting> {
  const out: Record<string, TimedSetting> = {};
  for (const b of catalog) {
    if (b.timed) out[b.id] = { startSec: b.timed.defaultStartSec, durationSec: b.timed.durationSec };
  }
  return out;
}

/** A fresh default setup for a catalog (only the timed entries depend on it). */
function defaultSetup(catalog: readonly BuffDef[]): SetupConfig {
  return {
    version: 1,
    enabledBuffs: [],
    timed: defaultTimed(catalog),
    rotation: { ...DEFAULT_ROTATION },
    distanceYd: DEFAULT_DISTANCE_FROM_TARGET_YD,
    warlock: { ...DEFAULT_WARLOCK_OPTIONS },
    fightDurationSec: DEFAULT_FIGHT_DURATION_SEC,
  };
}

/**
 * The default setup (design spec §5, plan Global Constraints): no buffs, the DoT rotation, 28 yd,
 * Fel Armor and the Succubus sacrificed, every timed buff (Heroism) at its catalog start and
 * duration, a 60 s fight. With it `applySetup` reproduces the stage 1 spec (plus an empty item
 * row) and its bot results exactly. Deep-frozen.
 */
export const DEFAULT_SETUP: SetupConfig = deepFreeze(defaultSetup(SETUP_CATALOG));

// ---------------------------------------------------------------------------
// normalizeSetup
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An own property only (nothing inherited, such as `__proto__` or `constructor`). */
const own = (o: Rec, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);

/** A number clamped into the range; NaN and non-numbers give `fallback` (±Infinity clamps). */
function clampNumber(v: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  return Math.min(range.max, Math.max(range.min, v));
}

/**
 * The fight length: a finite number clamped to [10, 600] and rounded to whole seconds; anything
 * else (a string, NaN, ±Infinity, missing) gives 60. Unlike `clampNumber`, ±Infinity is not
 * clamped: it is no length the player chose.
 */
function normalizeFightDuration(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_FIGHT_DURATION_SEC;
  const { min, max } = SETUP_LIMITS.fightDurationSec;
  return Math.round(Math.min(max, Math.max(min, v)));
}

/** Two buffs that cannot be enabled together: same exclusive group, or groups `EXCLUDES` pairs. */
function conflicts(a: BuffDef, b: BuffDef): boolean {
  const ga = a.exclusiveGroup;
  const gb = b.exclusiveGroup;
  if (ga === undefined || gb === undefined) return false;
  if (ga === gb) return true;
  const excludes = (g: string, other: string) => Object.hasOwn(EXCLUDES, g) && EXCLUDES[g]!.includes(other);
  return excludes(ga, gb) || excludes(gb, ga);
}

/**
 * Catalog ids only, each once, in saved order; a buff enabled later replaces an earlier one it
 * conflicts with (exclusive group, flask vs elixirs both ways). A repeated id counts at its last
 * position.
 */
function normalizeEnabled(v: unknown, catalog: readonly BuffDef[]): string[] {
  if (!Array.isArray(v)) return [];
  const byId = new Map(catalog.map((b) => [b.id, b]));
  const out: BuffDef[] = [];
  for (const id of v) {
    if (typeof id !== 'string') continue;
    const b = byId.get(id);
    if (!b) continue;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]!.id === b.id || conflicts(out[i]!, b)) out.splice(i, 1);
    }
    out.push(b);
  }
  return out.map((b) => b.id);
}

/** One entry per timed catalog buff: the saved values clamped, the catalog default otherwise. */
function normalizeTimed(v: unknown, catalog: readonly BuffDef[]): Record<string, TimedSetting> {
  const saved = isRecord(v) ? v : {};
  const out = defaultTimed(catalog);
  for (const [id, def] of Object.entries(out)) {
    const raw = own(saved, id);
    if (!isRecord(raw)) continue;
    out[id] = {
      startSec: clampNumber(own(raw, 'startSec'), SETUP_LIMITS.startSec, def.startSec),
      durationSec: clampNumber(own(raw, 'durationSec'), SETUP_LIMITS.durationSec, def.durationSec),
    };
  }
  return out;
}

function normalizeRotation(v: unknown): RotationConfig {
  const r = isRecord(v) ? v : {};
  const curse = own(r, 'curse');
  const flag = (key: 'immolate' | 'corruption' | 'shadowburnFinisher'): boolean => {
    const f = own(r, key);
    return typeof f === 'boolean' ? f : DEFAULT_ROTATION[key];
  };
  const lifeTap = own(r, 'lifeTapBelowMana');
  return {
    curse: CURSES.find((c) => c === curse) ?? DEFAULT_ROTATION.curse,
    immolate: flag('immolate'),
    corruption: flag('corruption'),
    shadowburnFinisher: flag('shadowburnFinisher'),
    // buildPriority accepts 'auto' or a number >= 0; anything else would throw there.
    lifeTapBelowMana:
      typeof lifeTap === 'number' && Number.isFinite(lifeTap) && lifeTap >= 0
        ? Math.min(lifeTap, SETUP_LIMITS.lifeTapBelowMana.max)
        : 'auto',
  };
}

function normalizeWarlock(v: unknown): WarlockOptions {
  const w = isRecord(v) ? v : {};
  const armor = own(w, 'armor');
  const sacrifice = own(w, 'sacrificeSuccubus');
  return {
    armor: ARMORS.find((a) => a === armor) ?? DEFAULT_WARLOCK_OPTIONS.armor,
    sacrificeSuccubus: typeof sacrifice === 'boolean' ? sacrifice : DEFAULT_WARLOCK_OPTIONS.sacrificeSuccubus,
  };
}

/**
 * Turns untrusted data (stored JSON, a preset, UI state) into a valid `SetupConfig` for `catalog`.
 * Never throws and never mutates `input`; the result shares no object with it.
 * - Not a plain object, or `version` other than 1: the defaults.
 * - `enabledBuffs`: catalog ids only (non-strings, unknown ids and duplicates dropped); within an
 *   exclusive group, and for the `EXCLUDES` pairs (a flask vs the elixirs, both ways), the one
 *   later in the saved list wins.
 * - `timed`: one entry per timed catalog buff; `startSec` clamped to [0, 600], `durationSec` to
 *   [1, 600], a missing or non-number value takes the catalog default. Entries of other ids are
 *   dropped, e.g. a stage 1.5 config's Destruction Potion and Icon starts (item actions now).
 * - `distanceYd`: clamped to [0, 100]; NaN or not a number gives 28.
 * - `fightDurationSec`: clamped to [10, 600] and rounded to whole seconds; missing (a config
 *   saved before the field existed), not a number, NaN or ±Infinity gives 60.
 * - `rotation` and `warlock`: each field checked against its type or union, else its default
 *   (curse 'elements', Life Tap 'auto' unless a finite number >= 0, Fel Armor, Succubus
 *   sacrificed).
 */
export function normalizeSetup(input: unknown, catalog: readonly BuffDef[]): SetupConfig {
  try {
    if (!isRecord(input) || own(input, 'version') !== 1) return defaultSetup(catalog);
    return {
      version: 1,
      enabledBuffs: normalizeEnabled(own(input, 'enabledBuffs'), catalog),
      timed: normalizeTimed(own(input, 'timed'), catalog),
      rotation: normalizeRotation(own(input, 'rotation')),
      distanceYd: clampNumber(own(input, 'distanceYd'), SETUP_LIMITS.distanceYd, DEFAULT_DISTANCE_FROM_TARGET_YD),
      warlock: normalizeWarlock(own(input, 'warlock')),
      fightDurationSec: normalizeFightDuration(own(input, 'fightDurationSec')),
    };
  } catch {
    // A hostile getter or proxy: nothing of it is trusted.
    return defaultSetup(catalog);
  }
}
