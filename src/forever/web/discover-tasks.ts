// The tasks a discovery worker runs: discovery tasks (engine) and completion tasks (complete.ts).

import { completeBuilds, runCompleteTask, type CompleteResult, type CompleteTask } from '../discover/complete';
import { runTask, type DiscoverOptions, type Task, type TaskResult } from '../discover/engine';

export type AnyTask = Task | CompleteTask;
export type AnyResult = TaskResult | CompleteResult;

export function runAnyTask(options: DiscoverOptions, t: AnyTask): AnyResult {
  return t.kind.startsWith('complete-') ? runCompleteTask(t as CompleteTask) : runTask(options, t as Task);
}

export { completeBuilds };
