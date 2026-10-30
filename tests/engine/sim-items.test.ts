import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { createRng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import type { LogEvent, RawStats, SpecHooks, SpellDef, TargetData } from '../../src/engine/types';
import { TEST_TARGET, makeItemTestSpec } from '../fixtures/testSpec';

const WINDOW_MS = 400;
const ALWAYS_MISS: TargetData = { ...TEST_TARGET, missPct: 100, minMissPct: 100 };

function newSim(
  opts: {
    spec?: SpecData;
    durationMs?: number;
    windowMs?: number;
    seed?: number;
    target?: TargetData;
    distanceFromTarget?: number;
  } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeItemTestSpec(),
    target: opts.target ?? TEST_TARGET,
    seed: opts.seed ?? 1,
    spellQueueWindowMs: opts.windowMs ?? WINDOW_MS,
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    ...(opts.distanceFromTarget !== undefined ? { distanceFromTarget: opts.distanceFromTarget } : {}),
  });
}

/** The item fixture spec with some spells patched (and other fields replaced). */
function patched(spells: Record<string, Partial<SpellDef>>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeItemTestSpec();
  return makeItemTestSpec({ spells: base.spells.map((s) => ({ ...s, ...spells[s.id] })), ...spec });
}

function withStats(patch: Partial<RawStats>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeItemTestSpec();
  return makeItemTestSpec({ setup: { ...base.setup, stats: { ...base.setup.stats, ...patch } }, ...spec });
}

/** Hooks that record every call and draw one `roll()` per call. */
function recordingHooks(calls: string[], rolls: number[]): SpecHooks {
  return {
    onSpellResolved(e, api) {
      calls.push(e.spellId);
      rolls.push(api.roll());
    },
  };
}

function ofType(sim: Simulation, type: LogEvent['type']): LogEvent[] {
  return sim.log().filter((e) => e.type === type);
}

