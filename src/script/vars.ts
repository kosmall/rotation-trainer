// The variables of the rotation script language (spec §2 A): name resolution against the
// context and the run-time readers. Each reader is a closure over constants (the id, the
// context's Heroism end) that reads the snapshot only: no allocation per call, never throws, an id
// the snapshot does not have reads as false / 0 (own-property lookups: `__proto__` and
// `constructor` are plain unknown ids). Units: seconds as numbers everywhere except
// `time.elapsedMs`. Documented in docs/data-sources.md, Part J (`VARIABLE_DOCS` is that table).

import type { SpecData } from '../data/types';
import type { AuraView, SimSnapshot } from '../engine/types';
import type { ScriptContext, ScriptExt, ScriptItemAction, ScriptRotationFacts, ValueType } from './types';

export type Reader = (s: SimSnapshot, x: ScriptExt) => boolean | number | string;

/** The id of Heroism / Bloodlust's self aura (src/data/common/buffs.ts `heroism`). */
export const HEROISM_AURA_ID = 'heroism';

export interface VariableDoc {
  name: string;
  type: ValueType;
  description: string;
}

/** Every variable and function, as Part J lists them. */
export const VARIABLE_DOCS: readonly VariableDoc[] = Object.freeze([
  { name: 'time.elapsed', type: 'num', description: 'Fight time elapsed, in seconds.' },
  { name: 'time.remaining', type: 'num', description: 'Fight time left (fight length - elapsed), in seconds.' },
  { name: 'time.elapsedMs', type: 'num', description: 'Fight time elapsed, in ms (the only ms variable).' },
  { name: 'mana', type: 'num', description: 'Current mana.' },
  { name: 'mana.pct', type: 'num', description: 'Mana in percent of max mana (0-100; 0 when max mana is 0).' },
  { name: 'mana.missing', type: 'num', description: 'Max mana - mana.' },
  { name: 'mana.max', type: 'num', description: 'Max mana (with the active self auras).' },
  { name: 'self.aura.<id>.active', type: 'bool', description: 'The visible self aura <id> is up.' },
  { name: 'self.aura.<id>.remaining', type: 'num', description: 'Seconds left on it; 0 when it is not up.' },
  { name: 'self.aura.<id>.stacks', type: 'num', description: 'Its stacks; 0 when it is not up.' },
  { name: 'self.aura.<id>.charges', type: 'num', description: 'Its charges left; 0 when it is not up (or has none).' },
  { name: 'target.aura.<id>.active', type: 'bool', description: 'The visible target aura <id> is up (shadow-vulnerability: Improved Shadow Bolt).' },
  { name: 'target.aura.<id>.remaining', type: 'num', description: 'Seconds left on it; 0 when it is not up.' },
  { name: 'target.aura.<id>.stacks', type: 'num', description: 'Its stacks; 0 when it is not up.' },
  { name: 'target.aura.<id>.charges', type: 'num', description: 'Its charges left; 0 when it is not up.' },
  { name: 'cd.<id>.ready', type: 'bool', description: 'The spell or item action <id> is off cooldown (own and shared cooldown; not the GCD). False for an id not in the fight.' },
  { name: 'cd.<id>.remaining', type: 'num', description: 'Seconds of cooldown left; 0 when ready or unknown.' },
  { name: 'cast.<id>.count', type: 'num', description: 'Completed casts of spell <id> so far (item actions excluded; cancelled casts never count).' },
  { name: 'use.<id>.count', type: 'num', description: 'Uses of item action <id> so far (catalog entry id such as item:29370, or the action id).' },
  { name: 'casting', type: 'str', description: "Id of the spell being cast, or '' when none." },
  { name: 'casting.<id>', type: 'bool', description: 'Spell <id> is being cast now.' },
  { name: 'inflight.<id>', type: 'bool', description: 'A missile of spell <id> is flying (cast done, not landed).' },
  { name: 'gcd.remaining', type: 'num', description: 'Seconds until the global cooldown ends; 0 when it is over.' },
  { name: 'heroism.active', type: 'bool', description: 'Heroism / Bloodlust is up on the player.' },
  { name: 'heroism.over', type: 'bool', description: 'Heroism has ended in this fight, or the fight has none (as the item-use rule with-heroism).' },
  { name: 'fight.last(N)', type: 'bool', description: 'In the last N seconds of the fight (time.remaining <= N).' },
  { name: 'has(id)', type: 'bool', description: 'The spell or item action <id> is in this build and gear (a constant of the fight).' },
  {
    name: 'dotRefreshDue(id)',
    type: 'bool',
    description:
      "The basic rotation's refresh rule of DoT spell <id> (immolate, corruption, ...): not being cast, not in flight, its DoT has at most the spell's unhasted cast time left, and the fight lasts at least that cast time + a full DoT (talents and gear included).",
  },
  {
    name: 'finisherWindow()',
    type: 'num',
    description: "The basic rotation's Shadowburn finisher window in seconds: Shadow Bolt's unhasted cast time after the talents + its flight time at the fight's distance.",
  },
  { name: 'manaCost(id)', type: 'num', description: "Spell <id>'s mana cost after the talents (no auras), as Life Tap 'auto' uses Shadow Bolt's." },
  {
    name: 'minGap(id, N)',
    type: 'bool',
    description:
      'At least N seconds since item action <id> was last used, as the item-use rules estimate it: its own cooldown - the cooldown left, N capped at the cooldown (true when N <= 0 or the item has no cooldown).',
  },
]);

