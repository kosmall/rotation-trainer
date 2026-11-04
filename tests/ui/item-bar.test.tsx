import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { WarlockOptions } from '../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../src/data/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, setupCatalogFor } from '../../src/setup/defaults';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { goTo, renderApp } from './renderApp';

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

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init });
const startOverlay = () => screen.queryByRole('button', { name: /^start the fight$/i });
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
/** The "Use automatically (bot, simulator)" checkbox of a worn on-use gear effect. */
const autoUse = (name: string) => checkbox(`${name}: use automatically (bot, simulator)`);
const itemBar = () => screen.queryByRole('group', { name: 'Item bar' });
const itemButtons = () => within(itemBar() as HTMLElement).getAllByRole('button');
const itemButton = (name: string) => within(itemBar() as HTMLElement).getByRole('button', { name: new RegExp(`^${name} \\(`) });
const cooldownText = (name: string) => itemButton(name).querySelector('.fv-slot-cd')?.textContent ?? null;
const mana = () => Number(screen.getByRole('progressbar', { name: 'Mana' }).getAttribute('aria-valuenow'));
const maxMana = () => Number(screen.getByRole('progressbar', { name: 'Mana' }).getAttribute('aria-valuemax'));
const totalDamage = () => Number((screen.getByLabelText('Total damage').textContent ?? '').replace(/[^0-9.]/g, ''));

