// Deterministic spec and target for engine tests. Not game data: numbers are chosen for easy math.

import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import type { AuraDef, SpellDef, TargetData } from '../../src/engine/types';

/** Never misses, no partial resists, no armor. */
export const TEST_TARGET: TargetData = { missPct: 0, minMissPct: 0, levelResistMult: 1, armor: 0 };

const icon = 'test';

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
  ];
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
