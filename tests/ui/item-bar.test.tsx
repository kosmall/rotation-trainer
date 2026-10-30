import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { WarlockOptions } from '../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../src/data/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { GameView } from '../../src/ui/GameView';

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
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init });
const startOverlay = () => screen.queryByRole('button', { name: 'Start the fight' });
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const itemBar = () => screen.queryByRole('group', { name: 'Item bar' });
const itemButtons = () => within(itemBar() as HTMLElement).getAllByRole('button');
const itemButton = (name: string) => within(itemBar() as HTMLElement).getByRole('button', { name: new RegExp(`^${name} \\(`) });
const cooldownText = (name: string) => itemButton(name).querySelector('.slot-cooldown')?.textContent ?? null;
const mana = () => Number(screen.getByRole('progressbar', { name: 'Mana' }).getAttribute('aria-valuenow'));
const maxMana = () => Number(screen.getByRole('progressbar', { name: 'Mana' }).getAttribute('aria-valuemax'));
const totalDamage = () => Number((screen.getByLabelText('Total damage').textContent ?? '').replace(/[^0-9.]/g, ''));

/** A stored setup, as GameView loads it at mount. */
function storedSetup(p: Partial<SetupConfig>): SetupStorage {
  const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p })]]);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** The chip of a self aura (the "Buffs" list) by its visible name. */
function buffChip(name: string): HTMLElement | undefined {
  const list = screen.queryByRole('list', { name: 'Buffs' });
  if (!list) return undefined;
  return within(list)
    .queryAllByRole('listitem')
    .find((li) => li.querySelector('.aura-name')?.textContent === name);
}
const chipTime = (name: string) => buffChip(name)?.querySelector('.aura-time')?.textContent ?? null;

const DP = 'Destruction Potion';
const SMP = 'Super Mana Potion';
const DR = 'Dark Rune';
const ICON = 'Icon of the Silver Crescent';

