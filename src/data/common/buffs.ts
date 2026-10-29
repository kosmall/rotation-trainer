// Raid, party and individual buffs (stage 1.5 Part C, static: active the whole fight).
// Values: github.com/wowsims/tbc-new master @ 91f869a `sim/core/buffs.go` (the function named in
// each `source`), cross-checked with Wowhead TBC tooltips (nether.wowhead.com/tbc/tooltip/spell/<id>).
// See docs/data-sources.md, "Part C: raid, party and individual buffs".
//
// Ranks: where wowsims has an "improved" tristate, the catalog uses the improved (maximum) value
// and the description says so; Mana Spring Totem is the exception (the author's log shows the
// unimproved 20 mana per 2 s).
//
// Stacking: flat bonuses are added to the raw stats first; every percentage multiplier then
// scales the total and multipliers of one stat multiply together (wowsims
// sim/core/stats/deps.go: same-stat dependencies combine with `amount *= dep.amount`), so Blessing
// of Kings x1.1 times Gnome Expansive Mind x1.05 = x1.155 on (gear + base + Arcane Brilliance + Gift
// of the Wild) intellect. The gear in destruction.ts was built from item ids with no buff applied,
// and the spec's own multipliers (Expansive Mind, Demonic Embrace, Fel Intellect) and flat bonus
// (Fel Armor) are none of these buffs, so nothing here is counted twice.

import { HIT_RATING_PER_PCT } from './ratings';
import type { BuffDef } from '../types';

