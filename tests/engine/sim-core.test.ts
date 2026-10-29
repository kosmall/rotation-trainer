import { describe, expect, it } from 'vitest';
import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { CharacterSetup, SpellModifier, TargetData } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

function newSim(
  opts: { spec?: SpecData; target?: TargetData; seed?: number; durationMs?: number } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: opts.target ?? TEST_TARGET,
    seed: opts.seed ?? 1,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
  });
}

function specWithSetup(patch: Partial<CharacterSetup>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({ ...spec, setup: { ...base.setup, ...patch } });
}

function specWithCritPct(critPct: number): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    setup: {
      ...base.setup,
      stats: { ...base.setup.stats, critRating: (critPct - BASE_CRIT_PCT) * CRIT_RATING_PER_PCT },
    },
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

describe('Simulation lifecycle', () => {
  it('the fixture has 0% crit chance', () => {
    expect(computeStats(makeTestSpec().setup).critPct).toBe(0);
  });

  it('advanceTo does nothing before start', () => {
    const sim = newSim();
    sim.advanceTo(5000);
    const maxMana = computeStats(makeTestSpec().setup).maxMana;
    expect(sim.snapshot()).toEqual({
      nowMs: 0,
      phase: 'ready',
      durationMs: 60000,
      gcdEndsAtMs: 0,
      cast: null,
      mana: maxMana,
      maxMana,
      cooldownRemainingMs: { bolt: 0, zap: 0, free: 0 },
      targetAuras: {},
      selfAuras: {},
      damageTotal: 0,
      dps: 0,
      queuedSpellId: null,
    });
    expect(sim.log()).toEqual([]);
  });

  it('first cast starts the fight', () => {
    const sim = newSim();
    expect(sim.cast('zap')).toEqual({ ok: true });
    expect(sim.snapshot().phase).toBe('running');
    expect(sim.snapshot().nowMs).toBe(0);
    sim.advanceTo(1000);
    expect(sim.snapshot().nowMs).toBe(1000);
  });

  it('start() begins the fight at 0 and is idempotent', () => {
    const sim = newSim();
    sim.start();
    sim.advanceTo(3000);
    sim.start();
    expect(sim.snapshot().phase).toBe('running');
    expect(sim.snapshot().nowMs).toBe(3000);
  });

  it('advanceTo never moves time back', () => {
    const sim = newSim();
    sim.start();
    sim.advanceTo(3000);
    sim.advanceTo(1000);
    expect(sim.snapshot().nowMs).toBe(3000);
  });

  it('fight ends at durationMs: phase ended, nowMs 60000, cast returns ended', () => {
    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(59999);
    expect(sim.snapshot().phase).toBe('running');
    sim.advanceTo(70000);
    const s = sim.snapshot();
    expect(s.phase).toBe('ended');
    expect(s.nowMs).toBe(60000);
    expect(s.durationMs).toBe(60000);
    expect(s.dps).toBeCloseTo(50 / 60, 10);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'ended' });
    sim.advanceTo(80000);
    expect(sim.snapshot().nowMs).toBe(60000);
  });

  // Review Focus 3 (ruling R6): the fight ends exactly at durationMs.
  it("a cast at durationMs-1 succeeds; at durationMs the fight has ended and cast returns 'ended'", () => {
    const a = newSim({ durationMs: 5000 });
    a.start();
    a.advanceTo(4999);
    expect(a.cast('zap')).toEqual({ ok: true });
    expect(a.log()).toContainEqual({ atMs: 4999, type: 'damage', spellId: 'zap', amount: 50, crit: false });
    a.advanceTo(5000);
    expect(a.snapshot().phase).toBe('ended');
    expect(a.snapshot().damageTotal).toBe(50);

    const b = newSim({ durationMs: 5000 });
    b.start();
    b.advanceTo(5000);
    expect(b.snapshot().phase).toBe('ended');
    expect(b.snapshot().nowMs).toBe(5000);
    expect(b.cast('zap')).toEqual({ ok: false, reason: 'ended' });
    expect(b.snapshot().damageTotal).toBe(0);
  });
});

