import { describe, expect, it } from 'vitest';
import { HASTE_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, LogEvent, LogType, ScheduledAura, SpellDef, TargetData } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

const icon = 'test';

/** Auras only these tests use, appended to the fixture's. */
const EXTRA_AURAS: AuraDef[] = [
  // Heroism-like: +30% haste, multiplicative with rating haste.
  { id: 'heroism', name: 'Heroism', icon, durationMs: 40000, selfStatMultipliers: { haste: 1.3 } },
  // Two "armors": mutually exclusive self auras.
  { id: 'armorA', name: 'Armor A', icon, durationMs: 1800000, exclusiveGroup: 'armor', selfStatBonuses: { spellPower: 100 } },
  { id: 'armorB', name: 'Armor B', icon, durationMs: 1800000, exclusiveGroup: 'armor', selfStatBonuses: { spellPower: 200 } },
  // A raid debuff with a very long own duration (ruling S3: the end of the fight cuts it).
  { id: 'raidDebuff', name: 'Raid Debuff', icon, durationMs: 3600000, damageTakenMult: { schools: ['shadow'], mult: 1.1 } },
  // A stacking target aura.
  { id: 'stacky', name: 'Stacky', icon, durationMs: 10000, maxStacks: 3 },
  // An intellect buff (raises maxMana).
  { id: 'brain', name: 'Brain', icon, durationMs: 1800000, selfStatBonuses: { intellect: 100 } },
];

interface Opts {
  spec?: SpecData;
  target?: TargetData;
  scheduledAuras?: ScheduledAura[];
  durationMs?: number;
  distanceFromTarget?: number;
  infiniteMana?: boolean;
  seed?: number;
}

/** infiniteMana by default (no regen entries in the log). */
function newSim(opts: Opts = {}): Simulation {
  return new Simulation({
    spec: opts.spec ?? spec(),
    target: opts.target ?? TEST_TARGET,
    seed: opts.seed ?? 1,
    infiniteMana: opts.infiniteMana ?? true,
    ...(opts.scheduledAuras !== undefined ? { scheduledAuras: opts.scheduledAuras } : {}),
    ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    ...(opts.distanceFromTarget !== undefined ? { distanceFromTarget: opts.distanceFromTarget } : {}),
  });
}

/** The fixture plus EXTRA_AURAS, with some spells patched. */
function spec(patch: Record<string, Partial<SpellDef>> = {}, overrides: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec(overrides);
  return {
    ...base,
    spells: base.spells.map((s) => ({ ...s, ...(patch[s.id] ?? {}) })),
    auras: [...base.auras, ...EXTRA_AURAS],
  };
}

function ofType(sim: Simulation, ...types: LogType[]): LogEvent[] {
  return sim.log().filter((e) => types.includes(e.type));
}

function auraLog(sim: Simulation, auraId: string): LogEvent[] {
  return sim.log().filter((e) => e.auraId === auraId && (e.type === 'aura-apply' || e.type === 'aura-fade'));
}

function damageOf(sim: Simulation, spellId: string): number[] {
  return ofType(sim, 'damage')
    .filter((e) => e.spellId === spellId)
    .map((e) => e.amount ?? NaN);
}

