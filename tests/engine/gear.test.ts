import { describe, expect, it } from 'vitest';
import { buildSetup } from '../../src/engine/gear';
import type {
  EnchantDef,
  EquippedItem,
  GemDef,
  ItemDef,
  RawStats,
} from '../../src/engine/types';

const base: RawStats = {
  intellect: 100,
  spirit: 50,
  spellPower: 0,
  shadowPower: 0,
  firePower: 0,
  critRating: 0,
  hitRating: 0,
  hasteRating: 0,
  baseMana: 1000,
  mp5: 0,
};

const items: Record<number, ItemDef> = {
  1: {
    id: 1,
    name: 'One',
    slot: 'head',
    stats: { shadowPower: 10 },
    setId: 'a',
    sockets: ['red', 'blue'],
    socketBonus: { hitRating: 4 },
  },
  2: { id: 2, name: 'Two', slot: 'chest', stats: { shadowPower: 20 }, setId: 'a' },
  3: { id: 3, name: 'Three', slot: 'hands', stats: { hitRating: 5 } },
};

const gems: Record<number, GemDef> = {
  10: { id: 10, name: 'Red', color: 'red', stats: { spellPower: 7 } },
  11: { id: 11, name: 'Blue', color: 'blue', stats: { spellPower: 7 } },
  12: { id: 12, name: 'Yellow', color: 'yellow', stats: { critRating: 8 } },
  13: {
    id: 13,
    name: 'Meta',
    color: 'meta',
    stats: { critRating: 12 },
    metaRequires: { red: 2 },
    metaModifiers: [{ critMultDelta: 0.03 }],
  },
  14: { id: 14, name: 'Orange', color: 'orange', stats: { spellPower: 5 } },
  15: { id: 15, name: 'Purple', color: 'purple', stats: { spellPower: 5 } },
};

const enchants: Record<number, EnchantDef> = {
  100: { id: 100, name: 'Ench', stats: { spellPower: 15 } },
};

function build(equipped: EquippedItem[]) {
  return buildSetup({ baseStats: base, equipped, items, gems, enchants });
}

describe('buildSetup', () => {
  it('stats are base plus item, enchant and gem stats', () => {
    const { setup, unknown } = build([{ id: 1, enchant: 100, gems: [10, 12] }, { id: 3 }]);
    expect(setup.stats).toEqual({
      ...base,
      shadowPower: 10,
      hitRating: 5, // item 3; no socket bonus (yellow does not satisfy blue)
      spellPower: 15 + 7,
      critRating: 8,
    });
    expect(unknown).toEqual({ items: [], gems: [], enchants: [] });
  });

  it('setPieces counts equipped items per set id: [1,2,3] → {a: 2}', () => {
    expect(build([{ id: 1 }, { id: 2 }, { id: 3 }]).setup.setPieces).toEqual({ a: 2 });
  });

  it('an item without setId adds no entry', () => {
    expect(build([{ id: 3 }]).setup.setPieces).toEqual({});
  });

  it('socket bonus applies only when every socket\'s color is satisfied', () => {
    expect(build([{ id: 1, gems: [10, 11] }]).setup.stats.hitRating).toBe(4);
    expect(build([{ id: 1, gems: [10, 12] }]).setup.stats.hitRating).toBe(0);
    expect(build([{ id: 1, gems: [10] }]).setup.stats.hitRating).toBe(0);
    expect(build([{ id: 1, gems: [14, 11] }]).setup.stats.hitRating).toBe(4); // orange satisfies red
    expect(build([{ id: 1, gems: [15, 11] }]).setup.stats.hitRating).toBe(4); // purple satisfies red
  });

  it("extra gems beyond the item's sockets are ignored", () => {
    const { setup } = build([{ id: 1, gems: [10, 11, 12, 13] }]);
    expect(setup.stats.spellPower).toBe(14);
    expect(setup.stats.critRating).toBe(0);
    expect(setup.stats.hitRating).toBe(4);
    expect(setup.modifiers).toEqual([]);
  });

  // Stage 2a (ledger carry (a)): an inactive meta gem gives nothing in the game, its stats
  // included (wowsims tbc-new sim/core/database.go skips a disabled meta gem's stats). This test
  // said "its stats apply either way" until then.
  it('meta gem modifiers and stats appear only when metaRequires is met', () => {
    const metaItem: ItemDef = {
      id: 4,
      name: 'Helm',
      slot: 'head',
      stats: {},
      sockets: ['meta', 'red'],
    };
    const redItem: ItemDef = { id: 5, name: 'Ring', slot: 'ring', stats: {}, sockets: ['red'] };
    const p = { baseStats: base, items: { ...items, 4: metaItem, 5: redItem }, gems, enchants };

    const met = buildSetup({
      ...p,
      equipped: [{ id: 4, gems: [13, 10] }, { id: 5, gems: [14] }], // red + orange(red) = 2 red
    });
    expect(met.setup.modifiers).toEqual([{ critMultDelta: 0.03 }]);
    expect(met.setup.stats.critRating).toBe(12);

    const unmet = buildSetup({ ...p, equipped: [{ id: 4, gems: [13, 10] }] });
    expect(unmet.setup.modifiers).toEqual([]);
    expect(unmet.setup.stats.critRating).toBe(0);
  });

  it('unknown item/gem/enchant ids are skipped, reported in unknown, and change nothing else', () => {
    const { setup, unknown } = build([
      { id: 999 },
      { id: 3, enchant: 777, gems: [888] },
    ]);
    expect(setup.stats).toEqual({ ...base, hitRating: 5 });
    expect(setup.setPieces).toEqual({});
    expect(setup.modifiers).toEqual([]);
    expect(unknown).toEqual({ items: [999], gems: [], enchants: [777] });

    const withGem = build([{ id: 1, gems: [888, 11] }]);
    expect(withGem.unknown.gems).toEqual([888]);
    expect(withGem.setup.stats.hitRating).toBe(0);
  });

  it('empty equipped returns baseStats, empty setPieces and empty modifiers', () => {
    const { setup, unknown } = build([]);
    expect(setup).toEqual({ stats: base, setPieces: {}, modifiers: [] });
    expect(setup.stats).not.toBe(base);
    expect(unknown).toEqual({ items: [], gems: [], enchants: [] });
  });
});