/**
 * Freezes a buff and everything inside it (catalog entries are shared, never mutated). Functions
 * (hooks) are not frozen. Also used by the warlock catalog (src/data/classes/warlock/buffs.ts).
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const BUFFS = 'wowsims/tbc-new sim/core/buffs.go';

export const commonBuffs: readonly BuffDef[] = deepFreeze<BuffDef[]>([
  // -------------------------------------------------------------------------
  // Raid buffs (wowsims RaidBuffs)
  // -------------------------------------------------------------------------
  {
    id: 'arcane-brilliance',
    name: 'Arcane Brilliance',
    icon: 'spell_holy_arcaneintellect',
    wowheadId: 27127,
    group: 'raid',
    description: '+40 intellect (mage raid buff).',
    // ArcaneBrillianceAura: {stats.Intellect, 40}; Wowhead TBC spell=27127 "increasing their Intellect by 40".
    source: `${BUFFS} ArcaneBrillianceAura; https://www.wowhead.com/tbc/spell=27127`,
    effect: { statBonuses: { intellect: 40 } },
  },
  {
    id: 'gift-of-the-wild',
    name: 'Gift of the Wild',
    icon: 'spell_nature_giftofthewild',
    wowheadId: 26991,
    group: 'raid',
    description:
      '+18 intellect and spirit: improved rank (Improved Mark of the Wild 5/5, 14 x 1.35 = 18.9, truncated to 18; unimproved 14). Armor, resistances and the other attributes do not affect the simulated spells.',
    // GiftOfTheWildAura(improved): statMod = math.Floor(14 * 1.35) = 18 for Intellect and Spirit;
    // Wowhead TBC spell=26991 (all attributes by 14), spell=17055 Improved Mark of the Wild (+35%).
    source: `${BUFFS} GiftOfTheWildAura (improved); https://www.wowhead.com/tbc/spell=26991`,
    effect: { statBonuses: { intellect: 18, spirit: 18 } },
  },
  {
    id: 'prayer-of-spirit',
    name: 'Divine Spirit (Prayer of Spirit)',
    icon: 'spell_holy_prayerofspirit',
    wowheadId: 32999,
    group: 'raid',
    description:
      "+50 spirit. Improved Divine Spirit's extra spell damage (10% of total spirit) is NOT modelled: the engine has no spirit-to-spell-power dependency (about +19 spell power at 190 spirit).",
    // DivineSpiritAura: makeExclusiveFlatStatBuff(Spirit, 50); improved adds a dynamic
    // Spirit -> SpellDamage 0.1 dependency (not modelled). Wowhead TBC spell=32999 "Spirit by 50".
    source: `${BUFFS} DivineSpiritAura; https://www.wowhead.com/tbc/spell=32999`,
    effect: { statBonuses: { spirit: 50 } },
  },

  // -------------------------------------------------------------------------
  // Party buffs (wowsims PartyBuffs)
  // -------------------------------------------------------------------------
  {
    id: 'moonkin-aura',
    name: 'Moonkin Aura',
    icon: 'spell_nature_moonglow',
    wowheadId: 24907,
    group: 'party',
    description:
      '+5% spell crit, plus 20 spell crit rating: improved rank (the druid wears Idol of the Raven Goddess, item 32387; unimproved: +5% only).',
    // MoonkinAuraBuff: {SpellCritPercent, 5}; improved adds {SpellCritRating, 20}. Wowhead TBC
    // item=32387 "adds 20 spell critical strike rating to the Moonkin form aura".
    source: `${BUFFS} MoonkinAuraBuff (improved); https://www.wowhead.com/tbc/item=32387`,
    effect: {
      // A percentage, so a modifier on every spell, not rating (keeps critRating comparable with
      // a log's character sheet).
      modifiers: [{ critPctDelta: 5 }],
      statBonuses: { critRating: 20 },
    },
  },
  {
    id: 'mana-spring-totem',
    name: 'Mana Spring Totem',
    icon: 'spell_nature_manaregentotem',
    wowheadId: 25570,
    group: 'party',
    description:
      '50 mp5 = 20 mana every 2 s (unimproved, as in the author\'s log; Restorative Totems 5/5 would give 62.5 mp5).',
    // ManaSpringTotemAura: mp5Buff 50 (x1.25 improved); Wowhead TBC spell=25570 "restores 20 mana
    // every 2 seconds"; the author's Naj'entus log: 20 mana per 2 s (checkpoint).
    source: `${BUFFS} ManaSpringTotemAura; https://www.wowhead.com/tbc/spell=25570; author's log`,
    effect: { statBonuses: { mp5: 50 } },
  },
  {
    id: 'wrath-of-air-totem',
    name: 'Wrath of Air Totem',
    icon: 'spell_nature_slowingtotem',
    wowheadId: 3738,
    group: 'party',
    description:
      '+121 spell power: improved rank (101 + 20 from Improved Wrath of Air Totem, the shaman Cyclone Regalia 2-piece (tbc-new sim/shaman/totems.go), Wowhead spell 37212; the improved value assumes the shaman wears it; unimproved 101).',
    // WrathOfAirTotemValue(improved) = WrathOfAirTotemBaseValue 101 + WrathOfAirTotemImprovedValue 20;
    // Wowhead TBC spell=3738 "increased by up to 101", spell=37212 "an additional 20 spell damage".
    source: `${BUFFS} WrathOfAirTotemAura (improved); https://www.wowhead.com/tbc/spell=37212`,
    effect: { statBonuses: { spellPower: 101 + 20 } },
  },
  {
    id: 'totem-of-wrath',
    name: 'Totem of Wrath',
    icon: 'spell_fire_totemofwrath',
    wowheadId: 30706,
    group: 'party',
    description:
      '+3% spell crit and +3% spell hit (one totem: the in-game effect does not stack from several shamans).',
    // TotemOfWrathAura(count 1): {SpellCritPercent, 3}, {SpellHitPercent, 3}; Wowhead TBC
    // spell=30706 "hit and critically strike with spells by 3%".
    source: `${BUFFS} TotemOfWrathAura (count 1); https://www.wowhead.com/tbc/spell=30706`,
    effect: {
      modifiers: [{ critPctDelta: 3 }],
      // The engine has no hit-percent modifier: 3% as rating (1% = HIT_RATING_PER_PCT = 12.615385).
      statBonuses: { hitRating: 3 * HIT_RATING_PER_PCT },
    },
  },
  {
    id: 'inspiring-presence',
    name: 'Inspiring Presence (Draenei)',
    icon: 'inv_staff_23',
    wowheadId: 28878,
    group: 'party',
    description:
      "+1% spell hit from a Draenei caster in the party. The melee version, Heroic Presence (6562), gives physical hit only, so the caster version is the one a warlock gets.",
    // DraneiRacialAura(caster): {SpellHitPercent, 1} (Alliance players only); Wowhead TBC
    // spell=28878 "Increases chance to hit with spells by 1%".
    source: `${BUFFS} DraneiRacialAura (caster); https://www.wowhead.com/tbc/spell=28878`,
    // The engine has no hit-percent modifier: 1% as rating (1% = HIT_RATING_PER_PCT = 12.615385).
    effect: { statBonuses: { hitRating: HIT_RATING_PER_PCT } },
  },

  // -------------------------------------------------------------------------
  // Individual buffs (wowsims IndividualBuffs)
  // -------------------------------------------------------------------------
  {
    id: 'blessing-of-kings',
    name: 'Blessing of Kings',
    icon: 'spell_magic_greaterblessingofkings',
    wowheadId: 25898,
    group: 'individual',
    description:
      'Intellect and spirit x1.1 on the totals (after flat buffs), multiplied with the Gnome x1.05 and Demonic Embrace x0.95.',
    // BlessingOfKingsAura: {Intellect, 1.1, true}, {Spirit, 1.1, true} (multiplicative);
    // Wowhead TBC spell=25898 "increasing total stats by 10%".
    source: `${BUFFS} BlessingOfKingsAura; https://www.wowhead.com/tbc/spell=25898`,
    effect: { statMultipliers: { intellect: 1.1, spirit: 1.1 } },
  },
  {
    id: 'blessing-of-wisdom',
    name: 'Blessing of Wisdom',
    icon: 'spell_holy_greaterblessingofwisdom',
    wowheadId: 27143,
    group: 'individual',
    description:
      '49 mp5: improved rank (Improved Blessing of Wisdom 2/2, 41 x 1.2 = 49.2, truncated to 49; unimproved 41).',
    // BlessingOfWisdomAura(improved): math.Floor(41 * 1.20) = 49; Wowhead TBC spell=27143
    // "restoring 41 mana every 5 seconds", spell=20245 Improved Blessing of Wisdom (+20%).
    source: `${BUFFS} BlessingOfWisdomAura (improved); https://www.wowhead.com/tbc/spell=27143`,
    effect: { statBonuses: { mp5: 49 } },
  },
]);

// ===========================================================================
// Consumables (stage 1.5 Task 7): static flat bonuses, active the whole fight when enabled.
// Values: wowsims/tbc-new @ 91f869a assets/database/db.json `consumables` (stats array indexed by
// proto/common.proto `Stat`: SpellDamage -> spellPower, ShadowDamage -> shadowPower, FireDamage ->
// firePower, SpellCritRating -> critRating, MP5 -> mp5), which `applyConsumeEffects`
// (sim/core/consumes.go) adds with `character.AddStats`; weapon oils from consumes.go
// `registerStaticImbue`. Each cross-checked with the Wowhead TBC item tooltip
// (nether.wowhead.com/tbc/tooltip/item/<item id>); `wowheadId` is the buff (use) spell, whose
// icon the tooltip API confirms. See docs/data-sources.md, "Part C: consumables, debuffs and
// warlock options".
//
// Not modelled (deviation from the design spec §4.2, to be confirmed by the author): Super Mana
// Potion and Dark Rune. They are actions the player uses for an instant mana gain at a moment of
// their choosing (sharing the potion / rune cooldowns), not passive or scheduled buffs.
// ===========================================================================

const CONSUMES = 'wowsims/tbc-new sim/core/consumes.go applyConsumeEffects + assets/database/db.json';
const IMBUES = 'wowsims/tbc-new sim/core/consumes.go registerStaticImbue';

export const consumables: readonly BuffDef[] = deepFreeze<BuffDef[]>([
  // -------------------------------------------------------------------------
  // Flasks: count as both a battle and a guardian elixir (see EXCLUDES)
  // -------------------------------------------------------------------------
  {
    id: 'flask-of-supreme-power',
    name: 'Flask of Supreme Power',
    icon: 'inv_potion_41',
    wowheadId: 17628,
    group: 'consumable',
    exclusiveGroup: 'flask',
    description: '+70 spell power. Counts as both a battle and a guardian elixir.',
    // db.json item 13512 (type Flask): SpellDamage 70; Wowhead TBC item=13512 "Increases damage
    // done by magical spells and effects by up to 70 for 2 hrs".
    source: `${CONSUMES} (item 13512); https://www.wowhead.com/tbc/item=13512`,
    effect: { statBonuses: { spellPower: 70 } },
  },
  {
    id: 'flask-of-distilled-wisdom',
    name: 'Flask of Distilled Wisdom',
    icon: 'inv_potion_97',
    wowheadId: 17627,
    group: 'consumable',
    exclusiveGroup: 'flask',
    description: '+65 intellect. Counts as both a battle and a guardian elixir.',
    // db.json item 13511 (Flask): Intellect 65; Wowhead TBC item=13511 "Increases Intellect by 65".
    source: `${CONSUMES} (item 13511); https://www.wowhead.com/tbc/item=13511`,
    effect: { statBonuses: { intellect: 65 } },
  },
  {
    id: 'flask-of-pure-death',
    name: 'Flask of Pure Death',
    icon: 'inv_potion_115',
    wowheadId: 28540,
    group: 'consumable',
    exclusiveGroup: 'flask',
    description:
      '+80 shadow and fire spell power (frost too, unused). The TBC warlock flask. Counts as both a battle and a guardian elixir.',
    // db.json item 22866 (Flask): FireDamage 80, FrostDamage 80, ShadowDamage 80; Wowhead TBC
    // item=22866 "Increases spell damage caused by Shadow, Fire and Frost spells by up to 80".
    source: `${CONSUMES} (item 22866); https://www.wowhead.com/tbc/item=22866`,
    effect: { statBonuses: { shadowPower: 80, firePower: 80 } },
  },

  // -------------------------------------------------------------------------
  // Battle elixirs
  // -------------------------------------------------------------------------
  {
    id: 'elixir-of-major-shadow-power',
    name: 'Elixir of Major Shadow Power',
    icon: 'inv_potion_145',
    wowheadId: 28503,
    group: 'consumable',
    exclusiveGroup: 'elixir-battle',
    description: '+55 shadow spell power. Battle elixir.',
    // db.json item 22835 (BattleElixir): ShadowDamage 55; Wowhead TBC item=22835 "Increases shadow
    // spell damage by up to 55 for 1 hour. Battle Elixir."
    source: `${CONSUMES} (item 22835); https://www.wowhead.com/tbc/item=22835`,
    effect: { statBonuses: { shadowPower: 55 } },
  },
  {
    id: 'elixir-of-major-firepower',
    name: 'Elixir of Major Firepower',
    icon: 'inv_potion_146',
    wowheadId: 28501,
    group: 'consumable',
    exclusiveGroup: 'elixir-battle',
    description: '+55 fire spell power. Battle elixir.',
    // db.json item 22833 (BattleElixir): FireDamage 55; Wowhead TBC item=22833 "Increases fire
    // spell damage by up to 55 for 1 hour. Battle Elixir."
    source: `${CONSUMES} (item 22833); https://www.wowhead.com/tbc/item=22833`,
    effect: { statBonuses: { firePower: 55 } },
  },
  {
    id: 'adepts-elixir',
    name: "Adept's Elixir",
    icon: 'inv_potion_96',
    wowheadId: 33721,
    group: 'consumable',
    exclusiveGroup: 'elixir-battle',
    description: '+24 spell power and +24 spell crit rating. Battle elixir.',
    // db.json item 28103 (BattleElixir): SpellDamage 24, SpellCritRating 24 (HealingPower 24
    // unused); Wowhead TBC item=28103 "spell damage and healing by up to 24 and spell critical
    // strike rating by 24".
    source: `${CONSUMES} (item 28103); https://www.wowhead.com/tbc/item=28103`,
    effect: { statBonuses: { spellPower: 24, critRating: 24 } },
  },
  {
    id: 'greater-arcane-elixir',
    name: 'Greater Arcane Elixir',
    icon: 'inv_potion_25',
    wowheadId: 17539,
    group: 'consumable',
    exclusiveGroup: 'elixir-battle',
    description: '+35 spell power. Battle elixir.',
    // db.json item 13454 (BattleElixir): SpellDamage 35; Wowhead TBC item=13454 "Increases spell
    // damage by up to 35 for 1 hour. Battle Elixir."
    source: `${CONSUMES} (item 13454); https://www.wowhead.com/tbc/item=13454`,
    effect: { statBonuses: { spellPower: 35 } },
  },

  // -------------------------------------------------------------------------
  // Guardian elixirs
  // -------------------------------------------------------------------------
  {
    id: 'elixir-of-draenic-wisdom',
    name: 'Elixir of Draenic Wisdom',
    icon: 'inv_potion_155',
    wowheadId: 39627,
    group: 'consumable',
    exclusiveGroup: 'elixir-guardian',
    description: '+30 intellect and +30 spirit. Guardian elixir.',
    // db.json item 32067 (GuardianElixir): Intellect 30, Spirit 30; Wowhead TBC item=32067
    // "Increases Intellect and Spirit by 30 for 1 hour. Guardian Elixir."
    source: `${CONSUMES} (item 32067); https://www.wowhead.com/tbc/item=32067`,
    effect: { statBonuses: { intellect: 30, spirit: 30 } },
  },
  {
    id: 'elixir-of-major-mageblood',
    name: 'Elixir of Major Mageblood',
    icon: 'inv_potion_151',
    wowheadId: 28509,
    group: 'consumable',
    exclusiveGroup: 'elixir-guardian',
    description: '16 mp5. Guardian elixir.',
    // db.json item 22840 (GuardianElixir): MP5 16; Wowhead TBC item=22840 "Regenerate 16 mana per
    // 5 sec for 1 hour. Guardian Elixir."
    source: `${CONSUMES} (item 22840); https://www.wowhead.com/tbc/item=22840`,
    effect: { statBonuses: { mp5: 16 } },
  },

  // -------------------------------------------------------------------------
  // Food (one "Well Fed" buff at a time)
  // -------------------------------------------------------------------------
  {
    id: 'blackened-basilisk',
    name: 'Blackened Basilisk',
    icon: 'spell_misc_food',
    wowheadId: 33263,
    group: 'consumable',
    exclusiveGroup: 'food',
    description:
      'Well Fed: +23 spell power and +20 spirit (the same buff as Crunchy Serpent and Poached Bluefish).',
    // db.json item 27657 (Food): SpellDamage 23, Spirit 20; Wowhead TBC item=27657 "gain 23 Spell
    // Damage and 20 Spirit", buff spell=33263 "Spell Damage increased by 23 and Spirit increased
    // by 20".
    source: `${CONSUMES} (item 27657); https://www.wowhead.com/tbc/item=27657`,
    effect: { statBonuses: { spellPower: 23, spirit: 20 } },
  },
  {
    id: 'skullfish-soup',
    name: 'Skullfish Soup',
    icon: 'spell_misc_food',
    wowheadId: 43722,
    group: 'consumable',
    exclusiveGroup: 'food',
    description: 'Enlightened: +20 spell crit rating and +20 spirit.',
    // db.json item 33825 (Food): SpellCritRating 20, Spirit 20; Wowhead TBC item=33825 "gain 20
    // Spell Critical Strike Rating and Spirit", buff spell=43722 "Spell Critical Strike Rating and
    // Spirit increased by 20".
    source: `${CONSUMES} (item 33825); https://www.wowhead.com/tbc/item=33825`,
    effect: { statBonuses: { critRating: 20, spirit: 20 } },
  },
  {
    id: 'blackened-sporefish',
    name: 'Blackened Sporefish',
    icon: 'spell_misc_food',
    wowheadId: 33265,
    group: 'consumable',
    exclusiveGroup: 'food',
    description: 'Well Fed: 8 mp5 (its +20 stamina does not affect the simulated spells).',
    // db.json item 27663 (Food): Stamina 20, MP5 8; Wowhead TBC item=27663 "gain 20 Stamina and 8
    // Mana every 5 seconds", buff spell=33265.
    source: `${CONSUMES} (item 27663); https://www.wowhead.com/tbc/item=27663`,
    effect: { statBonuses: { mp5: 8 } },
  },

  // -------------------------------------------------------------------------
  // Weapon oils (temporary weapon enchant; stacks with the permanent weapon enchant)
  // -------------------------------------------------------------------------
  {
    id: 'brilliant-wizard-oil',
    name: 'Brilliant Wizard Oil',
    icon: 'inv_potion_105',
    wowheadId: 25122,
    group: 'consumable',
    exclusiveGroup: 'weapon-oil',
    description: '+36 spell power and +14 spell crit rating.',
    // registerStaticImbue case 25122: SpellDamage 36, SpellCritRating 14; Wowhead TBC item=20749
    // "increases spell damage by up to 36 and increases spell critical strike rating by 14".
    source: `${IMBUES} (25122); https://www.wowhead.com/tbc/item=20749`,
    effect: { statBonuses: { spellPower: 36, critRating: 14 } },
  },
  {
    id: 'superior-wizard-oil',
    name: 'Superior Wizard Oil',
    icon: 'inv_potion_141',
    wowheadId: 28017,
    group: 'consumable',
    exclusiveGroup: 'weapon-oil',
    description: '+42 spell power.',
    // registerStaticImbue case 28017: SpellDamage 42; Wowhead TBC item=22522 "increases spell
    // damage by up to 42".
    source: `${IMBUES} (28017); https://www.wowhead.com/tbc/item=22522`,
    effect: { statBonuses: { spellPower: 42 } },
  },
]);

/**
 * Exclusive groups that also exclude other groups: a buff of the key's group and a buff of a
 * listed group cannot be enabled together. A flask "counts as both a Battle and Guardian
 * elixir" (Wowhead TBC tooltips of items 13511, 13512, 22866), so enabling a flask disables the
 * enabled elixirs (and, read the other way, an elixir enabled later replaces the flask; the
 * wowsims UI does the same both ways, tbc-new ui/features/settings/model/consumables.ts:431-438).
 * Used by `normalizeSetup` (Task 9); within one group the normal `exclusiveGroup` rule applies.
 */
