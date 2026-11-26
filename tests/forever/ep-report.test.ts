import { describe, expect, it } from 'vitest';
import { EP_STATS, computeEp, type EpResult } from '../../src/forever/ep';
import { compareEp, epReport, formatEp } from '../../src/forever/ep-report';

const o = { profile: 'average', sessions: 12, seed: 1, params: { session_pulls: 8 }, bootstrap: 100 };

describe('compareEp', () => {
  const a = computeEp('AFF_WRACK', 50, o);
  const b = computeEp('DEMO_PACT_R1', 50, o);
  it('a build against itself differs nowhere', () => {
    for (const d of compareEp(a, a, { bootstrap: 100 })) {
      expect(d.diff === null || d.diff === 0).toBe(true);
      expect(d.significant).toBe(false);
    }
  });
  it('swapping the builds negates the differences', () => {
    const ab = compareEp(a, b, { bootstrap: 100 });
    const ba = compareEp(b, a, { bootstrap: 100 });
    ab.forEach((d, i) => {
      if (d.diff !== null) expect(d.diff).toBeCloseTo(-(ba[i]!.diff as number), 9);
    });
  });
  it('rejects results of different levels', () => {
    expect(() => compareEp(a, computeEp('AFF_WRACK', 45, o))).toThrow(/level/);
  });
});

describe('epReport and formatEp', () => {
  it('has one result per build and level and one pair per level', () => {
    const r = epReport(['AFF_WRACK', 'DEMO_PACT_R1'], [50], o);
    expect(r.results).toHaveLength(2);
    expect(r.pairs).toHaveLength(1);
    const text = formatEp(r);
    expect(text).toContain('Level 50');
    for (const s of EP_STATS) expect(text).toContain(s);
    expect(text).toContain('AFF_WRACK');
    expect(text).toContain('DEMO_PACT_R1');
    expect(text).toContain('placeholder');
    expect(text).not.toMatch(/NaN|Infinity/);
  });
  it('renders unavailable and capped weights as n/a and capped', () => {
    const r = epReport(['AFF_WRACK'], [50], o);
    const res = r.results[0] as EpResult;
    res.valid = false;
    for (const s of EP_STATS) {
      res.weights[s].weight = null;
      res.weights[s].ci95 = null;
    }
    res.weights.hitPct.capped = true;
    res.weights.intellect.nonlinear = true;
    res.weights.intellect.weight = 0.5;
    res.weights.intellect.ci95 = [0.4, 0.6];
    const text = formatEp(r);
    expect(text).toContain('n/a');
    expect(text).toContain('capped');
    expect(text).toContain('0.50 (0.40..0.60) *');
    expect(text).not.toMatch(/NaN|Infinity/);
  });
});
