import { describe, expect, it } from 'vitest';
import { loadOrder, loadVariant, VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { runCell } from '../../src/forever/runner';
import { demonsAt } from '../../src/forever/stats';
import { POLICIES } from '../../src/forever/web/api';

const petsAt = (build: string, mobs: number, levels: number[]) => levels.map((l) => demonsAt(loadVariant(build), l, mobs).pet);
// the Life Tap policy of the study (the one the app picks by default for the pull size)
const kph = (build: string, level: number, mobs: 1 | 2 | 3) =>
  runCell({ variant: loadVariant(build), level, profile: 'average', params: loadParams(POLICIES[mobs === 1 ? 'BEST_1MOB' : 'BEST_2MOB']!.params), mobs }, 150, 11).metrics.killsPerHour;

describe('builds that change the demon by level and pull size', () => {
  it('affliction takes the Succubus only on single mob pulls at 20-29', () => {
    for (const build of ['AFF_WRACK_SH_PET', 'DT_SS_WRACK_50_PET']) {
      expect(petsAt(build, 1, [19, 20, 29, 30])).toEqual(['voidwalker', 'succubus', 'succubus', 'voidwalker']);
      expect(petsAt(build, 2, [20, 25, 29])).toEqual(['voidwalker', 'voidwalker', 'voidwalker']);
    }
  });

  it('demonology takes the Voidwalker on 3 mob pulls, and on 2 mob pulls up to level 39', () => {
    const b = 'DEMO_PACT_R1_PET';
    expect(petsAt(b, 1, [12, 20, 40, 59])).toEqual(['voidwalker', 'succubus', 'succubus', 'succubus']);
    expect(petsAt(b, 2, [20, 39, 40, 59])).toEqual(['voidwalker', 'voidwalker', 'succubus', 'succubus']);
    expect(petsAt(b, 3, [20, 40, 41, 59])).toEqual(['voidwalker', 'voidwalker', 'voidwalker', 'voidwalker']);
  });

  it('keeps the base build otherwise: same talents (but for Soul Harvest taken early), same rotation', () => {
    for (const [variant, base] of [['DT_SS_WRACK_50_PET', 'DT_SS_WRACK_50'], ['DEMO_PACT_R1_PET', 'DEMO_PACT_R1']] as const) {
      const a = loadVariant(base);
      expect({ ...loadVariant(variant), id: a.id, pet_rules: undefined }).toEqual({ ...a, pet_rules: undefined });
    }
    const early = loadOrder(loadVariant('AFF_WRACK_SH_PET').order);
    const old = loadOrder(loadVariant('AFF_WRACK').order);
    expect(early.slice(5, 7)).toEqual(['soul_harvest', 'soul_harvest']);
    expect([...early].sort()).toEqual([...old].sort());
  });

  it('are better where the study found them better', () => {
    expect(kph('DT_SS_WRACK_50_PET', 22, 1)).toBeGreaterThan(kph('DT_SS_WRACK_50', 22, 1));
    expect(kph('AFF_WRACK_SH_PET', 18, 1)).toBeGreaterThan(kph('AFF_WRACK', 18, 1));
    expect(kph('DEMO_PACT_R1_PET', 24, 2)).toBeGreaterThan(kph('DEMO_PACT_R1', 24, 2) + 30);
    expect(kph('DEMO_PACT_R1_PET', 50, 3)).toBeGreaterThan(kph('DEMO_PACT_R1', 50, 3) + 30);
  });

  it('the guide scenarios are gone', () => {
    expect(VARIANT_IDS.some((id) => /^(HB|TF|CWF|TAV)_/.test(id))).toBe(false);
    expect(() => loadVariant('CWF_AFF_SUC')).toThrow(/unknown build/);
  });
});
