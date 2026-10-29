import { describe, expect, it } from 'vitest';
import { HASTE_RATING_PER_PCT, MIN_GCD_MS } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

function newSim(spec: SpecData = makeTestSpec(), infiniteMana = false): Simulation {
  return new Simulation({ spec, target: TEST_TARGET, seed: 1, infiniteMana });
}

/** The fixture with `hasteRating` set to `pct` percent haste. */
function hastedSpec(pct: number): SpecData {
  const spec = makeTestSpec();
  return { ...spec, setup: { ...spec.setup, stats: { ...spec.setup.stats, hasteRating: HASTE_RATING_PER_PCT * pct } } };
}

describe('SimSnapshot effective spell values', () => {
  it('lists every spell with its base cost and cast time when nothing modifies them, and the base GCD', () => {
    const s = newSim().snapshot();
    expect(Object.keys(s.spells)).toEqual(Object.keys(s.cooldownRemainingMs));
    expect(s.spells.bolt).toEqual({ manaCost: 50, castTimeMs: 2000 });
    expect(s.spells.zap).toEqual({ manaCost: 20, castTimeMs: 0 });
    expect(s.gcdMs).toBe(1500);
  });

  it('cast time and GCD with 10% haste: round(2000 / 1.1) and round(1500 / 1.1)', () => {
    const s = newSim(hastedSpec(10)).snapshot();
    expect(s.spells.bolt?.castTimeMs).toBe(1818);
    expect(s.spells.zap?.castTimeMs).toBe(0);
    expect(s.gcdMs).toBe(1364);
  });

  it('the GCD never goes below MIN_GCD_MS', () => {
    const s = newSim(hastedSpec(100)).snapshot();
    expect(s.gcdMs).toBe(MIN_GCD_MS);
    expect(s.spells.bolt?.castTimeMs).toBe(1000);
  });

  it('cost and cast time include the spec modifiers (manaCostMult, castTimeMsDelta)', () => {
    const spec = makeTestSpec({ modifiers: [{ spellIds: ['bolt'], manaCostMult: 0.95, castTimeMsDelta: -500 }] });
    const s = newSim(spec).snapshot();
    expect(s.spells.bolt).toEqual({ manaCost: 47.5, castTimeMs: 1500 });
    expect(s.spells.zap).toEqual({ manaCost: 20, castTimeMs: 0 });
  });

  it('with infiniteMana every cost is 0', () => {
    const s = newSim(makeTestSpec(), true).snapshot();
    expect(s.spells.bolt?.manaCost).toBe(0);
    expect(s.spells.zap?.manaCost).toBe(0);
  });

  it('follows a self haste aura as it applies and fades', () => {
    const sim = newSim();
    sim.cast('hasteUp'); // +10% haste until 10000
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(1818);
    expect(sim.snapshot().gcdMs).toBe(1364);
    sim.advanceTo(10000);
    expect(sim.snapshot().selfAuras.hasteUp).toBeUndefined();
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(2000);
    expect(sim.snapshot().gcdMs).toBe(1500);
  });
});
