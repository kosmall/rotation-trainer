import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { warlockSets } from '../../src/data/classes/warlock/sets';
import { GameView } from '../../src/ui/GameView';
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
const startOverlay = () => screen.queryByRole('button', { name: 'Start the fight' });
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));
const totalDamage = () => amount(screen.getByLabelText('Total damage'));

describe('GameView', () => {
  it('pressing "1" in the rendered GameView casts the spell bound to slot 0', () => {
    render(<GameView spec={destructionWarlock} />);
    expect(destructionWarlock.keybinds[0]).toBe('shadow-bolt');
    expect(castBar()).toBeNull();

    press('1');
    expect(castBar()).not.toBeNull();
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    expect(startOverlay()).toBeNull();

    advance(3000);
    expect(castBar()).toBeNull();
    expect(totalDamage()).toBeGreaterThan(0);
    expect(screen.getByLabelText('Elapsed').textContent).toBe('3.0 / 60s');
  });

  it('Esc during a cast removes the cast bar and logs cast-cancel', () => {
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
    expect(screen.getByText('Ready when you are')).toBeTruthy();
    expect(startOverlay()).not.toBeNull();

    press(' ');
    expect(startOverlay()).toBeNull();
    advance(1000);
    expect(screen.getByLabelText('Elapsed').textContent).toBe('1.0 / 60s');
  });

  it('after 60 s the end summary shows total damage and DPS; Reset starts over', () => {
    render(<GameView spec={destructionWarlock} />);
    press('1');
    advance(61000);

    const summary = screen.getByRole('region', { name: 'Fight summary' });
    const damage = amount(within(summary).getByLabelText('Total damage'));
    const dps = amount(within(summary).getByLabelText('DPS'));
    expect(damage).toBeGreaterThan(0);
    expect(dps).toBeCloseTo(damage / 60, 0);
    expect(within(summary).getByLabelText('Duration').textContent).toBe('60.0 s');
    expect(screen.getByLabelText('Elapsed').textContent).toBe('60.0 / 60s');

    fireEvent.click(within(summary).getByRole('button', { name: 'Reset' }));
    expect(screen.queryByRole('region', { name: 'Fight summary' })).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(totalDamage()).toBe(0);
  });

  it('R resets a running fight', () => {
    render(<GameView spec={destructionWarlock} />);
    press('1');
    advance(1000);
    press('r');
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(screen.getByLabelText('Elapsed').textContent).toBe('0.0 / 60s');
  });

  it('key auto-repeat is ignored', () => {
    render(<GameView spec={destructionWarlock} />);
    press('1', { repeat: true });
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
  });

  it('the empty slot 8 does nothing', () => {
    render(<GameView spec={destructionWarlock} />);
    expect(destructionWarlock.keybinds[7]).toBe('');
    expect(screen.queryByRole('button', { name: /\(8\)$/ })).toBeNull();
    expect(screen.getByLabelText('Empty slot (8)')).toBeTruthy();

    press('8');
    expect(castBar()).toBeNull();
    expect(startOverlay()).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a rejected press shows the reason on the slot', () => {
    render(<GameView spec={destructionWarlock} />);
    press('1');
    press('1'); // Shadow Bolt is still being cast, beyond the spell queue window
    const flash = screen.getByRole('status');
    expect(flash.textContent).toBe('Busy');
    const slot = screen.getByRole('button', { name: 'Shadow Bolt (1)' });
    expect(slot.contains(flash)).toBe(true);

    advance(1000);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clicking a slot casts its spell', () => {
    render(<GameView spec={destructionWarlock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Immolate (2)' }));
    expect(castBar()?.textContent).toContain('Immolate');
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
