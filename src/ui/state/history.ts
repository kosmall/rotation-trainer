// Fight history and the Highest DPS ranking (fight timeline and key fights Task K2b; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 E-F). Pure and
// framework-free; nothing here throws. Every played fight is kept with its log (a person does not
// play the same fight twice); a simulation's key fights (highest, typical, lowest DPS) are kept as
// references (run, seeds, the simulation's numbers) and replayed on demand. Each entry carries its
// setup snapshot: the normalized config at the fight's (or the simulation's) start. Stored under
// its own key, versioned; stored data is never trusted (every entry is read again, the config
// through `normalizeSetup`), and the caps bound what is kept: 20 played fights within 1.5 MB of
// text, 10 simulations, pinned entries never dropped (they count toward the caps).

import type { LogEvent, LogType } from '../../engine/types';
import { normalizeSetup, SETUP_CATALOG } from '../../setup/defaults';
import type { SetupStorage } from '../../setup/storage';
import type { SetupConfig } from '../../setup/types';
import type { SimResult } from '../../sim-runner/types';
import type { FightFinal, FightKind } from '../report/reportFight';

/** The localStorage key; the version suffix lets a later format move to a new key. */
export const HISTORY_STORAGE_KEY = 'rotation-trainer:history:v1';

export const HISTORY_LIMITS = Object.freeze({
  /** Played fights kept (the newest; pinned ones count). */
  played: 20,
  /** Text (JSON characters) of all played entries together, logs included: 1.5 MB. */
  playedChars: 1_500_000,
  /** Simulations kept (three key-fight entries each; the newest). */
  simulations: 10,
  /** The whole stored text: longer is not parsed on load and not written (oldest unpinned entries go first). */
  storageChars: 4_000_000,
  /** Entries read from storage at most (before the caps). */
  readEntries: 500,
  /** Log entries of one played fight at most. */
  logEvents: 200_000,
  nameChars: 80,
  noteChars: 500,
});

const ID_RE = /^[a-z0-9-]{1,64}$/;

interface HistoryBase {
  /** `[a-z0-9-]`, 1-64 characters, unique. */
  id: string;
  kind: FightKind;
  /** When it was saved (ms since the epoch: the caller's clock). */
  savedAt: number;
  dps: number;
  /** The fight's own seed. */
  seed: number;
  durationMs: number;
  /** The setup snapshot (normalized SetupConfig at the fight's or the simulation's start). */
  config: SetupConfig;
  /** The user's name for it (trimmed, at most 80 characters). */
  name?: string;
  /** The user's note (at most 500 characters). */
  note?: string;
  /** Pinned: never dropped by the caps. */
  pinned?: boolean;
}

/** A played fight with its whole log and final numbers. */
export interface PlayedEntry extends HistoryBase {
  kind: 'played';
  log: LogEvent[];
  final: FightFinal;
}

/** One key fight of a simulation, replayed on demand (`replaySimFight`). */
export interface SimEntry extends HistoryBase {
  kind: 'sim-highest' | 'sim-typical' | 'sim-lowest';
  /** The simulation it belongs to (shared by its three entries). */
  simulation: string;
  run: number;
  runs: number;
  /** The simulation's base seed (`seed` is the fight's own, `mixSeed(baseSeed, run)`). */
  baseSeed: number;
  spellQueueWindowMs: number;
  meanDps: number;
  stdDev: number;
}

export type HistoryEntry = PlayedEntry | SimEntry;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

const LOG_TYPES: ReadonlySet<string> = new Set<LogType>([
  'cast-start',
  'cast-complete',
  'cast-cancel',
  'impact',
  'damage',
  'miss',
  'tick',
  'aura-apply',
  'aura-fade',
  'mana',
  'queue',
  'queue-drop',
]);

const SIM_KINDS: ReadonlySet<string> = new Set(['sim-highest', 'sim-typical', 'sim-lowest']);

// ---------------------------------------------------------------------------
// Reading stored entries
// ---------------------------------------------------------------------------

const shortString = (v: unknown, max = 128): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** A log entry exactly as the engine logs it, or null. */
function readLogEvent(v: unknown): LogEvent | null {
  if (!isRecord(v)) return null;
  const atMs = own(v, 'atMs');
  const type = own(v, 'type');
  if (!finite(atMs) || typeof type !== 'string' || !LOG_TYPES.has(type)) return null;
  const out: LogEvent = { atMs, type: type as LogType };
  for (const k of ['spellId', 'auraId', 'reason'] as const) {
    const x = own(v, k);
    if (x === undefined) continue;
    if (!shortString(x)) return null;
    out[k] = x;
  }
  const amount = own(v, 'amount');
  if (amount !== undefined) {
    if (!finite(amount)) return null;
    out.amount = amount;
  }
  const crit = own(v, 'crit');
  if (crit !== undefined) {
    if (typeof crit !== 'boolean') return null;
    out.crit = crit;
  }
  return out;
}

