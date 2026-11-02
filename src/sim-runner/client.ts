// Runs a simulation off the main thread (simulator Task 3; docs/data-sources.md Part H, "Worker and
// fallback"): a module Web Worker per run (worker.ts), with progress and Cancel; when no worker can
// start (no `Worker`, as in Node and jsdom; a constructor that throws; a worker script that fails
// to load), the same `simulate()` on the main thread in small chunks. Both give the same result
// (`simulate` is independent of the chunk size). Framework-free.

import { simulate } from './run';
import type { SimRequest, SimResult } from './types';
import type { FromWorker } from './worker';

export interface RunOptions {
  /** Called with the runs done so far and the total (after each chunk). */
  onProgress?: (done: number, total: number) => void;
  /** Aborting terminates the worker (or stops the main-thread loop) and rejects with an AbortError. */
  signal?: AbortSignal;
}

/** What runs a simulation (`runSimulation`; tests inject their own). */
export type SimRunner = (request: SimRequest, options?: RunOptions) => Promise<SimResult>;

/**
 * Runs per chunk on the main thread: about 12 ms of default 60 s fights (60 ms for 300 s fights)
 * between yields, so the page keeps answering while a fallback run goes on.
 */
export const FALLBACK_CHUNK = 10;

const abortError = () => new DOMException('The simulation was aborted', 'AbortError');

/** The simulation on the main thread, in chunks of `FALLBACK_CHUNK` yielding with setTimeout(0). */
export function runOnMainThread(request: SimRequest, options: RunOptions = {}): Promise<SimResult> {
  return simulate(request, { chunk: FALLBACK_CHUNK, onProgress: options.onProgress, signal: options.signal });
}

/** A new simulation worker, or null when this environment cannot start one. */
function startWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    // The literal form Vite recognises: the worker is bundled as its own chunk.
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

function errorFrom(m: { name: string; message: string }): Error {
  const error = m.name === 'TypeError' ? new TypeError(m.message) : new Error(m.message);
  if (error.name !== m.name) error.name = m.name;
  return error;
}

/**
 * Runs `request` in a new module worker and resolves with its result. The request is
 * structured-cloned into the worker (plain data; the caller adds the item database only when the
 * gear needs it). `onProgress` gets the worker's progress (one message per chunk). The worker is
 * terminated when the result or an error arrives and on abort (then the promise rejects with a
 * DOMException named 'AbortError' and nothing more is reported). Falls back to `runOnMainThread`
 * when no worker can start: no `Worker`, a throwing constructor, a request that cannot be cloned,
 * or an `error` event before the worker's first message (its script failed to load). An `error`
 * event after that rejects; an `error` message (an invalid request) rejects with that error's name
 * and message.
 */
export function runSimulation(request: SimRequest, options: RunOptions = {}): Promise<SimResult> {
  const { onProgress, signal } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  const worker = startWorker();
  if (worker === null) return runOnMainThread(request, options);

  return new Promise<SimResult>((resolve, reject) => {
    let started = false;
    let settled = false;
    const settle = () => {
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const fallback = () => {
      settle();
      runOnMainThread(request, options).then(resolve, reject);
    };
    function onAbort() {
      if (settled) return;
      settle();
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (settled) return;
      const m = event.data;
      switch (m?.type) {
        case 'started':
          started = true;
          break;
        case 'progress':
          started = true;
          onProgress?.(m.done, m.total);
          break;
        case 'result':
          settle();
          resolve(m.result);
          break;
        case 'error':
          settle();
          reject(errorFrom(m));
          break;
        default:
          break;
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      if (settled) return;
      event.preventDefault?.(); // handled here: not an uncaught error in the console
      if (!started) {
        fallback();
        return;
      }
      settle();
      reject(new Error(`The simulation worker failed: ${event.message || 'unknown error'}`));
    };
    worker.onmessageerror = () => {
      if (settled) return;
      settle();
      reject(new Error('The simulation worker sent a message that could not be read'));
    };
    try {
      worker.postMessage({ type: 'run', request });
    } catch {
      fallback(); // not cloneable (e.g. a proxy): the main thread reads it as is
    }
  });
}
