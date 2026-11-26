import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QUICK_BUDGET, type DiscoverOptions } from '../../../src/forever/discover/engine';
import { CUSTOM_STORAGE_KEY } from '../../../src/forever/web/custom';
import { discoverPool, type DiscoverPool } from '../../../src/forever/web/discover-client';
import { parseRoute, routeHref } from '../../../src/ui/shell/router';
import { ForeverApp } from '../../../src/ui/forever/ForeverApp';
import type { DiscoverTuning } from '../../../src/ui/forever/useDiscover';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const tuning: DiscoverTuning = {
  space: { fillers: ['sb_r1', 'drain_life'], minTtk: [6], pets: ['succubus', 'imp'], sacrifice: false, maxDots: 1 },
  budget: { ...QUICK_BUDGET, keep: 4, perFamilyMin: 1, screen: { starts: 1, evals: 3, sessions: 1 }, search: { starts: 1, evals: 5, sessions: 1 }, final: 6, finalSessions: 4 },
};
const inline = (o: DiscoverOptions, signal: AbortSignal): DiscoverPool => discoverPool(o, 1, signal, () => null);
const settings = { level: 40, profile: 'average', mobs: 1, policy: 'BEST_1MOB', spellstone: false, eureka: 'off', sessions: 5, seed: 1 };

describe('Odkrywanie view', () => {
  it('has a route and a tab', () => {
    expect(parseRoute('#/forever/discover')).toEqual({ mode: 'forever', view: 'discover' });
    expect(routeHref({ mode: 'forever', view: 'discover' })).toBe('#/forever/discover');
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify(settings));
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    expect(screen.getByRole('link', { name: 'Odkrywanie' })).toBeTruthy();
  });

  it('searches, shows the top, saves a row as a custom build and remembers the result', async () => {
    window.localStorage.setItem('wow-forever-sim:settings:v1', JSON.stringify(settings));
    const first = render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    fireEvent.change(screen.getByLabelText('Zakres'), { target: { value: 'quick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    const table = await screen.findByRole('table', { name: 'Najlepsze znalezione buildy' }, { timeout: 60000 });
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(screen.getByText(/Najlepszy znany:/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Zapisz jako własny build/ })[0]!);
    expect(await screen.findByText(/Zapisano:/)).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) ?? '{}');
    const b = saved.builds.find((x: { name: string }) => x.name.startsWith('L40 #1 '));
    expect(b.genes).toBeTruthy();
    expect(b.picks).toHaveLength(31);
    first.unmount();
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    expect(screen.getByRole('table', { name: 'Najlepsze znalezione buildy' })).toBeTruthy();
  }, 90000);

  it('stops a running search', async () => {
    let aborted = false;
    const never = (_o: DiscoverOptions, signal: AbortSignal): DiscoverPool => ({
      runner: () =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          }),
        ),
      close: () => undefined,
    });
    render(<ForeverApp view="discover" discoverPool={never} discoverTuning={tuning} />);
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Przerwij' }));
    await waitFor(() => expect(screen.getByText(/Przerwano/)).toBeTruthy());
    expect(aborted).toBe(true);
  });
});
