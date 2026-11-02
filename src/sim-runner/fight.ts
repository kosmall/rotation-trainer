// The one place a fight's Simulation is built from an applied setup: the game (useSimulation) and
// the simulator (run.ts) both call it, so a simulator run with seed s is the game's fight with
// seed s. Framework-free.

import { BOSS_TARGET } from '../data/common/target';
import type { SpecData } from '../data/types';
import { Simulation } from '../engine/sim';
import type { ScheduledAura } from '../engine/types';

/** What a fight is built from: `applySetup`'s spec and fight settings. */
export interface FightSettings {
  spec: SpecData;
  sim: { scheduledAuras: readonly ScheduledAura[]; distanceFromTarget: number; durationMs: number };
}

/**
 * The fight as the bot tests build it: boss target, real mana, the given seed and spell queue
 * window, the setup's scheduled auras, distance and fight length.
 */
export function createFightSimulation(fight: FightSettings, seed: number, spellQueueWindowMs: number): Simulation {
  return new Simulation({
    spec: fight.spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    distanceFromTarget: fight.sim.distanceFromTarget,
    scheduledAuras: fight.sim.scheduledAuras,
    durationMs: fight.sim.durationMs,
  });
}
