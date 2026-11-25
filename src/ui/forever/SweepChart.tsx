import { useId } from 'react';

export interface SweepSeries {
  id: string;
  label: string;
  values: readonly number[];
}

const DASH = ['', '6 4', '2 3', '10 3 2 3', '1 5', '8 2', '4 4'];
const COLORS = ['var(--class)', 'var(--text-dim, #8a8aa0)', '#e0a030', '#4aa3d8', '#d85a7a', '#5ac08a', '#b07ad8'];

/** Lines over levels with a data table behind a disclosure (accessible: role=img + table). */
export function SweepChart({ title, levels, series, valueName }: { title: string; levels: readonly number[]; series: readonly SweepSeries[]; valueName: string }) {
  const id = useId();
  const W = 640;
  const H = 260;
  const m = { l: 44, r: 12, t: 12, b: 28 };
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || 1) * 0.1;
  const y0 = Math.max(0, lo - pad);
  const y1 = hi + pad;
  const x = (i: number) => m.l + (i * (W - m.l - m.r)) / Math.max(1, levels.length - 1);
  const y = (v: number) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const ticks = [0, 1, 2, 3, 4].map((k) => y0 + ((y1 - y0) * k) / 4);
  return (
    <figure className="fv-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} width="100%">
        <title id={`${id}-t`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="currentColor" opacity={0.15} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {levels.map((l, i) =>
          i % 3 === 0 || i === levels.length - 1 ? (
            <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s, k) => (
          <polyline
            key={s.id}
            fill="none"
            stroke={COLORS[k % COLORS.length]}
            strokeWidth={2}
            strokeDasharray={DASH[k % DASH.length]}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <ul className="fv-legend">
        {series.map((s, k) => (
          <li key={s.id}>
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" x2="28" y1="4" y2="4" stroke={COLORS[k % COLORS.length]} strokeWidth={2} strokeDasharray={DASH[k % DASH.length]} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <details>
        <summary>Pokaż dane</summary>
        <table className="fv-table">
          <thead>
            <tr>
              <th scope="col">Level</th>
              {series.map((s) => (
                <th scope="col" key={s.id}>
                  {s.label} ({valueName})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((l, i) => (
              <tr key={l}>
                <th scope="row">{l}</th>
                {series.map((s) => (
                  <td key={s.id}>{(s.values[i] ?? 0).toFixed(1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
