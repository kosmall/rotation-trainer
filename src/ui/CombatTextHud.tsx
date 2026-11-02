// Combat text HUD (scrolling combat text Task 2, design spec §3-4): the floating texts over the
// arena. `CombatTextLayer` feeds a `HudQueue` from the fight (new log entries and snapshot changes,
// once per snapshot, i.e. per animation frame) and keeps the texts in its own state, so a text
// coming or going never re-renders GameView; `CombatTextHud` draws them. Motion is CSS only
// (game.css, "Combat text HUD"): no timer per text; a text leaves when the queue expires it in the
// frame loop or when its animation ends (after the fight, when there are no more frames).

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LogEvent, SimSnapshot } from '../engine/types';
import { extractHudEvents, initialHudCursor } from './hudEvents';
import type { HudContext, HudCursor } from './hudEvents';
import { hudTextStyle } from './hudFormat';
import { HudQueue } from './hudQueue';
import type { HudText } from './hudQueue';
import type { HudSettings } from './hudSettings';
import { SpellIcon } from './SpellIcon';

export interface CombatTextHudProps {
  /** The texts on screen (`HudQueue.items()`), oldest first. */
  texts: readonly HudText[];
  settings: HudSettings;
  /** A text's animation has ended (it is invisible now): the caller drops it. */
  onDone(id: number): void;
}

/**
 * The two scroll areas inside the arena: Outgoing (the player's damage, over the target, on the
 * right) and Notifications (buffs, procs, mana, items, ready, low mana; at the bottom left, over
 * the player's bars). Decorative: `aria-hidden`, no pointer events (CSS). Each text is keyed by its
 * id, so a merged text (same id, new amount) keeps its element and its running animation.
 */
export const CombatTextHud = memo(function CombatTextHud({ texts, settings, onDone }: CombatTextHudProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  // One native listener for every text: a text's own animation has ended (the crit pop of its
  // inner span bubbles here too and is ignored).
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onEnd = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLElement && el.classList.contains('hud-text')) doneRef.current(Number(el.dataset.hudId));
    };
    root.addEventListener('animationend', onEnd);
    return () => root.removeEventListener('animationend', onEnd);
  }, []);
  const stepsRef = useRef<Map<number, number>>(new Map());
  const steps = assignSteps(texts, stepsRef.current, settings.fontPx);
  const view = (t: HudText) => <HudTextView key={t.id} text={t} step={steps.get(t.id) ?? 0} settings={settings} />;
  return (
    <div ref={rootRef} className={`hud hud-${settings.animation}`} aria-hidden="true">
      <div className="hud-area hud-outgoing">{texts.filter((t) => t.area === 'outgoing').map(view)}</div>
      <div className="hud-area hud-notifications">{texts.filter((t) => t.area === 'notifications').map(view)}</div>
    </div>
  );
});

/** Steps (lines) above a text's start point a new text may take. */
export const HUD_STACK_STEPS = 6;
/** How far a text rises over its life, px (game.css `--hud-rise` on a wide screen). */
const RISE_PX: Readonly<Record<HudText['area'], number>> = { outgoing: 96, notifications: 72 };
/** One step: the line height game.css uses for `--hud-step` (1.25em). */
const STEP_EM = 1.25;

/**
 * The start step of each text (0 = its lane's start, each step one line higher), kept for the
 * text's whole life in `memory` (a text never jumps when an older one goes). A new text takes the
 * lowest step at least one line away from where every older text of its area (Outgoing: of its
 * lane, the lanes are columns apart) is now: an older text's place is its own step plus how far it
 * has risen since (linear: `RISE_PX` over its life, in lines of `fontPx`). So texts born in one
 * frame (an item, its buff, a trinket, its buff, Heroism: five at once) start one line apart, and
 * a text born 50-500 ms after another does not start on top of the risen one.
 */
export function assignSteps(texts: readonly HudText[], memory: Map<number, number>, fontPx: number): ReadonlyMap<number, number> {
  const live = new Set<number>();
  const line = STEP_EM * Math.max(1, fontPx);
  for (const t of texts) {
    live.add(t.id);
    if (memory.has(t.id)) continue;
    const taken: number[] = [];
    for (const o of texts) {
      if (o === t) break;
      const step = memory.get(o.id);
      if (step === undefined || o.area !== t.area || (t.area === 'outgoing' && o.lane !== t.lane)) continue;
      const life = Math.max(1, o.expiresAtMs - o.bornMs);
      const risen = (Math.max(0, t.bornMs - o.bornMs) / life) * (RISE_PX[o.area] / line);
      taken.push(step + risen);
    }
    let step = 0;
    while (step < HUD_STACK_STEPS - 1 && taken.some((p) => Math.abs(p - step) < 1)) step++;
    memory.set(t.id, step);
  }
  for (const id of memory.keys()) if (!live.has(id)) memory.delete(id);
  return memory;
}

