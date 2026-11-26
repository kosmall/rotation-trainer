// The rotation of a build as plain data (JSON): ordered steps with explicit conditions and numbers.
// The diagram of the web app is drawn from it, and an addon can read it to show the next action.
// `evaluateSteps` interprets the steps; tests keep it equal to the simulator's own rotation code
// (rotations.ts) on many states, and the Eureka! and Life Tap rules equal to the fight's.
// Framework-free.

import type { BuildVariant } from './builds';
import type { Candidate, RotationCtx } from './rotations';
import type { EurekaPolicy, Params } from './types';

/** A condition on the state of the fight. Everything an addon has to read is named by `reads`. */
export type Cond =
  | { op: 'true' }
  | { op: 'all'; of: Cond[] }
  | { op: 'any'; of: Cond[] }
  | { op: 'not'; of: Cond }
  /** A proc: `shadow_trance` is Nightfall's Shadow Trance (the next Shadow Bolt is instant). */
  | { op: 'proc'; id: 'shadow_trance' }
  /** The spell is learned at the character's level (and, for talent spells, the talent is taken). */
  | { op: 'knows'; spell: string }
  | { op: 'target_has_dot'; spell: string }
  | { op: 'target_has_curse' }
  /** Estimated seconds to kill the target (`definitions.ttk`) is at least / at most `sec`. */
  | { op: 'ttk_at_least'; sec: number }
  | { op: 'ttk_at_most'; sec: number }
  | { op: 'pet_alive' }
  | { op: 'talent_rank_at_least'; id: string; rank: number }
  /** Demonic Brand has no charges left or less than `marginSec` seconds to run. */
  | { op: 'brand_needs_refresh'; marginSec: number }
  /** Drain Soul channelled now kills the target after `minSec`..`maxSec` seconds (`definitions.drainSoulKill`). */
  | { op: 'drain_soul_kills_within'; minSec: number; maxSec: number }
  | { op: 'mobs_in_pull_is'; count: number }
  | { op: 'mana_pct_below'; pct: number }
  | { op: 'hp_pct_above'; pct: number }
  | { op: 'cooldown_ready'; spell: string }
  | { op: 'first_action_of_pull' }
  | { op: 'next_spell_in'; spells: string[] }
  | { op: 'next_step_is_filler' }
  | { op: 'combat_sec_at_least'; sec: number };

export interface SpecStep {
  id: string;
  spell: string;
  /** Spell rank: `max` = the highest known, or a number (1, 2). */
  rank: number | 'max';
  when: Cond;
  /** The filler of the rotation. */
  filler?: boolean;
}

export interface EurekaSpec {
  spell: 'eureka';
  /** False when the setting is off: `when` is then the recommended timing. */
  enabled: boolean;
  policy: EurekaPolicy;
  offGcd: true;
  cooldownSec: number;
  durationSec: number;
  manaCostMod: number;
  damageMod: number;
  /** Spells whose mana cost and damage it changes (periodic damage only for the channels). */
  affects: string[];
  when: Cond;
}

export interface LifeTapSpec {
  spell: 'life_tap';
  when: Cond;
  /** Never tap when the health after it would be under this fraction of the maximum. */
  minHpAfterPct: number;
}

export interface RotationSpec {
  schema: 'forever-rotation/1';
  build: string;
  kind: BuildVariant['rotation'];
  /** Decide in this order every time the GCD is free: Eureka! (off the GCD, then continue), Life Tap, the steps, the fallback. */
  eureka: EurekaSpec;
  lifeTap: LifeTapSpec;
  /** Cast the first step whose condition holds and which you can afford; then start over. */
  steps: SpecStep[];
  /** When no step is affordable. */
  fallback: { lifeTapWhenOutOfMana: boolean; waitSec: number };
  /** What an addon has to read from the game for these conditions. */
  reads: string[];
  definitions: Record<string, string>;
}

export const EUREKA_SPELLS: readonly string[] = ['shadow_bolt', 'immolate', 'searing_pain', 'drain_life', 'drain_soul', 'wrack'];
const EUREKA_NOT_AFFECTED = ['corruption', 'bane_of_agony', 'siphon_life', 'life_tap', 'curse_of_elements'];
const BRAND_MARGIN_SEC = 1.5;

