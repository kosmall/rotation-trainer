// The fast bot (skips the steps at which no press can be accepted) must play exactly the fights
// of the 10 ms stepping bot: byte-identical logs and the same RNG draws. Pinned against a capture
// made before the performance wave, and compared live with a literal copy of the old bot.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import { BOSS_TARGET } from '../../src/data/common/target';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { Rng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import { applySetup } from '../../src/setup/applySetup';
import { SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { PERF_REFERENCE } from '../fixtures/bot-perf-reference-data';
import { perfScenarios, steppingRunBot } from '../fixtures/bot-perf-scenarios';
import { botReference } from '../fixtures/item-use-reference';

const db = itemDbSync();
const SCENARIOS = perfScenarios(db);

function fight(config: SetupConfig, seed: number, spellQueueWindowMs: number) {
  const { spec, sim } = applySetup({
    buildSpec: (w, g) => (g === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, g, db)),
    catalog: SETUP_CATALOG,
    config,
    db,
  });
  const s = new Simulation({
    spec,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs,
    distanceFromTarget: sim.distanceFromTarget,
    scheduledAuras: sim.scheduledAuras,
    durationMs: sim.durationMs,
  });
  const rng = (s as unknown as { rng: Rng }).rng;
  const next = rng.next.bind(rng);
  const counter = { draws: 0 };
  rng.next = () => {
    counter.draws++;
    return next();
  };
  return { sim: s, priority: spec.priority, counter };
}

describe('fast bot equals the 10 ms stepping bot', () => {
  it('has a pinned reference for every scenario (23: Task 1, all gear presets, sb-spam, item rules, 10 s and 300 s)', () => {
    expect(Object.keys(PERF_REFERENCE).sort()).toEqual(Object.keys(SCENARIOS).sort());
    expect(Object.keys(SCENARIOS)).toHaveLength(23);
  });

  for (const name of Object.keys(SCENARIOS)) {
    it(`${name}: logs (hash, length), RNG draws and means over seeds 1-10 at windows 400 and 0 equal the capture`, () => {
      expect(botReference(SCENARIOS[name]!, db)).toEqual(PERF_REFERENCE[name]);
    }, 60000);
  }

  it('golden means stay exact', () => {
    expect(PERF_REFERENCE.default![400]!.mean).toBe(1425.1766666666667);
    expect(PERF_REFERENCE.default![0]!.mean).toBe(1428.3350000000003);
    expect(PERF_REFERENCE.raidLog![400]!.mean).toBe(2294.108333333333);
    expect(PERF_REFERENCE.iconBand![400]!.mean).toBe(1379.2966666666666);
    expect(PERF_REFERENCE.iconBand![0]!.mean).toBe(1373.4900000000002);
  });

  it('live: odd queue windows and step sizes give the same full log, result and RNG draws as the old bot', () => {
    const names = ['default', 'long300', 'gear-t6', 'rulesPull', 'quagBloodgem', 'sbSpam'];
    for (const name of names) {
      for (const w of [0, 1, 150, 399, 400, 1000]) {
        for (const stepMs of [1, 2.5, 7, 10, 33, 100]) {
          if ((stepMs === 1 || stepMs === 2.5) && w !== 400) continue; // keep the test short
          for (const seed of [3, 17]) {
            const a = fight(SCENARIOS[name]!, seed, w);
            const b = fight(SCENARIOS[name]!, seed, w);
            const ra = steppingRunBot(a.sim, a.priority, stepMs);
            const rb = runBot(b.sim, b.priority, stepMs);
            const tag = `${name} window ${w} step ${stepMs} seed ${seed}`;
            expect(rb, tag).toEqual(ra);
            expect(b.sim.log(), tag).toEqual(a.sim.log());
            expect(b.counter.draws, tag).toBe(a.counter.draws);
            expect(b.sim.snapshot(), tag).toEqual(a.sim.snapshot());
          }
        }
      }
    }
  }, 300000);

  it('nextPressOpportunityMs is a true lower bound: walking every 1 ms, no press is accepted before it', () => {
    for (const name of ['default', 'long300', 'rulesPull', 'gear-swp']) {
      for (const w of [0, 400]) {
        const { sim, priority } = fight(SCENARIOS[name]!, 5, w);
        const cast = sim.cast.bind(sim);
        let bound = -Infinity;
        let accepted = 0;
        sim.cast = (id: string) => {
          const r = cast(id);
          if (r.ok) {
            accepted++;
            expect(sim.snapshot().nowMs, `${name} window ${w} ${id}`).toBeGreaterThanOrEqual(bound);
          }
          return r;
        };
        const advance = sim.advanceTo.bind(sim);
        sim.advanceTo = (t: number) => {
          // The bound after this step's presses, for the steps to come.
          bound = sim.nextPressOpportunityMs();
          expect(bound).toBeGreaterThanOrEqual(sim.snapshot().nowMs);
          advance(t);
        };
        steppingRunBot(sim, priority, 1);
        expect(accepted).toBeGreaterThan(20);
        expect(sim.currentPhase()).toBe('ended');
      }
    }
  }, 120000);
});