export const STATIC_NAMES = Object.freeze(['time.elapsed', 'time.remaining', 'time.elapsedMs', 'mana', 'mana.pct', 'mana.missing', 'mana.max', 'casting', 'gcd.remaining', 'heroism.active', 'heroism.over']);
export const FUNCTION_NAMES = Object.freeze(['fight.last', 'has', 'dotRefreshDue', 'finisherWindow', 'manaCost', 'minGap']);
/** How each function is written (error messages). */
export const FUNCTION_USAGE: Readonly<Record<string, string>> = Object.freeze({
  'fight.last': 'fight.last(N)',
  has: 'has(id)',
  dotRefreshDue: 'dotRefreshDue(id)',
  finisherWindow: 'finisherWindow()',
  manaCost: 'manaCost(id)',
  minGap: 'minGap(id, N)',
});
const AURA_FIELDS = ['active', 'remaining', 'stacks', 'charges'] as const;
const FAMILY_TEMPLATES: Readonly<Record<string, string>> = {
  self: 'self.aura.<id>.active|remaining|stacks|charges',
  target: 'target.aura.<id>.active|remaining|stacks|charges',
  cd: 'cd.<id>.ready|remaining',
  cast: 'cast.<id>.count',
  use: 'use.<id>.count',
  inflight: 'inflight.<id>',
};

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** Edit distance (insert, delete, substitute), two rows. Inputs are cut to 100 characters. */
export function levenshtein(a: string, b: string): number {
  const x = a.slice(0, 100);
  const y = b.slice(0, 100);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  let cur = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[y.length]!;
}

/**
 * The candidate closest to `name` when it is close enough (distance <= max(2, a third of the
 * name's length)); the first on ties; undefined otherwise or for names over 100 characters.
 */
