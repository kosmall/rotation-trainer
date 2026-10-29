import { activeSetBonuses } from '../engine/sets';
import type { SetBonusDef } from '../engine/types';

interface SetBonusListProps {
  sets: SetBonusDef[];
  /** Set id -> pieces worn. */
  setPieces: Record<string, number>;
}

/** The set name without the bonus's piece suffix: "Malefic Raiment (2)" -> "Malefic Raiment". */
function setName(bonus: SetBonusDef): string {
  return bonus.name.replace(/\s*\(\d+\)\s*$/, '');
}

/**
 * Every bonus of the spec's sets, grouped by set, each marked active or inactive. The heading
 * shows pieces worn over the largest bonus threshold, e.g. "Malefic Raiment 4/4".
 */
export function SetBonusList({ sets, setPieces }: SetBonusListProps) {
  const active = new Set(activeSetBonuses(sets, setPieces));
  const setIds = [...new Set(sets.map((b) => b.setId))];
  if (setIds.length === 0) return null;

  return (
    <section className="panel set-bonuses" aria-label="Set bonuses">
      <h3>Set bonuses</h3>
      {setIds.map((setId) => {
        const bonuses = sets.filter((b) => b.setId === setId).sort((a, b) => a.pieces - b.pieces);
        const first = bonuses[0] as SetBonusDef;
        const maxPieces = Math.max(...bonuses.map((b) => b.pieces));
        return (
          <div key={setId} className="set">
            <div className="set-name">
              {setName(first)} {setPieces[setId] ?? 0}/{maxPieces}
            </div>
            <ul>
              {bonuses.map((bonus) => {
                const isActive = active.has(bonus);
                return (
                  <li key={bonus.pieces} data-active={isActive} className={isActive ? 'bonus active' : 'bonus'}>
                    <span className="bonus-pieces">{bonus.pieces}-piece</span>
                    <span className="bonus-state">{isActive ? 'Active' : 'Inactive'}</span>
                    <p className="bonus-description">{bonus.description}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
