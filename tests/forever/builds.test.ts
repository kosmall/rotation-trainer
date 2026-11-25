import { describe, expect, it } from 'vitest';
import { ORDER_IDS, VARIANT_IDS, describeBuild, loadOrder, loadVariant, picksAt } from '../../src/forever/builds';
import { validatePicks } from '../../src/forever/talents';

describe('builds', () => {
  it('every order validates at every level 10-60', () => {
    for (const id of ORDER_IDS.filter((x) => x !== 'DEMO_CORE')) {
      const order = loadOrder(id);
      expect(order.length, id).toBe(51);
      for (let level = 10; level <= 60; level++) {
        const r = validatePicks(order, level - 9);
        expect(r.errors, `${id} @${level}`).toEqual([]);
      }
    }
  });
  it('point totals on level 60 match the user table', () => {
    const tot = (id: string) => {
      const p = validatePicks(loadOrder(id)).pointsPerTree;
      return [p.aff, p.demo, p.destro];
    };
    expect(tot('AFF_WRACK')).toEqual([46, 5, 0]);
    expect(tot('AFF_DRAINTANK')).toEqual([41, 10, 0]);
    expect(tot('DEMO_PACT_BANE2')).toEqual([13, 31, 7]);
    expect(tot('DEMO_PACT_BANE5')).toEqual([10, 31, 10]);
    expect(tot('DEMO_FIRE')).toEqual([0, 31, 20]);
  });
  it('BANE2 and BANE5 share the first 31 points; at 40 DEMO ends with Demonic Pact', () => {
    expect(loadOrder('DEMO_PACT_BANE2').slice(0, 31)).toEqual(loadOrder('DEMO_PACT_BANE5').slice(0, 31));
    expect(picksAt(loadVariant('DEMO_PACT_R1'), 40)[30]).toBe('demonic_pact');
  });
  it('has the seven simulated variants', () => {
    expect(VARIANT_IDS).toEqual(['AFF_WRACK', 'AFF_DRAINTANK', 'DEMO_PACT_R1', 'DEMO_PACT_VIDEO', 'DEMO_PACT_R2', 'DEMO_PACT_MAXRANK', 'DEMO_FIRE']);
  });
  it('respec: below respec_level the pre-respec build is used, from it the own list', () => {
    const v = loadVariant('DEMO_PACT_R1');
    const opts = { preRespecBuild: 'AFF_WRACK' };
    expect(picksAt(v, 39, opts)).toEqual(loadOrder('AFF_WRACK').slice(0, 30));
    expect(picksAt(v, 40, opts)).toEqual(loadOrder('DEMO_PACT_BANE2').slice(0, 31));
    expect(picksAt(v, 45, { ...opts, respecLevel: 50 })).toEqual(loadOrder('AFF_WRACK').slice(0, 36));
  });
  it('Demonology builds follow their own list from level 10, with no respec', () => {
    const v = loadVariant('DEMO_PACT_R1');
    expect(v.pre_respec_build).toBeNull();
    expect(picksAt(v, 10)).toEqual(loadOrder('DEMO_PACT_BANE2').slice(0, 1));
    expect(picksAt(v, 39)).toEqual(loadOrder('DEMO_PACT_BANE2').slice(0, 30));
    expect(picksAt(v, 40)).toEqual(loadOrder('DEMO_PACT_BANE2').slice(0, 31));
  });
  it('legacy perk adds points', () => {
    expect(picksAt(loadVariant('AFF_WRACK'), 40, { legacyPerk: 3 })).toHaveLength(34);
    expect(picksAt(loadVariant('AFF_WRACK'), 59, { legacyPerk: 5 })).toHaveLength(51);
  });
  it('every variant has legal ranks on every level 10-60', () => {
    for (const id of VARIANT_IDS) for (let l = 10; l <= 60; l++) {
      const v = loadVariant(id);
      expect(validatePicks(picksAt(v, l)).ok, `${id}@${l}`).toBe(true);
    }
  });
  it('describeBuild shows points per tree and next pick', () => {
    const s = describeBuild(loadVariant('AFF_WRACK'), 47);
    expect(s.points).toBe(38);
    expect(s.perTree.aff).toBe(38);
    expect(s.lastPick).toBe('Suppression');
    expect(s.nextPick).toBe('Suppression');
  });
});
