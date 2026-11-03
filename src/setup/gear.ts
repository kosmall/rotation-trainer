// Gear in the setup (stage 2a, design spec §3): the default gear, the validation of untrusted
// gear (stored JSON, presets, imports, UI edits) against the item database, and what the UI
// reports about a gear (unmodelled effects and sets, the meta gem, socket bonuses). Pure and
// framework-free; nothing here throws or mutates its inputs.

import { destructionEquipped, AUTHOR_GEAR_TABLES } from '../data/classes/warlock/destruction';
import { metaGemModifiers } from '../data/classes/warlock/items';
import { UNMODELLED_SETS, WARLOCK_SET_BONUSES } from '../data/classes/warlock/sets';
import { deepFreeze } from '../data/common/buffs';
import { ITEM_SLOTS, logicalSlot } from '../data/items/db';
import type { ItemDb, ItemRecord, SlotKey } from '../data/items/types';
import { countGemColor, gemFitsSocket, metaRequirementMet, socketMatches, type MetaColorCounts } from '../engine/gear';
import type { EquippedItem, GemDef, RawStats } from '../engine/types';
import { ITEM_SLOT_COUNT, type BuffDef } from '../data/types';
import { enabledSetupEntries, hasModelledGearEffect } from './gearEffects';
import type { SetupConfig } from './types';

/** A gear: one entry per slot of `ITEM_SLOTS` (WowSimsExporter order), null for an empty slot. */
export type Gear = (EquippedItem | null)[];

/** Most sockets a TBC item has (`normalizeGearShape` keeps no more gems than this). */
const MAX_SOCKETS = 3;

/**
 * The author's gear (`destructionEquipped`, the export's 17 entries): the gear of a setup without
 * `gear` (`setupGear`), of a wrong-length or non-array stored gear, and of the presets. Deep-frozen.
 */
export const DEFAULT_GEAR: readonly EquippedItem[] = deepFreeze(structuredClone(destructionEquipped));

/** A fresh, mutable copy of the default gear. */
const defaultGear = (): Gear => structuredClone(destructionEquipped);

/**
 * Rings that share a "Unique-Equipped: <category> (1)" limit: at most one of each category. The
 * item database does not carry the limit (Task 1 dropped `limitCategory`), so the 21 rings of the
 * database that have one are listed here: wowsims tbc-new @ 91f869a assets/database/db.json
 * `limitCategory` (475 Signet Ring of the Bronze Dragonflight, 495 Violet Signet (Karazhan),
 * 497 Band of Eternity (Hyjal)); Wowhead TBC item=29305 "Unique-Equipped: Band of Eternity (1)",
 * item=29287 "Unique-Equipped: Violet Signet (1)", item=21206 "Unique-Equipped: Signet Ring of
 * the Bronze Dragonflight (1)".
 */
export const RING_LIMIT_CATEGORIES: Readonly<Record<number, readonly number[]>> = deepFreeze({
  475: [21206, 21207, 21208, 21209, 21210],
  495: [29284, 29285, 29286, 29287, 29288, 29289, 29290, 29291],
  497: [29302, 29303, 29304, 29305, 29306, 29307, 29308, 29309],
});

const LIMIT_CATEGORY_OF: ReadonlyMap<number, number> = new Map(
  Object.entries(RING_LIMIT_CATEGORIES).flatMap(([category, ids]) => ids.map((id) => [id, Number(category)] as const)),
);

const MAIN_HAND = ITEM_SLOTS.indexOf('mainHand');
const OFF_HAND = ITEM_SLOTS.indexOf('offHand');

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
/** An own property only (nothing inherited, such as `__proto__` or `constructor`). */
const own = (o: Rec, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);
/** A database id: a positive safe integer (0 is "none" in the WowSimsExporter format). */
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
/** `id` is an own key of the table (never something inherited like `constructor`). */
const has = (table: object, id: number): boolean => Object.hasOwn(table, id);

/** Gems with trailing empty sockets (0) removed. */
function trimGems(gems: number[]): number[] {
  let end = gems.length;
  while (end > 0 && gems[end - 1] === 0) end--;
  return gems.slice(0, end);
}

