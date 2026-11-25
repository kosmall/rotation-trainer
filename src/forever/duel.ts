// Head-to-head comparison of two builds over a range of levels. Both builds play the same seeds
// (common random numbers), so the paired differences have narrow confidence intervals.

import type { BuildVariant, PicksOptions } from './builds';
import { loadVariant } from './builds';
import { loadParams } from './data/load';
import { aggregate, runCell, std, type CellMetrics, type SessionResult } from './runner';
import type { Params } from './types';

export type BuildRef = string | BuildVariant;
export type DiffKey = 'killsPerHour' | 'ttk' | 'manaPerKill' | 'netManaPerKill' | 'hpPerKill' | 'restSecPerKill' | 'breaksPerHour' | 'downtimeShare';

/** Per metric: true when a higher value is better. */
export const HIGHER_IS_BETTER: Record<DiffKey, boolean> = {
  killsPerHour: true, ttk: false, manaPerKill: false, netManaPerKill: false, hpPerKill: false, restSecPerKill: false, breaksPerHour: false, downtimeShare: false,
};

export interface MetricDiff {
  /** Mean of (a - b) over the paired sessions. */
  mean: number;
  ci95: [number, number];
  significant: boolean;
}

export type Side = 'a' | 'b' | 'tie';

export interface DuelResult {
  level: number;
  a: CellMetrics;
  b: CellMetrics;
  diff: Record<DiffKey, MetricDiff>;
  verdict: { moreKillsPerHour: Side; fasterKill: Side; lessMana: Side; fewerBreaks: Side; lessDowntime: Side };
}

export interface DuelOptions {
  levels: number[];
  profile: string;
  mobs?: 1 | 2 | 3;
  sessions: number;
  seed: number;
  params?: Partial<Params>;
  picks?: PicksOptions;
}

export interface DuelReport {
  a: string;
  b: string;
  results: DuelResult[];
  /** Winner on kills per hour per level ('tie' when the paired difference is not significant). */
  winners: Side[];
  /** First level whose significant winner differs from the previous significant winner, or null. */
  crossover: { level: number; winner: 'a' | 'b' } | null;
}

function perSession(s: SessionResult): Record<DiffKey, number> {
  const k = Math.max(1, s.kills);
  return {
    killsPerHour: s.totalSec > 0 ? (3600 * s.kills) / s.totalSec : 0,
    ttk: s.pullSec / k,
    manaPerKill: s.manaSpent / k,
    netManaPerKill: (s.manaSpent - s.manaFromLifeTap) / k,
    hpPerKill: (s.damageTaken - s.healed) / k,
    restSecPerKill: s.restSec / k,
    breaksPerHour: s.totalSec > 0 ? (3600 * s.breaks) / s.totalSec : 0,
    downtimeShare: s.totalSec > 0 ? (s.restSec + s.resummonSec + s.deathSec) / s.totalSec : 0,
  };
}

export function pairedDiff(a: readonly SessionResult[], b: readonly SessionResult[]): Record<DiffKey, MetricDiff> {
  const out = {} as Record<DiffKey, MetricDiff>;
  const n = Math.min(a.length, b.length);
  for (const key of Object.keys(HIGHER_IS_BETTER) as DiffKey[]) {
    const d: number[] = [];
    for (let i = 0; i < n; i++) d.push(perSession(a[i] as SessionResult)[key] - perSession(b[i] as SessionResult)[key]);
    const mean = d.reduce((x, y) => x + y, 0) / Math.max(1, n);
    const half = n > 1 ? (1.96 * std(d)) / Math.sqrt(n) : 0;
    const ci95: [number, number] = [mean - half, mean + half];
    out[key] = { mean, ci95, significant: ci95[0] > 0 || ci95[1] < 0 };
  }
  return out;
}

function side(d: MetricDiff, higherBetter: boolean): Side {
  if (!d.significant) return 'tie';
  return d.mean > 0 === higherBetter ? 'a' : 'b';
}

export function duelLevel(a: BuildVariant, b: BuildVariant, level: number, o: DuelOptions): DuelResult {
  const params = loadParams(o.params ?? {});
  const cfgA = { variant: a, level, profile: o.profile, params, mobs: o.mobs, picks: o.picks };
  const cfgB = { variant: b, level, profile: o.profile, params, mobs: o.mobs, picks: o.picks };
  const ra = runCell(cfgA, o.sessions, o.seed).raw;
  const rb = runCell(cfgB, o.sessions, o.seed).raw;
  const diff = pairedDiff(ra, rb);
  return {
    level,
    a: aggregate(cfgA, ra),
    b: aggregate(cfgB, rb),
    diff,
    verdict: {
      moreKillsPerHour: side(diff.killsPerHour, true),
      fasterKill: side(diff.ttk, false),
      lessMana: side(diff.manaPerKill, false),
      fewerBreaks: side(diff.breaksPerHour, false),
      lessDowntime: side(diff.downtimeShare, false),
    },
  };
}

