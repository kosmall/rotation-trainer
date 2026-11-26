import { describe, expect, it } from 'vitest';
import { loadVariant, variantFromJson } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { DEFAULT_BUDGET, type DiscoverOptions, type Task, type TopRow } from '../../src/forever/discover/engine';
import { enumerateCombos } from '../../src/forever/discover/space';
import { dataRotationOf } from '../../src/forever/rotation-spec';
import { buildRotation, type RotationGenes } from '../../src/forever/rotation-genes';
import { DEFAULT_SETTINGS } from '../../src/forever/web/api';
import { discoverEtaSec, discoverOptions, fullRotationNote } from '../../src/forever/web/discover';
import { discoverPool, type WorkerLike } from '../../src/forever/web/discover-client';

const genes: RotationGenes = { coe: true, agony: true, corruption: false, siphon: false, immolate: false, minTtkSec: 6, drainSoulFinisher: true, filler: 'drain_life' };

describe('review minors', () => {
  it('dataRotationOf a genes variant is the generated rotation', () => {
    const p = loadParams();
    expect(dataRotationOf({ ...loadVariant('DEMO_PACT_R1'), genes }, p)).toEqual(buildRotation(genes, p));
  });

  it('variantFromJson validates genes', () => {
    const order = loadVariant('DEMO_PACT_R1').order;
    expect(variantFromJson({ id: 'X', order, genes }).genes).toEqual(genes);
    expect(() => variantFromJson({ id: 'Y', order, genes: { ...genes, filler: 'nope' } })).toThrow(/genes/);
  });

  it('reports a worker crash between stages as an error, not as aborted', async () => {
    const o: DiscoverOptions = { ...discoverOptions({ ...DEFAULT_SETTINGS, level: 40 }, 'quick'), params: loadParams({ session_pulls: 2 }) };
    const workers: WorkerLike[] = [];
    const make = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        terminate: () => undefined,
        postMessage: (m: unknown) => {
          const msg = m as { i?: number; task?: Task };
          if (msg.task) setTimeout(() => w.onmessage?.({ data: { i: msg.i, result: { kind: 'search', comboId: 'x', found: [], evals: 0 } } }), 0);
        },
      };
      workers.push(w);
      return w;
    };
    const pool = discoverPool(o, 1, new AbortController().signal, make);
    const combo = enumerateCombos(40, { fillers: ['sb_r1'], minTtk: [6], pets: ['imp'], sacrifice: false, maxDots: 0 })[0]!;
    await pool.runner([{ kind: 'search', stage: 'screen', combo }], () => undefined);
    workers[0]!.onerror?.({ message: 'out of memory' });
    const err = await pool.runner([{ kind: 'search', stage: 'search', combo }], () => undefined).catch((e: Error) => e);
    expect((err as Error).name).not.toBe('AbortError');
    expect((err as Error).message).toMatch(/out of memory/);
  });

  it('estimates the time of the whole search, not just the stage', () => {
    const b = DEFAULT_BUDGET;
    // halfway through the screen after 60 s: the rest of the screen alone would be 60 s more
    const eta = discoverEtaSec({ stage: 'screen', done: 18144, total: 36288, stageElapsedSec: 60, budget: b, combos: 36288, baselines: 13 });
    expect(eta).toBeGreaterThan(60 * 1.3);
    expect(discoverEtaSec({ stage: 'final', done: 10, total: 100, stageElapsedSec: 10, budget: b, combos: 36288, baselines: 13 })).toBeGreaterThan(90);
    expect(discoverEtaSec({ stage: 'screen', done: 0, total: 36288, stageElapsedSec: 0, budget: b, combos: 36288, baselines: 13 })).toBeNull();
  });

  it('notes when the saved build plays more than the row shows at its level', () => {
    const [c] = enumerateCombos(20, { fillers: ['drain_life'], minTtk: [6], pets: ['imp'], sacrifice: false, maxDots: 1 }).filter((x) => x.genes.coe && x.genes.drainSoulFinisher);
    const row = { combo: c!, ranks: {}, label: 'no DoTs → Drain Life' } as unknown as TopRow;
    expect(fullRotationNote(row)).toMatch(/CoE → Drain Life; DS finish/);
    expect(fullRotationNote({ ...row, label: 'CoE → Drain Life; DS finish; DoTs if TTK ≥ 6 s' } as TopRow)).toBeNull();
  });
});
