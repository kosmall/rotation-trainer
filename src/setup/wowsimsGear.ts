// Gear import and export in the wowsims formats (stage 2a, design spec §3). Pure and
// framework-free: nothing here throws, mutates its inputs or the item database, or applies
// anything (the caller decides; stage 2b applies the talents).
//
// Import accepts two shapes:
// - the WowSimsExporter addon export (the author's: docs/samples/wowsimsexporter-destruction-
//   warlock.json): top-level `name`, `realm`, `race`, `class`, `spec`, `level`, `talents`,
//   `professions` [{ name, level }], `version` and `gear: { items: [...] }`. The fields are the
//   ones wowsims reads: github.com/wowsims/tbc-new @ 91f869a ui/features/import-export/importers/
//   addon.ts (`importJson['class' | 'race' | 'professions' | 'talents' | 'level' | 'gear']`,
//   `gear.items` with null entries for empty slots and `gem || 0` for empty sockets);
// - the wowsims `*.gear.json` shape (ui/specs/<class>/<spec>/gear_sets/*.gear.json, and what
//   `exportWowSimsGear` writes): `{ items: [...] }`, `{}` for an empty slot.
// An item entry is `{ id, enchant?, gems? }`; a gem 0 (or null) is an empty socket.

import { ITEM_SLOTS, logicalSlot, PROFESSION_NAMES } from '../data/items/db';
import type { ItemDb } from '../data/items/types';
import { gemFitsSocket } from '../engine/gear';
import type { EquippedItem } from '../engine/types';
import { describeGear, normalizeGear } from './gear';

/** Longest accepted import text (characters). The author's export is 967. */
export const IMPORT_MAX_CHARS = 200_000;
/** Most entries of an `items` list that are read (a gear has 17). */
const MAX_ENTRIES = 64;
/** Most gems read per entry (a TBC item has at most 3 sockets; the rest are counted as extra). */
const MAX_GEMS = 16;

export interface ImportResult {
  /** At least one known item was placed; when false, `gear` is empty and must not be applied. */
  ok: boolean;
  /** 17 entries in `ITEM_SLOTS` order, already through `normalizeGear`; fresh objects. */
  gear: (EquippedItem | null)[];
  /** The export's talent string, untouched (digits and dashes only, else left out). */
  talents?: string;
  /** The export's race as written (e.g. 'Gnome'). */
  race?: string;
  /** 'Name-Realm' (or the name alone) of the exported character. */
  character?: string;
  /** Ids not in the item database (each once, in order of appearance); their slots or sockets stay empty. */
  unknown: { items: number[]; gems: number[]; enchants: number[] };
  /** Readable problems: unknown ids, misfits, race/class/level, professions, faction, inactive meta. */
  warnings: string[];
}

/** The trainer's character: level 70 Gnome warlock (destruction.ts base stats). */
const TRAINER_RACE = 'gnome';
const TRAINER_CLASS = 'warlock';
const TRAINER_LEVEL = 70;
const TALENTS = /^[0-9-]{1,128}$/;

const MAIN_HAND = ITEM_SLOTS.indexOf('mainHand');
const OFF_HAND = ITEM_SLOTS.indexOf('offHand');

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
/** An own property only (nothing inherited, such as `__proto__` or `constructor`). */
const own = (o: Rec, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);
/** A database id: a positive safe integer (0 is "none" in the wowsims formats). */
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const has = (table: object, id: number): boolean => Object.hasOwn(table, id);
/** A short string field (trimmed), or undefined. */
function shortString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : undefined;
}

/** An entry as read from the text: ids only, gems with 0 for an empty socket. */
interface RawEntry {
  id: number;
  enchant?: number;
  gems: number[];
}

const emptyGear = (): (EquippedItem | null)[] => ITEM_SLOTS.map(() => null);

function failed(warnings: string[], unknown: ImportResult['unknown'] = { items: [], gems: [], enchants: [] }): ImportResult {
  return { ok: false, gear: emptyGear(), unknown, warnings };
}

/** The `items` list: top-level `items`, or `gear.items` (the addon). */
function findItems(root: Rec): unknown[] | undefined {
  const items = own(root, 'items');
  if (Array.isArray(items)) return items;
  const gear = own(root, 'gear');
  if (isRecord(gear)) {
    const nested = own(gear, 'items');
    if (Array.isArray(nested)) return nested;
  }
  return undefined;
}

