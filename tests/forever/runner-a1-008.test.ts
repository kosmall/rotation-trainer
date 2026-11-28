// A1-008: Soul Harvest left at the end of a pull is carried to the next one, but only what is still running after the walk,
// the Life Tap time beyond it, Health Funnel, the break, the demon's resummon and the death penalty.
import { describe, expect, it, vi } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import type { PullResult } from '../../src/forever/fight';
import { soulHarvest } from '../../src/forever/effects';
import { healthRegenPerSec, playerStatsFor, spiritManaRegenPerSec, walkManaRegen } from '../../src/forever/stats';

interface Call { startSoulHarvestMs: number | undefined; result: PullResult }
const calls: Call[] = [];
vi.mock('../../src/forever/fight', async (orig) => {
  const m = await orig<typeof import('../../src/forever/fight')>();
  return {
    ...m,
    simulatePull: (cfg: Parameters<typeof m.simulatePull>[0], seed: number) => {
      const result = m.simulatePull(cfg, seed);
      calls.push({ startSoulHarvestMs: cfg.startSoulHarvestMs, result });
      return result;
    },
  };
});
const { planRest, runSession } = await import('../../src/forever/runner');

const LEVEL = 59;
const variant = loadVariant('DEMO_PACT_R1');
const run = (over: Parameters<typeof loadParams>[0], seed: number) => {
  calls.length = 0;
  const params = loadParams({ session_pulls: 30, ...over });
  const s = runSession({ variant, level: LEVEL, profile: 'average', params }, seed);
  return { s, params, cs: [...calls] };
};

describe('Soul Harvest carried between pulls (A1-008)', () => {
  it('the build has Soul Harvest and it is running at the end of some pulls', () => {
    expect(soulHarvest(ranksAt(variant, LEVEL)).durationMs).toBeGreaterThan(0);
    const { cs } = run({}, 1);
    expect(cs.some((c) => c.result.soulHarvestLeftMs > 0)).toBe(true);
  });

  it('a long break leaves nothing of it', () => {
    // Every pull is followed by a drink to full mana (long), no Life Tap, no Health Funnel.
    const { s, params, cs } = run({ break_hp_pct: 1.01, eat_and_drink_together: false, drink_to_mana_pct: 1, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0, pet_funnel_below_pct: 0 }, 1);
    const ranks = ranksAt(variant, LEVEL);
    const stats = playerStatsFor(LEVEL, 'average', ranks);
    const sh = soulHarvest(ranks);
    let checked = 0;
    let carriedBefore = 0;
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied || prev.petDied) continue;
      const left = prev.soulHarvestLeftMs;
      const mana = Math.min(stats.maxMana, prev.endMana + walkManaRegen(stats.spirit, params, sh, left / 1000));
      const hp = Math.min(stats.maxHp, prev.endHp + healthRegenPerSec(stats.spirit) * params.transition_sec);
      const plan = planRest({ mana, hp, maxMana: stats.maxMana, maxHp: stats.maxHp, drinkPerSec: stats.drinkManaPerSec + (params.drink_adds_spirit_regen ? spiritManaRegenPerSec(stats.spirit) : 0), foodPerSec: stats.foodHpPerSec, params });
      const carried = cs[k]!.startSoulHarvestMs ?? 0;
      const bound = Math.max(0, left - (params.transition_sec + plan.restSec) * 1000);
      expect(carried, `pull ${k}`).toBeLessThanOrEqual(bound + 1e-6);
      if (left - params.transition_sec * 1000 > 0) carriedBefore++;
      checked++;
    }
    expect(s.breaks).toBeGreaterThan(10);
    expect(checked).toBeGreaterThan(10);
    expect(carriedBefore, 'the scenario must have Soul Harvest left after the walk').toBeGreaterThan(3);
  });

  it('a long resummon or death penalty leaves nothing of it', () => {
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { cs, params } = run({ pet_ooc_regen_pct_per_sec: 0, pet_funnel_below_pct: 0, pet_resummon_sec: 40, death_penalty_sec: 40 }, seed);
      for (let k = 1; k < cs.length; k++) {
        const prev = cs[k - 1]!.result;
        if (!prev.petDied && !prev.playerDied) continue;
        const extra = (prev.petDied ? params.pet_resummon_sec : 0) + (prev.playerDied ? params.death_penalty_sec : 0);
        const bound = Math.max(0, prev.soulHarvestLeftMs - (params.transition_sec + extra) * 1000);
        expect(cs[k]!.startSoulHarvestMs ?? 0, `seed ${seed} pull ${k}`).toBeLessThanOrEqual(bound + 1e-6);
        if (prev.soulHarvestLeftMs - params.transition_sec * 1000 > 0) checked++;
      }
    }
    expect(checked, 'the scenario must have Soul Harvest left after the walk at a resummon').toBeGreaterThan(0);
  });

  it('without anything between the pulls only the walk is taken off (unchanged)', () => {
    const { cs, params } = run({ break_hp_pct: 0, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0, pet_funnel_below_pct: 0, rest_to_mana_pct: 1 }, 1);
    let seen = 0;
    for (let k = 1; k < cs.length; k++) {
      const prev = cs[k - 1]!.result;
      if (prev.playerDied || prev.petDied) continue;
      expect(cs[k]!.startSoulHarvestMs ?? 0).toBeCloseTo(Math.max(0, prev.soulHarvestLeftMs - params.transition_sec * 1000), 6);
      if (prev.soulHarvestLeftMs > params.transition_sec * 1000) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
