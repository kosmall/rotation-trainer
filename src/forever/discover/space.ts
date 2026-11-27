// The space build discovery searches: rotations composed from the simulator's spells (as data the
// fight plays) and pet setups. Talents are searched per combination (talent-search.ts).
// Framework-free.

import type { Cond, SpecStep } from '../rotation-spec';
import { ALT_FILLERS, ALT_WHENS, buildRotation, DOT_KEYS, FILLERS, MIN_TTKS, rotationId, rotationLabel, WRACK_FLOOR, type DotKey, type FillerGene, type MinTtk, type RotationGenes } from '../rotation-genes';

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
  if (WRACK_FLOOR[c.genes.filler] !== undefined || c.genes.alt?.filler === 'wrack') r.wrack = 1;
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
  return rotationLabel(playedGenes(c, level, ranks));
}

/** The genes of what a combination really plays at a level with these talents (effects that cannot fire turned off). */
export function playedGenes(c: Combo, level: number, ranks: Ranks): RotationGenes {
  const live = new Set(liveSteps(c, level, ranks).map((s) => s.id));
  const g = c.genes;
  let filler = g.filler;
  if (WRACK_FLOOR[filler] !== undefined && !live.has('filler_wrack')) filler = 'sb_max';
  if (filler === 'wrack_single_then_drain_life' && !live.has('filler_wrack_single_mob')) filler = 'drain_life';
  let alt = g.alt;
  if (alt && !live.has(alt.filler === 'wrack' || WRACK_FLOOR[alt.filler] !== undefined ? 'alt_filler_wrack' : `alt_filler_${altKind(alt.filler)}`)) alt = undefined;
  let dotTtk = g.dotTtk;
  if (dotTtk) {
    const kept = Object.fromEntries(Object.entries(dotTtk).filter(([k]) => g[k as DotKey] && live.has(DOT_STEP[k as DotKey])));
    dotTtk = Object.keys(kept).length ? (kept as RotationGenes['dotTtk']) : undefined;
  }
  const { alt: _a, dotTtk: _d, ...rest } = g;
  return ({
    ...rest,
    ...(alt ? { alt } : {}),
    ...(dotTtk ? { dotTtk } : {}),
    coe: g.coe && live.has('curse_of_elements'),
    agony: g.agony && live.has('bane_of_agony'),
    corruption: g.corruption && live.has('corruption'),
    siphon: g.siphon && live.has('siphon_life'),
    immolate: g.immolate && live.has('immolate'),
    drainSoulFinisher: g.drainSoulFinisher && live.has('drain_soul_finisher'),
    filler,
  });
}

const DOT_STEP: Record<DotKey, string> = { coe: 'curse_of_elements', agony: 'bane_of_agony', corruption: 'corruption', siphon: 'siphon_life', immolate: 'immolate' };
/** The id part of the step of a (non-Wrack) filler. */
const altKind = (f: FillerGene): string => (f === 'searing_pain' ? 'searing_pain' : f === 'drain_life' ? 'drain_life' : 'shadow_bolt');

/**
 * The neighbours of a rotation that mix things: a second filler that takes over under a condition
 * (mana, health, time to kill, pack size, fight length, pet), and other time-to-kill floors for single
 * effects or for groups of them. Variants that play the same at this level and talents are left out.
 */
export function mixVariants(base: Combo, level: number, ranks: Ranks): Combo[] {
  const g = base.genes;
  const variants: RotationGenes[] = [];
  for (const when of ALT_WHENS) {
    if (when === 'pet_dead' && base.pets.pet === null) continue;
    for (const filler of ALT_FILLERS) {
      if (filler === g.filler || (g.alt?.when === when && g.alt.filler === filler)) continue;
      // a filler that is already a mix of Wrack and Drain Life gains nothing from either of them as the second one
      if ((filler === 'wrack' || filler === 'drain_life') && (WRACK_FLOOR[g.filler] !== undefined || g.filler === 'wrack_single_then_drain_life') && g.filler !== 'wrack') continue;
      variants.push({ ...g, alt: { when, filler } });
    }
  }
  const active = DOT_KEYS.filter((k) => g[k]);
  const put = (patch: Partial<Record<DotKey, MinTtk>>): void => {
    variants.push({ ...g, dotTtk: { ...g.dotTtk, ...patch } });
  };
  for (const k of active) for (const v of MIN_TTKS) if (v !== (g.dotTtk?.[k] ?? g.minTtkSec)) put({ [k]: v });
  // groups: the cheap, strong effects at once and the slow ones late (or the other way round)
  const quick = active.filter((k) => k === 'corruption' || k === 'agony');
  const slow = active.filter((k) => k === 'coe' || k === 'siphon' || k === 'immolate');
  if (quick.length && slow.length) {
    put({ ...Object.fromEntries(quick.map((k) => [k, 0])), ...Object.fromEntries(slow.map((k) => [k, 12])) });
    put({ ...Object.fromEntries(quick.map((k) => [k, 6])), ...Object.fromEntries(slow.map((k) => [k, 0])) });
    put({ ...Object.fromEntries(quick.map((k) => [k, 12])), ...Object.fromEntries(slow.map((k) => [k, 0])) });
  }
  const seen = new Set([effectiveKey(base, level, ranks)]);
  const out: Combo[] = [];
  for (const genes of variants) {
    const c: Combo = { id: `${rotationId(genes)}|${base.pets.pet ?? 'none'}>${base.pets.sacrificed ?? '-'}`, genes, pets: base.pets };
    if (c.id === base.id) continue;
    const key = effectiveKey(c, level, { ...ranks, ...requiredRanks(c) });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
