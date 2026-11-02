// Item-use rules (simulator Task 1): the rule kinds compiled into pure priority steps, and the
// proof that the default rules reproduce the pre-change item steps exactly (against data captured
// at c121206 and against a literal copy of the old code).

import { describe, expect, it } from 'vitest';
import { buildItemSteps, ITEM_RULES, type ItemRule } from '../../src/data/classes/warlock/itemRules';
import {
  compileItemUse,
  DEFAULT_ITEM_USE,
  ITEM_USE_LIMITS,
  normalizeItemUse,
  normalizeItemUseOrder,
  normalizeItemUseRule,
  PULL_WINDOW_MS,
  type ItemUseAction,
  type ItemUseRule,
} from '../../src/data/classes/warlock/itemUse';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { SimSnapshot } from '../../src/engine/types';
import { setupCatalogFor } from '../../src/setup/defaults';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { gearItemRules, isGearEffectId } from '../../src/setup/gearEffects';
import { hash, oldBuildItemSteps, oldBurstRule, quagBloodgemGear, randomSnapshots, whenBits, type OldItemRule } from '../fixtures/item-use-reference';
import { HEAD_STEPS } from '../fixtures/item-use-reference-data';

const db = itemDbSync();
const AUTHOR_RULES = gearItemRules(setupCatalogFor(DEFAULT_GEAR).filter((b) => isGearEffectId(b.id)));
const QUAG_RULES = gearItemRules(setupCatalogFor(quagBloodgemGear(), db).filter((b) => isGearEffectId(b.id)));
const RULE_SETS: Record<string, Record<string, ItemRule>> = { author: AUTHOR_RULES, 'author-rev': AUTHOR_RULES, quag: QUAG_RULES };
const SNAPSHOTS = randomSnapshots(20261102, 5000);

/** The old code's gear rules: `oldBurstRule` with the same label, effect and cooldown texts. */
function oldGearRules(rules: Record<string, ItemRule>): Record<string, OldItemRule> {
  return Object.fromEntries(Object.entries(rules).map(([id, r]) => [id, oldBurstRule(r.label, r.use.effect, r.use.cooldown)]));
}

// ---------------------------------------------------------------------------
// Default rules = the pre-change steps
// ---------------------------------------------------------------------------

describe('item-use: the default rules reproduce the pre-change steps', () => {
  it("default rules reproduce today's steps (same ids, same labels/hints, same when() results over 5 000 random snapshots vs the pre-change buildItemSteps captured at c121206 and as a literal copy in the test)", () => {
    expect(SNAPSHOTS).toHaveLength(5000);
    expect(HEAD_STEPS.length).toBe(15);
    for (const ref of HEAD_STEPS) {
      const rules = RULE_SETS[ref.name]!;
      const ids =
        ref.name === 'quag'
          ? ['use-destruction-potion', 'use-item-29132', 'use-super-mana-potion']
          : ref.name === 'author'
            ? ['use-item-29370', 'use-destruction-potion', 'use-super-mana-potion', 'use-dark-rune']
            : ['use-dark-rune', 'use-super-mana-potion', 'use-destruction-potion', 'use-item-29370', 'nope'];
      const label = `${ref.name} heroismEndMs ${ref.h}`;
      const now = buildItemSteps(ids, ref.h, rules);
      // Against the capture from c121206.
      expect(now.map((s) => s.spellId), label).toEqual(ref.ids);
      expect(now.map((s) => s.label), label).toEqual(ref.labels);
      expect(now.map((s) => s.hint), label).toEqual(ref.hints);
      expect(hash(whenBits(now, SNAPSHOTS)), label).toBe(ref.bits);
      // Against the literal copy of the old code.
      const old = oldBuildItemSteps(ids, ref.h, oldGearRules(rules));
      expect(now.map(({ spellId, label: l, hint }) => ({ spellId, l, hint })), label).toEqual(old.map(({ spellId, label: l, hint }) => ({ spellId, l, hint })));
      expect(whenBits(now, SNAPSHOTS), label).toBe(whenBits(old, SNAPSHOTS));
      // compileItemUse with no stored rules (a config without itemUse) is the same.
      const actions = ids.flatMap((id) => {
        const r = Object.hasOwn(ITEM_RULES, id) ? ITEM_RULES[id]! : rules[id];
        return r ? [{ id, spellId: id, label: r.label, ...r.use } satisfies ItemUseAction] : [];
      });
      const compiled = compileItemUse(actions, {}, { heroismEndMs: ref.h });
      expect(compiled.map((s) => s.hint), label).toEqual(ref.hints);
      expect(hash(whenBits(compiled, SNAPSHOTS)), label).toBe(ref.bits);
    }
  });

  it('DEFAULT_ITEM_USE: burst items with-heroism (ready without Heroism), Super Mana Potion mana-missing 3000, Dark Rune mana-missing 1500', () => {
    const actions = (['use-destruction-potion', 'use-super-mana-potion', 'use-dark-rune'] as const).map(
      (id) => ({ id, spellId: id, label: ITEM_RULES[id]!.label, ...ITEM_RULES[id]!.use }) satisfies ItemUseAction,
    );
    const icon = { id: 'item:29370', spellId: 'use-item-29370', label: 'Icon', ...AUTHOR_RULES['use-item-29370']!.use } satisfies ItemUseAction;
    expect(DEFAULT_ITEM_USE([...actions, icon], 46400)).toEqual({
      'use-destruction-potion': { trigger: { kind: 'with-heroism' } },
      'use-super-mana-potion': { trigger: { kind: 'mana-missing', amount: 3000 } },
      'use-dark-rune': { trigger: { kind: 'mana-missing', amount: 1500 } },
      'item:29370': { trigger: { kind: 'with-heroism' } },
    });
    expect(DEFAULT_ITEM_USE([...actions, icon], null)['item:29370']).toEqual({ trigger: { kind: 'ready' } });
    expect(DEFAULT_ITEM_USE([...actions, icon], null)['use-destruction-potion']).toEqual({ trigger: { kind: 'ready' } });
    expect(AUTHOR_RULES['use-item-29370']!.use.cooldownMs).toBe(120000);
  });
});

