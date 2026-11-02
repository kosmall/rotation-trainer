// Combat text HUD: turns new combat-log entries and snapshot changes into HUD events (scrolling
// combat text Task 1, design spec §3). Pure and framework-free (no React, no DOM): the HUD only
// reads the fight; nothing here changes the simulation. Rules and the show/skip table:
// docs/data-sources.md, "Part G: combat text HUD".

import type { AuraDef, LogEvent, LogType, ScheduledAura, SimSnapshot, SpellDef } from '../engine/types';
import type { BuffDef } from '../data/types';
import { SCHOOL_COLORS } from './format';
import { formatHudText, HUD_COLORS, type HudKind } from './hudFormat';
import type { HudSettings } from './hudSettings';

export type { HudKind } from './hudFormat';

/**
 * Where a text floats: Outgoing (the player's damage, over the target) or Notifications (buffs,
 * procs, mana, items, ready, low mana; over the player). The spec's Incoming area has nothing to
 * show (the target dummy never hits), so the model has no events for it.
 */
export type HudArea = 'outgoing' | 'notifications';

export interface HudEvent {
  /** Unique and deterministic: a counter in the cursor (never reset, so keys stay unique across fights). */
  id: number;
  /** Fight time of the log entry (or of the snapshot for ready / low mana). */
  atMs: number;
  area: HudArea;
  kind: HudKind;
  text: string;
  color: string;
  /** Crits and procs: never dropped by the queue's cap. */
  sticky: boolean;
  icon?: string;
  /** Where `icon` lives (`SpellIcon` kind): an item icon or a spell icon. */
  iconKind?: 'spell' | 'item';
  /** Set by `HudQueue` when the text is shown (0 from extraction). */
  lane: number;
  /** Damage or mana amount (the queue sums merged texts). */
  amount?: number;
  /** Spell, aura or item name (the text is rebuilt from it after a merge). */
  name?: string;
  /** Merge key: `tick:<spell or aura id>` for ticks, `mana` for mana gains. */
  key?: string;
}

/** What the HUD knows about a spell. */
export interface HudSpellInfo {
  name: string;
  icon: string;
  iconKind: 'spell' | 'item';
  /** School colour (`SCHOOL_COLORS`). */
  color: string;
  /** An item action (`SpellDef.item`): its use is an item notification. */
  item: boolean;
}

/** What the HUD knows about an aura. */
export interface HudAuraInfo {
  name: string;
  icon: string;
  iconKind: 'spell' | 'item';
  /** School colour of its DoT tick (the default text colour without one). */
  color: string;
  /** Bookkeeping aura (`AuraDef.hidden`): never a text. */
  hidden: boolean;
  /** Which unit it goes on (see `buildHudContext`). */
  unit: 'self' | 'target';
  /** A proc: a visible self aura that no spell applies and the fight does not schedule (a hook applies it). */
  proc: boolean;
  /**
   * Put on by the fight at 0 for the whole fight (a scheduled aura at 0 with no duration override:
   * raid debuffs on the target, pre-pull self buffs): its `aura-apply` at 0 is not a text.
   */
  permanentAtStart: boolean;
}

export interface HudContext {
  spells: ReadonlyMap<string, HudSpellInfo>;
  auras: ReadonlyMap<string, HudAuraInfo>;
  /** Spell ids whose cooldown becoming ready is a notification (item actions, long cooldowns). */
  readyIds: readonly string[];
}

/**
 * Non-item spells with at least this cooldown get a "ready" notification (Curse of Doom, 60 s);
 * shorter ones (Shadowburn 15 s, Conflagrate 10 s) would only add noise. Item actions always do.
 */
export const HUD_READY_MIN_COOLDOWN_MS = 30000;

/** After "Low Mana", mana must climb this many percentage points above the threshold to re-arm it. */
export const LOW_MANA_REARM_PCT = 5;

/** Default text colour of an aura without a DoT school. */
const AURA_DEFAULT_COLOR = '#e6dcc8';

const ITEM_ICON_ID = /^(?:use-item-|item-buff:|item-icd:)/;

