// Combat text HUD model (scrolling combat text Task 1): settings, event extraction from the
// combat log and the snapshot, text formatting, merging and throttling. Pure code (no React, no
// DOM); the file lives in tests/ui as the plan names it, so it runs in the jsdom project.

import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import { deepFreeze } from '../../src/data/common/buffs';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, LogEvent, LogType, SimSnapshot } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, setupCatalogFor } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { SCHOOL_COLORS } from '../../src/ui/format';
import {
  buildHudContext,
  extractHudEvents,
  HUD_LOG_DECISIONS,
  HUD_READY_MIN_COOLDOWN_MS,
  initialHudCursor,
  type HudContext,
  type HudCursor,
  type HudEvent,
  type HudKind,
} from '../../src/ui/hudEvents';
import { formatHudText, HUD_COLORS, hudTextStyle } from '../../src/ui/hudFormat';
import { HUD_LANES, HudQueue, MANA_MERGE_WINDOW_MS } from '../../src/ui/hudQueue';
import {
  DEFAULT_HUD_SETTINGS,
  HUD_STORAGE_KEY,
  HUD_STORAGE_MAX_CHARS,
  loadHudSettings,
  normalizeHudSettings,
  saveHudSettings,
  type HudSettings,
  type HudStorage,
} from '../../src/ui/hudSettings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const db: ItemDb = itemDbSync();

/** DEFAULT_SETUP with the given buffs enabled (and other changes). */
function config(enabledBuffs: string[], p: Partial<SetupConfig> = {}): SetupConfig {
  return deepFreeze({ ...structuredClone(DEFAULT_SETUP), enabledBuffs, ...p });
}

function applied(c: SetupConfig, gear?: (EquippedItem | null)[]) {
  const cfg = gear ? { ...c, gear } : c;
  return applySetup({
    buildSpec: (w, g) => buildDestructionWarlock(w, g ?? destructionEquipped, db),
    catalog: setupCatalogFor(gear ?? destructionEquipped, db),
    config: cfg,
    db,
  });
}

/** Everything a fight can show: Heroism at 0, raid debuffs, the author's Icon and Band, potions and the rune. */
const FULL = config([
  'heroism',
  'misery',
  'judgement-of-wisdom',
  'destruction-potion',
  'super-mana-potion',
  'dark-rune',
  'item:29370', // Icon of the Silver Crescent (on use)
  'item:29305', // Band of the Eternal Sage (proc)
]);
const fullApplied = applied(FULL);
const ctxFull: HudContext = buildHudContext({
  spells: fullApplied.spec.spells,
  auras: fullApplied.spec.auras,
  scheduledAuras: fullApplied.sim.scheduledAuras,
  catalog: setupCatalogFor(destructionEquipped, db),
});

const S = DEFAULT_HUD_SETTINGS;
const settings = (p: Partial<HudSettings> = {}): HudSettings => ({ ...DEFAULT_HUD_SETTINGS, ...p });

