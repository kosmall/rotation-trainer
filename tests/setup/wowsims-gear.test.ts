// WowSimsExporter import and wowsims gear export (stage 2a Task 3): `parseWowSimsExport` and
// `exportWowSimsGear` (src/setup/wowsimsGear.ts).
//
// The author's sample is the author's real WowSimsExporter export (addon v3.2.4), committed in
// stage 1 as docs/samples/wowsimsexporter-destruction-warlock.json (ruling R23). It is not a
// reconstruction: the file was already in the repository, so no reconstructed copy was made.
// Its shape (wowsims ui/features/import-export/importers/addon.ts reads the same fields): top-level
// `name`, `realm`, `race`, `class`, `spec`, `level`, `talents`, `professions` [{name, level}],
// `version`, and `gear.items` (17 entries in slot order: `id`, `enchant`, `gems`).

import { describe, expect, it } from 'vitest';
import authorExport from '../../docs/samples/wowsimsexporter-destruction-warlock.json';
import gearSets from '../fixtures/wowsims-warlock-gear-sets.json';
import { destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { GEAR_PRESETS } from '../../src/data/classes/warlock/gearPresets';
import { deepFreeze } from '../../src/data/common/buffs';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import type { EquippedItem } from '../../src/engine/types';
import { DEFAULT_GEAR, normalizeGear } from '../../src/setup/gear';
import {
  exportWowSimsGear,
  IMPORT_MAX_CHARS,
  parseWowSimsExport,
  type ImportResult,
} from '../../src/setup/wowsimsGear';

const db: ItemDb = itemDbSync();
deepFreeze(db);

type RawEntry = { id?: number; enchant?: number; gems?: number[] };
const wowsimsSets = (gearSets as unknown as { sets: Record<string, { items: RawEntry[] }> }).sets;
const AUTHOR_TALENTS = '000000000000000000000-2050130133200100000000-555000512200013330050';
const slot = (key: (typeof ITEM_SLOTS)[number]) => ITEM_SLOTS.indexOf(key);
const EMPTY_GEAR = Array.from({ length: 17 }, () => null);

/** The author export with other fields. */
function authorWith(fields: Record<string, unknown>): string {
  return JSON.stringify({ ...structuredClone(authorExport), ...fields });
}

function expectFailed(r: ImportResult, label: string) {
  expect(r.ok, label).toBe(false);
  expect(r.gear, label).toEqual(EMPTY_GEAR);
  expect(r.warnings.length, label).toBeGreaterThan(0);
}

describe('parseWowSimsExport', () => {
  it("the author's sample parses to exactly the default gear and returns the talents string and race Gnome", () => {
    const text = JSON.stringify(authorExport);
    const r = parseWowSimsExport(text, db);
    expect(r.ok).toBe(true);
    expect(r.gear).toEqual(DEFAULT_GEAR);
    expect(r.gear).toEqual(destructionEquipped);
    expect(r.talents).toBe(AUTHOR_TALENTS);
    expect(r.race).toBe('Gnome');
    expect(r.character).toBe('Feliczita-Spineshatter');
    expect(r.unknown).toEqual({ items: [], gems: [], enchants: [] });
    // Gnome, warlock, level 70, Enchanting and Jewelcrafting for the ring enchants and Don
    // Julio's Heart, no Horde-only item: nothing to warn about.
    expect(r.warnings).toEqual([]);
    // The result shares nothing with the default gear (the caller may keep and edit it).
    expect(Object.isFrozen(r.gear[0])).toBe(false);
  });

  it('round trip export -> import equals', () => {
    for (const gear of [DEFAULT_GEAR, ...GEAR_PRESETS.map((p) => p.gear)]) {
      const text = exportWowSimsGear(gear);
      const r = parseWowSimsExport(text, db);
      expect(r.ok).toBe(true);
      expect(r.gear).toEqual(gear);
      expect(r.unknown).toEqual({ items: [], gems: [], enchants: [] });
      // The gear.json shape carries no race or talents.
      expect(r.race).toBeUndefined();
      expect(r.talents).toBeUndefined();
    }
  });

  it('export: the wowsims *.gear.json shape and layout (tabs, one entry per line, {} for an empty slot)', () => {
    const t6 = GEAR_PRESETS.find((p) => p.id === 't6')!;
    const text = exportWowSimsGear(t6.gear);
    // Exactly the wowsims file's content (t6 needed no change).
    expect(JSON.parse(text)).toEqual(wowsimsSets.t6);
    const lines = text.split('\n');
    expect(lines[0]).toBe('{');
    expect(lines[1]).toBe('\t"items": [');
    expect(lines[2]).toBe('\t\t{ "id": 31051, "enchant": 3002, "gems": [34220, 32218] },');
    expect(lines[3]).toBe('\t\t{ "id": 32349 },');
    expect(lines[2 + slot('offHand')]).toBe('\t\t{},');
    expect(lines[2 + slot('ranged')]).toBe('\t\t{ "id": 29982 }');
    expect(lines.slice(19)).toEqual(['\t]', '}', '']);
    // An empty socket before a filled one stays 0; the input is not mutated.
    const gear = structuredClone(DEFAULT_GEAR) as (EquippedItem | null)[];
    gear[0] = { id: 31051, enchant: 3002, gems: [0, 32218] };
    const before = structuredClone(gear);
    expect(exportWowSimsGear(gear)).toContain('{ "id": 31051, "enchant": 3002, "gems": [0, 32218] }');
    expect(gear).toEqual(before);
  });

  it('wowsims gear.json shape parses', () => {
    for (const [name, set] of Object.entries(wowsimsSets)) {
      const r = parseWowSimsExport(JSON.stringify(set), db);
      if (set.items.length === 0) {
        expectFailed(r, name);
        continue;
      }
      expect(r.ok, name).toBe(true);
      expect(r.gear, name).toEqual(normalizeGear(set.items, db));
      expect(r.unknown, name).toEqual({ items: [], gems: [], enchants: [] });
    }
    // Stormcaller (Horde only) in the wowsims pre-raid set: imported, with a warning.
    const pre = parseWowSimsExport(JSON.stringify(wowsimsSets.preraid), db);
    expect(pre.gear[slot('mainHand')]?.id).toBe(29155);
    expect(pre.warnings.join('\n')).toMatch(/Stormcaller is a Horde-only item/);
    // Top-level `items` with a race: same as `gear.items`.
    const flat = parseWowSimsExport(JSON.stringify({ race: 'Gnome', items: authorExport.gear.items }), db);
    expect(flat.gear).toEqual(DEFAULT_GEAR);
    expect(flat.warnings).toEqual([]);
  });

  it('unknown ids are listed and slots left null, ok stays true with warnings; all-unknown -> ok false', () => {
    const items = structuredClone(authorExport.gear.items) as RawEntry[];
    items[slot('neck')] = { id: 99999991, gems: [] };
    items[slot('shoulder')] = { id: 31054, enchant: 99999992, gems: [99999993, 32218] };
    items[slot('feet')] = { id: 28517, enchant: 2649, gems: [99999993, 33133] };
    const r = parseWowSimsExport(authorWith({ gear: { items } }), db);
    expect(r.ok).toBe(true);
    expect(r.gear[slot('neck')]).toBeNull();
    expect(r.gear[slot('shoulder')]).toEqual({ id: 31054, gems: [0, 32218] });
    expect(r.gear[slot('feet')]).toEqual({ id: 28517, enchant: 2649, gems: [0, 33133] });
    // Each id once, in order of appearance.
    expect(r.unknown).toEqual({ items: [99999991], gems: [99999993], enchants: [99999992] });
    expect(r.warnings.join('\n')).toMatch(/not in the item database/);
    // Everything else is the author's.
    r.gear.forEach((e, i) => {
      if (![slot('neck'), slot('shoulder'), slot('feet')].includes(i)) expect(e, ITEM_SLOTS[i]).toEqual(DEFAULT_GEAR[i]);
    });

    const allUnknown = parseWowSimsExport(
      JSON.stringify({ items: [{ id: 99999991 }, { id: 99999992, gems: [99999993] }] }),
      db,
    );
    expectFailed(allUnknown, 'all unknown');
    expect(allUnknown.unknown).toEqual({ items: [99999991, 99999992], gems: [99999993], enchants: [] });
  });

  it('huge text, deep nesting, __proto__, non-JSON, arrays, numbers, null -> ok false, no throw', () => {
    const hostile: [string, unknown][] = [
      ['huge', `{"items":[${'{"id":31051},'.repeat(20000)}{}]}`],
      ['huge whitespace', `${' '.repeat(IMPORT_MAX_CHARS)}{"items":[]}`],
      ['deep array', '['.repeat(99999) + ']'.repeat(99999)],
      ['deep object', '{"items":'.repeat(18000) + '[]' + '}'.repeat(18000)],
      ['deep items', `{"items":${'['.repeat(99000)}${']'.repeat(99000)}}`],
      ['proto root', '{"__proto__":{"items":[{"id":31051}]}}'],
      ['proto gear', '{"gear":{"__proto__":{"items":[{"id":31051}]}}}'],
      ['proto entries', `{"items":[${Array.from({ length: 17 }, () => '{"__proto__":{"id":31051}}').join(',')}]}`],
      ['constructor', '{"constructor":{"prototype":{"items":[{"id":31051}]}}}'],
      ['not json', 'Feliczita, Gnome, 31051'],
      ['truncated', JSON.stringify(authorExport).slice(0, 200)],
      ['empty', ''],
      ['array', JSON.stringify(authorExport.gear.items)],
      ['number', '42'],
      ['string', '"items"'],
      ['null', 'null'],
      ['true', 'true'],
      ['items not an array', '{"items":{"0":{"id":31051}}}'],
      ['items of junk', '{"items":[1,"a",null,true,[],{"id":"31051"},{"id":-1},{"id":1.5},{"id":1e300}]}'],
      ['no items', '{"name":"Feliczita","race":"Gnome","talents":"000"}'],
      ['empty items', '{"items":[]}'],
      ['not a string', 12345],
      ['undefined', undefined],
      ['object', { items: [{ id: 31051 }] }],
    ];
    for (const [label, text] of hostile) {
      let r: ImportResult | undefined;
      expect(() => (r = parseWowSimsExport(text as string, db)), label).not.toThrow();
      expectFailed(r!, label);
    }
    // Nothing leaked into Object.prototype.
    expect(({} as Record<string, unknown>).items).toBeUndefined();
    expect(({} as Record<string, unknown>).id).toBeUndefined();
    // The size cap is 200 000 characters.
    expect(IMPORT_MAX_CHARS).toBe(200_000);
    const big = parseWowSimsExport(authorWith({ pad: 'x'.repeat(IMPORT_MAX_CHARS) }), db);
    expect(big.warnings.join('\n')).toMatch(/200000 characters/);
  });

  it('a leading BOM is ignored, the size cap is exact, and a shuffled full list is placed by slot', () => {
    const raw = JSON.stringify(authorExport);
    const plain = parseWowSimsExport(raw, db);
    expect(plain.ok).toBe(true);
    const bom = parseWowSimsExport(`\ufeff${raw}`, db);
    expect(bom.ok).toBe(true);
    expect(bom.gear).toEqual(plain.gear);

    // Exactly the cap parses; one more character is rejected.
    const base = '{"items":[]}';
    const atCap = base.slice(0, -1) + ' '.repeat(IMPORT_MAX_CHARS - base.length) + '}';
    expect(atCap.length).toBe(IMPORT_MAX_CHARS);
    expect(parseWowSimsExport(atCap, db).warnings.join('\n')).not.toMatch(/characters; a gear export/);
    expect(parseWowSimsExport(`${atCap} `, db).warnings.join('\n')).toMatch(/200000 characters/);

    // The same 17 items in reverse order land in the same slots as the real export.
    const reversed = JSON.stringify({ items: [...authorExport.gear.items].reverse() });
    const shuffled = parseWowSimsExport(reversed, db);
    expect(shuffled.ok).toBe(true);
    expect(shuffled.gear.filter((g) => g !== null)).toHaveLength(plain.gear.filter((g) => g !== null).length);
    expect(shuffled.gear[slot('head')]).toEqual(plain.gear[slot('head')]);
    expect(shuffled.gear[slot('neck')]).toEqual(plain.gear[slot('neck')]);
  });

  it('slot placement fallback by DB slot for a short list', () => {
    // Rings and trinkets fill finger1/2 and trinket1/2 in order; the rest by their slot,
    // whatever the order of the list.
    const short = [
      { id: 29982 }, // ranged
      { id: 32247 }, // ring -> finger1
      { id: 29370 }, // trinket -> trinket1
      { id: 31051, enchant: 3002, gems: [34220, 32218] }, // head
      { id: 29305 }, // ring -> finger2
      { id: 25653 }, // trinket -> trinket2
      null,
      {},
      { id: 0 },
    ];
    const r = parseWowSimsExport(JSON.stringify({ items: short }), db);
    expect(r.ok).toBe(true);
    const expected: (EquippedItem | null)[] = Array.from({ length: 17 }, () => null);
    expected[slot('ranged')] = { id: 29982, gems: [] };
    expected[slot('finger1')] = { id: 32247, gems: [] };
    expected[slot('trinket1')] = { id: 29370, gems: [] };
    expected[slot('head')] = { id: 31051, enchant: 3002, gems: [34220, 32218] };
    expected[slot('finger2')] = { id: 29305, gems: [] };
    expected[slot('trinket2')] = { id: 25653, gems: [] };
    expect(r.gear).toEqual(expected);
    // A head meta gem with one blue gem short: imported as is (the meta stays inactive).
    expect(r.unknown).toEqual({ items: [], gems: [], enchants: [] });

    // A third ring has no slot left: warned and skipped. A staff clears the off hand.
    const crowded = parseWowSimsExport(
      JSON.stringify({ items: [{ id: 32247 }, { id: 29305 }, { id: 32527 }, { id: 33334 }, { id: 32374, enchant: 2672 }] }),
      db,
    );
    expect(crowded.ok).toBe(true);
    expect(crowded.gear[slot('finger1')]?.id).toBe(32247);
    expect(crowded.gear[slot('finger2')]?.id).toBe(29305);
    expect(crowded.gear[slot('mainHand')]).toEqual({ id: 32374, enchant: 2672, gems: [] });
    expect(crowded.gear[slot('offHand')]).toBeNull();
    const w = crowded.warnings.join('\n');
    expect(w).toMatch(/Ring of Ancient Knowledge: no free finger slot/);
    expect(w).toMatch(/Fetish of the Primal Gods.*not equipped/);

    // More than 17 entries: by DB slot too.
    const long = [...authorExport.gear.items, { id: 32527 }].reverse();
    const lr = parseWowSimsExport(JSON.stringify({ items: long }), db);
    expect(lr.gear[slot('head')]).toEqual(DEFAULT_GEAR[slot('head')]);
    expect(lr.gear[slot('finger1')]?.id).toBe(32527);

    // A list longer than 64 entries: the first 64 are read; each warning once.
    const many = parseWowSimsExport(JSON.stringify({ items: Array.from({ length: 100 }, () => ({ id: 31051 })) }), db);
    expect(many.ok).toBe(true);
    expect(many.gear[slot('head')]).toEqual({ id: 31051, gems: [] });
    expect(many.warnings).toEqual(['Only the first 64 of 100 entries were read.', 'Hood of the Malefic: no free head slot; not equipped.']);
  });

  it('17 entries are placed by order while every known item fits its position; a list in another order goes by slot', () => {
    const items = structuredClone(authorExport.gear.items) as RawEntry[];
    [items[0], items[1]] = [items[1]!, items[0]!]; // head <-> neck: not the addon's order
    const r = parseWowSimsExport(JSON.stringify({ items }), db);
    expect(r.ok).toBe(true);
    // Placed by the items' own slots, so nothing is lost (wowsims reads a list in any order too).
    expect(r.gear[slot('head')]).toEqual(DEFAULT_GEAR[slot('head')]);
    expect(r.gear[slot('neck')]).toEqual(DEFAULT_GEAR[slot('neck')]);
    expect(r.warnings.join('\n')).not.toMatch(/not a/);
    // Null entries (the addon's empty slots) keep their position.
    const withNull = structuredClone(authorExport.gear.items) as (RawEntry | null)[];
    withNull[slot('neck')] = null;
    const n = parseWowSimsExport(JSON.stringify({ items: withNull }), db);
    expect(n.gear[slot('neck')]).toBeNull();
    expect(n.gear[slot('head')]).toEqual(DEFAULT_GEAR[0]);
  });

  it('empty sockets: 0 or null keep the socket empty (the WowSimsExporter convention); misfit gems are dropped with a warning', () => {
    const items = structuredClone(authorExport.gear.items) as RawEntry[];
    (items[slot('shoulder')] as { gems: unknown[] }).gems = [null, 32218];
    items[slot('feet')]!.gems = [0, 0];
    items[slot('waist')]!.gems = [34220, 32207]; // a meta gem in a blue socket
    items[slot('legs')]!.gems = [28123, 28123, 28123, 28123]; // gems beyond the sockets
    const r = parseWowSimsExport(JSON.stringify({ race: 'Gnome', gear: { items } }), db);
    expect(r.gear[slot('shoulder')]?.gems).toEqual([0, 32218]);
    expect(r.gear[slot('feet')]?.gems).toEqual([]);
    expect(r.gear[slot('waist')]?.gems).toEqual([0, 32207]);
    expect(r.gear[slot('legs')]?.gems).toEqual([28123]);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Chaotic Skyfire Diamond does not fit socket 1 of Belt of Blasting/);
    expect(w).toMatch(/Leggings of the Malefic: 3 gems beyond its sockets dropped/);
    expect(r.unknown).toEqual({ items: [], gems: [], enchants: [] });
  });

  it('race, talents, character, class and level: kept or warned, never applied', () => {
    const orc = parseWowSimsExport(authorWith({ race: 'Orc' }), db);
    expect(orc.ok).toBe(true);
    expect(orc.race).toBe('Orc');
    expect(orc.warnings.join('\n')).toMatch(/Orc.*Gnome/);
    // Talents are returned untouched (stage 2b applies them); malformed ones are dropped.
    expect(parseWowSimsExport(authorWith({ talents: '--' }), db).talents).toBe('--');
    for (const bad of [42, 'x'.repeat(300), '<script>', ['0-0-0']]) {
      const r = parseWowSimsExport(authorWith({ talents: bad }), db);
      expect(r.talents).toBeUndefined();
      expect(r.ok).toBe(true);
    }
    // A missing realm: the name alone; junk names are dropped.
    expect(parseWowSimsExport(authorWith({ realm: undefined }), db).character).toBe('Feliczita');
    expect(parseWowSimsExport(authorWith({ name: { a: 1 }, realm: 7 }), db).character).toBeUndefined();
    expect(parseWowSimsExport(authorWith({ race: 'x'.repeat(500) }), db).race).toBeUndefined();
    // Another class or a low level: imported with a warning (wowsims refuses another class).
    expect(parseWowSimsExport(authorWith({ class: 'mage' }), db).warnings.join('\n')).toMatch(/mage.*warlock/);
    expect(parseWowSimsExport(authorWith({ level: 60 }), db).warnings.join('\n')).toMatch(/level 60/);
  });

  it('profession and faction warnings', () => {
    // Without Jewelcrafting and Enchanting: Don Julio's Heart and the two ring enchants.
    const r = parseWowSimsExport(authorWith({ professions: [{ name: 'Tailoring', level: 375 }] }), db);
    expect(r.ok).toBe(true);
    expect(r.gear).toEqual(DEFAULT_GEAR);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Don Julio's Heart needs Jewelcrafting/);
    expect(w).toMatch(/Enchant Ring - Spellpower needs Enchanting/);
    expect(r.warnings.filter((x) => x.includes('Enchant Ring'))).toHaveLength(1);
    // Professions not listed (the gear.json shape): nothing is assumed, no warning.
    expect(parseWowSimsExport(JSON.stringify({ items: authorExport.gear.items }), db).warnings).toEqual([]);
    // Tailoring items (pre-raid Frozen Shadoweave) with the author's professions.
    const pre = parseWowSimsExport(authorWith({ gear: wowsimsSets.preraid }), db);
    expect(pre.warnings.join('\n')).toMatch(/Frozen Shadoweave Shoulders needs Tailoring/);
  });

  it('never mutates its input or the database; results share nothing', () => {
    const text = JSON.stringify(authorExport);
    const a = parseWowSimsExport(text, db);
    const b = parseWowSimsExport(text, db);
    expect(a).toEqual(b);
    expect(a.gear[0]).not.toBe(b.gear[0]);
    a.gear[0]!.gems!.push(1);
    expect(parseWowSimsExport(text, db).gear).toEqual(DEFAULT_GEAR);
  });
});
