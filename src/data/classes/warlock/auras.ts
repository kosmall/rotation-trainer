import type { AuraDef } from '../../../engine/types';

// Warlock target auras. DoT totals are tick value x number of ticks; coeffTotal is the per-tick
// coefficient x number of ticks (the engine divides both evenly over floor(duration / interval)
// ticks, so every duration below is an exact multiple of its interval).
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a,
// sim/warlock/spell_data_auto_gen.go (`Periodic: {Tick, Coef, TickLength, NumberOfTicks}`).
// See docs/data-sources.md, section "Task 12a".
//
// Curses: in the game a warlock keeps one curse per target (casting another curse replaces the
// current one), so the three curses share the exclusive group 'curse' (ruling R22): applying one
// removes whichever other curse is on the target.

export const warlockAuras: AuraDef[] = [
  {
    // Immolate rank 9 (27215) Periodic: Tick 123, Coef 0.13 (0.1299999952), TickLength 3000 ms,
    // NumberOfTicks 5 -> 615 over 15 s, coefficient 0.65.
    id: 'immolate',
    name: 'Immolate',
    icon: 'spell_fire_immolation',
    wowheadId: 27215,
    durationMs: 15000,
    tick: { intervalMs: 3000, total: 615, coeffTotal: 0.65, school: 'fire' },
  },
  {
    // Corruption rank 8 (27216) Periodic: Tick 150, Coef 0.156 (0.1560000032), TickLength 3000 ms,
    // NumberOfTicks 6 -> 900 over 18 s, coefficient 0.936.
    id: 'corruption',
    name: 'Corruption',
    icon: 'spell_shadow_abominationexplosion',
    wowheadId: 27216,
    durationMs: 18000,
    tick: { intervalMs: 3000, total: 900, coeffTotal: 0.936, school: 'shadow' },
  },
  {
    // Curse of Agony rank 7 (27218) Periodic: Tick 113, Coef 0.1 (0.1000000015), TickLength 2000 ms,
    // NumberOfTicks 12 -> 1356 over 24 s, coefficient 1.2. Even ticks as in wowsims agony.go
    // (the in-game ramp from weak to strong ticks is not modeled there either).
    id: 'curse-of-agony',
    name: 'Curse of Agony',
    icon: 'spell_shadow_curseofsargeras',
    wowheadId: 27218,
    durationMs: 24000,
    exclusiveGroup: 'curse',
    tick: { intervalMs: 2000, total: 1356, coeffTotal: 1.2, school: 'shadow' },
  },
  {
    // Curse of Doom rank 2 (30910) Periodic: Tick 4200, Coef 2, TickLength 60000 ms,
    // NumberOfTicks 1 -> one 4200 + 2.0 x power tick when the 1-minute curse ends.
    id: 'curse-of-doom',
    name: 'Curse of Doom',
    icon: 'spell_shadow_auraofdarkness',
    wowheadId: 30910,
    durationMs: 60000,
    exclusiveGroup: 'curse',
    tick: { intervalMs: 60000, total: 4200, coeffTotal: 2, school: 'shadow' },
  },
  {
    // sim/core/debuffs.go CurseOfElementsAura(target, 1, Malediction 0): multiplier
    // 1.10 + 0.01 x Malediction on arcane, fire, frost and shadow damage taken, 5 minutes.
    // Not modeled: its -88 resistances (the engine uses a fixed level-based resist multiplier).
    id: 'curse-of-the-elements',
    name: 'Curse of the Elements',
    icon: 'spell_shadow_chilltouch',
    wowheadId: 27228,
    durationMs: 300000,
    exclusiveGroup: 'curse',
    damageTakenMult: { schools: ['arcane', 'fire', 'frost', 'shadow'], mult: 1.1 },
  },
  {
    // Improved Shadow Bolt 5/5 debuff, sim/core/debuffs.go ImprovedShadowBoltAura (points 5):
    // shadow damage taken x (1 + 0.04 x 5) = 1.2, Duration 12 s, MaxStacks 4; a stack is removed
    // by OnSpellHitTaken (landed shadow spell damage), never by periodic ticks, which are still
    // multiplied (SchoolDamageTakenMultiplier). Wowhead TBC spell=17800 (Shadow Vulnerability):
    // 12 sec, +20% shadow damage taken; warcraft.wiki.gg "Improved Shadow Bolt (Classic)": "until
    // 4 non-periodic damage sources are applied". Applied by the spec hook on a Shadow Bolt crit.
    id: 'shadow-vulnerability',
    name: 'Shadow Vulnerability',
    icon: 'spell_shadow_shadowbolt',
    wowheadId: 17800,
    durationMs: 12000,
    charges: 4,
    damageTakenMult: { schools: ['shadow'], mult: 1.2, consumeChargeOnHit: true, directOnly: true },
  },
];
