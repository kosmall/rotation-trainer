import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import { decodeTalents } from '../../src/data/classes/warlock/talentTree';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, LogEvent } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { createFightSimulation } from '../../src/sim-runner/fight';
import { mixSeed, prepareRun, runOnce, runWithSeed, SIM_LIMITS, simulate } from '../../src/sim-runner/run';
import type { SimRequest } from '../../src/sim-runner/types';
import { HEAD_BOTS } from '../fixtures/item-use-reference-data';
import { quagBloodgemGear, scenarios } from '../fixtures/item-use-reference';

const db = itemDbSync();
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WINDOWS = [SPELL_QUEUE_WINDOW_MS, 0];

const request = (p: Partial<SimRequest> = {}): SimRequest => ({
  setup: structuredClone(DEFAULT_SETUP) as SetupConfig,
  runs: 20,
  seed: 12345,
  spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
  ...p,
});

/** Everything enabled that adds an item action, Heroism and a potion (a busy log). */
const BUSY: SetupConfig = scenarios().long300!;
const QUAG: SetupConfig = scenarios().quagBloodgem!;

/**
 * The fight built by hand exactly as the game builds it (GameView's applySetup call, useSimulation's
 * Simulation settings), then played by the bot. Not through any sim-runner helper.
 */
function manualFight(config: SetupConfig, seed: number, spellQueueWindowMs: number, withDb = false) {
  const applied = applySetup({
    buildSpec: (w, g, t) =>
      g === undefined || !withDb ? buildDestructionWarlock(w, g, undefined, t) : buildDestructionWarlock(w, g, db, t),
    catalog: STATIC_SETUP_CATALOG,
    config,
    db: withDb ? db : null,
  });
  const sim = new Simulation({
    spec: applied.spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    distanceFromTarget: applied.sim.distanceFromTarget,
    scheduledAuras: applied.sim.scheduledAuras,
    durationMs: applied.sim.durationMs,
  });
  const result = runBot(sim, applied.spec.priority);
  return { ...result, log: sim.log(), spec: applied.spec, sim };
}

const completes = (log: readonly LogEvent[], id: string) => log.filter((e) => e.type === 'cast-complete' && e.spellId === id).length;

describe('mixSeed', () => {
  it('is pinned forever: (seed + (i + 1) x 0x9e3779b9) mod 2^32 through the MurmurHash3 fmix32 finalizer', () => {
    expect(mixSeed(0, 0)).toBe(2462723854);
    expect(mixSeed(0, 1)).toBe(1020716019);
    expect(mixSeed(1, 0)).toBe(2527132011);
    expect(mixSeed(1, 1)).toBe(314344336);
    expect(mixSeed(12345, 0)).toBe(1200724404);
    expect(mixSeed(12345, 1)).toBe(818072533);
    expect(mixSeed(12345, 99999)).toBe(2430907145);
    expect(mixSeed(4294967295, 7)).toBe(1650816001);
  });

  it('gives distinct unsigned 32-bit seeds for the runs of one request', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100000; i++) {
      const s = mixSeed(42, i);
      expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
      seen.add(s);
    }
    expect(seen.size).toBe(100000);
  });
});

