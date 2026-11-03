// Stage 2b Task 2: talent effects as data (src/data/classes/warlock/talentEffects.ts), talents in
// the spec (buildDestructionWarlock's `talents`) and in the priority (buildPriority's `talents`).
// The author's build must give exactly the stage 1 spec: literal copies of the old
// talentModifiers and keybinds below. Values: docs/data-sources.md, "Part I: talents", Task 2.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { warlockAuras } from '../../src/data/classes/warlock/auras';
import {
  DEFAULT_WARLOCK_OPTIONS,
  buildDestructionWarlock,
  destructionWarlock,
} from '../../src/data/classes/warlock/destruction';
import {
  ROTATION_PRESETS,
  buildPriority,
  rotationWarnings,
  shadowburnFinisherWindowMs,
  type RotationConfig,
} from '../../src/data/classes/warlock/rotation';
import { warlockSpells } from '../../src/data/classes/warlock/spells';
import {
  TALENT_EFFECTS,
  UNMODELLED_TALENTS,
  effectsForBuild,
  type TalentEffect,
} from '../../src/data/classes/warlock/talentEffects';
import { TALENT_TREE, decodeTalents, encodeTalents } from '../../src/data/classes/warlock/talentTree';
import {
  demonicSacrificeModifiers,
  destructionTalentString,
  talentModifiers,
  talentRank,
} from '../../src/data/classes/warlock/talents';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import type { PriorityStep, SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { SpecHooks, SpellModifier, TargetData } from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };
const DOT = ROTATION_PRESETS.dot.config;
const AUTHOR = destructionTalentString;
const authorRanks = () => ({ ...decodeTalents(AUTHOR).ranks });
const withRanks = (changes: Record<string, number>) => encodeTalents({ ...authorRanks(), ...changes });

// wowsims tbc-new ui/specs/warlock/dps/presets.ts talentsString.
const WOWSIMS_AFFLICTION = '05022221112351055003--50500051220001';
const WOWSIMS_DESTRUCTION = '-20500301332101-50500051220051053105';

// The old talents.ts `talentModifiers` (HEAD 5c236e8), copied literally with the author's ranks
// filled in: Cataclysm 5, Bane 5, Devastation 5, Ruin 1, Emberstorm 3, Backlash 3, Shadow and
// Flame 5, Demonic Sacrifice 1. Same expressions, so the same floats.
const DESTRUCTION_SPELLS = ['shadow-bolt', 'immolate', 'incinerate', 'conflagrate', 'shadowburn'];
const OLD_TALENT_MODIFIERS: SpellModifier[] = [
  { spellIds: DESTRUCTION_SPELLS, manaCostMult: 1 - 0.01 * 5 },
  { spellIds: ['shadow-bolt', 'immolate'], castTimeMsDelta: -100 * 5 },
  { spellIds: DESTRUCTION_SPELLS, critPctDelta: 5 },
  { spellIds: DESTRUCTION_SPELLS, critMultDelta: 0.5 },
  { schools: ['fire'], damageMult: 1 + 0.02 * 3, dotDamageMult: 1 + 0.02 * 3 },
  { spellIds: ['incinerate'], castTimeMsDelta: -2500 * 0.02 * 3 },
  { critPctDelta: 3 },
  { spellIds: ['shadow-bolt', 'incinerate'], coeffDelta: 0.04 * 5 },
  { schools: ['shadow'], damageMult: 1.15, dotDamageMult: 1.15 },
];
// The old destruction.ts keybinds (slot 8 empty, ruling R17).
const OLD_KEYBINDS = [
  'shadow-bolt',
  'immolate',
  'corruption',
  'curse-of-the-elements',
  'shadowburn',
  'life-tap',
  'incinerate',
  '',
  'curse-of-agony',
  'curse-of-doom',
  '',
  '',
];

const view = (p: readonly PriorityStep[]) => p.map((s) => [s.spellId, s.label, s.hint]);

function sim(spec: SpecData, seed: number, spellQueueWindowMs = SPELL_QUEUE_WINDOW_MS) {
  return new Simulation({
    spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD,
  });
}

