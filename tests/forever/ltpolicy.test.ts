import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { LT_PRESETS, TUNABLES, duelPolicies, evaluatePolicy, searchPolicy } from '../../src/forever/ltpolicy';
import { planRest, runCell } from '../../src/forever/runner';

const eo = { builds: ['AFF_WRACK', 'DEMO_PACT_R1'], levels: [50], profile: 'average', sessions: 6, seed: 1, baseParams: { session_pulls: 10 } };

describe('Life Tap policies', () => {
  it('every preset runs and gives finite scores', () => {
    for (const [name, preset] of Object.entries(LT_PRESETS)) {
      const s = evaluatePolicy(preset.params, eo);
      expect(Number.isFinite(s.meanKph), name).toBe(true);
      expect(s.meanKph, name).toBeGreaterThan(10);
    }
  });
  it('NO_LIFE_TAP never taps, USER does', () => {
    expect(evaluatePolicy(LT_PRESETS.NO_LIFE_TAP!.params, eo).lifeTapSecPerKill).toBe(0);
    expect(evaluatePolicy(LT_PRESETS.USER!.params, eo).lifeTapSecPerKill).toBeGreaterThan(0);
  });
  it('without Life Tap the warlock drinks more than the user policy', () => {
    const none = evaluatePolicy(LT_PRESETS.NO_LIFE_TAP!.params, eo);
    const user = evaluatePolicy(LT_PRESETS.USER!.params, eo);
    expect(none.drinkSecPerKill).toBeGreaterThan(user.drinkSecPerKill);
  });
  it('a policy compared with itself has a zero paired difference', () => {
    const d = duelPolicies({}, {}, 'AFF_WRACK', 50, eo);
    expect(d.diff.mean).toBe(0);
    expect(d.diff.significant).toBe(false);
  });
  it('the search never ends below its start and is deterministic', () => {
    const tun = TUNABLES.filter((t) => t.key === 'lt_between_mana_pct');
    const a = searchPolicy({}, eo, 1, 0.25, tun);
    const b = searchPolicy({}, eo, 1, 0.25, tun);
    expect(a.score.meanKph).toBeGreaterThanOrEqual(a.start.meanKph);
    expect(a.best).toEqual(b.best);
  });
  it('break_mana_pct adds breaks when mana is the trigger', () => {
    const base = loadParams({ session_pulls: 12 });
    const run = (extra: object) => runCell({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: { ...base, ...extra } }, 6, 1).raw.reduce((a, r) => a + r.breaks, 0);
    expect(run({ break_mana_pct: 0.95, lt_combat_mana_pct: 0, lt_low_mana_pct: 0, lt_between_mana_pct: 0 })).toBeGreaterThan(run({}));
  });
  it('hp_regen_pct_per_sec lowers the number of food breaks', () => {
    const base = loadParams({ session_pulls: 20 });
    const run = (hp: number) => runCell({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: { ...base, hp_regen_pct_per_sec: hp } }, 6, 1).raw.reduce((a, r) => a + r.breaks, 0);
    expect(run(0.02)).toBeLessThanOrEqual(run(0));
  });
  it('drink_to_mana_pct keeps drinking after the meal', () => {
    const base = { mana: 200, hp: 1200, maxMana: 2000, maxHp: 1400, drinkPerSec: 30, foodPerSec: 60 };
    const minimal = planRest({ ...base, params: loadParams() });
    const full = planRest({ ...base, params: loadParams({ drink_to_mana_pct: 1 }) });
    expect(full.drinkSec).toBeGreaterThan(minimal.drinkSec);
    expect(full.mana).toBeCloseTo(2000, 6);
  });
});
