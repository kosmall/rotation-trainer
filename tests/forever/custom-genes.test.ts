import { describe, expect, it } from 'vitest';
import type { RotationGenes } from '../../src/forever/rotation-genes';
import { CUSTOM_STORAGE_KEY, loadCustom, parseBuild } from '../../src/forever/web/custom';

const genes: RotationGenes = { coe: true, agony: false, corruption: true, siphon: false, immolate: true, minTtkSec: 12, drainSoulFinisher: false, filler: 'searing_pain' };
const base = { name: 'G', picks: ['suppression'], rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'imp', sacrificed: null };

describe('custom builds with genes', () => {
  it('keeps valid genes', () => {
    expect(parseBuild({ ...base, genes }).genes).toEqual(genes);
  });
  it('drops malformed genes but keeps the build', () => {
    const a = parseBuild({ ...base, genes: { ...genes, coe: 'yes' } });
    expect(a.name).toBe('G');
    expect(a.genes).toBeUndefined();
    expect(parseBuild({ ...base, genes: { ...genes, filler: 'nope' } }).genes).toBeUndefined();
    expect(parseBuild({ ...base, genes: { ...genes, minTtkSec: 7 } }).genes).toBeUndefined();
  });
  it('loads stored builds with and without genes', () => {
    const store = new Map<string, string>([[CUSTOM_STORAGE_KEY, JSON.stringify({ builds: [base, { ...base, name: 'H', genes }], active: 'H', included: [] })]]);
    const s = loadCustom({ getItem: (k) => store.get(k) ?? null, setItem: () => undefined });
    expect(s.builds.map((b) => b.name)).toEqual(['G', 'H']);
    expect(s.builds[0]!.genes).toBeUndefined();
    expect(s.builds[1]!.genes).toEqual(genes);
  });
});