export function closest(name: string, candidates: readonly string[]): string | undefined {
  if (name.length > 100) return undefined;
  const limit = Math.max(2, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    if (Math.abs(c.length - name.length) > limit) continue;
    const d = levenshtein(name, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return bestD <= limit ? best : undefined;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * A context from a built spec: its non-item spells, its visible auras and its item actions
 * (`itemActions` given, else each item spell with its own id as the entry id and its spell's
 * cooldown), plus the fight's Heroism end (applySetup's `heroismEndMs`), the basic rotation's
 * facts for the built-in functions (`rotation`, optional) and display names (the spells' names,
 * then `names`).
 */
export function scriptContextOf(
  spec: Pick<SpecData, 'spells' | 'auras'>,
  opts: {
    heroismEndMs: number | null;
    itemActions?: readonly ScriptItemAction[];
    rotation?: ScriptRotationFacts;
    names?: Readonly<Record<string, string>>;
  },
): ScriptContext {
  const spellIds = spec.spells.filter((s) => !s.item).map((s) => s.id);
  const auraIds = [...new Set(spec.auras.filter((a) => !a.hidden).map((a) => a.id))];
  const itemActions =
    opts.itemActions ?? spec.spells.filter((s) => s.item).map((s) => ({ id: s.id, spellId: s.id, cooldownMs: s.cooldownMs }));
  const names: Record<string, string> = {};
  for (const s of spec.spells) if (!Object.hasOwn(names, s.id)) names[s.id] = s.name;
  if (opts.names !== undefined) for (const [k, v] of Object.entries(opts.names)) names[k] = v;
  return {
    spellIds,
    auraIds,
    itemActions: itemActions.map((a) => ({ id: a.id, spellId: a.spellId, ...(a.cooldownMs !== undefined && { cooldownMs: a.cooldownMs }) })),
    heroismEndMs: opts.heroismEndMs,
    ...(opts.rotation !== undefined && { rotation: opts.rotation }),
    names,
  };
}

/** The item action of an entry id or action spell id, if the context has it. */
export function itemActionOf(ctx: ScriptContext, id: string): ScriptItemAction | undefined {
  return ctx.itemActions.find((a) => a.id === id || a.spellId === id);
}

/** `has(id)`: a spell, item entry id or item action id of the context. */
export function contextHas(ctx: ScriptContext, id: string): boolean {
  return ctx.spellIds.includes(id) || itemActionOf(ctx, id) !== undefined;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** An id the context does not know: a warning (the variable still reads false / 0). */
export interface UnknownId {
  message: string;
  suggestion?: string;
}

export type Resolved =
  | { ok: true; type: ValueType; read: Reader; unknownId?: UnknownId }
  | { ok: false; message: string; suggestion?: string };

const own = Object.hasOwn;

function auraReader(side: 'selfAuras' | 'targetAuras', id: string, field: (typeof AURA_FIELDS)[number]): Reader {
  const view = (s: SimSnapshot): AuraView | undefined => {
    const m = s[side];
    return own(m, id) ? m[id] : undefined;
  };
  switch (field) {
    case 'active':
      return (s) => own(s[side], id);
    case 'remaining':
      return (s) => {
        const a = view(s);
        return a === undefined ? 0 : a.remainingMs / 1000;
      };
    case 'stacks':
      return (s) => {
        const a = view(s);
        return a === undefined ? 0 : a.stacks;
      };
    case 'charges':
      return (s) => {
        const a = view(s);
        return a === undefined ? 0 : a.charges;
      };
  }
}

function unknownSpell(ctx: ScriptContext, id: string, withItems: boolean): UnknownId | undefined {
  if (ctx.spellIds.includes(id) || (withItems && itemActionOf(ctx, id) !== undefined)) return undefined;
  const pool = withItems ? [...ctx.spellIds, ...ctx.itemActions.map((a) => a.id)] : ctx.spellIds;
  return withSuggestion(`unknown spell '${id}'`, closest(id, pool));
}

export function unknownItem(ctx: ScriptContext, id: string): UnknownId | undefined {
  if (itemActionOf(ctx, id) !== undefined) return undefined;
  return withSuggestion(`item '${id}' is not in this setup (not worn or not enabled)`, closest(id, ctx.itemActions.map((a) => a.id)));
}

function withSuggestion(message: string, suggestion: string | undefined): UnknownId {
  return suggestion === undefined ? { message } : { message, suggestion };
}

function ok(type: ValueType, read: Reader, unknownId?: UnknownId): Resolved {
  return unknownId === undefined ? { ok: true, type, read } : { ok: true, type, read, unknownId };
}

function staticVar(name: string, ctx: ScriptContext): Resolved | undefined {
  switch (name) {
    case 'time.elapsed':
      return ok('num', (s) => s.nowMs / 1000);
    case 'time.remaining':
      return ok('num', (s) => (s.durationMs - s.nowMs) / 1000);
    case 'time.elapsedMs':
      return ok('num', (s) => s.nowMs);
    case 'mana':
      return ok('num', (s) => s.mana);
    case 'mana.pct':
      return ok('num', (s) => (s.maxMana > 0 ? (100 * s.mana) / s.maxMana : 0));
    case 'mana.missing':
      return ok('num', (s) => s.maxMana - s.mana);
    case 'mana.max':
      return ok('num', (s) => s.maxMana);
    case 'casting':
      return ok('str', (s) => (s.cast !== null ? s.cast.spellId : ''));
    case 'gcd.remaining':
      return ok('num', (s) => (s.gcdEndsAtMs > s.nowMs ? (s.gcdEndsAtMs - s.nowMs) / 1000 : 0));
    case 'heroism.active':
      return ok('bool', (s) => own(s.selfAuras, HEROISM_AURA_ID));
    case 'heroism.over': {
      const endMs = ctx.heroismEndMs;
      return endMs === null ? ok('bool', () => true) : ok('bool', (s) => s.nowMs >= endMs);
    }
    default:
      return undefined;
  }
}

/**
 * Resolves a variable path: its type and reader, plus an unknown-id warning when the id is not in
 * the context; `ok: false` (an error) when the path is no variable at all.
 */
export function resolveVar(path: string, ctx: ScriptContext): Resolved {
  const fixed = staticVar(path, ctx);
  if (fixed !== undefined) return fixed;
  const seg = path.split('.');
  const head = seg[0]!;
  if ((head === 'self' || head === 'target') && seg.length === 4 && seg[1] === 'aura') {
    const id = seg[2]!;
    const field = seg[3]!;
    if (!(AURA_FIELDS as readonly string[]).includes(field)) {
      const near = closest(field, AURA_FIELDS);
      return {
        ok: false,
        message: `unknown field '${field}' of ${head}.aura.<id> (${AURA_FIELDS.join(', ')})`,
        ...(near !== undefined && { suggestion: `${head}.aura.${id}.${near}` }),
      };
    }
    const unknown = ctx.auraIds.includes(id) ? undefined : withSuggestion(`unknown aura '${id}'`, closest(id, ctx.auraIds));
    const side = head === 'self' ? 'selfAuras' : 'targetAuras';
    return ok(field === 'active' ? 'bool' : 'num', auraReader(side, id, field as (typeof AURA_FIELDS)[number]), unknown);
  }
  if (head === 'cd' && seg.length === 3) {
    const field = seg[2]!;
    const id = seg[1]!;
    const spellId = itemActionOf(ctx, id)?.spellId ?? id;
    const unknown = unknownSpell(ctx, id, true);
    if (field === 'ready') {
      return ok('bool', (s) => own(s.cooldownRemainingMs, spellId) && s.cooldownRemainingMs[spellId]! <= 0, unknown);
    }
    if (field === 'remaining') {
      return ok('num', (s) => (own(s.cooldownRemainingMs, spellId) ? Math.max(0, s.cooldownRemainingMs[spellId]!) / 1000 : 0), unknown);
    }
    return fieldError(path, field, ['ready', 'remaining'], `cd.${id}.`);
  }
  if ((head === 'cast' || head === 'use') && seg.length === 3) {
    const id = seg[1]!;
    if (seg[2] !== 'count') return fieldError(path, seg[2]!, ['count'], `${head}.${id}.`);
    if (head === 'cast') {
      return ok('num', (s) => (own(s.castCounts, id) ? s.castCounts[id]! : 0), unknownSpell(ctx, id, false));
    }
    const spellId = itemActionOf(ctx, id)?.spellId ?? id;
    return ok('num', (s) => (own(s.useCounts, spellId) ? s.useCounts[spellId]! : 0), unknownItem(ctx, id));
  }
  if (head === 'casting' && seg.length === 2) {
    const id = seg[1]!;
    return ok('bool', (s) => s.cast !== null && s.cast.spellId === id, unknownSpell(ctx, id, false));
  }
  if (head === 'inflight' && seg.length === 2) {
    const id = seg[1]!;
    return ok(
      'bool',
      (s) => {
        const f = s.inFlight;
        for (let i = 0; i < f.length; i++) if (f[i]!.spellId === id) return true;
        return false;
      },
      unknownSpell(ctx, id, false),
    );
  }
  if (FUNCTION_NAMES.includes(path)) {
    return { ok: false, message: `'${path}' is a function: write ${FUNCTION_USAGE[path]}` };
  }
  if (own(FAMILY_TEMPLATES, head)) {
    return { ok: false, message: `unknown variable '${path}' (expected ${FAMILY_TEMPLATES[head]})` };
  }
  const near = closest(path, STATIC_NAMES);
  return { ok: false, message: `unknown variable '${path}'`, ...(near !== undefined && { suggestion: near }) };
}

function fieldError(path: string, field: string, fields: readonly string[], prefix: string): Resolved {
  const near = closest(field, fields);
  return {
    ok: false,
    message: `unknown variable '${path}' (field '${field}': ${fields.join(', ')})`,
    ...(near !== undefined && { suggestion: `${prefix}${near}` }),
  };
}
