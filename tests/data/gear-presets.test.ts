// Gear presets (stage 2a Task 3): the wowsims warlock gear sets as `GEAR_PRESETS`
// (src/data/classes/warlock/gearPresets.ts), checked against the item database, `normalizeGear`
// (no drops), the wowsims files (tests/fixtures/wowsims-warlock-gear-sets.json) and each other.

import { describe, expect, it } from 'vitest';
import gearSets from '../fixtures/wowsims-warlock-gear-sets.json';
import { buildDestructionWarlock, DEFAULT_WARLOCK_OPTIONS } from '../../src/data/classes/warlock/destruction';
import { GEAR_PRESETS, gearPresetById, offeredGearPresets } from '../../src/data/classes/warlock/gearPresets';
import { deepFreeze } from '../../src/data/common/buffs';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import { buildSetup } from '../../src/engine/gear';
import { computeStats } from '../../src/engine/stats';
import type { EquippedItem } from '../../src/engine/types';
import { normalizeSetup, DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
import { DEFAULT_GEAR, describeGear, normalizeGear } from '../../src/setup/gear';

const db: ItemDb = itemDbSync();
deepFreeze(db);

type RawEntry = { id?: number; enchant?: number; gems?: number[] };
const wowsimsSets = (gearSets as unknown as { sets: Record<string, { items: RawEntry[] }> }).sets;

const STORMCALLER = 29155; // Horde only (db faction 'horde')
const BLADE_OF_THE_ARCHMAGE = 29153; // its Alliance counterpart (db faction 'alliance')
const MAIN_HAND = ITEM_SLOTS.indexOf('mainHand');

/** Which wowsims file each preset comes from (all but the author's gear). */
const WOWSIMS_FILE: Record<string, string> = {
  preraid: 'preraid',
  t4: 't4',
  t5: 't5',
  t6: 't6',
  za: 'za',
  swp: 'swp',
  'fire-preraid': 'destro_fire_preraid',
  'fire-t4': 'destro_fire_t4',
};

/** A wowsims gear.json entry in the normalized gear form ({} -> null, gems always present). */
function asGearEntry(e: RawEntry): EquippedItem | null {
  if (!e.id) return null;
  const out: EquippedItem = { id: e.id };
  if (e.enchant) out.enchant = e.enchant;
  out.gems = e.gems ?? [];
  return out;
}

describe('GEAR_PRESETS', () => {
  it("every preset's items/gems/enchants exist in the DB, slot-compatible, no unknowns", () => {
    for (const preset of GEAR_PRESETS) {
      expect(preset.gear, preset.id).toHaveLength(17);
      // normalizeGear drops nothing: every id is in the database, fits its slot and sockets,
      // every enchant fits its item, no unique item or gem twice, a staff has no off hand.
      expect(normalizeGear(preset.gear, db), preset.id).toEqual(preset.gear);
      const equipped = preset.gear.filter((e): e is EquippedItem => e !== null);
      for (const e of equipped) {
        expect(Object.hasOwn(db.items, e.id), `${preset.id} item ${e.id}`).toBe(true);
        if (e.enchant !== undefined) expect(Object.hasOwn(db.enchants, e.enchant), `${preset.id} enchant ${e.enchant}`).toBe(true);
        for (const g of e.gems ?? []) {
          if (g !== 0) expect(Object.hasOwn(db.gems, g), `${preset.id} gem ${g}`).toBe(true);
        }
      }
      const { unknown } = buildSetup({
        baseStats: buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS).setup.stats,
        equipped,
        items: db.items,
        gems: db.gems,
        enchants: db.enchants,
      });
      expect(unknown, preset.id).toEqual({ items: [], gems: [], enchants: [] });
      // Every slot is filled, except the off hand next to a staff.
      preset.gear.forEach((e, i) => {
        if (e === null) {
          expect(ITEM_SLOTS[i], preset.id).toBe('offHand');
          expect(db.items[preset.gear[MAIN_HAND]!.id]!.twoHand, preset.id).toBe(true);
        }
      });
    }
  });

  it('phase order; shadow presets offered, fire hidden', () => {
    expect(GEAR_PRESETS.map((p) => p.id)).toEqual(['preraid', 't4', 't5', 't6', 'za', 'swp', 'fire-preraid', 'fire-t4', 'author']);
    expect(new Set(GEAR_PRESETS.map((p) => p.id)).size).toBe(GEAR_PRESETS.length);
    const wowsimsShadow = GEAR_PRESETS.filter((p) => p.spec === 'shadow' && p.id !== 'author');
    expect(wowsimsShadow.map((p) => [p.id, p.phase])).toEqual([
      ['preraid', 0],
      ['t4', 1],
      ['t5', 2],
      ['t6', 3],
      ['za', 4],
      ['swp', 5],
    ]);
    expect(GEAR_PRESETS.filter((p) => p.spec === 'fire').map((p) => [p.id, p.phase])).toEqual([
      ['fire-preraid', 0],
      ['fire-t4', 1],
    ]);
    // Offered: the author's gear first, then the wowsims shadow presets in phase order; no Fire.
    const offered = offeredGearPresets();
    expect(offered.map((p) => p.id)).toEqual(['author', 'preraid', 't4', 't5', 't6', 'za', 'swp']);
    expect(offered.every((p) => p.spec === 'shadow')).toBe(true);
    const phases = offered.slice(1).map((p) => p.phase);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(gearPresetById('t6')).toBe(GEAR_PRESETS[3]);
    expect(gearPresetById('fire-t4')?.spec).toBe('fire');
    expect(gearPresetById('nope')).toBeUndefined();
    expect(gearPresetById('__proto__')).toBeUndefined();
    expect(gearPresetById('constructor')).toBeUndefined();
  });

  it('every preset id is a valid setup gearPresetId (kept by normalizeSetup next to its gear)', () => {
    for (const preset of GEAR_PRESETS) {
      const config = normalizeSetup({ ...DEFAULT_SETUP, gear: preset.gear, gearPresetId: preset.id }, SETUP_CATALOG, db);
      expect(config.gearPresetId).toBe(preset.id);
      expect(config.gear).toEqual(preset.gear);
    }
  });

  it("each preset's derived stats are plausible (spell power increases with the phase for the shadow presets: assert >, no magic numbers) and set piece counts match the tier", () => {
    const shadow = GEAR_PRESETS.filter((p) => p.spec === 'shadow' && p.id !== 'author');
    const derived = shadow.map((p) => {
      const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, p.gear, db);
      return { id: p.id, spec, stats: computeStats(spec.setup, spec.statBonuses) };
    });
    for (let i = 1; i < derived.length; i++) {
      expect(derived[i]!.stats.power.shadow, `${derived[i]!.id} > ${derived[i - 1]!.id}`).toBeGreaterThan(
        derived[i - 1]!.stats.power.shadow,
      );
    }
    // Plausible for a level 70 caster: hit and crit percentages within the game's ranges.
    for (const { id, stats } of derived) {
      expect(stats.critPct, id).toBeGreaterThan(5);
      expect(stats.critPct, id).toBeLessThan(40);
      expect(stats.hitPct, id).toBeGreaterThanOrEqual(0);
      expect(stats.hitPct, id).toBeLessThanOrEqual(16);
      expect(stats.maxMana, id).toBeGreaterThan(0);
    }
    const pieces = Object.fromEntries(derived.map((d) => [d.id, d.spec.setup.setPieces]));
    // Pre-raid: no tier set (crafted Shadow's Embrace 3 and Mana-Etched 2).
    expect(pieces.preraid).toEqual({ 'shadows-embrace': 3, 'mana-etched-regalia': 2, 'spellstrike-infusion': 1 });
    expect(pieces.t4!['voidheart-raiment']).toBe(4);
    // T5: the Corruptor hood and leggings, still the Voidheart shoulders and gloves.
    expect(pieces.t5).toEqual({ 'corruptor-raiment': 2, 'voidheart-raiment': 2 });
    expect(pieces.t6).toEqual({ 'malefic-raiment': 4 });
    expect(pieces.za).toEqual({ 'malefic-raiment': 4 });
    // SWP: the Malefic shoulders plus the Sunwell Malefic bracers, belt and boots.
    expect(pieces.swp).toEqual({ 'malefic-raiment': 4 });
    // Every preset's meta gem is active.
    for (const p of GEAR_PRESETS) expect(describeGear(p.gear, db).metaActive, p.id).toBe(true);
  });

  it('presets equal the wowsims gear sets except the documented changes (Stormcaller -> Blade of the Archmage; ZA shoulder and cloak enchants)', () => {
    for (const preset of GEAR_PRESETS.filter((p) => p.id !== 'author')) {
      const expected = wowsimsSets[WOWSIMS_FILE[preset.id]!]!.items.map(asGearEntry);
      if (expected[MAIN_HAND]?.id === STORMCALLER) {
        expected[MAIN_HAND] = { ...expected[MAIN_HAND], id: BLADE_OF_THE_ARCHMAGE };
        expect(preset.note, preset.id).toMatch(/Stormcaller.*Blade of the Archmage/);
      }
      if (preset.id === 'za') {
        // wowsims/tbc (the previous sim) ui/warlock/presets.ts 'P4 Destro': shoulder 28886 =
        // effect 2982 Greater Inscription of Discipline, cloak 33150 = effect 2621 Subtlety.
        expected[ITEM_SLOTS.indexOf('shoulder')]!.enchant = 2982;
        expected[ITEM_SLOTS.indexOf('back')]!.enchant = 2621;
        expect(preset.note).toMatch(/Greater Inscription of Discipline/);
      }
      expect(preset.gear, preset.id).toEqual(expected);
      expect(preset.source, preset.id).toContain(`${WOWSIMS_FILE[preset.id]}.gear.json`);
    }
    // Exactly the two Gnome presets had Stormcaller.
    expect(GEAR_PRESETS.filter((p) => p.note?.includes('Stormcaller')).map((p) => p.id)).toEqual(['preraid', 'fire-preraid']);
  });

  it('no Horde-only item in any preset (the character is a Gnome); the Alliance-only ones are known', () => {
    const alliance = new Set<string>();
    for (const preset of GEAR_PRESETS) {
      expect(describeGear(preset.gear, db).warnings, preset.id).toEqual([]);
      for (const e of preset.gear) {
        if (e === null) continue;
        expect(db.items[e.id]!.faction, `${preset.id} ${e.id}`).not.toBe('horde');
        if (db.items[e.id]!.faction === 'alliance') alliance.add(`${e.id} ${db.items[e.id]!.name}`);
      }
    }
    expect([...alliance].sort()).toEqual(["29153 Blade of the Archmage", "29172 Ashyen's Gift"]);
  });

  it("the author preset is the author's gear ('My gear (export)'), phase of its newest item", () => {
    const author = gearPresetById('author')!;
    expect(author.name).toBe('My gear (export)');
    expect(author.spec).toBe('shadow');
    expect(author.gear).toEqual(DEFAULT_GEAR);
    const newest = Math.max(...author.gear.map((e) => (e ? db.items[e.id]!.phase : 0)));
    expect(author.phase).toBe(newest);
  });

  it('presets are deep-frozen data', () => {
    for (const preset of GEAR_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.gear)).toBe(true);
      for (const e of preset.gear) if (e) expect(Object.isFrozen(e.gems)).toBe(true);
    }
    expect(Object.isFrozen(GEAR_PRESETS)).toBe(true);
  });
});
