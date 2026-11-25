import spellsJson from './data/spells.json';
import type { DownrankModel, Params, SpellData, SpellRank } from './types';

const SPELLS = (spellsJson as unknown as { spells: SpellData[] }).spells;
const BY_ID = new Map(SPELLS.map((s) => [s.id, s]));

export function getSpell(id: string): SpellData {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`unknown spell ${id}`);
  return s;
}

export const ALL_SPELL_IDS: readonly string[] = SPELLS.map((s) => s.id);

/**
 * Rank to cast: a fixed rank (clamped to the highest rank known at `level`) or the highest rank
 * available at `level`. Returns undefined when the spell is not learned yet.
 */
export function rankAt(spellId: string, want: number | 'max', level: number): SpellRank | undefined {
  const known = getSpell(spellId).ranks.filter((r) => r.level <= level);
  if (known.length === 0) return undefined;
  if (want === 'max') return known[known.length - 1];
  const exact = known.find((r) => r.rank === want);
  return exact ?? known[known.length - 1];
}

/**
 * Spell power coefficient factor for downranking. `classic`: spells below level 20 get
 * 1 - (20 - spellLevel) x 0.0375; `partial` is the midpoint between `none` and `classic`.
 */
export function downrankFactor(model: DownrankModel, spellLevel: number): number {
  if (model === 'none') return 1;
  const classic = spellLevel >= 20 ? 1 : Math.max(0, 1 - (20 - spellLevel) * 0.0375);
  return model === 'classic' ? classic : (1 + classic) / 2;
}

/** Cast time of a spell rank in ms, before haste: base cast minus the Bane reduction, floored. */
export function castMsOf(spell: SpellData, rank: SpellRank, baneRank: number, params: Params, extraReduceMs = 0): number {
  const base = rank.castMs ?? spell.baseCastMs ?? 0;
  if (base === 0) return 0;
  const bane = spell.banable ? baneRank * params.bane_per_rank * 1000 : 0;
  return Math.max(params.cast_floor_ms, Math.round(base - bane - extraReduceMs));
}

export function averageDirect(rank: SpellRank): number {
  return ((rank.min ?? 0) + (rank.max ?? 0)) / 2;
}