// ---------------------------------------------------------------------------
// Each trigger kind
// ---------------------------------------------------------------------------

const BURST: ItemUseAction = {
  id: 'item:1',
  spellId: 'use-item-1',
  label: 'Trinket',
  kind: 'burst',
  effect: '+100 spell power for 20 s',
  cooldown: '2 min cooldown.',
  cooldownMs: 120000,
};
const MANA: ItemUseAction = {
  id: 'dark-rune',
  spellId: 'use-dark-rune',
  label: 'Dark Rune',
  kind: 'mana',
  effect: 'restores 900 to 1500 mana',
  cooldown: '2 min cooldown of its own.',
  cooldownMs: 120000,
  maxManaGain: 1500,
};

function snap(p: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    nowMs: 10000,
    phase: 'running',
    durationMs: 60000,
    gcdEndsAtMs: 0,
    cast: null,
    mana: 10000,
    maxMana: 10000,
    cooldownRemainingMs: { 'use-item-1': 0, 'use-dark-rune': 0 },
    spells: {},
    gcdMs: 1500,
    targetAuras: {},
    selfAuras: {},
    damageTotal: 0,
    dps: 0,
    queuedSpellId: null,
    inFlight: [],
    ...p,
  };
}

const aura = (id: string) => ({ [id]: { auraId: id, stacks: 1, charges: 0, remainingMs: 5000 } });

/** The when() of one action under one rule (null: no step). */
function whenOf(rule: ItemUseRule, a: ItemUseAction = BURST, heroismEndMs: number | null = null) {
  const steps = compileItemUse([a], { itemUse: { [a.id]: rule } }, { heroismEndMs });
  return steps.length === 0 ? null : steps[0]!.when!;
}

