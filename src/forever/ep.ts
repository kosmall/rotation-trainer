// Equivalency points: how many points of spell power one point of another stat is worth for a build, measured
// in kills per hour. Paired finite differences: the same seeds are played with the stat raised and lowered, so
// the simulation noise cancels; a bootstrap over the sessions gives the interval of the ratio.

import { loadVariant, ranksAt, type PicksOptions } from './builds';
import { loadParams } from './data/load';
import type { BuildRef } from './duel';
import { effectNum } from './effects';
import { killsPerHour, runCell, std, type SessionResult } from './runner';
import { playerStatsFor } from './stats';
import type { Params, StatKey } from './types';
import { createRng } from '../engine/rng';
import { MAX_LEVEL, MIN_LEVEL } from './web/api';

/** Spell power first: it is the reference every weight is divided by. */
export const EP_STATS: readonly StatKey[] = ['spellPower', 'intellect', 'spirit', 'stamina', 'critPct', 'hitPct'];

export const DEFAULT_DELTAS: Record<StatKey, number> = { spellPower: 40, intellect: 40, spirit: 40, stamina: 40, critPct: 3, hitPct: 3 };

export interface EpOptions {
  profile: string;
  sessions: number;
  seed: number;
  mobs?: 1 | 2 | 3;
  params?: Partial<Params>;
  picks?: PicksOptions;
  deltas?: Partial<Record<StatKey, number>>;
  /** Bootstrap draws for the intervals (default 400). */
  bootstrap?: number;
}

export interface StatWeight {
  stat: StatKey;
  /** Points added / taken away in the two measured runs (down is clamped to what the profile has). */
  up: number;
  down: number;
  /** Spell power points one point of this stat is worth; null when spell power gains nothing. */
  weight: number | null;
  ci95: [number, number] | null;
  /** Kills per hour per point of the stat. */
  kphPerPoint: number;
  /** Hit only: the profile already sits at the hit cap, so more of it is worth nothing. */
  capped: boolean;
  /** Slope of the downward step over the slope of the upward one (1 = linear); null when not measurable. Informational. */
  linearity: number | null;
  /** The downward and upward steps give clearly different slopes (see `isNonlinear`): the weight is only approximate. */
  nonlinear: boolean;
}

export interface EpResult {
  build: string;
  level: number;
  sessions: number;
  baseKph: number;
  /** Spell power gains kills per hour; without it no weight means anything. */
  valid: boolean;
  weights: Record<StatKey, StatWeight>;
  /** Per session, kills per hour per point of the stat. */
  slopes: Record<StatKey, number[]>;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const sessionKph = (s: SessionResult): number => killsPerHour(s.kills, s.totalSec);

/** Mean slope of a stat over mean slope of spell power (over the sessions `idx`, default all); null when spell power gains nothing. */
export function weightFrom(slopes: readonly number[], spSlopes: readonly number[], idx?: readonly number[]): number | null {
  const pick = (xs: readonly number[]): number[] => (idx ? idx.map((i) => xs[i] as number) : [...xs]);
  const sp = mean(pick(spSlopes));
  return sp > 0 ? mean(pick(slopes)) / sp : null;
}

/** `draws` resamples (with replacement) of the indices 0..n-1, repeatable from `seed`. */
export function bootstrapIndices(n: number, draws: number, seed: number): number[][] {
  const rng = createRng(seed);
  return Array.from({ length: draws }, () => Array.from({ length: n }, () => Math.floor(rng.next() * n)));
}

export function percentileInterval(xs: readonly number[]): [number, number] {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number): number => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] as number;
  return [at(0.025), at(0.975)];
}

/**
 * Do the downward and upward steps of a stat disagree beyond the noise? Per session the two slopes are paired (same
 * seed); the mean gap must lie outside its 95% interval and be more than a quarter of the larger mean slope.
 */
export function isNonlinear(slopeUp: readonly number[], slopeDown: readonly number[]): boolean {
  const n = Math.min(slopeUp.length, slopeDown.length);
  if (n < 2) return false;
  const gaps = Array.from({ length: n }, (_, i) => (slopeDown[i] as number) - (slopeUp[i] as number));
  const gap = Math.abs(mean(gaps));
  const half = (1.96 * std(gaps)) / Math.sqrt(n);
  return gap > half && gap > 0.25 * Math.max(Math.abs(mean(slopeUp)), Math.abs(mean(slopeDown)));
}

export const BOOTSTRAP_SEED_OFFSET = 7919;

