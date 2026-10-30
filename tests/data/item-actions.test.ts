// Item actions in the setup catalog (item actions and fight settings, Task 2): Icon of the Silver
// Crescent, Destruction Potion, Super Mana Potion and Dark Rune are actions the player (or the
// bot) presses from the item row, with their own and shared cooldowns; applySetup adds them to the
// spec (spells, auras, keybinds 12-15, priority steps). Sources: docs/data-sources.md, "Part D:
// item actions".

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildItemSteps, ITEM_RULES } from '../../src/data/classes/warlock/itemRules';
import { buildDestructionWarlock, destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { deepFreeze } from '../../src/data/common/buffs';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { ITEM_SLOT_COUNT, SPELL_SLOT_COUNT, type BuffDef, type SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { LogEvent, SimSnapshot, SpellDef, TargetData } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';

deepFreeze(destructionWarlock);
deepFreeze(SETUP_CATALOG);

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const ICON = 'use-icon-of-the-silver-crescent';
const DESTRUCTION = 'use-destruction-potion';
const SUPER_MANA = 'use-super-mana-potion';
const DARK_RUNE = 'use-dark-rune';
const ITEM_IDS = [ICON, DESTRUCTION, SUPER_MANA, DARK_RUNE];

function catalogBuff(id: string): BuffDef {
  const b = SETUP_CATALOG.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
}

function actionOf(id: string): SpellDef {
  const a = catalogBuff(id).effect.action;
  if (!a) throw new Error(`${id} has no action`);
  return a;
}

function config(p: Partial<SetupConfig> = {}): SetupConfig {
  return deepFreeze({ ...structuredClone(DEFAULT_SETUP), ...p });
}

const apply = (p: Partial<SetupConfig> = {}) =>
  applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config: config(p) });

function fight(
  applied: ReturnType<typeof apply>,
  o: { seed?: number; durationMs?: number; target?: TargetData; distance?: number } = {},
): Simulation {
  return new Simulation({
    spec: applied.spec,
    target: o.target ?? BOSS_TARGET,
    seed: o.seed ?? 1,
    spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
    infiniteMana: false,
    distanceFromTarget: o.distance ?? applied.sim.distanceFromTarget,
    scheduledAuras: applied.sim.scheduledAuras,
    ...(o.durationMs !== undefined ? { durationMs: o.durationMs } : {}),
  });
}

/** Records every item press the bot makes with the snapshot it saw just before. */
function recordPresses(sim: Simulation) {
  const presses: { spellId: string; ok: boolean; before: SimSnapshot }[] = [];
  const cast = sim.cast.bind(sim);
  sim.cast = (spellId: string) => {
    if (!ITEM_IDS.includes(spellId)) return cast(spellId);
    const before = sim.snapshot();
    const result = cast(spellId);
    presses.push({ spellId, ok: result.ok, before });
    return result;
  };
  return presses;
}

const uses = (log: readonly LogEvent[], spellId: string): number[] =>
  log.filter((e) => e.type === 'cast-complete' && e.spellId === spellId).map((e) => e.atMs);

