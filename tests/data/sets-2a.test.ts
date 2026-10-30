// Set bonuses of stage 2a (Task 2): the sets of the item database that matter to a Destruction
// Warlock (T4 Voidheart, T5 Corruptor, T6 Malefic, the caster sets of the wowsims presets and the
// generic tailoring caster sets). Values: wowsims tbc-new sim/warlock/items.go and
// sim/common/tbc/items_sets.go, Wowhead TBC item-set tooltips (docs/data-sources.md, Part E).

import { describe, expect, it } from 'vitest';
import gearSets from '../fixtures/wowsims-warlock-gear-sets.json';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, DEFAULT_WARLOCK_OPTIONS, destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { warlockAuras } from '../../src/data/classes/warlock/auras';
import {
  MANA_ETCHED_INSIGHT_AURA_ID,
  setBonusesFor,
  SPELLSTRIKE_AURA_ID,
  UNMODELLED_SETS,
  VOIDHEART_FIRE_AURA_ID,
  VOIDHEART_SHADOW_AURA_ID,
  WARLOCK_SET_BONUSES,
  warlockSetAuras,
  warlockSets,
} from '../../src/data/classes/warlock/sets';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import { activeSetBonuses } from '../../src/engine/sets';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, HitOutcome, SetBonusDef } from '../../src/engine/types';
import { normalizeGear } from '../../src/setup/gear';

const db = itemDbSync();
const allBonuses: SetBonusDef[] = [...WARLOCK_SET_BONUSES];
// Spell and aura icons are committed under public/icons/spells/ (tests/data/icons.test.ts).
const iconFiles = new Set(
  Object.keys(import.meta.glob('/public/icons/spells/*.jpg')).map((path) => (path.split('/').pop() ?? '').replace(/\.jpg$/, '')),
);
const wowsimsSets = (gearSets as unknown as { sets: Record<string, { items: Partial<EquippedItem>[] }> }).sets;

const bonus = (setId: string, pieces: number): SetBonusDef => {
  const b = WARLOCK_SET_BONUSES.find((x) => x.setId === setId && x.pieces === pieces);
  if (!b) throw new Error(`no bonus ${setId} (${pieces})`);
  return b;
};

/** Calls a bonus's hook once and records rolls and applied auras. */
function runHook(b: SetBonusDef, e: { spellId: string; outcome: HitOutcome; damage: number }, roll: number) {
  const applied: string[] = [];
  let rolls = 0;
  b.hooks?.onSpellResolved?.(e, {
    applyTargetAura: (id) => applied.push(`target:${id}`),
    applySelfAura: (id) => applied.push(id),
    roll: () => {
      rolls++;
      return roll;
    },
    hasSelfAura: () => false,
    hasTargetAura: () => false,
    addMana: () => 0,
  });
  return { applied, rolls };
}

