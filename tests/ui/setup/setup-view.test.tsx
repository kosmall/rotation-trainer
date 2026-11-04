import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemDbSync } from '../../../src/data/items/dbSync';
import type { ItemDb } from '../../../src/data/items/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../../src/setup/storage';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import type { SimResult } from '../../../src/sim-runner/types';
import { AppShell } from '../../../src/ui/shell/AppShell';
import { SETUP_SECTIONS } from '../../../src/ui/shell/router';
import { TrainerProvider, useTrainer } from '../../../src/ui/state/TrainerProvider';
import { goTo, renderApp } from '../renderApp';

// Same fake clock as the other app tests: fight time moves only through vi.advanceTimersByTime.
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

/** Lets the lazy Setup view's import and the item database's promise settle. */
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const db: ItemDb = itemDbSync();
const loadDb = () => Promise.resolve(db);

function storedSetup(p: Partial<SetupConfig>): { storage: SetupStorage; map: Map<string, string> } {
  const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p })]]);
  const storage: SetupStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  return { storage, map };
}

const rail = () => screen.getByRole('navigation', { name: 'Setup sections' });
const railLink = (name: RegExp) => within(rail()).getByRole('link', { name });
const h1 = () => screen.getByRole('heading', { level: 1 });
const summary = () => screen.getByRole('complementary', { name: 'Next fight summary' });
const spin = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: /^start the fight$/i });

describe('Setup screen: rail and sections', () => {
  it('the rail lists every section in groups, aria-current on the active one; Keybinds is disabled', async () => {
    renderApp({ route: '#/setup/buffs' });
    await settle();
    const links = within(rail()).getAllByRole('link');
    const hrefs = links.map((a) => a.getAttribute('href')).filter((h) => h !== null);
    expect(hrefs).toEqual(SETUP_SECTIONS.map((s) => `#/setup/${s}`));
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('href'))).toEqual(['#/setup/buffs']);
    const keybinds = within(rail()).getByRole('link', { name: /Keybinds/ });
    expect(keybinds.getAttribute('aria-disabled')).toBe('true');
    expect(keybinds.hasAttribute('href')).toBe(false);
    expect(keybinds.textContent).toContain('Coming with stage 2c');
    expect(within(rail()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Character',
      'Fight',
      'Library',
      'Interface',
    ]);
    goTo('#/setup/talents');
    expect(railLink(/^Talents/).getAttribute('aria-current')).toBe('page');
    expect(railLink(/^Buffs/).getAttribute('aria-current')).toBeNull();
  });

  it('every section is reachable by its URL and is the view\'s only h1; the class section is named after the class', async () => {
    renderApp({ route: '#/setup/gear', loadDb });
    await settle();
    const titles: Record<string, string> = {
      gear: 'Gear',
      talents: 'Talents',
      buffs: 'Buffs & consumables',
      items: 'Items & cooldowns',
      rotation: 'Rotation',
      fight: 'Fight settings',
      class: 'Warlock options',
      scenarios: 'Scenarios',
      'combat-text': 'Combat text',
    };
    for (const section of SETUP_SECTIONS) {
      goTo(`#/setup/${section}`);
      await settle();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(h1().textContent).toBe(titles[section]);
    }
    expect(railLink(/^Warlock options/).textContent).toContain('Fel Armor');
  });

  it('rail values follow the setup: gear, talents, buffs, items, rotation, fight settings, combat text', async () => {
    renderApp({ route: '#/setup/buffs', loadDb });
    await settle();
    const value = (name: RegExp) => railLink(name).querySelector('.value')?.textContent;
    expect(value(/^Gear/)).toBe('My gear (export)');
    expect(value(/^Talents/)).toBe('My build (export), 0 / 21 / 40');
    expect(value(/^Buffs/)).toBe('None on');
    expect(value(/^Items/)).toBe('1 on the item bar'); // the worn Icon is always on the bar
    expect(value(/^Rotation/)).toBe('Basic, DoT rotation');
    expect(value(/^Fight settings/)).toBe('60 s, 28 yd');
    expect(value(/^Combat text/)).toMatch(/^On, /);

    fireEvent.click(checkbox('Arcane Brilliance'));
    fireEvent.click(checkbox('Misery'));
    expect(value(/^Buffs/)).toBe('2 on, 1 target debuff');
    goTo('#/setup/fight');
    fireEvent.click(checkbox('Heroism / Bloodlust'));
    fireEvent.change(spin('Heroism / Bloodlust start (s)'), { target: { value: '6.4' } });
    expect(value(/^Fight settings/)).toBe('60 s, Heroism at 6.4 s');
  });

  it('the pending note shows in the section header while the running fight keeps the old setup', async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: ' ' }); // start
    advance(500);
    goTo('#/setup/buffs');
    await settle();
    const note = () => screen.queryByText(/^Changed since the running fight started: it applies after you reset the fight/);
    expect(note()).toBeNull();
    fireEvent.click(checkbox('Misery'));
    expect(note()).not.toBeNull();
    goTo('#/setup/gear'); // the gear is unchanged: no note there
    await settle();
    expect(note()).toBeNull();
    goTo('#/setup/buffs');
    fireEvent.click(checkbox('Misery')); // back to what the fight uses
    expect(note()).toBeNull();
  });
});

