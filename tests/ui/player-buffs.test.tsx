import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveBuffView, PermanentBuffView, UpcomingBuffView } from '../../src/ui/buffsView';
import { PlayerBuffsPanel, useAuraTotals } from '../../src/ui/PlayerBuffsPanel';

afterEach(cleanup);

const heroism = (remainingMs: number, p: Partial<ActiveBuffView> = {}): ActiveBuffView => ({
  auraId: 'heroism',
  name: 'Heroism / Bloodlust',
  icon: 'ability_shaman_heroism',
  description: '+30% spell haste for 40 s.',
  count: null,
  remainingMs,
  ...p,
});

const potion = (remainingMs: number, p: Partial<ActiveBuffView> = {}): ActiveBuffView => ({
  auraId: 'destruction-potion',
  name: 'Destruction Potion',
  icon: 'inv_potion_107',
  description: '+120 spell power.',
  count: null,
  remainingMs,
  ...p,
});

const upcomingHeroism = (startsAtMs: number, inMs: number): UpcomingBuffView => ({
  auraId: 'heroism',
  name: 'Heroism / Bloodlust',
  icon: 'ability_shaman_heroism',
  startsAtMs,
  inMs,
});

const PERMANENT: PermanentBuffView[] = [
  { id: 'arcane-brilliance', name: 'Arcane Brilliance', icon: 'spell_holy_arcaneintellect', description: '+40 intellect.' },
  { id: 'blessing-of-kings', name: 'Blessing of Kings', icon: 'spell_magic_greaterblessingofkings', description: '+10% stats.' },
];

interface PanelProps {
  active?: ActiveBuffView[];
  upcoming?: UpcomingBuffView[];
  permanent?: PermanentBuffView[];
  totals?: ReadonlyMap<string, number>;
  phase?: 'ready' | 'running' | 'ended';
}

function renderPanel(p: PanelProps = {}) {
  return render(
    <PlayerBuffsPanel
      active={p.active ?? []}
      upcoming={p.upcoming ?? []}
      permanent={p.permanent ?? []}
      totals={p.totals ?? new Map()}
      phase={p.phase ?? 'running'}
    />,
  );
}

const panel = () => screen.getByRole('region', { name: 'Your buffs' });
const activeList = () => within(panel()).getByRole('list', { name: 'Active buffs' });
const entry = (name: RegExp | string) => within(activeList()).getByRole('listitem', { name });

