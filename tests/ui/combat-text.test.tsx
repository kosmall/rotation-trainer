import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { GearTables, WarlockOptions } from '../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../src/data/types';
import type { EquippedItem, LogEvent } from '../../src/engine/types';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { assignSteps, CombatTextLayer, HUD_STACK_STEPS } from '../../src/ui/CombatTextHud';
import { AppShell } from '../../src/ui/shell/AppShell';
import { TrainerProvider } from '../../src/ui/state/TrainerProvider';
import { goTo, renderApp } from './renderApp';
import { buildHudContext } from '../../src/ui/hudEvents';
import type { HudText } from '../../src/ui/hudQueue';
import { Simulation } from '../../src/engine/sim';
import { BOSS_TARGET } from '../../src/data/common/target';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { SCHOOL_COLORS } from '../../src/ui/format';
import { DEFAULT_HUD_SETTINGS, HUD_STORAGE_KEY } from '../../src/ui/hudSettings';
import type { HudSettings } from '../../src/ui/hudSettings';

// Shared with the module mocks below (hoisted above the imports by Vitest).
const h = vi.hoisted(() => ({
  /** Every Simulation built in the current test (the mock below), newest last. */
  sims: [] as { log(): readonly unknown[]; snapshot(): { damageTotal: number } }[],
  /** The seed every Simulation gets: fights in this file are deterministic whatever ran before. */
  seed: 20261030,
  /** Renders of the Fight screen's target frame wrapper: one per Fight view render. */
  targetRenders: 0,
}));

vi.mock('../../src/engine/sim', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/sim')>();
  class Simulation extends actual.Simulation {
    constructor(config: ConstructorParameters<typeof actual.Simulation>[0]) {
      super({ ...config, seed: h.seed });
      h.sims.push(this);
    }
  }
  return { ...actual, Simulation };
});

vi.mock('../../src/ui/fight/TargetFrame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/fight/TargetFrame')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    // Not memoized: renders once per render of the Fight view (as the legacy TargetPanel did per legacy layout render).
    TargetFrame: (props: Parameters<typeof actual.TargetFrame>[0]) => {
      h.targetRenders += 1;
      return createElement(actual.TargetFrame, props);
    },
  };
});

// Fake clock like game.test.tsx: requestAnimationFrame, performance.now and Date move only
// through vi.advanceTimersByTime (one frame per 16 ms).
const FAKE_NOW = 1_800_000_000_000;

function fakeClock() {
  vi.useRealTimers();
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
}

beforeEach(() => {
  h.sims = [];
  h.targetRenders = 0;
  fakeClock();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

/** Lets the lazy Setup view's import settle. */
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function press(key: string, target: Element | Window = window) {
  fireEvent.keyDown(target, { key });
}

/** An in-memory storage holding a setup and (optionally) HUD settings; `map` shows what was saved. */
function memoryStorage(setup: Partial<SetupConfig> = {}, hud?: Partial<HudSettings> | string) {
  const map = new Map<string, string>([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...setup })]]);
  if (hud !== undefined) map.set(HUD_STORAGE_KEY, typeof hud === 'string' ? hud : JSON.stringify({ ...DEFAULT_HUD_SETTINGS, ...hud }));
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

const storedHud = (map: Map<string, string>): HudSettings => JSON.parse(map.get(HUD_STORAGE_KEY) ?? 'null') as HudSettings;

/** The Destruction Warlock with Shadow Bolt's crit chance moved by `critPctDelta` (+100: always, -100: never). */
function boltCrit(critPctDelta: number) {
  return (w: WarlockOptions, gear?: readonly (EquippedItem | null)[], db?: GearTables): SpecData => {
    const spec = db === undefined ? buildDestructionWarlock(w, gear) : buildDestructionWarlock(w, gear, db);
    return { ...spec, modifiers: [...spec.modifiers, { spellIds: ['shadow-bolt'], critPctDelta }] };
  };
}
const ALWAYS_CRIT = boltCrit(100);
const NEVER_CRIT = boltCrit(-100);

const hudRoot = () => document.querySelector<HTMLElement>('.hud');
const texts = (area?: 'outgoing' | 'notifications') =>
  Array.from(document.querySelectorAll<HTMLElement>(area ? `.hud-${area} .hud-text` : '.hud-text'));
const labels = (area?: 'outgoing' | 'notifications') => texts(area).map((t) => t.textContent ?? '');
const textOf = (label: string | RegExp, area?: 'outgoing' | 'notifications') =>
  texts(area).find((t) => (typeof label === 'string' ? t.textContent === label : label.test(t.textContent ?? '')));
