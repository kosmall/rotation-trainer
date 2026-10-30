// SpellModifier.dotExtraTicks (stage 2a Task 6, Voidheart Raiment 4pc): a matching spell's DoT
// gets that many more ticks. Each extra tick is a full tick (the per-tick amount over the base
// tick count is unchanged), the aura lasts `durationMs + extra x intervalMs`, the spell power
// snapshot at application stays, the fight end cuts ticks as before, a refresh replaces the aura
// and its pending ticks. wowsims tbc-new SpellMod_DotNumberOfTicks_Flat (sim/core/spell_mod.go)
// on Corruption / Immolate, whose ticks are a fixed base per tick + a per-tick coefficient.

import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, LogEvent, RawStats, SimConfig, SpecHooks, SpellModifier } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

/** The fixture spec (dot: dotAura 6000 ms, a 100 tick every 2000 ms) with patched auras/stats/modifiers/hooks. */
function spec(p: {
  modifiers?: SpellModifier[];
  auras?: Record<string, Partial<AuraDef>>;
  stats?: Partial<RawStats>;
  hooks?: SpecHooks;
} = {}): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    auras: base.auras.map((a) => ({ ...a, ...p.auras?.[a.id] })),
    setup: { ...base.setup, stats: { ...base.setup.stats, ...p.stats } },
    modifiers: p.modifiers ?? [],
    ...(p.hooks ? { hooks: p.hooks } : {}),
  });
}

const ONE_MORE: SpellModifier[] = [{ spellIds: ['dot'], dotExtraTicks: 1 }];

function newSim(s: SpecData, extra: Partial<SimConfig> = {}): Simulation {
  return new Simulation({ spec: s, target: TEST_TARGET, seed: 1, ...extra });
}

const ofType = (sim: Simulation, type: LogEvent['type']) => sim.log().filter((e) => e.type === type);
const ticks = (sim: Simulation) => ofType(sim, 'tick').map((e) => [e.atMs, e.amount]);
const fades = (sim: Simulation) => ofType(sim, 'aura-fade').map((e) => e.atMs);

