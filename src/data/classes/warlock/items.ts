import type { EnchantDef, GemDef, ItemDef } from '../../../engine/types';
import { DESTRUCTION_SPELL_IDS } from './spells';

// Stage 1 item tables: exactly the items, gems and enchants of the author's WowSimsExporter export
// (docs/samples/wowsimsexporter-destruction-warlock.json). Stage 2a replaces them with the full
// item database.
//
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a, assets/database/db.json
// (`items[]`, `gems[]`, `enchants[]` by `effectId`), cross-checked against github.com/wowsims/tbc
// master @ 3301fca sim/core/items/all_items.go / all_gems.go / all_enchants.go (identical values;
// Riding Crop is only in tbc-new). db.json stat indexes are proto/common.proto `Stat`:
// 3 Intellect -> intellect, 5 SpellDamage -> spellPower, 7 FireDamage -> firePower,
// 11 ShadowDamage -> shadowPower, 12 SpellHitRating, 13 SpellCritRating, 14 SpellHasteRating,
// 16 Spirit, 35 MP5. Stats the engine does not model are left out: stamina (2), healing (4,
// always equal to spell damage on these items), armor (31), strength/agility, weapon damage.
// Socket colors: `gemSockets` 1 meta, 2 red, 3 blue, 4 yellow; gem `color` 1 meta, 2 red,
// 4 yellow, 6 orange, 7 purple. See docs/data-sources.md, section "Task 12b".

