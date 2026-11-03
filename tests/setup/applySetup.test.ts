import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import {
  buildDestructionWarlock,
  destructionWarlock,
  type WarlockOptions,
} from '../../src/data/classes/warlock/destruction';
import { ROTATION_PRESETS, buildPriority } from '../../src/data/classes/warlock/rotation';
import {
  commonBuffs,
  consumables,
  cooldowns,
  debuffs,
  deepFreeze,
  JUDGEMENT_OF_WISDOM_MANA,
  SCHEDULED_DEBUFF_DURATION_MS,
} from '../../src/data/common/buffs';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import type { BuffDef, SpecData } from '../../src/data/types';
import { AuraTracker } from '../../src/engine/auras';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { LogEvent, ScheduledAura, SpecHooks, TargetData } from '../../src/engine/types';
import { applySetup, composeHooks } from '../../src/setup/applySetup';
import { buildSetupCatalog, DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, setupCatalogFor, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { authorGearEffects } from '../../src/setup/gearEffects';
import { DEFAULT_GEAR } from '../../src/setup/gear';

// The Icon and the Band are derived from the author's gear since gear item effects Task 2 (stage F
// hand ids: 'icon-of-the-silver-crescent' / 'band-of-the-eternal-sage' for entry and aura,
// 'use-icon-of-the-silver-crescent', 'band-of-the-eternal-sage-icd').
const ICON = 'item:29370';
const BAND = 'item:29305';
const ICON_AURA = 'item-buff:35163';
const USE_ICON = 'use-item-29370';
const BAND_AURA = 'item-buff:35084';
const BAND_ICD_AURA_ID = 'item-icd:29305';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig } from '../../src/setup/types';

// Inputs are deep-frozen for the whole file: any write by applySetup, normalizeSetup or the
// engine into the shared spec, the catalog or a config throws (ES modules are strict mode).
deepFreeze(destructionWarlock);
deepFreeze(SETUP_CATALOG);

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Bot mean DPS over seeds 1-10 at the end of stage 1.5 Task 2 / Task 3 (tests/data/rotation.test.ts
 * `TASK_2_MEAN_DPS`: 1425.18 with the 400 ms queue window, 1428.34 with none). The default setup
 * must reproduce them exactly.
 */
const TASK_2_MEAN_DPS: Record<number, number> = { [SPELL_QUEUE_WINDOW_MS]: 1425.1766666666667, 0: 1428.3350000000003 };

const build = (w: WarlockOptions) => buildDestructionWarlock(w);

/** A config: DEFAULT_SETUP with the given changes (deep-frozen, so applySetup cannot write it). */
function config(p: Partial<SetupConfig> = {}): SetupConfig {
  return deepFreeze({ ...structuredClone(DEFAULT_SETUP), ...p });
}

function apply(p: Partial<SetupConfig> = {}, catalog: readonly BuffDef[] = SETUP_CATALOG) {
  return applySetup({ buildSpec: build, catalog, config: config(p) });
}

function newSim(
  applied: ReturnType<typeof applySetup>,
  o: { seed?: number; target?: TargetData; extra?: ScheduledAura[]; infiniteMana?: boolean; distance?: number } = {},
) {
  return new Simulation({
    spec: applied.spec,
    target: o.target ?? NEVER_MISS,
    seed: o.seed ?? 1,
    infiniteMana: o.infiniteMana ?? true,
    distanceFromTarget: o.distance ?? 0,
    scheduledAuras: [...applied.sim.scheduledAuras, ...(o.extra ?? [])],
  });
}

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

/** a ~ b x mult up to the engine's one rounding of each hit (plus float noise). */
function expectScaled(a: number, b: number, mult: number): void {
  expect(Math.abs(a - b * mult), `${a} vs ${b} x ${mult}`).toBeLessThanOrEqual(1.5);
}

/** The author's gear catalog (static entries, then the derived Icon and Band), as the app builds it for the default gear. */
const AUTHOR_CATALOG = setupCatalogFor(DEFAULT_GEAR);

function catalogBuff(id: string): BuffDef {
  const b = AUTHOR_CATALOG.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
}

// ---------------------------------------------------------------------------
// Catalog, defaults and presets
// ---------------------------------------------------------------------------

