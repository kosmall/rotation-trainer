// Gear item effects Task 3: the Setup panel's "Items and cooldowns" follows the worn gear (the
// user-reported bug: "Items and cooldowns is hardcoded: when I swap trinkets, the new ones do not
// appear there"), the 6-slot item row (Z X C V B N), item icons, unmodelled effects, the overflow
// warning, the migration of the stage F ids and the pending note.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gearPresetById } from '../../src/data/classes/warlock/gearPresets';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import type { EquippedItem } from '../../src/engine/types';
import { DEFAULT_SETUP, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { isGearEffectId } from '../../src/setup/gearEffects';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { GameView } from '../../src/ui/GameView';
import { ITEM_SLOT_KEYS } from '../../src/ui/keys';
import { itemIconUrl } from '../../src/ui/SpellIcon';

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

// The database through the test-only seam (GameView `loadDb`), as in gear-panel.test.tsx.
const db: ItemDb = itemDbSync();
const loadDb = () => Promise.resolve(db);

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
const setup = (extra: Partial<SetupConfig> & Record<string, unknown>) => ({ ...structuredClone(DEFAULT_SETUP), ...extra });

const ICON = 'Icon of the Silver Crescent';
const BAND = 'Band of the Eternal Sage';
const BLOODGEM = "Scryer's Bloodgem";
const QUAG = "Quagmirran's Eye";

const itemsGroup = () => screen.getByRole('group', { name: 'Items and cooldowns' });
/** The entry names of the Items group, in order. */
const itemNames = () => [...itemsGroup().querySelectorAll('.setup-buff-name')].map((e) => e.textContent);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** An entry's checkbox: a proc's or pre-pull's by its name, a worn on-use effect's "<name>: use automatically (bot, simulator)". */
const itemCheckbox = (name: string) =>
  within(itemsGroup()).getByRole('checkbox', { name: new RegExp(`^${escapeRe(name)}(: use automatically \\(bot, simulator\\))?$`) }) as HTMLInputElement;
const itemRow = (name: string) => itemCheckbox(name).closest('.setup-buff') as HTMLElement;
const itemBar = () => screen.queryByRole('group', { name: 'Item bar' });
const itemButtons = () => (itemBar() ? within(itemBar() as HTMLElement).getAllByRole('button') : []);
const buffsPanel = () => screen.getByRole('region', { name: 'Your buffs' });
function selfBuff(name: string): HTMLElement | undefined {
  const list = within(buffsPanel()).queryByRole('list', { name: 'Active buffs' });
  if (!list) return undefined;
  return within(list)
    .queryAllByRole('listitem')
    .find((li) => li.querySelector('.buff-name')?.textContent === name);
}

const gearSummary = () => screen.getByText('Gear', { selector: 'summary' });
const gearPanel = () => gearSummary().closest('details') as HTMLDetailsElement;
async function openGear() {
  fireEvent.click(gearSummary());
  await flush();
}
const slotRow = (slot: string) => gearPanel().querySelector(`[data-slot="${slot}"]`) as HTMLElement;
async function pickItem(slot: string, label: string, search: string, name: string) {
  fireEvent.click(within(slotRow(slot)).getByRole('button', { name: `Change ${label}` }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search' }), { target: { value: search } });
  const option = within(dialog)
    .getAllByRole('button')
    .find((b) => b.querySelector('.picker-name')?.textContent === name);
  if (!option) throw new Error(`no option ${name}`);
  fireEvent.click(option);
  await flush();
}

/** A database copy in which three of the author's items get an on-use effect (more on-use effects than real gear has). */
function dbWithExtraUses(): ItemDb {
  const copy = structuredClone(db);
  const add = (id: number, buffName: string, buffId: number) => {
    copy.items[id] = {
      ...copy.items[id]!,
      useEffects: [{ buffName, buffId, stats: { spellPower: 10 }, durationMs: 10000, cooldownMs: 60000 }],
    };
  };
  add(31051, 'Test Head Buff', 990001); // Hood of the Malefic (head)
  add(32349, 'Test Neck Buff', 990002); // Translucent Spellthread Necklace (neck)
  add(32247, 'Test Ring Buff', 990003); // Ring of Captured Storms (finger 2)
  return copy;
}

describe('Items and cooldowns follow the worn gear', () => {
  it("the Items group lists the Icon and the Band for the author's gear (not hard-coded: they are in no static catalog), with item icons", () => {
    // Not hard-coded: no catalog constant holds a gear item entry.
    expect(STATIC_SETUP_CATALOG.some((b) => isGearEffectId(b.id) || b.group === 'item')).toBe(false);
    expect(SETUP_CATALOG.some((b) => isGearEffectId(b.id) || b.group === 'item')).toBe(false);
    render(<GameView storage={null} loadDb={loadDb} />);
    // Before the database loads: the embedded records of the author's gear.
    expect(itemNames()).toEqual(['Destruction Potion', 'Super Mana Potion', 'Dark Rune', ICON, BAND]);
    expect(itemRow(ICON).querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_weapon_shortblade_23'));
    expect(itemRow(BAND).querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_jewelry_ring_55'));
    // Potions keep their spell icons.
    expect(itemRow('Destruction Potion').querySelector('img')?.getAttribute('src')).toContain('/icons/spells/');
    // Description: stats, duration, cooldown; chance, ICD and trigger in words.
    const icon = itemRow(ICON).querySelector('.setup-buff-desc')?.textContent ?? '';
    expect(icon).toMatch(/\+155 spell power for 20 s/);
    expect(icon).toMatch(/2 min cooldown/);
    const band = itemRow(BAND).querySelector('.setup-buff-desc')?.textContent ?? '';
    expect(band).toMatch(/on spell hit/);
    expect(band).toMatch(/10% chance/);
    expect(band).toMatch(/60 s internal cooldown/);
    expect(band).toMatch(/\+95 spell power for 10 s/);
    // Heroism stays in the Fight group.
    expect(within(itemsGroup()).queryByRole('checkbox', { name: 'Heroism / Bloodlust' })).toBeNull();
  });

  it('swapping the trinket in the Gear panel for another on-use trinket updates the list at once and the old one disappears, enabled state kept by id for items still worn', async () => {
    const { storage, map } = memoryStorage(setup({ enabledBuffs: ['item:29370', 'item:29305'] }));
    render(<GameView storage={storage} loadDb={loadDb} />);
    expect(itemCheckbox(ICON).checked).toBe(true);
    expect(itemCheckbox(BAND).checked).toBe(true);
    await openGear();
    await pickItem('trinket2', 'Trinket 2', 'bloodgem', BLOODGEM); // the Icon is in trinket 2
    // The bug: the new trinket was missing from Items and cooldowns.
    expect(itemNames()).toContain(BLOODGEM);
    expect(itemNames()).not.toContain(ICON);
    expect(itemCheckbox(BLOODGEM).checked).toBe(false);
    expect(itemCheckbox(BAND).checked).toBe(true); // still worn: still enabled
    expect(itemRow(BLOODGEM).querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_gem_bloodstone_02'));
    expect(itemRow(BLOODGEM).querySelector('.setup-buff-desc')?.textContent).toMatch(/\+150 spell power for 15 s/);
    // The Icon's id stays saved (inactive): wearing it again brings it back enabled.
    expect(stored(map).enabledBuffs).toContain('item:29370');
    // The worn Bloodgem is on the item row at once (an on-use effect is always bound), with its
    // item icon; the Icon is not there. Enabling it (bot use) adds no slot.
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${BLOODGEM} (Z)`]);
    fireEvent.click(itemCheckbox(BLOODGEM));
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${BLOODGEM} (Z)`]);
    expect(itemButtons()[0]!.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_gem_bloodstone_02'));
    await pickItem('trinket2', 'Trinket 2', 'silver crescent', ICON);
    expect(itemNames()).not.toContain(BLOODGEM);
    expect(itemCheckbox(ICON).checked).toBe(true);
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`]);
  });

  it('two on-use trinkets at once: both on the item row, and using one puts the other on the shared category cooldown', async () => {
    const gear = structuredClone(DEFAULT_GEAR) as (EquippedItem | null)[];
    gear[12] = { id: 29132, gems: [] }; // Scryer's Bloodgem in trinket 1 (category 1141, like the Icon)
    render(<GameView storage={memoryStorage(setup({ gear, enabledBuffs: ['item:29132', 'item:29370'] })).storage} loadDb={loadDb} />);
    await flush(); // the stored gear needs the database: it loads at once
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${BLOODGEM} (Z)`, `${ICON} (X)`]);
    press('z');
    expect(selfBuff(BLOODGEM)).toBeDefined();
    expect(itemButtons()[1]!.querySelector('.slot-cooldown')?.textContent).toBe('15s'); // the Bloodgem's 15 s category
    expect(selfBuff(BLOODGEM)?.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_gem_bloodstone_02'));
  });

  it('every worn on-use effect is on the item row, enabled or not (trinkets first, then by slot), then the enabled potions; B and N work; typing in inputs never fires them', async () => {
    const big = dbWithExtraUses();
    const enabled = ['destruction-potion', 'super-mana-potion'];
    render(<GameView storage={memoryStorage(setup({ enabledBuffs: enabled })).storage} loadDb={() => Promise.resolve(big)} />);
    await openGear(); // the database loads: the author's items now derive from it
    expect(itemButtons().map((b) => b.querySelector('.slot-key')?.textContent)).toEqual(['Z', 'X', 'C', 'V', 'B', 'N']);
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      `${ICON} (Z)`, // trinket 2
      'Hood of the Malefic (X)', // head
      'Translucent Spellthread Necklace (C)', // neck
      'Ring of Captured Storms (V)', // finger 2
      'Destruction Potion (B)',
      'Super Mana Potion (N)',
    ]);
    // The Setup panel shows the same keys.
    expect(itemRow('Hood of the Malefic').querySelector('.setup-item-key')?.textContent).toBe('Item row: X');
    expect(itemRow('Super Mana Potion').querySelector('.setup-item-key')?.textContent).toBe('Item row: N');
    const distance = screen.getByRole('spinbutton', { name: 'Distance from target (yd)' });
    for (const key of ['b', 'B', 'n', 'N', 'z', 'v']) fireEvent.keyDown(distance, { key });
    expect(startOverlay()).not.toBeNull();
    press('c'); // starts the fight
    expect(startOverlay()).toBeNull();
    expect(selfBuff('Translucent Spellthread Necklace')).toBeDefined();
    press('V');
    expect(selfBuff('Ring of Captured Storms')).toBeDefined();
    press('b');
    expect(selfBuff('Destruction Potion')).toBeDefined();
    press('x');
    expect(selfBuff('Hood of the Malefic')).toBeDefined();
  });

  it('more than 6 item actions: a warning names the ones left off (the enabled consumables after the worn on-use effects), 6 are bound', async () => {
    const big = dbWithExtraUses();
    const enabled = ['destruction-potion', 'super-mana-potion', 'dark-rune'];
    render(<GameView storage={memoryStorage(setup({ enabledBuffs: enabled })).storage} loadDb={() => Promise.resolve(big)} />);
    await openGear();
    expect(itemButtons()).toHaveLength(6);
    expect(itemsGroup().textContent).toContain('Dark Rune: not on the item row (6 slots, all taken)');
    expect(itemRow('Dark Rune').textContent).toMatch(/not on the item row/i);
    expect(itemRow(ICON).textContent).not.toMatch(/not on the item row/i);
  });

  it("a proc item shows chance/ICD/trigger and its aura appears in the buffs panel after a proc (seeded)", async () => {
    const gear = structuredClone(DEFAULT_GEAR) as (EquippedItem | null)[];
    gear[12] = { id: 27683, gems: [] }; // Quagmirran's Eye in trinket 1
    render(<GameView storage={memoryStorage(setup({ gear, enabledBuffs: ['item:27683'] })).storage} loadDb={loadDb} />);
    await flush();
    const desc = itemRow(QUAG).querySelector('.setup-buff-desc')?.textContent ?? '';
    expect(desc).toMatch(/on spell cast/);
    expect(desc).toMatch(/10% chance/);
    expect(desc).toMatch(/45 s internal cooldown/);
    expect(desc).toMatch(/\+320 haste rating for 6 s/);
    let seen: HTMLElement | undefined;
    for (let fight = 0; fight < 5 && !seen; fight++) {
      if (fight > 0) press('r');
      for (let bolt = 0; bolt < 15 && !seen; bolt++) {
        press('1');
        for (let step = 0; step < 13 && !seen; step++) {
          advance(200);
          seen = selfBuff(QUAG);
        }
      }
    }
    expect(seen, 'a seeded fight procs the Eye').toBeDefined();
    expect(seen!.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_gem_pearl_01'));
    expect(seen!.getAttribute('title')).toContain('+320 haste rating');
    expect(buffsPanel().textContent ?? '').not.toMatch(/internal cooldown/i);
  }, 30_000);

  it('unmodelled effects of the worn gear are listed (before and after the database loads)', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    const list = () => within(itemsGroup()).getByRole('list', { name: 'Not modelled effects of your gear' });
    expect(list().textContent).toContain('Riding Crop: Equip: Mount Speed');
    await openGear();
    await pickItem('trinket1', 'Trinket 1', 'bangle', 'Bangle of Endless Blessings');
    expect(list().textContent).toContain('Bangle of Endless Blessings: Proc: Meditation');
    expect(list().textContent).not.toContain('Riding Crop');
    expect(itemNames()).toContain('Bangle of Endless Blessings'); // its on-use Spirit is modelled
  });

  it('stored old ids load as the new ones', () => {
    const { storage, map } = memoryStorage(setup({ enabledBuffs: ['icon-of-the-silver-crescent', 'band-of-the-eternal-sage'] }));
    render(<GameView storage={storage} loadDb={loadDb} />);
    expect(itemCheckbox(ICON).checked).toBe(true);
    expect(itemCheckbox(BAND).checked).toBe(true);
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Arcane Brilliance' }));
    expect(stored(map).enabledBuffs).toEqual(['item:29370', 'item:29305', 'arcane-brilliance']);
  });

  it('the pending-setup note covers the effects list: a gear change during a fight lists the new effects, the fight keeps its own until R', async () => {
    render(<GameView storage={memoryStorage(setup({ enabledBuffs: ['item:29370'] })).storage} loadDb={loadDb} />);
    press('1'); // the fight runs
    await openGear();
    await pickItem('trinket2', 'Trinket 2', 'bloodgem', BLOODGEM);
    expect(itemNames()).toContain(BLOODGEM);
    expect(within(itemsGroup()).getByText(/running fight keeps its gear and item effects/)).toBeTruthy();
    // The running fight keeps the Icon on its item row.
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${ICON} (Z)`]);
    press('r');
    // The next fight wears the Bloodgem: on the item row although not enabled (no bot use).
    expect(itemButtons().map((b) => b.getAttribute('aria-label'))).toEqual([`${BLOODGEM} (Z)`]);
    expect(within(itemsGroup()).queryByText(/running fight keeps its gear and item effects/)).toBeNull();
  });

  it('the hints name the item row with the keys from the constants', () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    const keys = ITEM_SLOT_KEYS.map((k) => k.toUpperCase()).join(' ');
    expect(keys).toBe('Z X C V B N');
    expect(itemsGroup().textContent).toContain(`item row (${keys};`);
    expect(itemsGroup().textContent).toContain(`Always available on the item bar (${keys}); tick to let the bot and the simulator use it, with the rule below.`);
    expect(document.body.textContent).not.toMatch(/Z X C V\)/);
  });

  it('setup presets keep the gear; a not-worn enabled item does not make the preset Custom', async () => {
    const t6 = structuredClone(gearPresetById('t6')!.gear) as (EquippedItem | null)[];
    render(<GameView storage={memoryStorage(setup({ gear: t6, gearPresetId: 't6', enabledBuffs: ['item:29305'] })).storage} loadDb={loadDb} />);
    await flush();
    expect(screen.getByLabelText('Active preset').textContent).toBe('None'); // the Band is not worn: no effect
    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(screen.getByLabelText('Active preset').textContent).toBe('Raid as in my log');
    expect(screen.getAllByText(/^Gear: /)[0]?.textContent).toBe('Gear: T6'); // the preset kept the gear
  });

  it('the gear presets show their item effects', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    const group = within(gearPanel()).getByRole('group', { name: 'Gear presets' });
    const mine = within(group).getByRole('button', { name: 'My gear (export)' });
    expect(mine.getAttribute('title')).toContain(`Item effects: ${ICON} (on use), ${BAND} (proc)`);
    expect(gearPanel().textContent).toContain(`Item effects: ${ICON} (on use), ${BAND} (proc)`);
    for (const b of within(group).getAllByRole('button')) expect(b.getAttribute('title')).toMatch(/Item effects: /);
  });

  it('the picker shows stat-less items with a modelled effect, marked', async () => {
    render(<GameView storage={null} loadDb={loadDb} />);
    await openGear();
    fireEvent.click(within(slotRow('trinket1')).getByRole('button', { name: 'Change Trinket 1' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search' }), { target: { value: 'ephemeral' } });
    const option = within(dialog)
      .getAllByRole('button')
      .find((b) => b.querySelector('.picker-name')?.textContent === 'Talisman of Ephemeral Power');
    expect(option?.textContent).toContain('Effect: Setup panel');
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search' }), { target: { value: 'bangle' } });
    const bangle = within(dialog)
      .getAllByRole('button')
      .find((b) => b.querySelector('.picker-name')?.textContent === 'Bangle of Endless Blessings');
    expect(bangle?.textContent).toContain('Effect: Setup panel');
    expect(bangle?.textContent).toContain('Effect not modelled');
  });
});

// The user's report: with Dark Iron Smoking Pipe in trinket 1 and the Icon in trinket 2 only one
// trinket was on the item row, because both had to be enabled in Items and cooldowns. Worn on-use
// effects are now always on the item row; the checkbox only means "the bot and the simulator use it".
describe('worn on-use trinkets are always on the item row', () => {
  const PIPE = 'Dark Iron Smoking Pipe';
  const pipeAndIcon = () => {
    const gear = structuredClone(DEFAULT_GEAR) as (EquippedItem | null)[];
    gear[12] = { id: 281735, gems: [] }; // trinket 1; the author's Icon is in trinket 2
    return gear;
  };
  const labels = () => itemButtons().map((b) => b.getAttribute('aria-label'));
  const ruleOf = (name: string) => screen.queryByRole('combobox', { name: `${name}: when` });

  it('Pipe in trinket 1 + Icon in trinket 2, nothing enabled: both on the item row (Z, X) in the ready phase; enabling one adds a bot rule, not a slot; Z works', async () => {
    const { storage, map } = memoryStorage(setup({ gear: pipeAndIcon() }));
    render(<GameView storage={storage} loadDb={loadDb} />);
    await flush(); // the stored gear needs the database
    expect(startOverlay()).not.toBeNull(); // ready phase
    expect(labels()).toEqual([`${PIPE} (Z)`, `${ICON} (X)`]);
    expect(itemButtons().map((b) => b.querySelector('.slot-key')?.textContent)).toEqual(['Z', 'X']);
    expect(itemButtons()[0]!.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_pipe_01'));
    // Setup: neither is ticked; each row names its key and the meaning of the checkbox.
    expect(itemCheckbox(PIPE).checked).toBe(false);
    expect(itemCheckbox(ICON).checked).toBe(false);
    expect(within(itemsGroup()).getByRole('checkbox', { name: `${PIPE}: use automatically (bot, simulator)` })).toBeTruthy();
    expect(itemRow(PIPE).querySelector('.setup-item-key')?.textContent).toBe('Item row: Z');
    expect(itemRow(ICON).querySelector('.setup-item-key')?.textContent).toBe('Item row: X');
    expect(itemRow(PIPE).textContent).toContain('Use automatically (bot, simulator)');
    expect(itemRow(PIPE).textContent).toContain('Always available on the item bar (Z X C V B N)');
    // No bot rule for either: the item-use editor lists only auto-used items.
    expect(ruleOf(PIPE)).toBeNull();
    expect(ruleOf(ICON)).toBeNull();

    // Enabling the Pipe: a bot rule appears, the row is unchanged.
    fireEvent.click(itemCheckbox(PIPE));
    expect(stored(map).enabledBuffs).toEqual(['item:281735']);
    expect(labels()).toEqual([`${PIPE} (Z)`, `${ICON} (X)`]);
    expect(ruleOf(PIPE)).not.toBeNull();
    expect(ruleOf(ICON)).toBeNull();

    // Pressing Z uses the Pipe (and starts the fight); the Icon then waits for the shared trinket category.
    press('z');
    expect(startOverlay()).toBeNull();
    expect(selfBuff(PIPE)).toBeDefined();
    expect(selfBuff(PIPE)?.querySelector('img')?.getAttribute('src')).toBe(itemIconUrl('inv_misc_pipe_01'));
    expect(itemButtons()[1]!.querySelector('.slot-cooldown')?.textContent).toBe('20s');
    press('x'); // blocked by the category
    expect(selfBuff(ICON)).toBeUndefined();
    advance(20_100);
    press('x');
    expect(selfBuff(ICON)).toBeDefined();
  });

  it('the Gear panel hint for an on-use item says it is on the item row; a proc still counts only when enabled', async () => {
    render(<GameView storage={memoryStorage(setup({ gear: pipeAndIcon() })).storage} loadDb={loadDb} />);
    await openGear();
    expect(gearPanel().textContent).toContain(`${PIPE}: on the item row; the bot and the simulator use it only when "Use automatically" is ticked`);
    expect(gearPanel().textContent).toContain(`${BAND}: its effect counts only when enabled`);
  });
});
