import { ITEM_SLOT_COUNT, SPELL_SLOT_COUNT } from '../data/types';

/** Spell row hotkeys, slot 0 first: keys 1-9, 0, -, = (the default WoW action bar). */
export const SPELL_SLOT_KEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

/** Item row hotkeys (slots 12-15: trinket, potion, rune actions of an applied setup). */
export const ITEM_SLOT_KEYS: readonly string[] = ['z', 'x', 'c', 'v'];

/** Every slot's hotkey, slot i at index i: the spell row, then the item row. */
export const SLOT_KEYS: readonly string[] = [...SPELL_SLOT_KEYS, ...ITEM_SLOT_KEYS];

if (SPELL_SLOT_KEYS.length !== SPELL_SLOT_COUNT || ITEM_SLOT_KEYS.length !== ITEM_SLOT_COUNT) {
  throw new Error('src/ui/keys.ts: slot keys do not match SPELL_SLOT_COUNT / ITEM_SLOT_COUNT');
}

/**
 * The action bar slot for a `KeyboardEvent.key`, or undefined when the key is not a slot key. A
 * single letter counts in either case (Caps Lock or Shift give 'Z').
 */
export function keyToSlot(key: string): number | undefined {
  const slot = SLOT_KEYS.indexOf(key.length === 1 ? key.toLowerCase() : key);
  return slot === -1 ? undefined : slot;
}