const fontPx = (el: HTMLElement) => Number.parseFloat(el.style.getPropertyValue('--hud-font'));
const ids = () => texts().map((t) => t.dataset.hudId);
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });

const AMOUNT = /^\d{1,3}(,\d{3})*$/;

/**
 * A Shadow Bolt (pressed at fight time 0), then Life Tap at 2.5 s, 50 ms on: Life Tap on full mana
 * gains nothing (no text), so the bolt spends some first. The bolt lands at about 3.83 s.
 */
/**
 * A rough rotation, one call per second of fight: Corruption every 12 s, Immolate every 12 s
 * (3 s later), Curse of Agony every 24 s, Life Tap every 7 s, Shadow Bolt otherwise (pressed
 * early is queued or rejected; either is fine). Plenty of hits, crits, ticks, mana and buffs.
 */
function rotationKeys(second: number): string[] {
  if (second % 24 === 6) return ['9'];
  if (second % 12 === 0) return ['3'];
  if (second % 12 === 3) return ['2'];
  if (second % 7 === 6) return ['6'];
  return ['1'];
}

function boltThenLifeTap() {
  press('1');
  advance(2500);
  press('6');
  advance(50);
}

/** Opens Setup, Combat text (the lazy Setup view settles); returns the settings card. */
async function openCombatText(): Promise<HTMLElement> {
  goTo('#/setup/combat-text');
  await settle();
  return screen.getByRole('group', { name: 'Combat text settings' });
}

async function readFightCss(): Promise<string> {
  const nodeFs = 'node:' + 'fs';
  const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
  const testFile = decodeURIComponent(new URL(import.meta.url).pathname);
  return fs.readFileSync(testFile.replace(/tests\/ui\/[^/]+$/, 'src/ui/fight/fight.css'), 'utf8');
}

async function readCss(): Promise<string> {
  // Vitest serves stylesheets empty, so the file is read from disk (as player-buffs.test.tsx does).
  const nodeFs = 'node:' + 'fs';
  const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: string, encoding: 'utf8'): string };
  const testFile = decodeURIComponent(new URL(import.meta.url).pathname);
  return fs.readFileSync(testFile.replace(/tests\/ui\/[^/]+$/, 'src/ui/game.css'), 'utf8');
}

