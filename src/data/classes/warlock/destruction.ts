import { buildSetup } from '../../../engine/gear';
import { combineStatMultipliers } from '../../../engine/stats';
import type { EnchantDef, EquippedItem, GemDef, ItemDef, RawStats, StatMultipliers } from '../../../engine/types';
import { DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../common/target';
import type { SpecData } from '../../types';
import { warlockAuras } from './auras';
import { enchants, gems, items, metaGemModifiers } from './items';
import { ROTATION_PRESETS, buildPriority, dotExtraTicksForSpec, type RotationTalents } from './rotation';
import { setBonusesFor } from './sets';
import { availableWarlockSpells, effectsForBuild, talentRanksOf, withTalentAuras } from './talentEffects';
import { decodeTalents, encodeTalents, type TalentRanks } from './talentTree';
import { destructionTalentString } from './talents';

export { destructionTalentString, parseTalentString } from './talents';

// Destruction Warlock (Shadow Bolt build) for stage 1: the author's own character
// (docs/samples/wowsimsexporter-destruction-warlock.json: Gnome, level 70).
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a. See docs/data-sources.md,
// sections "Task 12a" and "Task 12b", for every number, the talent translation, the gear and what is
// not modeled. The talent build and its spell modifiers live in talents.ts, the priority in
// rotation.ts.

// ---------------------------------------------------------------------------
// Talents (talentEffects.ts) and race
// ---------------------------------------------------------------------------

/** The author's talent ranks (all 64 ids). */
const AUTHOR_RANKS: Readonly<Record<string, number>> = Object.freeze(talentRanksOf(decodeTalents(destructionTalentString).ranks));
const AUTHOR_EFFECTS = effectsForBuild(AUTHOR_RANKS);

/** Fel Armor rank 2's spell damage (spell_data_auto_gen.go FelArmor 28189: A_MOD_DAMAGE_DONE 100;
 * Wowhead TBC spell=28189 "increasing spell damage by up to 100"). */
const FEL_ARMOR_BASE_SPELL_POWER = 100;

/**
 * Fel Armor's flat bonus for the author's build: 100 x Demonic Aegis 3/3 (armors.go: x (1 + 0.1 x
 * rank), talentEffects.ts `armorMult`) = +130 spell damage; the self buff is kept up all fight
 * (tbc-new DefaultOptions armor: FelArmor, made permanent). Demon Armor (27260: armor, shadow
 * resistance, health regeneration) changes nothing the trainer simulates, so `demon` and `none`
 * both have no bonus.
 */
export const FEL_ARMOR_SPELL_POWER = FEL_ARMOR_BASE_SPELL_POWER * AUTHOR_EFFECTS.armorMult;

/** Gnome Expansive Mind: sim/core/racials.go MultiplyStat(Intellect, 1.05). */
const RACIAL_STAT_MULTIPLIERS = { intellect: 1.05 } as const;

/**
 * Percentage stat effects of race and talents (applied by computeStats to the totals) for the
 * author's build: Expansive Mind (intellect x1.05), Demonic Embrace 5/5 (spirit x0.95) and Fel
 * Intellect 3/3 (max mana x1.03), the talents' from talentEffects.ts.
 */
export const destructionStatMultipliers: StatMultipliers = combineStatMultipliers(RACIAL_STAT_MULTIPLIERS, AUTHOR_EFFECTS.statMultipliers);

// ---------------------------------------------------------------------------
// Character base stats (no gear, no raid buffs)
// ---------------------------------------------------------------------------

/**
 * Level 70 Gnome Warlock before racial multipliers: sim/core/base_stats.go
 * ClassBaseStats[Warlock] (Intellect 133, Spirit 139) + RaceOffsets[Gnome] (Intellect +3,
 * Spirit 0); baseMana = base_stats_auto_gen.go ExtraClassBaseStats[Warlock] Mana 2615 (class
 * base mana excluding intellect, ruling R12). Base spell crit 1.7% is added by computeStats.
 * Strength, agility and stamina do not affect the simulated spells.
 */
export const destructionBaseStats: RawStats = {
  intellect: 133 + 3,
  spirit: 139,
  spellPower: 0,
  shadowPower: 0,
  firePower: 0,
  critRating: 0,
  hitRating: 0,
  hasteRating: 0,
  baseMana: 2615,
  mp5: 0,
};

// ---------------------------------------------------------------------------
// Gear (Task 12b)
// ---------------------------------------------------------------------------

/**
 * The author's equipped gear: `gear.items` of docs/samples/wowsimsexporter-destruction-warlock.json,
 * copied verbatim in slot order (head, neck, shoulder, back, chest, wrist, hands, waist, legs,
 * feet, finger x2, trinket x2, main hand, off hand, ranged). tests/data/gear.test.ts asserts it
 * equals the file. Item, gem and enchant values: items.ts; set bonuses: sets.ts.
 */
export const destructionEquipped: EquippedItem[] = [
  { enchant: 3002, gems: [34220, 32218], id: 31051 },
  { id: 32349, gems: [] },
  { enchant: 2995, gems: [32215, 32218], id: 31054 },
  { enchant: 2621, gems: [], id: 32590 },
  { enchant: 2661, gems: [], id: 30913 },
  { enchant: 2650, gems: [], id: 32586 },
  { enchant: 2937, gems: [32196], id: 31050 },
  { id: 30038, gems: [24056, 32207] },
  { enchant: 2748, gems: [28123], id: 31053 },
  { enchant: 2649, gems: [28118, 33133], id: 28517 },
  { enchant: 2928, gems: [], id: 29305 },
  { enchant: 2928, gems: [], id: 32247 },
  { id: 25653, gems: [] },
  { id: 29370, gems: [] },
  { enchant: 2669, gems: [], id: 32237 },
  { id: 33334, gems: [] },
  { id: 29982, gems: [] },
];

/**
 * Where a gear's item, gem and enchant records come from: the item database (`ItemDb`,
 * src/data/items, structurally compatible) or the embedded author tables (items.ts).
 */
export interface GearTables {
  items: Readonly<Record<number, ItemDef>>;
  gems: Readonly<Record<number, GemDef>>;
  enchants: Readonly<Record<number, EnchantDef>>;
}

/** The embedded tables of the author's gear (items.ts): enough for the default gear, no database needed. */
export const AUTHOR_GEAR_TABLES: GearTables = { items, gems, enchants };

/**
 * The setup of a gear from the given tables (`buildSetup`): set pieces, socket bonuses and the
 * active meta gem's stats and modifiers included; empty slots (null) skipped; ids missing from the
 * tables are skipped (`buildSetup` reports them; `normalizeGear` keeps a stored gear to known,
 * fitting ids). A meta gem without `metaModifiers` in the tables gets the hand-modelled ones of
 * items.ts (`metaGemModifiers`: the database has none). Only the gear's own gems are looked up.
 */
function gearSetupFor(gear: readonly (EquippedItem | null)[], tables: GearTables) {
  const equipped = gear.filter((e): e is EquippedItem => e !== null);
  const gemTable: Record<number, GemDef> = {};
  for (const e of equipped) {
    for (const id of e.gems ?? []) {
      if (!Object.hasOwn(tables.gems, id) || Object.hasOwn(gemTable, id)) continue;
      const gem = tables.gems[id]!;
      const modelled = Object.hasOwn(metaGemModifiers, id) ? metaGemModifiers[id] : undefined;
      gemTable[id] = gem.metaModifiers === undefined && modelled ? { ...gem, metaModifiers: [...modelled] } : gem;
    }
  }
  return buildSetup({
    baseStats: destructionBaseStats,
    equipped,
    items: tables.items as Record<number, ItemDef>,
    gems: gemTable,
    enchants: tables.enchants as Record<number, EnchantDef>,
  }).setup;
}

// setPieces (4 x Malefic Raiment) and the meta gem's modifiers come from buildSetup.
const gearSetup = gearSetupFor(destructionEquipped, AUTHOR_GEAR_TABLES);

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

/**
 * The warlock's own choices that stage 1 fixed (stage 1.5 Part C, "warlock options"): the armor
 * self buff kept up all fight and whether the Succubus is sacrificed (Demonic Sacrifice).
 */
export interface WarlockOptions {
  armor: 'fel' | 'demon' | 'none';
  sacrificeSuccubus: boolean;
}

/** Stage 1's assumptions (Fel Armor, Succubus sacrificed): the spec's numbers unchanged. */
export const DEFAULT_WARLOCK_OPTIONS: Readonly<WarlockOptions> = Object.freeze({
  armor: 'fel',
  sacrificeSuccubus: true,
});

// The DoT rotation preset at the default distance (rotation.ts); the UI and the bot may build
// another list with buildPriority. Built once: the options do not change it, and every build
// sharing the same step objects keeps the default build equal to stage 1's spec, `when` included.
const defaultPriority = buildPriority(ROTATION_PRESETS.dot.config, DEFAULT_DISTANCE_FROM_TARGET_YD);

/**
 * The action bar's spell row (slots 1-9, 0, -, =): a spell the build does not have leaves its slot
 * empty, the others keep their positions. Slot 8 is Conflagrate when talented (ruling R17 closed
 * by stage 2b; the author's build has no Conflagrate, so its slot 8 stays empty).
 */
const SPELL_ROW: readonly string[] = [
  'shadow-bolt',
  'immolate',
  'corruption',
  'curse-of-the-elements',
  'shadowburn',
  'life-tap',
  'incinerate',
  'conflagrate',
  'curse-of-agony',
  'curse-of-doom',
  '',
  '',
];

/**
 * The Destruction Warlock spec for the given options and gear. Pure: every call returns a new SpecData
 * with its own `modifiers`, `statBonuses`, `setup` (a shallow copy: the gear stats and the stat
 * multipliers inside it are shared) and `priority` arrays/objects; the spells, auras, sets,
 * priority steps and hooks are the shared static data (never mutate them).
 * - `armor: 'fel'` adds Fel Armor's +130 spell power (`FEL_ARMOR_SPELL_POWER`); `demon` and
 *   `none` add nothing.
 * - `sacrificeSuccubus: false` leaves out Demonic Sacrifice's shadow x1.15
 *   (`demonicSacrificeModifiers`); the pet itself is not simulated either way.
 * - `gear` (17 slots in WowSimsExporter order, null = empty; a normalized gear, `normalizeGear` in
 *   src/setup/gear.ts) is built from `db` (the item database) or, without one, from the embedded
 *   author tables (`AUTHOR_GEAR_TABLES`), which only know the author's gear. Without `gear` the
 *   author's gear (`destructionEquipped`) is used, and without `db` either its setup is the one
 *   built at load (the stage 1 spec, field for field; the gear stats object shared by every such
 *   build).
 * - `sets` are the modelled bonuses of the sets the gear wears (`setBonusesFor`: `warlockSets`
 *   for the author's gear) and `auras` the spell auras (`warlockAuras`, shared) plus the self
 *   auras of those bonuses' procs (a new array only when there are some).
 * - `priority`: the DoT preset at the default distance; when the gear extends a DoT
 *   (`dotExtraTicksForSpec`, Voidheart 4pc) or the talents are not the author's, a fresh build
 *   whose rules count it (`buildPriority` with the build's `RotationTalents`).
 * - `talents` (stage 2b): a talent string (untrusted: `decodeTalents`, a malformed string means no
 *   talents; ranks clamped, never throws) or a rank map; absent = the author's build. Its effects
 *   (talentEffects.ts `effectsForBuild`) give the `modifiers` (Demonic Sacrifice only with
 *   `sacrificeSuccubus`), the talents' stat multipliers (with Expansive Mind), Fel Armor's bonus
 *   (x Demonic Aegis), the aura overrides (`withTalentAuras`: the shared `warlockAuras` when none
 *   differs), `hooks` and the available spells: a talent spell (Shadowburn, Conflagrate) the
 *   build does not take is neither in `spells` (casting it gives 'unknown-spell') nor bound.
 */
export function buildDestructionWarlock(
  options: WarlockOptions,
  gear?: readonly (EquippedItem | null)[],
  db?: GearTables,
  talents?: string | TalentRanks,
): SpecData {
  const ranks =
    talents === undefined ? AUTHOR_RANKS : talentRanksOf(typeof talents === 'string' ? decodeTalents(talents).ranks : talents);
  const isAuthor = talents === undefined || encodeTalents(ranks) === encodeTalents(AUTHOR_RANKS);
  const full = isAuthor ? AUTHOR_EFFECTS : effectsForBuild(ranks);
  // The Succubus kept (not sacrificed): Demonic Sacrifice gives nothing.
  const fx = effectsForBuild(options.sacrificeSuccubus ? ranks : { ...ranks, demonicSacrifice: 0 });
  const statBonuses: Partial<RawStats> = {
    ...fx.statBonuses,
    ...(options.armor === 'fel' && { spellPower: (fx.statBonuses.spellPower ?? 0) + FEL_ARMOR_BASE_SPELL_POWER * fx.armorMult }),
  };
  const modifiers = fx.modifiers;
  const setup =
    gear === undefined && db === undefined ? gearSetup : gearSetupFor(gear ?? destructionEquipped, db ?? AUTHOR_GEAR_TABLES);
  // The bonuses of the worn sets (the author's gear: `warlockSets`) and the auras their hooks apply.
  const sets = setBonusesFor(setup.setPieces);
  const setAuras = sets.flatMap((b) => b.auras ?? []);
  // A gear that extends the DoTs (Voidheart 4pc) needs refresh rules counting the longer DoTs;
  // every other build shares the default steps.
  const dotExtraTicks = dotExtraTicksForSpec({ modifiers, setup, sets });
  const rotationTalents: RotationTalents = { modifiers: full.modifiers, spells: full.spells };
  const priority =
    Object.keys(dotExtraTicks).length > 0 || !isAuthor
      ? buildPriority(ROTATION_PRESETS.dot.config, DEFAULT_DISTANCE_FROM_TARGET_YD, dotExtraTicks, rotationTalents)
      : [...defaultPriority];
  const spells = availableWarlockSpells(fx.spells);
  const talentAuras = withTalentAuras(warlockAuras, fx.auras);
  return {
    id: 'destruction-warlock',
    name: 'Destruction Warlock',
    spells,
    auras: setAuras.length > 0 ? [...talentAuras, ...setAuras] : (talentAuras as SpecData['auras']),
    modifiers,
    statBonuses,
    sets,
    // buildSetup does not carry statMultipliers: Expansive Mind etc. then scale the gear's stats too.
    setup: { ...setup, statMultipliers: isAuthor ? destructionStatMultipliers : combineStatMultipliers(RACIAL_STAT_MULTIPLIERS, fx.statMultipliers) },
    priority,
    // Action bar slots 1-9, 0, -, = (SPELL_ROW): spells the build lacks leave their slot empty.
    keybinds: SPELL_ROW.map((id) => (id !== '' && spells.some((x) => x.id === id) ? id : '')),
    hooks: fx.hooks,
  };
}

/**
 * What `buildPriority` reads from a build (`RotationTalents`: every talent modifier, Demonic
 * Sacrifice included (it changes no rule number), and the talent spells), the same value
 * `buildDestructionWarlock` builds its own priority with. Undefined for the author's build (absent,
 * or a string or rank map equal to it): `buildPriority`'s default, the stage 1 list rule for rule.
 * `talents` as in `buildDestructionWarlock` (untrusted; a malformed string means no talents).
 */
export function rotationTalentsFor(talents?: string | TalentRanks): RotationTalents | undefined {
  if (talents === undefined) return undefined;
  const ranks = talentRanksOf(typeof talents === 'string' ? decodeTalents(talents).ranks : talents);
  if (encodeTalents(ranks) === encodeTalents(AUTHOR_RANKS)) return undefined;
  const fx = effectsForBuild(ranks);
  return { modifiers: fx.modifiers, spells: fx.spells };
}

/** The stage 1 spec: Fel Armor and the Succubus sacrificed (`DEFAULT_WARLOCK_OPTIONS`). */
export const destructionWarlock: SpecData = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS);
