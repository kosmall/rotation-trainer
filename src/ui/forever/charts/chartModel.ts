// What the simulator's charts show, without any drawing: colours of the series, rows, gaps to the leader, axes.
import { loadVariant, VARIANT_IDS } from '../../../forever/builds';
import { EP_STATS, type EpResult } from '../../../forever/ep';
import type { DiffKey } from '../../../forever/duel';
import type { CellMetrics } from '../../../forever/runner';
import type { StatKey } from '../../../forever/types';
import type { RankedBuild } from '../../../forever/web/api';

export interface Series {
  id: string;
  label: string;
  values: readonly number[];
}

/** Colours of the categorical palette (`--viz-1` to `--viz-8`); further series stay grey. */
export const MAX_COLOURED = 8;
/** How many are coloured at first when there are more series than colours: more lines than this are hard to follow. */
const FIRST_SHOWN = 5;

export const meanOf = (values: readonly number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function byMean(series: readonly Series[], higherIsBetter = true): Series[] {
  return [...series].sort((a, b) => (higherIsBetter ? meanOf(b.values) - meanOf(a.values) : meanOf(a.values) - meanOf(b.values)));
}

export function defaultShown(series: readonly Series[], higherIsBetter = true): string[] {
  const list = series.length <= MAX_COLOURED ? series : byMean(series, higherIsBetter).slice(0, FIRST_SHOWN);
  return list.map((s) => s.id);
}

export function toggleShown(shown: readonly string[], id: string): string[] {
  if (shown.includes(id)) return shown.filter((x) => x !== id);
  return shown.length >= MAX_COLOURED ? [...shown] : [...shown, id];
}

/** The colour slot of every shown series. A series keeps its slot while it stays shown; a newcomer takes the lowest free one. */
export function assignSlots(previous: Readonly<Record<string, number>>, shown: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of shown) if (previous[id] !== undefined) out[id] = previous[id] as number;
  const used = new Set(Object.values(out));
  let free = 0;
  for (const id of shown) {
    if (out[id] !== undefined) continue;
    while (used.has(free)) free++;
    out[id] = free;
    used.add(free);
  }
  return out;
}

export type TrendMode = 'value' | 'gap';

export interface TrendRow {
  level: number;
  values: Record<string, number>;
}

const leaderOf = (values: readonly number[], higherIsBetter: boolean): number => (higherIsBetter ? Math.max(...values) : Math.min(...values));

/** Percent behind the leader: 0 for the leader, negative for the others. */
function gapPct(value: number, leader: number, higherIsBetter: boolean): number {
  if (value === leader || leader === 0) return 0;
  const diff = higherIsBetter ? value - leader : leader - value;
  return (100 * diff) / Math.abs(leader);
}

export function trendRows(levels: readonly number[], series: readonly Series[], mode: TrendMode, higherIsBetter = true): TrendRow[] {
  return levels.map((level, i) => {
    const at = series.map((s) => s.values[i] ?? 0);
    const leader = leaderOf(at, higherIsBetter);
    return { level, values: Object.fromEntries(series.map((s, k) => [s.id, mode === 'value' ? (at[k] as number) : gapPct(at[k] as number, leader, higherIsBetter)])) };
  });
}

export interface TooltipRow {
  id: string;
  label: string;
  value: number;
  gapPct: number;
}

/** Every series at the i-th level, best first. */
export function tooltipRows(series: readonly Series[], i: number, higherIsBetter = true): TooltipRow[] {
  const at = series.map((s) => s.values[i] ?? 0);
  const leader = leaderOf(at, higherIsBetter);
  return series
    .map((s, k) => ({ id: s.id, label: s.label, value: at[k] as number, gapPct: gapPct(at[k] as number, leader, higherIsBetter) }))
    .sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
}

const niceStep = (raw: number): number => {
  const base = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((m) => m * base >= raw - 1e-12) as number) * base;
};

/** A y (or x) range around the values with a little room, on round numbers. It never goes below 0 for values that are not negative, nor above 0 when 0 is the highest value. */
export function axisDomain(values: readonly number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return [lo >= 0 ? Math.max(0, lo - 1) : lo - 1, hi === 0 ? 0 : hi + 1];
  const step = niceStep((hi - lo) / 10);
  const pad = (hi - lo) * 0.1;
  const round = (x: number) => Math.round(x * 1e9) / 1e9;
  const bottom = round(Math.floor((lo - pad) / step) * step);
  const top = hi === 0 ? 0 : round(Math.ceil((hi + pad) / step) * step);
  return [lo >= 0 ? Math.max(0, bottom) : bottom, top];
}

/** About six even, round ticks inside a range (an axis with a fixed range would otherwise get odd ones). */
export function axisTicks([lo, hi]: readonly [number, number]): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep((hi - lo) / 6);
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(Math.round(k * step * 1e9) / 1e9 || 0);
  return out;
}

