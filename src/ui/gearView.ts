// What the Gear panel shows about items, gems and enchants: slot labels, short stat texts, the
// picker candidates (only what the trainer models), markers, the meta gem status and the notes
// about the setup's item buffs. Pure; nothing here mutates its inputs or the item database.

import type { GearPreset } from '../data/classes/warlock/gearPresets';
import { MODELLED_ITEM_EFFECTS, metaGemModifiers } from '../data/classes/warlock/items';
import { ITEM_SLOTS, professionName } from '../data/items/db';
import type { EnchantRecord, GemRecord, ItemDb, ItemRecord, SlotKey } from '../data/items/types';
import type { BuffDef } from '../data/types';
import { countGemColor, gemFitsSocket, metaRequirementMet, type MetaColorCounts } from '../engine/gear';
import type { EquippedItem, GemColor, RawStats } from '../engine/types';

type GearList = readonly (EquippedItem | null)[];

/** The slot names the panel shows, in `ITEM_SLOTS` order. */
export const SLOT_LABELS: Readonly<Record<SlotKey, string>> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  back: 'Back',
  chest: 'Chest',
  wrist: 'Wrist',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger1: 'Finger 1',
  finger2: 'Finger 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  ranged: 'Ranged',
};

/** The label of slot index `i` of a gear. */
export const slotLabel = (i: number): string => SLOT_LABELS[ITEM_SLOTS[i]!];

/** The stats the trainer models, in the order the panel lists them, with their short names. */
const STAT_LABELS: readonly (readonly [keyof RawStats, string])[] = [
  ['spellPower', 'SP'],
  ['shadowPower', 'shadow SP'],
  ['firePower', 'fire SP'],
  ['critRating', 'crit'],
  ['hitRating', 'hit'],
  ['hasteRating', 'haste'],
  ['intellect', 'Int'],
  ['spirit', 'Spi'],
  ['mp5', 'mp5'],
];

/** "+63 SP, +32 crit, +16 hit, +36 Int" ('' when nothing the trainer models). */
export function statsText(stats: Partial<RawStats> | undefined): string {
  if (!stats) return '';
  return STAT_LABELS.flatMap(([key, label]) => {
    const v = stats[key];
    return typeof v === 'number' && v !== 0 ? [`${v > 0 ? '+' : ''}${v} ${label}`] : [];
  }).join(', ');
}

/** Any modelled stat other than zero. */
export const hasModelledStats = (stats: Partial<RawStats> | undefined): boolean => statsText(stats) !== '';

/** Gems of an entry with trailing empty sockets ignored (the normalized form trims them). */
function gemsOf(e: EquippedItem): number[] {
  const gems = [...(e.gems ?? [])];
  while (gems.length > 0 && gems[gems.length - 1] === 0) gems.pop();
  return gems;
}

/** The same entry: same item, enchant and gems (key order and an absent `gems` do not matter). */
export function sameEntry(a: EquippedItem | null | undefined, b: EquippedItem | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const ga = gemsOf(a);
  const gb = gemsOf(b);
  return a.id === b.id && (a.enchant ?? 0) === (b.enchant ?? 0) && ga.length === gb.length && ga.every((g, i) => g === gb[i]);
}

/** Deep equality of two gears (never `JSON.stringify`: key order differs between sources). */
export function sameGear(a: GearList, b: GearList): boolean {
  return a.length === b.length && a.every((e, i) => sameEntry(e, b[i]));
}

/** The first preset whose gear equals `gear`, or undefined ("Custom"). */
export function matchingPreset(gear: GearList, presets: readonly GearPreset[]): GearPreset | undefined {
  return presets.find((p) => sameGear(p.gear, gear));
}

/** A profession's name (src/data/items/db.ts, shared with the importer). */
export { professionName };

/** The item has an effect the trainer does not model (the Icon and the Band are modelled by the setup). */
export const hasUnmodelledEffect = (item: ItemRecord): boolean =>
  (item.effects?.length ?? 0) > 0 && !Object.hasOwn(MODELLED_ITEM_EFFECTS, item.id);

/** Nothing but an effect (no modelled stat): hidden from the item picker unless asked for. */
export const isEffectOnly = (item: ItemRecord): boolean => !hasModelledStats(item.stats) && (item.effects?.length ?? 0) > 0;

/** Short markers of an item: faction, profession, effects. */
export function itemMarkers(item: ItemRecord): string[] {
  const out: string[] = [];
  if (item.faction === 'horde') out.push('Horde only');
  if (item.faction === 'alliance') out.push('Alliance only');
  if (item.requiredProfession !== undefined) out.push(professionName(item.requiredProfession));
  if (hasUnmodelledEffect(item)) out.push('Effect not modelled');
  else if (Object.hasOwn(MODELLED_ITEM_EFFECTS, item.id)) out.push('Effect: Setup panel');
  return out;
}

/** Whether an enchant fits an item (`normalizeGear`'s rule: slot or extra slot; a 2H enchant on a staff only). */
export function enchantFits(enchant: EnchantRecord, item: ItemRecord): boolean {
  const slots = [enchant.slot, ...(enchant.extraSlots ?? [])];
  return slots.includes(item.slot) && (!enchant.twoHandOnly || item.twoHand === true);
}

/** Every enchant that fits the item (modelled or not): whether the slot takes an enchant at all. */
export const anyEnchantFits = (item: ItemRecord, db: ItemDb): boolean =>
  Object.values(db.enchants).some((e) => enchantFits(e, item));

