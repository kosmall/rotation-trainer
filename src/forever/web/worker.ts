/// <reference lib="webworker" />
// The Forever simulation worker: runs the tasks of a job one by one and posts progress after each.
import { planJob, type JobRequest, type JobResult } from './api';

export type ToWorker = { type: 'run'; request: JobRequest };
export type FromWorker =
  | { type: 'started' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; result: JobResult }
  | { type: 'error'; name: string; message: string };

if (typeof self !== 'undefined' && 'postMessage' in self && typeof (self as { document?: unknown }).document === 'undefined') {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = (e: MessageEvent<ToWorker>) => {
    const post = (m: FromWorker) => scope.postMessage(m);
    try {
      post({ type: 'started' });
      const job = planJob(e.data.request);
      const outs: unknown[] = [];
      for (let i = 0; i < job.total; i++) {
        outs.push(job.run(i));
        post({ type: 'progress', done: i + 1, total: job.total });
      }
      post({ type: 'result', result: job.assemble(outs) });
    } catch (err) {
      const x = err instanceof Error ? err : new Error(String(err));
      post({ type: 'error', name: x.name, message: x.message });
    }
  };
}
