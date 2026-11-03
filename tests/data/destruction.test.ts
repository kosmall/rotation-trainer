import { describe, expect, it } from 'vitest';
import { HASTE_RATING_PER_PCT } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import { warlockAuras } from '../../src/data/classes/warlock/auras';
import {
  DEFAULT_WARLOCK_OPTIONS,
  buildDestructionWarlock,
  destructionBaseStats,
  destructionTalentString,
  destructionWarlock,
  parseTalentString,
} from '../../src/data/classes/warlock/destruction';
import { warlockSpells } from '../../src/data/classes/warlock/spells';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { HitOutcome, SpellDef, TargetData } from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };
const ALWAYS_MISS: TargetData = { ...BOSS_TARGET, missPct: 100, minMissPct: 100 };

const spellIds = new Set(destructionWarlock.spells.map((s) => s.id));
const auraIds = new Set(destructionWarlock.auras.map((a) => a.id));

function spell(id: string): SpellDef {
  const s = destructionWarlock.spells.find((x) => x.id === id);
  if (!s) throw new Error(`no spell ${id}`);
  return s;
}

/** Distance 0 (no travel) unless given: the stage 1 tests below check timings at cast end. */
function newSim(
  p: { spec?: SpecData; target?: TargetData; infiniteMana?: boolean; seed?: number; distanceFromTarget?: number } = {},
) {
  return new Simulation({
    spec: p.spec ?? destructionWarlock,
    target: p.target ?? NEVER_MISS,
    seed: p.seed ?? 1,
    infiniteMana: p.infiniteMana ?? false,
    distanceFromTarget: p.distanceFromTarget ?? 0,
  });
}

/**
 * The spec without gear (Task 12a view: base stats, race and talent multipliers, no items, set
 * bonuses or meta gem), so talent-only numbers such as the 2500 ms Shadow Bolt are not hasted.
 */
function gearless(): SpecData {
  return {
    ...destructionWarlock,
    sets: [],
    setup: {
      stats: destructionBaseStats,
      setPieces: {},
      modifiers: [],
      statMultipliers: destructionWarlock.setup.statMultipliers,
    },
  };
}

/** The gearless spec with every Shadow Bolt forced to crit. */
function alwaysCritShadowBolt(): SpecData {
  const base = gearless();
  return {
    ...base,
    modifiers: [...base.modifiers, { spellIds: ['shadow-bolt'], critPctDelta: 100 }],
  };
}

