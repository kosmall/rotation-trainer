import type { SetBonusDef } from './types';

/**
 * Returns, in input order, every set bonus whose piece threshold is met by the
 * equipped piece counts. Set ids absent from `setPieces` count as 0 pieces;
 * entries in `setPieces` matching no bonus are ignored.
 */
export function activeSetBonuses(
  sets: SetBonusDef[],
  setPieces: Record<string, number>,
): SetBonusDef[] {
  return sets.filter((bonus) => bonus.pieces <= (setPieces[bonus.setId] ?? 0));
}
