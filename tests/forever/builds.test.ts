import { describe, expect, it } from 'vitest';
import { ORDER_IDS, VARIANT_IDS, describeBuild, loadOrder, loadVariant, picksAt, variantFromJson } from '../../src/forever/builds';
import { validatePicks } from '../../src/forever/talents';

describe('builds', () => {
  it('every order validates at every level 10-60', () => {
    for (const id of ORDER_IDS) {
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
  it('has the twenty-two simulated variants', () => {
    expect(VARIANT_IDS).toEqual(['AFF_WRACK', 'AFF_WRACK_SH_PET', 'AFF_WRACK_IMMO', 'AFF_DRAINTANK', 'AFF_DRAINTANK_NOCOE', 'AFF_DRAINTANK_IMMO', 'DT_SS', 'DT_SS_NOCOE', 'DT_SS_IMMO', 'DT_SS_WRACK_70', 'DT_SS_WRACK_70_NOCOE', 'DT_SS_WRACK_50', 'DT_SS_WRACK_50_NOCOE', 'DT_SS_WRACK_50_PET', 'DEMO_PACT_R1', 'DEMO_PACT_R1_NOCOE', 'DEMO_PACT_R1_PET', 'DEMO_PACT_VIDEO', 'DEMO_PACT_VIDEO_NOCOE', 'DEMO_PACT_R2', 'DEMO_PACT_MAXRANK', 'DEMO_FIRE']);
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

  // A5-002: two file builds without an id must not share one talent order.
  it('two builds from JSON without an id keep their own talent orders', () => {
    const a = variantFromJson({ order: 'AFF_WRACK' });
    const b = variantFromJson({ order: loadOrder('DEMO_PACT_BANE2').map((t) => [t, 1]) });
    const c = variantFromJson({ order: loadOrder('AFF_DRAINTANK').map((t) => [t, 1]) });
    expect(picksAt(a, 60)).toEqual(loadOrder('AFF_WRACK'));
    expect(picksAt(b, 60)).toEqual(loadOrder('DEMO_PACT_BANE2'));
    expect(picksAt(c, 60)).toEqual(loadOrder('AFF_DRAINTANK'));
    expect(new Set([a.order, b.order, c.order]).size).toBe(3);
    // a later build with the same id and an inline order does not change an earlier one
    const early = variantFromJson({ id: 'SAME', order: loadOrder('AFF_WRACK').map((t) => [t, 1]) });
    variantFromJson({ id: 'SAME', order: loadOrder('DEMO_PACT_BANE2').map((t) => [t, 1]) });
    expect(picksAt(early, 60)).toEqual(loadOrder('AFF_WRACK'));
  });

  // A3-018 / A4-011 / A5-009: validation and the full set of flags in a build JSON.
  describe('variantFromJson validation', () => {
    const base = { order: 'AFF_WRACK' };
    it('rejects a misspelled rotation, a bad rank, a bad filler and bad pets with a clear error', () => {
      expect(() => variantFromJson({ ...base, rotation: 'afliction' })).toThrow(/rotation.*afliction/);
      expect(() => variantFromJson({ ...base, rank: 7 })).toThrow(/rank/);
      expect(() => variantFromJson({ ...base, filler: 'wrak' })).toThrow(/filler/);
      expect(() => variantFromJson({ ...base, pet: 'dog' })).toThrow(/pet/);
      expect(() => variantFromJson({ ...base, sacrificed: 'dog' })).toThrow(/sacrificed/);
      expect(() => variantFromJson({ ...base, pre_respec_build: 'NOPE' })).toThrow(/pre_respec_build/);
      expect(() => variantFromJson({ ...base, respec_level: 'x' })).toThrow(/respec_level/);
      expect(() => variantFromJson({ ...base, immolate: 'yes' })).toThrow(/immolate/);
      expect(() => variantFromJson({ ...base, coe: 0 })).toThrow(/coe/);
      expect(() => variantFromJson({ ...base, wrack_min_hp_pct: 'x' })).toThrow(/wrack_min_hp_pct/);
      expect(() => variantFromJson({ ...base, wrack_min_hp_pct: 70 })).toThrow(/wrack_min_hp_pct/);
      expect(() => variantFromJson({ ...base, pet_rules: [{ pet: 'dog' }] })).toThrow(/pet_rules/);
      expect(() => variantFromJson({ ...base, pet_rules: 'x' })).toThrow(/pet_rules/);
      expect(() => variantFromJson({ ...base, pet_rules: [{ pet: 'imp', minMobs: 'a' }] })).toThrow(/pet_rules/);
    });
    it('keeps valid JSON working, including the flags the built-in builds use', () => {
      const v = variantFromJson({ ...base, rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'voidwalker', immolate: true, coe: false, wrack_min_hp_pct: 0.7, respec_level: '45', pre_respec_build: 'AFF_WRACK', pet_rules: [{ pet: 'imp', minMobs: 2 }] });
      expect(v).toMatchObject({ rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'voidwalker', immolate: true, coe: false, wrack_min_hp_pct: 0.7, respec_level: 45, pre_respec_build: 'AFF_WRACK', pet_rules: [{ pet: 'imp', minMobs: 2 }] });
      expect(variantFromJson({ ...base })).toMatchObject({ rotation: 'demonology', filler: 'shadow_bolt', rank: 1, pet: 'succubus', respec_level: 40 });
    });
    it('every built-in variant round-trips through variantFromJson unchanged', () => {
      for (const id of VARIANT_IDS) {
        const v = loadVariant(id);
        expect(variantFromJson({ ...v }), id).toEqual(v);
      }
    });
  });
});
