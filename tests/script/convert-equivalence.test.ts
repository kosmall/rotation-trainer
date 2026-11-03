// "Convert to script" (Task 2, Review Focus 1): over many setups the converted script plays
// BYTE-IDENTICAL fights to the basic configurator: full log hashes, log lengths, RNG draws and
// DPS per seed (1-10) at spell queue windows 400 and 0, the same steps in the same order with
// conditions equal on thousands of random snapshots, and the golden means unchanged.

import { describe, expect, it } from 'vitest';
import { GEAR_PRESETS } from '../../src/data/classes/warlock/gearPresets';
import { ROTATION_PRESETS, type RotationConfig } from '../../src/data/classes/warlock/rotation';
import { encodeTalents } from '../../src/data/classes/warlock/talentTree';
import { talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import { itemDbSync } from '../../src/data/items/dbSync';
import { createRng } from '../../src/engine/rng';
import type { SimSnapshot } from '../../src/engine/types';
import { convertToScript } from '../../src/script/convert';
import { parseExpr } from '../../src/script/parser';
import { printExpr } from '../../src/script/printer';
import { validateScript } from '../../src/script/validate';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { perfScenarios } from '../fixtures/bot-perf-scenarios';
import { randomSnapshots } from '../fixtures/item-use-reference';
import { applyConfig, botRuns } from '../fixtures/script-fights';

const db = itemDbSync();
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const base = (): SetupConfig => structuredClone(DEFAULT_SETUP) as SetupConfig;
const dot = (o: Partial<RotationConfig> = {}): RotationConfig => ({ ...ROTATION_PRESETS.dot.config, ...o });
const heroismAt = (startSec: number, durationSec = 40) => ({ ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec, durationSec } });
const NO_TALENTS = encodeTalents({});
const ALL_ITEMS = ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370', 'item:29305'];

/** Every scenario: the 23 pinned bot scenarios plus talents, curses, DoTs, finisher, Life Tap, item rules, distances and fight lengths. */
function scenarios(): Record<string, SetupConfig> {
  const out: Record<string, SetupConfig> = { ...perfScenarios(db) };
  for (const id of ['destruction', 'destro-nightfall', 'affliction']) {
    out[`talents-${id}`] = { ...base(), talents: talentPresetById(id)!.talents };
    out[`talents-${id}-items`] = { ...base(), talents: talentPresetById(id)!.talents, enabledBuffs: ALL_ITEMS, timed: heroismAt(5), fightDurationSec: 120 };
  }
  out['talents-none'] = { ...base(), talents: NO_TALENTS, distanceYd: 0 };
  out['talents-none-sbspam'] = { ...base(), talents: NO_TALENTS, rotation: { ...ROTATION_PRESETS['sb-spam'].config } };
  for (const curse of ['doom', 'agony', 'elements', 'none'] as const) {
    for (const len of [10, 60, 300]) {
      out[`curse-${curse}-${len}`] = { ...base(), rotation: dot({ curse }), fightDurationSec: len };
    }
    out[`curse-${curse}-nodots`] = { ...base(), rotation: dot({ curse, immolate: false, corruption: false }), fightDurationSec: 90 };
  }
  out.immolateOnly = { ...base(), rotation: dot({ corruption: false }), distanceYd: 0 };
  out.corruptionOnly = { ...base(), rotation: dot({ immolate: false }), fightDurationSec: 300 };
  out.noFinisher = { ...base(), rotation: dot({ shadowburnFinisher: false }) };
  out.noFinisher0yd = { ...base(), rotation: dot({ shadowburnFinisher: false, curse: 'doom' }), distanceYd: 0, fightDurationSec: 10 };
  out.lifeTap0 = { ...base(), rotation: dot({ lifeTapBelowMana: 0 }) };
  out.lifeTapFraction = { ...base(), rotation: dot({ lifeTapBelowMana: 1234.5678 }), fightDurationSec: 300 };
  out.lifeTapHigh = { ...base(), rotation: dot({ lifeTapBelowMana: 9000 }) };
  out.dist0 = { ...base(), distanceYd: 0 };
  out.dist13 = { ...base(), distanceYd: 13.7 };
  out.heroismAfterEnd = { ...base(), enabledBuffs: ALL_ITEMS, timed: heroismAt(70), fightDurationSec: 60 };
  // Every trigger kind, windows, gaps and orders, odd numbers included.
  out.everyTrigger = {
    ...base(),
    enabledBuffs: ALL_ITEMS,
    timed: heroismAt(12.3),
    fightDurationSec: 300,
    rotation: dot({
      curse: 'agony',
      itemUse: {
        'destruction-potion': { trigger: { kind: 'with-buff', auraId: 'heroism' }, notAfterSec: 250.123 },
        'super-mana-potion': { trigger: { kind: 'mana-below', mana: 3333 }, minGapSec: 45.5 },
        'dark-rune': { trigger: { kind: 'mana-missing', amount: 1111 }, notBeforeSec: 33.333 },
        'item:29370': { trigger: { kind: 'at', sec: 17.777 }, minGapSec: 200 },
      },
      itemUseOrder: ['item:29370', 'dark-rune'],
    }),
  };
  out.everyTrigger2 = {
    ...base(),
    enabledBuffs: ALL_ITEMS,
    timed: heroismAt(0),
    fightDurationSec: 180,
    rotation: dot({
      itemUse: {
        'destruction-potion': { trigger: { kind: 'fight-end', lastSec: 40.5 } },
        'super-mana-potion': { trigger: { kind: 'never' } },
        'dark-rune': { trigger: { kind: 'ready' }, minGapSec: 0.001 },
        'item:29370': { trigger: { kind: 'pull' } },
      },
    }),
  };
  out.everyTrigger3 = {
    ...base(),
    enabledBuffs: ALL_ITEMS,
    fightDurationSec: 200,
    rotation: dot({
      itemUse: {
        'destruction-potion': { trigger: { kind: 'with-heroism' }, notBeforeSec: 1.005 },
        'dark-rune': { trigger: { kind: 'with-buff', auraId: 'not-in-this-fight' } },
        'item:29370': { trigger: { kind: 'with-buff', auraId: 'destruction-potion' }, minGapSec: 10 },
        'super-mana-potion': { trigger: { kind: 'mana-missing', amount: 0 } },
      },
      itemUseOrder: ['super-mana-potion'],
    }),
  };
  return out;
}

