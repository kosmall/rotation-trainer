import { describe, expect, it } from 'vitest';
import { parseRoute, REPORT_TABS, routeHref, routeTitle, SETUP_SECTIONS } from '../../../src/ui/shell/router';
import type { Route } from '../../../src/ui/shell/router';

const EVERY_ROUTE: Route[] = [
  { mode: 'fight' },
  { mode: 'fight', overlay: 'ready' },
  ...SETUP_SECTIONS.map((section): Route => ({ mode: 'setup', section })),
  ...REPORT_TABS.map((tab): Route => ({ mode: 'report', tab })),
];

describe('hash router', () => {
  it('parse(serialize(route)) is the route, for every route', () => {
    expect(SETUP_SECTIONS).toEqual(['gear', 'talents', 'buffs', 'items', 'rotation', 'fight', 'class', 'scenarios', 'combat-text']);
    expect(REPORT_TABS).toEqual(['damage', 'timeline', 'log', 'rotation', 'simulator', 'compare']);
    for (const route of EVERY_ROUTE) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('serializes to "#/mode/part" links', () => {
    expect(routeHref({ mode: 'fight' })).toBe('#/fight');
    expect(routeHref({ mode: 'fight', overlay: 'ready' })).toBe('#/fight/ready');
    expect(routeHref({ mode: 'setup', section: 'combat-text' })).toBe('#/setup/combat-text');
    expect(routeHref({ mode: 'report', tab: 'simulator' })).toBe('#/report/simulator');
  });

  it('empty and unknown hashes lead to the fight', () => {
    for (const hash of ['', '#', '#/', '/', '#/nowhere', '#/setup/nowhere', '#/report/nowhere', '#/fight/nowhere', '#fight', '#/setup/gear/extra', '#/SETUP/gear']) {
      expect(parseRoute(hash)).toEqual({ mode: 'fight' });
    }
  });

  it('a mode without its part opens the default section or tab', () => {
    expect(parseRoute('#/setup')).toEqual({ mode: 'setup', section: 'gear' });
    expect(parseRoute('#/setup/')).toEqual({ mode: 'setup', section: 'gear' });
    expect(parseRoute('#/report')).toEqual({ mode: 'report', tab: 'damage' });
    expect(parseRoute('#/fight/')).toEqual({ mode: 'fight' });
  });

  it('accepts the hash with or without "#", and the rotation script deep link', () => {
    expect(parseRoute('/setup/talents')).toEqual({ mode: 'setup', section: 'talents' });
    expect(parseRoute('#/setup/rotation/script')).toEqual({ mode: 'setup', section: 'rotation' });
  });

  it('names every route for the document title', () => {
    expect(routeTitle({ mode: 'fight' })).toBe('Rotation Trainer: Fight');
    expect(routeTitle({ mode: 'setup', section: 'gear' })).toBe('Rotation Trainer: Setup, gear');
    expect(routeTitle({ mode: 'setup', section: 'combat-text' })).toBe('Rotation Trainer: Setup, combat text');
    expect(routeTitle({ mode: 'report', tab: 'damage' })).toBe('Rotation Trainer: Report, damage');
  });
});
