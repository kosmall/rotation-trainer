import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_STORAGE_KEY, useTheme } from '../../../src/ui/theme/theme';
import type { UiStorage } from '../../../src/ui/theme/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: UiStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
  };
  return { storage, map };
}

const throwing: UiStorage = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
};

/** A `matchMedia` that answers `prefers-color-scheme: light` with `light`. */
function systemPrefers(light: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: light && query.includes('light'), media: query }));
}

const html = () => document.documentElement;
const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

beforeEach(() => {
  delete html().dataset.theme;
  document.head.querySelector('meta[name="theme-color"]')?.remove();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useTheme', () => {
  it('without a stored choice follows the system preference', () => {
    systemPrefers(true);
    const { result } = renderHook(() => useTheme(memoryStorage().storage));
    expect(result.current.theme).toBe('light');
    expect(html().dataset.theme).toBe('light');
  });

  it('defaults to dark without a stored choice or a system preference (no matchMedia)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useTheme(null));
    expect(result.current.theme).toBe('dark');
    expect(html().dataset.theme).toBe('dark');
  });

  it('a stored choice wins over the system preference', () => {
    systemPrefers(true);
    const { storage } = memoryStorage({ [UI_STORAGE_KEY]: JSON.stringify({ version: 1, theme: 'dark' }) });
    const { result } = renderHook(() => useTheme(storage));
    expect(result.current.theme).toBe('dark');
  });

  it('toggle switches data-theme and the theme-color meta, and saves under rotation-trainer:ui:v1 keeping the other keys', () => {
    systemPrefers(false);
    const { storage, map } = memoryStorage({ [UI_STORAGE_KEY]: JSON.stringify({ version: 1, dockOpen: true }) });
    const { result } = renderHook(() => useTheme(storage));
    expect(result.current.theme).toBe('dark');
    expect(themeColor()).toBe('#221c31');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(html().dataset.theme).toBe('light');
    expect(themeColor()).toBe('#fbfaff');
    expect(JSON.parse(map.get(UI_STORAGE_KEY) ?? 'null')).toEqual({ version: 1, dockOpen: true, theme: 'light' });
    act(() => result.current.toggle());
    expect(html().dataset.theme).toBe('dark');
    expect(JSON.parse(map.get(UI_STORAGE_KEY) ?? 'null')).toEqual({ version: 1, dockOpen: true, theme: 'dark' });
  });

  it('ignores a malformed or foreign stored value', () => {
    systemPrefers(true);
    for (const value of ['{', '"dark"', JSON.stringify({ version: 2, theme: 'dark' }), JSON.stringify({ version: 1, theme: 'blue' })]) {
      const { result, unmount } = renderHook(() => useTheme(memoryStorage({ [UI_STORAGE_KEY]: value }).storage));
      expect(result.current.theme).toBe('light');
      unmount();
    }
  });

  it('survives a throwing storage: the system preference, and the toggle still works in memory', () => {
    systemPrefers(false);
    const { result } = renderHook(() => useTheme(throwing));
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(html().dataset.theme).toBe('light');
  });
});
