// Greedy talent-order optimizer: with a fixed core (the first points of a build), every further
// point goes to the legal talent that maximises kills per hour at the level the point is taken.
// All candidates are evaluated on the same seeds (common random numbers).

import type { BuildVariant } from './builds';
import { runCell } from './runner';
import { TALENTS, validatePicks, type Ranks } from './talents';
import type { Params } from './types';

export interface OptimizeOptions {
  /** Rotation, pet and filler of the build being optimised; its own order is ignored. */
  template: BuildVariant;
  /** Fixed first points (e.g. the 31 points of the Demonic Pact core). */
  core: string[];
  /** Last level to fill (default 60; 59 for the 40-59 comparison). */
  toLevel?: number;
  profile: string;
  sessions: number;
  seed: number;
  params: Params;
  mobs?: 1 | 2 | 3;
}

export interface OptimizeStep {
  level: number;
  pick: string;
  kph: number;
  /** Kills per hour gain over the best alternative that is not the pick, 0 = a dead point. */
  gain: number;
}

export interface OptimizeResult {
  order: string[];
  steps: OptimizeStep[];
}

const MODELLED = TALENTS.filter((t) => t.status === 'modelled').map((t) => t.id);

export function optimizeBuild(o: OptimizeOptions): OptimizeResult {
  const toLevel = o.toLevel ?? 60;
  const picks = [...o.core];
  const steps: OptimizeStep[] = [];
  while (picks.length < toLevel - 9) {
    const level = 10 + picks.length;
    let best: { id: string; kph: number } | null = null;
    let second = -Infinity;
    for (const id of MODELLED) {
      const trial = [...picks, id];
      const v = validatePicks(trial);
      if (!v.ok) continue;
      const ranks: Ranks = v.ranks;
      const kph = runCell({ variant: o.template, level, profile: o.profile, params: o.params, mobs: o.mobs, ranks }, o.sessions, o.seed).metrics.killsPerHour;
      if (best === null || kph > best.kph + 1e-9) {
        if (best !== null) second = Math.max(second, best.kph);
        best = { id, kph };
      } else second = Math.max(second, kph);
    }
    if (best === null) throw new Error(`no legal talent at point ${picks.length + 1}`);
    picks.push(best.id);
    steps.push({ level, pick: best.id, kph: best.kph, gain: Math.max(0, best.kph - (second === -Infinity ? best.kph : second)) });
  }
  return { order: picks, steps };
}

/** Compresses consecutive identical picks: [talent, points] runs. */
export function toRuns(order: readonly string[]): [string, number][] {
  const runs: [string, number][] = [];
  for (const id of order) {
    const last = runs[runs.length - 1];
    if (last && last[0] === id) last[1]++;
    else runs.push([id, 1]);
  }
  return runs;
}