describe('Simulation instant spells', () => {
  it('zap deals 50 damage, snapshot.damageTotal 50, dps = 50 / elapsed seconds', () => {
    const sim = newSim();
    sim.cast('zap');
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'zap' },
      { atMs: 0, type: 'damage', spellId: 'zap', amount: 50, crit: false },
    ]);
    expect(sim.snapshot().damageTotal).toBe(50);
    expect(sim.snapshot().dps).toBe(0);
    sim.advanceTo(2000);
    expect(sim.snapshot().dps).toBe(25);
  });

  it("second cast inside GCD returns {ok:false, reason:'gcd'} and changes nothing; works after advanceTo(1500)", () => {
    const sim = newSim();
    sim.cast('zap');
    expect(sim.snapshot().gcdEndsAtMs).toBe(1500);
    sim.advanceTo(1000);
    const before = observe(sim);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'gcd' });
    expect(observe(sim)).toEqual(before);
    sim.advanceTo(1499);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'gcd' });
    sim.advanceTo(1500);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    expect(damageOf(sim, 'bolt')).toEqual([100]);
  });

  it('off-gcd spell can be cast during GCD', () => {
    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(200);
    expect(sim.cast('free')).toEqual({ ok: true });
    expect(sim.snapshot().gcdEndsAtMs).toBe(1500);
    expect(sim.log()).toContainEqual({ atMs: 200, type: 'cast-complete', spellId: 'free' });
  });

  it("zap on cooldown returns reason 'cooldown' until 8000 ms, then succeeds; cooldownRemainingMs.zap counts down", () => {
    const sim = newSim();
    sim.cast('zap');
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(8000);
    sim.advanceTo(1500);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(6500);
    // Review Focus 1: rejected with a reason, no state change.
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
    expect(observe(sim)).toEqual(before);
    sim.advanceTo(7999);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(1);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
    sim.advanceTo(8000);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(0);
    expect(sim.cast('zap')).toEqual({ ok: true });
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(8000);
    expect(damageOf(sim, 'zap')).toEqual([50, 50]);
  });

  it("unknown spell id returns 'unknown-spell'", () => {
    const sim = newSim();
    sim.start();
    expect(sim.cast('nope')).toEqual({ ok: false, reason: 'unknown-spell' });
    expect(sim.log()).toEqual([]);
  });

  it('a miss logs miss, deals no damage and still starts the cooldown', () => {
    const sim = newSim({ target: { ...TEST_TARGET, missPct: 100 } });
    expect(sim.cast('zap')).toEqual({ ok: true });
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'zap' },
      { atMs: 0, type: 'miss', spellId: 'zap' },
    ]);
    expect(sim.snapshot().damageTotal).toBe(0);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(8000);
  });

  it('target levelResistMult scales direct damage', () => {
    const sim = newSim({ target: { ...TEST_TARGET, levelResistMult: 0.5 } });
    sim.cast('zap');
    expect(damageOf(sim, 'zap')).toEqual([25]);
  });
});

describe('Simulation modifiers and stats', () => {
  function zapDamage(spec: SpecData): number | undefined {
    const sim = newSim({ spec });
    sim.cast('zap');
    return damageOf(sim, 'zap')[0];
  }

  it('spec.modifiers and setup.modifiers multiply, matched by spellIds and schools', () => {
    const shadowX2: SpellModifier = { schools: ['shadow'], damageMult: 2 };
    const zapX15: SpellModifier = { spellIds: ['zap'], damageMult: 1.5 };
    const fireX2: SpellModifier = { schools: ['fire'], damageMult: 2 };
    const boltX2: SpellModifier = { spellIds: ['bolt'], damageMult: 2 };
    expect(zapDamage(makeTestSpec({ modifiers: [shadowX2] }))).toBe(100);
    expect(zapDamage(specWithSetup({ modifiers: [zapX15] }))).toBe(75);
    expect(zapDamage(specWithSetup({ modifiers: [zapX15] }, { modifiers: [shadowX2] }))).toBe(150);
    expect(zapDamage(makeTestSpec({ modifiers: [fireX2, boltX2] }))).toBe(50);
  });

  it('critPctDelta and critMultDelta modifiers change crits', () => {
    const alwaysCrit: SpellModifier = { spellIds: ['zap'], critPctDelta: 100 };
    const sim = newSim({ spec: makeTestSpec({ modifiers: [alwaysCrit] }) });
    sim.cast('zap');
    expect(sim.log()).toContainEqual({ atMs: 0, type: 'damage', spellId: 'zap', amount: 75, crit: true });
    const bigCrit: SpellModifier = { spellIds: ['zap'], critMultDelta: 0.5 };
    expect(zapDamage(makeTestSpec({ modifiers: [alwaysCrit, bigCrit] }))).toBe(100);
  });

  it('spec.statBonuses and active set statBonuses are added to the stats; mana is full', () => {
    const base = makeTestSpec();
    const spec = makeTestSpec({
      statBonuses: { baseMana: 100 },
      sets: [
        ...base.sets,
        { setId: 'mana-set', name: 'Mana 2', pieces: 2, description: '+50 mana', statBonuses: { baseMana: 50 } },
        { setId: 'mana-set', name: 'Mana 4', pieces: 4, description: '+1000 mana', statBonuses: { baseMana: 1000 } },
      ],
      setup: { ...base.setup, setPieces: { 'mana-set': 2 } },
    });
    const expected = computeStats(base.setup, { baseMana: 150 }).maxMana;
    const s = newSim({ spec }).snapshot();
    expect(s.maxMana).toBe(expected);
    expect(s.mana).toBe(expected);
  });
});

