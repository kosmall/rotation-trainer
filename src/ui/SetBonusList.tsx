import { activeSetBonuses } from '../engine/sets';
import type { SetBonusDef } from '../engine/types';

/** A worn set's bonus the trainer does not model (src/data/classes/warlock/sets.ts `UNMODELLED_SETS`). */
export interface UnmodelledBonus {
  setId: string;
  name: string;
  pieces: number;
  description: string;
  reason: string;
}

interface SetBonusListProps {
  sets: SetBonusDef[];
  /** Set id -> pieces worn. */
  setPieces: Record<string, number>;
  /**
   * Bonuses that exist in the game but are not modelled: listed (marked "Not modelled") for every
   * set worn with at least one piece, so the heading's maximum is the set's real one.
   */
  unmodelled?: readonly UnmodelledBonus[];
}

/** The set name without the bonus's piece suffix: "Malefic Raiment (2)" -> "Malefic Raiment". */
function setName(bonus: { name: string }): string {
  return bonus.name.replace(/\s*\(\d+\)\s*$/, '');
}

interface Row {
  pieces: number;
  description: string;
  /** The modelled bonus, or undefined for an unmodelled one. */
  bonus?: SetBonusDef;
  reason?: string;
}

/**
 * Every bonus of the spec's sets (and the unmodelled bonuses of the worn sets), grouped by set,
 * each marked active, inactive or not modelled. The heading shows pieces worn over the largest
 * bonus threshold, e.g. "Malefic Raiment 4/4" (a set whose top bonus is not modelled still shows
 * its real threshold, e.g. a Corruptor Raiment 4-piece marked "Not modelled").
 */
export function SetBonusList({ sets, setPieces, unmodelled = [] }: SetBonusListProps) {
  const active = new Set(activeSetBonuses(sets, setPieces));
  const worn = (setId: string) => (Object.hasOwn(setPieces, setId) ? setPieces[setId]! : 0);
  const extra = unmodelled.filter((u) => worn(u.setId) >= 1);
  const setIds = [...new Set([...sets.map((b) => b.setId), ...extra.map((u) => u.setId)])];
  if (setIds.length === 0) return null;

  return (
    <section className="panel set-bonuses" aria-label="Set bonuses">
      <h3>Set bonuses</h3>
      {setIds.map((setId) => {
        const rows: Row[] = [
          ...sets.filter((b) => b.setId === setId).map((b) => ({ pieces: b.pieces, description: b.description, bonus: b })),
          ...extra.filter((u) => u.setId === setId).map((u) => ({ pieces: u.pieces, description: u.description, reason: u.reason })),
        ].sort((a, b) => a.pieces - b.pieces);
        const name = setName(sets.find((b) => b.setId === setId) ?? extra.find((u) => u.setId === setId)!);
        const maxPieces = Math.max(...rows.map((r) => r.pieces));
        return (
          <div key={setId} className="set">
            <div className="set-name">
              {name} {worn(setId)}/{maxPieces}
            </div>
            <ul>
              {rows.map((row) => {
                const isActive = row.bonus !== undefined && active.has(row.bonus);
                const state = row.bonus === undefined ? 'Not modelled' : isActive ? 'Active' : 'Inactive';
                return (
                  <li
                    key={`${row.pieces}-${state}`}
                    data-active={isActive}
                    className={isActive ? 'bonus active' : row.bonus ? 'bonus' : 'bonus unmodelled'}
                    title={row.reason}
                  >
                    <span className="bonus-pieces">{row.pieces}-piece</span>
                    <span className="bonus-state">{state}</span>
                    <p className="bonus-description">{row.description}</p>
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