describe('runOnce and runWithSeed', () => {
  it('runOnce(i) alone equals the i-th sample of a batch (fresh factory, any order)', () => {
    const batch = Array.from({ length: 12 }, (_, i) => runOnce(prepareRun(request()), i));
    const f = prepareRun(request());
    for (const i of [11, 3, 0, 7]) expect(runOnce(f, i)).toEqual(batch[i]);
    expect(batch[5]!.seed).toBe(mixSeed(12345, 5));
    expect(batch[5]!.index).toBe(5);
  });

  it('the sample of run i equals a hand-built game fight + runBot with seed mixSeed(base, i): DPS and damage exactly', () => {
    for (const w of WINDOWS) {
      const f = prepareRun(request({ spellQueueWindowMs: w, seed: 777 }));
      for (const i of [0, 1, 19]) {
        const s = runOnce(f, i);
        const m = manualFight(DEFAULT_SETUP, mixSeed(777, i), w);
        expect(s.dps, `window ${w} run ${i}`).toBe(m.dps);
        expect(s.damageTotal).toBe(m.damageTotal);
      }
    }
    // A gear that needs the item database, with its rules and Heroism.
    const f = prepareRun(request({ setup: QUAG, db, seed: 9 }));
    for (const i of [0, 4]) {
      const m = manualFight(QUAG, mixSeed(9, i), SPELL_QUEUE_WINDOW_MS, true);
      expect(runOnce(f, i).dps).toBe(m.dps);
    }
  });

  it('non-default talent builds (Destro/Nightfall, Affliction, Demonology Felguard presets): the core run equals the hand-built game fight exactly, logs included', () => {
    for (const id of ['destro-nightfall', 'affliction', 'demo-felguard']) {
      const talents = talentPresetById(id)!.talents;
      for (const setup of [{ ...structuredClone(DEFAULT_SETUP), talents } as SetupConfig, { ...structuredClone(BUSY), talents } as SetupConfig]) {
        for (const w of WINDOWS) {
          const f = prepareRun(request({ setup, db, seed: 4242, spellQueueWindowMs: w }));
          // The simulator really plays the build: its talents, Conflagrate bound only when talented,
          // Fel Armor x its Demonic Aegis rank.
          expect(f.config.talents).toBe(talents);
          expect(f.fight.spec.keybinds[7]).toBe(id === 'destro-nightfall' ? 'conflagrate' : '');
          const aegis = decodeTalents(talents).ranks.demonicAegis!;
          expect(f.fight.spec.statBonuses.spellPower).toBe(100 * (1 + 0.1 * aegis));
          for (const i of [0, 3]) {
            const seed = mixSeed(4242, i);
            const m = manualFight(setup, seed, w, true);
            const s = runOnce(f, i);
            expect(s.dps, `${id} window ${w} run ${i}`).toBe(m.dps);
            expect(s.damageTotal).toBe(m.damageTotal);
            // The same fight event for event: a fresh core Simulation with the run's seed.
            const core = createFightSimulation(f.fight, seed, w);
            runBot(core, f.fight.spec.priority);
            expect(JSON.stringify(core.log())).toBe(JSON.stringify(m.log));
          }
        }
      }
    }
  });

  it('runWithSeed over seeds 1-10 reproduces the pinned bot means of every scenario exactly (golden 1425.1766666666667 / 1428.3350000000003)', () => {
    for (const [name, config] of Object.entries(scenarios())) {
      for (const w of WINDOWS) {
        const f = prepareRun(request({ setup: config, db, spellQueueWindowMs: w }));
        const dps = SEEDS.map((seed) => runWithSeed(f, seed, 0).dps);
        const mean = dps.reduce((a, b) => a + b, 0) / dps.length;
        expect(mean, `${name} window ${w}`).toBe(HEAD_BOTS[name]![w]!.mean);
      }
    }
    const f = prepareRun(request());
    const mean = SEEDS.map((seed) => runWithSeed(f, seed, 0).dps).reduce((a, b) => a + b, 0) / 10;
    expect(mean).toBe(1425.1766666666667);
    const f0 = prepareRun(request({ spellQueueWindowMs: 0 }));
    expect(SEEDS.map((seed) => runWithSeed(f0, seed, 0).dps).reduce((a, b) => a + b, 0) / 10).toBe(1428.3350000000003);
  }, 60000);

  it('per-run extraction matches the log: damage sums, ticks, casts, crits, misses, item uses, Life Taps, uptimes', () => {
    for (const [config, withDb] of [
      [DEFAULT_SETUP, false],
      [BUSY, false],
      [QUAG, true],
    ] as const) {
      const f = prepareRun(request({ setup: config, ...(withDb && { db }), seed: 31 }));
      for (const i of [0, 2]) {
        const s = runOnce(f, i);
        const m = manualFight(config, mixSeed(31, i), SPELL_QUEUE_WINDOW_MS, withDb);
        const items = m.spec.spells.filter((sp) => sp.item);
        const spellSum = Object.values(s.spells).reduce((a, x) => a + x.damage, 0);
        expect(spellSum).toBeCloseTo(s.damageTotal, 6);
        expect(s.damageTotal).toBe(m.damageTotal);
        for (const [id, t] of Object.entries(s.spells)) {
          const direct = m.log.filter((e) => e.type === 'damage' && e.spellId === id);
          const ticks = m.log.filter((e) => e.type === 'tick' && (e.spellId ?? e.auraId) === id);
          expect(t.tickDamage).toBe(ticks.reduce((a, e) => a + (e.amount ?? 0), 0));
          expect(t.damage).toBeCloseTo(t.tickDamage + direct.reduce((a, e) => a + (e.amount ?? 0), 0), 6);
          expect(t.hits).toBe(direct.length);
          expect(t.crits).toBe(direct.filter((e) => e.crit).length);
          expect(t.misses).toBe(m.log.filter((e) => e.type === 'miss' && e.spellId === id).length);
          expect(t.casts).toBe(completes(m.log, id));
        }
        // Item actions are counted as item uses, not as spells.
        for (const it of items) {
          expect(s.spells[it.id]).toBeUndefined();
          expect(s.itemUses[it.id] ?? 0, it.id).toBe(completes(m.log, it.id));
        }
        expect(Object.keys(s.itemUses).every((id) => items.some((x) => x.id === id))).toBe(true);
        expect(s.lifeTaps).toBe(completes(m.log, 'life-tap'));
        for (const [id, up] of Object.entries(s.auraUpMs)) {
          expect(up, id).toBeGreaterThanOrEqual(0);
          expect(up, id).toBeLessThanOrEqual(config.fightDurationSec * 1000);
          expect(m.spec.auras.find((a) => a.id === id)?.hidden).not.toBe(true);
        }
      }
      if (config === BUSY) {
        const s = runOnce(f, 0);
        // Super Mana Potion shares the potion cooldown with Destruction Potion, used whenever ready.
        expect(Object.keys(s.itemUses).sort()).toEqual(['use-dark-rune', 'use-destruction-potion', 'use-item-29370']);
      }
    }
  }, 60000);

  it('uptime clips at the fight end and follows apply/fade pairs (Curse of the Elements almost always up, Heroism exactly its window)', () => {
    const s = runOnce(prepareRun(request({ setup: BUSY })), 0);
    expect(s.auraUpMs['curse-of-the-elements']! / 300000).toBeGreaterThan(0.95);
    // Heroism scheduled at 6.4 s for 40 s.
    expect(s.auraUpMs.heroism).toBe(40000);
    const d = runOnce(prepareRun(request()), 0);
    expect(d.auraUpMs.heroism).toBeUndefined();
    // Immolate: from its first application to its last fade or the end.
    expect(d.auraUpMs.immolate! / 60000).toBeGreaterThan(0.6);
  });

  it('mana spent equals the completed casts times their costs (default setup: the costs never change)', () => {
    const f = prepareRun(request());
    for (const i of [0, 1, 2]) {
      const s = runOnce(f, i);
      const m = manualFight(DEFAULT_SETUP, mixSeed(12345, i), SPELL_QUEUE_WINDOW_MS);
      const probe = new Simulation({ spec: m.spec, target: BOSS_TARGET, seed: 1, spellQueueWindowMs: 400, distanceFromTarget: 28 });
      const costs = probe.snapshot().spells;
      const expected = m.log
        .filter((e) => e.type === 'cast-complete')
        .reduce((a, e) => a + (costs[e.spellId!]?.manaCost ?? 0), 0);
      expect(s.manaSpent).toBeCloseTo(expected, 6);
      expect(s.manaSpent).toBeGreaterThan(5000);
    }
  });
});

