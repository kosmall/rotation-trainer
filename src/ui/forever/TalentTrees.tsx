import { TALENT_BY_ID, TALENTS } from '../../forever/talents';
import type { Ranks } from '../../forever/talents';
import { IconTile } from './IconTile';

const TREES = [
  { id: 'aff', name: 'Affliction' },
  { id: 'demo', name: 'Demonology' },
  { id: 'destro', name: 'Destruction' },
] as const;

/** The three talent trees as the game shows them (rows × columns); taken ranks are lit and carry n/max. */
export function TalentTrees({ ranks, perTree }: { ranks: Readonly<Ranks>; perTree: Readonly<Record<string, number>> }) {
  return (
    <div className="fv-trees">
      {TREES.map((tree) => {
        const talents = TALENTS.filter((t) => t.tree === tree.id);
        const rows = Math.max(...talents.map((t) => t.row)) + 1;
        const cols = Math.max(...talents.map((t) => t.col)) + 1;
        return (
          <section key={tree.id} className="fv-tree" aria-label={`Drzewo ${tree.name}`}>
            <h3>
              {tree.name} <span className="fv-tree-pts">({perTree[tree.id] ?? 0})</span>
            </h3>
            <div className="fv-tree-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, auto)` }}>
              {talents.map((t) => {
                const n = ranks[t.id] ?? 0;
                const req = t.requires ? TALENT_BY_ID.get(t.requires.talent)?.name : null;
                const title = `${t.name}: ${n}/${t.maxRank}${req ? ` (wymaga: ${req} ${t.requires?.rank})` : ''}`;
                return (
                  <div key={t.id} className={`fv-talent${n > 0 ? ' taken' : ''}${n === t.maxRank ? ' maxed' : ''}`} style={{ gridRow: t.row + 1, gridColumn: t.col + 1 }} title={title} role="img" aria-label={title}>
                    <IconTile kind="talent" id={t.id} name={t.name} />
                    <span className="fv-rank" aria-hidden="true">
                      {n}/{t.maxRank}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