describe('SpellModifier.dotExtraTicks', () => {
  it('one extra tick: dot ticks at 2000, 4000, 6000, 8000 for 100 each, lasts 8000 ms, fades at 8000; total 300 + 100', () => {
    const sim = newSim(spec({ modifiers: ONE_MORE }));
    expect(sim.cast('dot')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras).toEqual({
      dotAura: { auraId: 'dotAura', stacks: 1, charges: 0, remainingMs: 8000 },
    });
    sim.advanceTo(7000);
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(1000);
    sim.advanceTo(20000);
    expect(ticks(sim)).toEqual([
      [2000, 100],
      [4000, 100],
      [6000, 100],
      [8000, 100],
    ]);
    expect(fades(sim)).toEqual([8000]);
    expect(sim.snapshot().damageTotal).toBe(400);
    // Without the modifier: the stage 1 three ticks, fade at 6000.
    const plain = newSim(spec());
    plain.cast('dot');
    plain.advanceTo(20000);
    expect(ticks(plain)).toEqual([
      [2000, 100],
      [4000, 100],
      [6000, 100],
    ]);
    expect(fades(plain)).toEqual([6000]);
    expect(sim.snapshot().damageTotal - plain.snapshot().damageTotal).toBe(100);
  });

  it('each extra tick is a full tick: (total + coeffTotal x power snapshot at application) / base tick count, times dotDamageMult', () => {
    const s = spec({
      auras: { dotAura: { tick: { intervalMs: 2000, total: 300, coeffTotal: 1, school: 'shadow' } } },
      stats: { shadowPower: 90 },
      modifiers: [...ONE_MORE, { spellIds: ['dot'], dotDamageMult: 1.5 }],
    });
    const sim = newSim(s);
    sim.cast('dot');
    sim.advanceTo(20000);
    // (300 + 90) / 3 x 1.5 = 195, four times.
    expect(ticks(sim).map(([, amount]) => amount)).toEqual([195, 195, 195, 195]);
    expect(sim.snapshot().damageTotal).toBe(780);
  });

  it('the power snapshot is taken at application: a self buff that runs out mid-DoT keeps its power in every tick, the extra one included', () => {
    const s = spec({
      auras: {
        dotAura: { tick: { intervalMs: 2000, total: 300, coeffTotal: 3, school: 'shadow' } },
        pumped: { durationMs: 3000 },
      },
      modifiers: ONE_MORE,
    });
    const sim = newSim(s);
    sim.cast('pump'); // +100 spell power for 3000 ms
    sim.cast('dot');
    sim.advanceTo(20000);
    // (300 + 3 x 100) / 3 = 200 each, although pumped faded at 3000.
    expect(ticks(sim).map(([, amount]) => amount)).toEqual([200, 200, 200, 200]);
  });

  it('spell-id and school filters: only a matching spell gets the extra ticks; several modifiers add up', () => {
    const count = (modifiers: SpellModifier[], spellId = 'dot') => {
      const sim = newSim(spec({ modifiers }));
      sim.cast(spellId);
      sim.advanceTo(30000);
      return ofType(sim, 'tick').length;
    };
    expect(count([{ spellIds: ['bolt'], dotExtraTicks: 1 }])).toBe(3);
    expect(count([{ spellIds: ['slowdot'], dotExtraTicks: 1 }])).toBe(3);
    expect(count([{ schools: ['fire'], dotExtraTicks: 1 }])).toBe(3);
    expect(count([{ schools: ['shadow'], dotExtraTicks: 1 }])).toBe(4);
    expect(count([{ dotExtraTicks: 1 }])).toBe(4);
    expect(count([...ONE_MORE, { spellIds: ['dot'], dotExtraTicks: 2 }])).toBe(6);
    // The missile variant applies the same aura without the modifier's spell id: base ticks.
    expect(count(ONE_MORE, 'slowdot')).toBe(3);
  });

  it('a self aura carrying the modifier extends a DoT applied while it is active', () => {
    const s = spec({ auras: { pumped: { selfModifiers: ONE_MORE } }, modifiers: [] });
    const sim = newSim(s);
    sim.cast('pump');
    sim.cast('dot');
    sim.advanceTo(30000);
    expect(ofType(sim, 'tick').length).toBe(4);
  });

  it('a value that is not a positive number adds nothing; a fraction is floored', () => {
    const count = (dotExtraTicks: number) => {
      const sim = newSim(spec({ modifiers: [{ spellIds: ['dot'], dotExtraTicks }] }));
      sim.cast('dot');
      sim.advanceTo(30000);
      return [ofType(sim, 'tick').length, fades(sim)[0]];
    };
    expect(count(0)).toEqual([3, 6000]);
    expect(count(-1)).toEqual([3, 6000]);
    expect(count(Number.NaN)).toEqual([3, 6000]);
    expect(count(0.9)).toEqual([3, 6000]);
    expect(count(1.9)).toEqual([4, 8000]);
  });

  it('a scheduled DoT (no source spell) is not extended', () => {
    const sim = newSim(spec({ modifiers: [{ dotExtraTicks: 1 }] }), {
      scheduledAuras: [{ auraId: 'dotAura', on: 'target', atMs: 0 }],
    });
    sim.start();
    sim.advanceTo(30000);
    expect(ofType(sim, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000]);
  });

  it('a refresh replaces the aura: pending ticks cancelled, four new ticks from the recast, one fade', () => {
    const sim = newSim(spec({ modifiers: ONE_MORE }));
    sim.cast('dot');
    sim.advanceTo(7000);
    expect(ofType(sim, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000]);
    expect(sim.cast('dot')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras.dotAura?.remainingMs).toBe(8000);
    sim.advanceTo(30000);
    // No tick at 8000 (the old extra tick is cancelled), no double ticks.
    expect(ofType(sim, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000, 9000, 11000, 13000, 15000]);
    expect(fades(sim)).toEqual([15000]);
    expect(sim.snapshot().damageTotal).toBe(700);
  });

  it('the fight end cuts the extra tick: at 7999 ms it is lost; exactly at 8000 ms it counts', () => {
    const cut = newSim(spec({ modifiers: ONE_MORE }), { durationMs: 7999 });
    cut.cast('dot');
    cut.advanceTo(20000);
    expect(cut.snapshot().phase).toBe('ended');
    expect(ofType(cut, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000]);
    expect(fades(cut)).toEqual([]);
    expect(cut.snapshot().damageTotal).toBe(300);

    const exact = newSim(spec({ modifiers: ONE_MORE }), { durationMs: 8000 });
    exact.cast('dot');
    exact.advanceTo(20000);
    expect(ofType(exact, 'tick').map((e) => e.atMs)).toEqual([2000, 4000, 6000, 8000]);
    expect(exact.snapshot().damageTotal).toBe(400);
  });

  it('DoT ticks never call hooks, the extra tick included', () => {
    const resolved: string[] = [];
    const hooks: SpecHooks = { onSpellResolved: (e) => void resolved.push(e.spellId) };
    const sim = newSim(spec({ modifiers: ONE_MORE, hooks }));
    sim.cast('dot');
    sim.advanceTo(20000);
    expect(ofType(sim, 'tick').length).toBe(4);
    expect(resolved).toEqual(['dot']);
  });

  it('determinism: advanceTo in one jump equals 100 ms steps, and the same seed gives the same log', () => {
    const play = (stepMs: number | null) => {
      const sim = newSim(spec({ modifiers: ONE_MORE }), { durationMs: 30000 });
      const script = new Map([
        [0, 'dot'],
        [1500, 'bolt'],
        [7000, 'dot'],
        [9000, 'bolt'],
        [21000, 'dot'],
      ]);
      for (const [atMs, spellId] of script) {
        if (stepMs === null) sim.advanceTo(atMs);
        else for (let t = sim.snapshot().nowMs; t < atMs; ) sim.advanceTo((t = Math.min(atMs, t + stepMs)));
        sim.cast(spellId);
      }
      if (stepMs === null) sim.advanceTo(30000);
      else for (let t = sim.snapshot().nowMs; t < 30000; ) sim.advanceTo((t = Math.min(30000, t + stepMs)));
      return sim;
    };
    const jump = play(null);
    const steps = play(100);
    expect(steps.log()).toEqual(jump.log());
    expect(steps.snapshot()).toEqual(jump.snapshot());
    expect(play(null).log()).toEqual(jump.log());
    expect(jump.snapshot().phase).toBe('ended');
    // The last dot (cast at 21000) ticks at 23000..29000: four ticks, all inside the fight.
    expect(ofType(jump, 'tick').filter((e) => e.atMs > 21000).map((e) => e.atMs)).toEqual([23000, 25000, 27000, 29000]);
  });
});
