import { expect, it } from 'vitest';
import { keyToSlot } from '../../src/ui/keys';

it('keyToSlot maps 1..9, 0, -, = and ignores others', () => {
  for (let n = 1; n <= 9; n++) expect(keyToSlot(String(n))).toBe(n - 1);
  expect(keyToSlot('0')).toBe(9);
  expect(keyToSlot('-')).toBe(10);
  expect(keyToSlot('=')).toBe(11);
  for (const key of ['a', 'R', ' ', 'Escape', 'Enter', '_', '+', 'F1', '10', '', 'Digit1']) {
    expect(keyToSlot(key)).toBeUndefined();
  }
});