/** What the earlier slots already hold (for the unique rules). */
interface Used {
  items: Set<number>;
  categories: Set<number>;
  gems: Set<number>;
}

function normalizeEntry(raw: unknown, slot: SlotKey, db: ItemDb, used: Used): EquippedItem | null {
  if (!isRecord(raw)) return null;
  const id = own(raw, 'id');
  if (!isId(id) || !has(db.items, id)) return null;
  const item = db.items[id]!;
  if (item.slot !== logicalSlot(slot)) return null;
  if (item.unique && used.items.has(id)) return null;
  const category = LIMIT_CATEGORY_OF.get(id);
  if (category !== undefined && used.categories.has(category)) return null;
  used.items.add(id);
  if (category !== undefined) used.categories.add(category);

  const entry: EquippedItem = { id };

  const enchantId = own(raw, 'enchant');
  if (isId(enchantId) && has(db.enchants, enchantId)) {
    const enchant = db.enchants[enchantId]!;
    const slots = [enchant.slot, ...(enchant.extraSlots ?? [])];
    if (slots.includes(item.slot) && (!enchant.twoHandOnly || item.twoHand === true)) entry.enchant = enchantId;
  }

  const rawGems = own(raw, 'gems');
  const gems: number[] = [];
  const sockets = item.sockets ?? [];
  if (Array.isArray(rawGems)) {
    sockets.forEach((socket, i) => {
      const gemId: unknown = rawGems[i];
      const gem = isId(gemId) && has(db.gems, gemId) ? db.gems[gemId]! : undefined;
      if (!isId(gemId) || !gem || !gemFitsSocket(gem.color, socket) || (gem.unique && used.gems.has(gemId))) {
        gems.push(0);
        return;
      }
      if (gem.unique) used.gems.add(gemId);
      gems.push(gemId);
    });
  }
  entry.gems = trimGems(gems);
  return entry;
}

/**
 * Turns untrusted gear data into a valid gear for the item database. Never throws, never mutates
 * `input`, shares no object with it or with `DEFAULT_GEAR`; idempotent.
 * - Not an array of exactly 17 entries (undefined, null, a string, a wrong length), or a hostile
 *   getter anywhere: the default gear (`DEFAULT_GEAR`, a fresh copy).
 * - An entry that is not a plain object, whose `id` is not a positive integer, is not in the
 *   database, or does not fit the slot (rings and trinkets fit either of their two slots): null.
 * - A staff (`twoHand`) in the main hand empties the off hand.
 * - Unique items: a second copy is null (rings and trinkets included); rings sharing a limit
 *   category (`RING_LIMIT_CATEGORIES`): the second one is null. The earlier slot wins.
 * - `enchant`: kept only when it is in the database and fits the item's slot (`slot` or
 *   `extraSlots`: armour kits, Fortitude) and, for a 2H enchant (`twoHandOnly`), the item is a staff.
 * - `gems`: one per socket, in socket order; gems beyond the sockets are dropped; a gem that is not
 *   in the database, does not fit its socket (meta gems only in the meta socket, nothing else
 *   there) or repeats a unique gem of an earlier socket leaves the socket empty (0); trailing
 *   empty sockets are trimmed. Always present (`[]` for an item with no gem).
 * - Faction-only items are kept (`describeGear` warns about Horde-only ones; the trainer's
 *   character is a Gnome). Profession requirements are not checked.
 */
export function normalizeGear(input: unknown, db: ItemDb): Gear {
  try {
    if (!Array.isArray(input) || input.length !== ITEM_SLOTS.length) return defaultGear();
    const used: Used = { items: new Set(), categories: new Set(), gems: new Set() };
    const out: Gear = [];
    ITEM_SLOTS.forEach((slot, i) => {
      if (i === OFF_HAND) {
        const main = out[MAIN_HAND];
        if (main && db.items[main.id]?.twoHand === true) {
          out.push(null);
          return;
        }
      }
      out.push(normalizeEntry(input[i], slot, db, used));
    });
    return out;
  } catch {
    // A hostile getter or proxy: nothing of it is trusted.
    return defaultGear();
  }
}

