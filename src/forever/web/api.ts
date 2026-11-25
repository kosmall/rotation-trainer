// The web app's simulation jobs (framework-free, no DOM): a job is a list of small tasks (one
// `runCell` or one duel level each) plus a function that assembles their outputs. The worker and the
// main-thread fallback both run the tasks one by one and report progress after each.

import { loadVariant, VARIANT_IDS } from '../builds';
import { loadParams } from '../data/load';
import { duelLevel, pairedDiff, type DuelResult, type MetricDiff } from '../duel';
import { runCell, type CellMetrics } from '../runner';
import { PROFILE_IDS } from '../stats';
import type { Params } from '../types';

export const MIN_LEVEL = 40;
export const MAX_LEVEL = 59;

/** Life Tap / rest policies selectable in the UI (values from the strategy search, see reports/forever_lifetap_*.md). */
export const POLICIES: Readonly<Record<string, { label: string; description: string; params: Partial<Params> }>> = {
  BEST_1MOB: {
    label: 'Najlepsza, 1 mob',
    description: 'Combat: mana<60% i HP>80%, lub mana<20% i HP>30%; między mobami HP≥65% i mana<90%; przerwa poniżej 40% HP.',
    params: { lt_combat_mana_pct: 0.6, lt_combat_hp_pct: 0.8, lt_low_mana_pct: 0.2, lt_low_hp_pct: 0.3, lt_between_mana_pct: 0.9, lt_between_hp_pct: 0.65, break_hp_pct: 0.4 },
  },
  BEST_2MOB: {
    label: 'Najlepsza, 2 moby',
    description: 'Combat: mana<50% i HP>50%; między mobami HP≥65%; przerwa poniżej 50% HP.',
    params: { lt_combat_mana_pct: 0.5, lt_combat_hp_pct: 0.5, lt_low_mana_pct: 0, lt_low_hp_pct: 0.3, lt_between_mana_pct: 0, lt_between_hp_pct: 0.65, break_hp_pct: 0.5 },
  },
  USER: { label: 'Reguła użytkownika', description: 'Pierwotna reguła: combat 60/80 i 20/30, między mobami przy pełnym HP i mana<90%, przerwa poniżej 30% HP.', params: {} },
  NO_LIFE_TAP: {
    label: 'Bez Life Tapa',
    description: 'Nigdy Life Tap; przerwa na picie przy mana<25% lub HP<30%.',
    params: { sb_filler_lifetap_when_oom: false, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0, break_hp_pct: 0.3, break_mana_pct: 0.25, drink_to_mana_pct: 1 },
  },
};
export const POLICY_IDS = Object.keys(POLICIES);

export interface Settings {
  level: number;
  profile: string;
  mobs: 1 | 2;
  policy: string;
  sessions: number;
  seed: number;
}

export const DEFAULT_SETTINGS: Settings = { level: 50, profile: 'average', mobs: 1, policy: 'BEST_1MOB', sessions: 60, seed: 1 };

/** Clamps and validates settings from the UI. */
export function normalizeSettings(s: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  return {
    level: Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(num(s.level, d.level)))),
    profile: s.profile !== undefined && PROFILE_IDS.includes(s.profile) ? s.profile : d.profile,
    mobs: s.mobs === 2 ? 2 : 1,
    policy: s.policy !== undefined && s.policy in POLICIES ? s.policy : d.policy,
    sessions: Math.min(500, Math.max(5, Math.round(num(s.sessions, d.sessions)))),
    seed: Math.round(num(s.seed, d.seed)),
  };
}

function paramsOf(s: Settings): Params {
  return loadParams(POLICIES[s.policy]?.params ?? {});
}

export type JobRequest =
  | { kind: 'ranking'; settings: Settings }
  | { kind: 'sweep'; settings: Settings; builds: readonly string[] }
  | { kind: 'duel'; settings: Settings; a: string; b: string; sweep: boolean };

