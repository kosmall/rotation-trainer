// Sensitivity analysis: how the ranking of builds (by kills per hour) changes when one
// assumption flagged verify:true takes other plausible values.

import { VARIANT_IDS } from './builds';
import { compareBuilds } from './compare';
import type { Params } from './types';

export interface SensitivityAxis {
  param: keyof Params;
  values: (number | string | boolean)[];
  note: string;
}

export const DEFAULT_AXES: SensitivityAxis[] = [
  { param: 'downrank_penalty_model', values: ['none', 'classic', 'partial'], note: 'penalty on the spell power coefficient of low spell levels (Shadow Bolt rank 1 and 2)' },
  { param: 'sb_r1_coeff_mult', values: [0.5, 1, 1.5], note: 'spell power coefficient of Shadow Bolt rank 1' },
  { param: 'sb_r2_coeff_mult', values: [0.5, 1, 1.5], note: 'spell power coefficient of Shadow Bolt rank 2' },
  { param: 'mob_hp_mult', values: [0.8, 1, 1.25], note: 'normal mob HP' },
  { param: 'mob_dmg_mult', values: [0.8, 1, 1.25], note: 'normal mob damage' },
  { param: 'brand_scale', values: ['fixed_60', 'level_scaled'], note: 'Demonic Brand scaling with level' },
  { param: 'brand_mult', values: [0.5, 1, 1.5], note: 'Demonic Brand damage' },
  { param: 'wrack_dmg_mult', values: [0.7, 1, 1.5, 2, 3], note: 'placeholder Wrack damage (Wowhead data missing)' },
  { param: 'drain_dmg_mult', values: [0.7, 1, 1.3], note: 'Drain Life / Drain Soul damage' },
  { param: 'pet_dmg_mult', values: [0.7, 1, 1.3], note: 'pet damage tables' },
  { param: 'use_drain_soul_finisher', values: [true, false], note: 'Drain Soul finisher for Soul Harvest on/off' },
  { param: 'break_hp_pct', values: [0.2, 0.3, 0.4], note: 'HP below which the warlock stops for food and water' },
  { param: 'agony_ramp', values: ['classic_thirds', 'flat'], note: 'shape of Bane of Agony damage over its 24 s (Forever ramp unconfirmed)' },
  { param: 'life_tap_mana_per_health', values: [1, 1.2], note: 'Life Tap conversion ratio (wiki 1.0, one guide 1.2)' },
  { param: 'life_tap_spirit_coeff', values: [0.5, 1, 1.5], note: 'Spirit scaling of Life Tap (formula not published)' },
  { param: 'searing_pain_threat_mult', values: [1, 2, 3], note: 'Searing Pain threat (Brand halves it)' },
  { param: 'mob_miss_pct', values: [3, 4], note: 'spell miss chance vs a same-level mob (Method.gg 4%, Warcraft Tavern 3%)' },
  { param: 'transition_sec', values: [4, 8, 15], note: 'time between pulls' },
  { param: 'mobs_per_pull', values: [1, 2, 3], note: 'mobs per pull' },
];

export interface SensitivityRow {
  param: string;
  value: string;
  note: string;
  /** Builds sorted by kills per hour, best first, per level. */
  ranking: Record<number, string[]>;
  kph: Record<number, Record<string, number>>;
  /** Levels at which the winner differs from the base run. */
  winnerChangedAt: number[];
}

export interface SensitivityReport {
  levels: number[];
  profile: string;
  baseWinners: Record<number, string>;
  baseKph: Record<number, Record<string, number>>;
  rows: SensitivityRow[];
  /** Parameters for which some value changes the winner at some level. */
  winnerFlippers: string[];
}

export interface SensitivityOptions {
  levels: number[];
  profile: string;
  sessions: number;
  seed: number;
  axes?: SensitivityAxis[];
  builds?: readonly string[];
  baseParams?: Partial<Params>;
}

function rank(rows: ReturnType<typeof compareBuilds>, levels: number[]): { ranking: Record<number, string[]>; kph: Record<number, Record<string, number>> } {
  const ranking: Record<number, string[]> = {};
  const kph: Record<number, Record<string, number>> = {};
  for (const level of levels) {
    const at = rows.filter((r) => r.level === level).sort((a, b) => b.killsPerHour - a.killsPerHour);
    ranking[level] = at.map((r) => r.variant);
    kph[level] = Object.fromEntries(at.map((r) => [r.variant, r.killsPerHour]));
  }
  return { ranking, kph };
}

export function sensitivity(o: SensitivityOptions): SensitivityReport {
  const builds = o.builds ?? VARIANT_IDS;
  const run = (extra: Partial<Params>) => rank(compareBuilds({ levels: o.levels, profiles: [o.profile], sessions: o.sessions, seed: o.seed, params: { ...o.baseParams, ...extra }, builds }), o.levels);
  const base = run({});
  const baseWinners = Object.fromEntries(o.levels.map((l) => [l, (base.ranking[l] as string[])[0] as string]));
  const rows: SensitivityRow[] = [];
  for (const axis of o.axes ?? DEFAULT_AXES) {
    for (const value of axis.values) {
      const r = run({ [axis.param]: value } as Partial<Params>);
      rows.push({
        param: axis.param, value: String(value), note: axis.note, ranking: r.ranking, kph: r.kph,
        winnerChangedAt: o.levels.filter((l) => (r.ranking[l] as string[])[0] !== baseWinners[l]),
      });
    }
  }
  const winnerFlippers = [...new Set(rows.filter((r) => r.winnerChangedAt.length > 0).map((r) => r.param))];
  return { levels: o.levels, profile: o.profile, baseWinners, baseKph: base.kph, rows, winnerFlippers };
}

export function renderSensitivity(rep: SensitivityReport): string {
  const out: string[] = [`Gear profile: ${rep.profile}. Base winners: ${rep.levels.map((l) => `${l}: ${rep.baseWinners[l]}`).join(', ')}`, ''];
  out.push('| Parameter | Value | ' + rep.levels.map((l) => `Best @${l}`).join(' | ') + ' | Winner changes at |', '|---|---|' + rep.levels.map(() => '---|').join('') + '---|');
  for (const r of rep.rows)
    out.push(`| ${r.param} | ${r.value} | ${rep.levels.map((l) => (r.ranking[l] as string[])[0]).join(' | ')} | ${r.winnerChangedAt.length ? r.winnerChangedAt.join(', ') : '-'} |`);
  out.push('', rep.winnerFlippers.length ? `Assumptions that can change the winner: ${rep.winnerFlippers.join(', ')}.` : 'No tested assumption changes the winner at the tested levels.');
  return out.join('\n');
}
