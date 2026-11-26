// The space build discovery searches: rotations composed from the simulator's spells (as data the
// fight plays) and pet setups. Talents are searched per combination (talent-search.ts).
// Framework-free.

import { all, knows, lacksDot, not, T, type Cond, type DataRotation, type RotationEstimate, type SpecStep } from '../rotation-spec';
import { getSpell, rankAt } from '../spells';
import { demonLearned } from '../stats';
import type { Ranks } from '../talents';
import type { Params, PetKind } from '../types';

export type FillerGene = 'sb_r1' | 'sb_r2' | 'sb_max' | 'searing_pain' | 'drain_life' | 'wrack' | 'wrack_hp50' | 'wrack_hp70' | 'wrack_single_then_drain_life';
export const FILLERS: readonly FillerGene[] = ['sb_r1', 'sb_r2', 'sb_max', 'searing_pain', 'drain_life', 'wrack', 'wrack_hp50', 'wrack_hp70', 'wrack_single_then_drain_life'];
export type MinTtk = 0 | 6 | 12;
export const MIN_TTKS: readonly MinTtk[] = [0, 6, 12];

export interface RotationGenes {
  coe: boolean;
  agony: boolean;
  corruption: boolean;
  siphon: boolean;
  immolate: boolean;
  /** DoTs and curses only when the target lives at least this long (estimated seconds); 0 = always. */
  minTtkSec: MinTtk;
  drainSoulFinisher: boolean;
  filler: FillerGene;
}

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
const DOT_KEYS = ['coe', 'agony', 'corruption', 'siphon', 'immolate'] as const;
const DOT_SHORT: Record<(typeof DOT_KEYS)[number], string> = { coe: 'coe', agony: 'ag', corruption: 'cor', siphon: 'sl', immolate: 'imm' };
const DOT_NAME: Record<(typeof DOT_KEYS)[number], string> = { coe: 'CoE', agony: 'Agony', corruption: 'Corruption', siphon: 'Siphon Life', immolate: 'Immolate' };
const FILLER_NAME: Record<FillerGene, string> = {
  sb_r1: 'Shadow Bolt r1',
  sb_r2: 'Shadow Bolt r2',
  sb_max: 'Shadow Bolt',
  searing_pain: 'Searing Pain',
  drain_life: 'Drain Life',
  wrack: 'Wrack',
  wrack_hp50: 'Wrack above 50% HP, else Drain Life',
  wrack_hp70: 'Wrack above 70% HP, else Drain Life',
  wrack_single_then_drain_life: 'Wrack on single mobs, else Drain Life',
};
const SB_RANK: Partial<Record<FillerGene, number | 'max'>> = { sb_r1: 1, sb_r2: 2, sb_max: 'max' };
const WRACK_FLOOR: Partial<Record<FillerGene, number>> = { wrack: 0, wrack_hp50: 0.5, wrack_hp70: 0.7 };

export function rotationId(g: RotationGenes): string {
  const dots = DOT_KEYS.filter((k) => g[k]).map((k) => DOT_SHORT[k]).join('+') || 'none';
  return `${dots}/t${g.minTtkSec}/${g.drainSoulFinisher ? 'ds' : 'nods'}/${g.filler}`;
}

export function rotationLabel(g: RotationGenes): string {
  const dots = DOT_KEYS.filter((k) => g[k]).map((k) => DOT_NAME[k]);
  let s = `${dots.length ? dots.join(', ') : 'no DoTs'} → ${FILLER_NAME[g.filler]}`;
  if (g.drainSoulFinisher) s += '; DS finish';
  if (dots.length && g.minTtkSec > 0) s += `; DoTs if TTK ≥ ${g.minTtkSec} s`;
  return s;
}

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