describe('destructionWarlock structure', () => {
  it('defines the stage 1 spell and aura ids (the spec without Conflagrate: not talented, stage 2b)', () => {
    expect(warlockSpells.map((s) => s.id).sort()).toEqual(
      [
        'shadow-bolt',
        'immolate',
        'corruption',
        'curse-of-agony',
        'curse-of-doom',
        'curse-of-the-elements',
        'conflagrate',
        'shadowburn',
        'incinerate',
        'life-tap',
      ].sort(),
    );
    expect([...auraIds].sort()).toEqual(
      [
        'immolate',
        'corruption',
        'curse-of-agony',
        'curse-of-doom',
        'curse-of-the-elements',
        'shadow-vulnerability',
      ].sort(),
    );
    expect([...spellIds].sort()).toEqual(warlockSpells.map((s) => s.id).filter((id) => id !== 'conflagrate').sort());
    expect(destructionWarlock.spells).toEqual(warlockSpells.filter((s) => s.id !== 'conflagrate'));
    destructionWarlock.spells.forEach((s) => expect(warlockSpells).toContain(s));
    expect(destructionWarlock.auras).toBe(warlockAuras);
  });

  it('every keybind entry is empty or a defined spell id', () => {
    expect(destructionWarlock.keybinds).toHaveLength(12);
    for (const k of destructionWarlock.keybinds) {
      if (k !== '') expect(spellIds.has(k), k).toBe(true);
    }
    const bound = destructionWarlock.keybinds.filter((k) => k !== '');
    expect(new Set(bound).size).toBe(bound.length);
  });

  it('conflagrate (no talent in the build, ruling R17) is in neither keybinds, priority nor the spec\'s spells, but its SpellDef stays', () => {
    expect(destructionWarlock.keybinds).not.toContain('conflagrate');
    expect(destructionWarlock.priority.map((p) => p.spellId)).not.toContain('conflagrate');
    expect(spellIds.has('conflagrate')).toBe(false);
    expect(warlockSpells.some((s) => s.id === 'conflagrate')).toBe(true);
    expect(parseTalentString(destructionTalentString).trees[2]?.[17]).toBe(0); // Destruction #18: Conflagrate
    // Slot positions stay stable: slot 8 (key "8", index 7) is left empty.
    expect(destructionWarlock.keybinds[7]).toBe('');
  });

  it('every priority step references a defined spell', () => {
    expect(destructionWarlock.priority.length).toBeGreaterThan(0);
    for (const step of destructionWarlock.priority) {
      expect(spellIds.has(step.spellId), step.spellId).toBe(true);
      expect(step.label).not.toBe('');
      expect(step.hint).not.toBe('');
    }
    // Shadow Bolt is the unconditional filler and comes last.
    const last = destructionWarlock.priority[destructionWarlock.priority.length - 1];
    expect(last?.spellId).toBe('shadow-bolt');
    expect(last?.when).toBeUndefined();
  });

  it('every spell.applyAura/requiresTargetAura/consumesTargetAura references a defined aura', () => {
    for (const s of destructionWarlock.spells) {
      for (const id of [s.applyAura?.auraId, s.requiresTargetAura, s.consumesTargetAura]) {
        if (id !== undefined) expect(auraIds.has(id), `${s.id} -> ${id}`).toBe(true);
      }
    }
  });

  it('the default talent string parses to 0/21/40 points', () => {
    expect(destructionTalentString).toBe('000000000000000000000-2050130133200100000000-555000512200013330050');
    const parsed = parseTalentString(destructionTalentString);
    expect(parsed.points).toEqual([0, 21, 40]);
    expect(parsed.trees.map((t) => t.length)).toEqual([21, 22, 21]);
    // Destruction tree order (wowsims tbc-new ui/sim/talents/trees/warlock.json): ISB 5, Cataclysm 5, Bane 5.
    expect(parsed.trees[2]?.slice(0, 3)).toEqual([5, 5, 5]);
  });
});

describe('destructionWarlock verified numbers (wowsims tbc-new sim/warlock/spell_data_auto_gen.go)', () => {
  it('Shadow Bolt rank 11 (27209)', () => {
    expect(spell('shadow-bolt')).toMatchObject({
      school: 'shadow',
      manaCost: 420,
      castTimeMs: 3000,
      cooldownMs: 0,
      direct: { min: 544, max: 607, coeff: 0.857 },
    });
  });

  it('Immolate rank 9 (27215): direct 331-332 and a 5 x 123 DoT over 15 s', () => {
    expect(spell('immolate')).toMatchObject({
      school: 'fire',
      manaCost: 445,
      castTimeMs: 2000,
      direct: { min: 331, max: 332, coeff: 0.2 },
      applyAura: { auraId: 'immolate', on: 'target' },
    });
    expect(warlockAuras.find((a) => a.id === 'immolate')).toMatchObject({
      durationMs: 15000,
      tick: { intervalMs: 3000, total: 615, school: 'fire' },
    });
    expect(warlockAuras.find((a) => a.id === 'immolate')?.tick?.coeffTotal).toBeCloseTo(0.65, 9);
  });

  it('Curse of Doom rank 2 (30910): one 4200 tick after 60 s, 60 s cooldown', () => {
    expect(spell('curse-of-doom')).toMatchObject({ manaCost: 380, castTimeMs: 0, cooldownMs: 60000 });
    expect(warlockAuras.find((a) => a.id === 'curse-of-doom')).toMatchObject({
      durationMs: 60000,
      tick: { intervalMs: 60000, total: 4200, coeffTotal: 2, school: 'shadow' },
    });
  });
});

