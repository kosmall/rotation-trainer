// The reject flash of an action bar slot: which rejected presses flash, with what label (moved
// here from the legacy ActionBar when the legacy layout was removed, redesign Task 5).

import type { CastResult } from '../../engine/types';

export type RejectReason = Extract<CastResult, { ok: false }>['reason'];

/** Rejections worth flashing on the slot, with their label. */
export const REJECT_LABELS: Partial<Record<RejectReason, string>> = {
  cooldown: 'Cooldown',
  gcd: 'GCD',
  busy: 'Busy',
  'no-mana': 'No mana',
  'missing-aura': 'Missing aura',
};

export interface SlotFlash {
  slot: number;
  label: string;
  /** Changes on every rejected press, so the same flash twice restarts the animation. */
  id: number;
}
