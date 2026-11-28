// A2-017: the stat tables have level 1 and levels 10-60 only. Rule (documented in stats.ts `statLevel`): the level is
// rounded to a whole level, levels 2-9 use the level 10 row and levels above 60 the level 60 row, and the gear growth,
// the mana base offset and the consumable rates use that same table level (not the raw level); levels below 1 and
// non-finite levels throw.
import { describe, expect, it } from 'vitest';
import { demonArmorOf, maxHealthOf, maxManaOf, mobAt, petBaseAt, playerStatsFor, statLevel } from '../../src/forever/stats';

const stats = (level: number) => {
  const { level: _l, ...rest } = playerStatsFor(level, 'average', { demonic_embrace: 5, fel_vitality: 3 });
  return rest;
};

describe('levels outside the table (A2-017)', () => {
  it('statLevel: level 1 and 10-60 stay, 2-9 and above 60 clamp, fractions round', () => {
    expect([1, 10, 40, 60].map(statLevel)).toEqual([1, 10, 40, 60]);
    expect([2, 5, 9].map(statLevel)).toEqual([10, 10, 10]);
    expect([61, 70, 1000].map(statLevel)).toEqual([60, 60, 60]);
    expect([1.4, 39.6, 40.4].map(statLevel)).toEqual([1, 40, 40]);
  });
  it('levels 2-9 give exactly the level 10 stats, growth included', () => {
    for (const L of [2, 5, 9, 9.4]) {
      expect(stats(L), `level ${L}`).toEqual(stats(10));
      expect(maxManaOf(L, 50), `level ${L}`).toBe(maxManaOf(10, 50));
      expect(maxHealthOf(L, 50), `level ${L}`).toBe(maxHealthOf(10, 50));
      expect(mobAt(L)).toEqual(mobAt(10));
      expect(petBaseAt('imp', L)).toEqual(petBaseAt('imp', 10));
    }
  });
  it('levels above 60 give exactly the level 60 stats', () => {
    for (const L of [61, 70]) {
      expect(stats(L), `level ${L}`).toEqual(stats(60));
      expect(mobAt(L)).toEqual(mobAt(60));
    }
  });
  it('a fractional level uses the rounded table level for tables and growth alike', () => {
    expect(stats(40.4)).toEqual(stats(40));
    expect(stats(39.6)).toEqual(stats(40));
    expect(stats(50.2)).toEqual(stats(50));
    expect(mobAt(40.4)).toEqual(mobAt(40));
  });
  it('level 1 is its own row', () => {
    expect(playerStatsFor(1, 'average', {}).maxHp).not.toBe(playerStatsFor(10, 'average', {}).maxHp);
    expect(playerStatsFor(1.4, 'average', {})).toEqual({ ...playerStatsFor(1, 'average', {}), level: 1.4 });
  });
  it('levels below 1 and non-finite levels fail loudly', () => {
    for (const L of [0, 0.4, -3, NaN, Infinity]) {
      expect(() => statLevel(L), `statLevel ${L}`).toThrow(RangeError);
      expect(() => playerStatsFor(L, 'average', {}), `playerStatsFor ${L}`).toThrow(RangeError);
      expect(() => mobAt(L), `mobAt ${L}`).toThrow(RangeError);
    }
  });
  it('integer levels 10-60 are untouched', () => {
    for (let L = 10; L <= 60; L++) expect(statLevel(L)).toBe(L);
    expect(demonArmorOf(50, {})).toBe(480);
  });
});