export const items: Record<number, ItemDef> = {
  // Hood of the Malefic: Int 36, SD 63, Hit 16, Crit 32; meta + yellow, bonus +5 SD; T6 set 670.
  31051: {
    id: 31051,
    name: 'Hood of the Malefic',
    slot: 'head',
    stats: { intellect: 36, spellPower: 63, hitRating: 16, critRating: 32 },
    setId: 'malefic-raiment',
    sockets: ['meta', 'yellow'],
    socketBonus: { spellPower: 5 },
  },
  // Translucent Spellthread Necklace: SD 46, Hit 15, Crit 24.
  32349: {
    id: 32349,
    name: 'Translucent Spellthread Necklace',
    slot: 'neck',
    stats: { spellPower: 46, hitRating: 15, critRating: 24 },
  },
  // Mantle of the Malefic: Int 22, SD 46, Hit 21, Crit 13; blue + yellow, bonus +4 SD; set 670.
  31054: {
    id: 31054,
    name: 'Mantle of the Malefic',
    slot: 'shoulder',
    stats: { intellect: 22, spellPower: 46, hitRating: 21, critRating: 13 },
    setId: 'malefic-raiment',
    sockets: ['blue', 'yellow'],
    socketBonus: { spellPower: 4 },
  },
  // Nethervoid Cloak: Int 18, Shadow Damage 53, Hit 18.
  32590: {
    id: 32590,
    name: 'Nethervoid Cloak',
    slot: 'back',
    stats: { intellect: 18, shadowPower: 53, hitRating: 18 },
  },
  // Robes of Rhonin: Int 38, SD 81, Hit 27, Crit 24.
  30913: {
    id: 30913,
    name: 'Robes of Rhonin',
    slot: 'chest',
    stats: { intellect: 38, spellPower: 81, hitRating: 27, critRating: 24 },
  },
  // Bracers of Nimble Thought: Int 20, SD 34, Haste 28.
  32586: {
    id: 32586,
    name: 'Bracers of Nimble Thought',
    slot: 'wrist',
    stats: { intellect: 20, spellPower: 34, hasteRating: 28 },
  },
  // Gloves of the Malefic: Int 27, SD 46, Hit 11, Crit 19; yellow, bonus +2 Hit; set 670.
  31050: {
    id: 31050,
    name: 'Gloves of the Malefic',
    slot: 'hands',
    stats: { intellect: 27, spellPower: 46, hitRating: 11, critRating: 19 },
    setId: 'malefic-raiment',
    sockets: ['yellow'],
    socketBonus: { hitRating: 2 },
  },
  // Belt of Blasting: SD 50, Hit 23, Crit 30; blue + yellow, bonus +4 SD.
  30038: {
    id: 30038,
    name: 'Belt of Blasting',
    slot: 'waist',
    stats: { spellPower: 50, hitRating: 23, critRating: 30 },
    sockets: ['blue', 'yellow'],
    socketBonus: { spellPower: 4 },
  },
  // Leggings of the Malefic: Int 44, SD 62, Hit 19, Crit 37; yellow, bonus +2 Hit; set 670.
  31053: {
    id: 31053,
    name: 'Leggings of the Malefic',
    slot: 'legs',
    stats: { intellect: 44, spellPower: 62, hitRating: 19, critRating: 37 },
    setId: 'malefic-raiment',
    sockets: ['yellow'],
    socketBonus: { hitRating: 2 },
  },
  // Boots of Foretelling: Int 23, SD 26, Crit 19; red + yellow, bonus +3 Int.
  28517: {
    id: 28517,
    name: 'Boots of Foretelling',
    slot: 'feet',
    stats: { intellect: 23, spellPower: 26, critRating: 19 },
    sockets: ['red', 'yellow'],
    socketBonus: { intellect: 3 },
  },
  // Band of the Eternal Sage: Int 25, SD 34, Crit 24. The 95 SD proc is a setup buff (warlockItemBuffs 'band-of-the-eternal-sage'), off unless enabled.
  29305: {
    id: 29305,
    name: 'Band of the Eternal Sage',
    slot: 'finger',
    stats: { intellect: 25, spellPower: 34, critRating: 24 },
  },
  // Ring of Captured Storms: SD 42, Hit 19, Crit 29.
  32247: {
    id: 32247,
    name: 'Ring of Captured Storms',
    slot: 'finger',
    stats: { spellPower: 42, hitRating: 19, critRating: 29 },
  },
  // Riding Crop: no stats; its only effect is "Mount Speed" (48776), irrelevant in combat
  // (tbc-new sim/common/tbc/stat_bonus_procs_auto_gen.go: "Not simulated").
  25653: {
    id: 25653,
    name: 'Riding Crop',
    slot: 'trinket',
    stats: {},
  },
  // Icon of the Silver Crescent: SD 43. The on-use +155 SD for 20 s is a setup entry (warlockItemBuffs 'icon-of-the-silver-crescent'): when enabled, an item action on the item bar, used by the player.
  29370: {
    id: 29370,
    name: 'Icon of the Silver Crescent',
    slot: 'trinket',
    stats: { spellPower: 43 },
  },
  // The Maelstrom's Fury (main-hand dagger, handType 1): Int 21, SD 236, Crit 22.
  32237: {
    id: 32237,
    name: "The Maelstrom's Fury",
    slot: 'mainHand',
    stats: { intellect: 21, spellPower: 236, critRating: 22 },
  },
  // Fetish of the Primal Gods (off-hand, handType 3): Int 17, SD 37, Haste 17.
  33334: {
    id: 33334,
    name: 'Fetish of the Primal Gods',
    slot: 'offHand',
    stats: { intellect: 17, spellPower: 37, hasteRating: 17 },
  },
  // Wand of the Forgotten Star: SD 23, Hit 11, Crit 14 (wand attacks are not simulated).
  29982: {
    id: 29982,
    name: 'Wand of the Forgotten Star',
    slot: 'ranged',
    stats: { spellPower: 23, hitRating: 11, critRating: 14 },
  },
};

/**
 * Chaotic Skyfire Diamond: "+12 Spell Critical & 3% Increased Critical Damage"
 * (tbc-new sim/common/tbc/metagems.go -> core.ApplyMetaGemCriticalDamageEffect:
 * PseudoStats.CritDamageMultiplier *= 1.03). Requirement: at least 2 blue gems
 * (tbc-new sim/core/reforge_optimizer/meta_gem_constraints.go `34220: {minBlue: 2}`).
 *
 * wowsims crit multiplier (sim/core/spell.go CritDamageMultiplier):
 *   (1.5 x CritDamageMultiplier - 1) x (CritMultiplierAdditive + 1) + 1
 * The engine sums `critMultDelta` onto 1.5, and Ruin is encoded as +0.5 (destruction.ts).
 * - Spells without Ruin: 1.5 x 1.03 = 1.545 -> +0.045.
 * - Destruction spells with Ruin (additive 1.0): (1.545 - 1) x 2 + 1 = 2.09; Ruin alone gives
 *   2.0, so the meta adds +0.09 there: +0.045 (every spell) + 0.045 (Ruin's doubling of the
 *   meta's part) on the Destruction spells.
 * The second term assumes Ruin 1/1, true for the fixed stage 1 build (destruction.ts); the
 * stage 2b talent editor must make it conditional.
 */
