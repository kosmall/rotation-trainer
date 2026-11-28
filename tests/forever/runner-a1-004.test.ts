// A1-004: after a food and water break the between-mobs Life Tap rule is evaluated again, so a pull does not start
// at full HP and low mana (the state in which the user's rule says "Life Tap now").
import { describe, expect, it, vi } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import type { PullResult } from '../../src/forever/fight';
import { rankAt } from '../../src/forever/spells';
import { lifeTapHealthCost, playerStatsFor } from '../../src/forever/stats';

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
const { runSession } = await import('../../src/forever/runner');
const { lifeTapWanted } = await import('../../src/forever/policy');

describe('Life Tap after a break (A1-004)', () => {
  it('no pull starts in a state where the between-mobs rule says to tap and a tap is affordable', () => {
    const params = loadParams({ session_pulls: 30 });
    let breaks = 0;
    let bad = 0;
    let pulls = 0;
    for (const [id, level] of [['AFF_WRACK', 40], ['AFF_WRACK', 50], ['DEMO_PACT_R1', 40]] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        calls.length = 0;
        const variant = loadVariant(id);
        const ltCost = lifeTapHealthCost(rankAt('life_tap', 'max', level)?.base ?? 0, playerStatsFor(level, 'average', ranksAt(variant, level)).spirit, params);
        const s = runSession({ variant, level, profile: 'average', params }, seed);
        breaks += s.breaks;
        for (const c of calls) {
          pulls++;
          const { maxMana, maxHp } = c.result;
          const hp = c.startHp ?? maxHp;
          const mana = c.startMana ?? maxMana;
          // the runner taps while the rule wants it, mana is below the maximum and a tap keeps HP above lt_safety_hp_pct
          if (lifeTapWanted(mana, maxMana, hp, maxHp, params, true) && mana < maxMana && hp - ltCost >= maxHp * params.lt_safety_hp_pct) bad++;
        }
      }
    }
    expect(breaks).toBeGreaterThan(10);
    expect(pulls).toBeGreaterThan(300);
    expect(bad).toBe(0);
  });
});
