// The fight second by second (fight timeline and key fights Task K2; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 C, D and §3): pure
// view-models of a fight's log for Report → Timeline's "Moment by moment". The log is the only
// source of truth (never the engine): second N is the window [N s, N+1 s) of fight time; events
// before the pull (negative ms) count in second 0 and are marked, events at or after the fight's
// last ms count in the last second (a DoT may tick exactly at the end). Never throws, also on
// hostile logs: an entry that is not an object with a finite `atMs` and a known type is skipped.
// No React, no DOM, no clock. Memoized by the caller per fight.

import type { LogEvent, LogType } from '../../engine/types';
import { formatInt } from '../format';

/** Longest fight the model buckets (an hour of seconds): a larger length is capped there. */
export const MAX_SECONDS = 3600;

/** What the model needs to know about the fight's ids (all optional: none is an item, hidden or on the target). */
export interface SecondsOptions {
  /** Item action ids (`SpellDef.item`): their completions are item uses, not casts. */
  items?: ReadonlySet<string>;
  /** Hidden aura ids: left out of `stateAt`. */
  hidden?: ReadonlySet<string>;
  /** Aura ids on the target (DoTs, debuffs; `targetAuraIds`); the rest are the player's. */
  targets?: ReadonlySet<string>;
}

/** One spell's damage in one second (keyed like the Damage table: a tick without a spell by its aura). */
export interface SpellInSecond {
  spellId: string;
  /** Direct damage plus tick damage. */
  damage: number;
  /** Direct damage events (hits and crits). */
  hits: number;
  crits: number;
  misses: number;
  ticks: number;
}

export interface CastInSecond {
  spellId: string;
  atMs: number;
  kind: 'start' | 'complete' | 'cancel';
  /**
   * The cast's length: start to completion (or cancel); 0 for an instant completion; for a start,
   * its later completion's (or cancel's) length, null when the fight ended first.
   */
  castMs: number | null;
}

export interface QueueInSecond {
  spellId: string;
  atMs: number;
  /** A `queue-drop` (else a `queue`). */
  dropped: boolean;
  /** The drop's reason ('no-mana', 'replaced', …), null for a queue. */
  reason: string | null;
}

export interface TickInSecond {
  auraId: string;
  /** The spell that applied the DoT, null for a scheduled one. */
  spellId: string | null;
  atMs: number;
  amount: number;
}

export interface AuraChange {
  auraId: string;
  atMs: number;
  /** 'up': applied while down; 'refresh': applied again while up; 'down': faded. */
  change: 'up' | 'refresh' | 'down';
  side: 'self' | 'target';
}

export interface SecondBucket {
  /** N: the window [N s, N+1 s). */
  second: number;
  startMs: number;
  /** (N + 1) s, the fight's end for the last second. */
  endMs: number;
  /** Pre-pull log entries counted in this second (second 0 only). */
  prePull: number;
  /** Log entries counted in this second. */
  events: number;
  damage: number;
  /** All damage up to the end of this second. */
  cumulativeDamage: number;
  /** `cumulativeDamage` over the time up to `endMs` (the last second's is the fight's DPS). */
  cumulativeDps: number;
  /** Direct crits. */
  crits: number;
  /** Per spell, largest damage first (ties: first in the second first). */
  spells: SpellInSecond[];
  /** The spell with the most damage in this second (ties: the first), or null without damage. */
  topSpellId: string | null;
  casts: CastInSecond[];
  queue: QueueInSecond[];
  ticks: TickInSecond[];
  /** Item uses (completions of item actions). */
  items: { spellId: string; atMs: number }[];
  /** Logged mana gains (Life Tap, potions, regeneration without a spell). */
  mana: { spellId: string | null; atMs: number; amount: number }[];
  manaGained: number;
  auras: AuraChange[];
  /** ms each aura was up within this second (only auras that were); the pre-pull part counts in second 0. */
  auraUpMs: Record<string, number>;
}

