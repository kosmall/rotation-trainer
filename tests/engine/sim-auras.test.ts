import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, LogEvent, RawStats, SpellDef, SpellModifier, TargetData } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

const ALWAYS_MISS: TargetData = { ...TEST_TARGET, missPct: 100, minMissPct: 100 };

function newSim(
  opts: { spec?: SpecData; target?: TargetData; durationMs?: number } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: opts.target ?? TEST_TARGET,
    seed: 1,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
  });
}

function ofType(sim: Simulation, type: LogEvent['type']): LogEvent[] {
  return sim.log().filter((e) => e.type === type);
}

function tickTimes(sim: Simulation): number[] {
  return ofType(sim, 'tick').map((e) => e.atMs);
}

/** Captures the full observable state (copies, so later mutation cannot hide a change). */
function observe(sim: Simulation) {
  return { snapshot: sim.snapshot(), log: [...sim.log()] };
}

/** The fixture spec with some spells, auras, stats or modifiers patched. */
function patchedSpec(p: {
  spells?: Record<string, Partial<SpellDef>>;
  auras?: Record<string, Partial<AuraDef>>;
  stats?: Partial<RawStats>;
  modifiers?: SpellModifier[];
}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    spells: base.spells.map((s) => ({ ...s, ...p.spells?.[s.id] })),
    auras: base.auras.map((a) => ({ ...a, ...p.auras?.[a.id] })),
    setup: { ...base.setup, stats: { ...base.setup.stats, ...p.stats } },
    modifiers: p.modifiers ?? [],
  });
}

