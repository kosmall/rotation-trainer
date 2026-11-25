// Sessions of consecutive pulls with carried mana/HP, rest breaks (Life Tap, drink, eat), and the
// aggregated per-cell metrics (build x level x gear profile) including kills per hour.

import { ranksAt, type BuildVariant, type PicksOptions } from './builds';
import { simulatePull, type PullConfig } from './fight';
import { rankAt } from './spells';
import { gcdMs, lifeTapGain, lifeTapHealthCost, playerStatsFor } from './stats';
import type { Ranks } from './talents';
import type { Params } from './types';

export interface CellConfig {
  variant: BuildVariant;
  level: number;
  profile: string;
  params: Params;
  mobs?: 1 | 2 | 3;
  /** Talent ranks override (optimizer); default: the variant's picks at the level (see `picks`). */
  ranks?: Ranks;
  picks?: PicksOptions;
}

export interface RestInput {
  mana: number;
  hp: number;
  maxMana: number;
  maxHp: number;
  drinkPerSec: number;
  foodPerSec: number;
  gcdMs: number;
  lifeTapBase: number | null;
  spirit: number;
  ranks: Ranks;
  params: Params;
}

export interface RestPlan {
  lifeTaps: number;
  lifeTapSec: number;
  drinkSec: number;
  eatSec: number;
  restSec: number;
  mana: number;
  hp: number;
}

const REST_CAP_SEC = 600;

/**
 * Plans one rest: Life Tap while it shortens the total (HP from Life Tap is eaten back at the same
 * time as the drink), then drink and eat (together or one after the other).
 */
export function planRest(i: RestInput): RestPlan {
  const p = i.params;
  const targetMana = i.maxMana * p.rest_to_mana_pct;
  const targetHp = i.maxHp * p.rest_to_hp_pct;
  const drinkT = (m: number): number => (m >= targetMana ? 0 : i.drinkPerSec > 0 ? Math.min(REST_CAP_SEC, (targetMana - m) / i.drinkPerSec) : REST_CAP_SEC);
  const eatT = (h: number): number => (h >= targetHp ? 0 : i.foodPerSec > 0 ? Math.min(REST_CAP_SEC, (targetHp - h) / i.foodPerSec) : REST_CAP_SEC);
  const total = (m: number, h: number, lt: number): number => (lt * i.gcdMs) / 1000 + (p.eat_and_drink_together ? Math.max(drinkT(m), eatT(h)) : drinkT(m) + eatT(h));
  let { mana, hp } = i;
  let lt = 0;
  if (p.rest_use_life_tap && i.lifeTapBase !== null) {
    const gain = lifeTapGain(i.lifeTapBase, i.spirit, i.ranks, p);
    const cost = lifeTapHealthCost(i.lifeTapBase, i.spirit, p);
    for (let guard = 0; guard < 60; guard++) {
      if (mana >= targetMana || hp - cost < i.maxHp * p.rest_life_tap_hp_floor) break;
      const nm = Math.min(i.maxMana, mana + gain);
      const nh = hp - cost;
      if (total(nm, nh, lt + 1) < total(mana, hp, lt) - 1e-6) {
        mana = nm;
        hp = nh;
        lt++;
      } else break;
    }
  }
  const drinkSec = drinkT(mana);
  const eatSec = eatT(hp);
  const lifeTapSec = (lt * i.gcdMs) / 1000;
  const restSec = lifeTapSec + (p.eat_and_drink_together ? Math.max(drinkSec, eatSec) : drinkSec + eatSec);
  return { lifeTaps: lt, lifeTapSec, drinkSec, eatSec, restSec, mana: Math.max(mana, targetMana), hp: Math.max(hp, targetHp) };
}

export interface SessionResult {
  seed: number;
  totalSec: number;
  kills: number;
  pulls: number;
  pullSec: number;
  restSec: number;
  drinkSec: number;
  eatSec: number;
  lifeTapSec: number;
  transitionSec: number;
  resummonSec: number;
  deathSec: number;
  breaks: number;
  pullsWithoutBreak: number;
  deaths: number;
  petDeaths: number;
  manaSpent: number;
  manaFromLifeTap: number;
  damageTaken: number;
  healed: number;
  gcdBusyMs: number;
  castWasteMs: number;
  castCount: number;
  ttkPerMob: number[];
  threatSwitches: number;
  timeouts: number;
}