const LOG_TYPES: ReadonlySet<LogType> = new Set<LogType>([
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

const NONE: ReadonlySet<string> = new Set();

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A log entry the model can read, or null (skipped). */
function readEvent(e: unknown): LogEvent | null {
  try {
    if (typeof e !== 'object' || e === null) return null;
    const r = e as Record<string, unknown>;
    const atMs = r.atMs;
    const type = r.type;
    if (typeof atMs !== 'number' || !Number.isFinite(atMs) || typeof type !== 'string' || !LOG_TYPES.has(type as LogType)) return null;
    const out: LogEvent = { atMs, type: type as LogType };
    const spellId = str(r.spellId);
    const auraId = str(r.auraId);
    if (spellId !== undefined) out.spellId = spellId;
    if (auraId !== undefined) out.auraId = auraId;
    if (r.amount !== undefined) out.amount = num(r.amount);
    if (r.crit === true) out.crit = true;
    const reason = str(r.reason);
    if (reason !== undefined) out.reason = reason;
    return out;
  } catch {
    return null;
  }
}

/** The readable entries of `log`, in order (hostile input never throws). */
function readLog(log: readonly LogEvent[]): LogEvent[] {
  const out: LogEvent[] = [];
  if (!Array.isArray(log)) return out;
  for (const e of log) {
    const r = readEvent(e);
    if (r !== null) out.push(r);
  }
  return out;
}

function secondCount(durationMs: number): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(MAX_SECONDS, Math.ceil(durationMs / 1000));
}

const indexOf = (atMs: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(atMs / 1000)));

/**
 * The fight second by second: per second [N, N+1) its damage (per spell, with crits, misses and
 * ticks), casts started, completed and cancelled (with their cast time), queued and dropped
 * presses, item uses, mana gains, aura changes and the ms each aura was up (aura windows as the
 * uptimes count them: `aura-apply` to `aura-fade`, a refresh keeps the window, still up at the end:
 * to the end). The per-spell sums over all seconds are the Damage table's and the fight's
 * `damageTotal`; the aura ms add up to the uptimes. `durationMs` not a positive finite number: no
 * seconds.
 */
