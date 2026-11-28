// A1-003: Demonic Sacrifice (Voidwalker 2% mana per 4 s, Felhunter 3% health per 4 s) also regenerates on the walk between pulls
// and during a food and water break, not only inside the fight.
import { describe, expect, it, vi } from 'vitest';
import { loadVariant, ranksAt, type BuildVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import type { PullResult } from '../../src/forever/fight';
import { effectNum, soulHarvest } from '../../src/forever/effects';
import { healthRegenPerSec, playerStatsFor, spiritManaRegenPerSec, walkManaRegen } from '../../src/forever/stats';

interface Call { startMana: number | undefined; startHp: number | undefined; result: PullResult }
const calls: Call[] = [];
vi.mock('../../src/forever/fight', async (orig) => {
  const m = await orig<typeof import('../../src/forever/fight')>();
  return {
    ...m,
    simulatePull: (cfg: Parameters<typeof m.simulatePull>[0], seed: number) => {
      const result = m.simulatePull(cfg, seed);
      calls.push({ startMana: cfg.startMana, startHp: cfg.startHp, result });
      return result;
    },
  };
});
const { planRest, runSession } = await import('../../src/forever/runner');

const LEVEL = 50;
const sacrificing = (demon: 'voidwalker' | 'felhunter'): BuildVariant => ({ ...loadVariant('AFF_WRACK'), pet: null, sacrificed: demon, pet_rules: undefined });
const noTaps = { lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0, sb_filler_lifetap_when_oom: false, pet_funnel_below_pct: 0 };
const run = (variant: BuildVariant, over: Parameters<typeof loadParams>[0], seed = 1) => {
  calls.length = 0;
  const params = loadParams({ session_pulls: 30, ...over });
  const ranks = { ...ranksAt(variant, LEVEL), demonic_sacrifice: 1 };
  const s = runSession({ variant, level: LEVEL, profile: 'average', params, ranks }, seed);
  const stats = playerStatsFor(LEVEL, 'average', ranks);
  return { s, params, ranks, stats, cs: [...calls] };
};

describe('Demonic Sacrifice regeneration out of combat (A1-003)', () => {
  it('Voidwalker: 2% of the mana per 4 s also on the walk', () => {
    const { params, ranks, stats, cs } = run(sacrificing('voidwalker'), { ...noTaps, break_hp_pct: 0 });
    const sac = (effectNum('demonic_sacrifice', 'voidwalkerManaPctPer4s') * stats.maxMana) / 4;
    const sh = soulHarvest(ranks);
    let checked = 0;
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied) continue;
      const expected = prev.endMana + walkManaRegen(stats.spirit, params, sh, prev.soulHarvestLeftMs / 1000) + sac * params.transition_sec;
      if (expected >= stats.maxMana - 1) continue;
      expect(cs[k]!.startMana, `pull ${k}`).toBeCloseTo(expected, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('Felhunter: 3% of the health per 4 s also on the walk', () => {
    const { params, stats, cs } = run(sacrificing('felhunter'), { ...noTaps, break_hp_pct: 0 });
    const sac = (effectNum('demonic_sacrifice', 'felhunterHealPctPer4s') * stats.maxHp) / 4;
    let checked = 0;
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied) continue;
      const expected = prev.endHp + (healthRegenPerSec(stats.spirit) + sac) * params.transition_sec;
      if (expected >= stats.maxHp - 1) continue;
      expect(cs[k]!.startHp, `pull ${k}`).toBeCloseTo(expected, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('Voidwalker: the mana regenerates during a break as well', () => {
    // Every pull is followed by a break that eats and drinks together (the drink stops with the meal), no Life Tap.
    const { params, ranks, stats, cs } = run(sacrificing('voidwalker'), { ...noTaps, break_hp_pct: 1.01, drink_to_mana_pct: 0, rest_to_hp_pct: 1 });
    const sac = (effectNum('demonic_sacrifice', 'voidwalkerManaPctPer4s') * stats.maxMana) / 4;
    const sh = soulHarvest(ranks);
    let checked = 0;
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied) continue;
      const walked = Math.min(stats.maxMana, prev.endMana + walkManaRegen(stats.spirit, params, sh, prev.soulHarvestLeftMs / 1000) + sac * params.transition_sec);
      const hp = Math.min(stats.maxHp, prev.endHp + healthRegenPerSec(stats.spirit) * params.transition_sec);
      const plan = planRest({ mana: walked, hp, maxMana: stats.maxMana, maxHp: stats.maxHp, drinkPerSec: stats.drinkManaPerSec + (params.drink_adds_spirit_regen ? spiritManaRegenPerSec(stats.spirit) : 0), foodPerSec: stats.foodHpPerSec, params });
      if (plan.restSec <= 0) continue;
      const expected = Math.min(stats.maxMana, plan.mana + sac * plan.restSec);
      expect(cs[k]!.startMana, `pull ${k}`).toBeCloseTo(expected, 6);
      if (expected < stats.maxMana - 1) checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('a build that did not sacrifice a Voidwalker or Felhunter gets nothing extra', () => {
    const imp = { ...loadVariant('AFF_WRACK'), pet: null, sacrificed: 'imp' as const, pet_rules: undefined };
    const { params, ranks, stats, cs } = run(imp, { ...noTaps, break_hp_pct: 0 });
    const sh = soulHarvest(ranks);
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied) continue;
      const expected = Math.min(stats.maxMana, prev.endMana + walkManaRegen(stats.spirit, params, sh, prev.soulHarvestLeftMs / 1000));
      expect(cs[k]!.startMana, `pull ${k}`).toBeCloseTo(expected, 6);
    }
  });
});
