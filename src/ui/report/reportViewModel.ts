// The Report screen's view-models (UI redesign Task 4, spec §3.5 and §5.3): pure functions of an
// ended fight's log, final snapshot and data. No React, no DOM, no clock: every time comes from
// the log. The per-spell damage sums are exact (the engine's amounts are whole numbers and every
// one of them is in the log as a `damage` or `tick` entry), so the table's total is the fight's
// `damageTotal` to the last point.

import type { BuffDef, PriorityStep, SpecData } from '../../data/types';
import type { LogEvent, School, SimSnapshot } from '../../engine/types';
import { auraSources } from '../buffsView';
import { formatDps, formatInt } from '../format';

// ---------------------------------------------------------------------------
// Names and icons
// ---------------------------------------------------------------------------

export interface NamedThing {
  name: string;
  icon: string | null;
  iconKind: 'spell' | 'item';
  school: School | null;
}

export type Namer = (id: string) => NamedThing;

/**
 * Names spell, item action and aura ids like the Fight screen does: a spell by its `SpellDef`
 * (an item action with its item's icon), an aura by the catalog entry it comes from ("Heroism /
 * Bloodlust", the item's icon), else by its `AuraDef`. Unknown ids are named by themselves.
 */
export function makeNamer(spec: Pick<SpecData, 'spells' | 'auras'>, catalog: readonly BuffDef[] = []): Namer {
  const spells = new Map(spec.spells.map((s) => [s.id, s]));
  const auras = new Map(spec.auras.map((a) => [a.id, a]));
  const sources = auraSources(catalog);
  const itemActions = new Map<string, BuffDef>();
  for (const b of catalog) if (b.effect.action) itemActions.set(b.effect.action.id, b);
  const cache = new Map<string, NamedThing>();
  return (id) => {
    const hit = cache.get(id);
    if (hit) return hit;
    let out: NamedThing;
    const spell = spells.get(id);
    if (spell) {
      const item = itemActions.get(id);
      out = {
        name: spell.name,
        icon: spell.icon ?? item?.icon ?? null,
        iconKind: item?.iconKind === 'item' ? 'item' : 'spell',
        school: spell.item ? null : spell.school,
      };
    } else {
      const aura = auras.get(id);
      const source = sources.get(id);
      out = {
        name: source?.name ?? aura?.name ?? id,
        icon: aura?.icon ?? source?.icon ?? null,
        iconKind: source?.iconKind === 'item' ? 'item' : 'spell',
        school: aura?.tick?.school ?? null,
      };
    }
    cache.set(id, out);
    return out;
  };
}

// ---------------------------------------------------------------------------
// Damage by spell
// ---------------------------------------------------------------------------

export interface SpellRow {
  /** The spell id (a tick without a source spell: its aura id). */
  spellId: string;
  /** Direct damage plus tick damage. */
  damage: number;
  /** Share of all damage, 0..1 (0 when the fight dealt none). */
  share: number;
  /** `damage` per second of the fight's duration. */
  dps: number;
  /** Completed casts (`cast-complete`). */
  casts: number;
  /** Direct damage events (hits and crits). */
  hits: number;
  crits: number;
  /** Crits of the direct hits, 0..1, or null without a direct hit. */
  critPct: number | null;
  /**
   * The mean of the non-crit direct hits; for a spell that deals no direct damage (a DoT), the
   * mean tick. Null without either.
   */
  avgHit: number | null;
  /** The mean crit, or null without one. */
  avgCrit: number | null;
  misses: number;
  /** DoT ticks. */
  ticks: number;
}

interface Acc {
  damage: number;
  casts: number;
  hits: number;
  crits: number;
  hitSum: number;
  critSum: number;
  misses: number;
  ticks: number;
  tickSum: number;
}

/**
 * Damage by spell from the whole log: every `damage` and `tick` amount keyed by its spell id (a
 * tick without one by its aura id), completed casts, direct hits, crits and misses. A spell with
 * casts but no damage (Life Tap) has a row; `exclude` (the item actions) never does. Largest
 * damage first; ties keep the order of first appearance. DPS uses the fight's duration.
 */
