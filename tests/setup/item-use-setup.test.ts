// Item-use rules in the setup (simulator Task 1): `RotationConfig.itemUse` / `itemUseOrder` are
// validated by `normalizeSetup` and compiled by `applySetup`; without them (every stored config so
// far) the bot plays exactly as before: logs, means and RNG draw counts captured at c121206.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import type { ItemUseRule } from '../../src/data/classes/warlock/itemUse';
import { deepFreeze } from '../../src/data/common/buffs';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import { Simulation } from '../../src/engine/sim';
import type { SimSnapshot } from '../../src/engine/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, setupCatalogFor } from '../../src/setup/defaults';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { SETUP_PRESETS } from '../../src/setup/presets';
import { loadSetup, saveSetup } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { activePresetName } from '../../src/ui/SetupPanel';
import { applyScenario, botReference, quagBloodgemGear, scenarios, SEEDS, WINDOWS } from '../fixtures/item-use-reference';
import { HEAD_BOTS } from '../fixtures/item-use-reference-data';

const db = itemDbSync();
deepFreeze(db);

/** A scenario with explicit rules added to its rotation. */
function withRules(c: SetupConfig, itemUse: Record<string, ItemUseRule>, itemUseOrder?: string[]): SetupConfig {
  return { ...c, rotation: { ...c.rotation, itemUse, ...(itemUseOrder && { itemUseOrder }) } };
}

describe('item-use setup: the default rules keep every bot log', () => {
  it('bot logs byte-identical to the previous implementation (default, Icon+Band, raid-log, consumables with and without Heroism, a 300 s fight, Quagmirran\'s Eye + Bloodgem): seeds 1-10, windows 400 and 0, log hashes, lengths and RNG draws captured at c121206', { timeout: 60000 }, () => {
    const all = scenarios();
    expect(Object.keys(all).sort()).toEqual(Object.keys(HEAD_BOTS).sort());
    for (const [name, c] of Object.entries(all)) {
      const now = botReference(c, db);
      for (const w of WINDOWS) expect(now[w], `${name} window ${w}`).toEqual(HEAD_BOTS[name]![w]);
    }
  });

  it('golden values stay exact', () => {
    expect(HEAD_BOTS.default![SPELL_QUEUE_WINDOW_MS]!.mean).toBe(1425.1766666666667);
    expect(HEAD_BOTS.default![0]!.mean).toBe(1428.3350000000003);
    expect(HEAD_BOTS.raidLog![SPELL_QUEUE_WINDOW_MS]!.mean).toBe(2294.108333333333);
    expect(HEAD_BOTS.raidLog![0]!.mean).toBe(2294.108333333333);
    expect(HEAD_BOTS.iconBand![SPELL_QUEUE_WINDOW_MS]!.mean).toBe(1379.2966666666666);
    expect(HEAD_BOTS.iconBand![0]!.mean).toBe(1373.4900000000002);
    const raid = botReference(SETUP_PRESETS['raid-log'].config, db);
    expect(raid[SPELL_QUEUE_WINDOW_MS]!.mean).toBe(2294.108333333333);
    expect(raid[0]!.mean).toBe(2294.108333333333);
  });

  it('the default rules spelled out (and an order equal to the default one) give the same logs; normalizeSetup drops rules equal to their default', { timeout: 30000 }, () => {
    const all = scenarios();
    const explicit = withRules(
      all.long300!,
      {
        'destruction-potion': { trigger: { kind: 'with-heroism' } },
        'super-mana-potion': { trigger: { kind: 'mana-missing', amount: 3000 } },
        'dark-rune': { trigger: { kind: 'mana-missing', amount: 1500 } },
        'item:29370': { trigger: { kind: 'with-heroism' } },
      },
      ['destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370'],
    );
    const now = botReference(explicit, db);
    for (const w of WINDOWS) expect(now[w], `window ${w}`).toEqual(HEAD_BOTS.long300![w]);
    const n = normalizeSetup(explicit, SETUP_CATALOG);
    expect(n.rotation.itemUse).toBeUndefined();
    expect(n.rotation.itemUseOrder).toEqual(['destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370']);
    // Without Heroism the burst default is `ready`, which compiles to the same steps.
    const noHeroism = withRules(all.consumablesNoHeroism!, { 'destruction-potion': { trigger: { kind: 'ready' } }, 'item:29370': { trigger: { kind: 'ready' } } });
    const nh = botReference(noHeroism, db);
    for (const w of WINDOWS) expect(nh[w], `no Heroism window ${w}`).toEqual(HEAD_BOTS.consumablesNoHeroism![w]);
  });
});

