import { describe, expect, it } from 'vitest';
import { SCENARIO_IDS, VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { discover, inlineRunner, pickTop, QUICK_BUDGET, runTask, stageSeed, stateHash, type DiscoverOptions, type DiscoverState, type Runner, type Task } from '../../src/forever/discover/engine';
import { effectiveKey, enumerateCombos, type SpaceFilter } from '../../src/forever/discover/space';
import { isLegal } from '../../src/forever/discover/talent-search';
import type { CellMetrics } from '../../src/forever/runner';
import { pointsAtLevel, type Ranks } from '../../src/forever/talents';

const space: SpaceFilter = { fillers: ['sb_r1', 'drain_life'], minTtk: [6], pets: ['voidwalker', 'succubus'], sacrifice: false, maxDots: 2 };
const opts = (over: Partial<DiscoverOptions> = {}): DiscoverOptions => ({
  level: 40, profile: 'average', mobs: 1, seed: 1, perk: 0, top: 10,
  params: loadParams({ session_pulls: 4 }),
  budget: { ...QUICK_BUDGET, keep: 8, final: 6, finalSessions: 6 },
  space, ...over,
});

const reversed = (o: DiscoverOptions): Runner => async (tasks, onDone) => {
  const out = new Array(tasks.length);
  for (let i = tasks.length - 1; i >= 0; i--) {
    out[i] = runTask(o, tasks[i] as Task);
    onDone(out[i]);
  }
  return out;
};

describe('discovery engine', async () => {
  const o = opts();
  const res = await discover(o, inlineRunner(o));

  it('returns ranked, legal, diverse rows', () => {
    expect(res.top.length).toBeGreaterThan(0);
    expect(res.top.length).toBeLessThanOrEqual(10);
    expect(res.top.map((r) => r.rank)).toEqual(res.top.map((_, i) => i + 1));
    const per = new Map<string, number>();
    for (const r of res.top) {
      expect(isLegal(r.ranks, { points: pointsAtLevel(40), required: {} })).toBe(true);
      const k = effectiveKey(r.combo, 40, r.ranks);
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    expect(Math.max(...per.values())).toBeLessThanOrEqual(2);
    expect(res.meta.points).toBe(31);
    expect(res.meta.combos).toBe(enumerateCombos(40, space).length);
  });
  it('has every known build in the baseline', () => {
    expect(res.baseline.map((b) => b.id).sort()).toEqual([...VARIANT_IDS, ...SCENARIO_IDS].sort());
  });
  it('fills the comparison columns', () => {
    const first = res.top[0]!;
    expect(first.tiedWithFirst).toBe(false);
    expect(first.kphCi[0]).toBeLessThanOrEqual(first.metrics.killsPerHour);
    expect(first.kphCi[1]).toBeGreaterThanOrEqual(first.metrics.killsPerHour);
    expect(VARIANT_IDS.concat(SCENARIO_IDS)).toContain(first.nearestKnown.id);
    expect(first.perTree.aff + first.perTree.demo + first.perTree.destro).toBe(31);
    expect(Array.isArray(first.insensitive)).toBe(true);
  });
  it('does not depend on the order tasks finish in', async () => {
    const again = await discover(o, reversed(o));
    expect(again.top).toEqual(res.top);
  });
  it('resumes from a saved state and starts over when the inputs change', async () => {
    let saved: DiscoverState | undefined;
    await discover(o, inlineRunner(o), { save: (s) => (saved = structuredClone(s)) });
    expect(saved?.hash).toBe(stateHash(o));
    const kinds: string[] = [];
    const spy = (oo: DiscoverOptions): Runner => async (tasks, onDone) => {
      for (const t of tasks) kinds.push(t.kind === 'search' ? t.stage : t.kind);
      return inlineRunner(oo)(tasks, onDone);
    };
    const resumed = await discover(o, spy(o), { state: saved });
    expect(kinds).not.toContain('screen');
    expect(kinds).not.toContain('search');
    expect(resumed.top).toEqual(res.top);
    kinds.length = 0;
    const changed = opts({ params: loadParams({ session_pulls: 4, mob_hp_mult: 1.1 }) });
    expect(stateHash(changed)).not.toBe(stateHash(o));
    await discover(changed, spy(changed), { state: saved });
    expect(kinds).toContain('screen');
  });
  it('copes with a low level', async () => {
    const lo = opts({ level: 20, space: { fillers: ['sb_r1', 'wrack'], minTtk: [6], pets: ['succubus', 'felhunter'], sacrifice: false, maxDots: 1 } });
    const r = await discover(lo, inlineRunner(lo));
    expect(r.meta.points).toBe(11);
    for (const row of r.top) {
      expect(row.combo.pets.pet).not.toBe('felhunter');
      expect(row.combo.genes.filler).not.toBe('wrack');
    }
  });
});

describe('fills the requested top when enough distinct results exist', async () => {
  const o = opts({ top: 6 });
  const res = await discover(o, inlineRunner(o));
  it('returns 6 rows', () => expect(res.top).toHaveLength(6));
});

describe('session seeds', () => {
  it('never share sessions between stages or between seeds', () => {
    const o = opts({ budget: { ...QUICK_BUDGET, finalSessions: 10000, search: { starts: 1, evals: 1, sessions: 1000 }, screen: { starts: 1, evals: 1, sessions: 1000 } } });
    const range = (s: number, n: number): [number, number] => [s + 1, s + n];
    const ranges = [1, 2].flatMap((seed) => {
      const x = { ...o, seed };
      return [range(stageSeed(x, 'screen'), 1000), range(stageSeed(x, 'search'), 1000), range(stageSeed(x, 'final'), 10000)];
    });
    for (let i = 0; i < ranges.length; i++)
      for (let j = i + 1; j < ranges.length; j++) {
        const [a, b] = [ranges[i]!, ranges[j]!];
        expect(a[1] < b[0] || b[1] < a[0], `${a} vs ${b}`).toBe(true);
      }
  });
});

describe('pickTop', () => {
  const m = (kph: number): CellMetrics => ({ killsPerHour: kph, deathsPerHour: 0 }) as CellMetrics;
  const combo = enumerateCombos(40, { fillers: ['sb_r1'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 0 })[0]!;
  it('keeps at most two rows of a combination, the second only when it differs by more than 2 points', () => {
    const base = { bane: 5, ruin: 1 };
    const rows: { combo: typeof combo; ranks: Ranks; metrics: CellMetrics; effKey: string }[] = [
      { combo, ranks: { ...base, aftermath: 1 }, metrics: m(100), effKey: 'k' },
      { combo, ranks: { ...base, cataclysm: 1 }, metrics: m(99), effKey: 'k' },
      { combo, ranks: { improved_shadow_bolt: 5, ruin: 1, aftermath: 1 }, metrics: m(98), effKey: 'k' },
      { combo, ranks: { improved_shadow_bolt: 4, ruin: 1, aftermath: 2 }, metrics: m(97), effKey: 'k' },
    ];
    expect(pickTop(rows, 20).map((r) => r.metrics.killsPerHour)).toEqual([100, 98]);
  });
  it('does not count dead points as a difference', () => {
    const rows: { combo: typeof combo; ranks: Ranks; metrics: CellMetrics; effKey: string }[] = [
      { combo, ranks: { bane: 5, aftermath: 2, grim_reach: 2 }, metrics: m(100), effKey: 'k' },
      { combo, ranks: { bane: 5, aftermath: 1, cataclysm: 1, amplify_curse: 1, curse_of_exhaustion: 1 }, metrics: m(99), effKey: 'k' },
    ];
    expect(pickTop(rows, 20)).toHaveLength(1);
  });
});