export function spellTable(log: readonly LogEvent[], durationMs: number, exclude: ReadonlySet<string> = new Set()): SpellRow[] {
  const acc = new Map<string, Acc>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) {
      a = { damage: 0, casts: 0, hits: 0, crits: 0, hitSum: 0, critSum: 0, misses: 0, ticks: 0, tickSum: 0 };
      acc.set(id, a);
    }
    return a;
  };
  for (const e of log) {
    switch (e.type) {
      case 'damage': {
        const id = e.spellId ?? e.auraId ?? '?';
        if (exclude.has(id)) break;
        const a = get(id);
        const amount = e.amount ?? 0;
        a.damage += amount;
        a.hits += 1;
        if (e.crit) {
          a.crits += 1;
          a.critSum += amount;
        } else a.hitSum += amount;
        break;
      }
      case 'tick': {
        const id = e.spellId ?? e.auraId ?? '?';
        if (exclude.has(id)) break;
        const a = get(id);
        const amount = e.amount ?? 0;
        a.damage += amount;
        a.ticks += 1;
        a.tickSum += amount;
        break;
      }
      case 'miss':
        if (e.spellId !== undefined && !exclude.has(e.spellId)) get(e.spellId).misses += 1;
        break;
      case 'cast-complete':
        if (e.spellId !== undefined && !exclude.has(e.spellId)) get(e.spellId).casts += 1;
        break;
      default:
        break;
    }
  }
  let sum = 0;
  for (const a of acc.values()) sum += a.damage;
  const seconds = durationMs / 1000;
  const rows: SpellRow[] = [];
  for (const [spellId, a] of acc) {
    const normal = a.hits - a.crits;
    rows.push({
      spellId,
      damage: a.damage,
      share: sum > 0 ? a.damage / sum : 0,
      dps: seconds > 0 ? a.damage / seconds : 0,
      casts: a.casts,
      hits: a.hits,
      crits: a.crits,
      critPct: a.hits > 0 ? a.crits / a.hits : null,
      avgHit: normal > 0 ? a.hitSum / normal : a.hits === 0 && a.ticks > 0 ? a.tickSum / a.ticks : null,
      avgCrit: a.crits > 0 ? a.critSum / a.crits : null,
      misses: a.misses,
      ticks: a.ticks,
    });
  }
  return rows.sort((x, y) => y.damage - x.damage);
}

export interface SpellTotals {
  damage: number;
  dps: number;
  casts: number;
  misses: number;
}

/** The table's footer: sums over the rows (the damage is the fight's `damageTotal`). */
export function spellTotals(rows: readonly SpellRow[], durationMs: number): SpellTotals {
  let damage = 0;
  let casts = 0;
  let misses = 0;
  for (const r of rows) {
    damage += r.damage;
    casts += r.casts;
    misses += r.misses;
  }
  return { damage, dps: durationMs > 0 ? damage / (durationMs / 1000) : 0, casts, misses };
}

// ---------------------------------------------------------------------------
// Aura windows and uptimes
// ---------------------------------------------------------------------------

/** [start, end) in fight ms. */
export type Window = readonly [number, number];

/**
 * When each aura was up: from an `aura-apply` (a refresh while up applies again without a fade:
 * the same window) to its `aura-fade`, or to `durationMs` when still up at the end. Keys in order
 * of first application.
 */
export function buffWindows(log: readonly LogEvent[], durationMs: number): Map<string, Window[]> {
  const out = new Map<string, Window[]>();
  const upSince = new Map<string, number>();
  for (const e of log) {
    if (e.auraId === undefined) continue;
    if (e.type === 'aura-apply') {
      if (!out.has(e.auraId)) out.set(e.auraId, []);
      if (!upSince.has(e.auraId)) upSince.set(e.auraId, e.atMs);
    } else if (e.type === 'aura-fade') {
      const since = upSince.get(e.auraId);
      if (since === undefined) continue;
      upSince.delete(e.auraId);
      out.get(e.auraId)!.push([since, e.atMs]);
    }
  }
  for (const [id, since] of upSince) out.get(id)!.push([since, Math.max(since, durationMs)]);
  return out;
}

export interface AuraUptime {
  auraId: string;
  /** ms the aura was up (cut at the fight's end). */
  upMs: number;
  /** `upMs` / the fight's duration, 0..1. */
  uptime: number;
  /** Separate applications (a refresh while up does not count). */
  applications: number;
  /** The first application, ms. */
  firstAtMs: number;
}

