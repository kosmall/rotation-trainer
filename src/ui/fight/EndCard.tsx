// The "Fight over" card on the arena (spec §3.4, Q4): the DPS, the share of the bot's DPS when it
// is known, the damage and duration, what the DPS leaves out, "Open Report" (Enter) and Reset (R).
// The region keeps its accessible name "Fight summary".

import { memo } from 'react';
import { formatDps, formatInt, secondsText } from '../format';
import { routeHref } from '../shell/router';

export interface EndCardProps {
  dps: number;
  damageTotal: number;
  durationMs: number;
  /** The bot's DPS in the same fight (same seed and setup), or null when not known. */
  botDps: number | null;
  dpsNote: string;
  /** What the ended fight was played with ("Setup: Raid as in my log"), its own names. */
  playedWith: readonly string[];
  onReset(): void;
}

export const REPORT_HREF = routeHref({ mode: 'report', tab: 'damage' });

export const EndCard = memo(function EndCard({ dps, damageTotal, durationMs, botDps, dpsNote, playedWith, onReset }: EndCardProps) {
  return (
    <div className="fv-overlay">
      <section className="fv-card" role="region" aria-label="Fight summary">
        <h2>Fight Over</h2>
        <p className="fv-end-dps">
          <b aria-label="DPS" className="tnum">
            {formatDps(dps)}
          </b>{' '}
          DPS
        </p>
        {botDps !== null && botDps > 0 && (
          <p className="fv-end-bot">
            {((dps / botDps) * 100).toFixed(1)}% of the bot ({formatDps(botDps)}) with the same setup
          </p>
        )}
        <dl className="fv-end-stats">
          <div>
            <dt>Total damage</dt>
            <dd aria-label="Total damage" className="tnum">
              {formatInt(damageTotal)}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd aria-label="Duration" className="tnum">
              {secondsText(durationMs)} s
            </dd>
          </div>
        </dl>
        <ul className="fv-played" aria-label="Played with">
          {playedWith.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <p className="fv-note">{dpsNote}</p>
        <div className="fv-card-actions">
          <a className="btn primary" href={REPORT_HREF}>
            Open Report
          </a>
          <button
            type="button"
            className="btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onReset();
            }}
          >
            Reset
          </button>
        </div>
        <p className="fv-hint">
          <kbd>Enter</kbd> opens the report, <kbd>R</kbd> resets.
        </p>
      </section>
    </div>
  );
});
