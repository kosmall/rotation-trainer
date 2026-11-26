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
});
