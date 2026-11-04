import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDestructionWarlock } from '../../../src/data/classes/warlock/destruction';
import type { GearTables, WarlockOptions } from '../../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../../src/data/types';
import type { EquippedItem } from '../../../src/engine/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../../src/setup/storage';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import { goTo, renderApp } from '../renderApp';

// Same fake clock as game.test.tsx: fight time moves only through vi.advanceTimersByTime.
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
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init });
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startButton = () => screen.queryByRole('button', { name: /^start the fight$/i });
const elapsed = () => screen.getByLabelText('Elapsed').textContent;
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));

function storedSetup(p: Partial<SetupConfig>): SetupStorage {
  const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p })]]);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('Fight screen: the arena', () => {
  it('exposes the target, debuffs, buffs, cast bar, mana, action bar and item bar by their names', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['arcane-brilliance', 'heroism', 'destruction-potion'] }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Fight' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Fight' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Fight details' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Target health' }).getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByRole('list', { name: 'Debuffs on the target' })).toBeTruthy();
    const buffs = screen.getByRole('region', { name: 'Your buffs' });
    expect(within(buffs).getByRole('list', { name: 'Upcoming buffs' })).toBeTruthy();
    expect(within(buffs).getByRole('list', { name: 'Setup buffs' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Mana' })).toBeTruthy();
    const bar = screen.getByRole('toolbar', { name: 'Action bar' });
    expect(within(bar).getByRole('button', { name: 'Shadow Bolt (1)' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Item bar' })).toBeTruthy();
    // No cast before the pull; the start card names the setup with links to its sections.
    expect(castBar()).toBeNull();
    expect(screen.getByRole('heading', { name: /ready when you are/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'My gear (export)' }).getAttribute('href')).toBe('#/setup/gear');

    press('x'); // the potion: the fight starts
    press('1');
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    advance(3000);
    expect(within(buffs).getByRole('list', { name: 'Active buffs' })).toBeTruthy();
    expect(within(buffs).getByLabelText('Destruction Potion, 13 seconds left')).toBeTruthy();
  });

  it('debuffs read as "Immolate, 4.1s left"; own debuffs come before the raid debuffs', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['misery'] }) });
    press('2'); // Immolate
    advance(2500);
    const list = screen.getByRole('list', { name: 'Debuffs on the target' });
    const names = within(list).getAllByRole('listitem').map((li) => li.getAttribute('aria-label') ?? '');
    expect(names[0]).toMatch(/^Immolate, \d+(\.\d)?s left$/);
    expect(names.some((n) => n.startsWith('Misery'))).toBe(true);
    expect(names.findIndex((n) => n.startsWith('Misery'))).toBeGreaterThan(0);
  });

  it('the HUD shows the clock as m:ss.s, the DPS and the damage', () => {
    renderApp({ route: '#/fight' });
    expect(elapsed()).toBe('0:00.0 / 1:00');
    press(' ');
    advance(3000);
    expect(elapsed()).toBe('0:03.0 / 1:00');
    expect(screen.getByLabelText('DPS').textContent).toBe('0.0');
    expect(screen.getByLabelText('Total damage').textContent).toBe('0');
  });
});

describe('Fight screen: keys', () => {
  it('hotkeys cast on the Fight screen and do nothing at #/setup/gear', async () => {
    renderApp({ route: '#/setup/gear' });
    await settle();
    press('1');
    press(' ');
    goTo('#/fight');
    expect(startButton()).not.toBeNull(); // nothing started while on Setup
    expect(castBar()).toBeNull();
    press('1');
    expect(castBar()?.textContent).toContain('Shadow Bolt');
  });

  it('Space starts, Esc cancels, R resets', () => {
    renderApp({ route: '#/fight' });
    press(' ');
    expect(startButton()).toBeNull();
    press('1');
    advance(500);
    expect(castBar()).not.toBeNull();
    press('Escape');
    expect(castBar()).toBeNull();
    advance(500);
    press('r');
    expect(startButton()).not.toBeNull();
    expect(elapsed()).toBe('0:00.0 / 1:00');
  });

  it('leaving the Fight screen pauses the clock; Space resumes from the same time', async () => {
    renderApp({ route: '#/fight' });
    press(' ');
    advance(2000);
    expect(elapsed()).toBe('0:02.0 / 1:00');
    goTo('#/setup/gear');
    await settle();
    advance(10_000); // away for 10 s: the fight does not move
    goTo('#/fight');
    expect(elapsed()).toBe('0:02.0 / 1:00');
    expect(screen.getByRole('region', { name: 'Paused' })).toBeTruthy();
    advance(1000);
    expect(elapsed()).toBe('0:02.0 / 1:00'); // still paused on return
    press(' ');
    expect(screen.queryByRole('region', { name: 'Paused' })).toBeNull();
    advance(1000);
    expect(elapsed()).toBe('0:03.0 / 1:00');
  });

  it('a spell key resumes a paused fight too, and the global "g" shortcuts work while it is paused', async () => {
    renderApp({ route: '#/fight' });
    press(' ');
    advance(1000);
    goTo('#/report/damage');
    await settle();
    press('g');
    press('f');
    expect(window.location.hash).toBe('#/fight');
    press('1');
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    advance(500);
    expect(elapsed()).toBe('0:01.5 / 1:00');
  });
});

