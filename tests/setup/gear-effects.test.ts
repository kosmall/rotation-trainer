// Gear item effects, Task 2: the "Items and cooldowns" item entries are derived from the worn gear
// and the item database (src/setup/gearEffects.ts), no longer hard-coded. The stage F hand entries
// (Icon of the Silver Crescent, Band of the Eternal Sage) are reproduced exactly: same numbers,
// same bot logs (up to the new ids), same golden means.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { BAND_PROC_SPELL_IDS } from '../../src/data/classes/warlock/buffs';
import { buildDestructionWarlock, destructionEquipped, DEFAULT_WARLOCK_OPTIONS } from '../../src/data/classes/warlock/destruction';
import { authorItemEffects } from '../../src/data/classes/warlock/items';
import { deepFreeze } from '../../src/data/common/buffs';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb, ItemRecord } from '../../src/data/items/types';
import { ITEM_SLOT_COUNT, SPELL_SLOT_COUNT, type BuffDef } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { EquippedItem, HitOutcome, LogEvent, SpecHooks, TargetData } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, setupCatalogFor, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { describeGear, DEFAULT_GEAR } from '../../src/setup/gear';
import {
  deriveGearEffects,
  EMBEDDED_GEAR_EFFECT_SOURCE,
  gearItemRules,
  isGearEffectId,
  LEGACY_ITEM_BUFF_IDS,
  unmodelledGearEffects,
} from '../../src/setup/gearEffects';
import { SETUP_PRESETS } from '../../src/setup/presets';
import { loadSetup, SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { gearPresetById } from '../../src/data/classes/warlock/gearPresets';

const db: ItemDb = itemDbSync();
deepFreeze(db);

type Gear = (EquippedItem | null)[];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };
const slot = (s: (typeof ITEM_SLOTS)[number]) => ITEM_SLOTS.indexOf(s);

/** The author's gear with some slots replaced. */
function gearWith(changes: Partial<Record<(typeof ITEM_SLOTS)[number], EquippedItem | null>>): Gear {
  const gear: Gear = structuredClone(destructionEquipped);
  for (const [s, e] of Object.entries(changes)) gear[slot(s as (typeof ITEM_SLOTS)[number])] = e ?? null;
  return gear;
}

/** A config: DEFAULT_SETUP with the given changes (deep-frozen). */
function config(p: Partial<SetupConfig> = {}): SetupConfig {
  return deepFreeze({ ...structuredClone(DEFAULT_SETUP), ...p });
}

const buildWithDb = (w: typeof DEFAULT_WARLOCK_OPTIONS, g?: readonly (EquippedItem | null)[]) =>
  g === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, g, db);

function apply(c: SetupConfig, withDb = true) {
  return withDb
    ? applySetup({ buildSpec: buildWithDb, catalog: SETUP_CATALOG, config: c, db })
    : applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config: c });
}

function botRuns(c: SetupConfig, withDb = true) {
  const { spec, sim } = apply(c, withDb);
  const out: Record<number, { mean: number; logs: (readonly LogEvent[])[] }> = {};
  for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
    const logs: (readonly LogEvent[])[] = [];
    let total = 0;
    for (const seed of SEEDS) {
      const fight = new Simulation({
        spec,
        target: BOSS_TARGET,
        seed,
        spellQueueWindowMs: w,
        infiniteMana: false,
        distanceFromTarget: sim.distanceFromTarget,
        scheduledAuras: sim.scheduledAuras,
        durationMs: sim.durationMs,
      });
      total += runBot(fight, spec.priority).dps;
      logs.push(fight.log());
    }
    out[w] = { mean: total / SEEDS.length, logs };
  }
  return out;
}

