import { describe, expect, it } from 'vitest';
import { customId, customVariant, loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { rotationSpec } from '../../src/forever/rotation-spec';
import { buildRotation, type RotationGenes } from '../../src/forever/rotation-genes';
import { runCell } from '../../src/forever/runner';
import type { Params } from '../../src/forever/types';
import { emptyBuild } from '../../src/forever/web/custom';

const genes: RotationGenes = { coe: false, agony: true, corruption: false, siphon: false, immolate: false, minTtkSec: 6, drainSoulFinisher: false, filler: 'drain_life' };
const p = loadParams({ session_pulls: 5 });

describe('rotation genes on a build variant', () => {
  it('a variant with genes plays its generated rotation', () => {
    const plain = loadVariant('DEMO_PACT_R1');
    const cell = (v: typeof plain, rotation?: ReturnType<typeof buildRotation>) => runCell({ variant: v, level: 40, profile: 'average', params: p, ...(rotation ? { rotation } : {}) }, 3, 7).raw;
    const withGenes = cell({ ...plain, genes });
    expect(withGenes).toEqual(cell(plain, buildRotation(genes, p)));
    expect(withGenes).not.toEqual(cell(plain));
  });
  it('rotationSpec uses the genes', () => {
    expect(rotationSpec({ ...loadVariant('DEMO_PACT_R1'), genes }, p).steps).toEqual(buildRotation(genes, p).steps);
  });
  it('customVariant keeps genes', () => {
    expect(customVariant({ ...emptyBuild('G'), picks: ['suppression'], genes }).genes).toEqual(genes);
    expect(loadVariant(customId('G')).genes).toEqual(genes);
  });

  // A5-008: pin that genes equal the template rotation for the affliction/demonology variants (DEMO_FIRE is 0.1-0.2% off and is not listed).
  it('mimicking genes play exactly like the template rotation', () => {
    const g = (o: Partial<RotationGenes>): RotationGenes => ({ coe: true, agony: true, corruption: true, siphon: true, immolate: false, minTtkSec: 6, drainSoulFinisher: true, filler: 'wrack', ...o });
    const mimic: Record<string, RotationGenes> = {
      AFF_WRACK: g({}),
      AFF_DRAINTANK: g({ filler: 'wrack_single_then_drain_life' }),
      AFF_DRAINTANK_NOCOE: g({ filler: 'wrack_single_then_drain_life', coe: false }),
      AFF_WRACK_IMMO: g({ immolate: true }),
      DT_SS_WRACK_50: g({ filler: 'wrack_hp50' }),
      DT_SS_WRACK_70_NOCOE: g({ filler: 'wrack_hp70', coe: false }),
      DEMO_PACT_R1: g({ agony: false, siphon: false, filler: 'sb_r1' }),
      DEMO_PACT_R2: g({ agony: false, siphon: false, filler: 'sb_r2' }),
      DEMO_PACT_MAXRANK: g({ agony: false, siphon: false, filler: 'sb_max' }),
    };
    for (const [id, genes] of Object.entries(mimic)) {
      const v = loadVariant(id);
      for (const level of [30, 45]) {
        const run = (variant: typeof v) => runCell({ variant, level, profile: 'average', params: p }, 3, 5).raw;
        expect(run({ ...v, genes }), `${id} L${level}`).toEqual(run(v));
      }
    }
  });
});

// A5-005: a genes build honours the parameters that the template rotations obey.
describe('rotation genes and parameter overrides (A5-005)', () => {
  const g = (o: Partial<RotationGenes>): RotationGenes => ({ coe: true, agony: true, corruption: true, siphon: true, immolate: false, minTtkSec: 6, drainSoulFinisher: true, filler: 'wrack', ...o });
  const pp = (o: Partial<Params> = {}) => loadParams({ session_pulls: 5, ...o });
  const raw = (variant: ReturnType<typeof loadVariant>, params: Params, level: number) => runCell({ variant, level, profile: 'average', params }, 3, 5).raw;

  // Pinned on the code before the fix: without an override the genes play exactly as they did.
  it('pins the results of genes without overrides', () => {
    const cases: Record<string, RotationGenes> = {
      mimic: g({}),
      imm_hp70_t0: g({ immolate: true, filler: 'wrack_hp70', minTtkSec: 0 }),
      draintank_t12: g({ filler: 'wrack_single_then_drain_life', coe: false, minTtkSec: 12 }),
      demo_alt: g({ agony: false, siphon: false, filler: 'sb_r1', drainSoulFinisher: false, alt: { when: 'late', filler: 'drain_life' }, dotTtk: { corruption: 12 } }),
    };
    const pinned: Record<string, number> = {
      'mimic|30|5': 105.53506731583867, 'mimic|30|1234': 112.07512356692794, 'mimic|45|5': 122.49164800827505, 'mimic|45|1234': 121.94978661009594, 'mimic|55|5': 108.66972990917762, 'mimic|55|1234': 119.87931424235843,
      'imm_hp70_t0|30|5': 106.34847318320092, 'imm_hp70_t0|30|1234': 106.53118501575513, 'imm_hp70_t0|45|5': 121.16617681797187, 'imm_hp70_t0|45|1234': 117.37093506296713, 'imm_hp70_t0|55|5': 126.10973799817106, 'imm_hp70_t0|55|1234': 125.36506697181332,
      'draintank_t12|30|5': 117.00975081256772, 'draintank_t12|30|1234': 114.44583994073948, 'draintank_t12|45|5': 126.9597070459818, 'draintank_t12|45|1234': 139.00945868090048, 'draintank_t12|55|5': 123.70896503202165, 'draintank_t12|55|1234': 150.73272854152128,
      'demo_alt|30|5': 78.269564967747, 'demo_alt|30|1234': 74.8270943410417, 'demo_alt|45|5': 91.63469244688427, 'demo_alt|45|1234': 90.19840993177564, 'demo_alt|55|5': 96.2566844919786, 'demo_alt|55|1234': 96.98275862068967,
    };
    const got: Record<string, number> = {};
    for (const [n, genes] of Object.entries(cases))
      for (const level of [30, 45, 55])
        for (const seed of [5, 1234]) got[`${n}|${level}|${seed}`] = runCell({ variant: { ...loadVariant('AFF_WRACK'), genes }, level, profile: 'average', params: pp() }, 3, seed).metrics.killsPerHour;
    expect(got).toEqual(pinned);
  });

  // The same override acts on a genes build that mimics a template exactly as on the template.
  const overrides: [string, string, RotationGenes, Partial<Params>][] = [
    ['AFF_WRACK', 'corruption_min_ttk_sec=12', g({}), { corruption_min_ttk_sec: 12 }],
    ['AFF_WRACK', 'corruption_min_ttk_sec=0', g({}), { corruption_min_ttk_sec: 0 }],
    ['AFF_WRACK', 'use_curse_of_elements=false', g({}), { use_curse_of_elements: false }],
    ['AFF_WRACK', 'use_drain_soul_finisher=false', g({}), { use_drain_soul_finisher: false }],
    ['AFF_WRACK', 'aff_use_immolate=true', g({}), { aff_use_immolate: true }],
    ['AFF_DRAINTANK', 'wrack_min_hp_pct=0.6', g({ filler: 'wrack_single_then_drain_life' }), { wrack_min_hp_pct: 0.6 }],
    ['AFF_WRACK', 'wrack_min_hp_pct=0.6', g({}), { wrack_min_hp_pct: 0.6 }],
    ['DT_SS_WRACK_50', 'wrack_min_hp_pct=0.7 (the gene floor wins)', g({ filler: 'wrack_hp50' }), { wrack_min_hp_pct: 0.7 }],
    ['DEMO_PACT_R1', 'demo_use_agony=true', g({ agony: false, siphon: false, filler: 'sb_r1' }), { demo_use_agony: true }],
    ['DEMO_PACT_R1', 'use_curse_of_elements=false', g({ agony: false, siphon: false, filler: 'sb_r1' }), { use_curse_of_elements: false }],
  ];
  for (const [id, label, genes, o] of overrides) {
    it(`${id} mimic follows ${label}`, () => {
      const v = loadVariant(id);
      const params = pp(o);
      for (const level of [30, 45]) expect(raw({ ...v, genes }, params, level), `L${level}`).toEqual(raw(v, params, level));
      // and the override changes the genes build itself (not only the template)
      if (!label.includes('gene floor')) expect(buildRotation(genes, params).steps).not.toEqual(buildRotation(genes, pp()).steps);
    });
  }

  it('an explicit gene that switches an effect off stays off whatever the parameters say', () => {
    const noCoe = buildRotation(g({ coe: false }), pp({ use_curse_of_elements: true })).steps;
    expect(noCoe.some((s) => s.id === 'curse_of_elements')).toBe(false);
    const noDs = buildRotation(g({ drainSoulFinisher: false }), pp({ use_drain_soul_finisher: true })).steps;
    expect(noDs.some((s) => s.id === 'drain_soul_finisher')).toBe(false);
  });

  it('the parameter time-to-kill floor replaces the gene floor, a per-effect floor stays', () => {
    const steps = buildRotation(g({ minTtkSec: 0, dotTtk: { siphon: 12 } }), pp({ corruption_min_ttk_sec: 9 })).steps;
    const ttk = (id: string) => JSON.stringify(steps.find((s) => s.id === id)?.when);
    expect(ttk('corruption')).toContain('"sec":9');
    expect(ttk('siphon_life')).toContain('"sec":12');
  });

  it('the estimate follows the effective effects', () => {
    expect(buildRotation(g({ immolate: false }), pp({ aff_use_immolate: true })).estimate.dotSpells).toContain('immolate');
  });
});
