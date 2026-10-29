import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { HitOutcome, LogEvent, LogType, SpellDef, TargetData } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

const ALWAYS_MISS: TargetData = { ...TEST_TARGET, missPct: 100, minMissPct: 100 };

interface Opts {
  spec?: SpecData;
  target?: TargetData;
  durationMs?: number;
  /** Defaults to 28 (1400 ms at the fixture's 20 yd/s); null leaves the field unset. */
  distanceFromTarget?: number | null;
  spellQueueWindowMs?: number;
  seed?: number;
}

function newSim(opts: Opts = {}): Simulation {
  const distance = opts.distanceFromTarget === undefined ? 28 : opts.distanceFromTarget;
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: opts.target ?? TEST_TARGET,
    seed: opts.seed ?? 1,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    ...(distance !== null ? { distanceFromTarget: distance } : {}),
    ...(opts.spellQueueWindowMs !== undefined ? { spellQueueWindowMs: opts.spellQueueWindowMs } : {}),
  });
}

/** The fixture with some fields of the named spells replaced. */
function patchedSpec(patch: Record<string, Partial<SpellDef>>, overrides: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec(overrides);
  return { ...base, spells: base.spells.map((s) => ({ ...s, ...(patch[s.id] ?? {}) })) };
}

function ofType(sim: Simulation, ...types: LogType[]): LogEvent[] {
  return sim.log().filter((e) => types.includes(e.type));
}

describe('fixture missile spells', () => {
  it('lob and slowdot fly at 20 yd/s; zap has no missile', () => {
    const byId = new Map(makeTestSpec().spells.map((s) => [s.id, s]));
    expect(byId.get('lob')).toMatchObject({ castTimeMs: 1000, school: 'shadow', manaCost: 0, missileSpeed: 20 });
    expect(byId.get('lob')?.direct).toEqual({ min: 100, max: 100, coeff: 0 });
    expect(byId.get('slowdot')).toMatchObject({
      castTimeMs: 0,
      onGcd: true,
      missileSpeed: 20,
      applyAura: { auraId: 'dotAura', on: 'target' },
    });
    expect(byId.get('zap')?.missileSpeed).toBeUndefined();
  });
});