/** The simulation steps of one build at one level: step 0 is the base run, then per stat an upward and (when the profile has anything to lose) a downward step. */
export interface EpPlan {
  total: number;
  /** Kills per hour per session of step i. */
  run(i: number): number[];
  assemble(outs: readonly number[][]): EpResult;
}

export function planEp(build: BuildRef, level: number, o: EpOptions): EpPlan {
  if (!Number.isInteger(o.sessions) || o.sessions < 2) throw new Error(`sessions must be at least 2, got ${o.sessions}`);
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) throw new Error(`level must be ${MIN_LEVEL}-${MAX_LEVEL}, got ${level}`);
  const variant = typeof build === 'string' ? loadVariant(build) : build;
  const params = loadParams(o.params ?? {});
  const ranks = ranksAt(variant, level, o.picks);
  const stats = playerStatsFor(level, o.profile, ranks);
  const deltas = { ...DEFAULT_DELTAS, ...o.deltas };
  const cfg = { variant, level, profile: o.profile, params, mobs: o.mobs, picks: o.picks };
  const hitHeadroom = Math.max(0, params.mob_miss_pct - effectNum('suppression', 'hitPctPerRank') * (ranks['suppression'] ?? 0) - 1 - stats.hitPct);

  const steps: (Partial<Record<StatKey, number>> | undefined)[] = [undefined];
  const layout = EP_STATS.map((stat) => {
    const capped = stat === 'hitPct' && hitHeadroom <= 0;
    const up = capped ? 0 : stat === 'hitPct' ? Math.min(deltas[stat], hitHeadroom) : deltas[stat];
    const down = capped ? 0 : Math.min(deltas[stat], stats[stat]);
    let upStep = -1;
    let downStep = -1;
    if (!capped) {
      upStep = steps.push({ [stat]: up }) - 1;
      if (down > 0) downStep = steps.push({ [stat]: -down }) - 1;
    }
    return { stat, up, down, capped, upStep, downStep };
  });

  return {
    total: steps.length,
    run: (i) => runCell({ ...cfg, statDelta: steps[i] }, o.sessions, o.seed).raw.map(sessionKph),
    assemble: (outs) => {
      const base = outs[0] as number[];
      const slopes = {} as Record<StatKey, number[]>;
      const weights = {} as Record<StatKey, StatWeight>;
      for (const { stat, up, down, capped, upStep, downStep } of layout) {
        let linearity: number | null = null;
        let nonlinear = false;
        if (capped) {
          slopes[stat] = base.map(() => 0);
        } else {
          const kphUp = outs[upStep] as number[];
          const kphDown = downStep >= 0 ? (outs[downStep] as number[]) : base;
          slopes[stat] = kphUp.map((v, i) => (v - (kphDown[i] as number)) / (up + down));
          if (down > 0) {
            const slopeUp = (mean(kphUp) - mean(base)) / up;
            const slopeDown = (mean(base) - mean(kphDown)) / down;
            linearity = Math.abs(slopeUp) < 1e-9 ? null : slopeDown / slopeUp;
            nonlinear = isNonlinear(
              kphUp.map((v, i) => (v - (base[i] as number)) / up),
              kphDown.map((v, i) => ((base[i] as number) - v) / down),
            );
          }
        }
        weights[stat] = { stat, up, down, weight: null, ci95: null, kphPerPoint: mean(slopes[stat]), capped, linearity, nonlinear };
      }

      const sp = slopes.spellPower;
      const valid = mean(sp) > 0;
      const draws = bootstrapIndices(o.sessions, o.bootstrap ?? 400, o.seed + BOOTSTRAP_SEED_OFFSET);
      if (valid) {
        for (const stat of EP_STATS) {
          const w = weights[stat];
          if (stat === 'spellPower') {
            w.weight = 1;
            w.ci95 = [1, 1];
          } else if (w.capped) {
            w.weight = 0;
            w.ci95 = [0, 0];
          } else {
            w.weight = weightFrom(slopes[stat], sp);
            const reps = draws.map((idx) => weightFrom(slopes[stat], sp, idx)).filter((x): x is number => x !== null);
            w.ci95 = reps.length * 2 >= draws.length ? percentileInterval(reps) : null;
          }
        }
      }
      return { build: variant.id, level, sessions: o.sessions, baseKph: mean(base), valid, weights, slopes };
    },
  };
}

export function computeEp(build: BuildRef, level: number, o: EpOptions): EpResult {
  const plan = planEp(build, level, o);
  return plan.assemble(Array.from({ length: plan.total }, (_, i) => plan.run(i)));
}
