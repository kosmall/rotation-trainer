// Accessibility checks over every view (UI redesign spec §8, plan Global Constraints): landmarks,
// one h1 per view, the skip link, focus after a mode change, named buttons and links, images with
// a reserved size, and stylesheet rules (never `outline: none`, never `transition: all`).

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_TABS, SETUP_SECTIONS } from '../../src/ui/shell/router';
import { goTo, renderApp } from './renderApp';

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
  window.location.hash = '';
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

/** Every route of the app (the Fight screen, each Setup section, each Report tab). */
const ROUTES = ['#/fight', ...SETUP_SECTIONS.map((s) => `#/setup/${s}`), ...REPORT_TABS.map((t) => `#/report/${t}`)];

/** Renders the app with an ended fight (so the Report has its tabs' content), then visits each route. */
async function visitAll(check: (route: string) => void) {
  renderApp({ route: '#/fight' });
  fireEvent.keyDown(window, { key: '1' });
  act(() => {
    vi.advanceTimersByTime(61_000);
  });
  for (const route of ROUTES) {
    goTo(route);
    await settle();
    check(route);
  }
}

/** The accessible name of an element as the tests can see it: aria-label, aria-labelledby, or its text. */
function nameOf(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  const title = el.getAttribute('title');
  return ((el.textContent ?? '').trim() || title || '').trim();
}

describe('Accessibility: every view', () => {
  it('the shell landmarks: banner, the Mode navigation, one main#main; the skip link comes first', async () => {
    await visitAll((route) => {
      expect(screen.getByRole('banner'), route).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Mode' }), route).toBeTruthy();
      expect(screen.getAllByRole('main'), route).toHaveLength(1);
      expect(screen.getByRole('main').id, route).toBe('main');
      const first = document.body.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      expect(first?.textContent, route).toBe('Skip to content');
    });
  });

  it("each mode's own landmarks (spec §8)", async () => {
    await visitAll((route) => {
      if (route.startsWith('#/setup')) {
        expect(screen.getByRole('navigation', { name: 'Setup sections' }), route).toBeTruthy();
        expect(screen.getByRole('complementary', { name: 'Next fight summary' }), route).toBeTruthy();
      } else if (route.startsWith('#/fight')) {
        expect(screen.getByRole('region', { name: 'Fight' }), route).toBeTruthy();
        expect(screen.getByRole('complementary', { name: 'Fight details' }), route).toBeTruthy();
      } else {
        expect(screen.getByRole('navigation', { name: 'Report sections' }), route).toBeTruthy();
      }
    });
  });

  it('one h1 per view', async () => {
    await visitAll((route) => {
      expect(document.querySelectorAll('h1'), route).toHaveLength(1);
    });
  });

  it('every button and link has an accessible name (icon-only ones by aria-label)', async () => {
    await visitAll((route) => {
      for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="link"]')) {
        expect(nameOf(el), `${route}: ${el.outerHTML.slice(0, 120)}`).not.toBe('');
      }
    });
  });

  it('every form field has a label', async () => {
    await visitAll((route) => {
      for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
        const id = el.id;
        const labelled =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.closest('label') ||
          (id !== '' && [...document.querySelectorAll('label')].some((l) => l.htmlFor === id));
        expect(Boolean(labelled), `${route}: ${el.outerHTML.slice(0, 120)}`).toBe(true);
      }
    });
  });

  it('every <img> has a width and a height (no layout shift when it loads)', async () => {
    await visitAll((route) => {
      for (const img of document.querySelectorAll('img')) {
        expect(img.getAttribute('width'), `${route}: ${img.outerHTML}`).toMatch(/^\d+$/);
        expect(img.getAttribute('height'), `${route}: ${img.outerHTML}`).toMatch(/^\d+$/);
      }
    });
  });

  it('the skip link focuses main without changing the route; a mode change moves the focus to main', async () => {
    renderApp({ route: '#/setup/gear' });
    await settle();
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(window.location.hash).toBe('#/setup/gear');
    (document.activeElement as HTMLElement).blur();
    goTo('#/report/damage');
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(document.title).toBe('Rotation Trainer: Report, damage');
  });
});

describe('Accessibility: stylesheets', () => {
  async function cssFiles(): Promise<{ path: string; text: string }[]> {
    // Vitest serves stylesheets empty, so the files are read from disk.
    const nodeFs = 'node:' + 'fs';
    const fs = (await import(/* @vite-ignore */ nodeFs)) as {
      readFileSync(path: string, encoding: 'utf8'): string;
      readdirSync(path: string, options: { recursive: true }): string[];
    };
    const root = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/tests\/ui\/[^/]+$/, 'src/');
    return fs
      .readdirSync(root, { recursive: true })
      .filter((f) => f.endsWith('.css'))
      .map((f) => ({ path: f.replaceAll('\\', '/'), text: fs.readFileSync(root + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));
  }

  it('there are stylesheets to check', async () => {
    const files = await cssFiles();
    expect(files.map((f) => f.path).sort()).toEqual(
      expect.arrayContaining(['ui/fight/fight.css', 'ui/game.css', 'ui/report/report.css', 'ui/setup/setup.css', 'ui/shell/shell.css', 'ui/theme/tokens.css']),
    );
  });

  it('never `outline: none` (or 0): the focus ring is never removed', async () => {
    for (const { path, text } of await cssFiles()) {
      expect(text, path).not.toMatch(/outline\s*:\s*(none|0)\b/);
    }
  });

  it('never `transition: all`', async () => {
    for (const { path, text } of await cssFiles()) {
      expect(text, path).not.toMatch(/transition(-property)?\s*:\s*all\b/);
    }
  });
});
