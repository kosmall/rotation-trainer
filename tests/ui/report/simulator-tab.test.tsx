// The Report's Simulator tab (UI redesign Task 4): the legacy Simulator panel's tests migrated to
// renderApp('#/report/simulator') (the panel and its test file were removed with the legacy layout in
// Task 5, its last tests are the four at the end of this file), plus the "You" marker after a fight
// and the Setup summary's last simulation. jsdom has no Worker: the default runner runs on the main
// thread in chunks yielding with setTimeout(0), so the fake timers are advanced.

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSimulation, type SimRunner } from '../../../src/sim-runner/client';
import { simulate } from '../../../src/sim-runner/run';
import type { SimRequest, SimResult } from '../../../src/sim-runner/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY, type SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import { formatDps } from '../../../src/ui/format';
import panelSource from '../../../src/ui/SimulatorPanel.tsx?raw';
import { goTo, renderApp } from '../renderApp';

const FAKE_NOW = 1_800_000_000_000;
const NO_YIELD = { chunk: 1_000_000 };

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.location.hash = '';
});

function memoryStorage(initial?: string): SetupStorage {
  const map = new Map<string, string>(initial === undefined ? [] : [[SETUP_STORAGE_KEY, initial]]);
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

async function openSimulator(options: Parameters<typeof renderApp>[0] = {}) {
  renderApp({ route: '#/report/simulator', ...options });
  await settle();
}

const panel = () => screen.getByRole('region', { name: 'Simulator' });
const runsInput = () => within(panel()).getByRole('spinbutton', { name: 'Runs' }) as HTMLInputElement;
const seedInput = () => within(panel()).getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement;
const runButton = () => within(panel()).getByRole('button', { name: /^Run [\d,]+ Fights?$/ });
const cancelButton = () => within(panel()).queryByRole('button', { name: 'Cancel' });
const resultRegion = () => within(panel()).queryByRole('region', { name: 'Simulation result' });
const stat = (name: string) => within(resultRegion()!).getByLabelText(name).textContent;

function setRuns(value: string) {
  fireEvent.change(runsInput(), { target: { value } });
  fireEvent.blur(runsInput());
}

function setSeed(value: string) {
  fireEvent.change(seedInput(), { target: { value } });
  fireEvent.blur(seedInput());
}

async function finishRun() {
  for (let i = 0; i < 500 && cancelButton() !== null; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
  expect(cancelButton()).toBeNull();
}

async function runWith(runs: string, seed: string) {
  setRuns(runs);
  setSeed(seed);
  fireEvent.click(runButton());
  await finishRun();
}

function recordingRunner() {
  const calls: { request: SimRequest; result?: SimResult }[] = [];
  const runner: SimRunner = async (request, options) => {
    const call: { request: SimRequest; result?: SimResult } = { request: structuredClone(request) };
    calls.push(call);
    call.result = await runSimulation(request, options);
    return call.result;
  };
  return { runner, calls };
}

function holdingRunner() {
  const held: { request: SimRequest; onProgress?: (d: number, t: number) => void; resolve(r: SimResult): void }[] = [];
  let first = true;
  const runner: SimRunner = (request, options = {}) => {
    if (first) {
      first = false;
      return runSimulation(request, options);
    }
    return new Promise<SimResult>((resolve, reject) => {
      held.push({ request: structuredClone(request), onProgress: options.onProgress, resolve });
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };
  return { runner, held };
}

describe('Report: Simulator tab', () => {
  it('works without a fight: Runs 1000, a blank seed, the estimate, the Run button says how many', async () => {
    await openSimulator();
    expect(runsInput().value).toBe('1000');
    expect(seedInput().value).toBe('');
    expect(within(panel()).getByText(/estimate/i)).toBeTruthy();
    expect(runButton().textContent).toBe('Run 1,000 Fights');
    setRuns('1');
    expect(runButton().textContent).toBe('Run 1 Fight');
  });

  it('Run with 50 runs shows mean, σ, SEM and CI; the result matches simulate() for the same request exactly', async () => {
    const { runner, calls } = recordingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('50', '123');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.request;
    expect(req).toMatchObject({ runs: 50, seed: 123, spellQueueWindowMs: 400 });
    expect(req.setup).toEqual(DEFAULT_SETUP);
    expect(req.db).toBeUndefined();
    const expected = await simulate(req, NO_YIELD);
    expect(JSON.stringify(calls[0]!.result)).toBe(JSON.stringify(expected));
    expect(stat('Mean DPS')).toBe(formatDps(expected.meanDps));
    expect(stat('Standard deviation (σ)')).toBe(formatDps(expected.stdDev));
    expect(stat('Standard error of the mean')).toBe(formatDps(expected.stdErr));
    expect(stat('95% confidence interval of the mean')).toBe(`${formatDps(expected.ci95[0])} – ${formatDps(expected.ci95[1])}`);
    expect(stat('Median')).toBe(formatDps(expected.median));
    expect(stat('5th percentile')).toBe(formatDps(expected.percentiles.p5));
    expect(stat('95th percentile')).toBe(formatDps(expected.percentiles.p95));
    expect(stat('Min')).toBe(formatDps(expected.min));
    expect(stat('Max')).toBe(formatDps(expected.max));
    const region = resultRegion()!;
    expect(within(region).getByRole('img', { name: /DPS histogram/ })).toBeTruthy();
    expect(within(region).getByRole('table', { name: 'Per spell' })).toBeTruthy();
    expect(within(region).getByRole('cell', { name: 'Shadow Bolt' })).toBeTruthy();
    expect(within(region).getByLabelText('Life Taps per fight').textContent).toBe(expected.meanLifeTaps.toFixed(2));
    expect(within(region).getAllByText(/Uptime/).length).toBeGreaterThan(0);
    // No fight yet: no "You" marker.
    expect(within(region).queryByText(/^You /)).toBeNull();
  });

  it('the result lists the settings it came from; the note says what ± means and the limits', async () => {
    await openSimulator();
    await runWith('20', '77');
    const text = within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent ?? '';
    expect(text).toContain('Gear: My gear (export)');
    expect(text).toContain('Setup: None');
    expect(text).toContain('Curse of the Elements');
    expect(text).toContain('Item rules: default');
    expect(text).toContain('Fight: 60 s');
    expect(text).toContain('Spell queue window: 400 ms');
    expect(text).toContain('Runs: 20');
    expect(text).toContain('Seed: 77');
    const note = within(panel()).getByRole('note', { name: 'What ± means' }).textContent ?? '';
    expect(note).toMatch(/σ/);
    expect(note).toMatch(/standard error/i);
    expect(note).toMatch(/compar/i);
  });

  it('a fixed seed gives the same result twice; a blank seed draws a random one and shows it', async () => {
    await openSimulator();
    await runWith('20', '4242');
    const first = stat('Mean DPS');
    await runWith('20', '4242');
    expect(stat('Mean DPS')).toBe(first);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    await runWith('20', '');
    expect(within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent).toContain('Seed: 1073741824');
    expect(seedInput().value).toBe('');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reuse seed 1073741824' }));
    expect(seedInput().value).toBe('1073741824');
  });

  it('runs clamp to 1-100 000 on blur (0, 1e9, abc); the seed to a 32-bit integer', async () => {
    await openSimulator();
    setRuns('0');
    expect(runsInput().value).toBe('1');
    setRuns('1e9');
    expect(runsInput().value).toBe('100000');
    expect(within(panel()).getByText(/estimate/i).textContent).toMatch(/min/);
    setRuns('abc');
    expect(runsInput().value).toBe('100000');
    setRuns('2.6');
    expect(runsInput().value).toBe('3');
    setSeed('-5');
    expect(seedInput().value).toBe('0');
    setSeed('99999999999');
    expect(seedInput().value).toBe('4294967295');
    setSeed('12.7');
    expect(seedInput().value).toBe('12');
  });

  it('progress appears (bar every update, text at most once per second); Cancel stops and keeps the previous result', async () => {
    const { runner, held } = holdingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('20', '1');
    const previous = stat('Mean DPS');
    setRuns('100');
    fireEvent.click(runButton());
    await act(async () => {});
    expect(held).toHaveLength(1);
    expect(runButton()).toHaveProperty('disabled', true);
    const bar = within(panel()).getByRole('progressbar', { name: 'Simulation progress' });
    const status = () => within(panel()).getByRole('status').textContent ?? '';
    act(() => held[0]!.onProgress?.(10, 100));
    expect(bar.getAttribute('aria-valuenow')).toBe('10');
    expect(status()).toMatch(/10 of 100/);
    act(() => held[0]!.onProgress?.(20, 100));
    expect(bar.getAttribute('aria-valuenow')).toBe('20');
    expect(status()).toMatch(/10 of 100/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => held[0]!.onProgress?.(30, 100));
    expect(status()).toMatch(/30 of 100/);
    fireEvent.click(cancelButton()!);
    await act(async () => {});
    expect(cancelButton()).toBeNull();
    expect(stat('Mean DPS')).toBe(previous);
    expect(status()).toMatch(/cancelled/i);
    expect(within(panel()).queryByRole('progressbar')).toBeNull();
  });

  it('a run and its result survive switching tabs within the Report', async () => {
    const { runner, held } = holdingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('10', '2');
    const previous = stat('Mean DPS');
    fireEvent.click(runButton());
    await act(async () => {});
    goTo('#/report/damage');
    await settle();
    goTo('#/report/simulator');
    await settle();
    expect(stat('Mean DPS')).toBe(previous);
    expect(cancelButton()).not.toBeNull();
    expect(held).toHaveLength(1);
  });

  it('Copy result writes a text summary to the clipboard; without a clipboard the text is shown selected', async () => {
    await openSimulator();
    await runWith('10', '5');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Copy result' }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain('Mean DPS');
    expect(text).toContain('Seed: 5');
    expect(text).toContain('Shadow Bolt');
    expect(within(panel()).getByText('Copied.')).toBeTruthy();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Copy result' }));
    await act(async () => {});
    const area = within(panel()).getByRole('textbox', { name: 'Result text' }) as HTMLTextAreaElement;
    expect(area.value).toBe(text);
    expect(within(panel()).getByText(/Ctrl\+C/)).toBeTruthy();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('typing in the inputs never triggers the global shortcuts', async () => {
    await openSimulator();
    for (const input of [runsInput(), seedInput()]) {
      input.focus();
      for (const key of ['g', 'f', '?', ' ', '1', 'r']) fireEvent.keyDown(input, { key });
    }
    expect(window.location.hash).toBe('#/report/simulator');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a corrupt stored setup does not break the tab: it simulates the default setup', async () => {
    const hostile = JSON.stringify({
      version: 1,
      rotation: { curse: 'nope', itemUse: { 'destruction-potion': { trigger: { kind: 'at', sec: 'x' } }, constructor: 1 }, itemUseOrder: 5 },
      fightDurationSec: Number.MAX_VALUE,
      enabledBuffs: 'all',
    });
    const { runner, calls } = recordingRunner();
    await openSimulator({ storage: memoryStorage(hostile), simRunner: runner });
    await runWith('10', '3');
    expect(resultRegion()).not.toBeNull();
    expect(calls[0]!.request.setup.rotation.curse).toBe('elements');
  });

  it('a runner error is shown and keeps the previous result', async () => {
    let calls = 0;
    const runner: SimRunner = (request, options) => (++calls === 1 ? runSimulation(request, options) : Promise.reject(new Error('boom')));
    await openSimulator({ simRunner: runner });
    await runWith('5', '1');
    const previous = stat('Mean DPS');
    fireEvent.click(runButton());
    await act(async () => {});
    expect(within(panel()).getByRole('status').textContent).toMatch(/boom/);
    expect(stat('Mean DPS')).toBe(previous);
  });

  it('the item-use rules of the setup reach the simulator (a potion at 30 s is in the request)', async () => {
    const config: SetupConfig = {
      ...structuredClone(DEFAULT_SETUP),
      enabledBuffs: ['heroism', 'destruction-potion'],
      rotation: { ...DEFAULT_SETUP.rotation, itemUse: { 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } } },
    };
    const { runner, calls } = recordingRunner();
    await openSimulator({ storage: memoryStorage(JSON.stringify(config)), simRunner: runner });
    await runWith('5', '1');
    expect(calls[0]!.request.setup.rotation.itemUse).toEqual({ 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } });
    expect(within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent).toContain('Item rules: customised');
  });

  it('after a fight the histogram marks "You" and says where your fight sits', async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    goTo('#/report/simulator');
    await settle();
    await runWith('30', '8');
    const region = resultRegion()!;
    expect(within(region).getByText(/^You [\d,]+\.\d$/)).toBeTruthy();
    expect(within(region).getByText(/Your fight \([\d,]+\.\d\) sits at about the \d+(st|nd|rd|th) percentile of the bot’s fights with this setup\./)).toBeTruthy();
  });

  it('a finished run is the Setup summary\'s last simulation: "Simulate this setup" shows its mean and SEM; a failed or cancelled run records nothing', async () => {
    const { runner, held } = holdingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('20', '7');
    const mean = stat('Mean DPS');
    const sem = stat('Standard error of the mean');
    // A second run that is cancelled leaves the recorded one as it was.
    fireEvent.click(runButton());
    expect(held).toHaveLength(1);
    fireEvent.click(cancelButton()!);
    goTo('#/setup/gear');
    await settle();
    const card = within(screen.getByRole('complementary', { name: 'Next fight summary' })).getByRole('region', { name: 'Simulate this setup' });
    expect(within(card).getByLabelText('Last simulated DPS').textContent).toBe(`${mean} ± ${sem} DPS`);
    expect(card.textContent).toContain('20 runs, seed 7.');
    expect(card.textContent).not.toContain('The setup changed since.');
  });

  // The legacy panel's last tests (tests/ui/simulator-panel.test.tsx until Task 5), in the Report.

  it('renders its body only on its own tab: the Report loads it lazily (the legacy panel: only while open)', async () => {
    renderApp({ route: '#/report/damage' });
    await settle();
    expect(screen.queryByRole('region', { name: 'Simulator' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Runs' })).toBeNull();
    goTo('#/report/simulator');
    await settle();
    expect(runsInput().value).toBe('1000');
    expect(seedInput().value).toBe('');
    expect(within(panel()).getByText(/estimate/i)).toBeTruthy();
  });

  it('a run keeps the setup of the click: leaving the Report cancels it, and a setup edited meanwhile plays in the next run', async () => {
    const { runner, held } = holdingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('5', '1'); // the first run is not held
    setRuns('40');
    setSeed('9');
    fireEvent.click(runButton());
    expect(held).toHaveLength(1);
    expect(held[0]!.request.setup.rotation.curse).toBe('elements');
    goTo('#/setup/rotation'); // the Report unmounts: the run stops
    await settle();
    fireEvent.change(screen.getByRole('combobox', { name: 'Curse' }), { target: { value: 'agony' } });
    goTo('#/report/simulator');
    await settle();
    expect(cancelButton()).toBeNull();
    expect(held[0]!.request.setup.rotation.curse).toBe('elements'); // the cancelled run never saw the edit
    fireEvent.click(runButton());
    expect(held).toHaveLength(2);
    expect(held[1]!.request.setup.rotation.curse).toBe('agony');
  });

  it('the fight keys do nothing on the Report: a run goes on, no fight starts (the legacy panel: the game kept working)', async () => {
    const { runner, held } = holdingRunner();
    await openSimulator({ simRunner: runner });
    await runWith('5', '1');
    fireEvent.click(runButton()); // held open
    await act(async () => {});
    expect(cancelButton()).not.toBeNull();
    for (const key of ['1', ' ', 'r', 'Escape']) fireEvent.keyDown(window, { key });
    expect(cancelButton()).not.toBeNull(); // still running
    expect(held).toHaveLength(1);
    expect(screen.queryByRole('progressbar', { name: 'Cast bar' })).toBeNull();
    goTo('#/fight');
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
  });

  it("the default runner is loaded on the first Run (the client and core are not in the main chunk) and gives simulate()'s result", async () => {
    // Only type imports of the client and the core; the runner is a dynamic import().
    expect(panelSource).not.toMatch(/^import (?!type )[^;]*'\.\.\/sim-runner\/(client|run|stats)'/m);
    expect(panelSource).toContain("import('../sim-runner/client')");
    await openSimulator();
    await runWith('20', '77');
    const expected = await simulate({ setup: DEFAULT_SETUP, runs: 20, seed: 77, spellQueueWindowMs: 400 }, NO_YIELD);
    expect(stat('Mean DPS')).toBe(formatDps(expected.meanDps));
    expect(stat('Standard deviation (σ)')).toBe(formatDps(expected.stdDev));
  });
});
