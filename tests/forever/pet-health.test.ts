// The demon keeps its health between pulls: it regenerates out of combat, the warlock may channel Health Funnel,
// and a demon that died comes back at full health.
import { describe, expect, it } from 'vitest';
import { loadVariant, type BuildVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { runCell, runSession } from '../../src/forever/runner';
import { healthFunnelAt } from '../../src/forever/stats';
import type { Params } from '../../src/forever/types';

const imp: BuildVariant = { ...loadVariant('DEMO_PACT_R1_NOCOE'), pet: 'imp', sacrificed: 'voidwalker', pet_rules: undefined };
/** No regeneration and no Health Funnel: every wound stays. */
const bare: Partial<Params> = { pet_ooc_regen_pct_per_sec: 0, pet_funnel_below_pct: 0 };
const cell = (variant: BuildVariant, params: Partial<Params>, level = 41) => runCell({ variant, level, profile: 'good', params: loadParams(params) }, 20, 1).metrics;

describe('a pull starts with the health the demon has', () => {
  const pull = (startPetHp?: number) => simulatePull({ variant: imp, level: 41, profile: 'good', params: loadParams(), startPetHp }, 3);
  it('is full by default and reports what is left', () => {
    const r = pull();
    expect(r.petMaxHp).toBeGreaterThan(500);
    expect(r.endPetHp).toBeLessThan(r.petMaxHp);
    expect(r.endPetHp).toBeGreaterThan(0);
  });
  it('a wounded demon ends lower, and dies when it has almost nothing', () => {
    const full = pull();
    expect(pull(full.petMaxHp / 2).endPetHp).toBeLessThan(full.endPetHp);
    const dying = pull(1);
    expect(dying.petDied).toBe(true);
    expect(dying.endPetHp).toBe(0);
  });
  it('never starts above the maximum', () => {
    expect(pull(1e9).endPetHp).toBe(pull().endPetHp);
  });
  it('a build without a demon has no demon health', () => {
    const r = simulatePull({ variant: { ...imp, pet: null, sacrificed: null }, level: 41, profile: 'good', params: loadParams() }, 3);
    expect(r.petMaxHp).toBe(0);
  });
});

describe('between pulls', () => {
  it('the defaults: Classic out-of-combat regeneration, 13% every 5 s', () => {
    expect(loadParams().pet_ooc_regen_pct_per_sec).toBeCloseTo(0.026, 6);
  });
  it('without regeneration a tanking Imp wears down and dies; regeneration keeps it up', () => {
    const none = cell(imp, bare);
    const some = cell(imp, { ...bare, pet_ooc_regen_pct_per_sec: 0.026 });
    const instant = cell(imp, { ...bare, pet_ooc_regen_pct_per_sec: 1 });
    expect(instant.petHpStartPct).toBeCloseTo(100, 6);
    expect(instant.petDeathsPerHour).toBe(0);
    expect(some.petHpStartPct!).toBeLessThan(100);
    expect(none.petHpStartPct!).toBeLessThan(some.petHpStartPct!);
    expect(none.petDeathsPerHour).toBeGreaterThan(5);
    expect(none.killsPerHour).toBeLessThan(instant.killsPerHour);
  });
  it('a demon that died is back at full health for the next pull', () => {
    // every pull begins either with what was left or, after a death, with everything: the mean cannot sink to nothing
    const s = runSession({ variant: imp, level: 41, profile: 'good', params: loadParams(bare) }, 1);
    expect(s.petDeaths).toBeGreaterThan(0);
    expect(s.petStartHpSum / s.petPulls).toBeGreaterThan(0.3);
    expect(s.petPulls).toBe(s.pulls);
  });
  it('a build without a demon reports no demon health', () => {
    expect(cell({ ...imp, pet: null, sacrificed: null }, {}).petHpStartPct).toBeNull();
  });
});

describe('Health Funnel', () => {
  it('ranks (Wowhead Forever): health per second and the cost of the channel', () => {
    expect(healthFunnelAt(11, {})).toBeUndefined();
    expect(healthFunnelAt(12, {})).toEqual({ healPerSec: 12, costBase: 11, costPerSec: 5, channelSec: 10 });
    expect(healthFunnelAt(41, {})).toEqual({ healPerSec: 64, costBase: 39, costPerSec: 25, channelSec: 10 });
    expect(healthFunnelAt(59, {})).toEqual({ healPerSec: 119, costBase: 62, costPerSec: 47, channelSec: 10 });
  });
  it('Improved Health Funnel 2/2: 40% more health for 30% less', () => {
    const f = healthFunnelAt(41, { improved_health_funnel: 2 })!;
    expect(f.healPerSec).toBeCloseTo(64 * 1.4, 6);
    expect(f.costBase).toBeCloseTo(39 * 0.7, 6);
    expect(f.costPerSec).toBeCloseTo(25 * 0.7, 6);
  });
  it('healing a hurt demon between pulls costs time and health, and saves it', () => {
    const none = cell(imp, bare);
    const funnel = cell(imp, { ...bare, pet_funnel_below_pct: 0.6, pet_funnel_to_pct: 0.9 });
    expect(none.funnelSecPerKill).toBe(0);
    expect(funnel.funnelSecPerKill).toBeGreaterThan(0.1);
    expect(funnel.petHpStartPct!).toBeGreaterThan(none.petHpStartPct!);
    expect(funnel.petDeathsPerHour).toBeLessThan(none.petDeathsPerHour);
  });
  it('is not used while the demon is healthy', () => {
    expect(cell(imp, { pet_ooc_regen_pct_per_sec: 1, pet_funnel_below_pct: 0.6 }).funnelSecPerKill).toBe(0);
  });
});
