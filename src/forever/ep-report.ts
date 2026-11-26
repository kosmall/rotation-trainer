// Equivalency points across builds: are the weights the same for every build? Pairs of builds are compared on
// the same seeds with one shared bootstrap, so the interval belongs to the difference of the weights.

import type { BuildRef } from './duel';
import { BOOTSTRAP_SEED_OFFSET, EP_STATS, bootstrapIndices, computeEp, percentileInterval, weightFrom, type EpOptions, type EpResult } from './ep';
import type { StatKey } from './types';

export interface EpDifference {
  stat: StatKey;
  a: number | null;
  b: number | null;
  /** a - b; null when a weight is not available. */
  diff: number | null;
  ci95: [number, number] | null;
  /** The interval of the difference excludes zero. */
  significant: boolean;
}

export function compareEp(a: EpResult, b: EpResult, o: { bootstrap?: number; seed?: number } = {}): EpDifference[] {
  if (a.level !== b.level) throw new Error(`level differs: ${a.level} vs ${b.level}`);
  if (a.sessions !== b.sessions) throw new Error(`sessions differ: ${a.sessions} vs ${b.sessions}`);
  const draws = bootstrapIndices(a.sessions, o.bootstrap ?? 400, (o.seed ?? 1) + BOOTSTRAP_SEED_OFFSET);
  return EP_STATS.map((stat): EpDifference => {
    const wa = a.weights[stat].weight;
    const wb = b.weights[stat].weight;
    if (wa === null || wb === null) return { stat, a: wa, b: wb, diff: null, ci95: null, significant: false };
    if (stat === 'spellPower') return { stat, a: wa, b: wb, diff: 0, ci95: [0, 0], significant: false };
    const reps: number[] = [];
    for (const idx of draws) {
      const x = weightFrom(a.slopes[stat], a.slopes.spellPower, idx);
      const y = weightFrom(b.slopes[stat], b.slopes.spellPower, idx);
      if (x !== null && y !== null) reps.push(x - y);
    }
    const diff = wa - wb;
    const ci95 = reps.length * 2 >= draws.length ? percentileInterval(reps) : null;
    return { stat, a: wa, b: wb, diff, ci95, significant: ci95 !== null && (ci95[0] > 0 || ci95[1] < 0) };
  });
}

export interface EpReport {
  options: EpOptions;
  results: EpResult[];
  pairs: { level: number; a: string; b: string; diffs: EpDifference[] }[];
}

export function epReport(builds: BuildRef[], levels: number[], o: EpOptions): EpReport {
  const results: EpResult[] = [];
  const pairs: EpReport['pairs'] = [];
  for (const level of levels) {
    const row = builds.map((b) => computeEp(b, level, o));
    results.push(...row);
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i] as EpResult;
        const b = row[j] as EpResult;
        pairs.push({ level, a: a.build, b: b.build, diffs: compareEp(a, b, { bootstrap: o.bootstrap, seed: o.seed }) });
      }
    }
  }
  return { options: o, results, pairs };
}

const f2 = (x: number): string => x.toFixed(2);

function cell(r: EpResult, stat: StatKey): string {
  const w = r.weights[stat];
  if (w.capped) return 'capped (0)';
  if (w.weight === null) return 'n/a';
  const ci = w.ci95 ? ` (${f2(w.ci95[0])}..${f2(w.ci95[1])})` : '';
  const flag = w.nonlinear ? ' *' : '';
  return `${f2(w.weight)}${ci}${flag}`;
}

export function formatEp(report: EpReport): string {
  const o = report.options;
  const levels = [...new Set(report.results.map((r) => r.level))];
  const out: string[] = [`# Equivalency points (1.00 = one point of spell power), gear: ${o.profile}, ${o.sessions} sessions, seed ${o.seed}`, ''];
  for (const level of levels) {
    const rs = report.results.filter((r) => r.level === level);
    out.push(`## Level ${level}`, '', `| stat | ${rs.map((r) => r.build).join(' | ')} |`, `|---|${rs.map(() => '---:').join('|')}|`);
    for (const stat of EP_STATS) out.push(`| ${stat} | ${rs.map((r) => cell(r, stat)).join(' | ')} |`);
    out.push(`| kills/h at base | ${rs.map((r) => r.baseKph.toFixed(1)).join(' | ')} |`, '');
    const bad = rs.filter((r) => !r.valid).map((r) => r.build);
    if (bad.length) out.push(`Spell power does not gain kills per hour for ${bad.join(', ')}: weights not available.`, '');
    out.push('Differences between builds (95% interval of the difference excludes 0):', '');
    for (const p of report.pairs.filter((x) => x.level === level)) {
      const sig = p.diffs.filter((d) => d.significant && d.diff !== null && d.ci95 !== null);
      const text = sig.length
        ? sig.map((d) => `${d.stat} ${f2(d.a as number)} vs ${f2(d.b as number)} (diff ${f2(d.diff as number)}, ${f2((d.ci95 as [number, number])[0])}..${f2((d.ci95 as [number, number])[1])})`).join('; ')
        : 'none significant';
      out.push(`- ${p.a} vs ${p.b}: ${text}`);
    }
    out.push('');
  }
  out.push(
    'Notes: the gear profiles are placeholders (`verify: true` in `levels.json`), so the weights are indicative. Hit counts only below the hit cap. `*` marks a weight whose downward and upward steps clearly disagree (not linear, so only approximate). Weights are kills per hour per point relative to spell power.',
  );
  return out.join('\n');
}