/** Uptime per aura that was applied in the fight (`buffWindows`), in order of first application. */
export function auraUptimes(log: readonly LogEvent[], durationMs: number): AuraUptime[] {
  const out: AuraUptime[] = [];
  for (const [auraId, windows] of buffWindows(log, durationMs)) {
    let upMs = 0;
    for (const [a, b] of windows) upMs += Math.min(b, durationMs) - Math.min(a, durationMs);
    out.push({
      auraId,
      upMs,
      uptime: durationMs > 0 ? upMs / durationMs : 0,
      applications: windows.length,
      firstAtMs: windows[0]?.[0] ?? 0,
    });
  }
  return out;
}

/**
 * Cast windows per spell id (the Timeline's spell lanes): a cast from its `cast-start` to its
 * `cast-complete` or `cast-cancel`; an instant (or an item use) as a zero-length window at its
 * `cast-complete`. Keys in order of first appearance.
 */
export function castWindows(log: readonly LogEvent[]): Map<string, Window[]> {
  const out = new Map<string, Window[]>();
  const started = new Map<string, number>();
  for (const e of log) {
    if (e.spellId === undefined) continue;
    if (e.type === 'cast-start') {
      started.set(e.spellId, e.atMs);
      if (!out.has(e.spellId)) out.set(e.spellId, []);
    } else if (e.type === 'cast-complete' || e.type === 'cast-cancel') {
      const since = started.get(e.spellId);
      started.delete(e.spellId);
      if (e.type === 'cast-cancel' && since === undefined) continue;
      if (!out.has(e.spellId)) out.set(e.spellId, []);
      out.get(e.spellId)!.push([since ?? e.atMs, e.atMs]);
    }
  }
  return out;
}

/**
 * Which auras sit on the target: those a spell applies on the target, those scheduled on it, and
 * every DoT or damage-taken debuff. The rest are the player's.
 */
export function targetAuraIds(spec: Pick<SpecData, 'spells' | 'auras'>, scheduled: readonly { auraId: string; on: 'self' | 'target' }[] = []): Set<string> {
  const ids = new Set<string>();
  for (const s of spec.spells) if (s.applyAura?.on === 'target') ids.add(s.applyAura.auraId);
  for (const e of scheduled) if (e.on === 'target') ids.add(e.auraId);
  for (const a of spec.auras) if (a.tick !== undefined || a.damageTakenMult !== undefined) ids.add(a.id);
  return ids;
}

// ---------------------------------------------------------------------------
// DPS over time
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  /** Seconds of fight time: 1, 2, … and the fight's end. */
  t: number;
  dps: number;
}

/** Damage per whole second: bucket k holds the damage in (k s, (k + 1) s] (0 ms in the first). */
function damageBuckets(log: readonly LogEvent[], durationMs: number): number[] {
  const n = Math.max(0, Math.ceil(durationMs / 1000));
  const buckets = new Array<number>(n).fill(0);
  for (const e of log) {
    if ((e.type !== 'damage' && e.type !== 'tick') || e.amount === undefined) continue;
    const k = Math.min(n - 1, Math.max(0, Math.ceil(e.atMs / 1000) - 1));
    if (k >= 0) buckets[k]! += e.amount;
  }
  return buckets;
}

/** The point times: 1 s, 2 s, … and the fight's end (a 60 s fight has 60 points). */
function pointTimes(durationMs: number): number[] {
  const n = Math.max(0, Math.ceil(durationMs / 1000));
  return Array.from({ length: n }, (_, k) => (k === n - 1 ? durationMs / 1000 : k + 1));
}

/**
 * Rolling DPS: at each point, the damage of the last `windowSec` seconds divided by that window
 * (shorter at the start: the time elapsed). One point per second of the fight.
 */
export function dpsSeries(log: readonly LogEvent[], durationMs: number, windowSec = 5): SeriesPoint[] {
  const buckets = damageBuckets(log, durationMs);
  const times = pointTimes(durationMs);
  let rolling = 0;
  return times.map((t, k) => {
    rolling += buckets[k]!;
    if (k - windowSec >= 0) rolling -= buckets[k - windowSec]!;
    const from = Math.max(0, k + 1 - windowSec);
    const span = t - from;
    return { t, dps: span > 0 ? rolling / span : 0 };
  });
}