export const EXCLUDES: Readonly<Record<string, readonly string[]>> = deepFreeze({
  flask: ['elixir-battle', 'elixir-guardian'],
});

// ===========================================================================
// Target debuffs from other raid members (stage 1.5 Task 7)
// Values: wowsims/tbc-new @ 91f869a sim/core/debuffs.go (function named per entry), cross-checked
// with Wowhead TBC tooltips. Each is a target aura scheduled at 0 for the whole fight (Task 9).
// None has an `exclusiveGroup`: the two that must not stack with the player's own aura (Curse of
// the Elements, Improved Shadow Bolt) are handled by `neutralizeOwnAuras`
// (src/data/classes/warlock/buffs.ts, rulings S1 and S2). Every aura below is its own object,
// never one of the spec's (this catalog is deep-frozen).
// ===========================================================================

/**
 * Own duration of every catalog target debuff (1 hour, ruling S3): `applySetup` schedules them
 * at 0 without a duration override and the end of the fight cuts them.
 */
export const SCHEDULED_DEBUFF_DURATION_MS = 3600000;

/** Judgement of Wisdom's proc chance per landed spell: debuffs.go JudgementOfWisdomAura ProcChance 0.5. */
export const JUDGEMENT_OF_WISDOM_PROC_CHANCE = 0.5;
/**
 * Mana per Judgement of Wisdom proc: debuffs.go `unit.AddMana(sim, 74.0, ...)`; the author's
 * Naj'entus log: 74 per proc (20 procs on 37 hits, checkpoint).
 */
