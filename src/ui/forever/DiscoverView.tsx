import { useEffect, useState } from 'react';
import type { CustomBuildData } from '../../forever/builds';
import type { TopRow } from '../../forever/discover/engine';
import { verifyFor } from '../../forever/discover/report';
import { liveSteps, sacrificeLive } from '../../forever/discover/space';
import { TALENTS, TALENT_BY_ID } from '../../forever/talents';
import type { Tree } from '../../forever/types';
import { paramsOf, type Settings } from '../../forever/web/api';
import { discoveredBuild, type DiscoverBudget } from '../../forever/web/discover';
import { routeHref } from '../shell/router';
import { PET_NAMES, spellName } from './buildFacts';
import { describeCond } from './RotationsView';
import type { DiscoverRun } from './useDiscover';

const STAGES: Record<string, string> = { screen: '1/3: przegląd wszystkich kombinacji', search: '2/3: dokładne szukanie talentów', final: '3/3: przeliczenie najlepszych', insensitivity: '3/3: talenty bez wpływu' };
const TREE_NAMES: Record<Tree, string> = { aff: 'Affliction', demo: 'Demonology', destro: 'Destruction' };
const f1 = (x: number): string => x.toFixed(1);

function petText(row: TopRow): string {
  const pet = row.combo.pets.pet ? (PET_NAMES[row.combo.pets.pet] ?? row.combo.pets.pet) : 'brak';
  const sac = sacrificeLive(row.combo, row.ranks) ? row.combo.pets.sacrificed : null;
  return sac ? `${pet} (pośw. ${PET_NAMES[sac] ?? sac})` : pet;
}