function meanDps(spec: SpecData, priority: readonly PriorityStep[], seeds: number[], w = SPELL_QUEUE_WINDOW_MS) {
  return seeds.map((seed) => runBot(sim(spec, seed, w), priority).dps).reduce((a, b) => a + b, 0) / seeds.length;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Runs every hook of `hooks` for one resolved spell; returns what it did through the api. */
function runHooks(hooks: SpecHooks, spellId: string, outcome: 'miss' | 'hit' | 'crit') {
  const applied: string[] = [];
  const mana: number[] = [];
  hooks.onSpellResolved?.(
    { spellId, outcome, damage: 1 },
    {
      applyTargetAura: (id) => applied.push(id),
      applySelfAura: () => undefined,
      roll: () => 0,
      hasSelfAura: () => false,
      hasTargetAura: () => false,
      addMana: (a) => {
        mana.push(a);
        return a;
      },
    },
  );
  return { applied, mana };
}

describe('golden: the author build through the data-driven path', () => {
  it('effectsForBuild(author) gives exactly the old talentModifiers (deep equal, same order, same floats)', () => {
    const fx = effectsForBuild(decodeTalents(AUTHOR).ranks);
    expect(fx.modifiers).toStrictEqual(OLD_TALENT_MODIFIERS);
    expect(talentModifiers).toStrictEqual(OLD_TALENT_MODIFIERS);
    expect(demonicSacrificeModifiers).toStrictEqual([OLD_TALENT_MODIFIERS[8]]);
    expect(destructionWarlock.modifiers).toStrictEqual(OLD_TALENT_MODIFIERS);
    expect([...fx.unmodelled].sort()).toEqual(
      ['improvedHealthstone', 'improvedVoidwalker', 'felDomination', 'felStamina', 'masterSummoner', 'intensity', 'destructiveReach', 'netherProtection'].sort(),
    );
    expect(talentRank('cataclysm')).toBe(5);
    expect(talentRank('conflagrate')).toBe(0);
  });

  it('the spec: keybinds, stats, auras, spells and priority as before; an explicit author string gives the same spec', () => {
    expect(destructionWarlock.keybinds).toEqual(OLD_KEYBINDS);
    expect(destructionWarlock.statBonuses).toEqual({ spellPower: 130 });
    expect(destructionWarlock.setup.statMultipliers).toStrictEqual({ intellect: 1.05, spirit: 1 - 0.01 * 5, maxMana: 1 + 0.01 * 3 });
    expect(destructionWarlock.auras).toBe(warlockAuras);
    expect(destructionWarlock.spells).toEqual(warlockSpells.filter((s) => s.id !== 'conflagrate'));
    const explicit = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, AUTHOR);
    for (const key of ['modifiers', 'statBonuses', 'setup', 'spells', 'sets', 'keybinds'] as const) {
      expect(explicit[key], key).toStrictEqual(destructionWarlock[key]);
    }
    expect(explicit.auras).toBe(warlockAuras);
    expect(explicit.hooks).toBe(destructionWarlock.hooks);
    expect(view(explicit.priority)).toEqual(view(destructionWarlock.priority));
    explicit.priority.forEach((s, i) => expect(s).toBe(destructionWarlock.priority[i]));
    // Without the Succubus sacrificed: Demonic Sacrifice left out, nothing else.
    const pet = buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: false });
    expect(pet.modifiers).toStrictEqual(OLD_TALENT_MODIFIERS.slice(0, 8));
    expect(buildDestructionWarlock({ armor: 'demon', sacrificeSuccubus: true }).statBonuses).toEqual({});
  });

  it('the hooks: only a Shadow Bolt crit applies Shadow Vulnerability', () => {
    expect(runHooks(destructionWarlock.hooks, 'shadow-bolt', 'crit')).toEqual({ applied: ['shadow-vulnerability'], mana: [] });
    for (const [id, o] of [['shadow-bolt', 'hit'], ['shadow-bolt', 'miss'], ['shadowburn', 'crit'], ['life-tap', 'hit']] as const) {
      expect(runHooks(destructionWarlock.hooks, id, o)).toEqual({ applied: [], mana: [] });
    }
  });

  it('bot logs byte-identical and the golden means exact with the explicit author string', () => {
    const explicit = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, AUTHOR);
    for (const seed of [1, 2, 3]) {
      const a = sim(destructionWarlock, seed);
      const b = sim(explicit, seed);
      runBot(a, destructionWarlock.priority);
      runBot(b, explicit.priority);
      expect(b.log()).toEqual(a.log());
    }
    expect(meanDps(explicit, explicit.priority, range(10))).toBe(1425.1766666666667);
    expect(meanDps(explicit, explicit.priority, range(10), 0)).toBe(1428.3350000000003);
  });

  it('buildPriority default unchanged: no talents argument and the author build give the same steps and rules', () => {
    const authorTalents = { modifiers: talentModifiers, spells: ['shadowburn'] };
    for (const config of [DOT, ROTATION_PRESETS['sb-spam'].config, { ...DOT, lifeTapBelowMana: 2000 } as RotationConfig]) {
      const a = buildPriority(config, DEFAULT_DISTANCE_FROM_TARGET_YD);
      const b = buildPriority(config, DEFAULT_DISTANCE_FROM_TARGET_YD, {}, authorTalents);
      expect(view(b)).toEqual(view(a));
      const s0 = sim(destructionWarlock, 1).snapshot();
      for (const remainingMs of [60000, 3901, 3900, 1]) {
        for (const mana of [0, 398, 399, 5000]) {
          const s = { ...s0, phase: 'running' as const, nowMs: s0.durationMs - remainingMs, mana };
          expect(b.map((x) => x.when?.(s) ?? true)).toEqual(a.map((x) => x.when?.(s) ?? true));
        }
      }
    }
    expect(shadowburnFinisherWindowMs(DEFAULT_DISTANCE_FROM_TARGET_YD)).toBe(3900);
    expect(rotationWarnings(DOT)).toEqual([]);
  });
});

