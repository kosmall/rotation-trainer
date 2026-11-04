// The HUD in the arena's top left (spec §5.2): the fight clock, a progress line with a mark per
// scheduled buff (Heroism), the live DPS and damage (what the DPS leaves out behind an "i"), the
// key hints, and the "Meter" button that opens the dock below 1280 px.

import { memo, useId } from 'react';
import { formatDps, formatInt } from '../format';
import { clockText } from './fightViewModel';

export interface HudMark {
  atMs: number;
  label: string;
}

export interface HudProps {
  nowMs: number;
  durationMs: number;
  dps: number;
  damageTotal: number;
  /** Scheduled self buffs (memoized per fight). */
  marks: readonly HudMark[];
  /** What the DPS leaves out (one sentence). */
  dpsNote: string;
  dockOpen: boolean;
  onToggleDock(): void;
}

export const Hud = memo(function Hud({ nowMs, durationMs, dps, damageTotal, marks, dpsNote, dockOpen, onToggleDock }: HudProps) {
  const noteId = useId();
  const progress = durationMs > 0 ? Math.min(1, nowMs / durationMs) : 0;
  return (
    <div className="fv-hud">
      <div className="fv-timer" aria-label="Elapsed">
        <span className="tnum">{clockText(nowMs)}</span>
        <small> / {clockText(durationMs, true)}</small>
      </div>
      <div className="fv-timeline" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
        {marks.map((m) => (
          <span
            key={`${m.label}-${m.atMs}`}
            className="fv-mark"
            style={{ left: `${durationMs > 0 ? (m.atMs / durationMs) * 100 : 0}%` }}
            title={m.label}
          />
        ))}
      </div>
      <div className="fv-hud-dps">
        <div>
          <b aria-label="DPS" className="tnum">
            {formatDps(dps)}
          </b>
          <span>
            DPS{' '}
            <button type="button" className="fv-info" aria-label="What the DPS leaves out" aria-describedby={noteId} title={dpsNote}>
              i
            </button>
          </span>
          <span id={noteId} className="sr-only">
            {dpsNote}
          </span>
        </div>
        <div>
          <b aria-label="Total damage" className="tnum">
            {formatInt(damageTotal)}
          </b>
          <span>damage</span>
        </div>
        <button
          type="button"
          className="btn small fv-dock-toggle"
          aria-expanded={dockOpen}
          aria-controls="fight-dock"
          aria-label={dockOpen ? 'Hide the damage meter and log' : 'Show the damage meter and log'}
          onClick={onToggleDock}
        >
          Meter
        </button>
      </div>
      <div className="fv-hints">
        <span>
          <kbd>Esc</kbd> cancel cast
        </span>
        <span>
          <kbd>R</kbd> reset
        </span>
        <span>
          <kbd>?</kbd> all keys
        </span>
      </div>
    </div>
  );
});
