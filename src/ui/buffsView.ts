// The "Your buffs" panel's view model (player buffs panel, Task 1): pure functions that turn the
// snapshot's self auras, the fight's scheduled auras and the enabled catalog entries into the
// panel's three lists, plus the bar's total-time bookkeeping. No React, no DOM, no clock: every
// time comes from the snapshot or the applied setup.

import type { BuffDef, SpecData } from '../data/types';
import type { AuraDef, AuraView, ScheduledAura } from '../engine/types';
import { remainingText, secondsText } from './format';

/** Where an icon file lives: public/icons/spells/ or public/icons/items/ (`SpellIcon` `kind`). */
export type IconKind = 'spell' | 'item';

/** An aura on the player now. */
export interface ActiveBuffView {
  auraId: string;
  /** The catalog entry's name when the aura comes from one, else the AuraDef's name, else the id. */
  name: string;
  /** Icon file name; null when the aura is unknown (the tile shows initials). */
  icon: string | null;
  /** 'item' when the icon is an item icon (public/icons/items/: a gear item effect's aura); absent: a spell icon. */
  iconKind?: 'item';
  /** The catalog entry's description, else the name. */
  description: string;
  /** Stacks (when more than one), else charges (when any), else null. */
  count: number | null;
  /** Time left, never more than the fight's time left and never negative. */
  remainingMs: number;
  /** The bar's total (filled by `useAuraTotals`, not by `buildBuffViews`). */
  totalMs?: number;
}

/** A scheduled self aura that has not applied yet. */
export interface UpcomingBuffView {
  auraId: string;
  name: string;
  icon: string | null;
  iconKind?: 'item';
  /** Fight time it applies at (the engine's rule: floored, at least 0). */
  startsAtMs: number;
  /** `startsAtMs - nowMs`; before the start (`ready`) the time does not run, so it is `startsAtMs`. */
  inMs: number;
}

/** An enabled setup buff with no duration: it only changes stats or modifiers for the whole fight. */
export interface PermanentBuffView {
  id: string;
  name: string;
  icon: string;
  iconKind?: 'item';
  description: string;
}

export interface BuffViews {
  active: ActiveBuffView[];
  upcoming: UpcomingBuffView[];
  permanent: PermanentBuffView[];
}

export interface BuffViewInput {
  /** `SimSnapshot.selfAuras` (already without `hidden` auras), in the tracker's order. */
  selfAuras: Record<string, AuraView>;
  /** The running fight's spec (its auras: names and icons). */
  spec: SpecData;
  /**
   * The fight's catalog (the gear-independent entries and the worn gear's derived ones,
   * `setupCatalogFor`): names, descriptions and icon kinds of the auras that come from an entry.
   */
  catalog: readonly BuffDef[];
  /** The running fight's `AppliedSetup.sim.scheduledAuras`. */
  scheduled: readonly ScheduledAura[];
  /** The running fight's `SetupConfig.enabledBuffs`. */
  enabledBuffIds: readonly string[];
  nowMs: number;
  phase: 'ready' | 'running' | 'ended';
  fightDurationMs: number;
}

/** An entry below this time left (strictly) is "expiring": it pulses. */
export const EXPIRING_BELOW_MS = 5000;

export function isExpiring(remainingMs: number): boolean {
  return remainingMs < EXPIRING_BELOW_MS;
}

/**
 * The catalog entry each self aura comes from: its `selfAura` (Heroism, the Icon's and the potion's
 * aura, which an item `action` applies), the self aura its `action` applies, and its visible helper
 * `auras` (the Band's proc). The first entry in catalog order wins.
 */
export function auraSources(catalog: readonly BuffDef[]): Map<string, BuffDef> {
  const out = new Map<string, BuffDef>();
  const add = (auraId: string | undefined, b: BuffDef) => {
    if (auraId !== undefined && !out.has(auraId)) out.set(auraId, b);
  };
  for (const b of catalog) {
    const e = b.effect;
    add(e.selfAura?.id, b);
    if (e.action?.applyAura?.on === 'self') add(e.action.applyAura.auraId, b);
    for (const a of e.auras ?? []) if (!a.hidden) add(a.id, b);
  }
  return out;
}

