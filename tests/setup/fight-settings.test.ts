// Fight settings (item actions and fight settings, Task 3; design spec §3): the fight length
// (`SetupConfig.fightDurationSec`, 10-600 s, default 60) and how the item rules treat Heroism in a
// fight longer than one item cooldown. Sources and rules: docs/data-sources.md, "Part C: setup
// rules and calibration" and "Part D: item actions".

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { buildItemSteps } from '../../src/data/classes/warlock/itemRules';
import { deepFreeze } from '../../src/data/common/buffs';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { Simulation } from '../../src/engine/sim';
import type { LogEvent, SimSnapshot } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, SETUP_LIMITS } from '../../src/setup/defaults';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig } from '../../src/setup/types';

deepFreeze(destructionWarlock);
deepFreeze(SETUP_CATALOG);

const ICON = 'use-icon-of-the-silver-crescent';
const DESTRUCTION = 'use-destruction-potion';
const SUPER_MANA = 'use-super-mana-potion';
const DARK_RUNE = 'use-dark-rune';
const ITEM_IDS = [ICON, DESTRUCTION, SUPER_MANA, DARK_RUNE];

const norm = (input: unknown) => normalizeSetup(input, SETUP_CATALOG);

function config(p: Partial<SetupConfig> = {}): SetupConfig {
  return deepFreeze({ ...structuredClone(DEFAULT_SETUP), ...p });
}

const apply = (p: Partial<SetupConfig> = {}) =>
  applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config: config(p) });

/** A fight exactly as the UI builds it from the applied setup (useSimulation), with a fixed seed. */
function fight(applied: ReturnType<typeof apply>, seed = 1): Simulation {
  return new Simulation({
    spec: applied.spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
    distanceFromTarget: applied.sim.distanceFromTarget,
    scheduledAuras: applied.sim.scheduledAuras,
    durationMs: applied.sim.durationMs,
  });
}

const heroismAt = (startSec: number, durationSec = 40): Partial<SetupConfig> => ({
  timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec, durationSec } },
});

const uses = (log: readonly LogEvent[], spellId: string): number[] =>
  log.filter((e) => e.type === 'cast-complete' && e.spellId === spellId).map((e) => e.atMs);

/** Records every accepted item press with the snapshot the bot saw just before it. */
function recordItemPresses(sim: Simulation) {
  const presses: { spellId: string; before: SimSnapshot }[] = [];
  const cast = sim.cast.bind(sim);
  sim.cast = (spellId: string) => {
    if (!ITEM_IDS.includes(spellId)) return cast(spellId);
    const before = sim.snapshot();
    const result = cast(spellId);
    if (result.ok) presses.push({ spellId, before });
    return result;
  };
  return presses;
}

// ---------------------------------------------------------------------------
// normalizeSetup
// ---------------------------------------------------------------------------

describe('fight length: config and normalizeSetup', () => {
  it('DEFAULT_SETUP has a 60 s fight; SETUP_LIMITS.fightDurationSec is 10-600; both presets keep 60 s and the raid preset Heroism at 6.4 s', () => {
    expect(DEFAULT_SETUP.fightDurationSec).toBe(60);
    expect(SETUP_LIMITS.fightDurationSec).toEqual({ min: 10, max: 600 });
    expect(Object.isFrozen(SETUP_LIMITS.fightDurationSec)).toBe(true);
    expect(SETUP_PRESETS.none.config.fightDurationSec).toBe(60);
    expect(SETUP_PRESETS['raid-log'].config.fightDurationSec).toBe(60);
    expect(SETUP_PRESETS['raid-log'].config.timed.heroism).toEqual({ startSec: 6.4, durationSec: 40 });
  });

  it("fightDurationSec: missing → 60; '90', NaN, null, ±Infinity, an object → 60; 5 → 10; -30 → 10; 9999 and 1e9 → 600; 90.7 → 91; 10.5 → 11", () => {
    const len = (v: unknown) => norm({ ...structuredClone(DEFAULT_SETUP), fightDurationSec: v }).fightDurationSec;
    const { fightDurationSec: _omit, ...withoutField } = structuredClone(DEFAULT_SETUP);
    expect(norm(withoutField).fightDurationSec).toBe(60);
    for (const v of ['90', Number.NaN, null, undefined, Infinity, -Infinity, {}, [120], true]) {
      expect(len(v), String(v)).toBe(60);
    }
    expect(len(5)).toBe(10);
    expect(len(-30)).toBe(10);
    expect(len(0)).toBe(10);
    expect(len(9999)).toBe(600);
    expect(len(1e9)).toBe(600);
    expect(len(90.7)).toBe(91);
    expect(len(10.5)).toBe(11);
    expect(len(599.6)).toBe(600);
    expect(len(120)).toBe(120);
  });

  it('an old stored v1 (stage 1.5: no fightDurationSec, timed Icon and Destruction Potion starts) gets 60 s, loses the Icon/potion timed entries and keeps the rest; idempotent', () => {
    const oldV1 = {
      version: 1,
      enabledBuffs: ['heroism', 'destruction-potion', 'icon-of-the-silver-crescent', 'misery'],
      timed: {
        heroism: { startSec: 6.4, durationSec: 40 },
        'destruction-potion': { startSec: 7.5, durationSec: 15 },
        'icon-of-the-silver-crescent': { startSec: 30.2, durationSec: 20 },
      },
      rotation: { curse: 'doom', immolate: false, corruption: false, shadowburnFinisher: true, lifeTapBelowMana: 'auto' },
      distanceYd: 12,
      warlock: { armor: 'demon', sacrificeSuccubus: false },
    };
    const out = norm(oldV1);
    expect(out.fightDurationSec).toBe(60);
    expect(out.timed).toEqual({ heroism: { startSec: 6.4, durationSec: 40 } });
    expect(out.enabledBuffs).toEqual(['heroism', 'destruction-potion', 'icon-of-the-silver-crescent', 'misery']);
    expect(out.distanceYd).toBe(12);
    expect(out.rotation.curse).toBe('doom');
    expect(out.warlock).toEqual({ armor: 'demon', sacrificeSuccubus: false });
    expect(out.version).toBe(1); // no version bump
    expect(norm(out)).toEqual(out);
    expect(norm({ ...out, fightDurationSec: 300 })).toEqual({ ...out, fightDurationSec: 300 });
  });
});