describe('Simulation scheduled auras (SimConfig.scheduledAuras)', () => {
  it('a self aura scheduled at 0 is active from the first cast and fades at its duration', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'pumped', on: 'self', atMs: 0 }] });
    // Not started yet: nothing applied, the log is empty.
    expect(sim.snapshot().selfAuras).toEqual({});
    expect(sim.log()).toEqual([]);
    sim.cast('scaled'); // deals exactly the shadow power
    expect(sim.log()[0]).toEqual({ atMs: 0, type: 'aura-apply', auraId: 'pumped' });
    expect(damageOf(sim, 'scaled')).toEqual([100]);
    expect(sim.snapshot().selfAuras.pumped).toEqual({ auraId: 'pumped', stacks: 1, charges: 0, remainingMs: 10000 });
    sim.advanceTo(9999);
    expect(sim.snapshot().selfAuras.pumped?.remainingMs).toBe(1);
    sim.advanceTo(10000);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100, 0]);
    expect(auraLog(sim, 'pumped')).toEqual([
      { atMs: 0, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 10000, type: 'aura-fade', auraId: 'pumped' },
    ]);
  });

  it('scheduled at 5000 appears at 5000', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'pumped', on: 'self', atMs: 5000 }] });
    sim.cast('free');
    sim.advanceTo(4999);
    expect(sim.snapshot().selfAuras).toEqual({});
    sim.cast('scaled');
    sim.advanceTo(5000);
    expect(sim.snapshot().selfAuras.pumped).toEqual({ auraId: 'pumped', stacks: 1, charges: 0, remainingMs: 10000 });
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([0, 100]);
    sim.advanceTo(15000);
    expect(auraLog(sim, 'pumped')).toEqual([
      { atMs: 5000, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 15000, type: 'aura-fade', auraId: 'pumped' },
    ]);
  });

  it('durationMs override shortens the aura', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'pumped', on: 'self', atMs: 1000, durationMs: 3000 }] });
    sim.cast('free');
    sim.advanceTo(1000);
    expect(sim.snapshot().selfAuras.pumped?.remainingMs).toBe(3000);
    sim.advanceTo(3999);
    sim.cast('scaled');
    sim.advanceTo(4000);
    expect(sim.snapshot().selfAuras).toEqual({});
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100, 0]);
    sim.advanceTo(20000);
    expect(auraLog(sim, 'pumped')).toEqual([
      { atMs: 1000, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 4000, type: 'aura-fade', auraId: 'pumped' },
    ]);
  });

  it('durationMs override can also lengthen the aura past its own duration', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'pumped', on: 'self', atMs: 1000, durationMs: 20000 }] });
    sim.cast('free');
    sim.advanceTo(15000); // the aura's own 10000 would have ended at 11000
    expect(sim.snapshot().selfAuras.pumped?.remainingMs).toBe(6000);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100]);
    sim.advanceTo(30000);
    expect(auraLog(sim, 'pumped')).toEqual([
      { atMs: 1000, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 21000, type: 'aura-fade', auraId: 'pumped' },
    ]);
  });

  it('atMs after the fight end never applies', () => {
    const sim = newSim({
      durationMs: 5000,
      scheduledAuras: [
        { auraId: 'pumped', on: 'self', atMs: 5001 },
        { auraId: 'weak', on: 'target', atMs: 1e12 },
        { auraId: 'stacky', on: 'target', atMs: Number.MAX_VALUE },
        // Exactly at the end still applies (events at durationMs run).
        { auraId: 'hasteUp', on: 'self', atMs: 5000 },
      ],
    });
    sim.cast('free');
    sim.advanceTo(5000);
    expect(sim.snapshot().phase).toBe('ended');
    expect(ofType(sim, 'aura-apply', 'aura-fade')).toEqual([{ atMs: 5000, type: 'aura-apply', auraId: 'hasteUp' }]);
  });

  it('a duration running past the end is cut by the end (no aura-fade logged after it)', () => {
    const sim = newSim({
      durationMs: 10000,
      scheduledAuras: [
        { auraId: 'pumped', on: 'self', atMs: 8000 },
        { auraId: 'weak', on: 'target', atMs: 0, durationMs: 1e15 },
        // A DoT scheduled for a huge duration: only the ticks inside the fight are scheduled
        // (no hang), and none run after the end.
        { auraId: 'dotAura', on: 'target', atMs: 0, durationMs: 4e15 },
      ],
    });
    sim.cast('free');
    sim.advanceTo(9999);
    expect(sim.snapshot().selfAuras.pumped?.remainingMs).toBe(8001);
    sim.advanceTo(10000);
    sim.advanceTo(20000);
    expect(sim.snapshot().phase).toBe('ended');
    expect(ofType(sim, 'aura-fade')).toEqual([]);
    expect(ofType(sim, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000, 8000, 10000]);
    expect(sim.log().every((e) => e.atMs <= 10000)).toBe(true);
  });

  it('a finite atMs <= 0 applies at start; NaN and Infinity entries are ignored', () => {
    const entries: ScheduledAura[] = [
      { auraId: 'pumped', on: 'self', atMs: -500 },
      { auraId: 'weak', on: 'target', atMs: -0.5 },
      { auraId: 'hasteUp', on: 'self', atMs: Number.NaN },
      { auraId: 'hasteUp', on: 'self', atMs: Number.POSITIVE_INFINITY },
      { auraId: 'hasteUp', on: 'self', atMs: Number.NEGATIVE_INFINITY },
      { auraId: 'dmgUp', on: 'self', atMs: 0, durationMs: Number.NaN },
      { auraId: 'dmgUp', on: 'self', atMs: 0, durationMs: -1 },
      { auraId: 'dmgUp', on: 'self', atMs: 0, durationMs: 0 },
      { auraId: 'dmgUp', on: 'self', atMs: 0, durationMs: Number.POSITIVE_INFINITY },
      { auraId: 'stacky', on: 'target', atMs: 1000, durationMs: Number.NaN },
    ];
    const sim = newSim({ scheduledAuras: entries });
    expect(sim.cast('free')).toEqual({ ok: true });
    sim.advanceTo(60000);
    expect(ofType(sim, 'aura-apply')).toEqual([
      { atMs: 0, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 0, type: 'aura-apply', auraId: 'weak' },
    ]);
  });

  it('a non-integer atMs or durationMs is floored to whole ms', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'pumped', on: 'self', atMs: 1000.9, durationMs: 2000.7 }] });
    sim.cast('free');
    sim.advanceTo(20000);
    expect(auraLog(sim, 'pumped')).toEqual([
      { atMs: 1000, type: 'aura-apply', auraId: 'pumped' },
      { atMs: 3000, type: 'aura-fade', auraId: 'pumped' },
    ]);
  });

  it('a target aura scheduled for the whole fight multiplies later damage (damageTakenMult) from the first cast', () => {
    const sim = newSim({
      scheduledAuras: [
        { auraId: 'weak', on: 'target', atMs: 0, durationMs: 60000 },
        // Ruling S3: a debuff with a very long own duration, no override.
        { auraId: 'raidDebuff', on: 'target', atMs: 0 },
      ],
    });
    sim.cast('zap'); // 50 × 1.2 × 1.1 = 66
    sim.advanceTo(56000);
    sim.cast('zap');
    sim.advanceTo(60000);
    expect(damageOf(sim, 'zap')).toEqual([66, 66]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 60000, type: 'aura-fade', auraId: 'weak' }]);
  });

  it('an aura scheduled at the ms of a missile impact applies before it (scheduled at start, so first in that ms)', () => {
    // lob cast at 0 completes at 1000 and lands at 2400 (28 yd at 20 yd/s).
    const at = newSim({ distanceFromTarget: 28, scheduledAuras: [{ auraId: 'weak', on: 'target', atMs: 2400 }] });
    at.cast('lob');
    at.advanceTo(2400);
    expect(damageOf(at, 'lob')).toEqual([120]);
    expect(at.log().filter((e) => e.atMs === 2400).map((e) => e.type)).toEqual(['aura-apply', 'impact', 'damage']);

    // An aura ending at the impact ms is already gone for it (expired at its exact expiry ms).
    const until = newSim({
      distanceFromTarget: 28,
      scheduledAuras: [{ auraId: 'weak', on: 'target', atMs: 0, durationMs: 2400 }],
    });
    until.cast('lob');
    until.advanceTo(2400);
    expect(damageOf(until, 'lob')).toEqual([100]);
  });

  it('duplicates of the same scheduled aura refresh it per the normal applyAura rules', () => {
    const sim = newSim({
      scheduledAuras: [
        { auraId: 'stacky', on: 'target', atMs: 1000 },
        { auraId: 'stacky', on: 'target', atMs: 1000 },
        { auraId: 'stacky', on: 'target', atMs: 1000 },
        { auraId: 'stacky', on: 'target', atMs: 1000 },
        { auraId: 'pumped', on: 'self', atMs: 0 },
        { auraId: 'pumped', on: 'self', atMs: 5000 },
      ],
    });
    sim.cast('free');
    sim.advanceTo(1000);
    expect(sim.snapshot().targetAuras.stacky).toEqual({ auraId: 'stacky', stacks: 3, charges: 0, remainingMs: 10000 });
    sim.advanceTo(5000);
    expect(sim.snapshot().selfAuras.pumped?.remainingMs).toBe(10000);
    sim.advanceTo(60000);
    expect(auraLog(sim, 'stacky').map((e) => [e.atMs, e.type])).toEqual([
      [1000, 'aura-apply'],
      [1000, 'aura-apply'],
      [1000, 'aura-apply'],
      [1000, 'aura-apply'],
      [11000, 'aura-fade'],
    ]);
    expect(auraLog(sim, 'pumped').map((e) => [e.atMs, e.type])).toEqual([
      [0, 'aura-apply'],
      [5000, 'aura-apply'],
      [15000, 'aura-fade'],
    ]);
  });

  it('a re-application at the exact expiry ms of the previous one is a fresh application: the old one fades first', () => {
    const sim = newSim({
      scheduledAuras: [
        // The second entry's event is scheduled at start, before the first one's fade.
        { auraId: 'stacky', on: 'target', atMs: 1000, durationMs: 4000 },
        { auraId: 'stacky', on: 'target', atMs: 5000 },
      ],
    });
    sim.cast('free');
    sim.advanceTo(5000);
    expect(sim.snapshot().targetAuras.stacky).toEqual({ auraId: 'stacky', stacks: 1, charges: 0, remainingMs: 10000 });
    sim.advanceTo(60000);
    expect(auraLog(sim, 'stacky').map((e) => [e.atMs, e.type])).toEqual([
      [1000, 'aura-apply'],
      [5000, 'aura-fade'],
      [5000, 'aura-apply'],
      [15000, 'aura-fade'],
    ]);
  });

  it('a scheduled self aura with exclusiveGroup replaces the other aura of its group', () => {
    const sim = newSim({
      scheduledAuras: [
        { auraId: 'armorA', on: 'self', atMs: 0 },
        { auraId: 'armorB', on: 'self', atMs: 5000 },
      ],
    });
    sim.cast('scaled');
    sim.advanceTo(5000);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100, 200]);
    expect(Object.keys(sim.snapshot().selfAuras)).toEqual(['armorB']);
    expect(ofType(sim, 'aura-apply', 'aura-fade')).toEqual([
      { atMs: 0, type: 'aura-apply', auraId: 'armorA' },
      { atMs: 5000, type: 'aura-fade', auraId: 'armorA' },
      { atMs: 5000, type: 'aura-apply', auraId: 'armorB' },
    ]);
  });

  it('a haste aura scheduled at 0 applies to the first cast, which is started after it', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'hasteUp', on: 'self', atMs: 0 }] });
    // Not started: the snapshot does not show the scheduled aura yet.
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(2000);
    sim.cast('bolt');
    const s = sim.snapshot();
    // +10% haste: 2000 / 1.1 = 1818.18 → 1818, GCD 1500 / 1.1 → 1364.
    expect(s.cast).toEqual({ spellId: 'bolt', startMs: 0, endMs: 1818 });
    expect(s.gcdEndsAtMs).toBe(1364);
    expect(sim.log().map((e) => e.type)).toEqual(['aura-apply', 'cast-start']);
  });

  it('auras applied at start count toward the full mana bar the fight starts with; later ones add no mana', () => {
    const atStart = newSim({ infiniteMana: false, scheduledAuras: [{ auraId: 'brain', on: 'self', atMs: 0 }] });
    const plainMax = atStart.snapshot().maxMana;
    atStart.cast('free');
    const s = atStart.snapshot();
    expect(s.maxMana).toBe(plainMax + 1500);
    expect(s.mana).toBe(s.maxMana);

    const later = newSim({ infiniteMana: false, scheduledAuras: [{ auraId: 'brain', on: 'self', atMs: 1000 }] });
    later.cast('free');
    later.advanceTo(1000);
    expect(later.snapshot().maxMana).toBe(plainMax + 1500);
    expect(later.snapshot().mana).toBe(plainMax);
  });

  it('a scheduled target aura with charges is consumed by hits and fades when they run out', () => {
    const sim = newSim({ scheduledAuras: [{ auraId: 'procAura', on: 'target', atMs: 0 }] });
    expect(sim.cast('zap')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras.procAura?.charges).toBe(1);
    sim.advanceTo(1500);
    sim.cast('scorch'); // fire: no charge spent
    sim.advanceTo(3000);
    sim.cast('bolt');
    sim.advanceTo(5000);
    sim.cast('bolt');
    sim.advanceTo(7000);
    expect(damageOf(sim, 'zap')).toEqual([60]);
    expect(damageOf(sim, 'scorch')).toEqual([100]);
    expect(damageOf(sim, 'bolt')).toEqual([120, 100]);
    expect(auraLog(sim, 'procAura')).toEqual([
      { atMs: 0, type: 'aura-apply', auraId: 'procAura' },
      { atMs: 5000, type: 'aura-fade', auraId: 'procAura' },
    ]);
  });

  it('a scheduled DoT has no source: ticks without spellId and with dotDamageMult 1', () => {
    const sim = newSim({
      spec: spec({}, { modifiers: [{ schools: ['shadow'], dotDamageMult: 2 }] }),
      scheduledAuras: [{ auraId: 'dotAura', on: 'target', atMs: 1000 }],
    });
    sim.cast('free');
    sim.advanceTo(10000);
    expect(ofType(sim, 'tick')).toEqual([
      { atMs: 3000, type: 'tick', auraId: 'dotAura', amount: 100 },
      { atMs: 5000, type: 'tick', auraId: 'dotAura', amount: 100 },
      { atMs: 7000, type: 'tick', auraId: 'dotAura', amount: 100 },
    ]);
  });

  it('scheduled auras call no hooks', () => {
    const calls: string[] = [];
    const sim = newSim({
      spec: spec({}, { hooks: { onSpellResolved: (e) => void calls.push(e.spellId) } }),
      scheduledAuras: [
        { auraId: 'pumped', on: 'self', atMs: 0 },
        { auraId: 'weak', on: 'target', atMs: 3000 },
      ],
    });
    sim.cast('free');
    sim.advanceTo(20000);
    expect(calls).toEqual(['free']);
  });

  it('an unknown scheduled aura id throws at construction', () => {
    expect(() => newSim({ scheduledAuras: [{ auraId: 'nope', on: 'self', atMs: 0 }] })).toThrow(/unknown aura: nope/);
  });

  it('the scheduledAuras config is not mutated', () => {
    const entries = Object.freeze([
      Object.freeze({ auraId: 'pumped', on: 'self', atMs: 0 } as const),
      Object.freeze({ auraId: 'weak', on: 'target', atMs: 2500.5, durationMs: 1000.5 } as const),
    ]);
    const sim = new Simulation({ spec: spec(), target: TEST_TARGET, seed: 1, scheduledAuras: entries });
    sim.cast('free');
    sim.advanceTo(60000);
    expect(entries[1]).toEqual({ auraId: 'weak', on: 'target', atMs: 2500.5, durationMs: 1000.5 });
  });

  it('jump-vs-steps with scheduled auras and a haste aura', () => {
    const scheduledAuras: ScheduledAura[] = [
      { auraId: 'pumped', on: 'self', atMs: 0 },
      { auraId: 'heroism', on: 'self', atMs: 6123 },
      { auraId: 'weak', on: 'target', atMs: 3001, durationMs: 7777 },
      { auraId: 'dotAura', on: 'target', atMs: 12345 },
      { auraId: 'procAura', on: 'target', atMs: 20011 },
      { auraId: 'hasteUp', on: 'self', atMs: 30007, durationMs: 4321 },
      { auraId: 'armorA', on: 'self', atMs: 0 },
      { auraId: 'armorB', on: 'self', atMs: 41003 },
      { auraId: 'raidDebuff', on: 'target', atMs: -1 },
    ];
    // Bolts back to back (their hasted cast times give unaligned completion times), lobs in
    // flight, a zap now and then.
    const script: [number, string][] = [
      [0, 'bolt'],
      [2000, 'lob'],
      [3500, 'bolt'],
      [6200, 'bolt'],
      [8000, 'zap'],
      [9600, 'lob'],
      [12345, 'bolt'],
      [20011, 'lob'],
      [22222, 'bolt'],
      [30007, 'bolt'],
      [31500, 'bolt'],
      [41003, 'lob'],
      [45000, 'bolt'],
      [58000, 'lob'],
    ];
    const run = (stepMs: number | null) => {
      const sim = new Simulation({
        spec: spec(),
        target: { ...TEST_TARGET, missPct: 25 },
        seed: 7,
        distanceFromTarget: 28,
        spellQueueWindowMs: 400,
        scheduledAuras,
      });
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
    for (const step of [70, 13]) {
      const steps = run(step);
      expect(steps.snapshot()).toEqual(jump.snapshot());
      expect(steps.log()).toEqual(jump.log());
    }
    // The run exercised the scheduled auras and haste.
    const applied = ofType(jump, 'aura-apply').map((e) => e.auraId);
    expect(applied).toEqual(expect.arrayContaining(['pumped', 'heroism', 'weak', 'dotAura', 'procAura', 'hasteUp', 'armorB']));
    const starts = ofType(jump, 'cast-start').map((e) => e.atMs);
    const completes = ofType(jump, 'cast-complete').map((e) => e.atMs);
    expect(starts.length).toBeGreaterThan(5);
    expect(completes.some((ms) => ms % 10 !== 0)).toBe(true);
  });
});

