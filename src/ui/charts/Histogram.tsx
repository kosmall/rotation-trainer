// The simulator's DPS histogram (UI redesign Task 4, spec §5.3 "Simulator"): one count axis, thin
// bars with a 2 px gap, the mean as a solid line, "You" (the last fight) as a gold dashed line,
// a tooltip per bin on hover and keyboard focus (arrows, Home, End), `role="img"` with the
// accessible name "DPS histogram" (kept from the panel), and a "Show data" table.

import { memo, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatDps, formatInt } from '../format';
import { axisNumber, niceScale, tickValues, useElementWidth } from './chartKit';

export interface HistogramProps {
  counts: readonly number[];
  binStart: number;
  /** 0: every fight gave the same DPS (one bin). */
  binWidth: number;
  mean: number;
  /** Your fight's DPS, or null (no fight, or another setup). */
  you: number | null;
  /** One sentence for screen readers. */
  description: string;
  height?: number;
  /** The chart's accessible name (default "DPS histogram"; Compare names one per scenario). */
  name?: string;
}

const LEFT = 44;
const RIGHT = 12;
const TOP = 26;
const BOTTOM = 24;

export const Histogram = memo(function Histogram({ counts, binStart, binWidth, mean, you, description, height = 280, name = 'DPS histogram' }: HistogramProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef);
  const descId = useId();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(40, width - LEFT - RIGHT);
  const plotH = Math.max(60, height - TOP - BOTTOM);
  const n = Math.max(1, counts.length);
  // A one-value result gets a 1-wide domain around it.
  const lo = binWidth === 0 ? binStart - 0.5 : binStart;
  const span = binWidth === 0 ? 1 : n * binWidth;
  const hi = lo + span;
  const domLo = Math.min(lo, you ?? lo);
  const domHi = Math.max(hi, you ?? hi);
  const sx = (v: number) => LEFT + ((v - domLo) / (domHi - domLo || 1)) * plotW;
  const { max, step } = niceScale(Math.max(1, ...counts));
  const sy = (c: number) => TOP + plotH - (c / max) * plotH;
  const binLo = (i: number) => (binWidth === 0 ? lo : binStart + i * binWidth);
  const binHi = (i: number) => (binWidth === 0 ? hi : binStart + (i + 1) * binWidth);
  const label = (i: number) =>
    binWidth === 0
      ? `${formatDps(binStart)} DPS: ${formatInt(counts[i] ?? 0)} fights`
      : `${formatDps(binLo(i))} – ${formatDps(binHi(i))} DPS: ${formatInt(counts[i] ?? 0)} fights`;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => domLo + f * (domHi - domLo));

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const at = active ?? 0;
    const keys: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setActive(Math.min(n - 1, Math.max(0, next)));
  };

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        role="img"
        aria-label={name}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? 0)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <title>{name}</title>
        <g className="grid" aria-hidden="true">
          {tickValues(max, step).map((v) => (
            <line key={v} x1={LEFT} x2={LEFT + plotW} y1={sy(v)} y2={sy(v)} />
          ))}
        </g>
        <g className="axis" aria-hidden="true">
          {tickValues(max, step).map((v) => (
            <text key={v} x={LEFT - 8} y={sy(v) + 4} textAnchor="end">
              {axisNumber(v)}
            </text>
          ))}
          {xTicks.map((v, i) => (
            <text key={i} x={sx(v)} y={TOP + plotH + 16} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>
              {axisNumber(v)}
            </text>
          ))}
        </g>
        <g className="hbars">
          {counts.map((c, i) => {
            const x0 = sx(binLo(i));
            const w = Math.max(1, sx(binHi(i)) - x0 - 2);
            return (
              <rect
                key={i}
                className={active === i ? 'hbar active' : 'hbar'}
                x={x0 + 1}
                width={w}
                y={sy(c)}
                height={Math.max(0, TOP + plotH - sy(c))}
                rx={c > 0 ? 2 : 0}
                onPointerEnter={() => setActive(i)}
              />
            );
          })}
        </g>
        <g className="hmark hmark-mean" aria-hidden="true">
          <line x1={sx(mean)} x2={sx(mean)} y1={TOP - 6} y2={TOP + plotH} />
          <text x={sx(mean)} y={TOP - 10} textAnchor="middle">
            Mean {formatInt(mean)}
          </text>
        </g>
        {you !== null && (
          <g className="hmark hmark-you">
            <line x1={sx(you)} x2={sx(you)} y1={TOP - 6} y2={TOP + plotH} />
            <text x={sx(you)} y={TOP - 10} textAnchor={sx(you) < sx(mean) ? 'end' : 'start'} dx={sx(you) < sx(mean) ? -4 : 4}>
              You {formatDps(you)}
            </text>
          </g>
        )}
      </svg>
      <p id={descId} className="sr-only">
        {description} Use the arrow keys to read each bin.
      </p>
      {active !== null && (
        <div className="tip" aria-hidden="true" style={{ left: Math.min(Math.max(0, sx(binLo(active))), Math.max(0, width - 200)), top: TOP }}>
          {label(active)}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {active !== null ? label(active) : ''}
      </p>
      <details className="chart-data">
        <summary>Show data</summary>
        <div className="tbl-wrap">
          <table className="dmg" aria-label={`${name}, data`}>
            <thead>
              <tr>
                <th scope="col">DPS from</th>
                <th scope="col">to</th>
                <th scope="col">Fights</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c, i) => (
                <tr key={i}>
                  <td>{formatDps(binLo(i))}</td>
                  <td>{formatDps(binHi(i))}</td>
                  <td>{formatInt(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});