describe('item-use: trigger kinds', () => {
  it('ready: always (subject to the queue gate)', () => {
    const w = whenOf({ trigger: { kind: 'ready' } })!;
    expect(w(snap({ nowMs: 0 }))).toBe(true);
    expect(w(snap({ nowMs: 59000 }))).toBe(true);
    // The queue gate stays: a cast in progress with another spell queued.
    const busy = { cast: { spellId: 'shadow-bolt', startMs: 9000, endMs: 11500 } };
    expect(w(snap({ ...busy, queuedSpellId: 'shadow-bolt' }))).toBe(false);
    expect(w(snap({ ...busy, queuedSpellId: null }))).toBe(true);
    expect(w(snap({ ...busy, queuedSpellId: 'use-item-1' }))).toBe(true);
  });

  it(`pull: only at nowMs 0..${PULL_WINDOW_MS - 1} (one unhasted GCD)`, () => {
    const w = whenOf({ trigger: { kind: 'pull' } })!;
    expect(PULL_WINDOW_MS).toBe(1500);
    expect(w(snap({ nowMs: 0, phase: 'ready' }))).toBe(true);
    expect(w(snap({ nowMs: 1499 }))).toBe(true);
    expect(w(snap({ nowMs: 1500 }))).toBe(false);
    expect(w(snap({ nowMs: 130000, durationMs: 300000 }))).toBe(false);
  });

  it('at 30 s: from 30 s on', () => {
    const w = whenOf({ trigger: { kind: 'at', sec: 30 } })!;
    expect(w(snap({ nowMs: 29999 }))).toBe(false);
    expect(w(snap({ nowMs: 30000 }))).toBe(true);
    expect(w(snap({ nowMs: 59000 }))).toBe(true);
  });

  it('with-heroism: while Heroism is up or once it is over; always without Heroism', () => {
    const w = whenOf({ trigger: { kind: 'with-heroism' } }, BURST, 46400)!;
    expect(w(snap({ nowMs: 2000 }))).toBe(false);
    expect(w(snap({ nowMs: 2000, selfAuras: aura('heroism') }))).toBe(true);
    expect(w(snap({ nowMs: 46399 }))).toBe(false);
    expect(w(snap({ nowMs: 46400 }))).toBe(true);
    expect(whenOf({ trigger: { kind: 'with-heroism' } }, BURST, null)!(snap({ nowMs: 2000 }))).toBe(true);
  });

  it("with-buff: while the named self aura is up (another trinket's buff), prototype keys never match", () => {
    const w = whenOf({ trigger: { kind: 'with-buff', auraId: 'item-buff:35163' } })!;
    expect(w(snap())).toBe(false);
    expect(w(snap({ selfAuras: aura('item-buff:35163') }))).toBe(true);
    expect(w(snap({ selfAuras: aura('heroism') }))).toBe(false);
    const proto = whenOf({ trigger: { kind: 'with-buff', auraId: 'constructor' } })!;
    expect(proto(snap())).toBe(false);
  });

  it('mana-below and mana-missing', () => {
    const below = whenOf({ trigger: { kind: 'mana-below', mana: 4000 } }, MANA)!;
    expect(below(snap({ mana: 4000 }))).toBe(false);
    expect(below(snap({ mana: 3999 }))).toBe(true);
    const missing = whenOf({ trigger: { kind: 'mana-missing', amount: 2000 } }, MANA)!;
    expect(missing(snap({ mana: 8001 }))).toBe(false);
    expect(missing(snap({ mana: 8000 }))).toBe(true);
  });

  it('fight-end: in the last 20 s', () => {
    const w = whenOf({ trigger: { kind: 'fight-end', lastSec: 20 } })!;
    expect(w(snap({ nowMs: 39999 }))).toBe(false);
    expect(w(snap({ nowMs: 40000 }))).toBe(true);
    expect(w(snap({ nowMs: 279999, durationMs: 300000 }))).toBe(false);
    expect(w(snap({ nowMs: 280000, durationMs: 300000 }))).toBe(true);
  });

  it('never: no step at all (the bot leaves it alone); the other actions keep theirs', () => {
    expect(whenOf({ trigger: { kind: 'never' } })).toBeNull();
    const steps = compileItemUse([BURST, MANA], { itemUse: { [BURST.id]: { trigger: { kind: 'never' } } } }, { heroismEndMs: null });
    expect(steps.map((s) => s.spellId)).toEqual(['use-dark-rune']);
  });

  it('notBefore/notAfter windows: a time outside the window means the step is not wanted (the trigger alone is not enough)', () => {
    const w = whenOf({ trigger: { kind: 'ready' }, notBeforeSec: 10, notAfterSec: 20 })!;
    expect(w(snap({ nowMs: 9999 }))).toBe(false);
    expect(w(snap({ nowMs: 10000 }))).toBe(true);
    expect(w(snap({ nowMs: 20000 }))).toBe(true);
    expect(w(snap({ nowMs: 20001 }))).toBe(false);
    const manaWindow = whenOf({ trigger: { kind: 'mana-missing', amount: 1500 }, notAfterSec: 30 }, MANA)!;
    expect(manaWindow(snap({ nowMs: 31000, mana: 0 }))).toBe(false);
    expect(manaWindow(snap({ nowMs: 29000, mana: 0 }))).toBe(true);
    expect(manaWindow(snap({ nowMs: 29000, mana: 9000 }))).toBe(false);
  });

  it('minGap: elapsed since the last use = cooldown - cooldown remaining; a gap over the cooldown is capped at it', () => {
    const w = whenOf({ trigger: { kind: 'ready' }, minGapSec: 100 })!;
    // Used 90 s ago: 30 s remaining -> 90 s elapsed < 100.
    expect(w(snap({ cooldownRemainingMs: { 'use-item-1': 30000 } }))).toBe(false);
    // 20 s remaining -> 100 s elapsed.
    expect(w(snap({ cooldownRemainingMs: { 'use-item-1': 20000 } }))).toBe(true);
    // Ready (never used, or long ago).
    expect(w(snap({ cooldownRemainingMs: { 'use-item-1': 0 } }))).toBe(true);
    expect(w(snap({ cooldownRemainingMs: {} }))).toBe(true);
    // 300 s > the 120 s cooldown: capped (wanted once the cooldown is over).
    const long = whenOf({ trigger: { kind: 'ready' }, minGapSec: 300 })!;
    expect(long(snap({ cooldownRemainingMs: { 'use-item-1': 0 } }))).toBe(true);
    expect(long(snap({ cooldownRemainingMs: { 'use-item-1': 1 } }))).toBe(false);
    expect(compileItemUse([BURST], { itemUse: { [BURST.id]: { trigger: { kind: 'ready' }, minGapSec: 300 } } }, { heroismEndMs: null })[0]!.hint).toContain(
      'at least 120 s after its last use',
    );
  });

  it('order list changes priority; unknown and repeated ids in it are ignored; unlisted actions follow in the given order', () => {
    const C: ItemUseAction = { ...BURST, id: 'item:3', spellId: 'use-item-3' };
    const ids = (order?: string[]) => compileItemUse([BURST, MANA, C], order ? { itemUseOrder: order } : {}, { heroismEndMs: null }).map((s) => s.spellId);
    expect(ids()).toEqual(['use-item-1', 'use-dark-rune', 'use-item-3']);
    expect(ids(['item:3'])).toEqual(['use-item-3', 'use-item-1', 'use-dark-rune']);
    expect(ids(['dark-rune', 'nope', 'item:3', 'dark-rune'])).toEqual(['use-dark-rune', 'use-item-3', 'use-item-1']);
  });

  it('compileItemUse is pure: new steps per call, inputs untouched; a rule of an id that is not an action is ignored; an invalid stored rule falls back to the default', () => {
    const config = Object.freeze({ itemUse: Object.freeze({ nope: { trigger: { kind: 'never' as const } }, [MANA.id]: { trigger: { kind: 'bogus' } } as never }) });
    const a = compileItemUse([BURST, MANA], config, { heroismEndMs: null });
    const b = compileItemUse([BURST, MANA], config, { heroismEndMs: null });
    a.forEach((s, i) => expect(s).not.toBe(b[i]));
    expect(a.map((s) => s.spellId)).toEqual(['use-item-1', 'use-dark-rune']);
    expect(a[1]!.when!(snap({ mana: 8500 }))).toBe(true); // default: 1500 missing
    expect(a[1]!.when!(snap({ mana: 8501 }))).toBe(false);
  });

  it('hints describe the trigger and the window', () => {
    const hint = (rule: ItemUseRule, a = BURST) => compileItemUse([a], { itemUse: { [a.id]: rule } }, { heroismEndMs: null, auraNames: { 'item-buff:35163': 'Blessing of the Silver Crescent' } })[0]!.hint;
    expect(hint({ trigger: { kind: 'at', sec: 30 } })).toBe('Use it from 30 s on, whenever it is ready (off the GCD): +100 spell power for 20 s. 2 min cooldown.');
    expect(hint({ trigger: { kind: 'with-buff', auraId: 'item-buff:35163' } })).toMatch(/^Use it while Blessing of the Silver Crescent is up/);
    expect(hint({ trigger: { kind: 'fight-end', lastSec: 20 }, notBeforeSec: 5 })).toMatch(/last 20 s of the fight \(off the GCD\), not before 5 s:/);
    expect(hint({ trigger: { kind: 'mana-missing', amount: 1500 } }, MANA)).toBe(
      'When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.',
    );
    expect(hint({ trigger: { kind: 'mana-below', mana: 2000 } }, MANA)).toMatch(/^When mana is below 2000:/);
    expect(hint({ trigger: { kind: 'pull' } })).toMatch(/at the pull only/);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const known = (id: string) => ['destruction-potion', 'super-mana-potion', 'dark-rune'].includes(id) || isGearEffectId(id);

describe('item-use: normalization', () => {
  it('clamps numbers, drops unknown kinds, NaN and missing parameters, keeps finite windows', () => {
    expect(normalizeItemUseRule({ trigger: { kind: 'at', sec: 99999 } })).toEqual({ trigger: { kind: 'at', sec: 3600 } });
    expect(normalizeItemUseRule({ trigger: { kind: 'at', sec: -5 } })).toEqual({ trigger: { kind: 'at', sec: 0 } });
    expect(normalizeItemUseRule({ trigger: { kind: 'at', sec: NaN } })).toBeNull();
    expect(normalizeItemUseRule({ trigger: { kind: 'at', sec: Infinity } })).toBeNull();
    expect(normalizeItemUseRule({ trigger: { kind: 'at' } })).toBeNull();
    expect(normalizeItemUseRule({ trigger: { kind: 'mana-missing', amount: 1e9 } })).toEqual({ trigger: { kind: 'mana-missing', amount: 100000 } });
    expect(normalizeItemUseRule({ trigger: { kind: 'mana-below', mana: 1234.6 } })).toEqual({ trigger: { kind: 'mana-below', mana: 1235 } });
    expect(normalizeItemUseRule({ trigger: { kind: 'fight-end', lastSec: 20.00049 } })).toEqual({ trigger: { kind: 'fight-end', lastSec: 20 } });
    expect(normalizeItemUseRule({ trigger: { kind: 'with-buff', auraId: '__proto__' } })).toBeNull();
    expect(normalizeItemUseRule({ trigger: { kind: 'with-buff', auraId: 'item-buff:35163' } })).toEqual({ trigger: { kind: 'with-buff', auraId: 'item-buff:35163' } });
    expect(normalizeItemUseRule({ trigger: { kind: 'explode' } })).toBeNull();
    expect(normalizeItemUseRule({ trigger: { kind: 'ready', extra: 1 }, notBeforeSec: 5, notAfterSec: 'x', minGapSec: NaN, junk: 1 })).toEqual({
      trigger: { kind: 'ready' },
      notBeforeSec: 5,
    });
    expect(normalizeItemUseRule(null)).toBeNull();
    expect(normalizeItemUseRule([1])).toBeNull();
  });

  it("hostile itemUse (proto keys, huge lists, wrong kinds, NaN, throwing getters) never throws and is idempotent", () => {
    const huge: Record<string, unknown> = {};
    for (let i = 1; i <= 5000; i++) huge[`item:${i}`] = { trigger: { kind: 'ready' } };
    const hostile = [
      JSON.parse('{"__proto__": {"trigger": {"kind": "ready"}}, "constructor": {"trigger": {"kind": "ready"}}, "dark-rune": {"trigger": {"kind": "pull"}}}'),
      huge,
      { 'dark-rune': { trigger: { kind: 'mana-below', mana: NaN } }, 'super-mana-potion': 'x', 'destruction-potion': { trigger: null } },
      new Proxy({}, { ownKeys: () => { throw new Error('boom'); } }),
      Object.defineProperty({}, 'dark-rune', { enumerable: true, get: () => { throw new Error('boom'); } }),
      [1, 2, 3],
      'garbage',
      42,
    ];
    for (const v of hostile) {
      const once = normalizeItemUse(v, known);
      expect(normalizeItemUse(once, known)).toEqual(once);
      if (once !== undefined) {
        expect(Object.keys(once).length).toBeLessThanOrEqual(ITEM_USE_LIMITS.maxEntries);
        expect(Object.getPrototypeOf(once)).toBe(Object.prototype);
        expect(Object.keys(once).every(known)).toBe(true);
      }
    }
    expect(normalizeItemUse(hostile[0], known)).toEqual({ 'dark-rune': { trigger: { kind: 'pull' } } });
    expect(Object.keys(normalizeItemUse(huge, known)!)).toHaveLength(32);
    expect(normalizeItemUse(hostile[2], known)).toBeUndefined();
    const order = normalizeItemUseOrder([...Array.from({ length: 100 }, (_, i) => `item:${i + 1}`), '__proto__', 'dark-rune'], known);
    expect(order).toHaveLength(32);
    expect(normalizeItemUseOrder(['dark-rune', 'dark-rune', 7, 'nope', 'item:29370'], known)).toEqual(['dark-rune', 'item:29370']);
    expect(normalizeItemUseOrder('x', known)).toBeUndefined();
    expect(normalizeItemUseOrder([], known)).toBeUndefined();
  });
});
