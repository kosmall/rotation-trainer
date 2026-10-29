import { describe, expect, it } from 'vitest';
import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { createRng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, HitOutcome, LogEvent, SetBonusDef, SpecHooks, SpellDef, TargetData } from '../../src/engine/types';
import { TEST_TARGET, boltCritProcHooks, makeTestSpec } from '../fixtures/testSpec';

const ALWAYS_MISS: TargetData = { ...TEST_TARGET, missPct: 100, minMissPct: 100 };

/** infiniteMana by default: nothing is spent, so no regen entries clutter the pinned logs. */
function newSim(
  opts: { spec?: SpecData; target?: TargetData; seed?: number; infiniteMana?: boolean } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: opts.target ?? TEST_TARGET,
    seed: opts.seed ?? 1,
    infiniteMana: opts.infiniteMana ?? true,
  });
}

/** The fixture spec with some spells or auras patched and extra auras appended. */
function patchedSpec(
  p: {
    spells?: Record<string, Partial<SpellDef>>;
    auras?: Record<string, Partial<AuraDef>>;
    extraAuras?: AuraDef[];
    critPct?: number;
  },
  spec: Partial<SpecData> = {},
): SpecData {
  const base = makeTestSpec();
  const stats =
    p.critPct === undefined
      ? base.setup.stats
      : { ...base.setup.stats, critRating: (p.critPct - BASE_CRIT_PCT) * CRIT_RATING_PER_PCT };
  return makeTestSpec({
    spells: base.spells.map((s) => ({ ...s, ...p.spells?.[s.id] })),
    auras: [...base.auras.map((a) => ({ ...a, ...p.auras?.[a.id] })), ...(p.extraAuras ?? [])],
    setup: { ...base.setup, stats },
    ...spec,
  });
}

/**
 * The fixture proc hook, with bolt always critting (critPctDelta 100 on bolt only, so other
 * spells never crit) and zap's cooldown removed so it can be pressed on every GCD.
 */
function procSpec(): SpecData {
  return patchedSpec(
    { spells: { zap: { cooldownMs: 0 } } },
    { hooks: boltCritProcHooks(), modifiers: [{ spellIds: ['bolt'], critPctDelta: 100 }] },
  );
}

type HookCall = { spellId: string; outcome: HitOutcome; damage: number };

function recordingHooks(calls: HookCall[]): SpecHooks {
  return {
    onSpellResolved(e) {
      calls.push({ ...e });
    },
  };
}

function ofType(sim: Simulation, type: LogEvent['type']): LogEvent[] {
  return sim.log().filter((e) => e.type === type);
}

function fadesOf(sim: Simulation, auraId: string): number[] {
  return ofType(sim, 'aura-fade')
    .filter((e) => e.auraId === auraId)
    .map((e) => e.atMs);
}

