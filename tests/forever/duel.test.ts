import { describe, expect, it } from 'vitest';
import { loadOrder, loadVariant, variantFromJson } from '../../src/forever/builds';
import { duelBuilds, duelLevel, formatDetail, formatSummary, pairedDiff } from '../../src/forever/duel';
import { runCell } from '../../src/forever/runner';
import { loadParams } from '../../src/forever/data/load';

const opts = { levels: [45, 50], profile: 'average', sessions: 12, seed: 1, params: { session_pulls: 8 } };

describe('duel', () => {
  it('a build against itself gives zero differences and ties everywhere', () => {
    const r = duelBuilds('AFF_WRACK', 'AFF_WRACK', opts);
    for (const x of r.results) {
      expect(x.diff.killsPerHour.mean).toBe(0);
      expect(x.verdict.moreKillsPerHour).toBe('tie');
      expect(x.verdict.fewerBreaks).toBe('tie');
    }
    expect(r.crossover).toBeNull();
  });
  it('swapping a and b negates the difference means and flips the winners', () => {
    const ab = duelLevel(loadVariant('AFF_WRACK'), loadVariant('DEMO_PACT_MAXRANK'), 50, { ...opts, levels: [50] });
    const ba = duelLevel(loadVariant('DEMO_PACT_MAXRANK'), loadVariant('AFF_WRACK'), 50, { ...opts, levels: [50] });
    expect(ab.diff.killsPerHour.mean).toBeCloseTo(-ba.diff.killsPerHour.mean, 9);
    const flip = (s: string) => (s === 'a' ? 'b' : s === 'b' ? 'a' : 'tie');
    expect(flip(ab.verdict.moreKillsPerHour)).toBe(ba.verdict.moreKillsPerHour);
  });
  it('paired CI is not wider than an unpaired one (within 25%) on the same sessions', () => {
    const p = loadParams({ session_pulls: 8 });
    const mk = (id: string) => runCell({ variant: loadVariant(id), level: 50, profile: 'average', params: p }, 30, 1).raw;
    const a = mk('DEMO_PACT_R1');
    const b = mk('AFF_WRACK');
    const paired = pairedDiff(a, b).killsPerHour;
    const rate = (xs: typeof a) => xs.map((s) => (3600 * s.kills) / s.totalSec);
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((m, x) => m + (x - xs.reduce((s, y) => s + y, 0) / xs.length) ** 2, 0) / (xs.length - 1));
    const unpairedHalf = 1.96 * Math.sqrt(sd(rate(a)) ** 2 / a.length + sd(rate(b)) ** 2 / b.length);
    // Common seeds never make the interval much wider than treating the builds as independent.
    expect(paired.ci95[1] - paired.ci95[0]).toBeLessThan(2 * unpairedHalf * 1.25);
  });
  it('significant is false when the CI contains zero', () => {
    const r = duelBuilds('AFF_WRACK', 'AFF_WRACK', { ...opts, levels: [50] });
    expect(r.results[0]!.diff.ttk.significant).toBe(false);
  });
  it('accepts an inline custom build and rejects an illegal point order', () => {
    const runs = loadOrder('AFF_WRACK').map((t) => [t, 1]);
    const ok = variantFromJson({ id: 'MY', order: runs, rotation: 'affliction', filler: 'wrack', pet: 'voidwalker', rank: 'max' });
    expect(ok.id).toBe('MY');
    expect(duelBuilds(ok, 'AFF_WRACK', { ...opts, levels: [50], sessions: 6 }).results[0]!.diff.killsPerHour.mean).toBeCloseTo(0, 9);
  });
  it('rejects an illegal custom order', () => {
    expect(() => variantFromJson({ id: 'BAD', order: [['wrack', 1]] })).toThrow();
    expect(() => variantFromJson({ id: 'SHORT', order: [['improved_corruption', 5]] })).toThrow(/51 points/);
  });
  it('formats a summary and a detail table', () => {
    const r = duelBuilds('DEMO_PACT_R1', 'AFF_WRACK', { ...opts, levels: [50] });
    expect(formatSummary(r)).toContain('DEMO_PACT_R1 (a) vs AFF_WRACK (b)');
    expect(formatDetail(r.results[0]!, r.a, r.b)).toContain('breaks per hour');
  });
});
