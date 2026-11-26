import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadParams } from '../../../src/forever/data/load';
import { discover, inlineRunner, QUICK_BUDGET, type DiscoverOptions, type DiscoverResult } from '../../../src/forever/discover/engine';
import { DEFAULT_SETTINGS } from '../../../src/forever/web/api';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import { DISCOVER_STORAGE_KEY } from '../../../src/ui/forever/useDiscover';

const settings = { ...DEFAULT_SETTINGS, level: 40 };
let result: DiscoverResult;

beforeAll(async () => {
  const o: DiscoverOptions = {
    level: 40, profile: 'average', mobs: 1, seed: 1, perk: 0, top: 5, params: loadParams({ session_pulls: 3 }),
    budget: { ...QUICK_BUDGET, keep: 3, perFamilyMin: 1, screen: { starts: 1, evals: 3, sessions: 1 }, search: { starts: 1, evals: 4, sessions: 1 }, final: 4, finalSessions: 4 },
    space: { fillers: ['drain_life'], minTtk: [6], pets: ['imp'], sacrifice: true, maxDots: 1 },
  };
  result = await discover(o, inlineRunner(o));
}, 60000);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Odkrywanie: row details', () => {
  it('opens a row with its talent trees, rotation diagram and every statistic', () => {
    window.localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify({ settings, budget: 'full', result }));
    render(<ForeverApp view="discover" />);
    const toggle = screen.getByRole('button', { name: 'Szczegóły #1' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Szczegóły wyniku #1' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: 'Szczegóły wyniku #1' });
    expect(within(panel).getByRole('region', { name: 'Drzewo Demonology' })).toBeTruthy();
    expect(within(panel).getByRole('list', { name: /^Diagram rotacji/ })).toBeTruthy();
    const stats = within(panel).getByRole('table', { name: 'Statystyki #1' });
    for (const label of ['Kills/h', 'TTK', 'Mana na zabicie', 'HP na zabicie', 'Picie na zabicie', 'Life Tap na zabicie', 'Przerwy na godzinę', 'Wykorzystanie GCD', 'Śmierci na godzinę', 'Śmierci peta na godzinę', 'Najbliższy znany']) {
      expect(within(stats).getByRole('rowheader', { name: label })).toBeTruthy();
    }
    expect(within(panel).getByText(/Opiera się na szacunkach/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole('region', { name: 'Szczegóły wyniku #1' })).toBeNull();
  });
});
