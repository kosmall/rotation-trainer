// Life Tap strategies: named presets, a coordinate-descent search over the policy parameters, and
// a paired comparison of any two policies. A policy is a set of overrides of the `lt_*`, `break_*`
// and drink parameters (src/forever/policy.ts reads them).

import { VARIANT_IDS, loadVariant } from './builds';
import { loadParams } from './data/load';
import { pairedDiff, type MetricDiff } from './duel';
import { aggregate, runCell, type CellMetrics, type SessionResult } from './runner';
import type { Params } from './types';

export type PolicyOverrides = Partial<Params>;

export const LT_PRESETS: Record<string, { description: string; params: PolicyOverrides }> = {
  USER: { description: "The user's rule: in combat mana<60% & HP>80%, or mana<20% & HP>30%; between mobs also HP=100% & mana<90%; break only below 30% HP, drinking only while eating.", params: {} },
  OLD_THRESHOLD: {
    description: 'First version of this simulator: Life Tap in combat only at mana<35% & HP>60%, no Life Tap between mobs; stop and drink whenever mana<40% or HP<50%, then drink and eat up to 90%.',
    params: { lt_combat_mana_pct: 0.35, lt_combat_hp_pct: 0.6, lt_low_mana_pct: 0, lt_between_mana_pct: 0, break_hp_pct: 0.5, break_mana_pct: 0.4, drink_to_mana_pct: 0.9, rest_to_mana_pct: 0.9, rest_to_hp_pct: 0.9 },
  },
  NO_LIFE_TAP: { description: 'Never Life Tap; stop and drink at mana<25% or HP<30%, drink to full.', params: { sb_filler_lifetap_when_oom: false, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0, break_hp_pct: 0.3, break_mana_pct: 0.25, drink_to_mana_pct: 1 } },
  COMBAT_ONLY: { description: "User's rule without the between-mobs Life Tap.", params: { lt_between_mana_pct: 0 } },
  BETWEEN_ONLY: { description: 'No Life Tap in combat; between mobs tap whenever HP>=60% and mana<100%; break below 30% HP.', params: { lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_hp_pct: 0.6, lt_between_mana_pct: 1 } },
  AGGRESSIVE_BETWEEN: { description: "User's rule, but between mobs tap down to 60% HP whenever mana<100%.", params: { lt_between_hp_pct: 0.6, lt_between_mana_pct: 1 } },
  CAUTIOUS: { description: "User's rule with stricter HP (combat tap needs HP>90%, break below 40% HP).", params: { lt_combat_hp_pct: 0.9, lt_low_hp_pct: 0.4, break_hp_pct: 0.4 } },
};

export interface Tunable {
  key: keyof Params;
  values: number[];
}

export const TUNABLES: Tunable[] = [
  { key: 'lt_combat_mana_pct', values: [0, 0.4, 0.5, 0.6, 0.7, 0.8] },
  { key: 'lt_combat_hp_pct', values: [0.5, 0.6, 0.7, 0.8, 0.9] },
  { key: 'lt_low_mana_pct', values: [0, 0.1, 0.2, 0.3, 0.4] },
  { key: 'lt_low_hp_pct', values: [0.2, 0.3, 0.4, 0.5] },
  { key: 'lt_between_mana_pct', values: [0, 0.6, 0.8, 0.9, 1] },
  { key: 'lt_between_hp_pct', values: [0.995, 0.8, 0.65, 0.5, 0.4] },
  { key: 'break_hp_pct', values: [0.15, 0.2, 0.3, 0.4, 0.5] },
  { key: 'break_mana_pct', values: [0, 0.1, 0.2] },
  { key: 'drink_to_mana_pct', values: [0, 0.6, 1] },
];

export interface EvalOptions {
  builds: readonly string[];
  levels: number[];
  profile: string;
  sessions: number;
  seed: number;
  mobs?: 1 | 2 | 3;
  baseParams?: PolicyOverrides;
}

export interface PolicyScore {
  /** Mean kills per hour over builds x levels (the search objective). */
  meanKph: number;
  perBuild: Record<string, number>;
  perLevel: Record<number, number>;
  deathsPerHour: number;
  breaksPerHour: number;
  drinkSecPerKill: number;
  lifeTapSecPerKill: number;
  downtimeShare: number;
}

