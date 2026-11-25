import talentsJson from './data/talents.json';
import type { Tree } from './types';

export interface TalentDef {
  id: string;
  name: string;
  tree: Tree;
  row: number;
  col: number;
  maxRank: number;
  requires?: { talent: string; rank: number };
  status: 'modelled' | 'unmodelled';
  effect?: Record<string, number | string | boolean>;
  reason?: string;
  teachesSpell?: string;
  verify?: boolean;
  source: string;
}

export const TALENTS: readonly TalentDef[] = (talentsJson as unknown as { talents: TalentDef[] }).talents;
export const TALENT_BY_ID: ReadonlyMap<string, TalentDef> = new Map(TALENTS.map((t) => [t.id, t]));

export const MAX_TALENT_POINTS = 51;
export const FIRST_TALENT_LEVEL = 10;

/** Points available at a level: 1 per level from level 10, 51 at 60. `perk` is the Talented perk rank. */
export function pointsAtLevel(level: number, perk = 0): number {
  if (level < FIRST_TALENT_LEVEL - perk) return 0;
  return Math.min(MAX_TALENT_POINTS, Math.max(0, level - FIRST_TALENT_LEVEL + 1 + perk));
}

export type Ranks = Record<string, number>;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  pointsPerTree: Record<Tree, number>;
  ranks: Ranks;
}

/** Validates the first `count` picks (one entry per point): rows, prerequisites and max ranks. */
export function validatePicks(picks: readonly string[], count = picks.length): ValidationResult {
  const ranks: Ranks = {};
  const perTree: Record<Tree, number> = { aff: 0, demo: 0, destro: 0 };
  const errors: string[] = [];
  const n = Math.min(count, picks.length);
  if (count > picks.length) errors.push(`needs ${count} points but only ${picks.length} picks exist`);
  for (let i = 0; i < n; i++) {
    const id = picks[i] as string;
    const def = TALENT_BY_ID.get(id);
    if (!def) {
      errors.push(`point ${i + 1}: unknown talent ${id}`);
      continue;
    }
    if (perTree[def.tree] < 5 * def.row)
      errors.push(`point ${i + 1}: ${id} (row ${def.row}) needs ${5 * def.row} points in ${def.tree}, has ${perTree[def.tree]}`);
    if ((ranks[id] ?? 0) >= def.maxRank) errors.push(`point ${i + 1}: ${id} above max rank ${def.maxRank}`);
    if (def.requires && (ranks[def.requires.talent] ?? 0) < def.requires.rank)
      errors.push(`point ${i + 1}: ${id} needs ${def.requires.talent} ${def.requires.rank}`);
    ranks[id] = (ranks[id] ?? 0) + 1;
    perTree[def.tree] += 1;
  }
  return { ok: errors.length === 0, errors, pointsPerTree: perTree, ranks };
}

/** Validates a full order at a level: exactly `pointsAtLevel` picks used, all legal. */
export function validateBuild(picks: readonly string[], level: number, perk = 0): ValidationResult {
  return validatePicks(picks, pointsAtLevel(level, perk));
}

/** Ranks after the first `pointsAtLevel(level)` picks. Throws on an illegal build. */
export function talentRanks(picks: readonly string[], level: number, perk = 0): Ranks {
  const result = validateBuild(picks, level, perk);
  if (!result.ok) throw new Error(`illegal build at level ${level}: ${result.errors.join('; ')}`);
  return result.ranks;
}