/**
 * The database-free part of `normalizeGear`, for `normalizeSetup` before the item database has
 * loaded: an array of exactly 17 entries (else the default gear); each entry null or
 * `{ id, enchant?, gems }` with positive integer ids (`enchant` dropped otherwise; at most 3 gems,
 * a malformed gem becomes an empty socket 0, trailing ones trimmed); anything else null. Ids are
 * not checked against the database: `normalizeGear` does that once it is loaded. Never throws;
 * idempotent; `normalizeGear(normalizeGearShape(x), db)` equals `normalizeGear(x, db)` for every
 * well-formed entry.
 */
export function normalizeGearShape(input: unknown): Gear {
  try {
    if (!Array.isArray(input) || input.length !== ITEM_SLOTS.length) return defaultGear();
    return ITEM_SLOTS.map((_, i) => {
      const raw: unknown = input[i];
      if (!isRecord(raw)) return null;
      const id = own(raw, 'id');
      if (!isId(id)) return null;
      const entry: EquippedItem = { id };
      const enchant = own(raw, 'enchant');
      if (isId(enchant)) entry.enchant = enchant;
      const rawGems = own(raw, 'gems');
      const gems: number[] = [];
      if (Array.isArray(rawGems)) {
        for (let g = 0; g < Math.min(MAX_SOCKETS, rawGems.length); g++) {
          const gemId: unknown = rawGems[g];
          gems.push(isId(gemId) ? gemId : 0);
        }
      }
      entry.gems = trimGems(gems);
      return entry;
    });
  } catch {
    return defaultGear();
  }
}

/** The gear of a setup: its own, or the author's (`DEFAULT_GEAR`) when it has none (a stage 1.5 config). */
export function setupGear(config: Pick<SetupConfig, 'gear'>): readonly (EquippedItem | null)[] {
  return config.gear ?? DEFAULT_GEAR;
}

/**
 * Whether building this gear needs the item database: true when an item, gem or enchant id is
 * not in the embedded author tables (`AUTHOR_GEAR_TABLES`, items.ts). The author's gear (and any
 * subset of it) builds without waiting for the database chunk.
 */
export function gearNeedsDb(gear: readonly (EquippedItem | null)[]): boolean {
  const t = AUTHOR_GEAR_TABLES;
  return gear.some(
    (e) =>
      e !== null &&
      (!has(t.items, e.id) ||
        (e.enchant !== undefined && !has(t.enchants, e.enchant)) ||
        (e.gems ?? []).some((g) => g !== 0 && !has(t.gems, g))),
  );
}

/** What the UI shows about a gear (`describeGear`). */
export interface GearDescription {
  /**
   * One line per item or meta gem effect the trainer does not model ("<item>: <effect>"): the
   * items' text effects (`ItemRecord.effects`). Structured effects (`useEffects`/`procEffects`) are
   * modelled (src/setup/gearEffects.ts) and never listed here.
   */
  unmodelledEffects: string[];
  /** The worn items with a modelled effect (`hasModelledGearEffect`: what `deriveGearEffects` derives), by name, slot order. */
  modelledEffects: string[];
  /**
   * With `enabled`: one line per item action that does not fit the item row ("<entry>: not on
   * the item row (6 slots, all taken)"): the row takes every worn on-use effect (enabled or not),
   * then the enabled potions and rune (`itemRowOf`); one left off is not applied. Empty otherwise.
   */
  unboundItemEffects: string[];
  /** One line per worn set bonus that is not modelled ("<set> (<pieces>): <reason>"). */
  unmodelledSets: string[];
  /** A meta gem is socketed and its requirement holds (an inactive meta gem gives nothing). */
  metaActive: boolean;
  /** Every equipped item with a socket bonus, in slot order: is the bonus active? */
  socketBonuses: { slot: SlotKey; bonus: Partial<RawStats>; active: boolean }[];
  /** Other problems (a Horde-only item: the trainer's character is a Gnome, Alliance). */
  warnings: string[];
}

