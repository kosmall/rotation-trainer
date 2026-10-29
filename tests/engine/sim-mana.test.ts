import { describe, expect, it } from 'vitest';
import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT, INT_PER_CRIT_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { LogEvent, RawStats, SpellDef, SpellModifier } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

function newSim(
  opts: { spec?: SpecData; durationMs?: number; infiniteMana?: boolean; seed?: number } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: TEST_TARGET,
    seed: opts.seed ?? 1,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    ...(opts.infiniteMana !== undefined ? { infiniteMana: opts.infiniteMana } : {}),
  });
}

/** The fixture spec with some raw stats replaced (other fields overridable too). */
function specWithStats(patch: Partial<RawStats>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({ ...spec, setup: { ...base.setup, stats: { ...base.setup.stats, ...patch } } });
}

/** maxMana 100 (baseMana 380 + 20 + 15 * (0 - 20)): two bolts empty the bar. */
function lowManaSpec(spec: Partial<SpecData> = {}): SpecData {
  return specWithStats({ baseMana: 380 }, spec);
}

/**
 * Intellect 100 so spirit regenerates (spirit regen scales with sqrt(intellect)); the crit rating
 * cancels the base and intellect crit so the spec still has (about) 0% crit.
 */
function regenSpec(p: { spirit: number; mp5: number }, spec: Partial<SpecData> = {}): SpecData {
  const intellect = 100;
  return specWithStats(
    {
      intellect,
      spirit: p.spirit,
      mp5: p.mp5,
      critRating: -(BASE_CRIT_PCT + intellect / INT_PER_CRIT_PCT) * CRIT_RATING_PER_PCT,
    },
    spec,
  );
}

function fixtureSpell(id: string): SpellDef {
  const spell = makeTestSpec().spells.find((s) => s.id === id);
  if (!spell) throw new Error(`no fixture spell ${id}`);
  return spell;
}