describe('Simulation projectile travel (distanceFromTarget 28 → 1400 ms)', () => {
  it('lob cast at 0 completes at 1000, damage lands at 2400 and not before', () => {
    const sim = newSim();
    expect(sim.cast('lob')).toEqual({ ok: true });
    sim.advanceTo(1000);
    expect(ofType(sim, 'cast-complete')).toEqual([{ atMs: 1000, type: 'cast-complete', spellId: 'lob' }]);
    sim.advanceTo(2399);
    expect(ofType(sim, 'damage')).toEqual([]);
    expect(sim.snapshot().damageTotal).toBe(0);
    sim.advanceTo(2400);
    expect(ofType(sim, 'damage')).toEqual([{ atMs: 2400, type: 'damage', spellId: 'lob', amount: 100, crit: false }]);
    expect(sim.snapshot().damageTotal).toBe(100);
  });

  it('log order is cast-complete 1000, impact 2400, damage 2400', () => {
    const sim = newSim();
    sim.cast('lob');
    sim.advanceTo(5000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'lob' },
      { atMs: 1000, type: 'cast-complete', spellId: 'lob' },
      { atMs: 2400, type: 'impact', spellId: 'lob' },
      { atMs: 2400, type: 'damage', spellId: 'lob', amount: 100, crit: false },
    ]);
  });

  it('snapshot().inFlight lists lob with landsAtMs 2400 between 1000 and 2400, empty after', () => {
    const sim = newSim();
    expect(sim.snapshot().inFlight).toEqual([]);
    sim.cast('lob');
    sim.advanceTo(999);
    expect(sim.snapshot().inFlight).toEqual([]);
    sim.advanceTo(1000);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'lob', landsAtMs: 2400 }]);
    sim.advanceTo(2399);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'lob', landsAtMs: 2400 }]);
    sim.advanceTo(2400);
    expect(sim.snapshot().inFlight).toEqual([]);
  });

  it('inFlight is sorted by landsAtMs, not by launch order', () => {
    // slowdot at 40 yd/s takes 700 ms: launched at 1500 after lob (launched at 1000), it lands first.
    const sim = newSim({ spec: patchedSpec({ slowdot: { missileSpeed: 40 } }) });
    sim.cast('lob');
    sim.advanceTo(1500);
    expect(sim.cast('slowdot')).toEqual({ ok: true });
    expect(sim.snapshot().inFlight).toEqual([
      { spellId: 'slowdot', landsAtMs: 2200 },
      { spellId: 'lob', landsAtMs: 2400 },
    ]);
    // The snapshot is a copy.
    sim.snapshot().inFlight.pop();
    expect(sim.snapshot().inFlight).toHaveLength(2);
    sim.advanceTo(2200);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'lob', landsAtMs: 2400 }]);
  });

  it('the hook (use makeTestSpec hooks) runs at impact, not at cast end', () => {
    const calls: { atMs: number; spellId: string; outcome: HitOutcome; damage: number }[] = [];
    let sim: Simulation | null = null;
    sim = newSim({
      spec: makeTestSpec({
        hooks: {
          onSpellResolved(e) {
            calls.push({ atMs: sim?.snapshot().nowMs ?? -1, ...e });
          },
        },
      }),
    });
    sim.cast('lob');
    sim.advanceTo(2399);
    expect(calls).toEqual([]);
    sim.advanceTo(2400);
    expect(calls).toEqual([{ atMs: 2400, spellId: 'lob', outcome: 'hit', damage: 100 }]);
  });

  it('stats and modifiers at impact time are used (a damage buff cast while lob flies counts)', () => {
    const sim = newSim();
    sim.cast('lob');
    sim.advanceTo(1500);
    sim.cast('dmgUp'); // shadow damage x1.5 from 1500 to 11500
    sim.advanceTo(2400);
    expect(ofType(sim, 'damage')).toEqual([{ atMs: 2400, type: 'damage', spellId: 'lob', amount: 150, crit: false }]);
  });

  it('slowdot applies dotAura at impact and the ticks start from the impact', () => {
    const sim = newSim();
    const maxMana = sim.snapshot().maxMana;
    sim.cast('slowdot');
    // The cost is spent at cast end (instant: at once), not at impact.
    expect(sim.snapshot().mana).toBe(maxMana - 30);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'slowdot', landsAtMs: 1400 }]);
    sim.advanceTo(1399);
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.advanceTo(1400);
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(6000);
    sim.advanceTo(10000);
    expect(ofType(sim, 'cast-complete', 'impact', 'aura-apply', 'tick', 'aura-fade')).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'slowdot' },
      { atMs: 1400, type: 'impact', spellId: 'slowdot' },
      { atMs: 1400, type: 'aura-apply', spellId: 'slowdot', auraId: 'dotAura' },
      { atMs: 3400, type: 'tick', spellId: 'slowdot', auraId: 'dotAura', amount: 100 },
      { atMs: 5400, type: 'tick', spellId: 'slowdot', auraId: 'dotAura', amount: 100 },
      { atMs: 7400, type: 'tick', spellId: 'slowdot', auraId: 'dotAura', amount: 100 },
      { atMs: 7400, type: 'aura-fade', auraId: 'dotAura' },
    ]);
  });

  it('a miss at impact applies no aura', () => {
    const sim = newSim({ target: ALWAYS_MISS });
    sim.cast('slowdot');
    sim.advanceTo(10000);
    expect(ofType(sim, 'impact', 'miss', 'aura-apply', 'tick')).toEqual([
      { atMs: 1400, type: 'impact', spellId: 'slowdot' },
      { atMs: 1400, type: 'miss', spellId: 'slowdot' },
    ]);
    expect(sim.snapshot().targetAuras).toEqual({});
  });

  it('slowdot pressed again while the first is in flight: both land, the second refreshes at its impact (queue window 0 and 400)', () => {
    // 40 yd → 2000 ms travel: the first slowdot lands at 2000, after the GCD (1500) ends.
    for (const spellQueueWindowMs of [0, 400]) {
      const sim = newSim({ distanceFromTarget: 40, spellQueueWindowMs });
      sim.cast('slowdot');
      sim.advanceTo(spellQueueWindowMs === 0 ? 1500 : 1100);
      expect(sim.cast('slowdot').ok).toBe(true);
      sim.advanceTo(1500);
      expect(sim.snapshot().targetAuras).toEqual({});
      expect(sim.snapshot().inFlight).toEqual([
        { spellId: 'slowdot', landsAtMs: 2000 },
        { spellId: 'slowdot', landsAtMs: 3500 },
      ]);
      sim.advanceTo(12000);
      expect(ofType(sim, 'impact', 'aura-apply', 'tick', 'aura-fade').map((e) => [e.atMs, e.type])).toEqual([
        [2000, 'impact'],
        [2000, 'aura-apply'],
        [3500, 'impact'],
        [3500, 'aura-apply'],
        [5500, 'tick'],
        [7500, 'tick'],
        [9500, 'tick'],
        [9500, 'aura-fade'],
      ]);
    }
  });

  it('a lob landing exactly at durationMs counts (durationMs 2400)', () => {
    const sim = newSim({ durationMs: 2400 });
    sim.cast('lob');
    sim.advanceTo(2400);
    expect(sim.snapshot().phase).toBe('ended');
    expect(sim.snapshot().damageTotal).toBe(100);
    expect(ofType(sim, 'impact', 'damage').map((e) => [e.atMs, e.type])).toEqual([
      [2400, 'impact'],
      [2400, 'damage'],
    ]);
    expect(sim.snapshot().inFlight).toEqual([]);
  });

  it('one ms later does not (durationMs 2399) and inFlight is empty after the end', () => {
    const sim = newSim({ durationMs: 2399 });
    sim.cast('lob');
    sim.advanceTo(2398);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'lob', landsAtMs: 2400 }]);
    sim.advanceTo(2399);
    expect(sim.snapshot().phase).toBe('ended');
    expect(sim.snapshot().inFlight).toEqual([]);
    sim.advanceTo(5000);
    expect(sim.snapshot().damageTotal).toBe(0);
    expect(ofType(sim, 'impact', 'damage', 'miss')).toEqual([]);
    expect(sim.snapshot().inFlight).toEqual([]);
  });

  it('a jump past the end also discards the missile', () => {
    const sim = newSim({ durationMs: 2399 });
    sim.cast('lob');
    sim.advanceTo(100000);
    expect(sim.snapshot().nowMs).toBe(2399);
    expect(sim.snapshot().inFlight).toEqual([]);
    expect(ofType(sim, 'impact', 'damage')).toEqual([]);
  });

  it('cancelCast after the cast completed does not stop the missile', () => {
    const sim = newSim();
    sim.cast('lob');
    sim.advanceTo(1200);
    sim.cancelCast(); // nothing being cast: a no-op
    sim.advanceTo(1500);
    sim.cast('lob'); // the second lob: casting 1500-2500
    sim.advanceTo(2000);
    sim.cancelCast(); // cancels the second lob only
    sim.advanceTo(5000);
    expect(ofType(sim, 'cast-cancel', 'impact', 'damage')).toEqual([
      { atMs: 2000, type: 'cast-cancel', spellId: 'lob' },
      { atMs: 2400, type: 'impact', spellId: 'lob' },
      { atMs: 2400, type: 'damage', spellId: 'lob', amount: 100, crit: false },
    ]);
    expect(sim.snapshot().damageTotal).toBe(100);
  });

  it('distanceFromTarget 0 or unset: lob damage lands at cast end and no impact entry is logged', () => {
    for (const distanceFromTarget of [0, null]) {
      const sim = newSim({ distanceFromTarget });
      sim.cast('lob');
      sim.advanceTo(999);
      expect(sim.snapshot().inFlight).toEqual([]);
      sim.advanceTo(1000);
      expect(sim.snapshot().inFlight).toEqual([]);
      sim.advanceTo(5000);
      expect(sim.log()).toEqual([
        { atMs: 0, type: 'cast-start', spellId: 'lob' },
        { atMs: 1000, type: 'cast-complete', spellId: 'lob' },
        { atMs: 1000, type: 'damage', spellId: 'lob', amount: 100, crit: false },
      ]);
    }
  });

  it('one advanceTo(60000) equals 70 ms steps', () => {
    // Several lobs and slowdots; the last lob (completes 59500) would land at 60900: discarded.
    const script: [number, string][] = [
      [0, 'lob'],
      [1500, 'slowdot'],
      [3000, 'lob'],
      [4100, 'dmgUp'],
      [4500, 'lob'],
      [6001, 'needy'],
      [7777, 'lob'],
      [20000, 'slowdot'],
      [21500, 'lob'],
      [57000, 'slowdot'],
      [58500, 'lob'],
    ];
    const run = (stepMs: number | null) => {
      const sim = newSim({ target: { ...TEST_TARGET, missPct: 25 }, seed: 7 });
      let t = 0;
      for (const [atMs, spellId] of script) {
        if (stepMs !== null) for (; t + stepMs < atMs; t += stepMs) sim.advanceTo(t + stepMs);
        sim.advanceTo(atMs);
        t = atMs;
        sim.cast(spellId);
      }
      if (stepMs !== null) for (; t < 60000; t += stepMs) sim.advanceTo(t + stepMs);
      sim.advanceTo(60000);
      return sim;
    };
    const jump = run(null);
    const steps = run(70);
    expect(steps.snapshot()).toEqual(jump.snapshot());
    expect(steps.log()).toEqual(jump.log());
    expect(jump.snapshot().inFlight).toEqual([]);
    const impacts = ofType(jump, 'impact').map((e) => e.atMs);
    expect(impacts).toEqual([2400, 2900, 5400, 6900, 10177, 21400, 23900, 58400]);
  });

  it('a spell without missileSpeed (zap) is unchanged', () => {
    const play = (distanceFromTarget: number | null) => {
      const sim = newSim({ distanceFromTarget, target: { ...TEST_TARGET, missPct: 25 }, seed: 3 });
      sim.cast('zap');
      sim.advanceTo(1500);
      sim.cast('dot');
      sim.advanceTo(3000);
      sim.cast('bolt');
      sim.advanceTo(9000);
      sim.cast('zap');
      sim.advanceTo(20000);
      return sim;
    };
    const near = play(null);
    const far = play(28);
    expect(far.log()).toEqual(near.log());
    expect(far.snapshot()).toEqual(near.snapshot());
    expect(ofType(far, 'impact')).toEqual([]);
    // The first zap resolves at its cast end (0): hit or miss, in the same ms.
    expect(far.log().filter((e) => e.spellId === 'zap' && e.atMs === 0).map((e) => e.type)).toEqual([
      'cast-complete',
      expect.stringMatching(/^(damage|miss)$/),
    ]);
  });
});

