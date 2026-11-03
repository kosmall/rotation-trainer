// The global keyboard shortcuts (UI redesign spec §3.3): "g" then "s" / "f" / "r" goes to Setup,
// Fight or Report, "?" opens the shortcuts sheet. Never inside a field or an open modal (rule S5's
// guard) and never while a fight runs (every key belongs to the fight then).

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Mode } from './router';

/** Fields that take typed text or arrow keys: every key typed into them is theirs, never a hotkey. */
export const TEXT_TARGETS =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), select, textarea, [contenteditable]:not([contenteditable="false"])';
/** Toggles (a `<summary>`, checkboxes, radios, buttons): only Space and Enter belong to them, the other hotkeys still work after a click. */
export const TOGGLE_TARGETS = 'summary, button, input[type="checkbox"], input[type="radio"]';
/** An open modal (the Gear panel's item picker, the shortcuts sheet): every key pressed inside it is its own. */
export const MODAL = '[aria-modal="true"]';

/** The key was typed into a field or an open modal (rule S5): no shortcut or hotkey reads it. */
export function isInFieldOrModal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.matches(TEXT_TARGETS) || target.closest(MODAL) !== null;
}

/** How long after "g" the second key of a sequence counts. */
export const SEQUENCE_MS = 1500;

/** The second key of a "g" sequence and the mode it opens. */
export const GO_KEYS: Readonly<Record<string, Mode>> = { s: 'setup', f: 'fight', r: 'report' };

/** The sheet's rows: keys and what they do (global first, then the fight's). */
export const SHORTCUT_ROWS: readonly { keys: readonly string[]; label: string; scope: 'global' | 'fight' }[] = [
  { keys: ['G', 'S'], label: 'Go to Setup', scope: 'global' },
  { keys: ['G', 'F'], label: 'Go to Fight', scope: 'global' },
  { keys: ['G', 'R'], label: 'Go to Report', scope: 'global' },
  { keys: ['?'], label: 'Show these shortcuts', scope: 'global' },
  { keys: ['1', '…', '0', '-', '='], label: 'Cast the spell in the action bar slot', scope: 'fight' },
  { keys: ['Z', 'X', 'C', 'V', 'B', 'N'], label: 'Use the item bar slot', scope: 'fight' },
  { keys: ['Space'], label: 'Start the fight', scope: 'fight' },
  { keys: ['Esc'], label: 'Cancel the cast', scope: 'fight' },
  { keys: ['R'], label: 'Reset the fight', scope: 'fight' },
];

export interface ShortcutHandlers {
  /** False while a fight runs: no shortcut fires then. */
  enabled: boolean;
  goTo(mode: Mode): void;
  openHelp(): void;
}

/**
 * Listens for the global shortcuts on `window` in the capture phase, so the second key of a "g"
 * sequence (e.g. the "r" of "g r") is consumed before the fight's hotkeys see it.
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    /** Wall time of the last "g", or null. */
    let armedAt: number | null = null;
    function onKeyDown(event: KeyboardEvent) {
      const { enabled, goTo, openHelp } = ref.current;
      if (!enabled || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
        armedAt = null;
        return;
      }
      if (isInFieldOrModal(event.target)) {
        armedAt = null;
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const armed = armedAt !== null && Date.now() - armedAt <= SEQUENCE_MS;
      armedAt = null;
      if (armed && Object.hasOwn(GO_KEYS, key)) {
        event.preventDefault();
        event.stopImmediatePropagation(); // "g r" must never reach the fight's R (reset)
        goTo(GO_KEYS[key]!);
        return;
      }
      if (key === 'g' && !event.repeat) {
        armedAt = Date.now();
        return;
      }
      if (key === '?') {
        event.preventDefault();
        openHelp();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
