// The setup catalog, the default setup and the validation of untrusted setup data (stage 1.5
// Part C). Framework-free; nothing here throws.

import { DEFAULT_WARLOCK_OPTIONS, type WarlockOptions } from '../data/classes/warlock/destruction';
import { normalizeItemUse, normalizeItemUseOrder, type ItemUseRule } from '../data/classes/warlock/itemUse';
import { ROTATION_PRESETS, type CurseChoice, type RotationConfig } from '../data/classes/warlock/rotation';
import { decodeTalents, encodeTalents, TALENT_STRING_MAX_LENGTH } from '../data/classes/warlock/talentTree';
import { destructionTalentString } from '../data/classes/warlock/talents';
import { commonBuffs, consumables, cooldowns, debuffs, deepFreeze, EXCLUDES } from '../data/common/buffs';
import { DEFAULT_DISTANCE_FROM_TARGET_YD } from '../data/common/target';
import type { ItemDb } from '../data/items/types';
import type { EquippedItem } from '../engine/types';
import type { BuffDef } from '../data/types';
import { normalizeGear, normalizeGearShape } from './gear';
import { deriveGearEffects, EMBEDDED_GEAR_EFFECT_SOURCE, isGearEffectId, LEGACY_ITEM_BUFF_IDS } from './gearEffects';
import type { SetupConfig, TimedSetting } from './types';

/**
 * Every buff the setup can enable that does not depend on the gear, in a fixed order (also the
 * order `applySetup` folds effects, composes hooks and fills the item row in): raid/party/
 * individual buffs, consumables, target debuffs, cooldowns (Heroism, then the potion and rune item
 * actions; src/data/common/buffs.ts). The gear's item effects (group 'item') are derived from the
 * worn gear (src/setup/gearEffects.ts) and come after them (`setupCatalogFor`). A new array on
 * every call (the entries are shared, deep-frozen).
 */
export function buildSetupCatalog(): readonly BuffDef[] {
  return Object.freeze([...commonBuffs, ...consumables, ...debuffs, ...cooldowns]);
}

/** The gear-independent catalog (`buildSetupCatalog()`, built once). */
export const STATIC_SETUP_CATALOG: readonly BuffDef[] = buildSetupCatalog();

/**
 * The gear-independent catalog under its stage 1.5 name (the same array as
 * `STATIC_SETUP_CATALOG`): storage and `normalizeSetup` need no gear entries (well-formed gear
 * effect ids are kept whether worn or not). The gear's item entries are never in a constant: the
 * Setup panel and `applySetup` derive them from the worn gear (`setupCatalogFor`).
 */
export const SETUP_CATALOG: readonly BuffDef[] = STATIC_SETUP_CATALOG;

/**
 * The catalog for a gear: `STATIC_SETUP_CATALOG` followed by the worn items' effects
 * (`deriveGearEffects` from `db`, or the embedded author records without it: only the author's
 * items are known then). A new array per call; the derived entries are fresh and deep-frozen.
 */
