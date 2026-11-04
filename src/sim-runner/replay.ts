// Deterministic replay of one simulator fight (fight timeline and key fights Task K1; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 B; docs/data-sources.md
// Part K): the simulator keeps no logs, but a fight depends only on the request and its run
// number, so the log of any run (the key fights in `SimResult.keyFights`) is rebuilt on demand by
// playing it again through the simulator's own path (`prepareRun` + `playFight`, run.ts).
// Framework-free; the only randomness is the Simulation's seeded Rng. One fight takes a few ms:
// the UI calls this on the main thread.

import type { LogEvent } from '../engine/types';
import { mixSeed, playFight, prepareRun } from './run';
import type { SimRequest } from './types';

/** A replayed fight: its full log, DPS (bit-equal to the simulator's), seed and length. */
export interface ReplayedFight {
  log: readonly LogEvent[];
  dps: number;
  /** `mixSeed(request seed, run)`. */
  seed: number;
  durationMs: number;
}

/**
 * Plays run `run` of `request` again, exactly as `simulate(request)` played it: the same
 * validation and setup (`prepareRun`: an invalid request throws its TypeError / Error), the
 * seed `mixSeed(seed, run)`, and the same fight builder and bot call (`playFight`). Its `dps` is
 * the run's `RunSample.dps` (and the `KeyFight.dps`) bit for bit, and its log the log of
 * `createFightSimulation` + `runBot` with that seed. Pass the request the simulation was run
 * with (not the current setup). `run` must be an integer in [0, runs) of the request (runs after
 * clamping): else a RangeError.
 */
export function replayFight(request: SimRequest, run: number): ReplayedFight {
  const factory = prepareRun(request);
  if (!Number.isInteger(run) || run < 0 || run >= factory.runs) {
    throw new RangeError(`replayFight: run must be an integer from 0 to ${factory.runs - 1}, got ${String(run)}`);
  }
  const seed = mixSeed(factory.seed, run);
  const { sim, dps } = playFight(factory, seed);
  return { log: sim.log(), dps, seed, durationMs: factory.fight.sim.durationMs };
}