export function killsPerHour(kills: number, totalSec: number): number {
  return totalSec > 0 ? (3600 * kills) / totalSec : 0;
}

export function runSession(cfg: CellConfig, seed: number): SessionResult {
  const { variant, level, params } = cfg;
  const ranks = cfg.ranks ?? ranksAt(variant, level, cfg.picks);
  const stats = playerStatsFor(level, cfg.profile, ranks);
  const gcd = gcdMs(params.haste_pct, params);
  const ltRank = rankAt('life_tap', 'max', level);
  const out: SessionResult = {
    seed, totalSec: 0, kills: 0, pulls: 0, pullSec: 0, restSec: 0, drinkSec: 0, eatSec: 0, lifeTapSec: 0, transitionSec: 0, resummonSec: 0, deathSec: 0, breaks: 0,
    pullsWithoutBreak: 0, deaths: 0, petDeaths: 0, manaSpent: 0, manaFromLifeTap: 0, damageTaken: 0, healed: 0, gcdBusyMs: 0, castWasteMs: 0, castCount: 0, ttkPerMob: [],
    threatSwitches: 0, timeouts: 0,
  };
  let mana = stats.maxMana * params.rest_to_mana_pct;
  let hp = stats.maxHp * params.rest_to_hp_pct;
  const pull: PullConfig = { variant, level, profile: cfg.profile, params, mobs: cfg.mobs, ranks };
  let manaUsedSum = 0;
  let hpUsedSum = 0;
  for (let i = 0; i < params.session_pulls; i++) {
    const seen = out.pulls;
    const manaReserve = seen > 0 ? Math.max(0.15 * stats.maxMana, params.pull_reserve_factor * (manaUsedSum / seen)) : params.pull_min_mana_pct * stats.maxMana;
    const hpReserve = seen > 0 ? Math.max(0.3 * stats.maxHp, 2 * (hpUsedSum / seen)) : params.pull_min_hp_pct * stats.maxHp;
    if (mana < manaReserve || hp < hpReserve) {
      const plan = planRest({ mana, hp, maxMana: stats.maxMana, maxHp: stats.maxHp, drinkPerSec: stats.drinkManaPerSec + stats.spirit * params.spirit_regen_per_spirit, foodPerSec: stats.foodHpPerSec, gcdMs: gcd, lifeTapBase: ltRank?.base ?? null, spirit: stats.spirit, ranks, params });
      mana = plan.mana;
      hp = plan.hp;
      out.restSec += plan.restSec;
      out.drinkSec += plan.drinkSec;
      out.eatSec += plan.eatSec;
      out.lifeTapSec += plan.lifeTapSec;
      out.breaks++;
      out.totalSec += plan.restSec;
    } else out.pullsWithoutBreak++;
    const r = simulatePull({ ...pull, startMana: mana, startHp: hp }, seed * 100003 + i);
    out.pulls++;
    out.kills += r.mobsKilled;
    out.pullSec += r.pullSec;
    out.totalSec += r.pullSec;
    out.manaSpent += r.manaSpent;
    out.manaFromLifeTap += r.manaFromLifeTap;
    out.damageTaken += r.damageTaken;
    out.healed += r.healed;
    out.gcdBusyMs += r.gcdBusyMs;
    out.castWasteMs += r.castWasteMs;
    out.castCount += r.castCount;
    out.threatSwitches += r.threatSwitches;
    if (r.timedOut) out.timeouts++;
    if (r.mobsKilled > 0) out.ttkPerMob.push(r.pullSec / r.mobsKilled);
    manaUsedSum += Math.max(0, r.startMana - r.endMana);
    hpUsedSum += Math.max(0, r.startHp - r.endHp);
    mana = r.endMana;
    hp = r.endHp;
    if (r.playerDied) {
      out.deaths++;
      out.deathSec += params.death_penalty_sec;
      out.totalSec += params.death_penalty_sec;
      mana = stats.maxMana * params.rest_to_mana_pct;
      hp = stats.maxHp * params.rest_to_hp_pct;
    }
    if (r.petDied) {
      out.petDeaths++;
      out.resummonSec += params.pet_resummon_sec;
      out.totalSec += params.pet_resummon_sec;
    }
    out.transitionSec += params.transition_sec;
    out.totalSec += params.transition_sec;
    mana = Math.min(stats.maxMana, mana + stats.spirit * params.spirit_regen_per_spirit * params.transition_sec);
  }
  return out;
}