export function secondBuckets(rawLog: readonly LogEvent[], durationMs: number, opts: SecondsOptions = {}): SecondBucket[] {
  const n = secondCount(durationMs);
  if (n === 0) return [];
  const items = opts.items ?? NONE;
  const targets = opts.targets ?? NONE;
  const endOfFight = Math.min(durationMs, n * 1000);
  const buckets: SecondBucket[] = Array.from({ length: n }, (_, k) => ({
    second: k,
    startMs: k * 1000,
    endMs: Math.min((k + 1) * 1000, endOfFight),
    prePull: 0,
    events: 0,
    damage: 0,
    cumulativeDamage: 0,
    cumulativeDps: 0,
    crits: 0,
    spells: [],
    topSpellId: null,
    casts: [],
    queue: [],
    ticks: [],
    items: [],
    mana: [],
    manaGained: 0,
    auras: [],
    auraUpMs: {},
  }));
  const log = readLog(rawLog);
  const spellMaps = buckets.map(() => new Map<string, SpellInSecond>());
  const spellOf = (k: number, id: string) => {
    const m = spellMaps[k]!;
    let s = m.get(id);
    if (!s) {
      s = { spellId: id, damage: 0, hits: 0, crits: 0, misses: 0, ticks: 0 };
      m.set(id, s);
    }
    return s;
  };
  const started = new Map<string, CastInSecond>();
  const upSince = new Map<string, number>();
  const addUp = (auraId: string, from: number, to: number) => {
    // [from, to) spread over the seconds; the part before 0 counts in second 0, nothing after the end.
    const end = Math.min(to, endOfFight);
    if (!(end > from)) return;
    const pre = Math.min(end, 0) - from;
    if (pre > 0) buckets[0]!.auraUpMs[auraId] = (buckets[0]!.auraUpMs[auraId] ?? 0) + pre;
    for (let k = Math.max(0, Math.floor(Math.max(from, 0) / 1000)); k < n; k++) {
      const b = buckets[k]!;
      const ms = Math.min(end, b.endMs) - Math.max(from, b.startMs, 0);
      if (b.startMs >= end) break;
      if (ms > 0) b.auraUpMs[auraId] = (b.auraUpMs[auraId] ?? 0) + ms;
    }
  };
  for (const e of log) {
    const k = indexOf(e.atMs, n);
    const b = buckets[k]!;
    b.events += 1;
    if (e.atMs < 0) b.prePull += 1;
    switch (e.type) {
      case 'damage': {
        const s = spellOf(k, e.spellId ?? e.auraId ?? '?');
        const amount = e.amount ?? 0;
        s.damage += amount;
        s.hits += 1;
        b.damage += amount;
        if (e.crit) {
          s.crits += 1;
          b.crits += 1;
        }
        break;
      }
      case 'tick': {
        const s = spellOf(k, e.spellId ?? e.auraId ?? '?');
        const amount = e.amount ?? 0;
        s.damage += amount;
        s.ticks += 1;
        b.damage += amount;
        b.ticks.push({ auraId: e.auraId ?? '?', spellId: e.spellId ?? null, atMs: e.atMs, amount });
        break;
      }
      case 'miss':
        spellOf(k, e.spellId ?? e.auraId ?? '?').misses += 1;
        break;
      case 'cast-start': {
        if (e.spellId === undefined) break;
        const c: CastInSecond = { spellId: e.spellId, atMs: e.atMs, kind: 'start', castMs: null };
        started.set(e.spellId, c);
        b.casts.push(c);
        break;
      }
      case 'cast-complete':
      case 'cast-cancel': {
        if (e.spellId === undefined) break;
        const start = started.get(e.spellId);
        started.delete(e.spellId);
        const castMs = start === undefined ? 0 : e.atMs - start.atMs;
        if (start !== undefined) start.castMs = castMs;
        const kind = e.type === 'cast-complete' ? 'complete' : 'cancel';
        if (kind === 'complete' && items.has(e.spellId)) b.items.push({ spellId: e.spellId, atMs: e.atMs });
        else b.casts.push({ spellId: e.spellId, atMs: e.atMs, kind, castMs });
        break;
      }
      case 'queue':
      case 'queue-drop':
        if (e.spellId === undefined) break;
        b.queue.push({ spellId: e.spellId, atMs: e.atMs, dropped: e.type === 'queue-drop', reason: e.type === 'queue-drop' ? (e.reason ?? null) : null });
        break;
      case 'mana': {
        const amount = e.amount ?? 0;
        b.mana.push({ spellId: e.spellId ?? null, atMs: e.atMs, amount });
        b.manaGained += amount;
        break;
      }
      case 'aura-apply':
      case 'aura-fade': {
        if (e.auraId === undefined) break;
        const side = targets.has(e.auraId) ? 'target' : 'self';
        if (e.type === 'aura-apply') {
          b.auras.push({ auraId: e.auraId, atMs: e.atMs, change: upSince.has(e.auraId) ? 'refresh' : 'up', side });
          if (!upSince.has(e.auraId)) upSince.set(e.auraId, e.atMs);
        } else {
          b.auras.push({ auraId: e.auraId, atMs: e.atMs, change: 'down', side });
          const since = upSince.get(e.auraId);
          if (since !== undefined) {
            upSince.delete(e.auraId);
            addUp(e.auraId, since, e.atMs);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  // Still up at the end: up to the end (as `buffWindows`).
  for (const [id, since] of upSince) addUp(id, since, Math.max(since, durationMs));
  let sum = 0;
  buckets.forEach((b, k) => {
    // Stable sort: ties keep the order of first appearance in the second.
    b.spells = [...spellMaps[k]!.values()].sort((x, y) => y.damage - x.damage);
    b.topSpellId = b.spells[0] !== undefined && b.spells[0].damage > 0 ? b.spells[0].spellId : null;
    sum += b.damage;
    b.cumulativeDamage = sum;
    b.cumulativeDps = b.endMs > 0 ? sum / (b.endMs / 1000) : 0;
  });
  return buckets;
}

// ---------------------------------------------------------------------------
// State at an instant
// ---------------------------------------------------------------------------

export interface ActiveAura {
  auraId: string;
  /** When the current window began (the first application while down). */
  sinceMs: number;
  /** The latest application (or refresh) at or before the instant. */
  lastAppliedMs: number;
  /** The logged fade, or the fight's end when it was still up then. */
  endsAtMs: number;
  remainingMs: number;
  /** Still up when the fight ended (no fade logged). */
  untilEnd: boolean;
}

/**
 * The auras up at the instant `ms` (an aura applied at `ms` is up, one that fades at `ms` is not),
 * from the log only: the player's (`self`) and the target's (`target`, `opts.targets`), hidden
 * ones left out, each with its remaining time until its logged fade (or the fight's end). In order
 * of the window's start.
 */
export function stateAt(rawLog: readonly LogEvent[], ms: number, durationMs: number, opts: SecondsOptions = {}): { self: ActiveAura[]; target: ActiveAura[] } {
  const hidden = opts.hidden ?? NONE;
  const targets = opts.targets ?? NONE;
  const self: ActiveAura[] = [];
  const target: ActiveAura[] = [];
  if (typeof ms !== 'number' || Number.isNaN(ms)) return { self, target };
  const end = typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 0;
  const open = new Map<string, { sinceMs: number; lastAppliedMs: number }>();
  const found: ActiveAura[] = [];
  const close = (auraId: string, endsAtMs: number, untilEnd: boolean) => {
    const w = open.get(auraId)!;
    open.delete(auraId);
    if (w.sinceMs <= ms && ms < endsAtMs) {
      found.push({ auraId, sinceMs: w.sinceMs, lastAppliedMs: w.lastAppliedMs, endsAtMs, remainingMs: endsAtMs - ms, untilEnd });
    }
  };
  for (const e of readLog(rawLog)) {
    if (e.auraId === undefined) continue;
    if (e.type === 'aura-apply') {
      const w = open.get(e.auraId);
      if (w === undefined) open.set(e.auraId, { sinceMs: e.atMs, lastAppliedMs: e.atMs });
      else if (e.atMs <= ms) w.lastAppliedMs = e.atMs;
    } else if (e.type === 'aura-fade' && open.has(e.auraId)) {
      close(e.auraId, e.atMs, false);
    }
  }
  for (const [auraId, w] of [...open]) close(auraId, Math.max(w.sinceMs, end), true);
  found.sort((a, b) => a.sinceMs - b.sinceMs);
  for (const a of found) {
    if (hidden.has(a.auraId)) continue;
    (targets.has(a.auraId) ? target : self).push(a);
  }
  return { self, target };
}

// ---------------------------------------------------------------------------
// Jumps, filters, export
// ---------------------------------------------------------------------------

export type JumpKind = 'aura' | 'item' | 'crit' | 'queueDrop';

/** The seconds (ascending) with an aura change, an item use, a crit, a dropped press. */
export function eventJumps(buckets: readonly SecondBucket[]): Record<JumpKind, number[]> {
  const out: Record<JumpKind, number[]> = { aura: [], item: [], crit: [], queueDrop: [] };
  for (const b of buckets) {
    if (b.auras.length > 0) out.aura.push(b.second);
    if (b.items.length > 0) out.item.push(b.second);
    if (b.crits > 0) out.crit.push(b.second);
    if (b.queue.some((q) => q.dropped)) out.queueDrop.push(b.second);
  }
  return out;
}

/** The first of `seconds` (ascending) after `from` (dir 1) or the last before it (dir -1), or null. */
export function jumpFrom(seconds: readonly number[], from: number, dir: 1 | -1): number | null {
  if (dir === 1) return seconds.find((s) => s > from) ?? null;
  for (let i = seconds.length - 1; i >= 0; i--) if (seconds[i]! < from) return seconds[i]!;
  return null;
}

export type SecondFilterKind = 'damage' | 'auras' | 'items' | 'drops';

/** The ids a second mentions (spells, ticks' auras, casts, queue, items, aura changes, mana sources). */
function idsOf(b: SecondBucket): Set<string> {
  const ids = new Set<string>();
  for (const s of b.spells) ids.add(s.spellId);
  for (const t of b.ticks) ids.add(t.auraId);
  for (const c of b.casts) ids.add(c.spellId);
  for (const q of b.queue) ids.add(q.spellId);
  for (const i of b.items) ids.add(i.spellId);
  for (const a of b.auras) ids.add(a.auraId);
  for (const m of b.mana) if (m.spellId !== null) ids.add(m.spellId);
  return ids;
}

/**
 * The seconds with any of `kinds` (none: every second) whose spells, auras or items have a name
 * containing `query` (case-insensitive, trimmed; empty: any).
 */
export function filterSeconds(
  buckets: readonly SecondBucket[],
  filter: { kinds: readonly SecondFilterKind[]; query: string },
  name: (id: string) => string,
): SecondBucket[] {
  const q = filter.query.trim().toLowerCase();
  const has = (b: SecondBucket, k: SecondFilterKind) =>
    k === 'damage' ? b.damage > 0 : k === 'auras' ? b.auras.length > 0 : k === 'items' ? b.items.length > 0 : b.queue.some((x) => x.dropped);
  return buckets.filter(
    (b) =>
      (filter.kinds.length === 0 || filter.kinds.some((k) => has(b, k))) &&
      (q === '' || [...idsOf(b)].some((id) => name(id).toLowerCase().includes(q))),
  );
}

/** A CSV field: quoted when it holds a comma, a quote or a line break. */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const joined = (ids: readonly string[], name: (id: string) => string) => ids.map(name).join('; ');

/**
 * The fight second by second as CSV ("Copy fight log (CSV)"): second, damage, completed casts,
 * auras up (applied or refreshed), auras down, item uses, mana gained (rounded).
 */
export function secondsCsv(buckets: readonly SecondBucket[], name: (id: string) => string): string {
  const rows = ['second,damage,casts,auras up,auras down,items,mana'];
  for (const b of buckets) {
    rows.push(
      [
        String(b.second),
        String(b.damage),
        csvField(joined(b.casts.filter((c) => c.kind === 'complete').map((c) => c.spellId), name)),
        csvField(joined(b.auras.filter((a) => a.change !== 'down').map((a) => a.auraId), name)),
        csvField(joined(b.auras.filter((a) => a.change === 'down').map((a) => a.auraId), name)),
        csvField(joined(b.items.map((i) => i.spellId), name)),
        String(Math.round(b.manaGained)),
      ].join(','),
    );
  }
  return rows.join('\n');
}

const sec = (ms: number) => (ms / 1000).toFixed(1);

/** One second in words ("Copy this second"). */
export function secondText(b: SecondBucket, name: (id: string) => string): string {
  const lines = [`Second ${b.second} (${sec(b.startMs)}–${sec(b.endMs)} s): ${formatInt(b.damage)} damage${b.prePull > 0 ? ' (includes pre-pull)' : ''}`];
  for (const s of b.spells) {
    const notes = [s.crits > 0 ? `${s.crits} crit` : '', s.misses > 0 ? `${s.misses} miss` : '', s.ticks > 0 ? `${s.ticks} tick` : ''].filter((x) => x !== '');
    lines.push(`  ${name(s.spellId)} ${formatInt(s.damage)}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`);
  }
  for (const c of b.casts) {
    const what = c.kind === 'start' ? 'cast started' : c.kind === 'complete' ? 'cast' : 'cast cancelled';
    lines.push(`  ${sec(c.atMs)} s ${name(c.spellId)} ${what}${c.castMs !== null && c.castMs > 0 ? ` (${sec(c.castMs)} s)` : ''}`);
  }
  for (const q of b.queue) lines.push(`  ${sec(q.atMs)} s ${name(q.spellId)} ${q.dropped ? `dropped from the queue${q.reason ? ` (${q.reason})` : ''}` : 'queued'}`);
  for (const i of b.items) lines.push(`  ${sec(i.atMs)} s used ${name(i.spellId)}`);
  for (const a of b.auras) lines.push(`  ${sec(a.atMs)} s ${name(a.auraId)} ${a.change === 'up' ? 'up' : a.change === 'refresh' ? 'refreshed' : 'down'}`);
  if (b.manaGained > 0) lines.push(`  Mana +${formatInt(b.manaGained)}`);
  return lines.join('\n');
}
