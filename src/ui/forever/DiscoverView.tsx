import { Fragment, useEffect, useState } from 'react';
import type { CustomBuildData } from '../../forever/builds';
import type { TopRow } from '../../forever/discover/engine';
import { sacrificeLive } from '../../forever/discover/space';
import { paramsOf, type Settings } from '../../forever/web/api';
import type { CompletedBuild } from '../../forever/discover/complete';
import { canonicalPicks } from '../../forever/discover/talent-search';
import { TALENT_BY_ID, validatePicks, type Ranks } from '../../forever/talents';
import { completedBuild, discoveredBuild, type DiscoverBudget } from '../../forever/web/discover';
import { TalentTrees } from './TalentTrees';
import { routeHref } from '../shell/router';
import { PET_NAMES } from './buildFacts';
import { DiscoverDetails } from './DiscoverDetails';
import type { DiscoverRun } from './useDiscover';

const STAGES: Record<string, string> = {
  screen: '1/3: przegląd wszystkich kombinacji',
  search: '2/3: dokładne szukanie talentów',
  final: '3/3: przeliczenie najlepszych',
  insensitivity: '3/3: talenty bez wpływu',
  'complete-greedy': 'uzupełniania 1/3: droga zachłanna',
  'complete-improve': 'uzupełniania 2/3: poprawianie całej drogi',
  'complete-final': 'uzupełniania 3/3: przeliczenie',
};
const f1 = (x: number): string => x.toFixed(1);

function petText(row: TopRow): string {
  const pet = row.combo.pets.pet ? (PET_NAMES[row.combo.pets.pet] ?? row.combo.pets.pet) : 'brak';
  const sac = sacrificeLive(row.combo, row.ranks) ? row.combo.pets.sacrificed : null;
  return sac ? `${pet} (pośw. ${PET_NAMES[sac] ?? sac})` : pet;
}