describe('Item bar', () => {
  it('item row shows only enabled item actions, in catalog order, with Z X C V', () => {
    render(<GameView storage={null} />);
    expect(itemBar()).toBeNull(); // no item enabled: no row
    // The spell row keeps its 12 slots; no item slot in it.
    const spellRow = screen.getByRole('toolbar', { name: 'Action bar' });
    expect(spellRow.querySelectorAll('.slot')).toHaveLength(12);

    // Enabled in another order than the catalog's.
    for (const name of [ICON, DR, DP, SMP]) fireEvent.click(checkbox(name));
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      `${DP} (Z)`,
      `${SMP} (X)`,
      `${DR} (C)`,
      `${ICON} (V)`,
    ]);
    expect(itemButtons().map((b) => b.querySelector('.slot-key')?.textContent)).toEqual(['Z', 'X', 'C', 'V']);
    // Icons and tooltips with the item's description.
    for (const b of SETUP_CATALOG.filter((x) => x.effect.action)) {
      const button = itemButton(b.name);
      expect(button.querySelector('img')?.getAttribute('src'), b.id).toContain(`/icons/spells/${b.icon}.jpg`);
      expect(button.getAttribute('title'), b.id).toContain(b.description);
    }
    expect(spellRow.querySelectorAll('.slot')).toHaveLength(12);
    expect(within(spellRow).queryByRole('button', { name: new RegExp(`^${DP}`) })).toBeNull();

    // Only the bound slots: two items take Z and X, no empty slot is shown.
    fireEvent.click(checkbox(DP));
    fireEvent.click(checkbox(SMP));
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${DR} (Z)`, `${ICON} (X)`]);
    expect((itemBar() as HTMLElement).querySelectorAll('.slot')).toHaveLength(2);
  });

  it('pressing Z uses the first item (mouse click too); Z in the distance input does not', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['destruction-potion', 'icon-of-the-silver-crescent'] })} />);
    const distance = screen.getByRole('spinbutton', { name: 'Distance from target (yd)' });
    fireEvent.keyDown(distance, { key: 'z' });
    fireEvent.keyDown(distance, { key: 'Z' });
    expect(startOverlay()).not.toBeNull();
    expect(buffChip(DP)).toBeUndefined();

    press('z'); // an item pressed before the fight starts it
    expect(startOverlay()).toBeNull();
    expect(chipTime(DP)).toBe('15s');

    // The mouse: mousedown keeps the focus off the slot (Space must not click it), click uses it.
    const icon = itemButton(ICON);
    expect(fireEvent.mouseDown(icon)).toBe(false); // default prevented
    fireEvent.click(icon);
    expect(chipTime('Blessing of the Silver Crescent')).toBe('20s');
  });

  it('uppercase Z works', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['destruction-potion'] })} />);
    press('Z', { shiftKey: true });
    expect(startOverlay()).toBeNull();
    expect(buffChip(DP)).toBeDefined();
  });

  it('cooldown text appears after use and the shared group shows on the other potion', () => {
    render(
      <GameView
        storage={storedSetup({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'icon-of-the-silver-crescent'] })}
      />,
    );
    expect(cooldownText(DP)).toBeNull();
    press('z');
    expect(cooldownText(DP)).toBe('2m');
    expect(cooldownText(SMP)).toBe('2m'); // shared potion cooldown
    expect(cooldownText(ICON)).toBeNull(); // another group
    advance(1100); // frames every 16 ms: the shown time is the last frame's (1088 ms)
    expect(cooldownText(DP)).toBe('119s');
    expect(cooldownText(SMP)).toBe('119s');

    press('x'); // Super Mana Potion: blocked by the shared cooldown
    expect(within(itemButton(SMP)).getByRole('status').textContent).toBe('Cooldown');

    // The Icon: its own 2 min, and the trinket group's 20 s on no other item here.
    press('c');
    expect(cooldownText(ICON)).toBe('2m');
    expect(cooldownText(DP)).toBe('119s');
  });

  it('R still resets, Space/Enter on a focused item button presses it (not start)', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['destruction-potion'] })} />);
    press('z');
    advance(1100);
    expect(cooldownText(DP)).toBe('119s');
    press('r');
    expect(startOverlay()).not.toBeNull();
    expect(cooldownText(DP)).toBeNull();
    expect(buffChip(DP)).toBeUndefined();
    press('R');
    expect(startOverlay()).not.toBeNull();

    // A keyboard user tabbed to the slot: Space and Enter belong to the button (the browser
    // clicks it), so they neither start the fight nor reach the hotkey handler.
    const button = itemButton(DP);
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(startOverlay()).not.toBeNull();
    expect(buffChip(DP)).toBeUndefined();
    fireEvent.click(button); // what the browser does on Space/Enter
    expect(startOverlay()).toBeNull();
    expect(buffChip(DP)).toBeDefined();
  });
});

describe('Item actions in the fight', () => {
  /** Shadow Bolt without hit or crit roll: its damage depends only on the base roll and spell power. */
  const noRollSpec = (w: WarlockOptions): SpecData => {
    const spec = buildDestructionWarlock(w);
    return {
      ...spec,
      spells: spec.spells.map((s) => (s.id === 'shadow-bolt' ? { ...s, canMiss: false, canCrit: false } : s)),
    };
  };

  it('Destruction Potion used from the bar: +120 SP aura chip appears for 15 s, damage of the next bolt higher than without', () => {
    render(<GameView buildSpec={noRollSpec} storage={storedSetup({ enabledBuffs: ['destruction-potion'] })} />);
    // Without the potion. The bolt's base roll spans 544-607 (63), less than 120 x 0.857 more
    // spell power, so any bolt with the potion beats any bolt without.
    press('1');
    advance(4000); // cast 2431, lands 3831 at 28 yd
    const without = totalDamage();
    expect(without).toBeGreaterThan(0);
    press('r');

    press('z');
    expect(chipTime(DP)).toBe('15s');
    press('1');
    advance(4000);
    const withPotion = totalDamage();
    expect(withPotion).toBeGreaterThan(without);
    expect(chipTime(DP)).toBe('11s');
    advance(10_900); // 14.9 s
    expect(chipTime(DP)).toBe('1s');
    advance(200); // 15.1 s
    expect(buffChip(DP)).toBeUndefined();
  });

  it("Super Mana Potion raises mana by 1800-3000; Dark Rune by 900-1500; both rejected with the shared/own cooldown flash 'Cooldown'", () => {
    render(
      <GameView storage={storedSetup({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'dark-rune'] })} />,
    );
    // Z: Destruction Potion, X: Super Mana Potion, C: Dark Rune.
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${DP} (Z)`, `${SMP} (X)`, `${DR} (C)`]);
    // Spend mana with Shadow Bolts until neither item can be capped by full mana.
    for (let i = 0; i < 20 && maxMana() - mana() < 4600; i++) {
      press('1');
      advance(2500);
    }
    expect(maxMana() - mana()).toBeGreaterThanOrEqual(4600);

    let before = mana();
    press('x');
    const potionGain = mana() - before;
    expect(potionGain).toBeGreaterThanOrEqual(1800);
    expect(potionGain).toBeLessThanOrEqual(3000);

    before = mana();
    press('c');
    const runeGain = mana() - before;
    expect(runeGain).toBeGreaterThanOrEqual(900);
    expect(runeGain).toBeLessThanOrEqual(1500);

    advance(1000);
    const flashOf = (name: string) => within(itemButton(name)).queryByRole('status')?.textContent ?? null;
    before = mana();
    press('x'); // own cooldown
    expect(flashOf(SMP)).toBe('Cooldown');
    press('z'); // the potion group's shared cooldown
    expect(flashOf(DP)).toBe('Cooldown');
    press('c'); // the rune's own cooldown
    expect(flashOf(DR)).toBe('Cooldown');
    expect(mana()).toBe(before);
    expect(buffChip(DP)).toBeUndefined();
  });

  it('the item row binds what applySetup binds (the setup is the one source of the keys)', () => {
    const config = normalizeSetup(
      { ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['icon-of-the-silver-crescent', 'super-mana-potion'] },
      SETUP_CATALOG,
    );
    const { spec } = applySetup({ buildSpec: buildDestructionWarlock, catalog: SETUP_CATALOG, config });
    render(<GameView storage={storedSetup(config)} />);
    const names = spec.keybinds.slice(12).filter((id) => id !== '').map((id) => spec.spells.find((s) => s.id === id)?.name);
    expect(names).toEqual([SMP, ICON]);
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${SMP} (Z)`, `${ICON} (X)`]);
  });
});