describe('setup catalog, DEFAULT_SETUP and SETUP_PRESETS', () => {
  it("the catalog is commonBuffs + consumables + debuffs + cooldowns, in that order; the author's gear item effects (Icon, Band) follow only in the gear's catalog, with unique ids", () => {
    const expected = [...commonBuffs, ...consumables, ...debuffs, ...cooldowns];
    expect(STATIC_SETUP_CATALOG).toEqual(expected);
    STATIC_SETUP_CATALOG.forEach((b, i) => expect(b).toBe(expected[i]));
    expect(buildSetupCatalog()).toEqual(expected);
    // Gear item effects Task 3: no constant holds gear entries; SETUP_CATALOG is the static catalog.
    expect(SETUP_CATALOG).toBe(STATIC_SETUP_CATALOG);
    AUTHOR_CATALOG.slice(0, expected.length).forEach((b, i) => expect(b).toBe(expected[i]));
    expect(AUTHOR_CATALOG.slice(expected.length).map((b) => b.id)).toEqual([ICON, BAND]);
    expect(AUTHOR_CATALOG.slice(expected.length).map((b) => b.description)).toEqual(authorGearEffects().map((b) => b.description));
    const ids = AUTHOR_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.isFrozen(SETUP_CATALOG)).toBe(true);
    expect(Object.isFrozen(AUTHOR_CATALOG)).toBe(true);
  });

  it('DEFAULT_SETUP: no buffs, dot rotation, 28 yd, Fel Armor and the Succubus sacrifice; timed defaults from the catalog', () => {
    expect(DEFAULT_SETUP).toEqual({
      version: 1,
      enabledBuffs: [],
      // Heroism is the only timed buff: the potion and the Icon are item actions (pressed).
      timed: { heroism: { startSec: 0, durationSec: 40 } },
      rotation: ROTATION_PRESETS.dot.config,
      distanceYd: DEFAULT_DISTANCE_FROM_TARGET_YD,
      warlock: { armor: 'fel', sacrificeSuccubus: true },
      fightDurationSec: 60,
    });
    expect(DEFAULT_SETUP.rotation).not.toBe(ROTATION_PRESETS.dot.config);
    expect(Object.isFrozen(DEFAULT_SETUP)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETUP.timed.heroism)).toBe(true);
    expect(normalizeSetup(DEFAULT_SETUP, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it("SETUP_PRESETS: 'none' is the default, 'raid-log' its own setup (Task 12, tests/setup/raid-log.test.ts); frozen, and both normalize to themselves", () => {
    expect(Object.keys(SETUP_PRESETS)).toEqual(['none', 'raid-log']);
    expect(SETUP_PRESETS.none.config).toEqual(DEFAULT_SETUP);
    expect(SETUP_PRESETS['raid-log'].config).not.toEqual(SETUP_PRESETS.none.config);
    expect(SETUP_PRESETS['raid-log'].config).not.toBe(SETUP_PRESETS.none.config);
    expect(SETUP_PRESETS.none.name).toBe('None');
    expect(SETUP_PRESETS['raid-log'].name).toBe('Raid as in my log');
    for (const p of Object.values(SETUP_PRESETS)) {
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.config)).toBe(true);
      expect(Object.isFrozen(p.config.rotation)).toBe(true);
      expect(normalizeSetup(p.config, SETUP_CATALOG)).toEqual(p.config);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeSetup (Review Focus 4 and 5)
// ---------------------------------------------------------------------------

describe('normalizeSetup', () => {
  const norm = (input: unknown) => normalizeSetup(input, SETUP_CATALOG);
  const withBuffs = (enabledBuffs: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), enabledBuffs }).enabledBuffs;

  it('unknown ids dropped, duplicates collapsed, same id twice once', () => {
    expect(withBuffs(['arcane-brilliance', 'no-such-buff', 7, null, { id: 'misery' }, 'misery'])).toEqual([
      'arcane-brilliance',
      'misery',
    ]);
    expect(withBuffs(['misery', 'misery'])).toEqual(['misery']);
    expect(withBuffs(['misery', 'arcane-brilliance', 'misery'])).toEqual(['arcane-brilliance', 'misery']);
    // Aura ids that are not catalog ids, and Object.prototype names, are not buffs.
    expect(withBuffs([BAND_ICD_AURA_ID, BAND_AURA, '__proto__', 'constructor', 'toString', 'hasOwnProperty'])).toEqual([]);
    // Not an array: no buffs.
    expect(withBuffs('misery')).toEqual([]);
    expect(withBuffs({ 0: 'misery', length: 1 })).toEqual([]);
  });

  it('flask + elixir keep only the last', () => {
    expect(withBuffs(['flask-of-supreme-power', 'elixir-of-major-shadow-power'])).toEqual(['elixir-of-major-shadow-power']);
    expect(withBuffs(['elixir-of-major-shadow-power', 'flask-of-supreme-power'])).toEqual(['flask-of-supreme-power']);
    // A flask removes both elixirs; a later battle elixir removes the flask but keeps the guardian one.
    expect(withBuffs(['elixir-of-major-shadow-power', 'elixir-of-draenic-wisdom', 'flask-of-pure-death'])).toEqual([
      'flask-of-pure-death',
    ]);
    expect(withBuffs(['flask-of-pure-death', 'elixir-of-draenic-wisdom', 'elixir-of-major-shadow-power'])).toEqual([
      'elixir-of-draenic-wisdom',
      'elixir-of-major-shadow-power',
    ]);
    // Two flasks, two battle elixirs: the later one.
    expect(withBuffs(['flask-of-supreme-power', 'flask-of-distilled-wisdom'])).toEqual(['flask-of-distilled-wisdom']);
    expect(withBuffs(['adepts-elixir', 'greater-arcane-elixir', 'elixir-of-major-mageblood'])).toEqual([
      'greater-arcane-elixir',
      'elixir-of-major-mageblood',
    ]);
    // A duplicate counts at its last position: here the flask is the later one.
    expect(withBuffs(['flask-of-supreme-power', 'adepts-elixir', 'flask-of-supreme-power'])).toEqual(['flask-of-supreme-power']);
  });

  it('two foods keep one', () => {
    expect(withBuffs(['blackened-basilisk', 'skullfish-soup'])).toEqual(['skullfish-soup']);
    expect(withBuffs(['skullfish-soup', 'arcane-brilliance', 'blackened-sporefish', 'blackened-basilisk'])).toEqual([
      'arcane-brilliance',
      'blackened-basilisk',
    ]);
    // Other groups are untouched: oils, potion (one each), and buffs without a group.
    expect(withBuffs(['brilliant-wizard-oil', 'superior-wizard-oil', 'misery', 'shadow-weaving'])).toEqual([
      'superior-wizard-oil',
      'misery',
      'shadow-weaving',
    ]);
    // The raid and the own debuffs have no exclusive group: both stay enabled (applySetup neutralizes).
    expect(withBuffs(['raid-curse-of-the-elements', 'isb-from-others'])).toEqual(['raid-curse-of-the-elements', 'isb-from-others']);
  });

  it("distance NaN → 28, -5 → 0, 1e9 → 100, '12' (string) → 28", () => {
    const d = (distanceYd: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), distanceYd }).distanceYd;
    expect(d(Number.NaN)).toBe(28);
    expect(d(-5)).toBe(0);
    expect(d(1e9)).toBe(100);
    expect(d('12')).toBe(28);
    expect(d(undefined)).toBe(28);
    expect(d(null)).toBe(28);
    expect(d(Number.POSITIVE_INFINITY)).toBe(100);
    expect(d(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(d(0)).toBe(0);
    expect(d(100)).toBe(100);
    expect(d(12.5)).toBe(12.5);
    const { distanceYd: _, ...noDistance } = structuredClone(DEFAULT_SETUP);
    expect(norm(noDistance).distanceYd).toBe(28);
  });

  it('version 2 or missing → defaults', () => {
    const custom = { ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['misery'], distanceYd: 10 };
    expect(norm(custom)).toEqual({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['misery'], distanceYd: 10 });
    expect(norm({ ...custom, version: 2 })).toEqual(DEFAULT_SETUP);
    expect(norm({ ...custom, version: '1' })).toEqual(DEFAULT_SETUP);
    const { version: _, ...noVersion } = custom;
    expect(norm(noVersion)).toEqual(DEFAULT_SETUP);
  });

  it('null, a string, an array, a number → defaults (never throws)', () => {
    for (const input of [null, undefined, 'a string', [], [DEFAULT_SETUP], 42, Number.NaN, true, () => DEFAULT_SETUP]) {
      expect(norm(input)).toEqual(DEFAULT_SETUP);
    }
    // A getter or proxy that throws: still defaults.
    const hostile = { version: 1, get enabledBuffs(): string[] { throw new Error('boom'); } };
    expect(norm(hostile)).toEqual(DEFAULT_SETUP);
    const proxy = new Proxy({}, { get() { throw new Error('boom'); }, has() { throw new Error('boom'); } });
    expect(norm(proxy)).toEqual(DEFAULT_SETUP);
    // Defaults are a fresh copy, not the frozen DEFAULT_SETUP.
    const fresh = norm(null);
    expect(fresh).not.toBe(DEFAULT_SETUP);
    expect(Object.isFrozen(fresh)).toBe(false);
  });

  it('rotation with an invalid curse → the default curse', () => {
    const r = (rotation: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), rotation }).rotation;
    const dot = ROTATION_PRESETS.dot.config;
    expect(r({ ...dot, curse: 'shadow' }).curse).toBe('elements');
    expect(r({ ...dot, curse: 3 }).curse).toBe('elements');
    expect(r({ ...ROTATION_PRESETS['sb-spam'].config, curse: 'toString' })).toEqual({ ...ROTATION_PRESETS['sb-spam'].config, curse: 'elements' });
    for (const curse of ['elements', 'agony', 'doom', 'none'] as const) expect(r({ ...dot, curse }).curse).toBe(curse);
    // The other fields: booleans or the default, Life Tap 'auto' or a finite number >= 0.
    expect(r({ ...dot, immolate: 'yes', corruption: 0, shadowburnFinisher: null })).toEqual(dot);
    expect(r({ ...dot, immolate: false, corruption: false, shadowburnFinisher: false })).toEqual({
      ...dot,
      immolate: false,
      corruption: false,
      shadowburnFinisher: false,
    });
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY, '2000', null, 'manual']) {
      expect(r({ ...dot, lifeTapBelowMana: bad }).lifeTapBelowMana, String(bad)).toBe('auto');
    }
    expect(r({ ...dot, lifeTapBelowMana: 0 }).lifeTapBelowMana).toBe(0);
    expect(r({ ...dot, lifeTapBelowMana: 2000 }).lifeTapBelowMana).toBe(2000);
    expect(r({ ...dot, lifeTapBelowMana: 1e308 }).lifeTapBelowMana).toBe(100000);
    // Not an object: the default rotation.
    for (const bad of [null, 'dot', [], 5]) expect(r(bad)).toEqual(dot);
    // Whatever comes out, buildPriority accepts it.
    expect(() => buildPriority(r({ lifeTapBelowMana: -3, curse: 'x' }), 28)).not.toThrow();
  });

  it('warlock options are validated against their unions', () => {
    const w = (warlock: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), warlock }).warlock;
    expect(w({ armor: 'demon', sacrificeSuccubus: false })).toEqual({ armor: 'demon', sacrificeSuccubus: false });
    expect(w({ armor: 'none', sacrificeSuccubus: true })).toEqual({ armor: 'none', sacrificeSuccubus: true });
    expect(w({ armor: 'mage', sacrificeSuccubus: 'no' })).toEqual({ armor: 'fel', sacrificeSuccubus: true });
    expect(w(null)).toEqual({ armor: 'fel', sacrificeSuccubus: true });
  });

  it('timed: defaults filled from the catalog, startSec clamped to [0, 600], durationSec to [1, 600], unknown ids dropped', () => {
    const t = (timed: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), timed }).timed;
    expect(t({})).toEqual(DEFAULT_SETUP.timed);
    expect(t(null)).toEqual(DEFAULT_SETUP.timed);
    expect(t({ heroism: { startSec: 6.4, durationSec: 30 } }).heroism).toEqual({ startSec: 6.4, durationSec: 30 });
    expect(t({ heroism: { startSec: -3, durationSec: 0 } }).heroism).toEqual({ startSec: 0, durationSec: 1 });
    expect(t({ heroism: { startSec: 1e9, durationSec: 1e9 } }).heroism).toEqual({ startSec: 600, durationSec: 600 });
    expect(t({ heroism: { startSec: Number.NaN, durationSec: '20' } }).heroism).toEqual({ startSec: 0, durationSec: 40 });
    expect(t({ heroism: 'soon' }).heroism).toEqual({ startSec: 0, durationSec: 40 });
    expect(t({ heroism: { startSec: 5 } }).heroism).toEqual({ startSec: 5, durationSec: 40 });
    // Only timed catalog buffs have an entry.
    expect(Object.keys(t({ misery: { startSec: 1, durationSec: 2 }, nope: { startSec: 1, durationSec: 2 } })).sort()).toEqual(
      Object.keys(DEFAULT_SETUP.timed).sort(),
    );
    // A stored stage 1.5 config's entries for the potion and the Icon (timed then, item actions
    // now) are dropped; Heroism's is kept.
    expect(
      t({
        heroism: { startSec: 6.4, durationSec: 40 },
        'destruction-potion': { startSec: 7.5, durationSec: 15 },
        'icon-of-the-silver-crescent': { startSec: 30.2, durationSec: 20 },
      }),
    ).toEqual({ heroism: { startSec: 6.4, durationSec: 40 } });
  });

  it('builds only from the given catalog: another catalog gives other timed entries and ids', () => {
    const tiny = [catalogBuff('misery'), catalogBuff('heroism')];
    const out = normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['misery', 'arcane-brilliance', 'heroism'] }, tiny);
    expect(out.enabledBuffs).toEqual(['misery', 'heroism']);
    expect(out.timed).toEqual({ heroism: { startSec: 0, durationSec: 40 } });
    expect(normalizeSetup(null, tiny).timed).toEqual({ heroism: { startSec: 0, durationSec: 40 } });
  });

  it('never mutates its input and shares no object with it', () => {
    const input = deepFreeze({
      ...structuredClone(DEFAULT_SETUP),
      enabledBuffs: ['misery', 'misery', 'flask-of-supreme-power', 'adepts-elixir'],
      timed: { heroism: { startSec: 700, durationSec: 0 } },
    });
    const before = JSON.stringify(input);
    const out = norm(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(out.enabledBuffs).not.toBe(input.enabledBuffs);
    expect(out.rotation).not.toBe(input.rotation);
    expect(out.warlock).not.toBe(input.warlock);
    expect(out.timed.heroism).not.toBe(input.timed.heroism);
    // Idempotent.
    expect(norm(out)).toEqual(out);
  });
});

