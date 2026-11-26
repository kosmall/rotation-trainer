// Runs build discovery tasks on a pool of module Web Workers (results in task order, abort stops
// every worker); without Worker support the tasks run on the main thread, yielding between them.

import { runTask, type DiscoverOptions, type Runner, type Task, type TaskResult } from '../discover/engine';

export interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

export interface DiscoverPool {
  runner: Runner;
  close(): void;
}

const abortError = (): DOMException => new DOMException('The search was aborted', 'AbortError');

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./discover-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

function inlinePool(options: DiscoverOptions, signal: AbortSignal): DiscoverPool {
  const runner: Runner = async (tasks, onDone) => {
    const out: TaskResult[] = [];
    for (const t of tasks) {
      if (signal.aborted) throw abortError();
      const r = runTask(options, t);
      out.push(r);
      onDone(r);
      await new Promise<void>((res) => setTimeout(res, 0));
    }
    if (signal.aborted) throw abortError();
    return out;
  };
  return { runner, close: () => undefined };
}

export function discoverPool(options: DiscoverOptions, n: number, signal: AbortSignal, makeWorker: () => WorkerLike | null = defaultWorker): DiscoverPool {
  const first = makeWorker();
  if (!first) return inlinePool(options, signal);
  const workers: WorkerLike[] = [first];
  for (let i = 1; i < n; i++) {
    const w = makeWorker();
    if (w) workers.push(w);
  }
  for (const w of workers) w.postMessage({ type: 'init', options });
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const w of workers) w.terminate();
  };
  let failCurrent: ((e: unknown) => void) | null = null;
  signal.addEventListener('abort', () => {
    close();
    failCurrent?.(abortError());
  });

  const runner: Runner = (tasks: Task[], onDone) =>
    new Promise<TaskResult[]>((resolve, reject) => {
      if (signal.aborted || closed) return reject(abortError());
      const out: TaskResult[] = new Array(tasks.length);
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
          close();
          fail(new Error(e.message || 'discovery worker error'));
        };
        w.onmessage = (e) => {
          if (failed) return;
          const m = e.data as { i: number; result: TaskResult };
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
