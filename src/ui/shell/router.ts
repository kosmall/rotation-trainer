// The app's hash router (UI redesign spec §3.2): three modes, each with its section or tab in the
// URL, so a reload or a shared link opens the same place. Hash, not the History API: static
// hosting without rewrites. No dependency; `useRoute` reads `location.hash` through
// `useSyncExternalStore`.

import { useCallback, useSyncExternalStore } from 'react';

export const SETUP_SECTIONS = ['gear', 'talents', 'buffs', 'items', 'rotation', 'fight', 'class', 'scenarios', 'combat-text'] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

export const REPORT_TABS = ['damage', 'timeline', 'log', 'rotation', 'simulator', 'compare'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const FOREVER_VIEWS = ['sim', 'builds', 'rotations', 'compare', 'custom', 'assumptions'] as const;
export type ForeverView = (typeof FOREVER_VIEWS)[number];

export type Route =
  | { mode: 'forever'; view: ForeverView }
  | { mode: 'setup'; section: SetupSection }
  | { mode: 'fight'; overlay?: 'ready' }
  | { mode: 'report'; tab: ReportTab };

export type Mode = Route['mode'];

const FIGHT: Route = { mode: 'fight' };
const FOREVER: Route = { mode: 'forever', view: 'sim' };
const isForeverView = (s: string): s is ForeverView => (FOREVER_VIEWS as readonly string[]).includes(s);

const isSetupSection = (s: string): s is SetupSection => (SETUP_SECTIONS as readonly string[]).includes(s);
const isReportTab = (s: string): s is ReportTab => (REPORT_TABS as readonly string[]).includes(s);

/**
 * The route of a hash ("#/setup/gear"; the leading "#" is optional). Empty and unknown hashes
 * lead to the fight; a mode without its part opens its default (`#/setup` → gear, `#/report` →
 * damage); `#/setup/rotation/script` (the script deep link of the spec) opens Rotation.
 */
export function parseRoute(hash: string): Route {
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  if (path === '' || path === '/') return FOREVER;
  if (!path.startsWith('/')) return FIGHT;
  const parts = path.slice(1).split('/');
  if (parts[parts.length - 1] === '') parts.pop(); // a trailing slash
  const [mode, part, extra, ...rest] = parts;
  if (rest.length > 0) return FIGHT;
  switch (mode) {
    case 'forever':
      if (part === undefined) return FOREVER;
      return extra === undefined && isForeverView(part) ? { mode: 'forever', view: part } : FOREVER;
    case 'fight':
      if (extra !== undefined) return FIGHT;
      return part === 'ready' ? { mode: 'fight', overlay: 'ready' } : FIGHT;
    case 'setup':
      if (part === undefined) return { mode: 'setup', section: 'gear' };
      if (!isSetupSection(part)) return FIGHT;
      if (extra !== undefined && !(part === 'rotation' && extra === 'script')) return FIGHT;
      return { mode: 'setup', section: part };
    case 'report':
      if (part === undefined) return { mode: 'report', tab: 'damage' };
      return extra === undefined && isReportTab(part) ? { mode: 'report', tab: part } : FIGHT;
    default:
      return FIGHT;
  }
}

/** The link of a route ("#/setup/gear", "#/fight", "#/report/damage"). */
export function routeHref(route: Route): string {
  switch (route.mode) {
    case 'forever':
      return `#/forever/${route.view}`;
    case 'setup':
      return `#/setup/${route.section}`;
    case 'report':
      return `#/report/${route.tab}`;
    default:
      return route.overlay === 'ready' ? '#/fight/ready' : '#/fight';
  }
}

/** The default link of each mode (the header's mode links and the mobile tab bar). */
export const MODE_HREFS: Readonly<Record<Mode, string>> = {
  forever: routeHref({ mode: 'forever', view: 'sim' }),
  setup: routeHref({ mode: 'setup', section: 'gear' }),
  fight: routeHref({ mode: 'fight' }),
  report: routeHref({ mode: 'report', tab: 'damage' }),
};

/** The Setup sections' names in prose (titles and labels). */
export const SETUP_SECTION_TITLES: Readonly<Record<SetupSection, string>> = {
  gear: 'Gear',
  talents: 'Talents',
  buffs: 'Buffs & consumables',
  items: 'Items & cooldowns',
  rotation: 'Rotation',
  fight: 'Fight settings',
  class: 'Class options',
  scenarios: 'Scenarios',
  'combat-text': 'Combat text',
};

const SETUP_SECTION_WORDS: Readonly<Record<SetupSection, string>> = {
  gear: 'gear',
  talents: 'talents',
  buffs: 'buffs',
  items: 'items',
  rotation: 'rotation',
  fight: 'fight settings',
  class: 'class options',
  scenarios: 'scenarios',
  'combat-text': 'combat text',
};

/** The Forever views' names in the UI. */
export const FOREVER_VIEW_TITLES: Readonly<Record<ForeverView, string>> = {
  sim: 'Symulacja',
  builds: 'Buildy',
  rotations: 'Rotacje',
  compare: 'Porównanie',
  custom: 'Własny build',
  assumptions: 'Założenia',
};

/** `document.title` of a route ("Rotation Trainer: Setup, gear"). */
export function routeTitle(route: Route): string {
  switch (route.mode) {
    case 'forever':
      return `WoW Forever Simulator: ${FOREVER_VIEW_TITLES[route.view]}`;
    case 'setup':
      return `Rotation Trainer: Setup, ${SETUP_SECTION_WORDS[route.section]}`;
    case 'report':
      return `Rotation Trainer: Report, ${route.tab}`;
    default:
      return 'Rotation Trainer: Fight';
  }
}

// --- The hash as an external store ----------------------------------------------------------

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('hashchange', notify);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('hashchange', notify);
  };
}

function notify(): void {
  for (const l of [...listeners]) l();
}

const currentHash = (): string => window.location.hash;

/** Moves to a route: sets the hash (a history entry, like a link) and updates every `useRoute` at once. */
export function navigate(route: Route): void {
  const href = routeHref(route);
  if (window.location.hash !== href) window.location.hash = href;
  notify(); // the browser's `hashchange` comes later (a task); the views follow at once
}

/** The current route and `navigate`. */
export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '');
  // Parsed per render (a few string operations); the views compare routes by their fields.
  const route = parseRoute(hash);
  const go = useCallback((r: Route) => navigate(r), []);
  return [route, go];
}
