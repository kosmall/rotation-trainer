import { describe, expect, it } from 'vitest';
import { computeDamage, effectiveMissPct, rollOutcome } from '../../src/engine/damage';
import type { Rng } from '../../src/engine/rng';
import type { TargetData } from '../../src/engine/types';

function stubRng(values: number[]): Rng & { drawn: () => number } {
  let i = 0;
  return {
    next(): number {
      if (i >= values.length) throw new Error('rng over-consumed');
      return values[i++] as number;
    },
    drawn: () => i,
  };
}

const target: TargetData = { missPct: 16, minMissPct: 1, levelResistMult: 1, armor: 0 };
const table = { missPct: 10, critPct: 20, canMiss: true, canCrit: true };

describe('effectiveMissPct', () => {
  it('subtracts hit from miss', () => {
    expect(effectiveMissPct(target, 6)).toBe(10);
  });

  it('floors at minMissPct (hit above cap)', () => {
    expect(effectiveMissPct(target, 30)).toBe(1);
  });
});

describe('rollOutcome', () => {
  it('miss when roll < missPct/100', () => {
    const rng = stubRng([0.05]);
    expect(rollOutcome(rng, table)).toBe('miss');
    expect(rng.drawn()).toBe(1);
  });

  it('hit when roll >= missPct/100 and crit roll >= critPct/100', () => {
    const rng = stubRng([0.1, 0.2]);
    expect(rollOutcome(rng, table)).toBe('hit');
    expect(rng.drawn()).toBe(2);
  });

  it('crit when crit roll < critPct/100', () => {
    const rng = stubRng([0.5, 0.19]);
    expect(rollOutcome(rng, table)).toBe('crit');
  });

  it('canMiss false never misses and does not consume a draw', () => {
    const rng = stubRng([0.0]);
    expect(rollOutcome(rng, { ...table, canMiss: false })).toBe('crit');
    expect(rng.drawn()).toBe(1);
  });

  it('canCrit false does not consume a crit draw', () => {
    const rng = stubRng([0.5]);
    expect(rollOutcome(rng, { ...table, canCrit: false })).toBe('hit');
    expect(rng.drawn()).toBe(1);
  });

  it('draws nothing when neither canMiss nor canCrit', () => {
    const rng = stubRng([]);
    expect(rollOutcome(rng, { ...table, canMiss: false, canCrit: false })).toBe('hit');
  });
});

describe('computeDamage', () => {
  const base = {
    min: 100,
    max: 100,
    coeff: 0.5,
    power: 200,
    damageMult: 1,
    targetMult: 1,
    resistMult: 1,
    outcome: 'hit' as const,
    critMultiplier: 1.5,
  };

  it('min=max=100, coeff 0.5, power 200, all mults 1 -> 200', () => {
    const rng = stubRng([0.5]);
    expect(computeDamage({ rng, ...base })).toBe(200);
    expect(rng.drawn()).toBe(1);
  });

  it('crit with critMultiplier 1.5 -> 300', () => {
    expect(computeDamage({ rng: stubRng([0.5]), ...base, outcome: 'crit' })).toBe(300);
  });

  it('damageMult 1.1 and targetMult 1.2 multiply', () => {
    expect(computeDamage({ rng: stubRng([0.5]), ...base, damageMult: 1.1, targetMult: 1.2 })).toBe(264);
  });

  it('rolls between min and max', () => {
    const p = { ...base, min: 100, max: 200, coeff: 0, power: 0 };
    expect(computeDamage({ rng: stubRng([0]), ...p })).toBe(100);
    expect(computeDamage({ rng: stubRng([0.5]), ...p })).toBe(150);
  });
});