/**
 * The HUD context of a fight, built from its data (no hook is ever run):
 * - spells: name, icon, school colour, whether it is an item action;
 * - auras: `unit` = the `on` of its first scheduled entry, else of the first spell applying it
 *   (`applyAura`), else 'target' for an aura with a DoT tick or a damage-taken multiplier
 *   (hook-applied target auras such as Shadow Vulnerability), else 'self';
 *   `proc` = a visible self aura that no spell applies and no scheduled entry puts on: only a hook
 *   can apply it (set bonus procs, gear procs `item-buff:<id>`, the Band). Item-use buffs (applied
 *   by their item action) and timed buffs (Heroism) are not procs;
 *   `permanentAtStart` = scheduled at 0 (or before) with no duration override;
 * - icon kind 'item' for the ids `catalog` gives an item icon (`BuffDef.iconKind`) and the derived
 *   gear ids (`use-item-`, `item-buff:`, `item-icd:`);
 * - readyIds: item actions and spells with `cooldownMs >= HUD_READY_MIN_COOLDOWN_MS`.
 */
export function buildHudContext(input: {
  spells: readonly SpellDef[];
  auras: readonly AuraDef[];
  scheduledAuras?: readonly ScheduledAura[];
  catalog?: readonly BuffDef[];
}): HudContext {
  const scheduled = input.scheduledAuras ?? [];
  const itemIconIds = new Set<string>();
  for (const b of input.catalog ?? []) {
    if (b.iconKind !== 'item') continue;
    const e = b.effect;
    for (const id of [e.action?.id, e.selfAura?.id, e.targetAura?.id, ...(e.auras ?? []).map((a) => a.id)]) {
      if (id !== undefined) itemIconIds.add(id);
    }
  }
  const iconKind = (id: string): 'spell' | 'item' => (itemIconIds.has(id) || ITEM_ICON_ID.test(id) ? 'item' : 'spell');

  const spells = new Map<string, HudSpellInfo>();
  const readyIds: string[] = [];
  for (const s of input.spells) {
    if (spells.has(s.id)) continue;
    spells.set(s.id, { name: s.name, icon: s.icon, iconKind: iconKind(s.id), color: SCHOOL_COLORS[s.school] ?? AURA_DEFAULT_COLOR, item: s.item === true });
    if (s.item === true || s.cooldownMs >= HUD_READY_MIN_COOLDOWN_MS) readyIds.push(s.id);
  }

  const auras = new Map<string, HudAuraInfo>();
  for (const a of input.auras) {
    if (auras.has(a.id)) continue;
    const sched = scheduled.find((x) => x.auraId === a.id);
    const bySpell = input.spells.find((s) => s.applyAura?.auraId === a.id);
    const unit: 'self' | 'target' =
      sched?.on ?? bySpell?.applyAura?.on ?? (a.tick !== undefined || a.damageTakenMult !== undefined ? 'target' : 'self');
    const hidden = a.hidden === true;
    auras.set(a.id, {
      name: a.name,
      icon: a.icon,
      iconKind: iconKind(a.id),
      color: a.tick ? (SCHOOL_COLORS[a.tick.school] ?? AURA_DEFAULT_COLOR) : AURA_DEFAULT_COLOR,
      hidden,
      unit,
      proc: !hidden && unit === 'self' && sched === undefined && bySpell === undefined,
      permanentAtStart: scheduled.some((x) => x.auraId === a.id && x.atMs <= 0 && x.durationMs === undefined),
    });
  }
  return { spells, auras, readyIds };
}

/**
 * Show or skip, for every log entry type (mirrored in docs/data-sources.md Part G). A new
 * `LogType` without an entry here fails the typecheck.
 */
