// Comparison of all simulated builds on a grid of levels and gear profiles.

import { VARIANT_IDS, loadVariant, type PicksOptions } from './builds';
import { loadParams } from './data/load';
import { runCell, type CellMetrics } from './runner';
import type { Params } from './types';

export interface CompareOptions {
  levels: number[];
  profiles: string[];
  sessions: number;
  seed: number;
  mobs?: 1 | 2 | 3;
  params?: Partial<Params>;
  picks?: PicksOptions;
  builds?: readonly string[];
}

export function compareBuilds(o: CompareOptions): CellMetrics[] {
  const params = loadParams(o.params ?? {});
  const rows: CellMetrics[] = [];
  for (const profile of o.profiles) {
    for (const level of o.levels) {
      for (const id of o.builds ?? VARIANT_IDS) {
        rows.push(runCell({ variant: loadVariant(id), level, profile, params, mobs: o.mobs, picks: o.picks }, o.sessions, o.seed).metrics);
      }
    }
  }
  return rows;
}

const f = (x: number, d = 1): string => x.toFixed(d);

/** Markdown table: one block per level and profile, builds sorted by kills per hour. */
export function renderMarkdownTable(rows: readonly CellMetrics[]): string {
  const out: string[] = [];
  const keys = [...new Set(rows.map((r) => `${r.profile}|${r.level}`))];
  for (const key of keys) {
    const group = rows.filter((r) => `${r.profile}|${r.level}` === key).sort((a, b) => b.killsPerHour - a.killsPerHour);
    const first = group[0];
    if (!first) continue;
    out.push(`#### Level ${first.level}, gear: ${first.profile}`, '', '| Build | kills/h | TTK s | mana/kill | HP/kill | drink s | eat s | Life Tap s | rest s/kill | downtime | breaks/h | GCD use | wasted cast s |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of group)
      out.push(`| ${r.variant} | ${f(r.killsPerHour)} | ${f(r.ttkMean)} ± ${f(r.ttkStd)} | ${f(r.manaPerKill, 0)} | ${f(r.hpPerKill, 0)} | ${f(r.drinkSecPerKill)} | ${f(r.eatSecPerKill)} | ${f(r.lifeTapSecPerKill)} | ${f(r.restSecPerKill)} | ${f(100 * r.downtimeShare, 0)}% | ${f(r.breaksPerHour)} | ${f(100 * r.gcdUtil, 0)}% | ${f(r.gcdWasteSecPerKill, 2)} |`);
    out.push('');
  }
  return out.join('\n');
}
