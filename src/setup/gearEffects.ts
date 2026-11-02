// The item effects of the worn gear (gear item effects Task 2, design spec §2 B/C): the "Items and
// cooldowns" item entries are derived from the gear and the item database's structured effects
// (`ItemRecord.useEffects` / `procEffects`, Task 1), no longer hard-coded. Pure and framework-free;
// nothing here throws or mutates its inputs. See docs/data-sources.md, "Part F: gear item effects".
//
// Ids (stable, saved in `SetupConfig.enabledBuffs`):
// - entry `item:<itemId>` for the item's first modelled effect, `item:<itemId>:<n>` (n >= 2) for
//   further ones; effects are numbered useEffects first, then procEffects, in array order;
// - item action `use-item-<itemId>` (`use-item-<itemId>-<n>`);
// - buff aura `item-buff:<buffId>`: two items with the same buff (Scryer's Bloodgem and Xi'ri's
//   Gift: 35337) share it, so the buff never doubles (a second use or proc refreshes it); a buff id
//   seen again with other stats or duration gets `item-buff:<buffId>:<itemId>`;
// - internal cooldown aura `item-icd:<itemId>` (`item-icd:<itemId>:<n>`): one per effect, hidden.

import { BAND_PROC_SPELL_IDS, CAST_TRIGGER_EXCLUDED_SPELL_IDS } from '../data/classes/warlock/buffs';
import { destructionEquipped } from '../data/classes/warlock/destruction';
import { burstRule, type ItemRule } from '../data/classes/warlock/itemRules';
import { authorItemEffects } from '../data/classes/warlock/items';
import { deepFreeze, itemAction } from '../data/common/buffs';
import type { ItemDb, ItemEffectStats, ItemProcEffect, ItemProcTrigger, ItemRecord, ItemUseEffect } from '../data/items/types';
import { ITEM_SLOT_COUNT, type BuffDef } from '../data/types';
import type { AuraDef, EquippedItem, HitOutcome, RawStats, SpecHooks } from '../engine/types';
import type { SetupConfig } from './types';

/** The fields of an item record the derivation reads (an `ItemDb` item fits). */
export type GearEffectRecord = Pick<ItemRecord, 'id' | 'name' | 'icon' | 'effects' | 'useEffects' | 'procEffects'>;

/** Where the item records come from: the item database (`ItemDb` fits) or the embedded copy. */
export interface GearEffectSource {
  items: Readonly<Record<number, GearEffectRecord>>;
}

/**
 * The embedded records of the author's items (items.ts `authorItemEffects`): the source when the
 * item database has not loaded. The author's gear derives the same entries from it as from the
 * database (pinned by tests/setup/gear-effects.test.ts); other items are unknown to it (skipped).
 */
export const EMBEDDED_GEAR_EFFECT_SOURCE: GearEffectSource = deepFreeze({ items: { ...authorItemEffects } });

/** The stage F hand entries' ids -> the derived ids (`normalizeSetup` migrates stored configs). */
export const LEGACY_ITEM_BUFF_IDS: Readonly<Record<string, string>> = Object.freeze({
  'icon-of-the-silver-crescent': 'item:29370',
  'band-of-the-eternal-sage': 'item:29305',
});

const GEAR_EFFECT_ID = /^item:[1-9]\d{0,8}(?::(?:[2-9]|[1-9]\d))?$/;

/** A well-formed derived entry id (`item:<id>` or `item:<id>:<n>`, n 2-99); not whether it is worn. */
export function isGearEffectId(id: unknown): id is string {
  return typeof id === 'string' && GEAR_EFFECT_ID.test(id);
}

const STAT_LABELS: Readonly<Record<keyof ItemEffectStats, string>> = {
  intellect: 'intellect',
  spirit: 'spirit',
  spellPower: 'spell power',
  shadowPower: 'shadow power',
  firePower: 'fire power',
  critRating: 'crit rating',
  hitRating: 'hit rating',
  hasteRating: 'haste rating',
  mp5: 'mana per 5 s',
};

