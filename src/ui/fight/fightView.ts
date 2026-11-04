// The Fight screen's view-models (UI redesign Task 2): pure functions of the fight's log, snapshot
// and data. No React, no DOM, no clock: every time comes from the snapshot or the log.

import type { PriorityStep, SpecData } from '../../data/types';
import type { AuraView, LogEvent, School, SimSnapshot, SpellDef } from '../../engine/types';
import { buffTimeText, isExpiring } from '../buffsView';
import { formatInt } from '../format';

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/**
 * Fight time as "m:ss.s" ("0:34.2", tenths rounded like `secondsText`); `wholeSeconds` drops the
 * tenths ("1:00").
 */
export function clockText(ms: number, wholeSeconds = false): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const seconds = Math.floor(rest / 10);
  const ss = String(seconds).padStart(2, '0');
  return wholeSeconds ? `${minutes}:${ss}` : `${minutes}:${ss}.${rest % 10}`;
}

// ---------------------------------------------------------------------------
// Damage meter (Details-style)
// ---------------------------------------------------------------------------

export interface MeterRow {
  /** The spell id (or, for a tick without a source spell, the aura id). */
  id: string;
  name: string;
  icon: string | null;
  iconKind: 'spell' | 'item';
  school: School | null;
  total: number;
  /** `total` per second of fight time so far (0 before any time has passed). */
  dps: number;
  /** Share of all damage, 0..1. */
  share: number;
}

/** What the meter needs to name its rows (the running fight's spec). */
export type MeterNames = Pick<SpecData, 'spells' | 'auras'>;

/**
 * Damage per spell from the log up to `nowMs`: every `damage` and `tick` entry's amount, keyed by
 * its spell id (a tick without one by its aura id). The rows sum to the snapshot's `damageTotal`
 * (the engine adds exactly these amounts). Largest first; ties keep the order of first damage.
 * `itemIcons`: the ids whose icon is an item icon (the fight's `itemIcons`).
 */
