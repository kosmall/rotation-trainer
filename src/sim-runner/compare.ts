// Paired comparison of 2-5 scenarios (rotation scripts Task 4; spec §2 C; docs/data-sources.md
// Part J, "Comparing scenarios"). Every scenario plays run i with the same seed mixSeed(seed, i)
// (common random numbers: the same RNG stream start), so the per-run DPS differences against the
// first scenario (the baseline) are paired and their standard error comes from those differences.
// The runs of all scenarios are interleaved in chunks (one shared progress and abort); each
// scenario's samples are aggregated in index order, so the result does not depend on the chunk
// size. Framework-free, deterministic, no wall clock.

import { DEFAULT_CHUNK, prepareRun, runOnce, type RunFactory } from './run';
import { Aggregator } from './stats';
import type { CompareResult, PairedDelta, SimOptions, SimRequest } from './types';

/** How many scenarios one comparison takes. */
export const COMPARE_LIMITS = Object.freeze({ min: 2, max: 5 });

/** The z of a two-sided 95% normal interval. */
const Z95 = 1.96;

const abortError = () => new DOMException('The simulation was aborted', 'AbortError');
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The paired delta of `x` against `base` (per-run DPS, same length n >= 1, index i = run i of
 * both), given their means as reported (`meanX`, `meanBase`):
 * - meanDiff = meanX - meanBase (exactly the difference of the reported means);
 * - sem = sqrt(s^2 / n), s^2 = sum((d_i - dbar)^2) / (n - 1) with d_i = x_i - base_i and dbar their
 *   mean (two passes over the differences: numerically stable); 0 for n = 1;
 * - ci95 = meanDiff -+ 1.96 sem; zscore = meanDiff / sem (0 when meanDiff is 0; +-Infinity when sem
 *   is 0 and meanDiff is not; 0 for n = 1);
 * - significant: the CI excludes 0, and n >= 2 (one run says nothing about the spread).
 */
export function pairedDelta(x: Float64Array, base: Float64Array, meanX: number, meanBase: number): Omit<PairedDelta, 'rank'> {
  const n = Math.min(x.length, base.length);
  const meanDiff = meanX - meanBase;
  if (n < 2) return { meanDiff, sem: 0, ci95: [meanDiff, meanDiff], zscore: 0, significant: false };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i]! - base[i]!;
  const dbar = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const e = x[i]! - base[i]! - dbar;
    ss += e * e;
  }
  const sem = Math.sqrt(ss / (n - 1) / n);
  const ci95: [number, number] = [meanDiff - Z95 * sem, meanDiff + Z95 * sem];
  const zscore = meanDiff === 0 ? 0 : sem === 0 ? (meanDiff > 0 ? Infinity : -Infinity) : meanDiff / sem;
  return { meanDiff, sem, ci95, zscore, significant: ci95[0] > 0 || ci95[1] < 0 };
}

/**
 * Validates and prepares the requests: an array of 2-5 `SimRequest`s (else a RangeError, or a
 * TypeError for a non-array), each through `prepareRun` (its error, prefixed `scenario k: `), all
 * with the same runs and seed after normalization (the pairing needs them; else an Error naming
 * the first one that differs). The spell queue window, setup and db may differ per request.
 */
export function prepareComparison(requests: readonly SimRequest[]): RunFactory[] {
  if (!Array.isArray(requests)) throw new TypeError('Comparison: requests must be an array of 2 to 5 simulation requests');
  const k = requests.length;
  if (k < COMPARE_LIMITS.min || k > COMPARE_LIMITS.max) {
    throw new RangeError(`Comparison needs ${COMPARE_LIMITS.min} to ${COMPARE_LIMITS.max} scenarios, got ${k}`);
  }
  const factories = requests.map((r, i) => {
    try {
      return prepareRun(r);
    } catch (e) {
      const message = `Comparison: scenario ${i + 1}: ${e instanceof Error ? e.message : String(e)}`;
      throw e instanceof TypeError ? new TypeError(message) : new Error(message);
    }
  });
  const first = factories[0]!;
  factories.forEach((f, i) => {
    if (f.runs !== first.runs || f.seed !== first.seed) {
      throw new Error(
        `Comparison: every scenario must use the same runs and seed (paired runs): scenario ${i + 1} has runs ${f.runs}, seed ${f.seed}; scenario 1 has runs ${first.runs}, seed ${first.seed}`,
      );
    }
  });
  return factories;
}

/**
 * Compares 2-5 scenarios on paired runs. Run i of every scenario uses seed mixSeed(seed, i) (as
 * `simulate`); per chunk of `chunk` run indices (default 50) every scenario plays those runs in
 * index order, then `onProgress(fights done, runs x scenarios)` and a yield to the event loop.
 * Results: per request exactly `simulate(request)`'s result; deltas against request 0
 * (`pairedDelta` over one Float64Array of per-run DPS per scenario); ranking by mean DPS (best
 * first, ties by index). Abort: checked before the first run, after each `onProgress` and after
 * each yield; rejects with an AbortError, no partial result, nothing reported after it. Invalid
 * requests reject with `prepareComparison`'s error.
 */
export async function compare(requests: readonly SimRequest[], options: SimOptions = {}): Promise<CompareResult> {
  const { onProgress, signal } = options;
  const chunk = Number.isFinite(options.chunk) ? Math.max(1, Math.floor(options.chunk!)) : DEFAULT_CHUNK;
  if (signal?.aborted) throw abortError();
  const factories = prepareComparison(requests);
  const { runs, seed } = factories[0]!;
  const total = runs * factories.length;
  const aggregators = factories.map(
    (f) =>
      new Aggregator({
        runs: f.runs,
        seed: f.seed,
        fightMs: f.fight.sim.durationMs,
        spellQueueWindowMs: f.spellQueueWindowMs,
        labels: f.labels,
        rules: f.rules,
      }),
  );
  const dps = factories.map(() => new Float64Array(runs));
  for (let i = 0; i < runs; ) {
    const end = Math.min(runs, i + chunk);
    factories.forEach((f, s) => {
      for (let j = i; j < end; j++) {
        const sample = runOnce(f, j);
        dps[s]![j] = sample.dps;
        aggregators[s]!.add(sample);
      }
    });
    i = end;
    onProgress?.(i * factories.length, total);
    if (signal?.aborted) throw abortError();
    if (i < runs) {
      await yieldToEventLoop();
      if (signal?.aborted) throw abortError();
    }
  }
  const results = aggregators.map((a) => a.result());
  const ranking = results.map((_, i) => i).sort((a, b) => results[b]!.meanDps - results[a]!.meanDps || a - b);
  const ranks = results.map((_, i) => ranking.indexOf(i) + 1);
  const deltas = results.map((r, s) =>
    s === 0 ? null : { ...pairedDelta(dps[s]!, dps[0]!, r.meanDps, results[0]!.meanDps), rank: ranks[s]! },
  );
  return { runs, seed, results, deltas, ranking, ranks };
}