export const JUDGEMENT_OF_WISDOM_MANA = 74;
/**
 * Warlock spells that never trigger Judgement of Wisdom in wowsims: Life Tap does not hit the
 * target (lifetap.go deals no outcome to it), Curse of the Elements has `ProcMaskEmpty`
 * (curse_of_elements.go), outside JoW's `ProcMaskDirect`. Every other warlock spell in the
 * trainer has `ProcMaskSpellDamage` and procs it on a landed hit.
 */
const JOW_NO_PROC_SPELL_IDS: readonly string[] = ['life-tap', 'curse-of-the-elements'];

const DEBUFFS = 'wowsims/tbc-new sim/core/debuffs.go';

export const debuffs: readonly BuffDef[] = deepFreeze<BuffDef[]>([
  {
    id: 'raid-curse-of-the-elements',
    name: 'Curse of the Elements (another warlock)',
    icon: 'spell_shadow_chilltouch',
    wowheadId: 27228,
    group: 'debuff',
    description:
      "x1.10 arcane, fire, frost and shadow damage taken, from another warlock (unimproved: no Malediction; wowsims' improved option is x1.13). Not in your curse slot, so your own curse does not remove it; your own Curse of the Elements then adds nothing (one 10% effect in total).",
    // CurseOfElementsAura(target, -1, ranks 0): multiplier 1.10 + 0.01 x 0 on Arcane, Fire, Frost,
    // Shadow; exclusive effect "CurseOfElements" shared with the self curse (only the strongest
    // applies). Wowhead TBC spell=27228 "increasing Arcane, Fire, Frost, and Shadow damage taken
    // by 10%". The -88 resistances are not modelled (as for the own curse).
    source: `${DEBUFFS} CurseOfElementsAura (external, unimproved); https://www.wowhead.com/tbc/spell=27228`,
    effect: {
      targetAura: {
        id: 'raid-curse-of-the-elements',
        name: 'Curse of the Elements (raid)',
        icon: 'spell_shadow_chilltouch',
        wowheadId: 27228,
        durationMs: SCHEDULED_DEBUFF_DURATION_MS,
        damageTakenMult: { schools: ['arcane', 'fire', 'frost', 'shadow'], mult: 1.1 },
      },
    },
  },
  {
    id: 'misery',
    name: 'Misery',
    icon: 'spell_shadow_misery',
    wowheadId: 33195,
    group: 'debuff',
    description: 'x1.05 spell damage taken, every magic school (a shadow priest with Misery 5/5).',
    // MiseryAura(target, 5): 1 + 0.01 x 5 on Arcane, Fire, Frost, Holy, Nature, Shadow damage
    // taken, NeverExpires. Wowhead TBC spell=33195 "take an additional 5% spell damage".
    source: `${DEBUFFS} MiseryAura (5 ranks); https://www.wowhead.com/tbc/spell=33195`,
    effect: {
      targetAura: {
        id: 'misery',
        name: 'Misery',
        icon: 'spell_shadow_misery',
        wowheadId: 33195,
        durationMs: SCHEDULED_DEBUFF_DURATION_MS,
        damageTakenMult: { schools: ['arcane', 'fire', 'frost', 'holy', 'nature', 'shadow'], mult: 1.05 },
      },
    },
  },
  {
    id: 'shadow-weaving',
    name: 'Shadow Weaving',
    icon: 'spell_shadow_blackplague',
    wowheadId: 15334,
    group: 'debuff',
    description:
      'x1.10 shadow damage taken: 5 stacks x 2% (additive, as in wowsims), full from the pull. wowsims ramps it up one stack per 1.5 s over the first 6 s; the trainer does not.',
    // ShadowWeavingAura: 1.0 + 0.02 x stacks on Shadow damage taken (one multiplier, not 1.02^n),
    // MaxStacks 5; applyDebuffEffects adds a stack every 1.5 s from 0 (5 ticks) and makes it
    // permanent. Wowhead TBC spell=15334 "increases the Shadow damage dealt to your target by 2%
    // ... Stacks up to 5 times".
    source: `${DEBUFFS} ShadowWeavingAura (5 stacks); https://www.wowhead.com/tbc/spell=15334`,
    effect: {
      targetAura: {
        id: 'shadow-weaving',
        name: 'Shadow Weaving',
        icon: 'spell_shadow_blackplague',
        wowheadId: 15334,
        durationMs: SCHEDULED_DEBUFF_DURATION_MS,
        damageTakenMult: { schools: ['shadow'], mult: 1 + 0.02 * 5 },
      },
    },
  },
  {
    id: 'judgement-of-wisdom',
    name: 'Judgement of Wisdom',
    icon: 'spell_holy_righteousnessaura',
    wowheadId: 27164,
    group: 'debuff',
    description:
      "A paladin's judgement: each of your landed spells has a 50% chance to give you 74 mana (Life Tap and Curse of the Elements never proc it, as in wowsims). Author's log: 20 procs on 37 hits.",
    // JudgementOfWisdomAura: ProcChance 0.5, ProcMask Direct, on a landed spell, AddMana 74.0.
    // Wowhead TBC spell=27164 "(Proc chance: 50%)". Log checkpoint: 74 mana per proc.
    source: `${DEBUFFS} JudgementOfWisdomAura; https://www.wowhead.com/tbc/spell=27164; author's log`,
    effect: {
      targetAura: {
        id: 'judgement-of-wisdom',
        name: 'Judgement of Wisdom',
        icon: 'spell_holy_righteousnessaura',
        wowheadId: 27164,
        durationMs: SCHEDULED_DEBUFF_DURATION_MS,
      },
      hooks: {
        // Runs after every resolved spell (the engine never calls hooks for DoT ticks, matching
        // ProcMaskDirect). Rolls only while the debuff is on and only for a landed spell that
        // hits the target, so a setup without it keeps every random draw unchanged.
        onSpellResolved(e, api) {
          if (e.outcome === 'miss' || JOW_NO_PROC_SPELL_IDS.includes(e.spellId)) return;
          if (!api.hasTargetAura('judgement-of-wisdom')) return;
          if (api.roll() < JUDGEMENT_OF_WISDOM_PROC_CHANCE) api.addMana(JUDGEMENT_OF_WISDOM_MANA);
        },
      },
    },
  },
  {
    id: 'isb-from-others',
    name: 'Improved Shadow Bolt (other warlocks)',
    icon: 'spell_shadow_shadowbolt',
    wowheadId: 17800,
    group: 'debuff',
    description:
      "x1.2 shadow damage taken for the whole fight, kept up by other warlocks' Shadow Bolt crits (wowsims models an uptime percentage instead; the trainer assumes 100%). Your own Improved Shadow Bolt then adds nothing (one x1.2 in total).",
    // ImprovedShadowBoltAura(target, uptime, 5): 1 + 0.04 x 5 = 1.2 on Shadow damage taken
    // (SchoolDamageTakenMultiplier: DoT ticks too); with an uptime it has no charges. Same aura
    // label as the player's own, so the two never stack. Wowhead TBC spell=17800.
    source: `${DEBUFFS} ImprovedShadowBoltAura (5 points, 100% uptime); https://www.wowhead.com/tbc/spell=17800`,
    effect: {
      targetAura: {
        id: 'isb-from-others',
        name: 'Shadow Vulnerability (raid)',
        icon: 'spell_shadow_shadowbolt',
        wowheadId: 17800,
        durationMs: SCHEDULED_DEBUFF_DURATION_MS,
        // No charges: permanent; multiplies every shadow hit and tick (as the own aura does).
        damageTakenMult: { schools: ['shadow'], mult: 1.2 },
      },
    },
  },
]);

