// Build discovery in the web app: search options from the app settings, the worker count, and a
// found result saved as a custom build that carries its composed rotation. Framework-free.

import type { BuildVariant, CustomBuildData } from '../builds';
import { DEFAULT_BUDGET, QUICK_BUDGET, type Budget, type DiscoverOptions, type TopRow } from '../discover/engine';
import { rotationLabel } from '../rotation-genes';
import { sacrificeLive } from '../discover/space';
import { canonicalPicks } from '../discover/talent-search';
import { paramsOf, type Settings } from './api';
import { uniqueName } from './custom';

export type DiscoverBudget = 'full' | 'quick';

export function discoverOptions(s: Settings, budget: DiscoverBudget): DiscoverOptions {
  return { level: s.level, profile: s.profile, mobs: s.mobs, seed: s.seed, perk: 0, params: paramsOf(s), top: 20, budget: budget === 'full' ? DEFAULT_BUDGET : QUICK_BUDGET };
}

/** Web Workers for a search: the browser's cores, at most 8. */
export function workerCount(hardwareConcurrency: number | undefined): number {
  return Math.max(1, Math.min(8, hardwareConcurrency || 4));
}

/** A found result as a custom build: its points in talent-row order, its rotation genes and its pets (the name leaves room for a " 2" suffix within 40 characters). */
export function discoveredBuild(row: TopRow, level: number, existing: readonly string[]): CustomBuildData {
  const name = uniqueName(`L${level} #${row.rank} ${row.label}`.slice(0, 36).trim(), existing);
  return {
    name,
    picks: canonicalPicks(row.ranks),
    rotation: 'affliction',
    filler: 'drain_life',
    rank: 'max',
    pet: row.combo.pets.pet,
    sacrificed: sacrificeLive(row.combo, row.ranks) ? row.combo.pets.sacrificed : null,
    genes: { ...row.combo.genes },
  };
}

export interface EtaInput {
  stage: string;
  done: number;
  total: number;
  stageElapsedSec: number;
  budget: Budget;
  /** Combinations of the screen stage. */
  combos: number;
  /** Known builds re-run in the final stage. */
  baselines: number;
}

/** Insensitivity re-runs of the top 5 (about a dozen talents each). */
const INSENSITIVITY_TASKS = 60;

/**
 * Seconds left in the whole search, from the speed of the current stage: every stage's work is
 * counted in simulated sessions (a talent evaluation is `sessions` of them), so the later stages are
 * priced at the speed measured now. Null before there is a speed.
 */
export function discoverEtaSec(i: EtaInput): number | null {
  if (i.done <= 0 || i.stageElapsedSec <= 0) return null;
  const b = i.budget;
  const order = ['screen', 'search', 'final', 'insensitivity'];
  const unit: Record<string, number> = { screen: b.screen.evals * b.screen.sessions, search: b.search.evals * b.search.sessions, final: b.finalSessions, insensitivity: b.finalSessions };
  const tasks: Record<string, number> = { screen: i.combos, search: Math.min(i.combos, b.keep + 9 * b.perFamilyMin), final: b.final + i.baselines, insensitivity: INSENSITIVITY_TASKS };
  const at = order.indexOf(i.stage);
  if (at < 0) return null;
  const rate = (i.done * (unit[i.stage] as number)) / i.stageElapsedSec;
  let left = (i.total - i.done) * (unit[i.stage] as number);
  for (const s of order.slice(at + 1)) left += (tasks[s] as number) * (unit[s] as number);
  return rate > 0 ? left / rate : null;
}

/** When the saved build will play more steps than the row shows (some are not learned at the row's level): the full rotation. */
export function fullRotationNote(row: TopRow): string | null {
  const full = rotationLabel(row.combo.genes);
  return full === row.label ? null : `Zapisany build na innych levelach gra pełną rotację: ${full}`;
}

/** A found result as a build variant for the views (talent facts, rotation diagram); not registered. */
export function rowVariant(row: TopRow): BuildVariant {
  return {
    id: `#${row.rank} ${row.label}`,
    order: 'custom:discover',
    pet: row.combo.pets.pet,
    sacrificed: sacrificeLive(row.combo, row.ranks) ? row.combo.pets.sacrificed : null,
    rotation: 'affliction',
    filler: 'drain_life',
    rank: 'max',
    pre_respec_build: null,
    respec_level: 40,
    genes: { ...row.combo.genes },
  };
}
