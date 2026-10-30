import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import {
  BAND_ICD_AURA_ID,
  BAND_ICD_MS,
  BAND_PROC_CHANCE,
  BAND_PROC_SPELL_IDS,
  warlockItemBuffs,
} from '../../src/data/classes/warlock/buffs';
import { destructionEquipped, destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { items } from '../../src/data/classes/warlock/items';
import { warlockAuras } from '../../src/data/classes/warlock/auras';
import { commonBuffs, consumables, cooldowns, debuffs } from '../../src/data/common/buffs';
import { BOSS_TARGET } from '../../src/data/common/target';
import type { BuffDef, SpecData } from '../../src/data/types';
import { createRng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { AuraDef, HitOutcome, LogEvent, ScheduledAura, SpecHooks, TargetData } from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };

const NEW = [...cooldowns, ...warlockItemBuffs];
const ALL = [...commonBuffs, ...consumables, ...debuffs, ...NEW];

function buff(id: string): BuffDef {
  const b = ALL.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
}

function selfAuraOf(id: string): AuraDef {
  const a = buff(id).effect.selfAura;
  if (!a) throw new Error(`${id} has no selfAura`);
  return a;
}

/** Runs the hooks in order (what Task 9's composeHooks will do). */
function compose(...hooks: (SpecHooks | undefined)[]): SpecHooks {
  return {
    onSpellResolved(e, api) {
      for (const h of hooks) h?.onSpellResolved?.(e, api);
    },
  };
}

/**
 * destructionWarlock with the buffs' item actions, self auras, helper auras and hooks added (the
 * spec side of what applySetup does for an enabled timed, item or proc buff).
 */
function specWith(ids: string[], base: SpecData = destructionWarlock, extraHooks?: SpecHooks): SpecData {
  const extra = ids.map(buff);
  return {
    ...base,
    spells: [...base.spells, ...extra.flatMap((b) => (b.effect.action ? [b.effect.action] : []))],
    auras: [
      ...base.auras,
      ...extra.flatMap((b) => (b.effect.selfAura ? [b.effect.selfAura] : [])),
      ...extra.flatMap((b) => b.effect.auras ?? []),
    ],
    hooks: compose(base.hooks, ...extra.map((b) => b.effect.hooks), extraHooks),
  };
}

/** The scheduled self aura of a timed buff, with the configured (or default) start and duration. */
function scheduled(id: string, startSec?: number, durationSec?: number): ScheduledAura {
  const b = buff(id);
  if (!b.timed || !b.effect.selfAura) throw new Error(`${id} is not timed`);
  return {
    auraId: b.effect.selfAura.id,
    on: 'self',
    atMs: (startSec ?? b.timed.defaultStartSec) * 1000,
    durationMs: (durationSec ?? b.timed.durationSec) * 1000,
  };
}

function newSim(
  spec: SpecData,
  scheduledAuras: ScheduledAura[] = [],
  p: { seed?: number; durationMs?: number; target?: TargetData; infiniteMana?: boolean } = {},
): Simulation {
  return new Simulation({
    spec,
    target: p.target ?? NEVER_MISS,
    seed: p.seed ?? 1,
    infiniteMana: p.infiniteMana ?? true,
    distanceFromTarget: 0,
    scheduledAuras,
    ...(p.durationMs !== undefined ? { durationMs: p.durationMs } : {}),
  });
}

/** The use action's id of an item entry (`BuffEffect.action`). */
function actionId(id: string): string {
  const a = buff(id).effect.action;
  if (!a) throw new Error(`${id} has no action`);
  return a.id;
}

/** Advances to `atMs` and uses the item there (instant: no cast in progress afterwards). */
function useAt(sim: Simulation, atMs: number, buffId: string): void {
  sim.advanceTo(atMs);
  expect(sim.cast(actionId(buffId)), `${buffId} at ${atMs}`).toEqual({ ok: true });
  expect(sim.snapshot().cast).toBeNull();
}

/** Advances to `atMs` and starts `spellId` there; returns the cast's length in ms. */
function castAt(sim: Simulation, atMs: number, spellId: string): number {
  sim.advanceTo(atMs);
  expect(sim.cast(spellId), `${spellId} at ${atMs}`).toEqual({ ok: true });
  const c = sim.snapshot().cast;
  expect(c?.startMs).toBe(atMs);
  return c!.endMs - c!.startMs;
}

const auraLog = (sim: Simulation, auraId: string): Pick<LogEvent, 'atMs' | 'type'>[] =>
  sim
    .log()
    .filter((e) => (e.type === 'aura-apply' || e.type === 'aura-fade') && e.auraId === auraId)
    .map(({ atMs, type }) => ({ atMs, type }));

const damages = (sim: Simulation, spellId: string): number[] =>
  sim
    .log()
    .filter((e) => e.type === 'damage' && e.spellId === spellId)
    .map((e) => e.amount ?? 0);

// ---------------------------------------------------------------------------
// Catalog shape
// ---------------------------------------------------------------------------

describe('timed cooldowns and item effects: catalog', () => {
  it('ids, groups, timed defaults and effect values (wowsims / Wowhead / author log)', () => {
    const ids = ALL.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cooldowns.map((b) => b.id)).toEqual(['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune']);
    expect(warlockItemBuffs.map((b) => b.id)).toEqual(['icon-of-the-silver-crescent', 'band-of-the-eternal-sage']);
    for (const b of NEW) {
      expect(b.id).toMatch(/^[a-z0-9-]+$/);
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(b.icon, b.id).toMatch(/^[a-z0-9_]+$/);
      expect(Number.isInteger(b.wowheadId), b.id).toBe(true);
      expect(b.description.trim().length, b.id).toBeGreaterThan(0);
      expect(b.source.trim().length, b.id).toBeGreaterThan(0);
    }
    expect(buff('heroism').group).toBe('raid');
    expect(buff('destruction-potion').group).toBe('consumable');
    expect(buff('super-mana-potion').group).toBe('consumable');
    expect(buff('dark-rune').group).toBe('consumable');
    expect(buff('icon-of-the-silver-crescent').group).toBe('item');
    expect(buff('band-of-the-eternal-sage').group).toBe('item');

    // Timed: selfAura + timed, the aura's own duration equals the default duration. Only Heroism
    // (another player's spell); the potion and the Icon are item actions since the item-actions
    // feature (no `timed`, the action applies the same aura; tests/data/item-actions.test.ts).
    expect(buff('heroism').timed).toEqual({ defaultStartSec: 0, durationSec: 40 });
    const auraDurations: [string, number][] = [
      ['heroism', 40],
      ['destruction-potion', 15],
      ['icon-of-the-silver-crescent', 20],
    ];
    for (const [id, dur] of auraDurations) {
      expect(selfAuraOf(id).durationMs, id).toBe(dur * 1000);
      expect(selfAuraOf(id).id, id).toBe(id);
    }
    for (const id of ['destruction-potion', 'icon-of-the-silver-crescent']) {
      expect(buff(id).timed, id).toBeUndefined();
      expect(buff(id).effect.action?.applyAura, id).toEqual({ auraId: id, on: 'self' });
    }
    expect(selfAuraOf('heroism').selfStatMultipliers).toEqual({ haste: 1.3 });
    expect(selfAuraOf('destruction-potion').selfStatBonuses).toEqual({ spellPower: 120 });
    expect(selfAuraOf('destruction-potion').selfModifiers).toEqual([{ critPctDelta: 2 }]);
    expect(selfAuraOf('icon-of-the-silver-crescent').selfStatBonuses).toEqual({ spellPower: 155 });

    // Band: a proc, not timed: a 10 s buff and a hidden 60 s internal cooldown, both helper auras.
    const band = buff('band-of-the-eternal-sage');
    expect(band.timed).toBeUndefined();
    expect(band.effect.selfAura).toBeUndefined();
    expect(band.effect.hooks?.onSpellResolved).toBeTypeOf('function');
    const [bandBuff, bandIcd] = band.effect.auras ?? [];
    expect(bandBuff).toMatchObject({ id: 'band-of-the-eternal-sage', durationMs: 10000, selfStatBonuses: { spellPower: 95 } });
    expect(bandBuff?.hidden).toBeUndefined();
    expect(bandIcd).toMatchObject({ id: BAND_ICD_AURA_ID, durationMs: 60000, hidden: true });
    expect(bandIcd?.selfStatBonuses).toBeUndefined();
    expect(BAND_ICD_MS).toBe(60000);
    expect(BAND_PROC_CHANCE).toBe(0.1);
  });

  it('entries are deep-frozen and share no aura object with the spec', () => {
    expect(Object.isFrozen(cooldowns) && Object.isFrozen(warlockItemBuffs)).toBe(true);
    const specAuras = new Set<AuraDef>(destructionWarlock.auras);
    for (const b of NEW) {
      expect(Object.isFrozen(b) && Object.isFrozen(b.effect), b.id).toBe(true);
      if (b.effect.action) {
        expect(Object.isFrozen(b.effect.action), b.id).toBe(true);
        expect(destructionWarlock.spells.some((x) => x.id === b.effect.action!.id), b.id).toBe(false);
      }
      for (const a of [b.effect.selfAura, ...(b.effect.auras ?? [])]) {
        if (!a) continue;
        expect(Object.isFrozen(a), a.id).toBe(true);
        expect(specAuras.has(a), a.id).toBe(false);
        expect(destructionWarlock.auras.some((x) => x.id === a.id), a.id).toBe(false);
      }
    }
    expect(warlockAuras.some((a) => Object.isFrozen(a))).toBe(false);
  });

  it('the Icon and the Band are in the default gear with their equip stats only; the effects add only the use/proc value (no double counting)', () => {
    const equippedIds = destructionEquipped.map((e) => e.id);
    expect(equippedIds).toContain(29370);
    expect(equippedIds).toContain(29305);
    // Equip stats (db.json / Wowhead): Icon +43 spell damage; Band +25 int, +34 spell damage, +24 crit.
    expect(items[29370]!.stats).toEqual({ spellPower: 43 });
    expect(items[29305]!.stats).toEqual({ intellect: 25, spellPower: 34, critRating: 24 });
    // The catalog effects are the use / proc buffs only: no static part.
    for (const id of ['icon-of-the-silver-crescent', 'band-of-the-eternal-sage']) {
      const e = buff(id).effect;
      expect(e.statBonuses, id).toBeUndefined();
      expect(e.statMultipliers, id).toBeUndefined();
      expect(e.modifiers, id).toBeUndefined();
    }
    // Enabling them (auras added, nothing active) changes no stat of the spec.
    const spec = specWith(['icon-of-the-silver-crescent', 'band-of-the-eternal-sage']);
    expect(spec.setup).toBe(destructionWarlock.setup);
    expect(spec.statBonuses).toBe(destructionWarlock.statBonuses);
  });
});

