// Rotation priority lists. A rotation returns candidates in priority order; the fight takes the
// first affordable one (and falls back to Life Tap or a short wait). Parameters come from Params.

import type { BuildVariant } from './builds';
import type { Params } from './types';

export interface Candidate {
  spellId: string;
  rankWant: number | 'max';
}

/** Read-only view of the fight the rotation decides on. */
export interface RotationCtx {
  params: Params;
  variant: BuildVariant;
  mobsInPull: number;
  petAlive: boolean;
  hasShadowTrance: boolean;
  /** Spell learned at this level and, for talent spells, taken. */
  known(spellId: string): boolean;
  talentRank(id: string): number;
  /** Target state. */
  targetHasDot(id: string): boolean;
  targetDotRemainingMs(id: string): number;
  targetHasCurse(): boolean;
  targetBrandRemainingMs(): number;
  targetBrandCharges(): number;
  targetHp(): number;
  estTtkSec(): number;
  /** Seconds to kill the target if Drain Soul is channelled now, from the DoTs already ticking, the pet and the drain itself. */
  drainSoulKillSec(): number;
  /** Expected total of a full Drain Soul channel on the target, and of one filler cast. */
  drainSoulExpected(): number;
  fillerExpected(): number;
}

const BRAND_REFRESH_MARGIN_MS = 1500;

/** When the mana is nearly gone and Life Tap is not allowed, a low Shadow Bolt rank still deals damage (a player downranks to save mana). */
const CHEAP_FALLBACK: Candidate[] = [{ spellId: 'shadow_bolt', rankWant: 2 }, { spellId: 'shadow_bolt', rankWant: 1 }];

function skipLongDots(ctx: RotationCtx): boolean {
  const skip = ctx.params.skip_agony_if_ttk_below;
  return skip > 0 && ctx.estTtkSec() < skip;
}

function drainSoulFinisher(ctx: RotationCtx): Candidate[] {
  if (!ctx.params.use_drain_soul_finisher || !ctx.known('drain_soul') || ctx.talentRank('soul_harvest') === 0) return [];
  // The kill should land inside the channel: DoTs and pet are already killing the target within the window.
  const kill = ctx.drainSoulKillSec();
  if (kill <= ctx.params.drain_soul_window_sec && kill >= 1.0) return [{ spellId: 'drain_soul', rankWant: 'max' }];
  return [];
}

function brandRefresh(ctx: RotationCtx): Candidate[] {
  if (ctx.talentRank('demonic_brand') === 0 || !ctx.petAlive || !ctx.known('searing_pain')) return [];
  if (ctx.targetBrandCharges() === 0 || ctx.targetBrandRemainingMs() < BRAND_REFRESH_MARGIN_MS) return [{ spellId: 'searing_pain', rankWant: 'max' }];
  return [];
}

function dotsCommon(ctx: RotationCtx, withAgony: boolean): Candidate[] {
  const out: Candidate[] = [];
  const longEnough = ctx.estTtkSec() >= ctx.params.corruption_min_ttk_sec;
  if (ctx.params.use_curse_of_elements && !skipLongDots(ctx) && !ctx.targetHasCurse() && ctx.known('curse_of_elements') && longEnough)
    out.push({ spellId: 'curse_of_elements', rankWant: 'max' });
  if (withAgony && !skipLongDots(ctx) && !ctx.targetHasDot('bane_of_agony') && ctx.known('bane_of_agony') && longEnough)
    out.push({ spellId: 'bane_of_agony', rankWant: 'max' });
  if (!ctx.targetHasDot('corruption') && ctx.known('corruption') && longEnough) out.push({ spellId: 'corruption', rankWant: 'max' });
  return out;
}

export function affliction(ctx: RotationCtx): Candidate[] {
  const out: Candidate[] = [];
  if (ctx.hasShadowTrance) out.push({ spellId: 'shadow_bolt', rankWant: 'max' });
  out.push(...dotsCommon(ctx, true));
  const longEnough = ctx.estTtkSec() >= ctx.params.corruption_min_ttk_sec;
  if (ctx.known('siphon_life') && !ctx.targetHasDot('siphon_life') && longEnough) out.push({ spellId: 'siphon_life', rankWant: 'max' });
  if ((ctx.params.aff_use_immolate || ctx.variant.immolate) && ctx.known('immolate') && !ctx.targetHasDot('immolate') && longEnough) out.push({ spellId: 'immolate', rankWant: 'max' });
  out.push(...drainSoulFinisher(ctx));
  const filler = ctx.variant.filler;
  const wrackOk = ctx.known('wrack');
  if (filler === 'wrack' && wrackOk) out.push({ spellId: 'wrack', rankWant: 'max' });
  if (filler === 'drain_life') {
    if (wrackOk && ctx.mobsInPull === 1) out.push({ spellId: 'wrack', rankWant: 'max' });
    if (ctx.known('drain_life')) out.push({ spellId: 'drain_life', rankWant: 'max' });
  }
  if (ctx.known('drain_life')) out.push({ spellId: 'drain_life', rankWant: 'max' });
  out.push({ spellId: 'shadow_bolt', rankWant: 'max' }, ...CHEAP_FALLBACK);
  return out;
}

export function demonology(ctx: RotationCtx): Candidate[] {
  const out: Candidate[] = [];
  if (ctx.hasShadowTrance) out.push({ spellId: 'shadow_bolt', rankWant: ctx.variant.rank });
  out.push(...brandRefresh(ctx));
  out.push(...dotsCommon(ctx, ctx.params.demo_use_agony));
  out.push(...drainSoulFinisher(ctx));
  out.push({ spellId: 'shadow_bolt', rankWant: ctx.variant.rank }, ...CHEAP_FALLBACK);
  return out;
}

export function fire(ctx: RotationCtx): Candidate[] {
  const out: Candidate[] = [];
  if (ctx.hasShadowTrance) out.push({ spellId: 'shadow_bolt', rankWant: 1 });
  out.push(...brandRefresh(ctx));
  const longEnough = ctx.estTtkSec() >= ctx.params.corruption_min_ttk_sec;
  if (!ctx.targetHasDot('immolate') && ctx.known('immolate') && longEnough) out.push({ spellId: 'immolate', rankWant: 'max' });
  if (ctx.params.fire_filler === 'shadow_bolt_r1') out.push({ spellId: 'shadow_bolt', rankWant: 1 });
  else out.push({ spellId: 'searing_pain', rankWant: 'max' }, { spellId: 'shadow_bolt', rankWant: 1 });
  return out;
}

export function rotationFor(kind: BuildVariant['rotation']): (ctx: RotationCtx) => Candidate[] {
  if (kind === 'affliction') return affliction;
  if (kind === 'demonology') return demonology;
  return fire;
}