/** Counts per id (`castCounts`): non-negative integers, in a null-prototype object; or null. */
function readCounts(v: unknown): Record<string, number> | null {
  if (!isRecord(v)) return null;
  const out = Object.create(null) as Record<string, number>;
  const keys = Object.keys(v);
  if (keys.length > 1000) return null;
  for (const k of keys) {
    const n = v[k];
    if (!shortString(k) || !intIn(n, 0, 1e9)) return null;
    out[k] = n;
  }
  return out;
}

function readFinal(v: unknown): FightFinal | null {
  if (!isRecord(v)) return null;
  const nums = ['nowMs', 'durationMs', 'gcdMs', 'dps', 'damageTotal'].map((k) => own(v, k));
  if (!nums.every(finite)) return null;
  const castCounts = readCounts(own(v, 'castCounts'));
  const useCounts = readCounts(own(v, 'useCounts'));
  if (castCounts === null || useCounts === null) return null;
  const [nowMs, durationMs, gcdMs, dps, damageTotal] = nums as number[];
  return { nowMs: nowMs!, durationMs: durationMs!, gcdMs: gcdMs!, dps: dps!, damageTotal: damageTotal!, castCounts, useCounts };
}

const trimTo = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t === '' ? undefined : t;
};

/** A stored entry read again, or null when any part of it is not what this module writes. */
function readEntry(v: unknown): HistoryEntry | null {
  if (!isRecord(v)) return null;
  const id = own(v, 'id');
  const kind = own(v, 'kind');
  const savedAt = own(v, 'savedAt');
  const dps = own(v, 'dps');
  const seed = own(v, 'seed');
  const durationMs = own(v, 'durationMs');
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof kind !== 'string' || (kind !== 'played' && !SIM_KINDS.has(kind))) return null;
  if (!finite(savedAt) || savedAt < 0 || !finite(dps) || !intIn(seed, 0, 0xffffffff)) return null;
  if (!finite(durationMs) || durationMs <= 0 || durationMs > 3_600_000) return null;
  const rawConfig = own(v, 'config');
  if (!isRecord(rawConfig)) return null;
  const base: HistoryBase = { id, kind: kind as FightKind, savedAt, dps, seed, durationMs, config: normalizeSetup(rawConfig, SETUP_CATALOG) };
  const name = trimTo(own(v, 'name'), HISTORY_LIMITS.nameChars);
  const note = trimTo(own(v, 'note'), HISTORY_LIMITS.noteChars);
  if (name !== undefined) base.name = name;
  if (note !== undefined) base.note = note;
  if (own(v, 'pinned') === true) base.pinned = true;
  if (kind === 'played') {
    const rawLog = own(v, 'log');
    if (!Array.isArray(rawLog) || rawLog.length > HISTORY_LIMITS.logEvents) return null;
    const log: LogEvent[] = [];
    for (const e of rawLog) {
      const r = readLogEvent(e);
      if (r === null) return null;
      log.push(r);
    }
    const final = readFinal(own(v, 'final'));
    if (final === null) return null;
    return { ...base, kind: 'played', log, final };
  }
  const simulation = own(v, 'simulation');
  const run = own(v, 'run');
  const runs = own(v, 'runs');
  const baseSeed = own(v, 'baseSeed');
  const window = own(v, 'spellQueueWindowMs');
  const meanDps = own(v, 'meanDps');
  const stdDev = own(v, 'stdDev');
  if (typeof simulation !== 'string' || !ID_RE.test(simulation)) return null;
  if (!intIn(runs, 1, 100_000) || !intIn(run, 0, runs - 1) || !intIn(baseSeed, 0, 0xffffffff) || !intIn(window, 0, 1000)) return null;
  if (!finite(meanDps) || !finite(stdDev) || stdDev < 0) return null;
  return { ...base, kind: kind as SimEntry['kind'], simulation, run, runs, baseSeed, spellQueueWindowMs: window, meanDps, stdDev };
}

/**
 * The stored history: `{ version: 1, entries: [...] }` under `HISTORY_STORAGE_KEY`, newest
 * first. Never throws: no storage, a storage that throws, text over `storageChars`, invalid JSON
 * or the wrong shape give an empty history; a corrupt entry (or a repeated id) is skipped, the
 * rest kept; the caps applied (`pruneHistory`).
 */
