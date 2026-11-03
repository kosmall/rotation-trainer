// The multi-run simulator's request, per-run sample and result (simulator Task 2; design spec
// docs/superpowers/specs/2026-11-02-simulator-design.md §2 B; docs/data-sources.md Part H).
// Plain, JSON-safe data: a request and a result cross a worker boundary as is. Framework-free.

import type { ItemDb } from '../data/items/types';
import type { SetupConfig } from '../setup/types';

/**
 * What to simulate. Untrusted (it comes from the UI and from storage): `prepareRun` (run.ts)
 * normalizes the setup (`normalizeSetup` with `db`), clamps the numbers (`SIM_LIMITS`) and throws a
 * TypeError for anything it cannot read.
 */
export interface SimRequest {
  /** The setup to play (gear, buffs, rotation with its `itemUse` rules, fight length, distance). */
  setup: SetupConfig;
  /**
   * The item database (plain JSON). Needed only when the gear has items, gems or enchants the
   * embedded author tables do not know (`gearNeedsDb`); without it such a gear is an Error.
   */
  db?: ItemDb | null;
  /** Number of fights, 1-100 000 (rounded and clamped). */
  runs: number;
  /** Base seed: any finite number, truncated and reduced to an unsigned 32-bit integer. */
  seed: number;
  /** The spell queue window, 0-1000 ms (rounded and clamped); the game uses 400. */
  spellQueueWindowMs: number;
}

/** One spell's totals in one fight (direct damage plus the ticks of the DoT it applied). */
export interface SpellTotals {
  /** Direct damage plus tick damage. */
  damage: number;
  /** The part of `damage` dealt by ticks. */
  tickDamage: number;
  /** Completed casts (`cast-complete`; a missile still flying at the end counts). */
  casts: number;
  /** Direct damage events (hits and crits). */
  hits: number;
  crits: number;
  misses: number;
}

/** What one fight leaves behind: numbers extracted from its log, never the log itself. */
export interface RunSample {
  index: number;
  /** The fight's seed: `mixSeed(request seed, index)`. */
  seed: number;
  dps: number;
  damageTotal: number;
  /** Per spell id (item actions excluded), in order of first appearance in the log. */
  spells: Record<string, SpellTotals>;
  /** Completed uses per item action id (`SpellDef.item`). */
  itemUses: Record<string, number>;
  /** Per visible (not `hidden`) aura id that was applied: ms it was up, cut at the fight end. */
  auraUpMs: Record<string, number>;
  /** Start mana + logged gains - end mana (docs Part H). */
  manaSpent: number;
  lifeTaps: number;
  /**
   * Casts and item uses started per pressing rule (`RunFactory.rules` order): rule fires, see
   * `SimResult.ruleFires`.
   */
  ruleFires: number[];
}

export interface Histogram {
  /** The first bin's lower edge (= min). */
  binStart: number;
  /** (max - min) / bins; 0 when every value is equal (then a single bin). */
  binWidth: number;
  counts: number[];
}

export interface SpellSummary {
  name: string;
  /** Mean damage per fight (direct + ticks). */
  meanDamage: number;
  /** Total damage of this spell over all runs / total damage of all spells over all runs. */
  share: number;
  meanCasts: number;
  meanHits: number;
  meanCrits: number;
  meanMisses: number;
  meanTickDamage: number;
}

export interface SimResult {
  runs: number;
  seed: number;
  /** The spell queue window the fights used. */
  spellQueueWindowMs: number;
  meanDps: number;
  /** Sample standard deviation (n - 1) of the per-fight DPS; 0 for one run. */
  stdDev: number;
  /** Standard error of the mean, stdDev / sqrt(runs). */
  stdErr: number;
  /** meanDps -+ 1.96 stdErr (normal approximation). */
  ci95: [number, number];
  min: number;
  max: number;
  median: number;
  /** Exact order statistics, linear interpolation between closest ranks (h = (n - 1) p). */
  percentiles: { p5: number; p25: number; p75: number; p95: number };
  histogram: Histogram;
  perSpell: Record<string, SpellSummary>;
  /** Mean uses per fight per item action id. */
  itemUses: Record<string, number>;
  /** Mean fraction of the fight each visible aura was up (target DoTs and debuffs, player buffs). */
  uptimes: Record<string, number>;
  meanManaSpent: number;
  meanLifeTaps: number;
  fightMs: number;
  /**
   * Rule fires (rotation scripts Task 4; docs Part J, "Rule fires"): per pressing rule of the
   * fight's priority list, in list order, its label and the mean number of casts / item uses per
   * fight it STARTED: a press counts when the cast or use actually starts (at once, or when the
   * queued press leaves the queue), never when it is only queued (a queued press that is replaced
   * or dropped counts nothing). Keys: a script's rule key `rules[i]`; for the basic rotation the
   * spell id (`shadow-bolt`) or the item's catalog entry id (`destruction-potion`, `item:29370`).
   * Every pressing rule is listed, 0 when it never fired; wait rules press nothing and are not
   * listed. Optional only for results built elsewhere (tests, older code): `simulate` always sets it.
   */
  ruleFires?: Record<string, RuleFires>;
  /** Display names: item action ids and aura ids to their names. */
  labels: { spells: Record<string, string>; items: Record<string, string>; auras: Record<string, string> };
}

/** `simulate`'s options. */
export interface SimOptions {
  /** Runs per chunk between yields to the event loop (default 50, at least 1). */
  chunk?: number;
  /** Called after each chunk with the runs done so far and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Aborting rejects the promise with an AbortError at the next run boundary (no partial result). */
  signal?: AbortSignal;
}

/** One rule's fires in `SimResult.ruleFires`. */
export interface RuleFires {
  /** The step's label (the rule's label, else the spell's or item's name). */
  label: string;
  /** Mean casts / item uses per fight this rule started. */
  meanFires: number;
}

/**
 * One scenario against the baseline (the first) in a paired comparison (`compare`, compare.ts;
 * docs Part J, "Comparing scenarios"). d_i = DPS of run i of this scenario - DPS of run i of the
 * baseline (both played with seed mixSeed(seed, i)).
 */
export interface PairedDelta {
  /** This scenario's mean DPS minus the baseline's (exactly the difference of the two means). */
  meanDiff: number;
  /** Standard error of the mean paired difference: sqrt(s_d^2 / n), s_d^2 the n - 1 sample variance of d_i; 0 for one run. */
  sem: number;
  /** meanDiff -+ 1.96 sem (normal approximation). */
  ci95: [number, number];
  /** meanDiff / sem; 0 when meanDiff is 0 or there is one run; +-Infinity when sem is 0 and meanDiff is not. */
  zscore: number;
  /** The 95% CI excludes 0 (never with one run). One test per scenario: no multiple-comparison correction. */
  significant: boolean;
  /** This scenario's 1-based rank by mean DPS among all compared scenarios. */
  rank: number;
}

/** `compare`'s result: one `SimResult` per request, in request order, and the paired deltas. */
export interface CompareResult {
  runs: number;
  seed: number;
  results: SimResult[];
  /** Per request: null for the baseline (index 0), else its paired delta against the baseline. */
  deltas: (PairedDelta | null)[];
  /** Request indices by mean DPS, best first (ties: lower index first). */
  ranking: number[];
  /** Per request: its 1-based rank (`ranking.indexOf(i) + 1`). */
  ranks: number[];
}