export function setupCatalogFor(gear: readonly (EquippedItem | null)[], db?: ItemDb | null): readonly BuffDef[] {
  return Object.freeze([...STATIC_SETUP_CATALOG, ...deriveGearEffects(gear, db ?? EMBEDDED_GEAR_EFFECT_SOURCE)]);
}

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
 * duration, a 60 s fight, no `gear` (the author's gear: `setupGear`, src/setup/gear.ts). With it `applySetup` reproduces the stage 1 spec (plus an empty item
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

/** At most this many enabled gear effect ids that are not in the catalog are kept (the last ones). */
export const MAX_STORED_ITEM_EFFECT_IDS = 32;

/**
 * Catalog ids and well-formed gear effect ids (`isGearEffectId`: `item:<id>[:<n>]`, kept whether
 * or not the item is worn now: an id of an item taken off stays saved, inactive; at most
 * `MAX_STORED_ITEM_EFFECT_IDS` of those not in `catalog`, the last ones), each once, in saved
 * order; the stage F ids `icon-of-the-silver-crescent` / `band-of-the-eternal-sage` become
 * `item:29370` / `item:29305` (`LEGACY_ITEM_BUFF_IDS`). A buff enabled later replaces an earlier one
 * it conflicts with (exclusive group, flask vs elixirs both ways). A repeated id counts at its
 * last position. Linear time: one pass from the end (an entry survives when no later entry has its
 * id or conflicts with it, whether that later entry survives or not: the stage 1.5 rule).
 */
function normalizeEnabled(v: unknown, catalog: readonly BuffDef[]): string[] {
  if (!Array.isArray(v)) return [];
  const byId = new Map(catalog.map((b) => [b.id, b]));
  const seenIds = new Set<string>();
  const laterGroups = new Set<string>();
  // Groups an entry later in the list excludes (`EXCLUDES`, one direction).
  const excludedByLater = new Set<string>();
  const kept: string[] = [];
  let looseItems = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    const raw: unknown = v[i];
    if (typeof raw !== 'string') continue;
    const id = Object.hasOwn(LEGACY_ITEM_BUFF_IDS, raw) ? LEGACY_ITEM_BUFF_IDS[raw]! : raw;
    const inCatalog = byId.get(id);
    if (!inCatalog && !isGearEffectId(id)) continue;
    const group = inCatalog?.exclusiveGroup;
    const conflicted =
      group !== undefined &&
      (laterGroups.has(group) ||
        excludedByLater.has(group) ||
        (Object.hasOwn(EXCLUDES, group) && EXCLUDES[group]!.some((g) => laterGroups.has(g))));
    const survives = !seenIds.has(id) && !conflicted && (inCatalog !== undefined || looseItems < MAX_STORED_ITEM_EFFECT_IDS);
    seenIds.add(id);
    if (group !== undefined) {
      laterGroups.add(group);
      if (Object.hasOwn(EXCLUDES, group)) for (const g of EXCLUDES[group]!) excludedByLater.add(g);
    }
    if (!survives) continue;
    if (inCatalog === undefined) looseItems++;
    kept.push(id);
  }
  return kept.reverse();
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

/** Whether `id` can carry an item-use rule: a catalog entry with an item action, or a gear effect id. */
function itemUseIdChecker(catalog: readonly BuffDef[]): (id: string) => boolean {
  const actionIds = new Set(catalog.filter((b) => b.effect.action !== undefined).map((b) => b.id));
  return (id) => actionIds.has(id) || isGearEffectId(id);
}

/**
 * Whether a rule equals its default in every fight, so storing it changes nothing: no window or
 * gap, and for a mana item (Super Mana Potion, Dark Rune: an action with `gainManaRange`)
 * `mana-missing` its largest gain, for any other action (Destruction Potion, the gear's on-use
 * items) `with-heroism` (the default with Heroism; without it `with-heroism` is always wanted, the
 * same steps as the default `ready`). `ready` is kept even without Heroism: enabling Heroism later
 * would change what a dropped rule means.
 */
function defaultRuleChecker(catalog: readonly BuffDef[]): (id: string, rule: ItemUseRule) => boolean {
  const manaGain = new Map(catalog.flatMap((b) => (b.effect.action?.gainManaRange ? [[b.id, b.effect.action.gainManaRange.max] as const] : [])));
  return (id, rule) => {
    if (rule.notBeforeSec !== undefined || rule.notAfterSec !== undefined || rule.minGapSec !== undefined) return false;
    const gain = manaGain.get(id);
    if (gain !== undefined) return rule.trigger.kind === 'mana-missing' && rule.trigger.amount === gain;
    return rule.trigger.kind === 'with-heroism';
  };
}

function normalizeRotation(v: unknown, catalog: readonly BuffDef[]): RotationConfig {
  const r = isRecord(v) ? v : {};
  const isKnownId = itemUseIdChecker(catalog);
  const itemUse = normalizeItemUse(own(r, 'itemUse'), isKnownId, defaultRuleChecker(catalog));
  const itemUseOrder = normalizeItemUseOrder(own(r, 'itemUseOrder'), isKnownId);
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
    // Absent stays absent: a config without rules is not given the defaults (applySetup does).
    ...(itemUse !== undefined && { itemUse }),
    ...(itemUseOrder !== undefined && { itemUseOrder }),
  };
}

/** A gear preset id: lower-case letters, digits and dashes, 1-64 characters. */
const GEAR_PRESET_ID = /^[a-z0-9-]{1,64}$/;

/**
 * `gear` and `gearPresetId` of a config, only when present in the input: absent stays absent
 * (the author's gear), so a stage 1.5 config normalizes to itself.
 */