/** All spec modifiers matching one spell, folded like the engine does (deltas summed, multipliers multiplied). */
function folded(id: string) {
  const s = spell(id);
  const out = { castTimeMsDelta: 0, manaCostMult: 1, damageMult: 1, dotDamageMult: 1, critPctDelta: 0, critMultDelta: 0, coeffDelta: 0 };
  for (const m of destructionWarlock.modifiers) {
    if (m.spellIds && !m.spellIds.includes(id)) continue;
    if (m.schools && !m.schools.includes(s.school)) continue;
    out.castTimeMsDelta += m.castTimeMsDelta ?? 0;
    out.manaCostMult *= m.manaCostMult ?? 1;
    out.damageMult *= m.damageMult ?? 1;
    out.dotDamageMult *= m.dotDamageMult ?? 1;
    out.critPctDelta += m.critPctDelta ?? 0;
    out.critMultDelta += m.critMultDelta ?? 0;
    out.coeffDelta += m.coeffDelta ?? 0;
  }
  return out;
}

describe('talent translation (0/21/40, wowsims tbc-new sim/warlock/talents.go)', () => {
  it('Shadow Bolt: Bane -500 ms, Cataclysm x0.95, Devastation +5 and Backlash +3 crit, Ruin +0.5, Shadow and Flame +0.2, Demonic Sacrifice x1.15', () => {
    const m = folded('shadow-bolt');
    expect(m.castTimeMsDelta).toBe(-500);
    expect(m.manaCostMult).toBeCloseTo(0.95, 9);
    expect(m.critPctDelta).toBe(8);
    expect(m.critMultDelta).toBe(0.5);
    expect(m.coeffDelta).toBeCloseTo(0.2, 9);
    expect(m.damageMult).toBeCloseTo(1.15, 9);
  });

  it('Immolate: Bane -500 ms, Emberstorm 3/5 x1.06 direct and periodic, Destruction crit and mana talents', () => {
    expect(folded('immolate')).toEqual({
      castTimeMsDelta: -500,
      manaCostMult: expect.closeTo(0.95, 9),
      damageMult: expect.closeTo(1.06, 9),
      dotDamageMult: expect.closeTo(1.06, 9),
      critPctDelta: 8,
      critMultDelta: 0.5,
      coeffDelta: 0,
    });
  });

  it('Corruption and the curses: only Backlash crit and Demonic Sacrifice x1.15 (periodic too)', () => {
    for (const id of ['corruption', 'curse-of-agony', 'curse-of-doom']) {
      expect(folded(id)).toEqual({
        castTimeMsDelta: 0,
        manaCostMult: 1,
        damageMult: expect.closeTo(1.15, 9),
        dotDamageMult: expect.closeTo(1.15, 9),
        critPctDelta: 3,
        critMultDelta: 0,
        coeffDelta: 0,
      });
    }
  });

  it('Incinerate: Emberstorm -6% of 2500 ms = -150 ms and Shadow and Flame +0.2', () => {
    const m = folded('incinerate');
    expect(m.castTimeMsDelta).toBeCloseTo(-150, 9);
    expect(m.coeffDelta).toBeCloseTo(0.2, 9);
  });
});

