import { useState } from 'react';
import { EP_STATS } from '../../forever/ep';
import { epCell } from '../../forever/ep-report';
import { POLICIES, type EpOutcome, type Settings } from '../../forever/web/api';
import type { ForeverRun } from './useForeverRun';

const SHAPING: readonly (readonly [keyof Settings, string])[] = [
  ['profile', 'profil sprzętu'],
  ['mobs', 'moby'],
  ['policy', 'strategia Life Tapa'],
  ['spellstone', 'Spellstone'],
  ['eureka', 'Eureka'],
  ['sessions', 'sesje'],
  ['seed', 'seed'],
];

/** Equivalency points: what one point of each stat is worth in points of spell power, per build, at the level of the settings. */
export function EpView({ settings, run, outcome, ids, initial, onRun }: { settings: Settings; run: ForeverRun; outcome: EpOutcome | undefined; ids: readonly string[]; initial: string; onRun(builds: string[]): void }) {
  const [picked, setPicked] = useState<readonly string[]>([initial]);
  const running = run.status === 'running';
  const chosen = ids.filter((id) => picked.includes(id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const results = outcome?.results ?? [];
  const noSp = results.filter((r) => !r.valid).map((r) => r.build);
  const changed = outcome
    ? [...(outcome.settings.level !== settings.level ? [`level ${outcome.settings.level} (ustawienie to ${settings.level})`] : []), ...SHAPING.filter(([k]) => outcome.settings[k] !== settings[k]).map(([, label]) => label)]
    : [];
  return (
    <>
      <fieldset className="fv-panel">
        <legend>Buildy do policzenia</legend>
        <div className="fv-row">
          {ids.map((id) => (
            <label key={id} className="fv-inline">
              <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} /> {id}
            </label>
          ))}
        </div>
        <div className="fv-row">
          <button type="button" className="btn primary" disabled={running || chosen.length === 0} onClick={() => onRun(chosen)}>
            Policz EP
          </button>
          <span className="fv-note">Każdy build to ok. 3 s przy 60 sesjach. Więcej sesji (100+) zawęża przedziały ufności.</span>
        </div>
      </fieldset>
      {!outcome && <p className="fv-empty">Wybierz buildy i kliknij Policz EP</p>}
      {outcome && (
        <>
          <p className="fv-note">
            Level {outcome.settings.level}, {outcome.settings.sessions} sesji, seed {outcome.settings.seed}, profil sprzętu: {outcome.settings.profile}, moby: {outcome.settings.mobs}, strategia Life Tapa: {POLICIES[outcome.settings.policy]?.label ?? outcome.settings.policy}. Waga = ile punktów spell power jest wart punkt staty (zabicia na godzinę), z przedziałem 95%.
          </p>
          {changed.length > 0 && (
            <p className="fv-note fv-warn" role="status">
              Wyniki są dla innych ustawień niż obecne: {changed.join(', ')}. Policz ponownie.
            </p>
          )}
          {noSp.length > 0 && (
            <p className="fv-note fv-warn">
              Dla {noSp.join(', ')} spell power nie zwiększa zabić/h, więc wagi względem SP są niedostępne (n/a).
            </p>
          )}
          <div className="fv-scroll">
            <table className="fv-table fv-eptable" aria-label="Wagi statów (EP)">
              <thead>
                <tr>
                  <th scope="col">stat</th>
                  {results.map((r) => (
                    <th key={r.build} scope="col">
                      {r.build}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EP_STATS.map((stat) => (
                  <tr key={stat}>
                    <th scope="row">{stat}</th>
                    {results.map((r) => (
                      <td key={r.build}>{epCell(r, stat)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fv-legend fv-note">
            <p>
              <b>capped (0)</b>: hit jest już na limicie trafienia, więc kolejne punkty nic nie dają. <b>n/a</b>: brak wagi (spell power nic nie daje temu buildowi). <b>*</b>: waga przybliżona, krok w dół i w górę dają istotnie różne nachylenia.
            </p>
            <p>Profile sprzętu to placeholdery (verify w danych), więc wagi są orientacyjne. Waga hit obowiązuje tylko poniżej limitu trafienia.</p>
          </div>
        </>
      )}
    </>
  );
}
