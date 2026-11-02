// Gear in the setup (stage 2a Task 2): `normalizeGear` / `normalizeGearShape` / `describeGear`
// (src/setup/gear.ts), `buildDestructionWarlock(options, gear, db)` with the item database, the
// engine's socket and meta gem rules (src/engine/gear.ts), and `SetupConfig.gear` through
// `normalizeSetup` and `applySetup`. Golden: the author's gear through the database gives exactly
// the stage 1.5 spec and bot results.

import { describe, expect, it } from 'vitest';
import gearSets from '../fixtures/wowsims-warlock-gear-sets.json';
import { runBot } from '../../src/bot/bot';
import {
  buildDestructionWarlock,
  DEFAULT_WARLOCK_OPTIONS,
  destructionEquipped,
  destructionWarlock,
  type WarlockOptions,
} from '../../src/data/classes/warlock/destruction';
import { gems as authorGems, metaGemModifiers } from '../../src/data/classes/warlock/items';
import { deepFreeze } from '../../src/data/common/buffs';
import { BASE_CRIT_PCT, CRIT_RATING_PER_PCT, INT_PER_CRIT_PCT, SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import { buildSetup, gemFitsSocket, socketMatches } from '../../src/engine/gear';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { EquippedItem, GemDef, ItemDef, RawStats } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import {
  DEFAULT_GEAR,
  describeGear,
  gearNeedsDb,
  normalizeGear,
  normalizeGearShape,
  RING_LIMIT_CATEGORIES,
  setupGear,
} from '../../src/setup/gear';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig } from '../../src/setup/types';

const db: ItemDb = itemDbSync();
// Any write into the shared database or the default spec throws from here on.
deepFreeze(db);
deepFreeze(destructionWarlock);

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Stage 1.5 / F bot means over seeds 1-10 (tests/setup/applySetup.test.ts `TASK_2_MEAN_DPS`). */
const GOLDEN_MEAN_DPS: Record<number, number> = { [SPELL_QUEUE_WINDOW_MS]: 1425.1766666666667, 0: 1428.3350000000003 };

type Gear = (EquippedItem | null)[];
const wowsimsSets = (gearSets as unknown as { sets: Record<string, { items: Partial<EquippedItem>[] }> }).sets;
const slotIndex = (slot: (typeof ITEM_SLOTS)[number]) => ITEM_SLOTS.indexOf(slot);

/** The author's gear with one slot replaced. */
function withSlot(slot: (typeof ITEM_SLOTS)[number], entry: unknown): unknown[] {
  const gear: unknown[] = structuredClone(destructionEquipped);
  gear[slotIndex(slot)] = entry;
  return gear;
}

