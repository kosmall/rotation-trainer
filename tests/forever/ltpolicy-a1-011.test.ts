// A1-011: the presets that say "no Life Tap in combat" (BETWEEN_ONLY) or "Life Tap in combat only at HP>60%"
// (OLD_THRESHOLD) must not keep the emergency tap that ignores the HP rules.
import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { LT_PRESETS } from '../../src/forever/ltpolicy';

const pull = (preset: string, startMana: number, startHpFrac: number, seed: number) => {
  const params = loadParams(LT_PRESETS[preset]!.params);
  // AFF_WRACK L50 has about 2000 HP; the start HP is given as a fraction so the HP rule can be tested
  const probe = simulatePull({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params, startMana }, seed);
  return simulatePull({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params, mobs: 1, startMana, startHp: probe.maxHp * startHpFrac }, seed);
};

describe('Life Tap presets match their names (A1-011)', () => {
  it('BETWEEN_ONLY never taps in combat, even when nothing is affordable', () => {
    for (let seed = 1; seed <= 5; seed++) expect(pull('BETWEEN_ONLY', 150, 1, seed).lifeTapCount, `seed ${seed}`).toBe(0);
  });
  it('OLD_THRESHOLD taps in combat only above 60% HP', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = pull('OLD_THRESHOLD', 150, 0.5, seed);
      expect(r.lifeTapCount, `seed ${seed}`).toBe(0);
    }
  });
  it('OLD_THRESHOLD still taps in combat at low mana when HP is high', () => {
    expect(pull('OLD_THRESHOLD', 150, 1, 1).lifeTapCount).toBeGreaterThan(0);
  });
  it('COMBAT_ONLY is the user rule without the between-mobs tap: it keeps its in-combat taps', () => {
    expect(pull('COMBAT_ONLY', 150, 1, 1).lifeTapCount).toBeGreaterThan(0);
    expect(LT_PRESETS.COMBAT_ONLY!.params.sb_filler_lifetap_when_oom).toBeUndefined();
  });
  it('the user rule keeps the emergency tap', () => {
    expect(pull('USER', 150, 0.5, 1).lifeTapCount).toBeGreaterThan(0);
  });
});
