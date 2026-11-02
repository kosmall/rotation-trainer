import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { Aggregator, HISTOGRAM_BINS, histogramOf, quantileSorted, Welford } from '../../src/sim-runner/stats';
import type { RunSample } from '../../src/sim-runner/types';

/** Two-pass reference: mean, then the sum of squared deviations (sample variance, n - 1). */
function twoPass(xs: readonly number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ss = xs.reduce((a, x) => a + (x - mean) ** 2, 0);
  return { mean, variance: xs.length > 1 ? ss / (xs.length - 1) : 0 };
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE);

/** A sample with only its DPS set (the per-spell parts empty). */
function sample(index: number, dps: number): RunSample {
  return {
    index,
    seed: index,
    dps,
    damageTotal: dps * 60,
    spells: {},
    itemUses: {},
    auraUpMs: {},
    manaSpent: 0,
    lifeTaps: 0,
  };
}

function aggregate(values: readonly number[]) {
  const agg = new Aggregator({ runs: values.length, seed: 7, fightMs: 60000, spellQueueWindowMs: 400, labels: { spells: {}, items: {}, auras: {} } });
  values.forEach((v, i) => agg.add(sample(i, v)));
  return agg.result();
}

describe('Welford', () => {
  it('mean and sample variance equal a two-pass reference on random data to 1e-9 relative', () => {
    const rng = createRng(20261102);
    for (const n of [2, 3, 10, 1000, 20000]) {
      const xs = Array.from({ length: n }, () => 1400 + 300 * (rng.next() + rng.next() + rng.next() - 1.5));
      const w = new Welford();
      for (const x of xs) w.add(x);
      const ref = twoPass(xs);
      expect(w.count).toBe(n);
      expect(rel(w.mean, ref.mean)).toBeLessThan(1e-9);
      expect(rel(w.variance, ref.variance)).toBeLessThan(1e-9);
      expect(rel(w.stdDev, Math.sqrt(ref.variance))).toBeLessThan(1e-9);
    }
  });

  it('a hand-computed sample: 2, 4, 4, 4, 5, 5, 7, 9 has mean 5 and sample variance 32/7', () => {
    const w = new Welford();
    for (const x of [2, 4, 4, 4, 5, 5, 7, 9]) w.add(x);
    expect(w.mean).toBe(5);
    expect(w.variance).toBeCloseTo(32 / 7, 12);
  });

  it('n = 0 and n = 1 give variance and stdDev 0, never NaN', () => {
    const w = new Welford();
    expect(w.mean).toBe(0);
    expect(w.variance).toBe(0);
    w.add(1234.5);
    expect(w.mean).toBe(1234.5);
    expect(w.variance).toBe(0);
    expect(w.stdDev).toBe(0);
    const r = aggregate([1234.5]);
    expect(r).toMatchObject({ runs: 1, meanDps: 1234.5, stdDev: 0, stdErr: 0, ci95: [1234.5, 1234.5], min: 1234.5, max: 1234.5, median: 1234.5 });
    expect(Object.values(r.percentiles)).toEqual([1234.5, 1234.5, 1234.5, 1234.5]);
    expect(JSON.stringify(r)).not.toMatch(/null|NaN/);
  });

  it('100 000 values around 1e9 with unit spread stay stable (the naive sum of squares would not)', () => {
    const rng = createRng(5);
    const xs = Array.from({ length: 100000 }, () => 1e9 + rng.next());
    const w = new Welford();
    for (const x of xs) w.add(x);
    const ref = twoPass(xs);
    expect(rel(w.mean, ref.mean)).toBeLessThan(1e-12);
    expect(rel(w.variance, ref.variance)).toBeLessThan(1e-6);
    // Uniform [0, 1): variance 1/12.
    expect(w.variance).toBeGreaterThan(0.08);
    expect(w.variance).toBeLessThan(0.087);
    // The naive formula loses everything to cancellation here.
    const sum = xs.reduce((a, b) => a + b, 0);
    const sumSq = xs.reduce((a, b) => a + b * b, 0);
    const naive = (sumSq - (sum * sum) / xs.length) / (xs.length - 1);
    expect(rel(naive, 1 / 12)).toBeGreaterThan(0.1);
  });
});

describe('percentiles and histogram', () => {
  it('quantileSorted is exact (linear interpolation between closest ranks, h = (n - 1) p)', () => {
    const xs = [10, 20, 30, 40, 50];
    expect(quantileSorted(xs, 0)).toBe(10);
    expect(quantileSorted(xs, 1)).toBe(50);
    expect(quantileSorted(xs, 0.5)).toBe(30);
    expect(quantileSorted(xs, 0.25)).toBe(20);
    expect(quantileSorted(xs, 0.05)).toBeCloseTo(12, 12);
    expect(quantileSorted(xs, 0.95)).toBeCloseTo(48, 12);
    expect(quantileSorted([10, 20], 0.5)).toBe(15);
    expect(quantileSorted([7], 0.95)).toBe(7);
  });

  it('the aggregated percentiles of 1..101 (shuffled) are the exact order statistics', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i + 1);
    const rng = createRng(3);
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    const r = aggregate(xs);
    expect(r.min).toBe(1);
    expect(r.max).toBe(101);
    expect(r.median).toBe(51);
    expect(r.percentiles).toEqual({ p5: 6, p25: 26, p75: 76, p95: 96 });
    expect(r.meanDps).toBeCloseTo(51, 12);
    expect(r.stdErr).toBeCloseTo(r.stdDev / Math.sqrt(101), 12);
    expect(r.ci95[0]).toBeCloseTo(51 - 1.96 * r.stdErr, 12);
    expect(r.ci95[1]).toBeCloseTo(51 + 1.96 * r.stdErr, 12);
  });

  it('histogram counts sum to n, the bins cover min..max, min falls in the first bin and max in the last', () => {
    const rng = createRng(11);
    const xs = Float64Array.from({ length: 5000 }, () => 1000 + 800 * rng.next());
    let min = Infinity;
    let max = -Infinity;
    for (const x of xs) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    const h = histogramOf(xs, min, max);
    expect(h.counts).toHaveLength(HISTOGRAM_BINS);
    expect(HISTOGRAM_BINS).toBe(40);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(h.binStart).toBe(min);
    expect(h.binStart + h.counts.length * h.binWidth).toBeCloseTo(max, 9);
    // Bin k holds [binStart + k w, binStart + (k + 1) w); the last bin also holds max.
    const one = (v: number) => histogramOf([v, min, max], min, max).counts;
    expect(one(min)[0]).toBe(2);
    expect(one(max)[HISTOGRAM_BINS - 1]).toBe(2);
    expect(histogramOf([min + 10.5 * h.binWidth], min, max).counts[10]).toBe(1);
    // The aggregator's histogram is this one.
    const r = aggregate([...xs]);
    expect(r.histogram).toEqual(h);
  });

  it('all-equal values give a single-bin histogram with width 0', () => {
    const r = aggregate([1500, 1500, 1500, 1500]);
    expect(r.histogram).toEqual({ binStart: 1500, binWidth: 0, counts: [4] });
    expect(r.stdDev).toBe(0);
    expect(r.ci95).toEqual([1500, 1500]);
  });

  it('the aggregator refuses more samples than its capacity and a result with none', () => {
    const agg = new Aggregator({ runs: 1, seed: 0, fightMs: 60000, spellQueueWindowMs: 400, labels: { spells: {}, items: {}, auras: {} } });
    expect(() => agg.result()).toThrow(/no run/);
    agg.add(sample(0, 1));
    expect(() => agg.add(sample(1, 2))).toThrow(/capacity/);
  });
});
