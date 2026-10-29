// Hit table and damage calculation. Pure functions; randomness only via the injected Rng.

import type { Rng } from './rng';
import type { HitOutcome, TargetData } from './types';

export type { HitOutcome };

/** Miss chance in percent after the caster's hit, never below the target's minimum. */
export function effectiveMissPct(target: TargetData, hitPct: number): number {
  return Math.max(target.minMissPct, target.missPct - hitPct);
}

/**
 * Draw order is fixed for determinism: one draw for the miss roll when `canMiss`,
 * then one draw for the crit roll when `canCrit` and the spell did not miss.
 */
export function rollOutcome(
  rng: Rng,
  p: { missPct: number; critPct: number; canMiss: boolean; canCrit: boolean },
): HitOutcome {
  if (p.canMiss && rng.next() < p.missPct / 100) return 'miss';
  if (p.canCrit && rng.next() < p.critPct / 100) return 'crit';
  return 'hit';
}

/** Draws one number for the min-max roll; rounds once at the end. */
export function computeDamage(p: {
  rng: Rng;
  min: number;
  max: number;
  coeff: number;
  power: number;
  damageMult: number;
  targetMult: number;
  resistMult: number;
  outcome: 'hit' | 'crit';
  critMultiplier: number;
}): number {
  const rolled = p.min + p.rng.next() * (p.max - p.min);
  const crit = p.outcome === 'crit' ? p.critMultiplier : 1;
  return Math.round((rolled + p.coeff * p.power) * p.damageMult * p.targetMult * p.resistMult * crit);
}