const chaoticSkyfireModifiers = [
  { critMultDelta: 0.045 },
  { spellIds: [...DESTRUCTION_SPELL_IDS], critMultDelta: 0.045 },
];

export const gems: Record<number, GemDef> = {
  34220: {
    id: 34220,
    name: 'Chaotic Skyfire Diamond',
    color: 'meta',
    stats: { critRating: 12 },
    metaRequires: { blue: 2 },
    metaModifiers: chaoticSkyfireModifiers,
  },
  // Potent Pyrestone (orange): SD 6, Crit 5.
  32218: { id: 32218, name: 'Potent Pyrestone', color: 'orange', stats: { spellPower: 6, critRating: 5 } },
  // Glowing Shadowsong Amethyst (purple): SD 6 (+7 stamina, not modeled).
  32215: { id: 32215, name: 'Glowing Shadowsong Amethyst', color: 'purple', stats: { spellPower: 6 } },
  // Runed Crimson Spinel (red): SD 12.
  32196: { id: 32196, name: 'Runed Crimson Spinel', color: 'red', stats: { spellPower: 12 } },
  // Glowing Nightseye (purple): SD 5 (+6 stamina, not modeled).
  24056: { id: 24056, name: 'Glowing Nightseye', color: 'purple', stats: { spellPower: 5 } },
  // Gleaming Lionseye (yellow): Crit 10.
  32207: { id: 32207, name: 'Gleaming Lionseye', color: 'yellow', stats: { critRating: 10 } },
  // Potent Ornate Topaz (orange): SD 6, Crit 5.
  28123: { id: 28123, name: 'Potent Ornate Topaz', color: 'orange', stats: { spellPower: 6, critRating: 5 } },
  // Runed Ornate Ruby (red): SD 12.
  28118: { id: 28118, name: 'Runed Ornate Ruby', color: 'red', stats: { spellPower: 12 } },
  // Don Julio's Heart (red, Jewelcrafting only): SD 14.
  33133: { id: 33133, name: "Don Julio's Heart", color: 'red', stats: { spellPower: 14 } },
};

/** Keyed by the enchant effect id (the export's `enchant`; db.json `effectId`). */
export const enchants: Record<number, EnchantDef> = {
  // Glyph of Power (head): SD 22, Hit 14.
  3002: { id: 3002, name: 'Glyph of Power', stats: { spellPower: 22, hitRating: 14 } },
  // Greater Inscription of the Orb (shoulder): SD 12, Crit 15.
  2995: { id: 2995, name: 'Greater Inscription of the Orb', stats: { spellPower: 12, critRating: 15 } },
  // Enchant Cloak - Subtlety: no stats (threat reduction, not modeled).
  2621: { id: 2621, name: 'Enchant Cloak - Subtlety', stats: {} },
  // Enchant Chest - Exceptional Stats: +6 to all stats; Int and Spirit modeled.
  2661: { id: 2661, name: 'Enchant Chest - Exceptional Stats', stats: { intellect: 6, spirit: 6 } },
  // Enchant Bracer - Spellpower: SD 15.
  2650: { id: 2650, name: 'Enchant Bracer - Spellpower', stats: { spellPower: 15 } },
  // Enchant Gloves - Major Spellpower: SD 20.
  2937: { id: 2937, name: 'Enchant Gloves - Major Spellpower', stats: { spellPower: 20 } },
  // Runic Spellthread (legs): SD 35 (+20 stamina, not modeled).
  2748: { id: 2748, name: 'Runic Spellthread', stats: { spellPower: 35 } },
  // Fortitude (+12 stamina; db.json lists a bracer and a boots item for effect 2649; the export
  // puts it on the boots): no modeled stat.
  2649: { id: 2649, name: 'Enchant Boots - Fortitude', stats: {} },
  // Enchant Ring - Spellpower (Enchanting only): SD 12.
  2928: { id: 2928, name: 'Enchant Ring - Spellpower', stats: { spellPower: 12 } },
  // Enchant Weapon - Major Spellpower: SD 40.
  2669: { id: 2669, name: 'Enchant Weapon - Major Spellpower', stats: { spellPower: 40 } },
};