const T: Cond = { op: 'true' };
const all = (...of: (Cond | null)[]): Cond => {
  const list = of.filter((c): c is Cond => c !== null && c.op !== 'true');
  return list.length === 0 ? T : list.length === 1 ? (list[0] as Cond) : { op: 'all', of: list };
};
const not = (of: Cond): Cond => ({ op: 'not', of });
const knows = (spell: string): Cond => ({ op: 'knows', spell });
const lacksDot = (spell: string): Cond => not({ op: 'target_has_dot', spell });

function eurekaWhen(policy: EurekaPolicy, p: Params): Cond {
  const ready: Cond = { op: 'cooldown_ready', spell: 'eureka' };
  const next: Cond = { op: 'next_spell_in', spells: [...EUREKA_SPELLS] };
  switch (policy) {
    case 'pull_start':
      return all(ready, { op: 'first_action_of_pull' });
    case 'filler':
      return all(ready, { op: 'next_step_is_filler' });
    case 'delay':
      return all(ready, next, { op: 'combat_sec_at_least', sec: p.eureka_delay_sec });
    case 'ttk':
      return all(ready, next, { op: 'ttk_at_most', sec: p.eureka_dur_sec });
    default:
      return all(ready, next);
  }
}

/** Steps of a rotation kind, in priority order (mirrors rotations.ts). */
function stepsOf(v: BuildVariant, p: Params): SpecStep[] {
  const out: SpecStep[] = [];
  const longEnough: Cond = { op: 'ttk_at_least', sec: p.corruption_min_ttk_sec };
  const skip: Cond | null = p.skip_agony_if_ttk_below > 0 ? { op: 'ttk_at_least', sec: p.skip_agony_if_ttk_below } : null;
  const step = (id: string, spell: string, rank: number | 'max', when: Cond, filler = false): void => {
    out.push(filler ? { id, spell, rank, when, filler } : { id, spell, rank, when });
  };
  const trance = (rank: number | 'max'): void => step('trance_shadow_bolt', 'shadow_bolt', rank, { op: 'proc', id: 'shadow_trance' });
  const brand = (): void =>
    step(
      'brand_refresh',
      'searing_pain',
      'max',
      all({ op: 'talent_rank_at_least', id: 'demonic_brand', rank: 1 }, { op: 'pet_alive' }, knows('searing_pain'), { op: 'brand_needs_refresh', marginSec: BRAND_MARGIN_SEC }),
    );
  const dots = (withAgony: boolean): void => {
    if (p.use_curse_of_elements) step('curse_of_elements', 'curse_of_elements', 'max', all(skip, not({ op: 'target_has_curse' }), knows('curse_of_elements'), longEnough));
    if (withAgony) step('bane_of_agony', 'bane_of_agony', 'max', all(skip, lacksDot('bane_of_agony'), knows('bane_of_agony'), longEnough));
    step('corruption', 'corruption', 'max', all(lacksDot('corruption'), knows('corruption'), longEnough));
  };
  const finisher = (): void => {
    if (!p.use_drain_soul_finisher) return;
    step(
      'drain_soul_finisher',
      'drain_soul',
      'max',
      all(knows('drain_soul'), { op: 'talent_rank_at_least', id: 'soul_harvest', rank: 1 }, { op: 'drain_soul_kills_within', minSec: 1, maxSec: p.drain_soul_window_sec }),
    );
  };
  const cheap = (): void => {
    step('shadow_bolt_r2', 'shadow_bolt', 2, T);
    step('shadow_bolt_r1', 'shadow_bolt', 1, T);
  };
  if (v.rotation === 'affliction') {
    trance('max');
    dots(true);
    step('siphon_life', 'siphon_life', 'max', all(knows('siphon_life'), lacksDot('siphon_life'), longEnough));
    if (p.aff_use_immolate || v.immolate) step('immolate', 'immolate', 'max', all(knows('immolate'), lacksDot('immolate'), longEnough));
    finisher();
    const wrackWhen = p.wrack_min_hp_pct > 0 ? all(knows('wrack'), { op: 'hp_pct_above', pct: p.wrack_min_hp_pct * 100 }) : knows('wrack');
    if (v.filler === 'wrack') step('filler_wrack', 'wrack', 'max', wrackWhen, true);
    else if (v.filler === 'drain_life') step('filler_wrack_single_mob', 'wrack', 'max', all(wrackWhen, { op: 'mobs_in_pull_is', count: 1 }), true);
    step('filler_drain_life', 'drain_life', 'max', knows('drain_life'), v.filler === 'drain_life');
    step('shadow_bolt', 'shadow_bolt', 'max', T);
    cheap();
  } else if (v.rotation === 'demonology') {
    trance(v.rank);
    brand();
    dots(p.demo_use_agony);
    finisher();
    step('filler_shadow_bolt', 'shadow_bolt', v.rank, T, true);
    cheap();
  } else {
    trance(1);
    brand();
    step('immolate', 'immolate', 'max', all(lacksDot('immolate'), knows('immolate'), longEnough));
    if (p.fire_filler === 'shadow_bolt_r1') step('filler_shadow_bolt_r1', 'shadow_bolt', 1, T, true);
    else {
      step('filler_searing_pain', 'searing_pain', 'max', T, true);
      step('shadow_bolt_r1', 'shadow_bolt', 1, T);
    }
  }
  return out;
}

