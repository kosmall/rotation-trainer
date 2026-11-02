import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOnMainThread, runSimulation } from '../../src/sim-runner/client';
import { simulate } from '../../src/sim-runner/run';
import type { SimRequest, SimResult } from '../../src/sim-runner/types';
import { handleWorkerMessage, type FromWorker } from '../../src/sim-runner/worker';
import { DEFAULT_SETUP } from '../../src/setup/defaults';

// The worker client (simulator Task 3): the Worker is mocked (Node has no Web Worker), so these
// tests check the protocol (messages, progress, result, errors), abort (terminate) and the
// fallback to the main thread when the worker cannot start.

const request = (runs = 12, seed = 7): SimRequest => ({ setup: structuredClone(DEFAULT_SETUP), runs, seed, spellQueueWindowMs: 400 });

/** A stand-in for the browser's Worker: records what it is given, lets the test answer. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  /** Set to make the constructor throw (a browser that refuses module workers, a CSP). */
  static throwOnCreate = false;
  /** When set, the fake runs the real worker handler in-process (the full protocol). */
  static realHandler = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(
    readonly url: URL,
    readonly options: { type?: string },
  ) {
    if (FakeWorker.throwOnCreate) throw new Error('module workers are not supported');
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    const copy = structuredClone(message); // what crosses the boundary: plain data only
    this.posted.push(copy);
    if (FakeWorker.realHandler) {
      setTimeout(() => {
        void handleWorkerMessage(copy, (m: FromWorker) => {
          if (!this.terminated) this.emit(structuredClone(m));
        });
      }, 0);
    }
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  fail(message = 'failed to load the worker script') {
    this.onerror?.({ message, preventDefault() {} });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
  FakeWorker.throwOnCreate = false;
  FakeWorker.realHandler = false;
});

const last = () => FakeWorker.instances.at(-1)!;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('runSimulation: the worker path (mocked Worker)', () => {
  it('spawns a module worker, posts the request, forwards progress and resolves with the result; the worker is terminated', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onProgress = vi.fn();
    const req = request();
    const pending = runSimulation(req, { onProgress });
    const w = last();
    expect(w.url.href).toMatch(/\/src\/sim-runner\/worker\.ts$/);
    expect(w.options).toEqual({ type: 'module' });
    expect(w.posted).toEqual([{ type: 'run', request: req }]);
    w.emit({ type: 'started' });
    w.emit({ type: 'progress', done: 6, total: 12 });
    w.emit({ type: 'progress', done: 12, total: 12 });
    const fake = { meanDps: 1 } as unknown as SimResult;
    w.emit({ type: 'result', result: fake });
    await expect(pending).resolves.toBe(fake);
    expect(onProgress.mock.calls).toEqual([
      [6, 12],
      [12, 12],
    ]);
    expect(w.terminated).toBe(true);
  });

  it('the real worker handler behind the mock gives exactly the result of simulate() on the main thread', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.realHandler = true;
    const onProgress = vi.fn();
    const viaWorker = await runSimulation(request(30, 99), { onProgress });
    const direct = await simulate(request(30, 99));
    expect(JSON.stringify(viaWorker)).toBe(JSON.stringify(direct));
    expect(onProgress).toHaveBeenLastCalledWith(30, 30);
    expect(last().terminated).toBe(true);
  });

  it('abort terminates the worker and rejects with an AbortError; later messages are ignored', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const onProgress = vi.fn();
    const pending = runSimulation(request(), { onProgress, signal: controller.signal });
    const w = last();
    w.emit({ type: 'started' });
    w.emit({ type: 'progress', done: 3, total: 12 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.terminated).toBe(true);
    w.emit({ type: 'progress', done: 6, total: 12 });
    w.emit({ type: 'result', result: {} });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('an already aborted signal rejects without starting a worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    controller.abort();
    await expect(runSimulation(request(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("an error the worker reports (a bad request) rejects with that error's name and message, no fallback", async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.realHandler = true;
    const bad = { ...request(), runs: Number.NaN };
    await expect(runSimulation(bad)).rejects.toMatchObject({ name: 'TypeError', message: expect.stringContaining('runs') });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(last().terminated).toBe(true);
  });

  it('a worker that fails after it started rejects (no second run on the main thread)', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = runSimulation(request());
    last().emit({ type: 'started' });
    last().fail('out of memory');
    await expect(pending).rejects.toThrow(/worker/i);
    expect(last().terminated).toBe(true);
  });
});

describe('runSimulation: fallback to the main thread', () => {
  it('a worker that fails to start (error before its first message) falls back: same result as simulate()', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onProgress = vi.fn();
    const pending = runSimulation(request(20, 5), { onProgress });
    last().fail();
    expect(last().terminated).toBe(true);
    const result = await pending;
    expect(JSON.stringify(result)).toBe(JSON.stringify(await simulate(request(20, 5))));
    expect(onProgress).toHaveBeenLastCalledWith(20, 20);
  });

  it('a Worker constructor that throws falls back', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.throwOnCreate = true;
    const result = await runSimulation(request(8, 3));
    expect(result.runs).toBe(8);
    expect(result.meanDps).toBe((await simulate(request(8, 3))).meanDps);
  });

  it('no Worker at all (Node, jsdom, old browsers): main thread, in small chunks, abortable', async () => {
    expect(typeof (globalThis as { Worker?: unknown }).Worker).toBe('undefined');
    const progress: number[] = [];
    const result = await runSimulation(request(25, 11), { onProgress: (done) => progress.push(done) });
    expect(result.meanDps).toBe((await simulate(request(25, 11))).meanDps);
    expect(progress).toEqual([10, 20, 25]); // FALLBACK_CHUNK = 10 runs between yields
    const controller = new AbortController();
    const pending = runOnMainThread(request(500, 1), { signal: controller.signal, onProgress: () => controller.abort() });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
  });
});

describe('worker handler', () => {
  it('answers a run with started, progress per chunk and the result; garbage with an error', async () => {
    const posted: FromWorker[] = [];
    await handleWorkerMessage({ type: 'run', request: request(150, 2) }, (m) => posted.push(m));
    expect(posted[0]).toEqual({ type: 'started' });
    expect(posted.filter((m) => m.type === 'progress').map((m) => (m.type === 'progress' ? m.done : 0))).toEqual([100, 150]);
    const result = posted.at(-1)!;
    expect(result.type).toBe('result');
    expect(result.type === 'result' && result.result.runs).toBe(150);

    const errors: FromWorker[] = [];
    await handleWorkerMessage('hello', (m) => errors.push(m));
    expect(errors).toEqual([{ type: 'error', name: 'TypeError', message: expect.stringContaining('run') }]);
  });
});