describe('Simulation: item actions', () => {
  it('an item action is instant, off the GCD and does not start the GCD', () => {
    const sim = newSim();
    expect(sim.cast('zap')).toEqual({ ok: true }); // instant on-GCD spell: GCD 0..1500
    sim.advanceTo(500);
    expect(sim.cast('trinketA')).toEqual({ ok: true }); // during the GCD: used at once, not queued
    const snap = sim.snapshot();
    expect(snap.gcdEndsAtMs).toBe(1500);
    expect(snap.queuedSpellId).toBeNull();
    expect(snap.cast).toBeNull();
    expect(sim.log().filter((e) => e.spellId === 'trinketA')).toEqual([
      { atMs: 500, type: 'cast-complete', spellId: 'trinketA' },
      { atMs: 500, type: 'aura-apply', spellId: 'trinketA', auraId: 'trinketBuff' },
    ]);

    // Item first, then a GCD spell: the GCD runs from the spell only.
    const sim2 = newSim();
    expect(sim2.cast('trinketA')).toEqual({ ok: true });
    expect(sim2.snapshot().gcdEndsAtMs).toBe(0);
    sim2.advanceTo(300);
    expect(sim2.cast('zap')).toEqual({ ok: true });
    expect(sim2.snapshot().gcdEndsAtMs).toBe(1800);
    expect(ofType(sim2, 'cast-start')).toEqual([]);
  });

  it('an item action applies its self aura and the aura stat bonus affects the next cast', () => {
    const sim = newSim();
    sim.cast('scaled'); // coeff 1: deals exactly the shadow spell power (0)
    sim.cast('trinketA');
    sim.cast('scaled'); // +100 spell power from trinketBuff
    sim.cast('burstPot');
    sim.cast('scaled'); // +100 +40
    expect(ofType(sim, 'damage').map((e) => e.amount)).toEqual([0, 100, 140]);
    const auras = sim.snapshot().selfAuras;
    expect(auras['trinketBuff']).toEqual({ auraId: 'trinketBuff', stacks: 1, charges: 0, remainingMs: 20000 });
    expect(auras['potionBuff']?.remainingMs).toBe(15000);
    sim.advanceTo(20000);
    sim.cast('scaled');
    expect(ofType(sim, 'damage').map((e) => e.amount)).toEqual([0, 100, 140, 0]);
  });

  it('an item action never runs hooks', () => {
    const calls: string[] = [];
    const sim = newSim({ spec: makeItemTestSpec({ hooks: recordingHooks(calls, []) }) });
    sim.cast('trinketA');
    sim.cast('manaPot');
    sim.cast('burstPot'); // rejected cooldown (potion group): no hook either
    expect(calls).toEqual([]);
    sim.cast('free');
    expect(calls).toEqual(['free']);
  });

  it('an item action does not roll the hit table (even with canMiss/canCrit set in data)', () => {
    const play = (useItem: boolean) => {
      const rolls: string[] = [];
      const values: number[] = [];
      const spec = patched({ trinketA: { canMiss: true, canCrit: true } }, { hooks: recordingHooks(rolls, values) });
      const sim = newSim({ spec, seed: 5, target: ALWAYS_MISS });
      if (useItem) expect(sim.cast('trinketA')).toEqual({ ok: true });
      sim.cast('free'); // draws nothing itself; the hook's roll is the next draw
      return { sim, values };
    };
    const first = createRng(5).next();
    const without = play(false);
    const withItem = play(true);
    expect(without.values).toEqual([first]);
    expect(withItem.values).toEqual([first]);
    // Against a target that is never hit, the item still applies its aura: no miss roll.
    expect(ofType(withItem.sim, 'miss')).toEqual([]);
    expect(withItem.sim.snapshot().selfAuras['trinketBuff']).toBeDefined();
  });

  it('gainManaRange draws once, stays within [min, max], caps at max mana, logs the actual gain; never used = no draw', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const values: number[] = [];
      const sim = newSim({ seed, spec: makeItemTestSpec({ hooks: recordingHooks([], values) }) });
      const maxMana = sim.snapshot().maxMana;
      sim.cast('sink'); // -600; draws nothing itself, its hook rolls draw 1
      expect(sim.cast('manaPot')).toEqual({ ok: true }); // draw 2 (no hook)
      const rng = createRng(seed);
      const draws = [rng.next(), rng.next(), rng.next()] as const;
      const expected = 100 + Math.floor(draws[1] * 301);
      expect(expected).toBeGreaterThanOrEqual(100);
      expect(expected).toBeLessThanOrEqual(400);
      expect(ofType(sim, 'mana')).toEqual([{ atMs: 0, type: 'mana', spellId: 'manaPot', amount: expected }]);
      expect(sim.snapshot().mana).toBe(maxMana - 600 + expected);
      sim.cast('free'); // its hook roll is draw 3: the potion drew exactly once
      expect(values).toEqual([draws[0], draws[2]]);
    }

    // Caps at max mana and logs the actual gain.
    const capped = newSim({ spec: patched({ manaPot: { gainManaRange: { min: 700, max: 800 } } }) });
    const maxMana = capped.snapshot().maxMana;
    capped.cast('sink');
    capped.cast('manaPot');
    expect(capped.snapshot().mana).toBe(maxMana);
    expect(ofType(capped, 'mana')).toEqual([{ atMs: 0, type: 'mana', spellId: 'manaPot', amount: 600 }]);

    // At full mana: still one draw, gain 0.
    const full = newSim();
    full.cast('manaPot');
    expect(ofType(full, 'mana')).toEqual([{ atMs: 0, type: 'mana', spellId: 'manaPot', amount: 0 }]);

    // A spec that has the potion but never uses it draws nothing for it.
    const values: number[] = [];
    const unused = newSim({ seed: 9, spec: makeItemTestSpec({ hooks: recordingHooks([], values) }) });
    unused.cast('free');
    expect(values).toEqual([createRng(9).next()]);
  });

  it('an item action does not start the five-second rule (even with a mana cost in data)', () => {
    const play = (useItem: boolean) => {
      const spec = withStats(
        { intellect: 100, spirit: 100 },
        { spells: patched({ trinketA: { manaCost: 100 } }).spells },
      );
      const sim = newSim({ spec, durationMs: 60000 });
      sim.cast('sink'); // five-second rule until 5000
      sim.advanceTo(6000);
      const before = sim.snapshot().mana;
      if (useItem) expect(sim.cast('trinketA')).toEqual({ ok: true });
      expect(sim.snapshot().mana).toBe(before); // nothing spent
      sim.advanceTo(8000);
      return { sim, before };
    };
    const without = play(false);
    const withItem = play(true);
    expect(withItem.sim.snapshot().mana).toBe(without.sim.snapshot().mana);
    // The 8000 tick included spirit regen in both runs.
    const regen8000 = (sim: Simulation) => ofType(sim, 'mana').find((e) => e.atMs === 8000)?.amount;
    expect(regen8000(withItem.sim)).toBeGreaterThan(0);
    expect(regen8000(withItem.sim)).toBe(regen8000(without.sim));
    expect(withItem.sim.snapshot().spells['trinketA']).toEqual({ manaCost: 0, castTimeMs: 0 });
  });

  it('the engine enforces item rules over data mistakes: no GCD, no cast time, no cost, no missile', () => {
    const spec = patched({
      trinketA: { onGcd: true, castTimeMs: 1500, manaCost: 100, missileSpeed: 20, canMiss: true, canCrit: true },
    });
    const sim = newSim({ spec, distanceFromTarget: 28 });
    expect(sim.snapshot().spells['trinketA']).toEqual({ manaCost: 0, castTimeMs: 0 });
    const maxMana = sim.snapshot().maxMana;
    expect(sim.cast('trinketA')).toEqual({ ok: true });
    const snap = sim.snapshot();
    expect(snap.gcdEndsAtMs).toBe(0);
    expect(snap.cast).toBeNull();
    expect(snap.inFlight).toEqual([]);
    expect(snap.mana).toBe(maxMana);
    expect(snap.selfAuras['trinketBuff']).toBeDefined();
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'trinketA' },
      { atMs: 0, type: 'aura-apply', spellId: 'trinketA', auraId: 'trinketBuff' },
    ]);
  });

  it("own cooldown: a second press before cooldownMs is rejected 'cooldown'", () => {
    const sim = newSim({ durationMs: 300000 });
    expect(sim.cast('trinketA')).toEqual({ ok: true });
    expect(sim.snapshot().cooldownRemainingMs['trinketA']).toBe(120000);
    sim.advanceTo(119999);
    expect(sim.cast('trinketA')).toEqual({ ok: false, reason: 'cooldown' });
    sim.advanceTo(120000);
    expect(sim.cast('trinketA')).toEqual({ ok: true });
  });

  it('shared cooldown: using A makes B (same group) unavailable for ms; a longer cooldown already running on B is not shortened; A own cooldown stays longer than the group ms', () => {
    const sim = newSim({ durationMs: 300000 });
    expect(sim.cast('trinketA')).toEqual({ ok: true });
    let cd = sim.snapshot().cooldownRemainingMs;
    expect(cd['trinketA']).toBe(120000); // own, longer than the 20 s group
    expect(cd['trinketB']).toBe(20000);
    expect(cd['manaPot']).toBe(0); // another group
    sim.advanceTo(19999);
    expect(sim.cast('trinketB')).toEqual({ ok: false, reason: 'cooldown' });
    sim.advanceTo(20000);
    expect(sim.cast('trinketB')).toEqual({ ok: true });
    cd = sim.snapshot().cooldownRemainingMs;
    expect(cd['trinketB']).toBe(60000); // own
    expect(cd['trinketA']).toBe(100000); // its own 120 s, not shortened to the 20 s group

    // B first (own 60 s), then A at 20 s: the group's 20 s does not shorten B's 40 s left.
    const sim2 = newSim({ durationMs: 300000 });
    sim2.cast('trinketB');
    sim2.advanceTo(20000);
    expect(sim2.cast('trinketA')).toEqual({ ok: true });
    cd = sim2.snapshot().cooldownRemainingMs;
    expect(cd['trinketB']).toBe(40000);
    expect(cd['trinketA']).toBe(120000);

    // Potion group: both potions share 120 s; trinkets untouched.
    const sim3 = newSim({ durationMs: 300000 });
    sim3.cast('burstPot');
    cd = sim3.snapshot().cooldownRemainingMs;
    expect(cd['burstPot']).toBe(120000);
    expect(cd['manaPot']).toBe(120000);
    expect(cd['trinketA']).toBe(0);
    expect(sim3.cast('manaPot')).toEqual({ ok: false, reason: 'cooldown' });
    expect(sim3.cast('trinketA')).toEqual({ ok: true });
  });

  it('the item is blocked by a cast in progress (busy) and queues within the window, then fires at the cast end without GCD', () => {
    const noWindow = newSim({ windowMs: 0 });
    noWindow.cast('bolt'); // 0..2000
    noWindow.advanceTo(1700);
    expect(noWindow.cast('trinketA')).toEqual({ ok: false, reason: 'busy' });

    const sim = newSim();
    sim.cast('bolt'); // 0..2000, GCD 0..1500
    sim.advanceTo(1000);
    expect(sim.cast('trinketA')).toEqual({ ok: false, reason: 'busy' }); // 1000 ms before the end
    sim.advanceTo(1700);
    expect(sim.cast('trinketA')).toEqual({ ok: true, queued: true });
    expect(sim.snapshot().queuedSpellId).toBe('trinketA');
    sim.advanceTo(2000);
    expect(sim.log().filter((e) => e.atMs >= 1700)).toEqual([
      { atMs: 1700, type: 'queue', spellId: 'trinketA' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
      { atMs: 2000, type: 'cast-complete', spellId: 'trinketA' },
      { atMs: 2000, type: 'aura-apply', spellId: 'trinketA', auraId: 'trinketBuff' },
    ]);
    const snap = sim.snapshot();
    expect(snap.queuedSpellId).toBeNull();
    expect(snap.gcdEndsAtMs).toBe(1500); // the item started no GCD
    expect(sim.cast('zap')).toEqual({ ok: true });

    // One queue slot: an item pressed in the window replaces a queued GCD spell.
    const replace = newSim();
    replace.cast('bolt');
    replace.advanceTo(1700);
    expect(replace.cast('curse')).toEqual({ ok: true, queued: true });
    expect(replace.cast('trinketA')).toEqual({ ok: true, queued: true });
    expect(replace.log().slice(-3)).toEqual([
      { atMs: 1700, type: 'queue', spellId: 'curse' },
      { atMs: 1700, type: 'queue-drop', spellId: 'curse', reason: 'replaced' },
      { atMs: 1700, type: 'queue', spellId: 'trinketA' },
    ]);

    // The GCD alone never blocks an item: it is used at once and a queued GCD spell stays.
    const gcd = newSim();
    gcd.cast('curse'); // instant, GCD 0..1500
    gcd.advanceTo(1200);
    expect(gcd.cast('curse')).toEqual({ ok: true, queued: true });
    expect(gcd.cast('trinketA')).toEqual({ ok: true });
    expect(gcd.snapshot().queuedSpellId).toBe('curse');
    gcd.advanceTo(1500);
    expect(ofType(gcd, 'cast-complete').map((e) => [e.atMs, e.spellId])).toEqual([
      [0, 'curse'],
      [1200, 'trinketA'],
      [1500, 'curse'],
    ]);
  });

  it('a press in ready starts the fight like a cast (R13)', () => {
    const sim = newSim();
    expect(sim.snapshot().phase).toBe('ready');
    expect(sim.cast('trinketA')).toEqual({ ok: true });
    expect(sim.snapshot().phase).toBe('running');
    expect(sim.log()[0]).toEqual({ atMs: 0, type: 'cast-complete', spellId: 'trinketA' });
  });

  it('jump-vs-steps determinism with item use', () => {
    const script: [number, string, boolean][] = [
      [0, 'trinketA', false],
      [0, 'bolt', false],
      [1777, 'manaPot', true], // queued behind bolt, fires at 2000 (one Rng draw)
      [2001, 'bolt', false],
      [4100, 'trinketB', false], // trinket group until 20000: rejected
      [20000, 'trinketB', false],
      [20000, 'hasteUp', false],
      [20000, 'bolt', false],
      [33333, 'curse', false],
      [33333, 'burstPot', false], // potion group until 122000: rejected
    ];
    const run = (stepMs: number | null) => {
      const sim = newSim({ spec: makeItemTestSpec({ modifiers: [{ spellIds: ['bolt'], critPctDelta: 50 }] }) });
      let t = 0;
      const results: string[] = [];
      for (const [atMs, spellId] of script) {
        if (stepMs !== null) for (; t + stepMs < atMs; t += stepMs) sim.advanceTo(t + stepMs);
        sim.advanceTo(atMs);
        t = atMs;
        const r = sim.cast(spellId);
        results.push(r.ok ? (r.queued ? 'queued' : 'ok') : r.reason);
      }
      if (stepMs !== null) for (; t < 60000; t += stepMs) sim.advanceTo(t + stepMs);
      sim.advanceTo(60000);
      return { sim, results };
    };
    const jump = run(null);
    const steps = run(70);
    expect(jump.results).toEqual(['ok', 'ok', 'queued', 'ok', 'cooldown', 'ok', 'ok', 'ok', 'ok', 'cooldown']);
    expect(steps.results).toEqual(jump.results);
    expect(steps.sim.snapshot()).toEqual(jump.sim.snapshot());
    expect(steps.sim.log()).toEqual(jump.sim.log());
    expect(ofType(jump.sim, 'cast-complete').map((e) => [e.atMs, e.spellId])).toContainEqual([2000, 'manaPot']);
  });

  it('a fight that ends with a queued item discards it silently', () => {
    const sim = newSim({ durationMs: 1900 });
    sim.cast('bolt'); // would end at 2000, after the fight
    sim.advanceTo(1700);
    expect(sim.cast('trinketA')).toEqual({ ok: true, queued: true });
    sim.advanceTo(1900);
    const snap = sim.snapshot();
    expect(snap.phase).toBe('ended');
    expect(snap.queuedSpellId).toBeNull();
    expect(sim.log().filter((e) => e.spellId === 'trinketA')).toEqual([
      { atMs: 1700, type: 'queue', spellId: 'trinketA' },
    ]);
    expect(ofType(sim, 'queue-drop')).toEqual([]);
  });

  it('invalid gainManaRange or sharedCooldown data throws a RangeError in the constructor', () => {
    const bad: Partial<SpellDef>[] = [
      { gainManaRange: { min: 400, max: 100 } },
      { gainManaRange: { min: 100.5, max: 400 } },
      { gainManaRange: { min: 100, max: 400.5 } },
      { gainManaRange: { min: -1, max: 400 } },
      { gainManaRange: { min: Number.NaN, max: 400 } },
      { gainManaRange: { min: 100, max: Number.POSITIVE_INFINITY } },
      { sharedCooldown: { group: 'potion', ms: -1 } },
      { sharedCooldown: { group: 'potion', ms: Number.NaN } },
      { sharedCooldown: { group: 'potion', ms: 1.5 } },
      { requiresTargetAura: 'someDebuff' },
      { consumesTargetAura: 'someDebuff' },
      { direct: { min: 1, max: 2, coeff: 0 } },
    ];
    for (const patch of bad) {
      expect(() => newSim({ spec: patched({ manaPot: patch }) })).toThrow(RangeError);
    }
    // min === max is valid (a fixed amount, still one draw).
    expect(() => newSim({ spec: patched({ manaPot: { gainManaRange: { min: 0, max: 0 } } }) })).not.toThrow();
  });

  it("an own cooldown shorter than the group's never shortens the group cooldown on the used item itself", () => {
    const sim = newSim({ spec: patched({ burstPot: { cooldownMs: 60000 } }), durationMs: 300000 });
    expect(sim.cast('burstPot')).toEqual({ ok: true });
    expect(sim.snapshot().cooldownRemainingMs['burstPot']).toBe(120000); // the 120 s potion group
  });
});