describe('Simulation spec hooks', () => {
  it('hook is called with outcome and damage for hit, crit and miss', () => {
    function play(spec: SpecData, target: TargetData) {
      const calls: HookCall[] = [];
      const damageTotalSeen: number[] = [];
      let sim: Simulation | undefined;
      const hooks: SpecHooks = {
        onSpellResolved(e) {
          calls.push({ ...e });
          // The hook runs after the spell's damage is applied.
          damageTotalSeen.push(sim?.snapshot().damageTotal ?? -1);
        },
      };
      sim = newSim({ spec: { ...spec, hooks }, target });
      expect(sim.cast('bolt')).toEqual({ ok: true });
      sim.advanceTo(1999);
      expect(calls).toEqual([]);
      sim.advanceTo(2000);
      return { calls, damageTotalSeen };
    }

    expect(play(makeTestSpec(), TEST_TARGET)).toEqual({
      calls: [{ spellId: 'bolt', outcome: 'hit', damage: 100 }],
      damageTotalSeen: [100],
    });
    expect(play(patchedSpec({ critPct: 100 }), TEST_TARGET)).toEqual({
      calls: [{ spellId: 'bolt', outcome: 'crit', damage: 150 }],
      damageTotalSeen: [150],
    });
    expect(play(makeTestSpec(), ALWAYS_MISS)).toEqual({
      calls: [{ spellId: 'bolt', outcome: 'miss', damage: 0 }],
      damageTotalSeen: [0],
    });
  });

  it('crit of bolt applies procAura on target', () => {
    const sim = newSim({ spec: procSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000);
    expect(sim.snapshot().targetAuras).toEqual({
      procAura: { auraId: 'procAura', stacks: 1, charges: 2, remainingMs: 12000 },
    });
    // A second crit hits for 150 × 1.2 (consuming a charge), then re-applies procAura: charges
    // back to 2, duration restarted.
    sim.cast('bolt');
    sim.advanceTo(4000);
    expect(sim.snapshot().targetAuras).toEqual({
      procAura: { auraId: 'procAura', stacks: 1, charges: 2, remainingMs: 12000 },
    });
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 150, crit: true },
      { atMs: 2000, type: 'aura-apply', spellId: 'bolt', auraId: 'procAura' },
      { atMs: 2000, type: 'cast-start', spellId: 'bolt' },
      { atMs: 4000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 4000, type: 'damage', spellId: 'bolt', amount: 180, crit: true },
      { atMs: 4000, type: 'aura-apply', spellId: 'bolt', auraId: 'procAura' },
    ]);
    sim.advanceTo(30000);
    expect(fadesOf(sim, 'procAura')).toEqual([16000]);
  });

  it('a bolt that does not crit applies no procAura', () => {
    const sim = newSim({ spec: makeTestSpec({ hooks: boltCritProcHooks() }) });
    sim.cast('bolt');
    sim.advanceTo(2000);
    expect(ofType(sim, 'damage')).toEqual([
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
    ]);
    expect(sim.snapshot().targetAuras).toEqual({});
  });

  it('charged aura multiplies the next 2 shadow hits by 1.2, then disappears; the third hit is unmodified', () => {
    const sim = newSim({ spec: procSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000);
    sim.cast('zap');
    expect(sim.snapshot().targetAuras.procAura?.charges).toBe(1);
    sim.advanceTo(3500);
    sim.cast('zap');
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.advanceTo(5000);
    sim.cast('zap');
    sim.advanceTo(30000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 150, crit: true },
      { atMs: 2000, type: 'aura-apply', spellId: 'bolt', auraId: 'procAura' },
      { atMs: 2000, type: 'cast-complete', spellId: 'zap' },
      { atMs: 2000, type: 'damage', spellId: 'zap', amount: 60, crit: false },
      { atMs: 3500, type: 'cast-complete', spellId: 'zap' },
      { atMs: 3500, type: 'damage', spellId: 'zap', amount: 60, crit: false },
      { atMs: 3500, type: 'aura-fade', auraId: 'procAura' },
      { atMs: 5000, type: 'cast-complete', spellId: 'zap' },
      { atMs: 5000, type: 'damage', spellId: 'zap', amount: 50, crit: false },
    ]);
    expect(sim.snapshot().damageTotal).toBe(150 + 60 + 60 + 50);
  });

  it('a fire hit does not consume a charge', () => {
    const sim = newSim({ spec: procSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000);
    sim.cast('scorch');
    expect(sim.snapshot().targetAuras.procAura?.charges).toBe(2);
    sim.advanceTo(3500);
    sim.cast('zap');
    expect(sim.snapshot().targetAuras.procAura?.charges).toBe(1);
    expect(ofType(sim, 'damage').map((e) => [e.atMs, e.spellId, e.amount])).toEqual([
      [2000, 'bolt', 150],
      [2000, 'scorch', 100],
      [3500, 'zap', 60],
    ]);
  });

  it('DoT ticks of a matching school are multiplied and each consumes a charge', () => {
    const sim = newSim({ spec: procSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000);
    sim.cast('dot');
    sim.advanceTo(30000);
    expect(ofType(sim, 'tick').map((e) => [e.atMs, e.amount])).toEqual([
      [4000, 120],
      [6000, 120],
      [8000, 100],
    ]);
    // The second tick spends the last charge: procAura fades right after it, once.
    const at6000 = sim.log().filter((e) => e.atMs === 6000);
    expect(at6000).toEqual([
      { atMs: 6000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 120 },
      { atMs: 6000, type: 'aura-fade', auraId: 'procAura' },
    ]);
    expect(fadesOf(sim, 'procAura')).toEqual([6000]);
  });

  it('hook is also called for a pure-aura spell (dot) with no direct damage', () => {
    const calls: HookCall[] = [];
    const dotUpInHook: boolean[] = [];
    const hooks: SpecHooks = {
      onSpellResolved(e, api) {
        calls.push({ ...e });
        dotUpInHook.push(api.hasTargetAura('dotAura'));
      },
    };
    const sim = newSim({ spec: makeTestSpec({ hooks }) });
    sim.cast('dot');
    expect(calls).toEqual([{ spellId: 'dot', outcome: 'hit', damage: 0 }]);
    // The hook runs after the spell's aura is applied.
    expect(dotUpInHook).toEqual([true]);
    sim.cast('free');
    expect(calls[1]).toEqual({ spellId: 'free', outcome: 'hit', damage: 0 });
    // DoT ticks are not completed spells: no hook calls for them.
    sim.advanceTo(10000);
    expect(ofType(sim, 'tick')).toHaveLength(3);
    expect(calls).toHaveLength(2);

    const missCalls: HookCall[] = [];
    const missed = newSim({ spec: makeTestSpec({ hooks: recordingHooks(missCalls) }), target: ALWAYS_MISS });
    missed.cast('dot');
    expect(missCalls).toEqual([{ spellId: 'dot', outcome: 'miss', damage: 0 }]);
  });

  it('api.roll() is deterministic for a seed and hasSelfAura/hasTargetAura reflect current auras', () => {
    const buff: AuraDef = { id: 'buff', name: 'Buff', icon: 'test', durationMs: 3000 };
    function play(seed: number) {
      const rolls: number[] = [];
      const seen: { spellId: string; self: boolean; target: boolean }[] = [];
      const hooks: SpecHooks = {
        onSpellResolved(e, api) {
          rolls.push(api.roll());
          seen.push({ spellId: e.spellId, self: api.hasSelfAura('buff'), target: api.hasTargetAura('weak') });
          if (e.spellId === 'free' && !api.hasSelfAura('buff')) api.applySelfAura('buff');
        },
      };
      const sim = newSim({ spec: patchedSpec({ extraAuras: [buff] }, { hooks }), seed });
      sim.cast('free');
      expect(sim.snapshot().selfAuras).toEqual({ buff: { auraId: 'buff', stacks: 1, charges: 0, remainingMs: 3000 } });
      sim.cast('curse');
      sim.advanceTo(3000);
      sim.cast('free');
      return { rolls, seen, log: sim.log() };
    }

    const a = play(7);
    expect(a.seen).toEqual([
      { spellId: 'free', self: false, target: false },
      { spellId: 'curse', self: true, target: true },
      { spellId: 'free', self: false, target: true },
    ]);
    // free draws nothing itself and curse (canMiss, canCrit false) draws only its miss roll, so
    // the hook rolls are draws 1, 3 and 4 of the seed's Rng.
    const rng = createRng(7);
    const draws = [rng.next(), rng.next(), rng.next(), rng.next()];
    expect(a.rolls).toEqual([draws[0], draws[2], draws[3]]);
    expect(play(7)).toEqual(a);
    expect(play(8).rolls).not.toEqual(a.rolls);
    expect(a.log.filter((e) => e.auraId === 'buff')).toEqual([
      { atMs: 0, type: 'aura-apply', spellId: 'free', auraId: 'buff' },
      { atMs: 3000, type: 'aura-fade', auraId: 'buff' },
      { atMs: 3000, type: 'aura-apply', spellId: 'free', auraId: 'buff' },
    ]);
  });

  it('a hook that never calls roll() leaves the draw order unchanged', () => {
    function play(hooks: SpecHooks): readonly LogEvent[] {
      const sim = newSim({ spec: patchedSpec({ critPct: 50 }, { hooks }), seed: 3 });
      for (let t = 0; t < 20000; t += 2000) {
        sim.advanceTo(t);
        sim.cast('bolt');
      }
      sim.advanceTo(20000);
      return sim.log();
    }
    const plain = play({});
    expect(plain.filter((e) => e.crit === true).length).toBeGreaterThan(0);
    expect(plain.filter((e) => e.crit === false).length).toBeGreaterThan(0);
    expect(play(recordingHooks([]))).toEqual(plain);
    expect(play({ onSpellResolved: (_e, api) => void api.roll() })).not.toEqual(plain);
  });

  it('set-bonus hooks (SetBonusDef.hooks) are called after spec hooks, only while the bonus is active', () => {
    function play(pieces: number): string[] {
      const calls: string[] = [];
      const bonus = (n: number): SetBonusDef => ({
        setId: 'hook-set',
        name: `Hook Set ${n}`,
        pieces: n,
        description: 'test',
        hooks: { onSpellResolved: (e) => void calls.push(`${n}pc:${e.spellId}:${e.outcome}`) },
      });
      const base = makeTestSpec();
      const spec = makeTestSpec({
        sets: [bonus(2), bonus(4)],
        hooks: { onSpellResolved: (e) => void calls.push(`spec:${e.spellId}:${e.outcome}`) },
        setup: { ...base.setup, setPieces: { 'hook-set': pieces } },
      });
      const sim = newSim({ spec });
      sim.cast('zap');
      return calls;
    }
    expect(play(0)).toEqual(['spec:zap:hit']);
    expect(play(1)).toEqual(['spec:zap:hit']);
    expect(play(2)).toEqual(['spec:zap:hit', '2pc:zap:hit']);
    expect(play(3)).toEqual(['spec:zap:hit', '2pc:zap:hit']);
    expect(play(4)).toEqual(['spec:zap:hit', '2pc:zap:hit', '4pc:zap:hit']);
  });
});