/** Build discovery: every rotation × pet combination with its own talent search at the chosen level; any result can be saved as a custom build. */
export function DiscoverView({ settings, discovery, existingNames, onSave }: { settings: Settings; discovery: DiscoverRun; existingNames: readonly string[]; onSave(b: CustomBuildData): void }) {
  const [budget, setBudget] = useState<DiscoverBudget>('full');
  // the saved note belongs to the result it was saved from
  const [savedNote, setSavedNote] = useState<{ name: string; from: unknown } | null>(null);
  // results ticked for completion (by rank); a new result clears them
  const [pickedFor, setPickedFor] = useState<{ ranks: number[]; from: unknown }>({ ranks: [], from: null });
  // results opened in the table (by rank); a new result closes them
  const [openFor, setOpenFor] = useState<{ ranks: number[]; from: unknown }>({ ranks: [], from: null });
  const d = discovery;
  // leaving the view (another Forever tab) stops a running search
  const cancel = d.cancel;
  useEffect(() => () => cancel(), [cancel]);
  const running = d.status === 'running';
  const shown = d.saved;
  const res = shown?.result;
  const best = res?.baseline[0];
  const params = shown ? paramsOf(shown.settings) : null;
  const open = new Set(openFor.from === res ? openFor.ranks : []);
  const picked = new Set(pickedFor.from === res ? pickedFor.ranks : []);
  const togglePick = (rank: number): void => setPickedFor({ ranks: picked.has(rank) ? [...picked].filter((r) => r !== rank) : [...picked, rank], from: res });
  const canComplete = !!res && res.meta.level < d.toLevel;
  const toggle = (rank: number): void => setOpenFor({ ranks: open.has(rank) ? [...open].filter((r) => r !== rank) : [...open, rank], from: res });

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
          {savedNote && savedNote.from === res && (
            <p className="fv-note" role="status">
              Zapisano: <b>{savedNote.name}</b>. <a href={routeHref({ mode: 'forever', view: 'custom' })}>Otwórz w zakładce Własny build</a>
            </p>
          )}
          {canComplete && (
            <div className="fv-row">
              <button type="button" className="btn" disabled={running || picked.size === 0} onClick={() => d.complete([...picked].sort((a, b) => a - b), budget)}>
                Uzupełnij do {d.toLevel} ({picked.size})
              </button>
              <span className="fv-note">Zaznaczone buildy dostają talenty na levele {res.meta.level + 1}–{d.toLevel}: droga, która daje najkrótszy łączny czas levelowania (rotacja i pety bez zmian). Zakres jak wyżej.</span>
            </div>
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
                  <Fragment key={t.rank}>
                  <tr className={t.rank === 1 ? 'fv-best' : undefined}>
                    <td>
                      {canComplete && <input type="checkbox" className="fv-pick" aria-label={`Uzupełnij #${t.rank}`} checked={picked.has(t.rank)} disabled={running} onChange={() => togglePick(t.rank)} />}
                      <button type="button" className="fv-toggle" aria-expanded={open.has(t.rank)} aria-label={`Szczegóły #${t.rank}`} onClick={() => toggle(t.rank)}>
                        {open.has(t.rank) ? '▾' : '▸'}
                      </button>{' '}
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
                          setSavedNote({ name: b.name, from: res });
                        }}
                      >
                        Zapisz
                      </button>
                    </td>
                  </tr>
                  {open.has(t.rank) && (
                    <tr className="fv-detail-row">
                      <td colSpan={11}>
                        <DiscoverDetails row={t} level={res.meta.level} params={params} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {res && shown?.completions && shown.completions.length > 0 && (
        <section className="fv-panel" aria-label="Kompletne buildy">
          <h2>Kompletne buildy (do {d.toLevel})</h2>
          {savedNote && savedNote.from === shown.completions && (
            <p className="fv-note" role="status">
              Zapisano: <b>{savedNote.name}</b>. <a href={routeHref({ mode: 'forever', view: 'custom' })}>Otwórz w zakładce Własny build</a>
            </p>
          )}
          {shown.completions.map((c) => (
            <CompletedCard
              key={c.rank}
              c={c}
              onSave={() => {
                const b = completedBuild(c, existingNames);
                onSave(b);
                setSavedNote({ name: b.name, from: shown.completions });
              }}
            />
          ))}
        </section>
      )}
    </>
  );
}

/** One completed build: the speed over the path, the points level by level and the trees at the last level. */
function CompletedCard({ c, onSave }: { c: CompletedBuild; onSave(): void }) {
  const finalRanks: Ranks = { ...c.baseRanks };
  for (const id of c.path) finalRanks[id] = (finalRanks[id] ?? 0) + 1;
  const perTree = validatePicks([...canonicalPicks(c.baseRanks), ...c.path]).pointsPerTree;
  const saved = c.greedyAvgKph > 0 && c.avgKph > 0 ? (1 - c.greedyAvgKph / c.avgKph) * 100 : 0;
  return (
    <article className="fv-completed">
      <h3>
        #{c.rank}: {c.label}
      </h3>
      <p>
        Średnio <b>{f1(c.avgKph)} kills/h</b> na levelach {c.fromLevel + 1}–{c.toLevel} (droga zachłanna: {f1(c.greedyAvgKph)} kills/h; czas levelowania {saved >= 0 ? 'krótszy' : 'dłuższy'} o {f1(Math.abs(saved))}%).{' '}
        <button type="button" className="btn" aria-label={`Zapisz kompletny build #${c.rank}`} onClick={onSave}>
          Zapisz
        </button>
      </p>
      <div className="fv-discover-details">
        <div>
          <table className="fv-table fv-stats" aria-label={`Droga #${c.rank}`}>
            <thead>
              <tr>
                <th>Level</th>
                <th className="fv-text">Talent</th>
                <th>Kills/h</th>
              </tr>
            </thead>
            <tbody>
              {c.perLevel.map((p) => (
                <tr key={p.level}>
                  <td>{p.level}</td>
                  <td className="fv-text">{TALENT_BY_ID.get(p.pick)?.name ?? p.pick}</td>
                  <td>{f1(p.kph)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>Talenty na levelu {c.toLevel}</h4>
          <TalentTrees ranks={finalRanks} perTree={perTree} />
        </div>
      </div>
    </article>
  );
}
