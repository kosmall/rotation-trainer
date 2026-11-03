// The colour theme (UI redesign spec §4.1): dark "Nether" or light "Moonstone", chosen with the
// header's button and saved under the UI preferences key; without a saved choice the system's
// `prefers-color-scheme`. index.html applies the same choice before the first paint (no flash);
// this hook keeps `<html data-theme>` and `<meta name="theme-color">` in step after that.

import { useCallback, useLayoutEffect, useState } from 'react';

/** The UI-only preferences (theme, later the dock and the coach hint): one versioned JSON object. */
export const UI_STORAGE_KEY = 'rotation-trainer:ui:v1';

export type Theme = 'dark' | 'light';

/** Where the UI preferences live (Web Storage or a test double); any call may throw. */
export type UiStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser chrome colour per theme: the header's surface. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = { dark: '#221c31', light: '#fbfaff' };

type UiPrefs = Record<string, unknown> & { version: 1 };

/** The stored preferences object, or a fresh one (malformed, foreign version, unreadable). */
export function readUiPrefs(storage: UiStorage | null): UiPrefs {
  try {
    const raw = storage?.getItem(UI_STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && (value as UiPrefs).version === 1) {
        return value as UiPrefs;
      }
    }
  } catch {
    // Blocked storage or bad JSON: the defaults.
  }
  return { version: 1 };
}

/** Saves one preference, keeping the others; false when the storage refused (kept in memory). */
export function writeUiPref(storage: UiStorage | null, key: string, value: unknown): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(UI_STORAGE_KEY, JSON.stringify({ ...readUiPrefs(storage), [key]: value }));
    return true;
  } catch {
    return false;
  }
}

function systemTheme(): Theme {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The saved theme, else the system's. */
export function initialTheme(storage: UiStorage | null): Theme {
  const saved = readUiPrefs(storage).theme;
  return saved === 'dark' || saved === 'light' ? saved : systemTheme();
}

/** Writes the theme to `<html data-theme>` and the `theme-color` meta (created when missing). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = THEME_COLORS[theme];
}

/** The current theme and its toggle; `storage` is read once (at mount) and written on every toggle. */
export function useTheme(storage: UiStorage | null): { theme: Theme; toggle(): void } {
  const [theme, setTheme] = useState<Theme>(() => initialTheme(storage));
  useLayoutEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeUiPref(storage, 'theme', next); // false (blocked, full): kept for this page only
  }, [storage, theme]);
  return { theme, toggle };
}
