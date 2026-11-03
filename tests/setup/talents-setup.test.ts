// Talents in the setup (stage 2b Task 3): `SetupConfig.talents` normalization, storage, the spec
// and the priority built from it, setup presets and Reset, preset matching, the import of the
// WowSimsExporter talent string, and the golden values of the author's build.

import { describe, expect, it } from 'vitest';
import authorExport from '../../docs/samples/wowsimsexporter-destruction-warlock.json';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, type WarlockOptions } from '../../src/data/classes/warlock/destruction';
import { talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import { decodeTalents, TALENT_STRING_MAX_LENGTH, type TalentRanks } from '../../src/data/classes/warlock/talentTree';
import { destructionTalentString } from '../../src/data/classes/warlock/talents';
import { deepFreeze } from '../../src/data/common/buffs';
import { BOSS_TARGET } from '../../src/data/common/target';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { PriorityStep } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, LogEvent, SimSnapshot } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { applySetupPreset, SETUP_PRESETS, setupFightKey, setupTalents } from '../../src/setup/presets';
import { loadSetup, saveSetup, SETUP_STORAGE_KEY, type SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { applyImportedTalents, exportTalents, parseWowSimsExport } from '../../src/setup/wowsimsGear';

deepFreeze(SETUP_CATALOG);
const db = itemDbSync();

const AUTHOR = destructionTalentString;
/** The author's build with Bane 0/5 (its 5 points in Aftermath, same rows): valid. */
const NO_BANE = '000000000000000000000-2050130133200100000000-550500512200013330050';
/** The author's build with Cataclysm 0/5 (its 5 points in Aftermath): valid. */
const NO_CATACLYSM = '000000000000000000000-2050130133200100000000-505500512200013330050';
/** The author's build without Shadowburn (its point in Improved Lash of Pain): valid. */
const NO_SHADOWBURN = '000000000000000000000-2050130133200100000000-555001502200013330050';
const NIGHTFALL = talentPresetById('destro-nightfall')!.talents;

const config = (patch: Partial<SetupConfig> = {}): SetupConfig => ({ ...structuredClone(DEFAULT_SETUP), ...patch });
const normalize = (v: unknown) => normalizeSetup(v, SETUP_CATALOG);

/** The fight exactly as the game builds it (GameView: applySetup, then a Simulation), played by the bot. */
function play(c: SetupConfig, seed: number, window = SPELL_QUEUE_WINDOW_MS) {
  const applied = applySetup({
    buildSpec: (w: WarlockOptions, g?: readonly (EquippedItem | null)[], t?: string) => buildDestructionWarlock(w, g, undefined, t),
    catalog: STATIC_SETUP_CATALOG,
    config: c,
  });
  const sim = new Simulation({
    spec: applied.spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs: window,
    distanceFromTarget: applied.sim.distanceFromTarget,
    scheduledAuras: applied.sim.scheduledAuras,
    durationMs: applied.sim.durationMs,
  });
  const result = runBot(sim, applied.spec.priority);
  return { ...result, log: sim.log(), applied };
}

const meanDps = (c: SetupConfig, window: number) =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => play(c, seed, window).dps).reduce((a, b) => a + b, 0) / 10;

/** The cast durations (start to complete) of one spell in a log. */
function castDurations(log: readonly LogEvent[], spellId: string): number[] {
  const out: number[] = [];
  let start: number | undefined;
  for (const e of log) {
    if (e.spellId !== spellId) continue;
    if (e.type === 'cast-start') start = e.atMs;
    if (e.type === 'cast-complete' && start !== undefined) {
      out.push(e.atMs - start);
      start = undefined;
    }
  }
  return out;
}

const step = (priority: readonly PriorityStep[], spellId: string) => priority.find((s) => s.spellId === spellId);
const snap = (p: Partial<SimSnapshot>) => ({ durationMs: 60000, nowMs: 0, mana: 10000, ...p }) as SimSnapshot;

