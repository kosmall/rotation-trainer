import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { LogEvent } from '../../src/engine/types';
import { scenarioRunSetup } from '../../src/scenarios/cli';
import { exampleScenarios } from '../../src/scenarios/examples';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { createFightSimulation } from '../../src/sim-runner/fight';
import { mixSeed, prepareRun, runOnce, simulate } from '../../src/sim-runner/run';
import type { SimRequest } from '../../src/sim-runner/types';
import { scenarios } from '../fixtures/item-use-reference';

// Rule fires (rotation scripts Task 4; docs/data-sources.md Part J, "Rule fires"): per fight, how
// many casts / item uses each priority step started, attributed through the bot's read-only press
// observer; a queued press counts when the queued spell actually starts.

const db = itemDbSync();
const request = (setup: SetupConfig, p: Partial<SimRequest> = {}): SimRequest => ({
  setup: structuredClone(setup),
  db,
  runs: 12,
  seed: 4711,
  spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
  ...p,
});

const BUSY = scenarios().long300!;
const example = (file: string) => scenarioRunSetup(exampleScenarios(db).find((e) => e.file === file)!.scenario, db);

/**
 * Starts per spell read from the log alone: every completed cast, every cancelled cast, and the
 * cast still in progress when the fight ended (a `cast-start` with no completion or cancel after it).
 */
function startsFromLog(log: readonly LogEvent[]): Map<string, number> {
  const starts = new Map<string, number>();
  const add = (id: string) => starts.set(id, (starts.get(id) ?? 0) + 1);
  let open: string | null = null;
  for (const e of log) {
    if (e.type === 'cast-start') open = e.spellId!;
    else if (e.type === 'cast-complete') {
      add(e.spellId!);
      if (open === e.spellId) open = null;
    } else if (e.type === 'cast-cancel') {
      add(e.spellId!);
      open = null;
    }
  }
  if (open !== null) add(open);
  return starts;
}

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);