describe('simulate', () => {
  it('chunk sizes 1, 7 and 1000 give byte-equal results, equal to the samples aggregated by hand', async () => {
    const req = request({ runs: 30 });
    const results = await Promise.all([1, 7, 1000].map((chunk) => simulate(req, { chunk })));
    const json = results.map((r) => JSON.stringify(r));
    expect(json[1]).toBe(json[0]);
    expect(json[2]).toBe(json[0]);
    const r = results[0]!;
    const f = prepareRun(req);
    const samples = Array.from({ length: 30 }, (_, i) => runOnce(f, i));
    const mean = samples.reduce((a, s) => a + s.dps, 0) / 30;
    expect(r.meanDps).toBeCloseTo(mean, 9);
    expect(r.runs).toBe(30);
    expect(r.seed).toBe(12345);
    expect(r.fightMs).toBe(60000);
    expect(r.min).toBe(Math.min(...samples.map((s) => s.dps)));
    expect(r.max).toBe(Math.max(...samples.map((s) => s.dps)));
  }, 60000);

  it('shares sum to 1, mean damages sum to the mean total, item uses and uptimes are sane', async () => {
    const r = await simulate(request({ runs: 8, setup: BUSY }));
    const spells = Object.values(r.perSpell);
    expect(spells.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 12);
    expect(spells.reduce((a, s) => a + s.meanDamage, 0) / (r.fightMs / 1000)).toBeCloseTo(r.meanDps, 6);
    for (const s of spells) {
      expect(s.meanTickDamage).toBeLessThanOrEqual(s.meanDamage);
      expect(s.meanCrits).toBeLessThanOrEqual(s.meanHits);
      expect(typeof s.name).toBe('string');
    }
    expect(r.perSpell['shadow-bolt']!.name).toBe('Shadow Bolt');
    expect(r.perSpell['immolate']!.meanTickDamage).toBeGreaterThan(0);
    expect(r.perSpell['life-tap']!.share).toBe(0);
    expect(r.itemUses['use-destruction-potion']).toBeGreaterThanOrEqual(1);
    expect(r.labels.items['use-destruction-potion']).toMatch(/Destruction Potion/);
    for (const [id, u] of Object.entries(r.uptimes)) {
      expect(u, id).toBeGreaterThanOrEqual(0);
      expect(u, id).toBeLessThanOrEqual(1);
      expect(typeof r.labels.auras[id]).toBe('string');
    }
    expect(r.uptimes.heroism).toBeCloseTo(40 / 300, 12);
    expect(r.meanLifeTaps).toBeGreaterThan(0);
    expect(r.meanManaSpent).toBeGreaterThan(0);
    expect(r.spellQueueWindowMs).toBe(SPELL_QUEUE_WINDOW_MS);
  }, 60000);

  it('progress is reported after each chunk, increasing, ending at runs', async () => {
    const calls: [number, number][] = [];
    await simulate(request({ runs: 23 }), { chunk: 5, onProgress: (done, total) => calls.push([done, total]) });
    expect(calls).toEqual([
      [5, 23],
      [10, 23],
      [15, 23],
      [20, 23],
      [23, 23],
    ]);
  });

  it('abort rejects with an AbortError (no partial result), stops early and reports nothing afterwards', async () => {
    const controller = new AbortController();
    const calls: number[] = [];
    const p = simulate(request({ runs: 400 }), {
      chunk: 10,
      signal: controller.signal,
      onProgress: (done) => {
        calls.push(done);
        if (done === 20) controller.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual([10, 20]);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([10, 20]);
    // Already aborted: rejects before the first run.
    const pre = new AbortController();
    pre.abort();
    const none: number[] = [];
    await expect(simulate(request(), { signal: pre.signal, onProgress: (d) => none.push(d) })).rejects.toMatchObject({ name: 'AbortError' });
    expect(none).toEqual([]);
  });

  it('200 default runs: the mean is within 3 standard errors of the golden mean and inside the bot test band; sigma is of the per-seed order (~130)', async () => {
    const r = await simulate(request({ runs: 200, seed: 20261102 }));
    // tests/bot/bot.test.ts: EXPECTED_DPS 1448, band +-12% = [1274, 1622]; measured mean over
    // seeds 1-10: 1425.18 (its own standard error about 130 / sqrt(10) = 41).
    expect(r.meanDps).toBeGreaterThanOrEqual(1274);
    expect(r.meanDps).toBeLessThanOrEqual(1622);
    const se = Math.sqrt(r.stdErr ** 2 + (r.stdDev / Math.sqrt(10)) ** 2);
    expect(Math.abs(r.meanDps - 1425.1766666666667)).toBeLessThan(3 * se);
    expect(r.stdDev).toBeGreaterThan(65);
    expect(r.stdDev).toBeLessThan(260);
    expect(r.stdErr).toBeCloseTo(r.stdDev / Math.sqrt(200), 12);
    expect(r.ci95[0]).toBeCloseTo(r.meanDps - 1.96 * r.stdErr, 9);
    expect(r.min).toBeLessThanOrEqual(r.percentiles.p5);
    expect(r.percentiles.p5).toBeLessThanOrEqual(r.percentiles.p25);
    expect(r.percentiles.p25).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.percentiles.p75);
    expect(r.percentiles.p75).toBeLessThanOrEqual(r.percentiles.p95);
    expect(r.percentiles.p95).toBeLessThanOrEqual(r.max);
    expect(r.histogram.counts.reduce((a, b) => a + b, 0)).toBe(200);
    expect(r.uptimes['curse-of-the-elements']).toBeGreaterThan(0.95);
    expect(r.meanLifeTaps).toBeGreaterThanOrEqual(1);
    expect(r.meanLifeTaps).toBeLessThanOrEqual(2);
  }, 60000);

  it('performance: 1000 default runs finish within a generous bound', async () => {
    const t0 = performance.now();
    const r = await simulate(request({ runs: 1000, seed: 1 }), { chunk: 100 });
    const ms = performance.now() - t0;
    expect(r.runs).toBe(1000);
    // Measured on the development container about 1.2 s (1.2 ms per run, docs Part H "Cost");
    // 15 s before the bot skipped the steps at which no press can be accepted.
    expect(ms).toBeLessThan(30000);
  }, 240000);
});

describe('hostile requests', () => {
  it('runs, seed and the spell queue window are clamped; non-finite numbers are a clear TypeError', async () => {
    expect(prepareRun(request({ runs: 0 })).runs).toBe(1);
    expect(prepareRun(request({ runs: -5 })).runs).toBe(1);
    expect(prepareRun(request({ runs: 1e9 })).runs).toBe(SIM_LIMITS.runs.max);
    expect(SIM_LIMITS.runs.max).toBe(100000);
    expect(prepareRun(request({ runs: 2.6 })).runs).toBe(3);
    expect(prepareRun(request({ seed: -1 })).seed).toBe(4294967295);
    expect(prepareRun(request({ seed: 2 ** 40 + 5 })).seed).toBe(5);
    expect(prepareRun(request({ seed: 3.9 })).seed).toBe(3);
    expect(prepareRun(request({ spellQueueWindowMs: 5000 })).spellQueueWindowMs).toBe(1000);
    expect(prepareRun(request({ spellQueueWindowMs: -3 })).spellQueueWindowMs).toBe(0);
    for (const bad of [
      { runs: Number.NaN },
      { runs: Infinity },
      { runs: '10' as unknown as number },
      { seed: Number.NaN },
      { seed: -Infinity },
      { spellQueueWindowMs: Number.NaN },
      { spellQueueWindowMs: undefined as unknown as number },
    ]) {
      expect(() => prepareRun(request(bad)), JSON.stringify(bad)).toThrow(TypeError);
      await expect(simulate(request(bad))).rejects.toThrow(TypeError);
    }
    expect(() => prepareRun(request({ runs: Number.NaN }))).toThrow(/runs/);
    expect(() => prepareRun(request({ seed: Number.NaN }))).toThrow(/seed/);
    const r = await simulate(request({ runs: 0 }));
    expect(r.runs).toBe(1);
    expect(r.stdDev).toBe(0);
  });

  it('a garbage setup normalizes to the default setup (like stored data); a garbage request or db is a TypeError', async () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );
    for (const setup of ['x', null, 42, { version: 2 }, [], hostile]) {
      expect(prepareRun(request({ setup: setup as unknown as SetupConfig })).config).toEqual(DEFAULT_SETUP);
    }
    for (const bad of [null, undefined, 'abc', 7, [], hostile]) {
      expect(() => prepareRun(bad as unknown as SimRequest)).toThrow(TypeError);
      await expect(simulate(bad as unknown as SimRequest)).rejects.toThrow(TypeError);
    }
    for (const badDb of ['db', 5, { items: 3 }, []]) {
      expect(() => prepareRun(request({ db: badDb as never }))).toThrow(/item database/);
    }
    // A request whose fields throw.
    const trap = { ...request() };
    Object.defineProperty(trap, 'runs', {
      get() {
        throw new Error('trap');
      },
    });
    expect(() => prepareRun(trap)).toThrow(TypeError);
  });

  it('a gear that needs the item database without one is a clear Error (never a silent author gear)', () => {
    const setup = { ...structuredClone(DEFAULT_SETUP), gear: quagBloodgemGear() } as SetupConfig;
    expect(() => prepareRun(request({ setup }))).toThrow(/item database/);
    expect(prepareRun(request({ setup, db })).config.gear?.map((e) => e?.id)).toEqual(quagBloodgemGear().map((e) => e?.id));
  });
});