describe('Simulation DoTs and auras', () => {
  it('dot ticks at +2000, +4000, +6000 for 100 each, then fades; total 300', () => {
    const sim = newSim();
    expect(sim.cast('dot')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras).toEqual({
      dotAura: { auraId: 'dotAura', stacks: 1, charges: 0, remainingMs: 6000 },
    });
    sim.advanceTo(1999);
    expect(tickTimes(sim)).toEqual([]);
    sim.advanceTo(10000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'dot' },
      { atMs: 0, type: 'aura-apply', spellId: 'dot', auraId: 'dotAura' },
      { atMs: 2000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 100 },
      { atMs: 4000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 100 },
      { atMs: 6000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 100 },
      { atMs: 6000, type: 'aura-fade', auraId: 'dotAura' },
    ]);
    expect(sim.snapshot().damageTotal).toBe(300);
    expect(sim.snapshot().targetAuras).toEqual({});
  });

  it('Review Focus 5: recasting dot at +3000 resets expiry to +9000 and yields ticks at 5000, 7000, 9000 only (no tick at 4000, no double ticks)', () => {
    const sim = newSim();
    sim.cast('dot');
    sim.advanceTo(3000);
    expect(tickTimes(sim)).toEqual([2000]);
    expect(sim.cast('dot')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(6000);
    sim.advanceTo(20000);
    expect(tickTimes(sim)).toEqual([2000, 5000, 7000, 9000]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 9000, type: 'aura-fade', auraId: 'dotAura' }]);
    expect(sim.snapshot().damageTotal).toBe(400);
  });

  it('a refresh does not tick immediately and the aura stays up across the old expiry', () => {
    const sim = newSim();
    sim.cast('dot');
    sim.advanceTo(4000);
    sim.cast('dot');
    expect(tickTimes(sim)).toEqual([2000, 4000]);
    sim.advanceTo(6000);
    expect(tickTimes(sim)).toEqual([2000, 4000, 6000]);
    expect(ofType(sim, 'aura-fade')).toEqual([]);
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(4000);
  });

  it('a tick falling after fight end is not counted', () => {
    const sim = newSim({ durationMs: 5000 });
    sim.cast('dot');
    sim.advanceTo(60000);
    expect(sim.snapshot().phase).toBe('ended');
    expect(tickTimes(sim)).toEqual([2000, 4000]);
    expect(sim.snapshot().damageTotal).toBe(200);
  });

  it('a tick landing exactly at fight end counts; one landing 1 ms after it does not', () => {
    const exact = newSim({ durationMs: 6000 });
    exact.cast('dot');
    exact.advanceTo(6000);
    expect(exact.snapshot().phase).toBe('ended');
    expect(tickTimes(exact)).toEqual([2000, 4000, 6000]);
    expect(exact.snapshot().damageTotal).toBe(300);

    const late = newSim({ durationMs: 5999 });
    late.cast('dot');
    late.advanceTo(6000);
    expect(late.snapshot().phase).toBe('ended');
    expect(tickTimes(late)).toEqual([2000, 4000]);
    expect(late.snapshot().damageTotal).toBe(200);
  });

  it("needy returns 'missing-aura' with no dotAura, spends no mana, starts no cooldown", () => {
    const sim = newSim();
    const before = observe(sim);
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'missing-aura' });
    expect(observe(sim)).toEqual(before);
    expect(sim.snapshot().phase).toBe('ready');

    sim.start();
    sim.advanceTo(1000);
    const running = observe(sim);
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'missing-aura' });
    expect(observe(sim)).toEqual(running);
    expect(running.snapshot.mana).toBe(running.snapshot.maxMana);
    expect(running.snapshot.cooldownRemainingMs.needy).toBe(0);
    expect(running.snapshot.gcdEndsAtMs).toBe(0);
  });

  it("needy returns 'missing-aura' once dotAura has faded", () => {
    const sim = newSim();
    sim.cast('dot');
    sim.advanceTo(6000);
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'missing-aura' });
  });

  it('needy with dotAura deals damage and removes dotAura and its remaining ticks', () => {
    const sim = newSim();
    sim.cast('dot');
    sim.advanceTo(2000);
    expect(sim.cast('needy')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras).toEqual({});
    expect(sim.snapshot().cooldownRemainingMs.needy).toBe(10000);
    sim.advanceTo(20000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'dot' },
      { atMs: 0, type: 'aura-apply', spellId: 'dot', auraId: 'dotAura' },
      { atMs: 2000, type: 'tick', spellId: 'dot', auraId: 'dotAura', amount: 100 },
      { atMs: 2000, type: 'cast-complete', spellId: 'needy' },
      { atMs: 2000, type: 'damage', spellId: 'needy', amount: 10, crit: false },
      { atMs: 2000, type: 'aura-fade', auraId: 'dotAura' },
    ]);
    expect(sim.snapshot().damageTotal).toBe(110);
  });

  it('a missed needy consumes nothing: dotAura and its ticks stay', () => {
    const sim = newSim({ spec: patchedSpec({ spells: { dot: { canMiss: false } } }), target: ALWAYS_MISS });
    sim.cast('dot');
    sim.advanceTo(2000);
    expect(sim.cast('needy')).toEqual({ ok: true });
    expect(ofType(sim, 'miss')).toEqual([{ atMs: 2000, type: 'miss', spellId: 'needy' }]);
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(4000);
    sim.advanceTo(20000);
    expect(tickTimes(sim)).toEqual([2000, 4000, 6000]);
  });

  it('curse makes later shadow damage ×1.2 and does not affect fire damage', () => {
    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(1500);
    expect(sim.cast('curse')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras.weak?.remainingMs).toBe(10000);
    sim.advanceTo(3000);
    sim.cast('scorch');
    sim.advanceTo(8000);
    sim.cast('zap');
    sim.advanceTo(11500);
    sim.cast('scorch');
    sim.advanceTo(16000);
    sim.cast('zap');
    const damage = ofType(sim, 'damage').map((e) => [e.atMs, e.spellId, e.amount]);
    expect(damage).toEqual([
      [0, 'zap', 50],
      [3000, 'scorch', 100],
      [8000, 'zap', 60],
      [11500, 'scorch', 100],
      [16000, 'zap', 50],
    ]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 11500, type: 'aura-fade', auraId: 'weak' }]);
  });

  it('dot ticks use the damage-taken multiplier current at each tick', () => {
    const sim = newSim();
    sim.cast('dot');
    sim.advanceTo(2000);
    sim.cast('curse');
    sim.advanceTo(10000);
    expect(ofType(sim, 'tick').map((e) => e.amount)).toEqual([100, 120, 120]);
  });

  it('tick damage = round((total + coeffTotal * power) / ticks × dotDamageMult × damageTakenMult × levelResistMult), rounded once; damageMult does not apply', () => {
    const spec = patchedSpec({
      auras: { dotAura: { tick: { intervalMs: 2000, total: 300, coeffTotal: 1, school: 'shadow' } } },
      stats: { shadowPower: 101 },
      modifiers: [{ spellIds: ['dot'], dotDamageMult: 1.5, damageMult: 2 }],
    });
    const sim = new Simulation({
      spec,
      target: { ...TEST_TARGET, levelResistMult: 0.9 },
      seed: 1,
    });
    sim.cast('dot');
    sim.advanceTo(10000);
    // (300 + 101) / 3 * 1.5 * 0.9 = 180.45
    expect(ofType(sim, 'tick').map((e) => e.amount)).toEqual([180, 180, 180]);
    expect(ofType(sim, 'tick').every((e) => !e.crit)).toBe(true);
  });

  it('dot ticks never crit, even at 100% crit chance', () => {
    const sim = newSim({ spec: patchedSpec({ modifiers: [{ critPctDelta: 100 }] }) });
    sim.cast('dot');
    sim.advanceTo(10000);
    expect(ofType(sim, 'tick').map((e) => [e.amount, e.crit ?? false])).toEqual([
      [100, false],
      [100, false],
      [100, false],
    ]);
  });

  it("'missing-aura' is checked after busy, cooldown and gcd", () => {
    const sim = newSim();
    sim.cast('bolt');
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'busy' });
    sim.advanceTo(2000);
    sim.cast('dot');
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'gcd' });
    sim.advanceTo(3500);
    expect(sim.cast('needy')).toEqual({ ok: true });
    sim.advanceTo(5000);
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'cooldown' });
  });

  it('a self aura is applied to selfAuras (not the target) and fades at its expiry', () => {
    const sim = newSim({ spec: patchedSpec({ spells: { free: { applyAura: { auraId: 'weak', on: 'self' } } } }) });
    sim.cast('free');
    expect(sim.snapshot().selfAuras).toEqual({
      weak: { auraId: 'weak', stacks: 1, charges: 0, remainingMs: 10000 },
    });
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.cast('zap');
    sim.advanceTo(10000);
    expect(ofType(sim, 'damage').map((e) => e.amount)).toEqual([50]);
    expect(ofType(sim, 'aura-apply')).toEqual([{ atMs: 0, type: 'aura-apply', spellId: 'free', auraId: 'weak' }]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 10000, type: 'aura-fade', auraId: 'weak' }]);
    expect(sim.snapshot().selfAuras).toEqual({});
  });

  it('a missed dot (missPct 100) applies no aura and logs miss', () => {
    const sim = newSim({ target: ALWAYS_MISS });
    expect(sim.cast('dot')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.advanceTo(10000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'dot' },
      { atMs: 0, type: 'miss', spellId: 'dot' },
    ]);
    expect(sim.snapshot().damageTotal).toBe(0);
  });
});
