import { buildSetup } from '../../../engine/gear';
import type { EquippedItem, RawStats, StatMultipliers } from '../../../engine/types';
import { DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../common/target';
import type { SpecData } from '../../types';
import { warlockAuras } from './auras';
import { enchants, gems, items } from './items';
import { ROTATION_PRESETS, buildPriority } from './rotation';
import { warlockSets } from './sets';
import { warlockSpells } from './spells';
import { demonicSacrificeModifiers, talentModifiers, talentRank as r } from './talents';

export { destructionTalentString, parseTalentString } from './talents';

// Destruction Warlock (Shadow Bolt build) for stage 1: the author's own character
// (docs/samples/wowsimsexporter-destruction-warlock.json: Gnome, level 70).
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a. See docs/data-sources.md,
// sections "Task 12a" and "Task 12b", for every number, the talent translation, the gear and what is
// not modeled. The talent build and its spell modifiers live in talents.ts, the priority in
// rotation.ts.

// ---------------------------------------------------------------------------
// Talents (stat effects; the spell modifiers are in talents.ts)
// ---------------------------------------------------------------------------

/**
 * Fel Armor's flat bonus. Fel Armor rank 2 (spell_data_auto_gen.go FelArmor 28189:
 * A_MOD_DAMAGE_DONE 100; Wowhead TBC spell=28189 "increasing spell damage by up to 100") x
 * Demonic Aegis 3/3 (armors.go: x (1 + 0.1 x rank)) = +130 spell damage; the self buff is kept up
 * all fight (tbc-new DefaultOptions armor: FelArmor, made permanent). Demon Armor (27260: armor,
 * shadow resistance, health regeneration) changes nothing the trainer simulates, so `demon` and
 * `none` both have no bonus.
 */
export const FEL_ARMOR_SPELL_POWER = 100 * (1 + 0.1 * r('demonicAegis'));

/**
 * Percentage stat effects of race and talents (applied by computeStats to the totals):
 * - Gnome Expansive Mind: sim/core/racials.go MultiplyStat(Intellect, 1.05).
 * - Demonic Embrace 5/5: talents.go applyDemonicEmbrace MultiplyStat(Spirit, 1 - 0.01 x rank)
 *   (its +3% stamina per rank is irrelevant here).
 * - Fel Intellect 3/3: talents.go applyFelIntellect MultiplyStat(Mana, 1 + 0.01 x rank).
 */
export const destructionStatMultipliers: StatMultipliers = {
  intellect: 1.05,
  spirit: 1 - 0.01 * r('demonicEmbrace'),
  maxMana: 1 + 0.01 * r('felIntellect'),
};

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

// setPieces (4 x Malefic Raiment) and the meta gem's modifiers come from buildSetup.
const { setup: gearSetup } = buildSetup({
  baseStats: destructionBaseStats,
  equipped: destructionEquipped,
  items,
  gems,
  enchants,
});

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

const destructionHooks: SpecData['hooks'] = {
  // Improved Shadow Bolt 5/5 (shadowbolt.go): a landed Shadow Bolt crit (re)applies the
  // debuff with all 4 charges (SetStacks(4)); it runs after the crit's own damage.
  onSpellResolved(e, api) {
    if (r('improvedShadowBolt') > 0 && e.spellId === 'shadow-bolt' && e.outcome === 'crit') {
      api.applyTargetAura('shadow-vulnerability');
    }
  },
};

/**
 * The Destruction Warlock spec for the given options. Pure: every call returns a new SpecData
 * with its own `modifiers`, `statBonuses`, `setup` and `priority` arrays/objects; the spells,
 * auras, sets, priority steps and hooks are the shared static data (never mutate them).
 * - `armor: 'fel'` adds Fel Armor's +130 spell power (`FEL_ARMOR_SPELL_POWER`); `demon` and
 *   `none` add nothing.
 * - `sacrificeSuccubus: false` leaves out Demonic Sacrifice's shadow x1.15
 *   (`demonicSacrificeModifiers`); the pet itself is not simulated either way.
 */
export function buildDestructionWarlock(options: WarlockOptions): SpecData {
  const statBonuses: Partial<RawStats> = options.armor === 'fel' ? { spellPower: FEL_ARMOR_SPELL_POWER } : {};
  const modifiers = options.sacrificeSuccubus
    ? [...talentModifiers]
    : talentModifiers.filter((m) => !demonicSacrificeModifiers.includes(m));
  return {
    id: 'destruction-warlock',
    name: 'Destruction Warlock',
    spells: warlockSpells,
    auras: warlockAuras,
    modifiers,
    statBonuses,
    sets: warlockSets,
    // buildSetup does not carry statMultipliers: Expansive Mind etc. then scale the gear's stats too.
    setup: { ...gearSetup, statMultipliers: destructionStatMultipliers },
    priority: [...defaultPriority],
    // Action bar slots 1-9, 0, -, =.
    keybinds: [
      'shadow-bolt',
      'immolate',
      'corruption',
      'curse-of-the-elements',
      'shadowburn',
      'life-tap',
      'incinerate',
      // Slot 8 left empty (ruling R17): no Conflagrate talent in this build; its SpellDef stays
      // in spells.ts for the stage 2b talent editor. Other slots keep their positions.
      '',
      'curse-of-agony',
      'curse-of-doom',
      '',
      '',
    ],
    hooks: destructionHooks,
  };
}

/** The stage 1 spec: Fel Armor and the Succubus sacrificed (`DEFAULT_WARLOCK_OPTIONS`). */
export const destructionWarlock: SpecData = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS);
