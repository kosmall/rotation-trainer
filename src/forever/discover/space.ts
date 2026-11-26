// The space build discovery searches: rotations composed from the simulator's spells (as data the
// fight plays) and pet setups. Talents are searched per combination (talent-search.ts).
// Framework-free.

import type { Cond, SpecStep } from '../rotation-spec';
import { buildRotation, DOT_KEYS, FILLERS, MIN_TTKS, rotationId, rotationLabel, WRACK_FLOOR, type FillerGene, type MinTtk, type RotationGenes } from '../rotation-genes';

export { buildRotation, FILLERS, MIN_TTKS, rotationId, rotationLabel, type FillerGene, type MinTtk, type RotationGenes };
import { getSpell, rankAt } from '../spells';
import { demonLearned } from '../stats';
import type { Ranks } from '../talents';
import type { Params, PetKind } from '../types';

export interface PetSetup {
  pet: PetKind | null;
  sacrificed: PetKind | null;
}

export interface Combo {
  id: string;
  genes: RotationGenes;
  pets: PetSetup;
}

/** Narrows the space (tests, quick runs). */
export interface SpaceFilter {
  fillers?: FillerGene[];
  minTtk?: MinTtk[];
  /** Active pets to try (null = no pet). */
  pets?: (PetKind | null)[];
  /** False: no Demonic Sacrifice setups. */
  sacrifice?: boolean;
  /** At most this many maintained effects (curse and DoTs). */
  maxDots?: number;
}

const PET_KINDS: readonly PetKind[] = ['imp', 'voidwalker', 'succubus', 'felhunter'];
/** The pet setups at a level: no pet or a learned one, optionally with another learned demon sacrificed first. */
export function petSetups(level: number, f: SpaceFilter = {}): PetSetup[] {
  const learned = PET_KINDS.filter((k) => demonLearned(k, level));
  const active = (f.pets ?? [null, ...PET_KINDS]).filter((k) => k === null || learned.includes(k));
  const out: PetSetup[] = [];
  for (const pet of active) {
    out.push({ pet, sacrificed: null });
    if (f.sacrifice === false) continue;
    for (const s of learned) if (s !== pet) out.push({ pet, sacrificed: s });
  }
  return out;
}

/** Every rotation × pet setup at a level, sorted by id. */
export function enumerateCombos(level: number, f: SpaceFilter = {}): Combo[] {
  const out: Combo[] = [];
  const setups = petSetups(level, f);
  for (let mask = 0; mask < 32; mask++) {
    const on = DOT_KEYS.map((_, i) => (mask & (1 << i)) !== 0);
    if (f.maxDots !== undefined && on.filter(Boolean).length > f.maxDots) continue;
    for (const minTtkSec of f.minTtk ?? MIN_TTKS)
      for (const drainSoulFinisher of [false, true])
        for (const filler of f.fillers ?? FILLERS) {
          const genes: RotationGenes = { coe: on[0] as boolean, agony: on[1] as boolean, corruption: on[2] as boolean, siphon: on[3] as boolean, immolate: on[4] as boolean, minTtkSec, drainSoulFinisher, filler };
          for (const pets of setups) out.push({ id: `${rotationId(genes)}|${pets.pet ?? 'none'}>${pets.sacrificed ?? '-'}`, genes, pets });
        }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The talents a combination is named after: the search never drops them. */
export function requiredRanks(c: Combo): Ranks {
  const r: Ranks = {};
  if (c.pets.sacrificed !== null) {
    r.demonic_sacrifice = 1;
    // summoning a demon after the sacrifice ends it, unless the build has Demonic Pact
    if (c.pets.pet !== null) r.demonic_pact = 1;
  }
  if (WRACK_FLOOR[c.genes.filler] !== undefined) r.wrack = 1;
  if (c.genes.siphon) r.siphon_life = 1;
  if (c.genes.drainSoulFinisher) r.soul_harvest = 1;
  return r;
}

export function spellKnown(spell: string, rank: number | 'max', level: number, ranks: Ranks): boolean {
  const s = getSpell(spell);
  if (s.teachesTalent && (ranks[s.teachesTalent] ?? 0) === 0) return false;
  return rankAt(spell, rank, level) !== undefined;
}

/** False when the condition can never hold at the level with these talents (an unknown spell or a missing talent). */
function possible(c: Cond, level: number, ranks: Ranks): boolean {
  if (c.op === 'all') return c.of.every((x) => possible(x, level, ranks));
  if (c.op === 'knows') return spellKnown(c.spell, 'max', level, ranks);
  if (c.op === 'talent_rank_at_least') return (ranks[c.id] ?? 0) >= c.rank;
  return true;
}

/** Whether the Demonic Sacrifice effect lasts: the talent is taken and no demon is summoned after it, or the build has Demonic Pact. */
export function sacrificeLive(c: Combo, ranks: Ranks): boolean {
  if (c.pets.sacrificed === null || (ranks.demonic_sacrifice ?? 0) === 0) return false;
  return c.pets.pet === null || (ranks.demonic_pact ?? 0) > 0;
}

/** The label of what a combination really plays at a level with these talents (dead steps left out). */
export function playedLabel(c: Combo, level: number, ranks: Ranks): string {
  const live = new Set(liveSteps(c, level, ranks).map((s) => s.id));
  const g = c.genes;
  let filler = g.filler;
  if (WRACK_FLOOR[filler] !== undefined && !live.has('filler_wrack')) filler = 'sb_max';
  if (filler === 'wrack_single_then_drain_life' && !live.has('filler_wrack_single_mob')) filler = 'drain_life';
  return rotationLabel({
    ...g,
    coe: g.coe && live.has('curse_of_elements'),
    agony: g.agony && live.has('bane_of_agony'),
    corruption: g.corruption && live.has('corruption'),
    siphon: g.siphon && live.has('siphon_life'),
    immolate: g.immolate && live.has('immolate'),
    drainSoulFinisher: g.drainSoulFinisher && live.has('drain_soul_finisher'),
    filler,
  });
}

/** The steps of a combination's rotation that can ever be cast at a level with these talents. */
export function liveSteps(c: Combo, level: number, ranks: Ranks, p: Params = DEFAULT_KEY_PARAMS): SpecStep[] {
  return buildRotation(c.genes, p).steps.filter((s) => spellKnown(s.spell, s.rank, level, ranks) && possible(s.when, level, ranks));
}

/** Identifies how a combination really plays at a level with these talents (dead steps and an unused sacrifice dropped). */
export function effectiveKey(c: Combo, level: number, ranks: Ranks): string {
  const live = liveSteps(c, level, ranks).map((s) => [s.spell, s.rank, s.when]);
  const est = buildRotation(c.genes, DEFAULT_KEY_PARAMS).estimate;
  const filler = est.filler === 'wrack' && !spellKnown('wrack', 'max', level, ranks) ? 'shadow_bolt' : est.filler;
  const sacrificed = sacrificeLive(c, ranks) ? c.pets.sacrificed : null;
  return JSON.stringify({ live, filler, fillerRank: est.fillerRank, dots: est.dotSpells, pet: c.pets.pet, sacrificed });
}

/** Parameters only shape conditions the same way for every combination, so the key uses fixed ones. */
const DEFAULT_KEY_PARAMS = { skip_agony_if_ttk_below: 0, drain_soul_window_sec: 5 } as Params;
