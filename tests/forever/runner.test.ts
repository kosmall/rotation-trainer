import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { killsPerHour, planRest, runCell, runSession, type CellConfig, type RestInput } from '../../src/forever/runner';

const rest = (over: Partial<RestInput> = {}): RestInput => ({
  mana: 200, hp: 1200, maxMana: 2000, maxHp: 1400, drinkPerSec: 30, foodPerSec: 60, gcdMs: 1500, lifeTapBase: 220, spirit: 80, ranks: {}, params: loadParams(), ...over,
});
const cell = (id: string, level = 50, params = {}): CellConfig => ({ variant: loadVariant(id), level, profile: 'average', params: loadParams({ session_pulls: 10, ...params }) });

describe('kills per hour and rest planning', () => {
  it('kills per hour is 3600 x kills / total seconds', () => {
    expect(killsPerHour(1, 36)).toBe(100);
    expect(killsPerHour(2, 72)).toBe(100);
    expect(killsPerHour(0, 0)).toBe(0);
  });
  it('Life Tap shortens the rest when eating runs alongside the drink, and counts as Life Tap time', () => {
    const withLt = planRest(rest());
    const noLt = planRest(rest({ params: loadParams({ rest_use_life_tap: false }) }));
    expect(withLt.lifeTaps).toBeGreaterThan(0);
    expect(withLt.restSec).toBeLessThan(noLt.restSec);
    expect(withLt.lifeTapSec).toBeCloseTo(withLt.lifeTaps * 1.5, 6);
    expect(noLt.lifeTaps).toBe(0);
  });
  it('Life Tap stops at the HP floor', () => {
    const plan = planRest(rest({ hp: 800, maxHp: 1400 }));
    expect(plan.hp).toBeGreaterThanOrEqual(1400 * 0.9 - 1e-6);
    const lowHp = planRest(rest({ hp: 400 }));
    expect(lowHp.lifeTaps).toBe(0);
  });
  it('eating and drinking one after the other takes longer than together', () => {
    const together = planRest(rest({ params: loadParams({ rest_use_life_tap: false }) }));
    const apart = planRest(rest({ params: loadParams({ rest_use_life_tap: false, eat_and_drink_together: false }) }));
    expect(apart.restSec).toBeGreaterThan(together.restSec);
  });
  it('no regen at all returns a finite capped rest instead of looping', () => {
    const plan = planRest(rest({ drinkPerSec: 0, foodPerSec: 0, params: loadParams({ rest_use_life_tap: false }) }));
    expect(Number.isFinite(plan.restSec)).toBe(true);
    expect(plan.restSec).toBeLessThanOrEqual(600);
  });
});

describe('sessions and cells', () => {
  it('a session has the configured number of pulls and its time adds up', () => {
    const s = runSession(cell('AFF_WRACK'), 1);
    expect(s.pulls).toBe(10);
    expect(s.totalSec).toBeCloseTo(s.pullSec + s.restSec + s.transitionSec + s.resummonSec + s.deathSec, 6);
    expect(s.pullsWithoutBreak + s.breaks).toBe(10);
  });
  it('runCell is deterministic for the same seed and differs for another', () => {
    const a = runCell(cell('AFF_WRACK'), 5, 7).metrics;
    const b = runCell(cell('AFF_WRACK'), 5, 7).metrics;
    const c = runCell(cell('AFF_WRACK'), 5, 8).metrics;
    expect(a).toEqual(b);
    expect(a.killsPerHour).not.toBe(c.killsPerHour);
  });
  it('3 mobs per pull cost more mana per pull than 1', () => {
    const one = runCell({ ...cell('AFF_WRACK'), mobs: 1 }, 6, 1).raw.reduce((a, s) => a + s.manaSpent / s.pulls, 0);
    const three = runCell({ ...cell('AFF_WRACK'), mobs: 3 }, 6, 1).raw.reduce((a, s) => a + s.manaSpent / s.pulls, 0);
    expect(three).toBeGreaterThan(one);
  });
  it('a longer transition lowers kills per hour', () => {
    const fast = runCell(cell('AFF_WRACK', 50, { transition_sec: 2 }), 6, 1).metrics.killsPerHour;
    const slow = runCell(cell('AFF_WRACK', 50, { transition_sec: 20 }), 6, 1).metrics.killsPerHour;
    expect(fast).toBeGreaterThan(slow);
  });
  it('metrics are finite and sensible', () => {
    const m = runCell(cell('DEMO_PACT_R1'), 6, 1).metrics;
    for (const v of Object.values(m)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    expect(m.killsPerHour).toBeGreaterThan(50);
    expect(m.gcdUtil).toBeGreaterThan(0.5);
    expect(m.gcdUtil).toBeLessThanOrEqual(1.05);
    expect(m.downtimeShare).toBeGreaterThanOrEqual(0);
    expect(m.downtimeShare).toBeLessThan(1);
  });
});