const READS: Record<Cond['op'], string[]> = {
  true: [],
  all: [],
  any: [],
  not: [],
  proc: ['player buff: Shadow Trance'],
  knows: ['spellbook: spell known'],
  target_has_dot: ['target debuffs (yours)'],
  target_has_curse: ['target debuffs (yours)'],
  ttk_at_least: ['target health', 'your damage per second (estimate)'],
  ttk_at_most: ['target health', 'your damage per second (estimate)'],
  pet_alive: ['pet exists'],
  talent_rank_at_least: ['talent ranks'],
  brand_needs_refresh: ['target debuff: Demonic Brand charges and time left'],
  drain_soul_kills_within: ['target health', 'damage per second of your DoTs, pet and Drain Soul (estimate)'],
  mobs_in_pull_is: ['number of enemies in combat with you'],
  mana_pct_below: ['player mana'],
  hp_pct_above: ['player health'],
  cooldown_ready: ['spell cooldown'],
  first_action_of_pull: ['combat started'],
  next_spell_in: ['(the next step of the list)'],
  next_step_is_filler: ['(the next step of the list)'],
  combat_sec_at_least: ['time since combat started'],
};

function collectReads(c: Cond, into: Set<string>): void {
  for (const r of READS[c.op]) into.add(r);
  if (c.op === 'all' || c.op === 'any') c.of.forEach((x) => collectReads(x, into));
  if (c.op === 'not') collectReads(c.of, into);
}

/** The rotation of a build with the given parameters (Eureka! timing, Life Tap thresholds, switches). */
export function rotationSpec(v: BuildVariant, p: Params): RotationSpec {
  const enabled = p.eureka_policy !== 'off';
  const policy: EurekaPolicy = enabled ? p.eureka_policy : 'first_affected';
  const eureka: EurekaSpec = {
    spell: 'eureka',
    enabled,
    policy: p.eureka_policy,
    offGcd: true,
    cooldownSec: p.eureka_cd_sec,
    durationSec: p.eureka_dur_sec,
    manaCostMod: -p.eureka_mod,
    damageMod: p.eureka_mod,
    affects: [...EUREKA_SPELLS],
    when: eurekaWhen(policy, p),
  };
  const lifeTap: LifeTapSpec = {
    spell: 'life_tap',
    when: all(knows('life_tap'), {
      op: 'any',
      of: [
        all({ op: 'mana_pct_below', pct: p.lt_combat_mana_pct * 100 }, { op: 'hp_pct_above', pct: p.lt_combat_hp_pct * 100 }),
        all({ op: 'mana_pct_below', pct: p.lt_low_mana_pct * 100 }, { op: 'hp_pct_above', pct: p.lt_low_hp_pct * 100 }),
      ],
    }),
    minHpAfterPct: p.lt_safety_hp_pct * 100,
  };
  const steps = stepsOf(v, p);
  const reads = new Set<string>();
  for (const s of steps) collectReads(s.when, reads);
  collectReads(lifeTap.when, reads);
  if (enabled) collectReads(eureka.when, reads);
  return {
    schema: 'forever-rotation/1',
    build: v.id,
    kind: v.rotation,
    eureka,
    lifeTap,
    steps,
    fallback: { lifeTapWhenOutOfMana: p.sb_filler_lifetap_when_oom, waitSec: 0.3 },
    reads: [...reads].sort(),
    definitions: {
      ttk: 'Estimated seconds to kill the target = the target current health divided by your damage per second (your filler spell at 90% uptime plus your pet). Anything fixed on a number of seconds (for example 6) compares with this.',
      drainSoulKill: 'Seconds to kill the target if you channel Drain Soul now: target health divided by the damage per second of the DoTs already on it, your pet and the Drain Soul channel itself (with Soul Siphon).',
      eureka: 'Gnome racial Eureka!: instant, off the global cooldown, so after using it you go on to the spell that triggered it. Mana cost of the listed spells -10% and their damage +10% for 8 s (periodic damage only for Drain Life, Drain Soul, Wrack). Not affected: ' + EUREKA_NOT_AFFECTED.join(', ') + '.',
      affordable: 'A step is cast only when you have the mana for it; otherwise the next step is tried. When none is affordable, the fallback applies.',
    },
  };
}

