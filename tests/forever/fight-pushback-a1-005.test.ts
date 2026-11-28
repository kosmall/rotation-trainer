// Regression tests for the forever audit (F-fight). Each describe is named after the finding it covers
// (docs/superpowers/reports/forever-audit/findings/).
import { describe, expect, it } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
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

describe('A1-005: a channel cut short by a hit does not tick off its grid', () => {
  it('Wrack ticks stay on the 1 s grid and never exceed 6 per cast', () => {
    const v = loadVariant('AFF_WRACK');
    const ranks = { ...ranksAt(v, 50), fel_concentration: 0 };
    const base: PullConfig = { variant: v, level: 50, profile: 'average', params: loadParams({ pet_opens: false }), trace: true, ranks, rotation: rotationOf([step('corruption', { op: 'not', of: { op: 'target_has_dot', spell: 'corruption' } }), step('wrack', T, 'max', true)], 'wrack') };
    let off = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = simulatePull(base, seed);
      let start = -1;
      let ticks = 0;
      for (const l of r.trace) {
        const t = Math.round(parseFloat(l) * 100) / 100;
        if (l.includes('cast wrack')) {
          start = t;
          ticks = 0;
        } else if (l.includes('tick wrack') && start >= 0) {
          ticks++;
          const k = t - start;
          if (Math.abs(k - Math.round(k)) > 1e-6 || ticks > 6) off++;
        }
      }
    }
    expect(off).toBe(0);
  });
});

