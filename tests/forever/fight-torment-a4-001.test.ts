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

describe('A4-001: Voidwalker Torment costs 20 mana', () => {
  it('the Voidwalker spends mana on Torment', () => {
    const rs = many(cfg('AFF_WRACK', 40, { trace: false }), 10).filter((r) => r.pullSec > 8 && r.petKind === 'voidwalker' && !r.petDied);
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(r.endPetMana).toBeLessThan(r.petMaxMana);
  });
  it('without 20 mana there is no Torment', () => {
    const r = simulatePull(cfg('AFF_WRACK', 40, { startPetMana: 0 }), 1);
    expect(r.pullSec).toBeLessThan(30);
    expect(r.trace.filter((l) => l.includes('pet torment'))).toEqual([]);
    const full = simulatePull(cfg('AFF_WRACK', 40), 1);
    expect(full.trace.some((l) => l.includes('pet torment'))).toBe(true);
  });
});

