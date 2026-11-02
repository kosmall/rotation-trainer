import type { SimSnapshot } from '../../../engine/types';
import type { PriorityStep } from '../../types';

// The item-use rules (simulator Task 1, spec §2 A): WHEN the bot (and the "Priority" panel) uses
// each item action (Destruction Potion, Super Mana Potion, Dark Rune, the gear's on-use items).
// A rule is plain JSON data (`RotationConfig.itemUse`, keyed by the catalog entry id); it is
// compiled into a `PriorityStep` whose `when` is a pure function of the snapshot (and of the
// fight's Heroism end, a constant of the setup). The default rules (`DEFAULT_ITEM_USE`) are the
// fixed rules the bot had before (itemRules.ts) and reproduce its logs byte for byte. Pure and
// framework-free; the normalizers never throw. See docs/data-sources.md, "Part H: simulator and
// item-use rules".

/** When an item is wanted. */
export type ItemUseTrigger =
  /** Whenever it is ready (at the pull and every cooldown). */
  | { kind: 'ready' }
  /** Only at the pull: fight time below `PULL_WINDOW_MS`. */
  | { kind: 'pull' }
  /** From second `sec` of the fight on, whenever it is ready. */
  | { kind: 'at'; sec: number }
  /** While Heroism is up, or once it is over (or when the fight has no Heroism): today's burst rule. */
  | { kind: 'with-heroism' }
  /** While the player's self aura `auraId` is up (a key of `SimSnapshot.selfAuras`). */
  | { kind: 'with-buff'; auraId: string }
  /** When mana is below `mana`. */
  | { kind: 'mana-below'; mana: number }
  /** When at least `amount` mana is missing (max mana - mana >= amount). */
  | { kind: 'mana-missing'; amount: number }
  /** In the last `lastSec` seconds of the fight. */
  | { kind: 'fight-end'; lastSec: number }
  /** Never: the bot leaves it alone (no priority step). */
  | { kind: 'never' };

export type ItemUseTriggerKind = ItemUseTrigger['kind'];

export const ITEM_USE_TRIGGER_KINDS: readonly ItemUseTriggerKind[] = Object.freeze([
  'ready',
  'pull',
  'at',
  'with-heroism',
  'with-buff',
  'mana-below',
  'mana-missing',
  'fight-end',
  'never',
]);

/** A trigger plus an optional time window and minimum gap (seconds of fight time). */
export interface ItemUseRule {
  trigger: ItemUseTrigger;
  /** Not wanted before this second of the fight. */
  notBeforeSec?: number;
  /** Not wanted after this second of the fight. */
  notAfterSec?: number;
  /**
   * At least this many seconds since its last use, read from the snapshot: elapsed = its own
   * cooldown - `cooldownRemainingMs` (a lower bound: a shared cooldown can only make the remaining
   * time longer). A gap longer than the cooldown is capped at the cooldown (once the item is ready
   * a snapshot cannot tell how long ago it was used).
   */
  minGapSec?: number;
}

/** One item action the rules can use (built by `applySetup` from the enabled entries). */
export interface ItemUseAction {
  /** The catalog entry id: the key of `itemUse` (`destruction-potion`, `item:29370`, ...). */
  id: string;
  /** The action's spell id: the step's `spellId` (`use-destruction-potion`, `use-item-29370`). */
  spellId: string;
  label: string;
  /** 'burst': a buff, by default with Heroism; 'mana': by default when its largest gain is missing. */
  kind: 'burst' | 'mana';
  /** What it does, for the hint ("+120 spell power and +2% crit for 15 s"). */
  effect: string;
  /** The cooldown sentence of the hint ("2 min cooldown of its own."). */
  cooldown: string;
  /** Its own cooldown in ms (`minGapSec`). */
  cooldownMs: number;
  /** Its largest mana gain ('mana' actions: the default threshold). */
  maxManaGain?: number;
}

export interface ItemUseContext {
  /**
   * When Heroism ends in the fight (ms), or null when the fight has no Heroism that comes up
   * (disabled, or starting at or after the fight's end): `with-heroism` is then always wanted.
   */
  heroismEndMs: number | null;
  /** Names of self auras for the `with-buff` hints (aura id -> name); the id is shown otherwise. */
  auraNames?: Readonly<Record<string, string>>;
}

/** The part of the rotation config the rules read. */
export interface ItemUseConfig {
  itemUse?: Readonly<Record<string, ItemUseRule>>;
  itemUseOrder?: readonly string[];
}

/** The `pull` window: fight time below one unhasted GCD (1500 ms), i.e. the opening press. */
export const PULL_WINDOW_MS = 1500;

