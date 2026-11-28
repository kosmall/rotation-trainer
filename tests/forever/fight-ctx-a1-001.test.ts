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

describe('A1-001: manaPct and combatSec reach the rotation conditions', () => {
  it('a step on "mana below X %" fires when the mana is below X %', () => {
    const base = cfg('AFF_WRACK', 50);
    const maxMana = simulatePull({ ...base, trace: false }, 1).maxMana;
    const rot = rotationOf([step('drain_life', { op: 'mana_pct_below', pct: 70 }), step('shadow_bolt', T, 'max', true)]);
    const r = simulatePull({ ...base, rotation: rot, startMana: maxMana * 0.65 }, 1);
    expect(r.trace.some((l) => l.includes('cast drain_life'))).toBe(true);
    const full = simulatePull({ ...base, rotation: rot, startMana: maxMana }, 1);
    expect(full.trace.find((l) => l.includes('cast '))).toContain('cast shadow_bolt');
  });
  it('a step on "fight longer than N s" fires only after N s of combat', () => {
    const base = cfg('AFF_WRACK', 50, { mobs: 3 });
    const rot = rotationOf([step('drain_life', { op: 'combat_sec_at_least', sec: 4 }), step('shadow_bolt', T, 'max', true)]);
    const r = simulatePull({ ...base, rotation: rot }, 1);
    const at = r.trace.filter((l) => l.includes('cast drain_life')).map((l) => parseFloat(l));
    expect(at.length).toBeGreaterThan(0);
    expect(Math.min(...at)).toBeGreaterThanOrEqual(4);
  });
});

