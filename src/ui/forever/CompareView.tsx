import { useState } from 'react';
import { VARIANT_IDS } from '../../forever/builds';
import { MAX_LEVEL, MIN_LEVEL, type DuelOutcome, type Settings } from '../../forever/web/api';
import { DUEL_METRICS, type DuelMetric } from './charts/chartModel';
import { DiffChart } from './charts/DiffChart';
import { SweepChart } from './SweepChart';
import type { ForeverRun } from './useForeverRun';

const f = (x: number, d = 1) => x.toFixed(d);
const side = (s: 'a' | 'b' | 'tie', a: string, b: string) => (s === 'a' ? a : s === 'b' ? b : 'remis (różnica nieistotna)');

export function CompareView({ settings, run, duel, onRun, ids = VARIANT_IDS }: { settings: Settings; run: ForeverRun; duel: DuelOutcome | undefined; onRun(a: string, b: string, sweep: boolean): void; ids?: readonly string[] }) {
  const [a, setA] = useState(VARIANT_IDS[0] as string);
  const [b, setB] = useState(VARIANT_IDS[2] as string);
  const [sweep, setSweep] = useState(true);
  const [metricId, setMetricId] = useState('kph');
  const metric = DUEL_METRICS[metricId] as DuelMetric;
  const running = run.status === 'running';
  const at = duel?.at;
  const rows: { name: string; a: number; b: number; d: { mean: number; ci95: [number, number]; significant: boolean }; dec: number }[] = at
    ? [
        { name: 'Zabić/h', a: at.a.killsPerHour, b: at.b.killsPerHour, d: at.diff.killsPerHour, dec: 1 },
        { name: 'TTK s', a: at.a.ttkMean, b: at.b.ttkMean, d: at.diff.ttk, dec: 2 },
        { name: 'Mana/zab.', a: at.a.manaPerKill, b: at.b.manaPerKill, d: at.diff.manaPerKill, dec: 0 },
        { name: 'HP/zab.', a: at.a.hpPerKill, b: at.b.hpPerKill, d: at.diff.hpPerKill, dec: 0 },
        { name: 'Przerwa s/zab.', a: at.a.restSecPerKill, b: at.b.restSecPerKill, d: at.diff.restSecPerKill, dec: 2 },
        { name: 'Przerwy/h', a: at.a.breaksPerHour, b: at.b.breaksPerHour, d: at.diff.breaksPerHour, dec: 2 },
        { name: 'Przestój', a: 100 * at.a.downtimeShare, b: 100 * at.b.downtimeShare, d: { ...at.diff.downtimeShare, mean: 100 * at.diff.downtimeShare.mean, ci95: [100 * at.diff.downtimeShare.ci95[0], 100 * at.diff.downtimeShare.ci95[1]] }, dec: 1 },
      ]
    : [];
  return (
    <>
      <div className="fv-row">
        <label>
          Build A{' '}
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {ids.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Build B{' '}
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {ids.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} /> Cały zakres {MIN_LEVEL}–{MAX_LEVEL}
        </label>
        <button type="button" className="btn primary" disabled={running || a === b} onClick={() => onRun(a, b, sweep)}>
          Porównaj
        </button>
      </div>
      {a === b && <p className="fv-note">Wybierz dwa różne buildy.</p>}
      {!duel && <p className="fv-empty">Wybierz dwa buildy i kliknij Porównaj: oba grają na tych samych seedach, więc różnice mają wąskie przedziały ufności.</p>}
      {duel && at && (
        <>
          <p className="fv-note">
            Level {duel.settings.level}, {duel.settings.sessions} sesji, seed {duel.settings.seed}. Różnica = A − B z przedziałem 95% (sparowane).
            {duel.settings.level !== settings.level ? ' (Wynik dla innego levelu niż obecne ustawienie.)' : ''}
          </p>
          <p className="fv-verdict">
            Więcej zabić/h: <b>{side(at.verdict.moreKillsPerHour, duel.a, duel.b)}</b> · szybsze zabicie: {side(at.verdict.fasterKill, duel.a, duel.b)} · mniej many: {side(at.verdict.lessMana, duel.a, duel.b)} · mniej przerw: {side(at.verdict.fewerBreaks, duel.a, duel.b)}
          </p>
          <table className="fv-table" aria-label="Porównanie buildów">
            <thead>
              <tr>
                <th scope="col">Metryka</th>
                <th scope="col">{duel.a}</th>
                <th scope="col">{duel.b}</th>
                <th scope="col">A − B (95% CI)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>{f(r.a, r.dec)}</td>
                  <td>{f(r.b, r.dec)}</td>
                  <td>
                    {f(r.d.mean, r.dec)} ({f(r.d.ci95[0], r.dec)}…{f(r.d.ci95[1], r.dec)}){r.d.significant ? '' : ' ≈'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {duel.sweep && (
            <>
              <h2>
                Levele {MIN_LEVEL}–{MAX_LEVEL} na wykresach
              </h2>
              <div className="fv-row">
                <label>
                  Metryka na wykresach{' '}
                  <select value={metricId} onChange={(e) => setMetricId(e.target.value)}>
                    {Object.entries(DUEL_METRICS).map(([id, m]) => (
                      <option key={id} value={id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SweepChart
                title={`${duel.a} vs ${duel.b}: ${metric.label} wg levelu`}
                levels={duel.sweep.map((r) => r.level)}
                series={[
                  { id: 'a', label: duel.a, values: duel.sweep.map((r) => metric.of(r.a)) },
                  { id: 'b', label: duel.b, values: duel.sweep.map((r) => metric.of(r.b)) },
                ]}
                valueName={metric.label}
                higherIsBetter={metric.higherIsBetter}
                decimals={metric.decimals}
              />
              <DiffChart sweep={duel.sweep} a={duel.a} b={duel.b} metric={metric} />
              <p className="fv-note">
                Zwycięzca na levelu: {duel.sweep.map((r) => `${r.level}: ${r.verdict.moreKillsPerHour === 'a' ? 'A' : r.verdict.moreKillsPerHour === 'b' ? 'B' : '≈'}`).join(', ')}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
