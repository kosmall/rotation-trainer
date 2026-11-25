import { DEFAULT_SETTINGS, type RankingResult, type SweepResult } from '../../forever/web/api';
import { VARIANT_IDS } from '../../forever/builds';
import { SweepChart } from './SweepChart';
import type { ForeverRun } from './useForeverRun';

const f = (x: number, d = 1) => x.toFixed(d);

export function SimView({ run, ranking, sweep, onSweep }: { run: ForeverRun; ranking: RankingResult | undefined; sweep: SweepResult | undefined; onSweep(): void }) {
  if (!ranking)
    return (
      <p className="fv-empty">
        Ustaw level postaci i uruchom symulację. Wyniki wszystkich {VARIANT_IDS.length} buildów pojawią się tutaj.
      </p>
    );
  const s = ranking.settings;
  const best = ranking.rows[0]?.metrics.killsPerHour ?? 1;
  return (
    <>
      <p className="fv-note">
        Level {s.level}, sprzęt: {s.profile}, {s.mobs} mob/pull, {s.sessions} sesji, seed {s.seed}. Wyniki zależą od założeń oznaczonych do weryfikacji (zakładka Założenia).
      </p>
      <div className="fv-scroll">
        <table className="fv-table" aria-label="Ranking buildów">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Build</th>
              <th scope="col">Zabić/h</th>
              <th scope="col">vs najlepszy (95% CI)</th>
              <th scope="col">TTK s</th>
              <th scope="col">Mana/zab.</th>
              <th scope="col">HP/zab.</th>
              <th scope="col">Picie s</th>
              <th scope="col">Jedzenie s</th>
              <th scope="col">Life Tap s</th>
              <th scope="col">Przestój</th>
              <th scope="col">Przerwy/h</th>
              <th scope="col">Zgony/h</th>
              <th scope="col">GCD</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((r, i) => {
              const m = r.metrics;
              return (
                <tr key={m.variant} className={i === 0 ? 'fv-best' : undefined}>
                  <td>{i + 1}</td>
                  <th scope="row">{m.variant}</th>
                  <td>
                    <span className="fv-kphbar" style={{ width: `${(100 * m.killsPerHour) / best}%` }} aria-hidden="true" />
                    <b>{f(m.killsPerHour)}</b>
                  </td>
                  <td>{r.vsBest ? `${f(r.vsBest.mean)} (${f(r.vsBest.ci95[0])}…${f(r.vsBest.ci95[1])})${r.vsBest.significant ? '' : ' ≈'}` : 'najlepszy'}</td>
                  <td>{f(m.ttkMean)}</td>
                  <td>{f(m.manaPerKill, 0)}</td>
                  <td>{f(m.hpPerKill, 0)}</td>
                  <td>{f(m.drinkSecPerKill)}</td>
                  <td>{f(m.eatSecPerKill)}</td>
                  <td>{f(m.lifeTapSecPerKill)}</td>
                  <td>{f(100 * m.downtimeShare, 0)}%</td>
                  <td>{f(m.breaksPerHour)}</td>
                  <td>{f(m.deathsPerHour, 2)}</td>
                  <td>{f(100 * m.gcdUtil, 0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fv-note">„≈” oznacza różnicę nieistotną statystycznie (przedział 95% obejmuje 0).</p>
      <h2>Krzywa kills/h po levelach 40–59</h2>
      <button type="button" className="btn" disabled={run.status === 'running'} onClick={onSweep}>
        Policz wszystkie levele ({VARIANT_IDS.length * 20} komórek)
      </button>
      {sweep && <SweepChart title="Zabicia na godzinę wg levelu" levels={sweep.levels} series={sweep.series.map((x) => ({ id: x.build, label: x.build, values: x.kph }))} valueName="zabić/h" />}
      {sweep && sweep.settings.sessions !== DEFAULT_SETTINGS.sessions && <p className="fv-note">Krzywa użyła {sweep.settings.sessions} sesji.</p>}
    </>
  );
}