function HudTextView({ text, step, settings }: { text: HudText; step: number; settings: HudSettings }) {
  const look = hudTextStyle(text.kind, settings);
  const style = {
    '--hud-color': text.color,
    '--hud-step': step,
    '--hud-font': `${look.fontPx}px`,
    animationDuration: `${Math.max(0, text.expiresAtMs - text.bornMs)}ms`,
  } as CSSProperties;
  return (
    <span
      className={`hud-text hud-${text.kind} hud-lane-${text.lane}`}
      data-hud-id={text.id}
      style={style}
    >
      <span className="hud-inner" style={{ fontWeight: look.bold ? 700 : 600, opacity: look.opacity }}>
        {settings.showIcons && text.icon !== undefined && text.icon !== '' && (
          <SpellIcon icon={text.icon} kind={text.iconKind ?? 'spell'} className="hud-icon" />
        )}
        <span className="hud-label">{text.text}</span>
      </span>
    </span>
  );
}

export interface CombatTextLayerProps {
  /** The fight's latest snapshot (a new object per animation frame while it runs). */
  snapshot: SimSnapshot;
  /** A new number for every new Simulation (reset, or a fight rebuilt before it started). */
  fightId: number;
  /** The current fight's log entries from an index on (`useSimulation`'s `logSince`). */
  logSince(index: number): readonly LogEvent[];
  /** The running fight's HUD context (`buildHudContext` of its spec, catalog and scheduled auras). */
  context: HudContext;
  settings: HudSettings;
}

const sameTexts = (a: readonly HudText[], b: readonly HudText[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * Reads the fight for the HUD, once per snapshot:
 * - a new fight (`fightId` changed) or a fight not started (phase 'ready') clears the queue, the
 *   cursor and the local log copy;
 * - while the fight runs: appends `logSince(copy.length)` to the local copy (only the new entries
 *   are copied: O(new entries) per frame, never the whole log), extracts the events, pushes them
 *   into the queue at the snapshot's fight time and expires the old texts;
 * - after the end: nothing new; the texts up finish their animation and go (`onDone`).
 * Its state changes re-render only this component and the HUD under it.
 */
export function CombatTextLayer({ snapshot, fightId, logSince, context, settings }: CombatTextLayerProps) {
  const queueRef = useRef<HudQueue | null>(null);
  const cursorRef = useRef<HudCursor>(initialHudCursor());
  const logRef = useRef<LogEvent[]>([]);
  const fightRef = useRef(fightId);
  /** The fight whose last entries (logged in the frame that ended it) have been read. */
  const endReadRef = useRef<number | null>(null);
  /** Texts whose animation ended before the queue expired them (never shown again). */
  const doneRef = useRef<Set<number>>(new Set());
  const [texts, setTexts] = useState<readonly HudText[]>([]);

  const queue = () => (queueRef.current ??= new HudQueue());

  const publish = useCallback(() => {
    const q = queueRef.current;
    const items = q === null ? [] : q.items();
    const done = doneRef.current;
    let shown: readonly HudText[] = items;
    if (done.size > 0) {
      const live = new Set(items.map((t) => t.id));
      for (const id of done) if (!live.has(id)) done.delete(id);
      shown = items.filter((t) => !done.has(t.id));
    }
    setTexts((prev) => (sameTexts(prev, shown) ? prev : shown));
  }, []);

  useLayoutEffect(() => {
    const q = queue();
    if (fightRef.current !== fightId || snapshot.phase === 'ready') {
      fightRef.current = fightId;
      if (logRef.current.length > 0 || cursorRef.current.index > 0 || q.items().length > 0 || q.pendingCount() > 0) {
        q.clear();
        cursorRef.current = initialHudCursor(cursorRef.current.nextId);
        logRef.current = [];
        doneRef.current.clear();
      }
    }
    // While the fight runs, and once more for the entries of the frame that ended it (a DoT's last
    // tick at the end); the snapshot events (ready, low mana) stay with the running fight.
    const lastRead = snapshot.phase === 'ended' && endReadRef.current !== fightId;
    if (snapshot.phase === 'running' || lastRead) {
      if (lastRead) endReadRef.current = fightId;
      const log = logRef.current;
      for (const entry of logSince(log.length)) log.push(entry);
      const { events, cursor } = extractHudEvents(cursorRef.current, log, snapshot, context, settings);
      cursorRef.current = cursor;
      // After a backgrounded tab the first frame reads the whole gap: only what is still young
      // enough to be on screen comes up (no crits replayed for seconds).
      const oldest = snapshot.nowMs - settings.durationMs;
      q.push(
        events.filter((e) => e.atMs >= oldest),
        snapshot.nowMs,
        settings,
      );
      if (snapshot.phase === 'running') q.expire(snapshot.nowMs);
    }
    if (!settings.enabled) q.clear();
    publish();
  }, [snapshot, fightId, logSince, context, settings, publish]);

  const onDone = useCallback(
    (id: number) => {
      doneRef.current.add(id);
      publish();
    },
    [publish],
  );

  if (!settings.enabled) return null;
  return <CombatTextHud texts={texts} settings={settings} onDone={onDone} />;
}
