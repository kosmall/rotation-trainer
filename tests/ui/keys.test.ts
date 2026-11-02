import { expect, it } from 'vitest';
import { ITEM_SLOT_COUNT, SPELL_SLOT_COUNT } from '../../src/data/types';
import { ITEM_SLOT_KEYS, SLOT_KEYS, SPELL_SLOT_KEYS, keyToSlot } from '../../src/ui/keys';

it('keyToSlot maps 1..9, 0, -, = and ignores others', () => {
  for (let n = 1; n <= 9; n++) expect(keyToSlot(String(n))).toBe(n - 1);
  expect(keyToSlot('0')).toBe(9);
  expect(keyToSlot('-')).toBe(10);
  expect(keyToSlot('=')).toBe(11);
  for (const key of ['a', 'R', 'r', ' ', 'Escape', 'Enter', '_', '+', 'F1', '10', '', 'Digit1', 'KeyZ', 'zz']) {
    expect(keyToSlot(key)).toBeUndefined();
  }
});

it('the item row: Z X C V B N are slots 12-17, upper case too (Caps Lock, Shift)', () => {
  expect(SPELL_SLOT_KEYS).toHaveLength(SPELL_SLOT_COUNT);
  expect(ITEM_SLOT_COUNT).toBe(6);
  expect(ITEM_SLOT_KEYS).toEqual(['z', 'x', 'c', 'v', 'b', 'n']);
  expect(ITEM_SLOT_KEYS).toHaveLength(ITEM_SLOT_COUNT);
  expect(SLOT_KEYS).toEqual([...SPELL_SLOT_KEYS, ...ITEM_SLOT_KEYS]);
  expect(SLOT_KEYS).toHaveLength(18);
  ['z', 'x', 'c', 'v', 'b', 'n'].forEach((key, i) => {
    expect(keyToSlot(key)).toBe(SPELL_SLOT_COUNT + i);
    expect(keyToSlot(key.toUpperCase())).toBe(SPELL_SLOT_COUNT + i);
  });
});
