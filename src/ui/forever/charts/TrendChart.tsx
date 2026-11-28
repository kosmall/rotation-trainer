// Lines over the levels: pointer crosshair with all builds in the tooltip, a legend that picks which builds get a
// colour, the view "percent behind the leader" and a slider that narrows the levels.
import { useMemo, useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { assignSlots, axisDomain, axisTicks, byMean, defaultShown, MAX_COLOURED, meanOf, toggleShown, tooltipRows, trendRows, type Series, type TrendMode, type TrendRow } from './chartModel';
import { AXIS, colourOf, fmt, GRID } from './chartParts';

const HEIGHT = 380;
/** From this many series on, the tooltip lists only the coloured ones and the leader. */
const TOOLTIP_ALL = 10;
/** The level slider appears when there are more levels than this. */
const BRUSH_FROM = 12;

interface Props {
  title: string;
  levels: readonly number[];
  series: readonly Series[];
  valueName: string;
  higherIsBetter?: boolean;
  decimals?: number;
}

export function TrendTooltip({ series, levels, level, slots, valueName, higherIsBetter = true, decimals = 1 }: Omit<Props, 'title'> & { level: number; slots: Readonly<Record<string, number>> }) {
  const i = levels.indexOf(level);
  if (i < 0) return null;
  const all = tooltipRows(series, i, higherIsBetter);
  const rows = series.length <= TOOLTIP_ALL ? all : all.filter((r, k) => k === 0 || slots[r.id] !== undefined);
  return (
    <div className="fv-tip">
      <p className="fv-tip-title">Level {level}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={slots[r.id] === undefined ? 'fv-tip-context' : undefined}>
            <b>{fmt(r.value, decimals)}</b>
            <span className="fv-key" style={{ background: colourOf(slots[r.id]) }} aria-hidden="true" />
            <span className="fv-tip-name">{r.label}</span>
            <span className="fv-tip-gap">{r.gapPct === 0 ? 'najlepszy' : `${fmt(r.gapPct)}%`}</span>
          </li>
        ))}
      </ul>
      <p className="fv-tip-foot">
        {valueName}
        {all.length > rows.length ? `, ${all.length - rows.length} innych w tle` : ''}
      </p>
    </div>
  );
}

function Trend({ title, levels, series, valueName, higherIsBetter = true, decimals = 1 }: Props) {
  const [mode, setMode] = useState<TrendMode>('value');
  const [picked, setPicked] = useState(() => {
    const shown = defaultShown(series, higherIsBetter);
    return { shown, slots: assignSlots({}, shown) };
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const { shown, slots } = picked;
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = toggleShown(p.shown, id);
      return { shown: next, slots: assignSlots(p.slots, next) };
    });
  // the same array until the data or the view changes: the chart resets the slider when it is given new data
  const rows = useMemo(() => trendRows(levels, series, mode, higherIsBetter), [levels, series, mode, higherIsBetter]);
  // the axis follows the coloured builds in the visible levels, so close lines spread over the whole height
  const visible = range ? rows.slice(range.from, range.to + 1) : rows;
  const scaled = shown.length ? shown : series.map((s) => s.id);
  const domain = axisDomain(visible.flatMap((r) => scaled.map((id) => r.values[id] as number)));
  // grey lines first, so the coloured ones lie on top
  const drawn = [...series].sort((a, b) => Number(shown.includes(a.id)) - Number(shown.includes(b.id)));
  return (
    <figure className="fv-viz" aria-label={title}>
      <figcaption className="fv-viz-title">{title}</figcaption>
      {series.length > 1 && (
        <div className="fv-viz-switch" role="group" aria-label="Widok wykresu">
          <button type="button" aria-pressed={mode === 'value'} onClick={() => setMode('value')}>
            Wartości
          </button>
          <button type="button" aria-pressed={mode === 'gap'} onClick={() => setMode('gap')}>
            Strata do najlepszego (%)
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 800, height: HEIGHT }}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="level" type="number" domain={['dataMin', 'dataMax']} allowDecimals={false} tickCount={Math.min(levels.length, 11)} {...AXIS} />
          <YAxis domain={domain} ticks={axisTicks(domain)} allowDataOverflow width={52} tickFormatter={(v: number) => (mode === 'gap' ? `${v}%` : String(v))} {...AXIS} axisLine={false} />
          {mode === 'gap' && <ReferenceLine y={0} stroke="var(--viz-axis)" />}
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: 'var(--text-dim)', strokeWidth: 1 }}
            wrapperStyle={{ zIndex: 5, outline: 'none' }}
            content={({ active, label }) => (active ? <TrendTooltip series={series} levels={levels} level={Number(label)} slots={slots} valueName={valueName} higherIsBetter={higherIsBetter} decimals={decimals} /> : null)}
          />
          {drawn.map((s) => {
            const slot = slots[s.id];
            const faded = hovered !== null && hovered !== s.id;
            const on = slot !== undefined || hovered === s.id;
            return (
              <Line
                key={s.id}
                name={s.label}
                dataKey={(r: TrendRow) => r.values[s.id]}
                type="linear"
                className={[slot === undefined ? 'fv-line-context' : '', faded ? 'fv-line-faded' : ''].filter(Boolean).join(' ') || undefined}
                stroke={slot === undefined && hovered === s.id ? 'var(--text)' : colourOf(slot)}
                strokeWidth={hovered === s.id ? 3 : on ? 2 : 1}
                strokeOpacity={faded ? 0.15 : on ? 1 : mode === 'gap' ? 0.25 : 0.45}
                dot={levels.length === 1}
                activeDot={slot === undefined ? false : { r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
          })}
          {levels.length > BRUSH_FROM && (
            <Brush
              dataKey="level"
              height={24}
              travellerWidth={10}
              stroke="var(--viz-axis)"
              fill="var(--surface)"
              startIndex={range?.from ?? 0}
              endIndex={range?.to ?? levels.length - 1}
              onChange={(r: { startIndex?: number; endIndex?: number }) => setRange({ from: r.startIndex ?? 0, to: r.endIndex ?? levels.length - 1 })}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="fv-viz-legend" role="group" aria-label="Legenda wykresu">
        {byMean(series, higherIsBetter).map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={shown.includes(s.id)}
            disabled={!shown.includes(s.id) && shown.length >= MAX_COLOURED}
            onClick={() => toggle(s.id)}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(s.id)}
            onBlur={() => setHovered(null)}
          >
            <span className="fv-key" style={{ background: colourOf(slots[s.id]) }} aria-hidden="true" />
            <span className="fv-legend-name">{s.label}</span> <span className="fv-legend-value">{fmt(meanOf(s.values), decimals)}</span>
          </button>
        ))}
      </div>
      <p className="fv-viz-help">
        Najedź na wykres, aby zobaczyć wartości na levelu. Kliknij nazwę, aby dodać lub zdjąć kolor (najwyżej {MAX_COLOURED} naraz); liczba obok nazwy to średnia po levelach.
        {levels.length > BRUSH_FROM ? ' Suwak pod wykresem zawęża zakres leveli.' : ''}
      </p>
    </figure>
  );
}

/** A new set of series starts with fresh colours and range. */
export function TrendChart(props: Props) {
  return <Trend key={props.series.map((s) => s.id).join('|')} {...props} />;
}
