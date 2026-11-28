// Rotation genes: a rotation composed from the simulator's spells (maintained effects, a minimum
// time to kill for them, the Drain Soul finisher, the filler) and the steps the fight plays for it.
// Used by build discovery and by builds that carry their own rotation. Framework-free.

import { all, knows, lacksDot, not, T } from './conds';
import { loadParams } from './data/load';
import type { Cond, DataRotation, RotationEstimate, SpecStep } from './rotation-spec';
import type { Params } from './types';

export type FillerGene = 'sb_r1' | 'sb_r2' | 'sb_max' | 'searing_pain' | 'drain_life' | 'wrack' | 'wrack_hp50' | 'wrack_hp70' | 'wrack_single_then_drain_life';
export const FILLERS: readonly FillerGene[] = ['sb_r1', 'sb_r2', 'sb_max', 'searing_pain', 'drain_life', 'wrack', 'wrack_hp50', 'wrack_hp70', 'wrack_single_then_drain_life'];
export type MinTtk = 0 | 6 | 12;
export const MIN_TTKS: readonly MinTtk[] = [0, 6, 12];

/** When the second filler of a mixed rotation takes over from the first. */
export type AltWhen = 'mana_lt_30' | 'mana_lt_50' | 'hp_lt_50' | 'hp_lt_70' | 'ttk_le_5' | 'ttk_ge_15' | 'pack' | 'late' | 'pet_dead';
export const ALT_WHENS: readonly AltWhen[] = ['mana_lt_30', 'mana_lt_50', 'hp_lt_50', 'hp_lt_70', 'ttk_le_5', 'ttk_ge_15', 'pack', 'late', 'pet_dead'];
export const ALT_WHEN_NAME: Record<AltWhen, string> = {
  mana_lt_30: 'mana < 30%',
  mana_lt_50: 'mana < 50%',
  hp_lt_50: 'HP ≤ 50%',
  hp_lt_70: 'HP ≤ 70%',
  ttk_le_5: 'TTK ≤ 5 s',
  ttk_ge_15: 'TTK ≥ 15 s',
  pack: 'more than 1 mob in the pull',
  late: 'fight longer than 20 s',
  pet_dead: 'pet dead',
};
/** The fillers a mixed rotation switches to (the simple ones: the conditional Wrack fillers already mix two spells). */
export const ALT_FILLERS: readonly FillerGene[] = ['sb_r1', 'sb_r2', 'sb_max', 'searing_pain', 'drain_life', 'wrack'];
export type DotKey = (typeof DOT_KEYS)[number];

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
  /** A second filler played instead of `filler` while the condition holds (a mixed filler). */
  alt?: { when: AltWhen; filler: FillerGene };
  /** Per-effect time-to-kill floors that replace `minTtkSec` for those effects. */
  dotTtk?: Partial<Record<DotKey, MinTtk>>;
}

