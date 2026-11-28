// A1-014: a mana break (break_mana_pct > 0) with full HP and drink_to_mana_pct = 0 used to last 0 s, restore nothing and still count.
import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { planRest, runSession } from '../../src/forever/runner';

const base = { maxMana: 2000, maxHp: 1400, drinkPerSec: 30, foodPerSec: 60 };

describe('a break taken for mana drinks (A1-014)', () => {
  const params = loadParams({ break_mana_pct: 0.2, drink_to_mana_pct: 0 });
  it('with full HP the warlock drinks up to the rest target', () => {
    const plan = planRest({ ...base, mana: 200, hp: 1400, params });
    expect(plan.eatSec).toBe(0);
    expect(plan.drinkSec).toBeCloseTo((2000 - 200) / 30, 6);
    expect(plan.restSec).toBeCloseTo(plan.drinkSec, 6);
    expect(plan.mana).toBeCloseTo(2000, 6);
  });
  it('a break for low HP still drinks only while eating (unchanged)', () => {
    const plan = planRest({ ...base, mana: 200, hp: 400, params });
    expect(plan.restSec).toBeCloseTo((1400 - 400) / 60, 6);
    expect(plan.drinkSec).toBeCloseTo(plan.restSec, 6);
  });
  it('a session with a mana break and no HP break counts only breaks that restore something', () => {
    const p = loadParams({ session_pulls: 15, break_mana_pct: 0.5, break_hp_pct: 0, drink_to_mana_pct: 0, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0 });
    let breaks = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const s = runSession({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: p }, seed);
      breaks += s.breaks;
      if (s.breaks > 0) expect(s.drinkSec).toBeGreaterThan(0);
      expect(s.restSec).toBeGreaterThanOrEqual(s.breaks > 0 ? 1 : 0);
    }
    expect(breaks).toBeGreaterThan(0);
  });
});
