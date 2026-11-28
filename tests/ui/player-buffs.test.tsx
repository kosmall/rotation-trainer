// "Your buffs" on the Fight screen (src/ui/fight/PlayerBuffs.tsx). Until the redesign's Task 5 these
// tests covered the legacy layout's PlayerBuffsPanel; they now cover the component that replaced it,
// with the same inputs (the views of src/ui/buffsView.ts). The legacy panel's per-entry bars
// (remaining / total, `useAuraTotals`) and its collapsed "Setup buffs (N)" <details> are gone in
// the redesign (spec §5.2: icons with timers, the setup's buffs as a small second row); the time
// left they showed is in each entry's label and time text, tested here and in setup-wiring.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveBuffView, PermanentBuffView, UpcomingBuffView } from '../../src/ui/buffsView';
import { PlayerBuffs, playerBuffIcons } from '../../src/ui/fight/PlayerBuffs';

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
  phase?: 'ready' | 'running' | 'ended';
  reduceMotion?: boolean;
}

function renderPanel(p: PanelProps = {}) {
  const icons = playerBuffIcons(
    { active: p.active ?? [], upcoming: p.upcoming ?? [], permanent: p.permanent ?? [] },
    p.phase ?? 'running',
  );
  return render(
    <PlayerBuffs active={icons.active} upcoming={icons.upcoming} setup={icons.setup} reduceMotion={p.reduceMotion ?? false} />,
  );
}

const panel = () => screen.getByRole('region', { name: 'Your buffs' });
const activeList = () => within(panel()).getByRole('list', { name: 'Active buffs' });
const entry = (name: RegExp | string) => within(activeList()).getByRole('listitem', { name });