function botMeans(config: SetupConfig, buildSpec: (w: WarlockOptions, g?: Gear) => ReturnType<typeof buildDestructionWarlock>) {
  const { spec, sim } = applySetup({ buildSpec, catalog: SETUP_CATALOG, config });
  const out: Record<number, number> = {};
  for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
    const dps = SEEDS.map(
      (seed) =>
        runBot(
          new Simulation({
            spec,
            target: BOSS_TARGET,
            seed,
            spellQueueWindowMs: w,
            infiniteMana: false,
            distanceFromTarget: sim.distanceFromTarget,
            scheduledAuras: sim.scheduledAuras,
            durationMs: sim.durationMs,
          }),
          spec.priority,
        ).dps,
    );
    out[w] = dps.reduce((a, b) => a + b, 0) / dps.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Golden equality
// ---------------------------------------------------------------------------

describe('golden: the author gear through the item database', () => {
  it('golden: buildDestructionWarlock default equals the stage 1.5 spec (stats via computeStats, setup, modifiers, set pieces) and the bot means over seeds 1-10 are exactly 1425.1766666666667 / 1428.3350000000003', () => {
    const viaDb = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, DEFAULT_GEAR, db);
    expect(viaDb.setup).toEqual(destructionWarlock.setup);
    expect(viaDb.setup.stats).toEqual(destructionWarlock.setup.stats);
    expect(viaDb.setup.setPieces).toEqual({ 'malefic-raiment': 4 });
    // Chaotic Skyfire's modifiers come from items.ts (the database has no metaModifiers).
    expect(viaDb.setup.modifiers).toEqual(authorGems[34220]!.metaModifiers);
    expect(viaDb.setup.modifiers).toEqual(metaGemModifiers[34220]);
    expect(computeStats(viaDb.setup, viaDb.statBonuses)).toEqual(
      computeStats(destructionWarlock.setup, destructionWarlock.statBonuses),
    );
    expect(viaDb.modifiers).toEqual(destructionWarlock.modifiers);
    expect(viaDb.statBonuses).toEqual(destructionWarlock.statBonuses);
    expect(viaDb.auras).toEqual(destructionWarlock.auras);
    expect(viaDb.sets).toBe(destructionWarlock.sets);
    // Without a gear argument: the stage 1 build itself (gear stats shared, no rebuild).
    expect(buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS).setup.stats).toBe(destructionWarlock.setup.stats);
    // Without the db the embedded author tables give the same setup.
    expect(buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, DEFAULT_GEAR).setup).toEqual(destructionWarlock.setup);

    const config = deepFreeze({ ...structuredClone(DEFAULT_SETUP), gear: structuredClone(DEFAULT_GEAR) as Gear });
    const means = botMeans(config, (w, g) => buildDestructionWarlock(w, g, db));
    expect(means[SPELL_QUEUE_WINDOW_MS]).toBe(1425.1766666666667);
    expect(means[0]).toBe(1428.3350000000003);
    expect(means).toEqual(GOLDEN_MEAN_DPS);
  });

  it('DEFAULT_GEAR is the author export (destructionEquipped), 17 entries, deep-frozen and in the database', () => {
    expect(DEFAULT_GEAR).toEqual(destructionEquipped);
    expect(DEFAULT_GEAR).toHaveLength(17);
    expect(Object.isFrozen(DEFAULT_GEAR)).toBe(true);
    expect(Object.isFrozen(DEFAULT_GEAR[0])).toBe(true);
    expect(normalizeGear(DEFAULT_GEAR, db)).toEqual(DEFAULT_GEAR);
    expect(gearNeedsDb(DEFAULT_GEAR)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeGear
// ---------------------------------------------------------------------------

describe('normalizeGear', () => {
  const norm = (input: unknown) => normalizeGear(input, db);

  it('normalizeGear: undefined/null/string/array of wrong length -> default', () => {
    for (const bad of [undefined, null, 'gear', 42, {}, [], new Array(16).fill(null), new Array(18).fill(null)]) {
      const out = norm(bad);
      expect(out, JSON.stringify(bad)).toEqual(DEFAULT_GEAR);
      expect(out).not.toBe(DEFAULT_GEAR);
      expect(Object.isFrozen(out)).toBe(false);
    }
  });

  it('normalizeGear: unknown id -> null; wrong-slot item -> null; bad entries -> null', () => {
    expect(norm(withSlot('neck', { id: 99999999 }))[slotIndex('neck')]).toBeNull();
    // Robes of Rhonin (chest) in the head slot.
    expect(norm(withSlot('head', { id: 30913 }))[slotIndex('head')]).toBeNull();
    // A ring in a trinket slot, a trinket in a ring slot.
    expect(norm(withSlot('trinket1', { id: 29305 }))[slotIndex('trinket1')]).toBeNull();
    expect(norm(withSlot('finger1', { id: 29370 }))[slotIndex('finger1')]).toBeNull();
    for (const bad of [null, undefined, 'x', 5, [], { id: '31051' }, { id: 1.5 }, { id: -3 }, { id: NaN }, { gems: [] }]) {
      expect(norm(withSlot('head', bad))[slotIndex('head')], JSON.stringify(bad)).toBeNull();
    }
    // Rings and trinkets fit either of their slots.
    const swapped = withSlot('finger1', { id: 32247 });
    swapped[slotIndex('finger2')] = { id: 29305 };
    const out = norm(swapped);
    expect(out[slotIndex('finger1')]?.id).toBe(32247);
    expect(out[slotIndex('finger2')]?.id).toBe(29305);
  });

  it('normalizeGear: gem not in DB dropped; 4 gems in 2 sockets -> 2; meta only in meta sockets; empty sockets are 0', () => {
    // Hood of the Malefic: meta + yellow.
    const hood = (gems: unknown) => norm(withSlot('head', { id: 31051, gems }))[slotIndex('head')];
    expect(hood([34220, 32218, 32218, 32218])?.gems).toEqual([34220, 32218]);
    expect(hood([34220, 99999])?.gems).toEqual([34220]);
    expect(hood([99999, 32218])?.gems).toEqual([0, 32218]);
    // A non-meta gem in the meta socket and a meta gem in the yellow socket do not fit.
    expect(hood([32218, 34220])?.gems).toEqual([]);
    // Non-numbers, negatives, fractions: dropped. Not an array: no gems.
    expect(hood(['34220', -1, 1.5])?.gems).toEqual([]);
    expect(hood('34220')?.gems).toEqual([]);
    // An item without sockets keeps no gem.
    expect(norm(withSlot('neck', { id: 32349, gems: [32196] }))[slotIndex('neck')]?.gems).toEqual([]);
    // A prismatic gem fits a coloured socket, not a meta socket.
    expect(hood([22460, 22460])?.gems).toEqual([0, 22460]);
  });

  it('normalizeGear: enchants must exist and fit the slot (extra slots of armour kits, 2H enchants on staves only)', () => {
    const at = (slot: (typeof ITEM_SLOTS)[number], entry: unknown) => norm(withSlot(slot, entry))[slotIndex(slot)];
    expect(at('head', { id: 31051, enchant: 3002 })?.enchant).toBe(3002);
    expect(at('head', { id: 31051, enchant: 99999 })).toEqual({ id: 31051, gems: [] });
    // A shoulder enchant on the head: dropped.
    expect(at('head', { id: 31051, enchant: 2995 })?.enchant).toBeUndefined();
    // Fortitude (2649): bracer and boots.
    expect(at('feet', { id: 28517, enchant: 2649 })?.enchant).toBe(2649);
    expect(at('wrist', { id: 32586, enchant: 2649 })?.enchant).toBe(2649);
    // Magister's Armor Kit (2794): chest, hands, legs, feet (extraSlots), not the head.
    expect(at('legs', { id: 31053, enchant: 2794 })?.enchant).toBe(2794);
    expect(at('head', { id: 31051, enchant: 2794 })?.enchant).toBeUndefined();
    // Enchant 2H Weapon - Impact (1897, twoHandOnly): not on a dagger, fine on a staff.
    expect(at('mainHand', { id: 32237, enchant: 1897 })?.enchant).toBeUndefined();
    expect(at('mainHand', { id: 32374, enchant: 1897 })?.enchant).toBe(1897);
    // Weapon enchants on a staff are fine; nothing goes on an off-hand or a wand.
    expect(at('mainHand', { id: 32374, enchant: 2669 })?.enchant).toBe(2669);
    expect(at('offHand', { id: 33334, enchant: 2669 })?.enchant).toBeUndefined();
    expect(at('ranged', { id: 29982, enchant: 2669 })?.enchant).toBeUndefined();
    for (const bad of ['3002', -1, 3002.5, null]) expect(at('head', { id: 31051, enchant: bad })?.enchant).toBeUndefined();
  });

  it('normalizeGear: a staff clears the off hand', () => {
    const gear = withSlot('mainHand', { id: 32374 }); // Zhar'doom, Greatstaff of the Devourer
    const out = norm(gear);
    expect(out[slotIndex('mainHand')]?.id).toBe(32374);
    expect(out[slotIndex('offHand')]).toBeNull();
    // A one-hander keeps it.
    expect(norm(withSlot('mainHand', { id: 30910 }))[slotIndex('offHand')]?.id).toBe(33334);
  });

  it('normalizeGear: duplicate unique -> second null (rings, trinkets, limit categories); unique gems once in the whole gear', () => {
    // Band of the Eternal Sage is unique: the second copy is dropped.
    const twoBands = withSlot('finger2', { id: 29305 });
    expect(norm(twoBands)[slotIndex('finger1')]?.id).toBe(29305);
    expect(norm(twoBands)[slotIndex('finger2')]).toBeNull();
    // Icon of the Silver Crescent twice (unique trinket).
    const twoIcons = withSlot('trinket1', { id: 29370 });
    expect(norm(twoIcons)[slotIndex('trinket1')]?.id).toBe(29370);
    expect(norm(twoIcons)[slotIndex('trinket2')]).toBeNull();
    // Band of the Eternal Sage + Band of Eternity (29302): different ids, same limit category 497.
    expect(RING_LIMIT_CATEGORIES[497]).toContain(29305);
    expect(RING_LIMIT_CATEGORIES[497]).toContain(29302);
    const category = withSlot('finger2', { id: 29302 });
    expect(norm(category)[slotIndex('finger2')]).toBeNull();
    // Two non-unique identical items are fine: Runed Living Ruby (24030, not unique) twice.
    const twoRubies = withSlot('feet', { id: 28517, gems: [24030, 24030] });
    expect(norm(twoRubies)[slotIndex('feet')]?.gems).toEqual([24030, 24030]);
    // Don Julio's Heart (33133, unique) is on the boots; on the gloves too, the gloves (an earlier
    // slot) keep it and the boots' second socket is left empty.
    const twoHearts = withSlot('hands', { id: 31050, enchant: 2937, gems: [33133] });
    const out = norm(twoHearts);
    expect(out[slotIndex('hands')]?.gems).toEqual([33133]);
    expect(out[slotIndex('feet')]?.gems).toEqual([28118]);
  });

  it('normalizeGear: prototype-pollution payloads inert', () => {
    const hostile = JSON.parse(
      '[{"__proto__":{"polluted":1},"id":31051,"gems":[34220,32218],"enchant":3002},{"constructor":{"prototype":{"polluted":1}},"id":32349}]',
    ) as unknown[];
    const gear = [...hostile, ...structuredClone(destructionEquipped).slice(2)];
    const out = norm(gear);
    expect(out[0]).toEqual({ id: 31051, enchant: 3002, gems: [34220, 32218] });
    expect(Object.getPrototypeOf(out[0])).toBe(Object.prototype);
    expect(out[1]).toEqual({ id: 32349, gems: [] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Ids that name Object.prototype members are unknown.
    for (const id of ['__proto__', 'constructor', 'toString']) expect(norm(withSlot('head', { id }))[0]).toBeNull();
    // A hostile getter gives the default gear, never a throw.
    const trap = new Proxy([], { get: () => { throw new Error('trap'); } });
    expect(norm(trap)).toEqual(DEFAULT_GEAR);
    const getterEntry = withSlot('head', Object.defineProperty({}, 'id', { get: () => { throw new Error('trap'); } }));
    expect(() => norm(getterEntry)).not.toThrow();
  });

  it('normalizeGear: idempotent, never mutates its input, shares no object with it', () => {
    const inputs: unknown[] = [
      DEFAULT_GEAR,
      withSlot('mainHand', { id: 32374, enchant: 2669 }),
      withSlot('finger2', { id: 29305 }),
      withSlot('head', { id: 31051, gems: [99999, 32218, 1, 2] }),
      ...Object.values(wowsimsSets).map((s) => s.items),
    ];
    for (const input of inputs) {
      const frozen = deepFreeze(structuredClone(input));
      const once = norm(frozen);
      expect(norm(once)).toEqual(once);
      expect(once).toHaveLength(17);
      once.forEach((e, i) => {
        if (e && Array.isArray(frozen) && frozen[i]) expect(e).not.toBe(frozen[i]);
      });
    }
  });

  it('normalizeGearShape (no database): keeps well-formed entries, drops malformed ones, default for a wrong length', () => {
    expect(normalizeGearShape(undefined)).toEqual(DEFAULT_GEAR);
    expect(normalizeGearShape([1, 2])).toEqual(DEFAULT_GEAR);
    const gear = withSlot('head', { id: 123456, enchant: 7, gems: [1, 0, 2, 3, 4, 5] });
    gear[1] = { id: 'x' };
    gear[2] = null;
    const out = normalizeGearShape(gear);
    // Unknown ids are kept (the database decides later); at most 3 gems (TBC items have 3 sockets at most).
    expect(out[0]).toEqual({ id: 123456, enchant: 7, gems: [1, 0, 2] });
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(normalizeGearShape(out)).toEqual(out);
    expect(normalizeGearShape(DEFAULT_GEAR)).toEqual(DEFAULT_GEAR);
  });

  it('gearNeedsDb: true once anything is outside the embedded author tables', () => {
    expect(gearNeedsDb(withSlot('neck', { id: 28530 }) as Gear)).toBe(true);
    expect(gearNeedsDb(withSlot('head', { id: 31051, gems: [24030] }) as Gear)).toBe(true);
    expect(gearNeedsDb(withSlot('head', { id: 31051, enchant: 2982 }) as Gear)).toBe(true);
    expect(gearNeedsDb(withSlot('head', null) as Gear)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Engine socket and meta rules (ledger carry (a), (b))
// ---------------------------------------------------------------------------

describe('buildSetup: sockets and meta gems', () => {
  const zero: RawStats = {
    intellect: 0, spirit: 0, spellPower: 0, shadowPower: 0, firePower: 0,
    critRating: 0, hitRating: 0, hasteRating: 0, baseMana: 0, mp5: 0,
  };
  const helm: ItemDef = { id: 1, name: 'Helm', slot: 'head', stats: {}, sockets: ['meta', 'red'], socketBonus: { hitRating: 4 } };
  const gloves: ItemDef = { id: 2, name: 'Gloves', slot: 'hands', stats: {}, sockets: ['blue', 'blue', 'yellow'] };
  const gem = (id: number, color: GemDef['color'], extra: Partial<GemDef> = {}): GemDef => ({ id, name: `g${id}`, color, stats: { spellPower: id }, ...extra });
  const gems: Record<number, GemDef> = {
    10: gem(10, 'meta', { stats: { critRating: 12 }, metaRequires: { blue: 2 }, metaModifiers: [{ critMultDelta: 0.045 }] }),
    11: gem(11, 'meta', { stats: { spellPower: 9 }, metaCompare: { more: 'red', than: 'blue' } }),
    20: gem(20, 'red'),
    30: gem(30, 'blue'),
    40: gem(40, 'yellow'),
    70: gem(70, 'purple'),
    80: gem(80, 'prismatic', { stats: {} }),
  };
  const build = (equipped: EquippedItem[]) =>
    buildSetup({ baseStats: zero, equipped, items: { 1: helm, 2: gloves }, gems, enchants: {} }).setup;

  it('an inactive meta gem gives neither its stats nor its modifiers; the socket bonus still counts it', () => {
    // One blue only: Chaotic-like meta inactive.
    const off = build([{ id: 1, gems: [10, 20] }, { id: 2, gems: [30] }]);
    expect(off.stats.critRating).toBe(0);
    expect(off.modifiers).toEqual([]);
    expect(off.stats.hitRating).toBe(4); // meta in the meta socket + red in red: bonus
    expect(off.stats.spellPower).toBe(20 + 30);
    // Two blue: active.
    const on = build([{ id: 1, gems: [10, 20] }, { id: 2, gems: [30, 30] }]);
    expect(on.stats.critRating).toBe(12);
    expect(on.modifiers).toEqual([{ critMultDelta: 0.045 }]);
  });

  it('metaCompare: strictly more red than blue', () => {
    const equal = build([{ id: 1, gems: [11, 20] }, { id: 2, gems: [30] }]);
    expect(equal.stats.spellPower).toBe(20 + 30); // 1 red, 1 blue: inactive
    const more = build([{ id: 1, gems: [11, 20] }, { id: 2, gems: [70] }]); // red 2 (purple counts both), blue 1
    expect(more.stats.spellPower).toBe(9 + 20 + 70);
  });

  it('a meta gem outside a meta socket, or a coloured gem in a meta socket, is ignored (no stats, no colour, socket empty)', () => {
    const s = build([{ id: 1, gems: [20, 10] }, { id: 2, gems: [30, 30] }]);
    expect(s.stats.spellPower).toBe(30 + 30);
    expect(s.stats.critRating).toBe(0);
    expect(s.stats.hitRating).toBe(0);
    expect(gemFitsSocket('meta', 'red')).toBe(false);
    expect(gemFitsSocket('red', 'meta')).toBe(false);
    expect(gemFitsSocket('meta', 'meta')).toBe(true);
    expect(gemFitsSocket('prismatic', 'blue')).toBe(true);
    expect(gemFitsSocket('prismatic', 'meta')).toBe(false);
  });

  it('a prismatic gem matches every coloured socket for the socket bonus; gem id 0 is an empty socket, not unknown', () => {
    for (const socket of ['red', 'blue', 'yellow'] as const) expect(socketMatches(socket, 'prismatic')).toBe(true);
    expect(socketMatches('meta', 'prismatic')).toBe(false);
    const s = build([{ id: 1, gems: [10, 80] }]);
    expect(s.stats.hitRating).toBe(4);
    const r = buildSetup({ baseStats: zero, equipped: [{ id: 1, gems: [0, 20] }], items: { 1: helm }, gems, enchants: {} });
    expect(r.unknown.gems).toEqual([]);
    expect(r.setup.stats.hitRating).toBe(0); // the meta socket is empty: no bonus
  });
});

// ---------------------------------------------------------------------------
// Preset-like gear from the wowsims sets
// ---------------------------------------------------------------------------

describe('wowsims warlock gear sets through normalizeGear and the database', () => {
  it('each preset-like gear (from the wowsims sets, once Task 3 adds them; here use T4 from the clone data directly) builds without unknowns and has the expected set piece count (Voidheart 4)', () => {
    const t4 = wowsimsSets.t4!.items;
    const gear = normalizeGear(t4, db);
    // Nothing dropped: same ids, enchants and gems as the wowsims file.
    gear.forEach((e, i) => {
      expect(e?.id, ITEM_SLOTS[i]).toBe(t4[i]!.id);
      expect(e?.enchant, ITEM_SLOTS[i]).toBe(t4[i]!.enchant);
      expect(e?.gems, ITEM_SLOTS[i]).toEqual(t4[i]!.gems ?? []);
    });
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, gear, db);
    expect(spec.setup.setPieces).toEqual({ 'voidheart-raiment': 4, 'spellstrike-infusion': 1, 'shadows-embrace': 1 });
    const { unknown } = buildSetup({
      baseStats: spec.setup.stats,
      equipped: gear.filter((e): e is EquippedItem => e !== null),
      items: db.items,
      gems: db.gems,
      enchants: db.enchants,
    });
    expect(unknown).toEqual({ items: [], gems: [], enchants: [] });
    // Chaotic Skyfire active (purple Glowing Tanzanite and Infused Amethyst: 2 blue), with its modifiers.
    expect(describeGear(gear, db).metaActive).toBe(true);
    expect(spec.setup.modifiers).toEqual(metaGemModifiers[34220]);
  });

  it('every wowsims warlock gear set (9) normalizes without dropping anything', () => {
    expect(Object.keys(wowsimsSets)).toHaveLength(9);
    for (const [name, set] of Object.entries(wowsimsSets)) {
      const gear = normalizeGear(set.items, db);
      if (set.items.length !== 17) {
        // 'blank' has no entries: not a gear, so the default.
        expect(set.items, name).toEqual([]);
        expect(gear, name).toEqual(DEFAULT_GEAR);
        continue;
      }
      gear.forEach((e, i) => {
        const src = set.items[i]!;
        expect(e?.id ?? 0, `${name} ${ITEM_SLOTS[i]}`).toBe(src.id ?? 0);
        if (e) expect([e.enchant, e.gems], `${name} ${ITEM_SLOTS[i]}`).toEqual([src.enchant, src.gems ?? []]);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// describeGear
// ---------------------------------------------------------------------------

describe('describeGear', () => {
  it('the author gear: meta active, socket bonuses per socketed item, modelled effects (Icon, Band) not listed, no unmodelled set', () => {
    const d = describeGear(DEFAULT_GEAR, db);
    expect(d.metaActive).toBe(true);
    expect(d.socketBonuses).toEqual([
      { slot: 'head', bonus: { spellPower: 5 }, active: true },
      { slot: 'shoulder', bonus: { spellPower: 4 }, active: true },
      { slot: 'hands', bonus: { hitRating: 2 }, active: false },
      { slot: 'waist', bonus: { spellPower: 4 }, active: true },
      { slot: 'legs', bonus: { hitRating: 2 }, active: true },
      { slot: 'feet', bonus: { intellect: 3 }, active: false },
    ]);
    expect(d.unmodelledSets).toEqual([]);
    expect(d.unmodelledEffects.some((t) => t.includes('Icon of the Silver Crescent'))).toBe(false);
    expect(d.unmodelledEffects.some((t) => t.includes('Band of the Eternal Sage'))).toBe(false);
    expect(d.warnings).toEqual([]);
  });

  it('flags unmodelled sets, unmodelled meta effects, Horde-only items and an inactive meta', () => {
    const preraid = normalizeGear(wowsimsSets.preraid!.items, db);
    const d = describeGear(preraid, db);
    // Stormcaller (29155) is Horde-only: allowed, flagged.
    expect(d.warnings.some((w) => w.includes('Stormcaller'))).toBe(true);
    // Shadow's Embrace 3 pieces: heals only.
    expect(d.unmodelledSets.some((s) => s.startsWith("Shadow's Embrace (3)"))).toBe(true);
    // Mana-Etched Regalia 2 pieces is modelled (+35 hit rating): not listed.
    expect(d.unmodelledSets.some((s) => s.startsWith('Mana-Etched'))).toBe(false);
    // Effects the item database keeps as text are listed. (Before the structured item effects,
    // gear item effects Task 1, this was the pre-raid Quagmirran's Eye; its proc is now a structured
    // `procEffects` entry, which Task 2 derives into the setup.) The SWP gear's Shifting Naaru
    // Sliver (an on-use without a stat buff) stays text.
    const swp = normalizeGear(wowsimsSets.swp!.items, db);
    expect(describeGear(swp, db).unmodelledEffects.some((t) => t.startsWith('Shifting Naaru Sliver: '))).toBe(true);
    // Restored (gear item effects Task 2): the pre-raid Quagmirran's Eye is a modelled effect now.
    expect(d.unmodelledEffects.some((t) => t.startsWith("Quagmirran's Eye"))).toBe(false);
    expect(d.modelledEffects).toContain("Quagmirran's Eye");

    // Voidheart 4pc is modelled since Task 6 (one more DoT tick): no longer listed for the T4 gear;
    // T5's Corruptor bonuses still are.
    const t4 = normalizeGear(wowsimsSets.t4!.items, db);
    expect(describeGear(t4, db).unmodelledSets.some((s) => s.startsWith('Voidheart Raiment'))).toBe(false);
    const t5 = normalizeGear(wowsimsSets.t5!.items, db);
    expect(describeGear(t5, db).unmodelledSets.some((s) => s.startsWith('Corruptor Raiment (2)'))).toBe(true);

    // Powerful Earthstorm Diamond (25896, needs 3 blue) with the author's 2 blue: inactive.
    const earthstorm = normalizeGear(withSlot('head', { id: 31051, gems: [25896, 32218] }), db);
    expect(describeGear(earthstorm, db).metaActive).toBe(false);
    expect(buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, earthstorm, db).setup.modifiers).toEqual([]);
    // Ember Skyfire Diamond (35503, needs 3 red: the author's gems have more): active, and its +2%
    // intellect is listed as unmodelled.
    const emberOn = normalizeGear(withSlot('head', { id: 31051, gems: [35503, 32218] }), db);
    const dOn = describeGear(emberOn, db);
    expect(dOn.metaActive).toBe(true);
    expect(dOn.unmodelledEffects.some((t) => t.includes('Ember Skyfire Diamond'))).toBe(true);
    // An unreviewed set worn with 2+ pieces is listed as such.
    const pvp = Object.values(db.items).filter((i) => i.setName === "Gladiator's Felshroud");
    const bySlot = new Map(pvp.map((i) => [i.slot, i]));
    const gear: (EquippedItem | null)[] = structuredClone(destructionEquipped);
    for (const slot of ['head', 'shoulder', 'chest', 'hands', 'legs'] as const) {
      const item = bySlot.get(slot);
      if (item) gear[slotIndex(slot)] = { id: item.id, gems: [] };
    }
    expect(describeGear(normalizeGear(gear, db), db).unmodelledSets.some((s) => s.includes("Gladiator's Felshroud") && s.includes('not reviewed'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SetupConfig.gear through normalizeSetup and applySetup
// ---------------------------------------------------------------------------

describe('SetupConfig.gear', () => {
  it('old stored setup without gear loads as default gear', () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_SETUP)) as Record<string, unknown>;
    delete stored.gear;
    for (const out of [normalizeSetup(stored, SETUP_CATALOG), normalizeSetup(stored, SETUP_CATALOG, db)]) {
      expect(out.gear).toBeUndefined();
      expect(setupGear(out)).toEqual(DEFAULT_GEAR);
      const { spec } = applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config: out });
      expect(spec.setup.stats).toBe(destructionWarlock.setup.stats);
    }
    // The presets keep the author's gear.
    for (const p of Object.values(SETUP_PRESETS)) expect(setupGear(p.config)).toEqual(DEFAULT_GEAR);
    expect(DEFAULT_SETUP.gear).toBeUndefined();
  });

  it('normalizeSetup normalizes a stored gear (shape without the database, fully with it) and the preset id', () => {
    const bad = { ...structuredClone(DEFAULT_SETUP), gear: withSlot('head', { id: 30913 }), gearPresetId: 't4' };
    const shape = normalizeSetup(bad, SETUP_CATALOG);
    expect(shape.gear?.[0]).toEqual({ id: 30913, gems: [] }); // well-formed, the database decides later
    expect(shape.gearPresetId).toBe('t4');
    const full = normalizeSetup(bad, SETUP_CATALOG, db);
    expect(full.gear?.[0]).toBeNull();
    expect(normalizeSetup(full, SETUP_CATALOG, db)).toEqual(full);
    for (const id of [42, '', 'x'.repeat(65), 'Bad Id', '__proto__']) {
      expect(normalizeSetup({ ...bad, gearPresetId: id }, SETUP_CATALOG).gearPresetId, String(id)).toBeUndefined();
    }
    expect(normalizeSetup({ ...bad, gear: 'junk' }, SETUP_CATALOG, db).gear).toEqual(DEFAULT_GEAR);
  });

  it('applySetup with a different gear changes derived stats as expected (hand-computed for one swap) and leaves destructionWarlock and the DB untouched (deep freeze)', () => {
    // Neck: Translucent Spellthread Necklace (32349: SD 46, hit 15, crit 24) -> Brooch of
    // Unquenchable Fury (28530: int 21, SD 26, hit 15). Delta: int +21, SD -20, crit -24.
    const gear = normalizeGear(withSlot('neck', { id: 28530 }), db);
    const config = deepFreeze({ ...structuredClone(DEFAULT_SETUP), gear });
    const { spec } = applySetup({ buildSpec: (w, g) => buildDestructionWarlock(w, g, db), catalog: SETUP_CATALOG, config });
    const s = spec.setup.stats;
    expect(s.intellect).toBe(433 + 21);
    expect(s.spellPower).toBe(1117 - 20);
    expect(s.critRating).toBe(339 - 24);
    expect(s.hitRating).toBe(196);
    expect(s.shadowPower).toBe(53);
    expect(spec.setup.setPieces).toEqual({ 'malefic-raiment': 4 });
    const d = computeStats(spec.setup, spec.statBonuses);
    const intellect = 454 * 1.05;
    expect(d.maxMana).toBeCloseTo((2615 + 20 + 15 * (intellect - 20)) * 1.03, 9);
    expect(d.power.shadow).toBe(1097 + 130 + 53);
    expect(d.critPct).toBeCloseTo(BASE_CRIT_PCT + 315 / CRIT_RATING_PER_PCT + intellect / INT_PER_CRIT_PCT, 9);
    // The shared spec keeps the author's numbers.
    expect(destructionWarlock.setup.stats.intellect).toBe(433);
    expect(db.items[32349]!.stats.spellPower).toBe(46);
  });
});
