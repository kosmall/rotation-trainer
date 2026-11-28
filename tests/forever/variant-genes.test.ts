import { describe, expect, it } from 'vitest';
import { customId, customVariant, loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { rotationSpec } from '../../src/forever/rotation-spec';
import { buildRotation, type RotationGenes } from '../../src/forever/rotation-genes';
import { runCell } from '../../src/forever/runner';
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
