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

/** Freezes a buff and everything inside it (catalog entries are shared, never mutated). */
function deepFreeze<T>(value: T): T {
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
      '+121 spell power: improved rank (101 + 20 from Improved Wrath of Air Totem, a shaman item bonus, Wowhead spell 37212; unimproved 101).',
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
