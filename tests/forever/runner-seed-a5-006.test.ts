// A5-006: the pull seed `sessionSeed * 100003 + i` left the exactly representable integers for large seeds, so
// neighbouring pulls collapsed onto one value. Small seeds keep the old arithmetic (results do not move).
import { describe, expect, it, vi } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { DEFAULT_SETTINGS, MAX_SEED, normalizeSettings } from '../../src/forever/web/api';
import { QUICK_BUDGET, stageSeed, type DiscoverOptions } from '../../src/forever/discover/engine';

const seen: number[] = [];
vi.mock('../../src/forever/fight', async (orig) => {
  const m = await orig<typeof import('../../src/forever/fight')>();
  return { ...m, simulatePull: (cfg: Parameters<typeof m.simulatePull>[0], seed: number) => (seen.push(seed), m.simulatePull(cfg, seed)) };
});
const { runSession } = await import('../../src/forever/runner');

/** The streams the generator really sees: createRng reads `seed >>> 0`. */
const pullSeeds = (sessionSeed: number, pulls = 30): number[] => {
  seen.length = 0;
  runSession({ variant: loadVariant('AFF_WRACK'), level: 40, profile: 'average', params: loadParams({ session_pulls: pulls }) }, sessionSeed);
  return seen.map((s) => s >>> 0);
};

describe('pull seeds (A5-006)', () => {
  it('keep the old formula where it is exact, so existing results do not move', () => {
    for (const s of [1, 2, 7, 42, 101, 100_000, 90_000_000_000]) {
      seen.length = 0;
      runSession({ variant: loadVariant('AFF_WRACK'), level: 40, profile: 'average', params: loadParams({ session_pulls: 5 }) }, s);
      expect(seen, `seed ${s}`).toEqual([0, 1, 2, 3, 4].map((i) => s * 100003 + i));
    }
  });
  it('are distinct for every pull of a session, also for large seeds', () => {
    for (const s of [1, 100_000, 100_000_000_000, 1_000_000_000_000, 2_147_483_647 * 1_000_000 + 1]) {
      expect(new Set(pullSeeds(s)).size, `seed ${s}`).toBe(30);
    }
  });
  it('differ between neighbouring sessions of a large seed', () => {
    const all = [1, 2, 3].flatMap((n) => pullSeeds(1_000_000_000_000 + n, 10));
    expect(new Set(all).size).toBe(30);
  });
});

describe('discover stage seeds (A5-006)', () => {
  const o = (seed: number): DiscoverOptions => ({ level: 40, profile: 'average', mobs: 1, seed, perk: 0, top: 3, params: loadParams(), budget: QUICK_BUDGET }) as DiscoverOptions;
  it('keep the old formula for seeds where it is exact', () => {
    expect(stageSeed(o(1), 'screen')).toBe(1_100_000);
    expect(stageSeed(o(1), 'final')).toBe(1_300_000);
    expect(stageSeed(o(1234), 'search')).toBe(1_234_200_000);
  });
  it('give every session of a stage another stream for the largest CLI seed', () => {
    const seed = 2_147_483_647;
    const streams = new Set<number>();
    for (const stage of ['screen', 'search', 'final'] as const)
      for (let n = 1; n <= 20; n++) for (const s of pullSeeds(stageSeed(o(seed), stage) + n, 5)) streams.add(s);
    expect(streams.size).toBe(3 * 20 * 5);
  });
  it('stay disjoint between stages and from the neighbouring seed', () => {
    for (const seed of [2_147_483_647, 9_100_000_000, 1e12]) {
      const bases = (['screen', 'search', 'final'] as const).map((st) => stageSeed(o(seed), st));
      expect(new Set(bases).size).toBe(3);
      for (const b of bases) expect(Number.isFinite(b) && b >= 0 && Number.isSafeInteger(b + 10_000)).toBe(true);
    }
  });
});

describe('seed validation in the settings (A5-006)', () => {
  it('rounds and clamps the seed to 0..MAX_SEED', () => {
    expect(MAX_SEED).toBe(2_147_483_647);
    expect(normalizeSettings({ seed: 42 }).seed).toBe(42);
    expect(normalizeSettings({ seed: 1.6 }).seed).toBe(2);
    expect(normalizeSettings({ seed: -5 }).seed).toBe(0);
    expect(normalizeSettings({ seed: 1e15 }).seed).toBe(MAX_SEED);
    expect(normalizeSettings({ seed: Number.NaN }).seed).toBe(DEFAULT_SETTINGS.seed);
    expect(normalizeSettings({ seed: Number.POSITIVE_INFINITY }).seed).toBe(DEFAULT_SETTINGS.seed);
  });
});
