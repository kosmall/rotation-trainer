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
import { GEAR_PRESETS } from '../../src/data/classes/warlock/gearPresets';
import { buildPriority, dotExtraTicksForSpec, ROTATION_PRESETS } from '../../src/data/classes/warlock/rotation';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import { activeSetBonuses } from '../../src/engine/sets';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, HitOutcome, LogEvent, SetBonusDef } from '../../src/engine/types';
import type { SpecData } from '../../src/data/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
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
    expect(t4.sets.map((b) => b.name)).toEqual(['Voidheart Raiment (2)', 'Voidheart Raiment (4)', 'Spellstrike Infusion (2)']);
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
    // Task 6: the 4pc (DoT extra tick) is modelled too.
    expect(activeSetBonuses(spec.sets, spec.setup.setPieces).map((b) => b.name)).toEqual(['Voidheart Raiment (2)', 'Voidheart Raiment (4)']);
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
  it('lists Corruptor 2pc/4pc, Wrath of Spellfire 3pc, Shadow\'s Embrace 3pc and Oblivion 2pc/4pc with a reason (Voidheart 4pc is modelled since Task 6)', () => {
    const keys = UNMODELLED_SETS.map((u) => `${u.setId}:${u.pieces}`);
    expect(keys).not.toContain('voidheart-raiment:4');
    for (const k of [
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

// ---------------------------------------------------------------------------
// Voidheart Raiment 4pc (Task 6): one more tick of Corruption and Immolate
// ---------------------------------------------------------------------------

const SEEDS_5 = [1, 2, 3, 4, 5];
const t4Preset = GEAR_PRESETS.find((p) => p.id === 't4')!;

/**
 * Bot mean DPS over seeds 1-5 (window 400, DEFAULT_SETUP plus the preset's gear through
 * applySetup) measured at 309e263, before Task 6. Only the T4 preset wears 4 Voidheart pieces, so
 * every other preset must keep these exactly.
 */
const PRE_TASK_6_MEAN_DPS: Record<string, number> = {
  preraid: 998.8133333333335,
  t4: 1060.9366666666665,
  t5: 1243.2966666666666,
  t6: 1539.8966666666668,
  za: 1515.7633333333335,
  swp: 1817.1333333333337,
  'fire-preraid': 889.3033333333333,
  'fire-t4': 939.14,
  author: 1374.6633333333334,
};

/** A preset's fight as the UI builds it (applySetup); `pieces` overrides the Voidheart piece count. */
function presetFight(gear: readonly unknown[], pieces?: number) {
  const config = { ...structuredClone(DEFAULT_SETUP), gear: normalizeGear(structuredClone(gear) as never, db) };
  const buildSpec = (w: typeof DEFAULT_WARLOCK_OPTIONS, g?: (EquippedItem | null)[]): SpecData => {
    const s = buildDestructionWarlock(w, g, db);
    return pieces === undefined ? s : { ...s, setup: { ...s.setup, setPieces: { ...s.setup.setPieces, 'voidheart-raiment': pieces } } };
  };
  const { spec, sim } = applySetup({ buildSpec, catalog: SETUP_CATALOG, config });
  const run = (seed: number) => {
    const s = new Simulation({
      spec,
      target: BOSS_TARGET,
      seed,
      spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
      infiniteMana: false,
      distanceFromTarget: sim.distanceFromTarget,
      scheduledAuras: sim.scheduledAuras,
      durationMs: sim.durationMs,
    });
    return { dps: runBot(s, spec.priority).dps, log: s.log() };
  };
  return { spec, run, meanDps: () => SEEDS_5.reduce((a, seed) => a + run(seed).dps, 0) / SEEDS_5.length };
}

/** Per application of `auraId` (by its spell): the ticks it dealt and how it ended. */
function applications(log: readonly LogEvent[], auraId: string) {
  const out: { atMs: number; ticks: number; fadeAtMs?: number }[] = [];
  for (const e of log) {
    if (e.auraId !== auraId) continue;
    if (e.type === 'aura-apply') out.push({ atMs: e.atMs, ticks: 0 });
    else if (e.type === 'tick') out.at(-1)!.ticks++;
    else if (e.type === 'aura-fade') out.at(-1)!.fadeAtMs = e.atMs;
  }
  return out;
}

describe('Voidheart Raiment 4pc (Task 6)', () => {
  it('is modelled: one more tick of Corruption and Immolate (wowsims SpellMod_DotNumberOfTicks_Flat +1, Wowhead spell 37380); 4 pieces give the modifier, 3 do not', () => {
    const v4 = bonus('voidheart-raiment', 4);
    expect(v4.modifiers).toEqual([{ spellIds: ['corruption', 'immolate'], dotExtraTicks: 1 }]);
    expect(v4.description).toBe('Increases the duration of your Corruption and Immolate abilities by 3 sec.');
    // The 3 s per tick of both DoTs (auras.ts; Wowhead "every 3 seconds").
    for (const id of ['corruption', 'immolate']) expect(warlockAuras.find((a) => a.id === id)?.tick?.intervalMs).toBe(3000);
    const t4 = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, normalizeGear(t4Preset.gear as never, db), db);
    expect(t4.setup.setPieces['voidheart-raiment']).toBe(4);
    expect(t4.sets.map((b) => b.name)).toEqual(['Voidheart Raiment (2)', 'Voidheart Raiment (4)', 'Spellstrike Infusion (2)']);
    expect(activeSetBonuses(t4.sets, t4.setup.setPieces)).toContain(v4);
    expect(activeSetBonuses(t4.sets, { 'voidheart-raiment': 3 })).not.toContain(v4);
    expect(dotExtraTicksForSpec(t4)).toEqual({ corruption: 1, immolate: 1 });
    expect(dotExtraTicksForSpec({ ...t4, setup: { ...t4.setup, setPieces: { 'voidheart-raiment': 3 } } })).toEqual({});
    // The spec's own priority (buildDestructionWarlock) already uses the extended durations.
    const base = new Simulation({ spec: t4, target: BOSS_TARGET, seed: 1 }).snapshot();
    const snaps = [20000, 22999, 23000, 16500, 19499, 19500].map((remainingMs) => ({
      ...base,
      phase: 'running' as const,
      nowMs: base.durationMs - remainingMs,
    }));
    const answers = (p: typeof t4.priority) => p.map((s) => snaps.map((x) => (s.when ? s.when(x) : true)));
    expect(answers(t4.priority)).toEqual(
      answers(buildPriority(ROTATION_PRESETS.dot.config, DEFAULT_DISTANCE_FROM_TARGET_YD, { corruption: 1, immolate: 1 })),
    );
    expect(answers(t4.priority)).not.toEqual(answers(destructionWarlock.priority));
    // applySetup (the UI's path) passes the extension to buildPriority too; with 3 pieces it does not.
    const dots = (p: typeof t4.priority) => p.filter((x) => x.spellId === 'corruption' || x.spellId === 'immolate');
    expect(answers(dots(presetFight(t4Preset.gear).spec.priority))).toEqual(answers(dots(t4.priority)));
    expect(answers(dots(presetFight(t4Preset.gear, 3).spec.priority))).toEqual(answers(dots(destructionWarlock.priority)));
  });

  it('T4 preset bot fight: Corruption ticks 7 times and Immolate 6 per full cast (21 s / 18 s), instead of 6 and 5 with 3 pieces; more damage', () => {
    const four = presetFight(t4Preset.gear);
    const three = presetFight(t4Preset.gear, 3);
    for (const [fight, corruption, immolate] of [
      [four, { ticks: 7, ms: 21000 }, { ticks: 6, ms: 18000 }],
      [three, { ticks: 6, ms: 18000 }, { ticks: 5, ms: 15000 }],
    ] as const) {
      const logs = SEEDS_5.map((seed) => fight.run(seed).log);
      for (const [auraId, want] of [
        ['corruption', corruption],
        ['immolate', immolate],
      ] as const) {
        const apps = logs.flatMap((log) => applications(log, auraId));
        const full = apps.filter((a) => a.fadeAtMs !== undefined);
        expect(full.length, auraId).toBeGreaterThan(0);
        for (const a of full) expect([a.ticks, a.fadeAtMs! - a.atMs], `${auraId} at ${a.atMs}`).toEqual([want.ticks, want.ms]);
        expect(Math.max(...apps.map((a) => a.ticks)), auraId).toBe(want.ticks);
      }
    }
    // With 3 pieces the fight is the one before Task 6, exactly; the 4pc deals more.
    expect(three.meanDps()).toBe(PRE_TASK_6_MEAN_DPS.t4);
    expect(four.meanDps()).toBeGreaterThan(three.meanDps());
  });

  it('every other preset (none wears 4 Voidheart pieces) keeps its bot DPS exactly', () => {
    for (const p of GEAR_PRESETS) {
      if (p.id === 't4') continue;
      const fight = presetFight(p.gear);
      expect(dotExtraTicksForSpec(fight.spec), p.id).toEqual({});
      expect(fight.meanDps(), p.id).toBe(PRE_TASK_6_MEAN_DPS[p.id]);
    }
  });
});
