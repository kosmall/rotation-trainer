// Report → "History…": the Fights panel (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 E): the Highest DPS
// ranking (top 10 by DPS, filters: kind, the same fight length, the same gear and talents), the
// history list (newest first; open, pin, rename, remove with a confirmation), the save status (a
// refused save is shown, never silent); in the app: a click opens the fight in the same Report
// tabs, and the history survives a reload.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEvent } from '../../../src/engine/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../../src/setup/storage';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import { runSimulation } from '../../../src/sim-runner/client';
import type { SimRunner } from '../../../src/sim-runner/client';
import type { SimResult } from '../../../src/sim-runner/types';
import { formatDps } from '../../../src/ui/format';
import { FightsPanel } from '../../../src/ui/report/FightsPanel';
import type { FightFinal } from '../../../src/ui/report/reportModel';
import { HISTORY_STORAGE_KEY, recordPlayed, setupKeyOf } from '../../../src/ui/state/history';
import type { HistoryEntry, HistoryPatch } from '../../../src/ui/state/history';
import type { FightHistory } from '../../../src/ui/state/TrainerProvider';
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
const LOG: LogEvent[] = [{ atMs: 2500, type: 'damage', spellId: 'shadow-bolt', amount: 2000 }];
const final = (dps: number, durationMs: number): FightFinal => ({ nowMs: durationMs, durationMs, gcdMs: 1500, dps, damageTotal: dps * (durationMs / 1000), castCounts: {}, useCounts: {} });

/** Played entries, oldest first in `dps` order of saving (the newest is first in the history). */
function history(rows: { dps: number; durationMs?: number; cfg?: SetupConfig }[]): HistoryEntry[] {
  let entries: HistoryEntry[] = [];
  rows.forEach((r, i) => {
    const durationMs = r.durationMs ?? 60000;
    entries = recordPlayed(entries, { log: LOG, final: final(r.dps, durationMs), config: r.cfg ?? config(), seed: i + 1, durationMs }, FAKE_NOW + i * 60000).entries;
  });
  return entries;
}

function panelWith(entries: HistoryEntry[], p: Partial<{ saved: FightHistory['saved']; durationMs: number | null; setupKey: string }> = {}) {
  const calls = { open: [] as string[], update: [] as [string, HistoryPatch][], remove: [] as string[] };
  render(
    <FightsPanel
      history={{ entries, saved: p.saved ?? 'yes' }}
      currentDurationMs={p.durationMs === undefined ? 60000 : p.durationMs}
      currentSetupKey={p.setupKey ?? setupKeyOf(config())}
      selectedId={null}
      onOpen={(id) => calls.open.push(id)}
      onUpdate={(id, patch) => calls.update.push([id, patch])}
      onRemove={(id) => calls.remove.push(id)}
    />,
  );
  return calls;
}

const ranking = () => screen.getByRole('table', { name: 'Highest DPS' });
const rankedDps = () =>
  within(ranking())
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelectorAll('td')[0]!.textContent);

