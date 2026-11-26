// Sessions of consecutive pulls with carried mana/HP, rest breaks (Life Tap, drink, eat), and the
// aggregated per-cell metrics (build x level x gear profile) including kills per hour.

import { ranksAt, type BuildVariant, type PicksOptions } from './builds';
import { simulatePull, type PullConfig } from './fight';
import { rankAt } from './spells';
import { soulHarvest } from './effects';
import { lifeTapWanted, needsBreak } from './policy';
import { gcdMs, healthRegenPerSec, lifeTapGain, lifeTapHealthCost, playerStatsFor, spiritManaRegenPerSec } from './stats';
import type { DataRotation } from './rotation-spec';
import type { Ranks } from './talents';
import type { Params, StatDelta } from './types';

export interface CellConfig {
  variant: BuildVariant;
  level: number;
  profile: string;
  params: Params;
  mobs?: 1 | 2 | 3;
  /** Talent ranks override (optimizer); default: the variant's picks at the level (see `picks`). */
  ranks?: Ranks;
  picks?: PicksOptions;
  /** A rotation given as data (build discovery); default: the variant's built-in rotation code. */
  rotation?: DataRotation;
  /** Extra stats on top of the gear profile (equivalency points). */
  statDelta?: StatDelta;
}

export interface RestInput {
  mana: number;
  hp: number;
  maxMana: number;
  maxHp: number;
  drinkPerSec: number;
  foodPerSec: number;
  params: Params;
}

export interface RestPlan {
  drinkSec: number;
  eatSec: number;
  restSec: number;
  mana: number;
  hp: number;
}

const REST_CAP_SEC = 600;

/**
 * A food and water break (only taken when HP is below `break_hp_pct`): eat until HP is full. With
 * `eat_and_drink_together` the warlock drinks only while eating (as little as possible; Life Tap
 * fills the rest of the mana afterwards); otherwise he also drinks to `rest_to_mana_pct`.
 */
export function planRest(i: RestInput): RestPlan {
  const p = i.params;
  const targetMana = i.maxMana * (p.drink_to_mana_pct > 0 ? p.drink_to_mana_pct : p.rest_to_mana_pct);
  const targetHp = i.maxHp * p.rest_to_hp_pct;
  const eatSec = i.hp >= targetHp ? 0 : i.foodPerSec > 0 ? Math.min(REST_CAP_SEC, (targetHp - i.hp) / i.foodPerSec) : REST_CAP_SEC;
  const needDrink = i.mana >= targetMana ? 0 : i.drinkPerSec > 0 ? Math.min(REST_CAP_SEC, (targetMana - i.mana) / i.drinkPerSec) : REST_CAP_SEC;
  let drinkSec: number;
  let restSec: number;
  if (!p.eat_and_drink_together) {
    drinkSec = needDrink;
    restSec = eatSec + drinkSec;
  } else if (p.drink_to_mana_pct > 0) {
    drinkSec = needDrink;
    restSec = Math.max(eatSec, drinkSec);
  } else {
    drinkSec = Math.min(needDrink, eatSec);
    restSec = eatSec;
  }
  return { eatSec, drinkSec, restSec, mana: Math.min(i.maxMana, i.mana + i.drinkPerSec * drinkSec), hp: Math.max(i.hp, targetHp) };
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
  eurekaUses: number;
}

export function killsPerHour(kills: number, totalSec: number): number {
  return totalSec > 0 ? (3600 * kills) / totalSec : 0;
}

