import { TALENT_BY_ID, TALENTS } from '../../forever/talents';
import type { Ranks } from '../../forever/talents';
import { IconTile } from './IconTile';
import { hasWowheadTip, TalentWowheadLink } from './WowheadLink';

const TREES = [
  { id: 'aff', name: 'Affliction' },
  { id: 'demo', name: 'Demonology' },
  { id: 'destro', name: 'Destruction' },
] as const;

/** The three talent trees as the game shows them (rows × columns); taken ranks are lit and carry n/max. */
export interface TalentEditing {
  canAdd(id: string): boolean;
  onAdd(id: string): void;
  onRemove(id: string): void;
}

export function TalentTrees({ ranks, perTree, editing }: { ranks: Readonly<Ranks>; perTree: Readonly<Record<string, number>>; editing?: TalentEditing }) {
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
                const cls = `fv-talent${n > 0 ? ' taken' : ''}${n === t.maxRank ? ' maxed' : ''}`;
                const pos = { gridRow: t.row + 1, gridColumn: t.col + 1 };
                if (!editing)
                  return (
                    <div key={t.id} className={cls} style={pos} title={hasWowheadTip(t.id) ? undefined : title} role="img" aria-label={title}>
                      <TalentWowheadLink talentId={t.id}>
                        <IconTile kind="talent" id={t.id} name={t.name} />
                      </TalentWowheadLink>
                      <span className="fv-rank" aria-hidden="true">
                        {n}/{t.maxRank}
                      </span>
                    </div>
                  );
                const can = editing.canAdd(t.id);
                return (
                  <div key={t.id} className={`${cls} fv-talent-edit${can ? ' can' : ''}`} style={pos}>
                    <button
                      type="button"
                      className="fv-talent-btn"
                      title={title}
                      aria-label={`Dodaj punkt: ${title}`}
                      disabled={!can}
                      onClick={() => editing.onAdd(t.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        editing.onRemove(t.id);
                      }}
                    >
                      <IconTile kind="talent" id={t.id} name={t.name} />
                    </button>
                    <span className="fv-rank" aria-hidden="true">
                      {n}/{t.maxRank}
                    </span>
                    {n > 0 && (
                      <button type="button" className="fv-talent-minus" aria-label={`Usuń ostatni punkt: ${t.name}`} onClick={() => editing.onRemove(t.id)}>
                        −
                      </button>
                    )}
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
