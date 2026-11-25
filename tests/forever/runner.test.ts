import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { killsPerHour, planRest, runCell, runSession, type CellConfig, type RestInput } from '../../src/forever/runner';

const rest = (over: Partial<RestInput> = {}): RestInput => ({
  mana: 200, hp: 400, maxMana: 2000, maxHp: 1400, drinkPerSec: 30, foodPerSec: 60, params: loadParams(), ...over,
});
const cell = (id: string, level = 50, params = {}): CellConfig => ({ variant: loadVariant(id), level, profile: 'average', params: loadParams({ session_pulls: 10, ...params }) });

describe('kills per hour and break planning', () => {
  it('kills per hour is 3600 x kills / total seconds', () => {
    expect(killsPerHour(1, 36)).toBe(100);
    expect(killsPerHour(2, 72)).toBe(100);
    expect(killsPerHour(0, 0)).toBe(0);
  });
  it('a break eats until HP is full and drinks only while eating', () => {
    const plan = planRest(rest());
    expect(plan.eatSec).toBeCloseTo((1400 - 400) / 60, 6);
    expect(plan.restSec).toBeCloseTo(plan.eatSec, 6);
    expect(plan.drinkSec).toBeCloseTo(plan.eatSec, 6);
    expect(plan.hp).toBe(1400);
    expect(plan.mana).toBeCloseTo(200 + 30 * plan.eatSec, 6);
  });
  it('the drink stops when the mana is full, and never goes past the meal', () => {
    const plan = planRest(rest({ mana: 1990 }));
    expect(plan.mana).toBeLessThanOrEqual(2000);
    expect(plan.drinkSec).toBeLessThan(plan.eatSec);
  });
  it('without eating and drinking together the warlock also drinks to the target afterwards', () => {
    const apart = planRest(rest({ params: loadParams({ eat_and_drink_together: false }) }));
    const together = planRest(rest());
    expect(apart.restSec).toBeGreaterThan(together.restSec);
    expect(apart.mana).toBeCloseTo(2000, 6);
  });
  it('no regen at all returns a finite capped break instead of looping', () => {
    const plan = planRest(rest({ drinkPerSec: 0, foodPerSec: 0 }));
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

describe('Life Tap and break policy in sessions', () => {
  it('breaks only happen for food and water, never because mana is low', () => {
    const s = runSession(cell('AFF_WRACK', 50, { session_pulls: 30 }), 3);
    expect(s.breaks).toBeLessThan(30);
    expect(s.eatSec).toBeGreaterThanOrEqual(0);
  });
  it('the warlock drinks far less than he eats: drinking happens only during a meal', () => {
    const rs = runCell(cell('AFF_WRACK', 50, { session_pulls: 30 }), 8, 1).raw;
    for (const r of rs) expect(r.drinkSec).toBeLessThanOrEqual(r.eatSec + 1e-9);
  });
  it('Life Tap is used by the rules: it fills mana, spending HP', () => {
    const rs = runCell(cell('AFF_WRACK', 50, { session_pulls: 30 }), 8, 1).raw;
    expect(rs.reduce((a, r) => a + r.manaFromLifeTap, 0)).toBeGreaterThan(0);
    expect(rs.reduce((a, r) => a + r.lifeTapSec, 0)).toBeGreaterThan(0);
  });
  it('a stricter break threshold means more breaks', () => {
    const few = runCell(cell('AFF_WRACK', 50, { break_hp_pct: 0.1, session_pulls: 30 }), 8, 1).raw.reduce((a, r) => a + r.breaks, 0);
    const many = runCell(cell('AFF_WRACK', 50, { break_hp_pct: 0.6, session_pulls: 30 }), 8, 1).raw.reduce((a, r) => a + r.breaks, 0);
    expect(many).toBeGreaterThanOrEqual(few);
  });
});
