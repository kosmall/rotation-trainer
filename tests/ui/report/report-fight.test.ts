// The Report's model from any fight source (fight timeline and key fights Task K2; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A-B, §4): a
// simulation's key fight replayed from its setup snapshot is the simulator's fight bit for bit
// (log and DPS equal `replayFight`), the model of a played fight is unchanged, and a fight given
// only as {log, config, seed, durationMs} builds the same model as the played fight it came from.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { itemDbSync } from '../../../src/data/items/dbSync';
import { scenarioRunSetup } from '../../../src/scenarios/cli';
import { exampleScenarios } from '../../../src/scenarios/examples';
import { setupCatalogFor } from '../../../src/setup/defaults';
import { setupGear } from '../../../src/setup/gear';
import type { SetupConfig } from '../../../src/setup/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { replayFight } from '../../../src/sim-runner/replay';
import { simulate } from '../../../src/sim-runner/run';
import type { SimRequest } from '../../../src/sim-runner/types';
import {
  buildReportModel,
  chipLabelsOf,
  fightFromInput,
  fightFromLast,
  finalFromLog,
  replaySimFight,
  reportModel,
  SIM_KIND,
} from '../../../src/ui/report/reportModel';
import type { LastFight, NextFight } from '../../../src/ui/state/TrainerProvider';
import { applyScenario, scenarios } from '../../fixtures/item-use-reference';

const db = itemDbSync();
const example = (file: string) => scenarioRunSetup(exampleScenarios(db).find((e) => e.file === file)!.scenario, db);

function nextFightOf(config: SetupConfig): NextFight {
  return { config, catalog: setupCatalogFor(setupGear(config), db), ...applyScenario(config, db) };
}

/** A fight played by the bot as if by the player (the Report's "played" fight). */
function playedFight(config: SetupConfig, seed: number, id = 1): LastFight {
  const fight = nextFightOf(config);
  const sim = createFightSimulation(fight, seed, SPELL_QUEUE_WINDOW_MS);
  runBot(sim, fight.spec.priority);
  return { id, log: sim.log(), snapshot: sim.snapshot(), config, labels: chipLabelsOf(config, fight.catalog), seed, fight };
}

describe('replaySimFight: a key fight from the setup snapshot', () => {
  const cases: [string, () => SetupConfig, number][] = [
    ['default', () => scenarios().default!, SPELL_QUEUE_WINDOW_MS],
    ['raid-log', () => scenarios().raidLog!, SPELL_QUEUE_WINDOW_MS],
    ['long300 with item-use rules, window 0', () => scenarios().long300!, 0],
    ['quagBloodgem (database gear)', () => scenarios().quagBloodgem!, SPELL_QUEUE_WINDOW_MS],
    ['trinket-sequencing script', () => example('trinket-sequencing'), SPELL_QUEUE_WINDOW_MS],
  ];
  for (const [name, setup, window] of cases) {
    it(`${name}: log, DPS and seed equal replayFight and the key fight, bit for bit`, { timeout: 30000 }, async () => {
      const config = setup();
      const request: SimRequest = { setup: structuredClone(config), db, runs: 8, seed: 4242, spellQueueWindowMs: window };
      const result = await simulate(request);
      for (const which of ['highest', 'typical', 'lowest'] as const) {
        const key = result.keyFights![which];
        const fight = replaySimFight({ result, config }, key.run, SIM_KIND[which], `sim:1:${which}`, db);
        const direct = replayFight(request, key.run);
        expect(Object.is(fight.snapshot.dps, key.dps)).toBe(true);
        expect(Object.is(fight.snapshot.dps, direct.dps)).toBe(true);
        expect(fight.seed).toBe(key.seed);
        expect(JSON.stringify(fight.log)).toBe(JSON.stringify(direct.log));
        expect(fight.snapshot.durationMs).toBe(direct.durationMs);
        expect(fight.kind).toBe(SIM_KIND[which]);
        expect(fight.key).toBe(`sim:1:${which}`);
        expect(fight.compareBot).toBe(false);
        expect(fight.sim).toEqual({
          run: key.run,
          runs: 8,
          baseSeed: 4242,
          spellQueueWindowMs: window,
          meanDps: result.meanDps,
          stdDev: result.stdDev,
          sigma: (key.dps - result.meanDps) / result.stdDev,
        });
        const model = buildReportModel(fight);
        expect(model.bot).toBeNull();
        expect(model.totals.damage).toBe(fight.snapshot.damageTotal);
        expect(model.seconds.reduce((a, b) => a + b.damage, 0)).toBe(fight.snapshot.damageTotal);
        expect(model.totals.dps).toBe(key.dps);
      }
    });
  }

  it('uses the snapshot config, not anything current; a run outside the simulation is a RangeError', async () => {
    const config = { ...scenarios().default!, fightDurationSec: 30 };
    const result = await simulate({ setup: config, runs: 3, seed: 9, spellQueueWindowMs: 400 });
    const fight = replaySimFight({ result, config }, 1, 'sim-typical', 'k', null);
    expect(fight.snapshot.durationMs).toBe(30000);
    expect(fight.config.fightDurationSec).toBe(30);
    expect(fight.labels.fight).toMatch(/^30\ss, 28\syd$/);
    expect(() => replaySimFight({ result, config }, 3, 'sim-typical', 'k', null)).toThrow(RangeError);
    expect(() => replaySimFight({ result, config }, -1, 'sim-typical', 'k', null)).toThrow(RangeError);
    // A gear the embedded tables cannot build without the database: an Error (never another gear's numbers).
    const gearCfg = scenarios().quagBloodgem!;
    const r2 = await simulate({ setup: gearCfg, db, runs: 2, seed: 1, spellQueueWindowMs: 400 });
    expect(() => replaySimFight({ result: r2, config: gearCfg }, 0, 'sim-highest', 'k', null)).toThrow(Error);
  });

  it('sigma is null when every run had the same DPS', () => {
    const config = scenarios().default!;
    const result = { runs: 2, seed: 5, spellQueueWindowMs: 400, meanDps: 1000, stdDev: 0 };
    expect(replaySimFight({ result, config }, 0, 'sim-highest', 'k', null).sim!.sigma).toBeNull();
  });
});