describe('normalizeSetup: talents', () => {
  it('missing stays missing (the author build); the default setup has no talents', () => {
    expect('talents' in DEFAULT_SETUP).toBe(false);
    expect('talents' in normalize(config())).toBe(false);
    expect(setupTalents(DEFAULT_SETUP)).toBe(AUTHOR);
  });

  it('a valid build is kept, in the full-width form (trimmed, trailing zeros written)', () => {
    expect(normalize(config({ talents: NO_BANE })).talents).toBe(NO_BANE);
    expect(normalize(config({ talents: '150222201023--505020510200510531051' })).talents).toBe(NIGHTFALL);
    expect(normalize(config({ talents: `  ${NIGHTFALL}\n` })).talents).toBe(NIGHTFALL);
    expect(setupTalents(normalize(config({ talents: NIGHTFALL })))).toBe(NIGHTFALL);
  });

  it("the author's own string normalizes to no field (one form per build)", () => {
    expect('talents' in normalize(config({ talents: AUTHOR }))).toBe(false);
    expect('talents' in normalize(config({ talents: '-2050130133200100000000-555000512200013330050' }))).toBe(false);
  });

  it.each([
    ['letters', 'abc'],
    ['empty', ''],
    ['above max ranks', '9-9-9'],
    ['62 points', '000000000000000000000-2050130133200100000000-555000512200013330051'],
    ['row rule broken', '--00000000000000000005'],
    ['prerequisite missing (Conflagrate without Improved Immolate)', '--00000000000000000100'],
    ['too long', '0'.repeat(TALENT_STRING_MAX_LENGTH + 1)],
    ['10k characters', '5-'.repeat(5000)],
    ['NUL', '\u0000-\u0000-\u0000'],
    ['emoji', '😀--'],
  ])('an invalid string (%s) falls back to the author build: no field, never "fixed"', (_name, text) => {
    expect(decodeTalents(text).errors.length).toBeGreaterThan(0);
    const out = normalize(config({ talents: text }));
    expect('talents' in out).toBe(false);
    expect(setupTalents(out)).toBe(AUTHOR);
  });

  it('hostile values never throw and give the author build', () => {
    const hostile: unknown[] = [
      42,
      null,
      true,
      ['0-0-0'],
      { toString: () => NO_BANE },
      new String(NO_BANE),
      Symbol('x'),
      () => NO_BANE,
    ];
    for (const talents of hostile) {
      const out = normalize({ ...config(), talents });
      expect('talents' in out, String(typeof talents)).toBe(false);
    }
    const getter = { ...config() } as Record<string, unknown>;
    Object.defineProperty(getter, 'talents', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(() => normalize(getter)).not.toThrow();
    // An inherited `talents` is not read.
    const inherited = Object.assign(Object.create({ talents: NO_BANE }), config());
    expect('talents' in normalize(inherited)).toBe(false);
  });

  it('is idempotent and shares nothing with its input', () => {
    for (const talents of [undefined, NO_BANE, NIGHTFALL, AUTHOR, 'abc', '150222201023--505020510200510531051']) {
      const once = normalize(config(talents === undefined ? {} : { talents }));
      expect(normalize(once)).toEqual(once);
    }
  });

  it('a stored setup round-trips through storage with its talents; an old stored setup (no field) is unchanged', () => {
    const data = new Map<string, string>();
    const storage: SetupStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
    expect(saveSetup(storage, config({ talents: NIGHTFALL }))).toBe(true);
    expect(JSON.parse(data.get(SETUP_STORAGE_KEY)!).talents).toBe(NIGHTFALL);
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(normalize(config({ talents: NIGHTFALL })));
    // A stage 2a config (gear, no talents) as stored before: normalizes to itself, no field added.
    const old = normalize({ ...config(), gear: structuredClone(DEFAULT_GEAR) });
    expect(old.gear).toHaveLength(17);
    const text = JSON.stringify(old);
    data.set(SETUP_STORAGE_KEY, text);
    expect(JSON.stringify(loadSetup(storage, SETUP_CATALOG))).toBe(text);
    expect(JSON.stringify(normalize(JSON.parse(JSON.stringify(DEFAULT_SETUP))))).toBe(JSON.stringify(DEFAULT_SETUP));
  });
});

describe('applySetup: the talents reach the spec and the priority', () => {
  it('passes the talents to buildSpec as its third argument (undefined for the author build)', () => {
    const seen: (string | undefined)[] = [];
    const buildSpec = (w: WarlockOptions, g?: readonly (EquippedItem | null)[], t?: string) => {
      seen.push(t);
      return buildDestructionWarlock(w, g, undefined, t);
    };
    applySetup({ buildSpec, catalog: SETUP_CATALOG, config: config() });
    applySetup({ buildSpec, catalog: SETUP_CATALOG, config: normalize(config({ talents: NIGHTFALL })) });
    expect(seen).toEqual([undefined, NIGHTFALL]);
  });

  it('Bane 0/5: the Shadowburn finisher window grows from 3900 to 4400 ms (28 yd) and the bot casts slower Shadow Bolts', () => {
    const author = play(config(), 1);
    const noBane = play(config({ talents: NO_BANE }), 1);
    const at = (remaining: number) => snap({ nowMs: 60000 - remaining });
    const authorBurn = step(author.applied.spec.priority, 'shadowburn')!;
    const noBaneBurn = step(noBane.applied.spec.priority, 'shadowburn')!;
    expect(authorBurn.when!(at(3900))).toBe(true);
    expect(authorBurn.when!(at(3901))).toBe(false);
    expect(noBaneBurn.when!(at(4400))).toBe(true);
    expect(noBaneBurn.when!(at(4401))).toBe(false);
    // In the bot's fight: every Shadow Bolt takes 3000 / 2500 as long (same haste).
    const a = castDurations(author.log, 'shadow-bolt');
    const b = castDurations(noBane.log, 'shadow-bolt');
    expect(a.length).toBeGreaterThan(5);
    expect(b.length).toBeGreaterThan(5);
    expect(Math.abs(b[0]! / a[0]! - 1.2)).toBeLessThan(0.001);
    expect(Math.min(...b)).toBeGreaterThan(Math.max(...a));
    expect(b.length).toBeLessThan(a.length);
  });

  it('Cataclysm 0/5: Life Tap "auto" waits for 420 mana (the full Shadow Bolt cost), not 399', () => {
    const lt = (c: SetupConfig) => step(applySetup({ buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t), catalog: SETUP_CATALOG, config: c }).spec.priority, 'life-tap')!;
    expect(lt(config()).when!(snap({ mana: 410 }))).toBe(false);
    expect(lt(config({ talents: NO_CATACLYSM })).when!(snap({ mana: 410 }))).toBe(true);
    expect(lt(config({ talents: NO_CATACLYSM })).when!(snap({ mana: 420 }))).toBe(false);
  });

  it('a build without Shadowburn drops the finisher step and the bot never casts it', () => {
    const r = play(config({ talents: NO_SHADOWBURN }), 2);
    expect(step(r.applied.spec.priority, 'shadowburn')).toBeUndefined();
    expect(r.applied.spec.keybinds[4]).toBe('');
    expect(r.log.some((e) => e.spellId === 'shadowburn')).toBe(false);
    expect(r.dps).toBeGreaterThan(0);
  });

  it('a preset changes the derived numbers (Destro/Nightfall: Fel Armor 100, Conflagrate bound, instant Corruption)', () => {
    const r = play(config({ talents: NIGHTFALL }), 3);
    expect(r.applied.spec.statBonuses.spellPower).toBe(100);
    expect(r.applied.spec.keybinds[7]).toBe('conflagrate');
    // Instant: no cast-start, completed at once.
    expect(r.log.some((e) => e.type === 'cast-start' && e.spellId === 'corruption')).toBe(false);
    expect(r.log.filter((e) => e.type === 'cast-complete' && e.spellId === 'corruption').length).toBeGreaterThan(0);
    expect(play(config(), 3).applied.spec.statBonuses.spellPower).toBe(130);
  });

  it('the next fight takes the new talents; a fight already built keeps its own (applySetup is pure)', () => {
    const before = config();
    const fight = applySetup({ buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t), catalog: SETUP_CATALOG, config: before });
    const frozen = JSON.stringify(fight.spec.keybinds) + fight.spec.priority.length;
    const edited = normalize({ ...before, talents: NIGHTFALL });
    const next = applySetup({ buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t), catalog: SETUP_CATALOG, config: edited });
    expect(JSON.stringify(fight.spec.keybinds) + fight.spec.priority.length).toBe(frozen);
    expect(fight.spec.keybinds[7]).toBe('');
    expect(next.spec.keybinds[7]).toBe('conflagrate');
    expect('talents' in before).toBe(false);
  });

  it("golden: the author build (absent, or the author's string un-normalized) gives exactly the stage 1 means", () => {
    expect(meanDps(config(), SPELL_QUEUE_WINDOW_MS)).toBe(1425.1766666666667);
    expect(meanDps(config(), 0)).toBe(1428.3350000000003);
    expect(meanDps(config({ talents: AUTHOR }), SPELL_QUEUE_WINDOW_MS)).toBe(1425.1766666666667);
    expect(meanDps(config({ talents: AUTHOR }), 0)).toBe(1428.3350000000003);
  }, 60000);
});