function snap(p: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    nowMs: 0,
    phase: 'running',
    durationMs: 60000,
    gcdEndsAtMs: 0,
    cast: null,
    mana: 10000,
    maxMana: 10000,
    cooldownRemainingMs: {},
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

/** One extraction from a fresh cursor (snapshot at the last entry's time). */
function extract(log: LogEvent[], p: { s?: HudSettings; ctx?: HudContext; snapshot?: Partial<SimSnapshot> } = {}) {
  const nowMs = log.length > 0 ? log[log.length - 1]!.atMs : 0;
  return extractHudEvents(initialHudCursor(), log, snap({ nowMs, ...p.snapshot }), p.ctx ?? ctxFull, p.s ?? S);
}

const kinds = (events: readonly HudEvent[]) => events.map((e) => e.kind);
const texts = (events: readonly HudEvent[]) => events.map((e) => e.text);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe('HUD settings', () => {
  it('defaults: everything on except target debuffs, straight animation, 1600 ms, documented numbers', () => {
    expect(DEFAULT_HUD_SETTINGS).toEqual({
      enabled: true,
      damage: true,
      crits: true,
      ticks: true,
      misses: true,
      buffsOn: true,
      buffsOff: true,
      procs: true,
      targetDebuffs: false,
      mana: true,
      itemUse: true,
      cooldownReady: true,
      lowMana: true,
      animation: 'straight',
      durationMs: 1600,
      fontPx: 16,
      critScale: 1.5,
      showIcons: true,
      showSpellNames: false,
      minDamage: 0,
      mergeTicks: 250,
      mergeManaBelow: 100,
      maxTexts: 24,
      lowManaPct: 20,
    });
    expect(Object.isFrozen(DEFAULT_HUD_SETTINGS)).toBe(true);
    expect(normalizeHudSettings(undefined)).toEqual(DEFAULT_HUD_SETTINGS);
    expect(normalizeHudSettings(DEFAULT_HUD_SETTINGS)).not.toBe(DEFAULT_HUD_SETTINGS);
  });

  it('clamping of every numeric field (and rounding of the integer ones)', () => {
    const low = normalizeHudSettings({
      durationMs: 1,
      fontPx: 1,
      critScale: 0,
      minDamage: -5,
      mergeTicks: -1,
      mergeManaBelow: -1,
      maxTexts: 0,
      lowManaPct: 0,
    });
    expect(low).toMatchObject({ durationMs: 600, fontPx: 10, critScale: 1, minDamage: 0, mergeTicks: 0, mergeManaBelow: 0, maxTexts: 4, lowManaPct: 5 });
    const high = normalizeHudSettings({
      durationMs: 1e9,
      fontPx: 99,
      critScale: 9,
      minDamage: 1e9,
      mergeTicks: 1e9,
      mergeManaBelow: 1e9,
      maxTexts: 1e9,
      lowManaPct: 100,
    });
    expect(high).toMatchObject({
      durationMs: 4000,
      fontPx: 32,
      critScale: 2.5,
      minDamage: 100000,
      mergeTicks: 2000,
      mergeManaBelow: 10000,
      maxTexts: 60,
      lowManaPct: 80,
    });
    expect(normalizeHudSettings({ durationMs: 1234.6, fontPx: 12.4, maxTexts: 10.5, critScale: 1.234 })).toMatchObject({
      durationMs: 1235,
      fontPx: 12,
      maxTexts: 11,
      critScale: 1.23,
    });
  });

  it('NaN, strings, null, arrays and wrong types give the defaults, field by field', () => {
    for (const bad of [null, 'x', 42, [], [1, 2], true, () => 1]) expect(normalizeHudSettings(bad)).toEqual(DEFAULT_HUD_SETTINGS);
    const out = normalizeHudSettings({
      enabled: 'false',
      damage: 0,
      crits: null,
      animation: 'spin',
      durationMs: NaN,
      fontPx: '20',
      critScale: Infinity,
      minDamage: [5],
      maxTexts: null,
      lowManaPct: {},
      showSpellNames: true,
      targetDebuffs: true,
    });
    expect(out).toEqual({ ...DEFAULT_HUD_SETTINGS, showSpellNames: true, targetDebuffs: true });
    expect(normalizeHudSettings({ animation: 'parabola' }).animation).toBe('parabola');
    expect(normalizeHudSettings({ enabled: false, procs: false }).enabled).toBe(false);
  });

  it('prototype pollution is inert: inherited and __proto__ fields are ignored, nothing global changes', () => {
    const hostile = JSON.parse('{"__proto__": {"enabled": false, "polluted": true}, "constructor": {"prototype": {"polluted": true}}}');
    const out = normalizeHudSettings(hostile);
    expect(out).toEqual(DEFAULT_HUD_SETTINGS);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const inherited = Object.create({ enabled: false, fontPx: 30 });
    expect(normalizeHudSettings(inherited)).toEqual(DEFAULT_HUD_SETTINGS);
    expect(Object.keys(normalizeHudSettings({ extra: 1, __proto__: 1 }))).toEqual(Object.keys(DEFAULT_HUD_SETTINGS));
  });

  function memStorage(init: Record<string, string> = {}): HudStorage & { data: Map<string, string> } {
    const data = new Map(Object.entries(init));
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it('storage round trip under rotation-trainer:hud:v1 (saved normalized)', () => {
    expect(HUD_STORAGE_KEY).toBe('rotation-trainer:hud:v1');
    const st = memStorage();
    const mine = settings({ animation: 'parabola', fontPx: 20, procs: false, maxTexts: 12 });
    expect(saveHudSettings(st, mine)).toBe(true);
    expect([...st.data.keys()]).toEqual([HUD_STORAGE_KEY]);
    expect(loadHudSettings(st)).toEqual(mine);
    expect(saveHudSettings(st, { ...mine, fontPx: 999 })).toBe(true);
    expect(loadHudSettings(st).fontPx).toBe(32);
    expect(loadHudSettings(memStorage())).toEqual(DEFAULT_HUD_SETTINGS);
    expect(loadHudSettings(null)).toEqual(DEFAULT_HUD_SETTINGS);
    expect(saveHudSettings(null, mine)).toBe(false);
  });

  it('corrupt JSON and deep nesting give the defaults', () => {
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_HUD_SETTINGS);
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: '[' .repeat(4000) }))).toEqual(DEFAULT_HUD_SETTINGS);
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: '"text"' }))).toEqual(DEFAULT_HUD_SETTINGS);
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: '{"fontPx": 20, "maxTexts": "x"}' }))).toEqual(settings({ fontPx: 20 }));
  });

  it('oversize text (over 10 000 characters) is ignored without parsing', () => {
    expect(HUD_STORAGE_MAX_CHARS).toBe(10_000);
    const big = JSON.stringify({ fontPx: 20, pad: 'x'.repeat(HUD_STORAGE_MAX_CHARS) });
    expect(big.length).toBeGreaterThan(HUD_STORAGE_MAX_CHARS);
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: big }))).toEqual(DEFAULT_HUD_SETTINGS);
    const fits = JSON.stringify({ fontPx: 20, pad: 'x'.repeat(100) });
    expect(loadHudSettings(memStorage({ [HUD_STORAGE_KEY]: fits })).fontPx).toBe(20);
  });

  it('a throwing storage never throws: load gives the defaults, save returns false', () => {
    const boom: HudStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadHudSettings(boom)).toEqual(DEFAULT_HUD_SETTINGS);
    expect(saveHudSettings(boom, DEFAULT_HUD_SETTINGS)).toBe(false);
    const nonString = { getItem: () => 42 as unknown as string, setItem: () => undefined } satisfies HudStorage;
    expect(loadHudSettings(nonString)).toEqual(DEFAULT_HUD_SETTINGS);
  });
});

// ---------------------------------------------------------------------------
// Context: proc auras, units, permanent auras, cooldown-ready set
// ---------------------------------------------------------------------------