describe('Combat text HUD: texts in the fight', () => {
  it('casting Shadow Bolt shows its damage text in the outgoing area with the school colour and icon', () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage, buildSpec: NEVER_CRIT });
    press('1');
    advance(3500);
    expect(texts()).toHaveLength(0); // still in flight (cast ends 2431, lands 3831 at 28 yd)
    advance(500);
    const hit = texts('outgoing');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.textContent).toMatch(AMOUNT);
    expect(hit[0]!.classList.contains('hud-damage')).toBe(true);
    expect(hit[0]!.style.getPropertyValue('--hud-color')).toBe(SCHOOL_COLORS.shadow);
    expect(fontPx(hit[0]!)).toBe(DEFAULT_HUD_SETTINGS.fontPx);
    expect(hit[0]!.querySelector('img')?.getAttribute('src')).toContain('icons/spells/');
    expect(texts('notifications')).toHaveLength(0);
  });

  it("a crit shows the larger '!' text", () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage, buildSpec: ALWAYS_CRIT });
    press('1');
    advance(4000);
    const crit = textOf(/!$/, 'outgoing');
    expect(crit).toBeTruthy();
    expect(crit!.textContent).toMatch(/^\d{1,3}(,\d{3})*!$/);
    expect(crit!.classList.contains('hud-crit')).toBe(true);
    expect(fontPx(crit!)).toBe(Math.round(DEFAULT_HUD_SETTINGS.fontPx * DEFAULT_HUD_SETTINGS.critScale));
  });

  it('a DoT tick shows a smaller, lighter text in the DoT school colour', () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    press('3'); // Corruption
    let tick: HTMLElement | undefined;
    for (let i = 0; i < 100 && !tick; i++) {
      advance(100);
      tick = texts('outgoing').find((t) => t.classList.contains('hud-tick'));
    }
    expect(tick).toBeTruthy();
    expect(tick!.textContent).toMatch(AMOUNT);
    expect(fontPx(tick!)).toBeLessThan(DEFAULT_HUD_SETTINGS.fontPx);
    expect(tick!.style.getPropertyValue('--hud-color')).toBe(SCHOOL_COLORS.shadow);
  });

  it("Heroism enabled at 6 s shows '+Heroism / Bloodlust' at 6 s and '-Heroism / Bloodlust' at its end", () => {
    const { storage } = memoryStorage({ enabledBuffs: ['heroism'], timed: { heroism: { startSec: 6, durationSec: 40 } } });
    renderApp({ route: '#/fight', storage });
    press(' ');
    advance(5900);
    expect(textOf('+Heroism / Bloodlust')).toBeUndefined();
    advance(200);
    const on = textOf('+Heroism / Bloodlust', 'notifications');
    expect(on).toBeTruthy();
    expect(on!.classList.contains('hud-buff-on')).toBe(true);
    advance(46000 - 6100 - 100);
    expect(textOf('-Heroism / Bloodlust')).toBeUndefined();
    advance(200);
    expect(textOf('-Heroism / Bloodlust', 'notifications')?.classList.contains('hud-buff-off')).toBe(true);
  });

  it('an item use shows its name (with its buff)', () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion'] });
    renderApp({ route: '#/fight', storage });
    press('x'); // the potion (Z is the worn Icon, always on the item row)
    advance(50);
    expect(textOf('Destruction Potion', 'notifications')?.classList.contains('hud-item')).toBe(true);
    expect(textOf('+Destruction Potion', 'notifications')).toBeTruthy();
  });

  it('texts born together start on different steps (never on top of each other)', () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion', 'item:29370'] });
    renderApp({ route: '#/fight', storage });
    press('z');
    press('x');
    advance(50);
    const notes = texts('notifications');
    expect(notes.map((t) => t.textContent).sort()).toEqual(
      ['+Destruction Potion', '+Icon of the Silver Crescent', 'Destruction Potion', 'Icon of the Silver Crescent'].sort(),
    );
    const steps = notes.map((t) => t.style.getPropertyValue('--hud-step'));
    expect(new Set(steps).size).toBe(4);
    // Item icons come from the item icon folder.
    expect(textOf('Icon of the Silver Crescent')!.querySelector('img')?.getAttribute('src')).toContain('icons/items/');
  });

  it("Life Tap shows '+N Mana'", () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    boltThenLifeTap();
    const mana = textOf(/Mana$/, 'notifications');
    expect(mana?.textContent).toMatch(/^\+\d{1,3}(,\d{3})* Mana$/);
    expect(mana!.classList.contains('hud-mana')).toBe(true);
  });

  it('texts disappear after durationMs and the DOM never holds more than maxTexts', async () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion'] }, { maxTexts: 4, durationMs: 1000, minDamage: 0 });
    renderApp({ route: '#/fight', storage });
    press('x'); // "Destruction Potion" and "+Destruction Potion" (Z is the worn Icon)
    advance(50);
    const first = ids();
    expect(first.length).toBeGreaterThan(0);
    expect(hudRoot()!.querySelector<HTMLElement>(".hud-text")!.style.animationDuration).toBe('1000ms');
    advance(1000);
    for (const id of first) expect(ids()).not.toContain(id);

    // Longer lives (changed in the panel on the Setup screen; the fight pauses there and the
    // first key back on the Fight screen resumes it): the cap is what limits the texts now.
    goTo('#/setup/combat-text');
    await settle();
    const duration = screen.getByLabelText('Text duration (ms)');
    fireEvent.change(duration, { target: { value: '4000' } });
    fireEvent.blur(duration);
    goTo('#/fight');

    let most = 0;
    for (let i = 0; i < 240; i++) {
      if (i % 4 === 0) for (const key of rotationKeys(i / 4)) press(key);
      advance(250);
      most = Math.max(most, texts().length);
      expect(texts().length).toBeLessThanOrEqual(4);
    }
    expect(most).toBe(4); // the cap was reached
  });

  it('the HUD is decorative: aria-hidden, no pointer events (stylesheet), reduced motion removes the movement', async () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    const root = hudRoot();
    expect(root).not.toBeNull();
    expect(root!.getAttribute('aria-hidden')).toBe('true');
    expect(root!.closest('.fv-arena')).not.toBeNull(); // inside the arena
    const css = await readCss();
    expect(css).toMatch(/\.hud \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.hud-text \{[^}]*animation-name: hud-rise/);
    expect(css).toMatch(/\.hud-parabola \.hud-text \{[^}]*animation-name: hud-arc/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)?.join('\n') ?? '';
    expect(reduced).toMatch(/\.hud-text[^{]*\{[^}]*animation-name: hud-fade/);
    expect(reduced).toMatch(/\.hud-crit \.hud-inner[^{]*\{[^}]*animation: none/);
    // hud-fade only fades: no transform in its keyframes.
    const fade = css.match(/@keyframes hud-fade \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(fade).toMatch(/opacity/);
    expect(fade).not.toMatch(/transform/);
  });

  it('disabling the HUD stops every text; disabling a category stops exactly its texts', () => {
    const off = memoryStorage({}, { enabled: false });
    renderApp({ route: '#/fight', storage: off.storage, buildSpec: NEVER_CRIT });
    boltThenLifeTap();
    advance(1500);
    expect(hudRoot()).toBeNull();
    cleanup();

    const noDamage = memoryStorage({}, { damage: false });
    renderApp({ route: '#/fight', storage: noDamage.storage, buildSpec: NEVER_CRIT });
    boltThenLifeTap();
    expect(textOf(/Mana$/)).toBeTruthy(); // mana still on
    advance(1500); // the bolt has landed
    expect(texts('outgoing')).toHaveLength(0);
    cleanup();

    const noCrits = memoryStorage({}, { crits: false });
    renderApp({ route: '#/fight', storage: noCrits.storage, buildSpec: ALWAYS_CRIT });
    boltThenLifeTap();
    expect(textOf(/Mana$/)).toBeTruthy(); // mana still on
    advance(1500);
    expect(texts('outgoing')).toHaveLength(0);
    cleanup();

    const noMana = memoryStorage({}, { mana: false });
    renderApp({ route: '#/fight', storage: noMana.storage, buildSpec: ALWAYS_CRIT });
    boltThenLifeTap();
    expect(textOf(/Mana$/)).toBeUndefined();
    advance(1500);
    expect(textOf(/!$/, 'outgoing')).toBeTruthy(); // crits still on
  });

  it('reset (R) clears all texts', () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion'] });
    renderApp({ route: '#/fight', storage });
    boltThenLifeTap();
    press('x'); // the potion (Z is the worn Icon, always on the item row)
    advance(50);
    expect(labels()).toHaveLength(3);
    expect(labels()).toEqual(expect.arrayContaining(['+Destruction Potion', 'Destruction Potion', expect.stringMatching(/^\+[\d,]+ Mana$/)]));
    press('r');
    expect(texts()).toHaveLength(0);
    // The next fight starts from its own log: its first texts are its own, nothing replayed.
    press('x'); // the potion (Z is the worn Icon, always on the item row)
    advance(50);
    expect(labels().sort()).toEqual(['+Destruction Potion', 'Destruction Potion']);
  });

  it('a setup change that rebuilds a fight not started yet starts the HUD over (no texts, nothing replayed)', async () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion'] });
    renderApp({ route: '#/fight', storage });
    boltThenLifeTap();
    press('r'); // ready again
    // Change the setup (fight length) while ready, on the Setup screen: the fight is rebuilt at once.
    goTo('#/setup/fight');
    await settle();
    const length = screen.getByLabelText('Fight length (s)');
    fireEvent.change(length, { target: { value: '90' } });
    fireEvent.blur(length);
    goTo('#/fight');
    expect(texts()).toHaveLength(0);
    press('x'); // the potion (Z is the worn Icon, always on the item row)
    advance(50);
    expect(labels().sort()).toEqual(['+Destruction Potion', 'Destruction Potion']);
  });

  it('the end of the fight leaves no new texts; the ones up finish and go', () => {
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion'] });
    renderApp({ route: '#/fight', storage });
    press(' ');
    advance(59_400);
    press('x'); // the potion at 59.4 s (Z is the worn Icon): its texts are up at the end
    advance(50);
    expect(textOf('Destruction Potion')).toBeTruthy();
    advance(1000); // the fight ends at 60 s
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    const atEnd = ids();
    expect(atEnd.length).toBeGreaterThan(0);
    advance(5000);
    expect(ids()).toEqual(atEnd); // nothing new
    // In a browser each text goes when its CSS animation ends.
    for (const el of texts()) fireEvent.animationEnd(el);
    expect(texts()).toHaveLength(0);
    advance(2000);
    expect(texts()).toHaveLength(0);
  });

  it('a text whose animation ended is gone for good (not shown again while the fight runs)', () => {
    renderApp({ route: '#/fight', storage: memoryStorage({ enabledBuffs: ['destruction-potion'] }).storage });
    press('x'); // the potion (Z is the worn Icon)
    advance(50);
    const [first, second] = texts();
    fireEvent.animationEnd(first!);
    expect(texts()).toEqual([second]);
    fireEvent.animationEnd(second!.querySelector('.hud-inner')!); // the crit pop bubbling up: not the text's own end
    expect(texts()).toEqual([second]);
    fireEvent.animationEnd(second!);
    advance(100);
    expect(texts()).toHaveLength(0);
  });
});

