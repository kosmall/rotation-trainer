// The bundled example scenarios (Task 3): one source (docs/scenarios/*.json, imported by
// src/scenarios/examples.ts), each valid without warnings, canonical, runnable with plausible DPS;
// the user's trinket example plays differently from the basic rotation; a scenario holding the
// converted default rotation plays the default setup's numbers exactly.

import { describe, expect, it } from 'vitest';
import { itemDbSync } from '../../src/data/items/dbSync';
import { scenarioRunSetup } from '../../src/scenarios/cli';
import { exampleScenarios, SCENARIO_EXAMPLES } from '../../src/scenarios/examples';
import { applyScenarioSetup, exportScenario, parseScenario, parseScenarioValue } from '../../src/scenarios/format';
import { SCENARIO_FORMAT } from '../../src/scenarios/types';
import { convertToScript } from '../../src/script/convert';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { prepareRun, runOnce, simulate } from '../../src/sim-runner/run';

type Fs = { readdirSync(path: URL): string[]; readFileSync(path: URL, enc: 'utf8'): string };
const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as Fs;
const dir = new URL('../../docs/scenarios/', import.meta.url);
const db = itemDbSync();
const request = (setup: SetupConfig, runs: number) => ({ setup, db, runs, seed: 1, spellQueueWindowMs: 400 });

describe('example scenarios', () => {
  it('every file of docs/scenarios is bundled, and only those (one source of truth)', () => {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(SCENARIO_EXAMPLES.map((e) => e.file).sort()).toEqual(files);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const e of SCENARIO_EXAMPLES) expect(e.json).toEqual(JSON.parse(fs.readFileSync(new URL(`${e.file}.json`, dir), 'utf8')));
    expect(exampleScenarios(db).map((e) => e.file)).toEqual(SCENARIO_EXAMPLES.map((e) => e.file));
  });

  for (const e of SCENARIO_EXAMPLES) {
    describe(e.file, () => {
      const text = fs.readFileSync(new URL(`${e.file}.json`, dir), 'utf8');

      it('is valid with no warning (ids checked against its own setup), and canonical (export writes it back byte for byte)', () => {
        const r = parseScenario(text, { db });
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([]);
        expect(r.scenario!.description).toBeTruthy();
        expect(exportScenario(r.scenario!)).toBe(text);
        expect(parseScenarioValue(e.json, { db }).scenario).toEqual(r.scenario);
      });

      it('compiles with every rule active and runs with plausible DPS', async () => {
        const s = parseScenario(text, { db }).scenario!;
        const setup = scenarioRunSetup(s, db);
        const applied = applyScenarioSetup(setup, db);
        expect(applied.script.active).toBe(true);
        expect(applied.script.keys).toHaveLength(s.script.rules.length);
        const result = await simulate(request(setup, 40));
        expect(result.meanDps).toBeGreaterThan(900);
        expect(result.meanDps).toBeLessThan(2500);
        expect(result.perSpell['shadow-bolt']!.share).toBeGreaterThan(0.5);
      });
    });
  }

  it("the user's example: the Pipe only with Heroism and Improved Shadow Bolt, the Icon after it; DPS differs from the basic rotation", async () => {
    const s = parseScenario(fs.readFileSync(new URL('trinket-sequencing.json', dir), 'utf8'), { db }).scenario!;
    const setup = scenarioRunSetup(s, db);
    const factory = prepareRun(request(setup, 30));
    let both = 0;
    for (let i = 0; i < 30; i++) {
      const run = runOnce(factory, i);
      const pipe = run.itemUses['use-item-281735'] ?? 0;
      const icon = run.itemUses['use-item-29370'] ?? 0;
      expect(pipe).toBeLessThanOrEqual(1);
      expect(icon).toBeLessThanOrEqual(pipe);
      if (pipe === 1 && icon === 1) both++;
    }
    expect(both).toBeGreaterThanOrEqual(25);
    const basic: SetupConfig = { ...setup };
    delete basic.script;
    const [withScript, without] = await Promise.all([simulate(request(setup, 100)), simulate(request(basic, 100))]);
    expect(without.itemUses).toEqual({});
    expect(withScript.meanDps).not.toBe(without.meanDps);
    expect(withScript.meanDps).toBeGreaterThan(without.meanDps);
  });

  it('a scenario holding the converted default rotation plays exactly the default setup (golden path unchanged)', async () => {
    const config = structuredClone(DEFAULT_SETUP) as SetupConfig;
    const applied = applyScenarioSetup(config, db);
    const script = convertToScript(config, applied.basic);
    const text = JSON.stringify({ format: SCENARIO_FORMAT, version: 1, name: 'Converted default', script });
    const r = parseScenario(text, { db });
    expect(r.errors).toEqual([]);
    const [viaScenario, basic] = await Promise.all([simulate(request(scenarioRunSetup(r.scenario!, db), 50)), simulate(request(config, 50))]);
    expect(viaScenario.meanDps).toBe(basic.meanDps);
    expect(viaScenario.perSpell).toEqual(basic.perSpell);
  });
});
