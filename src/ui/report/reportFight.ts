// Where a Report fight comes from (fight timeline and key fights Tasks K2/K3, spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A, B, E): the last
// played fight, a simulation's key fight replayed on demand, a history entry; each is its log, its
// setup snapshot (the normalized config at the fight's start, applied: `NextFight`), its seed and
// length. Split from reportModel.ts so the trainer (main chunk) loads only this, and the view-models
// (reportModel.ts, reportViewModel.ts, secondsModel.ts) stay in the Report's lazy chunk. Pure.

import { BASE_GCD_MS } from '../../data/common/ratings';
import type { ItemDb } from '../../data/items/types';
import type { LogEvent, SimSnapshot } from '../../engine/types';
import { setupCatalogFor } from '../../setup/defaults';
import { setupGear } from '../../setup/gear';
import type { SetupConfig } from '../../setup/types';
import { mixSeed, playFight, prepareRun } from '../../sim-runner/run';
import type { KeyFights, SimResult } from '../../sim-runner/types';
import { fightSettingsName, gearName, rotationName, setupPresetName, talentsName } from '../state/selectors';
import type { ChipLabels, LastFight, NextFight } from '../state/TrainerProvider';
/** Where a fight comes from: played by the player, or one of a simulation's key fights. */
export type FightKind = 'played' | 'sim-highest' | 'sim-typical' | 'sim-lowest';

/** Which key fight of a simulation (`SimResult.keyFights`). */
export type KeyFightWhich = keyof KeyFights;

export const SIM_KIND: Readonly<Record<KeyFightWhich, FightKind>> = { highest: 'sim-highest', typical: 'sim-typical', lowest: 'sim-lowest' };

/** The end-of-fight numbers the Report reads (a played fight's final snapshot has them all). */
export type FightFinal = Pick<SimSnapshot, 'nowMs' | 'durationMs' | 'gcdMs' | 'dps' | 'damageTotal' | 'castCounts' | 'useCounts'>;

/** A simulation's key fight against its simulation. */
export interface SimContext {
  /** The run number (`replayFight(request, run)`). */
  run: number;
  runs: number;
  /** The simulation's base seed (the fight's own is `ReportFight.seed`). */
  baseSeed: number;
  spellQueueWindowMs: number;
  meanDps: number;
  stdDev: number;
  /** (DPS - mean) / standard deviation; null when the deviation is 0. */
  sigma: number | null;
}

/** One fight the Report can show, from any source. Read-only. */
export interface ReportFight {
  /** Unique per fight object (the played fight keeps its fight id; others count down from -1). */
  id: number;
  /** The source's identity ("played:3", "sim:2:highest", "history:h12"). */
  key: string;
  kind: FightKind;
  log: readonly LogEvent[];
  snapshot: FightFinal;
  /** The setup snapshot: the normalized config at the fight's (or the simulation's) start. */
  config: SetupConfig;
  /** The fight's own names (Setup, Gear, Talents, Rotation, Fight). */
  labels: ChipLabels;
  seed: number;
  /** The snapshot applied (spec, fight settings, catalog): names, and the bot's replay. */
  fight: NextFight;
  /**
   * The bot replays the fight with the same setup and seed for "% of the bot" (a played fight); a
   * simulation's fight IS the bot's, so it shows its deviation from the simulation's mean instead.
   */
  compareBot: boolean;
  sim: SimContext | null;
}

let nextSyntheticId = -1;

/** The fight's names from its config and catalog (the header chips' names). */
export function chipLabelsOf(config: SetupConfig, catalog: NextFight['catalog']): ChipLabels {
  return {
    setupPreset: setupPresetName(config, catalog),
    gear: gearName(config),
    talents: talentsName(config),
    rotation: rotationName(config),
    fight: fightSettingsName(config),
  };
}

const lastCache = new WeakMap<LastFight, ReportFight>();

/** The last played fight as a report fight (one object per LastFight: the bot's replay is memoized on it). */
export function fightFromLast(last: LastFight): ReportFight {
  let out = lastCache.get(last);
  if (out === undefined) {
    out = {
      id: last.id,
      key: `played:${last.id}`,
      kind: 'played',
      log: last.log,
      snapshot: last.snapshot,
      config: last.config,
      labels: last.labels,
      seed: last.seed,
      fight: last.fight,
      compareBot: true,
      sim: null,
    };
    lastCache.set(last, out);
  }
  return out;
}

/**
 * The end-of-fight numbers from the log alone (a source without a final snapshot): damage and DPS
 * over `durationMs`, completed casts and item uses per id (`spec`'s item actions are uses), and
 * the unhasted GCD (the log does not record haste).
 */