const NAME_MAX = 32;
/** A build name short enough for an axis; the tooltip shows it whole. */
export const shortName = (s: string, max = NAME_MAX): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The width of an axis of names, and how many letters fit in it: never more than 45% of the chart. */
export function nameAxis(ids: readonly string[], chartWidth: number): { width: number; max: number } {
  const longest = Math.max(0, ...ids.map((id) => shortName(id).length));
  const width = Math.min(longest * 7 + 20, Math.floor(chartWidth * 0.45));
  return { width, max: Math.max(8, Math.floor((width - 20) / 7)) };
}

export type RankMetric = 'kph' | 'ttk' | 'deaths' | 'downtime' | 'breaks';

export const RANK_METRICS: Record<RankMetric, { label: string; unit: string; higherIsBetter: boolean; of(m: CellMetrics): number }> = {
  kph: { label: 'Zabić/h', unit: 'zabić/h', higherIsBetter: true, of: (m) => m.killsPerHour },
  ttk: { label: 'TTK', unit: 's', higherIsBetter: false, of: (m) => m.ttkMean },
  deaths: { label: 'Zgony na godzinę', unit: '/h', higherIsBetter: false, of: (m) => m.deathsPerHour },
  downtime: { label: 'Przestój', unit: '%', higherIsBetter: false, of: (m) => 100 * m.downtimeShare },
  breaks: { label: 'Przerwy na godzinę', unit: '/h', higherIsBetter: false, of: (m) => m.breaksPerHour },
};

export interface RankRowData {
  id: string;
  value: number;
  metrics: CellMetrics;
  vsBest: RankedBuild['vsBest'];
}

export function rankingRows(rows: readonly RankedBuild[], metric: RankMetric): RankRowData[] {
  const def = RANK_METRICS[metric];
  const out = rows.map((r): RankRowData => ({ id: r.metrics.variant, value: def.of(r.metrics), metrics: r.metrics, vsBest: r.vsBest }));
  return out.sort((a, b) => (def.higherIsBetter ? b.value - a.value : a.value - b.value));
}

/** The text written at the end of a ranking bar. */
export function rankingLabel(row: RankRowData, metric: RankMetric): { value: string; gap: string } {
  const v = row.value;
  if (metric === 'ttk') return { value: `${v.toFixed(1)} s`, gap: '' };
  if (metric === 'downtime') return { value: `${v.toFixed(0)}%`, gap: '' };
  if (metric === 'deaths') return { value: v.toFixed(2), gap: '' };
  if (metric === 'breaks') return { value: v.toFixed(1), gap: '' };
  const d = row.vsBest;
  return { value: v.toFixed(1), gap: d ? `${d.mean.toFixed(1)}${d.significant ? '' : ' \u2248'}` : 'najlepszy' };
}

export type Family = 'affliction' | 'demonology' | 'own';

/** What a build is, for its colour in the ranking: a built-in affliction build, a built-in demonology or fire one, or the user's. */
export function familyOf(id: string): Family {
  if (!VARIANT_IDS.includes(id)) return 'own';
  return loadVariant(id).rotation === 'affliction' ? 'affliction' : 'demonology';
}

export interface EpCell {
  value: number | undefined;
  error: [number, number] | undefined;
  note: 'n/a' | 'capped' | undefined;
}

export interface EpRow {
  stat: StatKey;
  cells: Record<string, EpCell>;
}

/** Equivalency points per stat and build; spell power is the unit (1) and has no row. */
export function epRows(results: readonly EpResult[]): EpRow[] {
  return EP_STATS.filter((s) => s !== 'spellPower').map((stat) => ({
    stat,
    cells: Object.fromEntries(
      results.map((r): [string, EpCell] => {
        const w = r.weights[stat];
        if (w.capped) return [r.build, { value: 0, error: undefined, note: 'capped' }];
        if (w.weight === null) return [r.build, { value: undefined, error: undefined, note: 'n/a' }];
        return [r.build, { value: w.weight, error: w.ci95 ? [w.weight - w.ci95[0], w.ci95[1] - w.weight] : undefined, note: undefined }];
      }),
    ),
  }));
}

export interface DuelMetric {
  label: string;
  higherIsBetter: boolean;
  decimals: number;
  diff: DiffKey;
  scale: number;
  of(m: CellMetrics): number;
}

const duel = (label: string, diff: DiffKey, higherIsBetter: boolean, decimals: number, of: (m: CellMetrics) => number, scale = 1): DuelMetric => ({ label, diff, higherIsBetter, decimals, scale, of: (m) => scale * of(m) });

export const DUEL_METRICS: Record<string, DuelMetric> = {
  kph: duel('Zabić/h', 'killsPerHour', true, 1, (m) => m.killsPerHour),
  ttk: duel('TTK s', 'ttk', false, 2, (m) => m.ttkMean),
  mana: duel('Mana/zab.', 'manaPerKill', false, 0, (m) => m.manaPerKill),
  hp: duel('HP/zab.', 'hpPerKill', false, 0, (m) => m.hpPerKill),
  rest: duel('Przerwa s/zab.', 'restSecPerKill', false, 2, (m) => m.restSecPerKill),
  breaks: duel('Przerwy/h', 'breaksPerHour', false, 2, (m) => m.breaksPerHour),
  downtime: duel('Przestój %', 'downtimeShare', false, 1, (m) => m.downtimeShare, 100),
};
