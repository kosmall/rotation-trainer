import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import {
  NEUTRALIZED_BY,
  neutralizeOwnAuras,
  WARLOCK_ARMOR_OPTIONS,
  SACRIFICE_SUCCUBUS_OPTION,
} from '../../src/data/classes/warlock/buffs';
import {
  buildDestructionWarlock,
  DEFAULT_WARLOCK_OPTIONS,
  destructionWarlock,
} from '../../src/data/classes/warlock/destruction';
import { warlockAuras } from '../../src/data/classes/warlock/auras';
import { talentModifiers } from '../../src/data/classes/warlock/talents';
import {
  commonBuffs,
  consumables,
  debuffs,
  EXCLUDES,
  JUDGEMENT_OF_WISDOM_MANA,
  JUDGEMENT_OF_WISDOM_PROC_CHANCE,
  SCHEDULED_DEBUFF_DURATION_MS,
} from '../../src/data/common/buffs';
import { BOSS_TARGET } from '../../src/data/common/target';
import type { BuffDef, SpecData } from '../../src/data/types';
import { AuraTracker } from '../../src/engine/auras';
import { createRng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type {
  AuraDef,
  HitOutcome,
  LogEvent,
  ScheduledAura,
  SpecHooks,
  TargetData,
} from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };

const ALL = [...commonBuffs, ...consumables, ...debuffs];

function buff(id: string): BuffDef {
  const b = ALL.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
}

function targetAuraOf(id: string): AuraDef {
  const a = buff(id).effect.targetAura;
  if (!a) throw new Error(`${id} has no targetAura`);
  return a;
}

/** Runs the spec hooks, then the buff's (what Task 9's composeHooks will do). */
function compose(...hooks: (SpecHooks | undefined)[]): SpecHooks {
  return {
    onSpellResolved(e, api) {
      for (const h of hooks) h?.onSpellResolved?.(e, api);
    },
  };
}

/**
 * destructionWarlock with the given catalog buffs' target auras and hooks added; the own auras
 * neutralized by `neutralized` (the mechanism Task 9's applySetup will use, rulings S1/S2).
 */
function specWith(p: { buffs?: string[]; neutralized?: string[]; base?: SpecData } = {}): SpecData {
  const base = p.base ?? destructionWarlock;
  const extra = (p.buffs ?? []).map(buff);
  return {
    ...base,
    auras: [
      ...neutralizeOwnAuras(base.auras, p.neutralized ?? []),
      ...extra.flatMap((b) => (b.effect.targetAura ? [b.effect.targetAura] : [])),
    ],
    hooks: compose(base.hooks, ...extra.map((b) => b.effect.hooks)),
  };
}

function newSim(spec: SpecData, scheduled: ScheduledAura[] = [], seed = 1, target = NEVER_MISS) {
  return new Simulation({
    spec,
    target,
    seed,
    infiniteMana: true,
    distanceFromTarget: 0,
    scheduledAuras: scheduled,
  });
}

const atStart = (...ids: string[]): ScheduledAura[] => ids.map((auraId) => ({ auraId, on: 'target', atMs: 0 }));

/** Casts the spells in order (each as soon as the engine accepts it), then lets 5 s pass. */
function castInOrder(sim: Simulation, ids: string[]): void {
  for (const id of ids) {
    let guard = 0;
    while (!sim.cast(id).ok) {
      sim.advanceTo(sim.snapshot().nowMs + 10);
      if (++guard > 2000) throw new Error(`could not cast ${id}`);
    }
  }
  sim.advanceTo(sim.snapshot().nowMs + 5000);
}

const amounts = (log: readonly LogEvent[], type: LogEvent['type'], spellId?: string): number[] =>
  log.filter((e) => e.type === type && (spellId === undefined || e.spellId === spellId)).map((e) => e.amount ?? 0);

/** a ~ b x mult up to the engine's one rounding of each hit (plus 1 for float noise). */
function expectScaled(a: number, b: number, mult: number): void {
  expect(Math.abs(a - b * mult), `${a} vs ${b} x ${mult}`).toBeLessThanOrEqual(1.5);
}

// ---------------------------------------------------------------------------
// Catalog shape
// ---------------------------------------------------------------------------