describe('Simulation aura removal (one routine for expiry, consumption and charge exhaustion)', () => {
  it('an aura whose last charge is consumed logs exactly one aura-fade at the consumption time and no later fade at its original expiry', () => {
    const sim = newSim({ spec: procSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000); // procAura applied, original expiry 14000
    sim.cast('zap');
    sim.advanceTo(3500);
    sim.cast('zap'); // last charge
    sim.advanceTo(30000);
    expect(fadesOf(sim, 'procAura')).toEqual([3500]);

    // Unconsumed, the same aura fades once at its expiry.
    const idle = newSim({ spec: procSpec() });
    idle.cast('bolt');
    idle.advanceTo(30000);
    expect(fadesOf(idle, 'procAura')).toEqual([14000]);
  });

  it('a charged DoT-like aura loses its pending ticks and fade when its last charge is consumed', () => {
    // dotAura gains one charge that a fire hit consumes; its own (shadow) ticks do not.
    const spec = patchedSpec({
      auras: { dotAura: { charges: 1, damageTakenMult: { schools: ['fire'], mult: 1.5, consumeChargeOnHit: true } } },
    });
    const sim = newSim({ spec });
    sim.cast('dot');
    sim.advanceTo(3000);
    expect(sim.snapshot().targetAuras.dotAura?.charges).toBe(1);
    sim.cast('scorch');
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.advanceTo(30000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'dot' },
      { atMs: 0, type: 'aura-apply', spellId: 'dot', auraId: 'dotAura' },
      { atMs: 2000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 100 },
      { atMs: 3000, type: 'cast-complete', spellId: 'scorch' },
      { atMs: 3000, type: 'damage', spellId: 'scorch', amount: 150, crit: false },
      { atMs: 3000, type: 'aura-fade', auraId: 'dotAura' },
    ]);
    expect(sim.snapshot().damageTotal).toBe(250);
  });

  it('a charged DoT whose own ticks consume its charges stops ticking when they run out', () => {
    const spec = patchedSpec({
      auras: { dotAura: { charges: 2, damageTakenMult: { schools: ['shadow'], mult: 1.5, consumeChargeOnHit: true } } },
    });
    const sim = newSim({ spec });
    sim.cast('dot');
    sim.advanceTo(30000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'dot' },
      { atMs: 0, type: 'aura-apply', spellId: 'dot', auraId: 'dotAura' },
      { atMs: 2000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 150 },
      { atMs: 4000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 150 },
      { atMs: 4000, type: 'aura-fade', auraId: 'dotAura' },
    ]);
  });
});