/** Limits of the normalized rules (`normalizeItemUse`). */
export const ITEM_USE_LIMITS = Object.freeze({
  sec: Object.freeze({ min: 0, max: 3600 }),
  mana: Object.freeze({ min: 0, max: 100000 }),
  /** At most this many rules and order entries. */
  maxEntries: 32,
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * The rules the bot used before they became configurable (itemRules.ts @ c121206), per action
 * id: a 'burst' action `with-heroism` when the fight has Heroism (`heroismEndMs` not null), else
 * `ready` (at the pull and whenever ready: the same steps, since `with-heroism` without Heroism is
 * always wanted); a 'mana' action `mana-missing` its largest gain (Super Mana Potion 3000, Dark
 * Rune 1500). A new object per call.
 */
export function DEFAULT_ITEM_USE(actions: readonly ItemUseAction[], heroismEndMs: number | null): Record<string, ItemUseRule> {
  const out: Record<string, ItemUseRule> = {};
  for (const a of actions) out[a.id] = defaultItemUseRule(a, heroismEndMs);
  return out;
}

/** The default rule of one action (`DEFAULT_ITEM_USE`). */
export function defaultItemUseRule(a: ItemUseAction, heroismEndMs: number | null): ItemUseRule {
  if (a.kind === 'mana') return { trigger: { kind: 'mana-missing', amount: a.maxManaGain ?? 0 } };
  return { trigger: heroismEndMs !== null ? { kind: 'with-heroism' } : { kind: 'ready' } };
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/**
 * An item press never takes a spell's place in the spell queue (one queue slot): an item is wanted
 * only when no cast is in progress, when nothing is queued yet, or when it is the queued spell
 * itself (the bot then stops at its step and keeps the queue). Applies to every rule.
 */
function itemPressFree(s: SimSnapshot, spellId: string): boolean {
  return s.cast === null || s.queuedSpellId === null || s.queuedSpellId === spellId;
}

const fmtSec = (sec: number) => `${Number(sec.toFixed(1))} s`;

/** The trigger's condition, or null for `never` (no step). */
function triggerWanted(t: ItemUseTrigger, ctx: ItemUseContext): ((s: SimSnapshot) => boolean) | null {
  switch (t.kind) {
    case 'ready':
      return () => true;
    case 'pull':
      return (s) => s.nowMs < PULL_WINDOW_MS;
    case 'at': {
      const atMs = t.sec * 1000;
      return (s) => s.nowMs >= atMs;
    }
    case 'with-heroism': {
      const endMs = ctx.heroismEndMs;
      return endMs !== null ? (s) => s.selfAuras['heroism'] !== undefined || s.nowMs >= endMs : () => true;
    }
    case 'with-buff': {
      const id = t.auraId;
      return (s) => Object.hasOwn(s.selfAuras, id);
    }
    case 'mana-below': {
      const mana = t.mana;
      return (s) => s.mana < mana;
    }
    case 'mana-missing': {
      const amount = t.amount;
      return (s) => s.maxMana - s.mana >= amount;
    }
    case 'fight-end': {
      const lastMs = t.lastSec * 1000;
      return (s) => s.durationMs - s.nowMs <= lastMs;
    }
    case 'never':
      return null;
  }
}

function triggerText(t: ItemUseTrigger, a: ItemUseAction, ctx: ItemUseContext): string {
  switch (t.kind) {
    case 'with-heroism':
      if (ctx.heroismEndMs !== null) {
        return `Use it while Heroism is up, then whenever it is ready once Heroism has ended at ${fmtSec(ctx.heroismEndMs / 1000)} (off the GCD)`;
      }
      return 'Use it at the pull and whenever it is ready (off the GCD)';
    case 'ready':
      return 'Use it at the pull and whenever it is ready (off the GCD)';
    case 'pull':
      return `Use it at the pull only, in the first ${fmtSec(PULL_WINDOW_MS / 1000)} (off the GCD)`;
    case 'at':
      return `Use it from ${fmtSec(t.sec)} on, whenever it is ready (off the GCD)`;
    case 'with-buff': {
      const names = ctx.auraNames;
      const name = names !== undefined && Object.hasOwn(names, t.auraId) ? names[t.auraId]! : t.auraId;
      return `Use it while ${name} is up (off the GCD)`;
    }
    case 'mana-below':
      return `When mana is below ${t.mana}`;
    case 'mana-missing':
      return `When at least ${t.amount} mana is missing` + (a.maxManaGain !== undefined && t.amount === a.maxManaGain ? ' (its largest gain)' : '');
    case 'fight-end':
      return `Use it in the last ${fmtSec(t.lastSec)} of the fight (off the GCD)`;
    case 'never':
      return 'Never used by the bot';
  }
}

/**
 * One rule of one action compiled: the hint and the condition WITHOUT the item queue gate (window,
 * minimum gap and trigger), or null for `never`. Pure.
 */
export function compileItemUseRule(
  a: ItemUseAction,
  rule: ItemUseRule,
  ctx: ItemUseContext,
): { hint: string; wanted: (s: SimSnapshot) => boolean } | null {
  const trigger = triggerWanted(rule.trigger, ctx);
  if (trigger === null) return null;
  const { spellId } = a;
  const checks: ((s: SimSnapshot) => boolean)[] = [];
  const extra: string[] = [];
  if (rule.notBeforeSec !== undefined) {
    const fromMs = rule.notBeforeSec * 1000;
    checks.push((s) => s.nowMs >= fromMs);
    extra.push(`not before ${fmtSec(rule.notBeforeSec)}`);
  }
  if (rule.notAfterSec !== undefined) {
    const toMs = rule.notAfterSec * 1000;
    checks.push((s) => s.nowMs <= toMs);
    extra.push(`not after ${fmtSec(rule.notAfterSec)}`);
  }
  if (rule.minGapSec !== undefined && rule.minGapSec > 0 && a.cooldownMs > 0) {
    // Elapsed since the last use = cooldown - remaining (a lower bound, see `ItemUseRule`);
    // a gap over the cooldown is capped at it.
    const gapMs = Math.min(rule.minGapSec * 1000, a.cooldownMs);
    const cooldownMs = a.cooldownMs;
    checks.push((s) => cooldownMs - (Object.hasOwn(s.cooldownRemainingMs, spellId) ? s.cooldownRemainingMs[spellId]! : 0) >= gapMs);
    extra.push(`at least ${fmtSec(gapMs / 1000)} after its last use`);
  }
  const hint = `${triggerText(rule.trigger, a, ctx)}${extra.length > 0 ? `, ${extra.join(', ')}` : ''}: ${a.effect}. ${a.cooldown}`;
  const wanted = checks.length === 0 ? trigger : (s: SimSnapshot) => checks.every((c) => c(s)) && trigger(s);
  return { hint, wanted };
}

/** The step of one action under one rule (the queue gate first), or null when the rule is `never`. */
function compileStep(a: ItemUseAction, rule: ItemUseRule, ctx: ItemUseContext): PriorityStep | null {
  const compiled = compileItemUseRule(a, rule, ctx);
  if (compiled === null) return null;
  const { spellId } = a;
  const { wanted } = compiled;
  return { spellId, label: a.label, hint: compiled.hint, when: (s) => itemPressFree(s, spellId) && wanted(s) };
}

/**
 * The priority steps of `actions` (each one at most once, by `id`) under the config's rules:
 * - the rule of an action is `config.itemUse[id]` (an own entry, normalized: an invalid one counts
 *   as absent), else its default (`DEFAULT_ITEM_USE`);
 * - order: the ids of `config.itemUseOrder` that are actions, in that order, then the other
 *   actions in the given order (`applySetup`: catalog order, then the gear's);
 * - a step is wanted when the press cannot replace a queued spell (`itemPressFree`), the time is
 *   inside the window (`notBeforeSec` <= t <= `notAfterSec`), the minimum gap holds and the
 *   trigger holds; otherwise the bot skips it (falls through to the next step). `never`: no step.
 * Pure: reads only its arguments; every call returns new step objects.
 */
export function compileItemUse(actions: readonly ItemUseAction[], config: ItemUseConfig, ctx: ItemUseContext): PriorityStep[] {
  const byId = new Map<string, ItemUseAction>();
  for (const a of actions) if (!byId.has(a.id)) byId.set(a.id, a);
  const ordered: ItemUseAction[] = [];
  const placed = new Set<string>();
  for (const id of Array.isArray(config.itemUseOrder) ? config.itemUseOrder : []) {
    const a = byId.get(id);
    if (a !== undefined && !placed.has(id)) {
      placed.add(id);
      ordered.push(a);
    }
  }
  for (const a of byId.values()) if (!placed.has(a.id)) ordered.push(a);

  const rules = config.itemUse;
  const steps: PriorityStep[] = [];
  for (const a of ordered) {
    const stored = typeof rules === 'object' && rules !== null && Object.hasOwn(rules, a.id) ? normalizeItemUseRule(rules[a.id]) : null;
    const step = compileStep(a, stored ?? defaultItemUseRule(a, ctx.heroismEndMs), ctx);
    if (step !== null) steps.push(step);
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Normalization (untrusted data)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);

/** A finite number clamped into the range and rounded to whole ms (seconds) or whole mana; else undefined. */
function seconds(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const { min, max } = ITEM_USE_LIMITS.sec;
  return Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
}

function manaAmount(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const { min, max } = ITEM_USE_LIMITS.mana;
  return Math.round(Math.min(max, Math.max(min, v)));
}

/** A self aura id as the data has them (`heroism`, `destruction-potion`, `item-buff:35163:29370`). */
const AURA_ID = /^[a-z0-9][a-z0-9:-]{0,63}$/;

function normalizeTrigger(v: unknown): ItemUseTrigger | null {
  if (!isRecord(v)) return null;
  const kind = own(v, 'kind');
  switch (kind) {
    case 'ready':
    case 'pull':
    case 'with-heroism':
    case 'never':
      return { kind };
    case 'at': {
      const sec = seconds(own(v, 'sec'));
      return sec === undefined ? null : { kind, sec };
    }
    case 'fight-end': {
      const lastSec = seconds(own(v, 'lastSec'));
      return lastSec === undefined ? null : { kind, lastSec };
    }
    case 'mana-below': {
      const mana = manaAmount(own(v, 'mana'));
      return mana === undefined ? null : { kind, mana };
    }
    case 'mana-missing': {
      const amount = manaAmount(own(v, 'amount'));
      return amount === undefined ? null : { kind, amount };
    }
    case 'with-buff': {
      const auraId = own(v, 'auraId');
      return typeof auraId === 'string' && AURA_ID.test(auraId) ? { kind, auraId } : null;
    }
    default:
      return null;
  }
}

/**
 * A valid copy of one rule, or null: the trigger must be a known kind with its parameter (a finite
 * number, clamped: seconds 0-3600 rounded to whole ms, mana 0-100 000 rounded; `with-buff` an aura
 * id of `[a-z0-9:-]`, up to 64 characters); `notBeforeSec` / `notAfterSec` / `minGapSec` kept when
 * finite (clamped to 0-3600), dropped otherwise. Never throws; idempotent.
 */
export function normalizeItemUseRule(v: unknown): ItemUseRule | null {
  try {
    if (!isRecord(v)) return null;
    const trigger = normalizeTrigger(own(v, 'trigger'));
    if (trigger === null) return null;
    const rule: ItemUseRule = { trigger };
    const notBeforeSec = seconds(own(v, 'notBeforeSec'));
    const notAfterSec = seconds(own(v, 'notAfterSec'));
    const minGapSec = seconds(own(v, 'minGapSec'));
    if (notBeforeSec !== undefined) rule.notBeforeSec = notBeforeSec;
    if (notAfterSec !== undefined) rule.notAfterSec = notAfterSec;
    if (minGapSec !== undefined) rule.minGapSec = minGapSec;
    return rule;
  } catch {
    return null;
  }
}

/**
 * The stored rules, validated: only own keys for which `isKnownId` holds (catalog item actions and
 * gear effect ids; prototype keys never pass), each rule through `normalizeItemUseRule` (invalid
 * rules dropped: the default applies), at most `ITEM_USE_LIMITS.maxEntries` rules (the first ones
 * in key order). A rule equal to its default for every fight (`isDefaultRule`) is dropped, so a
 * config that only spells out the defaults equals one without them. Returns undefined when nothing
 * is left (the field is then absent). Never throws; idempotent.
 */
export function normalizeItemUse(
  v: unknown,
  isKnownId: (id: string) => boolean,
  isDefaultRule: (id: string, rule: ItemUseRule) => boolean = () => false,
): Record<string, ItemUseRule> | undefined {
  try {
    if (!isRecord(v)) return undefined;
    const out: Record<string, ItemUseRule> = {};
    let n = 0;
    for (const id of Object.keys(v)) {
      if (n >= ITEM_USE_LIMITS.maxEntries) break;
      if (!isKnownId(id)) continue;
      const rule = normalizeItemUseRule(v[id]);
      if (rule === null || isDefaultRule(id, rule)) continue;
      out[id] = rule;
      n++;
    }
    return n > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The stored order: strings for which `isKnownId` holds, each once (first position), at most
 * `ITEM_USE_LIMITS.maxEntries`. Undefined when not an array or nothing is left. Never throws.
 */
export function normalizeItemUseOrder(v: unknown, isKnownId: (id: string) => boolean): string[] | undefined {
  try {
    if (!Array.isArray(v)) return undefined;
    const out: string[] = [];
    const seen = new Set<string>();
    const length = Math.min(v.length, 10000);
    for (let i = 0; i < length && out.length < ITEM_USE_LIMITS.maxEntries; i++) {
      const id: unknown = v[i];
      if (typeof id !== 'string' || seen.has(id) || !isKnownId(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