describe('Your buffs (PlayerBuffs)', () => {
  it('renders the three parts: active, upcoming and the setup buffs', () => {
    renderPanel({
      active: [heroism(22100), potion(4300, { count: 2 })],
      upcoming: [upcomingHeroism(30000, 12000)],
      permanent: PERMANENT,
    });
    const items = within(activeList()).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Heroism / Bloodlust, 23 seconds left',
      'Destruction Potion, 5 seconds left',
    ]);
    expect(items[0]?.querySelector('.fv-aura-time')?.textContent).toBe('23s');
    expect(items[1]?.querySelector('.fv-aura-time')?.textContent).toBe('4.3s');
    expect(items[1]?.querySelector('.fv-aura-count')?.textContent).toBe('2');
    expect(items[0]?.querySelector('.fv-aura-count')).toBeNull();
    // Icons over a school-neutral initials tile; the description in the tooltip.
    expect(items[0]?.querySelector('img')?.getAttribute('src')).toContain('ability_shaman_heroism.jpg');
    expect(items[0]?.querySelector('.fv-aura-icon')?.textContent).toContain('HB');
    expect(items[0]?.getAttribute('title')).toBe('Heroism / Bloodlust: +30% spell haste for 40 s.');

    const upcoming = within(panel()).getByRole('list', { name: 'Upcoming buffs' });
    expect(within(upcoming).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Heroism / Bloodlust in 12.0 s']);
    expect(within(upcoming).getByRole('listitem').querySelector('.fv-aura-time')?.textContent).toBe('in 12.0');

    const setup = within(panel()).getByRole('list', { name: 'Setup buffs' });
    const setupItems = within(setup).getAllByRole('listitem');
    expect(setupItems.map((li) => li.getAttribute('title'))).toEqual(['Arcane Brilliance: +40 intellect.', 'Blessing of Kings: +10% stats.']);
    expect(setupItems.map((li) => li.getAttribute('aria-label'))).toEqual(['Arcane Brilliance', 'Blessing of Kings']);
    // No counters or times on the setup buffs.
    expect(setup.querySelector('.fv-aura-time')).toBeNull();
  });

  it('in ready the upcoming entries show the second they start at', () => {
    renderPanel({ phase: 'ready', upcoming: [upcomingHeroism(6400, 6400)] });
    const upcoming = within(panel()).getByRole('list', { name: 'Upcoming buffs' });
    expect(within(upcoming).getByRole('listitem').getAttribute('aria-label')).toBe('Heroism / Bloodlust at 6.4 s');
    expect(within(upcoming).getByRole('listitem').querySelector('.fv-aura-time')?.textContent).toBe('6.4s');
  });

  it('the time left of each entry is its own (the legacy bar: remaining / total)', () => {
    renderPanel({ active: [heroism(20000), potion(15000), heroism(1000, { auraId: 'other', name: 'Other' })] });
    expect(entry(/^Heroism/).getAttribute('aria-label')).toBe('Heroism / Bloodlust, 20 seconds left');
    expect(entry(/^Destruction Potion/).querySelector('.fv-aura-time')?.textContent).toBe('15s');
    expect(entry(/^Other/).querySelector('.fv-aura-time')?.textContent).toBe('1.0s');
    // Decorative: no progressbar (the time is in the entry's label).
    expect(within(panel()).queryAllByRole('progressbar')).toEqual([]);
  });

  it('expiring below 5000 ms and not at 5000; it pulses unless the user asks for reduced motion', () => {
    renderPanel({ active: [heroism(5000), potion(4999)] });
    expect(entry(/^Heroism/).classList.contains('expiring')).toBe(false);
    expect(entry(/^Destruction Potion/).classList.contains('expiring')).toBe(true);
    expect(entry(/^Destruction Potion/).classList.contains('pulse')).toBe(true);
    cleanup();
    renderPanel({ active: [potion(4999)], reduceMotion: true });
    expect(entry(/^Destruction Potion/).classList.contains('expiring')).toBe(true);
    expect(entry(/^Destruction Potion/).classList.contains('pulse')).toBe(false);
  });

  it('no pulse once the fight has ended', () => {
    renderPanel({ phase: 'ended', active: [potion(0)] });
    expect(entry(/^Destruction Potion/).classList.contains('expiring')).toBe(false);
    expect(entry(/^Destruction Potion/).classList.contains('pulse')).toBe(false);
  });

  it('the stylesheet pulses expiring buffs and turns the pulse off under prefers-reduced-motion', async () => {
    // Vitest serves stylesheets empty (even `?raw`), so the file is read from disk. A computed
    // specifier keeps Node's types (not in this project) out of the type check.
    const nodeFs = 'node:' + 'fs';
    const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
    // (Not `new URL(path, import.meta.url)`: Vite rewrites that into a served asset URL.)
    const testFile = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
    const css = fs.readFileSync(testFile.replace(/tests\/ui\/[^/]+$/, 'src/ui/fight/fight.css'), 'utf8');
    expect(css).toMatch(/\.fv-aura\.pulse[^{]*\{[^}]*animation:/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)?.join('\n') ?? '';
    expect(reduced).toMatch(/\.fv-aura\.pulse \.fv-aura-icon[^{]*\{[^}]*animation: none/);
  });

  it('empty state: "No active buffs" (for screen readers), no upcoming list, no setup row', () => {
    renderPanel();
    expect(within(panel()).getByText('No active buffs')).toBeTruthy();
    expect(within(panel()).queryByRole('list', { name: 'Upcoming buffs' })).toBeNull();
    expect(within(panel()).queryByRole('list', { name: 'Setup buffs' })).toBeNull();
  });

  it('nothing in it takes focus or keys (the fight hotkeys stay with the arena)', () => {
    renderPanel({ active: [heroism(10000)], permanent: PERMANENT });
    expect(panel().querySelectorAll('button, input, summary, [tabindex]')).toHaveLength(0);
  });

  it('a missing icon file leaves the initials tile', () => {
    renderPanel({ active: [heroism(10000, { icon: null })] });
    expect(entry(/^Heroism/).querySelector('img')).toBeNull();
    expect(entry(/^Heroism/).querySelector('.fv-aura-icon')?.textContent).toBe('HB');
  });
});