/** Every modelled talent at max rank, hand-checked against wowsims tbc-new and Wowhead TBC. */
const MAX_RANK: Record<string, [number, (fx: TalentEffect) => void]> = {
  // Destruction
  improvedShadowBolt: [5, (fx) => {
    expect(fx.auras).toEqual([warlockAuras.find((a) => a.id === 'shadow-vulnerability')]);
    expect(runHooks(fx.hooks!, 'shadow-bolt', 'crit').applied).toEqual(['shadow-vulnerability']);
  }],
  cataclysm: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: DESTRUCTION_SPELLS, manaCostMult: 0.95 }])],
  bane: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['shadow-bolt', 'immolate'], castTimeMsDelta: -500 }])],
  devastation: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: DESTRUCTION_SPELLS, critPctDelta: 5 }])],
  shadowburn: [1, (fx) => expect(fx).toEqual({ spells: ['shadowburn'] })],
  improvedImmolate: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['immolate'], damageMult: 1.25 }])],
  ruin: [1, (fx) => expect(fx.modifiers).toEqual([{ spellIds: DESTRUCTION_SPELLS, critMultDelta: 0.5 }])],
  emberstorm: [5, (fx) => expect(fx.modifiers).toEqual([
    { schools: ['fire'], damageMult: 1.1, dotDamageMult: 1.1 },
    { spellIds: ['incinerate'], castTimeMsDelta: -250 },
  ])],
  backlash: [3, (fx) => expect(fx.modifiers).toEqual([{ critPctDelta: 3 }])],
  conflagrate: [1, (fx) => expect(fx).toEqual({ spells: ['conflagrate'] })],
  shadowAndFlame: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['shadow-bolt', 'incinerate'], coeffDelta: 0.2 }])],
  // Affliction
  // Suppression 5 (applySuppression: SpellMod_BonusHit_Percent, Value 2 x rank, ClassMask
  // WarlockAfflictionSpells; of the modelled spells Corruption, the curses of Agony, Doom, Elements).
  suppression: [5, (fx) => expect(fx.modifiers).toEqual([
    { spellIds: ['corruption', 'curse-of-agony', 'curse-of-doom', 'curse-of-the-elements'], hitPctDelta: 10 },
  ])],
  improvedCorruption: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['corruption'], castTimeMsDelta: -2000 }])],
  improvedLifeTap: [2, (fx) => {
    expect(runHooks(fx.hooks!, 'life-tap', 'hit').mana).toEqual([582 * 0.1 * 2]);
    expect(runHooks(fx.hooks!, 'shadow-bolt', 'hit').mana).toEqual([]);
  }],
  improvedCurseOfAgony: [2, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['curse-of-agony'], dotDamageMult: 1.1 }])],
  empoweredCorruption: [3, (fx) => {
    const base = warlockAuras.find((a) => a.id === 'corruption')!;
    expect(fx.auras).toEqual([{ ...base, tick: { ...base.tick!, coeffTotal: expect.closeTo(0.936 + 0.36, 12) } }]);
  }],
  shadowMastery: [5, (fx) => expect(fx.modifiers).toEqual([
    { spellIds: ['shadow-bolt', 'corruption', 'curse-of-agony', 'shadowburn'], damageMult: 1.1, dotDamageMult: 1.1 },
  ])],
  contagion: [5, (fx) => expect(fx.modifiers).toEqual([{ spellIds: ['corruption', 'curse-of-agony'], dotDamageMult: 1.05 }])],
  malediction: [3, (fx) => {
    const base = warlockAuras.find((a) => a.id === 'curse-of-the-elements')!;
    expect(fx.auras).toEqual([{ ...base, damageTakenMult: { ...base.damageTakenMult!, mult: expect.closeTo(1.13, 12) } }]);
  }],
  // Demonology
  demonicEmbrace: [5, (fx) => expect(fx.statMultipliers).toEqual({ spirit: 0.95 })],
  felIntellect: [3, (fx) => expect(fx.statMultipliers).toEqual({ maxMana: 1.03 })],
  demonicAegis: [3, (fx) => expect(fx.armorMult).toBe(1.3)],
  demonicSacrifice: [1, (fx) => expect(fx.modifiers).toEqual([{ schools: ['shadow'], damageMult: 1.15, dotDamageMult: 1.15 }])],
  demonicTactics: [5, (fx) => expect(fx.modifiers).toEqual([{ critPctDelta: 5 }])],
};