describe('destructionWarlock behaviour in the Simulation', () => {
  it('the Immolate and Corruption refresh rules are false while that spell is being cast (Task 13)', () => {
    // The DoT only shows in the snapshot once the cast lands; with the spell queue window a
    // press during the cast would queue a second, clipping cast.
    const rule = (id: string) => {
      const when = destructionWarlock.priority.find((p) => p.spellId === id)?.when;
      if (!when) throw new Error(`no rule for ${id}`);
      return when;
    };
    const sim = new Simulation({ spec: destructionWarlock, target: NEVER_MISS, seed: 1, spellQueueWindowMs: 400 });
    expect(rule('immolate')(sim.snapshot())).toBe(true);
    expect(sim.cast('immolate')).toEqual({ ok: true });
    sim.advanceTo(1200); // Immolate (1458 ms) ends within the 400 ms window
    expect(rule('immolate')(sim.snapshot())).toBe(false);
    expect(rule('corruption')(sim.snapshot())).toBe(true);
    expect(sim.cast('corruption')).toEqual({ ok: true, queued: true });
    sim.advanceTo(1458 + 1700); // Corruption (1945 ms) in progress, Immolate up
    expect(sim.snapshot().cast?.spellId).toBe('corruption');
    expect(rule('immolate')(sim.snapshot())).toBe(false);
    expect(rule('corruption')(sim.snapshot())).toBe(false);
  });

  it('the Immolate and Corruption refresh rules are false while that spell is in flight (Part A)', () => {
    // Real Immolate and Corruption have no missile (spells.ts); give both a hypothetical 20 yd/s
    // missile so the in-flight guard is exercised: after the cast ends the DoT is not on the
    // target for 1400 ms, and without the guard the rule would ask for a second cast at once.
    const spec: SpecData = {
      ...destructionWarlock,
      spells: destructionWarlock.spells.map((s) =>
        s.id === 'immolate' || s.id === 'corruption' ? { ...s, missileSpeed: 20 } : s,
      ),
    };
    const rule = (id: string) => {
      const when = spec.priority.find((p) => p.spellId === id)?.when;
      if (!when) throw new Error(`no rule for ${id}`);
      return when;
    };
    const sim = new Simulation({ spec, target: NEVER_MISS, seed: 1, distanceFromTarget: 28, infiniteMana: true });
    expect(sim.cast('immolate')).toEqual({ ok: true });
    sim.advanceTo(1458); // Immolate (1458 ms) completes; lands at 2858
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'immolate', landsAtMs: 2858 }]);
    expect(sim.snapshot().targetAuras.immolate).toBeUndefined();
    expect(rule('immolate')(sim.snapshot())).toBe(false);
    expect(rule('corruption')(sim.snapshot())).toBe(true);
    expect(sim.cast('corruption')).toEqual({ ok: true });
    sim.advanceTo(1458 + 1945); // Corruption completes at 3403 (lands 4803); Immolate is up
    expect(sim.snapshot().targetAuras.immolate).toBeDefined();
    expect(sim.snapshot().inFlight).toEqual([{ spellId: 'corruption', landsAtMs: 4803 }]);
    expect(rule('immolate')(sim.snapshot())).toBe(false);
    expect(rule('corruption')(sim.snapshot())).toBe(false);
    sim.advanceTo(4803);
    expect(sim.snapshot().targetAuras.corruption).toBeDefined();
    expect(rule('corruption')(sim.snapshot())).toBe(false); // up for 18 s now
  });

  it('the Shadowburn finisher window is Shadow Bolt cast time + travel at 28 yd (2500 + 1400 ms)', () => {
    const when = destructionWarlock.priority.find((p) => p.spellId === 'shadowburn')?.when;
    if (!when) throw new Error('no shadowburn rule');
    const s = newSim().snapshot();
    const at = (remainingMs: number) => when({ ...s, phase: 'running', nowMs: s.durationMs - remainingMs });
    expect(at(3901)).toBe(false);
    expect(at(3900)).toBe(true);
    expect(at(2500)).toBe(true);
    expect(at(1)).toBe(true);
  });

  it('shadow-bolt cast time after modifiers equals the verified value', () => {
    // 3000 ms base (spell data) - 5 x 100 ms Bane (talents.go applyBane) = 2500 ms, no haste.
    const sim = newSim({ spec: gearless() });
    expect(sim.cast('shadow-bolt')).toEqual({ ok: true });
    expect(sim.snapshot().cast).toEqual({ spellId: 'shadow-bolt', startMs: 0, endMs: 2500 });
    // With the default gear: 45 haste rating (Task 12b) -> 2500 / (1 + 45 / 15.77 / 100) = 2431 ms.
    const geared = newSim();
    geared.cast('shadow-bolt');
    const hasted = Math.round(2500 / (1 + 45 / HASTE_RATING_PER_PCT / 100));
    expect(hasted).toBe(2431);
    expect(geared.snapshot().cast).toEqual({ spellId: 'shadow-bolt', startMs: 0, endMs: hasted });
  });

  it('shadow-bolt costs 420 x 0.95 (Cataclysm 5/5) = 399 mana', () => {
    const sim = newSim();
    const max = sim.snapshot().maxMana;
    sim.cast('shadow-bolt');
    sim.advanceTo(2500);
    expect(sim.snapshot().mana).toBeCloseTo(max - 399, 9);
  });

  it('conflagrate requires and consumes immolate (a build with the Conflagrate talent)', () => {
    expect(warlockSpells.find((s) => s.id === 'conflagrate')).toMatchObject({
      requiresTargetAura: 'immolate',
      consumesTargetAura: 'immolate',
    });
    // wowsims tbc-new presets.ts "Destruction": Conflagrate 1/1.
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, '-20500301332101-50500051220051053105');
    const sim = newSim({ spec, infiniteMana: true });
    expect(sim.cast('conflagrate')).toEqual({ ok: false, reason: 'missing-aura' });
    sim.cast('immolate');
    sim.advanceTo(1500);
    expect(sim.snapshot().targetAuras.immolate).toBeDefined();
    expect(sim.cast('conflagrate')).toEqual({ ok: true });
    expect(sim.snapshot().targetAuras.immolate).toBeUndefined();
  });

  it('life-tap gains mana and costs no mana', () => {
    const lifeTap = spell('life-tap');
    expect(lifeTap.manaCost).toBe(0);
    expect(lifeTap.gainMana).toEqual({ amount: 582, coeff: 0.8 });
    const sim = newSim({ spec: gearless() });
    sim.cast('shadow-bolt');
    sim.advanceTo(2500);
    const before = sim.snapshot().mana;
    expect(sim.cast('life-tap')).toEqual({ ok: true });
    // Gearless: no spell power apart from Fel Armor (130): 582 + 0.8 * 130 = 686, capped at maxMana.
    const expected = Math.min(sim.snapshot().maxMana, before + 582 + 0.8 * 130);
    expect(sim.snapshot().mana).toBeCloseTo(expected, 9);
    expect(sim.snapshot().mana).toBeGreaterThan(before);
  });

  it('improved shadow bolt: crit of shadow-bolt applies shadow-vulnerability (via hook), a miss does not', () => {
    const crit = newSim({ spec: alwaysCritShadowBolt() });
    crit.cast('shadow-bolt');
    crit.advanceTo(2500);
    expect(crit.snapshot().targetAuras['shadow-vulnerability']).toEqual({
      auraId: 'shadow-vulnerability',
      stacks: 1,
      charges: 4,
      remainingMs: 12000,
    });
    expect(crit.log()).toContainEqual({
      atMs: 2500,
      type: 'aura-apply',
      spellId: 'shadow-bolt',
      auraId: 'shadow-vulnerability',
    });

    const miss = newSim({ spec: alwaysCritShadowBolt(), target: ALWAYS_MISS });
    miss.cast('shadow-bolt');
    miss.advanceTo(2500);
    expect(miss.snapshot().targetAuras).toEqual({});

    // The hook itself: only a Shadow Bolt crit applies the aura.
    const applied: string[] = [];
    const api = {
      applyTargetAura: (id: string) => applied.push(id),
      applySelfAura: () => undefined,
      roll: () => 0,
      hasSelfAura: () => false,
      hasTargetAura: () => false,
      addMana: () => 0,
    };
    const cases: [string, HitOutcome][] = [
      ['shadow-bolt', 'hit'],
      ['shadow-bolt', 'miss'],
      ['shadowburn', 'crit'],
      ['incinerate', 'crit'],
      ['shadow-bolt', 'crit'],
    ];
    for (const [spellId, outcome] of cases) {
      destructionWarlock.hooks.onSpellResolved?.({ spellId, outcome, damage: 1 }, api);
    }
    expect(applied).toEqual(['shadow-vulnerability']);
  });

  it('shadow-vulnerability: next 4 direct shadow hits x1.2; DoT ticks are multiplied but spend no charge', () => {
    const sv = warlockAuras.find((a) => a.id === 'shadow-vulnerability');
    expect(sv).toMatchObject({
      durationMs: 12000,
      charges: 4,
      damageTakenMult: { schools: ['shadow'], mult: 1.2, consumeChargeOnHit: true, directOnly: true },
    });
  });

  it('setup: level 70 Gnome Warlock base stats, Expansive Mind, Fel Intellect and Demonic Embrace', () => {
    expect(destructionBaseStats).toMatchObject({ intellect: 136, spirit: 139, baseMana: 2615 });
    expect(destructionWarlock.setup.statMultipliers).toEqual({ intellect: 1.05, spirit: 0.95, maxMana: 1.03 });
    // Gearless; the default gear totals are pinned in tests/data/gear.test.ts.
    const d = computeStats(gearless().setup, destructionWarlock.statBonuses);
    // (2615 + 15 * 136 * 1.05 - 280) * 1.03
    expect(d.maxMana).toBeCloseTo((2615 + 15 * 136 * 1.05 - 280) * 1.03, 9);
    expect(d.power.shadow).toBe(130); // Fel Armor 100 x 1.3 (Demonic Aegis 3/3)
  });

  /**
   * Scripted run at the default 28 yd: every 100 ms press the first priority step whose rule
   * holds and whose cast is accepted.
   */
  function scriptedRun(infiniteMana: boolean): { sim: Simulation; casts: string[] } {
    const sim = newSim({ target: BOSS_TARGET, seed: 42, infiniteMana, distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD });
    expect(sim.snapshot().phase).toBe('ready');
    const casts: string[] = [];
    for (let t = 0; sim.snapshot().phase !== 'ended'; t += 100) {
      const s = sim.snapshot();
      for (const step of destructionWarlock.priority) {
        if (step.when && !step.when(s)) continue;
        if (sim.cast(step.spellId).ok) {
          casts.push(step.spellId);
          break;
        }
      }
      sim.advanceTo(t + 100);
    }
    return { sim, casts };
  }

  it('a Simulation built from destructionWarlock constructs without throwing and a 60 s run does not throw', () => {
    const { sim, casts } = scriptedRun(false);
    expect(sim.snapshot().phase).toBe('ended');
    expect(sim.snapshot().damageTotal).toBeGreaterThan(0);
    expect(casts.slice(0, 4)).toEqual(['curse-of-the-elements', 'immolate', 'corruption', 'shadow-bolt']);
    // The gearless 12a character runs out of mana and taps.
    expect(casts).toContain('life-tap');

    const infinite = scriptedRun(true);
    expect(infinite.casts).not.toContain('life-tap');
    // Shadowburn only as the finisher: cast once, and the last spell whose damage lands. The APL
    // keeps casting Shadow Bolt after it (the GCD leaves up to 2442 ms), but such a bolt cannot
    // land before the end (cast 2431 + travel 1400 ms): no impact or direct damage after it.
    expect(infinite.casts.filter((c) => c === 'shadowburn')).toHaveLength(1);
    const after = infinite.casts.slice(infinite.casts.indexOf('shadowburn') + 1);
    expect(after.every((c) => c === 'shadow-bolt')).toBe(true);
    const log = infinite.sim.log();
    const burnAt = log.find((e) => e.type === 'cast-complete' && e.spellId === 'shadowburn')?.atMs ?? -1;
    expect(burnAt).toBeGreaterThanOrEqual(60000 - 3900);
    // Only the bolt completed before Shadowburn may still land (1400 ms after its cast end).
    const boltsAfter = log.filter((e) => e.type === 'cast-complete' && e.spellId === 'shadow-bolt' && e.atMs > burnAt);
    for (const e of boltsAfter) expect(e.atMs + 1400).toBeGreaterThan(60000);
    expect(log.filter((e) => e.type === 'impact' && e.atMs > burnAt + 1400)).toEqual([]);
  });
});

