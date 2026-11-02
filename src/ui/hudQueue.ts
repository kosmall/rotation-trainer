// Combat text HUD: the texts on screen (scrolling combat text Task 1, design spec §3): merging of
// DoT ticks and small mana gains, the anti-spam cap, lanes and expiry. Framework-free; times are
// the UI loop's ms (`nowMs`), except the merge windows, which compare the events' fight times.

import type { HudArea, HudEvent } from './hudEvents';
import { formatHudText } from './hudFormat';
import type { HudSettings } from './hudSettings';

/** A text on screen. */
export interface HudText extends HudEvent {
  /** UI time it was shown at. */
  bornMs: number;
  /** UI time it goes away (`bornMs + durationMs` of the settings it was shown with). */
  expiresAtMs: number;
}

/** Lanes per area: consecutive texts of an area take the next lane (round robin), so they never start on top of each other. */
export const HUD_LANES = 3;

/** Mana gains below `mergeManaBelow` merge within this many ms of fight time (design spec §3: 2 s). */
export const MANA_MERGE_WINDOW_MS = 2000;

/**
 * Most sticky texts waiting for room (a burst of 100 events fits). Only past this many waiting is
 * the oldest waiting one dropped: the one case a crit or proc text can be lost.
 */
export const HUD_MAX_PENDING = 100;

/**
 * The texts on screen, oldest first.
 * - `push`: a tick merges into a live tick text with the same key whose first tick is at most
 *   `mergeTicks` ms of fight time older (amounts summed, text rebuilt, same id, lane and life);
 *   a mana gain below `mergeManaBelow` merges the same way into a live small-gains text within
 *   `MANA_MERGE_WINDOW_MS`. Any other event becomes a new text on the area's next lane. At
 *   `maxTexts` the oldest non-sticky text goes first (the new one, if it is the only non-sticky);
 *   a sticky text (crit, proc) is never dropped: when every text on screen is sticky it waits in
 *   a pending list and comes up as soon as there is room (at most `HUD_MAX_PENDING` waiting;
 *   only past that the oldest waiting one is dropped).
 * - `expire(nowMs)`: removes the texts whose time is up, then shows waiting ones.
 */
export class HudQueue {
  private visible: HudText[] = [];
  private pending: HudEvent[] = [];
  private nextLane: Record<HudArea, number> = { outgoing: 0, notifications: 0 };
  private last: { maxTexts: number; durationMs: number } = { maxTexts: 24, durationMs: 1600 };

  /** The texts on screen (a new array; texts are replaced, never mutated, when merged). */
  items(): readonly HudText[] {
    return this.visible.slice();
  }

  /** Sticky texts waiting for room. */
  pendingCount(): number {
    return this.pending.length;
  }

  /** Removes everything (a reset or a new fight). */
  clear(): void {
    this.visible = [];
    this.pending = [];
    this.nextLane = { outgoing: 0, notifications: 0 };
  }

  push(events: readonly HudEvent[], nowMs: number, settings: HudSettings): void {
    this.last = { maxTexts: settings.maxTexts, durationMs: settings.durationMs };
    this.trim();
    this.promote(nowMs);
    for (const e of events) this.mergeOrAdd(e, nowMs, settings);
  }

  expire(nowMs: number): void {
    if (this.visible.some((t) => nowMs >= t.expiresAtMs)) this.visible = this.visible.filter((t) => nowMs < t.expiresAtMs);
    this.promote(nowMs);
  }

  /** Merges `e` into a live text of its merge key, or shows it. */
  private mergeOrAdd(e: HudEvent, nowMs: number, s: HudSettings): void {
    let key: string | undefined;
    let windowMs = 0;
    if (e.kind === 'tick' && e.key !== undefined && s.mergeTicks > 0) {
      key = e.key;
      windowMs = s.mergeTicks;
    } else if (e.kind === 'mana' && s.mergeManaBelow > 0 && (e.amount ?? 0) < s.mergeManaBelow) {
      key = 'mana:small';
      windowMs = MANA_MERGE_WINDOW_MS;
    }
    if (key !== undefined) {
      // The merge target is the newest live text of that key, if its first event is recent enough.
      for (let i = this.visible.length - 1; i >= 0; i--) {
        const t = this.visible[i]!;
        if (t.kind !== e.kind || t.key !== key) continue;
        const dt = e.atMs - t.atMs;
        if (dt < 0 || dt > windowMs) break;
        const amount = (t.amount ?? 0) + (e.amount ?? 0);
        this.visible[i] = { ...t, amount, text: formatHudText({ kind: t.kind, amount, name: t.name }, s) };
        return;
      }
    }
    this.add(key === undefined ? e : { ...e, key }, nowMs);
  }

  /** Shows `e` at `nowMs`, making room first (see the class comment). */
  private add(e: HudEvent, nowMs: number): void {
    if (this.visible.length >= this.last.maxTexts) {
      const oldest = this.visible.findIndex((t) => !t.sticky);
      if (oldest >= 0) this.visible.splice(oldest, 1);
      else if (e.sticky) {
        this.wait(e);
        return;
      } else return; // only stickies on screen: the new text is the oldest non-sticky one
    }
    this.show(e, nowMs);
  }

  private show(e: HudEvent, nowMs: number): void {
    const lane = this.nextLane[e.area] % HUD_LANES;
    this.nextLane[e.area] = lane + 1;
    this.visible.push({ ...e, lane, bornMs: nowMs, expiresAtMs: nowMs + this.last.durationMs });
  }

  private wait(e: HudEvent): void {
    this.pending.push(e);
    if (this.pending.length > HUD_MAX_PENDING) this.pending.shift();
  }

  /** After `maxTexts` went down: drops the oldest non-sticky texts, then sends the newest stickies back to wait. */
  private trim(): void {
    while (this.visible.length > this.last.maxTexts) {
      const oldest = this.visible.findIndex((t) => !t.sticky);
      if (oldest < 0) break;
      this.visible.splice(oldest, 1);
    }
    while (this.visible.length > this.last.maxTexts) {
      const t = this.visible.pop()!;
      const { bornMs: _b, expiresAtMs: _e, ...event } = t;
      this.pending.unshift(event);
    }
  }

  /** Shows waiting stickies while there is room. */
  private promote(nowMs: number): void {
    while (this.pending.length > 0 && this.visible.length < this.last.maxTexts) this.show(this.pending.shift()!, nowMs);
  }
}
