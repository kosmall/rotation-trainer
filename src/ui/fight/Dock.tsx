// The dock beside the arena (spec §5.2): a Details-style damage meter, "Next by the script" (the
// coach), "So far" (active time and DoT uptimes), the last lines of the combat log, and the
// combat text switch. Its slow parts update at most 4 times a second of fight time
// (`useThrottledValue`): the dock never re-renders them per animation frame.

import { memo, useMemo } from 'react';
import type { PriorityStep, SpecData } from '../../data/types';
import type { LogEvent, SimSnapshot } from '../../engine/types';
import { formatDps, formatInt, secondsText } from '../format';
import { SpellIcon } from '../SpellIcon';
import { logTicker, meterRows, nextUpRows, soFar, topRows } from './fightView';
import type { MeterRow, NextRow, SoFarRow, TickerRow } from './fightView';
import { countRender, useThrottledValue } from './hooks';

/** How often the dock's slow parts take new numbers (fight time). */
export const DOCK_REFRESH_MS = 250;
const TICKER_LINES = 7;

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

/** The damage meter: one bar per spell in its school colour, icon, name, total (DPS, share). */
export const MiniMeter = memo(function MiniMeter({ rows, total }: { rows: readonly MeterRow[]; total: number }) {
  countRender('MiniMeter');
  const top = rows[0]?.total ?? 0;
  return (
    <section aria-labelledby="fv-h-meter">
      <h2 id="fv-h-meter">
        Damage done <small className="tnum">{formatInt(total)}</small>
      </h2>
      {rows.length === 0 ? (
        <p className="fv-dock-empty">No damage yet</p>
      ) : (
        <ol className="fv-meter" aria-label="Damage by spell">
          {topRows(rows).map((r) => (
            <li key={r.id} className={r.school ? `fv-school-${r.school}` : undefined}>
              <i style={{ transform: `scaleX(${top > 0 ? r.total / top : 0})` }} aria-hidden="true" />
              <span className="fv-meter-icon" aria-hidden="true">
                {r.icon !== null && <SpellIcon icon={r.icon} kind={r.iconKind} className="fv-meter-img" />}
              </span>
              <span>{r.name}</span>
              <b className="tnum">
                {formatInt(r.total)}{' '}
                <small>
                  ({formatDps(r.dps)}, {pct(r.share)})
                </small>
              </b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

/** "Next by the script": the first steps of the rotation and why each is or is not the pick. */
export const NextUp = memo(function NextUp({
  rows,
  spec,
  itemIcons,
}: {
  rows: readonly NextRow[];
  spec: Pick<SpecData, 'spells'>;
  itemIcons: ReadonlySet<string>;
}) {
  return (
    <section className="fv-next" aria-labelledby="fv-h-next">
      <h2 id="fv-h-next">
        Next by the script <small>coach</small>
      </h2>
      <ol>
        {rows.map((r) => {
          const spell = spec.spells.find((s) => s.id === r.spellId);
          return (
            <li key={r.index} className={r.state === 'now' ? 'fv-now' : undefined} title={r.hint}>
              <span className="fv-next-icon" aria-hidden="true">
                {spell && <SpellIcon icon={spell.icon} kind={itemIcons.has(spell.id) ? 'item' : 'spell'} className="fv-next-img" />}
              </span>
              <span className="fv-next-label">{r.label}</span>
              <small>{r.note}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

/** "So far": active time and the DoT uptimes of the fight up to now. */
export const SoFar = memo(function SoFar({ rows, atMs }: { rows: readonly SoFarRow[]; atMs: number }) {
  return (
    <section aria-labelledby="fv-h-sofar">
      <h2 id="fv-h-sofar">
        So far <small className="tnum">at {secondsText(atMs)} s</small>
      </h2>
      <dl className="fv-stats" aria-label="Fight so far">
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd className="tnum">{r.value === null ? '–' : pct(r.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
});

/** The last lines of the combat log (not a live region: it changes several times a second). */
export const LogTicker = memo(function LogTicker({ rows }: { rows: readonly TickerRow[] }) {
  return (
    <ol className="fv-log" aria-live="off" aria-label="Last combat log lines">
      {rows.map((r) => (
        <li key={r.key}>
          <time className="tnum">{secondsText(r.atMs)}</time>
          <span>
            <span className={`fv-tone-${r.tone}`}>{r.subject}</span> {r.text}
          </span>
        </li>
      ))}
    </ol>
  );
});

/** The quick switch for the combat text and the coach glow, with a link to the full settings. */
const DockSwitches = memo(function DockSwitches({
  combatText,
  onCombatText,
  coach,
  onCoach,
}: {
  combatText: boolean;
  onCombatText(on: boolean): void;
  coach: boolean;
  onCoach(on: boolean): void;
}) {
  return (
    <div className="fv-dock-foot">
      <label className="fv-switch">
        <input type="checkbox" checked={combatText} onChange={(e) => onCombatText(e.currentTarget.checked)} /> Combat text
      </label>
      <label className="fv-switch">
        <input type="checkbox" checked={coach} onChange={(e) => onCoach(e.currentTarget.checked)} /> Coach glow
      </label>
      <a href="#/setup/combat-text">Settings</a>
    </div>
  );
});

export interface DockProps {
  snapshot: SimSnapshot;
  spec: SpecData;
  priority: readonly PriorityStep[];
  fightId: number;
  logSince(index: number): readonly LogEvent[];
  /** Spell ids whose icon is an item icon (the fight's). */
  itemIcons: ReadonlySet<string>;
  open: boolean;
  combatText: boolean;
  onCombatText(on: boolean): void;
  coach: boolean;
  onCoach(on: boolean): void;
  /** Closes the dock's window (below 1280 px, where "Meter" opens it). */
  onClose(): void;
}

/**
 * The dock (an `aside`, "Fight details"). It renders with the arena, but takes a new snapshot for
 * its lists only every `DOCK_REFRESH_MS` of fight time (and once more at the end), so the memoized
 * parts re-render at most 4 times a second.
 */
export function Dock({ snapshot, spec, priority, fightId, logSince, itemIcons, open, combatText, onCombatText, coach, onCoach, onClose }: DockProps) {
  const stamp = useThrottledValue(snapshot, DOCK_REFRESH_MS, snapshot.nowMs + fightId * 1e9, snapshot.phase !== 'running');
  // The log as of the stamp (a copy: `logSince(0)`, at most 4 times a second).
  const log = useMemo(() => (stamp.phase === 'ready' ? [] : logSince(0)), [stamp, logSince]);
  const meter = useMemo(() => meterRows(log, stamp.nowMs, spec, itemIcons), [log, stamp, spec, itemIcons]);
  const next = useMemo(() => nextUpRows(priority, stamp, spec.spells), [priority, stamp, spec]);
  const sofar = useMemo(() => soFar(stamp, log, spec), [stamp, log, spec]);
  const ticker = useMemo(() => logTicker(log, TICKER_LINES, spec), [log, spec]);
  return (
    <aside id="fight-dock" className={open ? 'fv-dock fv-dock-open' : 'fv-dock'} aria-label="Fight details">
      <button type="button" className="btn small fv-dock-close" onClick={onClose}>
        Close
      </button>
      <MiniMeter rows={meter} total={stamp.damageTotal} />
      <NextUp rows={next} spec={spec} itemIcons={itemIcons} />
      <SoFar rows={sofar} atMs={stamp.nowMs} />
      <section className="fv-log-section" aria-labelledby="fv-h-log">
        <h2 id="fv-h-log">
          Combat log{' '}
          <small>
            <a href="#/report/log">Full Log</a>
          </small>
        </h2>
        <LogTicker rows={ticker} />
        <DockSwitches combatText={combatText} onCombatText={onCombatText} coach={coach} onCoach={onCoach} />
      </section>
    </aside>
  );
}
