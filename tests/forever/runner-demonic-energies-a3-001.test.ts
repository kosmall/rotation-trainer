// A3-001 / A4-002: Life Tap cast between pulls gives the demon the Demonic Energies mana, like a Life Tap in the fight.
import { describe, expect, it, vi } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import type { PullResult } from '../../src/forever/fight';
import type { Ranks } from '../../src/forever/talents';

interface Call { startPetMana: number | undefined; result: PullResult }
const calls: Call[] = [];
vi.mock('../../src/forever/fight', async (orig) => {
  const m = await orig<typeof import('../../src/forever/fight')>();
  return {
    ...m,
    simulatePull: (cfg: Parameters<typeof m.simulatePull>[0], seed: number) => {
      const result = m.simulatePull(cfg, seed);
      calls.push({ startPetMana: cfg.startPetMana, result });
      return result;
    },
  };
});
const { runSession } = await import('../../src/forever/runner');

const LEVEL = 50;
const variant = loadVariant('DEMO_FIRE'); // an Imp, which has no mana regeneration
// Taps between pulls need HP above the rule; the user's 100% is rare in a Life Tap build, so the aggressive between-mobs rule is used.
const session = (ranks: Ranks, seed = 1, pulls = 25): Call[] => {
  calls.length = 0;
  runSession({ variant, level: LEVEL, profile: 'average', params: loadParams({ session_pulls: pulls, lt_between_hp_pct: 0.6, lt_between_mana_pct: 1 }), ranks }, seed);
  return [...calls];
};

/** Demon mana a pull starts with minus what the previous pull left, over the transitions where the demon lived. */
const gains = (cs: Call[]): number[] => {
  const out: number[] = [];
  for (let k = 1; k < cs.length; k++) {
    const prev = cs[k - 1]!.result;
    if (prev.petDied || prev.playerDied) continue;
    out.push((cs[k]!.startPetMana ?? prev.petMaxMana) - prev.endPetMana);
  }
  return out;
};

describe('Life Tap between pulls and Demonic Energies', () => {
  const full = ranksAt(variant, LEVEL);
  it('the build has the talent', () => {
    expect(full.demonic_energies).toBeGreaterThan(0);
  });
  it('feeds the demon with mana', () => {
    const cs0 = session(full);
    const g = gains(cs0);
    expect(g.length).toBeGreaterThan(5);
    expect(g.filter((x) => x > 1).length).toBeGreaterThan(3);
    for (const x of g) expect(x).toBeGreaterThanOrEqual(0);
  });
  it('never fills the demon above its maximum', () => {
    const cs = session(full);
    for (const c of cs) expect(c.result.endPetMana).toBeLessThanOrEqual(c.result.petMaxMana + 1e-9);
    for (const c of cs) expect(c.startPetMana ?? 0).toBeLessThanOrEqual(c.result.petMaxMana + 1e-9);
  });
  it('gives nothing without the talent', () => {
    const none: Ranks = { ...full, demonic_energies: 0 };
    const g = gains(session(none));
    expect(g.length).toBeGreaterThan(5);
    for (const x of g) expect(x).toBe(0);
  });
});