/** null: an empty slot (null, `{}`, id 0) or a malformed entry (`malformed` is then set). */
function readEntry(raw: unknown): { entry: RawEntry | null; malformed: boolean } {
  if (raw === null || raw === undefined) return { entry: null, malformed: false };
  if (!isRecord(raw)) return { entry: null, malformed: true };
  const id = own(raw, 'id');
  if (id === undefined || id === 0) return { entry: null, malformed: false };
  if (!isId(id)) return { entry: null, malformed: true };
  const entry: RawEntry = { id, gems: [] };
  const enchant = own(raw, 'enchant');
  if (isId(enchant)) entry.enchant = enchant;
  const gems = own(raw, 'gems');
  if (Array.isArray(gems)) {
    for (let g = 0; g < Math.min(gems.length, MAX_GEMS); g++) {
      const gem: unknown = gems[g];
      entry.gems.push(isId(gem) ? gem : 0);
    }
  }
  return { entry, malformed: false };
}

/** Professions the export lists (proto ids), or undefined when it lists none (gear.json shape). */
function readProfessions(v: unknown): Set<number> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = new Set<number>();
  for (const p of v.slice(0, 16)) {
    const name = isRecord(p) ? shortString(own(p, 'name'), 32)?.toLowerCase() : undefined;
    const id = Object.entries(PROFESSION_NAMES).find(([, n]) => n.toLowerCase() === name)?.[0];
    if (id !== undefined) out.add(Number(id));
  }
  return out;
}

function pushUnique(list: number[], id: number): void {
  if (!list.includes(id)) list.push(id);
}

/**
 * Parses a WowSimsExporter export or a wowsims `*.gear.json` into a gear for the trainer.
 * Never throws, whatever `text` is.
 * - Not a string, longer than `IMPORT_MAX_CHARS`, not JSON, not a JSON object (an array, a
 *   number, null), no `items`/`gear.items` array, or no known item: `ok` false, empty gear.
 * - Placement: a list of exactly 17 entries is read in slot order (`ITEM_SLOTS`, the addon's
 *   order; an item in the wrong slot leaves it empty, with a warning). Any other length: each
 *   known item goes into the first free slot of its database slot (rings and trinkets fill
 *   finger1/finger2 and trinket1/trinket2 in list order), as wowsims `lookupEquipmentSpec`
 *   does; an item with no free slot is skipped with a warning. At most 64 entries are read.
 * - Then `normalizeGear` (src/setup/gear.ts): unknown or misfit ids are dropped, a staff empties
 *   the off hand, a second unique item is dropped; each drop of a known id gets a warning.
 *   Unknown ids are listed in `unknown`.
 * - Empty sockets: gem 0 or null (the WowSimsExporter convention).
 * - `talents` (kept untouched: stage 2b applies it), `race`, `character` are returned; a race
 *   other than Gnome, another class or a level other than 70 gives a warning (the trainer's
 *   stats are a level 70 Gnome warlock's). Professions: when the export lists them, an item,
 *   gem or enchant needing another profession gives a warning. `describeGear` warnings (Horde-only
 *   items) and an inactive meta gem are added.
 */
export function parseWowSimsExport(text: string, db: ItemDb): ImportResult {
  try {
    return parse(text, db);
  } catch {
    // Nothing above is expected to throw; a failure is still only a failed import.
    return failed(['The import could not be read.']);
  }
}

