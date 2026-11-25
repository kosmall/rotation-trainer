import { describe, expect, it } from 'vitest';
import { VARIANT_IDS, loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';

describe('GCD utilisation', () => {
  it('never exceeds 100% of the pull (cast pushback inside the GCD is not counted twice)', () => {
    const params = loadParams();
    for (const id of VARIANT_IDS)
      for (const level of [40, 50, 59])
        for (let seed = 1; seed <= 15; seed++) {
          const r = simulatePull({ variant: loadVariant(id), level, profile: 'average', params }, seed);
          expect(r.gcdBusyMs, `${id} L${level} seed ${seed}`).toBeLessThanOrEqual(r.pullSec * 1000 + 1e-6);
        }
  });
});
