// Report → Compare: the paired comparison panel (rotation scripts Task 5, adapted to the
// redesigned Report). The runner is injected (`compareRunner`); the real `compare` runs the
// fights on the main thread with fake timers. Covers: 3 scenarios on the same seeds with the
// delta, verdict and rank; cancel; the 2-5 clamp and the Runs clamp; the settings snapshot at the
// click; labels and the baseline; an invalid scenario row; the caveat; the user's trinket example
// built through the UI (typing the expressions) against the basic rotation; golden values.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import { SCENARIO_EXAMPLES } from '../../src/scenarios/examples';
import { applyScenario, readScenario } from '../../src/scenarios/format';
import { SCENARIOS_STORAGE_KEY } from '../../src/scenarios/storage';
import type { Scenario } from '../../src/scenarios/types';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { compare } from '../../src/sim-runner/compare';
import { prepareRun, runWithSeed, simulate } from '../../src/sim-runner/run';
import type { CompareResult, SimRequest } from '../../src/sim-runner/types';
import { AppShell } from '../../src/ui/shell/AppShell';
import { TrainerProvider, useTrainer } from '../../src/ui/state/TrainerProvider';
import type { CompareRunner, TrainerActions } from '../../src/ui/state/TrainerProvider';
import { goTo, renderApp } from './renderApp';

const FAKE_NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

const db: ItemDb = itemDbSync();
const loadDb = () => Promise.resolve(db);
const example = (file: string) => readScenario(SCENARIO_EXAMPLES.find((e) => e.file === file)!.json).scenario!;

function memory(setup: Partial<SetupConfig> = {}, scenarios: { id: string; scenario: Scenario }[] = []) {
  const map = new Map<string, string>([
    [SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...setup })],
    [SCENARIOS_STORAGE_KEY, JSON.stringify({ version: 1, scenarios })],
  ]);
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

/** A runner that records the requests (copied at the call) and runs the real comparison. */
function recordingRunner() {
  const calls: { requests: SimRequest[]; signal?: AbortSignal; result?: CompareResult }[] = [];
  const runner: CompareRunner = async (requests, options) => {
    const call: (typeof calls)[number] = { requests: structuredClone(requests), signal: options?.signal };
    calls.push(call);
    call.result = await compare(requests, { onProgress: options?.onProgress, signal: options?.signal, chunk: 5 });
    return call.result;
  };
  return { runner, calls };
}

