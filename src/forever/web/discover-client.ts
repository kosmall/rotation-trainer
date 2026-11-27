// Runs build discovery tasks on a pool of module Web Workers (results in task order, abort stops
// every worker); without Worker support the tasks run on the main thread, yielding between them.

import type { DiscoverOptions, Task, TaskResult } from '../discover/engine';
import { runAnyTask, type AnyResult, type AnyTask } from './discover-tasks';

export interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

/** A pool that runs tasks of one kind (discovery or completion) and returns their results in task order. */
export interface Pool<T, R> {
  runner(tasks: T[], onDone: (r: R) => void): Promise<R[]>;
  close(): void;
}
export type DiscoverPool = Pool<Task, TaskResult>;

const abortError = (): DOMException => new DOMException('The search was aborted', 'AbortError');

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./discover-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

function inlinePool<T extends AnyTask, R extends AnyResult>(options: DiscoverOptions, signal: AbortSignal): Pool<T, R> {
  const runner = async (tasks: T[], onDone: (r: R) => void): Promise<R[]> => {
    const out: R[] = [];
    for (const t of tasks) {
      if (signal.aborted) throw abortError();
      const r = runAnyTask(options, t) as R;
      out.push(r);
      onDone(r);
      await new Promise<void>((res) => setTimeout(res, 0));
    }
    if (signal.aborted) throw abortError();
    return out;
  };
  return { runner, close: () => undefined };
}

export function discoverPool<T extends AnyTask = Task, R extends AnyResult = TaskResult>(options: DiscoverOptions, n: number, signal: AbortSignal, makeWorker: () => WorkerLike | null = defaultWorker): Pool<T, R> {
  const first = makeWorker();
  if (!first) return inlinePool<T, R>(options, signal);
  const workers: WorkerLike[] = [first];
  for (let i = 1; i < n; i++) {
    const w = makeWorker();
    if (w) workers.push(w);
  }
  for (const w of workers) {
    w.onerror = (e) => {
      failure = new Error(e.message || 'discovery worker error');
      close();
    };
    w.postMessage({ type: 'init', options });
  }
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const w of workers) w.terminate();
  };
  let failCurrent: ((e: unknown) => void) | null = null;
  /** The error a worker died with: every later call fails with it, not as an abort. */
  let failure: Error | null = null;
  signal.addEventListener('abort', () => {
    close();
    failCurrent?.(abortError());
  });

  const runner = (tasks: T[], onDone: (r: R) => void): Promise<R[]> =>
    new Promise<R[]>((resolve, reject) => {
      if (failure) return reject(failure);
      if (signal.aborted || closed) return reject(abortError());
      const out: R[] = new Array(tasks.length);
      let next = 0;
      let finished = 0;
      let failed = false;
      const fail = (e: unknown): void => {
        if (failed) return;
        failed = true;
        failCurrent = null;
        reject(e);
      };
      failCurrent = fail;
      if (tasks.length === 0) return resolve(out);
      const feed = (w: WorkerLike): void => {
        if (next < tasks.length) w.postMessage({ i: next, task: tasks[next++] });
      };
      for (const w of workers) {
        w.onerror = (e) => {
          failure = new Error(e.message || 'discovery worker error');
          close();
          fail(failure);
        };
        w.onmessage = (e) => {
          if (failed) return;
          const m = e.data as { i: number; result: R };
          out[m.i] = m.result;
          finished++;
          onDone(m.result);
          if (finished === tasks.length) {
            failCurrent = null;
            resolve(out);
          } else feed(w);
        };
        feed(w);
      }
    });
  return { runner, close };
}
