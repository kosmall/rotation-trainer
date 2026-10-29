import { describe, expect, it } from 'vitest';
import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT, HASTE_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { CastResult, RawStats, SpellDef } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

const WINDOW_MS = 400;

function newSim(
  opts: { spec?: SpecData; durationMs?: number; windowMs?: number | null; seed?: number } = {},
): Simulation {
  const windowMs = opts.windowMs === undefined ? WINDOW_MS : opts.windowMs;
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: TEST_TARGET,
    seed: opts.seed ?? 1,
    ...(windowMs !== null ? { spellQueueWindowMs: windowMs } : {}),
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
  });
}

/** The fixture spec with some raw stats replaced (keeps the fixture's 0% crit offset). */
function specWithStats(patch: Partial<RawStats>, spec: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({ ...spec, setup: { ...base.setup, stats: { ...base.setup.stats, ...patch } } });
}

/** The fixture spec with one spell patched. */
function specWithSpell(spellId: string, patch: Partial<SpellDef>): SpecData {
  return makeTestSpec({ spells: makeTestSpec().spells.map((s) => (s.id === spellId ? { ...s, ...patch } : s)) });
}

function maxManaOf(spec: SpecData): number {
  return computeStats(spec.setup).maxMana;
}

function castsOf(sim: Simulation, spellId: string): number[] {
  return sim
    .log()
    .filter((e) => e.type === 'cast-complete' && e.spellId === spellId)
    .map((e) => e.atMs);
}

/** Captures the full observable state (copies, so later mutation cannot hide a change). */
function observe(sim: Simulation) {
  return { snapshot: sim.snapshot(), log: [...sim.log()] };
}

const QUEUED: CastResult = { ok: true, queued: true };

