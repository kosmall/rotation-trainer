/** Action bar hotkeys, slot 0 first: keys 1-9, 0, -, = (the default WoW action bar). */
export const SLOT_KEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

/** The action bar slot for a `KeyboardEvent.key`, or undefined when the key is not a slot key. */
export function keyToSlot(key: string): number | undefined {
  const slot = SLOT_KEYS.indexOf(key);
  return slot === -1 ? undefined : slot;
}
