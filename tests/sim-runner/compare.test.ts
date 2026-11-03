import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { itemDbSync } from '../../src/data/items/dbSync';
import { scenarioRunSetup } from '../../src/scenarios/cli';
import { exampleScenarios } from '../../src/scenarios/examples';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { compareOnMainThread, runComparison } from '../../src/sim-runner/client';
import { compare, pairedDelta } from '../../src/sim-runner/compare';
import { mixSeed, prepareRun, runOnce, runWithSeed, simulate } from '../../src/sim-runner/run';
import type { SimRequest } from '../../src/sim-runner/types';
import { handleWorkerMessage, type FromWorker } from '../../src/sim-runner/worker';

// Paired comparison (rotation scripts Task 4; docs/data-sources.md Part J, "Comparing scenarios"):
// every scenario plays run i with the same seed mixSeed(seed, i) (common random numbers), so the
// per-run differences are paired; the delta's standard error comes from those differences.

const db = itemDbSync();
const base = () => structuredClone(DEFAULT_SETUP) as SetupConfig;
const req = (setup: SetupConfig, runs = 20, seed = 99, p: Partial<SimRequest> = {}): SimRequest => ({
  setup: structuredClone(setup),
  db,
  runs,
  seed,
  spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
  ...p,
});

const POTION: SetupConfig = { ...base(), enabledBuffs: ['destruction-potion'] };
const POTION_NEVER: SetupConfig = {
  ...base(),
  enabledBuffs: ['destruction-potion'],
  rotation: { ...base().rotation, itemUse: { 'destruction-potion': { trigger: { kind: 'never' } } } },
} as SetupConfig;
const HOLD = () => scenarioRunSetup(exampleScenarios(db).find((e) => e.file === 'shadowburn-hold')!.scenario, db);

/** The two-pass sample variance (n - 1) of a - b, and its mean. */
function twoPass(a: readonly number[], b: readonly number[]) {
  const d = a.map((x, i) => x - b[i]!);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const ss = d.reduce((s, x) => s + (x - mean) ** 2, 0);
  return { mean, sem: Math.sqrt(ss / (d.length - 1) / d.length) };
}

describe('pairedDelta', () => {
  it('identical samples: exactly 0, sem 0, not significant', () => {
    const x = Float64Array.from([1, 5, 3, 9]);
    const d = pairedDelta(x, Float64Array.from(x), 4.5, 4.5);
    expect(d).toEqual({ meanDiff: 0, sem: 0, ci95: [0, 0], zscore: 0, significant: false });
  });

  it('sem from the paired differences (two-pass reference), CI 1.96, z = mean / sem', () => {
    const a = [10, 12, 9, 15, 11, 13];
    const b = [8, 11, 9, 12, 10, 10];
    const ma = a.reduce((s, x) => s + x, 0) / 6;
    const mb = b.reduce((s, x) => s + x, 0) / 6;
    const d = pairedDelta(Float64Array.from(a), Float64Array.from(b), ma, mb);
    const ref = twoPass(a, b);
    expect(d.meanDiff).toBe(ma - mb);
    expect(d.sem).toBeCloseTo(ref.sem, 14);
    expect(d.ci95[0]).toBeCloseTo(d.meanDiff - 1.96 * d.sem, 12);
    expect(d.ci95[1]).toBeCloseTo(d.meanDiff + 1.96 * d.sem, 12);
    expect(d.zscore).toBeCloseTo(d.meanDiff / d.sem, 12);
    expect(d.significant).toBe(true);
  });

  it('a constant non-zero shift: sem 0, infinite z, significant; one run: never significant', () => {
    const d = pairedDelta(Float64Array.from([3, 4]), Float64Array.from([1, 2]), 3.5, 1.5);
    expect(d.sem).toBe(0);
    expect(d.zscore).toBe(Infinity);
    expect(d.significant).toBe(true);
    const one = pairedDelta(Float64Array.from([3]), Float64Array.from([1]), 3, 1);
    expect(one).toEqual({ meanDiff: 2, sem: 0, ci95: [2, 2], zscore: 0, significant: false });
  });
});