export function loadHistory(storage: SetupStorage | null): HistoryEntry[] {
  let parsed: unknown;
  try {
    const text: unknown = storage?.getItem(HISTORY_STORAGE_KEY);
    if (typeof text !== 'string' || text.length > HISTORY_LIMITS.storageChars) return [];
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  try {
    if (!isRecord(parsed) || own(parsed, 'version') !== 1) return [];
    const raw = own(parsed, 'entries');
    if (!Array.isArray(raw)) return [];
    const out: HistoryEntry[] = [];
    const ids = new Set<string>();
    for (const item of raw.slice(0, HISTORY_LIMITS.readEntries)) {
      const e = readEntry(item);
      if (e === null || ids.has(e.id)) continue;
      ids.add(e.id);
      out.push(e);
    }
    return pruneHistory(out);
  } catch {
    return [];
  }
}

/**
 * Saves the history as JSON under `HISTORY_STORAGE_KEY`. False (never a throw) when there is no
 * storage, the text would exceed `storageChars`, or the storage refuses it (quota, private mode):
 * the caller shows it, never silently.
 */
export function saveHistory(storage: SetupStorage | null, entries: readonly HistoryEntry[]): boolean {
  if (!storage) return false;
  try {
    const text = JSON.stringify({ version: 1, entries });
    if (text.length > HISTORY_LIMITS.storageChars) return false;
    storage.setItem(HISTORY_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

const sizeOf = (e: HistoryEntry) => JSON.stringify(e).length;

/**
 * The caps (entries newest first; the order is kept): pinned entries always stay and count toward
 * the caps; then the newest unpinned played fights while there are fewer than 20 and their text
 * (with the pinned ones) stays within 1.5 MB; the unpinned entries of the 10 newest simulations
 * (counting simulations with a pinned entry); then, while the whole text is over `storageChars`,
 * the oldest unpinned entries go.
 */
export function pruneHistory(entries: readonly HistoryEntry[]): HistoryEntry[] {
  let playedCount = 0;
  let playedChars = 0;
  const sims = new Set<string>();
  for (const e of entries) {
    if (!e.pinned) continue;
    if (e.kind === 'played') {
      playedCount += 1;
      playedChars += sizeOf(e);
    } else sims.add(e.simulation);
  }
  const keep: HistoryEntry[] = [];
  for (const e of entries) {
    if (e.pinned) {
      keep.push(e);
    } else if (e.kind === 'played') {
      const size = sizeOf(e);
      if (playedCount < HISTORY_LIMITS.played && playedChars + size <= HISTORY_LIMITS.playedChars) {
        playedCount += 1;
        playedChars += size;
        keep.push(e);
      }
    } else if (sims.has(e.simulation) || sims.size < HISTORY_LIMITS.simulations) {
      sims.add(e.simulation);
      keep.push(e);
    }
  }
  let total = keep.reduce((a, e) => a + sizeOf(e) + 1, 30);
  for (let i = keep.length - 1; i >= 0 && total > HISTORY_LIMITS.storageChars; i--) {
    if (keep[i]!.pinned) continue;
    total -= sizeOf(keep[i]!) + 1;
    keep.splice(i, 1);
  }
  return keep.length === entries.length && keep.every((e, i) => e === entries[i]) ? (entries as HistoryEntry[]) : keep;
}

// ---------------------------------------------------------------------------
// Recording and editing
// ---------------------------------------------------------------------------

/** The next free id `h<n>` (or `s<n>` for a simulation group). */
function nextId(taken: Iterable<string>, prefix: 'h' | 's'): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of taken) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

/** A played fight: its log, final numbers, setup snapshot, seed and length. */
export interface PlayedFight {
  log: readonly LogEvent[];
  final: FightFinal;
  config: SetupConfig;
  seed: number;
  durationMs: number;
}

/**
 * Adds a played fight first (a copy of its log and counts) and applies the caps. `entry` is the
 * new one; it may be dropped by the caps at once (a log over 1.5 MB) — then it is not in `entries`.
 */
export function recordPlayed(entries: readonly HistoryEntry[], fight: PlayedFight, now: number): { entries: HistoryEntry[]; entry: PlayedEntry } {
  const f = fight.final;
  const entry: PlayedEntry = {
    id: nextId(
      entries.map((e) => e.id),
      'h',
    ),
    kind: 'played',
    savedAt: now,
    dps: f.dps,
    seed: fight.seed >>> 0,
    durationMs: fight.durationMs,
    config: fight.config,
    log: fight.log.map((e) => ({ ...e })),
    final: { nowMs: f.nowMs, durationMs: f.durationMs, gcdMs: f.gcdMs, dps: f.dps, damageTotal: f.damageTotal, castCounts: { ...f.castCounts }, useCounts: { ...f.useCounts } },
  };
  return { entries: pruneHistory([entry, ...entries]), entry };
}

/** A finished simulation: its result (with `keyFights`) and the setup snapshot it ran. */
export interface RecordedSimulation {
  result: Pick<SimResult, 'runs' | 'seed' | 'spellQueueWindowMs' | 'meanDps' | 'stdDev' | 'keyFights'>;
  config: SetupConfig;
}

/**
 * Adds a simulation's three key fights first (highest, typical, lowest: one simulation group) and
 * applies the caps. A result without key fights adds nothing (the same array back).
 */
export function recordSimulation(entries: readonly HistoryEntry[], sim: RecordedSimulation, now: number): HistoryEntry[] {
  const kf = sim.result.keyFights;
  if (kf === undefined) return entries as HistoryEntry[];
  const ids = entries.map((e) => e.id);
  const simulation = nextId(
    entries.flatMap((e) => (e.kind === 'played' ? [] : [e.simulation])),
    's',
  );
  const { result, config } = sim;
  const added = (['highest', 'typical', 'lowest'] as const).map((which): SimEntry => {
    const k = kf[which];
    const id = nextId(ids, 'h');
    ids.push(id);
    return {
      id,
      kind: `sim-${which}`,
      savedAt: now,
      dps: k.dps,
      seed: k.seed,
      durationMs: config.fightDurationSec * 1000,
      config,
      simulation,
      run: k.run,
      runs: result.runs,
      baseSeed: result.seed,
      spellQueueWindowMs: result.spellQueueWindowMs,
      meanDps: result.meanDps,
      stdDev: result.stdDev,
    };
  });
  return pruneHistory([...added, ...entries]);
}

/** What the user can change on an entry: its name, note and pin ('' clears a name or note). */
export interface HistoryPatch {
  name?: string;
  note?: string;
  pinned?: boolean;
}

/** The entry `id` changed by `patch` (the caps applied: unpinning may drop it); unknown id: the same array. */
export function updateHistoryEntry(entries: readonly HistoryEntry[], id: string, patch: HistoryPatch): HistoryEntry[] {
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return entries as HistoryEntry[];
  const next: HistoryEntry = { ...entries[i]! };
  if (patch.name !== undefined) {
    const name = trimTo(patch.name, HISTORY_LIMITS.nameChars);
    if (name === undefined) delete next.name;
    else next.name = name;
  }
  if (patch.note !== undefined) {
    const note = trimTo(patch.note, HISTORY_LIMITS.noteChars);
    if (note === undefined) delete next.note;
    else next.note = note;
  }
  if (patch.pinned !== undefined) {
    if (patch.pinned) next.pinned = true;
    else delete next.pinned;
  }
  const out = [...entries];
  out[i] = next;
  return pruneHistory(out);
}

/** The history without entry `id`; unknown id: the same array. */
export function removeHistoryEntry(entries: readonly HistoryEntry[], id: string): HistoryEntry[] {
  return entries.some((e) => e.id === id) ? entries.filter((e) => e.id !== id) : (entries as HistoryEntry[]);
}

// ---------------------------------------------------------------------------
// Highest DPS ranking
// ---------------------------------------------------------------------------

/** The ranking's "same setup" key: the gear and the talents (not buffs, rotation, length or distance). */
export function setupKeyOf(config: SetupConfig): string {
  return JSON.stringify([config.gear ?? null, config.talents ?? null]);
}

export interface RankFilters {
  kind: 'all' | 'played' | 'sim';
  /** Only fights of this length (ms); null: any. */
  durationMs: number | null;
  /** Only fights with this `setupKeyOf`; null: any. */
  setupKey: string | null;
  /** Rows at most (default 10). */
  limit?: number;
}

export interface RankRow {
  /** 1-based. */
  place: number;
  entry: HistoryEntry;
}

/** The top `limit` entries by DPS among those the filters keep (ties: the earlier saved first, then by id). */
export function rankTop(entries: readonly HistoryEntry[], filters: RankFilters): RankRow[] {
  const limit = Math.max(0, Math.floor(filters.limit ?? 10));
  return entries
    .filter(
      (e) =>
        (filters.kind === 'all' || (filters.kind === 'played') === (e.kind === 'played')) &&
        (filters.durationMs === null || e.durationMs === filters.durationMs) &&
        (filters.setupKey === null || setupKeyOf(e.config) === filters.setupKey),
    )
    .sort((a, b) => b.dps - a.dps || a.savedAt - b.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit)
    .map((entry, i) => ({ place: i + 1, entry }));
}
