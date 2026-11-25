import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupStorage } from '../../../src/setup/storage';
import { UI_STORAGE_KEY } from '../../../src/ui/theme/theme';
import { goTo, renderApp } from '../renderApp';

// Same fake clock as game.test.tsx: fight time moves only through vi.advanceTimersByTime.
const FAKE_NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
  delete document.documentElement.dataset.theme;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
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

/** Lets the lazy views' imports settle (React.lazy resolves through promises). */
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

const press = (key: string, target: Window | Element = window) => fireEvent.keyDown(target, { key });
const modes = () => screen.getByRole('navigation', { name: 'Mode' });
const modeLink = (name: string) => within(modes()).getByRole('link', { name });
const chips = () => screen.getByRole('list', { name: 'Next fight' });
const chip = (name: RegExp) => within(chips()).getByRole('link', { name });
const main = () => document.getElementById('main') as HTMLElement;

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

const throwing: SetupStorage = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
};

describe('App shell: header and modes', () => {
  it('the mode links point at the three modes and mark the current one with aria-current', async () => {
    renderApp({ route: '#/fight' });
    expect(modeLink('Setup').getAttribute('href')).toBe('#/setup/gear');
    expect(modeLink('Fight').getAttribute('href')).toBe('#/fight');
    expect(modeLink('Report').getAttribute('href')).toBe('#/report/damage');
    expect(modeLink('Fight').getAttribute('aria-current')).toBe('page');
    expect(modeLink('Setup').hasAttribute('aria-current')).toBe(false);

    goTo('#/setup/talents');
    await settle();
    expect(modeLink('Setup').getAttribute('aria-current')).toBe('page');
    expect(modeLink('Fight').hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Talents' })).toBeTruthy();
  });

  it('a mobile tab bar carries the same mode links', () => {
    renderApp({ route: '#/report/log' });
    const bar = screen.getByRole('navigation', { name: 'Mode tabs' });
    const links = within(bar).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/forever/sim', '#/setup/gear', '#/fight', '#/report/damage']);
    expect(within(bar).getByRole('link', { name: 'Report' }).getAttribute('aria-current')).toBe('page');
  });

  it('the spec chip shows the spec and class names from the spec data; <html> gets the class token', () => {
    renderApp();
    const spec = screen.getByTitle(/^Spec:/);
    expect(spec.textContent).toBe('Destruction Warlock');
    expect(spec.querySelector('b')?.textContent).toBe('Destruction');
    expect(document.documentElement.dataset.class).toBe('warlock');
  });

  it('the status chips name the next fight and link to their Setup sections', () => {
    renderApp();
    const links = within(chips()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#/setup/buffs',
      '#/setup/gear',
      '#/setup/talents',
      '#/setup/rotation',
      '#/setup/fight',
    ]);
    expect(chip(/^Setup/).textContent).toBe('Setup None');
    expect(chip(/^Gear/).textContent).toBe('Gear My gear (export)');
    expect(chip(/^Talents/).textContent).toBe('Talents My build (export)');
    expect(chip(/^Rotation/).textContent).toBe('Rotation DoT rotation');
    expect(chip(/^Fight/).textContent).toBe('Fight 60 s, 28 yd');
    for (const a of links) expect(a.classList.contains('pending')).toBe(false);
  });

  it('a chip whose section changed since the running fight started gets the pending marker', async () => {
    // The setup fields are on the Setup screen (the interim view shows the legacy panels until Task 3).
    renderApp({ route: '#/setup/fight' });
    await settle();
    // Before the fight starts an edit applies at once: nothing is pending.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Distance from target (yd)' }), { target: { value: '20' } });
    expect(chip(/^Fight/).classList.contains('pending')).toBe(false);
    expect(chip(/^Fight/).textContent).toContain('20 yd');

    goTo('#/fight');
    press(' ');
    advance(100);
    goTo('#/setup/fight'); // leaving the Fight screen pauses the fight; it is still the running one
    await settle();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Distance from target (yd)' }), { target: { value: '25' } });
    const fight = chip(/^Fight/);
    expect(fight.classList.contains('pending')).toBe(true);
    expect(fight.getAttribute('title')).toBe('Changed: applies after you reset the fight (R)');
    expect(fight.textContent).toContain('applies after reset');
    for (const name of [/^Setup/, /^Gear/, /^Talents/, /^Rotation/]) expect(chip(name).classList.contains('pending')).toBe(false);

    // R (on the Fight screen) starts the next fight with the edit: nothing pending any more.
    goTo('#/fight');
    press('r');
    expect(chip(/^Fight/).classList.contains('pending')).toBe(false);
  });

  it('the skip link is first and moves focus to main without changing the route', () => {
    renderApp({ route: '#/setup/buffs' });
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(document.body.querySelector('a')).toBe(skip);
    fireEvent.click(skip);
    expect(document.activeElement).toBe(main());
    expect(window.location.hash).toBe('#/setup/buffs');
  });

  it('a mode change moves focus to main and sets the document title', async () => {
    renderApp({ route: '#/fight' });
    expect(document.title).toBe('Rotation Trainer: Fight');
    expect(main().tagName).toBe('MAIN');
    expect(main().getAttribute('tabindex')).toBe('-1');

    goTo('#/report/timeline');
    await settle();
    expect(document.title).toBe('Rotation Trainer: Report, timeline');
    expect(document.activeElement).toBe(main());

    // A section change within Setup keeps the title in step too.
    goTo('#/setup/gear');
    await settle();
    expect(document.title).toBe('Rotation Trainer: Setup, gear');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('App shell: theme', () => {
  it('the theme button switches data-theme, names what it switches to and persists the choice', () => {
    const { storage, map } = memoryStorage();
    renderApp({ storage });
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
    expect(JSON.parse(map.get(UI_STORAGE_KEY) ?? 'null')).toEqual({ version: 1, theme: 'light' });
  });

  it('a stored theme is used at mount', () => {
    const { storage } = memoryStorage({ [UI_STORAGE_KEY]: JSON.stringify({ version: 1, theme: 'light' }) });
    renderApp({ storage });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('survives a throwing storage', () => {
    renderApp({ storage: throwing });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('list', { name: 'Next fight' })).toBeTruthy();
  });
});

describe('App shell: global shortcuts', () => {
  it('"g s", "g r" and "g f" navigate between the modes', () => {
    renderApp({ route: '#/fight' });
    press('g');
    press('s');
    expect(window.location.hash).toBe('#/setup/gear');
    expect(modeLink('Setup').getAttribute('aria-current')).toBe('page');
    press('g');
    press('r');
    expect(window.location.hash).toBe('#/report/damage');
    press('g');
    press('f');
    expect(window.location.hash).toBe('#/fight');
  });

  it('a "g" sequence expires, and "s" alone does nothing', () => {
    renderApp({ route: '#/fight' });
    press('s');
    expect(window.location.hash).toBe('#/fight');
    press('g');
    advance(2000);
    press('s');
    expect(window.location.hash).toBe('#/fight');
  });

  it('"g s" typed into a field does nothing', async () => {
    renderApp({ route: '#/setup/fight' });
    await settle();
    const field = screen.getByRole('spinbutton', { name: 'Distance from target (yd)' });
    field.focus();
    press('g', field);
    press('s', field);
    expect(window.location.hash).toBe('#/setup/fight');
  });

  it('"g s" does nothing while a fight runs', () => {
    renderApp({ route: '#/fight' });
    press(' ');
    advance(500);
    press('g');
    press('s');
    expect(window.location.hash).toBe('#/fight');
  });

  it('"g r" after the fight ended opens the Report and never resets the ended fight', () => {
    renderApp({ route: '#/fight' });
    press(' ');
    advance(61_000);
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    press('g');
    press('r');
    expect(window.location.hash).toBe('#/report/damage');
    press('g');
    press('f');
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
  });

  it('"?" opens the shortcuts dialog; Esc closes it and gives focus back', () => {
    renderApp({ route: '#/setup/gear' });
    const theme = screen.getByRole('button', { name: 'Switch to light theme' });
    theme.focus();
    fireEvent.keyDown(theme, { key: '?', shiftKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('Go to Setup')).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    expect(document.activeElement).toBe(theme);
  });

  it('the shortcuts dialog closes with its Close button; "?" in a field does nothing', async () => {
    renderApp({ route: '#/setup/fight' });
    await settle();
    const field = screen.getByRole('spinbutton', { name: 'Distance from target (yd)' });
    fireEvent.keyDown(field, { key: '?', shiftKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    press('?');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"?" does nothing while a fight runs (and the cast goes on)', () => {
    renderApp({ route: '#/fight' });
    press('1'); // starts the fight with a Shadow Bolt cast
    advance(200);
    expect(screen.queryByRole('progressbar', { name: 'Cast bar' })).not.toBeNull();
    press('?');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Cast bar' })).not.toBeNull();
  });
});