describe('TALENT_EFFECTS and UNMODELLED_TALENTS', () => {
  const all = TALENT_TREE.trees.flatMap((t) => t.talents);

  it('each of the 64 talents is in exactly one of the two tables; every unmodelled one has a reason', () => {
    const modelled = Object.keys(TALENT_EFFECTS);
    const unmodelled = Object.keys(UNMODELLED_TALENTS);
    expect([...modelled, ...unmodelled].sort()).toEqual(all.map((t) => t.id).sort());
    expect(modelled.filter((id) => unmodelled.includes(id))).toEqual([]);
    expect(modelled.sort()).toEqual(Object.keys(MAX_RANK).sort());
    for (const [id, reason] of Object.entries(UNMODELLED_TALENTS)) expect(reason.length, id).toBeGreaterThan(15);
    expect(UNMODELLED_TALENTS.suppression).toBeUndefined();
    for (const id of ['nightfall', 'masterDemonologist', 'soulLink', 'unstableAffliction', 'shadowfury', 'soulLeech']) {
      expect(UNMODELLED_TALENTS[id], id).toBeDefined();
    }
  });

  it.each(Object.entries(MAX_RANK))('%s: rank 0 gives no effect, max rank the sourced values', (id, [max, check]) => {
    expect(all.find((t) => t.id === id)?.maxRank).toBe(max);
    expect(TALENT_EFFECTS[id]!(0)).toEqual({});
    check(TALENT_EFFECTS[id]!(max));
  });

  it('ranks scale linearly where the source does (rank 1 = max / maxRank)', () => {
    expect(TALENT_EFFECTS.improvedCorruption!(2).modifiers).toEqual([{ spellIds: ['corruption'], castTimeMsDelta: -800 }]);
    expect(TALENT_EFFECTS.shadowMastery!(1).modifiers?.[0]?.damageMult).toBeCloseTo(1.02, 12);
    expect(TALENT_EFFECTS.contagion!(3).modifiers?.[0]?.dotDamageMult).toBeCloseTo(1.03, 12);
    expect(TALENT_EFFECTS.improvedCurseOfAgony!(1).modifiers?.[0]?.dotDamageMult).toBeCloseTo(1.05, 12);
    expect(TALENT_EFFECTS.improvedImmolate!(2).modifiers?.[0]?.damageMult).toBeCloseTo(1.1, 12);
    expect(TALENT_EFFECTS.improvedShadowBolt!(3).auras?.[0]?.damageTakenMult?.mult).toBeCloseTo(1.12, 12);
    expect(TALENT_EFFECTS.emberstorm!(3).modifiers).toStrictEqual(OLD_TALENT_MODIFIERS.slice(4, 6));
    expect(TALENT_EFFECTS.demonicAegis!(1).armorMult).toBeCloseTo(1.1, 12);
  });

  it('hostile rank maps never throw: unknown keys ignored, ranks clamped to 0..max, malformed = 0, fresh objects', () => {
    const hostile: unknown[] = [
      null, undefined, 'abc', 42, [], [5, 5], { __proto__: { cataclysm: 5 } }, JSON.parse('{"__proto__": {"bane": 5}}'),
      { cataclysm: Number.NaN }, { cataclysm: -1 }, { cataclysm: 2.5 }, { cataclysm: Infinity }, { cataclysm: '5' },
      { nope: 5 }, new Proxy({}, { get: () => { throw new Error('boom'); }, ownKeys: () => { throw new Error('boom'); } }),
    ];
    for (const [i, h] of hostile.entries()) {
      const fx = effectsForBuild(h);
      expect(fx.modifiers, `hostile #${i}`).toEqual([]);
      expect(fx.spells).toEqual([]);
      expect(fx.unmodelled).toEqual([]);
    }
    expect(effectsForBuild({ cataclysm: 99 }).modifiers).toEqual([{ spellIds: DESTRUCTION_SPELLS, manaCostMult: 0.95 }]);
    const a = effectsForBuild(decodeTalents(AUTHOR).ranks);
    a.modifiers[0]!.manaCostMult = 0;
    a.modifiers.push({});
    expect(effectsForBuild(decodeTalents(AUTHOR).ranks).modifiers).toStrictEqual(OLD_TALENT_MODIFIERS);
    expect(talentModifiers).toStrictEqual(OLD_TALENT_MODIFIERS);
    // buildDestructionWarlock with a hostile string: decoded as no talents, no throw.
    expect(() => buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, 'x'.repeat(10000))).not.toThrow();
  });
});

