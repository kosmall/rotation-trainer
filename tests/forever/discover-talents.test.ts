import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { canonicalPicks, freePoints, hillClimb, isLegal, modelledKey, pointDistance, randomMove, randomStart, type TalentSpace } from '../../src/forever/discover/talent-search';
import { pointsAtLevel, TALENT_BY_ID, validatePicks, type Ranks } from '../../src/forever/talents';

const mainTree = (r: Ranks): string => {
  const per: Record<string, number> = { aff: 0, demo: 0, destro: 0 };
  for (const [id, n] of Object.entries(r)) per[TALENT_BY_ID.get(id)!.tree]! += n;
  return Object.entries(per).sort((a, b) => b[1] - a[1])[0]![0];
};

describe('talent search', () => {
  it('draws legal random builds across all three trees', () => {
    const space: TalentSpace = { points: 31, required: {} };
    const rng = createRng(1);
    const trees = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = randomStart(space, rng);
      expect(r).not.toBeNull();
      expect(isLegal(r!, space)).toBe(true);
      expect(validatePicks(canonicalPicks(r!)).ok).toBe(true);
      trees.add(mainTree(r!));
    }
    expect(trees).toEqual(new Set(['aff', 'demo', 'destro']));
  });
  it('stays legal at 51 points', () => {
    const space: TalentSpace = { points: pointsAtLevel(60, 3), required: {} };
    expect(space.points).toBe(51);
    const rng = createRng(2);
    let r = randomStart(space, rng)!;
    expect(isLegal(r, space)).toBe(true);
    for (let i = 0; i < 500; i++) {
      const m = randomMove(r, space, rng);
      if (m) {
        expect(isLegal(m, space)).toBe(true);
        r = m;
      }
    }
  });
  it('keeps the required talents', () => {
    const space: TalentSpace = { points: 31, required: { wrack: 1 } };
    const rng = createRng(3);
    for (let i = 0; i < 30; i++) {
      let r = randomStart(space, rng)!;
      expect(r.wrack).toBeGreaterThanOrEqual(1);
      for (let j = 0; j < 50; j++) r = randomMove(r, space, rng) ?? r;
      expect(r.wrack).toBeGreaterThanOrEqual(1);
    }
  });
  it('gives up when the required talents cannot fit', () => {
    const space: TalentSpace = { points: 21, required: { wrack: 1 } };
    expect(randomStart(space, createRng(4))).toBeNull();
    expect(hillClimb({ space, evaluate: () => 1, starts: 2, evals: 10, rng: createRng(4), keep: 3 })).toEqual([]);
  });
  it('climbs to the best ranks and evaluates each build once', () => {
    const seen = new Map<string, number>();
    const evaluate = (r: Ranks): number => {
      const k = modelledKey(r);
      seen.set(k, (seen.get(k) ?? 0) + 1);
      return (r.improved_corruption ?? 0) * 10 + (r.shadow_mastery ?? 0);
    };
    const res = hillClimb({ space: { points: 31, required: {} }, evaluate, starts: 4, evals: 400, rng: createRng(5), keep: 3 });
    expect(res[0]!.ranks.improved_corruption).toBe(5);
    expect(res.length).toBe(3);
    expect(new Set(res.map((x) => modelledKey(x.ranks))).size).toBe(3);
    expect(res[0]!.kph).toBeGreaterThanOrEqual(res[1]!.kph);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    expect([...seen.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(400);
  });
  it('is deterministic for a seed', () => {
    const o = (seed: number) => hillClimb({ space: { points: 31, required: {} }, evaluate: (r) => r.bane ?? 0, starts: 2, evals: 50, rng: createRng(seed), keep: 2 });
    expect(o(9)).toEqual(o(9));
  });
  it('measures distance and dead points', () => {
    expect(pointDistance({ a: 2 }, { b: 2 })).toBe(2);
    expect(pointDistance({ a: 2, b: 1 }, { a: 1, b: 2 })).toBe(1);
    expect(freePoints({ grim_reach: 2, bane: 3 })).toBe(2);
    expect(modelledKey({ grim_reach: 2, bane: 3, ruin: 0 })).toBe('bane:3');
  });
});
