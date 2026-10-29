import { describe, expect, it } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { warlockSpells } from '../../src/data/classes/warlock/spells';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import { Simulation } from '../../src/engine/sim';
import { projectileTravelMs } from '../../src/engine/travel';
import type { TargetData } from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };

const speedOf = (id: string) => warlockSpells.find((s) => s.id === id)?.missileSpeed;

describe('warlock missile speeds (wowsims tbc-new spell_data_auto_gen.go MissileSpeed)', () => {
  it('shadow-bolt missileSpeed is 20', () => {
    expect(speedOf('shadow-bolt')).toBe(20);
  });

  it('every warlock spell with a missileSpeed cites its source or UNVERIFIED', () => {
    // Only Shadow Bolt (27209: 20) and Incinerate (32231: 24) have a MissileSpeed in the spell
    // data rows of the ranks used; Immolate, Corruption, the curses, Conflagrate, Shadowburn and
    // Life Tap have none (they land at cast end). The source comments are in spells.ts.
    const withMissile = Object.fromEntries(
      warlockSpells.filter((s) => s.missileSpeed !== undefined).map((s) => [s.id, s.missileSpeed]),
    );
    expect(withMissile).toEqual({ 'shadow-bolt': 20, incinerate: 24 });
    for (const speed of Object.values(withMissile)) expect(speed).toBeGreaterThan(0);
    for (const s of warlockSpells) {
      if (s.castTimeMs === 0) expect(s.missileSpeed, `${s.id} is instant`).toBeUndefined();
    }
  });

  it('the default distance is 28 yd: Shadow Bolt flies 1400 ms (author log: 1.39 s)', () => {
    expect(DEFAULT_DISTANCE_FROM_TARGET_YD).toBe(28);
    expect(projectileTravelMs(speedOf('shadow-bolt'), DEFAULT_DISTANCE_FROM_TARGET_YD)).toBe(1400);
    expect(projectileTravelMs(speedOf('incinerate'), DEFAULT_DISTANCE_FROM_TARGET_YD)).toBe(1167);
  });

  it('with 28 yd Shadow Bolt lands 1400 ms after the cast ends', () => {
    const sim = new Simulation({
      spec: destructionWarlock,
      target: NEVER_MISS,
      seed: 1,
      spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
      distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD,
    });
    expect(sim.cast('shadow-bolt')).toEqual({ ok: true });
    const castEnd = sim.snapshot().cast?.endMs ?? -1;
    expect(castEnd).toBe(2431); // 2500 ms after Bane, hasted by the gear's 45 rating
    sim.advanceTo(castEnd);
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'shadow-bolt', landsAtMs: castEnd + 1400 }]);
    expect(sim.snapshot().damageTotal).toBe(0);
    sim.advanceTo(castEnd + 1399);
    expect(sim.snapshot().damageTotal).toBe(0);
    sim.advanceTo(castEnd + 1400);
    expect(sim.snapshot().damageTotal).toBeGreaterThan(0);
    expect(sim.snapshot().inFlight).toEqual([]);
    const types = ['cast-start', 'cast-complete', 'impact', 'damage', 'miss'];
    const bolt = sim.log().filter((e) => e.spellId === 'shadow-bolt' && types.includes(e.type));
    expect(bolt.map((e) => [e.atMs, e.type])).toEqual([
      [0, 'cast-start'],
      [2431, 'cast-complete'],
      [3831, 'impact'],
      [3831, 'damage'],
    ]);
  });

  it('instant and DoT spells still resolve at cast end at 28 yd (no missile)', () => {
    const sim = new Simulation({
      spec: destructionWarlock,
      target: NEVER_MISS,
      seed: 1,
      infiniteMana: true,
      distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD,
    });
    sim.cast('immolate');
    sim.advanceTo(1458);
    expect(sim.snapshot().targetAuras.immolate).toBeDefined();
    expect(sim.snapshot().inFlight).toEqual([]);
    expect(sim.log().filter((e) => e.type === 'impact')).toEqual([]);
  });
});
