import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadParams } from '../../../src/forever/data/load';
import { discover, inlineRunner, QUICK_BUDGET, type DiscoverOptions, type DiscoverResult } from '../../../src/forever/discover/engine';
import { validatePicks } from '../../../src/forever/talents';
import { DEFAULT_SETTINGS } from '../../../src/forever/web/api';
import { CUSTOM_STORAGE_KEY } from '../../../src/forever/web/custom';
import { discoverPool } from '../../../src/forever/web/discover-client';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { DISCOVER_STORAGE_KEY, type DiscoverTuning } from '../../../src/ui/forever/useDiscover';

const settings = { ...DEFAULT_SETTINGS, level: 40 };
let result: DiscoverResult;
const tuning: DiscoverTuning = { completeBudget: { restarts: 1, sessions: 1, maxSims: 4, finalSessions: 2 }, toLevel: 43 };
const inline = (o: DiscoverOptions, s: AbortSignal) => discoverPool(o, 1, s, () => null);

beforeAll(async () => {
  const o: DiscoverOptions = {
    level: 40, profile: 'average', mobs: 1, seed: 1, perk: 0, top: 4, params: loadParams({ session_pulls: 3 }),
    budget: { ...QUICK_BUDGET, keep: 3, perFamilyMin: 1, screen: { starts: 1, evals: 3, sessions: 1 }, search: { starts: 1, evals: 4, sessions: 1 }, final: 4, finalSessions: 4 },
    space: { fillers: ['drain_life', 'sb_r1'], minTtk: [6], pets: ['imp'], sacrifice: false, maxDots: 1 },
  };
  result = await discover(o, inlineRunner(o));
}, 60000);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const store = (extra: Record<string, unknown> = {}) => window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify({ settings: { ...settings, sessions: 5 }, budget: 'quick', result, ...extra }));

describe('Odkrywanie: complete selected results to 59', () => {
  it('completes a ticked row and saves it as a full custom build', async () => {
    store();
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    const button = screen.getByRole('button', { name: /^Uzupełnij do 43/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Uzupełnij #1' }));
    expect(button.textContent).toMatch(/\(1\)/);
    fireEvent.click(button);
    const section = await screen.findByRole('region', { name: 'Kompletne buildy' }, { timeout: 60000 });
    const path = within(section).getByRole('table', { name: 'Droga #1' });
    expect(within(path).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)).toEqual(['41', '42', '43']);
    expect(within(section).getByText(/Średnio/)).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Zapisz kompletny build #1' }));
    const saved = JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) ?? '{}');
    const b = saved.builds.find((x: { name: string }) => x.name.startsWith('L40→43 #1 '));
    expect(b.picks).toHaveLength(34);
    expect(validatePicks(b.picks).ok).toBe(true);
    expect(b.genes).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(DISCOVER_STORAGE_KEY) ?? '{}').completions).toHaveLength(1);
  }, 90000);

  it('loads a stored discovery whose completions are unreadable', () => {
    store({ completions: [{ rank: 1, label: 'x', combo: { genes: {} }, baseRanks: {}, path: [], perLevel: [{ level: 41 }], avgKph: 1, greedyAvgKph: 1, fromLevel: 40, toLevel: 59 }] });
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    expect(screen.getByRole('table', { name: 'Najlepsze znalezione buildy' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Kompletne buildy' })).toBeNull();
  });
});
