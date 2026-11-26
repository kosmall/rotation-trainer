import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { EP_STATS, computeEp, isNonlinear, planEp, sessionKph, weightFrom } from '../../src/forever/ep';
import { runCell } from '../../src/forever/runner';

const o = { profile: 'average', sessions: 12, seed: 1, params: { session_pulls: 8 }, bootstrap: 100 };

describe('computeEp', () => {
  const r = computeEp('AFF_WRACK', 50, o);
  it('spell power is the reference: weight 1 with a degenerate interval', () => {
    expect(r.weights.spellPower.weight).toBe(1);
    expect(r.weights.spellPower.ci95).toEqual([1, 1]);
  });
  it('is repeatable with the same options', () => {
    expect(computeEp('AFF_WRACK', 50, o)).toEqual(r);
  });
  it('is valid and every weight is finite or null', () => {
    expect(r.valid).toBe(true);
    for (const s of EP_STATS) {
      const w = r.weights[s].weight;
      expect(w === null || Number.isFinite(w)).toBe(true);
      expect(r.slopes[s]).toHaveLength(o.sessions);
    }
  });
  it('clamps the downward delta to what the profile has', () => {
    const q = computeEp('AFF_WRACK', 40, { ...o, profile: 'quest' });
    expect(q.weights.spellPower.down).toBe(20);
    expect(q.weights.spellPower.up).toBe(40);
  });
  it('hit at the cap is capped with weight 0 and no upward delta', () => {
    const c = computeEp('AFF_WRACK', 50, { ...o, params: { ...o.params, mob_miss_pct: 1 } });
    expect(c.weights.hitPct.capped).toBe(true);
    expect(c.weights.hitPct.weight).toBe(0);
    expect(c.weights.hitPct.up).toBe(0);
  });
  it('rejects bad input with readable errors', () => {
    expect(() => computeEp('AFF_WRACK', 50, { ...o, sessions: 1 })).toThrow(/sessions/);
    expect(() => computeEp('AFF_WRACK', 5, o)).toThrow(/level/);
    expect(() => computeEp('AFF_WRACK', 60, o)).toThrow(/level/);
    expect(() => computeEp('NOPE', 50, o)).toThrow(/AFF_WRACK/);
  });
});

describe('weightFrom', () => {
  it('is null when spell power gains nothing', () => {
    expect(weightFrom([1, 2], [0, 0])).toBeNull();
    expect(weightFrom([1, 2], [-1, -1])).toBeNull();
  });
  it('is the ratio of means, over the chosen indices', () => {
    expect(weightFrom([2, 2], [1, 1])).toBe(2);
    expect(weightFrom([2, 4], [1, 1], [1, 1])).toBe(4);
  });
});

describe('isNonlinear', () => {
  it('is false when the two steps agree, even with noise', () => {
    expect(isNonlinear([1, 1, 1, 1], [1, 1, 1, 1])).toBe(false);
    expect(isNonlinear([1, 5, -3, 1], [2, -4, 6, 0])).toBe(false);
  });
  it('is true when the downward steps are consistently much steeper', () => {
    expect(isNonlinear([1, 1.1, 0.9, 1], [2, 2.1, 1.9, 2])).toBe(true);
  });
  it('is false when the gap is significant but tiny next to the slope', () => {
    expect(isNonlinear([10, 10.01, 9.99, 10], [10.2, 10.21, 10.19, 10.2])).toBe(false);
  });
  it('is reported per stat in the result', () => {
    for (const s of EP_STATS) expect(typeof computeEp('AFF_WRACK', 50, o).weights[s].nonlinear).toBe('boolean');
  });
});

describe('planEp', () => {
  it('has a base step and an up and a down step per stat, none for a capped hit', () => {
    expect(planEp('AFF_WRACK', 50, o).total).toBe(11);
    expect(planEp('DEMO_PACT_R1', 50, o).total).toBe(13);
  });
  it('step 0 is the base run, one kills-per-hour value per session', () => {
    const plan = planEp('AFF_WRACK', 50, o);
    const base = runCell({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: loadParams(o.params) }, 12, 1).raw.map(sessionKph);
    expect(plan.run(0)).toHaveLength(12);
    expect(plan.run(0)).toEqual(base);
  });
  it('assembling every step gives the result of computeEp', () => {
    const plan = planEp('AFF_WRACK', 50, o);
    const outs = Array.from({ length: plan.total }, (_, i) => plan.run(i));
    expect(plan.assemble(outs)).toEqual(computeEp('AFF_WRACK', 50, o));
  });
  it('validates when planning, not when running', () => {
    expect(() => planEp('AFF_WRACK', 5, o)).toThrow(/level/);
    expect(() => planEp('NOPE', 50, o)).toThrow(/AFF_WRACK/);
  });
});
