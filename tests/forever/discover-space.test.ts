import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { buildRotation, effectiveKey, enumerateCombos, requiredRanks, rotationLabel, type Combo, type RotationGenes } from '../../src/forever/discover/space';
import { dataRotationOf } from '../../src/forever/rotation-spec';

const genes = (over: Partial<RotationGenes> = {}): RotationGenes => ({
  coe: true, agony: true, corruption: true, siphon: true, immolate: false, minTtkSec: 6, drainSoulFinisher: true, filler: 'wrack', ...over,
});

describe('discovery space', () => {
  it('has every rotation for every pet setup at level 40', () => {
    const all = enumerateCombos(40);
    expect(all).toHaveLength(32 * 3 * 2 * 9 * 21);
    const ids = all.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
  it('skips pets not learned yet and never sacrifices the active pet', () => {
    const at20 = enumerateCombos(20);
    expect(at20.some((c) => c.pets.pet === 'felhunter' || c.pets.sacrificed === 'felhunter')).toBe(false);
    expect(enumerateCombos(40).some((c) => c.pets.pet !== null && c.pets.pet === c.pets.sacrificed)).toBe(false);
  });
  it('filters the space', () => {
    const small = enumerateCombos(40, { fillers: ['sb_r1'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 1 });
    expect(small).toHaveLength(6 * 2);
    expect(small.every((c) => c.genes.filler === 'sb_r1' && c.pets.pet === 'succubus' && c.pets.sacrificed === null)).toBe(true);
  });
  it('builds the AFF_WRACK rotation from its genes', () => {
    const p = loadParams();
    const strip = (s: { spell: string; rank: number | 'max'; when: unknown }[]) => s.map((x) => ({ spell: x.spell, rank: x.rank, when: x.when }));
    const r = buildRotation(genes({ coe: p.use_curse_of_elements, drainSoulFinisher: p.use_drain_soul_finisher }), p);
    // the Demonic Brand refresh is in every generated rotation (it only fires with the talent); the affliction code has none
    expect(strip(r.steps.filter((s) => s.id !== 'brand_refresh'))).toEqual(strip(dataRotationOf(loadVariant('AFF_WRACK'), p).steps));
    expect(r.estimate).toEqual({ filler: 'wrack', fillerRank: 'max', dotSpells: ['corruption', 'bane_of_agony', 'siphon_life'] });
  });
  it('builds the DEMO_PACT_R1 rotation from its genes', () => {
    const p = loadParams();
    const strip = (s: { spell: string; rank: number | 'max'; when: unknown }[]) => s.map((x) => ({ spell: x.spell, rank: x.rank, when: x.when }));
    const r = buildRotation(genes({ agony: p.demo_use_agony, siphon: false, filler: 'sb_r1' }), p);
    expect(strip(r.steps)).toEqual(strip(dataRotationOf(loadVariant('DEMO_PACT_R1'), p).steps));
    expect(r.estimate.filler).toBe('shadow_bolt');
    expect(r.estimate.fillerRank).toBe(1);
  });
  it('omits the time-to-kill condition at 0 s', () => {
    const r = buildRotation(genes({ minTtkSec: 0 }), loadParams());
    const corr = r.steps.find((s) => s.spell === 'corruption');
    expect(JSON.stringify(corr?.when)).not.toContain('ttk_at_least');
  });
  it('names the talents a combination needs', () => {
    const c: Combo = { id: 'x', genes: genes({ filler: 'wrack_hp70' }), pets: { pet: 'succubus', sacrificed: 'imp' } };
    expect(requiredRanks(c)).toEqual({ demonic_sacrifice: 1, wrack: 1, siphon_life: 1, soul_harvest: 1 });
    expect(requiredRanks({ ...c, genes: genes({ siphon: false, drainSoulFinisher: false, filler: 'wrack_single_then_drain_life' }), pets: { pet: null, sacrificed: null } })).toEqual({});
  });
  it('treats rotations that play the same as one', () => {
    const a: Combo = { id: 'a', genes: genes({ filler: 'wrack_hp50' }), pets: { pet: 'voidwalker', sacrificed: 'imp' } };
    const b: Combo = { id: 'b', genes: genes({ filler: 'wrack_hp70' }), pets: { pet: 'voidwalker', sacrificed: null } };
    expect(effectiveKey(a, 40, { wrack: 0 })).toBe(effectiveKey(b, 40, { wrack: 0 }));
    expect(effectiveKey(a, 40, { wrack: 1, siphon_life: 1 })).not.toBe(effectiveKey(b, 40, { wrack: 1, siphon_life: 1 }));
    expect(effectiveKey(a, 40, { demonic_sacrifice: 1 })).not.toBe(effectiveKey(b, 40, { demonic_sacrifice: 1 }));
  });
  it('labels a rotation', () => {
    expect(rotationLabel(genes({ agony: false, siphon: false, immolate: true, filler: 'searing_pain' }))).toBe('CoE, Corruption, Immolate → Searing Pain; DS finish; DoTs if TTK ≥ 6 s');
    expect(rotationLabel({ coe: false, agony: false, corruption: false, siphon: false, immolate: false, minTtkSec: 0, drainSoulFinisher: false, filler: 'sb_r1' })).toBe('no DoTs → Shadow Bolt r1');
  });
});