describe('Combat text HUD: fixes after review', () => {
  const text = (id: number, bornMs: number, p: Partial<HudText> = {}): HudText => ({
    id,
    atMs: bornMs,
    area: 'notifications',
    kind: 'buff-on',
    text: `t${id}`,
    color: '#fff',
    sticky: false,
    lane: id % 3,
    bornMs,
    expiresAtMs: bornMs + 1600,
    ...p,
  });

  it('M1: texts born in one frame start on different steps (up to HUD_STACK_STEPS)', () => {
    const five = [0, 1, 2, 3, 4].map((i) => text(i, 1000));
    const steps = assignSteps(five, new Map(), 16);
    expect(new Set(five.map((t) => steps.get(t.id))).size).toBe(5);
    expect(HUD_STACK_STEPS).toBeGreaterThanOrEqual(6);
    const six = [0, 1, 2, 3, 4, 5].map((i) => text(i, 1000));
    expect(new Set(six.map((t) => assignSteps(six, new Map(), 16).get(t.id))).size).toBe(6);
  });

  it('M1: a text born 50-500 ms after another does not start on top of the risen one', () => {
    for (const dt of [50, 150, 300, 450]) {
      const memory = new Map<number, number>();
      const older = text(1, 1000);
      assignSteps([older], memory, 16);
      const newer = text(2, 1000 + dt);
      const steps = assignSteps([older, newer], memory, 16);
      // The older one has risen dt / 1600 of 72 px, in lines of 1.25 x 16 px.
      const olderNow = (dt / 1600) * (72 / 20);
      expect(Math.abs(steps.get(2)! - olderNow), `dt ${dt}`).toBeGreaterThanOrEqual(1);
    }
    // Long enough after: the start is free again.
    const memory = new Map<number, number>();
    assignSteps([text(1, 1000)], memory, 16);
    expect(assignSteps([text(1, 1000), text(2, 1600)], memory, 16).get(2)).toBe(0);
    // A step, once given, stays when the older text goes.
    expect(assignSteps([text(2, 1600)], memory, 16).get(2)).toBe(0);
  });

  it('M1: Heroism at 0, the Icon and the potion together: five notifications, five different steps', () => {
    const { storage } = memoryStorage({
      enabledBuffs: ['heroism', 'destruction-potion', 'item:29370'],
      timed: { heroism: { startSec: 0, durationSec: 40 } },
    });
    renderApp({ route: '#/fight', storage });
    press('z');
    press('x');
    advance(50);
    const notes = texts('notifications');
    expect(notes).toHaveLength(5);
    expect(new Set(notes.map((t) => t.style.getPropertyValue('--hud-step'))).size).toBe(5);
  });

  it("M2: an entry logged in the frame that ends the fight is read once (Curse of Doom's tick at 60 s)", () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    press('0'); // Curse of Doom: one tick, 60 s later
    advance(59_900);
    expect(texts('outgoing').filter((t) => t.classList.contains('hud-tick'))).toHaveLength(0);
    advance(300);
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    const ticks = texts('outgoing').filter((t) => t.classList.contains('hud-tick'));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.textContent).toMatch(AMOUNT);
    const atEnd = ids();
    advance(3000);
    expect(ids()).toEqual(atEnd); // read once, nothing after
  });

  it('M3: after a backgrounded tab the catch-up frame shows only events young enough to be on screen', () => {
    const sim = new Simulation({ spec: destructionWarlock, target: BOSS_TARGET, seed: 7, spellQueueWindowMs: 400, distanceFromTarget: 0, scheduledAuras: [], durationMs: 60000 });
    sim.start();
    for (let t = 0; t <= 30_000; t += 100) {
      sim.cast('shadow-bolt');
      sim.advanceTo(t);
    }
    const snapshot = sim.snapshot();
    expect(snapshot.phase).toBe('running');
    const context = buildHudContext({ spells: destructionWarlock.spells, auras: destructionWarlock.auras });
    const settings = { ...DEFAULT_HUD_SETTINGS, maxTexts: 60 };
    const recent = sim.log().filter((e) => (e.type === 'damage' || e.type === 'miss') && e.atMs >= 30_000 - settings.durationMs);
    expect(sim.log().filter((e) => e.type === 'damage').length).toBeGreaterThan(recent.length + 5);
    // One frame after 30 s without any: the whole log arrives at once.
    render(<CombatTextLayer snapshot={snapshot} fightId={1} logSince={(i) => sim.logSince(i)} context={context} settings={settings} />);
    expect(texts()).toHaveLength(recent.length);
  });

  it('M5: the notifications and the outgoing texts are two zones of their own in the arena (clear of the target frame)', async () => {
    // The redesign gives each area its own grid cell: notifications left of the target ring,
    // outgoing right of it (spec §5.2), held against the ring; the unit frames (with their aura
    // rows) and the bars are rows of their own below, so they never overlap the texts.
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    const arena = document.querySelector('.fv-arena') as HTMLElement;
    const notes = arena.querySelector('.hud > .hud-notifications');
    const outgoing = arena.querySelector('.hud > .hud-outgoing');
    expect(notes).not.toBeNull();
    expect(outgoing).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Target' }).contains(notes)).toBe(false);
    cleanup();
    renderApp({ route: '#/fight', storage: memoryStorage({}, { enabled: false }).storage });
    expect(document.querySelector('.fv-arena .hud')).toBeNull();
    const css = await readFightCss();
    expect(css).toMatch(/\.fv-arena > \.hud \{[^}]*display: contents/);
    expect(css).toMatch(/\.fv-arena > \.hud > \.hud-notifications \{[^}]*grid-area: notes/);
    expect(css).toMatch(/\.fv-arena > \.hud > \.hud-outgoing \{[^}]*grid-area: outgoing/);
    expect(css).toMatch(/'notes world outgoing'\s*'units units units'\s*'bars bars bars'/);
    expect(css).toMatch(/\.fv-arena > \.hud > \.hud-notifications \{[^}]*justify-self: end/);
    expect(css).toMatch(/\.fv-arena > \.hud > \.hud-outgoing \{[^}]*justify-self: start/);
    expect(css).toMatch(/\.fv-units \{[^}]*grid-area: units/);
  });

  it('M6: light theme darkens the colours with a white outline, dark theme lightens them with a black one', async () => {
    // The arena is always dark (both app themes): its texts take the dark values.
    const fightCss = await readFightCss();
    expect(fightCss).toMatch(/\.fv-arena > \.hud \{[^}]*--hud-tint: 65%;[^}]*--hud-tint-with: #fff;[^}]*--hud-outline: #000;/);
    const css = await readCss();
    expect(css).toMatch(/\.hud \{[^}]*--hud-tint: 62%;[^}]*--hud-tint-with: #000;[^}]*--hud-outline: #fff;/);
    const dark = css.match(/@media \(prefers-color-scheme: dark\) \{\s*\.hud \{([^}]*)\}/)?.[1] ?? '';
    expect(dark).toMatch(/--hud-tint: 65%;[^]*--hud-tint-with: #fff;[^]*--hud-outline: #000;/);
    expect(css).toMatch(/\.hud-text \{[^}]*color-mix\(in srgb, var\(--hud-color\) var\(--hud-tint\), var\(--hud-tint-with\)\)/);
  });
});

