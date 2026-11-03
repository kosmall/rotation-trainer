import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSimulation, type SimRunner } from '../../src/sim-runner/client';
import { simulate } from '../../src/sim-runner/run';
import type { SimRequest, SimResult } from '../../src/sim-runner/types';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY, type SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { formatDps } from '../../src/ui/format';
import { GameView } from '../../src/ui/GameView';
import panelSource from '../../src/ui/SimulatorPanel.tsx?raw';

// The Simulator panel (simulator Task 3). jsdom has no Worker, so the default runner runs on the
// main thread in chunks yielding with setTimeout(0): the fake timers must be advanced. A test that
// needs to hold a run open injects its own runner (GameView's `simRunner`).

const FAKE_NOW = 1_800_000_000_000;
/** One chunk: `simulate` never yields, so it needs no fake timer advance. */
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
});

function memoryStorage(initial?: string): SetupStorage {
  const map = new Map<string, string>(initial === undefined ? [] : [[SETUP_STORAGE_KEY, initial]]);
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Opens the Simulator panel (jsdom fires `toggle` late: fired here, as for Combat text). */
function openSimulator(): HTMLDetailsElement {
  const summary = screen.getByText('Simulator', { selector: 'summary' });
  const details = summary.closest('details') as HTMLDetailsElement;
  fireEvent.click(summary);
  fireEvent(details, new Event('toggle'));
  return details;
}

const panel = () => screen.getByText('Simulator', { selector: 'summary' }).closest('details') as HTMLElement;
const runsInput = () => within(panel()).getByRole('spinbutton', { name: 'Runs' }) as HTMLInputElement;
const seedInput = () => within(panel()).getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement;
const runButton = () => within(panel()).getByRole('button', { name: 'Run' });
const cancelButton = () => within(panel()).queryByRole('button', { name: 'Cancel' });
const resultRegion = () => within(panel()).queryByRole('region', { name: 'Simulation result' });
const stat = (name: string) => within(resultRegion()!).getByLabelText(name).textContent;
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: 'Start the fight' });

function setRuns(value: string) {
  fireEvent.change(runsInput(), { target: { value } });
  fireEvent.blur(runsInput());
}

function setSeed(value: string) {
  fireEvent.change(seedInput(), { target: { value } });
  fireEvent.blur(seedInput());
}

/** Lets the main-thread chunks run until the run is over (no Cancel button). */
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

/** A runner that records each call and returns the real result (runSimulation: main thread here). */
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

/** A runner whose second and later calls stay open until the test settles them. */
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

