import { useCallback, useEffect, useRef, useState } from 'react';
import { discover, type Budget, type DiscoverOptions, type DiscoverResult } from '../../forever/discover/engine';
import type { SpaceFilter } from '../../forever/discover/space';
import type { Settings } from '../../forever/web/api';
import { VARIANT_IDS } from '../../forever/builds';
import { enumerateCombos } from '../../forever/discover/space';
import { discoverEtaSec, discoverOptions, workerCount, type DiscoverBudget } from '../../forever/web/discover';
import { completeBuilds, completeEtaSec, COMPLETE_FULL, COMPLETE_QUICK, type CompleteBudget, type CompletedBuild, type CompleteResult, type CompleteTask } from '../../forever/discover/complete';
import type { Runner } from '../../forever/discover/engine';
import { discoverPool, type Pool } from '../../forever/web/discover-client';
import type { AnyResult, AnyTask } from '../../forever/web/discover-tasks';

export const DISCOVER_STORAGE_KEY = 'wow-forever-sim:discover:v1';

export type DiscoverStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';
export type PoolFactory = (o: DiscoverOptions, signal: AbortSignal) => Pool<AnyTask, AnyResult>;
/** Test hooks: a smaller space and budget. */
export interface DiscoverTuning {
  space?: SpaceFilter;
  budget?: Budget;
  /** Completion: a smaller budget and an earlier last level. */
  completeBudget?: CompleteBudget;
  toLevel?: number;
}

/** The last level a found build is completed to. */
export const COMPLETE_TO_LEVEL = 59;

export interface SavedDiscovery {
  settings: Settings;
  budget: DiscoverBudget;
  result: DiscoverResult;
  /** Found builds completed to the last level (dropped when a new search replaces the result). */
  completions?: CompletedBuild[];
}

