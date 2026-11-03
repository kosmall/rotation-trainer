// Fights for the rotation script tests (Task 2): a config applied the way the game and the
// simulator apply it (talents forwarded, the item database for gear), bot runs that record the
// full log hash, length, RNG draws and DPS, and a full-stepping reference bot that knows wait steps.

import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, type WarlockOptions } from '../../src/data/classes/warlock/destruction';
import { BOSS_TARGET } from '../../src/data/common/target';
import type { ItemDb } from '../../src/data/items/types';
import type { PriorityStep } from '../../src/data/types';
import type { Rng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { normalizeSetup, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import type { AppliedSetup, SetupConfig } from '../../src/setup/types';
import { hash } from './item-use-reference';

/** `applySetup` as src/sim-runner/run.ts calls it (the config normalized first, talents forwarded). */
export function applyConfig(config: SetupConfig, db: ItemDb): AppliedSetup {
  const normalized = normalizeSetup(config, SETUP_CATALOG, db);
  const buildSpec = (w: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string) =>
    gear === undefined ? buildDestructionWarlock(w, gear, undefined, talents) : buildDestructionWarlock(w, gear, db, talents);
  return applySetup({ buildSpec, catalog: STATIC_SETUP_CATALOG, config: normalized, db });
}

export function newFight(applied: Pick<AppliedSetup, 'spec' | 'sim'>, seed: number, spellQueueWindowMs: number) {
  const sim = new Simulation({
    spec: applied.spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    distanceFromTarget: applied.sim.distanceFromTarget,
    scheduledAuras: applied.sim.scheduledAuras,
    durationMs: applied.sim.durationMs,
  });
  const rng = (sim as unknown as { rng: Rng }).rng;
  const next = rng.next.bind(rng);
  const counter = { draws: 0 };
  rng.next = () => {
    counter.draws++;
    return next();
  };
  return { sim, counter };
}

export interface FightRecord {
  /** [hash(JSON log), log length, RNG draws, dps] */
  run: [number, number, number, number];
}

/** Per window, the bot's fights over `seeds`: [log hash, log length, RNG draws, dps] each, and the mean DPS. */
export function botRuns(
  applied: Pick<AppliedSetup, 'spec' | 'sim'>,
  seeds: readonly number[],
  windows: readonly number[] = [400, 0],
): Record<number, { mean: number; runs: [number, number, number, number][] }> {
  const out: Record<number, { mean: number; runs: [number, number, number, number][] }> = {};
  for (const w of windows) {
    const runs: [number, number, number, number][] = [];
    let total = 0;
    for (const seed of seeds) {
      const { sim, counter } = newFight(applied, seed, w);
      const { dps } = runBot(sim, applied.spec.priority);
      total += dps;
      const log = sim.log();
      runs.push([hash(JSON.stringify(log)), log.length, counter.draws, dps]);
    }
    out[w] = { mean: total / seeds.length, runs };
  }
  return out;
}

/**
 * The reference bot: a snapshot and a walk of the priority at EVERY step of `stepMs` (the bot
 * before the performance wave, tests/fixtures/bot-perf-scenarios.ts `steppingRunBot`), plus the
 * wait rule of the current bot (a wait step whose `when` holds ends the walk without a press,
 * except in the ready phase).
 */
export function fullSteppingBot(
  sim: Simulation,
  priority: readonly PriorityStep[],
  stepMs = 10,
): { dps: number; damageTotal: number } {
  for (let s = sim.snapshot(); s.phase !== 'ended'; s = sim.snapshot()) {
    for (const step of priority) {
      if (step.when && !step.when(s)) continue;
      if (step.kind === 'wait') {
        if (s.phase === 'ready') continue;
        break;
      }
      if (step.spellId === s.queuedSpellId) break;
      if (sim.cast(step.spellId).ok) break;
    }
    if (sim.snapshot().phase === 'ready') {
      throw new Error('runBot: no priority step can start the fight (every cast was rejected in ready)');
    }
    sim.advanceTo(s.nowMs + stepMs);
  }
  const { dps, damageTotal } = sim.snapshot();
  return { dps, damageTotal };
}