describe('Combat text HUD: it only reads the fight', () => {
  /** Plays a fixed 30 s sequence and returns the fight's log and damage. */
  function play(hud: Partial<HudSettings>) {
    fakeClock(); // the same clock (and frame times) for every run
    const { storage } = memoryStorage({ enabledBuffs: ['destruction-potion', 'heroism'], fightDurationSec: 30 }, hud);
    const commits = { n: 0 };
    window.location.hash = '#/fight';
    const view = render(
      <Profiler id="game" onRender={() => void (commits.n += 1)}>
        <TrainerProvider storage={storage}>
          <AppShell />
        </TrainerProvider>
      </Profiler>,
    );
    const timers: number[] = [];
    press('z');
    for (let i = 0; i < 31; i++) {
      for (const key of rotationKeys(i)) press(key);
      advance(1000);
      timers.push(vi.getTimerCount());
    }
    const sim = h.sims[h.sims.length - 1]!;
    const result = { log: JSON.stringify(sim.log()), damage: sim.snapshot().damageTotal, timers, renders: h.targetRenders, commits: commits.n };
    view.unmount();
    h.targetRenders = 0;
    return result;
  }

  it('HUD on and off give identical simulation results (log and damage totals)', () => {
    const on = play({});
    const off = play({ enabled: false });
    expect(on.damage).toBeGreaterThan(0);
    expect(on.log).toBe(off.log);
    expect(on.damage).toBe(off.damage);
    expect((JSON.parse(on.log) as LogEvent[]).length).toBeGreaterThan(50);
  });

  it('no extra timers (vi.getTimerCount unchanged vs HUD off) and no Fight view render per text', () => {
    const on = play({});
    const off = play({ enabled: false });
    expect(on.timers.join(' ')).toBe(off.timers.join(' '));
    // The Fight view (its target frame) renders once per frame either way: the texts never re-render it.
    expect(on.renders).toBe(off.renders);
    // The HUD adds at most one commit of its own per frame.
    expect(on.commits).toBeLessThanOrEqual(off.commits * 2);
  });

  it('a 300 s fight with many events stays under the cap and keeps the UI responsive', () => {
    const { storage } = memoryStorage(
      { enabledBuffs: ['destruction-potion', 'heroism', 'super-mana-potion', 'dark-rune'], fightDurationSec: 300 },
      { maxTexts: 8, durationMs: 4000, targetDebuffs: true },
    );
    let frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames += 1;
      return raf(cb);
    });
    renderApp({ route: '#/fight', storage });
    const started = Date.now();
    let most = 0;
    for (let s = 0; s < 301; s++) {
      for (const key of [...(s % 60 === 0 ? ['z', 'x', 'c'] : []), ...rotationKeys(s)]) press(key);
      advance(1000);
      most = Math.max(most, texts().length);
      expect(texts().length).toBeLessThanOrEqual(8);
    }
    spy.mockRestore();
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    expect(most).toBe(8);
    // One frame per 16 ms of fight time (plus one per key press that restarts nothing): no extra loop.
    expect(frames).toBeLessThanOrEqual(Math.ceil(300_000 / 16) + 10);
    expect(Date.now() - started).toBe(301_000); // fake clock: only the advances moved it
  }, 30_000);
});

