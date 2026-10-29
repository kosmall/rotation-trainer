import { describe, expect, it } from 'vitest';
import { HASTE_RATING_PER_PCT, MIN_GCD_MS } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { RawStats, SpellModifier } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

function newSim(opts: { spec?: SpecData; durationMs?: number } = {}): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: TEST_TARGET,
    seed: 1,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
  });
}

/** The fixture spec with some raw stats replaced (keeps the fixture's 0% crit offset). */
function specWithStats(patch: Partial<RawStats>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({ ...spec, setup: { ...base.setup, stats: { ...base.setup.stats, ...patch } } });
}

/** The fixture spec where bolt also has a cooldown, so "no cooldown started" is observable. */
function specWithBoltCooldown(cooldownMs: number): SpecData {
  return makeTestSpec({
    spells: makeTestSpec().spells.map((s) => (s.id === 'bolt' ? { ...s, cooldownMs } : s)),
  });
}

function damageOf(sim: Simulation, spellId: string): (number | undefined)[] {
  return sim
    .log()
    .filter((e) => e.type === 'damage' && e.spellId === spellId)
    .map((e) => e.amount);
}

/** Captures the full observable state (copies, so later mutation cannot hide a change). */
function observe(sim: Simulation) {
  return { snapshot: sim.snapshot(), log: [...sim.log()] };
}

describe('Simulation cast times', () => {
  it('bolt lands 2000 ms after start: damage appears at 2000, not before', () => {
    const sim = newSim();
    expect(sim.cast('bolt')).toEqual({ ok: true });
    expect(sim.log()).toEqual([{ atMs: 0, type: 'cast-start', spellId: 'bolt' }]);
    sim.advanceTo(1999);
    expect(damageOf(sim, 'bolt')).toEqual([]);
    expect(sim.snapshot().damageTotal).toBe(0);
    sim.advanceTo(2000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
    ]);
    expect(sim.snapshot().damageTotal).toBe(100);
  });

  it('GCD starts at cast start; the cooldown starts at cast end', () => {
    const sim = newSim({ spec: specWithBoltCooldown(5000) });
    sim.cast('bolt');
    expect(sim.snapshot().gcdEndsAtMs).toBe(1500);
    sim.advanceTo(1999);
    expect(sim.snapshot().cooldownRemainingMs.bolt).toBe(0);
    sim.advanceTo(2000);
    expect(sim.snapshot().cooldownRemainingMs.bolt).toBe(5000);
  });

  it('with hasteRating = HASTE_RATING_PER_PCT * 10, bolt completes at round(2000/1.1)', () => {
    const sim = newSim({ spec: specWithStats({ hasteRating: HASTE_RATING_PER_PCT * 10 }) });
    sim.cast('bolt');
    const endMs = Math.round(2000 / 1.1);
    expect(endMs).toBe(1818);
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 0, endMs });
    expect(sim.snapshot().gcdEndsAtMs).toBe(Math.round(1500 / 1.1));
    sim.advanceTo(endMs - 1);
    expect(damageOf(sim, 'bolt')).toEqual([]);
    sim.advanceTo(endMs);
    expect(sim.log()).toContainEqual({ atMs: endMs, type: 'damage', spellId: 'bolt', amount: 100, crit: false });
  });

  it('castTimeMsDelta is added before haste; a cast time at or below 0 makes the spell instant', () => {
    const faster: SpellModifier = { spellIds: ['bolt'], castTimeMsDelta: -500 };
    const hasted = newSim({
      spec: specWithStats({ hasteRating: HASTE_RATING_PER_PCT * 10 }, { modifiers: [faster] }),
    });
    hasted.cast('bolt');
    expect(hasted.snapshot().cast?.endMs).toBe(Math.round(1500 / 1.1));

    const instant: SpellModifier = { spellIds: ['bolt'], castTimeMsDelta: -5000 };
    const sim = newSim({ spec: makeTestSpec({ modifiers: [instant] }) });
    sim.cast('bolt');
    expect(sim.snapshot().cast).toBeNull();
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 0, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
    ]);
  });

  it('GCD never drops below MIN_GCD_MS with very large haste', () => {
    const sim = newSim({ spec: specWithStats({ hasteRating: HASTE_RATING_PER_PCT * 1000 }) });
    expect(Math.round(1500 / 11)).toBeLessThan(MIN_GCD_MS);
    sim.cast('bolt');
    expect(sim.snapshot().gcdEndsAtMs).toBe(MIN_GCD_MS);
    // The cast itself is not clamped: bolt lands at round(2000 / 11), well before the GCD ends.
    sim.advanceTo(Math.round(2000 / 11));
    expect(damageOf(sim, 'bolt')).toEqual([100]);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'gcd' });
    sim.advanceTo(MIN_GCD_MS);
    expect(sim.cast('zap')).toEqual({ ok: true });
  });

  it('snapshot.cast reports spellId/startMs/endMs while casting, null after', () => {
    const sim = newSim();
    sim.start();
    sim.advanceTo(300);
    expect(sim.snapshot().cast).toBeNull();
    sim.cast('bolt');
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 300, endMs: 2300 });
    sim.advanceTo(2299);
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 300, endMs: 2300 });
    sim.advanceTo(2300);
    expect(sim.snapshot().cast).toBeNull();
  });

  it("casting bolt then zap returns 'busy' and changes nothing", () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(500);
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'busy' });
    expect(observe(sim)).toEqual(before);
    // Still busy after the GCD has ended, and for off-GCD spells too.
    sim.advanceTo(1700);
    const later = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'busy' });
    expect(sim.cast('free')).toEqual({ ok: false, reason: 'busy' });
    expect(observe(sim)).toEqual(later);
    sim.advanceTo(2000);
    expect(sim.cast('zap')).toEqual({ ok: true });
  });

  it("rejection order: 'busy' wins over a spell that is also on cooldown", () => {
    // Full order: ended > unknown-spell > busy > cooldown > gcd > missing-aura > no-mana.
    const sim = newSim();
    sim.cast('zap'); // zap cooldown until 8000
    sim.advanceTo(1500);
    sim.cast('bolt'); // casting until 3500
    sim.advanceTo(2000);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBeGreaterThan(0);
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'busy' });
    expect(observe(sim)).toEqual(before);
    sim.advanceTo(3500);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
  });
});

