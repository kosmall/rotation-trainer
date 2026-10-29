import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import {
  ROTATION_PRESETS,
  buildPriority,
  type CurseChoice,
  type RotationConfig,
} from '../../src/data/classes/warlock/rotation';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import type { PriorityStep } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { projectileTravelMs } from '../../src/engine/travel';
import type { LogEvent, SimSnapshot } from '../../src/engine/types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WINDOWS = [SPELL_QUEUE_WINDOW_MS, 0];
const DOT = ROTATION_PRESETS.dot.config;
const SB_SPAM = ROTATION_PRESETS['sb-spam'].config;

/** The real spec's Simulation as the UI builds it (default distance 28 yd). */
function destructionSim(seed: number, spellQueueWindowMs: number) {
  return new Simulation({
    spec: destructionWarlock,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    infiniteMana: false,
    distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD,
  });
}

const view = (p: readonly PriorityStep[]) => p.map((s) => [s.spellId, s.label, s.hint]);
const ids = (p: readonly PriorityStep[]) => p.map((s) => s.spellId);
const completed = (log: readonly LogEvent[], spellId?: string) =>
  log.filter((e) => e.type === 'cast-complete' && (spellId === undefined || e.spellId === spellId));

function rule(p: readonly PriorityStep[], spellId: string) {
  const when = p.find((s) => s.spellId === spellId)?.when;
  if (!when) throw new Error(`no rule for ${spellId}`);
  return when;
}

/** A running snapshot of the real spec, with fight time left, mana and target auras overridden. */
let baseSnapshot: SimSnapshot | undefined;
function snap(o: { remainingMs?: number; mana?: number; targetAuras?: string[] } = {}): SimSnapshot {
  baseSnapshot ??= destructionSim(1, 0).snapshot();
  const s = baseSnapshot;
  const targetAuras: SimSnapshot['targetAuras'] = {};
  for (const auraId of o.targetAuras ?? []) targetAuras[auraId] = { auraId, stacks: 1, charges: 0, remainingMs: 30000 };
  return {
    ...s,
    phase: 'running',
    nowMs: s.durationMs - (o.remainingMs ?? 30000),
    mana: o.mana ?? s.mana,
    targetAuras,
  };
}

/** Snapshots that exercise every rule of the priority (curse, DoTs, mana, finisher). */
function sampleSnapshots(): SimSnapshot[] {
  const out: SimSnapshot[] = [];
  for (const remainingMs of [60000, 30000, 17000, 3901, 3900, 2501, 2500, 1])
    for (const mana of [0, 398, 399, 1999, 2000, 8000])
      for (const targetAuras of [[], ['curse-of-the-elements', 'immolate', 'corruption'], ['curse-of-doom'], ['curse-of-agony']])
        out.push(snap({ remainingMs, mana, targetAuras }));
  return out;
}

/** The answers of every step's rule on the sample snapshots (true when a step has no rule). */
const behaviour = (p: readonly PriorityStep[], snaps: SimSnapshot[]) =>
  p.map((step) => snaps.map((s) => (step.when ? step.when(s) : true)));

// The Task 2 priority (commit 5e2d8c9), recorded literally: spell ids, labels and hints in order.
const TASK_2_PRIORITY = [
  [
    'curse-of-the-elements',
    'Curse of the Elements',
    'Keep Curse of the Elements on the target: +10% fire and shadow damage taken. One curse per target: another curse replaces it.',
  ],
  [
    'shadowburn',
    'Shadowburn (finisher)',
    'When a Shadow Bolt started now would land after the end (cast + flight time), finish with instant Shadowburn.',
  ],
  [
    'immolate',
    'Immolate',
    'Refresh Immolate when it has less than its cast time left and the fight outlasts the new DoT.',
  ],
  ['corruption', 'Corruption', 'Keep Corruption ticking while a full 18 s DoT still fits in the fight.'],
  ['life-tap', 'Life Tap', 'Out of mana for Shadow Bolt: Life Tap converts health into mana.'],
  [
    'shadow-bolt',
    'Shadow Bolt',
    'Filler: cast Shadow Bolt; its crits apply Improved Shadow Bolt (+20% shadow damage).',
  ],
];