function parse(text: unknown, db: ItemDb): ImportResult {
  if (typeof text === 'string' && text.length > IMPORT_MAX_CHARS) {
    return failed([`The text is longer than ${IMPORT_MAX_CHARS} characters; a gear export is far shorter.`]);
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return failed(['Nothing to import: paste a WowSimsExporter export or a wowsims gear file (JSON).']);
  }
  let root: unknown;
  try {
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // a copied file may start with a BOM
  } catch {
    return failed(['The text is not valid JSON: paste the whole export.']);
  }
  if (!isRecord(root)) return failed(['The text is not a gear export: expected a JSON object with an "items" list.']);
  const items = findItems(root);
  if (items === undefined) return failed(['No "items" or "gear.items" list in the text.']);

  const warnings: string[] = [];
  const unknown: ImportResult['unknown'] = { items: [], gems: [], enchants: [] };

  // Character fields.
  const talentsRaw = own(root, 'talents');
  const talents = typeof talentsRaw === 'string' && TALENTS.test(talentsRaw) ? talentsRaw : undefined;
  const race = shortString(own(root, 'race'), 32);
  const name = shortString(own(root, 'name'), 64);
  const realm = shortString(own(root, 'realm'), 64);
  const character = name === undefined ? undefined : realm === undefined ? name : `${name}-${realm}`;
  const cls = shortString(own(root, 'class'), 32);
  const level = own(root, 'level');
  const professions = readProfessions(own(root, 'professions'));

  if (race !== undefined && race.toLowerCase() !== TRAINER_RACE) {
    warnings.push(
      `The export's race is ${race}; the trainer's character is a Gnome (its base stats and racial bonuses), so the stats can differ from the game.`,
    );
  }
  if (cls !== undefined && cls.toLowerCase() !== TRAINER_CLASS) {
    warnings.push(`The export is of a ${cls}, not a warlock: only items a warlock can wear are in the item database.`);
  }
  if (typeof level === 'number' && Number.isSafeInteger(level) && level !== TRAINER_LEVEL) {
    warnings.push(`The character is level ${level}; the trainer models level ${TRAINER_LEVEL}.`);
  }

  // Entries.
  if (items.length > MAX_ENTRIES) warnings.push(`Only the first ${MAX_ENTRIES} of ${items.length} entries were read.`);
  const entries: (RawEntry | null)[] = [];
  let malformed = 0;
  for (const raw of items.slice(0, MAX_ENTRIES)) {
    const r = readEntry(raw);
    if (r.malformed) malformed++;
    entries.push(r.entry);
    if (r.entry === null) continue;
    if (!has(db.items, r.entry.id)) pushUnique(unknown.items, r.entry.id);
    if (r.entry.enchant !== undefined && !has(db.enchants, r.entry.enchant)) pushUnique(unknown.enchants, r.entry.enchant);
    for (const g of r.entry.gems) if (g !== 0 && !has(db.gems, g)) pushUnique(unknown.gems, g);
  }
  if (malformed > 0) warnings.push(`${malformed} malformed ${malformed === 1 ? 'entry was' : 'entries were'} skipped.`);

  // Placement.
  // A full-length list is placed by position (the addon's order) as long as every known item fits
  // the slot it sits in; otherwise (a list in another order) every item goes by its own slot.
  const fitsSlot = (e: RawEntry | null, i: number) => {
    if (e === null || !has(db.items, e.id)) return true;
    return db.items[e.id]!.slot === logicalSlot(ITEM_SLOTS[i]!);
  };
  const byOrder = entries.length === ITEM_SLOTS.length && entries.every(fitsSlot);
  const placed: (RawEntry | null)[] = ITEM_SLOTS.map(() => null);
  if (byOrder) {
    entries.forEach((e, i) => (placed[i] = e));
  } else {
    for (const e of entries) {
      if (e === null || !has(db.items, e.id)) continue;
      const item = db.items[e.id]!;
      const free = ITEM_SLOTS.findIndex((key, i) => logicalSlot(key) === item.slot && placed[i] === null);
      if (free < 0) warnings.push(`${item.name}: no free ${item.slot} slot; not equipped.`);
      else placed[free] = e;
    }
  }

  const gear = normalizeGear(
    placed.map((e) => (e === null ? null : { id: e.id, enchant: e.enchant, gems: e.gems.slice() })),
    db,
  );

  if (unknown.items.length > 0) {
    warnings.push(`Items not in the item database (their slots are left empty): ${unknown.items.join(', ')}.`);
  }
  if (unknown.gems.length > 0) {
    warnings.push(`Gems not in the item database (their sockets are left empty): ${unknown.gems.join(', ')}.`);
  }
  if (unknown.enchants.length > 0) {
    warnings.push(`Enchants not in the item database (left out): ${unknown.enchants.join(', ')}.`);
  }

  const ok = gear.some((e) => e !== null);
  if (!ok) return { ...failed([...warnings, 'Nothing to import: no item of the text is in the item database.'], unknown), ...meta() };

  warnings.push(...dropWarnings(placed, gear, db));

  // Professions (only when the export lists them), faction, meta gem.
  if (professions !== undefined) {
    const needs = new Set<string>();
    const check = (what: string, profession: number | undefined) => {
      if (profession !== undefined && !professions.has(profession)) {
        needs.add(`${what} needs ${PROFESSION_NAMES[profession] ?? 'a profession'}, which the export does not list.`);
      }
    };
    for (const e of gear) {
      if (e === null) continue;
      const item = db.items[e.id]!;
      check(item.name, item.requiredProfession);
      if (e.enchant !== undefined) check(db.enchants[e.enchant]!.name, db.enchants[e.enchant]!.requiredProfession);
      for (const g of e.gems ?? []) if (g !== 0) check(db.gems[g]!.name, db.gems[g]!.requiredProfession);
    }
    warnings.push(...needs);
  }
  const description = describeGear(gear, db);
  warnings.push(...description.warnings);
  const metaSocketed = gear.some((e) => e !== null && (e.gems ?? []).some((g) => g !== 0 && db.gems[g]?.color === 'meta'));
  if (metaSocketed && !description.metaActive) {
    warnings.push('The meta gem is inactive: its colour requirement is not met, so it gives nothing.');
  }

  // Each warning once (a long list can repeat an item).
  return { ok: true, gear, ...meta(), unknown, warnings: [...new Set(warnings)] };

  function meta(): Pick<ImportResult, 'talents' | 'race' | 'character'> {
    const out: Pick<ImportResult, 'talents' | 'race' | 'character'> = {};
    if (talents !== undefined) out.talents = talents;
    if (race !== undefined) out.race = race;
    if (character !== undefined) out.character = character;
    return out;
  }
}