describe('PlayerBuffsPanel', () => {
  it('renders the three parts: active, upcoming and the setup buffs', () => {
    renderPanel({
      active: [heroism(22100), potion(4300, { count: 2 })],
      upcoming: [upcomingHeroism(30000, 12000)],
      permanent: PERMANENT,
      totals: new Map([['heroism', 40000]]),
    });
    const items = within(activeList()).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Heroism / Bloodlust, 23 seconds left',
      'Destruction Potion, 5 seconds left',
    ]);
    expect(items[0]?.textContent).toContain('Heroism / Bloodlust');
    expect(items[0]?.querySelector('.buff-time')?.textContent).toBe('23s');
    expect(items[1]?.querySelector('.buff-time')?.textContent).toBe('4.3s');
    expect(items[1]?.querySelector('.buff-count')?.textContent).toBe('2');
    expect(items[0]?.querySelector('.buff-count')).toBeNull();
    // Icons over a school-neutral initials tile; the description in the tooltip.
    expect(items[0]?.querySelector('img')?.getAttribute('src')).toContain('ability_shaman_heroism.jpg');
    expect(items[0]?.querySelector('.buff-icon')?.textContent).toContain('HB');
    expect(items[0]?.getAttribute('title')).toBe('Heroism / Bloodlust: +30% spell haste for 40 s.');

    const upcoming = within(panel()).getByRole('list', { name: 'Upcoming buffs' });
    expect(within(upcoming).getAllByRole('listitem').map((li) => li.querySelector('.buff-upcoming-text')?.textContent)).toEqual([
      'Heroism / Bloodlust in 12.0 s',
    ]);

    const details = panel().querySelector('details');
    expect(details?.querySelector('summary')?.textContent).toBe('Setup buffs (2)');
    const setup = within(details as HTMLElement).getByRole('list', { name: 'Setup buffs', hidden: true });
    const setupItems = within(setup).getAllByRole('listitem', { hidden: true });
    expect(setupItems.map((li) => li.getAttribute('title'))).toEqual([
      'Arcane Brilliance: +40 intellect.',
      'Blessing of Kings: +10% stats.',
    ]);
    expect(setupItems.map((li) => li.getAttribute('aria-label'))).toEqual(['Arcane Brilliance', 'Blessing of Kings']);
    // No counters or times on the setup buffs.
    expect(setup.querySelector('.buff-time')).toBeNull();
  });

  it('in ready the upcoming entries show the second they start at', () => {
    renderPanel({ phase: 'ready', upcoming: [upcomingHeroism(6400, 6400)] });
    const upcoming = within(panel()).getByRole('list', { name: 'Upcoming buffs' });
    expect(within(upcoming).getByRole('listitem').querySelector('.buff-upcoming-text')?.textContent).toBe(
      'Heroism / Bloodlust at 6.4 s',
    );
  });

  it('the bar shows remaining / total, full without a total yet, never over 100%', () => {
    renderPanel({
      active: [heroism(20000), potion(15000), heroism(1000, { auraId: 'other', name: 'Other' })],
      totals: new Map([
        ['heroism', 40000],
        ['other', 500], // a stale total smaller than the time left: clamped
      ]),
    });
    const width = (name: RegExp) => (entry(name).querySelector('.buff-bar-fill') as HTMLElement).style.width;
    expect(width(/^Heroism/)).toBe('50%');
    expect(width(/^Destruction Potion/)).toBe('100%');
    expect(width(/^Other/)).toBe('100%');
    // Decorative: not a progressbar (the time is in the entry's label).
    expect(within(panel()).queryAllByRole('progressbar')).toEqual([]);
  });

  it('buff-expiring below 5000 ms and not at 5000', () => {
    renderPanel({ active: [heroism(5000), potion(4999)] });
    expect(entry(/^Heroism/).classList.contains('buff-expiring')).toBe(false);
    expect(entry(/^Destruction Potion/).classList.contains('buff-expiring')).toBe(true);
  });

  it('no pulse once the fight has ended', () => {
    renderPanel({ phase: 'ended', active: [potion(0)] });
    expect(entry(/^Destruction Potion/).classList.contains('buff-expiring')).toBe(false);
  });

  it('the stylesheet pulses expiring buffs and turns the pulse off under prefers-reduced-motion', async () => {
    // Vitest serves stylesheets empty (even `?raw`), so the file is read from disk. A computed
    // specifier keeps Node's types (not in this project) out of the type check.
    const nodeFs = 'node:' + 'fs';
    const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
    // (Not `new URL(path, import.meta.url)`: Vite rewrites that into a served asset URL.)
    const testFile = decodeURIComponent(new URL(import.meta.url).pathname);
    const css = fs.readFileSync(testFile.replace(/tests\/ui\/[^/]+$/, 'src/ui/game.css'), 'utf8');
    expect(css).toMatch(/\.buff-expiring[^{]*\{[^}]*animation:/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    expect(reduced?.[1]).toMatch(/\.buff-expiring[^{]*\{[^}]*animation: none/);
  });

  it('empty state: "No active buffs", no upcoming list, no setup section', () => {
    renderPanel();
    expect(within(panel()).getByText('No active buffs')).toBeTruthy();
    expect(within(panel()).queryByRole('list', { name: 'Upcoming buffs' })).toBeNull();
    expect(panel().querySelector('details')).toBeNull();
  });

  it('details closed by default; its toggle is a plain <summary> (the S5 hotkey guard covers it)', () => {
    renderPanel({ permanent: PERMANENT });
    const details = panel().querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary') as HTMLElement;
    // GameView's guard gives Space and Enter to a focused `summary` and lets every other hotkey
    // through; nothing here adds a tabindex or a key handler of its own (the wiring test is Task 2's).
    expect(summary.matches('summary')).toBe(true);
    expect(summary.getAttribute('tabindex')).toBeNull();
    expect(panel().querySelectorAll('button, input, [tabindex]')).toHaveLength(0);
  });

  it('a missing icon file leaves the initials tile', () => {
    renderPanel({ active: [heroism(10000, { icon: null })] });
    expect(entry(/^Heroism/).querySelector('img')).toBeNull();
    expect(entry(/^Heroism/).querySelector('.buff-icon')?.textContent).toBe('HB');
  });
});

describe('useAuraTotals', () => {
  it('remembers the largest time seen per application, restarts on a refresh and after a fade', () => {
    const { result, rerender } = renderHook(({ active }: { active: ActiveBuffView[] }) => useAuraTotals(active), {
      initialProps: { active: [heroism(40000)] },
    });
    expect([...result.current]).toEqual([['heroism', 40000]]);
    rerender({ active: [heroism(30000), potion(15000)] });
    expect([...result.current]).toEqual([
      ['heroism', 40000],
      ['destruction-potion', 15000],
    ]);
    rerender({ active: [potion(14000)] });
    expect([...result.current]).toEqual([['destruction-potion', 15000]]);
    rerender({ active: [potion(13000), heroism(20000)] });
    expect([...result.current]).toEqual([
      ['destruction-potion', 15000],
      ['heroism', 20000],
    ]);
    act(() => rerender({ active: [potion(14500), heroism(19000)] })); // potion refreshed to 14.5 s
    expect(result.current.get('destruction-potion')).toBe(14500);
    expect(result.current.get('heroism')).toBe(20000);
  });

  it('the same list again returns the same map (no re-render storm)', () => {
    const list = [heroism(40000)];
    const { result, rerender } = renderHook(({ active }: { active: ActiveBuffView[] }) => useAuraTotals(active), {
      initialProps: { active: list },
    });
    const first = result.current;
    rerender({ active: list });
    expect(result.current).toBe(first);
  });
});