describe('consumables and debuffs catalog', () => {
  it('ids are unique across the whole common catalog; every entry has name, icon, description and source', () => {
    const ids = ALL.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of [...consumables, ...debuffs]) {
      expect(b.id).toMatch(/^[a-z0-9-]+$/);
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(b.icon, b.id).toMatch(/^[a-z0-9_]+$/);
      expect(b.description.trim().length, b.id).toBeGreaterThan(0);
      expect(b.source.trim().length, b.id).toBeGreaterThan(0);
      expect(b.timed, b.id).toBeUndefined();
      expect(Number.isInteger(b.wowheadId), b.id).toBe(true);
    }
    for (const b of consumables) expect(b.group, b.id).toBe('consumable');
    for (const b of debuffs) expect(b.group, b.id).toBe('debuff');
  });

  it('flask, elixir and food ids share the documented exclusive groups', () => {
    const group = (id: string) => buff(id).exclusiveGroup;
    for (const id of ['flask-of-supreme-power', 'flask-of-distilled-wisdom', 'flask-of-pure-death']) {
      expect(group(id), id).toBe('flask');
    }
    for (const id of ['elixir-of-major-shadow-power', 'elixir-of-major-firepower', 'adepts-elixir', 'greater-arcane-elixir']) {
      expect(group(id), id).toBe('elixir-battle');
    }
    for (const id of ['elixir-of-draenic-wisdom', 'elixir-of-major-mageblood']) {
      expect(group(id), id).toBe('elixir-guardian');
    }
    for (const id of ['blackened-basilisk', 'skullfish-soup', 'blackened-sporefish']) {
      expect(group(id), id).toBe('food');
    }
    for (const id of ['brilliant-wizard-oil', 'superior-wizard-oil']) {
      expect(group(id), id).toBe('weapon-oil');
    }
    // Every consumable is in one of the five groups.
    for (const b of consumables) {
      expect(['flask', 'elixir-battle', 'elixir-guardian', 'food', 'weapon-oil'], b.id).toContain(b.exclusiveGroup);
    }
    // A flask counts as both a battle and a guardian elixir (Wowhead tooltips).
    expect(EXCLUDES).toEqual({ flask: ['elixir-battle', 'elixir-guardian'] });
    expect(Object.isFrozen(EXCLUDES) && Object.isFrozen(EXCLUDES.flask)).toBe(true);
    // Debuffs from other raid members have no exclusive group (rulings S1, S2).
    for (const b of debuffs) expect(b.exclusiveGroup, b.id).toBeUndefined();
  });

  it('consumable stat values (wowsims db.json / registerStaticImbue, Wowhead tooltips)', () => {
    const bonuses = (id: string) => buff(id).effect.statBonuses;
    expect(bonuses('flask-of-supreme-power')).toEqual({ spellPower: 70 });
    expect(bonuses('flask-of-distilled-wisdom')).toEqual({ intellect: 65 });
    expect(bonuses('flask-of-pure-death')).toEqual({ shadowPower: 80, firePower: 80 });
    expect(bonuses('elixir-of-major-shadow-power')).toEqual({ shadowPower: 55 });
    expect(bonuses('elixir-of-major-firepower')).toEqual({ firePower: 55 });
    expect(bonuses('adepts-elixir')).toEqual({ spellPower: 24, critRating: 24 });
    expect(bonuses('greater-arcane-elixir')).toEqual({ spellPower: 35 });
    expect(bonuses('elixir-of-draenic-wisdom')).toEqual({ intellect: 30, spirit: 30 });
    expect(bonuses('elixir-of-major-mageblood')).toEqual({ mp5: 16 });
    expect(bonuses('blackened-basilisk')).toEqual({ spellPower: 23, spirit: 20 });
    expect(bonuses('skullfish-soup')).toEqual({ critRating: 20, spirit: 20 });
    expect(bonuses('blackened-sporefish')).toEqual({ mp5: 8 });
    expect(bonuses('brilliant-wizard-oil')).toEqual({ spellPower: 36, critRating: 14 });
    expect(bonuses('superior-wizard-oil')).toEqual({ spellPower: 42 });
    // Static: flat bonuses only.
    for (const b of consumables) {
      expect(Object.keys(b.effect), b.id).toEqual(['statBonuses']);
    }
  });

  it('a flask adds its spell power through computeStats like any flat bonus', () => {
    const base = computeStats(destructionWarlock.setup, destructionWarlock.statBonuses);
    const withFlask = computeStats(destructionWarlock.setup, {
      spellPower: (destructionWarlock.statBonuses.spellPower ?? 0) + 70,
    });
    expect(withFlask.power.shadow - base.power.shadow).toBe(70);
    expect(withFlask.power.fire - base.power.fire).toBe(70);
  });

  it('Super Mana Potion and Dark Rune are not in the catalog (player-cast actions, documented deviation)', () => {
    const ids = ALL.map((b) => b.id);
    for (const id of ids) expect(id).not.toMatch(/mana-potion|dark-rune|demonic-rune/);
  });

  it('the new entries are deep-frozen', () => {
    for (const list of [consumables, debuffs]) {
      expect(Object.isFrozen(list)).toBe(true);
      for (const b of list) {
        expect(Object.isFrozen(b), b.id).toBe(true);
        expect(Object.isFrozen(b.effect), b.id).toBe(true);
        if (b.effect.targetAura) expect(Object.isFrozen(b.effect.targetAura), b.id).toBe(true);
        if (b.effect.statBonuses) expect(Object.isFrozen(b.effect.statBonuses), b.id).toBe(true);
      }
    }
  });

  it('every debuff is a target aura with its own id and the long scheduled duration (ruling S3)', () => {
    expect(SCHEDULED_DEBUFF_DURATION_MS).toBe(3600000);
    expect(debuffs.map((b) => b.id).sort()).toEqual(
      ['isb-from-others', 'judgement-of-wisdom', 'misery', 'raid-curse-of-the-elements', 'shadow-weaving'].sort(),
    );
    const specAuraIds = new Set(destructionWarlock.auras.map((a) => a.id));
    for (const b of debuffs) {
      const aura = targetAuraOf(b.id);
      expect(aura.id, b.id).toBe(b.id);
      expect(specAuraIds.has(aura.id), b.id).toBe(false);
      expect(aura.durationMs, b.id).toBe(SCHEDULED_DEBUFF_DURATION_MS);
      expect(aura.exclusiveGroup, b.id).toBeUndefined();
      expect(aura.charges, b.id).toBeUndefined();
      expect(aura.tick, b.id).toBeUndefined();
      expect(aura.wowheadId, b.id).toBe(b.wowheadId);
      expect(aura.icon, b.id).toBe(b.icon);
    }
  });

  it('catalog entries share no object with the spec (deepFreeze would freeze the spec too)', () => {
    const specObjects = new Set<unknown>(
      [...destructionWarlock.auras, ...destructionWarlock.auras.map((a) => a.damageTakenMult), destructionWarlock.hooks].filter(
        (o) => o !== undefined,
      ),
    );
    for (const b of [...consumables, ...debuffs]) {
      const objects = [b.effect.targetAura, b.effect.targetAura?.damageTakenMult, b.effect.hooks].filter((o) => o !== undefined);
      for (const o of objects) expect(specObjects.has(o), b.id).toBe(false);
    }
    // The spec's own auras are still mutable objects (not frozen by the catalog).
    for (const a of warlockAuras) expect(Object.isFrozen(a), a.id).toBe(false);
  });

  it('Misery: x1.05 on every magic school; Shadow Weaving: x1.10 on shadow (5 stacks x 2%)', () => {
    expect(targetAuraOf('misery').damageTakenMult).toEqual({
      schools: ['arcane', 'fire', 'frost', 'holy', 'nature', 'shadow'],
      mult: 1.05,
    });
    expect(targetAuraOf('shadow-weaving').damageTakenMult).toEqual({ schools: ['shadow'], mult: 1.1 });
    expect(targetAuraOf('raid-curse-of-the-elements').damageTakenMult).toEqual({
      schools: ['arcane', 'fire', 'frost', 'shadow'],
      mult: 1.1,
    });
    expect(targetAuraOf('isb-from-others').damageTakenMult).toEqual({ schools: ['shadow'], mult: 1.2 });
    expect(targetAuraOf('judgement-of-wisdom').damageTakenMult).toBeUndefined();
  });

  it('Misery and Shadow Weaving multiply a Shadow Bolt by 1.05 x 1.10 together', () => {
    const spec = specWith({ buffs: ['misery', 'shadow-weaving'] });
    const plain = newSim(spec, [], 4);
    const both = newSim(spec, atStart('misery', 'shadow-weaving'), 4);
    castInOrder(plain, ['shadow-bolt']);
    castInOrder(both, ['shadow-bolt']);
    const [a] = amounts(both.log(), 'damage', 'shadow-bolt');
    const [b] = amounts(plain.log(), 'damage', 'shadow-bolt');
    expectScaled(a!, b!, 1.05 * 1.1);
  });
});

