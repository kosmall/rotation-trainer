import { describeBuild, loadVariant, picksAt, VARIANT_IDS, type BuildVariant } from '../../forever/builds';
import { demonLearned, demonsAt } from '../../forever/stats';
import { TALENT_BY_ID } from '../../forever/talents';
import type { Tree } from '../../forever/types';
import { FactRow, LoadoutRows, PET_NAMES, rotationIcon, rotationTitle, TREE_ICONS } from './buildFacts';
import { IconTile } from './IconTile';
import { TalentTrees } from './TalentTrees';
import { TalentWowheadLink } from './WowheadLink';

const TREE_NAMES: Record<Tree, string> = { aff: 'Affliction', demo: 'Demonology', destro: 'Destruction' };

/** What differs at this level: the build's own demon (or the one to sacrifice) is not learned yet. */
function petNote(v: BuildVariant, level: number, mobs: number): string {
  const at = demonsAt(v, level, mobs);
  let standIn = '';
  if (at.pet !== v.pet && at.pet) {
    // either the build's own demon is not learned yet, or one of its pet rules picks another
    const why = v.pet && !demonLearned(v.pet, level) ? 'jeszcze niedostępny' : `przy ${mobs} ${mobs === 1 ? 'mobie' : 'mobach'}`;
    standIn = `; na levelu ${level} ${why}, walczy ${PET_NAMES[at.pet] ?? at.pet}`;
  }
  const noSacrifice = v.sacrificed && at.sacrificed === null ? `; na levelu ${level} nie ma jeszcze kogo poświęcić` : '';
  return standIn + noSacrifice;
}

/** One build: talent points per tree at the level, the order points were spent, the next pick. */
export function BuildsView({ level, mobs = 1, ids = VARIANT_IDS, id, onIdChange: setId }: { level: number; mobs?: number; ids?: readonly string[]; id: string; onIdChange(id: string): void }) {
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
      <dl className="fv-facts fv-facts-icons">
        <FactRow label="Rotacja" icons={<IconTile {...rotationIcon(v)} name={rotationTitle(v)} size={28} />}>
          {rotationTitle(v)}
        </FactRow>
        <LoadoutRows v={v} petNote={petNote(v, level, mobs)} />
        <FactRow label={`Punkty na levelu ${level}`}>{snap.points}</FactRow>
        {(Object.keys(TREE_NAMES) as Tree[]).map((t) => (
          <FactRow key={t} label={TREE_NAMES[t]} icons={<IconTile {...TREE_ICONS[t]} name={TREE_NAMES[t]} size={28} />}>
            {snap.perTree[t] ?? 0}
          </FactRow>
        ))}
        <FactRow label="Ostatni punkt" icons={snap.lastPickId ? <IconTile kind="talent" id={snap.lastPickId} name={snap.lastPick ?? ''} size={28} /> : null}>
          {snap.lastPick ?? '-'}
        </FactRow>
        <FactRow label="Następny punkt" icons={snap.nextPickId ? <IconTile kind="talent" id={snap.nextPickId} name={snap.nextPick ?? ''} size={28} /> : null}>
          {snap.nextPick ?? '-'}
        </FactRow>
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