/** cyrb53: a 53-bit string hash (pins the old logs without committing them). */
function hash(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The new ids -> the stage F hand entries' ids (the only difference in the logs). */
const NEW_TO_OLD_IDS: Readonly<Record<string, string>> = {
  'use-item-29370': 'use-icon-of-the-silver-crescent',
  'item-buff:35163': 'icon-of-the-silver-crescent',
  'item-buff:35084': 'band-of-the-eternal-sage',
  'item-icd:29305': 'band-of-the-eternal-sage-icd',
};
const asOldLog = (log: readonly LogEvent[]) =>
  JSON.stringify(
    log.map((e) => ({
      ...e,
      ...(e.spellId !== undefined && { spellId: NEW_TO_OLD_IDS[e.spellId] ?? e.spellId }),
      ...(e.auraId !== undefined && { auraId: NEW_TO_OLD_IDS[e.auraId] ?? e.auraId }),
    })),
  );

/**
 * Captured at 35dc209 (the commit before this task) with the hand entries 'icon-of-the-silver-crescent'
 * and 'band-of-the-eternal-sage': per window, the bot mean over seeds 1-10 and per seed
 * [hash(JSON.stringify(log)), log length] (scratch capture script, same Simulation options as
 * `botRuns`).
 */
const OLD = {
  iconBand: {
    [SPELL_QUEUE_WINDOW_MS]: {
      mean: 1379.2966666666666,
      logs: [[1969369690460356, 174], [6845266269954863, 178], [1496112574125265, 178], [1166499476862131, 176], [504757428030364, 174], [1864332555488592, 177], [446717333914525, 172], [6997151241179583, 180], [7660160354380288, 182], [7101517105280433, 181]],
    },
    0: {
      mean: 1373.4900000000002,
      logs: [[1623120836661617, 143], [6320872214053904, 150], [6098328523885318, 150], [3601844023345289, 148], [1473932756260450, 144], [1476399663096134, 145], [8427210734095245, 141], [201035728089704, 152], [7806649259105434, 154], [7358111448750979, 153]],
    },
  },
  raidLog: {
    [SPELL_QUEUE_WINDOW_MS]: {
      mean: 2294.108333333333,
      logs: [[3398004277887374, 221], [2929942497435096, 222], [545589891677313, 212], [8122836621832933, 216], [328661370030113, 219], [6403364689913049, 227], [2699968427492316, 211], [5020286684019561, 218], [6767959409851407, 213], [8042240686447644, 217]],
    },
    0: {
      mean: 2294.108333333333,
      logs: [[860426071208841, 191], [6262934054205818, 192], [4877992735213234, 182], [6424105513901658, 186], [4220555342269341, 189], [8811643035661478, 197], [6859725717032887, 181], [4560683477189223, 188], [6363404145872566, 183], [7946211916104960, 187]],
    },
  },
} as const;

function expectSameAsOld(runs: ReturnType<typeof botRuns>, old: (typeof OLD)['iconBand' | 'raidLog']) {
  for (const w of [SPELL_QUEUE_WINDOW_MS, 0] as const) {
    expect(runs[w]!.mean, `window ${w}`).toBe(old[w].mean);
    expect(runs[w]!.logs.map((l) => [hash(asOldLog(l)), l.length]), `window ${w}`).toEqual(old[w].logs);
  }
}

/** Serializes entries with functions as a marker (hooks are fresh closures per call). */
const shape = (entries: readonly BuffDef[]) =>
  JSON.parse(JSON.stringify(entries, (_k, v: unknown) => (typeof v === 'function' ? '[function]' : v))) as unknown;

/** A mock hook api: records rolls and applied auras; the ICD state follows the applied auras. */
function mockApi(rollValue = 0) {
  const live = new Set<string>();
  const calls = { rolls: 0, applied: [] as string[] };
  const api = {
    applyTargetAura: () => {},
    applySelfAura: (id: string) => {
      calls.applied.push(id);
      live.add(id);
    },
    roll: () => {
      calls.rolls++;
      return rollValue;
    },
    hasSelfAura: (id: string) => live.has(id),
    hasTargetAura: () => false,
    addMana: () => 0,
  };
  return { api, calls, live };
}

const entry = (entries: readonly BuffDef[], id: string) => {
  const b = entries.find((x) => x.id === id);
  if (!b) throw new Error(`no entry ${id}`);
  return b;
};

/** A copy of the database with extra or replaced item records (synthetic items for edge cases). */
function dbWith(...records: ItemRecord[]): ItemDb {
  return { ...db, items: { ...db.items, ...Object.fromEntries(records.map((r) => [r.id, r])) } };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

describe('deriveGearEffects', () => {
  it("the author's gear gives exactly the Icon (on use) and the Band (proc), with the stage F numbers field by field", () => {
    const entries = deriveGearEffects(DEFAULT_GEAR, db);
    expect(entries.map((b) => b.id)).toEqual(['item:29370', 'item:29305']);
    const icon = entry(entries, 'item:29370');
    expect(icon).toMatchObject({ name: 'Icon of the Silver Crescent', icon: 'inv_weapon_shortblade_23', iconKind: 'item', group: 'item' });
    expect(icon.timed).toBeUndefined();
    expect(icon.exclusiveGroup).toBeUndefined();
    // Stage F: use-icon-of-the-silver-crescent, cooldown 120000, shared 'trinket' 20000, +155 for 20 s.
    expect(icon.effect.action).toEqual({
      id: 'use-item-29370',
      name: 'Icon of the Silver Crescent',
      icon: 'inv_weapon_shortblade_23',
      wowheadId: 35163,
      school: 'physical',
      manaCost: 0,
      castTimeMs: 0,
      onGcd: false,
      canMiss: false,
      canCrit: false,
      item: true,
      cooldownMs: 120000,
      sharedCooldown: { group: 'category-1141', ms: 20000 },
      applyAura: { auraId: 'item-buff:35163', on: 'self' },
    });
    expect(icon.effect.selfAura).toEqual({
      id: 'item-buff:35163',
      name: 'Blessing of the Silver Crescent',
      icon: 'inv_weapon_shortblade_23',
      wowheadId: 35163,
      durationMs: 20000,
      selfStatBonuses: { spellPower: 155 },
    });
    expect(Object.keys(icon.effect).sort()).toEqual(['action', 'selfAura']);

    const band = entry(entries, 'item:29305');
    expect(band).toMatchObject({ name: 'Band of the Eternal Sage', icon: 'inv_jewelry_ring_55', iconKind: 'item', group: 'item' });
    expect(Object.keys(band.effect).sort()).toEqual(['auras', 'hooks']);
    // Stage F: the buff aura first, then the hidden 60 s ICD aura.
    expect(band.effect.auras).toEqual([
      { id: 'item-buff:35084', name: 'Band of the Eternal Sage', icon: 'inv_jewelry_ring_55', wowheadId: 35084, durationMs: 10000, selfStatBonuses: { spellPower: 95 } },
      { id: 'item-icd:29305', name: 'Band of the Eternal Sage (internal cooldown)', icon: 'inv_jewelry_ring_55', wowheadId: 35084, durationMs: 60000, hidden: true },
    ]);
    // 10%: a roll of 0.0999 procs, 0.1 does not (stage F `roll() < BAND_PROC_CHANCE`).
    for (const [roll, procs] of [[0.0999, true], [0.1, false]] as const) {
      const { api, calls } = mockApi(roll);
      band.effect.hooks!.onSpellResolved!({ spellId: 'shadow-bolt', outcome: 'hit', damage: 1 }, api);
      expect(calls.rolls).toBe(1);
      expect(calls.applied).toEqual(procs ? ['item-icd:29305', 'item-buff:35084'] : []);
    }
    expect(icon.description).toContain('+155 spell power for 20 s');
    expect(band.description).toContain('10% chance');
    expect(band.description).toContain('60 s internal cooldown');
  });

  it('without the database (the embedded author records) the entries are the same as through the database', () => {
    expect(shape(deriveGearEffects(DEFAULT_GEAR, EMBEDDED_GEAR_EFFECT_SOURCE))).toEqual(shape(deriveGearEffects(DEFAULT_GEAR, db)));
    // The embedded records equal the database's, field by field, for every author item.
    for (const e of destructionEquipped) {
      const rec = db.items[e.id]!;
      const mine = authorItemEffects[e.id];
      const fields = (r: Partial<ItemRecord> | undefined) =>
        r === undefined ? undefined : { effects: r.effects, useEffects: r.useEffects, procEffects: r.procEffects };
      if (rec.effects === undefined && rec.useEffects === undefined && rec.procEffects === undefined) {
        expect(mine, `item ${e.id}`).toBeUndefined();
      } else {
        expect(mine, `item ${e.id}`).toBeDefined();
        expect({ ...fields(mine), name: mine!.name, icon: mine!.icon }).toEqual({ ...fields(rec), name: rec.name, icon: rec.icon });
      }
    }
    // The default gear's catalog without the database (first paint) holds that derivation.
    expect(shape(setupCatalogFor(DEFAULT_GEAR).filter((b) => isGearEffectId(b.id)))).toEqual(shape(deriveGearEffects(DEFAULT_GEAR, db)));
  });

  it('fresh per call, deep-frozen, sharing no object with the database or another call', () => {
    const a = deriveGearEffects(DEFAULT_GEAR, db);
    const b = deriveGearEffects(DEFAULT_GEAR, db);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]!.effect.hooks).not.toBe(b[1]!.effect.hooks);
    expect(Object.isFrozen(a)).toBe(true);
    for (const e of a) {
      expect(Object.isFrozen(e)).toBe(true);
      expect(Object.isFrozen(e.effect)).toBe(true);
    }
    expect(Object.isFrozen(a[0]!.effect.selfAura!.selfStatBonuses)).toBe(true);
    expect(a[0]!.effect.selfAura!.selfStatBonuses).not.toBe(db.items[29370]!.useEffects![0]!.stats);
    expect(a[1]!.effect.auras![0]!.selfStatBonuses).not.toBe(db.items[29305]!.procEffects![0]!.stats);
  });

  it('pure and total: hostile gear never throws, unknown ids and malformed entries are skipped, a duplicate item counts once', () => {
    const hostile: unknown[] = [
      undefined,
      null,
      'gear',
      42,
      {},
      [null, 'x', { id: -1 }, { id: 1.5 }, { id: '29370' }, { id: 999999999 }, { id: 29370 }, { id: 29370 }],
      new Proxy([], { get: () => { throw new Error('hostile'); } }),
      [new Proxy({}, { get: () => { throw new Error('hostile'); } }), { id: 29305 }],
      Array.from({ length: 100000 }, () => ({ id: 29370 })),
    ];
    for (const g of hostile) {
      expect(() => deriveGearEffects(g as Gear, db)).not.toThrow();
      expect(() => unmodelledGearEffects(g as Gear, db)).not.toThrow();
    }
    expect(deriveGearEffects(hostile[5] as Gear, db).map((b) => b.id)).toEqual(['item:29370']);
    expect(deriveGearEffects(hostile[7] as Gear, db).map((b) => b.id)).toEqual(['item:29305']);
    expect(deriveGearEffects([], db)).toEqual([]);
    // Malformed effects in a record are skipped, not thrown on.
    const bad = { id: 900001, name: 'Bad', slot: 'trinket', icon: 'x', phase: 1, stats: {}, useEffects: [{ buffName: 'B', buffId: 1, stats: { spellPower: 1 }, durationMs: -5, cooldownMs: 1 }], procEffects: 'nope' } as unknown as ItemRecord;
    expect(deriveGearEffects([{ id: 900001 }], dbWith(bad))).toEqual([]);
  });

  it("a second effect of one item gets 'item:<id>:2'; ICDs are per effect, buff auras per buff id", () => {
    const two: ItemRecord = {
      ...db.items[27683]!,
      useEffects: [{ buffName: 'Burst', buffId: 900100, stats: { spellPower: 50 }, durationMs: 10000, cooldownMs: 60000 }],
    };
    const entries = deriveGearEffects(gearWith({ trinket1: { id: 27683 } }), dbWith(two));
    expect(entries.map((b) => b.id)).toEqual(['item:27683', 'item:29370', 'item:29305', 'item:27683:2']);
    expect(entry(entries, 'item:27683').effect.action!.id).toBe('use-item-27683');
    expect(entry(entries, 'item:27683:2').effect.auras!.map((a) => a.id)).toEqual(['item-buff:33370', 'item-icd:27683:2']);
    expect(entry(entries, 'item:29305').effect.auras!.map((a) => a.id)).toEqual(['item-buff:35084', 'item-icd:29305']);
  });

  it('two worn items with the same buff (Scryer\'s Bloodgem, Xi\'ri\'s Gift: 35337) share one aura id; the buff never doubles', () => {
    const gear = gearWith({ trinket1: { id: 29132 }, trinket2: { id: 29179 } });
    const entries = deriveGearEffects(gear, db);
    expect(entries.map((b) => b.id)).toEqual(['item:29132', 'item:29179', 'item:29305']);
    expect(entry(entries, 'item:29132').effect.selfAura!.id).toBe('item-buff:35337');
    expect(entry(entries, 'item:29179').effect.selfAura!.id).toBe('item-buff:35337');
    const applied = apply(config({ gear, enabledBuffs: ['item:29132', 'item:29179'] }));
    expect(applied.spec.auras.filter((a) => a.id === 'item-buff:35337')).toHaveLength(1);
    const sim = new Simulation({ spec: applied.spec, target: NEVER_MISS, seed: 1, infiniteMana: true, scheduledAuras: applied.sim.scheduledAuras });
    const base = sim.snapshot();
    expect(sim.cast('use-item-29132').ok).toBe(true);
    sim.advanceTo(16000); // past the shared 15 s category cooldown, the buff faded
    expect(sim.cast('use-item-29179').ok).toBe(true);
    sim.advanceTo(17000);
    expect(sim.cast('use-item-29132').ok).toBe(false); // its own 90 s cooldown
    expect(sim.snapshot().selfAuras['item-buff:35337']).toMatchObject({ stacks: 1 });
    // A synthetic second buff of the same id with other numbers gets its own aura id.
    const other: ItemRecord = { ...db.items[29179]!, useEffects: [{ ...db.items[29179]!.useEffects![0]!, stats: { spellPower: 1 } }] };
    const mixed = deriveGearEffects(gear, dbWith(other));
    expect(entry(mixed, 'item:29179').effect.selfAura!.id).toBe('item-buff:35337:29179');
    expect(base.selfAuras).toEqual({});
  });

  it('prepull (Chain of the Twilight Owl 24121): a toggle whose aura is on from 0 ms for the whole fight; no action, no slot', () => {
    const gear = gearWith({ neck: { id: 24121, gems: [] } });
    const owl = entry(deriveGearEffects(gear, db), 'item:24121');
    expect(owl.effect.action).toBeUndefined();
    expect(owl.timed).toBeUndefined();
    expect(owl.effect.selfAura).toMatchObject({ id: 'item-buff:31035', durationMs: 1800000, selfStatBonuses: { critRating: 44.153846 } });
    const applied = apply(config({ gear, enabledBuffs: ['item:24121'], fightDurationSec: 600 }));
    expect(applied.sim.scheduledAuras).toEqual([{ auraId: 'item-buff:31035', on: 'self', atMs: 0 }]);
    expect(applied.spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual(['', '', '', '', '', '']);
    const sim = new Simulation({ spec: applied.spec, target: NEVER_MISS, seed: 1, infiniteMana: true, scheduledAuras: applied.sim.scheduledAuras, durationMs: 600000 });
    sim.cast('shadow-bolt');
    sim.advanceTo(599000);
    expect(sim.snapshot().selfAuras['item-buff:31035']).toBeDefined();
  });

  it('unmodelledGearEffects lists the text effects of the worn items', () => {
    expect(unmodelledGearEffects(DEFAULT_GEAR, db)).toEqual(['Riding Crop: Equip: Mount Speed']);
    expect(unmodelledGearEffects(DEFAULT_GEAR, EMBEDDED_GEAR_EFFECT_SOURCE)).toEqual(['Riding Crop: Equip: Mount Speed']);
  });
});

// ---------------------------------------------------------------------------
// Golden equality and migration
// ---------------------------------------------------------------------------

describe('golden and migration', () => {
  it('golden: with nothing enabled the default setup is exactly 1425.1766666666667 / 1428.3350000000003 (with and without the db)', () => {
    for (const withDb of [true, false]) {
      const runs = botRuns(config(), withDb);
      expect(runs[SPELL_QUEUE_WINDOW_MS]!.mean).toBe(1425.1766666666667);
      expect(runs[0]!.mean).toBe(1428.3350000000003);
    }
    const gear = config({ gear: structuredClone(DEFAULT_GEAR) as Gear });
    expect(botRuns(gear)[SPELL_QUEUE_WINDOW_MS]!.mean).toBe(1425.1766666666667);
  });

  it('Icon + Band through the new ids (item:29370, item:29305): bot logs byte-identical to the stage F hand entries (up to the ids), means exact', () => {
    const c = config({ enabledBuffs: ['item:29370', 'item:29305'] });
    expectSameAsOld(botRuns(c), OLD.iconBand);
    expectSameAsOld(botRuns(c, false), OLD.iconBand);
    expectSameAsOld(botRuns(config({ gear: structuredClone(DEFAULT_GEAR) as Gear, enabledBuffs: ['item:29370', 'item:29305'] })), OLD.iconBand);
  });

  it("the raid-log preset uses the new ids; its stats at the pull and its bot runs are unchanged", () => {
    const raidLog = SETUP_PRESETS['raid-log'].config;
    expect(raidLog.enabledBuffs.slice(-2)).toEqual(['item:29370', 'item:29305']);
    expect(raidLog.enabledBuffs).not.toContain('icon-of-the-silver-crescent');
    const { spec } = apply(raidLog, false);
    // Captured at 35dc209 (computeStats of the applied spec, and its flat bonuses).
    expect(computeStats(spec.setup, spec.statBonuses)).toEqual({
      maxMana: 11166.822250000003,
      power: { physical: 1433, shadow: 1566, fire: 1513, arcane: 1433, frost: 1433, nature: 1433, holy: 1433 },
      critPct: 24.880005098471514,
      hitPct: 15.53658489217729,
      hastePct: 2.853658675788228,
      spiritRegenPerSec: 42.47675382524993,
      mp5RegenPerSec: 10,
    });
    expect(spec.statBonuses).toEqual({ spellPower: 316, intellect: 58, spirit: 38, critRating: 20, mp5: 50, shadowPower: 80, firePower: 80 });
    expectSameAsOld(botRuns(raidLog, false), OLD.raidLog);
    expectSameAsOld(botRuns(raidLog), OLD.raidLog);
  });

  it('old ids migrate in normalizeSetup, in storage and in the old raid-log preset; order kept, duplicates once', () => {
    expect(LEGACY_ITEM_BUFF_IDS).toEqual({ 'icon-of-the-silver-crescent': 'item:29370', 'band-of-the-eternal-sage': 'item:29305' });
    const n = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['band-of-the-eternal-sage', 'heroism', 'icon-of-the-silver-crescent'] }, SETUP_CATALOG);
    expect(n.enabledBuffs).toEqual(['item:29305', 'heroism', 'item:29370']);
    const dup = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['item:29370', 'icon-of-the-silver-crescent'] }, SETUP_CATALOG);
    expect(dup.enabledBuffs).toEqual(['item:29370']);
    const old = { ...structuredClone(SETUP_PRESETS['raid-log'].config) as SetupConfig };
    old.enabledBuffs = old.enabledBuffs.map((id) => (id === 'item:29370' ? 'icon-of-the-silver-crescent' : id === 'item:29305' ? 'band-of-the-eternal-sage' : id));
    const store = { getItem: (k: string) => (k === SETUP_STORAGE_KEY ? JSON.stringify(old) : null), setItem: () => {}, removeItem: () => {} };
    expect(loadSetup(store, SETUP_CATALOG)).toEqual(SETUP_PRESETS['raid-log'].config);
    expect(normalizeSetup(old, SETUP_CATALOG, db)).toEqual(SETUP_PRESETS['raid-log'].config);
  });

  it('stale enabled ids (the item is no longer worn) stay in the config but are inactive and not in the gear catalog', () => {
    const gear = gearWith({ trinket2: { id: 27683 } }); // Quagmirran's Eye in place of the Icon
    const c = config({ gear, enabledBuffs: ['item:29370', 'destruction-potion'] });
    expect(normalizeSetup(c, SETUP_CATALOG, db).enabledBuffs).toEqual(['item:29370', 'destruction-potion']);
    const applied = apply(c);
    expect(applied.spec.spells.some((s) => s.id === 'use-item-29370')).toBe(false);
    expect(applied.spec.auras.some((a) => a.id === 'item-buff:35163')).toBe(false);
    expect(applied.spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual(['use-destruction-potion', '', '', '', '', '']);
    expect(setupCatalogFor(gear, db).map((b) => b.id)).not.toContain('item:29370');
    expect(setupCatalogFor(gear, db).map((b) => b.id)).toContain('item:27683');
    expect(setupCatalogFor(gear, db).slice(0, STATIC_SETUP_CATALOG.length)).toEqual(STATIC_SETUP_CATALOG);
  });

  it('hostile enabledBuffs: only catalog ids and well-formed item ids survive; applySetup never throws', () => {
    const junk: unknown[] = [
      'item:', 'item:0', 'item:-1', 'item:1e3', 'item:29370:1', 'item:29370:x', 'item:29370 ', ' item:29370', 'item:01',
      `item:${'9'.repeat(40)}`, '__proto__', 'constructor', 42, null, {}, ['item:29370'], 'item:29370:2', 'item:27683', 'heroism',
      ...Array.from({ length: 5000 }, (_, i) => `item:${i + 1}`),
    ];
    const n = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: junk }, SETUP_CATALOG);
    // At most 32 item ids that are not catalog ids are kept, the last ones (gear item effects Task 3).
    expect(n.enabledBuffs).toEqual(['heroism', ...Array.from({ length: 32 }, (_, i) => `item:${5000 - 31 + i}`)]);
    const few = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: junk.slice(0, 19) }, SETUP_CATALOG);
    expect(few.enabledBuffs).toEqual(['item:29370:2', 'item:27683', 'heroism']);
    expect(n.enabledBuffs.every((id) => SETUP_CATALOG.some((b) => b.id === id) || isGearEffectId(id))).toBe(true);
    expect(() => apply(config({ enabledBuffs: n.enabledBuffs }))).not.toThrow();
    expect(() => apply(config({ enabledBuffs: n.enabledBuffs }), false)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// On-use items
// ---------------------------------------------------------------------------

describe('on-use items from the gear', () => {
  it('swapping a trinket for an on-use stat trinket adds its action to the item row; its aura works in a scripted fight; both trinkets share the 1141 category', () => {
    const gear = gearWith({ trinket1: { id: 29132 } }); // Scryer's Bloodgem in place of the Riding Crop
    const applied = apply(config({ gear, enabledBuffs: ['item:29132', 'item:29370'] }));
    expect(applied.spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual(['use-item-29132', 'use-item-29370', '', '', '', '']);
    expect(applied.spec.priority.slice(0, 2).map((s) => s.spellId)).toEqual(['use-item-29132', 'use-item-29370']);
    const sim = new Simulation({ spec: applied.spec, target: NEVER_MISS, seed: 1, infiniteMana: true, scheduledAuras: applied.sim.scheduledAuras });
    expect(sim.cast('use-item-29132').ok).toBe(true);
    const s = sim.snapshot();
    expect(s.selfAuras['item-buff:35337']).toMatchObject({ remainingMs: 15000 });
    expect(s.cooldownRemainingMs['use-item-29370']).toBe(15000); // Bloodgem's category time
    sim.advanceTo(15000);
    expect(sim.snapshot().selfAuras['item-buff:35337']).toBeUndefined();
    expect(sim.cast('use-item-29370').ok).toBe(true);
    expect(sim.snapshot().cooldownRemainingMs['use-item-29132']).toBe(75000); // its own 90 s left (> the Icon's 20 s)
    // +150 spell power while up: a Shadow Bolt under it hits harder than one without.
    const plain = apply(config({ gear }));
    const hit = (spec: typeof applied.spec, use: boolean) => {
      const f = new Simulation({ spec, target: NEVER_MISS, seed: 3, infiniteMana: true });
      if (use) f.cast('use-item-29132');
      f.cast('shadow-bolt');
      f.advanceTo(5000);
      return f.log().filter((e) => e.type === 'damage').reduce((a, e) => a + (e.amount ?? 0), 0);
    };
    expect(hit(applied.spec, true)).toBeGreaterThan(hit(plain.spec, false));
  });

  it('the bot rule of a derived on-use item is the burst rule (with Heroism, then whenever ready)', () => {
    const entries = deriveGearEffects(gearWith({ trinket1: { id: 29132 } }), db);
    const rules = gearItemRules(entries);
    expect(Object.keys(rules)).toEqual(['use-item-29132', 'use-item-29370']);
    expect(rules['use-item-29132']!.label).toBe("Scryer's Bloodgem");
    expect(rules['use-item-29132']!.hint(null)).toContain('+150 spell power for 15 s');
  });

  it('7 enabled on-use effects: the first 6 take Z X C V B N, the 7th is not bound and describeGear reports it', () => {
    const many: ItemRecord = {
      ...db.items[29132]!,
      useEffects: [1, 2, 3, 4].map((n) => ({ buffName: `Burst ${n}`, buffId: 900200 + n, stats: { spellPower: n }, durationMs: 10000, cooldownMs: 60000 })),
    };
    const big = dbWith(many);
    const gear = gearWith({ trinket1: { id: 29132 } });
    const enabledBuffs = ['destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29132', 'item:29132:2', 'item:29132:3', 'item:29132:4', 'item:29370'];
    const applied = applySetup({ buildSpec: buildWithDb, catalog: SETUP_CATALOG, config: config({ gear, enabledBuffs }), db: big });
    expect(ITEM_SLOT_COUNT).toBe(6);
    expect(applied.spec.keybinds).toHaveLength(SPELL_SLOT_COUNT + 6);
    expect(applied.spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual([
      'use-destruction-potion', 'use-super-mana-potion', 'use-dark-rune', 'use-item-29132', 'use-item-29132-2', 'use-item-29132-3',
    ]);
    for (const id of ['use-item-29132-4', 'use-item-29370']) {
      expect(applied.spec.spells.some((s) => s.id === id), id).toBe(false);
      expect(applied.spec.priority.some((s) => s.spellId === id), id).toBe(false);
    }
    const d = describeGear(gear, big, { enabledBuffs, catalog: SETUP_CATALOG });
    expect(d.unboundItemEffects).toEqual([
      "Scryer's Bloodgem (Burst 4): not on the item row (6 slots, all taken)",
      'Icon of the Silver Crescent: not on the item row (6 slots, all taken)',
    ]);
    expect(describeGear(gear, big).unboundItemEffects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Procs
// ---------------------------------------------------------------------------

describe('proc items from the gear', () => {
  const quagGear = gearWith({ trinket1: { id: 27683 } });
  const quag = () => entry(deriveGearEffects(quagGear, db), 'item:27683');

  it("Quagmirran's Eye: proc entry +320 haste for 6 s, 10% per cast, 45 s ICD", () => {
    expect(quag().effect.auras).toEqual([
      { id: 'item-buff:33370', name: 'Spell Haste', icon: 'inv_misc_gem_pearl_01', wowheadId: 33370, durationMs: 6000, selfStatBonuses: { hasteRating: 320 } },
      { id: 'item-icd:27683', name: "Quagmirran's Eye (internal cooldown)", icon: 'inv_misc_gem_pearl_01', wowheadId: 33370, durationMs: 45000, hidden: true },
    ]);
  });

  it('trigger semantics: cast (every spell but Curse of the Elements, misses too), hit (the Band rule), crit (crits of damaging spells)', () => {
    const run = (b: BuffDef, spellId: string, outcome: HitOutcome) => {
      const { api, calls } = mockApi(0);
      b.effect.hooks!.onSpellResolved!({ spellId, outcome, damage: outcome === 'miss' ? 0 : 1 }, api);
      return calls.rolls;
    };
    const cast = quag();
    const hit = entry(deriveGearEffects(DEFAULT_GEAR, db), 'item:29305');
    const crit = entry(deriveGearEffects(gearWith({ trinket1: { id: 28418 } }), db), 'item:28418');
    const cases: [string, HitOutcome, number, number, number][] = [
      // spell, outcome, cast, hit, crit
      ['shadow-bolt', 'hit', 1, 1, 0],
      ['shadow-bolt', 'crit', 1, 1, 1],
      ['shadow-bolt', 'miss', 1, 0, 0],
      ['immolate', 'hit', 1, 1, 0],
      ['corruption', 'hit', 1, 1, 0],
      ['life-tap', 'hit', 1, 0, 0],
      ['curse-of-the-elements', 'hit', 0, 0, 0],
      ['curse-of-the-elements', 'miss', 0, 0, 0],
    ];
    for (const [spellId, outcome, c, h, k] of cases) {
      expect([run(cast, spellId, outcome), run(hit, spellId, outcome), run(crit, spellId, outcome)], `${spellId} ${outcome}`).toEqual([c, h, k]);
    }
    expect(BAND_PROC_SPELL_IDS).not.toContain('life-tap');
  });

  it('never rolls while the ICD is up; procs at the configured chance; never twice inside the ICD (Simulation, many seeds)', () => {
    const applied = apply(config({ gear: quagGear, enabledBuffs: ['item:27683'], fightDurationSec: 300 }));
    let rolls = 0;
    let rollsDuringIcd = 0;
    const orig = applied.spec.hooks;
    const counting: SpecHooks = {
      onSpellResolved(e, api) {
        const icdUp = api.hasSelfAura('item-icd:27683');
        orig.onSpellResolved?.(e, { ...api, roll: () => { rolls++; if (icdUp) rollsDuringIcd++; return api.roll(); } });
      },
    };
    const spec = { ...applied.spec, hooks: counting };
    let procs = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new Simulation({ spec, target: BOSS_TARGET, seed, infiniteMana: true, scheduledAuras: applied.sim.scheduledAuras, durationMs: 300000, distanceFromTarget: 0 });
      runBot(sim, spec.priority);
      const at = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'item-buff:33370').map((e) => e.atMs);
      const icd = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'item-icd:27683').map((e) => e.atMs);
      expect(icd, `seed ${seed}`).toEqual(at);
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!, `seed ${seed}`).toBeGreaterThanOrEqual(45000);
      procs += at.length;
    }
    expect(rollsDuringIcd).toBe(0);
    expect(rolls).toBeGreaterThan(500);
    expect(Math.abs(procs / rolls - 0.1)).toBeLessThanOrEqual(0.03);
  });

  it('a proc with chance 1 never draws (wowsims: ProcChance 1 skips the roll) and procs on every matching spell outside its ICD', () => {
    const sure: ItemRecord = { ...db.items[27683]!, procEffects: [{ ...db.items[27683]!.procEffects![0]!, chance: 1 }] };
    const b = entry(deriveGearEffects(quagGear, dbWith(sure)), 'item:27683');
    const { api, calls } = mockApi(0.99);
    b.effect.hooks!.onSpellResolved!({ spellId: 'shadow-bolt', outcome: 'hit', damage: 1 }, api);
    b.effect.hooks!.onSpellResolved!({ spellId: 'shadow-bolt', outcome: 'hit', damage: 1 }, api); // ICD up: nothing
    expect(calls).toEqual({ rolls: 0, applied: ['item-icd:27683', 'item-buff:33370'] });
  });

  it('a proc without an ICD (Wrath of Cenarius) refreshes its buff on a re-proc, never stacks', () => {
    const gear = gearWith({ finger2: { id: 21190, gems: [] } });
    const b = entry(deriveGearEffects(gear, db), 'item:21190');
    expect(b.effect.auras!.map((a) => a.id)).toEqual(['item-buff:25907']);
    const applied = apply(config({ gear, enabledBuffs: ['item:21190'] }));
    const always: SpecHooks = { onSpellResolved: (e, api) => applied.spec.hooks.onSpellResolved?.(e, { ...api, roll: () => 0 }) };
    const sim = new Simulation({ spec: { ...applied.spec, hooks: always }, target: NEVER_MISS, seed: 1, infiniteMana: true });
    sim.cast('shadow-bolt');
    sim.advanceTo(3000);
    sim.cast('shadow-bolt');
    sim.advanceTo(6000);
    const applies = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'item-buff:25907').map((e) => e.atMs);
    expect(applies.length).toBe(2);
    expect(sim.snapshot().selfAuras['item-buff:25907']).toMatchObject({ stacks: 1, remainingMs: 10000 - (6000 - applies[1]!) });
  });

  it('separate ICDs per item: two proc items each keep their own', () => {
    const gear = gearWith({ trinket1: { id: 27683 }, trinket2: { id: 30626 } });
    const entries = deriveGearEffects(gear, db);
    expect(entry(entries, 'item:27683').effect.auras![1]!.id).toBe('item-icd:27683');
    expect(entry(entries, 'item:30626').effect.auras![1]!.id).toBe('item-icd:30626');
  });

  it('determinism: advanceTo in one jump equals 100 ms steps with a proc item', () => {
    const applied = apply(config({ gear: quagGear, enabledBuffs: ['item:27683', 'item:29305'] }));
    const play = (stepMs: number | null) => {
      const sim = new Simulation({ spec: applied.spec, target: BOSS_TARGET, seed: 7, infiniteMana: true, scheduledAuras: applied.sim.scheduledAuras, durationMs: 30000 });
      const script = new Map([[0, 'shadow-bolt'], [3000, 'immolate'], [5500, 'shadow-bolt'], [9000, 'shadow-bolt'], [12000, 'corruption'], [14000, 'shadow-bolt'], [20000, 'shadow-bolt']]);
      const to = (atMs: number) => {
        if (stepMs === null) sim.advanceTo(atMs);
        else for (let t = sim.snapshot().nowMs; t < atMs; ) sim.advanceTo((t = Math.min(atMs, t + stepMs)));
      };
      for (const [atMs, spellId] of script) {
        to(atMs);
        sim.cast(spellId);
      }
      to(30000);
      return sim;
    };
    const jump = play(null);
    const steps = play(100);
    expect(steps.log()).toEqual(jump.log());
    expect(steps.snapshot()).toEqual(jump.snapshot());
  });
});

// ---------------------------------------------------------------------------
// describeGear
// ---------------------------------------------------------------------------

describe('describeGear reads the structured effects', () => {
  it("the pre-raid preset's Quagmirran's Eye is a modelled effect, not an unmodelled one", () => {
    const preraid = gearPresetById('preraid')!;
    const d = describeGear(preraid.gear, db);
    expect(d.unmodelledEffects.some((l) => l.startsWith("Quagmirran's Eye"))).toBe(false);
    expect(d.modelledEffects).toContain("Quagmirran's Eye");
    expect(describeGear(DEFAULT_GEAR, db).modelledEffects).toEqual(['Band of the Eternal Sage', 'Icon of the Silver Crescent']);
  });
});

// ---------------------------------------------------------------------------
// Task 3 carry: normalizeEnabled bounds, the modelled-effect validator
// ---------------------------------------------------------------------------

describe('normalizeEnabled bounds (gear item effects Task 3)', () => {
  const norm = (enabledBuffs: unknown[]) => normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs }, SETUP_CATALOG).enabledBuffs;

  it('keeps at most 32 item ids that are not in the catalog, the last ones; catalog ids are not counted', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `item:${i + 1}`);
    const out = norm(['heroism', ...ids, 'arcane-brilliance']);
    expect(out).toEqual(['heroism', ...ids.slice(-32), 'arcane-brilliance']);
    // With the gear's catalog the worn items' ids are catalog ids: never dropped by the cap.
    const catalog = setupCatalogFor(DEFAULT_GEAR, db);
    const withWorn = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['item:29370', ...ids, 'item:29305'] }, catalog).enabledBuffs;
    expect(withWorn).toEqual(['item:29370', ...ids.slice(-32), 'item:29305']);
  });

  it('linear time: 30 000 ids (also repeated and conflicting) normalize in well under a second, same result as the old rule on a small list', () => {
    const big = Array.from({ length: 30000 }, (_, i) => (i % 3 === 0 ? `item:${(i % 500) + 1}` : i % 3 === 1 ? 'flask-of-supreme-power' : 'elixir-of-major-shadow-power'));
    const t0 = performance.now();
    const out = norm(big);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(out.filter((id) => id.startsWith('item:'))).toHaveLength(32);
    // Last wins: the list ends with an elixir, so the flask (a conflict) is gone.
    expect(out).toContain('elixir-of-major-shadow-power');
    expect(out).not.toContain('flask-of-supreme-power');
    // Duplicates count at their last position, conflicts: the later one wins (the stage 1.5 rule).
    expect(norm(['arcane-brilliance', 'heroism', 'arcane-brilliance'])).toEqual(['heroism', 'arcane-brilliance']);
    expect(norm(['elixir-of-major-shadow-power', 'flask-of-supreme-power'])).toEqual(['flask-of-supreme-power']);
    expect(norm(['flask-of-supreme-power', 'elixir-of-major-shadow-power'])).toEqual(['elixir-of-major-shadow-power']);
  });

  it('hasModelledGearEffect uses the derivation validators: a malformed effect is not modelled', async () => {
    const { hasModelledGearEffect } = await import('../../src/setup/gearEffects');
    expect(hasModelledGearEffect(db.items[29370]!)).toBe(true);
    expect(hasModelledGearEffect(db.items[29305]!)).toBe(true);
    expect(hasModelledGearEffect(db.items[25653]!)).toBe(false); // Riding Crop: text only
    const broken = { ...db.items[29370]!, useEffects: [{ ...db.items[29370]!.useEffects![0]!, durationMs: -1 }] } as ItemRecord;
    expect(hasModelledGearEffect(broken)).toBe(false);
    const brokenDb = { ...db, items: { ...db.items, 29370: broken } } as ItemDb;
    expect(describeGear(DEFAULT_GEAR, brokenDb).modelledEffects).toEqual(['Band of the Eternal Sage']);
  });
});