// ---------------------------------------------------------------------------
// Judgement of Wisdom
// ---------------------------------------------------------------------------

describe('Judgement of Wisdom', () => {
  const jow = buff('judgement-of-wisdom');
  const hook = jow.effect.hooks?.onSpellResolved;

  /** A stub api recording the calls; `rolls` are returned in order. */
  function stubApi(p: { auraOn?: boolean; rolls?: () => number } = {}) {
    const calls = { roll: 0, addMana: [] as number[] };
    const api = {
      applyTargetAura: () => {},
      applySelfAura: () => {},
      roll: () => {
        calls.roll += 1;
        return p.rolls ? p.rolls() : 0;
      },
      hasSelfAura: () => false,
      hasTargetAura: (id: string) => (p.auraOn ?? true) && id === 'judgement-of-wisdom',
      addMana: (amount: number) => {
        calls.addMana.push(amount);
        return amount;
      },
    };
    return { api, calls };
  }

  const fire = (api: ReturnType<typeof stubApi>['api'], spellId: string, outcome: HitOutcome) =>
    hook!({ spellId, outcome, damage: outcome === 'miss' ? 0 : 1000 }, api);

  it('hook gives 74 mana on a hit and never on a miss; with a seeded Rng the proc rate over 2000 hits is within 3% of the configured chance; api.roll draws only when the debuff is on', () => {
    expect(hook).toBeTypeOf('function');
    expect(JUDGEMENT_OF_WISDOM_MANA).toBe(74);
    expect(JUDGEMENT_OF_WISDOM_PROC_CHANCE).toBe(0.5);

    // Hit or crit with a roll under the chance: 74 mana.
    for (const outcome of ['hit', 'crit'] as const) {
      const { api, calls } = stubApi({ rolls: () => 0.1 });
      fire(api, 'shadow-bolt', outcome);
      expect(calls.roll).toBe(1);
      expect(calls.addMana).toEqual([74]);
    }
    // A roll at or over the chance: nothing.
    {
      const { api, calls } = stubApi({ rolls: () => 0.5 });
      fire(api, 'shadow-bolt', 'hit');
      expect(calls.roll).toBe(1);
      expect(calls.addMana).toEqual([]);
    }
    // A miss: no roll, no mana.
    {
      const { api, calls } = stubApi({ rolls: () => 0 });
      fire(api, 'shadow-bolt', 'miss');
      expect(calls).toEqual({ roll: 0, addMana: [] });
    }
    // Debuff not on the target: no roll at all.
    {
      const { api, calls } = stubApi({ auraOn: false, rolls: () => 0 });
      for (let i = 0; i < 10; i++) fire(api, 'shadow-bolt', 'hit');
      expect(calls).toEqual({ roll: 0, addMana: [] });
    }

    // Proc rate over 2000 landed hits with a seeded Rng.
    const rng = createRng(12345);
    const { api, calls } = stubApi({ rolls: () => rng.next() });
    for (let i = 0; i < 2000; i++) fire(api, 'shadow-bolt', i % 4 === 0 ? 'crit' : 'hit');
    expect(calls.roll).toBe(2000);
    expect(Math.abs(calls.addMana.length / 2000 - JUDGEMENT_OF_WISDOM_PROC_CHANCE)).toBeLessThanOrEqual(0.03);
    expect(new Set(calls.addMana)).toEqual(new Set([74]));
  });

  it('spells that never hit the target in wowsims (Life Tap, Curse of the Elements) do not roll', () => {
    const { api, calls } = stubApi({ rolls: () => 0 });
    fire(api, 'life-tap', 'hit');
    fire(api, 'curse-of-the-elements', 'hit');
    expect(calls).toEqual({ roll: 0, addMana: [] });
    // DoT and curse casts that hit the target do (wowsims ProcMaskSpellDamage).
    for (const id of ['curse-of-agony', 'curse-of-doom', 'corruption', 'immolate', 'shadowburn', 'incinerate']) {
      const s = stubApi({ rolls: () => 0 });
      fire(s.api, id, 'hit');
      expect(s.calls.addMana, id).toEqual([74]);
    }
  });

  it('a whole bot fight with the hook but without the debuff is identical to one without the hook', () => {
    const run = (spec: SpecData, scheduled: ScheduledAura[] = []) => {
      const sim = new Simulation({ spec, target: BOSS_TARGET, seed: 3, distanceFromTarget: 28, scheduledAuras: scheduled });
      runBot(sim, spec.priority);
      return sim;
    };
    const plain = run(destructionWarlock);
    const hookedOff = run(specWith({ buffs: ['judgement-of-wisdom'] }));
    expect(hookedOff.log()).toEqual(plain.log());
    expect(hookedOff.snapshot()).toEqual(plain.snapshot());

    // With the debuff on, JoW mana shows up (74 each, less only when capped at max mana).
    const on = run(specWith({ buffs: ['judgement-of-wisdom'] }), atStart('judgement-of-wisdom'));
    const jowMana = on.log().filter((e) => e.type === 'mana' && e.spellId !== 'life-tap');
    const landed = on
      .log()
      .filter((e) => e.type === 'damage' || (e.type === 'aura-apply' && e.spellId !== undefined && e.spellId !== 'life-tap'));
    expect(jowMana.length).toBeGreaterThan(0);
    expect(jowMana.length).toBeLessThanOrEqual(landed.length);
    for (const e of jowMana) {
      expect(e.amount).toBeGreaterThan(0);
      expect(e.amount).toBeLessThanOrEqual(74);
    }
    expect(jowMana.some((e) => e.amount === 74)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Curse of the Elements from another warlock (ruling S1)
// ---------------------------------------------------------------------------

describe('Curse of the Elements from another warlock', () => {
  it("raid-curse-of-the-elements multiplies fire and shadow damage by 1.1 while the player's own curse-of-agony is also up", () => {
    const spec = specWith({ buffs: ['raid-curse-of-the-elements'], neutralized: ['raid-curse-of-the-elements'] });
    const without = newSim(spec, [], 7);
    const withRaid = newSim(spec, atStart('raid-curse-of-the-elements'), 7);
    for (const sim of [without, withRaid]) castInOrder(sim, ['curse-of-agony', 'immolate', 'shadow-bolt']);

    // Both curses on the target together: the raid one is not in the 'curse' group.
    const auras = withRaid.snapshot().targetAuras;
    expect(Object.keys(auras)).toEqual(expect.arrayContaining(['curse-of-agony', 'raid-curse-of-the-elements']));

    for (const id of ['immolate', 'shadow-bolt']) {
      const [a] = amounts(withRaid.log(), 'damage', id);
      const [b] = amounts(without.log(), 'damage', id);
      expect(a, id).toBeGreaterThan(0);
      expectScaled(a!, b!, 1.1);
    }
    // Curse of Agony's own ticks (shadow) too.
    const [tickA] = amounts(withRaid.log(), 'tick', 'curse-of-agony');
    const [tickB] = amounts(without.log(), 'tick', 'curse-of-agony');
    expectScaled(tickA!, tickB!, 1.1);
  });

  it('own Curse of the Elements plus the raid one give a single ×1.1', () => {
    // Unit level: the neutralized own aura multiplies by 1, the raid one by 1.1.
    const defs = [
      ...neutralizeOwnAuras(destructionWarlock.auras, ['raid-curse-of-the-elements']),
      targetAuraOf('raid-curse-of-the-elements'),
    ];
    const t = new AuraTracker(defs);
    t.apply('raid-curse-of-the-elements', 0);
    t.apply('curse-of-the-elements', 0);
    for (const school of ['fire', 'shadow', 'arcane', 'frost'] as const) expect(t.damageTakenMult(school, 0)).toBe(1.1);

    // Engine level: CoE cast + Shadow Bolt with the raid curse on equals the same casts with the
    // own curse alone (same seed: scheduled auras draw no random number).
    const neutralized = newSim(
      specWith({ buffs: ['raid-curse-of-the-elements'], neutralized: ['raid-curse-of-the-elements'] }),
      atStart('raid-curse-of-the-elements'),
      9,
    );
    const ownOnly = newSim(destructionWarlock, [], 9);
    for (const sim of [neutralized, ownOnly]) castInOrder(sim, ['curse-of-the-elements', 'shadow-bolt']);
    expect(Object.keys(neutralized.snapshot().targetAuras)).toEqual(
      expect.arrayContaining(['curse-of-the-elements', 'raid-curse-of-the-elements']),
    );
    expect(amounts(neutralized.log(), 'damage', 'shadow-bolt')).toEqual(amounts(ownOnly.log(), 'damage', 'shadow-bolt'));

    // Without the neutralization the two would double count (x1.21): what Task 9 must prevent.
    const doubled = newSim(specWith({ buffs: ['raid-curse-of-the-elements'] }), atStart('raid-curse-of-the-elements'), 9);
    castInOrder(doubled, ['curse-of-the-elements', 'shadow-bolt']);
    const [d] = amounts(doubled.log(), 'damage', 'shadow-bolt');
    const [o] = amounts(ownOnly.log(), 'damage', 'shadow-bolt');
    expectScaled(d!, o!, 1.1);
  });

  it('the own curse keeps its curse-slot behaviour when neutralized (Curse of Agony replaces it, not the raid one)', () => {
    const sim = newSim(
      specWith({ buffs: ['raid-curse-of-the-elements'], neutralized: ['raid-curse-of-the-elements'] }),
      atStart('raid-curse-of-the-elements'),
    );
    castInOrder(sim, ['curse-of-the-elements', 'curse-of-agony']);
    const ids = Object.keys(sim.snapshot().targetAuras);
    expect(ids).toContain('raid-curse-of-the-elements');
    expect(ids).toContain('curse-of-agony');
    expect(ids).not.toContain('curse-of-the-elements');
  });
});

// ---------------------------------------------------------------------------
// Improved Shadow Bolt from others (ruling S2)
// ---------------------------------------------------------------------------

describe('Improved Shadow Bolt from others', () => {
  it("isb-from-others and the player's own Shadow Vulnerability never give ×1.44 together", () => {
    const neutralizedDefs = [
      ...neutralizeOwnAuras(destructionWarlock.auras, ['isb-from-others']),
      targetAuraOf('isb-from-others'),
    ];
    const t = new AuraTracker(neutralizedDefs);
    t.apply('isb-from-others', 0);
    t.apply('shadow-vulnerability', 0);
    expect(t.damageTakenMult('shadow', 0)).toBe(1.2);
    expect(t.damageTakenMult('fire', 0)).toBe(1);

    // Without the neutralization: 1.44 (the double count Task 9's applySetup must avoid).
    const raw = new AuraTracker([...destructionWarlock.auras, targetAuraOf('isb-from-others')]);
    raw.apply('isb-from-others', 0);
    raw.apply('shadow-vulnerability', 0);
    expect(raw.damageTakenMult('shadow', 0)).toBeCloseTo(1.44, 12);

    // Engine level, over a whole bot fight: with both scheduled at 0 and the own one also
    // re-applied by every Shadow Bolt crit, every hit equals the run with isb-from-others alone.
    const spec = specWith({ buffs: ['isb-from-others'], neutralized: ['isb-from-others'] });
    const run = (scheduled: ScheduledAura[]) => {
      const sim = new Simulation({ spec, target: BOSS_TARGET, seed: 5, distanceFromTarget: 28, scheduledAuras: scheduled });
      runBot(sim, spec.priority);
      return sim.log().filter((e) => e.type === 'damage' || e.type === 'tick');
    };
    const both = run(atStart('isb-from-others', 'shadow-vulnerability'));
    const othersOnly = run(atStart('isb-from-others'));
    expect(both.map((e) => e.amount)).toEqual(othersOnly.map((e) => e.amount));
    expect(both.length).toBeGreaterThan(10);

    // And a single Shadow Bolt is x1.2 against no ISB at all.
    const none = newSim(spec, [], 2);
    const one = newSim(spec, atStart('isb-from-others', 'shadow-vulnerability'), 2);
    for (const sim of [none, one]) castInOrder(sim, ['shadow-bolt']);
    const [a] = amounts(one.log(), 'damage', 'shadow-bolt');
    const [b] = amounts(none.log(), 'damage', 'shadow-bolt');
    expectScaled(a!, b!, 1.2);
  });

  it('isb-from-others is permanent: it has no charges and survives any number of Shadow Bolts', () => {
    const spec = specWith({ buffs: ['isb-from-others'], neutralized: ['isb-from-others'] });
    const sim = newSim(spec, atStart('isb-from-others'));
    castInOrder(sim, ['shadow-bolt', 'shadow-bolt', 'shadow-bolt', 'shadow-bolt', 'shadow-bolt', 'shadow-bolt']);
    expect(sim.snapshot().targetAuras['isb-from-others']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Neutralization table and helper (for Task 9's applySetup)
// ---------------------------------------------------------------------------

describe('neutralizeOwnAuras', () => {
  it('names which own auras each raid debuff neutralizes', () => {
    expect(NEUTRALIZED_BY).toEqual({
      'raid-curse-of-the-elements': ['curse-of-the-elements'],
      'isb-from-others': ['shadow-vulnerability'],
    });
    expect(Object.isFrozen(NEUTRALIZED_BY)).toBe(true);
    const specIds = new Set(destructionWarlock.auras.map((a) => a.id));
    for (const [buffId, own] of Object.entries(NEUTRALIZED_BY)) {
      expect(debuffs.some((b) => b.id === buffId), buffId).toBe(true);
      for (const id of own) expect(specIds.has(id), id).toBe(true);
    }
  });

  it('is pure: new objects for the neutralized auras (multiplier 1, rest kept), the others shared; inputs untouched', () => {
    const before = structuredClone(destructionWarlock.auras);
    const out = neutralizeOwnAuras(destructionWarlock.auras, ['isb-from-others', 'raid-curse-of-the-elements', 'unknown']);
    expect(destructionWarlock.auras).toEqual(before);
    expect(out).not.toBe(destructionWarlock.auras);
    expect(out.map((a) => a.id)).toEqual(destructionWarlock.auras.map((a) => a.id));
    for (const [i, a] of out.entries()) {
      const orig = destructionWarlock.auras[i]!;
      if (a.id === 'shadow-vulnerability' || a.id === 'curse-of-the-elements') {
        expect(a).not.toBe(orig);
        expect(a.damageTakenMult).toEqual({ ...orig.damageTakenMult, mult: 1 });
        expect({ ...a, damageTakenMult: undefined }).toEqual({ ...orig, damageTakenMult: undefined });
      } else {
        expect(a).toBe(orig);
      }
    }
    // Nothing enabled: same content, every def shared.
    const none = neutralizeOwnAuras(destructionWarlock.auras, []);
    none.forEach((a, i) => expect(a).toBe(destructionWarlock.auras[i]));
  });

  it('the neutralized own Shadow Vulnerability still spends its charges (bookkeeping unchanged)', () => {
    const spec = specWith({ buffs: ['isb-from-others'], neutralized: ['isb-from-others'] });
    const sim = newSim(spec, atStart('shadow-vulnerability'));
    // Shadowburn: a direct shadow hit that never re-applies the debuff (only Shadow Bolt crits do).
    castInOrder(sim, ['shadowburn']);
    expect(amounts(sim.log(), 'damage', 'shadowburn')).toHaveLength(1);
    expect(sim.snapshot().targetAuras['shadow-vulnerability']?.charges).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Warlock options
// ---------------------------------------------------------------------------

describe('buildDestructionWarlock', () => {
  const derived = (spec: SpecData) => computeStats(spec.setup, spec.statBonuses);

  it('buildDestructionWarlock default equals destructionWarlock field by field', () => {
    expect(DEFAULT_WARLOCK_OPTIONS).toEqual({ armor: 'fel', sacrificeSuccubus: true });
    const built = buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: true });
    expect(built).not.toBe(destructionWarlock);
    expect(Object.keys(built).sort()).toEqual(Object.keys(destructionWarlock).sort());
    for (const key of Object.keys(destructionWarlock) as (keyof SpecData)[]) {
      expect(built[key], key).toEqual(destructionWarlock[key]);
    }
    // The stage 1 numbers: Fel Armor +130 and every talent modifier incl. the Succubus x1.15.
    expect(built.statBonuses).toEqual({ spellPower: 130 });
    expect(built.modifiers).toEqual(talentModifiers);
    expect(derived(built)).toEqual(derived(destructionWarlock));
    expect(built.priority.map((s) => s.spellId)).toEqual(destructionWarlock.priority.map((s) => s.spellId));
  });

  it('armor none removes 130 spell power; demon the same', () => {
    const fel = derived(buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: true }));
    for (const armor of ['none', 'demon'] as const) {
      const spec = buildDestructionWarlock({ armor, sacrificeSuccubus: true });
      const d = derived(spec);
      expect(fel.power.shadow - d.power.shadow, armor).toBe(130);
      expect(fel.power.fire - d.power.fire, armor).toBe(130);
      expect(spec.statBonuses.spellPower ?? 0, armor).toBe(0);
      expect({ ...d, power: fel.power }, armor).toEqual(fel);
      expect(spec.modifiers, armor).toEqual(talentModifiers);
    }
  });

  it('sacrificeSuccubus false removes the shadow multiplier', () => {
    const isSacrifice = (m: { schools?: string[]; damageMult?: number; dotDamageMult?: number }) =>
      m.schools?.length === 1 && m.schools[0] === 'shadow' && m.damageMult === 1.15 && m.dotDamageMult === 1.15;
    const kept = buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: true });
    const noSac = buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: false });
    expect(kept.modifiers.filter(isSacrifice)).toHaveLength(1);
    expect(noSac.modifiers.filter(isSacrifice)).toHaveLength(0);
    expect(noSac.modifiers).toEqual(kept.modifiers.filter((m) => !isSacrifice(m)));
    expect(noSac.statBonuses).toEqual(kept.statBonuses);

    // A Shadow Bolt (same seed) is 1.15 times weaker; Immolate (fire) unchanged.
    const a = newSim(kept, [], 11);
    const b = newSim(noSac, [], 11);
    for (const sim of [a, b]) castInOrder(sim, ['immolate', 'shadow-bolt']);
    expectScaled(amounts(a.log(), 'damage', 'shadow-bolt')[0]!, amounts(b.log(), 'damage', 'shadow-bolt')[0]!, 1.15);
    expect(amounts(a.log(), 'damage', 'immolate')).toEqual(amounts(b.log(), 'damage', 'immolate'));
  });

  it('builds never mutate or share mutable state with destructionWarlock', () => {
    const before = structuredClone({ ...destructionWarlock, priority: undefined, hooks: undefined });
    const a = buildDestructionWarlock({ armor: 'none', sacrificeSuccubus: false });
    a.statBonuses.spellPower = 999;
    a.modifiers.push({ damageMult: 9 });
    expect({ ...destructionWarlock, priority: undefined, hooks: undefined }).toEqual(before);
    expect(buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS).statBonuses).toEqual({ spellPower: 130 });
  });

  it('option descriptions for the setup panel name their source', () => {
    expect(Object.keys(WARLOCK_ARMOR_OPTIONS).sort()).toEqual(['demon', 'fel', 'none']);
    for (const o of [...Object.values(WARLOCK_ARMOR_OPTIONS), SACRIFICE_SUCCUBUS_OPTION]) {
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(0);
      expect(o.source.length).toBeGreaterThan(0);
    }
  });
});