export function meterRows(
  log: readonly LogEvent[],
  nowMs: number,
  names?: MeterNames,
  itemIcons: ReadonlySet<string> = new Set(),
): MeterRow[] {
  const totals = new Map<string, number>();
  for (const e of log) {
    if (e.atMs > nowMs) break;
    if ((e.type !== 'damage' && e.type !== 'tick') || e.amount === undefined) continue;
    const id = e.spellId ?? e.auraId ?? '?';
    totals.set(id, (totals.get(id) ?? 0) + e.amount);
  }
  let sum = 0;
  for (const v of totals.values()) sum += v;
  const seconds = nowMs / 1000;
  const rows: MeterRow[] = [];
  for (const [id, total] of totals) {
    const spell = names?.spells.find((s) => s.id === id);
    const aura = spell ? undefined : names?.auras.find((a) => a.id === id);
    rows.push({
      id,
      name: spell?.name ?? aura?.name ?? id,
      icon: spell?.icon ?? aura?.icon ?? null,
      iconKind: itemIcons.has(id) ? 'item' : 'spell',
      school: spell?.school ?? aura?.tick?.school ?? null,
      total,
      dps: seconds > 0 ? total / seconds : 0,
      share: sum > 0 ? total / sum : 0,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

/** The meter's visible rows: the top `n`, the rest summed into one "Other" row (spec §6). */
export function topRows(rows: readonly MeterRow[], n = 5): MeterRow[] {
  if (rows.length <= n) return [...rows];
  const rest = rows.slice(n);
  const total = rest.reduce((s, r) => s + r.total, 0);
  return [
    ...rows.slice(0, n),
    {
      id: 'other',
      name: 'Other',
      icon: null,
      iconKind: 'spell',
      school: null,
      total,
      dps: rest.reduce((s, r) => s + r.dps, 0),
      share: rest.reduce((s, r) => s + r.share, 0),
    },
  ];
}

// ---------------------------------------------------------------------------
// "So far": active time and DoT uptimes
// ---------------------------------------------------------------------------

export interface SoFarRow {
  label: string;
  /** 0..1, or null before any time has passed. */
  value: number | null;
}

/**
 * The dock's "So far" lines, from the log up to `nowMs`:
 * - "Active time (GCD)": the share of fight time spent casting or on the GCD (each on-GCD spell
 *   starts a GCD of the snapshot's current length `gcdMs` at its cast start, or at its use for an
 *   instant; the union of those windows and the cast windows, so overlaps count once);
 * - "<DoT> uptime" for every aura of the spec with a tick that a spell applies and that has been
 *   up in this fight: the share of fight time it was up (`aura-apply` to `aura-fade`; a refresh
 *   keeps it up). DoTs the rotation never applied are left out.
 */
export function soFar(snapshot: Pick<SimSnapshot, 'nowMs' | 'gcdMs'>, log: readonly LogEvent[], spec: Pick<SpecData, 'spells' | 'auras'>): SoFarRow[] {
  const { nowMs, gcdMs } = snapshot;
  const spells = new Map<string, SpellDef>(spec.spells.map((s) => [s.id, s]));
  const windows: [number, number][] = [];
  const casting = new Map<string, number>();
  const dots = spec.auras.filter((a) => a.tick !== undefined && spec.spells.some((s) => s.applyAura?.auraId === a.id));
  const upSince = new Map<string, number>();
  const upMs = new Map<string, number>();
  for (const e of log) {
    if (e.atMs > nowMs) break;
    const spell = e.spellId === undefined ? undefined : spells.get(e.spellId);
    if (e.type === 'cast-start' && spell) {
      casting.set(spell.id, e.atMs);
      if (spell.onGcd) windows.push([e.atMs, e.atMs + gcdMs]);
    } else if ((e.type === 'cast-complete' || e.type === 'cast-cancel') && spell) {
      const start = casting.get(spell.id);
      if (start !== undefined) {
        casting.delete(spell.id);
        windows.push([start, e.atMs]);
      } else if (e.type === 'cast-complete' && spell.onGcd && !spell.item) {
        windows.push([e.atMs, e.atMs + gcdMs]); // an instant: no cast-start
      }
    } else if (e.type === 'aura-apply' && e.auraId !== undefined && !upSince.has(e.auraId)) {
      upSince.set(e.auraId, e.atMs);
    } else if (e.type === 'aura-fade' && e.auraId !== undefined) {
      const since = upSince.get(e.auraId);
      if (since !== undefined) {
        upSince.delete(e.auraId);
        upMs.set(e.auraId, (upMs.get(e.auraId) ?? 0) + e.atMs - since);
      }
    }
  }
  for (const start of casting.values()) windows.push([start, nowMs]);
  for (const [id, since] of upSince) upMs.set(id, (upMs.get(id) ?? 0) + nowMs - since);
  const share = (ms: number) => (nowMs > 0 ? Math.min(1, Math.max(0, ms / nowMs)) : null);
  return [
    { label: 'Active time (GCD)', value: share(unionMs(windows, nowMs)) },
    ...dots.filter((a) => upMs.has(a.id)).map((a) => ({ label: `${a.name} uptime`, value: share(upMs.get(a.id) ?? 0) })),
  ];
}

/** Total length of the union of `[start, end)` windows, clipped to `[0, limit]`. */
function unionMs(windows: [number, number][], limit: number): number {
  const sorted = windows.map(([a, b]): [number, number] => [Math.max(0, a), Math.min(limit, b)]).filter(([a, b]) => b > a);
  sorted.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of sorted) {
    if (a >= end) {
      total += b - a;
      end = b;
    } else if (b > end) {
      total += b - end;
      end = b;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// "Next by the script" (coach)
// ---------------------------------------------------------------------------

export type NextState = 'now' | 'cooldown' | 'nomana' | 'missing' | 'skip' | 'wait';

export interface NextRow {
  index: number;
  spellId: string;
  label: string;
  /** The step's own explanation (a tooltip). */
  hint: string;
  /** Why the step is or is not the bot's choice now. */
  state: NextState;
  /** A short note: "now", "cd 12 s", "mana", the step's hint. */
  note: string;
}

type CastCheckSnapshot = Pick<SimSnapshot, 'phase' | 'cooldownRemainingMs' | 'mana' | 'spells' | 'targetAuras' | 'queuedSpellId'>;

/** Why a step's spell could not be pressed now, ignoring the cast in progress and the GCD (null: it could). */
function blocker(step: PriorityStep, s: CastCheckSnapshot, spells: ReadonlyMap<string, SpellDef>): Exclude<NextState, 'now' | 'skip' | 'wait'> | null {
  if ((s.cooldownRemainingMs[step.spellId] ?? 0) > 0) return 'cooldown';
  const def = spells.get(step.spellId);
  if (def?.requiresTargetAura && s.targetAuras[def.requiresTargetAura] === undefined) return 'missing';
  const cost = s.spells[step.spellId]?.manaCost ?? def?.manaCost ?? 0;
  if (s.mana < cost) return 'nomana';
  return null;
}

/**
 * The index of the step the bot (`runBot`, src/bot/bot.ts) would press at this snapshot once the
 * cast in progress and the GCD are over: the first step whose `when` holds and whose spell is off
 * cooldown, has its required target aura and its mana cost (the engine's other checks, busy and
 * gcd, reject every spell alike). A `wait` step whose `when` holds ends the walk with no press
 * (not in `ready`, as in the bot); the spell already queued counts as the press. -1: none.
 */
export function nextUp(priority: readonly PriorityStep[], snapshot: CastCheckSnapshot, spells: readonly SpellDef[] = []): number {
  const byId = new Map(spells.map((s) => [s.id, s]));
  for (let i = 0; i < priority.length; i++) {
    const step = priority[i]!;
    if (step.when && !step.when(snapshot as SimSnapshot)) continue;
    if (step.kind === 'wait') {
      if (snapshot.phase === 'ready') continue;
      return -1;
    }
    if (step.spellId === snapshot.queuedSpellId) return i;
    if (blocker(step, snapshot, byId) === null) return i;
  }
  return -1;
}

/** The first `n` steps with their state now, for the dock's list (the bot's pick marked 'now'). */
export function nextUpRows(priority: readonly PriorityStep[], snapshot: CastCheckSnapshot, spells: readonly SpellDef[], n = 4): NextRow[] {
  const byId = new Map(spells.map((s) => [s.id, s]));
  const pick = nextUp(priority, snapshot, spells);
  const rows: NextRow[] = [];
  for (let i = 0; i < priority.length && rows.length < n; i++) {
    const step = priority[i]!;
    const wanted = !step.when || step.when(snapshot as SimSnapshot);
    let state: NextState;
    let note: string;
    if (i === pick) {
      state = 'now';
      note = 'now';
    } else if (step.kind === 'wait') {
      state = 'wait';
      note = wanted ? 'wait' : step.hint;
    } else if (!wanted) {
      state = 'skip';
      note = 'not now';
    } else {
      const why = blocker(step, snapshot, byId) ?? 'skip';
      state = why;
      const cd = snapshot.cooldownRemainingMs[step.spellId] ?? 0;
      note = why === 'cooldown' ? `cd ${Math.ceil(cd / 1000)} s` : why === 'nomana' ? 'no mana' : why === 'missing' ? 'needs aura' : 'ready';
    }
    rows.push({ index: i, spellId: step.spellId, label: step.label, hint: step.hint, state, note });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Combat log ticker
// ---------------------------------------------------------------------------

export interface TickerRow {
  key: string;
  atMs: number;
  /** The spell or aura named first, coloured by `tone`. */
  subject: string;
  tone: 'shadow' | 'fire' | 'gold' | 'mana' | 'plain';
  /** The rest of the line ("crits for 4,812"). */
  text: string;
}

const TONES: Partial<Record<School, TickerRow['tone']>> = { shadow: 'shadow', fire: 'fire' };

/**
 * The last `n` readable log lines, newest first: cast starts, item uses, hits and crits, misses,
 * ticks, mana gains, and auras gained by the player (procs and buffs). Queue bookkeeping, impacts,
 * cast completions of cast-time spells and fades are left out.
 */
export function logTicker(log: readonly LogEvent[], n: number, names: MeterNames): TickerRow[] {
  const spells = new Map(names.spells.map((s) => [s.id, s]));
  const auras = new Map(names.auras.map((a) => [a.id, a]));
  const rows: TickerRow[] = [];
  for (let i = log.length - 1; i >= 0 && rows.length < n; i--) {
    const e = log[i]!;
    const spell = e.spellId === undefined ? undefined : spells.get(e.spellId);
    const aura = e.auraId === undefined ? undefined : auras.get(e.auraId);
    const tone = (spell && TONES[spell.school]) ?? (aura?.tick && TONES[aura.tick.school]) ?? 'plain';
    const key = `${i}`;
    const amount = formatInt(e.amount ?? 0);
    switch (e.type) {
      case 'cast-start':
        if (spell) rows.push({ key, atMs: e.atMs, subject: spell.name, tone, text: 'cast started' });
        break;
      case 'cast-complete':
        if (spell?.item) rows.push({ key, atMs: e.atMs, subject: spell.name, tone: 'gold', text: 'used' });
        break;
      case 'damage':
        if (spell) rows.push({ key, atMs: e.atMs, subject: spell.name, tone, text: `${e.crit ? 'crits' : 'hits'} for ${amount}` });
        break;
      case 'miss':
        if (spell) rows.push({ key, atMs: e.atMs, subject: spell.name, tone, text: 'misses' });
        break;
      case 'tick':
        rows.push({ key, atMs: e.atMs, subject: aura?.name ?? spell?.name ?? '?', tone, text: `ticks for ${amount}` });
        break;
      case 'mana':
        if ((e.amount ?? 0) > 0) rows.push({ key, atMs: e.atMs, subject: spell?.name ?? 'Mana', tone: 'mana', text: `+${amount} mana` });
        break;
      case 'aura-apply':
        if (aura && !aura.hidden && aura.tick === undefined && !aura.damageTakenMult && e.atMs > 0) {
          rows.push({ key, atMs: e.atMs, subject: aura.name, tone: 'gold', text: 'gained' });
        }
        break;
      default:
        break;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Target debuffs
// ---------------------------------------------------------------------------

export interface AuraIconView {
  id: string;
  name: string;
  icon: string | null;
  iconKind?: 'spell' | 'item';
  /** Time text under the icon ("4.1s", "26s"), or null for none. */
  time: string | null;
  /** Stacks or charges in the corner, or null. */
  count: number | null;
  /** The accessible name ("Immolate, 4.1s left, 3 charges"). */
  label: string;
  /** Tooltip. */
  title: string;
  variant: 'mine' | 'other' | 'upcoming' | 'passive';
  expiring: boolean;
}

/**
 * The target's debuffs as icons: the player's own first (red edge, time and charges), then the
 * others' (raid debuffs the fight puts on the target: smaller, after a separator). Time left is
 * clamped to the fight's time left (a whole-fight raid debuff shows the time to the end).
 */
export function targetDebuffViews(
  targetAuras: Readonly<Record<string, AuraView>>,
  spec: Pick<SpecData, 'auras' | 'spells'>,
  others: ReadonlySet<string>,
  fightRemainingMs: number,
  phase: SimSnapshot['phase'],
): AuraIconView[] {
  const mine: AuraIconView[] = [];
  const theirs: AuraIconView[] = [];
  for (const view of Object.values(targetAuras)) {
    const def = spec.auras.find((a) => a.id === view.auraId);
    const base = def?.name ?? view.auraId;
    // An own aura that a raid debuff replaces multiplies by 1 (rulings S1, S2): kept, marked.
    const name = def?.damageTakenMult?.mult === 1 ? `${base} (no extra effect)` : base;
    const remaining = Math.max(0, Math.min(view.remainingMs, fightRemainingMs));
    const time = buffTimeText(remaining);
    const count = view.stacks > 1 ? view.stacks : view.charges > 0 ? view.charges : null;
    const countWords = count === null ? '' : view.stacks > 1 ? `, ${count} stacks` : `, ${count} ${count === 1 ? 'charge' : 'charges'}`;
    const other = others.has(view.auraId);
    (other ? theirs : mine).push({
      id: view.auraId,
      name,
      icon: def?.icon ?? null,
      time: other ? null : time,
      count,
      label: `${name}, ${time} left${countWords}`,
      title: count === null ? name : `${name} (${count})`,
      variant: other ? 'other' : 'mine',
      expiring: !other && phase === 'running' && isExpiring(remaining),
    });
  }
  return [...mine, ...theirs];
}

// ---------------------------------------------------------------------------
// What the DPS leaves out
// ---------------------------------------------------------------------------

/** What the trainer's DPS leaves out (full list: docs/data-sources.md, "What the DPS excludes"). */
export const DPS_NOTE_NO_BUFFS = 'No raid buffs, consumables or trinket effects — approximate (see docs/data-sources.md)';
export const DPS_NOTE_WITH_BUFFS =
  'Includes the enabled buffs; trinket/proc effects not selected are excluded — approximate (see docs/data-sources.md)';

/** The note for a fight whose setup enables `enabledBuffs`. */
export function dpsNoteText(enabledBuffs: readonly string[]): string {
  return enabledBuffs.length === 0 ? DPS_NOTE_NO_BUFFS : DPS_NOTE_WITH_BUFFS;
}

/** The ended fight's names as tags ("Setup: Raid as in my log", "Gear: …", "Talents: …"). */
export function playedWithTags(labels: { setupPreset: string; gear: string; talents: string }): string[] {
  return [`Setup: ${labels.setupPreset}`, `Gear: ${labels.gear}`, `Talents: ${labels.talents}`];
}
