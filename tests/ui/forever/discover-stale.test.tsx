import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadParams } from '../../../src/forever/data/load';
import { discover, inlineRunner, QUICK_BUDGET, type DiscoverOptions, type DiscoverResult } from '../../../src/forever/discover/engine';
import { SIM_VERSION } from '../../../src/forever/version';
import { DEFAULT_SETTINGS } from '../../../src/forever/web/api';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { DISCOVER_STORAGE_KEY } from '../../../src/ui/forever/useDiscover';

const settings = { ...DEFAULT_SETTINGS, level: 40 };
let result: DiscoverResult;

beforeAll(async () => {
  const o: DiscoverOptions = {
    level: 40, profile: 'average', mobs: 1, seed: 1, perk: 0, top: 3, params: loadParams({ session_pulls: 3 }),
    budget: { ...QUICK_BUDGET, keep: 3, perFamilyMin: 1, screen: { starts: 1, evals: 3, sessions: 1 }, search: { starts: 1, evals: 4, sessions: 1 }, final: 4, finalSessions: 4 },
    space: { fillers: ['drain_life'], minTtk: [6], pets: ['imp'], sacrifice: true, maxDots: 1 },
  };
  result = await discover(o, inlineRunner(o));
}, 60000);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('A5-011: a saved discovery of another simulator version', () => {
  it('shows a notice when the stored result has no version or another one', () => {
    window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify({ settings, budget: 'full', result }));
    render(<ForeverApp view="discover" />);
    expect(screen.getByText(/wynik ze starszej wersji symulatora/i)).toBeTruthy();
    cleanup();
    window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify({ settings, budget: 'full', result, simVersion: 'an-older-version' }));
    render(<ForeverApp view="discover" />);
    expect(screen.getByText(/wynik ze starszej wersji symulatora/i)).toBeTruthy();
  });
  it('shows no notice for a result of the current version', () => {
    window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify({ settings, budget: 'full', result, simVersion: SIM_VERSION }));
    render(<ForeverApp view="discover" />);
    expect(screen.getByRole('table', { name: 'Najlepsze znalezione buildy' })).toBeTruthy();
    expect(screen.queryByText(/wynik ze starszej wersji symulatora/i)).toBeNull();
  });
});