/** The fight's DPS so far at each point: all damage up to t over t (the last point is the fight's DPS). */
export function cumulativeDps(log: readonly LogEvent[], durationMs: number): SeriesPoint[] {
  const buckets = damageBuckets(log, durationMs);
  let sum = 0;
  return pointTimes(durationMs).map((t, k) => {
    sum += buckets[k]!;
    return { t, dps: t > 0 ? sum / t : 0 };
  });
}

// ---------------------------------------------------------------------------
// Rotation: your casts against the bot's
// ---------------------------------------------------------------------------

export interface RotationRow {
  /** The pressed spell or item action id. */
  spellId: string;
  label: string;
  /** Rank of the rule in the priority list (1-based, first rule pressing this spell); null: a spell you cast that no rule presses. */
  rank: number | null;
  you: number;
  /** The bot's count in the same fight, or null when the bot could not replay it. */
  bot: number | null;
}

type Counts = Pick<SimSnapshot, 'castCounts' | 'useCounts'>;

const countOf = (s: Counts, id: string) => s.castCounts[id] ?? s.useCounts[id] ?? 0;

/**
 * One row per spell the priority list presses (first rule first; a spell two rules press counts
 * once): your completed casts (or item uses) against the bot's, from the final snapshots. Then,
 * with `rank` null, every spell or item you used that no rule presses (labelled by its id: the
 * caller names it).
 */