export const HUD_LOG_DECISIONS: Readonly<Record<LogType, Readonly<{ show: boolean; rule: string }>>> = Object.freeze({
  'cast-start': { show: false, rule: 'Skipped: the cast bar shows it.' },
  'cast-complete': { show: true, rule: 'Item actions only: the item use notification ("Name"); other spells show their result instead.' },
  'cast-cancel': { show: false, rule: 'Skipped: nothing happened.' },
  impact: { show: false, rule: 'Skipped: the damage/miss entries that follow it are shown.' },
  damage: { show: true, rule: 'Outgoing: a hit (damage) or a crit ("N!", sticky), school colour; below minDamage skipped.' },
  miss: { show: true, rule: 'Outgoing: "Miss".' },
  tick: { show: true, rule: "Outgoing: a DoT tick, smaller and lighter, the DoT's school colour; merged per spell within mergeTicks." },
  'aura-apply': {
    show: true,
    rule: 'Visible auras: a proc "Name!" (gold, sticky), another player buff "+Name", a target aura "+Name" (targetDebuffs only); hidden auras and whole-fight auras scheduled at 0 never.',
  },
  'aura-fade': { show: true, rule: 'Visible auras: a player buff "-Name", a target aura "-Name" (targetDebuffs only); hidden auras never.' },
  mana: { show: true, rule: 'Gains with a source spell (Life Tap, Judgement of Wisdom, potions, runes): "+N Mana"; regen ticks (no spell) never; small gains merged.' },
  queue: { show: false, rule: 'Skipped: the spell queue is shown on the action bar.' },
  'queue-drop': { show: false, rule: 'Skipped: nothing happened.' },
});

/** How far `extractHudEvents` has read: the log index plus the state it compares snapshots with. */
export interface HudCursor {
  /** Log entries before this index have been read. */
  readonly index: number;
  /** Fight time of the last snapshot (a smaller one means a new fight). */
  readonly nowMs: number;
  /** Id of the next event. */
  readonly nextId: number;
  /** Last seen remaining cooldown per tracked spell id. */
  readonly cooldowns: ReadonlyMap<string, number>;
  /** "Low Mana" may fire (re-armed after recovery). */
  readonly lowManaArmed: boolean;
}

