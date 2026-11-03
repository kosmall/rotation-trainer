// Read-only snapshot counters for rotation scripts (rotation scripts Task 1):
// `castCounts` (completed non-item casts per spell id) and `useCounts` (item actions used per id).
// Counted at `cast-complete`; cancelled and cut-off casts never count; a queued spell counts when
// it completes; an item action counts at its use. They change nothing else: logs and RNG draws
// stay byte-identical (tests/bot/bot-equivalence.test.ts pins 23 scenarios unchanged).

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import { Simulation } from '../../src/engine/sim';
import type { LogEvent, SimSnapshot } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { TEST_TARGET, makeItemTestSpec } from '../fixtures/testSpec';

function newSim(durationMs = 60000, windowMs = 400): Simulation {
  return new Simulation({ spec: makeItemTestSpec(), target: TEST_TARGET, seed: 1, spellQueueWindowMs: windowMs, durationMs });
}

/** The counters a log implies: cast-complete entries split by whether the spell is an item action. */
function countsFromLog(log: readonly LogEvent[], itemIds: ReadonlySet<string>) {
  const casts: Record<string, number> = {};
  const uses: Record<string, number> = {};
  for (const e of log) {
    if (e.type !== 'cast-complete' || e.spellId === undefined) continue;
    const into = itemIds.has(e.spellId) ? uses : casts;
    into[e.spellId] = (into[e.spellId] ?? 0) + 1;
  }
  return { casts, uses };
}

describe('snapshot counters castCounts / useCounts', () => {
  it('start empty', () => {
    const s = newSim().snapshot();
    expect(s.castCounts).toEqual({});
    expect(s.useCounts).toEqual({});
  });

  it('count a cast at completion, not at its start', () => {
    const sim = newSim();
    expect(sim.cast('bolt')).toEqual({ ok: true });
    expect(sim.snapshot().castCounts).toEqual({});
    sim.advanceTo(1999);
    expect(sim.snapshot().castCounts).toEqual({});
    sim.advanceTo(2000);
    expect(sim.snapshot().castCounts).toEqual({ bolt: 1 });
    sim.cast('zap');
    expect(sim.snapshot().castCounts).toEqual({ bolt: 1, zap: 1 });
    expect(sim.snapshot().useCounts).toEqual({});
  });

  it('exclude a cancelled cast', () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(1000);
    sim.cancelCast();
    sim.advanceTo(5000);
    expect(sim.snapshot().castCounts).toEqual({});
    expect(sim.log().some((e) => e.type === 'cast-cancel')).toBe(true);
  });

  it('exclude a cast cut off by the end of the fight', () => {
    const sim = newSim(1000);
    sim.cast('bolt');
    sim.advanceTo(5000);
    expect(sim.snapshot().phase).toBe('ended');
    expect(sim.snapshot().castCounts).toEqual({});
  });

  it('count a queued spell when it completes (not when it is queued)', () => {
    const sim = newSim();
    sim.cast('bolt');
    sim.advanceTo(1800);
    expect(sim.cast('bolt')).toEqual({ ok: true, queued: true });
    expect(sim.snapshot().castCounts).toEqual({});
    sim.advanceTo(2000);
    expect(sim.snapshot().castCounts).toEqual({ bolt: 1 });
    sim.advanceTo(4000);
    expect(sim.snapshot().castCounts).toEqual({ bolt: 2 });
  });

  it('count an item action in useCounts at its use, never in castCounts', () => {
    const sim = newSim();
    sim.cast('trinketA');
    let s = sim.snapshot();
    expect(s.useCounts).toEqual({ trinketA: 1 });
    expect(s.castCounts).toEqual({});
    sim.advanceTo(100);
    expect(sim.cast('trinketB')).toEqual({ ok: false, reason: 'cooldown' });
    sim.cast('manaPot');
    s = sim.snapshot();
    expect(s.useCounts).toEqual({ trinketA: 1, manaPot: 1 });
  });

  it('are read-only: changing a snapshot never changes the next one', () => {
    const sim = newSim();
    sim.cast('zap');
    const s = sim.snapshot();
    try {
      (s.castCounts as Record<string, number>).zap = 99;
    } catch {
      // frozen: assignment throws in strict mode
    }
    try {
      (s.useCounts as Record<string, number>).x = 1;
    } catch {
      // frozen
    }
    expect(sim.snapshot().castCounts).toEqual({ zap: 1 });
    expect(sim.snapshot().useCounts).toEqual({});
  });

  it('match the cast-complete entries of the log at every snapshot of a full Warlock fight with items', () => {
    const db = itemDbSync();
    const config: SetupConfig = {
      ...structuredClone(DEFAULT_SETUP),
      enabledBuffs: [...DEFAULT_SETUP.enabledBuffs, 'heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune'],
      fightDurationSec: 180,
    };
    const applied = applySetup({
      buildSpec: (w, g) => (g === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, g, db)),
      catalog: SETUP_CATALOG,
      config,
      db,
    });
    const itemIds = new Set(applied.spec.spells.filter((s) => s.item).map((s) => s.id));
    expect(itemIds.size).toBeGreaterThanOrEqual(3);
    const sim = new Simulation({
      spec: applied.spec,
      target: BOSS_TARGET,
      seed: 3,
      spellQueueWindowMs: 400,
      distanceFromTarget: applied.sim.distanceFromTarget,
      scheduledAuras: applied.sim.scheduledAuras,
      durationMs: applied.sim.durationMs,
    });
    const real = sim.snapshot.bind(sim);
    let checks = 0;
    sim.snapshot = (): SimSnapshot => {
      const s = real();
      const { casts, uses } = countsFromLog(sim.log(), itemIds);
      expect(s.castCounts).toEqual(casts);
      expect(s.useCounts).toEqual(uses);
      checks++;
      return s;
    };
    runBot(sim, applied.spec.priority);
    expect(checks).toBeGreaterThan(100);
    const end = real();
    const { casts, uses } = countsFromLog(sim.log(), itemIds);
    expect(end.castCounts).toEqual(casts);
    expect(end.useCounts).toEqual(uses);
    expect(Object.keys(end.useCounts).length).toBeGreaterThanOrEqual(2);
    expect(end.castCounts['shadow-bolt']).toBeGreaterThan(20);
  }, 60000);
});