function withSpell(id: string, patch: Partial<SpellDef>): SpellDef[] {
  return makeTestSpec().spells.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function statsOf(spec: SpecData) {
  return computeStats(spec.setup);
}

function manaEvents(sim: Simulation): LogEvent[] {
  return sim.log().filter((e) => e.type === 'mana');
}

/** Regen ticks: `mana` entries without a spellId, as [atMs, amount]. */
function regenTicks(sim: Simulation): [number, number | undefined][] {
  return manaEvents(sim)
    .filter((e) => e.spellId === undefined)
    .map((e) => [e.atMs, e.amount]);
}

function expectRegen(actual: [number, number | undefined][], expected: [number, number][]): void {
  expect(actual.map(([t]) => t)).toEqual(expected.map(([t]) => t));
  expected.forEach(([, amount], i) => expect(actual[i]?.[1]).toBeCloseTo(amount, 9));
}

/** Captures the full observable state (copies, so later mutation cannot hide a change). */
function observe(sim: Simulation) {
  return { snapshot: sim.snapshot(), log: [...sim.log()] };
}

describe('Simulation mana: cost check and spend', () => {
  it("cast with insufficient mana returns 'no-mana' and nothing changes", () => {
    const spec = lowManaSpec();
    const sim = newSim({ spec });
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(2000);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(4000);
    expect(sim.snapshot().mana).toBe(0);

    const before = observe(sim);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'no-mana' });
    expect(observe(sim)).toEqual(before);
    // No GCD, cast or cooldown was started: a free spell still goes off at once.
    expect(sim.snapshot().gcdEndsAtMs).toBe(3500);
    expect(sim.snapshot().cast).toBeNull();
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(0);
    expect(sim.cast('scorch')).toEqual({ ok: true });
  });

  it("Review Focus 1: a 'no-mana' cast in 'ready' does not start the fight and changes nothing", () => {
    const spec = makeTestSpec({ spells: withSpell('bolt', { manaCost: 10000 }) });
    const sim = newSim({ spec });
    const before = observe(sim);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });
    expect(observe(sim)).toEqual(before);
    expect(sim.snapshot().phase).toBe('ready');
    expect(sim.log()).toEqual([]);
    sim.advanceTo(1000);
    expect(sim.snapshot().nowMs).toBe(0);
  });

  it('bolt spends 50 at completion, not at start', () => {
    const maxMana = statsOf(makeTestSpec()).maxMana;
    const sim = newSim();
    expect(sim.cast('bolt')).toEqual({ ok: true });
    expect(sim.snapshot().mana).toBe(maxMana);
    sim.advanceTo(1999);
    expect(sim.snapshot().mana).toBe(maxMana);
    sim.advanceTo(2000);
    expect(sim.snapshot().mana).toBe(maxMana - 50);
    // Spending is not logged as a 'mana' event; cast-complete marks it.
    expect(manaEvents(sim)).toEqual([]);
  });

  it('the check is at cast start: a bolt started with exactly 50 mana succeeds', () => {
    // maxMana 100: bolt (-50), then a second bolt started with exactly 50.
    const sim = newSim({ spec: lowManaSpec() });
    sim.cast('bolt');
    sim.advanceTo(2000);
    expect(sim.snapshot().mana).toBe(50);
    expect(sim.cast('bolt')).toEqual({ ok: true });
    sim.advanceTo(4000);
    expect(sim.snapshot().mana).toBe(0);
    expect(sim.log().filter((e) => e.type === 'cast-complete').map((e) => e.atMs)).toEqual([2000, 4000]);
  });

  it('mana never goes below 0 and never above maxMana', () => {
    // Below: spend down to exactly 0, then every costly spell is refused.
    const low = newSim({ spec: lowManaSpec() });
    low.cast('bolt');
    low.advanceTo(2000);
    low.cast('bolt');
    low.advanceTo(4000);
    expect(low.snapshot().mana).toBe(0);
    for (const id of ['bolt', 'zap', 'dot', 'curse']) {
      expect(low.cast(id)).toEqual({ ok: false, reason: 'no-mana' });
    }
    expect(low.snapshot().mana).toBe(0);

    // Above: a gain at full mana and regen at full mana leave the bar at maxMana.
    const spec = regenSpec({ spirit: 100, mp5: 10 });
    const maxMana = statsOf(spec).maxMana;
    const sim = newSim({ spec });
    expect(sim.cast('tap')).toEqual({ ok: true });
    expect(sim.snapshot().mana).toBe(maxMana);
    sim.advanceTo(30000);
    expect(sim.snapshot().mana).toBe(maxMana);
    expect(regenTicks(sim)).toEqual([]);
  });

  it('a modifier manaCostMult scales both the check and the spend', () => {
    const mods: SpellModifier[] = [{ spellIds: ['bolt'], manaCostMult: 0.5 }];
    // maxMana 100: bolt costs 25, so four bolts fit.
    const sim = newSim({ spec: lowManaSpec({ modifiers: mods }) });
    for (let i = 0; i < 4; i++) {
      sim.advanceTo(i * 2000);
      expect(sim.cast('bolt')).toEqual({ ok: true });
    }
    sim.advanceTo(8000);
    expect(sim.snapshot().mana).toBe(0);
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });
  });

  it("rejection order: busy, cooldown and gcd come before 'no-mana'; 'missing-aura' too", () => {
    // maxMana 100, zap costs 100: affordable once.
    const spec = lowManaSpec({ spells: withSpell('zap', { manaCost: 100 }) });
    const sim = newSim({ spec });
    sim.cast('zap'); // mana 0, zap on cooldown, GCD to 1500
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'gcd' });
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'gcd' });
    sim.advanceTo(1500);
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'missing-aura' });
    expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });

    // busy: a free cast-time spell in progress hides the missing mana.
    const busySpec = lowManaSpec({
      spells: [...withSpell('zap', { manaCost: 100 }), { ...fixtureSpell('bolt'), id: 'slow', manaCost: 0 }],
    });
    const busy = newSim({ spec: busySpec });
    busy.cast('zap');
    busy.advanceTo(1500);
    busy.cast('slow');
    expect(busy.cast('bolt')).toEqual({ ok: false, reason: 'busy' });
    busy.advanceTo(3500);
    expect(busy.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });
  });
});

