// Deterministic spec and target for engine tests. Not game data: numbers are chosen for easy math.

import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT, HASTE_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import type { AuraDef, SpecHooks, SpellDef, TargetData } from '../../src/engine/types';

/** Never misses, no partial resists, no armor. */
export const TEST_TARGET: TargetData = { missPct: 0, minMissPct: 0, levelResistMult: 1, armor: 0 };

const icon = 'test';

/** A free, instant, off-GCD self buff that never misses or crits (no Rng draws): applies `auraId`. */
function selfBuff(id: string, auraId: string): SpellDef {
  return {
    id,
    name: id,
    icon,
    school: 'shadow',
    manaCost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    onGcd: false,
    canMiss: false,
    canCrit: false,
    applyAura: { auraId, on: 'self' },
  };
}

function testSpells(): SpellDef[] {
  return [
    {
      id: 'bolt',
      name: 'Bolt',
      icon,
      school: 'shadow',
      manaCost: 50,
      castTimeMs: 2000,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: true,
      direct: { min: 100, max: 100, coeff: 0 },
    },
    {
      id: 'zap',
      name: 'Zap',
      icon,
      school: 'shadow',
      manaCost: 20,
      castTimeMs: 0,
      cooldownMs: 8000,
      onGcd: true,
      canMiss: true,
      canCrit: true,
      direct: { min: 50, max: 50, coeff: 0 },
    },
    {
      id: 'free',
      name: 'Free',
      icon,
      school: 'shadow',
      manaCost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: false,
      canMiss: false,
      canCrit: false,
    },
    {
      // Pure DoT: no direct damage; a hit applies dotAura (3 ticks of 100).
      id: 'dot',
      name: 'Dot',
      icon,
      school: 'shadow',
      manaCost: 30,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: false,
      applyAura: { auraId: 'dotAura', on: 'target' },
    },
    {
      // Needs dotAura on the target and consumes it on a hit (Conflagrate-like).
      id: 'needy',
      name: 'Needy',
      icon,
      school: 'shadow',
      manaCost: 10,
      castTimeMs: 0,
      cooldownMs: 10000,
      onGcd: true,
      canMiss: true,
      canCrit: true,
      direct: { min: 10, max: 10, coeff: 0 },
      requiresTargetAura: 'dotAura',
      consumesTargetAura: 'dotAura',
    },
    {
      // Applies weak: the target takes 20% more shadow damage for 10 s.
      id: 'curse',
      name: 'Curse',
      icon,
      school: 'shadow',
      manaCost: 20,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: false,
      applyAura: { auraId: 'weak', on: 'target' },
    },
    {
      id: 'scorch',
      name: 'Scorch',
      icon,
      school: 'fire',
      manaCost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: true,
      direct: { min: 100, max: 100, coeff: 0 },
    },
    {
      // Life Tap-like: free, on the GCD, gives 300 mana at completion (capped at maxMana).
      id: 'tap',
      name: 'Tap',
      icon,
      school: 'shadow',
      manaCost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: true,
      canMiss: false,
      canCrit: false,
      gainMana: { amount: 300, coeff: 0 },
    },
    // Self buffs (Task 17): each applies the self aura of the same name.
    selfBuff('pump', 'pumped'),
    selfBuff('hasteUp', 'hasteUp'),
    selfBuff('dmgUp', 'dmgUp'),
    {
      // Deals exactly its school's spell power (0 in the fixture): shows the current power.
      id: 'scaled',
      name: 'Scaled',
      icon,
      school: 'shadow',
      manaCost: 0,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: false,
      canMiss: false,
      canCrit: false,
      direct: { min: 0, max: 0, coeff: 1 },
    },
    {
      // Shadow Bolt-like missile: lands 1400 ms after cast end at 28 yd (no travel at distance 0).
      id: 'lob',
      name: 'Lob',
      icon,
      school: 'shadow',
      manaCost: 0,
      castTimeMs: 1000,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: true,
      direct: { min: 100, max: 100, coeff: 0 },
      missileSpeed: 20,
    },
    {
      // `dot` with a missile: dotAura is applied when the missile lands.
      id: 'slowdot',
      name: 'Slow Dot',
      icon,
      school: 'shadow',
      manaCost: 30,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: true,
      canMiss: true,
      canCrit: false,
      applyAura: { auraId: 'dotAura', on: 'target' },
      missileSpeed: 20,
    },
  ];
}

function testAuras(): AuraDef[] {
  return [
    {
      id: 'dotAura',
      name: 'Dot',
      icon,
      durationMs: 6000,
      tick: { intervalMs: 2000, total: 300, coeffTotal: 0, school: 'shadow' },
    },
    {
      id: 'weak',
      name: 'Weak',
      icon,
      durationMs: 10000,
      damageTakenMult: { schools: ['shadow'], mult: 1.2 },
    },
    {
      // Improved Shadow Bolt-like: the next 2 shadow damage instances (hits or ticks) are ×1.2.
      id: 'procAura',
      name: 'Proc',
      icon,
      durationMs: 12000,
      charges: 2,
      damageTakenMult: { schools: ['shadow'], mult: 1.2, consumeChargeOnHit: true },
    },
    { id: 'pumped', name: 'Pumped', icon, durationMs: 10000, selfStatBonuses: { spellPower: 100 } },
    {
      id: 'hasteUp',
      name: 'Haste Up',
      icon,
      durationMs: 10000,
      selfStatBonuses: { hasteRating: HASTE_RATING_PER_PCT * 10 },
    },
    {
      id: 'dmgUp',
      name: 'Damage Up',
      icon,
      durationMs: 10000,
      selfModifiers: [{ schools: ['shadow'], damageMult: 1.5 }],
    },
    // Hidden internal-cooldown marker: no effect of its own, only checked by hooks (hasSelfAura).
    { id: 'icd', name: 'Internal Cooldown', icon, durationMs: 5000 },
  ];
}