export function finalFromLog(log: readonly LogEvent[], durationMs: number, spec: NextFight['spec']): FightFinal {
  const items = new Set(spec.spells.filter((s) => s.item).map((s) => s.id));
  let damageTotal = 0;
  const castCounts: Record<string, number> = {};
  const useCounts: Record<string, number> = {};
  for (const e of log) {
    if ((e.type === 'damage' || e.type === 'tick') && typeof e.amount === 'number') damageTotal += e.amount;
    else if (e.type === 'cast-complete' && e.spellId !== undefined) {
      const counts = items.has(e.spellId) ? useCounts : castCounts;
      counts[e.spellId] = (counts[e.spellId] ?? 0) + 1;
    }
  }
  return { nowMs: durationMs, durationMs, gcdMs: BASE_GCD_MS, dps: durationMs > 0 ? damageTotal / (durationMs / 1000) : 0, damageTotal, castCounts, useCounts };
}

/** What any fight source gives: its log, setup snapshot, seed and length (and its final numbers when known). */
export interface FightInput {
  key: string;
  kind: FightKind;
  log: readonly LogEvent[];
  config: SetupConfig;
  seed: number;
  durationMs: number;
  /** The final snapshot's numbers; derived from the log (`finalFromLog`) when absent. */
  final?: FightFinal;
  sim?: SimContext | null;
}

/** A report fight from any source: `fight` is `input.config` applied (the caller applies it: `fightOfConfig`). */
export function fightFromInput(input: FightInput, fight: NextFight): ReportFight {
  return {
    id: nextSyntheticId--,
    key: input.key,
    kind: input.kind,
    log: input.log,
    snapshot: input.final ?? finalFromLog(input.log, input.durationMs, fight.spec),
    config: input.config,
    labels: chipLabelsOf(input.config, fight.catalog),
    seed: input.seed,
    fight,
    compareBot: input.kind === 'played',
    sim: input.sim ?? null,
  };
}

/** A finished simulation as the Report keeps it (`TrainerMeta.lastSimulation`). */
export interface SimulationRef {
  /** Counts the recorded simulations (part of the key fights' source keys). */
  id: number;
  result: SimResult;
  /** The setup snapshot the simulation ran (the normalized config at its start). */
  config: SetupConfig;
}

/** The simulation's context for one of its runs. */
export function simContextOf(result: Pick<SimResult, 'runs' | 'seed' | 'spellQueueWindowMs' | 'meanDps' | 'stdDev'>, run: number, dps: number): SimContext {
  return {
    run,
    runs: result.runs,
    baseSeed: result.seed,
    spellQueueWindowMs: result.spellQueueWindowMs,
    meanDps: result.meanDps,
    stdDev: result.stdDev,
    sigma: result.stdDev > 0 ? (dps - result.meanDps) / result.stdDev : null,
  };
}

/**
 * Replays run `run` of a simulation exactly as the simulator played it (`prepareRun` +
 * `playFight` with `mixSeed(seed, run)`, the path `replayFight` takes, here keeping the final
 * snapshot and the applied setup too): the setup snapshot `config` (never the current setup), the
 * simulation's runs, seed and spell queue window, the item database when the gear needs it. Throws
 * what `prepareRun` throws, or a RangeError for a run outside the simulation.
 */
export function replaySimFight(
  sim: { result: Pick<SimResult, 'runs' | 'seed' | 'spellQueueWindowMs' | 'meanDps' | 'stdDev'>; config: SetupConfig },
  run: number,
  kind: FightKind,
  key: string,
  db: ItemDb | null,
): ReportFight {
  const { result, config } = sim;
  const factory = prepareRun({ setup: config, runs: result.runs, seed: result.seed, spellQueueWindowMs: result.spellQueueWindowMs, db });
  if (!Number.isInteger(run) || run < 0 || run >= factory.runs) {
    throw new RangeError(`replay: run must be an integer from 0 to ${factory.runs - 1}, got ${String(run)}`);
  }
  const seed = mixSeed(factory.seed, run);
  const played = playFight(factory, seed);
  const snapshot = played.sim.snapshot();
  const fight: NextFight = { config: factory.config, catalog: setupCatalogFor(setupGear(factory.config), db), ...factory.fight };
  return {
    id: nextSyntheticId--,
    key,
    kind,
    log: played.sim.log(),
    snapshot: { ...snapshot, dps: played.dps },
    config: factory.config,
    labels: chipLabelsOf(factory.config, fight.catalog),
    seed,
    fight,
    compareBot: false,
    sim: simContextOf(result, run, played.dps),
  };
}
