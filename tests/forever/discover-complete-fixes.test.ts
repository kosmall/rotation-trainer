import { describe, expect, it } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { completeBuilds, completeEtaSec, COMPLETE_FULL, runCompleteTask, type CompleteResult, type CompleteTask } from '../../src/forever/discover/complete';
import type { TopRow } from '../../src/forever/discover/engine';
import { enumerateCombos } from '../../src/forever/discover/space';
import { rowVariant } from '../../src/forever/web/discover';

const combos = enumerateCombos(40, { fillers: ['drain_life', 'sb_r1'], minTtk: [6], pets: ['imp'], maxDots: 1 }).filter((c) => c.pets.sacrificed === 'voidwalker' && c.genes.agony && !c.genes.drainSoulFinisher);
const ranks = ranksAt(loadVariant('DEMO_PACT_R1'), 40);
const rows = combos.slice(0, 2).map((combo, i) => ({ rank: i + 1, label: `row ${i + 1}`, combo, ranks }));
const base = { fromLevel: 40, toLevel: 43, profile: 'average', mobs: 1 as const, params: loadParams({ session_pulls: 3 }), seed: 2 };
const budget = { restarts: 2, sessions: 2, maxSims: 12, finalSessions: 3 };
const inline = async (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) => tasks.map((t) => { const r = runCompleteTask(t); onDone(r); return r; });

describe('completion fixes', () => {
  it('keeps the greedy path when it wins the final evaluation', async () => {
    const rigged = async (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) => {
      const out = await inline(tasks, onDone);
      return out.map((r) => (r.kind === 'complete-final' && r.which === 'greedy' ? { ...r, kph: r.kph.map((k) => k * 2) } : r));
    };
    const [c] = await completeBuilds(rows.slice(0, 1), base, budget, rigged);
    expect(c!.path).toEqual(c!.greedyPath);
    expect(c!.avgKph).toBeCloseTo(c!.greedyAvgKph, 9);
  });
  it('gives a row the same path whatever else is ticked', async () => {
    const alone = await completeBuilds(rows.slice(1), base, budget, inline);
    const both = await completeBuilds(rows, base, budget, inline);
    expect(alone[0]!.path).toEqual(both[1]!.path);
  });
  it('estimates the whole completion, not just the stage', () => {
    const eta = completeEtaSec({ stage: 'greedy', done: 1, total: 2, stageElapsedSec: 10, budget: COMPLETE_FULL, rows: 2, pathLength: 19 });
    expect(eta).toBeGreaterThan(10 * 3);
    expect(completeEtaSec({ stage: 'greedy', done: 0, total: 2, stageElapsedSec: 0, budget: COMPLETE_FULL, rows: 2, pathLength: 19 })).toBeNull();
  });
  it('the rotation of a row leaves out steps that cannot fire at its level', () => {
    const [c] = enumerateCombos(15, { fillers: ['sb_r1'], minTtk: [6], pets: ['imp'], sacrifice: false, maxDots: 2 }).filter((x) => x.genes.coe && x.genes.corruption && !x.genes.drainSoulFinisher);
    const row = { rank: 1, label: 'x', combo: c!, ranks: {} } as unknown as TopRow;
    const v = rowVariant(row, 15);
    expect(v.genes?.coe).toBe(false);
    expect(v.genes?.corruption).toBe(true);
  });
});
