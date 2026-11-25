import { useState } from 'react';
import { VARIANT_IDS } from '../../forever/builds';
import type { DuelOutcome, Settings } from '../../forever/web/api';
import { SweepChart } from './SweepChart';
import type { ForeverRun } from './useForeverRun';

const f = (x: number, d = 1) => x.toFixed(d);
const side = (s: 'a' | 'b' | 'tie', a: string, b: string) => (s === 'a' ? a : s === 'b' ? b : 'remis (różnica nieistotna)');

export function CompareView({ settings, run, duel, onRun }: { settings: Settings; run: ForeverRun; duel: DuelOutcome | undefined; onRun(a: string, b: string, sweep: boolean): void }) {
  const [a, setA] = useState(VARIANT_IDS[0] as string);
  const [b, setB] = useState(VARIANT_IDS[2] as string);
  const [sweep, setSweep] = useState(true);
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
            {VARIANT_IDS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Build B{' '}
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {VARIANT_IDS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} /> Cały zakres 40–59
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
              <h2>Zabicia na godzinę, levele 40–59</h2>
              <SweepChart
                title={`${duel.a} vs ${duel.b}: zabicia na godzinę wg levelu`}
                levels={duel.sweep.map((r) => r.level)}
                series={[
                  { id: 'a', label: duel.a, values: duel.sweep.map((r) => r.a.killsPerHour) },
                  { id: 'b', label: duel.b, values: duel.sweep.map((r) => r.b.killsPerHour) },
                ]}
                valueName="zabić/h"
              />
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
