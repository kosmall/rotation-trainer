import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Odkrywanie: a finished completion is easy to find', () => {
  /** What was scrolled into view (jsdom has no scrolling of its own). */
  let scrolled: Element[] = [];
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  const app = () => render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
  const completeButton = () => screen.getByRole('button', { name: /^Uzupełnij do 43/ });
  const card = (rank: number) => screen.getByRole('article', { name: new RegExp(`^#${rank}:`) });

  it('says what was completed, scrolls to the new build and marks its row', async () => {
    store();
    app();
    expect(screen.queryByRole('button', { name: /^Pokaż kompletny build/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Uzupełnij #2' }));
    fireEvent.click(completeButton());
    const note = await screen.findByText(/Uzupełniono: #2/, undefined, { timeout: 60000 });
    expect(note.closest('[role=status]')).toBeTruthy();
    await waitFor(() => expect(scrolled).toEqual([card(2)]));
    expect(card(2).className).toContain('fv-just');
    expect(screen.queryByRole('button', { name: 'Pokaż kompletny build #1' })).toBeNull();
    scrolled = [];
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż kompletny build #2' }));
    await waitFor(() => expect(scrolled).toEqual([card(2)]));
  }, 90000);

  it('completing the same build again says so and scrolls again', async () => {
    store();
    app();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Uzupełnij #1' }));
    fireEvent.click(completeButton());
    await screen.findByText(/Uzupełniono: #1/, undefined, { timeout: 60000 });
    scrolled = [];
    fireEvent.click(completeButton());
    // the note goes while it runs and comes back with the same build
    expect(screen.queryByText(/Uzupełniono: #1/)).toBeNull();
    await screen.findByText(/Uzupełniono: #1/, undefined, { timeout: 60000 });
    await waitFor(() => expect(scrolled).toEqual([card(1)]));
  }, 120000);

  it('coming back to the tab does not scroll again', async () => {
    store();
    const view = app();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Uzupełnij #1' }));
    fireEvent.click(completeButton());
    await screen.findByText(/Uzupełniono: #1/, undefined, { timeout: 60000 });
    scrolled = [];
    view.rerender(<ForeverApp view="builds" discoverPool={inline} discoverTuning={tuning} />);
    view.rerender(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    expect(screen.getByRole('button', { name: 'Pokaż kompletny build #1' })).toBeTruthy();
    expect(scrolled).toEqual([]);
  }, 90000);

  it('opening the view with stored completions marks the rows without scrolling or a note', async () => {
    store();
    const first = app();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Uzupełnij #1' }));
    fireEvent.click(completeButton());
    await screen.findByText(/Uzupełniono: #1/, undefined, { timeout: 60000 });
    first.unmount();
    scrolled = [];
    app();
    expect(screen.getByRole('button', { name: 'Pokaż kompletny build #1' })).toBeTruthy();
    expect(screen.queryByText(/Uzupełniono:/)).toBeNull();
    expect(scrolled).toEqual([]);
  }, 90000);
});

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

  it('says from which level the rotation changes and what staying would give', () => {
    const t = result.top[0]!;
    const done = {
      rank: 1, label: t.label, combo: { ...t.combo, genes: { ...t.combo.genes, filler: 'wrack_hp70' } }, baseRanks: t.ranks, fromLevel: 40, toLevel: 41,
      path: ['suppression'], perLevel: [{ level: 41, pick: 'suppression', kph: 150 }], avgKph: 150, greedyPath: ['suppression'], greedyAvgKph: 140, searchCost: 1, greedySearchCost: 1,
      switched: { filler: 'wrack_hp70', level: 40 }, fixedAvgKph: 141.5,
    };
    store({ completions: [done] });
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    const card = screen.getByRole('article', { name: /^#1:/ });
    expect(card.textContent).toContain('Od levelu 40 rotacja się zmienia: filler Wrack above 70% HP');
    expect(card.textContent).toContain('Bez zmian rotacji: 141.5 kills/h');
  });

  it('says when the curse is dropped', () => {
    const t = result.top[0]!;
    const done = {
      rank: 1, label: t.label, combo: { ...t.combo, genes: { ...t.combo.genes, coe: false } }, baseRanks: t.ranks, fromLevel: 40, toLevel: 41,
      path: ['suppression'], perLevel: [{ level: 41, pick: 'suppression', kph: 150 }], avgKph: 150, greedyPath: ['suppression'], greedyAvgKph: 140, searchCost: 1, greedySearchCost: 1,
      noCurse: true, fixedAvgKph: 141.5,
    };
    store({ completions: [done] });
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    const card = screen.getByRole('article', { name: /^#1:/ });
    expect(card.textContent).toContain('bez Curse of the Elements');
    expect(card.textContent).toContain('Bez zmian rotacji: 141.5 kills/h');
    expect(card.textContent).not.toContain('rotacja się zmienia');
  });

  it('loads a stored discovery whose completions are unreadable', () => {
    store({ completions: [{ rank: 1, label: 'x', combo: { genes: {} }, baseRanks: {}, path: [], perLevel: [{ level: 41 }], avgKph: 1, greedyAvgKph: 1, fromLevel: 40, toLevel: 59 }] });
    render(<ForeverApp view="discover" discoverPool={inline} discoverTuning={tuning} />);
    expect(screen.getByRole('table', { name: 'Najlepsze znalezione buildy' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Kompletne buildy' })).toBeNull();
  });
});
