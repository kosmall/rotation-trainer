// Runs a Forever job in a module Web Worker (progress, cancel); without a Worker (Node, jsdom, a
// script that fails to load) the same tasks run on the main thread, yielding between them.

import { planJob, type JobRequest, type JobResult } from './api';
import type { FromWorker } from './worker';

export interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  /** Aborting terminates the worker (or stops the loop) and rejects with an AbortError. */
  signal?: AbortSignal;
}

export type JobRunner = (request: JobRequest, options?: RunOptions) => Promise<JobResult>;

const abortError = () => new DOMException('The simulation was aborted', 'AbortError');

export async function runOnMainThread(request: JobRequest, options: RunOptions = {}): Promise<JobResult> {
  const job = planJob(request);
  const outs: unknown[] = [];
  for (let i = 0; i < job.total; i++) {
    if (options.signal?.aborted) throw abortError();
    outs.push(job.run(i));
    options.onProgress?.(i + 1, job.total);
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  if (options.signal?.aborted) throw abortError();
  return job.assemble(outs);
}

function startWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export const runJobAsync: JobRunner = (request, options = {}) => {
  if (options.signal?.aborted) return Promise.reject(abortError());
  const worker = startWorker();
  if (!worker) return runOnMainThread(request, options);
  return new Promise<JobResult>((resolve, reject) => {
    let heard = false;
    const finish = () => {
      worker.terminate();
      options.signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    options.signal?.addEventListener('abort', onAbort);
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      heard = true;
      const m = e.data;
      if (m.type === 'progress') options.onProgress?.(m.done, m.total);
      else if (m.type === 'result') {
        finish();
        resolve(m.result);
      } else if (m.type === 'error') {
        finish();
        const err = new Error(m.message);
        err.name = m.name;
        reject(err);
      }
    };
    worker.onerror = (e) => {
      finish();
      if (!heard) {
        runOnMainThread(request, options).then(resolve, reject);
      } else reject(new Error(e.message || 'worker error'));
    };
    worker.postMessage({ type: 'run', request });
  });
};
