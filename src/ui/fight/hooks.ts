// Small hooks of the Fight screen: a throttle on fight time, the reduced-motion preference, a
// UI preference, and a dev-only render counter (the render budget test and Task 5's profiling).

import { useCallback, useState, useSyncExternalStore } from 'react';
import { readUiPrefs, writeUiPref } from '../theme/theme';
import type { UiStorage } from '../theme/theme';

/**
 * `value` as of the last time it was taken: a new value is taken when `clockMs` has moved at least
 * `intervalMs` since the last one (or back: a new fight), or when `flush` is true (the fight's end,
 * so the last numbers always show). No timer: the state follows the props during render (React's
 * "storing information from previous renders" pattern), so a paused clock takes nothing new.
 */
export function useThrottledValue<T>(value: T, intervalMs: number, clockMs: number, flush = false): T {
  const [state, setState] = useState<{ value: T; at: number }>(() => ({ value, at: clockMs }));
  if (state.value !== value && (flush || clockMs - state.at >= intervalMs || clockMs < state.at)) {
    const next = { value, at: clockMs };
    setState(next);
    return value;
  }
  return state.value;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function reducedQuery(): MediaQueryList | null {
  try {
    return typeof matchMedia === 'function' ? matchMedia(REDUCED) : null;
  } catch {
    return null;
  }
}

function subscribeReduced(onChange: () => void): () => void {
  const query = reducedQuery();
  if (query === null || typeof query.addEventListener !== 'function') return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readReduced = () => reducedQuery()?.matches === true;

/** The user asked for reduced motion (`prefers-reduced-motion: reduce`); false where unknown. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}

/**
 * A boolean UI preference under `rotation-trainer:ui:v1` (read once at mount, written on change;
 * a blocked storage keeps it for this page only).
 */
export function useUiFlag(storage: UiStorage | null, key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const stored = readUiPrefs(storage)[key];
    return typeof stored === 'boolean' ? stored : fallback;
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      writeUiPref(storage, key, next);
    },
    [storage, key],
  );
  return [value, set];
}

/** The dev-only render counter (src/ui/renderCount.ts), re-exported for the Fight components. */
export { countRender } from '../renderCount';