// ---------------------------------------------------------------------------
// applySetup
// ---------------------------------------------------------------------------

describe('fight length: applySetup', () => {
  it('applySetup returns durationMs = fightDurationSec x 1000 (default 60000)', () => {
    expect(apply().sim.durationMs).toBe(60000);
    expect(applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config: DEFAULT_SETUP }).sim.durationMs).toBe(60000);
    expect(apply({ fightDurationSec: 30 }).sim.durationMs).toBe(30000);
    expect(apply({ fightDurationSec: 600 }).sim.durationMs).toBe(600000);
  });

  it('a 120 s fight: the fight ends at 120 s, regen ticks run past 60 s, a second Life Tap works; same seed and config give identical damage totals', () => {
    const applied = apply({ fightDurationSec: 120 });
    const sim = fight(applied);
    expect(sim.snapshot().durationMs).toBe(120000);
    expect(sim.cast('life-tap').ok).toBe(true);
    sim.advanceTo(62000);
    expect(sim.snapshot().phase).toBe('running');
    expect(sim.cast('shadow-bolt').ok).toBe(true); // spends mana: the regen ticks after it log gains
    sim.advanceTo(70000);
    expect(sim.cast('life-tap').ok).toBe(true);
    sim.advanceTo(200000);
    const s = sim.snapshot();
    expect(s.phase).toBe('ended');
    expect(s.nowMs).toBe(120000);
    const log = sim.log();
    expect(uses(log, 'life-tap')).toEqual([0, 70000]);
    expect(log.filter((e) => e.type === 'mana' && e.spellId === 'life-tap' && e.atMs === 70000)).toHaveLength(1);
    const ticks = log.filter((e) => e.type === 'mana' && e.spellId === undefined && e.atMs > 60000);
    expect(ticks.length).toBeGreaterThan(0);
    expect(Math.max(...ticks.map((e) => e.atMs))).toBeLessThanOrEqual(120000);

    const a = runBot(fight(applied, 7), applied.spec.priority);
    const b = runBot(fight(applied, 7), applied.spec.priority);
    expect(a).toEqual(b);
    expect(a.dps).toBeCloseTo(a.damageTotal / 120, 9);
  });
});

// ---------------------------------------------------------------------------
// Item rules in long fights (ledger "Carry to F3")
// ---------------------------------------------------------------------------