describe('HUD context', () => {
  it('the real warlock spec: hook-applied self auras are procs, item-use and scheduled buffs are not, target auras are target', () => {
    const a = (id: string) => ctxFull.auras.get(id)!;
    // Band of the Eternal Sage: a gear proc (applied by its hook).
    expect(a('item-buff:35084')).toMatchObject({ name: 'Band of the Eternal Sage', unit: 'self', proc: true, iconKind: 'item' });
    // Every hidden aura of the spec stays hidden in the context.
    for (const aura of fullApplied.spec.auras) {
      const info = ctxFull.auras.get(aura.id)!;
      if (aura.hidden) expect(info.hidden).toBe(true);
    }
    // The Icon's buff: applied by its item action -> a buff, not a proc.
    expect(a('item-buff:35163')).toMatchObject({ unit: 'self', proc: false });
    expect(a('destruction-potion')).toMatchObject({ unit: 'self', proc: false, iconKind: 'spell' });
    // Heroism: timed, scheduled with its duration -> shown at 0.
    expect(a('heroism')).toMatchObject({ unit: 'self', proc: false, permanentAtStart: false });
    // Raid debuffs: scheduled on the target at 0 for the whole fight.
    expect(a('misery')).toMatchObject({ unit: 'target', permanentAtStart: true });
    expect(a('judgement-of-wisdom')).toMatchObject({ unit: 'target', permanentAtStart: true });
    // The player's own target auras: DoTs (spells) and Shadow Vulnerability (hook, damageTakenMult).
    expect(a('immolate')).toMatchObject({ unit: 'target', proc: false, color: SCHOOL_COLORS.fire });
    expect(a('shadow-vulnerability')).toMatchObject({ unit: 'target', proc: false });
    // The Band's internal cooldown is hidden.
    expect(a('item-icd:29305')).toMatchObject({ hidden: true });
  });

  it("a spec with Quagmirran's Eye worn: its buff is a proc, its ICD hidden", () => {
    const gear = structuredClone(destructionEquipped) as (EquippedItem | null)[];
    gear[13] = { id: 27683 }; // trinket 2 (slot 13): Quagmirran's Eye in place of the Icon
    const c = config(['item:27683']);
    const ap = applied(c, gear);
    const ctx = buildHudContext({ spells: ap.spec.spells, auras: ap.spec.auras, scheduledAuras: ap.sim.scheduledAuras });
    const procs = [...ctx.auras.entries()].filter(([, v]) => v.proc).map(([k]) => k);
    expect(procs).toContain('item-buff:33370');
    expect(ctx.auras.get('item-buff:33370')).toMatchObject({ name: 'Spell Haste', unit: 'self', proc: true, iconKind: 'item' });
    expect(ctx.auras.get('item-icd:27683')).toMatchObject({ hidden: true });
    // No aura applied by a spell or scheduled is ever a proc.
    for (const id of procs) {
      expect(ap.spec.spells.some((s) => s.applyAura?.auraId === id)).toBe(false);
      expect(ap.sim.scheduledAuras.some((s) => s.auraId === id)).toBe(false);
    }
  });

  it('cooldown-ready set: item actions and spells with a cooldown of at least 30 s (Curse of Doom), not Shadowburn or Conflagrate', () => {
    expect(HUD_READY_MIN_COOLDOWN_MS).toBe(30000);
    expect([...ctxFull.readyIds].sort()).toEqual(
      ['curse-of-doom', 'use-dark-rune', 'use-destruction-potion', 'use-item-29370', 'use-super-mana-potion'].sort(),
    );
    expect(ctxFull.spells.get('use-item-29370')).toMatchObject({ item: true, iconKind: 'item' });
    expect(ctxFull.spells.get('shadow-bolt')).toMatchObject({ item: false, color: SCHOOL_COLORS.shadow, iconKind: 'spell' });
  });
});

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