interface AuraLabel {
  def: AuraDef | undefined;
  name: string;
  icon: string | null;
  /** `{ iconKind: 'item' }` for an item icon, else `{}` (a spell icon). */
  kind: { iconKind?: 'item' };
  description: string;
}

const iconKindOf = (b: BuffDef | undefined): { iconKind?: 'item' } => (b?.iconKind === 'item' ? { iconKind: 'item' } : {});

function labeller(spec: SpecData, catalog: readonly BuffDef[]): (auraId: string) => AuraLabel {
  const sources = auraSources(catalog);
  const defs = new Map(spec.auras.map((a) => [a.id, a]));
  return (auraId) => {
    const def = defs.get(auraId);
    const buff = sources.get(auraId);
    const name = buff?.name ?? def?.name ?? auraId;
    return { def, name, icon: def?.icon ?? buff?.icon ?? null, kind: iconKindOf(buff), description: buff?.description ?? name };
  };
}

/**
 * Stat-only setup buffs: enabled entries with no `timed`, no `action`, no `selfAura` or
 * `targetAura`, and no helper `auras` or `hooks` (so not the Band, whose proc shows as an active
 * aura). In the real catalog: the raid, party and individual buffs and the consumables that only
 * change stats (flasks, elixirs, food, oils). Catalog order.
 */
function isPermanent(b: BuffDef): boolean {
  const e = b.effect;
  return (
    b.timed === undefined &&
    e.action === undefined &&
    e.selfAura === undefined &&
    e.targetAura === undefined &&
    (e.auras === undefined || e.auras.length === 0) &&
    e.hooks === undefined
  );
}

/**
 * The scheduled entries the engine will apply, as `planScheduledAuras` (src/engine/sim.ts) keeps
 * them: finite `atMs` floored and raised to 0, not after the fight's end, and a valid duration
 * override if any.
 */
function plannedAtMs(e: ScheduledAura, fightDurationMs: number): number | null {
  if (!Number.isFinite(e.atMs)) return null;
  const atMs = Math.max(0, Math.floor(e.atMs));
  if (atMs > fightDurationMs) return null;
  if (e.durationMs !== undefined && !(Number.isFinite(e.durationMs) && Math.floor(e.durationMs) > 0)) return null;
  return atMs;
}

/**
 * The panel's three lists.
 * - `active`: every self aura in the tracker's order (first applied first; a refresh keeps its
 *   place), time left clamped to the fight's end.
 * - `upcoming`: `on: 'self'` scheduled entries that have not applied yet and start before the
 *   fight's end (one at the end has no effect: never upcoming, and not shown once applied), sorted
 *   by start (ties in setup order). Running: `atMs > nowMs` (an entry at `nowMs` has applied: the engine runs it when
 *   it reaches that ms, so it is active in the same snapshot). Before the start (`ready`) every
 *   entry, those at 0 included (`start()` applies them); after the end, none.
 * - `permanent`: the enabled stat-only buffs (`isPermanent`).
 */