/**
 * Spec hooks that apply `procAura` to the target whenever `bolt` crits. Not in the default
 * fixture (its hooks are `{}`); pass it with `makeTestSpec({ hooks: boltCritProcHooks() })`.
 */
export function boltCritProcHooks(): SpecHooks {
  return {
    onSpellResolved(e, api) {
      if (e.spellId === 'bolt' && e.outcome === 'crit') api.applyTargetAura('procAura');
    },
  };
}

/**
 * Set-bonus style hooks: every resolved spell procs `pumped` (roll() < 1 always passes) unless
 * the internal-cooldown aura `icd` is up; a proc also applies `icd` (5000 ms). Not in the
 * default fixture.
 */
export function pumpProcHooks(): SpecHooks {
  return {
    onSpellResolved(_e, api) {
      if (api.hasSelfAura('icd')) return;
      if (api.roll() < 1) {
        api.applySelfAura('pumped');
        api.applySelfAura('icd');
      }
    },
  };
}

/** An item action (`item: true`): free, instant, off the GCD, never misses or crits. */
function itemAction(id: string, patch: Partial<SpellDef>): SpellDef {
  return {
    id,
    name: id,
    icon,
    school: 'physical',
    manaCost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    onGcd: false,
    canMiss: false,
    canCrit: false,
    item: true,
    ...patch,
  };
}

/**
 * Item actions (not in the default fixture; see `makeItemTestSpec`):
 * - `trinketA`: 120 s own cooldown, 20 s `trinket` group, applies `trinketBuff` (+100 spell power, 20 s);
 * - `trinketB`: 60 s own cooldown, 20 s `trinket` group, applies `trinketBuffB` (+50 spell power, 15 s);
 * - `manaPot`: `potion` group 120 s, gives 100-400 mana (one Rng draw);
 * - `burstPot`: `potion` group 120 s, applies `potionBuff` (+40 spell power, 15 s);
 * plus `sink`, a normal spell (not an item) that costs 600 mana, instant, off the GCD, no Rng draw.
 */
export function itemSpells(): SpellDef[] {
  return [
    itemAction('trinketA', {
      cooldownMs: 120000,
      sharedCooldown: { group: 'trinket', ms: 20000 },
      applyAura: { auraId: 'trinketBuff', on: 'self' },
    }),
    itemAction('trinketB', {
      cooldownMs: 60000,
      sharedCooldown: { group: 'trinket', ms: 20000 },
      applyAura: { auraId: 'trinketBuffB', on: 'self' },
    }),
    itemAction('manaPot', { sharedCooldown: { group: 'potion', ms: 120000 }, gainManaRange: { min: 100, max: 400 } }),
    itemAction('burstPot', {
      sharedCooldown: { group: 'potion', ms: 120000 },
      applyAura: { auraId: 'potionBuff', on: 'self' },
    }),
    {
      id: 'sink',
      name: 'Sink',
      icon,
      school: 'shadow',
      manaCost: 600,
      castTimeMs: 0,
      cooldownMs: 0,
      onGcd: false,
      canMiss: false,
      canCrit: false,
    },
  ];
}

/** The self auras the item fixture actions apply. */
export function itemAuras(): AuraDef[] {
  return [
    { id: 'trinketBuff', name: 'Trinket Buff', icon, durationMs: 20000, selfStatBonuses: { spellPower: 100 } },
    { id: 'trinketBuffB', name: 'Trinket Buff B', icon, durationMs: 15000, selfStatBonuses: { spellPower: 50 } },
    { id: 'potionBuff', name: 'Potion Buff', icon, durationMs: 15000, selfStatBonuses: { spellPower: 40 } },
  ];
}

/** The default fixture plus the item actions and their auras (`overrides` as in `makeTestSpec`). */
export function makeItemTestSpec(overrides: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    spells: [...base.spells, ...itemSpells()],
    auras: [...base.auras, ...itemAuras()],
    ...overrides,
  });
}

/**
 * A complete SpecData with deterministic spells. Every field can be replaced via `overrides`
 * (shallow: an overridden field replaces the default entirely). Each call returns fresh objects.
 */
export function makeTestSpec(overrides: Partial<SpecData> = {}): SpecData {
  return {
    id: 'test',
    name: 'Test Spec',
    spells: testSpells(),
    auras: testAuras(),
    modifiers: [],
    statBonuses: {},
    sets: [
      {
        setId: 'test-set',
        name: 'Test Set 2',
        pieces: 2,
        description: 'Zap deals 10% more damage.',
        modifiers: [{ spellIds: ['zap'], damageMult: 1.1 }],
      },
      {
        setId: 'test-set',
        name: 'Test Set 4',
        pieces: 4,
        description: 'Bolt deals 50% more damage.',
        modifiers: [{ spellIds: ['bolt'], damageMult: 1.5 }],
      },
    ],
    setup: {
      stats: {
        intellect: 0,
        spirit: 0,
        spellPower: 0,
        shadowPower: 0,
        firePower: 0,
        // Cancels the class base crit (BASE_CRIT_PCT) so the fixture's crit chance is 0:
        // "critRating 0" in the plan predates the base crit added by computeStats.
        critRating: -BASE_CRIT_PCT * CRIT_RATING_PER_PCT,
        hitRating: 0,
        hasteRating: 0,
        baseMana: 1000,
        mp5: 0,
      },
      setPieces: {},
      modifiers: [],
    },
    priority: [],
    keybinds: [],
    hooks: {},
    ...overrides,
  };
}
