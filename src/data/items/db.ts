import type { ItemDb, ItemRecord, ItemSlot, SlotKey } from './types';

/** The 17 equipment slots in WowSimsExporter order. */
export const ITEM_SLOTS: readonly SlotKey[] = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'mainHand',
  'offHand',
  'ranged',
];

/** Every logical slot an item or enchant record can carry. */
export const LOGICAL_SLOTS: readonly ItemSlot[] = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger',
  'trinket',
  'mainHand',
  'offHand',
  'ranged',
];

/** The logical slot of a slot key: finger1/finger2 -> finger, trinket1/trinket2 -> trinket. */
export function logicalSlot(key: SlotKey): ItemSlot {
  if (key === 'finger1' || key === 'finger2') return 'finger';
  if (key === 'trinket1' || key === 'trinket2') return 'trinket';
  return key;
}

/** The items that fit a slot key (rings and trinkets fit both of their slots), by phase then name. */
export function itemsForSlot(db: ItemDb, key: SlotKey): ItemRecord[] {
  const slot = logicalSlot(key);
  return Object.values(db.items)
    .filter((item) => item.slot === slot)
    .sort((a, b) => a.phase - b.phase || a.name.localeCompare(b.name) || a.id - b.id);
}

let pending: Promise<ItemDb> | undefined;

/**
 * Loads the item database (src/data/items/db.json) as a separate lazy chunk; later calls return
 * the same promise. The data is shared: callers must not mutate it.
 */
export function loadItemDb(): Promise<ItemDb> {
  pending ??= import('./db.json').then((m) => m.default as unknown as ItemDb);
  return pending;
}