describe('Simulation mana: gains (Life Tap)', () => {
  it('tap gives +300, capped at maxMana', () => {
    const maxMana = statsOf(makeTestSpec()).maxMana;
    const sim = newSim();
    for (let t = 0; t <= 10000; t += 2000) {
      sim.advanceTo(t);
      expect(sim.cast('bolt')).toEqual({ ok: true });
    }
    sim.advanceTo(12000);
    expect(sim.snapshot().mana).toBe(maxMana - 300);

    expect(sim.cast('tap')).toEqual({ ok: true });
    expect(sim.snapshot().mana).toBe(maxMana);
    sim.advanceTo(13500);
    expect(sim.cast('tap')).toEqual({ ok: true });
    expect(sim.snapshot().mana).toBe(maxMana);

    sim.advanceTo(15000);
    sim.cast('bolt');
    sim.advanceTo(17000);
    expect(sim.snapshot().mana).toBe(maxMana - 50);
    expect(sim.cast('tap')).toEqual({ ok: true });
    expect(sim.snapshot().mana).toBe(maxMana);

    // The logged amount is the actual change.
    expect(manaEvents(sim)).toEqual([
      { atMs: 12000, type: 'mana', spellId: 'tap', amount: 300 },
      { atMs: 13500, type: 'mana', spellId: 'tap', amount: 0 },
      { atMs: 17000, type: 'mana', spellId: 'tap', amount: 50 },
    ]);
    expect(sim.log().slice(-2)).toEqual([
      { atMs: 17000, type: 'cast-complete', spellId: 'tap' },
      { atMs: 17000, type: 'mana', spellId: 'tap', amount: 50 },
    ]);
  });

  it("gainMana adds coeff x the power of the spell's school", () => {
    const spells = withSpell('tap', { gainMana: { amount: 300, coeff: 0.8 } });
    const spec = specWithStats({ shadowPower: 100, firePower: 1000 }, { spells });
    const maxMana = statsOf(spec).maxMana;
    const sim = newSim({ spec });
    for (let t = 0; t <= 16000; t += 2000) {
      sim.advanceTo(t);
      sim.cast('bolt');
    }
    sim.advanceTo(18000);
    expect(sim.snapshot().mana).toBe(maxMana - 450);
    sim.cast('tap');
    expect(sim.snapshot().mana).toBe(maxMana - 450 + 380);
    expect(manaEvents(sim)).toEqual([{ atMs: 18000, type: 'mana', spellId: 'tap', amount: 380 }]);
  });
});