/** What the conditions are evaluated against: the fight state of the rotation plus the player's mana, health and the Eureka! facts. */
export interface SpecCtx extends RotationCtx {
  manaPct?: number;
  cooldownReady?: (spell: string) => boolean;
  firstActionOfPull?: boolean;
  nextSpell?: string;
  nextIsFiller?: boolean;
  combatSec?: number;
}

export function evalCond(c: Cond, ctx: SpecCtx): boolean {
  switch (c.op) {
    case 'true':
      return true;
    case 'all':
      return c.of.every((x) => evalCond(x, ctx));
    case 'any':
      return c.of.some((x) => evalCond(x, ctx));
    case 'not':
      return !evalCond(c.of, ctx);
    case 'proc':
      return ctx.hasShadowTrance;
    case 'knows':
      return ctx.known(c.spell);
    case 'target_has_dot':
      return ctx.targetHasDot(c.spell);
    case 'target_has_curse':
      return ctx.targetHasCurse();
    case 'ttk_at_least':
      return ctx.estTtkSec() >= c.sec;
    case 'ttk_at_most':
      return ctx.estTtkSec() <= c.sec;
    case 'pet_alive':
      return ctx.petAlive;
    case 'talent_rank_at_least':
      return ctx.talentRank(c.id) >= c.rank;
    case 'brand_needs_refresh':
      return ctx.targetBrandCharges() === 0 || ctx.targetBrandRemainingMs() < c.marginSec * 1000;
    case 'drain_soul_kills_within': {
      const kill = ctx.drainSoulKillSec();
      return kill <= c.maxSec && kill >= c.minSec;
    }
    case 'mobs_in_pull_is':
      return ctx.mobsInPull === c.count;
    case 'mana_pct_below':
      return (ctx.manaPct ?? 100) < c.pct;
    case 'hp_pct_above':
      return (ctx.hpPct ?? 0) > c.pct;
    case 'cooldown_ready':
      return ctx.cooldownReady?.(c.spell) ?? false;
    case 'first_action_of_pull':
      return ctx.firstActionOfPull === true;
    case 'next_spell_in':
      return ctx.nextSpell !== undefined && c.spells.includes(ctx.nextSpell);
    case 'next_step_is_filler':
      return ctx.nextIsFiller === true;
    case 'combat_sec_at_least':
      return (ctx.combatSec ?? 0) >= c.sec;
  }
}

/** The candidates of the steps whose conditions hold, in order (the same list as the rotation code returns, apart from repeats). */
export function evaluateSteps(spec: RotationSpec, ctx: SpecCtx): Candidate[] {
  const out: Candidate[] = [];
  for (const s of spec.steps) if (evalCond(s.when, ctx)) out.push({ spellId: s.spell, rankWant: s.rank });
  return out;
}