const SCENARIOS = scenarios();

/** The applied basic setup, its converted script and the applied converted setup (both normalized like stored data). */
function convert(config: SetupConfig) {
  const basic = applyConfig(config, db);
  const script = convertToScript(normalizeSetup(config, SETUP_CATALOG, db), basic.basic);
  const scripted = applyConfig({ ...config, script }, db);
  return { basic, script, scripted };
}

/** Random snapshots with target auras, casts and missiles of the rotation's spells as well. */
function snapshots(seed: number, n: number): SimSnapshot[] {
  const r = createRng(seed * 7919);
  const auras = ['immolate', 'corruption', 'curse-of-the-elements', 'curse-of-agony', 'curse-of-doom', 'shadow-vulnerability'];
  const spells = ['immolate', 'corruption', 'shadow-bolt', 'curse-of-doom'];
  return randomSnapshots(seed, n).map((s) => {
    const targetAuras: SimSnapshot['targetAuras'] = {};
    for (const id of auras) {
      if (r.next() < 0.5) targetAuras[id] = { auraId: id, stacks: 1, charges: 0, remainingMs: Math.floor(r.next() * (r.next() < 0.5 ? 3000 : 60000)) };
    }
    const cast = r.next() < 0.3 ? { spellId: spells[Math.floor(r.next() * spells.length)]!, startMs: s.nowMs, endMs: s.nowMs + 1500 } : s.cast;
    const inFlight = r.next() < 0.2 ? [{ spellId: spells[Math.floor(r.next() * spells.length)]!, landsAtMs: s.nowMs + 500 }] : [];
    const mana = r.next() < 0.2 ? Math.floor(r.next() * 600) + (r.next() < 0.5 ? 0.5 : 0) : s.mana;
    return { ...s, targetAuras, cast, inFlight, mana };
  });
}