describe('Simulation haste multiplier (AuraDef.selfStatMultipliers.haste)', () => {
  /** Shadow Bolt-like 2500 ms bolt and the author's gear haste: 45 rating. */
  function heroSim(): Simulation {
    const base = spec({ bolt: { castTimeMs: 2500 } });
    return newSim({
      spec: { ...base, setup: { ...base.setup, stats: { ...base.setup.stats, hasteRating: 45 } } },
      scheduledAuras: [{ auraId: 'heroism', on: 'self', atMs: 6000 }],
    });
  }

  it('Heroism-like aura: Shadow Bolt started during it takes round(2500/1.337)', () => {
    const sim = heroSim();
    sim.cast('bolt');
    // Before it: 2500 / (1 + 45 / 15.769 / 100) = 2430.6 → 2431.
    expect(sim.snapshot().cast?.endMs).toBe(2431);
    sim.advanceTo(6000);
    const factor = (1 + 45 / HASTE_RATING_PER_PCT / 100) * 1.3;
    expect(factor).toBeCloseTo(1.337, 3);
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(Math.round(2500 / factor));
    sim.cast('bolt');
    // From the author's log: Shadow Bolt 2500 ms → 1870 ms under Heroism.
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 6000, endMs: 6000 + 1870 });
    // GCD 1500 / 1.337 = 1121.8 → 1122.
    expect(sim.snapshot().gcdEndsAtMs).toBe(6000 + 1122);
  });

  it('after it fades the cast time returns', () => {
    const sim = heroSim();
    sim.cast('free');
    sim.advanceTo(45999);
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(1870);
    sim.advanceTo(46000);
    expect(sim.snapshot().selfAuras).toEqual({});
    expect(sim.snapshot().spells.bolt?.castTimeMs).toBe(2431);
    sim.cast('bolt');
    expect(sim.snapshot().cast?.endMs).toBe(46000 + 2431);
  });
});
