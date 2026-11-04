// Everything the Report shows about one fight, computed once per fight (UI redesign Task 4; fight
// timeline and key fights Task K2, spec docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md
// §2 A-C): the view-models of reportView.ts and secondsModel.ts applied to the fight's log, the
// bot's replay of it (botRun.ts) and the names of the fight's own spec and catalog. A fight comes
// from any source (`ReportFight`): the last played fight, a simulation's key fight replayed on
// demand, a history entry; each is its log, its setup snapshot (the normalized config at the
// fight's start, applied: `NextFight`), its seed and length. Pure; memoized by the caller per fight.

import { BASE_GCD_MS } from '../../data/common/ratings';
import type { ItemDb } from '../../data/items/types';
import type { LogEvent, School, SimSnapshot } from '../../engine/types';
import { setupCatalogFor } from '../../setup/defaults';
import { setupGear } from '../../setup/gear';
import type { SetupConfig } from '../../setup/types';
import { mixSeed, playFight, prepareRun } from '../../sim-runner/run';
import type { KeyFights, SimResult } from '../../sim-runner/types';
import type { LaneRow } from '../charts/Lanes';
import { soFar } from '../fight/fightViewModel';
import type { SoFarRow } from '../fight/fightViewModel';
import { formatDps, formatInt, secondsText } from '../format';
import { fightSettingsName, gearName, rotationName, setupPresetName, talentsName } from '../state/selectors';
import type { ChipLabels, LastFight, NextFight } from '../state/TrainerProvider';
import { botRun } from './botRun';
import type { BotRun } from './botRun';
import {
  auraUptimes,
  buffWindows,
  castWindows,
  cumulativeDps,
  dpsSeries,
  insights,
  logRows,
  makeNamer,
  rotationRows,
  spellTable,
  spellTotals,
  targetAuraIds,
} from './reportViewModel';
import type { AuraUptime, Insight, LogRow, Namer, RotationRow, SpellRow, SpellTotals } from './reportViewModel';
import { secondBuckets } from './secondsModel';
import type { SecondBucket, SecondsOptions } from './secondsModel';

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

export interface ReportModel {
  /** The fight (any source). */
  last: ReportFight;
  /** The bot's replay (same setup and seed), or null when it could not be replayed. */
  bot: BotRun | null;
  name: Namer;
  durationMs: number;
  spells: SpellRow[];
  totals: SpellTotals;
  /** The player's own visible auras (buffs, item effects), by first application. */
  buffs: AuraUptime[];
  /** "Active time (GCD)" and the DoT uptimes (the Fight dock's "So far" at the end). */
  kpis: SoFarRow[];
  series: { x: number[]; rolling: number[]; cumulative: number[]; bot: number[] | null };
  /** Buff windows above the DPS chart (buffs that were not up for the whole fight). */
  buffLanes: LaneRow[];
  /** The Timeline: spell lanes (DoTs as their uptime), then the buff lanes. */
  timeline: LaneRow[];
  insights: Insight[];
  rotation: RotationRow[];
  log: LogRow[];
  /** The fight second by second (Timeline: Moment by moment). */
  seconds: SecondBucket[];
  /** The fight's item, hidden and target aura ids (`stateAt`, `secondBuckets`). */
  ids: Required<SecondsOptions>;
}

const toneOf = (school: School | null): LaneRow['tone'] => (school === 'shadow' ? 'shadow' : school === 'fire' ? 'fire' : 'other');

/** "Heroism / Bloodlust" -> "Heroism"; "Destruction Potion" -> "Destruction Potion" cut to 16. */
function shortName(name: string): string {
  const first = name.split(' / ')[0]!;
  return first.length > 16 ? `${first.slice(0, 15)}…` : first;
}

const uptimeMap = (log: readonly LogEvent[], durationMs: number, ids: readonly string[]): Record<string, number> => {
  const all = new Map(auraUptimes(log, durationMs).map((u) => [u.auraId, u.uptime]));
  return Object.fromEntries(ids.map((id) => [id, all.get(id) ?? 0]));
};

/** The Report's model of the last played fight (`buildReportModel` of `fightFromLast`). */
export function reportModel(last: LastFight): ReportModel {
  return buildReportModel(fightFromLast(last));
}

/**
 * The Report's model of any fight: runs the bot once for a played fight (memoized by botRun on the
 * fight object); a simulation's fight has no bot comparison (it is the bot's own fight).
 */
