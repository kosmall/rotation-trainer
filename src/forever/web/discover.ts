// Build discovery in the web app: search options from the app settings, the worker count, and a
// found result saved as a custom build that carries its composed rotation. Framework-free.

import type { CustomBuildData } from '../builds';
import { DEFAULT_BUDGET, QUICK_BUDGET, type DiscoverOptions, type TopRow } from '../discover/engine';
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