/**
 * Bot mean DPS over seeds 1-10 at the end of stage 1.5 Task 2 (HEAD 33df438, priority still
 * written by hand in destruction.ts), measured with this file's `destructionSim` before the
 * refactor: 1425.18 (window 400) and 1428.34 (window 0), the values the Task 2 report and
 * docs/data-sources.md "Effect on the bot" record as 1425 and 1428. The dot preset must give
 * exactly these (same rules, same order, same RNG draws).
 */
const TASK_2_MEAN_DPS: Record<number, number> = { [SPELL_QUEUE_WINDOW_MS]: 1425.1766666666667, 0: 1428.3350000000003 };

describe('rotation presets and buildPriority', () => {
  it('dot preset equals the Task 2 priority: same spell ids, labels and hints in the same order', () => {
    expect(DOT).toEqual({
      curse: 'elements',
      immolate: true,
      corruption: true,
      shadowburnFinisher: true,
      lifeTapBelowMana: 'auto',
    });
    expect(view(buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD))).toEqual(TASK_2_PRIORITY);
    expect(view(destructionWarlock.priority)).toEqual(TASK_2_PRIORITY);
    // Same rules: the spec's list and a fresh build answer every sample snapshot alike.
    const snaps = sampleSnapshots();
    expect(behaviour(destructionWarlock.priority, snaps)).toEqual(
      behaviour(buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD), snaps),
    );
  });

  it('bot mean DPS over seeds 1–10 with the dot preset equals the value recorded at the end of Task 2', () => {
    const priority = buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD);
    for (const w of WINDOWS) {
      const dps = SEEDS.map((seed) => runBot(destructionSim(seed, w), priority).dps);
      const mean = dps.reduce((a, b) => a + b, 0) / dps.length;
      expect(mean, `window ${w}`).toBeCloseTo(TASK_2_MEAN_DPS[w] ?? Number.NaN, 6);
    }
  });

  it('sb-spam has no Immolate or Corruption step and the bot casts neither (log has no aura-apply for them), casts Curse of Doom first, Shadow Bolt as filler, Shadowburn last at most once', () => {
    expect(ROTATION_PRESETS['sb-spam'].name).not.toBe(ROTATION_PRESETS.dot.name);
    expect(SB_SPAM).toEqual({
      curse: 'doom',
      immolate: false,
      corruption: false,
      shadowburnFinisher: true,
      lifeTapBelowMana: 'auto',
    });
    const priority = buildPriority(SB_SPAM, DEFAULT_DISTANCE_FROM_TARGET_YD);
    expect(ids(priority)).toEqual(['curse-of-doom', 'shadowburn', 'life-tap', 'shadow-bolt']);
    for (const w of WINDOWS) {
      for (const seed of SEEDS) {
        const sim = destructionSim(seed, w);
        runBot(sim, priority);
        const log = sim.log();
        const tag = `window ${w} seed ${seed}`;
        for (const dot of ['immolate', 'corruption']) {
          expect(log.filter((e) => e.type === 'aura-apply' && e.auraId === dot), tag).toEqual([]);
          expect(log.filter((e) => e.spellId === dot), tag).toEqual([]);
        }
        const done = completed(log);
        // Curse of Doom opens the fight and is cast once (60 s cooldown).
        expect(done[0], tag).toMatchObject({ spellId: 'curse-of-doom', atMs: 0 });
        expect(completed(log, 'curse-of-doom'), tag).toHaveLength(1);
        // Shadow Bolt fills everything else, apart from Life Tap.
        const others = done.slice(1).filter((e) => e.spellId !== 'life-tap' && e.spellId !== 'shadowburn');
        expect(new Set(others.map((e) => e.spellId)), tag).toEqual(new Set(['shadow-bolt']));
        expect(others.length, tag).toBeGreaterThanOrEqual(18);
        // Shadowburn at most once, as the last completed spell, within the finisher window.
        const burns = completed(log, 'shadowburn');
        expect(burns.length, tag).toBeLessThanOrEqual(1);
        if (burns.length === 1) {
          expect(done.at(-1)?.spellId, tag).toBe('shadowburn');
          expect(burns[0]?.atMs ?? 0, tag).toBeGreaterThanOrEqual(60000 - (2500 + 1400));
        }
      }
    }
  });

  it('each flag removes exactly its step', () => {
    const full = view(buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD));
    const flags: [keyof RotationConfig, string][] = [
      ['immolate', 'immolate'],
      ['corruption', 'corruption'],
      ['shadowburnFinisher', 'shadowburn'],
    ];
    for (const [flag, spellId] of flags) {
      const p = buildPriority({ ...DOT, [flag]: false }, DEFAULT_DISTANCE_FROM_TARGET_YD);
      expect(view(p), flag).toEqual(full.filter((row) => row[0] !== spellId));
    }
    const none = buildPriority(
      { ...DOT, immolate: false, corruption: false, shadowburnFinisher: false, curse: 'none' },
      DEFAULT_DISTANCE_FROM_TARGET_YD,
    );
    expect(ids(none)).toEqual(['life-tap', 'shadow-bolt']);
  });

  it("curse 'none' removes the curse step", () => {
    const p = buildPriority({ ...DOT, curse: 'none' }, DEFAULT_DISTANCE_FROM_TARGET_YD);
    expect(view(p)).toEqual(TASK_2_PRIORITY.slice(1));
    expect(ids(p).filter((id) => id.startsWith('curse-'))).toEqual([]);
  });

  it('curse choices map to curse-of-the-elements / curse-of-agony / curse-of-doom with the matching aura check', () => {
    const curses: [CurseChoice, string, string][] = [
      ['elements', 'curse-of-the-elements', 'Curse of the Elements'],
      ['agony', 'curse-of-agony', 'Curse of Agony'],
      ['doom', 'curse-of-doom', 'Curse of Doom'],
    ];
    for (const [curse, id, name] of curses) {
      const p = buildPriority({ ...DOT, curse }, DEFAULT_DISTANCE_FROM_TARGET_YD);
      const first = p[0];
      expect(first?.spellId, curse).toBe(id);
      expect(first?.label, curse).toBe(name);
      expect(first?.hint, curse).toContain(name);
      expect(first?.hint, curse).toContain('another curse replaces it');
      // The rest of the list does not depend on the curse.
      expect(view(p.slice(1)), curse).toEqual(TASK_2_PRIORITY.slice(1));
      const when = rule(p, id);
      expect(when(snap()), `${curse}: nothing on the target`).toBe(true);
      expect(when(snap({ targetAuras: [id] })), `${curse}: its aura is up`).toBe(false);
      // Another curse on the target does not satisfy it: casting it replaces that curse.
      for (const [, other] of curses) {
        if (other !== id) expect(when(snap({ targetAuras: [other] })), `${curse} vs ${other}`).toBe(true);
      }
    }
  });

  it("lifeTapBelowMana 2000 casts Life Tap below 2000 mana and 'auto' below 399", () => {
    const at2000 = rule(buildPriority({ ...DOT, lifeTapBelowMana: 2000 }, DEFAULT_DISTANCE_FROM_TARGET_YD), 'life-tap');
    expect(at2000(snap({ mana: 1999 }))).toBe(true);
    expect(at2000(snap({ mana: 2000 }))).toBe(false);
    const auto = rule(buildPriority(DOT, DEFAULT_DISTANCE_FROM_TARGET_YD), 'life-tap');
    expect(auto(snap({ mana: 398 }))).toBe(true);
    expect(auto(snap({ mana: 399 }))).toBe(false);
    expect(auto(snap({ mana: 1999 }))).toBe(false);
    // The hint names the threshold.
    const hint = buildPriority({ ...DOT, lifeTapBelowMana: 2000 }, 0).find((s) => s.spellId === 'life-tap')?.hint;
    expect(hint).toContain('2000');

    // The bot: every accepted Life Tap press happens below 2000 mana, some of them at or above 399.
    for (const w of WINDOWS) {
      const sim = destructionSim(1, w);
      const taps: number[] = [];
      const cast = sim.cast.bind(sim);
      sim.cast = (spellId: string) => {
        const { mana } = sim.snapshot();
        const result = cast(spellId);
        if (spellId === 'life-tap' && result.ok) taps.push(mana);
        return result;
      };
      runBot(sim, buildPriority({ ...SB_SPAM, lifeTapBelowMana: 2000 }, DEFAULT_DISTANCE_FROM_TARGET_YD));
      expect(taps.length, `window ${w}`).toBeGreaterThan(0);
      for (const mana of taps) expect(mana, `window ${w}`).toBeLessThan(2000);
      expect(taps.some((mana) => mana >= 399), `window ${w}`).toBe(true);
    }
  });

  it('lifeTapBelowMana must be a number >= 0 or auto', () => {
    for (const bad of [Number.NaN, -1]) {
      expect(() => buildPriority({ ...DOT, lifeTapBelowMana: bad }, DEFAULT_DISTANCE_FROM_TARGET_YD)).toThrow(RangeError);
    }
    expect(() => buildPriority({ ...DOT, lifeTapBelowMana: 0 }, DEFAULT_DISTANCE_FROM_TARGET_YD)).not.toThrow();
  });

  it('an unknown curse id throws a RangeError', () => {
    for (const bad of ['foo', 'toString', '']) {
      expect(() => buildPriority({ ...DOT, curse: bad as RotationConfig['curse'] }, DEFAULT_DISTANCE_FROM_TARGET_YD)).toThrow(RangeError);
    }
  });

  it('the presets are frozen all the way down', () => {
    expect(Object.isFrozen(ROTATION_PRESETS)).toBe(true);
    for (const preset of Object.values(ROTATION_PRESETS)) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.config)).toBe(true);
    }
  });

  it('buildPriority is pure: same input twice gives equal output and does not mutate the preset configs', () => {
    const before = structuredClone(ROTATION_PRESETS);
    const snaps = sampleSnapshots();
    for (const { config } of Object.values(ROTATION_PRESETS)) {
      const a = buildPriority(config, DEFAULT_DISTANCE_FROM_TARGET_YD);
      const b = buildPriority(config, DEFAULT_DISTANCE_FROM_TARGET_YD);
      expect(view(a)).toEqual(view(b));
      expect(behaviour(a, snaps)).toEqual(behaviour(b, snaps));
      // Fresh arrays and steps: changing one result does not touch the other.
      expect(a).not.toBe(b);
      a.forEach((step, i) => expect(step).not.toBe(b[i]));
    }
    expect(ROTATION_PRESETS).toEqual(before);
    // A frozen config is accepted (nothing writes to it).
    const frozen = Object.freeze({ ...DOT });
    expect(view(buildPriority(frozen, DEFAULT_DISTANCE_FROM_TARGET_YD))).toEqual(TASK_2_PRIORITY);
    // The shared spec's list is untouched by later builds.
    expect(view(destructionWarlock.priority)).toEqual(TASK_2_PRIORITY);
  });

  it("distanceYd changes only the finisher window (28 vs 0 differs by Shadow Bolt's travel time)", () => {
    const far = buildPriority(DOT, 28);
    const near = buildPriority(DOT, 0);
    expect(view(far)).toEqual(view(near));
    const snaps = sampleSnapshots();
    const others = (p: PriorityStep[]) => p.filter((s) => s.spellId !== 'shadowburn');
    expect(behaviour(others(far), snaps)).toEqual(behaviour(others(near), snaps));

    const travel = projectileTravelMs(20, 28);
    expect(travel).toBe(1400);
    const windowMs = (p: PriorityStep[]) => {
      const when = rule(p, 'shadowburn');
      let ms = 0;
      while (when(snap({ remainingMs: ms + 1 }))) ms++;
      return ms;
    };
    expect(windowMs(near)).toBe(2500);
    expect(windowMs(far)).toBe(2500 + travel);
    // Odd distances give no travel rather than a broken window.
    for (const bad of [-5, Number.NaN]) expect(windowMs(buildPriority(DOT, bad))).toBe(2500);
  });
});
