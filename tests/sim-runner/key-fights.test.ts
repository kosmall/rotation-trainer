import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { itemDbSync } from '../../src/data/items/dbSync';
import { scenarioRunSetup } from '../../src/scenarios/cli';
import { exampleScenarios } from '../../src/scenarios/examples';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { compare } from '../../src/sim-runner/compare';
import { createFightSimulation } from '../../src/sim-runner/fight';
import { replayFight } from '../../src/sim-runner/replay';
import { mixSeed, prepareRun, runOnce, simulate } from '../../src/sim-runner/run';
import { Aggregator } from '../../src/sim-runner/stats';
import type { RunSample, SimRequest, SimResult } from '../../src/sim-runner/types';
import { hash, scenarios } from '../fixtures/item-use-reference';

// Key fights and replay (fight timeline and key fights Task K1; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 B; docs/data-sources.md Part K).

const db = itemDbSync();

const request = (setup: SetupConfig, p: Partial<SimRequest> = {}): SimRequest => ({
  setup: structuredClone(setup),
  db,
  runs: 24,
  seed: 20261105,
  spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
  ...p,
});

const example = (file: string) => scenarioRunSetup(exampleScenarios(db).find((e) => e.file === file)!.scenario, db);

/** A sample with only its index, seed and DPS set. */
function sample(index: number, dps: number, seed = 1000 + index): RunSample {
  return { index, seed, dps, damageTotal: dps * 60, spells: {}, itemUses: {}, auraUpMs: {}, manaSpent: 0, lifeTaps: 0, ruleFires: [] };
}

function aggregate(values: readonly number[], indices: readonly number[] = values.map((_, i) => i)) {
  const agg = new Aggregator({ runs: values.length, seed: 7, fightMs: 60000, spellQueueWindowMs: 400, labels: { spells: {}, items: {}, auras: {} } });
  values.forEach((v, k) => agg.add(sample(indices[k]!, v)));
  return agg.result();
}

/** The result as it was before key fights existed: every field but `keyFights`. */
function withoutKeyFights(r: SimResult): Omit<SimResult, 'keyFights'> {
  const { keyFights: _omit, ...rest } = r;
  return rest;
}

describe('key fights in the aggregation', () => {
  it('hand-checked: highest and lowest take the first run reaching the extreme; typical is closest to the mean', () => {
    // mean = 121 / 6 = 20.1666..; |20 - mean| = 0.1666.. beats |21 - mean| = 0.8333..
    const r = aggregate([10, 30, 20, 30, 10, 21]);
    expect(r.keyFights).toEqual({
      highest: { run: 1, seed: 1001, dps: 30 },
      typical: { run: 2, seed: 1002, dps: 20 },
      lowest: { run: 0, seed: 1000, dps: 10 },
    });
  });

  it('typical ties go to the lower run; one run is all three key fights', () => {
    // mean 20: both runs are 10 away.
    expect(aggregate([10, 30]).keyFights!.typical).toEqual({ run: 0, seed: 1000, dps: 10 });
    expect(aggregate([30, 10]).keyFights!.typical).toEqual({ run: 0, seed: 1000, dps: 30 });
    const one = aggregate([1234.5]).keyFights!;
    for (const k of [one.highest, one.typical, one.lowest]) expect(k).toEqual({ run: 0, seed: 1000, dps: 1234.5 });
  });

  it('ties go to the lower run number even when the samples come in another order', () => {
    const r = aggregate([5, 5, 5, 5], [3, 2, 1, 0]).keyFights!;
    for (const k of [r.highest, r.typical, r.lowest]) expect(k).toEqual({ run: 0, seed: 1000, dps: 5 });
  });

  it('keyFights match the per-run samples of a real simulation (run, seed mixSeed(seed, run), dps)', async () => {
    const req = request(DEFAULT_SETUP as SetupConfig, { runs: 30 });
    const r = await simulate(req);
    const f = prepareRun(req);
    const all = Array.from({ length: 30 }, (_, i) => runOnce(f, i));
    const dps = all.map((s) => s.dps);
    const hi = dps.indexOf(Math.max(...dps));
    const lo = dps.indexOf(Math.min(...dps));
    const dist = dps.map((d) => Math.abs(d - r.meanDps));
    const ty = dist.indexOf(Math.min(...dist));
    const kf = r.keyFights!;
    expect(kf.highest).toEqual({ run: hi, seed: mixSeed(req.seed, hi), dps: dps[hi] });
    expect(kf.lowest).toEqual({ run: lo, seed: mixSeed(req.seed, lo), dps: dps[lo] });
    expect(kf.typical).toEqual({ run: ty, seed: mixSeed(req.seed, ty), dps: dps[ty] });
    expect(kf.highest.dps).toBe(r.max);
    expect(kf.lowest.dps).toBe(r.min);
    // Plain JSON numbers: they cross the worker boundary as is.
    expect(JSON.parse(JSON.stringify(kf))).toEqual(kf);
  });

  it('every other number of the result is unchanged (pinned before key fights were added)', async () => {
    const r = await simulate(request(DEFAULT_SETUP as SetupConfig, { runs: 20, seed: 12345 }));
    expect(hash(JSON.stringify(withoutKeyFights(r)))).toBe(PINNED_DEFAULT_HASH);
    const busy = await simulate(request(scenarios().long300!, { runs: 8, seed: 99 }));
    expect(hash(JSON.stringify(withoutKeyFights(busy)))).toBe(PINNED_BUSY_HASH);
  });

  it('compare results carry the key fights of each scenario too', async () => {
    const reqs = [request(DEFAULT_SETUP as SetupConfig, { runs: 6 }), request(scenarios().long300!, { runs: 6 })];
    const c = await compare(reqs);
    for (const [s, res] of c.results.entries()) {
      expect(res.keyFights).toBeDefined();
      expect(res.keyFights).toEqual((await simulate(reqs[s]!)).keyFights);
    }
  });
});