export interface DiscoverRun {
  status: DiscoverStatus;
  stage: string;
  done: number;
  total: number;
  etaSec: number | null;
  error: string | null;
  saved: SavedDiscovery | null;
  /** What is running: the search or completing chosen results. */
  job: 'search' | 'complete' | null;
  /** The level found builds are completed to. */
  toLevel: number;
  /** The completion that has just finished (a new object every time, also for the same builds); null while anything runs. */
  completed: { ranks: number[] } | null;
  run(s: Settings, budget: DiscoverBudget): void;
  /** Completes the results with these ranks to `toLevel` (settings of the shown result). */
  complete(ranks: readonly number[], budget: DiscoverBudget): void;
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

const isCompletion = (c: unknown): boolean =>
  isObj(c) &&
  typeof c.rank === 'number' &&
  typeof c.label === 'string' &&
  typeof c.fromLevel === 'number' &&
  typeof c.toLevel === 'number' &&
  isObj(c.combo) &&
  isObj(c.combo.genes) &&
  isObj(c.combo.pets) &&
  isObj(c.baseRanks) &&
  Array.isArray(c.path) &&
  c.path.every((p) => typeof p === 'string') &&
  Array.isArray(c.perLevel) &&
  c.perLevel.every((p) => isObj(p) && typeof p.level === 'number' && typeof p.pick === 'string' && typeof p.kph === 'number') &&
  typeof c.avgKph === 'number' &&
  typeof c.greedyAvgKph === 'number';

function loadSaved(): SavedDiscovery | null {
  try {
    const raw = window.localStorage.getItem(DISCOVER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SavedDiscovery;
    if (!isShowable(o)) return null;
    // unreadable completions are dropped, the result stays
    if (o.completions !== undefined && !(Array.isArray(o.completions) && o.completions.every(isCompletion))) delete o.completions;
    return o;
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
  const [job, setJob] = useState<'search' | 'complete' | null>(null);
  const [completed, setCompleted] = useState<{ ranks: number[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  const toLevel = tuning.toLevel ?? COMPLETE_TO_LEVEL;
  const persist = (next: SavedDiscovery): void => {
    savedRef.current = next;
    setSaved(next);
    try {
      window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode or full storage: the result is not remembered */
    }
  };
  const failWith = (ctl: AbortController, e: unknown): void => {
    // a run replaced by a newer one says nothing
    if (abort.current !== ctl) return;
    if (ctl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) setStatus('aborted');
    else {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

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
      setJob('search');
      setCompleted(null);
      setError(null);
      setProg({ stage: '', done: 0, total: 0, etaSec: null });
      const pool = makePool(options, ctl.signal);
      let stageStart = { stage: '', at: Date.now(), done: 0 };
      let lastPaint = 0;
      const combos = enumerateCombos(options.level, options.space).length;
      const current = (): boolean => abort.current === ctl && !ctl.signal.aborted;
      const progress = (stage: string, done: number, total: number): void => {
        if (!current()) return;
        const now = Date.now();
        if (stage !== stageStart.stage) stageStart = { stage, at: now, done };
        if (stage === stageStart.stage && now - lastPaint < 250 && done < total && done !== stageStart.done) return;
        lastPaint = now;
        const etaSec = discoverEtaSec({ stage, done: done - stageStart.done, total: total - stageStart.done, stageElapsedSec: (now - stageStart.at) / 1000, budget: options.budget, combos, baselines: VARIANT_IDS.length });
        setProg({ stage, done, total, etaSec });
      };
      discover(options, pool.runner.bind(pool) as unknown as Runner, { progress })
        .then((result) => {
          if (!current()) return;
          persist({ settings: s, budget, result });
          setStatus('done');
        })
        .catch((e: unknown) => failWith(ctl, e))
        .finally(() => pool.close());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [makePool, tuning.budget, tuning.space],
  );

  const complete = useCallback(
    (ranks: readonly number[], budget: DiscoverBudget) => {
      const shown = savedRef.current;
      if (!shown) return;
      const rows = shown.result.top.filter((t) => ranks.includes(t.rank)).map((t) => ({ rank: t.rank, label: t.label, combo: t.combo, ranks: t.ranks }));
      if (rows.length === 0 || shown.result.meta.level >= toLevel) return;
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      const options = discoverOptions(shown.settings, budget);
      const pool = makePool(options, ctl.signal);
      const current = (): boolean => abort.current === ctl && !ctl.signal.aborted;
      setStatus('running');
      setJob('complete');
      setCompleted(null);
      setError(null);
      setProg({ stage: '', done: 0, total: 0, etaSec: null });
      let stageStart = { stage: '', at: Date.now() };
      const cb = tuning.completeBudget ?? (budget === 'full' ? COMPLETE_FULL : COMPLETE_QUICK);
      const n = Math.max(0, toLevel - shown.result.meta.level);
      const progress = (stage: string, done: number, total: number): void => {
        if (!current()) return;
        const now = Date.now();
        if (stage !== stageStart.stage) stageStart = { stage, at: now };
        const etaSec = completeEtaSec({ stage, done, total, stageElapsedSec: (now - stageStart.at) / 1000, budget: cb, rows: rows.length, pathLength: n });
        setProg({ stage: `complete-${stage}`, done, total, etaSec });
      };
      const base = { fromLevel: shown.result.meta.level, toLevel, profile: options.profile, mobs: options.mobs, params: options.params, seed: options.seed };
      completeBuilds(rows, base, cb, pool.runner.bind(pool) as unknown as (t: CompleteTask[], d: (r: CompleteResult) => void) => Promise<CompleteResult[]>, progress)
        .then((done) => {
          if (!current()) return;
          const latest = savedRef.current;
          if (!latest || latest.result !== shown.result) return;
          const kept = (latest.completions ?? []).filter((c) => !done.some((d) => d.rank === c.rank));
          persist({ ...latest, completions: [...kept, ...done].sort((a, b) => a.rank - b.rank) });
          setCompleted({ ranks: done.map((c) => c.rank).sort((a, b) => a - b) });
          setStatus('done');
        })
        .catch((e: unknown) => failWith(ctl, e))
        .finally(() => pool.close());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [makePool, tuning.completeBudget, toLevel],
  );

  return { status, ...prog, error, saved, job, toLevel, completed, run, complete, cancel };
}