describe('HUD event extraction', () => {
  it('a damage entry becomes an outgoing event with the school colour, the icon and (when enabled) the spell name', () => {
    const log: LogEvent[] = [{ atMs: 2500, type: 'damage', spellId: 'shadow-bolt', amount: 3141, crit: false }];
    const [e] = extract(log).events;
    expect(e).toMatchObject({ atMs: 2500, area: 'outgoing', kind: 'damage', text: '3,141', color: SCHOOL_COLORS.shadow, sticky: false, icon: 'spell_shadow_shadowbolt', amount: 3141 });
    expect(extract(log, { s: settings({ showSpellNames: true }) }).events[0]!.text).toBe('Shadow Bolt 3,141');
    expect(extract([{ atMs: 1, type: 'damage', spellId: 'incinerate', amount: 2000, crit: false }]).events[0]!.color).toBe(SCHOOL_COLORS.fire);
  });

  it("a crit is sticky with the '!' form", () => {
    const [e] = extract([{ atMs: 100, type: 'damage', spellId: 'shadow-bolt', amount: 4712, crit: true }]).events;
    expect(e).toMatchObject({ kind: 'crit', text: '4,712!', sticky: true, area: 'outgoing' });
  });

  it('a miss', () => {
    const [e] = extract([{ atMs: 100, type: 'miss', spellId: 'shadow-bolt' }]).events;
    expect(e).toMatchObject({ kind: 'miss', text: 'Miss', area: 'outgoing', sticky: false });
  });

  it('a DoT tick: the DoT school colour, merge key per spell', () => {
    const [e] = extract([{ atMs: 3000, type: 'tick', spellId: 'immolate', auraId: 'immolate', amount: 160 }]).events;
    expect(e).toMatchObject({ kind: 'tick', text: '160', color: SCHOOL_COLORS.fire, key: 'tick:immolate', area: 'outgoing' });
  });

  it("aura-apply/aura-fade of a visible aura give '+'/'-' notifications in order", () => {
    const log: LogEvent[] = [
      { atMs: 6000, type: 'aura-apply', auraId: 'heroism' },
      { atMs: 7000, type: 'cast-complete', spellId: 'use-destruction-potion' },
      { atMs: 7000, type: 'aura-apply', spellId: 'use-destruction-potion', auraId: 'destruction-potion' },
      { atMs: 22000, type: 'aura-fade', auraId: 'destruction-potion' },
      { atMs: 46000, type: 'aura-fade', auraId: 'heroism' },
    ];
    const { events } = extract(log);
    expect(texts(events)).toEqual(['+Heroism', 'Destruction Potion', '+Destruction Potion', '-Destruction Potion', '-Heroism']);
    expect(kinds(events)).toEqual(['buff-on', 'item', 'buff-on', 'buff-off', 'buff-off']);
    expect(events.every((e) => e.area === 'notifications')).toBe(true);
    expect(events[0]!.color).toBe(HUD_COLORS['buff-on']);
    expect(events[3]!.color).toBe(HUD_COLORS['buff-off']);
    expect(events.map((e) => e.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a hidden aura never shows', () => {
    const log: LogEvent[] = [
      { atMs: 100, type: 'aura-apply', spellId: 'shadow-bolt', auraId: 'item-icd:29305' },
      { atMs: 60100, type: 'aura-fade', auraId: 'item-icd:29305' },
    ];
    expect(extract(log, { s: settings({ targetDebuffs: true }) }).events).toEqual([]);
  });

  it('an aura applied at 0 ms (Heroism at 0) shows; whole-fight raid debuffs at 0 never do, even with target debuffs on', () => {
    const log: LogEvent[] = [
      { atMs: 0, type: 'aura-apply', auraId: 'misery' },
      { atMs: 0, type: 'aura-apply', auraId: 'judgement-of-wisdom' },
      { atMs: 0, type: 'aura-apply', auraId: 'heroism' },
    ];
    expect(texts(extract(log, { s: settings({ targetDebuffs: true }) }).events)).toEqual(['+Heroism']);
  });

  it('in a real fight: Heroism at 0 shows at 0, the raid debuffs and the mana regen ticks never show', () => {
    const sim = new Simulation({
      spec: fullApplied.spec,
      target: BOSS_TARGET,
      seed: 3,
      durationMs: 60000,
      scheduledAuras: fullApplied.sim.scheduledAuras,
      distanceFromTarget: 0,
    });
    sim.start();
    // Shadow Bolts for 10 s (mana spent), one Life Tap, then idle: spirit regen ticks follow.
    for (let t = 0; t < 10000; t += 100) {
      sim.cast('shadow-bolt');
      sim.advanceTo(t);
    }
    sim.advanceTo(12000);
    sim.cast('life-tap');
    sim.advanceTo(45000);
    const log = sim.log();
    expect(log.some((e) => e.type === 'aura-apply' && e.auraId === 'misery' && e.atMs === 0)).toBe(true);
    expect(log.some((e) => e.type === 'mana' && e.spellId === undefined)).toBe(true); // regen ticks exist
    const { events } = extractHudEvents(initialHudCursor(), log, sim.snapshot(), ctxFull, settings({ targetDebuffs: true }));
    expect(events[0]).toMatchObject({ atMs: 0, text: '+Heroism', kind: 'buff-on' });
    expect(events.some((e) => e.text.includes('Misery') || e.text.includes('Judgement'))).toBe(false);
    // Only spells give mana texts: Life Tap and Judgement of Wisdom procs (from the Shadow Bolts).
    const mana = events.filter((e) => e.kind === 'mana');
    expect(mana.some((e) => e.name === 'Life Tap')).toBe(true);
    expect(mana.every((e) => e.name === 'Life Tap' || (e.name === 'Shadow Bolt' && e.amount === 74))).toBe(true);
    expect(mana.length).toBe(log.filter((e) => e.type === 'mana' && e.spellId !== undefined).length);
    expect(events.some((e) => e.text === '-Heroism' && e.atMs === 40000)).toBe(true);
  });

  it('a proc aura (Band buff, a set proc, a gear proc) is a gold proc notification with "!"', () => {
    const [e] = extract([{ atMs: 2500, type: 'aura-apply', spellId: 'shadow-bolt', auraId: 'item-buff:35084' }]).events;
    expect(e).toMatchObject({ kind: 'proc', text: 'Band of the Eternal Sage!', color: HUD_COLORS.proc, sticky: true, area: 'notifications', iconKind: 'item' });
    const set = buildHudContext({
      spells: buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: true }).spells,
      auras: [{ id: 'voidheart-flameshadow', name: 'Flameshadow', icon: 'x', durationMs: 15000, selfStatBonuses: { shadowPower: 135 } }],
    });
    const [p] = extract([{ atMs: 1, type: 'aura-apply', spellId: 'shadow-bolt', auraId: 'voidheart-flameshadow' }], { ctx: set }).events;
    expect(p).toMatchObject({ kind: 'proc', text: 'Flameshadow!' });
    // Its fade is an ordinary buff-off.
    const [f] = extract([{ atMs: 20000, type: 'aura-fade', auraId: 'item-buff:35084' }]).events;
    expect(f).toMatchObject({ kind: 'buff-off', text: '-Band of the Eternal Sage' });
  });

  it('a target debuff shows only with the setting', () => {
    const log: LogEvent[] = [
      { atMs: 1000, type: 'aura-apply', spellId: 'shadow-bolt', auraId: 'shadow-vulnerability' },
      { atMs: 2000, type: 'aura-apply', spellId: 'curse-of-agony', auraId: 'curse-of-agony' },
      { atMs: 13000, type: 'aura-fade', auraId: 'shadow-vulnerability' },
    ];
    expect(extract(log).events).toEqual([]);
    const { events } = extract(log, { s: settings({ targetDebuffs: true }) });
    expect(kinds(events)).toEqual(['debuff-on', 'debuff-on', 'debuff-off']);
    expect(texts(events)).toEqual(['+Shadow Vulnerability', '+Curse of Agony', '-Shadow Vulnerability']);
  });

  it("mana entries become '+N Mana' with the spell as source (Life Tap, Judgement of Wisdom 74, the rune); regen ticks never", () => {
    const log: LogEvent[] = [
      { atMs: 1000, type: 'mana', spellId: 'life-tap', amount: 1622 },
      { atMs: 2000, type: 'mana', amount: 30 }, // regen tick
      { atMs: 3000, type: 'mana', spellId: 'shadow-bolt', amount: 74 }, // Judgement of Wisdom (hook)
      { atMs: 4000, type: 'cast-complete', spellId: 'use-dark-rune' },
      { atMs: 4000, type: 'mana', spellId: 'use-dark-rune', amount: 1203 },
    ];
    const { events } = extract(log);
    const mana = events.filter((e) => e.kind === 'mana');
    expect(texts(mana)).toEqual(['+1,622 Mana', '+74 Mana', '+1,203 Mana']);
    expect(mana.map((e) => e.name)).toEqual(['Life Tap', 'Shadow Bolt', 'Dark Rune']);
    expect(mana.every((e) => e.color === HUD_COLORS.mana && e.area === 'notifications' && e.key === 'mana')).toBe(true);
  });

  it("item use ('cast-complete' of an item action) gives the item notification; other casts do not", () => {
    const log: LogEvent[] = [
      { atMs: 0, type: 'cast-start', spellId: 'shadow-bolt' },
      { atMs: 2500, type: 'cast-complete', spellId: 'shadow-bolt' },
      { atMs: 2600, type: 'cast-complete', spellId: 'use-item-29370' },
    ];
    const { events } = extract(log);
    expect(events).toHaveLength(1);
    const icon = fullApplied.spec.spells.find((s) => s.id === 'use-item-29370')!.icon;
    expect(events[0]).toMatchObject({ kind: 'item', text: 'Icon of the Silver Crescent', icon, iconKind: 'item', area: 'notifications', sticky: false });
  });

  it('cooldown ready: once when a tracked cooldown goes from >0 to 0, never at fight start for cooldowns at 0, never for untracked spells', () => {
    let cursor = initialHudCursor();
    const step = (nowMs: number, cds: Record<string, number>) => {
      const r = extractHudEvents(cursor, [], snap({ nowMs, cooldownRemainingMs: cds }), ctxFull, S);
      cursor = r.cursor;
      return r.events;
    };
    expect(step(0, { 'use-destruction-potion': 0, 'curse-of-doom': 0, shadowburn: 0 })).toEqual([]);
    expect(step(1000, { 'use-destruction-potion': 119000, 'curse-of-doom': 0, shadowburn: 15000 })).toEqual([]);
    expect(step(60000, { 'use-destruction-potion': 60000, 'curse-of-doom': 0, shadowburn: 0 })).toEqual([]);
    const ready = step(121000, { 'use-destruction-potion': 0, 'curse-of-doom': 0, shadowburn: 0 });
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ kind: 'ready', text: 'Destruction Potion ready', area: 'notifications', atMs: 121000 });
    expect(step(122000, { 'use-destruction-potion': 0 })).toEqual([]);
    // A prototype-named id in the snapshot is ignored safely.
    expect(step(123000, JSON.parse('{"__proto__": 5, "constructor": 1}'))).toEqual([]);
  });

  it('cooldown ready and low mana never fire outside a running fight', () => {
    const c1 = extractHudEvents(initialHudCursor(), [], snap({ nowMs: 1000, cooldownRemainingMs: { 'curse-of-doom': 500 } }), ctxFull, S).cursor;
    const ended = extractHudEvents(c1, [], snap({ nowMs: 2000, phase: 'ended', mana: 0, cooldownRemainingMs: { 'curse-of-doom': 0 } }), ctxFull, S);
    expect(ended.events).toEqual([]);
  });

  it('the low mana latch fires once per crossing and re-arms after recovery (5 points above the threshold)', () => {
    let cursor = initialHudCursor();
    const at = (nowMs: number, mana: number) => {
      const r = extractHudEvents(cursor, [], snap({ nowMs, mana, maxMana: 10000 }), ctxFull, S);
      cursor = r.cursor;
      return r.events.map((e) => e.text);
    };
    expect(at(0, 10000)).toEqual([]);
    expect(at(1000, 2100)).toEqual([]);
    expect(at(2000, 1900)).toEqual(['Low Mana']);
    expect(at(3000, 1500)).toEqual([]);
    expect(at(4000, 2200)).toEqual([]); // above 20 % but not re-armed yet (below 25 %)
    expect(at(5000, 1900)).toEqual([]);
    expect(at(6000, 2500)).toEqual([]); // re-armed at 25 %
    expect(at(7000, 1999)).toEqual(['Low Mana']);
  });

  it('settings categories each disable exactly their events', () => {
    const log: LogEvent[] = [
      { atMs: 1, type: 'damage', spellId: 'shadow-bolt', amount: 3000, crit: false },
      { atMs: 2, type: 'damage', spellId: 'shadow-bolt', amount: 4500, crit: true },
      { atMs: 3, type: 'tick', spellId: 'corruption', auraId: 'corruption', amount: 150 },
      { atMs: 4, type: 'miss', spellId: 'shadow-bolt' },
      { atMs: 5, type: 'aura-apply', spellId: 'use-destruction-potion', auraId: 'destruction-potion' },
      { atMs: 6, type: 'aura-fade', auraId: 'destruction-potion' },
      { atMs: 7, type: 'aura-apply', spellId: 'shadow-bolt', auraId: 'item-buff:35084' },
      { atMs: 8, type: 'aura-apply', spellId: 'curse-of-agony', auraId: 'curse-of-agony' },
      { atMs: 9, type: 'mana', spellId: 'life-tap', amount: 1600 },
      { atMs: 10, type: 'cast-complete', spellId: 'use-dark-rune' },
    ];
    const mk = (nowMs: number) => snap({ nowMs, mana: 100, maxMana: 10000, cooldownRemainingMs: { 'curse-of-doom': 0 } });
    const run = (s: HudSettings) => {
      const c0 = extractHudEvents(initialHudCursor(), [], snap({ nowMs: 0, cooldownRemainingMs: { 'curse-of-doom': 5 } }), ctxFull, s).cursor;
      return kinds(extractHudEvents(c0, log, mk(10), ctxFull, s).events);
    };
    const all: HudKind[] = ['damage', 'crit', 'tick', 'miss', 'buff-on', 'buff-off', 'proc', 'debuff-on', 'mana', 'item', 'ready', 'low-mana'];
    expect(new Set(run(settings({ targetDebuffs: true })))).toEqual(new Set(all));
    const byCategory: [keyof HudSettings, HudKind[]][] = [
      ['damage', ['damage']],
      ['crits', ['crit']],
      ['ticks', ['tick']],
      ['misses', ['miss']],
      ['buffsOn', ['buff-on']],
      ['buffsOff', ['buff-off']],
      ['procs', ['proc']],
      ['targetDebuffs', ['debuff-on']],
      ['mana', ['mana']],
      ['itemUse', ['item']],
      ['cooldownReady', ['ready']],
      ['lowMana', ['low-mana']],
    ];
    for (const [key, gone] of byCategory) {
      const got = new Set(run(settings({ targetDebuffs: true, [key]: false })));
      expect(got, key).toEqual(new Set(all.filter((k) => !gone.includes(k))));
    }
    expect(run(settings({ enabled: false }))).toEqual([]);
  });

  it('minDamage filters direct hits, crits and ticks below it', () => {
    const log: LogEvent[] = [
      { atMs: 1, type: 'damage', spellId: 'shadow-bolt', amount: 999, crit: false },
      { atMs: 2, type: 'damage', spellId: 'shadow-bolt', amount: 1000, crit: false },
      { atMs: 3, type: 'damage', spellId: 'shadow-bolt', amount: 500, crit: true },
      { atMs: 4, type: 'tick', spellId: 'corruption', auraId: 'corruption', amount: 150 },
      { atMs: 5, type: 'miss', spellId: 'shadow-bolt' },
    ];
    expect(texts(extract(log, { s: settings({ minDamage: 1000 }) }).events)).toEqual(['1,000', 'Miss']);
  });

  it('impact, cast-start, cast-cancel, queue and queue-drop entries are skipped', () => {
    const log: LogEvent[] = [
      { atMs: 1, type: 'impact', spellId: 'shadow-bolt' },
      { atMs: 2, type: 'cast-start', spellId: 'shadow-bolt' },
      { atMs: 3, type: 'cast-cancel', spellId: 'shadow-bolt' },
      { atMs: 4, type: 'queue', spellId: 'shadow-bolt' },
      { atMs: 5, type: 'queue-drop', spellId: 'shadow-bolt', reason: 'replaced' },
    ];
    expect(extract(log).events).toEqual([]);
    expect(extract(log).cursor.index).toBe(5);
  });

  it('unknown spell and aura ids and malformed entries are skipped, never thrown on', () => {
    const log = [
      { atMs: 1, type: 'damage', spellId: 'nope', amount: 5, crit: false },
      { atMs: 2, type: 'aura-apply', auraId: 'nope' },
      { atMs: 3, type: 'damage', spellId: '__proto__', amount: 5 },
      { atMs: 4, type: 'damage', spellId: 'shadow-bolt', amount: NaN },
      { atMs: 5, type: 'mana', spellId: 'life-tap', amount: -3 },
      { atMs: 6, type: 'weird' },
    ] as LogEvent[];
    expect(extract(log).events).toEqual([]);
  });

  it('the cursor never reprocesses an entry; a new fight (log shorter than the cursor, or time going back) resets', () => {
    const log: LogEvent[] = [
      { atMs: 100, type: 'damage', spellId: 'shadow-bolt', amount: 3000, crit: false },
      { atMs: 200, type: 'damage', spellId: 'shadow-bolt', amount: 3100, crit: false },
    ];
    const a = extractHudEvents(initialHudCursor(), log, snap({ nowMs: 200 }), ctxFull, S);
    expect(a.events).toHaveLength(2);
    const b = extractHudEvents(a.cursor, log, snap({ nowMs: 200 }), ctxFull, S);
    expect(b.events).toEqual([]);
    const more = [...log, { atMs: 300, type: 'miss', spellId: 'shadow-bolt' } as LogEvent];
    const c = extractHudEvents(b.cursor, more, snap({ nowMs: 300 }), ctxFull, S);
    expect(texts(c.events)).toEqual(['Miss']);
    expect(c.events[0]!.id).toBe(2);
    // New fight: a shorter log restarts from its first entry (ids keep counting, so keys stay unique).
    const fresh: LogEvent[] = [{ atMs: 50, type: 'damage', spellId: 'shadow-bolt', amount: 10, crit: false }];
    const d = extractHudEvents(c.cursor, fresh, snap({ nowMs: 50 }), ctxFull, S);
    expect(texts(d.events)).toEqual(['10']);
    expect(d.events[0]!.id).toBe(3);
    expect(d.cursor.index).toBe(1);
    // New fight with a log as long as before but time going back: also a reset.
    const again: LogEvent[] = [
      { atMs: 10, type: 'miss', spellId: 'shadow-bolt' },
      { atMs: 20, type: 'miss', spellId: 'shadow-bolt' },
      { atMs: 30, type: 'miss', spellId: 'shadow-bolt' },
    ];
    const e = extractHudEvents(c.cursor, again, snap({ nowMs: 30 }), ctxFull, S);
    expect(e.events).toHaveLength(3);
    // A reset clears the cooldown memory: no 'ready' from the previous fight's cooldowns.
    const withCd = extractHudEvents(initialHudCursor(), [], snap({ nowMs: 5000, cooldownRemainingMs: { 'curse-of-doom': 50000 } }), ctxFull, S).cursor;
    const reset = extractHudEvents(withCd, [], snap({ nowMs: 0, cooldownRemainingMs: { 'curse-of-doom': 0 } }), ctxFull, S);
    expect(reset.events).toEqual([]);
    // The input cursor is never mutated.
    expect(a.cursor.index).toBe(2);
  });

  it('10 000 entries, fed one frame at a time, read each entry once (no quadratic behaviour) and run fast', () => {
    const N = 10_000;
    const all: LogEvent[] = [];
    for (let i = 0; i < N; i++) {
      all.push(
        i % 3 === 0
          ? { atMs: i * 10, type: 'damage', spellId: 'shadow-bolt', amount: 1000 + i, crit: i % 7 === 0 }
          : i % 3 === 1
            ? { atMs: i * 10, type: 'tick', spellId: 'corruption', auraId: 'corruption', amount: 150 }
            : { atMs: i * 10, type: 'cast-start', spellId: 'shadow-bolt' },
      );
    }
    const growing: LogEvent[] = [];
    let reads = 0;
    const counted = new Proxy(growing, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
        return Reflect.get(target, prop, receiver);
      },
    });
    let cursor: HudCursor = initialHudCursor();
    let count = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      growing.push(all[i]!);
      const r = extractHudEvents(cursor, counted, snap({ nowMs: all[i]!.atMs }), ctxFull, S);
      cursor = r.cursor;
      count += r.events.length;
    }
    const ms = performance.now() - t0;
    expect(reads).toBe(N);
    expect(count).toBe(Math.ceil(N / 3) + Math.ceil((N - 1) / 3));
    expect(ms).toBeLessThan(2000);
  });

  it('determinism: the same log twice gives equal events (ids included)', () => {
    const sim = new Simulation({ spec: fullApplied.spec, target: BOSS_TARGET, seed: 7, durationMs: 60000, scheduledAuras: fullApplied.sim.scheduledAuras });
    sim.start();
    for (let t = 0; t < 60000; t += 500) {
      sim.cast('shadow-bolt');
      sim.cast('use-item-29370');
      sim.advanceTo(t);
    }
    const log = sim.log();
    const s = sim.snapshot();
    const one = extractHudEvents(initialHudCursor(), log, s, ctxFull, settings({ targetDebuffs: true }));
    const two = extractHudEvents(initialHudCursor(), log, s, ctxFull, settings({ targetDebuffs: true }));
    expect(one).toEqual(two);
    expect(one.events.length).toBeGreaterThan(10);
    expect(one.events.map((e) => e.id)).toEqual(one.events.map((_, i) => i));
  });
});