describe('setup presets, Reset and preset matching', () => {
  it('a setup preset keeps the player talents (like the gear and the fight length); Reset to defaults restores the author build', () => {
    const mine = normalize(config({ talents: NIGHTFALL, fightDurationSec: 90 }));
    for (const p of Object.values(SETUP_PRESETS)) {
      const next = normalize(applySetupPreset(p.config, mine));
      expect(next.talents).toBe(NIGHTFALL);
      expect(next.fightDurationSec).toBe(90);
      expect(next.enabledBuffs).toEqual(p.config.enabledBuffs);
    }
    // The author's build stays absent.
    expect('talents' in applySetupPreset(SETUP_PRESETS['raid-log'].config, config())).toBe(false);
    // Reset to defaults: DEFAULT_SETUP, which has no talents.
    expect(setupTalents(normalize(DEFAULT_SETUP))).toBe(AUTHOR);
  });

  it('the fight key includes the talents only when they are not the author build', () => {
    const plain = setupFightKey(config(), SETUP_CATALOG);
    expect(setupFightKey(config({ talents: AUTHOR }), SETUP_CATALOG)).toBe(plain);
    expect(setupFightKey(config({ talents: 'abc' }), SETUP_CATALOG)).toBe(plain);
    expect(plain).not.toContain('talents');
    const nf = setupFightKey(config({ talents: NIGHTFALL }), SETUP_CATALOG);
    expect(nf).not.toBe(plain);
    expect(nf).toContain(NIGHTFALL);
    // A preset applied to the player's config (talents kept) matches that config.
    const mine = normalize(applySetupPreset(SETUP_PRESETS['raid-log'].config, normalize(config({ talents: NIGHTFALL }))));
    expect(setupFightKey(mine, SETUP_CATALOG)).toBe(setupFightKey(applySetupPreset(SETUP_PRESETS['raid-log'].config, mine), SETUP_CATALOG));
  });
});