/** hash(JSON.stringify(result)) of the two pinned simulations above, taken on the code before key fights (fc6b351). */
const PINNED_DEFAULT_HASH = 6853540811946711;
const PINNED_BUSY_HASH = 4526754654544542;

describe('replayFight', () => {
  const setups: [string, SetupConfig][] = [
    ['default setup', DEFAULT_SETUP as SetupConfig],
    ['raid-log setup', scenarios().raidLog!],
    ['item-use rules (long300)', scenarios().long300!],
    ['gear needing the item database (quagBloodgem)', scenarios().quagBloodgem!],
    ['script scenario (shadowburn-hold)', example('shadowburn-hold')],
    ['script scenario (trinket-sequencing)', example('trinket-sequencing')],
  ];

  for (const [name, setup] of setups) {
    it(`${name}: the replay DPS of each key fight equals the recorded DPS bit for bit, its log the direct fight's`, async () => {
      for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
        const req = request(setup, { spellQueueWindowMs: w });
        const r = await simulate(req);
        const f = prepareRun(req);
        for (const kf of [r.keyFights!.highest, r.keyFights!.typical, r.keyFights!.lowest]) {
          const rep = replayFight(req, kf.run);
          expect(Object.is(rep.dps, kf.dps), `${name} window ${w} run ${kf.run}`).toBe(true);
          expect(rep.seed).toBe(kf.seed);
          expect(rep.seed).toBe(mixSeed(req.seed, kf.run));
          expect(rep.durationMs).toBe(f.fight.sim.durationMs);
          const direct = createFightSimulation(f.fight, mixSeed(req.seed, kf.run), w);
          runBot(direct, f.fight.spec.priority);
          expect(JSON.stringify(rep.log)).toBe(JSON.stringify(direct.log()));
        }
      }
    });
  }

  it('replays any run of the request, not only key fights, and is deterministic', () => {
    const req = request(DEFAULT_SETUP as SetupConfig, { runs: 10, seed: 3 });
    const f = prepareRun(req);
    for (const i of [0, 4, 9]) {
      const a = replayFight(req, i);
      expect(a.dps).toBe(runOnce(f, i).dps);
      expect(JSON.stringify(replayFight(req, i).log)).toBe(JSON.stringify(a.log));
    }
  });

  it('rejects a run that is not an integer in [0, runs) and an invalid request with the simulator error', () => {
    const req = request(DEFAULT_SETUP as SetupConfig, { runs: 10 });
    for (const bad of [-1, 10, 1.5, Number.NaN, Infinity]) expect(() => replayFight(req, bad), String(bad)).toThrow(RangeError);
    expect(() => replayFight({ ...req, runs: 'x' as unknown as number }, 0)).toThrow(TypeError);
  });
});