/** Build discovery: every rotation × pet combination with its own talent search at the chosen level; any result can be saved as a custom build. */
export function DiscoverView({ settings, discovery, existingNames, onSave }: { settings: Settings; discovery: DiscoverRun; existingNames: readonly string[]; onSave(b: CustomBuildData): void }) {
  const [budget, setBudget] = useState<DiscoverBudget>('full');
  const [savedName, setSavedName] = useState<string | null>(null);
  const d = discovery;
  // leaving the view (another Forever tab) stops a running search
  const cancel = d.cancel;
  useEffect(() => () => cancel(), [cancel]);
  const running = d.status === 'running';
  const shown = d.saved;
  const res = shown?.result;
  const best = res?.baseline[0];
  const params = shown ? paramsOf(shown.settings) : null;

  return (
    <>
      <section className="fv-panel" aria-label="Odkrywanie buildów">
        <p className="fv-note">
          Szuka najlepszych buildów dla levelu {settings.level}: sprawdza wszystkie rotacje złożone z czarów (DoT-y, filler, Drain Soul) z każdym ustawieniem petów i dla każdej kombinacji szuka talentów. Profil, liczba mobów, polityka Life Tapa i Eureka! są z ustawień powyżej. Liczy w tle na kilku wątkach; wynik można zapisać jako własny build.
        </p>
        <div className="fv-row">
          <label>
            Zakres{' '}
            <select value={budget} disabled={running} onChange={(e) => setBudget(e.target.value as DiscoverBudget)}>
              <option value="full">Pełne (~15 min)</option>
              <option value="quick">Szybkie (~3 min)</option>
            </select>
          </label>
          {running ? (
            <button type="button" className="btn" onClick={d.cancel}>
              Przerwij
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => d.run(settings, budget)}>
              Szukaj
            </button>
          )}
        </div>
        {running && (
          <p role="status" aria-live="polite" className="fv-progress">
            <progress value={d.done} max={Math.max(1, d.total)} /> Etap {STAGES[d.stage] ?? 'przygotowanie'}: {d.done}/{d.total}
            {d.etaSec !== null ? `, ~${Math.max(1, Math.round(d.etaSec / 60))} min` : ''}
          </p>
        )}
        {d.status === 'aborted' && <p className="fv-note">Przerwano. Ostatni zapisany wynik zostaje poniżej.</p>}
        {d.status === 'error' && (
          <p role="alert" className="fv-error">
            Błąd: {d.error}
          </p>
        )}
      </section>

      {res && shown && params && (
        <section className="fv-panel" aria-label="Wynik odkrywania">
          <h2>
            Level {res.meta.level} ({res.meta.points} pkt), {shown.settings.profile}, {res.meta.mobs} mob{res.meta.mobs === 1 ? '' : 'y'}, {shown.budget === 'full' ? 'pełne' : 'szybkie'}
          </h2>
          {best && (
            <p className="fv-note">
              Najlepszy znany: {best.id} {f1(best.metrics.killsPerHour)} kills/h. Sprawdzono {res.meta.combos} kombinacji, {res.meta.searched} dokładnie, {res.meta.evaluations} symulacji. ✓ = różnica istotna (95%), ~ = w granicach szumu, ≈#1 = nie gorszy istotnie od pierwszego.
            </p>
          )}
          {savedName && (
            <p className="fv-note" role="status">
              Zapisano: <b>{savedName}</b>. <a href={routeHref({ mode: 'forever', view: 'custom' })}>Otwórz w zakładce Własny build</a>
            </p>
          )}
          <div className="fv-scroll">
            <table className="fv-table" aria-label="Najlepsze znalezione buildy">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Kills/h</th>
                  <th>± CI</th>
                  <th>vs znany</th>
                  <th>Drzewka</th>
                  <th className="fv-text">Pet</th>
                  <th className="fv-text">Rotacja</th>
                  <th>TTK s</th>
                  <th>Przestoje %</th>
                  <th className="fv-text">Najbliższy znany</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {res.top.map((t) => (
                  <tr key={t.rank} className={t.rank === 1 ? 'fv-best' : undefined}>
                    <td>
                      {t.rank}
                      {t.tiedWithFirst ? ' ≈#1' : ''}
                    </td>
                    <td>{f1(t.metrics.killsPerHour)}</td>
                    <td>{f1((t.kphCi[1] - t.kphCi[0]) / 2)}</td>
                    <td>
                      {t.gainVsBest.pct >= 0 ? '+' : ''}
                      {f1(t.gainVsBest.pct)}% {t.gainVsBest.significant ? '✓' : '~'}
                    </td>
                    <td>
                      {t.perTree.aff}/{t.perTree.demo}/{t.perTree.destro}
                    </td>
                    <td className="fv-text">{petText(t)}</td>
                    <td className="fv-text">{t.label}</td>
                    <td>{f1(t.metrics.ttkMean)}</td>
                    <td>{f1(t.metrics.downtimeShare * 100)}</td>
                    <td className="fv-text">
                      {t.nearestKnown.id} ({t.nearestKnown.distance})
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        aria-label={`Zapisz jako własny build: #${t.rank}`}
                        onClick={() => {
                          const b = discoveredBuild(t, res.meta.level, existingNames);
                          onSave(b);
                          setSavedName(b.name);
                        }}
                      >
                        Zapisz
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {res.top.map((t) => (
            <details key={t.rank} className="fv-adv">
              <summary>
                #{t.rank}: {t.label}, {petText(t)}
              </summary>
              <ul>
                {(['aff', 'demo', 'destro'] as Tree[]).map((tree) => {
                  const list = TALENTS.filter((x) => x.tree === tree && (t.ranks[x.id] ?? 0) > 0).map((x) => `${x.name} ${t.ranks[x.id]}${x.status === 'modelled' ? '' : '*'}`);
                  return list.length ? (
                    <li key={tree}>
                      <b>
                        {TREE_NAMES[tree]} ({t.perTree[tree]}):
                      </b>{' '}
                      {list.join(', ')}
                    </li>
                  ) : null;
                })}
                <li>Punkty bez modelowanego efektu (*): {t.freePoints}</li>
                {t.insensitive && <li>Bez wpływu na wynik (punkt w martwym talencie nic istotnie nie kosztuje): {t.insensitive.length ? t.insensitive.map((id) => TALENT_BY_ID.get(id)?.name ?? id).join(', ') : 'brak'}</li>}
              </ul>
              <ol className="fv-steps">
                {liveSteps(t.combo, res.meta.level, t.ranks, params).map((s) => (
                  <li key={s.id}>
                    {spellName(s.spell)}
                    {s.rank === 'max' ? '' : ` r${s.rank}`}: {describeCond(s.when)}
                    {s.filler ? ' (filler)' : ''}
                  </li>
                ))}
              </ol>
              <p className="fv-note">Opiera się na szacunkach: {verifyFor(t, res.meta.level).join(', ') || 'brak'}</p>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
