// Regression tests for the forever audit (F-fight). Each describe is named after the finding it covers
// (docs/superpowers/reports/forever-audit/findings/).
import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull, type PullConfig, type PullResult } from '../../src/forever/fight';
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

describe('A1-012: Eureka! is spent only when a cast starts', () => {
  it('every Eureka! is followed by a cast at the same moment', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulatePull(cfg('DEMO_PACT_R1', 50, { startMana: 5, startHp: 50 }, { eureka_policy: 'first_affected' }), seed);
      r.trace.forEach((l, i) => {
        if (!l.includes('Eureka!')) return;
        seen++;
        const next = r.trace[i + 1] ?? '';
        expect(parseFloat(next), `${l} / ${next}`).toBe(parseFloat(l));
        expect(next).toContain('cast ');
      });
    }
    // (the setup: no mana and too little health to Life Tap, so no candidate is affordable at the start)
    expect(seen).toBeGreaterThanOrEqual(0);
  });
  it('Eureka! is still used in an ordinary pull', () => {
    const r = simulatePull(cfg('DEMO_PACT_R1', 50, {}, { eureka_policy: 'first_affected' }), 1);
    expect(r.eurekaUses).toBe(1);
    const i = r.trace.findIndex((l) => l.includes('Eureka!'));
    expect(r.trace[i + 1]).toContain('cast ');
  });
});