describe('talents in the spec and the bot', () => {
  it('Conflagrate talent binds slot 8 and the spell is castable; without it unknown-spell', () => {
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, WOWSIMS_DESTRUCTION);
    expect(spec.keybinds[7]).toBe('conflagrate');
    expect(spec.keybinds.filter((k, i) => i !== 7 && i !== 4)).toEqual(OLD_KEYBINDS.filter((k, i) => i !== 7 && i !== 4));
    const s = new Simulation({ spec, target: NEVER_MISS, seed: 1, infiniteMana: true });
    s.cast('immolate');
    s.advanceTo(2000);
    expect(s.cast('conflagrate')).toEqual({ ok: true });
    expect(new Simulation({ spec: destructionWarlock, target: NEVER_MISS, seed: 1 }).cast('conflagrate')).toEqual({
      ok: false,
      reason: 'unknown-spell',
    });
  });

  it('a build without Shadowburn: the finisher step is dropped with a warning, the slot is empty, the bot still plays', () => {
    const talents = withRanks({ shadowburn: 0 });
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, talents);
    expect(spec.spells.map((x) => x.id)).not.toContain('shadowburn');
    expect(spec.keybinds[4]).toBe('');
    expect(spec.priority.map((p) => p.spellId)).toEqual(['curse-of-the-elements', 'immolate', 'corruption', 'life-tap', 'shadow-bolt']);
    const fx = effectsForBuild(decodeTalents(talents).ranks);
    const rt = { modifiers: fx.modifiers, spells: fx.spells };
    expect(rotationWarnings(DOT, rt)).toEqual(['Shadowburn (finisher): Shadowburn is not available with these talents; the step is skipped.']);
    expect(rotationWarnings({ ...DOT, shadowburnFinisher: false }, rt)).toEqual([]);
    const s = sim(spec, 1);
    expect(s.cast('shadowburn')).toEqual({ ok: false, reason: 'unknown-spell' });
    runBot(s, spec.priority);
    expect(s.snapshot().phase).toBe('ended');
    expect(s.snapshot().dps).toBeGreaterThan(1000);
  });

  it('Shadow Bolt cast time and cost follow Bane and Cataclysm (no Bane: 3000 ms; no Cataclysm: 420)', () => {
    const fx = effectsForBuild(decodeTalents(withRanks({ bane: 0, cataclysm: 0 })).ranks);
    const rt = { modifiers: fx.modifiers, spells: fx.spells };
    expect(shadowburnFinisherWindowMs(DEFAULT_DISTANCE_FROM_TARGET_YD, rt)).toBe(3000 + 1400);
    const p = buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD, {}, rt);
    const s0 = sim(destructionWarlock, 1).snapshot();
    const at = (remainingMs: number, mana: number) => ({ ...s0, phase: 'running' as const, nowMs: s0.durationMs - remainingMs, mana });
    const burn = p.find((x) => x.spellId === 'shadowburn')!.when!;
    expect(burn(at(4400, 5000))).toBe(true);
    expect(burn(at(4401, 5000))).toBe(false);
    const tap = p.find((x) => x.spellId === 'life-tap')!.when!;
    expect(tap(at(30000, 419))).toBe(true);
    expect(tap(at(30000, 420))).toBe(false);
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, withRanks({ bane: 0, cataclysm: 0 }));
    const snap = new Simulation({ spec: { ...spec, setup: { ...spec.setup, stats: { ...spec.setup.stats, hasteRating: 0 } } }, target: NEVER_MISS, seed: 1 }).snapshot();
    expect(snap.spells['shadow-bolt']).toEqual({ manaCost: 420, castTimeMs: 3000 });
  });

  it('an Affliction-heavy build: Improved Corruption makes Corruption instant, and its Affliction talents raise the damage (seeded 20 fights)', () => {
    const config: RotationConfig = { ...DOT, curse: 'agony' };
    const ranks = decodeTalents(WOWSIMS_AFFLICTION).ranks;
    const off = { ...ranks, shadowMastery: 0, contagion: 0, improvedCurseOfAgony: 0, empoweredCorruption: 0, improvedCorruption: 0 };
    const make = (r: Record<string, number>) => {
      const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, encodeTalents(r));
      const fx = effectsForBuild(r);
      return { spec, priority: buildPriority(config, DEFAULT_DISTANCE_FROM_TARGET_YD, {}, { modifiers: fx.modifiers, spells: fx.spells }) };
    };
    const on = make(ranks);
    const without = make(off);
    expect(sim(on.spec, 1).snapshot().spells.corruption?.castTimeMs).toBe(0);
    expect(sim(without.spec, 1).snapshot().spells.corruption?.castTimeMs).toBeGreaterThan(1900);
    expect(effectsForBuild(ranks).unmodelled).toEqual(expect.arrayContaining(['nightfall', 'siphonLife', 'amplifyCurse']));
    const seeds = range(20);
    const dOn = meanDps(on.spec, on.priority, seeds);
    const dOff = meanDps(without.spec, without.priority, seeds);
    expect(dOn).toBeGreaterThan(dOff * 1.03);
    // Corruption ticks: Shadow Mastery 5/5 x Contagion 5/5 on the periodic damage, Empowered
    // Corruption's +36% coefficient on top.
    const firstTick = (spec: SpecData) => {
      const s = new Simulation({ spec, target: NEVER_MISS, seed: 1, infiniteMana: true });
      s.cast('corruption');
      s.advanceTo(6000);
      return s.log().find((e) => e.type === 'tick' && e.auraId === 'corruption')!.amount!;
    };
    expect(firstTick(on.spec)).toBeGreaterThan(firstTick(without.spec) * 1.155);
  }, 60000);

  it('Improved Life Tap 2/2 adds 20% of the base 582 mana as a second gain', () => {
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, encodeTalents({ ...decodeTalents(WOWSIMS_AFFLICTION).ranks }));
    const s = new Simulation({ spec, target: NEVER_MISS, seed: 1 });
    for (let i = 1; i <= 8; i++) {
      s.cast('shadow-bolt');
      s.advanceTo(i * 3500);
    }
    expect(s.cast('life-tap')).toEqual({ ok: true });
    expect(s.log().filter((e) => e.type === 'mana' && e.spellId === 'life-tap').map((e) => e.amount)).toEqual([
      expect.any(Number),
      expect.closeTo(116.4, 9),
    ]);
  });

  it('Suppression 5/5: +10% hit on Corruption and the curses only (same first draw: misses only ever disappear)', () => {
    const author = decodeTalents(destructionTalentString).ranks;
    const plain = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, author);
    const supp = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, { ...author, suppression: 5 });
    // The author's gear is near the hit cap against the boss: a target 15% harder to hit shows it.
    const target: TargetData = { ...BOSS_TARGET, missPct: BOSS_TARGET.missPct + 15 };
    const missed = (spec: SpecData, spellId: string, seed: number) => {
      const s = new Simulation({ spec, target, seed, infiniteMana: true });
      s.cast(spellId);
      s.advanceTo(4000);
      return s.log().some((e) => e.type === 'miss' && e.spellId === spellId);
    };
    for (const spellId of ['corruption', 'curse-of-the-elements', 'curse-of-agony']) {
      let before = 0;
      let after = 0;
      for (const seed of range(300)) {
        const a = missed(plain, spellId, seed);
        const b = missed(supp, spellId, seed);
        if (b) expect(a, `${spellId} seed ${seed}`).toBe(true);
        before += a ? 1 : 0;
        after += b ? 1 : 0;
      }
      expect(after, spellId).toBeLessThan(before * 0.6);
      expect(before, spellId).toBeGreaterThan(20);
    }
    for (const seed of range(100)) expect(missed(supp, 'shadow-bolt', seed)).toBe(missed(plain, 'shadow-bolt', seed));
  });
});