/** Every press of `spellId` the bot makes, with the snapshot it saw just before and the result. */
function fightRecording(config: SetupConfig, spellId: string, seed: number) {
  const { spec, sim } = applyScenario(config, db);
  const fight = new Simulation({
    spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
    infiniteMana: false,
    distanceFromTarget: sim.distanceFromTarget,
    scheduledAuras: sim.scheduledAuras,
    durationMs: sim.durationMs,
  });
  const presses: { ok: boolean; before: SimSnapshot }[] = [];
  const cast = fight.cast.bind(fight);
  fight.cast = (id: string) => {
    if (id !== spellId) return cast(id);
    const before = fight.snapshot();
    const r = cast(id);
    presses.push({ ok: r.ok, before });
    return r;
  };
  runBot(fight, spec.priority);
  const uses = fight.log().filter((e) => e.type === 'cast-complete' && e.spellId === spellId).map((e) => e.atMs);
  return { presses, uses };
}

describe('item-use setup: configured rules in a fight', () => {
  it('a potion at 30 s: the bot uses Destruction Potion from 30 s, not with Heroism at 6.4 s', () => {
    // Without Super Mana Potion: it shares the potion cooldown and would take it before 30 s.
    const base: SetupConfig = { ...scenarios().consumables!, enabledBuffs: ['heroism', 'destruction-potion', 'dark-rune'] };
    const before = fightRecording(base, 'use-destruction-potion', 1).uses;
    expect(before[0]).toBeLessThan(10000);
    const at30 = withRules(base, { 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } });
    for (const seed of SEEDS) {
      const { uses, presses } = fightRecording(at30, 'use-destruction-potion', seed);
      expect(uses.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(uses[0], `seed ${seed}`).toBeGreaterThanOrEqual(30000);
      expect(uses[0], `seed ${seed}`).toBeLessThan(33000);
      expect(presses.every((p) => p.before.nowMs >= 30000)).toBe(true);
    }
  });

  it("another trinket with-buff: Scryer's Bloodgem only while Quagmirran's Eye's haste proc is up", () => {
    const base = scenarios().quagBloodgem!;
    const rule = withRules(base, { 'item:29132': { trigger: { kind: 'with-buff', auraId: 'item-buff:33370' } } });
    let used = 0;
    for (const seed of SEEDS) {
      const { presses, uses } = fightRecording(rule, 'use-item-29132', seed);
      used += uses.length;
      for (const p of presses) expect(Object.hasOwn(p.before.selfAuras, 'item-buff:33370'), `seed ${seed} at ${p.before.nowMs}`).toBe(true);
    }
    expect(used).toBeGreaterThan(0);
    // The default (with Heroism) uses it at other times.
    const def = fightRecording(base, 'use-item-29132', 1);
    expect(def.presses.some((p) => !Object.hasOwn(p.before.selfAuras, 'item-buff:33370'))).toBe(true);
  });

  it('never: the action keeps its item slot but the bot never presses it; the order list moves a step to the front of the item steps', () => {
    const base = scenarios().consumables!;
    const never = withRules(base, { 'dark-rune': { trigger: { kind: 'never' } } });
    const applied = applyScenario(never, db);
    expect(applied.spec.keybinds).toContain('use-dark-rune');
    expect(applied.spec.priority.map((s) => s.spellId)).not.toContain('use-dark-rune');
    for (const seed of [1, 2, 3]) expect(fightRecording(never, 'use-dark-rune', seed).presses).toEqual([]);
    const ordered = applyScenario(withRules(base, {}, ['dark-rune', 'super-mana-potion']), db);
    expect(ordered.spec.priority.slice(0, 3).map((s) => s.spellId)).toEqual(['use-dark-rune', 'use-super-mana-potion', 'use-destruction-potion']);
    expect(applyScenario(base, db).spec.priority.slice(0, 3).map((s) => s.spellId)).toEqual([
      'use-destruction-potion',
      'use-super-mana-potion',
      'use-dark-rune',
    ]);
  });

  it('rules of items not worn or not enabled are ignored at apply time (kept in the config)', () => {
    const base = scenarios().consumables!;
    const c = withRules(base, { 'item:29132': { trigger: { kind: 'pull' } }, 'item:29370': { trigger: { kind: 'never' } } });
    expect(applyScenario(c, db).spec.priority.map((s) => s.spellId)).toEqual(applyScenario(base, db).spec.priority.map((s) => s.spellId));
    expect(normalizeSetup(c, SETUP_CATALOG).rotation.itemUse).toEqual({ 'item:29132': { trigger: { kind: 'pull' } }, 'item:29370': { trigger: { kind: 'never' } } });
  });
});