const panel = () => screen.getByRole('region', { name: 'Compare' });
const pick = (name: string) => within(panel()).getByRole('checkbox', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }) as HTMLInputElement;
const runButton = () => within(panel()).getByRole('button', { name: /^Compare \d Scenarios?$/ }) as HTMLButtonElement;
const cancelButton = () => within(panel()).queryByRole('button', { name: 'Cancel' });
const spin = (name: string) => within(panel()).getByRole('spinbutton', { name }) as HTMLInputElement;
const result = () => within(panel()).queryByRole('region', { name: 'Comparison result' });
const tableRows = () => [...result()!.querySelectorAll('table.cmp-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));

function setField(name: string, value: string) {
  fireEvent.change(spin(name), { target: { value } });
  fireEvent.blur(spin(name));
}

async function finish() {
  for (let i = 0; i < 2000 && cancelButton() !== null; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
  expect(cancelButton()).toBeNull();
}

const potion = example('burst-potion');
const hold = example('shadowburn-hold');
const life = example('life-tap-mana');

describe('Compare: empty and choosing', () => {
  it('without saved scenarios: the empty state with the way to Scenarios', async () => {
    renderApp({ route: '#/report/compare' });
    await settle();
    expect(within(panel()).getByRole('link', { name: 'Open Scenarios' }).getAttribute('href')).toBe('#/setup/scenarios');
  });

  it('chooses 2 to 5: Run needs two; a sixth cannot be ticked; Runs is clamped; the baseline can change', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, scenario: { ...potion, name: `Scenario ${i}` } }));
    const m = memory({}, six);
    renderApp({ route: '#/report/compare', storage: m.storage });
    await settle();
    expect(pick('Current setup').checked).toBe(true);
    expect(runButton().disabled).toBe(true);
    expect(within(panel()).getByText('Choose at least two scenarios.')).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.click(pick(`Scenario ${i}`));
    expect(runButton().textContent).toBe('Compare 5 Scenarios');
    expect(pick('Scenario 4').disabled).toBe(true);
    expect(within(panel()).getByText(/At most 5 scenarios at once/)).toBeTruthy();
    setField('Runs', '999999');
    expect(spin('Runs').value).toBe('100000');
    setField('Runs', '0');
    expect(spin('Runs').value).toBe('1');
    setField('Seed', '-5');
    expect(spin('Seed').value).toBe('0');
    const base = within(panel()).getByRole('combobox', { name: 'Baseline' }) as HTMLSelectElement;
    expect([...base.options].map((o) => o.textContent)).toEqual(['Current setup', 'Scenario 0', 'Scenario 1', 'Scenario 2', 'Scenario 3']);
    fireEvent.change(base, { target: { value: 's2' } });
    expect(base.value).toBe('s2');
    expect([...base.options].map((o) => o.textContent)[0]).toBe('Scenario 2');
  });

  it('a scenario with an error against this setup: the row says so with a link, and Run is blocked', async () => {
    const broken: Scenario = { ...potion, name: 'Broken', script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: 'mana <' }] } };
    renderApp({ route: '#/report/compare', storage: memory({}, [{ id: 'broken', scenario: broken }]).storage });
    await settle();
    fireEvent.click(pick('Broken'));
    const row = pick('Broken').closest('li')!;
    expect(row.textContent).toMatch(/script\.rules\[0\]\.if: column/);
    expect(within(row).getByRole('link', { name: 'Fix it in Scenarios' }).getAttribute('href')).toBe('#/setup/scenarios');
    expect(runButton().disabled).toBe(true);
  });
});

