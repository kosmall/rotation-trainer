/// <reference lib="webworker" />
// A build discovery worker: gets the search options once, then runs the tasks it is sent.
import type { DiscoverOptions } from '../discover/engine';
import { runAnyTask, type AnyTask } from './discover-tasks';

if (typeof self !== 'undefined' && 'postMessage' in self && typeof (self as { document?: unknown }).document === 'undefined') {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  let options: DiscoverOptions | null = null;
  scope.onmessage = (e: MessageEvent<{ type: 'init'; options: DiscoverOptions } | { i: number; task: AnyTask }>) => {
    const m = e.data;
    if ('type' in m) {
      options = m.options;
      return;
    }
    if (!options) throw new Error('discovery worker used before init');
    scope.postMessage({ i: m.i, result: runAnyTask(options, m.task) });
  };
}