/**
 * Describes a (normalized) gear for the UI. Unknown ids are skipped. With `enabled` (the config's
 * enabled ids and the catalog) also the item actions left off the item row (`enabledSetupEntries`:
 * more than ITEM_SLOT_COUNT worn on-use effects and enabled potions and rune). Pure; never throws for a
 * normalized gear.
 */
export function describeGear(
  gear: readonly (EquippedItem | null)[],
  db: ItemDb,
  enabled?: { enabledBuffs: readonly string[]; catalog: readonly BuffDef[] },
): GearDescription {
  const unmodelledEffects: string[] = [];
  const modelledEffects: string[] = [];
  const warnings: string[] = [];
  const socketBonuses: GearDescription['socketBonuses'] = [];
  const counts: MetaColorCounts = { red: 0, blue: 0, yellow: 0 };
  const metaGems: GemDef[] = [];
  const setPieces = new Map<string, { name: string; count: number }>();

  gear.forEach((entry, i) => {
    if (entry === null || !has(db.items, entry.id)) return;
    const item: ItemRecord = db.items[entry.id]!;
    const slot = ITEM_SLOTS[i]!;
    if (item.setId !== undefined) {
      const s = setPieces.get(item.setId) ?? { name: item.setName ?? item.setId, count: 0 };
      s.count += 1;
      setPieces.set(item.setId, s);
    }
    for (const effect of item.effects ?? []) unmodelledEffects.push(`${item.name}: ${effect}`);
    if (hasModelledGearEffect(item)) modelledEffects.push(item.name);
    if (item.faction === 'horde') {
      warnings.push(`${item.name} is a Horde-only item; the trainer's character is a Gnome (Alliance).`);
    }
    const sockets = item.sockets ?? [];
    let allMatched = sockets.length > 0;
    sockets.forEach((socket, g) => {
      const gemId = entry.gems?.[g];
      const gem = gemId !== undefined && gemId !== 0 && has(db.gems, gemId) ? db.gems[gemId]! : undefined;
      if (!gem || !gemFitsSocket(gem.color, socket)) {
        allMatched = false;
        return;
      }
      if (!socketMatches(socket, gem.color)) allMatched = false;
      if (gem.color === 'meta') metaGems.push(gem);
      else countGemColor(counts, gem.color);
    });
    if (item.socketBonus && Object.keys(item.socketBonus).length > 0) {
      socketBonuses.push({ slot, bonus: { ...item.socketBonus }, active: allMatched });
    }
  });

  const activeMetas = metaGems.filter((m) => metaRequirementMet(m, counts));
  for (const m of activeMetas) {
    if (!has(metaGemModifiers, m.id)) {
      unmodelledEffects.push(`${m.name}: its effect beyond its stats is not modelled.`);
    }
  }

  const reviewed = new Set([...WARLOCK_SET_BONUSES, ...UNMODELLED_SETS].map((b) => b.setId));
  const unmodelledSets: string[] = [];
  for (const u of UNMODELLED_SETS) {
    if ((setPieces.get(u.setId)?.count ?? 0) >= u.pieces) unmodelledSets.push(`${u.name}: ${u.reason}`);
  }
  for (const [setId, { name, count }] of setPieces) {
    if (count >= 2 && !reviewed.has(setId)) {
      unmodelledSets.push(`${name} (${count} pieces): set bonuses not reviewed, not modelled.`);
    }
  }

  const unboundItemEffects =
    enabled === undefined
      ? []
      : enabledSetupEntries(enabled.catalog, { enabledBuffs: [...enabled.enabledBuffs], gear: [...gear] }, db).unbound.map(
          (b) => `${b.name}: not on the item row (${ITEM_SLOT_COUNT} slots, all taken)`,
        );

  return {
    unmodelledEffects,
    modelledEffects,
    unboundItemEffects,
    unmodelledSets,
    metaActive: activeMetas.length > 0,
    socketBonuses,
    warnings,
  };
}