/** The enchants offered for an item: they fit and give a modelled stat; by name. */
export function enchantsForItem(item: ItemRecord, db: ItemDb): EnchantRecord[] {
  return Object.values(db.enchants)
    .filter((e) => enchantFits(e, item) && hasModelledStats(e.stats))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

/** A gem the trainer models: a stat, or a hand-modelled meta effect (items.ts `metaGemModifiers`). */
export const gemIsModelled = (gem: GemRecord): boolean =>
  hasModelledStats(gem.stats) || Object.hasOwn(metaGemModifiers, gem.id);

/** The gems offered for a socket: they fit it (meta only in a meta socket) and are modelled. */
export function gemsForSocket(socket: GemColor, db: ItemDb): GemRecord[] {
  return Object.values(db.gems).filter((g) => gemFitsSocket(g.color, socket) && gemIsModelled(g));
}

const PRIMARY = ['red', 'blue', 'yellow'] as const;

/** "at least 2 blue gems", "more blue than yellow gems". */
function requirementText(gem: GemRecord): string {
  const parts = PRIMARY.flatMap((c) => {
    const n = gem.metaRequires?.[c];
    return n ? [`at least ${n} ${c}`] : [];
  });
  if (gem.metaCompare) parts.push(`more ${gem.metaCompare.more} than ${gem.metaCompare.than}`);
  return parts.length === 0 ? 'no requirement' : `${parts.join(' and ')} gems`;
}

/** The meta gem line: which meta gem, whether its requirement holds and why. Null without a meta socket. */
export function metaStatus(gear: GearList, db: ItemDb): { active: boolean; text: string } | null {
  const counts: MetaColorCounts = { red: 0, blue: 0, yellow: 0 };
  let meta: GemRecord | undefined;
  let metaSocket = false;
  gear.forEach((e) => {
    const item = e && Object.hasOwn(db.items, e.id) ? db.items[e.id]! : undefined;
    if (!e || !item) return;
    (item.sockets ?? []).forEach((socket, i) => {
      if (socket === 'meta') metaSocket = true;
      const id = e.gems?.[i];
      const gem = id && Object.hasOwn(db.gems, id) ? db.gems[id]! : undefined;
      if (!gem || !gemFitsSocket(gem.color, socket)) return;
      if (gem.color === 'meta') meta ??= gem;
      else countGemColor(counts, gem.color);
    });
  });
  if (!metaSocket) return null;
  if (!meta) return { active: false, text: 'Meta socket empty.' };
  const active = metaRequirementMet(meta, counts);
  const socketed = `socketed: ${counts.red} red, ${counts.blue} blue, ${counts.yellow} yellow`;
  return {
    active,
    text: active
      ? `${meta.name}: active (needs ${requirementText(meta)}; ${socketed}).`
      : `${meta.name}: inactive, gives nothing (needs ${requirementText(meta)}; ${socketed}).`,
  };
}

/** Professions the gear needs, one line per profession: "Enchanting: Enchant Ring - Spellpower (2)". */
export function professionNotes(gear: GearList, db: ItemDb): string[] {
  const by = new Map<number, Map<string, number>>();
  const add = (p: number | undefined, name: string) => {
    if (p === undefined) return;
    const names = by.get(p) ?? new Map<string, number>();
    names.set(name, (names.get(name) ?? 0) + 1);
    by.set(p, names);
  };
  for (const e of gear) {
    if (!e || !Object.hasOwn(db.items, e.id)) continue;
    const item = db.items[e.id]!;
    add(item.requiredProfession, item.name);
    if (e.enchant !== undefined && Object.hasOwn(db.enchants, e.enchant)) {
      const en = db.enchants[e.enchant]!;
      add(en.requiredProfession, en.name);
    }
    for (const g of e.gems ?? []) {
      if (g !== 0 && Object.hasOwn(db.gems, g)) add(db.gems[g]!.requiredProfession, db.gems[g]!.name);
    }
  }
  return [...by.entries()].map(
    ([p, names]) =>
      `Needs ${professionName(p)}: ${[...names.entries()].map(([n, c]) => (c > 1 ? `${n} (${c})` : n)).join(', ')}.`,
  );
}

/**
 * The setup's item buffs (Icon of the Silver Crescent, Band of the Eternal Sage) are enabled in
 * the Setup panel, independently of the gear: a warning for each one enabled while its item is not
 * worn, a hint for each worn item whose effect is not enabled.
 */
export function itemBuffNotes(
  gear: GearList,
  enabledBuffs: readonly string[],
  catalog: readonly BuffDef[],
  itemName: (id: number) => string,
): { warnings: string[]; hints: string[] } {
  const warnings: string[] = [];
  const hints: string[] = [];
  for (const [itemId, buffId] of Object.entries(MODELLED_ITEM_EFFECTS)) {
    const id = Number(itemId);
    const buff = catalog.find((b) => b.id === buffId);
    if (!buff) continue;
    const worn = gear.some((e) => e?.id === id);
    const enabled = enabledBuffs.includes(buffId);
    if (enabled && !worn) {
      warnings.push(`${buff.name} is enabled in the Setup panel but ${itemName(id)} is not worn: the fight still counts its effect.`);
    } else if (worn && !enabled) {
      hints.push(`${itemName(id)}: its effect counts only when enabled in Setup, Items and cooldowns.`);
    }
  }
  return { warnings, hints };
}