describe('Simulation mana: regen and the five-second rule', () => {
  it('spirit regen is suppressed for 5000 ms after a mana-costing cast, resumes after', () => {
    const spec = regenSpec({ spirit: 100, mp5: 0 });
    const stats = statsOf(spec);
    const spiritTick = stats.spiritRegenPerSec * 2;
    expect(spiritTick).toBeGreaterThan(18);
    const sim = newSim({ spec });
    sim.cast('zap'); // -20 at 0
    sim.advanceTo(1500);
    sim.cast('bolt'); // -50 at 3500
    sim.advanceTo(9999);
    // Ticks at 2000..8000 all fall within 5000 ms of a spend.
    expect(sim.snapshot().mana).toBe(stats.maxMana - 70);
    expect(regenTicks(sim)).toEqual([]);

    sim.advanceTo(20000);
    expectRegen(regenTicks(sim), [
      [10000, spiritTick],
      [12000, spiritTick],
      [14000, spiritTick],
      [16000, 70 - 3 * spiritTick], // capped at maxMana
    ]);
    expect(sim.snapshot().mana).toBe(stats.maxMana);
  });

  it('the five-second rule ends exactly 5000 ms after the spend', () => {
    const spec = regenSpec({ spirit: 100, mp5: 0 });
    const spiritTick = statsOf(spec).spiritRegenPerSec * 2;

    const exact = newSim({ spec });
    exact.start();
    exact.advanceTo(1000);
    exact.cast('zap'); // spend at 1000: the tick at 6000 is 5000 ms later
    exact.advanceTo(8000);
    expectRegen(regenTicks(exact), [[6000, spiritTick], [8000, 20 - spiritTick]]);

    const late = newSim({ spec });
    late.start();
    late.advanceTo(1001);
    late.cast('zap'); // the tick at 6000 is only 4999 ms later
    late.advanceTo(8000);
    expectRegen(regenTicks(late), [[8000, spiritTick]]);
  });

  it('mp5 regen applies even inside the five-second rule', () => {
    const spec = regenSpec({ spirit: 100, mp5: 10 });
    const stats = statsOf(spec);
    const mp5Tick = stats.mp5RegenPerSec * 2;
    const spiritTick = stats.spiritRegenPerSec * 2;
    expect(mp5Tick).toBe(4);
    const sim = newSim({ spec });
    sim.cast('bolt'); // -50 at 2000; the regen tick at 2000 runs first, at full mana
    sim.advanceTo(12000);
    expectRegen(regenTicks(sim), [
      [4000, mp5Tick],
      [6000, mp5Tick],
      [8000, mp5Tick + spiritTick],
      [10000, 50 - 3 * mp5Tick - spiritTick], // capped
    ]);
    expect(sim.snapshot().mana).toBe(stats.maxMana);
  });

  it('free spells (tap, scorch: cost 0) do not start the five-second rule', () => {
    const spells = withSpell('tap', { gainMana: { amount: 5, coeff: 0 } });
    const spec = regenSpec({ spirit: 100, mp5: 0 }, { spells });
    expect(statsOf(spec).spiritRegenPerSec * 2).toBeGreaterThan(10);
    const sim = newSim({ spec });
    sim.cast('zap'); // -20 at 0
    sim.advanceTo(1500);
    sim.cast('tap'); // +5
    sim.advanceTo(3000);
    sim.cast('tap'); // +5
    sim.advanceTo(4500);
    sim.cast('scorch');
    sim.advanceTo(8000);
    // Only zap (at 0) counts: spirit regen is back at 6000 and fills the last 10 (capped).
    expectRegen(regenTicks(sim), [[6000, 10]]);
  });

  it('regen ticks run every 2000 ms from fight start, before other events at the same time', () => {
    const spec = regenSpec({ spirit: 0, mp5: 10 });
    const sim = newSim({ spec });
    sim.start();
    sim.advanceTo(500);
    sim.cast('zap'); // -20 at 500
    sim.advanceTo(2000);
    sim.cast('bolt'); // completes at 4000, where a regen tick is also due
    sim.advanceTo(6000);
    expect(sim.log().filter((e) => e.atMs === 4000)).toEqual([
      { atMs: 4000, type: 'mana', amount: 4 },
      { atMs: 4000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 4000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
    ]);
    expect(regenTicks(sim).map(([t]) => t)).toEqual([2000, 4000, 6000]);
  });

  it('determinism: one advanceTo(60000) equals many small steps with regen, gains and spends', () => {
    const base = regenSpec({ spirit: 100, mp5: 10 });
    const spec = specWithStats(
      { ...base.setup.stats, critRating: (50 - BASE_CRIT_PCT - 100 / INT_PER_CRIT_PCT) * CRIT_RATING_PER_PCT },
      {},
    );
    const script: [number, string][] = [
      [0, 'bolt'],
      [2000, 'bolt'],
      [4000, 'zap'],
      [5500, 'dot'],
      [7000, 'bolt'],
      [8000, 'cancel'],
      [15000, 'tap'],
      [16500, 'bolt'],
      [30000, 'bolt'],
      [45000, 'curse'],
      [46500, 'bolt'],
      [59000, 'bolt'], // would land at 61000: cut off
    ];
    function play(stepMs: number | null): Simulation {
      const sim = newSim({ spec, seed: 11 });
      let now = 0;
      const goTo = (t: number) => {
        if (stepMs !== null) for (let s = now + stepMs; s < t; s += stepMs) sim.advanceTo(s);
        sim.advanceTo(t);
        now = t;
      };
      for (const [atMs, action] of script) {
        goTo(atMs);
        if (action === 'cancel') sim.cancelCast();
        else expect(sim.cast(action)).toEqual({ ok: true });
      }
      goTo(60000);
      return sim;
    }
    const jump = play(null);
    const steps = play(70);

    expect(steps.snapshot()).toEqual(jump.snapshot());
    expect(steps.log()).toEqual(jump.log());
    const stats = statsOf(spec);
    const amounts = regenTicks(jump).map(([, a]) => a ?? 0);
    expect(amounts.some((a) => Math.abs(a - 4) < 1e-9)).toBe(true); // mp5 only (in the rule)
    expect(amounts.some((a) => Math.abs(a - 4 - stats.spiritRegenPerSec * 2) < 1e-9)).toBe(true);
    expect(manaEvents(jump).some((e) => e.spellId === 'tap')).toBe(true);
    expect(jump.log().some((e) => e.type === 'damage' && e.crit)).toBe(true);
  });
});

describe('Simulation mana: infiniteMana', () => {
  it('infiniteMana: bolt always castable, snapshot.mana === maxMana', () => {
    const spec = lowManaSpec({ spells: withSpell('zap', { manaCost: 10000 }) });
    const maxMana = statsOf(spec).maxMana;
    const sim = newSim({ spec, infiniteMana: true });
    for (let t = 0; t < 40000; t += 2000) {
      sim.advanceTo(t);
      expect(sim.cast('bolt')).toEqual({ ok: true });
      expect(sim.snapshot().mana).toBe(maxMana);
      sim.advanceTo(t + 1000);
      expect(sim.snapshot().mana).toBe(maxMana);
    }
    sim.advanceTo(40000);
    expect(sim.cast('zap')).toEqual({ ok: true }); // costs more than the whole bar
    expect(sim.snapshot().mana).toBe(maxMana);
    expect(sim.log().filter((e) => e.type === 'cast-complete' && e.spellId === 'bolt')).toHaveLength(20);
  });

  it('infiniteMana: no regen entries; a tap gains nothing', () => {
    const spec = regenSpec({ spirit: 100, mp5: 10 });
    const sim = newSim({ spec, infiniteMana: true });
    sim.cast('bolt');
    sim.advanceTo(2000);
    sim.cast('tap');
    sim.advanceTo(60000);
    expect(regenTicks(sim)).toEqual([]);
    expect(manaEvents(sim)).toEqual([{ atMs: 2000, type: 'mana', spellId: 'tap', amount: 0 }]);
    expect(sim.snapshot().mana).toBe(statsOf(spec).maxMana);
  });
});