describe('rule fires', () => {
  it('the press observer changes nothing: the log with and without it is the same, event for event', () => {
    for (const setup of [DEFAULT_SETUP as SetupConfig, BUSY, example('shadowburn-hold')]) {
      const f = prepareRun(request(setup));
      for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
        for (const i of [0, 5]) {
          const a = createFightSimulation(f.fight, mixSeed(1, i), w);
          const b = createFightSimulation(f.fight, mixSeed(1, i), w);
          const ra = runBot(a, f.fight.spec.priority);
          const pressed: number[] = [];
          const rb = runBot(b, f.fight.spec.priority, 10, (step) => pressed.push(step));
          expect(rb).toEqual(ra);
          expect(JSON.stringify(b.log())).toBe(JSON.stringify(a.log()));
          expect(pressed.length).toBeGreaterThan(10);
          for (const s of pressed) expect(f.fight.spec.priority[s]!.kind).not.toBe('wait');
        }
      }
    }
  });

  it('basic rotation: keyed by spell id and item entry id in step order; per run each key equals the starts of its spell in the log', () => {
    for (const w of [SPELL_QUEUE_WINDOW_MS, 0]) {
      const f = prepareRun(request(BUSY, { spellQueueWindowMs: w }));
      const keys = f.rules.map((r) => r.key);
      expect(keys).toContain('destruction-potion');
      expect(keys).toContain('item:29370');
      expect(keys).toContain('curse-of-the-elements');
      expect(keys).toContain('shadow-bolt');
      expect(keys.at(-1)).toBe('shadow-bolt');
      for (const i of [0, 1, 2]) {
        const s = runOnce(f, i);
        const sim = createFightSimulation(f.fight, mixSeed(f.seed, i), w);
        runBot(sim, f.fight.spec.priority);
        const starts = startsFromLog(sim.log());
        f.rules.forEach((r, k) => {
          const spellId = f.fight.spec.priority[r.step]!.spellId;
          expect(s.ruleFires[k], `${r.key} window ${w} run ${i}`).toBe(starts.get(spellId) ?? 0);
        });
        expect(sum(s.ruleFires)).toBe(sum(starts.values()));
      }
    }
  });

  it('a script: two rules casting Shadowburn are told apart, the wait rule is not listed, sums equal the starts in the log', () => {
    const f = prepareRun(request(example('shadowburn-hold')));
    const keys = f.rules.map((r) => r.key);
    const priority = f.fight.spec.priority;
    expect(keys).toEqual(priority.filter((s) => s.kind !== 'wait').map((s) => s.key));
    expect(keys).toEqual(expect.arrayContaining(['rules[0]', 'rules[1]', 'rules[2]']));
    expect(keys).not.toContain('rules[3]'); // the wait rule
    let early = 0;
    for (let i = 0; i < 8; i++) {
      const s = runOnce(f, i);
      const sim = createFightSimulation(f.fight, mixSeed(f.seed, i), SPELL_QUEUE_WINDOW_MS);
      runBot(sim, priority);
      const starts = startsFromLog(sim.log());
      expect(sum(s.ruleFires)).toBe(sum(starts.values()));
      const bySpell = new Map<string, number>();
      f.rules.forEach((r, k) => {
        const id = priority[r.step]!.spellId;
        bySpell.set(id, (bySpell.get(id) ?? 0) + s.ruleFires[k]!);
      });
      for (const [id, n] of starts) expect(bySpell.get(id) ?? 0, id).toBe(n);
      early += s.ruleFires[keys.indexOf('rules[2]')]!;
    }
    expect(early).toBeGreaterThan(8); // Shadowburn on cooldown: several per fight
  });

  it('simulate: ruleFires has every pressing rule (0 when it never fires), labels, and means of the per-run counts', async () => {
    const setup: SetupConfig = {
      ...structuredClone(DEFAULT_SETUP),
      script: {
        rules: [
          { action: 'cast', id: 'immolate', if: 'false', label: 'Never' },
          { action: 'cast', id: 'curse-of-the-elements', if: '!target.aura.curse-of-the-elements.active' },
          { action: 'wait', if: 'false' },
          { action: 'cast', id: 'shadow-bolt' },
        ],
      },
    } as SetupConfig;
    const req = request(setup, { runs: 10 });
    const r = await simulate(req);
    expect(Object.keys(r.ruleFires!)).toEqual(['rules[0]', 'rules[1]', 'rules[3]']);
    expect(r.ruleFires!['rules[0]']).toEqual({ label: 'Never', meanFires: 0 });
    expect(r.ruleFires!['rules[1]']!.label).toBe('Curse of the Elements');
    expect(r.ruleFires!['rules[3]']!.label).toBe('Shadow Bolt');
    const f = prepareRun(req);
    const samples = Array.from({ length: 10 }, (_, i) => runOnce(f, i));
    const mean = (k: number) => samples.reduce((a, s) => a + s.ruleFires[k]!, 0) / 10;
    expect(r.ruleFires!['rules[1]']!.meanFires).toBe(mean(1));
    expect(r.ruleFires!['rules[3]']!.meanFires).toBe(mean(2));
    expect(r.ruleFires!['rules[1]']!.meanFires).toBeGreaterThanOrEqual(1);
  });

  it('basic rotation result: item rules equal the item uses; spell rules are at least the completed casts', async () => {
    const r = await simulate(request(BUSY, { runs: 6 }));
    const f = prepareRun(request(BUSY));
    expect(Object.keys(r.ruleFires!)).toEqual(f.rules.map((x) => x.key));
    expect(r.ruleFires!['destruction-potion']!.meanFires).toBe(r.itemUses['use-destruction-potion']);
    expect(r.ruleFires!['destruction-potion']!.label).toMatch(/Destruction Potion/);
    expect(r.ruleFires!['shadow-bolt']!.meanFires).toBeGreaterThanOrEqual(r.perSpell['shadow-bolt']!.meanCasts);
    expect(r.ruleFires!['shadow-bolt']!.meanFires - r.perSpell['shadow-bolt']!.meanCasts).toBeLessThanOrEqual(1);
  });
});
