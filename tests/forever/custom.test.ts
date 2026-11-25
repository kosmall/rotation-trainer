import { describe, expect, it } from 'vitest';
import { customId, customVariant, loadVariant, picksAt } from '../../src/forever/builds';
import { DEFAULT_SETTINGS, runJob } from '../../src/forever/web/api';
import { CUSTOM_STORAGE_KEY, emptyBuild, loadCustom, parseBuild, saveCustom, uniqueName, type CustomBuildData } from '../../src/forever/web/custom';

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
    expect(r.rows).toHaveLength(9);
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
});