describe('Simulator panel', () => {
  it('is a collapsed <details> after Combat text that renders its body only while open', () => {
    render(<GameView storage={null} />);
    const details = panel();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(within(details).queryByRole('spinbutton')).toBeNull();
    const combat = screen.getByText('Combat text', { selector: 'summary' }).closest('details')!;
    expect(combat.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    openSimulator();
    expect(runsInput().value).toBe('1000');
    expect(seedInput().value).toBe('');
    expect(within(panel()).getByText(/estimate/i)).toBeTruthy();
  });

  it('Run with 50 runs shows mean, σ, SEM and CI; the result matches simulate() for the same request exactly', async () => {
    const { runner, calls } = recordingRunner();
    render(<GameView storage={null} simRunner={runner} />);
    openSimulator();
    await runWith('50', '123');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.request;
    expect(req).toMatchObject({ runs: 50, seed: 123, spellQueueWindowMs: 400 });
    expect(req.setup).toEqual(DEFAULT_SETUP);
    expect(req.db).toBeUndefined(); // the author's gear needs no item database
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
    const histogram = within(region).getByRole('img', { name: /DPS histogram/ });
    expect(histogram.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(within(region).getByRole('table', { name: 'Per spell' })).toBeTruthy();
    expect(within(region).getByRole('cell', { name: 'Shadow Bolt' })).toBeTruthy();
    expect(within(region).getByLabelText('Life Taps per fight').textContent).toBe(expected.meanLifeTaps.toFixed(2));
    expect(within(region).getByText(/Uptime/)).toBeTruthy();
  });

  it('the result lists the settings it came from; the note says what ± means and the limits', async () => {
    render(<GameView storage={null} />);
    openSimulator();
    await runWith('20', '77');
    const settings = within(resultRegion()!).getByRole('list', { name: 'Result settings' });
    const text = settings.textContent ?? '';
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
    render(<GameView storage={null} />);
    openSimulator();
    await runWith('20', '4242');
    const first = stat('Mean DPS');
    await runWith('20', '4242');
    expect(stat('Mean DPS')).toBe(first);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    await runWith('20', '');
    expect(within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent).toContain('Seed: 1073741824');
    expect(seedInput().value).toBe(''); // still random for the next run
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reuse seed 1073741824' }));
    expect(seedInput().value).toBe('1073741824');
  });

  it('runs clamp to 1-100 000 on blur (0, 1e9, abc); the seed to a 32-bit integer', () => {
    render(<GameView storage={null} />);
    openSimulator();
    setRuns('0');
    expect(runsInput().value).toBe('1');
    setRuns('1e9');
    expect(runsInput().value).toBe('100000');
    expect(within(panel()).getByText(/estimate/i).textContent).toMatch(/min/); // ~2 min
    setRuns('abc');
    expect(runsInput().value).toBe('100000'); // invalid text: the last valid value
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
    render(<GameView storage={null} simRunner={runner} />);
    openSimulator();
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
    expect(status()).toMatch(/10 of 100/); // under a second later: the text waits
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

  it('a setup change during a run does not alter the running result (the run keeps the setup of the click)', async () => {
    const { runner, calls } = recordingRunner();
    render(<GameView storage={null} simRunner={runner} />);
    openSimulator();
    setRuns('40');
    setSeed('9');
    fireEvent.click(runButton());
    // The first chunk has run; change the curse before the rest.
    fireEvent.change(screen.getByRole('combobox', { name: 'Curse' }), { target: { value: 'agony' } });
    await finishRun();
    expect(calls[0]!.request.setup.rotation.curse).toBe('elements');
    const expected = await simulate({ setup: structuredClone(DEFAULT_SETUP), runs: 40, seed: 9, spellQueueWindowMs: 400 }, NO_YIELD);
    expect(stat('Mean DPS')).toBe(formatDps(expected.meanDps));
    const settings = within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent ?? '';
    expect(settings).toContain('Curse of the Elements');
    expect(settings).toContain('Setup: None');
  });

  it('Copy result writes a text summary to the clipboard; without a clipboard the text is shown selected', async () => {
    render(<GameView storage={null} />);
    openSimulator();
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

  it('typing in the inputs never triggers hotkeys', () => {
    render(<GameView storage={null} />);
    openSimulator();
    for (const input of [runsInput(), seedInput()]) {
      input.focus();
      for (const key of [' ', '1', 'z', 'r', 'Escape']) fireEvent.keyDown(input, { key });
    }
    expect(startOverlay()).not.toBeNull();
    expect(castBar()).toBeNull();
  });

  it('the game keeps working during a run: keys cast spells', async () => {
    const { runner } = holdingRunner();
    render(<GameView storage={null} simRunner={runner} />);
    openSimulator();
    await runWith('5', '1');
    fireEvent.click(runButton()); // held open
    await act(async () => {});
    expect(cancelButton()).not.toBeNull();
    fireEvent.keyDown(window, { key: '1' });
    expect(castBar()?.textContent).toContain('Shadow Bolt');
  });

  it('a corrupt stored setup does not break the panel: it simulates the default setup', async () => {
    const hostile = JSON.stringify({
      version: 1,
      rotation: { curse: 'nope', itemUse: { 'destruction-potion': { trigger: { kind: 'at', sec: 'x' } }, constructor: 1 }, itemUseOrder: 5 },
      fightDurationSec: Number.MAX_VALUE,
      enabledBuffs: 'all',
    });
    const { runner, calls } = recordingRunner();
    render(<GameView storage={memoryStorage(hostile)} simRunner={runner} />);
    openSimulator();
    await runWith('10', '3');
    expect(resultRegion()).not.toBeNull();
    expect(calls[0]!.request.setup.rotation.curse).toBe('elements');
    render(<GameView storage={memoryStorage('{not json')} />);
    expect(screen.getAllByText('Simulator', { selector: 'summary' })).toHaveLength(2);
  });

  it('a runner error is shown and keeps the previous result', async () => {
    let calls = 0;
    const runner: SimRunner = (request, options) => (++calls === 1 ? runSimulation(request, options) : Promise.reject(new Error('boom')));
    render(<GameView storage={null} simRunner={runner} />);
    openSimulator();
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
    render(<GameView storage={memoryStorage(JSON.stringify(config))} simRunner={runner} />);
    openSimulator();
    await runWith('5', '1');
    expect(calls[0]!.request.setup.rotation.itemUse).toEqual({ 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } });
    expect(within(resultRegion()!).getByRole('list', { name: 'Result settings' }).textContent).toContain('Item rules: customised');
  });

  it('the default runner is loaded on the first Run (the client and core are not in the main chunk) and gives simulate()\'s result', async () => {
    // Only type imports of the client and the core; the runner is a dynamic import().
    expect(panelSource).not.toMatch(/^import (?!type )[^;]*'\.\.\/sim-runner\/(client|run|stats)'/m);
    expect(panelSource).toContain("import('../sim-runner/client')");
    render(<GameView storage={null} />);
    openSimulator();
    await runWith('20', '77');
    const expected = await simulate({ setup: DEFAULT_SETUP, runs: 20, seed: 77, spellQueueWindowMs: 400 }, NO_YIELD);
    expect(stat('Mean DPS')).toBe(formatDps(expected.meanDps));
    expect(stat('Standard deviation (σ)')).toBe(formatDps(expected.stdDev));
  });
});