/** The rotation of the genes as steps the fight plays (the same step ids and conditions as the built-in rotations). */
export function buildRotation(g: RotationGenes, p: Params): DataRotation {
  const steps: SpecStep[] = [];
  const step = (id: string, spell: string, rank: number | 'max', when: Cond, filler = false): void => {
    steps.push(filler ? { id, spell, rank, when, filler } : { id, spell, rank, when });
  };
  const longEnough: Cond | null = g.minTtkSec > 0 ? { op: 'ttk_at_least', sec: g.minTtkSec } : null;
  const skip: Cond | null = p.skip_agony_if_ttk_below > 0 ? { op: 'ttk_at_least', sec: p.skip_agony_if_ttk_below } : null;
  const sbRank = SB_RANK[g.filler];

  step('trance_shadow_bolt', 'shadow_bolt', sbRank ?? 'max', { op: 'proc', id: 'shadow_trance' });
  step(
    'brand_refresh',
    'searing_pain',
    'max',
    all({ op: 'talent_rank_at_least', id: 'demonic_brand', rank: 1 }, { op: 'pet_alive' }, knows('searing_pain'), { op: 'brand_needs_refresh', marginSec: 1.5 }),
  );
  if (g.coe) step('curse_of_elements', 'curse_of_elements', 'max', all(skip, not({ op: 'target_has_curse' }), knows('curse_of_elements'), longEnough));
  if (g.agony) step('bane_of_agony', 'bane_of_agony', 'max', all(skip, lacksDot('bane_of_agony'), knows('bane_of_agony'), longEnough));
  if (g.corruption) step('corruption', 'corruption', 'max', all(lacksDot('corruption'), knows('corruption'), longEnough));
  if (g.siphon) step('siphon_life', 'siphon_life', 'max', all(knows('siphon_life'), lacksDot('siphon_life'), longEnough));
  if (g.immolate) step('immolate', 'immolate', 'max', all(knows('immolate'), lacksDot('immolate'), longEnough));
  if (g.drainSoulFinisher)
    step(
      'drain_soul_finisher',
      'drain_soul',
      'max',
      all(knows('drain_soul'), { op: 'talent_rank_at_least', id: 'soul_harvest', rank: 1 }, { op: 'drain_soul_kills_within', minSec: 1, maxSec: p.drain_soul_window_sec }),
    );

  let filler: string;
  let fillerRank: number | 'max' = 'max';
  if (sbRank !== undefined) {
    step('filler_shadow_bolt', 'shadow_bolt', sbRank, T, true);
    filler = 'shadow_bolt';
    fillerRank = sbRank;
  } else if (g.filler === 'searing_pain') {
    step('filler_searing_pain', 'searing_pain', 'max', T, true);
    filler = 'searing_pain';
  } else if (g.filler === 'drain_life') {
    step('filler_drain_life', 'drain_life', 'max', knows('drain_life'), true);
    filler = 'drain_life';
  } else if (g.filler === 'wrack_single_then_drain_life') {
    step('filler_wrack_single_mob', 'wrack', 'max', all(knows('wrack'), { op: 'mobs_in_pull_is', count: 1 }), true);
    step('filler_drain_life', 'drain_life', 'max', knows('drain_life'), true);
    filler = 'drain_life';
  } else {
    const floor = WRACK_FLOOR[g.filler] ?? 0;
    step('filler_wrack', 'wrack', 'max', floor > 0 ? all(knows('wrack'), { op: 'hp_pct_above', pct: floor * 100 }) : knows('wrack'), true);
    step('filler_drain_life', 'drain_life', 'max', knows('drain_life'));
    filler = 'wrack';
  }
  if (sbRank === undefined) step('shadow_bolt', 'shadow_bolt', 'max', T);
  step('shadow_bolt_r2', 'shadow_bolt', 2, T);
  step('shadow_bolt_r1', 'shadow_bolt', 1, T);

  const dotSpells = (['corruption', 'agony', 'siphon', 'immolate'] as const).filter((k) => g[k]).map((k) => (k === 'agony' ? 'bane_of_agony' : k === 'siphon' ? 'siphon_life' : k));
  const estimate: RotationEstimate = { filler, fillerRank, dotSpells };
  return { steps, estimate };
}

/** The talents a combination is named after: the search never drops them. */
export function requiredRanks(c: Combo): Ranks {
  const r: Ranks = {};
  if (c.pets.sacrificed !== null) r.demonic_sacrifice = 1;
  if (WRACK_FLOOR[c.genes.filler] !== undefined) r.wrack = 1;
  if (c.genes.siphon) r.siphon_life = 1;
  if (c.genes.drainSoulFinisher) r.soul_harvest = 1;
  return r;
}

function spellKnown(spell: string, rank: number | 'max', level: number, ranks: Ranks): boolean {
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

/** Identifies how a combination really plays at a level with these talents (dead steps and an unused sacrifice dropped). */
export function effectiveKey(c: Combo, level: number, ranks: Ranks): string {
  const rot = buildRotation(c.genes, DEFAULT_KEY_PARAMS);
  const live = rot.steps.filter((s) => spellKnown(s.spell, s.rank, level, ranks) && possible(s.when, level, ranks)).map((s) => [s.spell, s.rank, s.when]);
  const est = rot.estimate;
  const filler = est.filler === 'wrack' && !spellKnown('wrack', 'max', level, ranks) ? 'shadow_bolt' : est.filler;
  const sacrificed = (ranks.demonic_sacrifice ?? 0) > 0 ? c.pets.sacrificed : null;
  return JSON.stringify({ live, filler, fillerRank: est.fillerRank, dots: est.dotSpells, pet: c.pets.pet, sacrificed });
}

/** Parameters only shape conditions the same way for every combination, so the key uses fixed ones. */
const DEFAULT_KEY_PARAMS = { skip_agony_if_ttk_below: 0, drain_soul_window_sec: 5 } as Params;
