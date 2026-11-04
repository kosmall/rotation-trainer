// The Report screen (UI redesign Task 4, spec §3.5, §5.3, §6): the empty state, the tabs as links,
// the summary header with the bot comparison, the Damage table, the Timeline, the Log (filter,
// virtual list), the Rotation and the Compare empty state.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../../src/setup/storage';
import type { SetupStorage } from '../../../src/setup/storage';
import type { LogRow } from '../../../src/ui/report/reportView';
import { LogList } from '../../../src/ui/report/LogTab';
import { goTo, renderApp } from '../renderApp';

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
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

const press = (key: string) => fireEvent.keyDown(window, { key });
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));

/** Plays a whole fight on the Fight screen: Shadow Bolt (1) every 2.5 s until the clock runs out. */
function playFight() {
  for (let i = 0; i < 25; i++) {
    press('1');
    advance(2500);
  }
  advance(2000);
}

/** The default setup with Heroism (a buff for the "Buffs and items" table and the lanes). */
function withHeroism(): SetupStorage {
  const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['heroism'] })]]);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('Report: without a fight', () => {
  it('shows "Play a fight to see its report." with a link to the Fight screen; one h1', async () => {
    renderApp({ route: '#/report/damage' });
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Fight report' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Play a fight to see its report.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Fight' }).getAttribute('href')).toBe('#/fight');
  });

  it('tabs are links with aria-current and deep-linkable', async () => {
    renderApp({ route: '#/report/log' });
    await settle();
    const nav = screen.getByRole('navigation', { name: 'Report sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Damage', 'Timeline', 'Log', 'Rotation', 'Simulator', 'Compare']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '#/report/damage',
      '#/report/timeline',
      '#/report/log',
      '#/report/rotation',
      '#/report/simulator',
      '#/report/compare',
    ]);
    expect(within(nav).getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Damage' }).getAttribute('aria-current')).toBeNull();
    goTo('#/report/compare');
    await settle();
    expect(within(nav).getByRole('link', { name: 'Compare' }).getAttribute('aria-current')).toBe('page');
    expect(document.title).toBe('Rotation Trainer: Report, compare');
  });

  it('Compare shows the designed empty state with a link to Scenarios (works without a fight)', async () => {
    renderApp({ route: '#/report/compare' });
    await settle();
    const panel = screen.getByRole('region', { name: 'Compare' });
    expect(within(panel).getByRole('heading', { name: /compare two or more scenarios/i })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Open Scenarios' }).getAttribute('href')).toBe('#/setup/scenarios');
    expect(screen.queryByText('Play a fight to see its report.')).toBeNull();
  });
});

