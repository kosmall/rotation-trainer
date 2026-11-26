import { describe, expect, it } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { completeBuilds, runCompleteTask, type CompleteResult, type CompleteTask } from '../../src/forever/discover/complete';
import { enumerateCombos } from '../../src/forever/discover/space';
import { canonicalPicks } from '../../src/forever/discover/talent-search';
import { validatePicks } from '../../src/forever/talents';
import { discoverPool } from '../../src/forever/web/discover-client';
import { discoverOptions } from '../../src/forever/web/discover';
import { DEFAULT_SETTINGS } from '../../src/forever/web/api';

const combos = enumerateCombos(40, { fillers: ['drain_life', 'sb_r1'], minTtk: [6], pets: ['imp'], maxDots: 1 }).filter((c) => c.pets.sacrificed === 'voidwalker' && c.genes.agony && !c.genes.drainSoulFinisher);
const ranks = ranksAt(loadVariant('DEMO_PACT_R1'), 40);
const rows = combos.slice(0, 2).map((combo, i) => ({ rank: i + 1, label: `row ${i + 1}`, combo, ranks }));
const base = { fromLevel: 40, toLevel: 44, profile: 'average', mobs: 1 as const, params: loadParams({ session_pulls: 3 }), seed: 2 };
const budget = { restarts: 2, sessions: 2, maxSims: 20, finalSessions: 3 };
const inline = async (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) =>
  tasks.map((t) => {
    const r = runCompleteTask(t);
    onDone(r);
    return r;
  });

describe('completing selected rows', () => {
  it('gives each row a legal path to the target level, at least as fast as greedy', async () => {
    const stages: string[] = [];
    const out = await completeBuilds(rows, base, budget, inline, (stage) => stages.push(stage));
    expect(out.map((c) => c.rank)).toEqual([1, 2]);
    for (const c of out) {
      expect(c.path).toHaveLength(4);
      expect(validatePicks([...canonicalPicks(c.baseRanks), ...c.path]).ok).toBe(true);
      expect(c.perLevel.map((x) => x.level)).toEqual([41, 42, 43, 44]);
      expect(c.perLevel.map((x) => x.pick)).toEqual(c.path);
      expect(c.searchCost).toBeLessThanOrEqual(c.greedySearchCost + 1e-12);
      expect(c.avgKph).toBeGreaterThan(0);
      expect(c.greedyAvgKph).toBeGreaterThan(0);
    }
    expect(stages).toEqual(expect.arrayContaining(['greedy', 'improve', 'final']));
  });
  it('runs through the discovery pool too', async () => {
    const tasks: CompleteTask[] = [{ kind: 'complete-greedy', row: 0, ctx: { ...base, combo: rows[0]!.combo, baseRanks: ranks, sessions: 2 } }];
    const pool = discoverPool<CompleteTask, CompleteResult>(discoverOptions({ ...DEFAULT_SETTINGS, level: 40 }, 'quick'), 1, new AbortController().signal, () => null);
    expect(await pool.runner(tasks, () => undefined)).toEqual(await inline(tasks, () => undefined));
  });
});