describe('import and export of the talent string', () => {
  it("the author's real WowSimsExporter export applies the author's string (normalized: no field)", () => {
    const parsed = parseWowSimsExport(JSON.stringify(authorExport), db);
    expect(parsed.talents).toBe(AUTHOR);
    const applied = applyImportedTalents(parsed);
    expect(applied).toEqual({ ok: true, talents: AUTHOR });
    expect('talents' in normalize(config({ talents: applied.ok ? applied.talents : undefined }))).toBe(false);
  });

  it('a valid short wowsims string is applied in the full-width form', () => {
    expect(applyImportedTalents({ talents: '150222201023--505020510200510531051' })).toEqual({ ok: true, talents: NIGHTFALL });
  });

  it('an invalid or missing talent string gives the violations and nothing to apply', () => {
    const bad = applyImportedTalents({ talents: '000000000000000000000-2050130133200100000000-555000512200013330051' });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors).toEqual(['Too many points: 62 spent, at most 61.']);
    const none = applyImportedTalents({});
    expect(none).toEqual({ ok: false, errors: ['The export has no talent string.'] });
    for (const hostile of [null, undefined, 42, 'x', { talents: 5 }, { talents: '9-9-9' }]) {
      const r = applyImportedTalents(hostile as never);
      expect(r.ok).toBe(false);
    }
  });

  it('exportTalents writes the full-width string of a build (and re-imports to it)', () => {
    const ranks: TalentRanks = decodeTalents(NIGHTFALL).ranks;
    expect(exportTalents(ranks)).toBe(NIGHTFALL);
    expect(exportTalents(decodeTalents(AUTHOR).ranks)).toBe(AUTHOR);
    expect(applyImportedTalents({ talents: exportTalents(ranks) })).toEqual({ ok: true, talents: NIGHTFALL });
    expect(exportTalents({ nope: 3, __proto__: { bane: 5 } } as never)).toBe(exportTalents({}));
  });
});
