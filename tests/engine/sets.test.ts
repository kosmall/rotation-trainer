import { describe, expect, it } from 'vitest';
import { activeSetBonuses } from '../../src/engine/sets';
import type { SetBonusDef } from '../../src/engine/types';

const A2: SetBonusDef = { setId: 'a', name: 'A2', pieces: 2, description: 'a two' };
const A4: SetBonusDef = { setId: 'a', name: 'A4', pieces: 4, description: 'a four' };
const B2: SetBonusDef = { setId: 'b', name: 'B2', pieces: 2, description: 'b two' };
const sets = [A2, A4, B2];

describe('activeSetBonuses', () => {
  it('0 and 1 piece: nothing', () => {
    expect(activeSetBonuses(sets, { a: 0 })).toEqual([]);
    expect(activeSetBonuses(sets, { a: 1 })).toEqual([]);
  });

  it('exactly 2 pieces: A2 only', () => {
    expect(activeSetBonuses(sets, { a: 2 })).toEqual([A2]);
  });

  it('3 pieces: A2 only', () => {
    expect(activeSetBonuses(sets, { a: 3 })).toEqual([A2]);
  });

  it('4 pieces: A2 and A4', () => {
    expect(activeSetBonuses(sets, { a: 4 })).toEqual([A2, A4]);
  });

  it('more than 4 pieces: A2 and A4', () => {
    expect(activeSetBonuses(sets, { a: 5 })).toEqual([A2, A4]);
  });

  it('bonuses of different sets are evaluated independently', () => {
    expect(activeSetBonuses(sets, { a: 2, b: 2 })).toEqual([A2, B2]);
  });

  it('unknown set id in setPieces is ignored', () => {
    expect(activeSetBonuses(sets, { zzz: 8, a: 2 })).toEqual([A2]);
  });

  it('missing set id counts as 0', () => {
    expect(activeSetBonuses(sets, { b: 2 })).toEqual([B2]);
    expect(activeSetBonuses(sets, {})).toEqual([]);
  });
});