describe('item rules with Heroism in fights longer than one cooldown', () => {
  /** A running snapshot without Heroism up, at `nowMs`. */
  function snapshotAt(nowMs: number): SimSnapshot {
    const sim = new Simulation({ spec: destructionWarlock, target: BOSS_TARGET, seed: 1, durationMs: 600000 });
    sim.cast('life-tap');
    sim.advanceTo(nowMs);
    const s = sim.snapshot();
    expect(s.cast).toBeNull();
    expect(s.selfAuras['heroism']).toBeUndefined();
    return s;
  }

  it('buildItemSteps with Heroism ending at 46.4 s: the Icon and the potion wait before Heroism, are wanted while it is up and again once it is over', () => {
    const heroism = { auraId: 'heroism', stacks: 1, charges: 0, remainingMs: 30000 };
    for (const id of [ICON, DESTRUCTION]) {
      const when = (s: SimSnapshot) => buildItemSteps([id], 46400)[0]!.when!(s);
      const before = snapshotAt(2000);
      expect(when(before), id).toBe(false);
      expect(when({ ...before, selfAuras: { ...before.selfAuras, heroism } }), id).toBe(true);
      expect(when({ ...snapshotAt(46390) }), `${id} 10 ms before the end`).toBe(false);
      expect(when(snapshotAt(46400)), `${id} at the end`).toBe(true);
      expect(when(snapshotAt(130000)), `${id} long after`).toBe(true);
      // No Heroism in the setup: always.
      expect(buildItemSteps([id], null)[0]!.when!(before), id).toBe(true);
    }
    // The hints say both.
    expect(buildItemSteps([ICON], 46400)[0]!.hint).toMatch(/while Heroism is up.*46\.4 s/);
    expect(buildItemSteps([ICON], null)[0]!.hint).toMatch(/pull/);
  });

  it('applySetup: Heroism enabled but starting at or after the fight end counts as not enabled for the item rules (no waiting forever)', () => {
    const at0 = snapshotAt(2000);
    const iconWhen = (p: Partial<SetupConfig>) => {
      const steps = apply(p).spec.priority;
      const step = steps.find((s) => s.spellId === ICON)!;
      return step.when!(at0);
    };
    const items = ['heroism', 'icon-of-the-silver-crescent'];
    expect(iconWhen({ enabledBuffs: items, ...heroismAt(6.4) })).toBe(false); // waits for Heroism
    expect(iconWhen({ enabledBuffs: items, ...heroismAt(70) })).toBe(true); // 60 s fight: never up
    expect(iconWhen({ enabledBuffs: items, ...heroismAt(60) })).toBe(true); // at the end exactly: never up
    expect(iconWhen({ enabledBuffs: items, ...heroismAt(70), fightDurationSec: 120 })).toBe(false); // up at 70 s
    expect(iconWhen({ enabledBuffs: ['icon-of-the-silver-crescent'], ...heroismAt(6.4) })).toBe(true); // Heroism off

    // In a fight: Heroism at 70 s of a 60 s fight, the Icon is used at the pull.
    const applied = apply({ enabledBuffs: items, ...heroismAt(70) });
    const sim = fight(applied);
    runBot(sim, applied.spec.priority);
    const at = uses(sim.log(), ICON);
    expect(at).toHaveLength(1);
    expect(at[0]!).toBeLessThan(100);
  });

  it('bot, 300 s fight, Heroism at 6.4 s: the Icon and Destruction Potion are used during Heroism, then again whenever ready (~120 s after each use); Dark Rune keeps its 1500 threshold', () => {
    const applied = apply({
      enabledBuffs: ['heroism', 'destruction-potion', 'dark-rune', 'icon-of-the-silver-crescent'],
      ...heroismAt(6.4),
      fightDurationSec: 300,
    });
    expect(applied.sim.durationMs).toBe(300000);
    let runes = 0;
    for (const seed of [1, 2, 3]) {
      const sim = fight(applied, seed);
      const presses = recordItemPresses(sim);
      runBot(sim, applied.spec.priority, 20);
      expect(sim.snapshot().nowMs).toBe(300000);
      for (const id of [ICON, DESTRUCTION]) {
        const at = uses(sim.log(), id);
        expect(at, `seed ${seed} ${id}`).toHaveLength(3);
        expect(at[0]!, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(6400);
        expect(at[0]!, `seed ${seed} ${id}`).toBeLessThan(6400 + 3000);
        for (let i = 1; i < at.length; i++) {
          expect(at[i]! - at[i - 1]!, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(120000);
          expect(at[i]! - at[i - 1]!, `seed ${seed} ${id}`).toBeLessThan(120000 + 3000);
        }
      }
      for (const p of presses.filter((x) => x.spellId === DARK_RUNE)) {
        expect(p.before.maxMana - p.before.mana, `seed ${seed}`).toBeGreaterThanOrEqual(1500);
        runes++;
      }
    }
    expect(runes).toBeGreaterThan(0);
  });

  it('bot, 300 s fight, Heroism at 6.4 s: Super Mana Potion only at >= 3000 missing mana and Dark Rune at >= 1500, the potion group never inside 120 s', () => {
    const applied = apply({
      enabledBuffs: ['heroism', 'super-mana-potion', 'dark-rune', 'icon-of-the-silver-crescent'],
      ...heroismAt(6.4),
      fightDurationSec: 300,
    });
    let manaPots = 0;
    let runes = 0;
    for (const seed of [1, 2, 3]) {
      const sim = fight(applied, seed);
      const presses = recordItemPresses(sim);
      runBot(sim, applied.spec.priority, 20);
      for (const p of presses) {
        if (p.spellId === SUPER_MANA) {
          expect(p.before.maxMana - p.before.mana, `seed ${seed}`).toBeGreaterThanOrEqual(3000);
          manaPots++;
        }
        if (p.spellId === DARK_RUNE) {
          expect(p.before.maxMana - p.before.mana, `seed ${seed}`).toBeGreaterThanOrEqual(1500);
          runes++;
        }
      }
      const pots = uses(sim.log(), SUPER_MANA);
      for (let i = 1; i < pots.length; i++) expect(pots[i]! - pots[i - 1]!).toBeGreaterThanOrEqual(120000);
      expect(uses(sim.log(), ICON), `seed ${seed}`).toHaveLength(3);
    }
    expect(manaPots).toBeGreaterThan(0);
    expect(runes).toBeGreaterThan(0);
  });
});