// ---------------------------------------------------------------------------
// Heroism, Destruction Potion, Icon in the engine
// ---------------------------------------------------------------------------

describe('timed cooldowns in the engine', () => {
  it('Heroism scheduled at 6000: a Shadow Bolt started at 7000 takes round(2500/1.337) = 1870 ms (±1) and one started at 47000 takes 2431', () => {
    const sim = newSim(specWith(['heroism']), [scheduled('heroism', 6)]);
    // Before it: 45 haste rating only (2500 / 1.02854 = 2430.6).
    expect(castAt(sim, 0, 'shadow-bolt')).toBe(2431);
    // Author's log: 1.86-1.89 s under Heroism (1.3 x 1.02854 = 1.337).
    const during = castAt(sim, 7000, 'shadow-bolt');
    expect(Math.abs(during - Math.round(2500 / 1.337))).toBeLessThanOrEqual(1);
    expect(during).toBe(1870);
    // Heroism lasts 40 s (log): gone at 46000.
    expect(castAt(sim, 47000, 'shadow-bolt')).toBe(2431);
    expect(auraLog(sim, 'heroism')).toEqual([
      { atMs: 6000, type: 'aura-apply' },
      { atMs: 46000, type: 'aura-fade' },
    ]);
  });

  it('Destruction Potion lasts 15000 ms from its use', () => {
    for (const startSec of [0, 7.5, 30]) {
      const sim = newSim(specWith(['destruction-potion']));
      if (startSec === 0) useAt(sim, 0, 'destruction-potion'); // starts the fight (R13)
      castAt(sim, 0, 'shadow-bolt');
      if (startSec > 0) useAt(sim, startSec * 1000, 'destruction-potion');
      sim.advanceTo(60000);
      expect(auraLog(sim, 'destruction-potion'), `start ${startSec}`).toEqual([
        { atMs: startSec * 1000, type: 'aura-apply' },
        { atMs: startSec * 1000 + 15000, type: 'aura-fade' },
      ]);
    }
    // Without a duration override the aura's own 15 s apply too.
    const sim = newSim(specWith(['destruction-potion']), [{ auraId: 'destruction-potion', on: 'self', atMs: 7500 }]);
    castAt(sim, 0, 'shadow-bolt');
    sim.advanceTo(60000);
    expect(auraLog(sim, 'destruction-potion')).toEqual([
      { atMs: 7500, type: 'aura-apply' },
      { atMs: 22500, type: 'aura-fade' },
    ]);
    // +120 spell power while up (a flat bonus like any other).
    const base = computeStats(destructionWarlock.setup, destructionWarlock.statBonuses);
    const up = computeStats(destructionWarlock.setup, {
      ...destructionWarlock.statBonuses,
      spellPower: (destructionWarlock.statBonuses.spellPower ?? 0) + 120,
    });
    expect(up.power.shadow - base.power.shadow).toBe(120);
  });

  it('Destruction Potion: +2% crit while up turns more Shadow Bolts into crits (same seeds)', () => {
    // 40 bolts per fight back to back with and without the potion over the whole fight.
    let critsWith = 0;
    let critsWithout = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const on of [true, false]) {
        const sim = newSim(
          specWith(on ? ['destruction-potion'] : []),
          // The aura itself held for the whole fight (the engine's scheduled path): its crit only.
          on ? [{ auraId: 'destruction-potion', on: 'self', atMs: 0, durationMs: 600000 }] : [],
          { seed, durationMs: 100000 },
        );
        let t = 0;
        while (t < 95000) t += castAt(sim, t, 'shadow-bolt');
        sim.advanceTo(100000);
        const crits = sim.log().filter((e) => e.type === 'damage' && e.crit).length;
        if (on) critsWith += crits;
        else critsWithout += crits;
      }
    }
    expect(critsWith).toBeGreaterThan(critsWithout);
  });

  it('Icon adds 155 spell power for 20 s', () => {
    const sb = destructionWarlock.spells.find((s) => s.id === 'shadow-bolt')!;
    const coeff =
      sb.direct!.coeff +
      destructionWarlock.modifiers
        .filter((m) => (!m.spellIds || m.spellIds.includes('shadow-bolt')) && (!m.schools || m.schools.includes('shadow')))
        .reduce((sum, m) => sum + (m.coeffDelta ?? 0), 0);
    expect(coeff).toBeCloseTo(0.857 + 0.2, 6);
    const power = computeStats(destructionWarlock.setup, destructionWarlock.statBonuses).power.shadow;

    // Icon used at 5 s for its 20 s: bolts landing at 2431 (before), 12431 (during), 32431 (after).
    const run = (spec: SpecData, useIconAtMs?: number) => {
      const sim = newSim(spec, [], { seed: 3 });
      for (const t of [0, 10000, 30000]) {
        if (useIconAtMs !== undefined && useIconAtMs < t && sim.snapshot().nowMs <= useIconAtMs) {
          useAt(sim, useIconAtMs, 'icon-of-the-silver-crescent');
        }
        castAt(sim, t, 'shadow-bolt');
      }
      sim.advanceTo(40000);
      return { sim, dmg: damages(sim, 'shadow-bolt') };
    };
    const withIcon = run(specWith(['icon-of-the-silver-crescent']), 5000);
    const base = run(destructionWarlock);
    const permanent = run({
      ...destructionWarlock,
      statBonuses: { ...destructionWarlock.statBonuses, spellPower: (destructionWarlock.statBonuses.spellPower ?? 0) + 155 },
    });
    expect(withIcon.dmg).toHaveLength(3);
    expect(auraLog(withIcon.sim, 'icon-of-the-silver-crescent')).toEqual([
      { atMs: 5000, type: 'aura-apply' },
      { atMs: 25000, type: 'aura-fade' },
    ]);
    // Before and after: exactly as without the Icon; during: exactly as with +155 spell power.
    expect(withIcon.dmg[0]).toBe(base.dmg[0]);
    expect(withIcon.dmg[1]).toBe(permanent.dmg[1]);
    expect(withIcon.dmg[2]).toBe(base.dmg[2]);
    // The gain is 155 x coefficient on top of (rolled base + coefficient x power), rolled base in
    // 544-607, every multiplier the same: (with - base) / base = 155 c / (rolled + c P).
    const ratio = (withIcon.dmg[1]! - base.dmg[1]!) / base.dmg[1]!;
    const slack = 1.5 / base.dmg[1]!;
    expect(ratio).toBeGreaterThanOrEqual((155 * coeff) / (607 + coeff * power) - slack);
    expect(ratio).toBeLessThanOrEqual((155 * coeff) / (544 + coeff * power) + slack);
  });

  it('a timed buff scheduled after the fight end never applies', () => {
    // Heroism is the only timed buff; the potion's and the Icon's auras still go through the same
    // engine path when scheduled directly (the item-actions feature presses them instead).
    const late = (id: string, startSec: number): ScheduledAura =>
      buff(id).timed ? scheduled(id, startSec) : { auraId: selfAuraOf(id).id, on: 'self', atMs: startSec * 1000 };
    for (const id of ['heroism', 'destruction-potion', 'icon-of-the-silver-crescent']) {
      const sim = newSim(specWith([id]), [late(id, 60.001), late(id, 600)]);
      castAt(sim, 0, 'shadow-bolt');
      expect(castAt(sim, 50000, 'shadow-bolt'), id).toBe(2431);
      sim.advanceTo(60000);
      expect(sim.snapshot().phase).toBe('ended');
      expect(auraLog(sim, id), id).toEqual([]);
    }
    // A duration running past the end is cut by it (no fade logged).
    const sim = newSim(specWith(['heroism']), [scheduled('heroism', 50)]);
    castAt(sim, 0, 'shadow-bolt');
    sim.advanceTo(60000);
    expect(auraLog(sim, 'heroism')).toEqual([{ atMs: 50000, type: 'aura-apply' }]);
  });

  it('timed buffs with a custom start/duration from the config are honoured; an item aura lasts its own duration from the use', () => {
    const sim = newSim(specWith(['heroism', 'icon-of-the-silver-crescent']), [scheduled('heroism', 0, 10)]);
    expect(castAt(sim, 0, 'shadow-bolt')).toBe(1870);
    expect(castAt(sim, 12000, 'shadow-bolt')).toBe(2431);
    useAt(sim, 30000, 'icon-of-the-silver-crescent');
    sim.advanceTo(60000);
    expect(auraLog(sim, 'heroism')).toEqual([
      { atMs: 0, type: 'aura-apply' },
      { atMs: 10000, type: 'aura-fade' },
    ]);
    expect(auraLog(sim, 'icon-of-the-silver-crescent')).toEqual([
      { atMs: 30000, type: 'aura-apply' },
      { atMs: 50000, type: 'aura-fade' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Band of the Eternal Sage
// ---------------------------------------------------------------------------

describe('Band of the Eternal Sage', () => {
  const hook = buff('band-of-the-eternal-sage').effect.hooks?.onSpellResolved;

  /** A stub api recording the calls; the ICD is up while `icd.on`. */
  function stubApi(rolls: () => number, icd = { on: false }) {
    const calls = { roll: 0, applied: [] as string[] };
    const api = {
      applyTargetAura: () => {},
      applySelfAura: (id: string) => {
        calls.applied.push(id);
        if (id === BAND_ICD_AURA_ID) icd.on = true;
      },
      roll: () => {
        calls.roll += 1;
        return rolls();
      },
      hasSelfAura: (id: string) => id === BAND_ICD_AURA_ID && icd.on,
      hasTargetAura: () => false,
      addMana: () => 0,
    };
    return { api, calls, icd };
  }

  const fire = (api: ReturnType<typeof stubApi>['api'], spellId: string, outcome: HitOutcome) =>
    hook!({ spellId, outcome, damage: outcome === 'miss' ? 0 : 1000 }, api);

  it('rolls only for landed offensive spells, checks the internal cooldown before rolling, applies the ICD and the buff', () => {
    expect(hook).toBeTypeOf('function');
    // Damaging spells only: Life Tap (no target) and Curse of the Elements (no damage) never roll.
    expect([...BAND_PROC_SPELL_IDS].sort()).toEqual(
      ['conflagrate', 'corruption', 'curse-of-agony', 'curse-of-doom', 'immolate', 'incinerate', 'shadow-bolt', 'shadowburn'].sort(),
    );
    for (const id of ['life-tap', 'curse-of-the-elements']) {
      const { api, calls } = stubApi(() => 0);
      fire(api, id, 'hit');
      expect(calls, id).toEqual({ roll: 0, applied: [] });
    }
    // A miss: no roll.
    {
      const { api, calls } = stubApi(() => 0);
      fire(api, 'shadow-bolt', 'miss');
      expect(calls).toEqual({ roll: 0, applied: [] });
    }
    // A landed hit, crit or DoT application with a roll under the chance: ICD first, then the buff.
    for (const [spellId, outcome] of [
      ['shadow-bolt', 'hit'],
      ['shadow-bolt', 'crit'],
      ['corruption', 'hit'],
    ] as const) {
      const { api, calls } = stubApi(() => 0.05);
      fire(api, spellId, outcome);
      expect(calls).toEqual({ roll: 1, applied: [BAND_ICD_AURA_ID, 'band-of-the-eternal-sage'] });
    }
    // A roll at or over the chance: nothing applied.
    {
      const { api, calls } = stubApi(() => 0.1);
      fire(api, 'shadow-bolt', 'hit');
      expect(calls).toEqual({ roll: 1, applied: [] });
    }
    // On internal cooldown: no roll at all (so no random draw is shifted).
    {
      const { api, calls } = stubApi(() => 0, { on: true });
      for (let i = 0; i < 10; i++) fire(api, 'shadow-bolt', 'hit');
      expect(calls).toEqual({ roll: 0, applied: [] });
    }
    // After a proc the ICD stops the rolls.
    {
      const { api, calls } = stubApi(() => 0);
      for (let i = 0; i < 10; i++) fire(api, 'shadow-bolt', 'hit');
      expect(calls).toEqual({ roll: 1, applied: [BAND_ICD_AURA_ID, 'band-of-the-eternal-sage'] });
    }
    // Proc rate per roll with a seeded Rng (ICD cleared after each proc): near 10%.
    const rng = createRng(4242);
    const s = stubApi(() => rng.next());
    let procs = 0;
    for (let i = 0; i < 3000; i++) {
      fire(s.api, 'shadow-bolt', 'hit');
      if (s.icd.on) {
        procs += 1;
        s.icd.on = false;
      }
    }
    expect(s.calls.roll).toBe(3000);
    expect(Math.abs(procs / 3000 - BAND_PROC_CHANCE)).toBeLessThanOrEqual(0.02);
  });

  it('Band: proc rate over many seeds is near the configured chance, never twice within 60 s of the first proc (log), buff lasts 10 s', () => {
    let rolls = 0;
    let procs = 0;
    // Counts the Band hook's rolls: a pass-through api in front of the Band's hook.
    const bandHook = buff('band-of-the-eternal-sage').effect.hooks!;
    const counting: SpecHooks = {
      onSpellResolved(e, api) {
        bandHook.onSpellResolved!(e, {
          ...api,
          roll: () => {
            rolls += 1;
            return api.roll();
          },
        });
      },
    };
    const durationMs = 300000;
    for (let seed = 1; seed <= 25; seed++) {
      const withBand: SpecData = {
        ...destructionWarlock,
        auras: [...destructionWarlock.auras, ...(buff('band-of-the-eternal-sage').effect.auras ?? [])],
        hooks: compose(destructionWarlock.hooks, counting),
      };
      const sim = newSim(withBand, [], { seed, durationMs, target: BOSS_TARGET, infiniteMana: false });
      runBot(sim, withBand.priority, 20);
      const applies = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'band-of-the-eternal-sage');
      const fades = sim.log().filter((e) => e.type === 'aura-fade' && e.auraId === 'band-of-the-eternal-sage');
      const icdApplies = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === BAND_ICD_AURA_ID);
      procs += applies.length;
      expect(icdApplies.map((e) => e.atMs)).toEqual(applies.map((e) => e.atMs));
      for (let i = 1; i < applies.length; i++) {
        expect(applies[i]!.atMs - applies[i - 1]!.atMs, `seed ${seed}`).toBeGreaterThanOrEqual(BAND_ICD_MS);
      }
      // Each buff fades exactly 10 s after it starts (unless the fight ends first).
      for (const a of applies) {
        if (a.atMs + 10000 > durationMs) continue;
        expect(fades.some((f) => f.atMs === a.atMs + 10000), `seed ${seed} at ${a.atMs}`).toBe(true);
      }
      // Hidden ICD: never in the snapshot.
      expect(Object.keys(sim.snapshot().selfAuras)).not.toContain(BAND_ICD_AURA_ID);
    }
    expect(procs).toBeGreaterThan(25);
    expect(Math.abs(procs / rolls - BAND_PROC_CHANCE)).toBeLessThanOrEqual(0.03);
  });

  it('while the Band buff is up the player has +95 spell power (Shadow Bolt as with a permanent +95)', () => {
    // Force a proc on the first landed bolt: a roll stub only for the Band hook.
    const bandHook = buff('band-of-the-eternal-sage').effect.hooks!;
    const alwaysProc: SpecHooks = {
      onSpellResolved(e, api) {
        bandHook.onSpellResolved!(e, { ...api, roll: () => 0 });
      },
    };
    const spec: SpecData = {
      ...destructionWarlock,
      auras: [...destructionWarlock.auras, ...(buff('band-of-the-eternal-sage').effect.auras ?? [])],
      hooks: compose(destructionWarlock.hooks, alwaysProc),
    };
    const run = (s: SpecData) => {
      const sim = newSim(s, [], { seed: 5 });
      for (const t of [0, 5000, 20000]) castAt(sim, t, 'shadow-bolt');
      sim.advanceTo(30000);
      return { sim, dmg: damages(sim, 'shadow-bolt') };
    };
    const band = run(spec);
    const base = run(destructionWarlock);
    const plus95 = run({
      ...destructionWarlock,
      statBonuses: { ...destructionWarlock.statBonuses, spellPower: (destructionWarlock.statBonuses.spellPower ?? 0) + 95 },
    });
    // Proc at the first landing (2431), buff to 12431; second bolt lands at 7431 (during), third
    // at 22431 (after, ICD still up so no new proc).
    expect(auraLog(band.sim, 'band-of-the-eternal-sage')).toEqual([
      { atMs: 2431, type: 'aura-apply' },
      { atMs: 12431, type: 'aura-fade' },
    ]);
    expect(band.dmg[0]).toBe(base.dmg[0]);
    expect(band.dmg[1]).toBe(plus95.dmg[1]);
    expect(band.dmg[2]).toBe(base.dmg[2]);
  });
});
