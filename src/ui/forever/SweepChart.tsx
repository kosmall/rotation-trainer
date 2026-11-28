import { TrendChart } from './charts/TrendChart';
import type { Series } from './charts/chartModel';
import { extremesAt, summarize, type RankRow } from './sweepStats';

export type SweepSeries = Series;

/** The builds by the number of levels on which they led (or trailed). */
function RankTable({ title, rows, levels, nameOf }: { title: string; rows: readonly RankRow[]; levels: number; nameOf(id: string): string }) {
  return (
    <table className="fv-table fv-rank-table" aria-label={title}>
      <caption>
        {title} (z {levels} leveli)
      </caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Build</th>
          <th scope="col">Levele</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            {/* builds with the same count share the place */}
            <td>{rows.findIndex((x) => x.count === r.count) + 1}</td>
            <th scope="row">{nameOf(r.id)}</th>
            <td>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The chart of builds over levels (see TrendChart); the data table and the rank counts sit behind a disclosure. */
export function SweepChart({ title, levels, series, valueName, higherIsBetter = true, decimals = 1 }: { title: string; levels: readonly number[]; series: readonly SweepSeries[]; valueName: string; higherIsBetter?: boolean; decimals?: number }) {
  // the statistics count the highest value as the best: turn the values around when less is better
  const scored = higherIsBetter ? series : series.map((s) => ({ ...s, values: s.values.map((v) => -v) }));
  const summary = summarize(scored, levels.length);
  const labelOf = new Map(series.map((s) => [s.id, s.label]));
  return (
    <div className="fv-chart">
      <TrendChart title={title} levels={levels} series={series} valueName={valueName} higherIsBetter={higherIsBetter} decimals={decimals} />
      <details>
        <summary>{series.length > 1 ? 'Pokaż dane i statystyki' : 'Pokaż dane'}</summary>
        <div className="fv-scroll">
        <table className="fv-table" aria-label={`Dane: ${title}`}>
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
            {levels.map((l, i) => {
              const top = new Set(extremesAt(scored, i).best);
              return (
                <tr key={l}>
                  <th scope="row">{l}</th>
                  {series.map((s) =>
                    top.has(s.id) ? (
                      <td key={s.id} className="fv-top" title={`Najlepszy wynik na levelu ${l}`}>
                        <strong>{(s.values[i] ?? 0).toFixed(decimals)}</strong>
                      </td>
                    ) : (
                      <td key={s.id}>{(s.values[i] ?? 0).toFixed(decimals)}</td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {series.length > 1 &&
          (summary.levels === 0 ? (
            <p className="fv-note">Buildy nie różnią się na żadnym levelu.</p>
          ) : (
            <div className="fv-ranks">
              <RankTable title="Ile razy najlepszy" rows={summary.best} levels={summary.levels} nameOf={(x) => labelOf.get(x) ?? x} />
              <RankTable title="Ile razy najgorszy" rows={summary.worst} levels={summary.levels} nameOf={(x) => labelOf.get(x) ?? x} />
            </div>
          ))}
      </details>
    </div>
  );
}