export function runSession(cfg: CellConfig, seed: number): SessionResult {
  const { variant, level, params } = cfg;
  const ranks = cfg.ranks ?? ranksAt(variant, level, cfg.picks);
  const stats = playerStatsFor(level, cfg.profile, ranks, cfg.statDelta);
  const gcd = gcdMs(params.haste_pct, params);
  const ltRank = rankAt('life_tap', 'max', level);
  const out: SessionResult = {
    seed, totalSec: 0, kills: 0, pulls: 0, pullSec: 0, restSec: 0, drinkSec: 0, eatSec: 0, lifeTapSec: 0, transitionSec: 0, resummonSec: 0, deathSec: 0, breaks: 0,
    pullsWithoutBreak: 0, deaths: 0, petDeaths: 0, manaSpent: 0, manaFromLifeTap: 0, damageTaken: 0, healed: 0, gcdBusyMs: 0, castWasteMs: 0, castCount: 0, ttkPerMob: [],
    threatSwitches: 0, timeouts: 0, eurekaUses: 0,
  };
  let mana = stats.maxMana * params.rest_to_mana_pct;
  let hp = stats.maxHp * params.rest_to_hp_pct;
  const pull: PullConfig = { variant, level, profile: cfg.profile, params, mobs: cfg.mobs, ranks, statDelta: cfg.statDelta, ...(cfg.rotation ? { rotation: cfg.rotation } : {}) };
  const ltCost = ltRank ? lifeTapHealthCost(ltRank.base ?? 0, stats.spirit, params) : 0;
  let shCarryMs = 0;
  // Gnome Eureka!: cooldown and buff left, as they were when the last pull ended; the time since then is taken off at the next pull.
  let eurekaCdMs = 0;
  let eurekaBuffMs = 0;
  let lastPullEndSec = 0;
  const shBonus = soulHarvest(ranks).bonus;
  const ltGain = ltRank ? lifeTapGain(ltRank.base ?? 0, stats.spirit, ranks, params) : 0;
  for (let i = 0; i < params.session_pulls; i++) {
    // Between mobs: Life Tap by the rules first (it spends HP), then food and water if HP is below the break threshold.
    let taps = 0;
    while (ltRank && taps < 40 && mana < stats.maxMana && hp - ltCost >= stats.maxHp * params.lt_safety_hp_pct && lifeTapWanted(mana, stats.maxMana, hp, stats.maxHp, params, true)) {
      const got = Math.min(ltGain, stats.maxMana - mana);
      mana += got;
      hp -= ltCost;
      out.manaFromLifeTap += got;
      taps++;
    }
    if (taps > 0) {
      // Life Tap is instant: casting it on the way to the next mob costs no extra time while the walk lasts.
      const tapSec = (taps * gcd) / 1000;
      const paid = Math.max(0, tapSec - params.transition_sec);
      out.lifeTapSec += tapSec;
      out.restSec += paid;
      out.totalSec += paid;
    }
    if (needsBreak(hp, stats.maxHp, params, mana, stats.maxMana)) {
      const plan = planRest({ mana, hp, maxMana: stats.maxMana, maxHp: stats.maxHp, drinkPerSec: stats.drinkManaPerSec + (params.drink_adds_spirit_regen ? spiritManaRegenPerSec(stats.spirit) : 0), foodPerSec: stats.foodHpPerSec, params });
      mana = plan.mana;
      hp = plan.hp;
      out.restSec += plan.restSec;
      out.drinkSec += plan.drinkSec;
      out.eatSec += plan.eatSec;
      out.breaks++;
      out.totalSec += plan.restSec;
    } else out.pullsWithoutBreak++;
    const gapMs = (out.totalSec - lastPullEndSec) * 1000;
    const r = simulatePull(
      { ...pull, startMana: mana, startHp: hp, startSoulHarvestMs: shCarryMs, startEurekaCdMs: Math.max(0, eurekaCdMs - gapMs), startEurekaBuffMs: Math.max(0, eurekaBuffMs - gapMs) },
      seed * 100003 + i,
    );
    out.eurekaUses += r.eurekaUses;
    eurekaCdMs = r.eurekaCdLeftMs;
    eurekaBuffMs = r.eurekaBuffLeftMs;
    out.pulls++;
    out.kills += r.mobsKilled;
    out.pullSec += r.pullSec;
    out.totalSec += r.pullSec;
    lastPullEndSec = out.totalSec;
    out.manaSpent += r.manaSpent;
    out.manaFromLifeTap += r.manaFromLifeTap;
    out.lifeTapSec += (r.lifeTapCount * gcd) / 1000;
    out.damageTaken += r.damageTaken;
    out.healed += r.healed;
    out.gcdBusyMs += r.gcdBusyMs;
    out.castWasteMs += r.castWasteMs;
    out.castCount += r.castCount;
    out.threatSwitches += r.threatSwitches;
    if (r.timedOut) out.timeouts++;
    if (r.mobsKilled > 0) out.ttkPerMob.push(r.pullSec / r.mobsKilled);
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
    // Soul Harvest keeps running after the kill: doubled regeneration on the way to the next mob.
    const boosted = Math.min(r.soulHarvestLeftMs / 1000, params.transition_sec);
    shCarryMs = Math.max(0, r.soulHarvestLeftMs - params.transition_sec * 1000);
    // Spirit mana regeneration resumes `fsr_sec` after the last cast (Classic five-second rule); health regenerates out of combat.
    const regenSec = Math.max(0, params.transition_sec - params.fsr_sec);
    mana = Math.min(stats.maxMana, mana + spiritManaRegenPerSec(stats.spirit) * (regenSec + shBonus * Math.min(boosted, regenSec)));
    hp = Math.min(stats.maxHp, hp + healthRegenPerSec(stats.spirit) * params.transition_sec);
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
  eurekaPerHour: number;
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
    eurekaPerHour: total > 0 ? (3600 * sum((s) => s.eurekaUses)) / total : 0,
  };
}

/** Runs `sessions` sessions (seeds seed+1..seed+n) and aggregates; `raw` keeps them for paired duels. */
export function runCell(cfg: CellConfig, sessions: number, seed: number): { metrics: CellMetrics; raw: SessionResult[] } {
  const raw: SessionResult[] = [];
  for (let i = 1; i <= sessions; i++) raw.push(runSession(cfg, seed + i));
  return { metrics: aggregate(cfg, raw), raw };
}