describe('Combat text settings panel', () => {
  const open = openCombatText;
  const CHECKBOXES: [string, keyof HudSettings][] = [
    ['Show combat text', 'enabled'],
    ['Damage', 'damage'],
    ['Crits', 'crits'],
    ['DoT ticks', 'ticks'],
    ['Misses', 'misses'],
    ['Buffs gained', 'buffsOn'],
    ['Buffs faded', 'buffsOff'],
    ['Procs', 'procs'],
    ['Debuffs on the target', 'targetDebuffs'],
    ['Mana gains', 'mana'],
    ['Item use', 'itemUse'],
    ['Cooldown ready', 'cooldownReady'],
    ['Low mana', 'lowMana'],
    ['Spell icons', 'showIcons'],
    ['Spell names', 'showSpellNames'],
  ];
  const NUMBERS: [string, keyof HudSettings, number, number][] = [
    ['Text duration (ms)', 'durationMs', 600, 4000],
    ['Font size (px)', 'fontPx', 10, 32],
    ['Crit size (x)', 'critScale', 1, 2.5],
    ['Minimum damage', 'minDamage', 0, 100000],
    ['Merge DoT ticks within (ms)', 'mergeTicks', 0, 2000],
    ['Merge mana gains below', 'mergeManaBelow', 0, 10000],
    ['Most texts at once', 'maxTexts', 4, 60],
    ['Low mana below (%)', 'lowManaPct', 5, 80],
  ];

  it('is the Setup screen\'s Interface, Combat text section (no settings form on the Fight screen)', async () => {
    renderApp({ route: '#/fight', storage: memoryStorage().storage });
    expect(screen.queryByLabelText('Damage')).toBeNull(); // the Fight screen has only the dock's quick switch
    const card = await open();
    expect(within(card).getByLabelText('Damage')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Combat text');
    const link = within(screen.getByRole('navigation', { name: 'Setup sections' })).getByRole('link', { name: /^Combat text/ });
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('every checkbox switches its setting, shown and saved', async () => {
    const { storage, map } = memoryStorage();
    renderApp({ storage });
    await open();
    for (const [label, key] of CHECKBOXES) {
      const box = screen.getByLabelText(label) as HTMLInputElement;
      expect(box.checked, label).toBe(DEFAULT_HUD_SETTINGS[key]);
      fireEvent.click(box);
      expect((screen.getByLabelText(label) as HTMLInputElement).checked, label).toBe(!DEFAULT_HUD_SETTINGS[key]);
      expect(storedHud(map)[key], label).toBe(!DEFAULT_HUD_SETTINGS[key]);
    }
  });

  it('the animation select offers Straight and Parabola and is saved', async () => {
    const { storage, map } = memoryStorage();
    renderApp({ storage });
    await open();
    const select = screen.getByLabelText('Animation') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Straight up', 'Parabola']);
    fireEvent.change(select, { target: { value: 'parabola' } });
    expect(storedHud(map).animation).toBe('parabola');
    goTo('#/fight');
    expect(hudRoot()!.classList.contains('hud-parabola')).toBe(true);
  });

  it('number inputs take values in range at once and clamp on blur', async () => {
    const { storage, map } = memoryStorage();
    renderApp({ storage });
    await open();
    for (const [label, key, min, max] of NUMBERS) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(Number(input.value), label).toBe(DEFAULT_HUD_SETTINGS[key]);
      const inRange = key === 'critScale' ? 2 : min + 1;
      fireEvent.change(input, { target: { value: String(inRange) } });
      expect(storedHud(map)[key], label).toBe(inRange);
      fireEvent.change(input, { target: { value: String(max * 10) } });
      expect(input.value, label).toBe(String(max * 10)); // kept while typing
      expect(storedHud(map)[key], label).toBe(inRange);
      fireEvent.blur(input);
      expect(Number((screen.getByLabelText(label) as HTMLInputElement).value), label).toBe(max);
      expect(storedHud(map)[key], label).toBe(max);
      fireEvent.change(input, { target: { value: String(min - 1) } });
      fireEvent.blur(input);
      expect(storedHud(map)[key], label).toBe(min);
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);
      expect(Number((screen.getByLabelText(label) as HTMLInputElement).value), label).toBe(min); // empty: unchanged
    }
  });

  it('Reset to defaults restores every setting', async () => {
    const { storage, map } = memoryStorage({}, { fontPx: 30, crits: false, animation: 'parabola' });
    renderApp({ storage });
    const details = await open();
    expect((screen.getByLabelText('Font size (px)') as HTMLInputElement).value).toBe('30');
    fireEvent.click(within(details).getByRole('button', { name: 'Reset combat text to defaults' }));
    expect(storedHud(map)).toEqual(DEFAULT_HUD_SETTINGS);
    expect((screen.getByLabelText('Font size (px)') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText('Crits') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Animation') as HTMLSelectElement).value).toBe('straight');
  });

  it('settings are saved and restored on the next mount (their own key, not the setup)', async () => {
    const { storage, map } = memoryStorage();
    const setupBefore = map.get(SETUP_STORAGE_KEY);
    const first = renderApp({ storage });
    await open();
    fireEvent.click(screen.getByLabelText('Misses'));
    fireEvent.change(screen.getByLabelText('Most texts at once'), { target: { value: '9' } });
    first.unmount();
    expect(map.get(SETUP_STORAGE_KEY)).toBe(setupBefore);
    renderApp({ storage });
    await open();
    expect((screen.getByLabelText('Misses') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Most texts at once') as HTMLInputElement).value).toBe('9');
  });

  it('corrupt stored settings fall back to defaults; a throwing storage still works', async () => {
    const corrupt = memoryStorage({}, '{"fontPx": "huge", "enabled": 7, "__proto__": {"enabled": false}');
    renderApp({ storage: corrupt.storage });
    await open();
    expect((screen.getByLabelText('Font size (px)') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText('Show combat text') as HTMLInputElement).checked).toBe(true);
    cleanup();

    const throwing: SetupStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    renderApp({ storage: throwing });
    await open();
    fireEvent.click(screen.getByLabelText('Damage'));
    expect((screen.getByLabelText('Damage') as HTMLInputElement).checked).toBe(false);
    goTo('#/fight');
    boltThenLifeTap();
    expect(textOf(/Mana$/)).toBeTruthy();
  });

  it('typing in the settings inputs never triggers hotkeys (the fight keys belong to the Fight screen)', async () => {
    renderApp({ storage: memoryStorage().storage });
    await open();
    const input = screen.getByLabelText('Font size (px)');
    const select = screen.getByLabelText('Animation');
    const box = screen.getByLabelText('Misses');
    for (const target of [input, select, box]) {
      target.focus();
      for (const key of ['1', '6', ' ', 'z', 'r', 'Escape']) press(key, target);
    }
    goTo('#/fight');
    expect(castBar()).toBeNull();
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
    // On the Fight screen the keys work again.
    press('1');
    expect(castBar()).not.toBeNull();
  });

  it('works while a fight is running: a change applies to the next texts', async () => {
    const { storage } = memoryStorage({}, {});
    renderApp({ storage, buildSpec: NEVER_CRIT });
    press('1');
    advance(1000);
    await open(); // the fight pauses while the Setup screen is shown
    fireEvent.click(screen.getByLabelText('Spell names'));
    fireEvent.change(screen.getByLabelText('Font size (px)'), { target: { value: '20' } });
    goTo('#/fight');
    press(' '); // resumes from the same fight time
    advance(3000); // the bolt lands at about 3.83 s
    const hit = texts('outgoing')[0]!;
    expect(hit.textContent).toMatch(/^Shadow Bolt \d{1,3}(,\d{3})*$/);
    expect(fontPx(hit)).toBe(20);
    await open();
    fireEvent.click(screen.getByLabelText('Show combat text'));
    goTo('#/fight');
    expect(hudRoot()).toBeNull();
    expect(within(screen.getByRole('toolbar', { name: 'Action bar' })).getAllByRole('button').length).toBeGreaterThan(0);
  });
});
