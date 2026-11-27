import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { discover, inlineRunner, QUICK_BUDGET, type DiscoverOptions } from '../../src/forever/discover/engine';
import { buildRotation, effectiveKey, enumerateCombos, mixVariants, playedGenes, requiredRanks, rotationId, rotationLabel, type Combo } from '../../src/forever/discover/space';
import { evalCond, type SpecCtx, type SpecStep } from '../../src/forever/rotation-spec';
import { parseGenes, type RotationGenes } from '../../src/forever/rotation-genes';

const genes = (over: Partial<RotationGenes> = {}): RotationGenes => ({
  coe: true, agony: true, corruption: true, siphon: false, immolate: false, minTtkSec: 6, drainSoulFinisher: false, filler: 'sb_max', ...over,
});
const combo = (g: RotationGenes, pet: Combo['pets']['pet'] = 'imp'): Combo => ({ id: `${rotationId(g)}|${pet ?? 'none'}>-`, genes: g, pets: { pet, sacrificed: null } });
const p = loadParams();

describe('mixed rotations', () => {
  it('keeps the ids and steps of rotations without mixing', () => {
    expect(rotationId(genes())).toBe('coe+ag+cor/t6/nods/sb_max');
    expect(buildRotation(genes(), p).steps.some((s) => s.id.startsWith('alt_'))).toBe(false);
  });
  it('plays the second filler first, only while its condition holds', () => {
    const steps = buildRotation(genes({ alt: { when: 'mana_lt_30', filler: 'drain_life' } }), p).steps;
    const alt = steps.findIndex((s) => s.id === 'alt_filler_drain_life');
    const main = steps.findIndex((s) => s.id === 'filler_shadow_bolt');
    expect(alt).toBeGreaterThan(-1);
    expect(alt).toBeLessThan(main);
    const ctx = (manaPct: number): SpecCtx => ({ manaPct, known: () => true }) as unknown as SpecCtx;
    expect(evalCond((steps[alt] as SpecStep).when, ctx(20))).toBe(true);
    expect(evalCond((steps[alt] as SpecStep).when, ctx(80))).toBe(false);
  });
  it('gives each effect its own time-to-kill floor', () => {
    const g = genes({ dotTtk: { corruption: 0, coe: 12 } });
    const steps = buildRotation(g, p).steps;
    const when = (id: string) => JSON.stringify(steps.find((s) => s.id === id)?.when);
    expect(when('corruption')).not.toContain('ttk_at_least');
    expect(when('curse_of_elements')).toContain('"sec":12');
    expect(when('bane_of_agony')).toContain('"sec":6');
    expect(rotationId(g)).toContain('/ttk:');
    expect(rotationLabel(g)).toContain('Corruption 0 s');
  });
  it('requires Wrack when it is the second filler', () => {
    expect(requiredRanks(combo(genes({ alt: { when: 'hp_lt_50', filler: 'wrack' } }))).wrack).toBe(1);
  });
  it('drops a second filler that cannot fire from what is played', () => {
    const c = combo(genes({ alt: { when: 'hp_lt_50', filler: 'wrack' } }));
    expect(playedGenes(c, 40, { wrack: 1 }).alt).toBeDefined();
    expect(playedGenes(c, 40, {}).alt).toBeUndefined();
  });
  it('round-trips through parseGenes and rejects malformed mixes', () => {
    const g = genes({ alt: { when: 'pack', filler: 'searing_pain' }, dotTtk: { agony: 12 } });
    expect(parseGenes(JSON.parse(JSON.stringify(g)))).toEqual(g);
    expect(parseGenes({ ...g, alt: { when: 'never', filler: 'wrack' } })).toBeUndefined();
    expect(parseGenes({ ...g, alt: { when: 'pack', filler: 'sb_max' } })).toBeUndefined();
    expect(parseGenes({ ...g, dotTtk: { agony: 7 } })).toBeUndefined();
    expect(parseGenes(genes())).toEqual(genes());
  });
});

describe('mix variants', () => {
  const base = combo(genes());
  const ranks = { wrack: 1 };
  const vs = mixVariants(base, 40, ranks);
  it('are many, distinct, sorted and never the base', () => {
    expect(vs.length).toBeGreaterThan(40);
    const ids = vs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(ids).not.toContain(base.id);
    expect(new Set(vs.map((c) => effectiveKey(c, 40, { ...ranks, ...requiredRanks(c) }))).size).toBe(vs.length);
  });
  it('cover both kinds of mixing, with the same pets', () => {
    expect(vs.some((c) => c.genes.alt?.when === 'hp_lt_50')).toBe(true);
    expect(vs.some((c) => c.genes.dotTtk !== undefined)).toBe(true);
    expect(vs.every((c) => c.pets === base.pets)).toBe(true);
  });
  it('skip a dead-pet trigger without a pet and a second filler equal to the first', () => {
    expect(mixVariants(combo(genes(), null), 40, ranks).some((c) => c.genes.alt?.when === 'pet_dead')).toBe(false);
    expect(vs.some((c) => c.genes.alt?.filler === 'sb_max')).toBe(false);
  });
  it('can be stacked (a mix of a mix)', () => {
    const again = mixVariants(vs.find((c) => c.genes.dotTtk) as Combo, 40, ranks);
    expect(again.some((c) => c.genes.alt && c.genes.dotTtk)).toBe(true);
  });
  it('leave the enumerated space unchanged', () => {
    expect(enumerateCombos(40).every((c) => c.genes.alt === undefined && c.genes.dotTtk === undefined)).toBe(true);
  });
});

describe('discovery mix stage', () => {
  const o: DiscoverOptions = {
    level: 30, profile: 'average', mobs: 1, seed: 1, perk: 0, params: p, top: 5,
    budget: { ...QUICK_BUDGET, screen: { starts: 1, evals: 2, sessions: 1 }, search: { starts: 1, evals: 3, sessions: 1 }, keep: 2, perFamilyMin: 1, final: 4, finalSessions: 4, mixBases: 1, mixKeep: 3 },
    space: { fillers: ['sb_max'], minTtk: [6], pets: ['imp'], sacrifice: false, maxDots: 2 },
  };
  it('screens variants of the best rotations and reports them', async () => {
    const stages = new Set<string>();
    const res = await discover(o, inlineRunner(o), { progress: (s) => stages.add(s) });
    expect(stages.has('mix')).toBe(true);
    expect(stages.has('mix-search')).toBe(true);
    expect(res.meta.mixed).toBeGreaterThan(10);
    expect(res.meta.searched).toBeGreaterThan(2);
  });
  it('is skipped with no bases to mix', async () => {
    const off = { ...o, budget: { ...o.budget, mixBases: 0 } };
    const stages = new Set<string>();
    const res = await discover(off, inlineRunner(off), { progress: (s) => stages.add(s) });
    expect(stages.has('mix')).toBe(false);
    expect(res.meta.mixed).toBe(0);
  });
});
