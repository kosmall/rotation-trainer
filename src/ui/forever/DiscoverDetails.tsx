import { useMemo } from 'react';
import type { TopRow } from '../../forever/discover/engine';
import { verifyFor } from '../../forever/discover/report';
import type { CellMetrics } from '../../forever/runner';
import { TALENT_BY_ID } from '../../forever/talents';
import type { Params } from '../../forever/types';
import { fullRotationNote, rowVariant } from '../../forever/web/discover';
import { RotationFlow } from './RotationsView';
import { TalentTrees } from './TalentTrees';

const n1 = (x: number): string => x.toFixed(1);
const n2 = (x: number): string => x.toFixed(2);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** Every statistic of a result: label and value (Polish labels, like the rest of the Forever app). */
const STATS: readonly [string, (m: CellMetrics) => string][] = [
  ['Odchylenie kills/h między sesjami', (m) => n1(m.killsPerHourStd)],
  ['TTK', (m) => `${n1(m.ttkMean)} s (odch. ${n1(m.ttkStd)} s)`],
  ['Mana na zabicie', (m) => n1(m.manaPerKill)],
  ['Mana netto na zabicie (bez Life Tapa)', (m) => n1(m.netManaPerKill)],
  ['HP na zabicie', (m) => n1(m.hpPerKill)],
  ['Picie na zabicie', (m) => `${n1(m.drinkSecPerKill)} s`],
  ['Jedzenie na zabicie', (m) => `${n1(m.eatSecPerKill)} s`],
  ['Life Tap na zabicie', (m) => `${n1(m.lifeTapSecPerKill)} s`],
  ['Odpoczynek na zabicie', (m) => `${n1(m.restSecPerKill)} s`],
  ['Przestoje', (m) => pct(m.downtimeShare)],
  ['Przerwy na godzinę', (m) => n1(m.breaksPerHour)],
  ['Zabicia na przerwę', (m) => n1(m.killsPerBreak)],
  ['Pulle bez przerwy', (m) => `${n1(m.breakFreePullPct)}%`],
  ['Wykorzystanie GCD', (m) => pct(m.gcdUtil)],
  ['Strata GCD na zabicie', (m) => `${n2(m.gcdWasteSecPerKill)} s (${pct(m.gcdWasteShare)})`],
  ['Śmierci na godzinę', (m) => n2(m.deathsPerHour)],
  ['Śmierci peta na godzinę', (m) => n2(m.petDeathsPerHour)],
  // results stored before the demon's health was simulated have neither number
  ['Zdrowie peta na starcie pulla', (m) => (m.petHpStartPct == null ? '–' : `${n1(m.petHpStartPct)}%`)],
  ['Health Funnel na zabicie', (m) => (m.funnelSecPerKill == null ? '–' : `${n1(m.funnelSecPerKill)} s`)],
  ['Przejęcia aggro na zabicie', (m) => n2(m.threatSwitchesPerKill)],
  ['Pulle przerwane limitem czasu', (m) => `${n1(m.timeoutPct)}%`],
  ['Eureka! na godzinę', (m) => n1(m.eurekaPerHour)],
  ['Sesje', (m) => `${m.sessions} (${m.kills} zabić)`],
];

/** A result opened in the table: talent trees, rotation diagram and every statistic. */
export function DiscoverDetails({ row, level, params }: { row: TopRow; level: number; params: Params }) {
  const g = row.gainVsBest;
  const note = fullRotationNote(row);
  const variant = useMemo(() => rowVariant(row, level), [row, level]);
  const names = (ids: readonly string[]): string => ids.map((id) => TALENT_BY_ID.get(id)?.name ?? id).join(', ');
  return (
    <section className="fv-discover-details" aria-label={`Szczegóły wyniku #${row.rank}`}>
      <div>
        <h3>Talenty na levelu {level}</h3>
        <TalentTrees ranks={row.ranks} perTree={row.perTree} />
        <p className="fv-note">
          Punkty bez modelowanego efektu (potrzebne do odblokowania rzędów): {row.freePoints}.
          {row.insensitive ? ` Bez wpływu na wynik (punkt w martwym talencie nic istotnie nie kosztuje): ${row.insensitive.length ? names(row.insensitive) : 'brak'}.` : ''}
        </p>
      </div>
      <div>
        <h3>Statystyki</h3>
        <table className="fv-table fv-stats" aria-label={`Statystyki #${row.rank}`}>
          <tbody>
            <tr>
              <th scope="row">Kills/h</th>
              <td>
                {n1(row.metrics.killsPerHour)} (95% CI {n1(row.kphCi[0])}–{n1(row.kphCi[1])})
              </td>
            </tr>
            <tr>
              <th scope="row">vs {g.vs || 'najlepszy znany'}</th>
              <td>
                {g.mean >= 0 ? '+' : ''}
                {n1(g.mean)} kills/h ({g.pct >= 0 ? '+' : ''}
                {n1(g.pct)}%), {g.significant ? 'istotne' : 'w granicach szumu'}
              </td>
            </tr>
            {STATS.map(([label, f]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{f(row.metrics)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Najbliższy znany</th>
              <td>
                {row.nearestKnown.id} ({row.nearestKnown.distance} pkt różnicy)
              </td>
            </tr>
          </tbody>
        </table>
        <p className="fv-note">Opiera się na szacunkach: {verifyFor(row, level).join(', ') || 'brak'}</p>
      </div>
      <div className="fv-discover-rotation">
        <RotationFlow v={variant} params={params} />
        {note && <p className="fv-note">{note}</p>}
      </div>
    </section>
  );
}
