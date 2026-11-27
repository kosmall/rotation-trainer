import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { greedyPath, harmonicKph, improvePath, pathCost, type CompleteCtx } from '../../src/forever/discover/complete';
import { enumerateCombos } from '../../src/forever/discover/space';
import { canonicalPicks } from '../../src/forever/discover/talent-search';
import { validatePicks } from '../../src/forever/talents';

const [combo] = enumerateCombos(40, { fillers: ['drain_life'], minTtk: [6], pets: ['imp'], maxDots: 1 }).filter((c) => c.pets.sacrificed === 'voidwalker' && c.genes.agony && !c.genes.drainSoulFinisher);
const ctx: CompleteCtx = { combo: combo!, baseRanks: ranksAt(loadVariant('DEMO_PACT_R1'), 40), fromLevel: 40, toLevel: 44, profile: 'average', mobs: 1, params: loadParams({ session_pulls: 3 }), sessions: 2, seed: 5 };
const legal = (path: string[]) => validatePicks([...canonicalPicks(ctx.baseRanks), ...path]).ok;

describe('completing a build to a later level', () => {
  const cache = new Map<string, number>();
  const greedy = greedyPath(ctx, cache);
  it('the greedy path has a point per level and is legal', () => {
    expect(greedy).toHaveLength(4);
    expect(legal(greedy)).toBe(true);
  });
  it('the cost is the sum of 1 / kills per hour', () => {
    const { cost, kph } = pathCost(ctx, greedy, cache);
    expect(kph).toHaveLength(4);
    expect(cost).toBeCloseTo(kph.reduce((a, k) => a + 1 / k, 0), 12);
  });
  it('improving never makes the path slower and keeps it legal', () => {
    const better = improvePath(ctx, greedy, 60, createRng(3), cache);
    expect(legal(better)).toBe(true);
    expect(better).toHaveLength(4);
    expect(pathCost(ctx, better, cache).cost).toBeLessThanOrEqual(pathCost(ctx, greedy, cache).cost + 1e-12);
  });
  it('averages kills per hour harmonically', () => {
    expect(harmonicKph([100, 200])).toBeCloseTo(133.333, 2);
  });
  it('has nothing to add at the last level', () => {
    expect(greedyPath({ ...ctx, fromLevel: 44, toLevel: 44, baseRanks: ranksAt(loadVariant('DEMO_PACT_R1'), 44) }, new Map())).toEqual([]);
  });
});
