// Which build leads and which trails over the levels of a sweep. Framework-free.

export interface LevelSeries {
  id: string;
  values: readonly number[];
}

/** Values are compared as they are shown (one decimal), so builds that look equal are a tie. */
const shown = (v: number): number => Math.round(v * 10) / 10;

/** The ids with the highest and the lowest value at level index `i`; both empty when the builds do not differ. */
export function extremesAt(series: readonly LevelSeries[], i: number): { best: string[]; worst: string[] } {
  const row = series.map((s) => ({ id: s.id, v: shown(s.values[i] ?? 0) }));
  if (row.length < 2) return { best: [], worst: [] };
  const hi = Math.max(...row.map((r) => r.v));
  const lo = Math.min(...row.map((r) => r.v));
  if (hi === lo) return { best: [], worst: [] };
  return { best: row.filter((r) => r.v === hi).map((r) => r.id), worst: row.filter((r) => r.v === lo).map((r) => r.id) };
}

export interface Leader {
  /** All builds that share the highest count. */
  ids: string[];
  /** On how many levels. */
  count: number;
}

export interface SweepSummary {
  /** Levels on which the builds differ (the others are not counted). */
  levels: number;
  mostBest: Leader;
  mostWorst: Leader;
}

const leader = (counts: ReadonlyMap<string, number>): Leader => {
  const count = Math.max(0, ...counts.values());
  return { count, ids: count === 0 ? [] : [...counts].filter(([, n]) => n === count).map(([id]) => id) };
};

/** Counts, over all levels, how often each build is the best and the worst (a tie counts for every tied build). */
export function summarize(series: readonly LevelSeries[], levelCount: number): SweepSummary {
  const best = new Map<string, number>();
  const worst = new Map<string, number>();
  let levels = 0;
  for (let i = 0; i < levelCount; i++) {
    const e = extremesAt(series, i);
    if (e.best.length === 0) continue;
    levels++;
    for (const id of e.best) best.set(id, (best.get(id) ?? 0) + 1);
    for (const id of e.worst) worst.set(id, (worst.get(id) ?? 0) + 1);
  }
  return { levels, mostBest: leader(best), mostWorst: leader(worst) };
}