// ===========================================================================
// Timed cooldowns (stage 1.5 Task 8): a self aura the fight applies at a configurable second for
// a configurable duration (`timed`; applySetup schedules `effect.selfAura`, Task 9). The aura's
// own `durationMs` is the default duration. The player does not press them (spec §4.3: no
// automatic or manual use, a simulation of raid events). Item effects (Icon of the Silver
// Crescent, Band of the Eternal Sage) are in src/data/classes/warlock/buffs.ts: they belong to the
// warlock's equipped gear. See docs/data-sources.md, "Part C: cooldowns and item effects".
// ===========================================================================

export const cooldowns: readonly BuffDef[] = deepFreeze<BuffDef[]>([
  {
    id: 'heroism',
    name: 'Heroism / Bloodlust',
    icon: 'ability_shaman_heroism',
    wowheadId: 32182,
    group: 'raid',
    description:
      "+30% spell haste for 40 s, multiplied with the haste from rating (45 rating: x1.0285, so x1.337 in total: Shadow Bolt 2431 -> 1870 ms). Author's log: Heroism for 40 s, Shadow Bolt 1.86-1.89 s under it. Its 10 min cooldown (and Exhaustion) means once per fight.",
    // buffs.go BloodlustAura: Duration BloodlustDuration = 40 s, multiplyCastSpeedEffect(aura, 1.3)
    // (unit.go TotalSpellHasteMultiplier = CastSpeedMultiplier x (1 + rating haste), so it
    // multiplies the rating haste); BloodlustCD 10 min. Wowhead TBC spell=32182 "Increases melee,
    // ranged, and spell haste by 30% ... Lasts 40 sec." (Bloodlust 2825: the same).
    source: `${BUFFS} BloodlustAura / registerBloodlustCD; https://www.wowhead.com/tbc/spell=32182; author's log`,
    effect: {
      selfAura: {
        id: 'heroism',
        name: 'Heroism',
        icon: 'ability_shaman_heroism',
        wowheadId: 32182,
        durationMs: 40000,
        selfStatMultipliers: { haste: 1.3 },
      },
    },
    timed: { defaultStartSec: 0, durationSec: 40 },
  },
  {
    id: 'destruction-potion',
    name: 'Destruction Potion',
    icon: 'inv_potion_107',
    wowheadId: 28508,
    group: 'consumable',
    exclusiveGroup: 'potion',
    description:
      "+120 spell power and +2% spell crit for 15 s (author's log: 15 s). Potions share a 2 min cooldown, so once per fight.",
    // db.json consumable 22839 (Potion): SpellDamage 120, SpellCritRating 44.153846 (= 2 x
    // CRIT_RATING_PER_PCT 22.076923: exactly 2%), buffDuration 15, categoryCooldownDuration 120;
    // consumes.go makePotionActivationSpellInternal -> NewTemporaryStatsAura(stats, BuffDuration).
    // Wowhead TBC spell=28508 / item=22839 "Increases spell critical chance by 2% and spell damage
    // by 120 for 15 sec. (2 Min Cooldown)".
    source: `${CONSUMES} (item 22839), makePotionActivationSpellInternal; https://www.wowhead.com/tbc/item=22839; author's log`,
    effect: {
      selfAura: {
        id: 'destruction-potion',
        name: 'Destruction Potion',
        icon: 'inv_potion_107',
        wowheadId: 28508,
        durationMs: 15000,
        selfStatBonuses: { spellPower: 120 },
        // A percentage, so a modifier on every spell (as Moonkin Aura): the same +2.000% as
        // wowsims' 44.153846 rating.
        selfModifiers: [{ critPctDelta: 2 }],
      },
    },
    timed: { defaultStartSec: 0, durationSec: 15 },
  },
]);
