import { describeBuild, loadVariant, picksAt, VARIANT_IDS } from '../../forever/builds';
import { TALENT_BY_ID } from '../../forever/talents';
import type { Tree } from '../../forever/types';
import { TalentTrees } from './TalentTrees';

const TREE_NAMES: Record<Tree, string> = { aff: 'Affliction', demo: 'Demonology', destro: 'Destruction' };

/** One build: talent points per tree at the level, the order points were spent, the next pick. */
export function BuildsView({ level, id, onIdChange: setId }: { level: number; id: string; onIdChange(id: string): void }) {
  const v = loadVariant(id);
  const snap = describeBuild(v, level);
  const picks = picksAt(v, level);
  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
  return (
    <>
      <div className="fv-row">
        <label>
          Build{' '}
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {VARIANT_IDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      <dl className="fv-facts">
        <dt>Rotacja</dt>
        <dd>
          {v.rotation}, filler: {v.filler}, ranga SB: {String(v.rank)}
        </dd>
        <dt>Pet</dt>
        <dd>{v.pet ?? 'brak'}{v.sacrificed ? ` (poświęcony: ${v.sacrificed})` : ''}</dd>
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
                <th scope="row">{def?.name ?? t}</th>
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
          <li key={i}>{TALENT_BY_ID.get(p)?.name ?? p}</li>
        ))}
      </ol>
    </>
  );
}
