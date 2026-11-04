// Lanes over fight time (UI redesign Task 4, spec §5.3 "Timeline"): one row per spell or aura,
// its windows as thin bars on one time axis. The colour carries the kind (a school's mark for
// spells and DoTs, bronze for the player's buffs); the name and icon carry identity. `role="img"`
// with a title; each bar has a hover title; "Show data" lists every window as text.

import { memo, useId, useRef } from 'react';
import { iconUrl, itemIconUrl } from '../SpellIcon';
import { axisNumber, timeTicks, useElementWidth } from './chartKit';

export interface LaneRow {
  id: string;
  label: string;
  /** A shorter label for tight spaces (the DPS chart's buff lanes: "Potion"). */
  short?: string;
  icon?: string | null;
  iconKind?: 'spell' | 'item';
  /** The bar colour: a school's chart mark, or the buffs' bronze. */
  tone: 'shadow' | 'fire' | 'other' | 'buff';
  /** [start, end] in ms; a zero-length window (an instant) is drawn 4 px wide. */
  windows: readonly (readonly [number, number])[];
}

export interface LanesProps {
  title: string;
  description: string;
  rows: readonly LaneRow[];
  durationMs: number;
}

const ROW = 24;
const TOP = 6;
const BOTTOM = 24;
const RIGHT = 12;

const sec = (ms: number) => (ms / 1000).toFixed(1);

export const Lanes = memo(function Lanes({ title, description, rows, durationMs }: LanesProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const descId = useId();
  const left = width < 520 ? 120 : 180;
  const plotW = Math.max(40, width - left - RIGHT);
  const height = TOP + rows.length * ROW + BOTTOM;
  const sx = (ms: number) => left + (durationMs > 0 ? (ms / durationMs) * plotW : 0);
  const ticks = timeTicks(durationMs / 1000, plotW);
  return (
    <div className="chart" ref={wrapRef}>
      <svg role="img" aria-label={title} aria-describedby={descId} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <title>{title}</title>
        <g className="grid" aria-hidden="true">
          {ticks.map((t) => (
            <line key={t} x1={sx(t * 1000)} x2={sx(t * 1000)} y1={TOP} y2={TOP + rows.length * ROW} />
          ))}
        </g>
        {rows.map((row, r) => {
          const y = TOP + r * ROW;
          return (
            <g key={row.id} className={`lane lane-${row.tone}`}>
              <text className="lane-label" x={left - (row.icon ? 30 : 8)} y={y + 16} textAnchor="end">
                {row.label}
              </text>
              {row.icon && (
                <image
                  href={row.iconKind === 'item' ? itemIconUrl(row.icon) : iconUrl(row.icon)}
                  x={left - 24}
                  y={y + 3}
                  width={18}
                  height={18}
                  aria-hidden="true"
                />
              )}
              {row.windows.map(([a, b], k) => (
                <rect key={k} x={sx(a)} y={y + 6} width={Math.max(4, sx(b) - sx(a))} height={ROW - 12} rx={2}>
                  <title>{a === b ? `${row.label} at ${sec(a)} s` : `${row.label}: ${sec(a)} s to ${sec(b)} s`}</title>
                </rect>
              ))}
            </g>
          );
        })}
        <g className="axis" aria-hidden="true">
          {ticks.map((t) => (
            <text key={t} x={sx(t * 1000)} y={TOP + rows.length * ROW + 16} textAnchor="middle">
              {axisNumber(t)} s
            </text>
          ))}
        </g>
      </svg>
      <p id={descId} className="sr-only">
        {description}
      </p>
      <details className="chart-data">
        <summary>Show data</summary>
        <div className="tbl-wrap">
          <table className="dmg" aria-label={`${title}, data`}>
            <thead>
              <tr>
                <th scope="col">Lane</th>
                <th scope="col">Times</th>
                <th scope="col">Windows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="wrap">{row.windows.map(([a, b]) => (a === b ? `${sec(a)} s` : `${sec(a)}–${sec(b)} s`)).join(', ')}</td>
                  <td>{row.windows.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});