describe('HUD_LOG_DECISIONS', () => {
  // Type-level check: adding a LogType without listing it here fails the typecheck.
  const EVERY_LOG_TYPE: Record<LogType, true> = {
    'cast-start': true,
    'cast-complete': true,
    'cast-cancel': true,
    impact: true,
    damage: true,
    miss: true,
    tick: true,
    'aura-apply': true,
    'aura-fade': true,
    mana: true,
    queue: true,
    'queue-drop': true,
  };

  it('has a show/skip decision with a rule for every LogType, and nothing else', () => {
    expect(Object.keys(HUD_LOG_DECISIONS).sort()).toEqual(Object.keys(EVERY_LOG_TYPE).sort());
    for (const [type, d] of Object.entries(HUD_LOG_DECISIONS)) {
      expect(typeof d.show, type).toBe('boolean');
      expect(d.rule.length, type).toBeGreaterThan(10);
    }
    const skipped = Object.entries(HUD_LOG_DECISIONS).filter(([, d]) => !d.show).map(([t]) => t).sort();
    expect(skipped).toEqual(['cast-cancel', 'cast-start', 'impact', 'queue', 'queue-drop']);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('formatHudText / hudTextStyle', () => {
  it('every kind', () => {
    const f = (kind: HudKind, amount?: number, name?: string, s = S) => formatHudText({ kind, amount, name }, s);
    expect(f('damage', 12345.4, 'Shadow Bolt')).toBe('12,345');
    expect(f('damage', 12345, 'Shadow Bolt', settings({ showSpellNames: true }))).toBe('Shadow Bolt 12,345');
    expect(f('crit', 4712, 'Shadow Bolt')).toBe('4,712!');
    expect(f('crit', 4712, 'Shadow Bolt', settings({ showSpellNames: true }))).toBe('Shadow Bolt 4,712!');
    expect(f('tick', 1500, 'Corruption')).toBe('1,500');
    expect(f('miss', undefined, 'Shadow Bolt')).toBe('Miss');
    expect(f('miss', undefined, 'Shadow Bolt', settings({ showSpellNames: true }))).toBe('Shadow Bolt Miss');
    expect(f('buff-on', undefined, 'Heroism')).toBe('+Heroism');
    expect(f('buff-off', undefined, 'Heroism')).toBe('-Heroism');
    expect(f('debuff-on', undefined, 'Immolate')).toBe('+Immolate');
    expect(f('debuff-off', undefined, 'Immolate')).toBe('-Immolate');
    expect(f('proc', undefined, 'Backlash')).toBe('Backlash!');
    expect(f('mana', 1622, 'Life Tap')).toBe('+1,622 Mana');
    expect(f('item', undefined, 'Icon of the Silver Crescent')).toBe('Icon of the Silver Crescent');
    expect(f('ready', undefined, 'Destruction Potion')).toBe('Destruction Potion ready');
    expect(f('low-mana')).toBe('Low Mana');
  });

  it('crits are larger (critScale) and bold, ticks smaller and lighter', () => {
    const s = settings({ fontPx: 20, critScale: 2 });
    expect(hudTextStyle('damage', s)).toEqual({ fontPx: 20, bold: false, opacity: 1 });
    expect(hudTextStyle('crit', s)).toEqual({ fontPx: 40, bold: true, opacity: 1 });
    const tick = hudTextStyle('tick', s);
    expect(tick.fontPx).toBeLessThan(20);
    expect(tick.opacity).toBeLessThan(1);
    expect(hudTextStyle('proc', s).bold).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

let nextId = 1000;
function ev(p: Partial<HudEvent> & { kind: HudKind }): HudEvent {
  const outgoing = ['damage', 'crit', 'tick', 'miss'].includes(p.kind);
  return {
    id: nextId++,
    atMs: 0,
    area: outgoing ? 'outgoing' : 'notifications',
    text: 'x',
    color: '#fff',
    sticky: p.kind === 'crit' || p.kind === 'proc',
    lane: 0,
    ...p,
  };
}

describe('HudQueue', () => {
  it('ticks of one spell inside the merge window become one text with the summed amount', () => {
    const q = new HudQueue();
    q.push([ev({ kind: 'tick', atMs: 3000, amount: 150, key: 'tick:corruption', name: 'Corruption' })], 0, S);
    q.push([ev({ kind: 'tick', atMs: 3200, amount: 160, key: 'tick:corruption', name: 'Corruption' })], 200, S);
    expect(q.items()).toHaveLength(1);
    expect(q.items()[0]).toMatchObject({ amount: 310, text: '310' });
    // Past the window: a new text.
    q.push([ev({ kind: 'tick', atMs: 3300, amount: 5, key: 'tick:corruption' })], 300, S);
    expect(q.items()).toHaveLength(2);
    // Merging off.
    const off = new HudQueue();
    off.push([ev({ kind: 'tick', atMs: 0, amount: 1, key: 'tick:a' }), ev({ kind: 'tick', atMs: 0, amount: 1, key: 'tick:a' })], 0, settings({ mergeTicks: 0 }));
    expect(off.items()).toHaveLength(2);
  });

  it('ticks of two spells do not merge', () => {
    const q = new HudQueue();
    q.push(
      [ev({ kind: 'tick', atMs: 3000, amount: 150, key: 'tick:corruption' }), ev({ kind: 'tick', atMs: 3000, amount: 120, key: 'tick:immolate' })],
      0,
      S,
    );
    expect(q.items().map((t) => t.amount)).toEqual([150, 120]);
  });

  it('small mana gains merge inside the mana window; large ones never', () => {
    const q = new HudQueue();
    q.push([ev({ kind: 'mana', atMs: 0, amount: 74, key: 'mana' })], 0, S);
    q.push([ev({ kind: 'mana', atMs: 1500, amount: 74, key: 'mana' })], 1500, S);
    q.push([ev({ kind: 'mana', atMs: 1600, amount: 1622, key: 'mana', text: '+1,622 Mana' })], 1600, S);
    expect(q.items().map((t) => t.text)).toEqual(['+148 Mana', '+1,622 Mana']);
    q.push([ev({ kind: 'mana', atMs: MANA_MERGE_WINDOW_MS + 1, amount: 74, key: 'mana' })], 2001, S);
    expect(q.items()).toHaveLength(3);
  });

  it('the maxTexts cap drops the oldest non-sticky text first and never a crit or a proc', () => {
    const q = new HudQueue();
    const s = settings({ maxTexts: 4 });
    const crit = ev({ kind: 'crit', amount: 5000 });
    const proc = ev({ kind: 'proc', name: 'Band' });
    const d1 = ev({ kind: 'damage' });
    const d2 = ev({ kind: 'damage' });
    q.push([crit, d1, proc, d2], 0, s);
    const d3 = ev({ kind: 'damage' });
    q.push([d3], 10, s);
    expect(q.items().map((t) => t.id)).toEqual([crit.id, proc.id, d2.id, d3.id]);
    // A burst of 100 events with crits and procs: the cap holds, no crit or proc is lost.
    const burst = Array.from({ length: 100 }, (_, i) => ev({ kind: i % 10 === 0 ? 'crit' : i % 10 === 5 ? 'proc' : 'damage', atMs: i }));
    q.push(burst, 20, s);
    expect(q.items().length).toBeLessThanOrEqual(4);
    const shown = new Set<number>();
    for (let t = 20; t < 60000 && (q.items().length > 0 || q.pendingCount() > 0); t += 16) {
      for (const x of q.items()) shown.add(x.id);
      expect(q.items().length).toBeLessThanOrEqual(4);
      q.expire(t);
    }
    for (const e of burst.filter((b) => b.sticky)) expect(shown.has(e.id)).toBe(true);
  });

  it('expire removes texts after durationMs', () => {
    const q = new HudQueue();
    q.push([ev({ kind: 'damage' })], 1000, settings({ durationMs: 1600 }));
    q.expire(2599);
    expect(q.items()).toHaveLength(1);
    q.expire(2600);
    expect(q.items()).toHaveLength(0);
    q.push([ev({ kind: 'damage' })], 3000, S);
    q.clear();
    expect(q.items()).toHaveLength(0);
  });

  it('lanes alternate per area so consecutive texts never share a lane', () => {
    const q = new HudQueue();
    q.push(Array.from({ length: 7 }, () => ev({ kind: 'damage' })), 0, S);
    q.push([ev({ kind: 'buff-on' }), ev({ kind: 'buff-off' })], 0, S);
    const out = q.items().filter((t) => t.area === 'outgoing').map((t) => t.lane);
    expect(out).toEqual([0, 1, 2, 0, 1, 2, 0].map((l) => l % HUD_LANES));
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    expect(q.items().filter((t) => t.area === 'notifications').map((t) => t.lane)).toEqual([0, 1]);
  });

  it('600 s of synthetic events stays within the cap and shows every crit and proc', () => {
    const s = settings({ maxTexts: 24 });
    const q = new HudQueue();
    let id = 0;
    let max = 0;
    const sticky: number[] = [];
    const shown = new Set<number>();
    for (let t = 0; t <= 600000; t += 16) {
      const batch: HudEvent[] = [];
      // About 20 events a second: hits, crits, ticks of 3 DoTs, mana, procs.
      if (t % 48 === 0) {
        const r = (t / 48) % 20;
        const kind: HudKind = r === 0 ? 'crit' : r === 7 ? 'proc' : r % 3 === 0 ? 'tick' : r === 11 ? 'mana' : 'damage';
        const e = ev({ kind, atMs: t, amount: 100, key: kind === 'tick' ? `tick:${r % 3}` : kind === 'mana' ? 'mana' : undefined });
        e.id = id++;
        if (e.sticky) sticky.push(e.id);
        batch.push(e);
      }
      q.push(batch, t, s);
      q.expire(t);
      for (const x of q.items()) shown.add(x.id);
      max = Math.max(max, q.items().length);
    }
    expect(max).toBeLessThanOrEqual(24);
    for (const e of sticky.slice(0, -5)) expect(shown.has(e)).toBe(true);
  });
});
