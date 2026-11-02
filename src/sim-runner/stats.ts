// Statistics of the multi-run simulator (simulator Task 2; docs/data-sources.md Part H):
// Welford's online mean and variance, exact percentiles and a fixed-bin histogram over the stored
// per-run DPS, and the `Aggregator` that folds per-run samples into a `SimResult`. Pure and
// framework-free; the result depends only on the samples and the order they are added in.

import type { Histogram, RunSample, SimResult, SpellSummary, SpellTotals } from './types';

/**
 * Welford's online algorithm: count, mean and the sum of squared deviations M2, updated per value
 * (numerically stable: no sum of squares). `variance` is the sample variance M2 / (n - 1), 0 for
 * fewer than two values (never NaN).
 */
export class Welford {
  count = 0;
  mean = 0;
  private m2 = 0;

  add(x: number): void {
    this.count += 1;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (x - this.mean);
  }

  get variance(): number {
    return this.count > 1 ? Math.max(0, this.m2) / (this.count - 1) : 0;
  }

  get stdDev(): number {
    return Math.sqrt(this.variance);
  }
}

/**
 * The p-quantile (0 <= p <= 1) of ascending `sorted` (non-empty): linear interpolation between
 * the closest ranks, h = (n - 1) p, x[floor h] + (h - floor h)(x[floor h + 1] - x[floor h])
 * (Hyndman-Fan type 7, the default of R and NumPy). Exact: no binning.
 */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) throw new RangeError('quantileSorted needs at least one value');
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const a = sorted[lo]!;
  if (lo + 1 >= n) return a;
  const frac = h - lo;
  return frac === 0 ? a : a + frac * (sorted[lo + 1]! - a);
}

/** Bins of the DPS histogram. */
export const HISTOGRAM_BINS = 40;

/**
 * `bins` equal bins from `min` to `max`: bin k holds [min + k w, min + (k + 1) w), the last bin
 * also holds `max` (w = (max - min) / bins). When max = min: one bin holding every value, width 0.
 * Values outside [min, max] go to the nearest end bin (the caller passes the values' own range).
 */
export function histogramOf(values: ArrayLike<number>, min: number, max: number, bins = HISTOGRAM_BINS): Histogram {
  if (!(max > min)) return { binStart: min, binWidth: 0, counts: [values.length] };
  const binWidth = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < values.length; i++) {
    const k = Math.floor((values[i]! - min) / binWidth);
    counts[Math.min(bins - 1, Math.max(0, k))]! += 1;
  }
  return { binStart: min, binWidth, counts };
}

/** What the aggregator needs besides the samples. */
export interface AggregatorInfo {
  /** Capacity: the number of samples that will be added. */
  runs: number;
  seed: number;
  fightMs: number;
  spellQueueWindowMs: number;
  labels: SimResult['labels'];
}

/** Sums of `SpellTotals` over the runs. */
type SpellSums = SpellTotals;

function addInto<K extends string>(target: Map<K, number>, key: K, value: number): void {
  target.set(key, (target.get(key) ?? 0) + value);
}

/**
 * Folds per-run samples into a `SimResult`. The DPS goes through `Welford` and into a
 * Float64Array of `runs` values (8 bytes per run: 800 KB at 100 000) for the exact percentiles
 * and the histogram; everything else is summed per key (keys kept in order of first appearance)
 * and divided by the run count. Add the samples in index order for a result independent of how
 * the runs were chunked.
 */
export class Aggregator {
  private readonly info: AggregatorInfo;
  private readonly dps: Float64Array;
  private readonly welford = new Welford();
  private readonly spells = new Map<string, SpellSums>();
  private readonly itemUses = new Map<string, number>();
  private readonly auraUpMs = new Map<string, number>();
  private manaSpent = 0;
  private lifeTaps = 0;
  private min = Infinity;
  private max = -Infinity;

  constructor(info: AggregatorInfo) {
    this.info = info;
    this.dps = new Float64Array(info.runs);
  }

  get count(): number {
    return this.welford.count;
  }

  add(sample: RunSample): void {
    const n = this.welford.count;
    if (n >= this.dps.length) throw new RangeError(`Aggregator capacity ${this.dps.length} exceeded`);
    this.dps[n] = sample.dps;
    this.welford.add(sample.dps);
    if (sample.dps < this.min) this.min = sample.dps;
    if (sample.dps > this.max) this.max = sample.dps;
    this.manaSpent += sample.manaSpent;
    this.lifeTaps += sample.lifeTaps;
    for (const [id, t] of Object.entries(sample.spells)) {
      const s = this.spells.get(id);
      if (s === undefined) {
        this.spells.set(id, { ...t });
      } else {
        s.damage += t.damage;
        s.tickDamage += t.tickDamage;
        s.casts += t.casts;
        s.hits += t.hits;
        s.crits += t.crits;
        s.misses += t.misses;
      }
    }
    for (const [id, uses] of Object.entries(sample.itemUses)) addInto(this.itemUses, id, uses);
    for (const [id, ms] of Object.entries(sample.auraUpMs)) addInto(this.auraUpMs, id, ms);
  }

  result(): SimResult {
    const n = this.welford.count;
    if (n === 0) throw new RangeError('Aggregator: no run added');
    const values = this.dps.subarray(0, n);
    const sorted = Float64Array.from(values).sort();
    const meanDps = this.welford.mean;
    const stdDev = this.welford.stdDev;
    const stdErr = stdDev / Math.sqrt(n);
    const { info } = this;
    const spellDamage = [...this.spells.values()].reduce((a, s) => a + s.damage, 0);
    const perSpell: Record<string, SpellSummary> = {};
    for (const [id, s] of this.spells) {
      perSpell[id] = {
        // A tick logged without a source spell is keyed by its aura id.
        name: info.labels.spells[id] ?? info.labels.auras[id] ?? id,
        meanDamage: s.damage / n,
        share: spellDamage > 0 ? s.damage / spellDamage : 0,
        meanCasts: s.casts / n,
        meanHits: s.hits / n,
        meanCrits: s.crits / n,
        meanMisses: s.misses / n,
        meanTickDamage: s.tickDamage / n,
      };
    }
    const itemUses: Record<string, number> = {};
    for (const [id, uses] of this.itemUses) itemUses[id] = uses / n;
    const uptimes: Record<string, number> = {};
    for (const [id, ms] of this.auraUpMs) uptimes[id] = info.fightMs > 0 ? Math.min(1, ms / n / info.fightMs) : 0;
    return {
      runs: n,
      seed: info.seed,
      spellQueueWindowMs: info.spellQueueWindowMs,
      meanDps,
      stdDev,
      stdErr,
      ci95: [meanDps - 1.96 * stdErr, meanDps + 1.96 * stdErr],
      min: this.min,
      max: this.max,
      median: quantileSorted(sorted, 0.5),
      percentiles: {
        p5: quantileSorted(sorted, 0.05),
        p25: quantileSorted(sorted, 0.25),
        p75: quantileSorted(sorted, 0.75),
        p95: quantileSorted(sorted, 0.95),
      },
      histogram: histogramOf(values, this.min, this.max),
      perSpell,
      itemUses,
      uptimes,
      meanManaSpent: this.manaSpent / n,
      meanLifeTaps: this.lifeTaps / n,
      fightMs: info.fightMs,
      labels: { spells: { ...info.labels.spells }, items: { ...info.labels.items }, auras: { ...info.labels.auras } },
    };
  }
}