describe('Review Focus 6: set bonuses in the simulation', () => {
  function zapThenBolt(setPieces: Record<string, number>): { zap: unknown; bolt: unknown } {
    const sim = newSim({ spec: specWithSetup({ setPieces }) });
    sim.cast('zap');
    sim.advanceTo(1500);
    sim.cast('bolt');
    sim.advanceTo(3500);
    return { zap: damageOf(sim, 'zap')[0], bolt: damageOf(sim, 'bolt')[0] };
  }

  it('with setPieces {test-set: 1} zap deals 50', () => {
    expect(zapThenBolt({ 'test-set': 1 })).toEqual({ zap: 50, bolt: 100 });
  });

  it('{test-set: 2} zap deals 55 and bolt is unchanged', () => {
    expect(zapThenBolt({ 'test-set': 2 })).toEqual({ zap: 55, bolt: 100 });
  });

  it('{test-set: 3} zap deals 55 and bolt is unchanged', () => {
    expect(zapThenBolt({ 'test-set': 3 })).toEqual({ zap: 55, bolt: 100 });
  });

  it('{test-set: 4} zap deals 55 and bolt deals 150', () => {
    expect(zapThenBolt({ 'test-set': 4 })).toEqual({ zap: 55, bolt: 150 });
  });

  it('{unknown-set: 4} changes nothing', () => {
    expect(zapThenBolt({ 'unknown-set': 4 })).toEqual({ zap: 50, bolt: 100 });
  });
});

describe('Simulation determinism', () => {
  it('Review Focus 4: advanceTo(60000) in one call equals 600 steps of 100 ms', () => {
    const spec = specWithCritPct(50);
    const jump = newSim({ spec, seed: 7 });
    jump.cast('zap');
    jump.advanceTo(1500);
    jump.cast('bolt');
    jump.advanceTo(60000);

    const steps = newSim({ spec, seed: 7 });
    steps.cast('zap');
    for (let t = 100; t <= 1500; t += 100) steps.advanceTo(t);
    steps.cast('bolt');
    for (let t = 1600; t <= 60000; t += 100) steps.advanceTo(t);

    expect(steps.snapshot()).toEqual(jump.snapshot());
    expect(steps.log()).toEqual(jump.log());
    expect(jump.snapshot().phase).toBe('ended');
  });

  it('same seed gives identical log; different seeds with crit enabled differ', () => {
    const spec = specWithCritPct(50);
    function play(seed: number) {
      const sim = newSim({ spec, seed });
      for (let t = 0; t < 60000; t += 2000) {
        sim.advanceTo(t);
        sim.cast('bolt');
      }
      sim.advanceTo(60000);
      return sim.log();
    }
    const a = play(1);
    expect(play(1)).toEqual(a);
    const crits = a.filter((e) => e.type === 'damage' && e.crit).length;
    const hits = a.filter((e) => e.type === 'damage' && !e.crit).length;
    expect(crits).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
    expect(play(2)).not.toEqual(a);
  });
});
