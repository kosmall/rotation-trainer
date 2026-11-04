// A line chart over fight time (UI redesign Task 4, spec §5.3 "DPS over time"; dataviz rules):
// one value axis, 2 px lines that differ by stroke as well as colour (solid, dashed, muted), an
// optional set of lanes above the plot (buff windows: their own rows, never mixed into the lines),
// a crosshair and tooltip on hover and on keyboard focus (arrows, Home, End), `role="img"` with a
// title, a legend (the caller's) and a "Show data" table.

import { memo, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { axisNumber, niceScale, tickValues, timeTicks, useElementWidth } from './chartKit';
import type { LaneRow } from './Lanes';

export interface LineSeries {
  id: string;
  label: string;
  /** One value per x. */
  values: readonly number[];
  /** 'primary': the class colour, solid; 'dashed': dim, dashed; 'muted': dim, solid, faint. */
  variant: 'primary' | 'dashed' | 'muted';
}

export interface LineChartProps {
  /** The accessible name and the SVG title ("DPS over time"). */
  title: string;
  /** One sentence for screen readers (what the lines show). */
  description: string;
  /** x of each point, seconds. */
  x: readonly number[];
  /** The x axis's end, seconds (the fight's duration). */
  xMax: number;
  series: readonly LineSeries[];
  /** Rows drawn above the plot (buff windows); ms. */
  lanes?: readonly LaneRow[];
  /** Formats a value in the tooltip and the table ("2,104.5"). */
  format(v: number): string;
  /** The value column's name in the data table ("DPS"). */
  valueName: string;
  height?: number;
  /** The cursor (Report → Timeline): the window [from, to) in seconds drawn as a band; null or absent: none. */
  cursor?: readonly [number, number] | null;
  /** A click on the plot picks the time under it (seconds); absent: not clickable. */
  onPick?(t: number): void;
}

const LEFT = 52;
const RIGHT = 12;
const LANE_H = 14;
const BOTTOM = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const LineChart = memo(function LineChart({
  title,
  description,
  x,
  xMax,
  series,
  lanes = [],
  format,
  valueName,
  height = 260,
  cursor = null,
  onPick,
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const descId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  const lanesH = lanes.length > 0 ? lanes.length * LANE_H + 12 : 0;
  const top = lanesH + 8;
  const plotW = Math.max(40, width - LEFT - RIGHT);
  const plotH = Math.max(60, height - top - BOTTOM);
  const { max, step } = useMemo(() => niceScale(Math.max(0, ...series.flatMap((s) => s.values))), [series]);
  const sx = (t: number) => LEFT + (xMax > 0 ? (t / xMax) * plotW : 0);
  const sy = (v: number) => top + plotH - (v / max) * plotH;
  const paths = series.map((s) => ({
    s,
    d: s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(x[i] ?? 0).toFixed(1)},${sy(v).toFixed(1)}`).join(''),
  }));
  const ticksX = timeTicks(xMax, plotW);
  const ticksY = tickValues(max, step);

  const tipText = (i: number) => `${axisNumber(x[i] ?? 0)} s: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(', ')}`;
  const move = (i: number, fromKeyboard: boolean) => {
    const next = clamp(i, 0, x.length - 1);
    setActive(next);
    if (fromKeyboard) setAnnounce(tipText(next));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (x.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / (rect.width || width)) * width;
    const t = ((px - LEFT) / plotW) * xMax;
    let best = 0;
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i]! - t) < Math.abs(x[best]! - t)) best = i;
    move(best, false);
  };
  const onClick =
    onPick === undefined
      ? undefined
      : (e: MouseEvent<SVGSVGElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / (rect.width || width)) * width;
          if (px < LEFT || !(xMax > 0)) return;
          onPick(clamp(((px - LEFT) / plotW) * xMax, 0, xMax));
        };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (x.length === 0) return;
    const at = active ?? x.length - 1;
    const keys: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: x.length - 1, PageUp: at - 10, PageDown: at + 10 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    move(next, true);
  };

  const tipLeft = active === null ? 0 : sx(x[active] ?? 0);
  return (
    <div className="chart" ref={wrapRef}>
      <svg
        role="img"
        aria-label={title}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onFocus={() => {
          if (active === null && x.length > 0) move(x.length - 1, true);
        }}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        onClick={onClick}
        className={onClick ? 'pickable' : undefined}
      >
        <title>{title}</title>
        {lanes.map((lane, r) => (
          <g key={lane.id} className={`lane lane-${lane.tone}`}>
            <text className="lane-label" x={LEFT - 8} y={8 + r * LANE_H + 10} textAnchor="end">
              {lane.short ?? lane.label}
            </text>
            {lane.windows.map(([a, b], k) => (
              <rect
                key={k}
                x={sx(a / 1000)}
                y={8 + r * LANE_H + 3}
                width={Math.max(3, sx(b / 1000) - sx(a / 1000))}
                height={LANE_H - 6}
                rx={2}
              >
                <title>{`${lane.label}: ${(a / 1000).toFixed(1)} s to ${(b / 1000).toFixed(1)} s`}</title>
              </rect>
            ))}
          </g>
        ))}
        <g className="grid" aria-hidden="true">
          {ticksY.map((v) => (
            <line key={v} x1={LEFT} x2={LEFT + plotW} y1={sy(v)} y2={sy(v)} />
          ))}
        </g>
        <g className="axis" aria-hidden="true">
          {ticksY.map((v) => (
            <text key={v} x={LEFT - 8} y={sy(v) + 4} textAnchor="end">
              {axisNumber(v)}
            </text>
          ))}
          {ticksX.map((t) => (
            <text key={t} x={sx(t)} y={top + plotH + 16} textAnchor="middle">
              {axisNumber(t)} s
            </text>
          ))}
        </g>
        {cursor !== null && (
          <rect
            className="cursor"
            aria-hidden="true"
            x={sx(cursor[0])}
            y={top}
            width={Math.max(2, sx(Math.min(cursor[1], xMax)) - sx(cursor[0]))}
            height={plotH}
          />
        )}
        {paths.map(({ s, d }) => (
          <path key={s.id} className={`line line-${s.variant}`} d={d} fill="none" />
        ))}
        {active !== null && (
          <g className="crosshair" aria-hidden="true">
            <line x1={tipLeft} x2={tipLeft} y1={top} y2={top + plotH} />
            {series.map((s) => (
              <circle key={s.id} className={`dot dot-${s.variant}`} cx={tipLeft} cy={sy(s.values[active] ?? 0)} r={4} />
            ))}
          </g>
        )}
      </svg>
      <p id={descId} className="sr-only">
        {description} Use the arrow keys to read the values.
      </p>
      {active !== null && (
        <div className="tip" aria-hidden="true" style={{ left: clamp(tipLeft + 12, 0, Math.max(0, width - 180)), top: top }}>
          <div>{axisNumber(x[active] ?? 0)} s</div>
          {series.map((s) => (
            <div key={s.id} className="tip-row">
              <i className={`key key-${s.variant}`} />
              {s.label} <b>{format(s.values[active] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
      <p className="sr-only" role="status" aria-label="Chart value">
        {announce}
      </p>
      <details className="chart-data">
        <summary>Show data</summary>
        <div className="tbl-wrap">
          <table className="dmg" aria-label={`${title}, data`}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {series.map((s) => (
                  <th key={s.id} scope="col">
                    {s.label} ({valueName})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {x.map((t, i) => (
                <tr key={i}>
                  <th scope="row">{axisNumber(t)} s</th>
                  {series.map((s) => (
                    <td key={s.id}>{format(s.values[i] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});