export function duelBuilds(a: BuildRef, b: BuildRef, o: DuelOptions): DuelReport {
  const va = typeof a === 'string' ? loadVariant(a) : a;
  const vb = typeof b === 'string' ? loadVariant(b) : b;
  const results = o.levels.map((level) => duelLevel(va, vb, level, o));
  const winners = results.map((r) => r.verdict.moreKillsPerHour);
  let crossover: DuelReport['crossover'] = null;
  let last: 'a' | 'b' | null = null;
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i] as Side;
    if (w === 'tie') continue;
    if (last !== null && w !== last && crossover === null) crossover = { level: (results[i] as DuelResult).level, winner: w };
    last = w;
  }
  return { a: va.id, b: vb.id, results, winners, crossover };
}

const f = (x: number, d = 1): string => x.toFixed(d);
const who = (s: Side, a: string, b: string): string => (s === 'a' ? a : s === 'b' ? b : '~');

export function formatSummary(r: DuelReport): string {
  const lines = [`${r.a} (a) vs ${r.b} (b) - kills per hour; differences are a - b with paired 95% CI`, 'level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b'];
  for (const x of r.results) {
    const d = x.diff.killsPerHour;
    lines.push(
      `${String(x.level).padStart(5)} | ${f(x.a.killsPerHour).padStart(6)} | ${f(x.b.killsPerHour).padStart(6)} | ${f(d.mean).padStart(6)} (${f(d.ci95[0])}..${f(d.ci95[1])})`.padEnd(54) +
        ` | ${who(x.verdict.moreKillsPerHour, 'a', 'b').padStart(6)} | ${f(x.a.ttkMean)}/${f(x.b.ttkMean)} | ${f(x.a.manaPerKill, 0)}/${f(x.b.manaPerKill, 0)} | ${f(x.a.restSecPerKill)}/${f(x.b.restSecPerKill)} | ${f(x.a.breaksPerHour)}/${f(x.b.breaksPerHour)}`,
    );
  }
  lines.push(r.crossover ? `Crossover: from level ${r.crossover.level} the winner is ${r.crossover.winner === 'a' ? r.a : r.b}.` : 'No crossover: the winner does not change over these levels.');
  return lines.join('\n');
}

export function formatDetail(x: DuelResult, a: string, b: string): string {
  const row = (name: string, va: number, vb: number, key: DiffKey | null, d = 1): string => {
    const diff = key ? `${f(x.diff[key].mean, d)} (${f(x.diff[key].ci95[0], d)}..${f(x.diff[key].ci95[1], d)})${x.diff[key].significant ? ' *' : ''}` : '';
    return `${name.padEnd(28)} ${f(va, d).padStart(9)} ${f(vb, d).padStart(9)}   ${diff}`;
  };
  const m = x.a;
  const n = x.b;
  return [
    `Level ${x.level}: ${a} (a) vs ${b} (b); * = significant paired difference`,
    `${''.padEnd(28)} ${'a'.padStart(9)} ${'b'.padStart(9)}   a - b (95% CI)`,
    row('kills per hour', m.killsPerHour, n.killsPerHour, 'killsPerHour'),
    row('TTK per mob (s)', m.ttkMean, n.ttkMean, 'ttk'),
    row('TTK std (s)', m.ttkStd, n.ttkStd, null),
    row('mana per kill', m.manaPerKill, n.manaPerKill, 'manaPerKill', 0),
    row('net mana per kill', m.netManaPerKill, n.netManaPerKill, 'netManaPerKill', 0),
    row('HP lost per kill', m.hpPerKill, n.hpPerKill, 'hpPerKill', 0),
    row('drink s per kill', m.drinkSecPerKill, n.drinkSecPerKill, null),
    row('eat s per kill', m.eatSecPerKill, n.eatSecPerKill, null),
    row('Life Tap s per kill', m.lifeTapSecPerKill, n.lifeTapSecPerKill, null),
    row('rest s per kill', m.restSecPerKill, n.restSecPerKill, 'restSecPerKill'),
    row('downtime share', m.downtimeShare, n.downtimeShare, 'downtimeShare', 3),
    row('breaks per hour', m.breaksPerHour, n.breaksPerHour, 'breaksPerHour'),
    row('kills per break', m.killsPerBreak, n.killsPerBreak, null),
    row('pulls without a break (%)', m.breakFreePullPct, n.breakFreePullPct, null, 0),
    row('GCD utilisation', m.gcdUtil, n.gcdUtil, null, 2),
    row('wasted cast s per kill', m.gcdWasteSecPerKill, n.gcdWasteSecPerKill, null, 2),
    row('deaths per hour', m.deathsPerHour, n.deathsPerHour, null, 2),
    `Verdict: more kills/h: ${who(x.verdict.moreKillsPerHour, a, b)}; faster kill: ${who(x.verdict.fasterKill, a, b)}; less mana: ${who(x.verdict.lessMana, a, b)}; fewer breaks: ${who(x.verdict.fewerBreaks, a, b)}; less downtime: ${who(x.verdict.lessDowntime, a, b)}`,
  ].join('\n');
}
