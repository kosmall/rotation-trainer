import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEAR_PRESETS, gearPresetById } from '../../src/data/classes/warlock/gearPresets';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import type { EquippedItem } from '../../src/engine/types';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { DEFAULT_GEAR, normalizeGear } from '../../src/setup/gear';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { parseWowSimsExport } from '../../src/setup/wowsimsGear';
import { GameView } from '../../src/ui/GameView';
import { itemIconUrl } from '../../src/ui/SpellIcon';
import authorExport from '../../docs/samples/wowsimsexporter-destruction-warlock.json';

// Same fake clock as the other GameView tests: fight time moves only through
// vi.advanceTimersByTime. Promises (the database load) are not faked: `flush` runs them.
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

// The database through the test-only seam (GameView `loadDb`); app code only uses loadItemDb.
const db: ItemDb = itemDbSync();
const loadDb = () => Promise.resolve(db);

/** The author's real export (ruling R23), as the text WowSimsExporter copies. */
const SAMPLE = JSON.stringify(authorExport);

/** Runs pending timers due now (the <details> toggle event) and settled promises (the database load). */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
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

const press = (key: string) => fireEvent.keyDown(window, { key });
const startOverlay = () => screen.queryByRole('button', { name: /^start the fight$/i });
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });

/** An in-memory Web Storage holding `config` (when given). */
function memoryStorage(config?: unknown) {
  const map = new Map<string, string>();
  if (config !== undefined) map.set(SETUP_STORAGE_KEY, JSON.stringify(config));
  const storage: SetupStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
  return { storage, map };
}
const stored = (map: Map<string, string>): SetupConfig => JSON.parse(map.get(SETUP_STORAGE_KEY) ?? 'null') as SetupConfig;
const withGear = (gear: unknown, extra: Record<string, unknown> = {}) => ({ ...structuredClone(DEFAULT_SETUP), gear, ...extra });

const gearSummary = () => screen.getByText('Gear', { selector: 'summary' });
const gearPanel = () => gearSummary().closest('details') as HTMLDetailsElement;
async function openGear() {
  fireEvent.click(gearSummary());
  await flush();
}
const slotRow = (slot: string) => {
  const row = gearPanel().querySelector(`[data-slot="${slot}"]`);
  if (!row) throw new Error(`no slot row ${slot}`);
  return row as HTMLElement;
};
/** Selects a slot of the character pane; returns the item card that then shows it (Change, Clear, sockets, enchant). */
const card = (slot: string) => {
  fireEvent.click(within(slotRow(slot)).getByRole('button'));
  return within(gearPanel()).getByRole('region', { name: 'Selected item' });
};
const activeGear = () => within(gearPanel()).getByLabelText('Active gear preset').textContent;
const presetButton = (name: string) => within(gearPanel()).getByRole('button', { name });
const statText = (label: string) => screen.getByLabelText(label).textContent;
const dialog = () => screen.getByRole('dialog');
/** The option buttons of the open picker, by their item/gem/enchant name. */
const optionNames = () =>
  within(dialog())
    .queryAllByRole('button')
    .map((b) => b.querySelector('.picker-name')?.textContent)
    .filter((n): n is string => typeof n === 'string');
const option = (name: string) => {
  const b = within(dialog())
    .queryAllByRole('button')
    .find((x) => x.querySelector('.picker-name')?.textContent === name);
  if (!b) throw new Error(`no option ${name}`);
  return b;
};
const gearTag = () => screen.getAllByText(/^Gear: /)[0]?.textContent;

const T6 = gearPresetById('t6')!;
const T4 = gearPresetById('t4')!;