export function buildReportModel(last: ReportFight): ReportModel {
  const { fight, log, snapshot } = last;
  const spec = fight.spec;
  const durationMs = snapshot.durationMs;
  const name = makeNamer(spec, fight.catalog);
  const items = new Set(spec.spells.filter((s) => s.item).map((s) => s.id));
  const hidden = new Set(spec.auras.filter((a) => a.hidden).map((a) => a.id));
  const targets = targetAuraIds(spec, fight.sim.scheduledAuras);
  const bot = last.compareBot ? botRun(last) : null;

  const spells = spellTable(log, durationMs, items);
  const totals = spellTotals(spells, durationMs);
  const ups = auraUptimes(log, durationMs).filter((u) => !hidden.has(u.auraId));
  const buffs = ups.filter((u) => !targets.has(u.auraId));

  const rolling = dpsSeries(log, durationMs);
  const cumulative = cumulativeDps(log, durationMs);
  const series = {
    x: rolling.map((p) => p.t),
    rolling: rolling.map((p) => p.dps),
    cumulative: cumulative.map((p) => p.dps),
    bot: bot === null ? null : dpsSeries(bot.log, durationMs).map((p) => p.dps),
  };

  const windows = buffWindows(log, durationMs);
  const partial = (id: string) => {
    const w = windows.get(id) ?? [];
    return !(w.length === 1 && w[0]![0] <= 0 && w[0]![1] >= durationMs);
  };
  const buffLanes: LaneRow[] = buffs
    .filter((b) => partial(b.auraId))
    .map((b) => {
      const n = name(b.auraId);
      return { id: b.auraId, label: n.name, short: shortName(n.name), icon: n.icon, iconKind: n.iconKind, tone: 'buff', windows: windows.get(b.auraId) ?? [] };
    });

  // DoT spells show their aura's uptime; other spells their casts.
  const dotOf = new Map<string, string>();
  for (const s of spec.spells) {
    const aura = s.applyAura?.on === 'target' ? spec.auras.find((a) => a.id === s.applyAura!.auraId) : undefined;
    if (aura?.tick) dotOf.set(s.id, aura.id);
  }
  const timeline: LaneRow[] = [];
  for (const [spellId, w] of castWindows(log)) {
    if (items.has(spellId)) continue;
    const n = name(spellId);
    const dot = dotOf.get(spellId);
    timeline.push({
      id: spellId,
      label: n.name,
      icon: n.icon,
      iconKind: n.iconKind,
      tone: toneOf(n.school),
      windows: dot !== undefined ? (windows.get(dot) ?? w) : w,
    });
  }
  timeline.push(...buffLanes);

  const dotIds = [...new Set(dotOf.values())];
  const casts = (counts: Readonly<Record<string, number>>) => ({ ...counts });
  const you = { dps: snapshot.dps, uptimes: uptimeMap(log, durationMs, dotIds), casts: casts(snapshot.castCounts) };
  const botFacts = bot === null ? null : { dps: bot.dps, uptimes: uptimeMap(bot.log, durationMs, dotIds), casts: casts(bot.snapshot.castCounts) };

  return {
    last,
    bot,
    name,
    durationMs,
    spells,
    totals,
    buffs,
    kpis: soFar(snapshot, log, spec),
    series,
    buffLanes,
    timeline,
    insights: insights(you, botFacts, (id) => name(id).name),
    rotation: rotationRows(spec.priority, snapshot, bot?.snapshot ?? null),
    log: logRows(log, (id) => name(id).name),
    seconds: secondBuckets(log, durationMs, { items, hidden, targets }),
    ids: { items, hidden, targets },
  };
}

/** The share of the bot's DPS, e.g. "91.7%", or null without the bot. */
export function botShareText(model: Pick<ReportModel, 'bot' | 'last'>): string | null {
  const bot = model.bot;
  if (bot === null || !(bot.dps > 0)) return null;
  return `${((model.last.snapshot.dps / bot.dps) * 100).toFixed(1)}%`;
}

const pct = (x: number | null) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);

/** The report as plain text ("Copy Report"). */
export function reportText(model: ReportModel): string {
  const { last, bot, totals, durationMs } = model;
  const share = botShareText(model);
  const l = last.labels;
  return [
    'Rotation Trainer: fight report',
    `DPS ${formatDps(last.snapshot.dps)}${share !== null && bot !== null ? ` (${share} of the bot, ${formatDps(bot.dps)}, same setup and seed)` : ''}`,
    `Damage ${formatInt(totals.damage)}; duration ${secondsText(durationMs)} s; ${model.kpis.map((k) => `${k.label} ${pct(k.value)}`).join('; ')}`,
    `Played with: Setup ${l.setupPreset}; Gear ${l.gear}; Talents ${l.talents}; Rotation ${l.rotation}; Fight ${l.fight}`,
    'Per spell (damage, DPS, casts, crit, miss):',
    ...model.spells.map(
      (s) => `  ${model.name(s.spellId).name}: ${formatInt(s.damage)}, ${formatDps(s.dps)}, ${s.casts}, ${pct(s.critPct)}, ${s.misses}`,
    ),
    ...(model.insights.length > 0 ? ['What to look at:', ...model.insights.map((i) => `  ${i.text}`)] : []),
  ].join('\n');
}
