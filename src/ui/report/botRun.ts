// The bot's replay of an ended fight (UI redesign Task 4, spec §3.5): the same setup (the fight's
// own applied spec and fight settings, so nothing is rebuilt and no item database is needed) and
// the same seed, played once by the existing bot (`runBot`) on a Simulation built exactly as the
// game builds it (`createFightSimulation`, the game's spell queue window). Runs on the main thread
// (a 60 s fight takes a few ms); memoized per ended fight. A fight the bot cannot replay (its
// priority cannot start, a data error) gives null: the "% of the bot" line is then left out,
// never guessed.

import { runBot } from '../../bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../data/common/ratings';
import type { LogEvent, SimSnapshot } from '../../engine/types';
import { createFightSimulation } from '../../sim-runner/fight';
import type { FightSettings } from '../../sim-runner/fight';

export interface BotRun {
  dps: number;
  damageTotal: number;
  log: readonly LogEvent[];
  /** The final snapshot (its cast and use counts). */
  snapshot: SimSnapshot;
}

/** What a replay needs: the fight's setup and seed (`TrainerMeta.lastFight`). */
export interface ReplayableFight {
  fight: FightSettings;
  seed: number;
}

const cache = new WeakMap<ReplayableFight, BotRun | null>();

/** Plays the ended fight's setup with its seed once with the bot (memoized per fight object). */
export function botRun(last: ReplayableFight): BotRun | null {
  if (cache.has(last)) return cache.get(last)!;
  let out: BotRun | null;
  try {
    const sim = createFightSimulation(last.fight, last.seed, SPELL_QUEUE_WINDOW_MS);
    const { dps, damageTotal } = runBot(sim, last.fight.spec.priority);
    out = { dps, damageTotal, log: sim.log(), snapshot: sim.snapshot() };
  } catch {
    out = null;
  }
  cache.set(last, out);
  return out;
}