describe('Compare: running', () => {
  it('runs 3 scenarios on the same seeds: the table shows mean, σ, SEM, Δ with its SE, CI and verdict, the rank; results equal simulate', async () => {
    const { runner, calls } = recordingRunner();
    const m = memory({ enabledBuffs: [...DEFAULT_SETUP.enabledBuffs, 'destruction-potion'] }, [
      { id: 'hold', scenario: hold },
      { id: 'life', scenario: life },
    ]);
    renderApp({ route: '#/report/compare', storage: m.storage, compareRunner: runner, loadDb });
    await settle();
    fireEvent.click(pick(hold.name));
    fireEvent.click(pick(life.name));
    setField('Runs', '40');
    setField('Seed', '7');
    fireEvent.click(runButton());
    expect(within(panel()).getByRole('progressbar', { name: 'Comparison progress' })).toBeTruthy();
    await finish();

    expect(calls).toHaveLength(1);
    const { requests, result: res } = calls[0]!;
    expect(requests.map((r) => [r.runs, r.seed, r.spellQueueWindowMs])).toEqual([
      [40, 7, 400],
      [40, 7, 400],
      [40, 7, 400],
    ]);
    const config = JSON.parse(m.map.get(SETUP_STORAGE_KEY)!) as SetupConfig;
    expect(requests[0]!.setup).toEqual(config);
    expect(requests[1]!.setup).toEqual(applyScenario(config, hold, { includeSetup: true, db }));
    expect(requests[2]!.setup).toEqual(applyScenario(config, life, { includeSetup: true, db }));
    for (let k = 0; k < 3; k++) expect(res!.results[k]).toEqual(await simulate(requests[k]!, { chunk: 1000 }));

    const rows = tableRows();
    expect(rows.map((r) => r[1])).toEqual(['Current setup', hold.name, life.name]);
    expect(rows[0]![5]).toBe('Baseline');
    for (let k = 1; k < 3; k++) {
      const d = res!.deltas[k]!;
      expect(rows[k]![0]).toBe(String(res!.ranks[k]));
      expect(rows[k]![5]).toMatch(/^[+−±][\d,]+\.\d$/);
      expect(rows[k]![8]).toBe(!d.significant ? 'No clear difference' : d.meanDiff > 0 ? 'Better (significant)' : 'Worse (significant)');
    }
    expect(within(result()!).getAllByRole('img', { name: /^DPS histogram, / })).toHaveLength(3);
    expect(within(result()!).getByRole('group', { name: `Rule fires, ${hold.name}` }).textContent).toMatch(/rules\[0\]/);
    const note = within(result()!).getByRole('note', { name: 'How to read the comparison' }).textContent;
    expect(note).toMatch(/multiple comparisons/);
    expect(note).toMatch(/with 2 tests, the chance that at least one “significant” verdict is luck is about 10%/);
    expect(within(panel()).getByRole('status').textContent).toMatch(/^Done: 120 fights/);

    // The result stays when the Report is left and opened again (the trainer keeps the last one).
    goTo('#/setup/scenarios');
    await settle();
    goTo('#/report/compare');
    await settle();
    expect(tableRows().map((r) => r[1])).toEqual(['Current setup', hold.name, life.name]);
  });

  it('Cancel stops the run and keeps the previous result; the signal is aborted', async () => {
    let signal: AbortSignal | undefined;
    const runner: CompareRunner = (_requests, options) =>
      new Promise((_resolve, reject) => {
        signal = options?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    renderApp({ route: '#/report/compare', storage: memory({}, [{ id: 'p', scenario: potion }]).storage, compareRunner: runner });
    await settle();
    fireEvent.click(pick(potion.name));
    fireEvent.click(runButton());
    expect(runButton().disabled).toBe(true);
    fireEvent.click(cancelButton()!);
    expect(signal?.aborted).toBe(true);
    expect(within(panel()).getByRole('status').textContent).toBe('Cancelled: the previous result is kept.');
    expect(result()).toBeNull();
    expect(runButton().disabled).toBe(false);
  });

  it('takes the settings at the click: a setup edited during the run does not change what runs or the labels', async () => {
    let resolve!: (r: CompareResult) => void;
    const seen: SimRequest[][] = [];
    const runner: CompareRunner = (requests) => {
      seen.push(structuredClone(requests));
      return new Promise((r) => (resolve = r));
    };
    let actions!: TrainerActions;
    let config!: SetupConfig;
    function Probe() {
      const t = useTrainer();
      actions = t.actions;
      config = t.state.config;
      return null;
    }
    window.location.hash = '#/report/compare';
    render(
      <TrainerProvider storage={memory({}, [{ id: 'p', scenario: potion }]).storage} compareRunner={runner}>
        <AppShell />
        <Probe />
      </TrainerProvider>,
    );
    await settle();
    fireEvent.click(pick(potion.name));
    setField('Runs', '3');
    setField('Seed', '1');
    fireEvent.click(runButton());
    act(() => actions.changeConfig({ ...config, fightDurationSec: 30 }));
    const real = await compare(seen[0]!, { chunk: 100 });
    await act(async () => resolve(real));
    expect(seen[0]![0]!.setup.fightDurationSec).toBe(60);
    expect(seen[0]![1]!.setup.fightDurationSec).toBe(potion.setup?.fightDurationSec ?? 60);
    expect(seen[0]![1]!.setup.enabledBuffs).toEqual(potion.setup?.enabledBuffs ?? DEFAULT_SETUP.enabledBuffs);
    expect(tableRows().map((r) => r[1])).toEqual(['Current setup', potion.name]);
    expect(within(result()!).getByText(/3 runs per scenario, seed 1/)).toBeTruthy();
  });
});

describe('Compare: the user’s example built through the UI', () => {
  it('the trinket script typed in the editor plays exactly as the example file and beats the basic rotation; golden values', async () => {
    const trinket = example('trinket-sequencing');
    // The example's setup with the basic rotation (both trinkets worn, neither enabled).
    const { script: _s, ...basicSetup } = applyScenario(DEFAULT_SETUP as SetupConfig, trinket, { includeSetup: true, db });
    const m = memory(basicSetup);
    const { runner, calls } = recordingRunner();
    renderApp({ route: '#/setup/scenarios', storage: m.storage, compareRunner: runner, loadDb });
    await settle();

    // The basic rotation as a scenario.
    fireEvent.click(screen.getByRole('button', { name: 'Save Current as Scenario…' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Name' }), { target: { value: 'Basic' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save Scenario' }));

    // The script: convert, then two use rules at the top, typed.
    goTo('#/setup/rotation');
    await settle();
    fireEvent.click(within(screen.getByRole('group', { name: 'Rotation mode' })).getByRole('button', { name: 'Script' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Convert the Basic Rotation' }));
    for (const [id, cond] of [
      ['item:29370', 'use.item:281735.count >= 1'],
      ['item:281735', 'heroism.active && target.aura.shadow-vulnerability.active'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
      const n = (JSON.parse(m.map.get(SETUP_STORAGE_KEY)!) as SetupConfig).script!.rules.length;
      fireEvent.change(screen.getByRole('combobox', { name: `Rule ${n} action` }), { target: { value: 'use' } });
      fireEvent.change(screen.getByRole('combobox', { name: `Rule ${n} id` }), { target: { value: id } });
      fireEvent.change(screen.getByRole('textbox', { name: `Rule ${n} condition` }), { target: { value: cond } });
      for (let i = n; i > 1; i--) fireEvent.click(screen.getByRole('button', { name: `Move rule ${i} up` }));
    }
    expect(screen.getByRole('status', { name: 'Script check' }).textContent).toBe('No errors or warnings');
    const typed = (JSON.parse(m.map.get(SETUP_STORAGE_KEY)!) as SetupConfig).script!;
    expect(typed.rules.map((r) => [r.action, r.id, r.if])).toEqual(trinket.script.rules.map((r) => [r.action, r.id, r.if]));

    goTo('#/report/compare');
    await settle();
    fireEvent.click(pick('Basic'));
    fireEvent.change(within(panel()).getByRole('combobox', { name: 'Baseline' }), { target: { value: 'basic' } });
    setField('Runs', '30');
    setField('Seed', '1');
    fireEvent.click(runButton());
    await finish();

    const { requests, result: res } = calls[0]!;
    // The typed script plays the example file's fights exactly (labels and comments do not play).
    const fromFile = await simulate({ ...requests[1]!, setup: applyScenario(DEFAULT_SETUP as SetupConfig, trinket, { includeSetup: true, db }) }, { chunk: 1000 });
    expect(res!.results[1]!.meanDps).toBe(fromFile.meanDps);
    expect(res!.results[1]!.perSpell).toEqual(fromFile.perSpell);
    // Plausible: both trinkets used about once per fight, and better than the basic rotation (which uses neither).
    const uses = res!.results[1]!.itemUses;
    expect(Object.values(uses).every((n) => n > 0.8 && n <= 1)).toBe(true);
    expect(Object.keys(res!.results[0]!.itemUses)).toEqual([]);
    expect(res!.deltas[1]!.meanDiff).toBeGreaterThan(5);
    expect(res!.deltas[1]!.meanDiff).toBeLessThan(400);
    expect(tableRows().map((r) => r[1])).toEqual(['Basic', 'Current setup']);

    // Golden values: the default setup as the panel sends it.
    const f = prepareRun({ setup: DEFAULT_SETUP as SetupConfig, runs: 10, seed: 1, spellQueueWindowMs: requests[0]!.spellQueueWindowMs });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => runWithSeed(f, s, 0).dps).reduce((a, b) => a + b, 0) / 10).toBe(1425.1766666666667);
  });
});
