// Which build leads and which trails over the levels of a sweep. Framework-free.

export interface LevelSeries {
  id: string;
  values: readonly number[];
}

/** Values are compared as they are shown (`decimals`, one by default), so builds that look equal are a tie. */
const shown = (v: number, decimals: number): number => Math.round(v * 10 ** decimals) / 10 ** decimals;

/** The ids with the highest and the lowest value at level index `i`; both empty when the builds do not differ. `decimals`: the precision the values are shown with. */
export function extremesAt(series: readonly LevelSeries[], i: number, decimals = 1): { best: string[]; worst: string[] } {
  const row = series.map((s) => ({ id: s.id, v: shown(s.values[i] ?? 0, decimals) }));
  if (row.length < 2) return { best: [], worst: [] };
  const hi = Math.max(...row.map((r) => r.v));
  const lo = Math.min(...row.map((r) => r.v));
  if (hi === lo) return { best: [], worst: [] };
  return { best: row.filter((r) => r.v === hi).map((r) => r.id), worst: row.filter((r) => r.v === lo).map((r) => r.id) };
}

export interface RankRow {
  id: string;
  /** On how many levels. */
  count: number;
}

export interface SweepSummary {
  /** Levels on which the builds differ (the others are not counted). */
  levels: number;
  /** Every build with the number of levels on which it is the best, most often first. */
  best: RankRow[];
  /** Every build with the number of levels on which it is the worst, most often first. */
  worst: RankRow[];
}

/** Most levels first; builds with the same count keep the order of the series. */
const ranking = (series: readonly LevelSeries[], counts: ReadonlyMap<string, number>): RankRow[] =>
  series.map((s) => ({ id: s.id, count: counts.get(s.id) ?? 0 })).sort((a, b) => b.count - a.count);

/** Counts, over all levels, how often each build is the best and the worst (a tie counts for every tied build). */
export function summarize(series: readonly LevelSeries[], levelCount: number, decimals = 1): SweepSummary {
  const best = new Map<string, number>();
  const worst = new Map<string, number>();
  let levels = 0;
  for (let i = 0; i < levelCount; i++) {
    const e = extremesAt(series, i, decimals);
    if (e.best.length === 0) continue;
    levels++;
    for (const id of e.best) best.set(id, (best.get(id) ?? 0) + 1);
    for (const id of e.worst) worst.set(id, (worst.get(id) ?? 0) + 1);
  }
  return { levels, best: ranking(series, best), worst: ranking(series, worst) };
}