describe('convertToScript reproduces the basic configurator exactly', () => {
  it(`covers ${Object.keys(SCENARIOS).length} scenarios`, () => {
    expect(Object.keys(SCENARIOS).length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(SCENARIOS).filter((k) => k.startsWith('gear-'))).toHaveLength(GEAR_PRESETS.length);
  });

  for (const name of Object.keys(SCENARIOS)) {
    it(`${name}: same steps, conditions equal on 3000 random snapshots, byte-identical fights (seeds 1-10, windows 400 and 0)`, () => {
      const { basic, script, scripted } = convert(SCENARIOS[name]!);
      // A clean script: no error; warnings only where the basic step can never be played: the
      // build's missing Shadowburn (buildPriority leaves it out, rotationWarnings) and a with-buff
      // rule on an aura this fight does not have (its basic step is never wanted).
      const ctx = basic.script.context;
      const v = validateScript(script, ctx);
      expect(v.errors).toEqual([]);
      const expected: string[] = [];
      script.rules.forEach((r, i) => {
        if (r.id === 'shadowburn' && !ctx.spellIds.includes('shadowburn')) expected.push(`rules[${i}].id unknown spell 'shadowburn'`);
        const aura = /^self\.aura\.([^.]+)\.active$/.exec(r.if?.split(' && ').at(-1) ?? '')?.[1];
        if (aura !== undefined && !ctx.auraIds.includes(aura)) expected.push(`rules[${i}].if column ${r.if!.lastIndexOf('self.aura') + 1}: unknown aura '${aura}'`);
      });
      expect(v.warnings.map((w) => `${w.path} ${w.message}`)).toEqual(expected);
      // Canonical conditions.
      for (const r of script.rules) if (r.if !== undefined) expect(printExpr((parseExpr(r.if) as { ok: true; ast: never }).ast)).toBe(r.if);
      expect(scripted.script.active).toBe(true);
      expect(scripted.script.errors).toEqual([]);
      // The rules left out (with-buff on an absent aura) are basic steps that are never wanted.
      const leftOut = new Set(
        scripted.script.warnings.filter((w) => w.message.startsWith('rule left out')).map((w) => Number(/\d+/.exec(w.path)![0])),
      );
      const neverWanted = script.rules.flatMap((r, i) => (leftOut.has(i) && r.action === 'use' ? [scripted.script.context.itemActions.find((x) => x.id === r.id)!.spellId] : []));
      const snaps = snapshots(Object.keys(SCENARIOS).indexOf(name) + 1, 3000);
      for (const id of neverWanted) {
        const step = basic.spec.priority.find((s) => s.spellId === id)!;
        expect(snaps.every((s) => !step.when!(s))).toBe(true);
      }
      const a = basic.spec.priority.filter((s) => !neverWanted.includes(s.spellId));
      const b = scripted.spec.priority;
      expect(b.map((s) => [s.spellId, s.label, s.hint])).toEqual(a.map((s) => [s.spellId, s.label, s.hint]));
      for (const [i, s] of snaps.entries()) {
        for (let k = 0; k < a.length; k++) {
          const wa = a[k]!.when === undefined || a[k]!.when!(s);
          const wb = b[k]!.when === undefined || b[k]!.when!(s);
          if (wa !== wb) expect(`${name} snapshot ${i} step ${a[k]!.spellId}: ${wb}`).toBe(`${wa}`);
        }
      }
      expect(botRuns(scripted, SEEDS)).toEqual(botRuns(basic, SEEDS));
    }, 60000);
  }

  it('golden means stay exact through the converted script', () => {
    const mean = (c: SetupConfig, w: number) => botRuns(convert(c).scripted, SEEDS, [w])[w]!.mean;
    const s = perfScenarios(db);
    expect(mean(s.default!, 400)).toBe(1425.1766666666667);
    expect(mean(s.default!, 0)).toBe(1428.3350000000003);
    expect(mean(s.raidLog!, 400)).toBe(2294.108333333333);
    expect(mean(s.iconBand!, 400)).toBe(1379.2966666666666);
    expect(mean(s.iconBand!, 0)).toBe(1373.4900000000002);
  });

  it('the default setup converts to a readable script', () => {
    const { script } = convert(base());
    expect(script.rules.map((r) => [r.action, r.id, r.if])).toEqual([
      ['cast', 'curse-of-the-elements', '!target.aura.curse-of-the-elements.active'],
      ['cast', 'shadowburn', 'time.remaining <= finisherWindow()'],
      ['cast', 'immolate', 'dotRefreshDue(immolate)'],
      ['cast', 'corruption', 'dotRefreshDue(corruption)'],
      ['cast', 'life-tap', 'mana < manaCost(shadow-bolt)'],
      ['cast', 'shadow-bolt', undefined],
    ]);
    const rules = convert(SCENARIOS.everyTrigger!).script.rules.filter((r) => r.action === 'use');
    expect(rules.map((r) => [r.id, r.if])).toEqual([
      ['item:29370', 'minGap(item:29370, 200) && time.elapsedMs >= 17777'],
      ['dark-rune', 'time.elapsedMs >= 33333 && mana.missing >= 1111'],
      ['destruction-potion', 'time.elapsedMs <= 250123 && self.aura.heroism.active'],
      ['super-mana-potion', 'minGap(super-mana-potion, 45.5) && mana < 3333'],
    ]);
    const doom = convert({ ...base(), rotation: dot({ curse: 'doom', lifeTapBelowMana: 1234.5678 }) }).script.rules;
    expect(doom[0]!.if).toBe('!target.aura.curse-of-doom.active && time.remaining >= 60');
    expect(doom.find((r) => r.id === 'life-tap')!.if).toBe('mana < 1234.5678');
    // Default burst rule: with Heroism (equal to 'ready' when the fight has none).
    expect(convert({ ...base(), enabledBuffs: ['destruction-potion'] }).script.rules[0]!.if).toBe('heroism.active || heroism.over');
  });
});