// ---------------------------------------------------------------------------
// applySetup
// ---------------------------------------------------------------------------

describe('applySetup', () => {
  it('golden: applySetup with DEFAULT_SETUP gives a spec whose derived stats (computeStats of setup + statBonuses), spells, auras, modifiers and priority ids equal destructionWarlock\'s, and the bot\'s mean DPS over seeds 1–10 equals the Task 2/3 value exactly (same seeds)', () => {
    const { spec, sim } = applySetup({ buildSpec: build, catalog: SETUP_CATALOG, config: DEFAULT_SETUP });
    expect(computeStats(spec.setup, spec.statBonuses)).toEqual(computeStats(destructionWarlock.setup, destructionWarlock.statBonuses));
    expect(spec.setup).toEqual(destructionWarlock.setup);
    expect(spec.statBonuses).toEqual(destructionWarlock.statBonuses);
    // The worn Icon's action and aura are always part of the spec (on the item row for the
    // player); not enabled, the bot never uses it (no step below), so the logs are unchanged.
    const icon = catalogBuff(ICON);
    expect(spec.spells).toEqual([...destructionWarlock.spells, icon.effect.action]);
    expect(spec.auras).toEqual([...destructionWarlock.auras, icon.effect.selfAura]);
    destructionWarlock.auras.forEach((a, i) => expect(spec.auras[i]).toBe(a));
    expect(spec.modifiers).toEqual(destructionWarlock.modifiers);
    expect(spec.sets).toEqual(destructionWarlock.sets);
    // The spell row unchanged; the item row (slots 12-17, Z X C V B N): the worn Icon on Z.
    expect(spec.keybinds).toEqual([...destructionWarlock.keybinds, USE_ICON, '', '', '', '', '']);
    expect(spec.hooks).toBe(destructionWarlock.hooks);
    expect(spec.priority.map((s) => s.spellId)).toEqual(destructionWarlock.priority.map((s) => s.spellId));
    expect(spec.priority.map((s) => [s.label, s.hint])).toEqual(destructionWarlock.priority.map((s) => [s.label, s.hint]));
    expect(sim).toEqual({ scheduledAuras: [], distanceFromTarget: 28, durationMs: 60000 });

    for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
      const dps = SEEDS.map(
        (seed) =>
          runBot(
            new Simulation({
              spec,
              target: BOSS_TARGET,
              seed,
              spellQueueWindowMs: w,
              infiniteMana: false,
              distanceFromTarget: sim.distanceFromTarget,
              scheduledAuras: sim.scheduledAuras,
              durationMs: sim.durationMs,
            }),
            spec.priority,
          ).dps,
      );
      const mean = dps.reduce((a, b) => a + b, 0) / dps.length;
      expect(mean, `window ${w}`).toBe(TASK_2_MEAN_DPS[w]);
    }
  });

  it('enabling Arcane Brilliance and Blessing of Kings changes intellect as expected (flat bonus first, then ×1.1 with the Gnome multiplier)', () => {
    const { spec } = apply({ enabledBuffs: ['arcane-brilliance', 'blessing-of-kings'] });
    expect(spec.statBonuses).toEqual({ ...destructionWarlock.statBonuses, intellect: 40 });
    const base = destructionWarlock.setup.statMultipliers!;
    expect(spec.setup.statMultipliers).toEqual({ ...base, intellect: base.intellect! * 1.1, spirit: base.spirit! * 1.1 });
    expect(spec.setup.stats).toBe(destructionWarlock.setup.stats);
    expect(destructionWarlock.setup.statMultipliers).toEqual({ intellect: 1.05, spirit: 0.95, maxMana: 1.03 });

    // Intellect = (gear + base + 40) x 1.05 x 1.1, read back through max mana and crit.
    const s = destructionWarlock.setup.stats;
    const int = (s.intellect + 40) * 1.05 * 1.1;
    const got = computeStats(spec.setup, spec.statBonuses);
    expect(got.maxMana).toBeCloseTo((s.baseMana + 20 + 15 * (int - 20)) * 1.03, 6);
    const plain = computeStats(destructionWarlock.setup, destructionWarlock.statBonuses);
    const intPlain = s.intellect * 1.05;
    expect(got.maxMana - plain.maxMana).toBeCloseTo(15 * (int - intPlain) * 1.03, 6);
    expect(got.critPct).toBeGreaterThan(plain.critPct);
    // Spirit: x1.1 on the total too (Blessing of Kings), Demonic Embrace x0.95 kept.
    expect(got.spiritRegenPerSec).toBeGreaterThan(plain.spiritRegenPerSec);
  });

  it('static effects: statBonuses summed onto the spec, modifiers appended in catalog order', () => {
    const { spec } = apply({
      enabledBuffs: ['flask-of-supreme-power', 'totem-of-wrath', 'wrath-of-air-totem', 'moonkin-aura', 'mana-spring-totem', 'blessing-of-wisdom'],
    });
    expect(spec.statBonuses.spellPower).toBe(130 + 121 + 70);
    expect(spec.statBonuses.mp5).toBe(50 + 49);
    expect(spec.statBonuses.critRating).toBe(20);
    expect(spec.statBonuses.hitRating).toBe(catalogBuff('totem-of-wrath').effect.statBonuses!.hitRating);
    // Moonkin (catalog index before Totem of Wrath) first, whatever the config's order.
    expect(spec.modifiers).toEqual([...destructionWarlock.modifiers, { critPctDelta: 5 }, { critPctDelta: 3 }]);
    expect(destructionWarlock.statBonuses).toEqual({ spellPower: 130 });
  });

  it('a target-debuff buff appears in scheduledAuras at 0 with the fight length', () => {
    const { spec, sim } = apply({ enabledBuffs: ['misery', 'judgement-of-wisdom'] });
    // Ruling S3: no duration override; the aura's own duration (1 h) outlasts any fight.
    expect(sim.scheduledAuras).toEqual([
      { auraId: 'misery', on: 'target', atMs: 0 },
      { auraId: 'judgement-of-wisdom', on: 'target', atMs: 0 },
    ]);
    const misery = spec.auras.find((a) => a.id === 'misery');
    expect(misery).toBe(catalogBuff('misery').effect.targetAura);
    expect(misery!.durationMs).toBe(SCHEDULED_DEBUFF_DURATION_MS);

    const fight = newSim({ spec, sim });
    castInOrder(fight, ['shadow-bolt']);
    fight.advanceTo(60000);
    expect(fight.snapshot().phase).toBe('ended');
    expect(fight.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'misery')).toEqual([
      { atMs: 0, type: 'aura-apply', auraId: 'misery' },
    ]);
    expect(fight.log().some((e) => e.type === 'aura-fade' && e.auraId === 'misery')).toBe(false);
  });

  it('start and duration are rounded to whole ms (1.005 s is 1005 ms, not 1004)', () => {
    const { sim } = apply({
      enabledBuffs: ['heroism'],
      timed: { ...DEFAULT_SETUP.timed, heroism: { startSec: 1.005, durationSec: 30 } },
    });
    expect(sim.scheduledAuras).toEqual([{ auraId: 'heroism', on: 'self', atMs: 1005, durationMs: 30000 }]);
  });

  it('a timed buff uses the configured start and duration; an item action is never scheduled (a stale timed entry is ignored)', () => {
    const { spec, sim } = apply({
      enabledBuffs: [ICON, 'heroism'],
      // The Icon entry is what a stage 1.5 config held (normalizeSetup drops it; applySetup ignores it).
      timed: { ...DEFAULT_SETUP.timed, heroism: { startSec: 6.4, durationSec: 30 }, 'icon-of-the-silver-crescent': { startSec: 30.2, durationSec: 5 } },
    });
    expect(sim.scheduledAuras).toEqual([{ auraId: 'heroism', on: 'self', atMs: 6400, durationMs: 30000 }]);
    // Catalog order: Heroism (cooldowns) before the Icon (warlock items); the Icon's aura is there
    // for its action.
    expect(spec.auras.slice(destructionWarlock.auras.length)).toEqual([
      catalogBuff('heroism').effect.selfAura,
      catalogBuff(ICON).effect.selfAura,
    ]);
    const fight = newSim({ spec, sim });
    expect(fight.cast('life-tap').ok).toBe(true); // starts the fight
    fight.advanceTo(30200);
    expect(fight.cast(USE_ICON)).toEqual({ ok: true });
    fight.advanceTo(60000);
    const log = fight.log().filter((e) => e.type === 'aura-apply' || e.type === 'aura-fade');
    expect(log).toEqual([
      { atMs: 6400, type: 'aura-apply', auraId: 'heroism' },
      { atMs: 30200, type: 'aura-apply', auraId: ICON_AURA, spellId: USE_ICON },
      { atMs: 36400, type: 'aura-fade', auraId: 'heroism' },
      { atMs: 50200, type: 'aura-fade', auraId: ICON_AURA },
    ]);
  });

  it('a timed buff without a config entry uses its catalog default', () => {
    const { sim } = apply({ enabledBuffs: ['heroism'], timed: {} });
    expect(sim.scheduledAuras).toEqual([{ auraId: 'heroism', on: 'self', atMs: 0, durationMs: 40000 }]);
  });

  it('startSec above the fight length yields a scheduled aura the engine ignores (no crash)', () => {
    const cfg = normalizeSetup(
      { ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['heroism'], timed: { heroism: { startSec: 9999, durationSec: 40 } } },
      SETUP_CATALOG,
    );
    const applied = applySetup({ buildSpec: build, catalog: SETUP_CATALOG, config: deepFreeze(cfg) });
    expect(applied.sim.scheduledAuras).toEqual([{ auraId: 'heroism', on: 'self', atMs: 600000, durationMs: 40000 }]);
    const fight = newSim(applied);
    castInOrder(fight, ['shadow-bolt']);
    fight.advanceTo(60000);
    expect(fight.snapshot().phase).toBe('ended');
    expect(fight.log().some((e) => e.auraId === 'heroism')).toBe(false);
    // A duration running past the end is cut by the end (no fade).
    const late = apply({ enabledBuffs: ['heroism'], timed: { ...DEFAULT_SETUP.timed, heroism: { startSec: 50, durationSec: 600 } } });
    const f2 = newSim(late);
    expect(f2.cast('life-tap').ok).toBe(true);
    f2.advanceTo(60000);
    expect(f2.log().filter((e) => e.auraId === 'heroism').map((e) => [e.type, e.atMs])).toEqual([['aura-apply', 50000]]);
  });

  it('priority follows config.rotation and config.distanceYd; distanceFromTarget = distanceYd', () => {
    const rotation = { ...ROTATION_PRESETS['sb-spam'].config, lifeTapBelowMana: 1500 };
    const { spec, sim } = apply({ rotation, distanceYd: 0 });
    const expected = buildPriority(rotation, 0);
    expect(spec.priority.map((s) => [s.spellId, s.label, s.hint])).toEqual(expected.map((s) => [s.spellId, s.label, s.hint]));
    expect(sim.distanceFromTarget).toBe(0);
    expect(apply({ distanceYd: 40 }).sim.distanceFromTarget).toBe(40);
  });

  it('warlock options go through buildSpec', () => {
    const seen: WarlockOptions[] = [];
    const warlock = { armor: 'none', sacrificeSuccubus: false } as const;
    const { spec } = applySetup({
      buildSpec: (w) => {
        seen.push(w);
        return buildDestructionWarlock(w);
      },
      catalog: SETUP_CATALOG,
      config: config({ warlock, enabledBuffs: ['wrath-of-air-totem'] }),
    });
    expect(seen).toEqual([warlock]);
    expect(spec.statBonuses).toEqual({ spellPower: 121 });
    expect(spec.modifiers.length).toBe(destructionWarlock.modifiers.length - 1);
  });

  it('hooks are composed after the spec\'s own, in catalog order, whatever the config order', () => {
    const calls: string[] = [];
    const rec = (name: string): SpecHooks => ({
      onSpellResolved(e) {
        calls.push(`${name}:${e.spellId}`);
      },
    });
    const fake = (id: string): BuffDef => ({
      id,
      name: id,
      icon: 'x',
      group: 'raid',
      description: 'test',
      source: 'test',
      effect: { hooks: rec(id) },
    });
    const catalog = [fake('first'), fake('second'), fake('third')];
    const base: SpecData = { ...destructionWarlock, hooks: rec('spec') };
    const { spec } = applySetup({
      buildSpec: () => base,
      catalog,
      config: config({ enabledBuffs: ['third', 'first'] }),
    });
    const fight = new Simulation({ spec, target: NEVER_MISS, seed: 1, infiniteMana: true });
    castInOrder(fight, ['corruption']);
    expect(calls).toEqual(['spec:corruption', 'first:corruption', 'third:corruption']);
    expect(base.hooks.onSpellResolved).toBeDefined();
  });

  it('composeHooks: runs each in order, keeps `this`, skips hooks without onSpellResolved; one hook stays the same object', () => {
    const order: string[] = [];
    const withThis = {
      name: 'obj',
      onSpellResolved(this: { name: string }) {
        order.push(this.name);
      },
    };
    const plain: SpecHooks = { onSpellResolved: () => order.push('plain') };
    const composed = composeHooks(withThis, {}, plain);
    composed.onSpellResolved?.({ spellId: 'x', outcome: 'hit', damage: 1 }, {} as never);
    expect(order).toEqual(['obj', 'plain']);
    expect(composeHooks(plain)).toBe(plain);
    expect(composeHooks(plain, {})).toBe(plain);
    expect(composeHooks().onSpellResolved).toBeUndefined();
  });

  it('applySetup does not mutate destructionWarlock or the config (deep-freeze them in the test)', () => {
    // Every buff that can be enabled with the others (exclusive groups: the first of each).
    const groups = new Set<string>();
    const enabledBuffs = SETUP_CATALOG.filter((b) => {
      if (!b.exclusiveGroup) return true;
      if (groups.has(b.exclusiveGroup)) return false;
      groups.add(b.exclusiveGroup);
      return true;
    })
      .filter((b) => b.exclusiveGroup !== 'flask')
      .map((b) => b.id);
    const cfg = config({ enabledBuffs });
    expect(Object.isFrozen(destructionWarlock.setup.statMultipliers)).toBe(true);
    expect(Object.isFrozen(destructionWarlock.auras)).toBe(true);
    const snapshot = JSON.stringify({ destructionWarlock, cfg, catalog: SETUP_CATALOG });
    const sharedMultipliers = destructionWarlock.setup.statMultipliers;
    // buildSpec returns the frozen shared spec itself: applySetup must copy, not write.
    const applied = applySetup({ buildSpec: () => destructionWarlock, catalog: SETUP_CATALOG, config: cfg });
    expect(JSON.stringify({ destructionWarlock, cfg, catalog: SETUP_CATALOG })).toBe(snapshot);
    expect(applied.spec).not.toBe(destructionWarlock);
    expect(applied.spec.setup).not.toBe(destructionWarlock.setup);
    expect(applied.spec.setup.statMultipliers).not.toBe(sharedMultipliers);
    expect(applied.spec.auras).not.toBe(destructionWarlock.auras);
    expect(applied.spec.modifiers).not.toBe(destructionWarlock.modifiers);
    expect(applied.spec.statBonuses).not.toBe(destructionWarlock.statBonuses);
    expect(applied.spec.priority).not.toBe(destructionWarlock.priority);
    expect(applied.spec.spells).not.toBe(destructionWarlock.spells);
    expect(applied.spec.keybinds).not.toBe(destructionWarlock.keybinds);
    // With every buff on, every aura id is unique and the Simulation knows every scheduled aura;
    // a whole bot fight runs.
    const ids = applied.spec.auras.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fight = new Simulation({
      spec: applied.spec,
      target: BOSS_TARGET,
      seed: 3,
      distanceFromTarget: applied.sim.distanceFromTarget,
      scheduledAuras: applied.sim.scheduledAuras,
    });
    runBot(fight, applied.spec.priority);
    expect(fight.snapshot().phase).toBe('ended');
    expect(JSON.stringify({ destructionWarlock, cfg, catalog: SETUP_CATALOG })).toBe(snapshot);
  });

  it('ScheduledAura ids come only from the catalog: unknown enabled ids are ignored', () => {
    const cfg = deepFreeze({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['no-such-buff', 'curse-of-the-elements', 'misery'] });
    const { spec, sim } = applySetup({ buildSpec: build, catalog: SETUP_CATALOG, config: cfg });
    expect(sim.scheduledAuras).toEqual([{ auraId: 'misery', on: 'target', atMs: 0 }]);
    // Misery, and the worn Icon's aura (always bound, never scheduled).
    expect(spec.auras.length).toBe(destructionWarlock.auras.length + 2);
  });

  it('own CoE + raid CoE give one ×1.1', () => {
    const raid = apply({ enabledBuffs: ['raid-curse-of-the-elements'], distanceYd: 0 });
    // Unit level: both curses up multiply shadow and fire by exactly 1.1.
    const t = new AuraTracker(raid.spec.auras);
    t.apply('raid-curse-of-the-elements', 0);
    t.apply('curse-of-the-elements', 0);
    for (const school of ['fire', 'shadow', 'arcane', 'frost'] as const) expect(t.damageTakenMult(school, 0)).toBe(1.1);
    // The own curse alone (default setup) is still x1.1.
    const own = new AuraTracker(apply().spec.auras);
    own.apply('curse-of-the-elements', 0);
    expect(own.damageTakenMult('shadow', 0)).toBe(1.1);

    // Engine level: CoE + Shadow Bolt with the raid curse equals the same casts without it, and
    // is x1.1 a Shadow Bolt under Curse of Agony (no damage-taken effect, same random draws).
    const both = newSim(raid, { seed: 9 });
    const ownOnly = newSim(apply({ distanceYd: 0 }), { seed: 9 });
    const agony = newSim(apply({ distanceYd: 0 }), { seed: 9 });
    castInOrder(both, ['curse-of-the-elements', 'shadow-bolt']);
    castInOrder(ownOnly, ['curse-of-the-elements', 'shadow-bolt']);
    castInOrder(agony, ['curse-of-agony', 'shadow-bolt']);
    expect(Object.keys(both.snapshot().targetAuras)).toEqual(
      expect.arrayContaining(['curse-of-the-elements', 'raid-curse-of-the-elements']),
    );
    const [b] = amounts(both.log(), 'damage', 'shadow-bolt');
    expect(amounts(both.log(), 'damage', 'shadow-bolt')).toEqual(amounts(ownOnly.log(), 'damage', 'shadow-bolt'));
    const [a] = amounts(agony.log(), 'damage', 'shadow-bolt');
    expectScaled(b!, a!, 1.1);
  });

  it('isb-from-others and own ISB do not multiply together', () => {
    const isb = apply({ enabledBuffs: ['isb-from-others'], distanceYd: 0 });
    const t = new AuraTracker(isb.spec.auras);
    t.apply('isb-from-others', 0);
    t.apply('shadow-vulnerability', 0);
    expect(t.damageTakenMult('shadow', 0)).toBe(1.2);
    // The own aura alone (default setup) is still x1.2.
    const own = new AuraTracker(apply().spec.auras);
    own.apply('shadow-vulnerability', 0);
    expect(own.damageTakenMult('shadow', 0)).toBe(1.2);

    // Engine level: with the own Shadow Vulnerability also up from 0, a Shadow Bolt equals the run
    // with isb-from-others alone, and is x1.2 the default setup's.
    const ownToo = newSim(isb, { seed: 2, extra: [{ auraId: 'shadow-vulnerability', on: 'target', atMs: 0 }] });
    const othersOnly = newSim(isb, { seed: 2 });
    const none = newSim(apply({ distanceYd: 0 }), { seed: 2 });
    for (const sim of [ownToo, othersOnly, none]) castInOrder(sim, ['shadow-bolt']);
    expect(ownToo.log().some((e) => e.type === 'aura-apply' && e.auraId === 'shadow-vulnerability')).toBe(true);
    const [x] = amounts(ownToo.log(), 'damage', 'shadow-bolt');
    expect(amounts(ownToo.log(), 'damage', 'shadow-bolt')).toEqual(amounts(othersOnly.log(), 'damage', 'shadow-bolt'));
    const [n] = amounts(none.log(), 'damage', 'shadow-bolt');
    expectScaled(x!, n!, 1.2);

    // A whole bot fight: own ISB procs on crits while isb-from-others is up; every hit and tick
    // equals the run where the own aura is already there from the start.
    const run = (extra: ScheduledAura[]) => {
      const sim = newSim(isb, { seed: 5, target: BOSS_TARGET, infiniteMana: false, distance: 28, extra });
      runBot(sim, isb.spec.priority);
      return sim.log().filter((e) => e.type === 'damage' || e.type === 'tick');
    };
    const plain = run([]);
    const pre = run([{ auraId: 'shadow-vulnerability', on: 'target', atMs: 0 }]);
    expect(plain.map((e) => e.amount)).toEqual(pre.map((e) => e.amount));
    expect(plain.length).toBeGreaterThan(10);
  });

  it('end to end: Band, Icon, Heroism, Destruction Potion and Judgement of Wisdom through applySetup in a scripted fight (the potion and the Icon pressed from 1 s and 5 s)', () => {
    const enabledBuffs = [
      BAND,
      ICON,
      'heroism',
      'destruction-potion',
      'judgement-of-wisdom',
    ];
    const timed = { heroism: { startSec: 2, durationSec: 40 } };
    const applied = apply({ enabledBuffs, timed });
    const items = [
      { id: 'use-destruction-potion', fromMs: 1000 },
      { id: USE_ICON, fromMs: 5000 },
    ];
    expect(applied.spec.hooks).not.toBe(destructionWarlock.hooks);

    let bandProcs = 0;
    for (const seed of SEEDS) {
      // Constructing checks every scheduled aura id; Band's hook applies auras only applySetup adds.
      const sim = new Simulation({
        spec: applied.spec,
        target: BOSS_TARGET,
        seed,
        distanceFromTarget: applied.sim.distanceFromTarget,
        scheduledAuras: applied.sim.scheduledAuras,
      });
      // Script: each item once from its second (as soon as no cast is in progress), Shadow Bolt
      // whenever possible, Life Tap when it is rejected for mana.
      const used = new Set<string>();
      for (let s = sim.snapshot(); s.phase !== 'ended'; s = sim.snapshot()) {
        for (const it of items) {
          if (!used.has(it.id) && s.nowMs >= it.fromMs && sim.cast(it.id).ok) used.add(it.id);
        }
        const r = sim.cast('shadow-bolt');
        if (!r.ok && r.reason === 'no-mana') sim.cast('life-tap');
        sim.advanceTo(s.nowMs + 10);
      }
      const log = sim.log();
      const applies = (id: string) => log.filter((e) => e.type === 'aura-apply' && e.auraId === id && e.spellId === undefined);
      expect(applies('heroism').map((e) => e.atMs)).toEqual([2000]);
      expect(applies('judgement-of-wisdom').map((e) => e.atMs)).toEqual([0]);
      // The items: one use each, at the first moment no cast was in progress (the first bolt ends
      // at 2431, the third, hasted, at 6180); the aura is applied by the action.
      const itemApplies = (auraId: string) => log.filter((e) => e.type === 'aura-apply' && e.auraId === auraId);
      expect(itemApplies('destruction-potion').map((e) => [e.atMs, e.spellId])).toEqual([[2440, 'use-destruction-potion']]);
      expect(itemApplies(ICON_AURA).map((e) => [e.atMs, e.spellId])).toEqual([[6180, USE_ICON]]);

      // Shadow Bolts started during Heroism (2 s to 42 s) take round(2500 / 1.337) = 1870 ms; outside, 2431.
      const starts = log.filter((e) => e.type === 'cast-start' && e.spellId === 'shadow-bolt');
      const ends = log.filter((e) => e.type === 'cast-complete' && e.spellId === 'shadow-bolt');
      let hasted = 0;
      starts.forEach((st, i) => {
        const end = ends[i];
        if (!end) return;
        const ms = end.atMs - st.atMs;
        if (st.atMs >= 2000 && st.atMs < 42000) {
          expect(Math.abs(ms - 1870), `seed ${seed} start ${st.atMs}`).toBeLessThanOrEqual(1);
          hasted++;
        } else if (st.atMs >= 42000 || st.atMs === 0) {
          // Unhasted (the first one started before Heroism: cast time is fixed at the start).
          expect(ms, `seed ${seed} start ${st.atMs}`).toBe(2431);
        }
      });
      expect(hasted).toBeGreaterThan(15);

      // Judgement of Wisdom procs: mana from landed Shadow Bolts, at most 74 each.
      const jow = log.filter((e) => e.type === 'mana' && e.spellId === 'shadow-bolt');
      expect(jow.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const e of jow) expect(e.amount!).toBeLessThanOrEqual(JUDGEMENT_OF_WISDOM_MANA);

      // Band: its buff and hidden internal cooldown applied together, at most once in 60 s.
      // (Applied by the hook, so logged with the resolving spell's id.)
      const procApplies = (id: string) => log.filter((e) => e.type === 'aura-apply' && e.auraId === id);
      const band = procApplies(BAND_AURA);
      const icd = procApplies(BAND_ICD_AURA_ID);
      for (const e of band) expect(e.spellId).toBe('shadow-bolt');
      expect(band.map((e) => e.atMs)).toEqual(icd.map((e) => e.atMs));
      expect(band.length).toBeLessThanOrEqual(1);
      bandProcs += band.length;
    }
    expect(bandProcs).toBeGreaterThan(0);
  });
});
