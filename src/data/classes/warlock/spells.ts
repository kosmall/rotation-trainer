import type { SpellDef } from '../../../engine/types';

// Warlock spells, highest rank a level 70 character can train in TBC Classic Anniversary.
// Unmodified base values: talents live in destruction.ts as modifiers.
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a,
// sim/warlock/spell_data_auto_gen.go (`spellData.<Spell>` row named in each comment), and the
// matching sim/warlock/<spell>.go registration for flags such as canCrit and the GCD.
// See docs/data-sources.md, section "Task 12a".
// Icons are Wowhead icon file names (cosmetic; UNVERIFIED, the UI falls back to initials).
// Missile travel: `missileSpeed` (yd/s) is the spell data row's MissileSpeed; spells whose row has
// none (Immolate, Corruption, the curses, Conflagrate, Shadowburn, Life Tap) land at cast end.
// Not modeled: Soul Shard costs, Life Tap's health cost, partial resists differing per spell
// (Shadowburn is a binary spell).

/**
 * wowsims tbc-new sim/warlock/warlock.go `WarlockDestructionSpells`, restricted to the spells
 * defined below: the spells Cataclysm, Devastation and Ruin modify (destruction.ts) and the
 * meta gem's Ruin interaction applies to (items.ts).
 */
export const DESTRUCTION_SPELL_IDS: readonly string[] = [
  'shadow-bolt',
  'immolate',
  'incinerate',
  'conflagrate',
  'shadowburn',
];