// Worn on-use effects are always on the item row; `enabledBuffs` only means "the bot and the
// simulator use it automatically". The simulator builds through applySetup, so it follows.
describe('simulator and always-bound on-use trinkets', () => {
  const setupWith = (p: Partial<SetupConfig>): SetupConfig => ({ ...(structuredClone(DEFAULT_SETUP) as SetupConfig), ...p });
  const pipeGear = (): (EquippedItem | null)[] => {
    const gear = structuredClone(destructionEquipped) as (EquippedItem | null)[];
    gear[12] = { id: 281735, gems: [] }; // Dark Iron Smoking Pipe in trinket 1; the author's Icon in trinket 2
    return gear;
  };

  it('default setup: the worn Icon is an item action of the fight but never used; the result is the default fight', () => {
    const f = prepareRun(request());
    expect(f.itemActionIds).toEqual(new Set(['use-item-29370']));
    for (const i of [0, 1, 2]) {
      const s = runOnce(f, i);
      expect(s.itemUses).toEqual({});
      expect(s.dps).toBe(manualFight(DEFAULT_SETUP, mixSeed(12345, i), SPELL_QUEUE_WINDOW_MS).dps);
    }
  });

  it('Pipe and Icon worn, not enabled: neither is used; the Pipe enabled: only the Pipe is used', () => {
    const fOff = prepareRun(request({ setup: setupWith({ gear: pipeGear() }), db }));
    expect(fOff.itemActionIds).toEqual(new Set(['use-item-281735', 'use-item-29370']));
    expect(fOff.fight.spec.keybinds.slice(12, 14)).toEqual(['use-item-281735', 'use-item-29370']);
    for (const i of [0, 1]) expect(runOnce(fOff, i).itemUses).toEqual({});
    const fOn = prepareRun(request({ setup: setupWith({ gear: pipeGear(), enabledBuffs: ['item:281735'] }), db }));
    for (const i of [0, 1]) {
      const uses = runOnce(fOn, i).itemUses;
      expect(Object.keys(uses)).toEqual(['use-item-281735']);
      expect(uses['use-item-281735']).toBeGreaterThanOrEqual(1);
    }
  });
});