/** A running snapshot of a fresh fight, for the rule tests. */
function baseSnapshot(): SimSnapshot {
  const sim = new Simulation({ spec: destructionWarlock, target: NEVER_MISS, seed: 1 });
  sim.cast('life-tap');
  sim.advanceTo(2000);
  const s = sim.snapshot();
  expect(s.cast).toBeNull();
  return s;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe('item actions: catalog', () => {
  it('catalog: Icon, Destruction Potion, Super Mana Potion and Dark Rune carry an item action; none has timed; ids unique; cooldown groups; mana ranges; item/onGcd/castTime/manaCost/icon/source', () => {
    const withAction = SETUP_CATALOG.filter((b) => b.effect.action !== undefined);
    // Catalog order: the cooldowns (common/buffs.ts) before the warlock's gear (warlock/buffs.ts).
    expect(withAction.map((b) => b.id)).toEqual(['destruction-potion', 'super-mana-potion', 'dark-rune', 'icon-of-the-silver-crescent']);
    // At most one action per item slot: applySetup can always bind every enabled action.
    expect(withAction.length).toBeLessThanOrEqual(ITEM_SLOT_COUNT);
    expect(ITEM_SLOT_COUNT).toBe(4);
    expect(SPELL_SLOT_COUNT).toBe(12);

    const actionIds = withAction.map((b) => b.effect.action!.id);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    for (const id of actionIds) expect(destructionWarlock.spells.some((s) => s.id === id), id).toBe(false);
    expect([...actionIds].sort()).toEqual([...ITEM_IDS].sort());

    for (const b of withAction) {
      const a = b.effect.action!;
      expect(b.timed, b.id).toBeUndefined();
      expect(b.exclusiveGroup, b.id).toBeUndefined();
      expect(a.id, b.id).toBe(`use-${b.id}`);
      expect(a.name, b.id).toBe(b.name);
      expect(a.item, b.id).toBe(true);
      expect(a.onGcd, b.id).toBe(false);
      expect(a.castTimeMs, b.id).toBe(0);
      expect(a.manaCost, b.id).toBe(0);
      expect(a.canMiss, b.id).toBe(false);
      expect(a.canCrit, b.id).toBe(false);
      expect(a.direct, b.id).toBeUndefined();
      expect(a.icon, b.id).toMatch(/^[a-z0-9_]+$/);
      expect(Number.isInteger(a.wowheadId), b.id).toBe(true);
      expect([a.icon, a.wowheadId], b.id).toEqual([b.icon, b.wowheadId]);
      expect(b.source.trim().length, b.id).toBeGreaterThan(0);
      expect(b.description.trim().length, b.id).toBeGreaterThan(0);
      // Every item's own cooldown: 2 min (Wowhead TBC tooltips "(2 Min Cooldown)").
      expect(a.cooldownMs, b.id).toBe(120000);
      // The aura the action applies is the entry's selfAura (or none).
      if (b.effect.selfAura) expect(a.applyAura, b.id).toEqual({ auraId: b.effect.selfAura.id, on: 'self' });
      else expect(a.applyAura, b.id).toBeUndefined();
      // No static part: the item is pressed, nothing is permanent.
      expect(b.effect.statBonuses, b.id).toBeUndefined();
      expect(b.effect.modifiers, b.id).toBeUndefined();
      expect(b.effect.hooks, b.id).toBeUndefined();
    }

    expect(actionOf('icon-of-the-silver-crescent').sharedCooldown).toEqual({ group: 'trinket', ms: 20000 });
    expect(actionOf('destruction-potion').sharedCooldown).toEqual({ group: 'potion', ms: 120000 });
    expect(actionOf('super-mana-potion').sharedCooldown).toEqual({ group: 'potion', ms: 120000 });
    expect(actionOf('dark-rune').sharedCooldown).toEqual({ group: 'rune', ms: 120000 });

    expect(actionOf('super-mana-potion').gainManaRange).toEqual({ min: 1800, max: 3000 });
    expect(actionOf('dark-rune').gainManaRange).toEqual({ min: 900, max: 1500 });
    expect(actionOf('icon-of-the-silver-crescent').gainManaRange).toBeUndefined();
    expect(actionOf('destruction-potion').gainManaRange).toBeUndefined();

    // The auras: the stage 1.5 values (Icon +155 spell power 20 s; potion +120 and +2% crit 15 s).
    expect(catalogBuff('icon-of-the-silver-crescent').effect.selfAura).toMatchObject({
      id: 'icon-of-the-silver-crescent',
      durationMs: 20000,
      selfStatBonuses: { spellPower: 155 },
    });
    expect(catalogBuff('destruction-potion').effect.selfAura).toMatchObject({
      id: 'destruction-potion',
      durationMs: 15000,
      selfStatBonuses: { spellPower: 120 },
      selfModifiers: [{ critPctDelta: 2 }],
    });
    expect(catalogBuff('super-mana-potion').effect.selfAura).toBeUndefined();
    expect(catalogBuff('dark-rune').effect.selfAura).toBeUndefined();
    expect(catalogBuff('super-mana-potion').group).toBe('consumable');
    expect(catalogBuff('dark-rune').group).toBe('consumable');

    // Heroism stays a timed buff (another player's spell).
    expect(catalogBuff('heroism').timed).toEqual({ defaultStartSec: 0, durationSec: 40 });
    expect(catalogBuff('heroism').effect.action).toBeUndefined();
  });

  it('the actions are deep-frozen and share no object with the spec', () => {
    const specSpells = new Set<SpellDef>(destructionWarlock.spells);
    for (const b of SETUP_CATALOG.filter((x) => x.effect.action)) {
      const a = b.effect.action!;
      expect(Object.isFrozen(a), b.id).toBe(true);
      expect(a.sharedCooldown === undefined || Object.isFrozen(a.sharedCooldown), b.id).toBe(true);
      expect(specSpells.has(a), b.id).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// applySetup
// ---------------------------------------------------------------------------

describe('item actions: applySetup', () => {
  it('applySetup with Icon + Dark Rune enabled adds both actions to spec.spells, the Icon aura to spec.auras, keybinds[12] and [13] are their ids in catalog order, scheduledAuras has no entry for them', () => {
    const { spec, sim } = apply({ enabledBuffs: ['icon-of-the-silver-crescent', 'dark-rune'] });
    // Catalog order: Dark Rune (cooldowns) before the Icon (warlock items), whatever the config order.
    expect(spec.spells).toEqual([...destructionWarlock.spells, actionOf('dark-rune'), actionOf('icon-of-the-silver-crescent')]);
    expect(spec.spells).not.toBe(destructionWarlock.spells);
    expect(spec.auras).toEqual([...destructionWarlock.auras, catalogBuff('icon-of-the-silver-crescent').effect.selfAura]);
    expect(spec.keybinds).toHaveLength(SPELL_SLOT_COUNT + ITEM_SLOT_COUNT);
    expect(spec.keybinds.slice(0, SPELL_SLOT_COUNT)).toEqual(destructionWarlock.keybinds);
    expect(spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual([DARK_RUNE, ICON, '', '']);
    expect(spec.keybinds).not.toBe(destructionWarlock.keybinds);
    expect(sim.scheduledAuras).toEqual([]);
    // Their rules come first (off the GCD), in the same order; then the rotation unchanged.
    expect(spec.priority.map((s) => s.spellId)).toEqual([DARK_RUNE, ICON, ...destructionWarlock.priority.map((s) => s.spellId)]);
    // The shared spec keeps its 12 slots.
    expect(destructionWarlock.keybinds).toHaveLength(SPELL_SLOT_COUNT);
  });

  it('with none enabled keybinds[12..15] are empty and the spec equals the stage 1.5 spec', () => {
    const { spec, sim } = apply();
    expect(spec.keybinds).toEqual([...destructionWarlock.keybinds, '', '', '', '']);
    expect(spec.keybinds).not.toBe(destructionWarlock.keybinds);
    expect(spec.spells).toEqual(destructionWarlock.spells);
    expect(spec.auras).toEqual(destructionWarlock.auras);
    expect(spec.priority.map((s) => [s.spellId, s.label, s.hint])).toEqual(
      destructionWarlock.priority.map((s) => [s.spellId, s.label, s.hint]),
    );
    expect(sim.scheduledAuras).toEqual([]);
  });

  it('all four enabled: the item row is full, in catalog order, and the fight knows every action', () => {
    const enabledBuffs = ['icon-of-the-silver-crescent', 'dark-rune', 'super-mana-potion', 'destruction-potion'];
    const applied = apply({ enabledBuffs });
    expect(applied.spec.keybinds.slice(SPELL_SLOT_COUNT)).toEqual([DESTRUCTION, SUPER_MANA, DARK_RUNE, ICON]);
    expect(applied.sim.scheduledAuras).toEqual([]);
    const sim = fight(applied);
    for (const id of ITEM_IDS) expect(sim.snapshot().spells[id], id).toEqual({ manaCost: 0, castTimeMs: 0 });
  });
});

// ---------------------------------------------------------------------------
// A scripted fight
// ---------------------------------------------------------------------------

describe('item actions in a fight', () => {
  it('enabling Destruction Potion in a scripted fight: +120 SP for 15 s and the next Shadow Bolt does the expected damage; rejected cooldown on the second press; Super Mana Potion rejected cooldown (shared group); Dark Rune not affected', () => {
    const applied = apply({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'dark-rune'] });
    const run = (spec: SpecData, usePotion: boolean) => {
      const sim = new Simulation({ spec, target: NEVER_MISS, seed: 7, infiniteMana: false, distanceFromTarget: 0 });
      if (usePotion) expect(sim.cast(DESTRUCTION)).toEqual({ ok: true }); // starts the fight (R13)
      expect(sim.cast('shadow-bolt')).toEqual({ ok: true }); // no GCD from the potion
      expect(sim.snapshot().cast?.startMs).toBe(0);
      return sim;
    };
    const withPotion = run(applied.spec, true);
    const s0 = withPotion.snapshot();
    expect(s0.selfAuras['destruction-potion']).toMatchObject({ remainingMs: 15000 });
    expect(s0.cooldownRemainingMs[DESTRUCTION]).toBe(120000);
    expect(s0.cooldownRemainingMs[SUPER_MANA]).toBe(120000);
    expect(s0.cooldownRemainingMs[DARK_RUNE] ?? 0).toBe(0);
    expect(withPotion.log().slice(0, 2)).toEqual([
      { atMs: 0, type: 'cast-complete', spellId: DESTRUCTION },
      { atMs: 0, type: 'aura-apply', auraId: 'destruction-potion', spellId: DESTRUCTION },
    ]);

    // The bolt lands with +120 spell power and +2% crit: exactly as a spec with them permanent
    // (no random draw from the potion, so the rolls line up).
    const permanent: SpecData = {
      ...applied.spec,
      statBonuses: { ...applied.spec.statBonuses, spellPower: (applied.spec.statBonuses.spellPower ?? 0) + 120 },
      modifiers: [...applied.spec.modifiers, { critPctDelta: 2 }],
    };
    const plus = run(permanent, false);
    const base = run(applied.spec, false);
    for (const sim of [withPotion, plus, base]) sim.advanceTo(3000);
    const bolt = (sim: Simulation) => sim.log().find((e) => e.type === 'damage' && e.spellId === 'shadow-bolt')!;
    expect(bolt(withPotion)).toEqual(bolt(plus));
    expect(bolt(withPotion).amount!).toBeGreaterThan(bolt(base).amount!);

    // Second press: own cooldown; Super Mana Potion: the shared potion cooldown; Dark Rune: free.
    expect(withPotion.cast(DESTRUCTION)).toEqual({ ok: false, reason: 'cooldown' });
    expect(withPotion.cast(SUPER_MANA)).toEqual({ ok: false, reason: 'cooldown' });
    expect(withPotion.snapshot().cooldownRemainingMs[SUPER_MANA]).toBe(117000);
    // Spend mana so the rune's gain is not capped: 4 more bolts.
    for (let i = 0; i < 4; i++) {
      while (!withPotion.cast('shadow-bolt').ok) withPotion.advanceTo(withPotion.snapshot().nowMs + 10);
    }
    while (withPotion.snapshot().cast !== null) withPotion.advanceTo(withPotion.snapshot().nowMs + 10);
    const before = withPotion.snapshot();
    expect(before.maxMana - before.mana).toBeGreaterThanOrEqual(1500);
    expect(withPotion.cast(DARK_RUNE)).toEqual({ ok: true });
    const gain = withPotion.snapshot().mana - before.mana;
    expect(gain).toBeGreaterThanOrEqual(900);
    expect(gain).toBeLessThanOrEqual(1500);
    expect(Number.isInteger(gain)).toBe(true);
    expect(withPotion.log().filter((e) => e.type === 'mana' && e.spellId === DARK_RUNE).map((e) => e.amount)).toEqual([gain]);
    expect(withPotion.snapshot().cooldownRemainingMs[DARK_RUNE]).toBe(120000);
    // The potion buff fades 15 s after the use.
    withPotion.advanceTo(20000);
    expect(withPotion.log().filter((e) => e.auraId === 'destruction-potion').map((e) => [e.type, e.atMs])).toEqual([
      ['aura-apply', 0],
      ['aura-fade', 15000],
    ]);
  });

  it('Super Mana Potion restores 1800-3000 mana (capped at max mana), and the Icon shares the 20 s trinket group only with trinkets', () => {
    const applied = apply({ enabledBuffs: ['super-mana-potion', 'icon-of-the-silver-crescent', 'destruction-potion'] });
    const gains: number[] = [];
    for (const seed of SEEDS) {
      const sim = new Simulation({ spec: applied.spec, target: NEVER_MISS, seed, infiniteMana: false, distanceFromTarget: 0 });
      // Life Tap is not a mana sink; spend with 8 Shadow Bolts (over 3000 mana).
      for (let i = 0; i < 8; i++) {
        while (!sim.cast('shadow-bolt').ok) sim.advanceTo(sim.snapshot().nowMs + 10);
      }
      while (sim.snapshot().cast !== null) sim.advanceTo(sim.snapshot().nowMs + 10);
      const before = sim.snapshot();
      expect(before.maxMana - before.mana).toBeGreaterThanOrEqual(3000);
      expect(sim.cast(SUPER_MANA)).toEqual({ ok: true });
      gains.push(sim.snapshot().mana - before.mana);
      // The Icon is not in the potion group: still usable; then the potion group stays on cooldown.
      expect(sim.cast(ICON)).toEqual({ ok: true });
      expect(sim.cast(DESTRUCTION)).toEqual({ ok: false, reason: 'cooldown' });
      expect(sim.snapshot().cooldownRemainingMs[ICON]).toBe(120000);
    }
    for (const g of gains) {
      expect(g).toBeGreaterThanOrEqual(1800);
      expect(g).toBeLessThanOrEqual(3000);
    }
    expect(new Set(gains).size).toBeGreaterThan(1);
    // At full mana the gain is capped (logged 0).
    const sim = new Simulation({ spec: applied.spec, target: NEVER_MISS, seed: 1, infiniteMana: false });
    expect(sim.cast(SUPER_MANA)).toEqual({ ok: true });
    expect(sim.log().filter((e) => e.type === 'mana')).toEqual([{ atMs: 0, type: 'mana', spellId: SUPER_MANA, amount: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// Bot rules
// ---------------------------------------------------------------------------

describe('item actions: bot rules (buildItemSteps)', () => {
  it('buildItemSteps is pure, follows the given order, ignores unknown ids, and has a rule for every catalog action', () => {
    const all = SETUP_CATALOG.flatMap((b) => (b.effect.action ? [b.effect.action.id] : []));
    expect(Object.keys(ITEM_RULES).sort()).toEqual([...all].sort());
    expect(buildItemSteps(all, 46400).map((s) => s.spellId)).toEqual(all);
    expect(buildItemSteps([ICON, 'no-such-item', DARK_RUNE], null).map((s) => s.spellId)).toEqual([ICON, DARK_RUNE]);
    expect(buildItemSteps([], 46400)).toEqual([]);
    const a = buildItemSteps(all, null);
    const b = buildItemSteps(all, null);
    a.forEach((step, i) => expect(step).not.toBe(b[i]));
    for (const step of a) {
      expect(step.label.length, step.spellId).toBeGreaterThan(0);
      expect(step.hint.length, step.spellId).toBeGreaterThan(0);
      expect(step.when, step.spellId).toBeTypeOf('function');
    }
    // The hints say when (Heroism or the pull).
    const icon = (h: boolean) => buildItemSteps([ICON], h ? 46400 : null)[0]!;
    expect(icon(true).hint).toMatch(/Heroism/);
    expect(icon(false).hint).toMatch(/pull/);
  });

  it('the rules: Icon and Destruction Potion with Heroism up (or always without Heroism), Super Mana Potion at 3000 missing mana, Dark Rune at 1500', () => {
    const s = baseSnapshot();
    const heroism = { auraId: 'heroism', stacks: 1, charges: 0, remainingMs: 30000 };
    const when = (id: string, h: boolean, snap: SimSnapshot) => buildItemSteps([id], h ? 46400 : null)[0]!.when!(snap);
    for (const id of [ICON, DESTRUCTION]) {
      expect(when(id, true, s), id).toBe(false);
      expect(when(id, true, { ...s, selfAuras: { ...s.selfAuras, heroism } }), id).toBe(true);
      expect(when(id, false, s), id).toBe(true);
      expect(when(id, false, { ...s, phase: 'ready' }), id).toBe(true);
    }
    const missing = (n: number): SimSnapshot => ({ ...s, mana: s.maxMana - n });
    expect(when(SUPER_MANA, true, missing(2999))).toBe(false);
    expect(when(SUPER_MANA, true, missing(3000))).toBe(true);
    expect(when(DARK_RUNE, false, missing(1499))).toBe(false);
    expect(when(DARK_RUNE, false, missing(1500))).toBe(true);
    // Never while a cast is in progress with a spell already queued: the item would replace it.
    const busy: SimSnapshot = { ...missing(5000), cast: { spellId: 'shadow-bolt', startMs: 0, endMs: 2431 } };
    expect(when(DARK_RUNE, false, busy)).toBe(true); // nothing queued: it may take the queue
    expect(when(DARK_RUNE, false, { ...busy, queuedSpellId: 'shadow-bolt' })).toBe(false);
    expect(when(ICON, false, { ...busy, queuedSpellId: 'shadow-bolt' })).toBe(false);
    expect(when(ICON, false, { ...busy, queuedSpellId: DESTRUCTION })).toBe(false);
    // Its own queued press still counts as wanted (the bot then stops at it, keeping the queue).
    expect(when(ICON, false, { ...busy, queuedSpellId: ICON })).toBe(true);
    // During the GCD alone (no cast) a queued spell keeps its slot, so the item is fine.
    expect(when(ICON, false, { ...s, queuedSpellId: 'shadow-bolt' })).toBe(true);
  });

  const heroismAt = (startSec: number): Partial<SetupConfig> => ({
    timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec, durationSec: 40 } },
  });

  it('bot: with Icon and Destruction Potion and Heroism at 6.4 s the bot uses them while Heroism is up; never replaces a queued spell; never twice inside 120 s', () => {
    const applied = apply({ enabledBuffs: ['heroism', 'destruction-potion', 'icon-of-the-silver-crescent'], ...heroismAt(6.4) });
    for (const seed of SEEDS) {
      const sim = fight(applied, { seed });
      const presses = recordPresses(sim);
      runBot(sim, applied.spec.priority);
      const log = sim.log();
      for (const id of [ICON, DESTRUCTION]) {
        const at = uses(log, id);
        expect(at, `seed ${seed} ${id}`).toHaveLength(1);
        expect(at[0]!, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(6400);
        expect(at[0]!, `seed ${seed} ${id}`).toBeLessThan(6400 + 3000); // the first chance after Heroism
      }
      // The gate: no item press accepted while a cast runs with a spell already queued, and no
      // item is ever dropped from the queue.
      for (const p of presses) {
        if (!ITEM_IDS.includes(p.spellId) || !p.ok) continue;
        expect(p.before.cast !== null && p.before.queuedSpellId !== null, `seed ${seed} ${p.spellId} at ${p.before.nowMs}`).toBe(false);
      }
      expect(log.filter((e) => e.type === 'queue-drop' && ITEM_IDS.includes(e.spellId ?? ''))).toEqual([]);
    }
  });

  it('bot: with Heroism off the Icon and the potion are used at the pull, then every 120 s (never twice inside 120 s)', () => {
    const applied = apply({ enabledBuffs: ['destruction-potion', 'icon-of-the-silver-crescent'] });
    for (const seed of [1, 2, 3]) {
      const sim = fight(applied, { seed, durationMs: 300000 });
      runBot(sim, applied.spec.priority);
      for (const id of [ICON, DESTRUCTION]) {
        const at = uses(sim.log(), id);
        expect(at[0]!, `seed ${seed} ${id}`).toBeLessThan(100);
        expect(at, `seed ${seed} ${id}`).toHaveLength(3);
        for (let i = 1; i < at.length; i++) {
          expect(at[i]! - at[i - 1]!, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(120000);
          expect(at[i]! - at[i - 1]!, `seed ${seed} ${id}`).toBeLessThan(120000 + 3000);
        }
      }
    }
  });

  it('bot: Super Mana Potion only when 3000 mana are missing; Dark Rune only when 1500 are missing; the potions never inside 120 s of each other', () => {
    const applied = apply({ enabledBuffs: ['super-mana-potion', 'dark-rune'] });
    const withBurst = apply({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'dark-rune'] });
    let manaPots = 0;
    let runes = 0;
    for (const seed of [1, 2, 3]) {
      for (const a of [applied, withBurst]) {
        const sim = fight(a, { seed, durationMs: 300000 });
        const presses = recordPresses(sim);
        runBot(sim, a.spec.priority, 20);
        for (const p of presses.filter((x) => x.ok)) {
          if (p.spellId === SUPER_MANA) {
            expect(p.before.maxMana - p.before.mana, `seed ${seed}`).toBeGreaterThanOrEqual(3000);
            manaPots++;
          }
          if (p.spellId === DARK_RUNE) {
            expect(p.before.maxMana - p.before.mana, `seed ${seed}`).toBeGreaterThanOrEqual(1500);
            runes++;
          }
        }
        const potions = [...uses(sim.log(), SUPER_MANA), ...uses(sim.log(), DESTRUCTION)].sort((x, y) => x - y);
        for (let i = 1; i < potions.length; i++) expect(potions[i]! - potions[i - 1]!).toBeGreaterThanOrEqual(120000);
        const r = uses(sim.log(), DARK_RUNE);
        for (let i = 1; i < r.length; i++) expect(r[i]! - r[i - 1]!).toBeGreaterThanOrEqual(120000);
      }
    }
    expect(manaPots).toBeGreaterThan(0);
    expect(runes).toBeGreaterThan(0);
  });

  it("bot: the mean DPS over seeds 1-10 with the items exceeds the same setup without them", () => {
    const base: Partial<SetupConfig> = heroismAt(6.4);
    const meanDps = (enabledBuffs: string[]) => {
      const a = apply({ ...base, enabledBuffs });
      return SEEDS.map((seed) => runBot(fight(a, { seed }), a.spec.priority).dps).reduce((x, y) => x + y, 0) / SEEDS.length;
    };
    const without = meanDps(['heroism']);
    const withItems = meanDps(['heroism', 'destruction-potion', 'dark-rune', 'icon-of-the-silver-crescent']);
    expect(withItems).toBeGreaterThan(without);
  });
});
