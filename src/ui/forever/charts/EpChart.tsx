// Equivalency points as bars: one group per stat, one bar per build, with the 95% interval.
import { Bar, BarChart, CartesianGrid, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EpResult } from '../../../forever/ep';
import { axisDomain, axisTicks, epRows, MAX_COLOURED, type EpRow } from './chartModel';
import { AXIS, BAND, colourOf, fmt, GRID } from './chartParts';

const NAMES: Record<string, string> = { intellect: 'Intellect', spirit: 'Spirit', stamina: 'Stamina', critPct: 'Crit 1%', hitPct: 'Hit 1%' };
const BAR = 12;

export function EpChart({ results }: { results: readonly EpResult[] }) {
  const builds = results.slice(0, MAX_COLOURED);
  const rows = epRows(builds);
  // the axis follows the weights; a very wide interval is cut off rather than squeezing every bar
  const domain = axisDomain([0, 1, ...rows.flatMap((r) => builds.map((b) => r.cells[b.build]?.value ?? 0))]);
  const height = rows.length * (builds.length * (BAR + 2) + 16) + 48;
  const title = 'Wagi statów na wykresie';
  return (
    <figure className="fv-viz" aria-label={title}>
      <figcaption className="fv-viz-title">{title} (ile punktów spell power wart jest punkt staty)</figcaption>
      <ul className="fv-viz-keys">
        {builds.map((b, i) => (
          <li key={b.build}>
            <span className="fv-key fv-key-box" style={{ background: colourOf(i) }} aria-hidden="true" />
            {b.build}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 800, height }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barGap={2} barCategoryGap={8}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={domain} ticks={axisTicks(domain)} allowDataOverflow {...AXIS} />
          <YAxis type="category" dataKey="stat" interval={0} width={80} tickFormatter={(s: string) => NAMES[s] ?? s} {...AXIS} />
          <ReferenceLine x={0} stroke="var(--text-dim)" />
          <ReferenceLine x={1} stroke="var(--viz-axis)" label={{ value: '1 = spell power', position: 'insideTopRight', fill: 'var(--text-dim)', fontSize: 11 }} />
          <Tooltip
            isAnimationActive={false}
            cursor={BAND}
            wrapperStyle={{ zIndex: 5, outline: 'none' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as EpRow | undefined;
              if (!active || !row) return null;
              return (
                <div className="fv-tip">
                  <p className="fv-tip-title">{NAMES[row.stat] ?? row.stat}</p>
                  <ul>
                    {builds.map((b, i) => {
                      const c = row.cells[b.build]!;
                      return (
                        <li key={b.build}>
                          <b>{c.note ?? fmt(c.value as number, 2)}</b>
                          <span className="fv-key" style={{ background: colourOf(i) }} aria-hidden="true" />
                          <span className="fv-tip-name">{b.build}</span>
                          <span className="fv-tip-gap">{c.error ? `${fmt((c.value as number) - c.error[0], 2)} do ${fmt((c.value as number) + c.error[1], 2)}` : ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }}
          />
          {builds.map((b, i) => (
            <Bar key={b.build} name={b.build} dataKey={(r: EpRow) => r.cells[b.build]?.value} fill={colourOf(i)} barSize={BAR} radius={3} isAnimationActive={false}>
              <ErrorBar dataKey={(r: EpRow) => r.cells[b.build]?.error} direction="x" width={3} strokeWidth={1} stroke="var(--text-dim)" />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="fv-viz-help">
        Kreska to przedział 95%; przedziały dłuższe niż oś są przycięte (pełne liczby w tabeli). Brak słupka: n/a albo hit na limicie.
        {results.length > builds.length ? ` Wykres pokazuje pierwsze ${MAX_COLOURED} buildów, tabela wszystkie.` : ''}
      </p>
    </figure>
  );
}
