import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobRequest, JobResult } from '../../forever/web/api';
import { runJobAsync, type JobRunner } from '../../forever/web/client';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export interface ForeverRun {
  status: RunStatus;
  done: number;
  total: number;
  error: string | null;
  /** The newest finished result per job kind. */
  results: { ranking?: JobResult; sweep?: JobResult; duel?: JobResult; ep?: JobResult };
  run(request: JobRequest): void;
  cancel(): void;
}

/** Runs one job at a time (a new run replaces a running one); results of each kind are kept until replaced. */
export function useForeverRun(runner: JobRunner = runJobAsync): ForeverRun {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ForeverRun['results']>({});
  const abort = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStatus((s) => (s === 'running' ? 'idle' : s));
  }, []);

  const run = useCallback(
    (request: JobRequest) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setStatus('running');
      setError(null);
      setProgress({ done: 0, total: 0 });
      runner(request, { signal: ctl.signal, onProgress: (done, total) => !ctl.signal.aborted && setProgress({ done, total }) }).then(
        (res) => {
          if (ctl.signal.aborted) return;
          abort.current = null;
          setResults((r) => ({ ...r, [res.kind]: res }));
          setStatus('done');
        },
        (e: unknown) => {
          if (ctl.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
          abort.current = null;
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        },
      );
    },
    [runner],
  );

  useEffect(() => () => abort.current?.abort(), []);
  return { status, done: progress.done, total: progress.total, error, results, run, cancel };
}