describe('Simulation cancelCast', () => {
  it('Review Focus 2: cancelCast mid-bolt: no damage, mana unchanged, zap/bolt cooldown unchanged, log has cast-cancel; GCD still blocks bolt until it expires', () => {
    const sim = newSim({ spec: specWithBoltCooldown(5000) });
    sim.cast('zap');
    sim.advanceTo(1500);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(2500);
    const before = sim.snapshot();
    sim.cancelCast();
    const after = sim.snapshot();

    const maxMana = computeStats(makeTestSpec().setup).maxMana;
    expect(after.cast).toBeNull();
    // Only zap (20) has been spent: the cancelled bolt spends nothing.
    expect(after.mana).toBe(before.mana);
    expect(after.mana).toBe(maxMana - 20);
    expect(after.cooldownRemainingMs).toEqual(before.cooldownRemainingMs);
    expect(after.cooldownRemainingMs).toEqual({
      bolt: 0,
      zap: 5500,
      free: 0,
      dot: 0,
      needy: 0,
      curse: 0,
      scorch: 0,
      tap: 0,
    });
    expect(after.gcdEndsAtMs).toBe(3000);
    expect(sim.log().at(-1)).toEqual({ atMs: 2500, type: 'cast-cancel', spellId: 'bolt' });

    // The GCD started by the cancelled bolt still blocks.
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'gcd' });
    sim.advanceTo(2999);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'gcd' });

    // The cancelled bolt never lands, even past its original end (3500).
    sim.advanceTo(3000);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(4999);
    expect(damageOf(sim, 'bolt')).toEqual([]);
    expect(sim.log().filter((e) => e.type === 'cast-complete' && e.spellId === 'bolt')).toEqual([]);
    expect(sim.snapshot().cooldownRemainingMs.bolt).toBe(0);
    expect(sim.snapshot().mana).toBe(maxMana - 20);
    sim.advanceTo(5000);
    expect(damageOf(sim, 'bolt')).toEqual([100]);
    expect(sim.snapshot().damageTotal).toBe(150);
    // The completed bolt spends exactly its cost.
    expect(sim.snapshot().mana).toBe(maxMana - 20 - 50);
  });

  it('cancelCast with nothing casting is a no-op', () => {
    const fresh = newSim();
    const initial = observe(fresh);
    fresh.cancelCast();
    expect(observe(fresh)).toEqual(initial);

    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(200);
    const before = observe(sim);
    sim.cancelCast();
    expect(observe(sim)).toEqual(before);

    sim.cast('free');
    sim.advanceTo(1500);
    sim.cast('bolt');
    sim.advanceTo(3500);
    const afterBolt = observe(sim);
    sim.cancelCast();
    expect(observe(sim)).toEqual(afterBolt);
  });
});

// Ruling R6: events at atMs <= durationMs run before the fight ends; later ones never run.
describe('Simulation fight-end boundary', () => {
  it('a bolt started at 3000 completes exactly at durationMs 5000 and its damage counts', () => {
    const sim = newSim({ durationMs: 5000, spec: specWithBoltCooldown(10000) });
    sim.start();
    sim.advanceTo(3000);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(5000);
    const s = sim.snapshot();
    expect(s.phase).toBe('ended');
    expect(s.damageTotal).toBe(100);
    expect(s.cooldownRemainingMs.bolt).toBe(10000);
    expect(s.mana).toBe(computeStats(makeTestSpec().setup).maxMana - 50);
    expect(s.cast).toBeNull();
    expect(sim.log()).toContainEqual({ atMs: 5000, type: 'damage', spellId: 'bolt', amount: 100, crit: false });
  });

  it('a bolt started at 3001 would complete at 5001: cut off, no damage, no cooldown or mana effects', () => {
    const sim = newSim({ durationMs: 5000, spec: specWithBoltCooldown(10000) });
    sim.start();
    sim.advanceTo(3001);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(6000);
    const s = sim.snapshot();
    expect(s.phase).toBe('ended');
    expect(s.nowMs).toBe(5000);
    expect(s.damageTotal).toBe(0);
    expect(s.cooldownRemainingMs.bolt).toBe(0);
    // The cut-off bolt spends nothing (a completed one would leave maxMana - 50).
    expect(s.mana).toBe(computeStats(makeTestSpec().setup).maxMana);
    expect(s.cast).toBeNull();
    expect(sim.log()).toEqual([{ atMs: 3001, type: 'cast-start', spellId: 'bolt' }]);
    sim.cancelCast();
    expect(sim.log()).toEqual([{ atMs: 3001, type: 'cast-start', spellId: 'bolt' }]);
  });
});