function normalizeGearFields(input: Rec, db: ItemDb | undefined): Pick<SetupConfig, 'gear' | 'gearPresetId'> {
  const out: Pick<SetupConfig, 'gear' | 'gearPresetId'> = {};
  if (Object.hasOwn(input, 'gear')) {
    const gear = own(input, 'gear');
    out.gear = db === undefined ? normalizeGearShape(gear) : normalizeGear(gear, db);
  }
  const presetId = own(input, 'gearPresetId');
  // A preset label only means something next to a gear list: without `gear` it would be stale.
  if (out.gear !== undefined && typeof presetId === 'string' && GEAR_PRESET_ID.test(presetId)) out.gearPresetId = presetId;
  return out;
}

/**
 * `talents` of a config, only when it is a valid build other than the author's: a string of at
 * most `TALENT_STRING_MAX_LENGTH` characters that `decodeTalents` reads without a format or rule
 * error, stored in its full-width form (`encodeTalents`, so a wowsims short string and the same
 * build written out in full are one value). Anything else (not a string, malformed, a broken rule,
 * too long, the author's build in any spelling) leaves it absent: the author's build. An invalid
 * build is never repaired into another one.
 */
function normalizeTalentsField(input: Rec): Pick<SetupConfig, 'talents'> {
  const raw = own(input, 'talents');
  if (typeof raw !== 'string' || raw.length > TALENT_STRING_MAX_LENGTH) return {};
  const decoded = decodeTalents(raw);
  if (decoded.errors.length > 0) return {};
  const talents = encodeTalents(decoded.ranks);
  return talents === destructionTalentString ? {} : { talents };
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
 * - `enabledBuffs`: catalog ids and well-formed gear effect ids (`item:<id>[:<n>]`, worn or not;
 *   the stage F Icon/Band ids migrate to `item:29370`/`item:29305`); non-strings, unknown ids and
 *   duplicates dropped; within an exclusive group, and for the `EXCLUDES` pairs (a flask vs the elixirs, both ways), the one
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
 * - `rotation.itemUse` / `rotation.itemUseOrder` (simulator Task 1, itemUse.ts): absent stays
 *   absent (the defaults apply at `applySetup`, nothing is written back). Present: only ids of
 *   catalog entries with an item action and well-formed gear effect ids (worn or not, like
 *   `enabledBuffs`; prototype keys never pass), each rule validated by `normalizeItemUseRule`
 *   (known trigger kinds, seconds clamped to 0-3600, mana to 0-100 000; an invalid rule is
 *   dropped), at most 32 rules and 32 order entries; rules equal to their default in every fight
 *   are dropped (so spelling out the defaults keeps the preset identity); an empty result leaves
 *   the field absent.
 * - `gear` (stage 2a): absent stays absent (the author's gear). Present: with the item database
 *   `db`, `normalizeGear` (ids checked: unknown or misfit entries dropped; wrong length or not an
 *   array: the author's gear); without it (the database is a lazy chunk, this function is
 *   synchronous) only its shape (`normalizeGearShape`), and the caller runs `normalizeGear` once
 *   the database has loaded. `gearPresetId`: kept when a string of `[a-z0-9-]`, 1-64 characters.
 * - `talents` (stage 2b): absent stays absent (the author's build). Present: kept, in its
 *   full-width form, only when it is a valid build (`decodeTalents` without errors, at most 200
 *   characters) other than the author's; otherwise dropped (the author's build), never repaired.
 */
export function normalizeSetup(input: unknown, catalog: readonly BuffDef[], db?: ItemDb): SetupConfig {
  try {
    if (!isRecord(input) || own(input, 'version') !== 1) return defaultSetup(catalog);
    return {
      version: 1,
      enabledBuffs: normalizeEnabled(own(input, 'enabledBuffs'), catalog),
      timed: normalizeTimed(own(input, 'timed'), catalog),
      rotation: normalizeRotation(own(input, 'rotation'), catalog),
      distanceYd: clampNumber(own(input, 'distanceYd'), SETUP_LIMITS.distanceYd, DEFAULT_DISTANCE_FROM_TARGET_YD),
      warlock: normalizeWarlock(own(input, 'warlock')),
      fightDurationSec: normalizeFightDuration(own(input, 'fightDurationSec')),
      ...normalizeGearFields(input, db),
      ...normalizeTalentsField(input),
    };
  } catch {
    // A hostile getter or proxy: nothing of it is trusted.
    return defaultSetup(catalog);
  }
}