const num = (n: number) => String(Number(n.toFixed(2)));
const secs = (ms: number) => (ms >= 120000 && ms % 60000 === 0 ? `${ms / 60000} min` : `${num(ms / 1000)} s`);

function statsText(stats: Partial<RawStats> | undefined): string {
  return Object.entries(stats ?? {})
    .map(([k, v]) => `+${num(v)} ${STAT_LABELS[k as keyof ItemEffectStats] ?? k}`)
    .join(', ');
}

/** A proc's trigger in words (the Setup panel's description line; rulings E-1, E-2): short, then the rule. */
const TRIGGER_TEXT: Readonly<Record<ItemProcTrigger, { short: string; rule: string }>> = {
  cast: { short: 'on spell cast', rule: 'Any completed spell rolls, misses included; Curse of the Elements never.' },
  hit: { short: 'on spell hit', rule: 'A landed damaging spell rolls; Life Tap, Curse of the Elements and misses never.' },
  crit: { short: 'on spell crit', rule: 'A critical hit of a damaging spell rolls.' },
};

/** The trigger rule of a proc (rulings E-1, E-2; `ItemProcTrigger`). Hooks never run on DoT ticks or items. */
export function procTriggerMatches(trigger: ItemProcTrigger, e: { spellId: string; outcome: HitOutcome }): boolean {
  switch (trigger) {
    case 'cast':
      return !CAST_TRIGGER_EXCLUDED_SPELL_IDS.includes(e.spellId);
    case 'hit':
      return e.outcome !== 'miss' && BAND_PROC_SPELL_IDS.includes(e.spellId);
    case 'crit':
      return e.outcome === 'crit' && BAND_PROC_SPELL_IDS.includes(e.spellId);
    default:
      return false;
  }
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const posNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A copy of an effect's stats with only positive finite modelled values, or undefined (malformed). */
function cleanStats(v: unknown): Partial<RawStats> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Partial<RawStats> = {};
  for (const key of Object.keys(STAT_LABELS) as (keyof ItemEffectStats)[]) {
    if (!Object.hasOwn(v, key)) continue;
    const n = v[key];
    if (!posNum(n)) return undefined;
    out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validUse(u: unknown): u is ItemUseEffect {
  return (
    isRecord(u) &&
    typeof u.buffName === 'string' &&
    posInt(u.buffId) &&
    posInt(u.durationMs) &&
    posInt(u.cooldownMs) &&
    cleanStats(u.stats) !== undefined &&
    (u.group === undefined || (isRecord(u.group) && posInt(u.group.id) && posInt(u.group.ms)))
  );
}

function validProc(p: unknown): p is ItemProcEffect {
  return (
    isRecord(p) &&
    typeof p.buffName === 'string' &&
    posInt(p.buffId) &&
    posInt(p.durationMs) &&
    typeof p.chance === 'number' &&
    p.chance > 0 &&
    p.chance <= 1 &&
    typeof p.icdMs === 'number' &&
    Number.isSafeInteger(p.icdMs) &&
    p.icdMs >= 0 &&
    (p.trigger === 'cast' || p.trigger === 'hit' || p.trigger === 'crit') &&
    cleanStats(p.stats) !== undefined
  );
}

/**
 * Whether an item record has a modelled effect: a `useEffects` or `procEffects` entry that
 * `deriveGearEffects` turns into a setup entry (the same validators). Never throws.
 */
export function hasModelledGearEffect(item: Pick<ItemRecord, 'useEffects' | 'procEffects'>): boolean {
  try {
    return (
      (Array.isArray(item.useEffects) && item.useEffects.some(validUse)) ||
      (Array.isArray(item.procEffects) && item.procEffects.some(validProc))
    );
  } catch {
    return false;
  }
}

/** One worn item's modelled effects, numbered (n = 1 first). */
interface Numbered<T> {
  item: GearEffectRecord;
  n: number;
  effect: T;
}

/** The worn items (records found in `source`), each once, in gear slot order. Never throws. */
function wornRecords(gear: unknown, source: GearEffectSource): GearEffectRecord[] {
  const out: GearEffectRecord[] = [];
  const seen = new Set<number>();
  let length = 0;
  try {
    if (!Array.isArray(gear)) return out;
    length = gear.length;
  } catch {
    return out;
  }
  for (let i = 0; i < length; i++) {
    try {
      const e: unknown = (gear as unknown[])[i];
      if (!isRecord(e) || !Object.hasOwn(e, 'id')) continue;
      const id = e.id;
      if (!posInt(id) || seen.has(id) || !Object.hasOwn(source.items, id)) continue;
      seen.add(id);
      out.push(source.items[id]!);
    } catch {
      // A hostile entry (throwing getter or proxy): skipped.
    }
  }
  return out;
}

const suffix = (n: number) => (n === 1 ? '' : `:${n}`);
const entryName = (item: GearEffectRecord, n: number, buffName: string) => (n === 1 ? item.name : `${item.name} (${buffName})`);

/**
 * The setup entries (`BuffDef`, group 'item', `iconKind: 'item'`) of the modelled effects of the
 * worn items: every item of `gear` (rings, trinkets and every other slot) found in `source`, each
 * item once. Order: the on-use effects (item actions) in gear slot order, then the pre-pull
 * effects, then the procs (that order keeps the stage F Icon-then-Band order of the catalog).
 * - On use: `effect.action` (`itemAction`, id `use-item-<id>`, own `cooldownMs`, `sharedCooldown`
 *   `category-<id>` for the effect's group, none without one) applying `effect.selfAura` (the buff).
 * - Pre-pull (`prepull`, Chain of the Twilight Owl; ruling E-3): only `effect.selfAura`: with no
 *   action and no `timed`, `applySetup` puts it on the player at 0 for its own duration (30 min:
 *   the whole fight); no item slot. Its buff is an exclusive party buff in wowsims; the item is
 *   unique, so two copies cannot be worn and nothing else in the catalog gives it.
 * - Proc: `effect.auras` = [buff aura, hidden ICD aura (only when `icdMs` > 0)] and
 *   `effect.hooks.onSpellResolved`: on a matching spell (`procTriggerMatches`), nothing while the
 *   ICD aura is up; else a proc when the chance is 1 (no draw, as wowsims aura_helpers.go
 *   `ProcChance != 1 && RandomFloat`) or when `api.roll() < chance`; a proc applies the ICD aura,
 *   then the buff aura (a buff that is up is refreshed, never stacked). A setup without the item
 *   never composes the hook, so its random draws are unchanged.
 * Pure and total: a non-array or hostile gear, unknown ids, a repeated item and malformed effects
 * are skipped, never thrown on. Every call builds fresh, deep-frozen entries (hooks are new
 * closures) that share no object with `source` or `gear`.
 */
export function deriveGearEffects(gear: readonly (EquippedItem | null)[], source: GearEffectSource): BuffDef[] {
  const uses: Numbered<ItemUseEffect>[] = [];
  const prepulls: Numbered<ItemUseEffect>[] = [];
  const procs: Numbered<ItemProcEffect>[] = [];
  for (const item of wornRecords(gear, source)) {
    let n = 0;
    try {
      for (const u of Array.isArray(item.useEffects) ? item.useEffects : []) {
        n++;
        if (!validUse(u)) continue;
        (u.prepull === true ? prepulls : uses).push({ item, n, effect: u });
      }
      for (const p of Array.isArray(item.procEffects) ? item.procEffects : []) {
        n++;
        if (validProc(p)) procs.push({ item, n, effect: p });
      }
    } catch {
      // A malformed record: what was read so far is kept.
    }
  }

  // One aura per buff id; a buff id with other numbers gets an aura of its own.
  const buffAuraIds = new Map<number, string>();
  const auraIdFor = (item: GearEffectRecord, e: { buffId: number; stats: unknown; durationMs: number }) => {
    const signature = `${JSON.stringify(cleanStats(e.stats))}/${e.durationMs}`;
    const key = buffAuraIds.get(e.buffId);
    if (key === undefined) {
      buffAuraIds.set(e.buffId, signature);
      return `item-buff:${e.buffId}`;
    }
    return key === signature ? `item-buff:${e.buffId}` : `item-buff:${e.buffId}:${item.id}`;
  };
  const sourceText = (item: GearEffectRecord) =>
    `src/data/items/db.json item ${item.id} (wowsims/tbc-new assets/database/db.json itemEffects; triggers: docs/data-sources.md Part F); https://www.wowhead.com/tbc/item=${item.id}`;

  const out: BuffDef[] = [];
  for (const { item, n, effect: u } of [...uses, ...prepulls]) {
    const auraId = auraIdFor(item, u);
    const stats = cleanStats(u.stats)!;
    const selfAura: AuraDef = { id: auraId, name: u.buffName, icon: item.icon, wowheadId: u.buffId, durationMs: u.durationMs, selfStatBonuses: stats };
    const name = entryName(item, n, u.buffName);
    if (u.prepull === true) {
      out.push({
        id: `item:${item.id}${suffix(n)}`,
        name,
        icon: item.icon,
        iconKind: 'item',
        group: 'item',
        description: `Before the pull, whole fight: ${statsText(stats)} (lasts ${secs(u.durationMs)}; an exclusive party buff; no item action). Its equip stats are already in the gear.`,
        source: sourceText(item),
        effect: { selfAura },
      });
      continue;
    }
    const group = u.group;
    out.push({
      id: `item:${item.id}${suffix(n)}`,
      name,
      icon: item.icon,
      iconKind: 'item',
      group: 'item',
      description:
        `On use (item row): ${statsText(stats)} for ${secs(u.durationMs)}; ${secs(u.cooldownMs)} cooldown` +
        (group ? `; other items of its category wait ${secs(group.ms)}.` : '; no shared cooldown.') +
        ' Its equip stats are already in the gear.',
      source: sourceText(item),
      effect: {
        action: itemAction({
          id: `use-item-${item.id}${n === 1 ? '' : `-${n}`}`,
          name,
          icon: item.icon,
          wowheadId: u.buffId,
          cooldownMs: u.cooldownMs,
          ...(group && { sharedCooldown: { group: `category-${group.id}`, ms: group.ms } }),
          applyAura: { auraId, on: 'self' },
        }),
        selfAura,
      },
    });
  }
  for (const { item, n, effect: p } of procs) {
    const auraId = auraIdFor(item, p);
    const stats = cleanStats(p.stats)!;
    const icdId = p.icdMs > 0 ? `item-icd:${item.id}${suffix(n)}` : undefined;
    const { chance, trigger } = p;
    const auras: AuraDef[] = [
      { id: auraId, name: p.buffName, icon: item.icon, wowheadId: p.buffId, durationMs: p.durationMs, selfStatBonuses: stats },
    ];
    if (icdId !== undefined) {
      // Bookkeeping only: while it is up the item cannot proc.
      auras.push({ id: icdId, name: `${item.name} (internal cooldown)`, icon: item.icon, wowheadId: p.buffId, durationMs: p.icdMs, hidden: true });
    }
    const hooks: SpecHooks = {
      onSpellResolved(e, api) {
        if (!procTriggerMatches(trigger, e)) return;
        if (icdId !== undefined && api.hasSelfAura(icdId)) return;
        if (chance >= 1 || api.roll() < chance) {
          if (icdId !== undefined) api.applySelfAura(icdId);
          api.applySelfAura(auraId);
        }
      },
    };
    out.push({
      id: `item:${item.id}${suffix(n)}`,
      name: entryName(item, n, p.buffName),
      icon: item.icon,
      iconKind: 'item',
      group: 'item',
      description:
        `Proc ${TRIGGER_TEXT[trigger].short}: ${num(chance * 100)}% chance, ${statsText(stats)} for ${secs(p.durationMs)}` +
        (icdId !== undefined ? `; ${secs(p.icdMs)} internal cooldown.` : '; no internal cooldown (a proc while it is up refreshes it).') +
        ` ${TRIGGER_TEXT[trigger].rule} DoT ticks never proc it. Its equip stats are already in the gear.`,
      source: sourceText(item),
      effect: { auras, hooks },
    });
  }
  return deepFreeze(out);
}

/**
 * "<item>: <effect>" for every text effect (`ItemRecord.effects`: what the trainer does not model)
 * of the worn items found in `source`, in gear slot order, each item once. Never throws.
 */
export function unmodelledGearEffects(gear: readonly (EquippedItem | null)[], source: GearEffectSource): string[] {
  const out: string[] = [];
  for (const item of wornRecords(gear, source)) {
    try {
      if (!Array.isArray(item.effects)) continue;
      for (const effect of item.effects) if (typeof effect === 'string') out.push(`${item.name}: ${effect}`);
    } catch {
      // A malformed record: skipped.
    }
  }
  return out;
}

/**
 * The bot rules of the derived item actions (by action id, entry order): the burst rule each
 * (with Heroism when the fight has it, then whenever ready), labelled with the entry's name.
 */
export function gearItemRules(entries: readonly BuffDef[]): Record<string, ItemRule> {
  const rules: Record<string, ItemRule> = {};
  for (const b of entries) {
    const a = b.effect.action;
    const aura = b.effect.selfAura;
    if (!a || !aura) continue;
    const cooldown =
      `${secs(a.cooldownMs)} cooldown` + (a.sharedCooldown ? `; other items of its category wait ${secs(a.sharedCooldown.ms)}.` : '.');
    rules[a.id] = burstRule(b.name, `${statsText(aura.selfStatBonuses)} for ${secs(aura.durationMs)}`, cooldown, a.cooldownMs);
  }
  return rules;
}

/** The author's gear entries from the embedded records (the default catalog's item entries). */
export function authorGearEffects(): BuffDef[] {
  return deriveGearEffects(destructionEquipped, EMBEDDED_GEAR_EFFECT_SOURCE);
}

/**
 * The enabled entries of a setup, in fold order: the enabled gear-independent catalog entries (in
 * catalog order; catalog entries with a gear effect id are ignored: the gear decides those), then
 * the enabled entries derived from the config's gear (`deriveGearEffects` of `config.gear`, the
 * author's gear when absent, from `db`, or from the embedded author records without it: other
 * items are unknown then), in derivation order. An item action past the ITEM_SLOT_COUNT-th (in that order) is not bound: its
 * entry is left out entirely (no action, no aura) and listed in `unbound`.
 */
export function enabledSetupEntries(
  catalog: readonly BuffDef[],
  config: Pick<SetupConfig, 'enabledBuffs' | 'gear'>,
  db?: ItemDb | null,
): { enabled: BuffDef[]; gearEntries: BuffDef[]; unbound: BuffDef[] } {
  const enabledIds = new Set(config.enabledBuffs);
  const gearEntries = deriveGearEffects(config.gear ?? destructionEquipped, db ?? EMBEDDED_GEAR_EFFECT_SOURCE);
  const candidates = [
    ...catalog.filter((b) => !isGearEffectId(b.id) && enabledIds.has(b.id)),
    ...gearEntries.filter((b) => enabledIds.has(b.id)),
  ];
  const enabled: BuffDef[] = [];
  const unbound: BuffDef[] = [];
  let actions = 0;
  for (const b of candidates) {
    if (b.effect.action && ++actions > ITEM_SLOT_COUNT) unbound.push(b);
    else enabled.push(b);
  }
  return { enabled, gearEntries, unbound };
}