/** A warning for each known id of `placed` that `normalizeGear` left out of `gear`. */
function dropWarnings(placed: readonly (RawEntry | null)[], gear: readonly (EquippedItem | null)[], db: ItemDb): string[] {
  const out: string[] = [];
  placed.forEach((e, i) => {
    if (e === null || !has(db.items, e.id)) return;
    const item = db.items[e.id]!;
    const slot = ITEM_SLOTS[i]!;
    const result = gear[i];
    if (!result) {
      if (item.slot !== logicalSlot(slot)) {
        out.push(`${item.name}: not a ${slot} item; the ${slot} slot is left empty.`);
      } else if (i === OFF_HAND && gear[MAIN_HAND] && db.items[gear[MAIN_HAND].id]?.twoHand === true) {
        out.push(`${item.name}: not equipped: the staff in the main hand takes both hands.`);
      } else {
        out.push(`${item.name}: not equipped: a second unique item (or a second ring of its kind).`);
      }
      return;
    }
    if (e.enchant !== undefined && has(db.enchants, e.enchant) && result.enchant === undefined) {
      out.push(`${db.enchants[e.enchant]!.name} does not fit ${item.name}; left out.`);
    }
    const sockets = item.sockets ?? [];
    sockets.forEach((socket, g) => {
      const gemId = e.gems[g];
      if (!isId(gemId) || !has(db.gems, gemId) || result.gems?.[g] === gemId) return;
      const gem = db.gems[gemId]!;
      out.push(
        gemFitsSocket(gem.color, socket)
          ? `${gem.name} in ${item.name}: a unique gem already socketed; the socket is left empty.`
          : `${gem.name} does not fit socket ${g + 1} of ${item.name}; the socket is left empty.`,
      );
    });
    const extra = e.gems.slice(sockets.length).filter((g) => g !== 0).length;
    if (extra > 0) out.push(`${item.name}: ${extra} ${extra === 1 ? 'gem' : 'gems'} beyond its sockets dropped.`);
  });
  return out;
}

/**
 * The gear as a wowsims `*.gear.json` (the layout of ui/specs/warlock/dps/gear_sets: tabs, one
 * entry per line, `{}` for an empty slot, `enchant` and `gems` only when set, 0 for an empty
 * socket before a filled one). `parseWowSimsExport` reads it back to the same gear. Pure.
 */
export function exportWowSimsGear(gear: readonly (EquippedItem | null)[]): string {
  const lines = gear.map((e) => {
    if (!e || !isId(e.id)) return '{}';
    const parts = [`"id": ${e.id}`];
    if (isId(e.enchant)) parts.push(`"enchant": ${e.enchant}`);
    const gems = (Array.isArray(e.gems) ? e.gems : []).map((g) => (isId(g) ? g : 0));
    while (gems.length > 0 && gems[gems.length - 1] === 0) gems.pop();
    if (gems.length > 0) parts.push(`"gems": [${gems.join(', ')}]`);
    return `{ ${parts.join(', ')} }`;
  });
  if (lines.length === 0) return '{\n\t"items": []\n}\n';
  return `{\n\t"items": [\n${lines.map((l) => `\t\t${l}`).join(',\n')}\n\t]\n}\n`;
}
