// A minus B on every level, with the 95% interval: the colour says which build is better there.
import { Bar, BarChart, CartesianGrid, ErrorBar, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts';
import type { DuelResult } from '../../../forever/duel';
import { axisDomain, axisTicks, type DuelMetric } from './chartModel';
import { AXIS, BAND, colourOf, fmt, GRID, signed } from './chartParts';

const HEIGHT = 280;

interface DiffRow {
  level: number;
  mean: number;
  error: [number, number];
  a: number;
  b: number;
  winner: 'a' | 'b' | 'tie';
}

const FILL = { a: colourOf(0), b: colourOf(1), tie: colourOf(undefined) };

function rowsOf(sweep: readonly DuelResult[], metric: DuelMetric): DiffRow[] {
  return sweep.map((r) => {
    const d = r.diff[metric.diff];
    const mean = d.mean * metric.scale;
    const better = metric.higherIsBetter ? mean > 0 : mean < 0;
    return {
      level: r.level,
      mean,
      error: [mean - d.ci95[0] * metric.scale, d.ci95[1] * metric.scale - mean],
      a: metric.of(r.a),
      b: metric.of(r.b),
      winner: !d.significant || mean === 0 ? 'tie' : better ? 'a' : 'b',
    };
  });
}

export function DiffChart({ sweep, a, b, metric }: { sweep: readonly DuelResult[]; a: string; b: string; metric: DuelMetric }) {
  const rows = rowsOf(sweep, metric);
  const title = `Różnica A − B: ${metric.label}`;
  const domain = axisDomain([0, ...rows.flatMap((r) => [r.mean - r.error[0], r.mean + r.error[1]])]);
  return (
    <figure className="fv-viz" aria-label={title}>
      <figcaption className="fv-viz-title">{title}</figcaption>
      <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 800, height: HEIGHT }}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="level" {...AXIS} />
          <YAxis domain={domain} ticks={axisTicks(domain)} width={52} {...AXIS} axisLine={false} />
          <ReferenceLine y={0} stroke="var(--text-dim)" />
          <Tooltip
            isAnimationActive={false}
            cursor={BAND}
            wrapperStyle={{ zIndex: 5, outline: 'none' }}
            content={({ active, label }) => {
              const r = rows.find((x) => x.level === Number(label));
              if (!active || !r) return null;
              return (
                <div className="fv-tip">
                  <p className="fv-tip-title">Level {r.level}</p>
                  <ul>
                    <li>
                      <b>{fmt(r.a, metric.decimals)}</b>
                      <span className="fv-key" style={{ background: FILL.a }} aria-hidden="true" />
                      <span className="fv-tip-name">{a}</span>
                    </li>
                    <li>
                      <b>{fmt(r.b, metric.decimals)}</b>
                      <span className="fv-key" style={{ background: FILL.b }} aria-hidden="true" />
                      <span className="fv-tip-name">{b}</span>
                    </li>
                  </ul>
                  <p className="fv-tip-foot">
                    A − B: {signed(r.mean, metric.decimals)} (95%: {signed(r.mean - r.error[0], metric.decimals)} do {signed(r.mean + r.error[1], metric.decimals)})
                    <br />
                    {r.winner === 'tie' ? 'różnica nieistotna' : `lepszy: ${r.winner === 'a' ? a : b}`}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="mean" maxBarSize={24} isAnimationActive={false} shape={(p: BarShapeProps) => <Rectangle {...p} fill={FILL[(p.payload as DiffRow).winner]} radius={3} />}>
            <ErrorBar dataKey="error" direction="y" width={3} strokeWidth={1} stroke="var(--text-dim)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="fv-viz-keys">
        {(
          [
            ['a', `lepszy ${a} (A)`],
            ['b', `lepszy ${b} (B)`],
            ['tie', 'różnica nieistotna'],
          ] as const
        ).map(([k, text]) => (
          <li key={k}>
            <span className="fv-key fv-key-box" style={{ background: FILL[k] }} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <p className="fv-viz-help">Słupek to średnia różnica na wspólnych seedach, kreska to przedział 95%.{metric.higherIsBetter ? ' Powyżej zera lepszy jest A.' : ' Tu mniej znaczy lepiej: poniżej zera lepszy jest A.'}</p>
    </figure>
  );
}
