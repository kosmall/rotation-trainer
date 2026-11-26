// Worker thread of `forever:discover`: runs discovery tasks for the main thread.
import { parentPort, workerData } from 'node:worker_threads';
import { runTask, type DiscoverOptions, type Task } from '../src/forever/discover/engine';

const options = workerData as DiscoverOptions;
parentPort?.on('message', (msg: { i: number; task: Task }) => {
  parentPort?.postMessage({ i: msg.i, result: runTask(options, msg.task) });
});