describe('curses: one per target (AuraDef.exclusiveGroup, ruling R22)', () => {
  const CURSES = ['curse-of-the-elements', 'curse-of-agony', 'curse-of-doom'];

  it('the three curses share the group "curse"; no other warlock aura has a group', () => {
    for (const a of warlockAuras) {
      expect(a.exclusiveGroup, a.id).toBe(CURSES.includes(a.id) ? 'curse' : undefined);
    }
  });

  /** Casts `spellId` once the GCD is over; returns its fight time. */
  function castAfterGcd(sim: Simulation, spellId: string): number {
    sim.advanceTo(sim.snapshot().gcdEndsAtMs);
    expect(sim.cast(spellId), spellId).toEqual({ ok: true });
    return sim.snapshot().nowMs;
  }

  const curseIdsOn = (sim: Simulation) => Object.keys(sim.snapshot().targetAuras).filter((id) => CURSES.includes(id));

  it('Curse of Doom replaces Curse of the Elements, and Curse of the Elements replaces Doom (its tick never lands)', () => {
    const sim = newSim({ infiniteMana: true });
    castAfterGcd(sim, 'curse-of-the-elements');
    const doomAt = castAfterGcd(sim, 'curse-of-doom');
    expect(curseIdsOn(sim)).toEqual(['curse-of-doom']);
    expect(sim.log().filter((e) => e.type === 'aura-fade')).toEqual([
      { atMs: doomAt, type: 'aura-fade', auraId: 'curse-of-the-elements' },
    ]);
    const coeAt = castAfterGcd(sim, 'curse-of-the-elements');
    expect(curseIdsOn(sim)).toEqual(['curse-of-the-elements']);
    expect(sim.log().filter((e) => e.type === 'aura-fade' && e.atMs === coeAt)).toEqual([
      { atMs: coeAt, type: 'aura-fade', auraId: 'curse-of-doom' },
    ]);
    sim.advanceTo(60000);
    expect(sim.log().filter((e) => e.type === 'tick' && e.auraId === 'curse-of-doom')).toEqual([]);
  });

  it('Curse of Agony replaces either other curse; only one curse is ever on the target', () => {
    const sim = newSim({ infiniteMana: true });
    for (const id of ['curse-of-the-elements', 'curse-of-agony', 'curse-of-doom', 'curse-of-agony']) {
      castAfterGcd(sim, id);
      expect(curseIdsOn(sim)).toEqual([id]);
    }
  });

  it("Curse of the Elements' x1.1 damage taken is gone once Curse of Doom replaces it", () => {
    // Corruption ticks are deterministic (no crit, no roll): compare the first tick under CoE
    // with the first tick after Doom replaced CoE.
    const firstCorruptionTick = (curses: string[]) => {
      const sim = newSim({ infiniteMana: true });
      for (const id of curses) castAfterGcd(sim, id);
      castAfterGcd(sim, 'corruption');
      sim.advanceTo(20000);
      const tick = sim.log().find((e) => e.type === 'tick' && e.auraId === 'corruption');
      if (tick?.amount === undefined) throw new Error('no corruption tick');
      return tick.amount;
    };
    const withCoe = firstCorruptionTick(['curse-of-the-elements']);
    const replaced = firstCorruptionTick(['curse-of-the-elements', 'curse-of-doom']);
    const none = firstCorruptionTick([]);
    expect(replaced).toBe(none);
    expect(withCoe / replaced).toBeCloseTo(1.1, 2);
  });
});
