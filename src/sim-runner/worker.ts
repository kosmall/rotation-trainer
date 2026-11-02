// The simulator's Web Worker (simulator Task 3; docs/data-sources.md Part H, "Worker and
// fallback"). Bundled by Vite as a module worker from client.ts
// (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`). It imports the
// framework-free core only: no React, no DOM. One run per worker: the client starts a worker per
// simulation and terminates it on the result, on an error or on Cancel (no abort message: a
// terminated worker stops at once, between any two instructions).
//
// Protocol (plain, structured-cloneable data):
//   client -> worker: { type: 'run', request: SimRequest }  (the item db inside only when needed)
//   worker -> client: { type: 'started' }                    (as soon as the request arrived)
//                     { type: 'progress', done, total }      (after each chunk of WORKER_CHUNK runs)
//                     { type: 'result', result: SimResult }
//                     { type: 'error', name, message }       (a bad request: prepareRun's error)
// The client treats an `error` EVENT before 'started' as a worker that could not start (a script
// that failed to load) and runs the simulation on the main thread instead.

import { simulate } from './run';
import type { SimRequest, SimResult } from './types';

/** Runs per chunk in the worker: about 0.12 s of default fights between progress messages. */
export const WORKER_CHUNK = 100;

export interface RunMessage {
  type: 'run';
  request: SimRequest;
}

export type FromWorker =
  | { type: 'started' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; result: SimResult }
  | { type: 'error'; name: string; message: string };

const isRunMessage = (v: unknown): v is RunMessage =>
  typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'run' && 'request' in v;

function errorMessage(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

/**
 * Answers one message: a run request gets 'started', a 'progress' per chunk and the 'result' (or an
 * 'error' when the request is invalid); anything else gets an 'error'. Never throws. Exported for
 * the tests (the real worker wires it to `self` below).
 */
export async function handleWorkerMessage(data: unknown, post: (message: FromWorker) => void): Promise<void> {
  if (!isRunMessage(data)) {
    post({ type: 'error', name: 'TypeError', message: 'The simulation worker expects a { type: "run", request } message' });
    return;
  }
  post({ type: 'started' });
  try {
    const result = await simulate(data.request, {
      chunk: WORKER_CHUNK,
      onProgress: (done, total) => post({ type: 'progress', done, total }),
    });
    post({ type: 'result', result });
  } catch (error) {
    post({ type: 'error', ...errorMessage(error) });
  }
}

/** The worker's global scope, when this module runs in a dedicated worker (not in tests or the page). */
interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const scope = globalThis as unknown as Partial<WorkerScope> & { WorkerGlobalScope?: unknown; document?: unknown };
if (typeof scope.WorkerGlobalScope === 'function' && scope.document === undefined && typeof scope.postMessage === 'function') {
  const worker = scope as WorkerScope;
  worker.addEventListener('message', (event) => {
    void handleWorkerMessage(event.data, (message) => worker.postMessage(message));
  });
}