export interface RankedBuild {
  metrics: CellMetrics;
  /** Paired difference of kills/h to the best build (this - best); null for the best itself. */
  vsBest: MetricDiff | null;
}
export interface RankingResult {
  kind: 'ranking';
  settings: Settings;
  rows: RankedBuild[];
}
export interface SweepResult {
  kind: 'sweep';
  settings: Settings;
  levels: number[];
  /** Kills per hour per build, one value per level. */
  series: { build: string; kph: number[] }[];
}
export interface DuelOutcome {
  kind: 'duel';
  settings: Settings;
  a: string;
  b: string;
  /** The result at the chosen level. */
  at: DuelResult;
  /** All levels 40-59 when the sweep was requested. */
  sweep: DuelResult[] | null;
}
export type JobResult = RankingResult | SweepResult | DuelOutcome;

export interface Job {
  total: number;
  /** Runs task i (0-based); outputs are plain data (cloneable). */
  run(i: number): unknown;
  assemble(outputs: unknown[]): JobResult;
}

const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);

function checkBuild(id: string): string {
  if (!VARIANT_IDS.includes(id)) throw new Error(`unknown build ${id}`);
  return id;
}

export function planJob(req: JobRequest): Job {
  const s = normalizeSettings(req.settings);
  const params = paramsOf(s);
  const cfg = (build: string, level: number) => ({ variant: loadVariant(checkBuild(build)), level, profile: s.profile, params, mobs: s.mobs });
  switch (req.kind) {
    case 'ranking':
      return {
        total: VARIANT_IDS.length,
        run: (i) => {
          const r = runCell(cfg(VARIANT_IDS[i] as string, s.level), s.sessions, s.seed);
          return { metrics: r.metrics, raw: r.raw };
        },
        assemble: (outs) => {
          const cells = outs as { metrics: CellMetrics; raw: Parameters<typeof pairedDiff>[0] }[];
          const sorted = [...cells].sort((x, y) => y.metrics.killsPerHour - x.metrics.killsPerHour);
          const best = sorted[0];
          const rows = sorted.map((c, idx): RankedBuild => ({ metrics: c.metrics, vsBest: idx === 0 || !best ? null : pairedDiff(c.raw, best.raw).killsPerHour }));
          return { kind: 'ranking', settings: s, rows };
        },
      };
    case 'sweep': {
      const builds = req.builds.map(checkBuild);
      return {
        total: builds.length * LEVELS.length,
        run: (i) => runCell(cfg(builds[Math.floor(i / LEVELS.length)] as string, LEVELS[i % LEVELS.length] as number), s.sessions, s.seed).metrics.killsPerHour,
        assemble: (outs) => ({
          kind: 'sweep',
          settings: s,
          levels: LEVELS,
          series: builds.map((build, b) => ({ build, kph: LEVELS.map((_, l) => outs[b * LEVELS.length + l] as number) })),
        }),
      };
    }
    case 'duel': {
      checkBuild(req.a);
      checkBuild(req.b);
      const levels = req.sweep ? LEVELS : [s.level];
      const o = { levels, profile: s.profile, mobs: s.mobs, sessions: s.sessions, seed: s.seed, params: POLICIES[s.policy]?.params };
      return {
        total: levels.length,
        run: (i) => duelLevel(loadVariant(req.a), loadVariant(req.b), levels[i] as number, o),
        assemble: (outs) => {
          const all = outs as DuelResult[];
          return { kind: 'duel', settings: s, a: req.a, b: req.b, at: all.find((r) => r.level === s.level) ?? (all[0] as DuelResult), sweep: req.sweep ? all : null };
        },
      };
    }
  }
}

/** Runs a whole job synchronously (tests, the CLI-style use). */
export function runJob(req: JobRequest, onProgress?: (done: number, total: number) => void): JobResult {
  const job = planJob(req);
  const outs: unknown[] = [];
  for (let i = 0; i < job.total; i++) {
    outs.push(job.run(i));
    onProgress?.(i + 1, job.total);
  }
  return job.assemble(outs);
}
