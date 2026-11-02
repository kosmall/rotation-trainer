import { useState } from 'react';
import {
  barFraction,
  buffTimeText,
  isExpiring,
  nextTotals,
  timeLeftWords,
  type ActiveBuffView,
  type AuraTotals,
  type IconKind,
  type PermanentBuffView,
  type UpcomingBuffView,
} from './buffsView';
import { initials, secondsText } from './format';
import { SpellIcon } from './SpellIcon';

interface TotalsState {
  active: readonly ActiveBuffView[];
  totals: AuraTotals;
  view: ReadonlyMap<string, number>;
}

function totalsState(active: readonly ActiveBuffView[], prev: AuraTotals): TotalsState {
  const totals = nextTotals(prev, active);
  return { active, totals, view: new Map([...totals].map(([id, t]) => [id, t.totalMs])) };
}

/**
 * Each active aura's bar total (`nextTotals`), updated when a new `active` list comes in (a new
 * snapshot). No timer and no effect: the state follows the props during render (React's "storing
 * information from previous renders" pattern), and the same list returns the same map.
 */
export function useAuraTotals(active: readonly ActiveBuffView[]): ReadonlyMap<string, number> {
  const [state, setState] = useState<TotalsState>(() => totalsState(active, new Map()));
  if (state.active !== active) {
    const next = totalsState(active, state.totals);
    setState(next);
    return next.view;
  }
  return state.view;
}

/** The icon over an initials tile in a school-neutral colour (a missing file leaves the tile). */
function BuffIcon({ name, icon, kind, count }: { name: string; icon: string | null; kind?: IconKind; count?: number | null }) {
  return (
    <span className="buff-icon" aria-hidden="true">
      {initials(name)}
      {icon !== null && <SpellIcon icon={icon} kind={kind} className="buff-image" />}
      {count != null && <span className="buff-count">{count}</span>}
    </span>
  );
}

export interface PlayerBuffsPanelProps {
  active: readonly ActiveBuffView[];
  upcoming: readonly UpcomingBuffView[];
  permanent: readonly PermanentBuffView[];
  /** Bar totals per aura id (`useAuraTotals`); a missing one shows a full bar. */
  totals: ReadonlyMap<string, number>;
  phase: 'ready' | 'running' | 'ended';
}

/**
 * "Your buffs": the auras on the player with their time left and a bar, the scheduled ones still
 * to come, and the enabled setup buffs (collapsed). Every entry's label carries its time left in
 * words; no `aria-live` (the texts are always current, a live region would read every frame).
 */
export function PlayerBuffsPanel({ active, upcoming, permanent, totals, phase }: PlayerBuffsPanelProps) {
  return (
    <section className="buffs-panel" aria-label="Your buffs">
      <h3 className="buffs-title">Your buffs</h3>
      {active.length === 0 ? (
        <p className="buffs-empty">No active buffs</p>
      ) : (
        <ul className="buffs-active" aria-label="Active buffs">
          {active.map((b) => {
            const expiring = phase !== 'ended' && isExpiring(b.remainingMs);
            const fraction = barFraction(b.remainingMs, totals.get(b.auraId));
            return (
              <li
                key={b.auraId}
                className={expiring ? 'buff buff-expiring' : 'buff'}
                aria-label={`${b.name}, ${timeLeftWords(b.remainingMs)}`}
                title={`${b.name}: ${b.description}`}
              >
                <BuffIcon name={b.name} icon={b.icon} kind={b.iconKind} count={b.count} />
                <span className="buff-name">{b.name}</span>
                <span className="buff-time">{buffTimeText(b.remainingMs)}</span>
                <span className="buff-bar" aria-hidden="true">
                  <span className="buff-bar-fill" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {upcoming.length > 0 && (
        <>
          <h4 className="buffs-subtitle">Upcoming</h4>
          <ul className="buffs-upcoming" aria-label="Upcoming buffs">
            {upcoming.map((u, i) => (
              <li key={`${u.auraId}-${u.startsAtMs}-${i}`} className="buff-upcoming">
                <BuffIcon name={u.name} icon={u.icon} kind={u.iconKind} />
                <span className="buff-upcoming-text">
                  {u.name} {phase === 'ready' ? `at ${secondsText(u.startsAtMs)} s` : `in ${secondsText(u.inMs)} s`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {permanent.length > 0 && (
        <details className="buffs-setup">
          <summary>Setup buffs ({permanent.length})</summary>
          <ul className="buffs-permanent" aria-label="Setup buffs">
            {permanent.map((p) => (
              <li key={p.id} className="buff-permanent" aria-label={p.name} title={`${p.name}: ${p.description}`}>
                <BuffIcon name={p.name} icon={p.icon} kind={p.iconKind} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
