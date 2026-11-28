// Regression tests for the forever audit (F-fight). Each describe is named after the finding it covers
// (docs/superpowers/reports/forever-audit/findings/).
import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { grantDemonicEnergiesMana, simulatePull, type PullConfig, type PullResult } from '../../src/forever/fight';
import { type DataRotation, type SpecStep } from '../../src/forever/rotation-spec';
import type { Params } from '../../src/forever/types';

const cfg = (id: string, level = 50, over: Partial<PullConfig> = {}, params: Partial<Params> = {}): PullConfig => ({
  variant: loadVariant(id), level, profile: 'average', params: loadParams(params), trace: true, ...over,
});
const many = (c: PullConfig, n = 40): PullResult[] => Array.from({ length: n }, (_, i) => simulatePull(c, i + 1));
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const T = { op: 'true' } as const;
const step = (spell: string, when: SpecStep['when'], rank: number | 'max' = 'max', filler = false): SpecStep => ({ id: `${spell}_${JSON.stringify(when).length}`, spell, rank, when, filler });
const rotationOf = (steps: SpecStep[], filler = 'shadow_bolt'): DataRotation => ({ steps, estimate: { filler, fillerRank: 'max', dotSpells: [] } });

describe('A3-002 / A4-003: Demonic Energies mana is capped at the demon maximum', () => {
  it('grantDemonicEnergiesMana never goes above the maximum', () => {
    const ranks = { demonic_energies: 2 };
    expect(grantDemonicEnergiesMana(ranks, 1000, 1500, 1600)).toBe(1600);
    expect(grantDemonicEnergiesMana(ranks, 100, 0, 1600)).toBeGreaterThan(0);
    expect(grantDemonicEnergiesMana({}, 1000, 10, 1600)).toBe(10);
  });
  it('DEMO_FIRE: the demon never ends a pull above its maximum mana', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulatePull(cfg('DEMO_FIRE', 50, { startMana: 200, trace: false }), seed);
      expect(r.endPetMana).toBeLessThanOrEqual(r.petMaxMana + 1e-9);
    }
  });
});