export function rotationRows(priority: readonly PriorityStep[], you: Counts, bot: Counts | null): RotationRow[] {
  const seen = new Set<string>();
  const rows: RotationRow[] = [];
  let rank = 0;
  for (const step of priority) {
    if (step.kind === 'wait') continue;
    rank += 1;
    if (seen.has(step.spellId)) continue;
    seen.add(step.spellId);
    rows.push({ spellId: step.spellId, label: step.label, rank, you: countOf(you, step.spellId), bot: bot === null ? null : countOf(bot, step.spellId) });
  }
  for (const id of [...Object.keys(you.castCounts), ...Object.keys(you.useCounts)]) {
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ spellId: id, label: id, rank: null, you: countOf(you, id), bot: bot === null ? null : countOf(bot, id) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// "What to look at"
// ---------------------------------------------------------------------------

export interface FightFacts {
  dps: number;
  /** Uptime 0..1 of the auras to compare (the DoTs the rotation applies), by aura id. */
  uptimes: Readonly<Record<string, number>>;
  /** Completed casts by spell id. */
  casts: Readonly<Record<string, number>>;
}

export interface Insight {
  kind: 'good' | 'warn';
  text: string;
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * 2–4 sentences from the comparison with the bot's replay of the same fight (same setup and seed).
 * Only what the numbers say: the DPS ratio; each compared aura whose uptime is 3 points or more
 * below the bot's (largest gap first), or that matched it; the spell whose cast count differs
 * most (2 or more). Without the bot: none.
 */
export function insights(player: FightFacts, bot: FightFacts | null, name: (id: string) => string): Insight[] {
  if (bot === null || bot.dps <= 0) return [];
  const out: Insight[] = [];
  const ratio = player.dps / bot.dps;
  out.push({
    kind: ratio >= 0.97 ? 'good' : 'warn',
    text: `Your DPS was ${pct1(ratio)} of the bot's (${formatDps(player.dps)} against ${formatDps(bot.dps)}) with the same setup and seed.`,
  });
  const gaps = Object.keys(bot.uptimes)
    .map((id) => ({ id, you: player.uptimes[id] ?? 0, bot: bot.uptimes[id] ?? 0 }))
    .map((g) => ({ ...g, gap: g.bot - g.you }));
  const behind = gaps.filter((g) => g.gap >= 0.03).sort((a, b) => b.gap - a.gap);
  for (const g of behind) {
    out.push({ kind: 'warn', text: `${name(g.id)} was up ${pct1(g.you)} of the fight; the bot kept it up ${pct1(g.bot)}.` });
  }
  const castIds = new Set([...Object.keys(player.casts), ...Object.keys(bot.casts)]);
  let worst: { id: string; you: number; bot: number } | null = null;
  for (const id of castIds) {
    const you = player.casts[id] ?? 0;
    const b = bot.casts[id] ?? 0;
    if (Math.abs(b - you) >= 2 && (worst === null || Math.abs(b - you) > Math.abs(worst.bot - worst.you))) worst = { id, you, bot: b };
  }
  if (worst !== null) {
    out.push({
      kind: 'warn',
      text: `You cast ${name(worst.id)} ${formatInt(worst.you)} ${worst.you === 1 ? 'time' : 'times'}; the bot cast it ${formatInt(worst.bot)} ${worst.bot === 1 ? 'time' : 'times'}.`,
    });
  } else {
    out.push({ kind: 'good', text: 'Your cast counts matched the bot’s within one cast per spell.' });
  }
  const matched = gaps.filter((g) => Math.abs(g.gap) < 0.03 && g.bot > 0);
  if (matched.length > 0) {
    out.push({
      kind: 'good',
      text: `${matched.map((g) => name(g.id)).join(' and ')} uptime matched the bot’s (within 3 points).`,
    });
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// The combat log
// ---------------------------------------------------------------------------

export type LogKind = 'damage' | 'cast' | 'aura' | 'mana';

export const LOG_KINDS: readonly LogKind[] = ['damage', 'cast', 'aura', 'mana'];

export interface LogRow {
  /** Index in the log (stable key). */
  index: number;
  atMs: number;
  kind: LogKind;
  text: string;
  amount: number | null;
  crit: boolean;
}

function kindOf(type: LogEvent['type']): LogKind {
  switch (type) {
    case 'damage':
    case 'tick':
    case 'miss':
      return 'damage';
    case 'aura-apply':
    case 'aura-fade':
      return 'aura';
    case 'mana':
      return 'mana';
    default:
      return 'cast';
  }
}

/** One line per log entry, in words ("Shadow Bolt crit", "Immolate faded"). */
export function logRows(log: readonly LogEvent[], name: (id: string) => string): LogRow[] {
  return log.map((e, index) => {
    const who = e.spellId !== undefined ? name(e.spellId) : e.auraId !== undefined ? name(e.auraId) : '';
    let text: string;
    switch (e.type) {
      case 'damage':
        text = `${who} ${e.crit ? 'crit' : 'hit'}`;
        break;
      case 'tick':
        text = `${e.auraId !== undefined ? name(e.auraId) : who} tick`;
        break;
      case 'miss':
        text = `${who} missed`;
        break;
      case 'cast-start':
        text = `${who} cast started`;
        break;
      case 'cast-complete':
        text = `${who} cast`;
        break;
      case 'cast-cancel':
        text = `${who} cast cancelled`;
        break;
      case 'impact':
        text = `${who} landed`;
        break;
      case 'queue':
        text = `${who} queued`;
        break;
      case 'queue-drop':
        text = `${who} dropped from the queue${e.reason ? ` (${e.reason})` : ''}`;
        break;
      case 'aura-apply':
        text = `${e.auraId !== undefined ? name(e.auraId) : who} applied`;
        break;
      case 'aura-fade':
        text = `${e.auraId !== undefined ? name(e.auraId) : who} faded`;
        break;
      case 'mana':
        text = who ? `Mana from ${who}` : 'Mana';
        break;
      default:
        text = e.type;
    }
    return { index, atMs: e.atMs, kind: kindOf(e.type), text, amount: e.amount ?? null, crit: e.crit === true };
  });
}

/** The rows of `kind` (null: all) whose text contains `query` (case-insensitive, trimmed). */
export function filterLog(rows: readonly LogRow[], query: string, kind: LogKind | null): LogRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (kind === null || r.kind === kind) && (q === '' || r.text.toLowerCase().includes(q)));
}

// ---------------------------------------------------------------------------
// Simulator: where your fight sits
// ---------------------------------------------------------------------------

/**
 * The share (0..1) of the simulated fights below `value`, read from the histogram (a bin counts in
 * part, linearly, when `value` falls inside it). Approximate: the bins are all that is kept.
 */
export function shareBelow(histogram: { binStart: number; binWidth: number; counts: readonly number[] }, value: number): number {
  const { binStart, binWidth, counts } = histogram;
  const total = counts.reduce((a, c) => a + c, 0);
  if (total === 0) return 0;
  if (binWidth === 0) return value > binStart ? 1 : 0;
  let below = 0;
  counts.forEach((c, i) => {
    const lo = binStart + i * binWidth;
    const hi = lo + binWidth;
    if (value >= hi) below += c;
    else if (value > lo) below += (c * (value - lo)) / binWidth;
  });
  return below / total;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