describe('the played fight and fights given as {log, config, seed, durationMs}', () => {
  it('reportModel(last) is buildReportModel(fightFromLast(last)); the bot comparison stays; one fight object per LastFight', () => {
    const last = playedFight(scenarios().consumables!, 11);
    const f = fightFromLast(last);
    expect(fightFromLast(last)).toBe(f);
    expect(f).toMatchObject({ id: 1, key: 'played:1', kind: 'played', compareBot: true, sim: null, seed: 11 });
    const a = reportModel(last);
    const b = buildReportModel(f);
    expect(a.bot).not.toBeNull();
    expect(b.bot).toBe(a.bot);
    expect(JSON.stringify({ ...a, name: null, bot: null })).toBe(JSON.stringify({ ...b, name: null, bot: null }));
    expect(a.totals.damage).toBe(last.snapshot.damageTotal);
    expect(a.seconds.at(-1)!.cumulativeDps).toBe(last.snapshot.dps);
  });

  it('fightFromInput: the same numbers from the log alone (derived final), the snapshot names; a played one compares with the bot', () => {
    const config = scenarios().consumables!;
    const last = playedFight(config, 12);
    const derived = finalFromLog(last.log, last.snapshot.durationMs, last.fight.spec);
    expect(derived.damageTotal).toBe(last.snapshot.damageTotal);
    expect(derived.dps).toBe(last.snapshot.dps);
    expect(derived.castCounts).toEqual(last.snapshot.castCounts);
    expect(derived.useCounts).toEqual(last.snapshot.useCounts);
    const f = fightFromInput({ key: 'history:h1', kind: 'played', log: last.log, config, seed: 12, durationMs: last.snapshot.durationMs }, nextFightOf(config));
    expect(f.id).toBeLessThan(0);
    expect(f.compareBot).toBe(true);
    expect(f.labels).toEqual(last.labels);
    const a = reportModel(last);
    const b = buildReportModel(f);
    expect(b.spells).toEqual(a.spells);
    expect(b.totals).toEqual(a.totals);
    expect(b.timeline).toEqual(a.timeline);
    expect(b.seconds).toEqual(a.seconds);
    expect(b.rotation).toEqual(a.rotation);
    expect(b.bot!.dps).toBe(a.bot!.dps);
    // With the final numbers given, the model is the played fight's exactly.
    const g = fightFromInput({ key: 'history:h1', kind: 'played', log: last.log, config, seed: 12, durationMs: last.snapshot.durationMs, final: last.snapshot }, nextFightOf(config));
    expect(buildReportModel(g).kpis).toEqual(a.kpis);
    // A simulation's fight given this way has no bot comparison.
    const s = fightFromInput({ key: 'k', kind: 'sim-lowest', log: last.log, config, seed: 12, durationMs: 60000 }, nextFightOf(config));
    expect(buildReportModel(s).bot).toBeNull();
  });
});