/** A stored setup, as the trainer loads it at mount. */
function storedSetup(p: Partial<SetupConfig>): SetupStorage {
  const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p })]]);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** The entry of a self aura in "Your buffs" by its name (the icon's label: "<name>, 15 seconds left"). */
function buffChip(name: string): HTMLElement | undefined {
  const panel = screen.getByRole('region', { name: 'Your buffs' });
  const list = within(panel).queryByRole('list', { name: 'Active buffs' });
  if (!list) return undefined;
  return within(list)
    .queryAllByRole('listitem')
    .find((li) => li.getAttribute('aria-label')?.startsWith(`${name}, `));
}
const chipTime = (name: string) => buffChip(name)?.querySelector('.fv-aura-time')?.textContent ?? null;

const DP = 'Destruction Potion';
const SMP = 'Super Mana Potion';
const DR = 'Dark Rune';
const ICON = 'Icon of the Silver Crescent';

describe('Item bar', () => {
  it('item row shows the worn on-use Icon always, then the enabled potions and rune in catalog order, with Z X C V', async () => {
    renderApp({ route: '#/fight' });
    // Nothing enabled: the worn Icon is on the row anyway (Z), before the fight starts.
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`]);
    // The spell row keeps its 12 slots; no item slot in it.
    const spellRow = screen.getByRole('toolbar', { name: 'Action bar' });
    expect(spellRow.querySelectorAll('.fv-slot')).toHaveLength(12);

    // Enabled in another order than the catalog's (on the Setup screen); ticking the Icon adds no slot.
    goTo('#/setup/buffs');
    await settle();
    for (const name of [DR, DP, SMP]) fireEvent.click(checkbox(name));
    fireEvent.click(autoUse(ICON));
    goTo('#/fight');
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      `${ICON} (Z)`,
      `${DP} (X)`,
      `${SMP} (C)`,
      `${DR} (V)`,
    ]);
    expect(itemButtons().map((b) => b.querySelector('.fv-slot-key')?.textContent)).toEqual(['Z', 'X', 'C', 'V']);
    // Icons and tooltips with the item's description.
    for (const b of setupCatalogFor(DEFAULT_GEAR).filter((x) => x.effect.action)) {
      const button = itemButton(b.name);
      // The gear's on-use effects show the item icon (public/icons/items/), the potions and the rune spell icons.
      expect(button.querySelector('img')?.getAttribute('src'), b.id).toContain(`/icons/${b.iconKind === 'item' ? 'items' : 'spells'}/${b.icon}.jpg`);
      expect(button.getAttribute('title'), b.id).toContain(b.description);
    }
    expect(screen.getByRole('toolbar', { name: 'Action bar' }).querySelectorAll('.fv-slot')).toHaveLength(12);
    expect(within(screen.getByRole('toolbar', { name: 'Action bar' })).queryByRole('button', { name: new RegExp(`^${DP}`) })).toBeNull();

    // Only the bound slots: two items take Z and X, no empty slot is shown.
    goTo('#/setup/buffs');
    await settle();
    fireEvent.click(checkbox(DP));
    fireEvent.click(checkbox(SMP));
    goTo('#/fight');
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`, `${DR} (X)`]);
    // Unticking the Icon keeps it on the row (only the bot stops using it).
    goTo('#/setup/buffs');
    await settle();
    fireEvent.click(autoUse(ICON));
    goTo('#/fight');
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`, `${DR} (X)`]);
    expect((itemBar() as HTMLElement).querySelectorAll('.fv-slot')).toHaveLength(2);
  });

  it('pressing X uses the second item (mouse click too); X in the distance input does not', async () => {
    renderApp({ route: '#/setup/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion', 'icon-of-the-silver-crescent'] }) });
    await settle();
    const distance = screen.getByRole('spinbutton', { name: 'Distance from target (yd)' });
    fireEvent.keyDown(distance, { key: 'x' });
    fireEvent.keyDown(distance, { key: 'X' });
    goTo('#/fight');
    expect(startOverlay()).not.toBeNull();
    expect(buffChip(DP)).toBeUndefined();

    press('x'); // an item pressed before the fight starts it (Z is the worn Icon, X the potion)
    expect(startOverlay()).toBeNull();
    expect(chipTime(DP)).toBe('15s');

    // The mouse: mousedown keeps the focus off the slot (Space must not click it), click uses it.
    const icon = itemButton(ICON);
    expect(fireEvent.mouseDown(icon)).toBe(false); // default prevented
    fireEvent.click(icon);
    expect(chipTime(ICON)).toBe('20s'); // the panel names an item's aura after its item
  });

  it('uppercase X works', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    press('X', { shiftKey: true });
    expect(startOverlay()).toBeNull();
    expect(buffChip(DP)).toBeDefined();
  });

  it('cooldown text appears after use and the shared group shows on the other potion', () => {
    renderApp({
      route: '#/fight',
      storage: storedSetup({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'icon-of-the-silver-crescent'] }),
    });
    expect(cooldownText(DP)).toBeNull();
    press('x'); // Z is the worn Icon: X the potion, C the mana potion
    expect(cooldownText(DP)).toBe('2m');
    expect(cooldownText(SMP)).toBe('2m'); // shared potion cooldown
    expect(cooldownText(ICON)).toBeNull(); // another group
    advance(1100); // frames every 16 ms: the shown time is the last frame's (1088 ms); 119 s is shown as "2m" (remainingText, from 100 s on)
    expect(cooldownText(DP)).toBe('2m');
    expect(cooldownText(SMP)).toBe('2m');

    press('c'); // Super Mana Potion: blocked by the shared cooldown
    expect(within(itemButton(SMP)).getByRole('status').textContent).toBe('Cooldown');

    // The Icon: its own 2 min, and the trinket group's 20 s on no other item here.
    press('z');
    expect(cooldownText(ICON)).toBe('2m');
    expect(cooldownText(DP)).toBe('2m');
  });

  it('R still resets, Space/Enter on a focused item button presses it (not start)', () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    press('x');
    advance(1100);
    expect(cooldownText(DP)).toBe('2m');
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
    renderApp({ route: '#/fight', buildSpec: noRollSpec, storage: storedSetup({ enabledBuffs: ['destruction-potion'] }) });
    // Without the potion. The bolt's base roll spans 544-607 (63), less than 120 x 0.857 more
    // spell power, so any bolt with the potion beats any bolt without.
    press('1');
    advance(4000); // cast 2431, lands 3831 at 28 yd
    const without = totalDamage();
    expect(without).toBeGreaterThan(0);
    press('r');

    press('x'); // Z is the worn Icon
    expect(chipTime(DP)).toBe('15s');
    press('1');
    advance(4000);
    const withPotion = totalDamage();
    expect(withPotion).toBeGreaterThan(without);
    expect(chipTime(DP)).toBe('11s');
    advance(10_900); // 14.9 s
    expect(chipTime(DP)).toBe('0.2s'); // the panel: one decimal below 10 s (the last frame, 14.896 s, leaves 104 ms)
    advance(200); // 15.1 s
    expect(buffChip(DP)).toBeUndefined();
  });

  it("Super Mana Potion raises mana by 1800-3000; Dark Rune by 900-1500; both rejected with the shared/own cooldown flash 'Cooldown'", () => {
    renderApp({ route: '#/fight', storage: storedSetup({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'dark-rune'] }) });
    // Z: the worn Icon (always), X: Destruction Potion, C: Super Mana Potion, V: Dark Rune.
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`, `${DP} (X)`, `${SMP} (C)`, `${DR} (V)`]);
    // Spend mana with Shadow Bolts until neither item can be capped by full mana.
    for (let i = 0; i < 20 && maxMana() - mana() < 4600; i++) {
      press('1');
      advance(2500);
    }
    expect(maxMana() - mana()).toBeGreaterThanOrEqual(4600);

    let before = mana();
    press('c');
    const potionGain = mana() - before;
    expect(potionGain).toBeGreaterThanOrEqual(1800);
    expect(potionGain).toBeLessThanOrEqual(3000);

    before = mana();
    press('v');
    const runeGain = mana() - before;
    expect(runeGain).toBeGreaterThanOrEqual(900);
    expect(runeGain).toBeLessThanOrEqual(1500);

    advance(1000);
    const flashOf = (name: string) => within(itemButton(name)).queryByRole('status')?.textContent ?? null;
    before = mana();
    press('c'); // own cooldown
    expect(flashOf(SMP)).toBe('Cooldown');
    press('x'); // the potion group's shared cooldown
    expect(flashOf(DP)).toBe('Cooldown');
    press('v'); // the rune's own cooldown
    expect(flashOf(DR)).toBe('Cooldown');
    expect(mana()).toBe(before);
    expect(buffChip(DP)).toBeUndefined();
  });

  it('the item row binds what applySetup binds (the setup is the one source of the keys)', () => {
    const config = normalizeSetup(
      { ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['icon-of-the-silver-crescent', 'super-mana-potion'] },
      SETUP_CATALOG,
    );
    const { spec } = applySetup({ buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t), catalog: SETUP_CATALOG, config });
    renderApp({ route: '#/fight', storage: storedSetup(config) });
    const names = spec.keybinds.slice(12).filter((id) => id !== '').map((id) => spec.spells.find((s) => s.id === id)?.name);
    expect(names).toEqual([ICON, SMP]);
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`, `${SMP} (X)`]);
  });
});