describe('item-use setup: normalizeSetup', () => {
  it('a config without itemUse stays without it (not written back): the default setup, the presets, a stored stage 1.5 config', () => {
    expect(Object.hasOwn(normalizeSetup(DEFAULT_SETUP, SETUP_CATALOG).rotation, 'itemUse')).toBe(false);
    expect(Object.hasOwn(normalizeSetup(DEFAULT_SETUP, SETUP_CATALOG).rotation, 'itemUseOrder')).toBe(false);
    for (const p of Object.values(SETUP_PRESETS)) expect(normalizeSetup(p.config, SETUP_CATALOG)).toEqual(p.config);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(saveSetup(storage, SETUP_PRESETS['raid-log'].config)).toBe(true);
    expect(store.values().next().value).not.toContain('itemUse');
    expect(Object.hasOwn(loadSetup(storage, SETUP_CATALOG).rotation, 'itemUse')).toBe(false);
    // A stored config with rules keeps them through save and load.
    const ruled = withRules(structuredClone(DEFAULT_SETUP), { 'dark-rune': { trigger: { kind: 'pull' } } }, ['dark-rune']);
    expect(saveSetup(storage, ruled)).toBe(true);
    expect(loadSetup(storage, SETUP_CATALOG).rotation).toEqual(ruled.rotation);
  });

  it('hostile itemUse (proto keys, huge lists, wrong kinds, NaN) never throws and is idempotent; stale ids dropped', () => {
    const huge: Record<string, unknown> = {};
    for (let i = 1; i <= 2000; i++) huge[`item:${i}`] = { trigger: { kind: 'at', sec: i } };
    const rotations: unknown[] = [
      { itemUse: JSON.parse('{"__proto__": {"trigger": {"kind": "never"}}, "constructor": {"trigger": {"kind": "never"}}}') },
      { itemUse: huge, itemUseOrder: Array.from({ length: 100000 }, (_, i) => `item:${i + 1}`) },
      { itemUse: { 'dark-rune': { trigger: { kind: 'mana-below', mana: NaN } }, 'super-mana-potion': { trigger: { kind: 'rm -rf' } } } },
      // Stale or wrong ids: not item actions of the catalog, not gear effect ids, a spell id.
      { itemUse: { heroism: { trigger: { kind: 'ready' } }, 'flask-of-pure-death': { trigger: { kind: 'ready' } }, 'item:abc': { trigger: { kind: 'ready' } }, 'use-dark-rune': { trigger: { kind: 'ready' } }, 'dark-rune': { trigger: { kind: 'pull' } } }, itemUseOrder: ['heroism', 'dark-rune', 'dark-rune', 'item:0'] },
      { itemUse: 'x', itemUseOrder: { 0: 'dark-rune' } },
      { itemUse: [{ trigger: { kind: 'ready' } }], itemUseOrder: null },
      { itemUse: new Proxy({}, { ownKeys: () => { throw new Error('boom'); } }) },
    ];
    for (const rotation of rotations) {
      const input = { ...structuredClone(DEFAULT_SETUP), rotation: { ...DEFAULT_SETUP.rotation, ...(rotation as object) } };
      const once = normalizeSetup(input, SETUP_CATALOG);
      expect(normalizeSetup(once, SETUP_CATALOG)).toEqual(once);
      expect(Object.keys(once.rotation.itemUse ?? {}).length).toBeLessThanOrEqual(32);
      expect((once.rotation.itemUseOrder ?? []).length).toBeLessThanOrEqual(32);
      expect(JSON.parse(JSON.stringify(once))).toEqual(once);
      // Usable: applySetup does not throw on it.
      expect(() => applyScenario(once, db)).not.toThrow();
    }
    const stale = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), rotation: { ...DEFAULT_SETUP.rotation, ...(rotations[3] as object) } }, SETUP_CATALOG);
    expect(stale.rotation.itemUse).toEqual({ 'dark-rune': { trigger: { kind: 'pull' } } });
    expect(stale.rotation.itemUseOrder).toEqual(['dark-rune']);
    const first = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), rotation: { ...DEFAULT_SETUP.rotation, ...(rotations[0] as object) } }, SETUP_CATALOG);
    expect(first.rotation.itemUse).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('trigger');
  });

  it('the setup identity (preset matching): rules equal to the defaults match the preset, other rules (and an order) make it Custom', () => {
    const catalog = setupCatalogFor(DEFAULT_GEAR, db);
    const raid = structuredClone(SETUP_PRESETS['raid-log'].config) as SetupConfig;
    const name = (c: SetupConfig) => activePresetName(c, SETUP_PRESETS, catalog);
    expect(name(raid)).toBe('Raid as in my log');
    expect(name(withRules(raid, { 'destruction-potion': { trigger: { kind: 'with-heroism' } }, 'item:29370': { trigger: { kind: 'with-heroism' } } }))).toBe('Raid as in my log');
    expect(name(withRules(raid, { 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } }))).toBe('Custom');
    expect(name(withRules(raid, {}, ['item:29370']))).toBe('Custom');
    expect(name(withRules(structuredClone(DEFAULT_SETUP), { 'dark-rune': { trigger: { kind: 'mana-missing', amount: 1500 } } }))).toBe('None');
    expect(name(withRules(structuredClone(DEFAULT_SETUP), { 'dark-rune': { trigger: { kind: 'mana-missing', amount: 1000 } } }))).toBe('Custom');
  });
});
