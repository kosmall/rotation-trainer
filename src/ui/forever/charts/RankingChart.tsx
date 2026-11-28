// The ranking as a list of bars, best first: the name, a bar, the result and the distance to the best. The colour
// says what kind of build it is. The checkbox next to a name (or a click on the bar) ticks the build for the curve
// over the levels.
import { useState } from 'react';
import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts';
import type { RankingResult } from '../../../forever/web/api';
import { familyOf, nameAxis, RANK_METRICS, rankingLabel, rankingRows, shortName, type Family, type RankMetric, type RankRowData } from './chartModel';
import { BAND, colourOf, fmt, signed } from './chartParts';

const ROW = 30;
/** How many builds are listed until all are asked for. */
const TOP = 10;
/** Under this width only the result is written next to a bar, not the distance to the best. */
const NARROW = 520;
/** Room for the checkbox left of a name. */
const BOX = 22;

const FAMILIES: Record<Family, { label: string; colour: string }> = {
  affliction: { label: 'Affliction', colour: colourOf(0) },
  demonology: { label: 'Demonology i Fire', colour: colourOf(1) },
  own: { label: 'Twoje buildy', colour: colourOf(2) },
};

function RankTooltip({ row }: { row: RankRowData }) {
  const m = row.metrics;
  const d = row.vsBest;
  return (
    <div className="fv-tip">
      <p className="fv-tip-title">{row.id}</p>
      <dl>
        <dt>Zabić/h</dt>
        <dd>{fmt(m.killsPerHour)}</dd>
        <dt>Do najlepszego</dt>
        <dd>{d ? `${signed(d.mean)} (95%: ${signed(d.ci95[0])} do ${signed(d.ci95[1])})${d.significant ? '' : ', nieistotne'}` : 'najlepszy'}</dd>
        <dt>TTK</dt>
        <dd>{fmt(m.ttkMean)} s</dd>
        <dt>Przestój</dt>
        <dd>{fmt(100 * m.downtimeShare, 0)}%</dd>
        <dt>Przerwy/h</dt>
        <dd>{fmt(m.breaksPerHour)}</dd>
        <dt>Zgony/h</dt>
        <dd>{fmt(m.deathsPerHour, 2)}</dd>
      </dl>
    </div>
  );
}

export function RankingChart({ ranking, selected, onToggle }: { ranking: RankingResult; selected?: ReadonlySet<string>; onToggle?(id: string): void }) {
  const [metric, setMetric] = useState<RankMetric>('kph');
  const [all, setAll] = useState(false);
  const [chartWidth, setChartWidth] = useState(800);
  const def = RANK_METRICS[metric];
  const rows = rankingRows(ranking.rows, metric);
  const shown = all ? rows : rows.slice(0, TOP);
  const narrow = chartWidth < NARROW;
  const box = onToggle ? BOX : 0;
  const names = nameAxis(rows.map((r) => r.id), chartWidth - box);
  const height = shown.length * ROW + 8;
  const families = (Object.keys(FAMILIES) as Family[]).filter((f) => rows.some((r) => familyOf(r.id) === f));
  const title = `Ranking na wykresie: ${def.label}`;
  return (
    <figure className="fv-viz" aria-label={title}>
      <figcaption className="fv-viz-title">
        <label>
          Metryka:{' '}
          <select aria-label="Metryka rankingu" value={metric} onChange={(e) => setMetric(e.target.value as RankMetric)}>
            {Object.entries(RANK_METRICS).map(([id, m]) => (
              <option key={id} value={id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </figcaption>
      <ul className="fv-viz-keys">
        {families.map((f) => (
          <li key={f}>
            <span className="fv-key fv-key-box" style={{ background: FAMILIES[f].colour }} aria-hidden="true" />
            {FAMILIES[f].label}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 800, height }} onResize={(w) => setChartWidth(w)}>
        <BarChart data={shown} layout="vertical" margin={{ top: 4, right: narrow ? 56 : 136, bottom: 4, left: 0 }}>
          <XAxis type="number" domain={[0, 'dataMax']} hide />
          <YAxis
            type="category"
            dataKey="id"
            interval={0}
            width={names.width + box}
            tickLine={false}
            axisLine={false}
            tick={({ y, payload }: { y?: number | string; payload?: { value: string } }) => {
              const id = payload?.value ?? '';
              const on = selected?.has(id) ?? false;
              const name = (
                <text className={`fv-rank-name${on ? ' fv-rank-ticked' : ''}`} x={box || 2} y={y} dy="0.35em" textAnchor="start">
                  {shortName(id, names.max)}
                </text>
              );
              if (!onToggle) return name;
              const mid = Number(y);
              return (
                <g
                  className="fv-rank-check"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Zaznacz na wykresie: ${id}`}
                  tabIndex={0}
                  onClick={() => onToggle(id)}
                  onKeyDown={(e) => {
                    if (e.key !== ' ' && e.key !== 'Enter') return;
                    e.preventDefault();
                    onToggle(id);
                  }}
                >
                  {/* the whole name is the target, not only the box */}
                  <rect className="fv-rank-hit" x={0} y={mid - ROW / 2} width={names.width + box} height={ROW} />
                  <rect className="fv-rank-box" x={2} y={mid - 7} width={14} height={14} rx={3} />
                  {on && <path className="fv-rank-tick" d={`M5 ${mid}l3 3l5 -6`} />}
                  {name}
                </g>
              );
            }}
          />
          <Tooltip isAnimationActive={false} cursor={BAND} wrapperStyle={{ zIndex: 5, outline: 'none' }} content={({ active, payload }) => (active && payload?.[0] ? <RankTooltip row={payload[0].payload as RankRowData} /> : null)} />
          <Bar
            dataKey="value"
            barSize={18}
            minPointSize={2}
            isAnimationActive={false}
            cursor={onToggle ? 'pointer' : undefined}
            onClick={(d: { payload?: unknown }) => onToggle?.((d.payload as RankRowData).id)}
            shape={(p: BarShapeProps) => {
              const row = p.payload as RankRowData;
              const label = rankingLabel(row, metric);
              const ticked = selected?.has(row.id);
              return (
                <g>
                  <Rectangle {...p} fill={FAMILIES[familyOf(row.id)].colour} radius={[0, 4, 4, 0]} stroke={ticked ? 'var(--text)' : undefined} strokeWidth={ticked ? 2 : 0} />
                  <text className="fv-rank-label" x={Number(p.x) + Number(p.width) + 8} y={Number(p.y) + Number(p.height) / 2} dy="0.35em">
                    <tspan className="fv-rank-value">{label.value}</tspan>
                    {!narrow && label.gap && (
                      <tspan className="fv-rank-gap" dx={10}>
                        {label.gap}
                      </tspan>
                    )}
                  </text>
                </g>
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
      {rows.length > TOP && (
        <button type="button" className="btn" onClick={() => setAll((a) => !a)}>
          {all ? `Pokaż ${TOP} najlepszych` : `Pokaż wszystkie (${rows.length})`}
        </button>
      )}
      <p className="fv-viz-help">
        {metric === 'kph' ? 'Obok słupka wynik i różnica do najlepszego (≈: nieistotna).' : `Najlepsze na górze: krótszy słupek jest lepszy (${def.unit}).`} Najechanie pokazuje szczegóły.
      </p>
    </figure>
  );
}