export interface CellMetrics {
  variant: string;
  level: number;
  profile: string;
  sessions: number;
  kills: number;
  killsPerHour: number;
  killsPerHourStd: number;
  ttkMean: number;
  ttkStd: number;
  manaPerKill: number;
  netManaPerKill: number;
  hpPerKill: number;
  drinkSecPerKill: number;
  eatSecPerKill: number;
  lifeTapSecPerKill: number;
  restSecPerKill: number;
  downtimeShare: number;
  breaksPerHour: number;
  killsPerBreak: number;
  breakFreePullPct: number;
  gcdUtil: number;
  gcdWasteSecPerKill: number;
  gcdWasteShare: number;
  deathsPerHour: number;
  petDeathsPerHour: number;
  threatSwitchesPerKill: number;
  timeoutPct: number;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const std = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export function aggregate(cfg: CellConfig, sessions: readonly SessionResult[]): CellMetrics {
  const sum = (f: (s: SessionResult) => number): number => sessions.reduce((a, s) => a + f(s), 0);
  const kills = sum((s) => s.kills);
  const total = sum((s) => s.totalSec);
  const pulls = sum((s) => s.pulls);
  const perKill = (x: number): number => (kills > 0 ? x / kills : 0);
  const downtime = sum((s) => s.restSec + s.resummonSec + s.deathSec);
  const ttks = sessions.flatMap((s) => s.ttkPerMob);
  return {
    variant: cfg.variant.id, level: cfg.level, profile: cfg.profile, sessions: sessions.length, kills,
    killsPerHour: killsPerHour(kills, total),
    killsPerHourStd: std(sessions.map((s) => killsPerHour(s.kills, s.totalSec))),
    ttkMean: perKill(sum((s) => s.pullSec)),
    ttkStd: std(ttks),
    manaPerKill: perKill(sum((s) => s.manaSpent)),
    netManaPerKill: perKill(sum((s) => s.manaSpent - s.manaFromLifeTap)),
    hpPerKill: perKill(sum((s) => s.damageTaken - s.healed)),
    drinkSecPerKill: perKill(sum((s) => s.drinkSec)),
    eatSecPerKill: perKill(sum((s) => s.eatSec)),
    lifeTapSecPerKill: perKill(sum((s) => s.lifeTapSec)),
    restSecPerKill: perKill(sum((s) => s.restSec)),
    downtimeShare: total > 0 ? downtime / total : 0,
    breaksPerHour: total > 0 ? (3600 * sum((s) => s.breaks)) / total : 0,
    killsPerBreak: sum((s) => s.breaks) > 0 ? kills / sum((s) => s.breaks) : kills,
    breakFreePullPct: pulls > 0 ? (100 * sum((s) => s.pullsWithoutBreak)) / pulls : 0,
    gcdUtil: sum((s) => s.pullSec) > 0 ? sum((s) => s.gcdBusyMs) / 1000 / sum((s) => s.pullSec) : 0,
    gcdWasteSecPerKill: perKill(sum((s) => s.castWasteMs) / 1000),
    gcdWasteShare: sum((s) => s.gcdBusyMs) > 0 ? sum((s) => s.castWasteMs) / sum((s) => s.gcdBusyMs) : 0,
    deathsPerHour: total > 0 ? (3600 * sum((s) => s.deaths)) / total : 0,
    petDeathsPerHour: total > 0 ? (3600 * sum((s) => s.petDeaths)) / total : 0,
    threatSwitchesPerKill: perKill(sum((s) => s.threatSwitches)),
    timeoutPct: pulls > 0 ? (100 * sum((s) => s.timeouts)) / pulls : 0,
  };
}

/** Runs `sessions` sessions (seeds seed+1..seed+n) and aggregates; `raw` keeps them for paired duels. */
export function runCell(cfg: CellConfig, sessions: number, seed: number): { metrics: CellMetrics; raw: SessionResult[] } {
  const raw: SessionResult[] = [];
  for (let i = 1; i <= sessions; i++) raw.push(runSession(cfg, seed + i));
  return { metrics: aggregate(cfg, raw), raw };
}
