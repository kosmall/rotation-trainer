import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, LogEvent } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

// AuraDef.exclusiveGroup (ruling R22): applying an aura of a group removes every other live aura
// of that group on the same unit through the single removal routine (pending ticks and fade
// cancelled, `aura-fade` logged once, at that ms).

/** infiniteMana, so mana never blocks a cast and no regen entries appear in the log. */
function newSim(spec: SpecData): Simulation {
  return new Simulation({ spec, target: TEST_TARGET, seed: 1, infiniteMana: true });
}

/** The fixture with the given aura ids put in exclusive groups. */
function grouped(groups: Record<string, string>): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    auras: base.auras.map((a): AuraDef => (groups[a.id] ? { ...a, exclusiveGroup: groups[a.id] } : a)),
  });
}

function ofType(sim: Simulation, type: LogEvent['type'], auraId?: string): LogEvent[] {
  return sim.log().filter((e) => e.type === type && (auraId === undefined || e.auraId === auraId));
}

describe('Simulation exclusive aura groups', () => {
  it('applying B of a group fades A at that ms (logged once), cancels its ticks; B stays', () => {
    const sim = newSim(grouped({ dotAura: 'g', weak: 'g' }));
    expect(sim.cast('dot')).toEqual({ ok: true }); // dotAura: ticks at 2000, 4000, 6000
    sim.advanceTo(1500);
    expect(sim.cast('curse')).toEqual({ ok: true }); // weak, same group
    expect(sim.log().filter((e) => e.atMs === 1500)).toEqual([
      { atMs: 1500, type: 'cast-complete', spellId: 'curse' },
      { atMs: 1500, type: 'aura-fade', auraId: 'dotAura' },
      { atMs: 1500, type: 'aura-apply', spellId: 'curse', auraId: 'weak' },
    ]);
    expect(Object.keys(sim.snapshot().targetAuras)).toEqual(['weak']);
    sim.advanceTo(20000);
    expect(ofType(sim, 'tick')).toEqual([]);
    expect(ofType(sim, 'aura-fade', 'dotAura')).toEqual([{ atMs: 1500, type: 'aura-fade', auraId: 'dotAura' }]);
    // weak runs its full 10 s from 1500.
    expect(ofType(sim, 'aura-fade', 'weak')).toEqual([{ atMs: 11500, type: 'aura-fade', auraId: 'weak' }]);
  });

  it('and the other way round: dot replaces weak, whose damage-taken multiplier is gone', () => {
    const sim = newSim(grouped({ dotAura: 'g', weak: 'g' }));
    sim.cast('curse');
    sim.advanceTo(1500);
    sim.cast('dot');
    expect(Object.keys(sim.snapshot().targetAuras)).toEqual(['dotAura']);
    sim.advanceTo(10000);
    // Ticks of 100 each, no longer x1.2.
    expect(ofType(sim, 'tick').map((e) => e.amount)).toEqual([100, 100, 100]);
  });

  it('re-applying the same aura is a refresh: it does not remove itself', () => {
    const sim = newSim(grouped({ dotAura: 'g', weak: 'g' }));
    sim.cast('dot');
    sim.advanceTo(3000);
    sim.cast('dot');
    expect(Object.keys(sim.snapshot().targetAuras)).toEqual(['dotAura']);
    sim.advanceTo(20000);
    expect(ofType(sim, 'tick').map((e) => e.atMs)).toEqual([2000, 5000, 7000, 9000]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 9000, type: 'aura-fade', auraId: 'dotAura' }]);
  });

  it('auras in different groups, or in no group, do not interact', () => {
    for (const spec of [grouped({ dotAura: 'a', weak: 'b' }), grouped({ dotAura: 'a' }), makeTestSpec()]) {
      const sim = newSim(spec);
      sim.cast('dot');
      sim.advanceTo(1500);
      sim.cast('curse');
      expect(Object.keys(sim.snapshot().targetAuras).sort()).toEqual(['dotAura', 'weak']);
      expect(ofType(sim, 'aura-fade')).toEqual([]);
    }
  });

  it('a self aura and a target aura of the same group do not interact', () => {
    const sim = newSim(grouped({ weak: 'g', pumped: 'g' }));
    sim.cast('curse');
    sim.advanceTo(1500);
    sim.cast('pump');
    expect(Object.keys(sim.snapshot().targetAuras)).toEqual(['weak']);
    expect(Object.keys(sim.snapshot().selfAuras)).toEqual(['pumped']);
    sim.cast('curse');
    expect(Object.keys(sim.snapshot().selfAuras)).toEqual(['pumped']);
    expect(ofType(sim, 'aura-fade')).toEqual([]);
  });

  it('on the player: applying dmgUp removes pumped of its group, and pumped stops adding spell power', () => {
    const sim = newSim(grouped({ pumped: 'g', dmgUp: 'g' }));
    sim.cast('pump');
    sim.cast('scaled'); // 100 spell power while pumped
    sim.cast('dmgUp');
    sim.cast('scaled'); // 0 spell power: pumped is gone
    expect(sim.log().filter((e) => e.type === 'damage').map((e) => e.amount)).toEqual([100, 0]);
    expect(Object.keys(sim.snapshot().selfAuras)).toEqual(['dmgUp']);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 0, type: 'aura-fade', auraId: 'pumped' }]);
  });

  it('jumping to the end and stepping 70 ms give the same snapshot and log', () => {
    const script: [number, string][] = [
      [0, 'dot'],
      [1500, 'curse'],
      [3001, 'dot'],
      [7777, 'dot'],
      [12345, 'curse'],
    ];
    const run = (stepMs: number | null) => {
      const sim = newSim(grouped({ dotAura: 'g', weak: 'g' }));
      let t = 0;
      for (const [atMs, spellId] of script) {
        if (stepMs !== null) for (; t + stepMs < atMs; t += stepMs) sim.advanceTo(t + stepMs);
        sim.advanceTo(atMs);
        t = atMs;
        expect(sim.cast(spellId).ok).toBe(true);
      }
      if (stepMs !== null) for (; t < 60000; t += stepMs) sim.advanceTo(t + stepMs);
      sim.advanceTo(60000);
      return sim;
    };
    const jump = run(null);
    const steps = run(70);
    expect(steps.snapshot()).toEqual(jump.snapshot());
    expect(steps.log()).toEqual(jump.log());
    expect(ofType(jump, 'aura-fade').map((e) => [e.atMs, e.auraId])).toEqual([
      [1500, 'dotAura'],
      [3001, 'weak'],
      [12345, 'dotAura'],
      [22345, 'weak'],
    ]);
  });
});