describe('Setup screen: sections', () => {
  it('Gear: "Gear presets", "Equipped items" as a character pane, the item card; "Change Head" opens the picker', async () => {
    renderApp({ route: '#/setup/gear', loadDb });
    await settle();
    const presets = screen.getByRole('group', { name: 'Gear presets' });
    expect(within(presets).getByRole('button', { name: 'My gear (export)' }).getAttribute('aria-pressed')).toBe('true');
    const slots = screen.getByRole('list', { name: 'Equipped items' });
    expect(within(slots).getAllByRole('listitem')).toHaveLength(17);
    const card = screen.getByRole('region', { name: 'Selected item' });
    expect(card.textContent).toContain('Hood of the Malefic'); // Head is selected first
    fireEvent.click(within(slots).getByRole('button', { name: /^Neck/ }));
    expect(screen.getByRole('region', { name: 'Selected item' }).textContent).toContain('Translucent Spellthread Necklace');
    fireEvent.click(within(slots).getByRole('button', { name: /^Head/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Head' }));
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Choose Head item');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    // Import and Export are dialogs.
    fireEvent.click(screen.getByRole('button', { name: 'Import Gear…' }));
    expect(screen.getByRole('dialog', { name: 'Import Gear' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Import text' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Import text' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Buffs: "Raid and party", "Consumables" and "Target debuffs" groups by name with counts; Items: "Items and cooldowns" and the item bar', async () => {
    renderApp({ route: '#/setup/buffs' });
    await settle();
    for (const name of ['Raid and party', 'Consumables', 'Target debuffs']) expect(screen.getByRole('group', { name })).toBeTruthy();
    const raid = screen.getByRole('group', { name: 'Raid and party' });
    expect(within(raid).getByRole('checkbox', { name: 'Arcane Brilliance' })).toBeTruthy();
    expect(raid.querySelector('h2 small')?.textContent).toMatch(/^0 of \d+ on$/);
    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(raid.querySelector('h2 small')?.textContent).toMatch(/^1 of \d+ on$/);
    expect(screen.getByRole('group', { name: 'Setup presets' })).toBeTruthy();

    goTo('#/setup/items');
    await settle();
    const items = screen.getByRole('group', { name: 'Items and cooldowns' });
    expect(within(items).getByRole('checkbox', { name: 'Destruction Potion' })).toBeTruthy();
    const bar = () => within(screen.getByRole('list', { name: 'Item bar of the next fight' })).getAllByRole('listitem');
    expect(bar()).toHaveLength(6);
    expect(bar()[0]!.textContent).toBe('ZIcon of the Silver Crescent');
    fireEvent.click(checkbox('Destruction Potion'));
    expect(bar()[1]!.textContent).toBe('XDestruction Potion');
  });

  it('Rotation: "Rotation preset", "Curse", "Item use rules" in Basic; the Basic/Script switch; a script shows its rules and Clear Script asks first', async () => {
    const script = { rules: [{ action: 'cast' as const, id: 'immolate', if: '!target.aura.immolate.active' }, { action: 'cast' as const, id: 'shadow-bolt' }] };
    const { storage, map } = storedSetup({ script, enabledBuffs: ['destruction-potion'] });
    renderApp({ route: '#/setup/rotation', storage });
    await settle();
    const mode = screen.getByRole('group', { name: 'Rotation mode' });
    // A script plays: the section opens on it.
    expect(within(mode).getByRole('button', { name: 'Script' }).getAttribute('aria-pressed')).toBe('true');
    const rules = within(screen.getByRole('list', { name: 'Rotation rules' })).getAllByRole('listitem');
    expect(rules.map((r) => r.querySelector('.act')?.textContent)).toEqual(['Cast Immolate', 'Cast Shadow Bolt']);
    expect(rules[1]!.textContent).toContain('Always');

    fireEvent.click(within(mode).getByRole('button', { name: 'Basic' }));
    expect(screen.getByRole('combobox', { name: 'Rotation preset' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Curse' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Item use rules' })).toBeTruthy();
    expect(screen.getByText(/A script is active/)).toBeTruthy();

    fireEvent.click(within(mode).getByRole('button', { name: 'Script' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Script…' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear the Script?' });
    expect(dialog.textContent).toContain('2 rules');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('list', { name: 'Rotation rules' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Script…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Script' }));
    expect(screen.queryByRole('list', { name: 'Rotation rules' })).toBeNull();
    expect(screen.getByText(/No rules yet/)).toBeTruthy();
    expect(JSON.parse(map.get(SETUP_STORAGE_KEY)!)).not.toHaveProperty('script');
  });

  it('Fight settings: "Fight length (s)", Heroism start and duration, "Distance from target (yd)"', async () => {
    const { storage, map } = storedSetup({});
    renderApp({ route: '#/setup/fight', storage });
    await settle();
    fireEvent.change(spin('Fight length (s)'), { target: { value: '90' } });
    fireEvent.change(spin('Heroism / Bloodlust start (s)'), { target: { value: '5' } });
    fireEvent.change(spin('Heroism / Bloodlust duration (s)'), { target: { value: '30' } });
    fireEvent.change(spin('Distance from target (yd)'), { target: { value: '12' } });
    const saved = JSON.parse(map.get(SETUP_STORAGE_KEY)!) as SetupConfig;
    expect(saved.fightDurationSec).toBe(90);
    expect(saved.timed.heroism).toEqual({ startSec: 5, durationSec: 30 });
    expect(saved.distanceYd).toBe(12);
  });

  it('Reset to Defaults asks first and names what it replaces; Cancel keeps the setup', async () => {
    const { storage, map } = storedSetup({ enabledBuffs: ['misery'], distanceYd: 10 });
    renderApp({ route: '#/setup/buffs', storage });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults…' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset to Defaults?' });
    expect(dialog.textContent).toMatch(/replaces the whole setup/);
    expect(dialog.textContent).toMatch(/My gear/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(checkbox('Misery').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset to Defaults' }));
    expect(checkbox('Misery').checked).toBe(false);
    expect(JSON.parse(map.get(SETUP_STORAGE_KEY)!)).toEqual(DEFAULT_SETUP);
  });

  it('Class options, Combat text and Scenarios sections', async () => {
    renderApp({ route: '#/setup/class' });
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: 'Demon Armor' }));
    expect(railLink(/^Warlock options/).textContent).toContain('Demon Armor');
    goTo('#/setup/combat-text');
    await settle();
    fireEvent.click(checkbox('Show combat text'));
    expect(railLink(/^Combat text/).textContent).toContain('Off');
    goTo('#/setup/scenarios');
    await settle();
    expect(screen.getByText(/No scenarios saved/)).toBeTruthy();
  });
});

describe('Setup screen: summary', () => {
  it('"Stats at the pull" and "Set bonuses" update at once after a gear change', async () => {
    renderApp({ route: '#/setup/gear', loadDb });
    await settle();
    const stats = within(summary()).getByRole('region', { name: 'Stats at the pull' });
    const sets = within(summary()).getByRole('region', { name: 'Set bonuses' });
    const shadow = () => within(stats).getByLabelText('Shadow power').textContent;
    expect(shadow()).toBe('1,300');
    expect(sets.textContent).toContain('Malefic Raiment');
    const setsBefore = sets.textContent;
    fireEvent.click(within(screen.getByRole('group', { name: 'Gear presets' })).getByRole('button', { name: 'Pre-Raid' }));
    expect(shadow()).toBe('1,130');
    expect(within(summary()).getByRole('region', { name: 'Set bonuses' }).textContent).not.toBe(setsBefore);
    // The buffs count too.
    goTo('#/setup/buffs');
    await settle();
    const crit = () => Number((within(summary()).getByLabelText('Spell crit').textContent ?? '').replace(/[^0-9.]/g, ''));
    const before = crit();
    fireEvent.click(checkbox('Moonkin Aura'));
    expect(crit()).toBeGreaterThan(before);
  });

  it('"Simulate this setup": the invitation and the Simulator link; the last result once one is recorded, and "changed since" after an edit', async () => {
    let record: ((r: SimResult, c: SetupConfig) => void) | null = null;
    let config: SetupConfig | null = null;
    function Recorder() {
      const { actions, state } = useTrainer();
      useEffect(() => {
        record = actions.recordSimulation;
        config = state.config;
      });
      return null;
    }
    window.location.hash = '#/setup/buffs';
    render(
      <TrainerProvider storage={null}>
        <Recorder />
        <AppShell />
      </TrainerProvider>,
    );
    await settle();
    const card = () => within(summary()).getByRole('region', { name: 'Simulate this setup' });
    expect(card().textContent).toContain('Run the simulator to see the spread of DPS for this setup.');
    expect(within(card()).getByRole('link', { name: 'Run 1,000 Fights' }).getAttribute('href')).toBe('#/report/simulator');

    const result = { runs: 1000, seed: 41207, meanDps: 1425.25, stdErr: 3.81 } as unknown as SimResult;
    act(() => record!(result, config!));
    expect(within(card()).getByLabelText('Last simulated DPS').textContent).toBe('1,425.3 ± 3.8 DPS');
    expect(card().textContent).toContain('1,000 runs, seed 41207.');
    expect(card().textContent).not.toContain('changed since');
    fireEvent.click(checkbox('Misery'));
    expect(card().textContent).toContain('The setup changed since.');
  });
});

describe('Setup screen: keys', () => {
  it('hotkeys typed into fields (and anywhere on the Setup screen) do nothing; the fight still starts afterwards', async () => {
    renderApp({ route: '#/setup/fight' });
    await settle();
    for (const key of ['1', ' ', 'r', 'z', 'Escape']) {
      fireEvent.keyDown(spin('Distance from target (yd)'), { key });
      fireEvent.keyDown(window, { key });
    }
    goTo('#/fight');
    expect(startOverlay()).not.toBeNull();
    expect(castBar()).toBeNull();
    fireEvent.keyDown(window, { key: '1' });
    expect(castBar()).not.toBeNull();
  });
});
