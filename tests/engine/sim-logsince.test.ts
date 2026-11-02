// Simulation.logSince (scrolling combat text Task 1): a read-only view of the newest log entries
// for the combat text HUD. It must change nothing: the same fight read with logSince every step
// gives a byte-identical log and the same result as one never read.

import { describe, expect, it } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { runBot } from '../../src/bot/bot';
import { Simulation } from '../../src/engine/sim';
import type { LogEvent } from '../../src/engine/types';

function fight(seed: number, readEveryStep: boolean) {
  const sim = new Simulation({ spec: destructionWarlock, target: BOSS_TARGET, seed, spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS, distanceFromTarget: 28 });
  const collected: LogEvent[] = [];
  if (readEveryStep) {
    // The bot's every step is followed by a read of the new entries, as the HUD does per frame.
    const advance = sim.advanceTo.bind(sim);
    sim.advanceTo = (t: number) => {
      advance(t);
      collected.push(...sim.logSince(collected.length));
    };
  }
  const result = runBot(sim, destructionWarlock.priority);
  return { sim, collected, result };
}

describe('Simulation.logSince', () => {
  it('reading the log every step changes nothing: byte-identical logs and results; the entries read equal log()', () => {
    for (const seed of [1, 2, 3]) {
      const plain = fight(seed, false);
      const read = fight(seed, true);
      expect(JSON.stringify(read.sim.log())).toBe(JSON.stringify(plain.sim.log()));
      expect(read.sim.snapshot()).toEqual(plain.sim.snapshot());
      expect(read.result).toEqual(plain.result);
      expect(read.collected).toEqual(plain.sim.log());
    }
  });

  it('equals log().slice(index); the index is floored and clamped; entries are copies', () => {
    const { sim } = fight(4, false);
    const log = sim.log();
    expect(log.length).toBeGreaterThan(100);
    for (const i of [0, 1, 50, log.length - 1, log.length]) expect(sim.logSince(i)).toEqual(log.slice(i));
    expect(sim.logSince(-5)).toEqual(log);
    expect(sim.logSince(NaN)).toEqual(log);
    expect(sim.logSince(10.9)).toEqual(log.slice(10));
    expect(sim.logSince(log.length + 3)).toEqual([]);
    expect(sim.logSince(Infinity)).toEqual([]);
    const [first] = sim.logSince(0) as LogEvent[];
    first!.amount = -1;
    (first as { type: string }).type = 'tampered';
    expect(sim.log()).toEqual(log);
  });
});
