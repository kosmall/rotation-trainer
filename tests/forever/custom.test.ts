import { describe, expect, it } from 'vitest';
import { VARIANT_IDS, customId, customVariant, loadVariant, picksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { runCell } from '../../src/forever/runner';
import { DEFAULT_SETTINGS, runJob } from '../../src/forever/web/api';
import { CUSTOM_STORAGE_KEY, copyOfBuiltIn, emptyBuild, exportBuild, loadCustom, parseBuild, saveCustom, uniqueName, type CustomBuildData } from '../../src/forever/web/custom';

const aff = (): CustomBuildData => {
  const v = loadVariant('AFF_WRACK');
  return { name: 'Kopia', picks: picksAt(v, 60), rotation: v.rotation, filler: v.filler, rank: v.rank, pet: v.pet, sacrificed: v.sacrificed };
};

describe('custom builds', () => {
  it('registers a custom build whose picks equal the given order', () => {
    const d = aff();
    const v = customVariant(d);
    expect(v.id).toBe(customId('Kopia'));
    expect(picksAt(loadVariant(v.id), 60)).toEqual(d.picks);
  });
  it('rejects an illegal order and more than 51 points', () => {
    expect(() => customVariant({ ...emptyBuild('x'), picks: ['wrack'] })).toThrow(/invalid talent order/);
    expect(() => customVariant({ ...aff(), name: 'y', picks: [...aff().picks, 'suppression'] })).toThrow();
  });
  it('an unfinished build simulates (unspent points do nothing)', () => {
    const d = { ...aff(), name: 'Pół', picks: aff().picks.slice(0, 20) };
    const r = runJob({ kind: 'ranking', settings: { ...DEFAULT_SETTINGS, level: 45, sessions: 5 }, custom: [d] });
    if (r.kind !== 'ranking') throw new Error('kind');
    expect(r.rows.some((x) => x.metrics.variant === customId('Pół'))).toBe(true);
    expect(r.rows).toHaveLength(23);
  });
  it('a copy of a built-in build scores exactly like the original', () => {
    const d = aff();
    const r = runJob({ kind: 'ranking', settings: { ...DEFAULT_SETTINGS, level: 50, sessions: 10 }, custom: [d] });
    if (r.kind !== 'ranking') throw new Error('kind');
    const orig = r.rows.find((x) => x.metrics.variant === 'AFF_WRACK')!.metrics;
    const copy = r.rows.find((x) => x.metrics.variant === customId('Kopia'))!.metrics;
    expect(copy.killsPerHour).toBe(orig.killsPerHour);
    expect(copy.ttkMean).toBe(orig.ttkMean);
  });
  it('a duel can use a custom build', () => {
    const d = runJob({ kind: 'duel', settings: { ...DEFAULT_SETTINGS, level: 45, sessions: 5 }, a: 'AFF_WRACK', b: customId('Kopia'), sweep: false, custom: [aff()] });
    if (d.kind !== 'duel') throw new Error('kind');
    expect(d.b).toBe(customId('Kopia'));
  });
  it('parseBuild coerces and validates', () => {
    expect(parseBuild({ name: ' A ', picks: [], rotation: 'fire', filler: 'wrack' })).toMatchObject({ name: 'A', rotation: 'fire', filler: 'searing_pain', rank: 'max' });
    expect(() => parseBuild({ name: '', picks: [] })).toThrow();
    expect(() => parseBuild({ name: 'a', picks: ['nope'] })).toThrow();
    expect(() => parseBuild({ name: 'a', picks: ['wrack'] })).toThrow();
  });
  it('uniqueName numbers duplicates', () => {
    expect(uniqueName('A', ['A', 'A 2'])).toBe('A 3');
    expect(uniqueName('B', ['A'])).toBe('B');
  });
  it('storage round trip drops corrupt entries and survives bad JSON', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveCustom(st, { builds: [aff(), { ...emptyBuild('Pusty') }], active: 'Pusty', included: ['Kopia', 'Brak'] });
    const back = loadCustom(st);
    expect(back.builds.map((b) => b.name)).toEqual(['Kopia', 'Pusty']);
    expect(back.active).toBe('Pusty');
    expect(back.included).toEqual(['Kopia']);
    mem.set(CUSTOM_STORAGE_KEY, '{oops');
    expect(loadCustom(st).builds).toEqual([]);
    expect(loadCustom(null).builds).toEqual([]);
  });

  // A5-001: the copy of a built-in build must play exactly the build it was copied from.
  describe('copy of a built-in build (A5-001)', () => {
    const params = loadParams({ session_pulls: 3 });
    const raw = (variant: ReturnType<typeof loadVariant>, level: number, mobs: 1 | 2) => runCell({ variant, level, profile: 'average', params, mobs }, 2, 11).raw;
    it('copy equals original for every VARIANT_ID at levels 30/45/55, mobs 1 and 2', () => {
      for (const id of VARIANT_IDS) {
        const copy = customVariant(copyOfBuiltIn(id, `Kopia ${id}`));
        for (const level of [30, 45, 55]) for (const mobs of [1, 2] as const) expect(raw(copy, level, mobs), `${id} L${level} m${mobs}`).toEqual(raw(loadVariant(id), level, mobs));
      }
    });
    it('the flags of the built-in build are kept in the build data and survive export/import', () => {
      const d = copyOfBuiltIn('DEMO_PACT_R1_PET', 'P');
      expect(d.pet_rules).toEqual(loadVariant('DEMO_PACT_R1_PET').pet_rules);
      expect(copyOfBuiltIn('DT_SS_NOCOE', 'N').coe).toBe(false);
      expect(copyOfBuiltIn('AFF_WRACK_IMMO', 'I').immolate).toBe(true);
      expect(copyOfBuiltIn('DT_SS_WRACK_70', 'W').wrack_min_hp_pct).toBe(loadVariant('DT_SS_WRACK_70').wrack_min_hp_pct);
      for (const id of VARIANT_IDS) {
        const c = copyOfBuiltIn(id, 'X');
        expect(parseBuild(JSON.parse(exportBuild(c))), id).toEqual(c);
      }
    });
    it('a build without the new fields (older stored data) still loads and is a plain build', () => {
      const old = aff();
      const back = parseBuild(JSON.parse(JSON.stringify(old)));
      expect(back).toEqual(old);
      expect(customVariant(back)).not.toHaveProperty('coe');
    });
    it('rejects bad values of the new fields', () => {
      expect(() => parseBuild({ ...aff(), coe: 'no' })).toThrow(/coe/);
      expect(() => parseBuild({ ...aff(), immolate: 1 })).toThrow(/immolate/);
      expect(() => parseBuild({ ...aff(), wrack_min_hp_pct: 70 })).toThrow(/wrack_min_hp_pct/);
      expect(() => parseBuild({ ...aff(), pet_rules: [{ pet: 'dog' }] })).toThrow(/pet_rules/);
      expect(() => customVariant({ ...aff(), name: 'Z', rotation: 'afliction' as never })).toThrow(/rotation/);
    });
  });
});