describe('Fights panel: the Highest DPS ranking', () => {
  it('lists the top 10 by DPS with their places; by default only fights of the same length', () => {
    const entries = history([
      { dps: 1000 },
      { dps: 1500 },
      { dps: 1200, durationMs: 30000 },
      ...Array.from({ length: 10 }, (_, i) => ({ dps: 900 - i })),
    ]);
    panelWith(entries);
    expect(screen.getByRole('region', { name: 'Fights' })).toBeTruthy();
    const rows = within(ranking()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(rankedDps().slice(0, 3)).toEqual([formatDps(1500), formatDps(1000), formatDps(900)]);
    // Any length: the 30 s fight ranks second.
    fireEvent.click(screen.getByRole('checkbox', { name: /Same fight length/ }));
    expect(rankedDps().slice(0, 3)).toEqual([formatDps(1500), formatDps(1200), formatDps(1000)]);
  });

  it('filters by kind and by the same gear and talents', () => {
    const other = config({ talents: undefined, gear: [] as never });
    const entries = [
      ...history([{ dps: 1000 }, { dps: 1100, cfg: config({ fightDurationSec: 60, warlock: { armor: 'demon', sacrificeSuccubus: true } }) }]),
      {
        ...history([{ dps: 1300 }])[0]!,
        id: 'h99',
        kind: 'sim-highest' as const,
        simulation: 's1',
        run: 3,
        runs: 20,
        baseSeed: 5,
        spellQueueWindowMs: 400,
        meanDps: 1200,
        stdDev: 40,
      } as unknown as HistoryEntry,
    ];
    panelWith(entries, { setupKey: setupKeyOf(other) });
    expect(rankedDps()).toEqual([formatDps(1300), formatDps(1100), formatDps(1000)]);
    const kinds = screen.getByRole('group', { name: 'Fights to rank' });
    fireEvent.click(within(kinds).getByRole('button', { name: 'Played' }));
    expect(rankedDps()).toEqual([formatDps(1100), formatDps(1000)]);
    fireEvent.click(within(kinds).getByRole('button', { name: 'Simulations' }));
    expect(rankedDps()).toEqual([formatDps(1300)]);
    fireEvent.click(within(kinds).getByRole('button', { name: 'All' }));
    // The current gear and talents are another build: nothing matches.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Same gear and talents' }));
    expect(screen.getByText('No fight matches these filters.')).toBeTruthy();
  });

  it('a click on a ranked fight opens it', () => {
    const entries = history([{ dps: 1000 }, { dps: 1500 }]);
    const calls = panelWith(entries);
    fireEvent.click(within(ranking()).getAllByRole('button', { name: /^Open / })[0]!);
    expect(calls.open).toEqual([entries.find((e) => e.dps === 1500)!.id]);
  });
});

describe('Fights panel: the history list', () => {
  it('newest first; pin, rename and remove (after a confirmation)', () => {
    const entries = history([{ dps: 1000 }, { dps: 1500 }]);
    const calls = panelWith(entries);
    const list = screen.getByRole('list', { name: 'Fight history' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain(formatDps(1500));
    const first = entries[0]!.id;
    fireEvent.click(within(items[0]!).getByRole('button', { name: /^Pin / }));
    expect(calls.update).toEqual([[first, { pinned: true }]]);
    fireEvent.click(within(items[0]!).getByRole('button', { name: /^Rename / }));
    const field = within(items[0]!).getByRole('textbox', { name: 'Name' });
    fireEvent.change(field, { target: { value: 'Best pull' } });
    fireEvent.submit(field.closest('form')!);
    expect(calls.update[1]).toEqual([first, { name: 'Best pull' }]);
    fireEvent.click(within(items[0]!).getByRole('button', { name: /^Remove / }));
    const dialog = screen.getByRole('dialog', { name: 'Remove This Fight?' });
    expect(calls.remove).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(calls.remove).toEqual([first]);
    fireEvent.click(within(items[1]!).getByRole('button', { name: /^Open / }));
    expect(calls.open).toEqual([entries[1]!.id]);
  });

  it('a pinned entry shows as pinned; its button unpins', () => {
    const entries = history([{ dps: 1000 }]).map((e) => ({ ...e, pinned: true, name: 'Keeper' }));
    const calls = panelWith(entries);
    const item = within(screen.getByRole('list', { name: 'Fight history' })).getByRole('listitem');
    expect(item.textContent).toContain('Keeper');
    const pin = within(item).getByRole('button', { name: 'Unpin Keeper' });
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pin);
    expect(calls.update).toEqual([[entries[0]!.id, { pinned: false }]]);
  });

  it('a refused save is shown; an empty history says how to fill it', () => {
    panelWith([], { saved: 'failed' });
    expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/);
    expect(screen.getByText(/Play a fight or run the simulator/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// In the app
// ---------------------------------------------------------------------------

function memoryStorage(initial: Record<string, string> = {}): SetupStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

function recordingRunner() {
  const results: SimResult[] = [];
  const runner: SimRunner = async (request, options) => {
    const r = await runSimulation(request, options);
    results.push(r);
    return r;
  };
  return { runner, results };
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
const heroDps = () => within(screen.getByRole('region', { name: 'Fight summary' })).getByLabelText('DPS').textContent;

describe('Fights panel in the app', () => {
  it('a simulation’s key fights are in the history after a reload; a click opens one in the Report tabs', { timeout: 30000 }, async () => {
    const storage = memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify(config({ fightDurationSec: 20 })) });
    const { runner, results } = recordingRunner();
    renderApp({ route: '#/report/damage', storage, simRunner: runner });
    await settle();
    await runSimulator('20', '321');
    expect(storage.map.has(HISTORY_STORAGE_KEY)).toBe(true);
    cleanup();
    // A reload: a new app on the same storage.
    renderApp({ route: '#/report/damage', storage });
    await settle();
    fireEvent.click(within(source()).getByRole('button', { name: /^History/ }));
    const panel = screen.getByRole('region', { name: 'Fights' });
    const table = within(panel).getByRole('table', { name: 'Highest DPS' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const highest = results[0]!.keyFights!.highest;
    fireEvent.click(within(table).getAllByRole('button', { name: /^Open / })[0]!);
    await settle();
    expect(heroDps()).toBe(formatDps(highest.dps));
    expect(within(source()).getByRole('button', { name: /^History/ }).getAttribute('aria-pressed')).toBe('true');
    // The same tabs: the Damage table of that fight.
    expect(screen.getByRole('table', { name: 'Damage by spell' })).toBeTruthy();
    goTo('#/report/timeline');
    await settle();
    expect(screen.getByRole('region', { name: 'This second' })).toBeTruthy();
  });
});