describe('Simulation spell queue (window 400)', () => {
  it('zap pressed 300 ms before GCD end is queued and fires exactly at GCD end', () => {
    const sim = newSim();
    sim.cast('scorch'); // free instant: GCD until 1500
    sim.advanceTo(1200);
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual(QUEUED);
    expect(sim.snapshot()).toEqual({ ...before.snapshot, queuedSpellId: 'zap' });
    expect(sim.log()).toEqual(before.log);
    sim.advanceTo(1499);
    expect(castsOf(sim, 'zap')).toEqual([]);
    expect(sim.snapshot().queuedSpellId).toBe('zap');
    sim.advanceTo(1500);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: 'scorch' },
      { atMs: 0, type: 'damage', spellId: 'scorch', amount: 100, crit: false },
      { atMs: 1500, type: 'cast-complete', spellId: 'zap' },
      { atMs: 1500, type: 'damage', spellId: 'zap', amount: 50, crit: false },
    ]);
    const snap = sim.snapshot();
    expect(snap.queuedSpellId).toBeNull();
    expect(snap.gcdEndsAtMs).toBe(3000);
    expect(snap.cooldownRemainingMs.zap).toBe(8000);
    expect(snap.mana).toBe(maxManaOf(makeTestSpec()) - 20);
  });

  it("zap pressed 500 ms before GCD end is rejected with 'gcd'", () => {
    const sim = newSim();
    sim.cast('scorch');
    sim.advanceTo(1000);
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'gcd' });
    expect(observe(sim)).toEqual(before);
    expect(sim.snapshot().queuedSpellId).toBeNull();
    sim.advanceTo(5000);
    expect(castsOf(sim, 'zap')).toEqual([]);
  });

  it('the window is inclusive: 400 ms before GCD end queues, 401 ms does not', () => {
    const at400 = newSim();
    at400.cast('scorch');
    at400.advanceTo(1100);
    expect(at400.cast('zap')).toEqual(QUEUED);
    const at401 = newSim();
    at401.cast('scorch');
    at401.advanceTo(1099);
    expect(at401.cast('zap')).toEqual({ ok: false, reason: 'gcd' });
  });

  it('queued bolt during a bolt cast fires at cast end', () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(1700);
    expect(sim.cast('bolt')).toEqual(QUEUED);
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 0, endMs: 2000 });
    expect(sim.snapshot().queuedSpellId).toBe('bolt');
    sim.advanceTo(2000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
      { atMs: 2000, type: 'cast-start', spellId: 'bolt' },
    ]);
    const snap = sim.snapshot();
    expect(snap.cast).toEqual({ spellId: 'bolt', startMs: 2000, endMs: 4000 });
    expect(snap.gcdEndsAtMs).toBe(3500);
    expect(snap.queuedSpellId).toBeNull();
    sim.advanceTo(4000);
    expect(castsOf(sim, 'bolt')).toEqual([2000, 4000]);
    expect(sim.snapshot().mana).toBe(maxManaOf(makeTestSpec()) - 100);
  });

  it('an off-GCD spell queued during a cast fires at cast end', () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(1800);
    expect(sim.cast('free')).toEqual(QUEUED);
    sim.advanceTo(2000);
    expect(castsOf(sim, 'free')).toEqual([2000]);
  });

  it('a cast shorter than the GCD: an on-GCD spell queues against the GCD end, not the cast end', () => {
    const spec = specWithSpell('bolt', { castTimeMs: 1000 });
    const sim = newSim({ spec, windowMs: 600 });
    sim.cast('bolt'); // cast ends 1000, GCD ends 1500
    sim.advanceTo(800);
    // 200 ms to the cast end, but 700 ms until zap could actually be cast.
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'busy' });
    sim.advanceTo(900);
    expect(sim.cast('zap')).toEqual(QUEUED); // still casting: queued against the GCD end
    sim.advanceTo(1499);
    expect(castsOf(sim, 'zap')).toEqual([]);
    sim.advanceTo(1500);
    expect(castsOf(sim, 'zap')).toEqual([1500]);
    expect(sim.log().some((e) => e.type === 'queue-drop')).toBe(false);
  });

  it('second queue request replaces the first', () => {
    const sim = newSim();
    sim.cast('scorch');
    sim.advanceTo(1200);
    expect(sim.cast('zap')).toEqual(QUEUED);
    sim.advanceTo(1300);
    expect(sim.cast('curse')).toEqual(QUEUED);
    expect(sim.snapshot().queuedSpellId).toBe('curse');
    sim.advanceTo(10000);
    expect(castsOf(sim, 'curse')).toEqual([1500]);
    expect(castsOf(sim, 'zap')).toEqual([]);
    expect(sim.snapshot().cooldownRemainingMs.zap).toBe(0);
    // Replacing is silent: no queue-drop for the replaced request.
    expect(sim.log().some((e) => e.type === 'queue-drop')).toBe(false);
  });

  it('queued spell that is on cooldown at fire time is dropped and logged', () => {
    // Bolt gets a 5000 ms cooldown that starts when the first bolt completes, i.e. exactly when
    // the queued bolt is attempted.
    const spec = specWithSpell('bolt', { cooldownMs: 5000 });
    const sim = newSim({ spec });
    sim.cast('bolt');
    sim.advanceTo(1800);
    expect(sim.cast('bolt')).toEqual(QUEUED);
    sim.advanceTo(2000);
    expect(sim.log()).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 2000, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 2000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
      { atMs: 2000, type: 'queue-drop', spellId: 'bolt' },
    ]);
    const snap = sim.snapshot();
    expect(snap.queuedSpellId).toBeNull();
    expect(snap.cast).toBeNull();
    expect(snap.gcdEndsAtMs).toBe(1500);
    expect(snap.cooldownRemainingMs.bolt).toBe(5000);
    expect(snap.mana).toBe(maxManaOf(spec) - 50);
  });

  it('queued spell that cannot be paid at fire time is dropped and logged', () => {
    const spec = specWithStats({ baseMana: 360 });
    expect(maxManaOf(spec)).toBe(80);
    const sim = newSim({ spec });
    sim.cast('bolt');
    sim.advanceTo(1800);
    expect(sim.cast('bolt')).toEqual(QUEUED); // 80 >= 50 now; the first bolt spends 50 at 2000
    sim.advanceTo(2000);
    expect(sim.log().slice(-1)).toEqual([{ atMs: 2000, type: 'queue-drop', spellId: 'bolt' }]);
    expect(sim.snapshot().mana).toBe(30);
    expect(sim.snapshot().cast).toBeNull();
  });

  it('queued spell whose required aura fades before fire time is dropped and logged', () => {
    const sim = newSim();
    sim.cast('dot'); // dotAura 0..6000
    sim.advanceTo(4100);
    sim.cast('bolt'); // ends 6100
    sim.advanceTo(5800);
    expect(sim.cast('needy')).toEqual(QUEUED);
    sim.advanceTo(6100);
    expect(sim.log().filter((e) => e.atMs >= 6000 && e.type !== 'mana' && e.type !== 'tick')).toEqual([
      { atMs: 6000, type: 'aura-fade', auraId: 'dotAura' },
      { atMs: 6100, type: 'cast-complete', spellId: 'bolt' },
      { atMs: 6100, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
      { atMs: 6100, type: 'queue-drop', spellId: 'needy' },
    ]);
    expect(sim.snapshot().cooldownRemainingMs.needy).toBe(0);
  });

  it('a queued spell meeting a new block at fire time (an off-GCD cast started meanwhile) is dropped', () => {
    const bolt = makeTestSpec().spells.find((s) => s.id === 'bolt');
    if (!bolt) throw new Error('fixture bolt missing');
    const slow: SpellDef = { ...bolt, id: 'slow', onGcd: false, manaCost: 0 };
    const sim = newSim({ spec: makeTestSpec({ spells: [...makeTestSpec().spells, slow] }) });
    sim.cast('scorch'); // GCD until 1500
    sim.advanceTo(1200);
    expect(sim.cast('zap')).toEqual(QUEUED);
    sim.advanceTo(1300);
    expect(sim.cast('slow')).toEqual({ ok: true }); // off the GCD: casts now, until 3300
    expect(sim.snapshot().queuedSpellId).toBe('zap');
    sim.advanceTo(1500);
    expect(sim.log().slice(-1)).toEqual([{ atMs: 1500, type: 'queue-drop', spellId: 'zap' }]);
    expect(sim.snapshot().cast).toEqual({ spellId: 'slow', startMs: 1300, endMs: 3300 });
    sim.advanceTo(10000);
    expect(castsOf(sim, 'zap')).toEqual([]);
  });

  it('window 0 never queues', () => {
    for (const windowMs of [0, null]) {
      const sim = newSim({ windowMs });
      sim.cast('scorch');
      sim.advanceTo(1499);
      let before = observe(sim);
      expect(sim.cast('zap')).toEqual({ ok: false, reason: 'gcd' });
      expect(observe(sim)).toEqual(before);
      sim.advanceTo(1500);
      sim.cast('bolt');
      sim.advanceTo(3499);
      before = observe(sim);
      expect(sim.cast('bolt')).toEqual({ ok: false, reason: 'busy' });
      expect(sim.cast('free')).toEqual({ ok: false, reason: 'busy' });
      expect(observe(sim)).toEqual(before);
      expect(sim.snapshot().queuedSpellId).toBeNull();
      sim.advanceTo(10000);
      expect(castsOf(sim, 'bolt')).toEqual([3500]);
    }
  });

  it('cancelCast clears the queue', () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(1800);
    expect(sim.cast('zap')).toEqual(QUEUED);
    sim.cancelCast();
    expect(sim.snapshot().queuedSpellId).toBeNull();
    expect(sim.snapshot().cast).toBeNull();
    sim.advanceTo(10000);
    expect(castsOf(sim, 'zap')).toEqual([]);
    expect(castsOf(sim, 'bolt')).toEqual([]);
    expect(sim.log().filter((e) => e.type !== 'mana')).toEqual([
      { atMs: 0, type: 'cast-start', spellId: 'bolt' },
      { atMs: 1800, type: 'cast-cancel', spellId: 'bolt' },
    ]);
  });

  it('cancelCast with nothing casting clears a spell queued on the GCD, silently', () => {
    const sim = newSim();
    sim.cast('scorch');
    sim.advanceTo(1200);
    expect(sim.cast('zap')).toEqual(QUEUED);
    const before = observe(sim);
    sim.cancelCast();
    expect(observe(sim)).toEqual({ ...before, snapshot: { ...before.snapshot, queuedSpellId: null } });
    sim.advanceTo(10000);
    expect(castsOf(sim, 'zap')).toEqual([]);
    expect(sim.log().some((e) => e.type === 'queue-drop')).toBe(false);
  });

  it('inside the window a spell that already fails another check is rejected with that reason, not queued', () => {
    // zap on cooldown, pressed 200 ms before a bolt's cast end.
    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(1500);
    sim.cast('bolt'); // ends 3500
    sim.advanceTo(3300);
    let before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
    expect(sim.cast('needy')).toEqual({ ok: false, reason: 'missing-aura' });
    expect(observe(sim)).toEqual(before);
    // Outside the window the plain rejection order applies: busy first.
    const early = newSim();
    early.cast('zap');
    early.advanceTo(1500);
    early.cast('bolt');
    early.advanceTo(3000);
    expect(early.cast('zap')).toEqual({ ok: false, reason: 'busy' });

    // Unaffordable now: rejected with 'no-mana'.
    const poor = newSim({ spec: specWithStats({ baseMana: 360 }) }); // maxMana 80
    poor.cast('bolt');
    poor.advanceTo(2000); // mana 30
    poor.cast('scorch'); // GCD until 3500
    poor.advanceTo(3200);
    before = observe(poor);
    expect(poor.cast('bolt')).toEqual({ ok: false, reason: 'no-mana' });
    expect(observe(poor)).toEqual(before);
  });

  it('a rejected request keeps the spell already queued', () => {
    const sim = newSim();
    sim.cast('zap');
    sim.advanceTo(1500);
    sim.cast('bolt'); // ends 3500
    sim.advanceTo(3200);
    expect(sim.cast('scorch')).toEqual(QUEUED);
    const before = observe(sim);
    expect(sim.cast('zap')).toEqual({ ok: false, reason: 'cooldown' });
    expect(observe(sim)).toEqual(before);
    sim.advanceTo(3500);
    expect(castsOf(sim, 'scorch')).toEqual([3500]);
  });

  it('a spell queued past the fight end is discarded without queue-drop', () => {
    const sim = newSim({ durationMs: 1400 });
    sim.cast('scorch'); // GCD until 1500, after the end
    sim.advanceTo(1100);
    expect(sim.cast('zap')).toEqual(QUEUED);
    sim.advanceTo(1400);
    const snap = sim.snapshot();
    expect(snap.phase).toBe('ended');
    expect(snap.queuedSpellId).toBeNull();
    expect(castsOf(sim, 'zap')).toEqual([]);
    expect(sim.log().some((e) => e.type === 'queue-drop')).toBe(false);
  });

  it('a spell queued to fire exactly at the fight end is cast', () => {
    const sim = newSim({ durationMs: 1500 });
    sim.cast('scorch');
    sim.advanceTo(1100);
    expect(sim.cast('zap')).toEqual(QUEUED);
    sim.advanceTo(1500);
    expect(sim.snapshot().phase).toBe('ended');
    expect(castsOf(sim, 'zap')).toEqual([1500]);
  });

  it('advanceTo(60000) in one call equals 70 ms steps with queued casts, drops and replacements', () => {
    // 50% crit (RNG draws on every hit) and 10% haste (bolt 1818 ms, GCD 1364 ms).
    const base = makeTestSpec();
    const spec = makeTestSpec({
      spells: base.spells.map((s) => (s.id === 'bolt' ? { ...s, cooldownMs: 3000 } : s)),
      setup: {
        ...base.setup,
        stats: {
          ...base.setup.stats,
          critRating: (50 - BASE_CRIT_PCT) * CRIT_RATING_PER_PCT,
          hasteRating: HASTE_RATING_PER_PCT * 10,
        },
      },
    });
    const script: [number, string, CastResult][] = [
      [0, 'bolt', { ok: true }], // ends 1818, cooldown until 4818
      [1500, 'zap', QUEUED], // fires 1818
      [1818, 'free', { ok: true }],
      [2900, 'bolt', { ok: false, reason: 'cooldown' }], // GCD ends 3182, but bolt is on cooldown now
      [5000, 'scorch', { ok: true }], // GCD until 6364
      [6000, 'curse', QUEUED],
      [6100, 'bolt', QUEUED], // replaces curse; fires 6364, ends 8182
      [8000, 'bolt', QUEUED], // dropped at 8182: bolt cooldown
      [20000, 'bolt', { ok: true }], // ends 21818
      [21500, 'bolt', QUEUED], // dropped at 21818: cooldown
      [30000, 'dot', { ok: true }],
      [31000, 'needy', QUEUED], // fires 31364, consumes dotAura
      [59000, 'scorch', { ok: true }], // GCD until 60364
      [59990, 'zap', QUEUED], // discarded at the fight end
    ];
    function play(stepMs: number | null): { sim: Simulation; results: CastResult[] } {
      const sim = newSim({ spec, seed: 11 });
      const results: CastResult[] = [];
      let now = 0;
      const goTo = (t: number) => {
        if (stepMs !== null) for (let s = now + stepMs; s < t; s += stepMs) sim.advanceTo(s);
        sim.advanceTo(t);
        now = t;
      };
      for (const [atMs, spellId] of script) {
        goTo(atMs);
        results.push(sim.cast(spellId));
      }
      goTo(60000);
      return { sim, results };
    }
    const jump = play(null);
    const steps = play(70);

    expect(steps.results).toEqual(jump.results);
    expect(steps.sim.snapshot()).toEqual(jump.sim.snapshot());
    expect(steps.sim.log()).toEqual(jump.sim.log());
    expect(jump.results).toEqual(script.map(([, , r]) => r));
    const log = jump.sim.log();
    expect(log.filter((e) => e.type === 'queue-drop').map((e) => [e.atMs, e.spellId])).toEqual([
      [8182, 'bolt'],
      [21818, 'bolt'],
    ]);
    expect(castsOf(jump.sim, 'zap')).toEqual([1818]);
    expect(castsOf(jump.sim, 'needy')).toEqual([31364]);
    expect(castsOf(jump.sim, 'curse')).toEqual([]);
    expect(jump.sim.snapshot().queuedSpellId).toBeNull();
    // Both crits and non-crits occurred, so the RNG was actually drawn.
    const crits = log.filter((e) => e.type === 'damage').map((e) => e.crit);
    expect(crits).toContain(true);
    expect(crits).toContain(false);
  });
});
