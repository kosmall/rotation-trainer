// The fight's keys (spec §3.3): slot keys cast, Space starts (or resumes), Esc cancels the cast,
// R resets, Enter on an ended fight opens the Report. Mounted with the Fight view only, so the
// keys do nothing on the Setup and Report screens. Rule S5: keys typed into a field or an open
// modal are theirs; a focused toggle keeps Space and Enter.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { keyToSlot } from '../keys';
import { MODAL, TEXT_TARGETS, TOGGLE_TARGETS } from '../shell/shortcuts';

/** The key belongs to the focused field, modal or toggle (rule S5), not to the fight. */
export function isHotkeyBlocked(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof Element)) return false;
  if (target.matches(TEXT_TARGETS) || target.closest(MODAL) !== null) return true;
  return target.matches(TOGGLE_TARGETS) && (event.key === ' ' || event.key === 'Enter');
}

export interface FightHotkeyHandlers {
  pressSlot(slot: number): void;
  cancel(): void;
  start(): void;
  reset(): void;
  /** Enter after the fight ended (the "Fight over" card's Open Report); absent: Enter is not a fight key. */
  openReport?: () => void;
  /** The fight has ended (Enter opens the Report then). */
  ended?: boolean;
}

/** Listens for the fight's keys on `window` while the calling component is mounted. */
export function useFightHotkeys(handlers: FightHotkeyHandlers): void {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isHotkeyBlocked(event)) return; // e.g. digits or Z typed into a number field, Space on a focused toggle
      const { pressSlot, cancel, start, reset, openReport, ended } = ref.current;
      if (event.key === 'Enter') {
        if (!ended || openReport === undefined) return;
        event.preventDefault();
        openReport();
        return;
      }
      const slot = keyToSlot(event.key); // 1-9, 0, -, = and the item row's keys (ITEM_SLOT_KEYS, either case)
      const handled = slot !== undefined || event.key === 'Escape' || event.key === ' ' || event.key === 'r' || event.key === 'R';
      if (!handled) return;
      event.preventDefault();
      if (event.repeat) return; // a held key must not spam the queue
      if (slot !== undefined) pressSlot(slot);
      else if (event.key === 'Escape') cancel();
      else if (event.key === ' ') start(); // starts, or resumes a paused fight; no-op while it runs
      else reset();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
