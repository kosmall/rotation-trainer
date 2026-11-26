import { describe, expect, it } from 'vitest';
import { loadVariant, SCENARIO_IDS, VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { dataRotationOf, estimateOf } from '../../src/forever/rotation-spec';
import { runCell } from '../../src/forever/runner';
import type { Params } from '../../src/forever/types';

const same = (id: string, p: Params, levels: number[]): void => {
  const v = loadVariant(id);
  for (const level of levels)
    for (const mobs of [1, 2] as const) {
      const a = runCell({ variant: v, level, profile: 'average', params: p, mobs }, 3, 7).raw;
      const b = runCell({ variant: v, level, profile: 'average', params: p, mobs, rotation: dataRotationOf(v, p) }, 3, 7).raw;
      expect(b, `${id} level ${level} mobs ${mobs}`).toEqual(a);
    }
};

describe('rotation given as data', () => {
  it.each([...VARIANT_IDS, ...SCENARIO_IDS])('%s: identical sessions', (id) => {
    same(id, loadParams({ session_pulls: 5 }), [40, 47, 59]);
  });
  it('identical with Immolate on for affliction and the Eureka! filler policy', () => {
    const p = loadParams({ session_pulls: 5, aff_use_immolate: true, eureka_policy: 'filler' });
    for (const id of ['AFF_WRACK', 'DT_SS', 'DEMO_PACT_R1', 'DEMO_FIRE']) same(id, p, [44]);
  });
  it('estimateOf follows the build', () => {
    expect(estimateOf(loadVariant('AFF_WRACK'), loadParams())).toEqual({ filler: 'wrack', fillerRank: 'max', dotSpells: ['corruption', 'bane_of_agony', 'siphon_life'] });
    expect(estimateOf(loadVariant('DEMO_FIRE'), loadParams()).fillerRank).toBe(1);
    expect(estimateOf(loadVariant('AFF_WRACK_IMMO'), loadParams()).dotSpells).toContain('immolate');
  });
});