describe('Fight screen: the end card', () => {
  it('shows the DPS and "Open Report" links to #/report/damage; Enter opens it', () => {
    renderApp({ route: '#/fight' });
    press('1');
    advance(61_000);
    const card = screen.getByRole('region', { name: 'Fight summary' });
    const dps = amount(within(card).getByLabelText('DPS'));
    const damage = amount(within(card).getByLabelText('Total damage'));
    expect(dps).toBeGreaterThan(0);
    expect(dps).toBeCloseTo(damage / 60, 0);
    expect(within(card).getByRole('link', { name: 'Open Report' }).getAttribute('href')).toBe('#/report/damage');
    press('Enter');
    expect(window.location.hash).toBe('#/report/damage');
  });
});

describe('Fight screen: dock and motion', () => {
  it('the meter fills while the fight runs; the combat text switch turns the HUD off', () => {
    renderApp({ route: '#/fight' });
    expect(screen.getByText('No damage yet')).toBeTruthy();
    press('1');
    advance(4500);
    const meter = screen.getByRole('list', { name: 'Damage by spell' });
    expect(within(meter).getByText('Shadow Bolt')).toBeTruthy();
    const toggle = screen.getByRole('checkbox', { name: 'Combat text' }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(document.querySelector('.hud')).toBeNull();
  });

  it('coach glow marks the slot the bot would press next, and can be switched off', () => {
    renderApp({ route: '#/fight' });
    const glowing = () => Array.from(document.querySelectorAll('.fv-slot-next')).map((b) => b.getAttribute('aria-label'));
    expect(glowing()).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Coach glow' }));
    expect(glowing()).toHaveLength(0);
  });

  it('reduced motion: an expiring aura gets no pulse class (a red outline instead)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    press('x');
    advance(11_100); // 3.9 s left: expiring
    const potion = screen.getByLabelText(/^Destruction Potion, 4 seconds left$/);
    expect(potion.classList.contains('expiring')).toBe(true);
    expect(potion.classList.contains('pulse')).toBe(false);
    expect(document.querySelector('.fv-enter-0, .fv-enter-1')).toBeNull();
  });

  it('without reduced motion the expiring aura pulses', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    press('x');
    advance(11_100);
    expect(screen.getByLabelText(/^Destruction Potion, 4 seconds left$/).classList.contains('pulse')).toBe(true);
  });
});

describe('Fight screen: aura icons and stylesheet', () => {
  it('a debuff shows its icon and charges; a missing icon file leaves the initials', () => {
    // Shadow Bolt always crits (and never misses): its crit applies Shadow Vulnerability (ISB) with charges.
    const alwaysCrit = (w: WarlockOptions, gear?: readonly (EquippedItem | null)[], db?: GearTables, talents?: string): SpecData => {
      const spec = buildDestructionWarlock(w, gear, db, talents);
      return {
        ...spec,
        spells: spec.spells.map((x) => (x.id === 'shadow-bolt' ? { ...x, canMiss: false } : x)),
        modifiers: [...spec.modifiers, { spellIds: ['shadow-bolt'], critPctDelta: 100 }],
      };
    };
    renderApp({ route: '#/fight', buildSpec: alwaysCrit });
    press('1');
    advance(4500); // the bolt lands at about 3.83 s
    const list = screen.getByRole('list', { name: 'Debuffs on the target' });
    const isb = within(list)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-label')?.startsWith('Shadow Vulnerability')) as HTMLElement;
    expect(isb).toBeDefined();
    expect(isb.querySelector('img')?.getAttribute('src')).toContain('/icons/spells/');
    expect(isb.getAttribute('aria-label')).toMatch(/, \d charges?$/);
    fireEvent.error(isb.querySelector('img') as HTMLImageElement);
    expect(isb.querySelector('img')).toBeNull();
    expect(isb.querySelector('.fv-aura-initials')?.textContent).toBe('SV');
  });

  it('a buff without an icon file keeps its initials tile', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    press('x');
    const potion = screen.getByLabelText(/^Destruction Potion, 15 seconds left$/);
    fireEvent.error(potion.querySelector('img') as HTMLImageElement);
    expect(potion.querySelector('img')).toBeNull();
    expect(potion.querySelector('.fv-aura-initials')?.textContent).toBe('DP');
  });

  it('the stylesheet pulses expiring auras, outlines them instead under reduced motion, and never animates layout', async () => {
    const nodeFs = 'node:' + 'fs';
    const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
    const testFile = decodeURIComponent(new URL(import.meta.url).pathname);
    const css = fs.readFileSync(testFile.replace(/tests\/ui\/fight\/[^/]+$/, 'src/ui/fight/fight.css'), 'utf8');
    expect(css).toMatch(/\.fv-aura\.pulse \.fv-aura-icon \{[^}]*animation: fv-pulse/);
    expect(css).toMatch(/\.fv-aura\.expiring:not\(\.pulse\) \.fv-aura-icon \{[^}]*outline: 2px solid/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(reduced).toMatch(/\.fv-aura\.pulse \.fv-aura-icon,[^{]*\{[^}]*animation: none/);
    expect(css).not.toMatch(/transition: all/);
    expect(css).not.toMatch(/outline: none/);
    // Keyframes move transform and opacity only.
    for (const block of css.match(/@keyframes [\w-]+ \{[\s\S]*?\n\}/g) ?? []) expect(block).not.toMatch(/\b(width|height|top|left|margin)\s*:/);
  });
});
