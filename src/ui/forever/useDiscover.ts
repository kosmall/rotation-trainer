import { useCallback, useEffect, useRef, useState } from 'react';
import { discover, type Budget, type DiscoverOptions, type DiscoverResult } from '../../forever/discover/engine';
import type { SpaceFilter } from '../../forever/discover/space';
import type { Settings } from '../../forever/web/api';
import { discoverOptions, workerCount, type DiscoverBudget } from '../../forever/web/discover';
import { discoverPool, type DiscoverPool } from '../../forever/web/discover-client';

export const DISCOVER_STORAGE_KEY = 'wow-forever-sim:discover:v1';

export type DiscoverStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';
export type PoolFactory = (o: DiscoverOptions, signal: AbortSignal) => DiscoverPool;
/** Test hooks: a smaller space and budget. */
export interface DiscoverTuning {
  space?: SpaceFilter;
  budget?: Budget;
}

export interface SavedDiscovery {
  settings: Settings;
  budget: DiscoverBudget;
  result: DiscoverResult;
}

export interface DiscoverRun {
  status: DiscoverStatus;
  stage: string;
  done: number;
  total: number;
  etaSec: number | null;
  error: string | null;
  saved: SavedDiscovery | null;
  run(s: Settings, budget: DiscoverBudget): void;
  cancel(): void;
}

const defaultPool: PoolFactory = (o, signal) => discoverPool(o, workerCount(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency), signal);

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object';

/** Whether a stored discovery has everything the view reads (an older or edited entry is ignored instead of breaking the view). */
function isShowable(o: unknown): o is SavedDiscovery {
  if (!isObj(o) || !isObj(o.settings) || !isObj(o.result)) return false;
  const r = o.result;
  if (!isObj(r.meta) || typeof r.meta.level !== 'number' || !Array.isArray(r.baseline) || !Array.isArray(r.top)) return false;
  if (!r.baseline.every((b) => isObj(b) && typeof b.id === 'string' && isObj(b.metrics))) return false;
  return r.top.every(
    (t) =>
      isObj(t) &&
      typeof t.rank === 'number' &&
      isObj(t.combo) &&
      isObj(t.combo.genes) &&
      isObj(t.combo.pets) &&
      isObj(t.ranks) &&
      isObj(t.perTree) &&
      isObj(t.metrics) &&
      Array.isArray(t.kphCi) &&
      isObj(t.gainVsBest) &&
      isObj(t.nearestKnown) &&
      typeof t.label === 'string',
  );
}

function loadSaved(): SavedDiscovery | null {
  try {
    const raw = window.localStorage.getItem(DISCOVER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SavedDiscovery;
    return isShowable(o) ? o : null;
  } catch {
    return null;
  }
}

/** One build discovery at a time in Web Workers; the last result is kept in localStorage. Leaving the view stops a running search. */
export function useDiscover(makePool: PoolFactory = defaultPool, tuning: DiscoverTuning = {}): DiscoverRun {
  const [status, setStatus] = useState<DiscoverStatus>('idle');
  const [prog, setProg] = useState({ stage: '', done: 0, total: 0, etaSec: null as number | null });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedDiscovery | null>(loadSaved);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const cancel = useCallback(() => abort.current?.abort(), []);

  const run = useCallback(
    (s: Settings, budget: DiscoverBudget) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      const base = discoverOptions(s, budget);
      const options: DiscoverOptions = { ...base, ...(tuning.budget ? { budget: tuning.budget } : {}), ...(tuning.space ? { space: tuning.space } : {}) };
      setStatus('running');
      setError(null);
      setProg({ stage: '', done: 0, total: 0, etaSec: null });
      const pool = makePool(options, ctl.signal);
      let stageStart = { stage: '', at: Date.now(), done: 0 };
      let lastPaint = 0;
      const progress = (stage: string, done: number, total: number): void => {
        if (ctl.signal.aborted) return;
        const now = Date.now();
        if (stage !== stageStart.stage) stageStart = { stage, at: now, done };
        if (stage === stageStart.stage && now - lastPaint < 250 && done < total && done !== stageStart.done) return;
        lastPaint = now;
        const rate = (done - stageStart.done) / Math.max(0.001, (now - stageStart.at) / 1000);
        setProg({ stage, done, total, etaSec: rate > 0 && done < total ? (total - done) / rate : null });
      };
      discover(options, pool.runner, { progress })
        .then((result) => {
          if (ctl.signal.aborted) return;
          const next = { settings: s, budget, result };
          setSaved(next);
          try {
            window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* private mode or full storage: the result is not remembered */
          }
          setStatus('done');
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) setStatus('aborted');
          else {
            setError(e instanceof Error ? e.message : String(e));
            setStatus('error');
          }
        })
        .finally(() => pool.close());
    },
    [makePool, tuning.budget, tuning.space],
  );

  return { status, ...prog, error, saved, run, cancel };
}
