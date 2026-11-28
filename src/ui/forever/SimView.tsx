import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, MAX_LEVEL, MIN_LEVEL, type RankingResult, type SweepResult } from '../../forever/web/api';
import { VARIANT_IDS } from '../../forever/builds';
import { routeHref } from '../shell/router';
import { RankingChart } from './charts/RankingChart';
import { SweepChart } from './SweepChart';
import type { ForeverRun } from './useForeverRun';

const f = (x: number, d = 1) => x.toFixed(d);

export function RankingTable({ ranking, highlight, onOpenBuild, selected, onToggle }: { ranking: RankingResult; highlight?: string; onOpenBuild?(id: string): void; selected?: ReadonlySet<string>; onToggle?(id: string): void }) {
  const best = ranking.rows[0]?.metrics.killsPerHour ?? 1;
  return (
      <div className="fv-scroll">
        <table className="fv-table fv-ranking" aria-label="Ranking buildów">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="fv-sticky">
                Build
              </th>
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
              <th scope="col" title="Średnie zdrowie demona na początku pulla">Demon HP</th>
              <th scope="col">Zgony demona/h</th>
              <th scope="col" title="Czas Health Funnel między pullami na zabitego moba">Funnel s</th>
              <th scope="col">GCD</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((r, i) => {
              const m = r.metrics;
              return (
                <tr key={m.variant} className={`${i === 0 ? 'fv-best' : ''}${m.variant === highlight ? ' fv-mine' : ''}`.trim() || undefined}>
                  <td>{i + 1}</td>
                  <th scope="row" className="fv-sticky">
                    {selected && onToggle && (
                      <input type="checkbox" className="fv-pick" aria-label={`Na krzywej: ${m.variant}`} checked={selected.has(m.variant)} onChange={() => onToggle(m.variant)} />
                    )}
                    {onOpenBuild ? (
                      <a href={routeHref({ mode: 'forever', view: 'builds' })} onClick={() => onOpenBuild(m.variant)} title="Pokaż drzewo talentów tego builda">
                        {m.variant}
                      </a>
                    ) : (
                      m.variant
                    )}
                  </th>
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
                  <td>{m.petHpStartPct == null ? '–' : `${f(m.petHpStartPct, 0)}%`}</td>
                  <td>{f(m.petDeathsPerHour, 2)}</td>
                  <td>{m.funnelSecPerKill == null ? '–' : f(m.funnelSecPerKill)}</td>
                  <td>{f(100 * m.gcdUtil, 0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );
}

export function SimView({
  run,
  ranking,
  sweep,
  selected,
  onSelect,
  onSweep,
  onOpenBuild,
}: {
  run: ForeverRun;
  ranking: RankingResult | undefined;
  sweep: SweepResult | undefined;
  /** The builds ticked for the curve over the levels. */
  selected: ReadonlySet<string>;
  onSelect(ids: readonly string[]): void;
  /** Computes the curve of these builds. */
  onSweep(builds: readonly string[]): void;
  onOpenBuild(id: string): void;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  // a freshly computed curve is brought into view: it lies below the ranking
  const curve = useRef<HTMLElement>(null);
  const seenSweep = useRef(sweep);
  useEffect(() => {
    if (sweep && sweep !== seenSweep.current) curve.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    seenSweep.current = sweep;
  }, [sweep]);
  if (!ranking)
    return (
      <p className="fv-empty">
        Ustaw level postaci i uruchom symulację. Wyniki wszystkich {VARIANT_IDS.length} buildów pojawią się tutaj.
      </p>
    );
  const s = ranking.settings;
  const ids = ranking.rows.map((r) => r.metrics.variant);
  // only builds of the current ranking can be computed (a scenario or a custom build may have been switched off since)
  const chosen = ids.filter((id) => selected.has(id));
  const toggle = (id: string) => onSelect(selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id]);
  return (
    <>
      <section aria-labelledby="fv-ranking-title">
        <div className="fv-section-head">
          <h2 id="fv-ranking-title">Ranking</h2>
          <div className="fv-viz-switch" role="group" aria-label="Widok rankingu">
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
              Wykres
            </button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
              Tabela
            </button>
          </div>
        </div>
        <p className="fv-note">
          Level {s.level}, sprzęt: {s.profile}, {s.mobs} mob/pull, {s.sessions} sesji, seed {s.seed}. Wyniki zależą od założeń oznaczonych do weryfikacji (zakładka Założenia).
        </p>
        <div className="fv-selectbar" role="group" aria-label="Zaznaczone buildy">
          <span>
            Zaznaczone: <b>{chosen.length}</b>
          </span>
          <button type="button" className="btn primary" disabled={run.status === 'running' || chosen.length === 0} onClick={() => onSweep(chosen)}>
            Krzywa {MIN_LEVEL}–{MAX_LEVEL} dla zaznaczonych{chosen.length > 0 ? ` (${chosen.length})` : ''}
          </button>
          <span className="fv-selectbar-more">
            <button type="button" className="btn small" onClick={() => onSelect(ids.slice(0, 5))}>
              Zaznacz 5 najlepszych
            </button>
            <button type="button" className="btn small" onClick={() => onSelect(ids)}>
              Zaznacz wszystkie
            </button>
            <button type="button" className="btn small" disabled={selected.size === 0} onClick={() => onSelect([])}>
              Wyczyść
            </button>
          </span>
        </div>
        {view === 'chart' ? (
          <RankingChart ranking={ranking} selected={selected} onToggle={toggle} />
        ) : (
          <>
            <RankingTable ranking={ranking} onOpenBuild={onOpenBuild} selected={selected} onToggle={toggle} />
            <p className="fv-note">„≈” oznacza różnicę nieistotną statystycznie (przedział 95% obejmuje 0).</p>
          </>
        )}
      </section>
      {sweep && (
        <section ref={curve} className="fv-curve" aria-label="Krzywa po levelach">
          <h2>
            Krzywa kills/h po levelach {MIN_LEVEL}–{MAX_LEVEL}
          </h2>
          <SweepChart title="Zabicia na godzinę wg levelu" levels={sweep.levels} series={sweep.series.map((x) => ({ id: x.build, label: x.build, values: x.kph }))} valueName="zabić/h" />
          {sweep.settings.sessions !== DEFAULT_SETTINGS.sessions && <p className="fv-note">Krzywa użyła {sweep.settings.sessions} sesji.</p>}
        </section>
      )}
    </>
  );
}