export const DOT_KEYS = ['coe', 'agony', 'corruption', 'siphon', 'immolate'] as const;
const DOT_SHORT: Record<(typeof DOT_KEYS)[number], string> = { coe: 'coe', agony: 'ag', corruption: 'cor', siphon: 'sl', immolate: 'imm' };
const DOT_NAME: Record<(typeof DOT_KEYS)[number], string> = { coe: 'CoE', agony: 'Agony', corruption: 'Corruption', siphon: 'Siphon Life', immolate: 'Immolate' };
export const FILLER_NAME: Record<FillerGene, string> = {
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
export const WRACK_FLOOR: Partial<Record<FillerGene, number>> = { wrack: 0, wrack_hp50: 0.5, wrack_hp70: 0.7 };

export function rotationId(g: RotationGenes): string {
  const dots = DOT_KEYS.filter((k) => g[k]).map((k) => DOT_SHORT[k]).join('+') || 'none';
  let id = `${dots}/t${g.minTtkSec}/${g.drainSoulFinisher ? 'ds' : 'nods'}/${g.filler}`;
  if (g.alt) id += `/alt:${g.alt.when}:${g.alt.filler}`;
  const per = DOT_KEYS.filter((k) => g[k] && g.dotTtk?.[k] !== undefined && g.dotTtk[k] !== g.minTtkSec).map((k) => `${DOT_SHORT[k]}${g.dotTtk?.[k]}`);
  if (per.length) id += `/ttk:${per.join(',')}`;
  return id;
}

/** The time-to-kill floor of one effect. */
export const ttkOf = (g: RotationGenes, k: DotKey): MinTtk => g.dotTtk?.[k] ?? g.minTtkSec;

export function rotationLabel(g: RotationGenes): string {
  const dots = DOT_KEYS.filter((k) => g[k]).map((k) => DOT_NAME[k]);
  let s = `${dots.length ? dots.join(', ') : 'no DoTs'} → ${FILLER_NAME[g.filler]}`;
  if (g.drainSoulFinisher) s += '; DS finish';
  const floors = DOT_KEYS.filter((k) => g[k]);
  if (floors.some((k) => ttkOf(g, k) !== g.minTtkSec)) s += `; if TTK ≥ ${floors.map((k) => `${DOT_NAME[k]} ${ttkOf(g, k)} s`).join(', ')}`;
  else if (dots.length && g.minTtkSec > 0) s += `; DoTs if TTK ≥ ${g.minTtkSec} s`;
  if (g.alt) s += `; ${FILLER_NAME[g.alt.filler]} when ${ALT_WHEN_NAME[g.alt.when]}`;
  return s;
}

/** The rotation of the genes as steps the fight plays (the same step ids and conditions as the built-in rotations). */
const ttkCond = (sec: number): Cond | null => (sec > 0 ? { op: 'ttk_at_least', sec } : null);

/** The condition under which the second filler of a mixed rotation is played. */
export function altCond(w: AltWhen): Cond {
  switch (w) {
    case 'mana_lt_30':
      return { op: 'mana_pct_below', pct: 30 };
    case 'mana_lt_50':
      return { op: 'mana_pct_below', pct: 50 };
    case 'hp_lt_50':
      return not({ op: 'hp_pct_above', pct: 50 });
    case 'hp_lt_70':
      return not({ op: 'hp_pct_above', pct: 70 });
    case 'ttk_le_5':
      return { op: 'ttk_at_most', sec: 5 };
    case 'ttk_ge_15':
      return { op: 'ttk_at_least', sec: 15 };
    case 'pack':
      return not({ op: 'mobs_in_pull_is', count: 1 });
    case 'late':
      return { op: 'combat_sec_at_least', sec: 20 };
    case 'pet_dead':
      return not({ op: 'pet_alive' });
  }
}

/** The default of `corruption_min_ttk_sec`: a value different from it is an override, which replaces the gene floor. */
const DEFAULT_MIN_TTK_SEC = loadParams().corruption_min_ttk_sec;

/**
 * The rotation of the genes as steps the fight plays, with the parameters combined the way the template rotations
 * combine them with their variant (`rotationSpec`, `stepsOf`), so a parameter override acts on a genes build as on a
 * known build and the defaults change nothing:
 * - a switch that the parameter can only turn off (`use_curse_of_elements`, `use_drain_soul_finisher`) is ANDed with the gene;
 * - a switch that the parameter can only turn on (`aff_use_immolate`, `demo_use_agony`) is ORed with the gene;
 * - `wrack_min_hp_pct` is the HP floor of the Wrack fillers whose name does not carry one (`wrack`, `wrack_single_then_drain_life`);
 *   a floor in the filler gene (`wrack_hp50`, `wrack_hp70`) wins, like `variant.wrack_min_hp_pct` over the parameter;
 * - `corruption_min_ttk_sec`, when changed from its default, replaces `minTtkSec`; a per-effect floor (`dotTtk`) stays.
 * `fire_filler` has no gene (it belongs to the Fire rotation) and is not read.
 */
export function buildRotation(g: RotationGenes, p: Params): DataRotation {
  const on = {
    coe: g.coe && p.use_curse_of_elements,
    agony: g.agony || p.demo_use_agony,
    corruption: g.corruption,
    siphon: g.siphon,
    immolate: g.immolate || p.aff_use_immolate,
    drainSoulFinisher: g.drainSoulFinisher && p.use_drain_soul_finisher,
  };
  const floorOf = (k: DotKey): number => (p.corruption_min_ttk_sec !== DEFAULT_MIN_TTK_SEC ? (g.dotTtk?.[k] ?? p.corruption_min_ttk_sec) : ttkOf(g, k));
  const wrackFloorOf = (f: FillerGene): number => WRACK_FLOOR[f] || p.wrack_min_hp_pct;
  const steps: SpecStep[] = [];
  const step = (id: string, spell: string, rank: number | 'max', when: Cond, filler = false): void => {
    steps.push(filler ? { id, spell, rank, when, filler } : { id, spell, rank, when });
  };
  const skip: Cond | null = p.skip_agony_if_ttk_below > 0 ? { op: 'ttk_at_least', sec: p.skip_agony_if_ttk_below } : null;
  const sbRank = SB_RANK[g.filler];

  step('trance_shadow_bolt', 'shadow_bolt', sbRank ?? 'max', { op: 'proc', id: 'shadow_trance' });
  step(
    'brand_refresh',
    'searing_pain',
    'max',
    all({ op: 'talent_rank_at_least', id: 'demonic_brand', rank: 1 }, { op: 'pet_alive' }, knows('searing_pain'), { op: 'brand_needs_refresh', marginSec: 1.5 }),
  );
  if (on.coe) step('curse_of_elements', 'curse_of_elements', 'max', all(skip, not({ op: 'target_has_curse' }), knows('curse_of_elements'), ttkCond(floorOf('coe'))));
  if (on.agony) step('bane_of_agony', 'bane_of_agony', 'max', all(skip, lacksDot('bane_of_agony'), knows('bane_of_agony'), ttkCond(floorOf('agony'))));
  if (on.corruption) step('corruption', 'corruption', 'max', all(lacksDot('corruption'), knows('corruption'), ttkCond(floorOf('corruption'))));
  if (on.siphon) step('siphon_life', 'siphon_life', 'max', all(knows('siphon_life'), lacksDot('siphon_life'), ttkCond(floorOf('siphon'))));
  if (on.immolate) step('immolate', 'immolate', 'max', all(knows('immolate'), lacksDot('immolate'), ttkCond(floorOf('immolate'))));
  if (on.drainSoulFinisher)
    step(
      'drain_soul_finisher',
      'drain_soul',
      'max',
      all(knows('drain_soul'), { op: 'talent_rank_at_least', id: 'soul_harvest', rank: 1 }, { op: 'drain_soul_kills_within', minSec: 1, maxSec: p.drain_soul_window_sec }),
    );

  /** The steps of one filler; `extra` (a mixed filler's condition) and `prefix` (its step ids) are set for the second one. */
  const fillerSteps = (f: FillerGene, extra: Cond | null, prefix: string): { spell: string; rank: number | 'max' } => {
    const add = (id: string, spell: string, rank: number | 'max', when: Cond, isFiller: boolean): void => step(prefix + id, spell, rank, all(extra, when), isFiller);
    const rank = SB_RANK[f];
    if (rank !== undefined) {
      add('filler_shadow_bolt', 'shadow_bolt', rank, T, true);
      return { spell: 'shadow_bolt', rank };
    }
    if (f === 'searing_pain') {
      add('filler_searing_pain', 'searing_pain', 'max', T, true);
      return { spell: 'searing_pain', rank: 'max' };
    }
    if (f === 'drain_life') {
      add('filler_drain_life', 'drain_life', 'max', knows('drain_life'), true);
      return { spell: 'drain_life', rank: 'max' };
    }
    if (f === 'wrack_single_then_drain_life') {
      const single = wrackFloorOf(f);
      add('filler_wrack_single_mob', 'wrack', 'max', all(knows('wrack'), single > 0 ? { op: 'hp_pct_above', pct: single * 100 } : null, { op: 'mobs_in_pull_is', count: 1 }), true);
      add('filler_drain_life', 'drain_life', 'max', knows('drain_life'), true);
      return { spell: 'drain_life', rank: 'max' };
    }
    const floor = wrackFloorOf(f);
    add('filler_wrack', 'wrack', 'max', floor > 0 ? all(knows('wrack'), { op: 'hp_pct_above', pct: floor * 100 }) : knows('wrack'), true);
    add('filler_drain_life', 'drain_life', 'max', knows('drain_life'), false);
    return { spell: 'wrack', rank: 'max' };
  };
  // a mixed filler: the second one is tried first, while its condition holds
  if (g.alt) fillerSteps(g.alt.filler, altCond(g.alt.when), 'alt_');
  const main = fillerSteps(g.filler, null, '');
  const filler = main.spell;
  const fillerRank = main.rank;
  if (sbRank === undefined) step('shadow_bolt', 'shadow_bolt', 'max', T);
  step('shadow_bolt_r2', 'shadow_bolt', 2, T);
  step('shadow_bolt_r1', 'shadow_bolt', 1, T);

  const dotSpells = (['corruption', 'agony', 'siphon', 'immolate'] as const).filter((k) => on[k]).map((k) => (k === 'agony' ? 'bane_of_agony' : k === 'siphon' ? 'siphon_life' : k));
  const estimate: RotationEstimate = { filler, fillerRank, dotSpells };
  return { steps, estimate };
}

/** Rotation genes from unknown data, or undefined when anything is malformed. */
export function parseGenes(raw: unknown): RotationGenes | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const flags = ['coe', 'agony', 'corruption', 'siphon', 'immolate', 'drainSoulFinisher'] as const;
  if (flags.some((k) => typeof o[k] !== 'boolean')) return undefined;
  if (!MIN_TTKS.includes(o.minTtkSec as never) || !FILLERS.includes(o.filler as never)) return undefined;
  let alt: RotationGenes['alt'];
  if (o.alt !== undefined) {
    const a = o.alt as Record<string, unknown> | null;
    if (a === null || typeof a !== 'object' || !ALT_WHENS.includes(a.when as never) || !ALT_FILLERS.includes(a.filler as never) || a.filler === o.filler) return undefined;
    alt = { when: a.when as AltWhen, filler: a.filler as FillerGene };
  }
  let dotTtk: RotationGenes['dotTtk'];
  if (o.dotTtk !== undefined) {
    const d = o.dotTtk as Record<string, unknown> | null;
    if (d === null || typeof d !== 'object') return undefined;
    dotTtk = {};
    for (const [k, v] of Object.entries(d)) {
      if (!DOT_KEYS.includes(k as never) || !MIN_TTKS.includes(v as never)) return undefined;
      dotTtk[k as DotKey] = v as MinTtk;
    }
  }
  return {
    ...(alt ? { alt } : {}),
    ...(dotTtk ? { dotTtk } : {}),
    coe: o.coe as boolean,
    agony: o.agony as boolean,
    corruption: o.corruption as boolean,
    siphon: o.siphon as boolean,
    immolate: o.immolate as boolean,
    minTtkSec: o.minTtkSec as RotationGenes['minTtkSec'],
    drainSoulFinisher: o.drainSoulFinisher as boolean,
    filler: o.filler as RotationGenes['filler'],
  };
}