describe('set bonus data', () => {
  it('every set id of WARLOCK_SET_BONUSES and UNMODELLED_SETS is a set of the database; keys unique; descriptions and sources present', () => {
    const dbSetIds = new Set(Object.values(db.items).flatMap((i) => (i.setId ? [i.setId] : [])));
    const keys = [...WARLOCK_SET_BONUSES, ...UNMODELLED_SETS].map((b) => `${b.setId}:${b.pieces}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The stage 1 list is the start of the full one (same objects).
    warlockSets.forEach((b, i) => expect(WARLOCK_SET_BONUSES[i]).toBe(b));
    for (const b of [...WARLOCK_SET_BONUSES, ...UNMODELLED_SETS]) {
      expect(dbSetIds.has(b.setId), b.setId).toBe(true);
      expect(b.description.length, b.name).toBeGreaterThan(0);
    }
    for (const u of UNMODELLED_SETS) {
      expect(u.reason.length, u.name).toBeGreaterThan(0);
      expect(u.source, u.name).toMatch(/wowsims|wowhead/i);
    }
  });

  it('every set worn with 2+ pieces in the 9 wowsims warlock gear sets is modelled or listed as unmodelled', () => {
    const covered = new Set([...WARLOCK_SET_BONUSES, ...UNMODELLED_SETS].map((b) => b.setId));
    for (const [name, set] of Object.entries(wowsimsSets)) {
      const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, normalizeGear(set.items, db), db);
      for (const [setId, n] of Object.entries(spec.setup.setPieces)) {
        if (n >= 2) expect(covered.has(setId), `${name}: ${setId}`).toBe(true);
      }
    }
  });

  it('the set proc auras have their sourced values and committed icons; a spec has them exactly when it wears the set', () => {
    const byId = new Map(warlockSetAuras.map((a) => [a.id, a]));
    // Flameshadow 37379: shadow damage +135 for 15 s (items.go Voidheart 2pc; Wowhead spell=37379).
    expect(byId.get(VOIDHEART_SHADOW_AURA_ID)).toMatchObject({ wowheadId: 37379, durationMs: 15000, selfStatBonuses: { shadowPower: 135 } });
    // Shadowflame 37378: fire damage +135 for 15 s (Wowhead spell=37378).
    expect(byId.get(VOIDHEART_FIRE_AURA_ID)).toMatchObject({ wowheadId: 37378, durationMs: 15000, selfStatBonuses: { firePower: 135 } });
    // Lesser Spell Blasting 32108: +92 spell damage for 10 s (items_sets.go Spellstrike 2pc).
    expect(byId.get(SPELLSTRIKE_AURA_ID)).toMatchObject({ wowheadId: 32108, durationMs: 10000, selfStatBonuses: { spellPower: 92 } });
    // Insight 37620: +110 spell damage for 15 s (items_sets.go Mana-Etched 4pc, spell 37619).
    expect(byId.get(MANA_ETCHED_INSIGHT_AURA_ID)).toMatchObject({ wowheadId: 37620, durationMs: 15000, selfStatBonuses: { spellPower: 110 } });
    for (const a of warlockSetAuras) {
      expect(a.icon, a.id).toMatch(/^[a-z0-9_]+$/);
      expect(iconFiles.has(a.icon), `public/icons/spells/${a.icon}.jpg`).toBe(true);
    }
    // Every aura a hook applies belongs to its bonus.
    for (const b of WARLOCK_SET_BONUSES) {
      const own = new Set((b.auras ?? []).map((a) => a.id));
      for (const spellId of destructionWarlock.spells.map((s) => s.id)) {
        for (const outcome of ['miss', 'hit', 'crit'] as const) {
          for (const id of runHook(b, { spellId, outcome, damage: 1000 }, 0).applied) expect(own.has(id), `${b.name}: ${id}`).toBe(true);
        }
      }
    }
    // The author's gear: the stage 1 sets and auras, shared.
    expect(destructionWarlock.sets).toBe(warlockSets);
    expect(destructionWarlock.auras).toBe(warlockAuras);
    // The T4 gear: the Voidheart, Spellstrike and Shadow's Embrace pieces; the auras of the worn sets' procs.
    const t4 = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, normalizeGear(wowsimsSets.t4!.items, db), db);
    expect(t4.sets.map((b) => b.name)).toEqual(['Voidheart Raiment (2)', 'Spellstrike Infusion (2)']);
    expect(t4.auras.map((a) => a.id)).toEqual([
      ...warlockAuras.map((a) => a.id),
      VOIDHEART_SHADOW_AURA_ID,
      VOIDHEART_FIRE_AURA_ID,
      SPELLSTRIKE_AURA_ID,
    ]);
  });

  it('setBonusesFor: the modelled bonuses of every set worn with 1+ piece, in table order; warlockSets itself for Malefic only', () => {
    expect(setBonusesFor({ 'malefic-raiment': 4 })).toBe(warlockSets);
    expect(setBonusesFor({ 'malefic-raiment': 1 })).toBe(warlockSets);
    expect(setBonusesFor({})).toEqual([]);
    expect(setBonusesFor({ 'mana-etched-regalia': 2, 'shadows-embrace': 3 }).map((b) => b.name)).toEqual([
      'Mana-Etched Regalia (2)',
      'Mana-Etched Regalia (4)',
    ]);
    expect(setBonusesFor({ 'malefic-raiment': 4, 'netherweave-vestments': 0 })).toBe(warlockSets);
    expect(setBonusesFor(JSON.parse('{"__proto__": 5, "constructor": 3}') as Record<string, number>)).toEqual([]);
  });
});

describe('modelled set bonuses: values and thresholds', () => {
  it('stat bonuses: Mana-Etched 2pc hit 35; Netherweave Vestments 2pc SD 23, 4pc crit 14; Imbued Netherweave 3pc crit 28; Soulcloth Embrace 3pc hit 16', () => {
    expect(bonus('mana-etched-regalia', 2).statBonuses).toEqual({ hitRating: 35 });
    expect(bonus('netherweave-vestments', 2).statBonuses).toEqual({ spellPower: 23 });
    expect(bonus('netherweave-vestments', 4).statBonuses).toEqual({ critRating: 14 });
    expect(bonus('imbued-netherweave', 3).statBonuses).toEqual({ critRating: 28 });
    expect(bonus('soulcloth-embrace', 3).statBonuses).toEqual({ hitRating: 16 });
  });

  it('each modelled bonus is active at its threshold and inactive one piece below', () => {
    for (const b of allBonuses) {
      expect(activeSetBonuses(allBonuses, { [b.setId]: b.pieces }), `${b.name}`).toContain(b);
      expect(activeSetBonuses(allBonuses, { [b.setId]: b.pieces - 1 }), `${b.name}`).not.toContain(b);
    }
  });

  it('Malefic Raiment keeps its stage 1 bonuses (2pc no damage effect, 4pc Shadow Bolt/Incinerate x1.06)', () => {
    expect(bonus('malefic-raiment', 2).modifiers).toBeUndefined();
    expect(bonus('malefic-raiment', 4).modifiers).toEqual([{ spellIds: ['shadow-bolt', 'incinerate'], damageMult: 1.06 }]);
  });

  it('Voidheart 2pc: 5% on a damaging shadow or fire spell hit, the aura of that school; no roll on a miss or without damage', () => {
    const v = bonus('voidheart-raiment', 2);
    expect(runHook(v, { spellId: 'shadow-bolt', outcome: 'hit', damage: 1000 }, 0.049)).toEqual({ applied: [VOIDHEART_SHADOW_AURA_ID], rolls: 1 });
    expect(runHook(v, { spellId: 'shadow-bolt', outcome: 'crit', damage: 2000 }, 0.05)).toEqual({ applied: [], rolls: 1 });
    expect(runHook(v, { spellId: 'incinerate', outcome: 'hit', damage: 1000 }, 0)).toEqual({ applied: [VOIDHEART_FIRE_AURA_ID], rolls: 1 });
    expect(runHook(v, { spellId: 'immolate', outcome: 'hit', damage: 300 }, 0)).toEqual({ applied: [VOIDHEART_FIRE_AURA_ID], rolls: 1 });
    expect(runHook(v, { spellId: 'shadow-bolt', outcome: 'miss', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
    // Corruption's application deals no damage (its ticks never run hooks); Life Tap neither.
    expect(runHook(v, { spellId: 'corruption', outcome: 'hit', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
    expect(runHook(v, { spellId: 'life-tap', outcome: 'hit', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
  });

  it('Spellstrike 2pc: 5% when a damaging spell lands (not on a miss), +92 spell damage', () => {
    const s = bonus('spellstrike-infusion', 2);
    expect(runHook(s, { spellId: 'shadow-bolt', outcome: 'hit', damage: 1000 }, 0.04)).toEqual({ applied: [SPELLSTRIKE_AURA_ID], rolls: 1 });
    expect(runHook(s, { spellId: 'corruption', outcome: 'hit', damage: 0 }, 0.04)).toEqual({ applied: [SPELLSTRIKE_AURA_ID], rolls: 1 });
    expect(runHook(s, { spellId: 'shadow-bolt', outcome: 'hit', damage: 1000 }, 0.05)).toEqual({ applied: [], rolls: 1 });
    expect(runHook(s, { spellId: 'shadow-bolt', outcome: 'miss', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
    expect(runHook(s, { spellId: 'life-tap', outcome: 'hit', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
    expect(runHook(s, { spellId: 'curse-of-the-elements', outcome: 'hit', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
  });

  it('Mana-Etched 4pc: 2% on any damaging spell, a miss included (wowsims: no outcome filter), +110 spell damage', () => {
    const m = bonus('mana-etched-regalia', 4);
    expect(runHook(m, { spellId: 'shadow-bolt', outcome: 'miss', damage: 0 }, 0.019)).toEqual({ applied: [MANA_ETCHED_INSIGHT_AURA_ID], rolls: 1 });
    expect(runHook(m, { spellId: 'shadow-bolt', outcome: 'hit', damage: 1000 }, 0.02)).toEqual({ applied: [], rolls: 1 });
    expect(runHook(m, { spellId: 'life-tap', outcome: 'hit', damage: 0 }, 0)).toEqual({ applied: [], rolls: 0 });
  });

  it('the T4 gear procs Flameshadow in a bot fight, and without the 2pc it never does', () => {
    const gear = normalizeGear(wowsimsSets.t4!.items, db);
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, gear, db);
    expect(activeSetBonuses(spec.sets, spec.setup.setPieces).map((b) => b.name)).toEqual(['Voidheart Raiment (2)']);
    const procs = (s: typeof spec) =>
      [1, 2, 3, 4, 5].reduce((n, seed) => {
        const sim = new Simulation({ spec: s, target: BOSS_TARGET, seed });
        runBot(sim, s.priority);
        return n + sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === VOIDHEART_SHADOW_AURA_ID).length;
      }, 0);
    expect(procs(spec)).toBeGreaterThan(0);
    expect(procs({ ...spec, setup: { ...spec.setup, setPieces: { 'voidheart-raiment': 1 } } })).toBe(0);
  });
});

describe('unmodelled set bonuses', () => {
  it('lists Voidheart 4pc, Corruptor 2pc/4pc, Wrath of Spellfire 3pc, Shadow\'s Embrace 3pc and Oblivion 2pc/4pc with a reason', () => {
    const keys = UNMODELLED_SETS.map((u) => `${u.setId}:${u.pieces}`);
    for (const k of [
      'voidheart-raiment:4',
      'corruptor-raiment:2',
      'corruptor-raiment:4',
      'wrath-of-spellfire:3',
      'shadows-embrace:3',
      'oblivion-raiment:2',
      'oblivion-raiment:4',
    ]) {
      expect(keys, k).toContain(k);
    }
    // Nothing is both modelled and unmodelled.
    const modelled = new Set(WARLOCK_SET_BONUSES.map((b) => `${b.setId}:${b.pieces}`));
    for (const k of keys) expect(modelled.has(k), k).toBe(false);
  });
});
