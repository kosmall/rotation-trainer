// Report → Compare's run (rotation scripts Task 5, spec §2 C): the state of a paired comparison
// (src/sim-runner/compare.ts) as the Simulator tab keeps its run (`useSimulatorRun`): Runs and
// Seed fields (clamped on blur; a blank seed draws one), Run / Cancel, progress (the bar on every
// update, a polite text at most once per second) and the last result. It lives in ReportView, so
// it survives switching tabs; leaving the Report stops a run. A finished comparison is also kept in
// the trainer (`recordComparison`), so the result is still there when the Report opens again.
// The requests are built by the panel at the click (a snapshot of the setup and the scenarios).

import { useEffect, useId, useRef, useState } from 'react';
import type { SetupConfig } from '../../setup/types';
import type { SimRequest } from '../../sim-runner/types';
import { formatInt } from '../format';
import { aboutText, ANNOUNCE_EVERY_MS, DEFAULT_RUNS, durationText, parseRuns, parseSeed, randomSeed } from '../SimulatorPanel';
import type { CompareRunner, LastComparison } from '../state/TrainerProvider';

/** The default runner: `runComparison` (a worker, or the main thread), loaded on the first run. */
export const lazyRunComparison: CompareRunner = (requests, options) =>
  import('../../sim-runner/client').then((m) => m.runComparison(requests, options));

/** What a comparison runs: one request per row (same runs and seed), the rows' names and configs. */
export interface CompareRequestSet {
  requests: SimRequest[];
  names: string[];
  configs: SetupConfig[];
}

export interface CompareRunState {
  id: string;
  runsText: string;
  runs: number;
  seedText: string;
  running: { done: number; total: number } | null;
  status: string;
  outcome: LastComparison | null;
  changeRuns(text: string): void;
  commitRuns(): void;
  changeSeed(text: string): void;
  commitSeed(): void;
  /** Runs the requests `build` makes for the committed runs and seed (null: nothing to run). */
  run(build: (runs: number, seed: number) => CompareRequestSet | null): void;
  cancel(): void;
  reuseSeed(seed: number): void;
}

export interface CompareRunOptions {
  runner?: CompareRunner;
  /** The trainer's last comparison: shown until a new one finishes. */
  initial: LastComparison | null;
  onResult?(comparison: LastComparison): void;
}

export function useCompareRun({ runner = lazyRunComparison, initial, onResult }: CompareRunOptions): CompareRunState {
  const id = useId();
  const [runsText, setRunsText] = useState(String(DEFAULT_RUNS));
  const [runs, setRuns] = useState(DEFAULT_RUNS);
  const [seedText, setSeedText] = useState('');
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState<LastComparison | null>(initial);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const lastAnnounceRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(
    () => () => {
      runIdRef.current++;
      controllerRef.current?.abort();
    },
    [],
  );

  const commitRuns = () => {
    const n = parseRuns(runsText) ?? runs;
    setRuns(n);
    setRunsText(String(n));
    return n;
  };
  const commitSeed = () => {
    const n = parseSeed(seedText);
    setSeedText(n === null ? '' : String(n));
    return n;
  };

  const run = (build: (runs: number, seed: number) => CompareRequestSet | null) => {
    if (running !== null) return;
    const n = commitRuns();
    const seed = commitSeed() ?? randomSeed();
    const set = build(n, seed);
    if (set === null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    const startedAt = performance.now();
    const total = n * set.requests.length;
    lastAnnounceRef.current = Number.NEGATIVE_INFINITY;
    setRunning({ done: 0, total });
    setStatus(`Running ${formatInt(total)} fights…`);
    const onProgress = (done: number, all: number) => {
      if (runId !== runIdRef.current) return;
      setRunning({ done, total: all });
      const now = performance.now();
      if (now - lastAnnounceRef.current < ANNOUNCE_EVERY_MS) return;
      lastAnnounceRef.current = now;
      const elapsed = now - startedAt;
      const left = done > 0 && elapsed > 0 ? ((all - done) * elapsed) / done : null;
      setStatus(
        `Running: ${formatInt(done)} of ${formatInt(all)} fights (${Math.floor((done / all) * 100)}%)` +
          (left !== null && done < all ? `, ${aboutText(left)} left.` : '.'),
      );
    };
    let pending: ReturnType<CompareRunner>;
    try {
      pending = runner(set.requests, { onProgress, signal: controller.signal });
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (result) => {
        if (runId !== runIdRef.current) return;
        controllerRef.current = null;
        setRunning(null);
        const comparison: LastComparison = { result, names: set.names, configs: set.configs };
        setOutcome(comparison);
        setStatus(`Done: ${formatInt(result.runs * result.results.length)} fights in ${durationText(performance.now() - startedAt)}.`);
        onResult?.(comparison);
      },
      (error: unknown) => {
        if (runId !== runIdRef.current) return;
        controllerRef.current = null;
        setRunning(null);
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        const message = error instanceof Error || error instanceof DOMException ? error.message : String(error);
        setStatus(aborted ? 'Cancelled: the previous result is kept.' : `The comparison failed (${message}). The previous result is kept.`);
      },
    );
  };

  const cancel = () => {
    runIdRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(null);
    setStatus('Cancelled: the previous result is kept.');
  };

  return {
    id,
    runsText,
    runs,
    seedText,
    running,
    status,
    outcome,
    changeRuns: (text) => {
      setRunsText(text);
      const v = parseRuns(text);
      if (v !== null) setRuns(v);
    },
    commitRuns: () => void commitRuns(),
    changeSeed: setSeedText,
    commitSeed: () => void commitSeed(),
    run,
    cancel,
    reuseSeed: (seed) => setSeedText(String(seed)),
  };
}