describe('Report: after a fight', () => {
  it('the end card and the report header show the share of the bot with the same seed; the hero DPS is the fight\'s', async () => {
    renderApp({ route: '#/fight' });
    playFight();
    const card = screen.getByRole('region', { name: 'Fight summary' });
    const dps = amount(within(card).getByLabelText('DPS'));
    expect(within(card).getByText(/% of the bot \([\d,.]+\) with the same setup/)).toBeTruthy();
    goTo('#/report/damage');
    await settle();
    const head = screen.getByRole('region', { name: 'Fight summary' });
    expect(amount(within(head).getByLabelText('DPS'))).toBe(dps);
    expect(within(head).getByText(/% of the bot/).textContent).toMatch(/^\d+\.\d% of the bot \([\d,]+\.\d\) with the same setup$/);
    expect(within(head).getByLabelText('Duration').textContent).toBe('60.0 s');
    expect(within(head).getByLabelText('Active time (GCD)').textContent).toMatch(/%$/);
    const played = within(head).getByText(/^Played with/);
    expect(within(played).getByRole('link', { name: 'My gear (export)' }).getAttribute('href')).toBe('#/setup/gear');
    expect(within(head).getByRole('button', { name: 'Fight Again' })).toBeTruthy();
    expect(within(head).getByRole('button', { name: 'Copy Report' })).toBeTruthy();
  });

  it('Damage tab: table headers, rows with icons and names, totals equal the total damage', async () => {
    renderApp({ route: '#/fight', storage: withHeroism() });
    playFight();
    const card = screen.getByRole('region', { name: 'Fight summary' });
    const total = amount(within(card).getByLabelText('Total damage'));
    goTo('#/report/damage');
    await settle();
    const table = screen.getByRole('table', { name: 'Damage by spell' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Spell', 'Damage', 'DPS', 'Casts', 'Crit', 'Avg hit', 'Avg crit', 'Miss']);
    expect(within(table).getByRole('rowheader', { name: /Shadow Bolt/ })).toBeTruthy();
    const foot = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')!;
    expect(amount(foot.querySelectorAll('td')[0] as HTMLElement)).toBe(total);
    const buffs = screen.getByRole('table', { name: 'Buffs and items' });
    expect(within(buffs).getByRole('rowheader', { name: /Heroism/ })).toBeTruthy();
    const chart = screen.getByRole('img', { name: /DPS over time/ });
    expect(chart).toBeTruthy();
    expect(screen.getByText('Bot, same seed')).toBeTruthy();
    // "Show data": the chart's numbers as a table, 60 rows for 60 s.
    const data = screen.getByRole('table', { name: 'DPS over time, data' });
    expect(within(data).getAllByRole('row')).toHaveLength(61);
    const look = screen.getByRole('list', { name: 'What to look at' });
    const items = within(look).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(4);
  });

  it('the chart is keyboard focusable: arrows move the crosshair and the tooltip reads the values', async () => {
    renderApp({ route: '#/fight' });
    playFight();
    goTo('#/report/damage');
    await settle();
    const chart = screen.getByRole('img', { name: /DPS over time/ });
    expect(chart.getAttribute('tabindex')).toBe('0');
    act(() => chart.focus());
    fireEvent.keyDown(chart, { key: 'End' });
    expect(screen.getByRole('status', { name: 'Chart value' }).textContent).toMatch(/60 s/);
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.getByRole('status', { name: 'Chart value' }).textContent).toMatch(/59 s/);
  });

  it('Timeline, Log and Rotation tabs render the fight; Log filter narrows the rows', async () => {
    renderApp({ route: '#/fight' });
    playFight();
    goTo('#/report/timeline');
    await settle();
    expect(screen.getByRole('img', { name: /Casts and auras over the fight/ })).toBeTruthy();
    goTo('#/report/log');
    await settle();
    const log = screen.getByRole('table', { name: 'Combat log' });
    const count = () => Number(log.getAttribute('aria-rowcount'));
    const all = count();
    expect(all).toBeGreaterThan(20);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter the log' }), { target: { value: 'shadow bolt crit' } });
    expect(count()).toBeLessThan(all);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter the log' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mana' }));
    expect(screen.getByRole('button', { name: 'Mana' }).getAttribute('aria-pressed')).toBe('true');
    expect(count()).toBeLessThan(all);
    goTo('#/report/rotation');
    await settle();
    const list = screen.getByRole('list', { name: /Your casts against the bot’s/ });
    expect(within(list).getByText('Shadow Bolt')).toBeTruthy();
  });

  it('Fight Again resets the ended fight and opens the Fight screen', async () => {
    renderApp({ route: '#/fight' });
    playFight();
    goTo('#/report/damage');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Fight Again' }));
    await settle();
    expect(window.location.hash).toBe('#/fight');
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
    // The report still shows the last ended fight.
    goTo('#/report/damage');
    await settle();
    expect(screen.getByRole('table', { name: 'Damage by spell' })).toBeTruthy();
  });
});

describe('Log list: a virtual list', () => {
  it('renders at most 60 DOM rows for 1,000 events and follows the scroll', () => {
    const rows: LogRow[] = Array.from({ length: 1000 }, (_, i) => ({
      index: i,
      atMs: i * 60,
      kind: 'damage',
      text: `Shadow Bolt hit ${i}`,
      amount: 1000 + i,
      crit: false,
    }));
    render(<LogList rows={rows} />);
    const table = screen.getByRole('table', { name: 'Combat log' });
    expect(table.getAttribute('aria-rowcount')).toBe('1001');
    const bodyRows = () => table.querySelectorAll('[role="row"][aria-rowindex]:not([aria-rowindex="1"])');
    expect(bodyRows().length).toBeGreaterThan(5);
    expect(bodyRows().length).toBeLessThanOrEqual(60);
    expect(screen.getByText('Shadow Bolt hit 0')).toBeTruthy();
    const scroller = table.querySelector('.log-scroll') as HTMLElement;
    scroller.scrollTop = 28 * 500;
    fireEvent.scroll(scroller);
    expect(screen.queryByText('Shadow Bolt hit 0')).toBeNull();
    expect(screen.getByText('Shadow Bolt hit 500')).toBeTruthy();
    expect(bodyRows().length).toBeLessThanOrEqual(60);
  });
});
