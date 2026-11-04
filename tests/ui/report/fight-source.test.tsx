// Report → "Fight source" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A, B, E): the
// selector above the tabs (Last Played Fight | Highest DPS | Typical | Lowest DPS | History…), each
// with its DPS and seed; the simulation's key fights replayed from the simulation's setup and shown
// in every fight tab with their deviation from the mean in σ (never "% of the bot"); an old result
// without key fights says to run the simulation again; a refused history save is visible.

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../../src/setup/storage';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import { runSimulation } from '../../../src/sim-runner/client';
import type { SimRunner } from '../../../src/sim-runner/client';
import { replayFight } from '../../../src/sim-runner/replay';
import type { SimRequest, SimResult } from '../../../src/sim-runner/types';
import { formatDps, formatInt } from '../../../src/ui/format';
import { HISTORY_STORAGE_KEY } from '../../../src/ui/state/history';
import { goTo, renderApp } from '../renderApp';

const FAKE_NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW, toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

const config = (p: Partial<SetupConfig> = {}): SetupConfig => ({ ...(structuredClone(DEFAULT_SETUP) as SetupConfig), ...p });

function memoryStorage(initial: Record<string, string> = {}, refuse?: string): SetupStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (k === refuse) throw new DOMException('full', 'QuotaExceededError');
      map.set(k, v);
    },
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

function recordingRunner(transform: (r: SimResult) => SimResult = (r) => r) {
  const calls: { request: SimRequest; result: SimResult }[] = [];
  const runner: SimRunner = async (request, options) => {
    const result = transform(await runSimulation(request, options));
    calls.push({ request: structuredClone(request), result });
    return result;
  };
  return { runner, calls };
}

async function runSimulator(runs: string, seed: string) {
  goTo('#/report/simulator');
  await settle();
  const sim = screen.getByRole('region', { name: 'Simulator' });
  fireEvent.change(within(sim).getByRole('spinbutton', { name: 'Runs' }), { target: { value: runs } });
  fireEvent.blur(within(sim).getByRole('spinbutton', { name: 'Runs' }));
  fireEvent.change(within(sim).getByRole('spinbutton', { name: 'Seed' }), { target: { value: seed } });
  fireEvent.blur(within(sim).getByRole('spinbutton', { name: 'Seed' }));
  fireEvent.click(within(sim).getByRole('button', { name: /^Run [\d,]+ Fights?$/ }));
  for (let i = 0; i < 500 && within(sim).queryByRole('button', { name: 'Cancel' }) !== null; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
}

const source = () => screen.getByRole('group', { name: 'Fight source' });
const option = (name: RegExp) => within(source()).getByRole('button', { name }) as HTMLButtonElement;
const head = () => screen.getByRole('region', { name: 'Fight summary' });
const heroDps = () => within(head()).getByLabelText('DPS').textContent;

describe('Fight source', () => {
  it('without a simulation: the played fight is picked, the key fights wait for a simulation', async () => {
    renderApp({ route: '#/report/damage' });
    await settle();
    expect(option(/^Last Played Fight/).getAttribute('aria-pressed')).toBe('true');
    for (const name of [/^Highest DPS/, /^Typical/, /^Lowest DPS/]) {
      expect(option(name).disabled).toBe(true);
      expect(option(name).textContent).toMatch(/Run the simulator first/);
    }
    expect(screen.getByText('Play a fight to see its report.')).toBeTruthy();
  });

  it('after a simulation: each key fight shows the key fight’s DPS, seed and run; every tab shows that fight', { timeout: 30000 }, async () => {
    const storage = memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify(config({ fightDurationSec: 20 })) });
    const { runner, calls } = recordingRunner();
    renderApp({ route: '#/report/damage', storage, simRunner: runner });
    await settle();
    await runSimulator('20', '4321');
    const { request, result } = calls[0]!;
    const keys = result.keyFights!;
    goTo('#/report/damage');
    await settle();
    for (const [which, name] of [
      ['highest', /^Highest DPS/],
      ['typical', /^Typical/],
      ['lowest', /^Lowest DPS/],
    ] as const) {
      const k = keys[which];
      expect(option(name).textContent).toContain(`${formatDps(k.dps)} DPS`);
      expect(option(name).textContent).toContain(`seed ${k.seed}, run #${k.run + 1}`);
      fireEvent.click(option(name));
      await settle();
      expect(option(name).getAttribute('aria-pressed')).toBe('true');
      expect(heroDps()).toBe(formatDps(k.dps));
      // The deviation from the simulation's mean, not the share of the bot (it is the bot's fight).
      const sigma = (k.dps - result.meanDps) / result.stdDev;
      expect(within(head()).getByText(/σ from the simulation’s mean/).textContent).toContain(
        `${sigma >= 0 ? '+' : '−'}${Math.abs(sigma).toFixed(1)}σ`,
      );
      expect(within(head()).queryByText(/of the bot/)).toBeNull();
      // The Damage table is the replayed fight's.
      const replay = replayFight(request, k.run);
      const damage = replay.log.reduce((s, e) => s + (e.type === 'damage' || e.type === 'tick' ? (e.amount ?? 0) : 0), 0);
      const table = screen.getByRole('table', { name: 'Damage by spell' });
      const total = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')!.querySelectorAll('td')[0]!;
      expect(total.textContent).toBe(formatInt(damage));
    }
    // The Timeline and the Rotation of the selected (lowest) fight.
    goTo('#/report/timeline');
    await settle();
    expect(screen.getByRole('region', { name: 'This second' })).toBeTruthy();
    goTo('#/report/rotation');
    await settle();
    expect(screen.getByText('A simulation’s fight is the bot’s own')).toBeTruthy();
    // Back to the played fight: none yet.
    goTo('#/report/damage');
    await settle();
    fireEvent.click(option(/^Last Played Fight/));
    expect(screen.getByText('Play a fight to see its report.')).toBeTruthy();
  });

  it('a result without key fights: "Run the simulation again"', { timeout: 30000 }, async () => {
    const { runner } = recordingRunner(({ keyFights: _k, ...rest }) => rest);
    renderApp({ route: '#/report/damage', storage: memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify(config({ fightDurationSec: 10 })) }), simRunner: runner });
    await settle();
    await runSimulator('5', '1');
    goTo('#/report/damage');
    await settle();
    expect(option(/^Highest DPS/).disabled).toBe(true);
    expect(option(/^Highest DPS/).textContent).toMatch(/Run the simulation again/);
  });

  it('a history save the storage refuses is shown, never silent', { timeout: 30000 }, async () => {
    const storage = memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify(config({ fightDurationSec: 10 })) }, HISTORY_STORAGE_KEY);
    const { runner } = recordingRunner();
    renderApp({ route: '#/report/damage', storage, simRunner: runner });
    await settle();
    await runSimulator('5', '1');
    goTo('#/report/damage');
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/fight history could not be saved/i);
  });
});