export function initialHudCursor(nextId = 0): HudCursor {
  return { index: 0, nowMs: 0, nextId, cooldowns: new Map(), lowManaArmed: true };
}

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * The HUD events of the log entries from `prev.index` on and of the snapshot's changes, and the
 * cursor after them. Pure: `prev` and the inputs are never mutated; each entry is read once.
 * - New fight: a log shorter than `prev.index` or a snapshot earlier than `prev.nowMs` restarts
 *   from the log's first entry with fresh cooldown and low-mana state (ids keep counting).
 * - Log entries follow `HUD_LOG_DECISIONS` (and `buildHudContext`'s aura rules); unknown ids and
 *   malformed entries are skipped.
 * - Snapshot (running fights only), stamped `snapshot.nowMs`: "Name ready" when a tracked cooldown
 *   that was running is 0 (a cooldown at 0 from the start never fires); "Low Mana" when mana drops
 *   below `lowManaPct` while armed (re-armed at `lowManaPct + LOW_MANA_REARM_PCT`).
 * - Settings filter what is emitted (`enabled`, the categories, `minDamage`); the cursor state is
 *   updated whatever they say, so turning a category on later never replays old entries.
 */
export function extractHudEvents(
  prev: HudCursor,
  log: readonly LogEvent[],
  snapshot: SimSnapshot,
  ctx: HudContext,
  settings: HudSettings,
): { events: HudEvent[]; cursor: HudCursor } {
  const length = log.length;
  const fresh = length < prev.index || snapshot.nowMs < prev.nowMs;
  const start = fresh ? initialHudCursor(prev.nextId) : prev;
  let nextId = start.nextId;
  const events: HudEvent[] = [];
  const on = settings.enabled;
  const emit = (e: Omit<HudEvent, 'id' | 'lane' | 'text'>) => {
    events.push({ id: nextId++, lane: 0, text: formatHudText(e, settings), ...e });
  };

  for (let i = start.index; i < length; i++) {
    const entry = log[i];
    if (on && entry) readEntry(entry, ctx, settings, emit);
  }

  // Snapshot: cooldowns becoming ready, low mana.
  const running = snapshot.phase === 'running';
  const cooldowns = new Map(start.cooldowns);
  for (const id of ctx.readyIds) {
    const raw = Object.hasOwn(snapshot.cooldownRemainingMs, id) ? snapshot.cooldownRemainingMs[id] : 0;
    const now = typeof raw === 'number' && raw > 0 ? raw : 0;
    const before = cooldowns.get(id) ?? 0;
    cooldowns.set(id, now);
    if (running && before > 0 && now === 0 && on && settings.cooldownReady) {
      const s = ctx.spells.get(id)!;
      emit({ atMs: snapshot.nowMs, area: 'notifications', kind: 'ready', color: HUD_COLORS.ready, sticky: false, icon: s.icon, iconKind: s.iconKind, name: s.name });
    }
  }
  let lowManaArmed = start.lowManaArmed;
  if (running && snapshot.maxMana > 0) {
    const pct = (snapshot.mana / snapshot.maxMana) * 100;
    if (lowManaArmed && pct < settings.lowManaPct) {
      lowManaArmed = false;
      if (on && settings.lowMana) {
        emit({ atMs: snapshot.nowMs, area: 'notifications', kind: 'low-mana', color: HUD_COLORS['low-mana'], sticky: false });
      }
    } else if (!lowManaArmed && pct >= settings.lowManaPct + LOW_MANA_REARM_PCT) {
      lowManaArmed = true;
    }
  }

  return { events, cursor: { index: Math.max(start.index, length), nowMs: snapshot.nowMs, nextId, cooldowns, lowManaArmed } };
}

type Emit = (e: Omit<HudEvent, 'id' | 'lane' | 'text'>) => void;

/** One log entry -> at most one event (see `HUD_LOG_DECISIONS`). */
function readEntry(e: LogEvent, ctx: HudContext, s: HudSettings, emit: Emit): void {
  const spell = typeof e.spellId === 'string' ? ctx.spells.get(e.spellId) : undefined;
  const aura = typeof e.auraId === 'string' ? ctx.auras.get(e.auraId) : undefined;
  const atMs = e.atMs;
  switch (e.type) {
    case 'damage': {
      if (!spell || !isAmount(e.amount) || e.amount < s.minDamage) return;
      const crit = e.crit === true;
      if (crit ? !s.crits : !s.damage) return;
      emit({ atMs, area: 'outgoing', kind: crit ? 'crit' : 'damage', color: spell.color, sticky: crit, icon: spell.icon, iconKind: spell.iconKind, amount: e.amount, name: spell.name });
      return;
    }
    case 'tick': {
      if (!aura || aura.hidden || !s.ticks || !isAmount(e.amount) || e.amount < s.minDamage) return;
      const src = spell ?? aura;
      emit({ atMs, area: 'outgoing', kind: 'tick', color: aura.color, sticky: false, icon: src.icon, iconKind: src.iconKind, amount: e.amount, name: src.name, key: `tick:${e.spellId ?? e.auraId}` });
      return;
    }
    case 'miss': {
      if (!spell || !s.misses) return;
      emit({ atMs, area: 'outgoing', kind: 'miss', color: HUD_COLORS.miss, sticky: false, icon: spell.icon, iconKind: spell.iconKind, name: spell.name });
      return;
    }
    case 'aura-apply':
    case 'aura-fade': {
      if (!aura || aura.hidden) return;
      const apply = e.type === 'aura-apply';
      // Whole-fight auras the fight puts on at 0 (raid debuffs, pre-pull buffs): not a text.
      if (apply && e.spellId === undefined && atMs <= 0 && aura.permanentAtStart) return;
      let kind: HudKind;
      if (aura.unit === 'target') {
        if (!s.targetDebuffs) return;
        kind = apply ? 'debuff-on' : 'debuff-off';
      } else if (apply && aura.proc) {
        if (!s.procs) return;
        kind = 'proc';
      } else if (apply) {
        if (!s.buffsOn) return;
        kind = 'buff-on';
      } else {
        if (!s.buffsOff) return;
        kind = 'buff-off';
      }
      emit({ atMs, area: 'notifications', kind, color: HUD_COLORS[kind as keyof typeof HUD_COLORS], sticky: kind === 'proc', icon: aura.icon, iconKind: aura.iconKind, name: aura.name });
      return;
    }
    case 'mana': {
      // Regen ticks carry no spell id: never a text.
      if (!spell || !s.mana || !isAmount(e.amount)) return;
      emit({ atMs, area: 'notifications', kind: 'mana', color: HUD_COLORS.mana, sticky: false, icon: spell.icon, iconKind: spell.iconKind, amount: e.amount, name: spell.name, key: 'mana' });
      return;
    }
    case 'cast-complete': {
      if (!spell || !spell.item || !s.itemUse) return;
      emit({ atMs, area: 'notifications', kind: 'item', color: HUD_COLORS.item, sticky: false, icon: spell.icon, iconKind: spell.iconKind, name: spell.name });
      return;
    }
    default:
      return;
  }
}