describe('Gear panel', () => {
  it('renders 17 slots for the default gear with item names', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    expect(gearPanel().open).toBe(false); // collapsed, like the Setup panel
    await openGear();
    expect(gearPanel().querySelectorAll('[data-slot]')).toHaveLength(17);
    DEFAULT_GEAR.forEach((entry, i) => {
      const row = slotRow(ITEM_SLOTS[i]!);
      expect(row.textContent).toContain(db.items[entry.id]!.name);
    });
    // The item icon from public/icons/items/, gems and the enchant name.
    const head = slotRow('head');
    expect(head.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl(db.items[31051]!.icon));
    expect(within(card('head')).getByRole('button', { name: /^Head socket 1 \(meta\): Chaotic Skyfire Diamond/ })).toBeTruthy();
    expect(card('head').textContent).toContain('Glyph of Power');
    expect(activeGear()).toBe('My gear (export)');
    expect(presetButton('My gear (export)').getAttribute('aria-pressed')).toBe('true');
    // The unmodelled effect of the Riding Crop is reported.
    expect(gearPanel().textContent).toContain('Riding Crop: Equip: Mount Speed');
  });

  it('choosing a preset changes the gear and the stats at the pull; Custom after editing a slot', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    expect(statText('Shadow power')).toBe('1,300');
    const names = within(within(gearPanel()).getByRole('group', { name: 'Gear presets' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['My gear (export)', 'Pre-Raid', 'T4', 'T5', 'T6', "Zul'Aman", 'Sunwell Plateau']);

    fireEvent.click(presetButton('T6'));
    expect(statText('Shadow power')).toBe('1,350');
    expect(activeGear()).toBe('T6');
    expect(presetButton('T6').getAttribute('aria-pressed')).toBe('true');
    expect(presetButton('My gear (export)').getAttribute('aria-pressed')).toBe('false');
    expect(slotRow('mainHand').textContent).toContain(db.items[T6.gear[14]!.id]!.name);
    expect(slotRow('offHand').textContent).toContain('Empty'); // Zhar'doom is a staff

    // Pre-Raid shows its note (the Stormcaller swap).
    fireEvent.click(presetButton('Pre-Raid'));
    expect(gearPanel().textContent).toContain(gearPresetById('preraid')!.note!);
    expect(statText('Shadow power')).toBe('1,130');

    fireEvent.click(presetButton('T6'));
    fireEvent.click(within(card('neck')).getByRole('button', { name: 'Clear Neck' }));
    expect(slotRow('neck').textContent).toContain('Empty');
    expect(activeGear()).toBe('Custom');
    expect(within(gearPanel()).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect(Number((statText('Shadow power') ?? '').replace(/,/g, ''))).toBeLessThan(1350);
  });

  it('the item picker filters by slot and search text and picking an item updates the slot; unique duplicates rejected with a message', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(within(card('head')).getByRole('button', { name: 'Change Head' }));
    expect(dialog().getAttribute('aria-label')).toBe('Choose Head item');
    const search = within(dialog()).getByRole('searchbox', { name: 'Search' });
    expect(document.activeElement).toBe(search); // keyboard: the search box takes focus
    const all = optionNames();
    expect(all).toContain('Voidheart Crown');
    expect(all).toContain('Hood of the Malefic');
    expect(all).not.toContain('Band of the Eternal Sage'); // a ring
    // Sorted by phase (newest first), then name.
    const phases = all.map((n) => Object.values(db.items).find((it) => it.name === n && it.slot === 'head')!.phase);
    expect([...phases].sort((a, b) => b - a)).toEqual(phases);

    fireEvent.change(search, { target: { value: 'malefic' } });
    expect(optionNames()).toEqual(['Hood of the Malefic']);
    fireEvent.change(search, { target: { value: 'crown' } });
    expect(optionNames()).toContain('Voidheart Crown');
    // Phase filter: up to phase 1 hides the phase 3 hood.
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Phase' }), { target: { value: '1' } });
    expect(optionNames()).toContain('Voidheart Crown');
    expect(optionNames()).not.toContain('Hood of the Malefic');
    fireEvent.click(option('Voidheart Crown'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(slotRow('head').textContent).toContain('Voidheart Crown');
    expect(activeGear()).toBe('Custom');

    // Band of the Eternal Sage is worn in Finger 1: the same ring in Finger 2 is refused.
    fireEvent.click(within(card('finger2')).getByRole('button', { name: 'Change Finger 2' }));
    fireEvent.change(within(dialog()).getByRole('searchbox', { name: 'Search' }), { target: { value: 'eternal sage' } });
    fireEvent.click(option('Band of the Eternal Sage'));
    expect(screen.getByRole('alert').textContent).toMatch(/Band of the Eternal Sage.*Finger 1/);
    expect(slotRow('finger2').textContent).toContain('Ring of Captured Storms');
    expect(slotRow('finger1').textContent).toContain('Band of the Eternal Sage');
  });

  it('the item picker hides effect-only items behind a toggle and marks unmodelled effects and Horde-only items', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(within(card('trinket1')).getByRole('button', { name: 'Change Trinket 1' }));
    expect(optionNames()).not.toContain('The Lightning Capacitor'); // no stats, only an effect
    expect(optionNames()).toContain('Riding Crop'); // effect-only, but worn here: always listed
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Show items with only an unmodelled effect/ }));
    expect(option('The Lightning Capacitor').textContent).toContain('Effect not modelled');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(within(card('mainHand')).getByRole('button', { name: 'Change Main hand' }));
    fireEvent.change(within(dialog()).getByRole('searchbox', { name: 'Search' }), { target: { value: 'stormcaller' } });
    expect(option('Stormcaller').textContent).toContain('Horde only');
    fireEvent.keyDown(within(dialog()).getByRole('searchbox', { name: 'Search' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gems offered by colour; socket bonus line toggles when colours match; meta requirement status', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    const hands = () => card('hands');
    expect(within(hands()).getByLabelText('Socket bonus').textContent).toMatch(/inactive/i);
    expect(within(gearPanel()).getByLabelText('Meta gem status').textContent).toMatch(/Chaotic Skyfire Diamond.*active/);
    expect(within(gearPanel()).getByLabelText('Meta gem status').textContent).not.toMatch(/inactive/);

    // A yellow socket holding a red gem: any non-meta gem is offered; the colour filter narrows.
    fireEvent.click(within(hands()).getByRole('button', { name: /^Hands socket 1 \(yellow\)/ }));
    expect(dialog().getAttribute('aria-label')).toBe('Choose Hands socket 1 gem');
    expect(optionNames()).toContain('Runed Crimson Spinel');
    expect(optionNames()).toContain('Potent Pyrestone');
    expect(optionNames()).not.toContain('Chaotic Skyfire Diamond'); // meta gems only in meta sockets
    expect(optionNames()).not.toContain('Sublime Mystic Dawnstone'); // no modelled stat: hidden
    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Colour' }), { target: { value: 'match' } });
    expect(optionNames()).toContain('Potent Pyrestone'); // orange matches yellow
    expect(optionNames()).not.toContain('Runed Crimson Spinel');
    fireEvent.click(option('Potent Pyrestone'));
    expect(within(hands()).getByLabelText('Socket bonus').textContent).toMatch(/active/i);
    expect(within(hands()).getByLabelText('Socket bonus').textContent).not.toMatch(/inactive/i);

    // The meta socket offers meta gems only.
    fireEvent.click(within(card('head')).getByRole('button', { name: /^Head socket 1 \(meta\)/ }));
    expect(optionNames().length).toBeGreaterThan(1);
    for (const name of optionNames()) expect(Object.values(db.gems).find((g) => g.name === name)?.color).toBe('meta');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));

    // Two blue gems hold the meta's requirement: one purple swapped for a red gem breaks it.
    fireEvent.click(within(card('shoulder')).getByRole('button', { name: /^Shoulder socket 1 \(blue\)/ }));
    fireEvent.click(option('Runed Crimson Spinel'));
    expect(within(gearPanel()).getByLabelText('Meta gem status').textContent).toMatch(/inactive/);
    expect(within(gearPanel()).getByLabelText('Meta gem status').textContent).toMatch(/2 blue/);

    // Empty a socket.
    fireEvent.click(within(card('shoulder')).getByRole('button', { name: /^Shoulder socket 2 \(yellow\)/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /No gem/ }));
    expect(within(card('shoulder')).getByRole('button', { name: /^Shoulder socket 2 \(yellow\): empty/ })).toBeTruthy();
  });

  it('enchants per slot', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    expect(within(card('neck')).queryByRole('button', { name: /enchant/i })).toBeNull(); // necks take none
    fireEvent.click(within(card('head')).getByRole('button', { name: /^Head enchant: Glyph of Power/ }));
    expect(dialog().getAttribute('aria-label')).toBe('Choose Head enchant');
    expect(optionNames()).toContain('Glyph of Power');
    expect(optionNames()).not.toContain('Enchant Chest - Exceptional Stats');
    fireEvent.click(option('Presence of Sight'));
    expect(card('head').textContent).toContain('Presence of Sight');

    fireEvent.click(within(card('finger1')).getByRole('button', { name: /^Finger 1 enchant/ }));
    expect(option('Enchant Ring - Spellpower').textContent).toContain('Enchanting');
    expect(optionNames()).not.toContain('Enchant Ring - Striking'); // no modelled stat
    fireEvent.click(within(dialog()).getByRole('button', { name: /No enchant/ }));
    expect(within(card('finger1')).getByRole('button', { name: /^Finger 1 enchant: none/ })).toBeTruthy();
  });

  it("import: paste the author's sample -> report and apply; unknown ids listed; invalid text -> error message, no change", async () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(presetButton('T6'));
    fireEvent.click(within(gearPanel()).getByRole('button', { name: 'Import Gear…' }));
    const text = within(gearPanel()).getByRole('textbox', { name: 'Import text' });
    const apply = () => within(gearPanel()).getByRole('button', { name: 'Apply import' }) as HTMLButtonElement;
    const report = () => within(gearPanel()).getByRole('region', { name: 'Import report' });

    fireEvent.change(text, { target: { value: 'not json at all' } });
    expect(within(report()).getByRole('alert').textContent).toMatch(/not valid JSON|nothing/i);
    expect(apply().disabled).toBe(true);
    expect(activeGear()).toBe('T6');

    const unknownText = JSON.stringify({ items: [{ id: 999999 }, { id: 32349 }] });
    fireEvent.change(text, { target: { value: unknownText } });
    expect(report().textContent).toContain('999999');
    expect(report().textContent).toMatch(/Unknown items/);
    expect(apply().disabled).toBe(false); // one known item placed: ok

    fireEvent.change(text, { target: { value: SAMPLE } });
    expect(report().textContent).toContain('Feliczita');
    expect(report().textContent).toContain('17 of 17');
    expect(report().textContent).toContain("talents are not applied here: paste the export into the Talents panel's Import");
    expect(activeGear()).toBe('T6'); // nothing applied before Apply
    fireEvent.click(apply());
    expect(activeGear()).toBe('My gear (export)');
    expect(statText('Shadow power')).toBe('1,300');
    const saved = stored(map);
    expect(saved.gear).toEqual(normalizeGear(DEFAULT_GEAR, db));
    expect(saved).not.toHaveProperty('talents');
  });

  it('export contains the current items and round-trips', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(presetButton('T4'));
    fireEvent.click(within(gearPanel()).getByRole('button', { name: 'Export Gear' }));
    const out = within(gearPanel()).getByRole('textbox', { name: 'Export text' }) as HTMLTextAreaElement;
    expect(out.readOnly).toBe(true);
    for (const e of T4.gear) if (e) expect(out.value).toContain(`"id": ${e.id}`);
    expect(parseWowSimsExport(out.value, db).gear).toEqual(normalizeGear(T4.gear, db));

    // Copy: the clipboard API when there is one, a selected text otherwise (never a throw).
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await act(async () => {
      fireEvent.click(within(gearPanel()).getByRole('button', { name: 'Copy' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(out.value);
    expect(gearPanel().textContent).toContain('Copied');
    // A changed gear means a changed export: the old status goes.
    fireEvent.click(presetButton('T6'));
    expect(gearPanel().textContent).not.toContain('Copied');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await act(async () => {
      fireEvent.click(within(gearPanel()).getByRole('button', { name: 'Copy' }));
      await Promise.resolve();
    });
    expect(gearPanel().textContent).toMatch(/Ctrl\+C|copied/i);
  });

  it('typing in the search/import fields never triggers hotkeys (Z, R, digits)', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    // Import and Export are dialogs: one at a time.
    for (const [open, field] of [
      ['Import Gear…', 'Import text'],
      ['Export Gear', 'Export text'],
    ] as const) {
      fireEvent.click(within(gearPanel()).getByRole('button', { name: open }));
      const box = within(gearPanel()).getByRole('textbox', { name: field });
      for (const key of ['1', '5', 'z', 'Z', 'r', 'R', ' ']) fireEvent.keyDown(box, { key });
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    }
    expect(startOverlay()).not.toBeNull();
    fireEvent.click(within(card('head')).getByRole('button', { name: 'Change Head' }));
    const search = within(dialog()).getByRole('searchbox', { name: 'Search' });
    for (const key of ['1', '2', 'z', 'x', 'r', 'R', ' ']) fireEvent.keyDown(search, { key });
    fireEvent.keyDown(within(dialog()).getByRole('combobox', { name: 'Phase' }), { key: '1' });
    expect(startOverlay()).not.toBeNull();
    expect(castBar()?.textContent ?? '').not.toContain('Shadow Bolt');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    // The hotkeys still work outside the fields.
    press('1');
    expect(startOverlay()).toBeNull();
    expect(castBar()?.textContent).toContain('Shadow Bolt');
  });

  it('setup storage round trip keeps the gear; corrupt stored gear falls back to default', async () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} loadDb={loadDb} />);
    expect(map.size).toBe(0); // loading never writes
    await openGear();
    fireEvent.click(presetButton('T6'));
    expect(stored(map).gear).toEqual(T6.gear);
    expect(stored(map).gearPresetId).toBe('t6');
    cleanup();

    // Reload: the stored gear needs the database, which loads without opening the panel. Until it
    // has, the fight is built with the default gear (never with a gear the tables cannot build).
    render(<GameView storage={storage} loadDb={loadDb} />);
    expect(statText('Shadow power')).toBe('1,300');
    await flush();
    expect(statText('Shadow power')).toBe('1,350');
    await openGear();
    expect(activeGear()).toBe('T6');
    cleanup();

    for (const bad of ['garbage', 42, [1, 2, 3], { 0: { id: 1 } }]) {
      render(<GameView storage={memoryStorage(withGear(bad)).storage} loadDb={loadDb} />);
      await openGear();
      expect(activeGear(), JSON.stringify(bad)).toBe('My gear (export)');
      expect(statText('Shadow power')).toBe('1,300');
      cleanup();
    }

    // 17 entries with unknown or misplaced ids: those slots are emptied once the database loads.
    const odd: unknown[] = structuredClone(DEFAULT_GEAR) as EquippedItem[];
    odd[0] = { id: 999999, gems: [34220] };
    odd[1] = { id: 31051 }; // a head item in the neck slot
    odd[2] = { id: '31054', __proto__: { id: 31054 } };
    render(<GameView storage={memoryStorage(withGear(odd)).storage} loadDb={loadDb} />);
    await openGear();
    for (const slot of ['head', 'neck', 'shoulder']) expect(slotRow(slot).textContent).toContain('Empty');
    expect(slotRow('chest').textContent).toContain('Robes of Rhonin');
  });

  it('a fight that has started keeps its gear until R', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    // A fight that has not started takes the gear at once.
    fireEvent.click(presetButton('T4'));
    expect(gearTag()).toBe('Gear: T4');
    press('1');
    advance(500);
    fireEvent.click(presetButton('T6'));
    expect(gearTag()).toBe('Gear: T4'); // the running fight keeps its gear
    expect(statText('Shadow power')).toBe('1,350'); // the next fight's stats
    expect(gearPanel().textContent).toMatch(/applies from the next fight/);
    press('r');
    expect(gearTag()).toBe('Gear: T6');
    expect(gearPanel().textContent).not.toMatch(/applies from the next fight/);
  });

  it('setup presets keep the gear; Reset to defaults resets it to the author gear', async () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(presetButton('T6'));
    fireEvent.click(screen.getByText('Setup', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(activeGear()).toBe('T6');
    expect(stored(map).gear).toEqual(T6.gear);
    expect(stored(map).enabledBuffs.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(activeGear()).toBe('T6');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(activeGear()).toBe('My gear (export)');
    expect(stored(map)).not.toHaveProperty('gear');
    expect(statText('Shadow power')).toBe('1,300');
  });

  it('a database that fails to load shows an error with Reload the page; the fight keeps the default gear', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('chunk failed')));
    const reload = vi.fn();
    const { storage } = memoryStorage(withGear(structuredClone(T6.gear), { gearPresetId: 't6' }));
    render(<GameView storage={storage} loadDb={failing} onReload={reload} />);
    await flush();
    expect(failing).toHaveBeenCalledTimes(1); // the stored gear needs the database: loaded at mount
    expect(statText('Shadow power')).toBe('1,300');
    expect(gearTag()).toBe('Gear: My gear (export)');
    await openGear();
    // Opening the panel does not ask again: a browser keeps a failed import() (and after a
    // redeploy the old chunk is gone), only a reload helps; the setup is saved.
    expect(failing).toHaveBeenCalledTimes(1);
    const alert = within(gearPanel()).getByRole('alert');
    expect(alert.textContent).toMatch(/could not load/i);
    expect(alert.textContent).toMatch(/setup is saved/i);
    expect(within(gearPanel()).queryByRole('button', { name: 'Retry' })).toBeNull();
    fireEvent.click(within(gearPanel()).getByRole('button', { name: 'Reload the page' }));
    expect(reload).toHaveBeenCalledTimes(1);
    await flush();
    // Nothing else changes: the error stays, the fight keeps the default gear.
    expect(failing).toHaveBeenCalledTimes(1);
    expect(within(gearPanel()).getByRole('alert').textContent).toMatch(/could not load/i);
    expect(statText('Shadow power')).toBe('1,300');
    expect(gearTag()).toBe('Gear: My gear (export)');
  });

  it('keys pressed inside the open picker never reach the fight; Escape still closes it', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(within(card('head')).getByRole('button', { name: 'Change Head' }));
    const voidheart = option('Voidheart Crown');
    voidheart.focus();
    for (const key of ['1', 'z', 'Z', 'r', ' ', 'Enter', '=']) {
      fireEvent.keyDown(voidheart, { key });
      expect(startOverlay(), key).not.toBeNull(); // nothing started the fight
    }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));

    press('1'); // outside the picker the hotkeys work
    advance(500);
    expect(castBar()?.textContent).toContain('Shadow Bolt');
    fireEvent.click(within(card('head')).getByRole('button', { name: 'Change Head' }));
    const closeButton = within(dialog()).getByRole('button', { name: 'Close' });
    for (const key of ['r', 'R', '2', 'x']) {
      fireEvent.keyDown(closeButton, { key });
      expect(startOverlay(), key).toBeNull(); // not reset
      expect(castBar()?.textContent, key).toContain('Shadow Bolt'); // no other cast
    }
    fireEvent.keyDown(closeButton, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(castBar()?.textContent).toContain('Shadow Bolt'); // Escape closed the list, it did not cancel the cast
  });

  it('shows a loading state until the database arrives; the default gear needs no database', async () => {
    let resolve: (d: ItemDb) => void = () => {};
    const slow = vi.fn(() => new Promise<ItemDb>((r) => (resolve = r)));
    render(<GameView storage={null} loadDb={slow} />);
    await flush();
    expect(slow).not.toHaveBeenCalled(); // the author's gear builds from the embedded tables
    await openGear();
    expect(slow).toHaveBeenCalledTimes(1);
    expect(within(gearPanel()).getByRole('status').textContent).toMatch(/Loading/);
    await act(async () => {
      resolve(db);
      await Promise.resolve();
    });
    expect(gearPanel().querySelectorAll('[data-slot]')).toHaveLength(17);
  });

  it('set bonuses list every bonus with its real piece counts (Voidheart 4/4, its 4-piece modelled and active since Task 6) and unmodelled ones', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(presetButton('T4'));
    const sets = screen.getByRole('region', { name: 'Set bonuses' });
    expect(within(sets).getByText('Voidheart Raiment 4/4')).toBeTruthy();
    const four = within(sets)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('4-piece') && li.closest('.set')?.textContent?.includes('Voidheart'));
    // Task 6: Voidheart 4pc (one more DoT tick) is modelled: active, no longer 'Not modelled'.
    expect(four?.textContent).toContain('Active');
    expect(four?.textContent).not.toContain('Not modelled');
    expect(four?.getAttribute('data-active')).toBe('true');
    // T5: Corruptor has no modelled bonus but is worn: listed too.
    fireEvent.click(presetButton('T5'));
    expect(within(screen.getByRole('region', { name: 'Set bonuses' })).getByText('Corruptor Raiment 2/4')).toBeTruthy();
    expect(gearPanel().textContent).toContain('Corruptor Raiment (2)');
  });

  it('an enabled effect of an item no longer worn is inactive: no warning, not listed, not applied (gear item effects Task 3)', async () => {
    // Stage 2a warned here ("enabled but not worn: the fight still counts its effect"); since the
    // effects are derived from the worn gear, such an id is inactive (design spec §2 B).
    const { storage } = memoryStorage({ ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['band-of-the-eternal-sage'] });
    render(<GameView storage={storage} loadDb={loadDb} />);
    await openGear();
    const items = () => screen.getByRole('group', { name: 'Items and cooldowns' });
    expect(within(items()).getByRole('checkbox', { name: 'Band of the Eternal Sage' })).toBeTruthy();
    fireEvent.click(presetButton('T6'));
    expect(gearPanel().textContent).not.toMatch(/not worn/);
    expect(within(items()).queryByRole('checkbox', { name: 'Band of the Eternal Sage' })).toBeNull();
  });

  it('every offered preset is matched by deep equality, whatever the key order', async () => {
    const t6 = T6.gear.map((e) => (e ? { gems: e.gems, ...(e.enchant ? { enchant: e.enchant } : {}), id: e.id } : null));
    render(<GameView storage={memoryStorage(withGear(t6)).storage} loadDb={loadDb} />);
    await openGear();
    expect(activeGear()).toBe('T6');
    expect(GEAR_PRESETS.length).toBeGreaterThan(6);
  });
});
