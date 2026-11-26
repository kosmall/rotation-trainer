import { describeBuild, loadVariant, picksAt, SCENARIOS, VARIANT_IDS } from '../../forever/builds';
import { demonsAt } from '../../forever/stats';
import { TALENT_BY_ID } from '../../forever/talents';
import type { Tree } from '../../forever/types';
import { TalentTrees } from './TalentTrees';
import { TalentWowheadLink } from './WowheadLink';

const TREE_NAMES: Record<Tree, string> = { aff: 'Affliction', demo: 'Demonology', destro: 'Destruction' };

/** One build: talent points per tree at the level, the order points were spent, the next pick. */
export function BuildsView({ level, ids = VARIANT_IDS, id, onIdChange: setId }: { level: number; ids?: readonly string[]; id: string; onIdChange(id: string): void }) {
  const v = loadVariant(ids.includes(id) ? id : (ids[0] as string));
  const snap = describeBuild(v, level);
  const picks = picksAt(v, level);
  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
  return (
    <>
      <div className="fv-row">
        <label>
          Build{' '}
          <select value={v.id} onChange={(e) => setId(e.target.value)}>
            {ids.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      <ScenarioNote id={v.id} />
      <dl className="fv-facts">
        <dt>Rotacja</dt>
        <dd>
          {v.rotation}, filler: {v.filler}, ranga SB: {String(v.rank)}
        </dd>
        <dt>Pet</dt>
        <dd>
          {v.pet ?? 'brak'}
          {v.sacrificed ? ` (poświęcony: ${v.sacrificed})` : ''}
          {demonsAt(v, level).pet !== v.pet ? `; na levelu ${level} jeszcze niedostępny, walczy ${demonsAt(v, level).pet}` : ''}
          {v.sacrificed && demonsAt(v, level).sacrificed === null ? `; na levelu ${level} nie ma jeszcze kogo poświęcić` : ''}
        </dd>
        <dt>Kolejność talentów</dt>
        <dd>
          {v.order}
          {v.pre_respec_build ? `; do respeca na levelu ${v.respec_level}: ${v.pre_respec_build}` : ''}
        </dd>
        <dt>Punkty na levelu {level}</dt>
        <dd>
          {snap.points} ({Object.entries(snap.perTree).map(([t, n]) => `${TREE_NAMES[t as Tree] ?? t} ${n}`).join(' / ')})
        </dd>
        <dt>Ostatni / następny punkt</dt>
        <dd>
          {snap.lastPick ?? '-'} / {snap.nextPick ?? '-'}
        </dd>
      </dl>
      <h2>Drzewa talentów na levelu {level}</h2>
      <TalentTrees ranks={snap.ranks} perTree={snap.perTree} />
      <h2>Rozdane talenty (lista)</h2>
      <table className="fv-table" aria-label="Talenty">
        <thead>
          <tr>
            <th scope="col">Talent</th>
            <th scope="col">Drzewo</th>
            <th scope="col">Rank</th>
          </tr>
        </thead>
        <tbody>
          {[...counts].map(([t, n]) => {
            const def = TALENT_BY_ID.get(t);
            return (
              <tr key={t}>
                <th scope="row">
                  <TalentWowheadLink talentId={t}>{def?.name ?? t}</TalentWowheadLink>
                </th>
                <td>{TREE_NAMES[def?.tree as Tree] ?? def?.tree}</td>
                <td>
                  {n}/{def?.maxRank ?? '?'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Kolejność punktów</h2>
      <ol className="fv-picks">
        {picks.map((p, i) => (
          <li key={i}>
            <TalentWowheadLink talentId={p}>{TALENT_BY_ID.get(p)?.name ?? p}</TalentWowheadLink>
          </li>
        ))}
      </ol>
    </>
  );
}

export function ScenarioNote({ id }: { id: string }) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) return null;
  return (
    <p className="fv-note">
      Scenariusz z poradnika: {sc.title}. Źródło: {sc.source}. {sc.note}
    </p>
  );
}