export const warlockSpells: SpellDef[] = [
  {
    // ShadowBolt rank 11, SpellID 27209: Cost 420, CastTime 3000 ms, Direct 544-607, Coef 0.857
    // (0.8569999933), MissileSpeed 20. shadowbolt.go: OutcomeMagicHitAndCrit, damage dealt after
    // spell.WaitTravelTime. Author's log checkpoint: lands ~1.39 s after the cast at 28 yd.
    id: 'shadow-bolt',
    name: 'Shadow Bolt',
    icon: 'spell_shadow_shadowbolt',
    wowheadId: 27209,
    school: 'shadow',
    manaCost: 420,
    castTimeMs: 3000,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: true,
    direct: { min: 544, max: 607, coeff: 0.857 },
    missileSpeed: 20,
  },
  {
    // Immolate rank 9, SpellID 27215: Cost 445, CastTime 2000 ms, Direct 331-332, Coef 0.2.
    // immolate.go: direct part rolls hit and crit; the DoT (auras.ts) is applied when it lands.
    id: 'immolate',
    name: 'Immolate',
    icon: 'spell_fire_immolation',
    wowheadId: 27215,
    school: 'fire',
    manaCost: 445,
    castTimeMs: 2000,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: true,
    direct: { min: 331, max: 332, coeff: 0.2 },
    applyAura: { auraId: 'immolate', on: 'target' },
  },
  {
    // Corruption rank 8, SpellID 27216: Cost 370, CastTime 2000 ms (no Improved Corruption in
    // this build). corruption.go: OutcomeMagicHit only (no direct damage, cannot crit).
    id: 'corruption',
    name: 'Corruption',
    icon: 'spell_shadow_abominationexplosion',
    wowheadId: 27216,
    school: 'shadow',
    manaCost: 370,
    castTimeMs: 2000,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: false,
    applyAura: { auraId: 'corruption', on: 'target' },
  },
  {
    // CurseOfAgony rank 7, SpellID 27218: Cost 265, instant (GCD 1500 ms). agony.go: OutcomeMagicHit.
    id: 'curse-of-agony',
    name: 'Curse of Agony',
    icon: 'spell_shadow_curseofsargeras',
    wowheadId: 27218,
    school: 'shadow',
    manaCost: 265,
    castTimeMs: 0,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: false,
    applyAura: { auraId: 'curse-of-agony', on: 'target' },
  },
  {
    // CurseOfDoom rank 2, SpellID 30910: Cost 380, instant, Cooldown 60000 ms. doom.go: OutcomeMagicHit.
    id: 'curse-of-doom',
    name: 'Curse of Doom',
    icon: 'spell_shadow_auraofdarkness',
    wowheadId: 30910,
    school: 'shadow',
    manaCost: 380,
    castTimeMs: 0,
    cooldownMs: 60000,
    onGcd: true,
    canMiss: true,
    canCrit: false,
    applyAura: { auraId: 'curse-of-doom', on: 'target' },
  },
  {
    // CurseOfTheElements rank 4, SpellID 27228: Cost 260, instant. curse_of_elements.go: OutcomeMagicHit.
    id: 'curse-of-the-elements',
    name: 'Curse of the Elements',
    icon: 'spell_shadow_chilltouch',
    wowheadId: 27228,
    school: 'shadow',
    manaCost: 260,
    castTimeMs: 0,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: false,
    applyAura: { auraId: 'curse-of-the-elements', on: 'target' },
  },
  {
    // Conflagrate rank 6, SpellID 30912: Cost 305, instant, Cooldown 10000 ms, Direct 579-721,
    // Coef 0.429 (0.4289999902). conflagrate.go: ExtraCastCondition = Immolate DoT active;
    // a landed hit deactivates the Immolate DoT. Talent spell: NOT in the author's build.
    id: 'conflagrate',
    name: 'Conflagrate',
    icon: 'spell_fire_fireball',
    wowheadId: 30912,
    school: 'fire',
    manaCost: 305,
    castTimeMs: 0,
    cooldownMs: 10000,
    onGcd: true,
    canMiss: true,
    canCrit: true,
    direct: { min: 579, max: 721, coeff: 0.429 },
    requiresTargetAura: 'immolate',
    consumesTargetAura: 'immolate',
  },
  {
    // Shadowburn rank 8, SpellID 30546: Cost 515, instant, Cooldown 15000 ms, Direct 597-665,
    // Coef 0.429. shadowburn.go. The Soul Shard cost is not modeled.
    id: 'shadowburn',
    name: 'Shadowburn',
    icon: 'spell_shadow_scourgebuild',
    wowheadId: 30546,
    school: 'shadow',
    manaCost: 515,
    castTimeMs: 0,
    cooldownMs: 15000,
    onGcd: true,
    canMiss: true,
    canCrit: true,
    direct: { min: 597, max: 665, coeff: 0.429 },
  },
  {
    // Incinerate rank 2, SpellID 32231: Cost 355, CastTime 2500 ms, Direct 444-514, Coef 0.714
    // (0.7139999866), MissileSpeed 24 (rank 1, 29722, has 20; incinerate.go reads the rank's
    // value and deals damage after spell.WaitTravelTime). Not modeled: incinerate.go adds sim.Roll(111, 128) base damage while
    // Immolate is on the target (no conditional damage in SpellDef yet).
    id: 'incinerate',
    name: 'Incinerate',
    icon: 'spell_fire_burnout',
    wowheadId: 32231,
    school: 'fire',
    manaCost: 355,
    castTimeMs: 2500,
    cooldownMs: 0,
    onGcd: true,
    canMiss: true,
    canCrit: true,
    direct: { min: 444, max: 514, coeff: 0.714 },
    missileSpeed: 24,
  },
  {
    // LifeTap rank 7, SpellID 27222: no mana cost, GCD 1500 ms, effect value 582.
    // lifetap.go: restore = 582 (x Improved Life Tap, 0 points here) + 0.8 * spell damage;
    // costs 582 health (not modeled). Never misses or crits.
    id: 'life-tap',
    name: 'Life Tap',
    icon: 'spell_shadow_burningspirit',
    wowheadId: 27222,
    school: 'shadow',
    manaCost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    onGcd: true,
    canMiss: false,
    canCrit: false,
    gainMana: { amount: 582, coeff: 0.8 },
  },
];