export function buildBuffViews(input: BuffViewInput): BuffViews {
  const { selfAuras, spec, catalog, scheduled, enabledBuffIds, nowMs, phase, fightDurationMs } = input;
  const label = labeller(spec, catalog);
  const fightLeftMs = Math.max(0, fightDurationMs - nowMs);

  // Scheduled self auras that apply at the fight's last ms: the engine applies them as the fight
  // ends, so they have no effect (the Setup panel warns so) and are never shown, not even in the
  // ended fight's frozen list. Aura id -> the duration such an application starts with.
  const atEnd = new Map<string, number>();
  for (const e of scheduled) {
    if (e.on === 'self' && plannedAtMs(e, fightDurationMs) === fightDurationMs) {
      const lastsMs = e.durationMs !== undefined ? Math.floor(e.durationMs) : label(e.auraId).def?.durationMs;
      if (lastsMs !== undefined) atEnd.set(e.auraId, lastsMs);
    }
  }

  const active: ActiveBuffView[] = [];
  for (const view of Object.values(selfAuras)) {
    const { def, name, icon, kind, description } = label(view.auraId);
    if (def?.hidden) continue; // the snapshot leaves them out already
    const endLasts = atEnd.get(view.auraId);
    if (phase === 'ended' && endLasts !== undefined && view.remainingMs >= endLasts) continue; // applied at the end
    const count = view.stacks > 1 ? view.stacks : view.charges > 0 ? view.charges : null;
    const remainingMs = Math.max(0, Math.min(view.remainingMs, fightLeftMs));
    active.push({ auraId: view.auraId, name, icon, ...kind, description, count, remainingMs });
  }

  const upcoming: UpcomingBuffView[] = [];
  if (phase !== 'ended') {
    for (const e of scheduled) {
      if (e.on !== 'self') continue;
      const atMs = plannedAtMs(e, fightDurationMs);
      if (atMs === null || atMs >= fightDurationMs || (phase === 'running' && atMs <= nowMs)) continue; // at the end: no effect
      const { def, name, icon, kind } = label(e.auraId);
      if (def?.hidden) continue;
      upcoming.push({ auraId: e.auraId, name, icon, ...kind, startsAtMs: atMs, inMs: phase === 'ready' ? atMs : atMs - nowMs });
    }
    upcoming.sort((a, b) => a.startsAtMs - b.startsAtMs); // stable: ties keep the setup order
  }

  const enabled = new Set(enabledBuffIds);
  const permanent: PermanentBuffView[] = catalog
    .filter((b) => enabled.has(b.id) && isPermanent(b))
    .map((b) => ({ id: b.id, name: b.name, icon: b.icon, ...iconKindOf(b), description: b.description }));

  return { active, upcoming, permanent };
}

/** The time left on an entry: one decimal below 10 s ("4.3s", rounded up), else `remainingText` ("23s", "2m"). */
export function buffTimeText(ms: number): string {
  const tenths = Math.ceil(Math.max(0, ms) / 100);
  return tenths < 100 ? `${secondsText(tenths * 100)}s` : remainingText(ms);
}

/** The time left in words for the entry's label: whole seconds rounded up, minutes from 100 s on (as `remainingText`). */
export function timeLeftWords(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  if (s >= 100) return `${Math.ceil(s / 60)} minutes left`;
  return `${s} ${s === 1 ? 'second' : 'seconds'} left`;
}

/** The bar's bookkeeping for one aura: the total of the current application and the last time left seen. */
export interface AuraTotal {
  totalMs: number;
  lastMs: number;
}

export type AuraTotals = ReadonlyMap<string, AuraTotal>;

/**
 * The bar's total per aura (no engine change: the engine does not report an application's full
 * duration). The total is the largest time left seen since the aura was last applied: a new aura
 * (absent from `prev`) starts at its time left; a refresh, seen as a time left that rose since the
 * last snapshot, restarts it; an aura no longer active is dropped, so when it returns it is new.
 *
 * Limits (spec §3 and §5): an aura that applied between two frames starts its bar from the first
 * time seen, up to a frame (about 16 ms; at most 100 ms on a slow frame) short of its duration; a
 * refresh shorter than the time still left is not seen as a refresh (the data has none: refreshes
 * give the full duration), so the bar keeps the old total, still within [0, 1].
 *
 * Idempotent: the same `active` twice gives an equal result (React may render twice).
 */
export function nextTotals(prev: AuraTotals, active: readonly ActiveBuffView[]): AuraTotals {
  const next = new Map<string, AuraTotal>();
  for (const a of active) {
    const p = prev.get(a.auraId);
    const restarted = p === undefined || a.remainingMs > p.lastMs;
    next.set(a.auraId, {
      totalMs: restarted ? a.remainingMs : Math.max(p.totalMs, a.remainingMs),
      lastMs: a.remainingMs,
    });
  }
  return next;
}

/** The bar's filled part, in [0, 1]: full with no total yet, empty for a zero total. */
export function barFraction(remainingMs: number, totalMs: number | undefined): number {
  if (totalMs === undefined) return 1;
  if (!(totalMs > 0)) return 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}
