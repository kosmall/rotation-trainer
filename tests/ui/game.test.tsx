import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { warlockSets } from '../../src/data/classes/warlock/sets';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET, DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
import { Simulation } from '../../src/engine/sim';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { Bars } from '../../src/ui/fight/Bars';
import { renderApp } from './renderApp';
import { SetBonusList } from '../../src/ui/SetBonusList';

// Fake clock: requestAnimationFrame, performance.now and Date all move only through
// vi.advanceTimersByTime. The seed is Date.now()-based, so a fixed start time makes every
// fight in these tests deterministic.
const FAKE_NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({
    now: FAKE_NOW,
    toFake: [
      'Date',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key, ...init });
}

const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: /^start the fight$/i });
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));
const totalDamage = () => amount(screen.getByLabelText('Total damage'));

describe('Fight screen (#/fight)', () => {
  it('pressing "1" on the Fight screen casts the spell bound to slot 0', () => {
    renderApp({ route: '#/fight' });
    expect(destructionWarlock.keybinds[0]).toBe('shadow-bolt');
    expect(castBar()).toBeNull();

    press('1');
    expect(castBar()).not.toBeNull();
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    expect(startOverlay()).toBeNull();

    advance(3000);
    expect(castBar()).toBeNull();
    // At the default 28 yd the bolt (cast ends 2431) is still in flight until 3831.
    expect(totalDamage()).toBe(0);
    expect(screen.getByLabelText('Elapsed').textContent).toBe('0:03.0 / 1:00');
    advance(1000);
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('Esc during a cast removes the cast bar and logs cast-cancel', () => {
    renderApp({ route: '#/fight' });
    press('1');
    advance(500);
    expect(castBar()).not.toBeNull();

    press('Escape');
    expect(castBar()).toBeNull();
    // A cancelled cast never lands: no damage even after its cast time.
    advance(3000);
    expect(totalDamage()).toBe(0);
  });

  it('Space before the fight hides the start overlay', () => {
    renderApp({ route: '#/fight' });
    expect(screen.getByRole('heading', { name: /^ready when you are$/i })).toBeTruthy();
    expect(startOverlay()).not.toBeNull();

    press(' ');
    expect(startOverlay()).toBeNull();
    advance(1000);
    expect(screen.getByLabelText('Elapsed').textContent).toBe('0:01.0 / 1:00');
  });

  it('after 60 s the end summary shows total damage and DPS; Reset starts over', () => {
    renderApp({ route: '#/fight' });
    press('1');
    advance(61000);

    const summary = screen.getByRole('region', { name: 'Fight summary' });
    const damage = amount(within(summary).getByLabelText('Total damage'));
    const dps = amount(within(summary).getByLabelText('DPS'));
    expect(damage).toBeGreaterThan(0);
    expect(dps).toBeCloseTo(damage / 60, 0);
    expect(within(summary).getByLabelText('Duration').textContent).toBe('60.0 s');
    expect(screen.getByLabelText('Elapsed').textContent).toBe('1:00.0 / 1:00');

    fireEvent.click(within(summary).getByRole('button', { name: 'Reset' }));
    expect(screen.queryByRole('region', { name: 'Fight summary' })).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(totalDamage()).toBe(0);
  });

  it('the live stats and the end summary both say what the DPS leaves out', () => {
    const note = 'No raid buffs, consumables or trinket effects — approximate (see docs/data-sources.md)';
    renderApp({ route: '#/fight' });
    expect(screen.getAllByText(note)).toHaveLength(1); // under the live stats, before the fight
    press('1');
    advance(61000);
    const summary = screen.getByRole('region', { name: 'Fight summary' });
    expect(within(summary).getByText(note)).toBeTruthy();
    expect(screen.getAllByText(note)).toHaveLength(2); // live stats + summary
  });

  it('the live DPS and the summary DPS use one format (one decimal, thousands separators)', () => {
    renderApp({ route: '#/fight' });
    press('1');
    advance(61000);
    const texts = screen.getAllByLabelText('DPS').map((el) => el.textContent);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toMatch(/^\d{1,3}(,\d{3})*\.\d$/);
  });

  it('R resets a running fight', () => {
    renderApp({ route: '#/fight' });
    press('1');
    advance(1000);
    press('r');
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(screen.getByLabelText('Elapsed').textContent).toBe('0:00.0 / 1:00');
  });

  it('key auto-repeat is ignored', () => {
    renderApp({ route: '#/fight' });
    press('1', { repeat: true });
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
  });

  it('the empty slot 8 does nothing', () => {
    renderApp({ route: '#/fight' });
    expect(destructionWarlock.keybinds[7]).toBe('');
    expect(screen.queryByRole('button', { name: /\(8\)$/ })).toBeNull();
    expect(screen.getByLabelText('Empty slot (8)')).toBeTruthy();

    press('8');
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a rejected press shows the reason on the slot', () => {
    renderApp({ route: '#/fight' });
    press('1');
    press('1'); // Shadow Bolt is still being cast, beyond the spell queue window
    const flash = screen.getByRole('status');
    expect(flash.textContent).toBe('Busy');
    const slot = screen.getByRole('button', { name: 'Shadow Bolt (1)' });
    expect(slot.contains(flash)).toBe(true);

    advance(1000);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('an accepted press of a flashing slot clears its rejection flash', () => {
    renderApp({ route: '#/fight' });
    const castMs = freshSim().snapshot().spells['shadow-bolt']?.castTimeMs ?? 0;
    // Busy at 1800 (cast end beyond the queue window), queued at 2100 (within it).
    expect(castMs - 1800).toBeGreaterThan(SPELL_QUEUE_WINDOW_MS);
    expect(castMs - 2100).toBeLessThanOrEqual(SPELL_QUEUE_WINDOW_MS);
    press('1');
    advance(1800);
    press('1');
    expect(screen.getByRole('status').textContent).toBe('Busy');
    advance(300);
    press('1');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the tooltip shows the effective (talented, hasted) cast time and cost', () => {
    renderApp({ route: '#/fight' });
    const { castTimeMs, manaCost } = freshSim().snapshot().spells['shadow-bolt'] ?? { castTimeMs: 0, manaCost: 0 };
    expect(castTimeMs).toBeLessThan(2500); // Bane and gear haste, from the 3000 ms base
    const title = screen.getByRole('button', { name: 'Shadow Bolt (1)' }).getAttribute('title') ?? '';
    expect(title).toContain('2.4 s cast');
    expect(title).not.toContain('3.0');
    expect(title).toContain(`${Math.round(manaCost)} mana`);
    expect(title).not.toContain('420');
    expect(screen.getByRole('button', { name: 'Life Tap (6)' }).getAttribute('title')).toContain('Instant');
  });

  it('clicking a slot casts its spell', () => {
    renderApp({ route: '#/fight' });
    fireEvent.click(screen.getByRole('button', { name: 'Immolate (2)' }));
    expect(castBar()?.textContent).toContain('Immolate');
  });
});

/** A Simulation like the UI's, for reading effective values. */
function freshSim() {
  return new Simulation({
    spec: destructionWarlock,
    target: BOSS_TARGET,
    seed: 1,
    spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
    distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD,
  });
}

// The legacy ActionBar's unit test, on the Fight screen's bars (the legacy component was removed
// with the legacy layout, redesign Task 5): `slot-oom` became the `fv-slot-nomana` state.
describe('Action bar (Bars)', () => {
  it('tints a slot out of mana only when mana is below the effective cost', () => {
    const base = freshSim().snapshot();
    const cost = base.spells['shadow-bolt']?.manaCost ?? 0;
    expect(cost).toBeLessThan(410); // 420 base, Cataclysm 0.95
    const slot = () => screen.getByRole('button', { name: 'Shadow Bolt (1)' });
    const show = (mana: number) =>
      render(
        <Bars
          spec={destructionWarlock}
          snapshot={{ ...base, mana }}
          flash={null}
          onPress={() => {}}
          descriptions={{}}
          itemIcons={new Set()}
          nextSpellId={null}
        />,
      );

    show(410);
    expect(slot().classList.contains('fv-slot-nomana')).toBe(false);
    cleanup();
    show(Math.ceil(cost));
    expect(slot().classList.contains('fv-slot-nomana')).toBe(false);
    cleanup();
    show(cost - 1);
    expect(slot().classList.contains('fv-slot-nomana')).toBe(true);
  });
});

describe('SetBonusList', () => {
  const bonusRow = (pieces: number) => screen.getByText(`${pieces}-piece`).closest('li') as HTMLElement;
  const isActive = (pieces: number) => bonusRow(pieces).getAttribute('data-active') === 'true';

  it('SetBonusList marks bonuses active exactly when pieces worn >= threshold (2 and 4 piece cases)', () => {
    const cases: [number, boolean, boolean][] = [
      [0, false, false],
      [1, false, false],
      [2, true, false],
      [3, true, false],
      [4, true, true],
    ];
    for (const [worn, two, four] of cases) {
      render(<SetBonusList sets={warlockSets} setPieces={{ 'malefic-raiment': worn }} />);
      expect(isActive(2)).toBe(two);
      expect(isActive(4)).toBe(four);
      expect(within(bonusRow(2)).getByText(two ? 'Active' : 'Inactive')).toBeTruthy();
      expect(screen.getByText(`Malefic Raiment ${worn}/4`)).toBeTruthy();
      cleanup();
    }
  });

  it('shows each bonus description', () => {
    render(<SetBonusList sets={warlockSets} setPieces={destructionWarlock.setup.setPieces} />);
    for (const bonus of warlockSets) expect(screen.getByText(bonus.description)).toBeTruthy();
  });
});

describe('Fight screen: "Your buffs"', () => {
  /** A stored setup, as the trainer loads it at mount. */
  function storedSetup(p: Partial<SetupConfig>): SetupStorage {
    const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p })]]);
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  }
  const panel = () => screen.getByRole('region', { name: 'Your buffs' });
  const activeLabels = () => {
    const list = within(panel()).queryByRole('list', { name: 'Active buffs' });
    return list ? within(list).queryAllByRole('listitem').map((li) => li.getAttribute('aria-label')) : [];
  };

  it('replaces the small "Buffs" list; the target debuff list stays; the buffs sit apart from the bars', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['heroism', 'misery'] }) });
    press('1');
    advance(100);
    expect(screen.queryByRole('list', { name: 'Buffs' })).toBeNull();
    expect(activeLabels()).toEqual(['Heroism / Bloodlust, 40 seconds left']);
    expect(screen.getByRole('list', { name: 'Debuffs on the target' })).toBeTruthy();
    // The buffs sit over the player frame in the bottom-centre row of unit frames (as the game's),
    // apart from the frame itself and from the bars: the bars never move while buffs come and go.
    expect(panel().closest('.fv-arena')).not.toBeNull();
    const you = screen.getByRole('region', { name: 'You' });
    expect(you.contains(panel())).toBe(false);
    expect(panel().parentElement).toBe(you.parentElement);
    expect(panel().compareDocumentPosition(you) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The row: the player (with its buffs) left of the target (with its debuffs).
    const units = you.closest('.fv-units') as HTMLElement;
    expect(units).not.toBeNull();
    const target = screen.getByRole('region', { name: 'Target' });
    expect(units.contains(target)).toBe(true);
    expect(target.contains(screen.getByRole('list', { name: 'Debuffs on the target' }))).toBe(true);
    expect(you.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const bar = screen.getByRole('toolbar', { name: 'Action bar' });
    expect(panel().contains(bar)).toBe(false);
    expect(bar.closest('.fv-bars')?.contains(panel())).toBe(false);
  });

  it('no extra timers: advancing fake timers does not create intervals (vi.getTimerCount unchanged)', () => {
    renderApp({
      route: '#/fight',
      storage: storedSetup({
        enabledBuffs: ['heroism', 'destruction-potion', 'arcane-brilliance'],
        timed: { heroism: { startSec: 3, durationSec: 40 } },
      }),
    });
    press('z'); // the potion: an active entry with a bar; Heroism upcoming
    advance(100);
    const count = vi.getTimerCount(); // the animation frame loop only
    expect(count).toBe(1);
    for (let i = 0; i < 40; i++) {
      advance(250); // through Heroism's start and the potion's last 5 s (pulse)
      expect(vi.getTimerCount(), `after ${(i + 1) * 250} ms`).toBe(count);
    }
    expect(activeLabels()).toContain('Heroism / Bloodlust, 33 seconds left'); // 3 s + 40 s, at 10.1 s
  });

  it("keys still work after clicking the dock's 'Coach glow' switch (S5: Space and Enter are its own; 1, X and R act)", () => {
    // The redesign shows the setup buffs as a row of small icons (no collapsible section): the
    // toggle on the Fight screen is now the dock's switch.
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['arcane-brilliance', 'destruction-potion'] }) });
    expect(within(within(panel()).getByRole('list', { name: 'Setup buffs' })).getAllByRole('listitem')).toHaveLength(1);
    const toggle = screen.getByRole('checkbox', { name: 'Coach glow' }) as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    toggle.focus();
    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(startOverlay()).not.toBeNull(); // they toggle the switch, not the fight

    fireEvent.keyDown(toggle, { key: 'x' }); // the item row (X: the potion; Z is the worn Icon): starts the fight
    expect(startOverlay()).toBeNull();
    expect(activeLabels()).toEqual(['Destruction Potion, 15 seconds left']);
    fireEvent.keyDown(toggle, { key: '1' });
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    advance(500);
    fireEvent.keyDown(toggle, { key: 'r' });
    expect(startOverlay()).not.toBeNull();
    expect(activeLabels()).toEqual([]);
    expect(within(panel()).getByText('No active buffs')).toBeTruthy();
  });
});