export function evaluatePolicy(policy: PolicyOverrides, o: EvalOptions): PolicyScore {
  const params = loadParams({ ...o.baseParams, ...policy });
  const cells: CellMetrics[] = [];
  for (const id of o.builds)
    for (const level of o.levels) cells.push(runCell({ variant: loadVariant(id), level, profile: o.profile, params, mobs: o.mobs }, o.sessions, o.seed).metrics);
  const mean = (f: (c: CellMetrics) => number, cs = cells): number => (cs.length ? cs.reduce((a, c) => a + f(c), 0) / cs.length : 0);
  return {
    meanKph: mean((c) => c.killsPerHour),
    perBuild: Object.fromEntries(o.builds.map((id) => [id, mean((c) => c.killsPerHour, cells.filter((c) => c.variant === id))])),
    perLevel: Object.fromEntries(o.levels.map((l) => [l, mean((c) => c.killsPerHour, cells.filter((c) => c.level === l))])),
    deathsPerHour: mean((c) => c.deathsPerHour),
    breaksPerHour: mean((c) => c.breaksPerHour),
    drinkSecPerKill: mean((c) => c.drinkSecPerKill),
    lifeTapSecPerKill: mean((c) => c.lifeTapSecPerKill),
    downtimeShare: mean((c) => c.downtimeShare),
  };
}

export interface SearchStep {
  round: number;
  key: string;
  from: number;
  to: number;
  meanKph: number;
}

export interface SearchResult {
  best: PolicyOverrides;
  score: PolicyScore;
  start: PolicyScore;
  steps: SearchStep[];
}

/**
 * Coordinate descent: for each parameter try every candidate value and keep the best one when it
 * beats the current score by more than `minGain` kills per hour (guards against chasing noise).
 * Every candidate is evaluated on the same seeds.
 */
export function searchPolicy(start: PolicyOverrides, o: EvalOptions, rounds = 2, minGain = 0.25, tunables: Tunable[] = TUNABLES): SearchResult {
  const startScore = evaluatePolicy(start, o);
  let cur: PolicyOverrides = { ...start };
  let curScore = startScore;
  const steps: SearchStep[] = [];
  const base = loadParams(o.baseParams ?? {});
  for (let round = 1; round <= rounds; round++) {
    let changed = false;
    for (const t of tunables) {
      const currentValue = (cur[t.key] as number | undefined) ?? (base[t.key] as number);
      let bestVal = currentValue;
      let bestScore = curScore;
      for (const v of t.values) {
        if (v === currentValue) continue;
        const sc = evaluatePolicy({ ...cur, [t.key]: v }, o);
        if (sc.meanKph > bestScore.meanKph + minGain) {
          bestVal = v;
          bestScore = sc;
        }
      }
      if (bestVal !== currentValue) {
        cur = { ...cur, [t.key]: bestVal };
        curScore = bestScore;
        steps.push({ round, key: String(t.key), from: currentValue, to: bestVal, meanKph: bestScore.meanKph });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { best: cur, score: curScore, start: startScore, steps };
}

export interface PolicyDuel {
  build: string;
  level: number;
  a: number;
  b: number;
  diff: MetricDiff;
}

/** Paired comparison of two policies on one build and level (same seeds for both). */
export function duelPolicies(a: PolicyOverrides, b: PolicyOverrides, build: string, level: number, o: Omit<EvalOptions, 'builds' | 'levels'>): PolicyDuel {
  const mk = (p: PolicyOverrides): { raw: SessionResult[]; kph: number } => {
    const cfg = { variant: loadVariant(build), level, profile: o.profile, params: loadParams({ ...o.baseParams, ...p }), mobs: o.mobs };
    const { raw } = runCell(cfg, o.sessions, o.seed);
    return { raw, kph: aggregate(cfg, raw).killsPerHour };
  };
  const ra = mk(a);
  const rb = mk(b);
  return { build, level, a: ra.kph, b: rb.kph, diff: pairedDiff(ra.raw, rb.raw).killsPerHour };
}

export const ALL_BUILDS: readonly string[] = VARIANT_IDS;