describe('compare', () => {
  it('identical requests: deltas exactly 0 with sem 0, not significant; results equal simulate()', async () => {
    const r = await compare([req(base()), req(base()), req(base())]);
    const single = await simulate(req(base()));
    expect(r.results).toHaveLength(3);
    for (const res of r.results) expect(JSON.stringify(res)).toBe(JSON.stringify(single));
    expect(r.deltas[0]).toBeNull();
    for (const d of r.deltas.slice(1)) {
      expect(d).toMatchObject({ meanDiff: 0, sem: 0, ci95: [0, 0], zscore: 0, significant: false });
    }
    expect(r.runs).toBe(20);
    expect(r.seed).toBe(99);
  });

  it('common random numbers: sample i of every scenario is played with mixSeed(seed, i); deltas use those pairs', async () => {
    const reqs = [req(base(), 15, 7), req(POTION_NEVER, 15, 7), req(HOLD(), 15, 7)];
    const r = await compare(reqs);
    const factories = reqs.map((q) => prepareRun(q));
    const dps = factories.map((f) => Array.from({ length: 15 }, (_, i) => runOnce(f, i).dps));
    // runOnce(f, i) is runWithSeed(f, mixSeed(7, i), i): the same seed in every scenario.
    for (const f of factories) expect(runWithSeed(f, mixSeed(7, 4), 4).dps).toBe(runOnce(f, 4).dps);
    for (let k = 1; k < 3; k++) {
      const d = r.deltas[k]!;
      // The delta mean is exactly the difference of the reported means.
      expect(d.meanDiff).toBe(r.results[k]!.meanDps - r.results[0]!.meanDps);
      const ref = twoPass(dps[k]!, dps[0]!);
      expect(d.meanDiff).toBeCloseTo(ref.mean, 9);
      expect(d.sem).toBeCloseTo(ref.sem, 9);
    }
  });

  it('known worse scenarios at 1000 runs: Destruction Potion never and the Shadowburn hold are negative with the CI below 0; paired sem is far below the unpaired one', async () => {
    const r = await compare([req(POTION, 1000, 1), req(POTION_NEVER, 1000, 1), req(HOLD(), 1000, 1)], { chunk: 250 });
    for (const k of [1, 2]) {
      const d = r.deltas[k]!;
      expect(d.meanDiff, `scenario ${k}`).toBeLessThan(0);
      expect(d.ci95[1]).toBeLessThan(0);
      expect(d.significant).toBe(true);
      expect(d.zscore).toBeLessThan(-1.96);
      const unpaired = Math.hypot(r.results[0]!.stdErr, r.results[k]!.stdErr);
      expect(d.sem).toBeLessThan(unpaired);
    }
    expect(r.ranking[0]).toBe(0);
    expect(r.deltas[1]!.rank).toBeGreaterThan(1);
  }, 120000);

  it('ranking: indices by mean DPS, best first (ties by input order); ranks are 1-based', async () => {
    const r = await compare([req(POTION_NEVER, 30), req(POTION, 30), req(POTION_NEVER, 30)]);
    expect(r.results[1]!.meanDps).toBeGreaterThan(r.results[0]!.meanDps);
    expect(r.ranking).toEqual([1, 0, 2]);
    expect(r.ranks).toEqual([2, 1, 3]);
    expect(r.deltas[1]!.rank).toBe(1);
    expect(r.deltas[2]!.rank).toBe(3);
  });

  it('chunk independence: chunks 1, 7 and 1000 give byte-equal results; progress is shared and ends at runs x scenarios', async () => {
    const reqs = [req(base(), 9), req(POTION, 9)];
    const calls: [number, number][] = [];
    const out = await Promise.all([
      compare(reqs, { chunk: 1 }),
      compare(reqs, { chunk: 7, onProgress: (d, t) => calls.push([d, t]) }),
      compare(reqs, { chunk: 1000 }),
    ]);
    const json = out.map((r) => JSON.stringify(r));
    expect(json[1]).toBe(json[0]);
    expect(json[2]).toBe(json[0]);
    expect(calls).toEqual([
      [14, 18],
      [18, 18],
    ]);
  });

  it('abort: AbortError, no partial result, nothing reported after; an aborted signal rejects before any run', async () => {
    const c = new AbortController();
    const calls: number[] = [];
    const p = compare([req(base(), 200), req(POTION, 200)], {
      chunk: 5,
      signal: c.signal,
      onProgress: (d) => {
        calls.push(d);
        if (d === 20) c.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual([10, 20]);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([10, 20]);
    const pre = new AbortController();
    pre.abort();
    await expect(compare([req(base()), req(base())], { signal: pre.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hostile requests: clear errors for 1 or 6 requests, a non-array, mismatched runs or seeds, NaN; a window may differ', async () => {
    await expect(compare([req(base())])).rejects.toThrow(/2 to 5 scenarios, got 1/);
    await expect(compare(Array.from({ length: 6 }, () => req(base())))).rejects.toThrow(/2 to 5 scenarios, got 6/);
    await expect(compare('x' as unknown as SimRequest[])).rejects.toThrow(TypeError);
    await expect(compare([req(base(), 20), req(base(), 30)])).rejects.toThrow(/same runs and seed.*scenario 2.*runs 30/);
    await expect(compare([req(base(), 20, 1), req(base(), 20, 2)])).rejects.toThrow(/same runs and seed.*scenario 2.*seed 2/);
    await expect(compare([req(base()), req(base(), Number.NaN)])).rejects.toThrow(/scenario 2: .*runs must be a finite number/);
    await expect(compare([req(base()), null as unknown as SimRequest])).rejects.toThrow(/scenario 2: /);
    const w = await compare([req(base(), 4), req(base(), 4, 99, { spellQueueWindowMs: 0 })]);
    expect(w.results[1]!.spellQueueWindowMs).toBe(0);
  });

  it('golden values unchanged: the default fights over seeds 1-10 still average 1425.1766666666667 / 1428.3350000000003', () => {
    const f = prepareRun(req(base()));
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => runWithSeed(f, s, 0).dps).reduce((a, b) => a + b, 0) / 10).toBe(1425.1766666666667);
    const f0 = prepareRun(req(base(), 20, 99, { spellQueueWindowMs: 0 }));
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => runWithSeed(f0, s, 0).dps).reduce((a, b) => a + b, 0) / 10).toBe(1428.3350000000003);
  });

  it('performance: 1000 runs x 3 scenarios within 60 s (measured about 8 s on the loaded development container, ~2.8 ms per fight)', async () => {
    const t0 = performance.now();
    const r = await compare([req(base(), 1000, 1), req(POTION, 1000, 1), req(HOLD(), 1000, 1)], { chunk: 200 });
    expect(r.results.every((x) => x.runs === 1000)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(60000);
  }, 240000);
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failToLoad = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    const copy = structuredClone(message);
    this.posted.push(copy);
    setTimeout(() => {
      if (FakeWorker.failToLoad) {
        this.onerror?.({ message: 'no script', preventDefault() {} });
        return;
      }
      void handleWorkerMessage(copy, (m: FromWorker) => {
        if (!this.terminated) this.onmessage?.({ data: structuredClone(m) });
      });
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
  FakeWorker.failToLoad = false;
});

describe('runComparison (worker client)', () => {
  const reqs = () => [req(base(), 12, 5), req(POTION, 12, 5)];

  it('the worker (mocked, real handler) equals the main-thread fallback and compare(); progress reaches the total; the worker is terminated', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const progress: [number, number][] = [];
    const viaWorker = await runComparison(reqs(), { onProgress: (d, t) => progress.push([d, t]) });
    expect(FakeWorker.instances[0]!.posted[0]).toMatchObject({ type: 'compare' });
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    vi.unstubAllGlobals();
    const fallback = await compareOnMainThread(reqs());
    const direct = await compare(reqs());
    expect(JSON.stringify(viaWorker)).toBe(JSON.stringify(direct));
    expect(JSON.stringify(fallback)).toBe(JSON.stringify(direct));
    expect(progress.at(-1)).toEqual([24, 24]);
  });

  it('no Worker: main thread; a worker that fails to load: falls back; an invalid comparison rejects with its error', async () => {
    const direct = await compare(reqs());
    expect(JSON.stringify(await runComparison(reqs()))).toBe(JSON.stringify(direct));
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.failToLoad = true;
    expect(JSON.stringify(await runComparison(reqs()))).toBe(JSON.stringify(direct));
    FakeWorker.failToLoad = false;
    await expect(runComparison([req(base())])).rejects.toThrow(/2 to 5 scenarios/);
  });

  it('abort terminates the worker and rejects with an AbortError', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const c = new AbortController();
    const p = runComparison(reqs(), { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });

  it('the worker handler still answers a run message as before (simulate path unchanged)', async () => {
    const posted: FromWorker[] = [];
    await handleWorkerMessage({ type: 'run', request: req(base(), 3) }, (m) => posted.push(m));
    expect(posted[0]).toEqual({ type: 'started' });
    const last = posted.at(-1)!;
    expect(last.type).toBe('result');
    expect(JSON.stringify((last as { result: unknown }).result)).toBe(JSON.stringify(await simulate(req(base(), 3))));
  });
});
