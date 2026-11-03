import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { GameView } from '../../src/ui/GameView';
import { TargetPanel } from '../../src/ui/TargetPanel';
import { applySetup } from '../../src/setup/applySetup';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';

// Same fake clock as game.test.tsx: fight time moves only through vi.advanceTimersByTime, and
// the seed (Date.now()-based) is fixed.
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

const press = (key: string) => fireEvent.keyDown(window, { key });
const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: 'Start the fight' });
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const spin = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;
const distanceInput = () => spin('Distance from target (yd)');

const NOTE_NO_BUFFS = 'No raid buffs, consumables or trinket effects — approximate (see docs/data-sources.md)';
const NOTE_WITH_BUFFS =
  'Includes the enabled buffs; trinket/proc effects not selected are excluded — approximate (see docs/data-sources.md)';

/** An in-memory Web Storage; `fail` makes every call throw (private mode, disabled storage). */
function memoryStorage(initial: Record<string, string> = {}, fail = false) {
  const map = new Map(Object.entries(initial));
  const guard = () => {
    if (fail) throw new DOMException('denied', 'SecurityError');
  };
  const storage: SetupStorage = {
    getItem: vi.fn((k: string) => (guard(), map.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => (guard(), void map.set(k, String(v)))),
    removeItem: vi.fn((k: string) => (guard(), void map.delete(k))),
  };
  return { storage, map };
}

const stored = (map: Map<string, string>): SetupConfig => JSON.parse(map.get(SETUP_STORAGE_KEY) ?? 'null') as SetupConfig;

/** The chip of an aura in the given list (by its visible name). */
function auraChip(listLabel: string, name: string): HTMLElement | undefined {
  const list = screen.queryByRole('list', { name: listLabel });
  if (!list) return undefined;
  return within(list)
    .queryAllByRole('listitem')
    .find((li) => li.querySelector('.aura-name')?.textContent === name);
}

const HEROISM = 'Heroism / Bloodlust';
const buffsPanel = () => screen.getByRole('region', { name: 'Your buffs' });
/** An entry of the "Your buffs" panel's active list (it replaced the small "Buffs" chip list) by its visible name. */
function selfBuff(name: string): HTMLElement | undefined {
  const list = within(buffsPanel()).queryByRole('list', { name: 'Active buffs' });
  if (!list) return undefined;
  return within(list)
    .queryAllByRole('listitem')
    .find((li) => li.querySelector('.buff-name')?.textContent === name);
}
/** The texts of the panel's "Upcoming" entries ([] when the list is not shown). */
function upcomingTexts(): string[] {
  const list = within(buffsPanel()).queryByRole('list', { name: 'Upcoming buffs' });
  return list ? within(list).getAllByRole('listitem').map((li) => li.querySelector('.buff-upcoming-text')?.textContent ?? '') : [];
}

/** "27.34%" -> 27.34 */
const statValue = (label: string) => Number((screen.getByLabelText(label).textContent ?? '').replace(/[^0-9.]/g, ''));

describe('Setup wiring', () => {
  it('settings are saved on change and restored on the next mount', () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} />);
    expect(storage.setItem).not.toHaveBeenCalled(); // loading never writes

    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(stored(map).enabledBuffs).toEqual(['arcane-brilliance']);
    fireEvent.change(distanceInput(), { target: { value: '12' } });
    fireEvent.change(spin('Heroism / Bloodlust start (s)'), { target: { value: '6.4' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Demon Armor' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Curse' }), { target: { value: 'doom' } });
    const saved = stored(map);
    expect(saved).toEqual(normalizeSetup(saved, SETUP_CATALOG)); // storage holds a normalized config
    expect(saved.distanceYd).toBe(12);
    expect(saved.timed.heroism?.startSec).toBe(6.4);
    expect(saved.warlock.armor).toBe('demon');
    expect(saved.rotation.curse).toBe('doom');

    cleanup();
    render(<GameView storage={storage} />);
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
    expect(distanceInput().value).toBe('12');
    expect(spin('Heroism / Bloodlust start (s)').value).toBe('6.4');
    expect((screen.getByRole('radio', { name: 'Demon Armor' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Curse' }) as HTMLSelectElement).value).toBe('doom');
    expect(screen.getByLabelText('Active preset').textContent).toBe('Custom');
  });

  it('corrupt stored data mounts with defaults and no crash', () => {
    for (const text of ['{not json', '"x"', 'null', '[]', '{"version":2}', 'x'.repeat(200_000)]) {
      const { storage } = memoryStorage({ [SETUP_STORAGE_KEY]: text });
      render(<GameView storage={storage} />);
      expect(screen.getByLabelText('Active preset').textContent).toBe('None');
      expect(distanceInput().value).toBe('28');
      expect(screen.getByText(NOTE_NO_BUFFS)).toBeTruthy();
      press('1');
      expect(castBar()).not.toBeNull();
      cleanup();
    }

    // Partly valid: unknown ids dropped, numbers clamped, the valid parts kept.
    const partly = JSON.stringify({
      version: 1,
      enabledBuffs: ['nope', 'misery', 42, '__proto__'],
      distanceYd: 1e9,
      timed: { heroism: { startSec: -4, durationSec: 'x' } },
      rotation: { curse: 'bogus', lifeTapBelowMana: -1 },
    });
    const { storage } = memoryStorage({ [SETUP_STORAGE_KEY]: partly });
    render(<GameView storage={storage} />);
    expect(checkbox('Misery').checked).toBe(true);
    expect(distanceInput().value).toBe('100');
    expect(spin('Heroism / Bloodlust start (s)').value).toBe('0');
    expect(spin('Heroism / Bloodlust duration (s)').value).toBe('40');
    expect((screen.getByRole('combobox', { name: 'Curse' }) as HTMLSelectElement).value).toBe('elements');
    expect(checkbox('Auto (Shadow Bolt cost)').checked).toBe(true);
    press('1');
    expect(castBar()).not.toBeNull();
  });

  it('enabling Heroism with start 0 makes the first Shadow Bolt shorter (~1.87 s) in the next fight, while the running fight is unchanged until R', () => {
    render(<GameView storage={null} />);
    press('1'); // Shadow Bolt, 2431 ms without Heroism
    advance(500);
    fireEvent.click(checkbox('Heroism / Bloodlust'));
    expect(screen.getByText(/applies from the next fight/i)).toBeTruthy();

    advance(1500); // 2000: a hasted bolt (1870) would be done
    expect(castBar()).not.toBeNull();
    expect(selfBuff(HEROISM)).toBeUndefined();
    advance(500); // 2500
    expect(castBar()).toBeNull();

    press('r');
    expect(screen.queryByText(/applies from the next fight/i)).toBeNull();
    press('1');
    expect(selfBuff(HEROISM)).toBeDefined();
    // Frames come every 16 ms (fake requestAnimationFrame), so the checks keep a frame's margin.
    advance(1840);
    expect(castBar()).not.toBeNull();
    advance(60); // 1900: past 1870, long before 2431
    expect(castBar()).toBeNull();
  });

  it('a setup changed before the first press applies to that fight at once', () => {
    render(<GameView storage={null} />);
    fireEvent.click(checkbox('Heroism / Bloodlust'));
    press('1'); // cast() starts the fight first, so Heroism (at 0) hastes this very cast
    advance(1840);
    expect(castBar()).not.toBeNull();
    advance(60); // 1900: past 1870
    expect(castBar()).toBeNull();
  });

  it('storage unavailable (throws): the app still works and keeps settings in memory', () => {
    const { storage } = memoryStorage({}, true);
    render(<GameView storage={storage} />);
    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(storage.setItem).toHaveBeenCalled();
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    expect(distanceInput().value).toBe('0');
    expect(screen.getByText(NOTE_WITH_BUFFS)).toBeTruthy();

    press('1');
    advance(2500); // at 0 yd the bolt lands at its cast end (2431)
    expect(Number(screen.getByLabelText('Total damage').textContent?.replace(/\D/g, ''))).toBeGreaterThan(0);
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
  });

  it('the DPS note changes with the enabled buffs and the preset name is shown in the summary', () => {
    render(<GameView storage={null} />);
    expect(screen.getByText(NOTE_NO_BUFFS)).toBeTruthy();
    expect(screen.queryByText(NOTE_WITH_BUFFS)).toBeNull();
    expect(screen.getAllByText('Setup: None')).toHaveLength(1);

    // Warlock options are not buffs: the note stays.
    fireEvent.click(screen.getByRole('radio', { name: 'No armor' }));
    expect(screen.getByText(NOTE_NO_BUFFS)).toBeTruthy();
    expect(screen.getByText('Setup: Custom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByText('Setup: None')).toBeTruthy();

    fireEvent.click(checkbox('Misery'));
    expect(screen.getByText(NOTE_WITH_BUFFS)).toBeTruthy();
    expect(screen.queryByText(NOTE_NO_BUFFS)).toBeNull();
    expect(screen.getByText('Setup: Custom')).toBeTruthy();

    press('1');
    advance(61000);
    const summary = screen.getByRole('region', { name: 'Fight summary' });
    expect(within(summary).getByText(NOTE_WITH_BUFFS)).toBeTruthy();
    expect(within(summary).getByText('Setup: Custom')).toBeTruthy();

    // The ended fight keeps its note and name; the next one shows the new setup.
    fireEvent.click(checkbox('Misery'));
    expect(within(summary).getByText(NOTE_WITH_BUFFS)).toBeTruthy();
    expect(within(summary).getByText('Setup: Custom')).toBeTruthy();
    press('r');
    expect(screen.getByText(NOTE_NO_BUFFS)).toBeTruthy();
    expect(screen.getByText('Setup: None')).toBeTruthy();
  });

  it("keys typed into the panel's inputs do not cast", () => {
    render(<GameView storage={null} />);
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)')); // enables the Life Tap number
    const inputs = () => [
      spin('Heroism / Bloodlust start (s)'),
      spin('Heroism / Bloodlust duration (s)'),
      spin('Life Tap below mana'),
      distanceInput(),
    ];
    for (const input of inputs()) {
      for (const key of ['1', '6', ' ', 'r', 'Escape']) {
        fireEvent.keyDown(input, { key });
        expect(castBar(), `${key} in ${input.getAttribute('aria-label') ?? input.id}`).toBeNull();
        expect(startOverlay()).not.toBeNull();
      }
    }
    // Space and Enter on a buff checkbox or an armor radio belong to it: they do not start the fight.
    for (const toggle of [checkbox('Misery'), screen.getByRole('radio', { name: 'Fel Armor' })]) {
      fireEvent.keyDown(toggle, { key: ' ' });
      fireEvent.keyDown(toggle, { key: 'Enter' });
      expect(startOverlay()).not.toBeNull();
    }

    // In a running fight, digits typed into a start field neither cast nor reset.
    press('1');
    advance(500);
    for (const input of inputs()) {
      fireEvent.keyDown(input, { key: '2' });
      fireEvent.keyDown(input, { key: 'r' });
      expect(castBar()?.textContent).toContain('Shadow Bolt');
      expect(screen.getByLabelText('Elapsed').textContent).toBe('0.5 / 60s');
    }
  });

  it('target debuffs and timed buffs show their icons; a whole-fight debuff shows the time to the fight end, not an hour', () => {
    render(<GameView storage={null} />);
    fireEvent.click(checkbox('Misery'));
    fireEvent.click(checkbox('Heroism / Bloodlust'));
    press('1');
    advance(100);

    const misery = auraChip('Target debuffs', 'Misery');
    expect(misery?.querySelector('img')?.getAttribute('src')).toContain('/icons/spells/spell_shadow_misery.jpg');
    expect(misery?.querySelector('.aura-time')?.textContent).toBe('60s'); // 59.9 s left in the fight
    const heroism = selfBuff(HEROISM);
    expect(heroism?.querySelector('img')?.getAttribute('src')).toContain('/icons/spells/ability_shaman_heroism.jpg');
    expect(heroism?.querySelector('.buff-time')?.textContent).toBe('40s');

    advance(30000); // 30.1 s: 29.9 s of the fight left
    expect(auraChip('Target debuffs', 'Misery')?.querySelector('.aura-time')?.textContent).toBe('30s');
    advance(25000); // 55.1 s
    expect(auraChip('Target debuffs', 'Misery')?.querySelector('.aura-time')?.textContent).toBe('5s');
  });

  it('the shown crit includes the crit modifiers (Moonkin Aura, Totem of Wrath), as the simulation rolls it', () => {
    render(<GameView storage={null} />);
    const spellCrit = statValue('Spell crit');
    const boltCrit = statValue('Shadow Bolt crit');
    expect(boltCrit).toBeGreaterThan(spellCrit); // Devastation adds to destruction spells only

    fireEvent.click(checkbox('Moonkin Aura'));
    // +5% (modifier) and +20 crit rating.
    expect(statValue('Spell crit')).toBeCloseTo(spellCrit + 5 + 20 / CRIT_RATING_PER_PCT, 1);
    fireEvent.click(checkbox('Totem of Wrath'));
    expect(statValue('Spell crit')).toBeCloseTo(spellCrit + 8 + 20 / CRIT_RATING_PER_PCT, 1);
    expect(statValue('Shadow Bolt crit')).toBeCloseTo(boltCrit + 8 + 20 / CRIT_RATING_PER_PCT, 1);
  });

  it('a running fight keeps the auras and icons of its own setup when the setup changes', () => {
    render(<GameView storage={null} />);
    fireEvent.click(checkbox('Misery'));
    press('1');
    advance(100);
    fireEvent.click(checkbox('Misery')); // off for the next fight
    advance(100);
    const misery = auraChip('Target debuffs', 'Misery');
    expect(misery).toBeDefined();
    expect(misery?.querySelector('img')?.getAttribute('src')).toContain('spell_shadow_misery.jpg');
  });

  it('the default stored setup equals DEFAULT_SETUP after a round trip through the panel', () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} />);
    fireEvent.click(checkbox('Misery'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(stored(map)).toEqual(DEFAULT_SETUP);
  });

  it('Space on a focused setup button presses it and does not start the fight', () => {
    render(<GameView storage={null} />);
    const reset = screen.getByRole('button', { name: 'Reset to defaults' });
    fireEvent.keyDown(reset, { key: ' ' });
    expect(startOverlay()).not.toBeNull();
    fireEvent.keyDown(reset, { key: '1' }); // other hotkeys still reach the action bar
    expect(castBar()).not.toBeNull();
  });

  it('the pending-setup note follows the config: gone when an edit is undone, "finished" after the end', () => {
    render(<GameView storage={null} />);
    press('1');
    advance(500);
    const note = () => document.querySelector('.setup-pending')?.textContent ?? null;
    expect(note()).toBeNull();
    fireEvent.click(checkbox('Misery'));
    expect(note()).toMatch(/^The running fight keeps its setup/);
    fireEvent.click(checkbox('Misery')); // back to what the fight uses
    expect(note()).toBeNull();
    fireEvent.click(checkbox('Misery'));
    advance(61_000);
    expect(note()).toMatch(/^The finished fight keeps its setup/);
  });
});

describe('Target debuffs: own aura under the raid one', () => {
  /** The visible names of the target's aura chips. */
  const chipNames = () =>
    within(screen.getByRole('list', { name: 'Target debuffs' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.aura-name')?.textContent);
  const views = {
    'isb-from-others': { auraId: 'isb-from-others', stacks: 1, charges: 0, remainingMs: 3_600_000 },
    'shadow-vulnerability': { auraId: 'shadow-vulnerability', stacks: 1, charges: 4, remainingMs: 12_000 },
  };
  const specFor = (enabledBuffs: string[]) =>
    applySetup({
      buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t),
      catalog: SETUP_CATALOG,
      config: normalizeSetup({ ...structuredClone(DEFAULT_SETUP), enabledBuffs }, SETUP_CATALOG),
    }).spec;

  it("the own Shadow Vulnerability chip says it adds nothing while 'Shadow Vulnerability (raid)' is on (ruling S2)", () => {
    render(<TargetPanel spec={specFor(['isb-from-others'])} targetAuras={views} fightRemainingMs={30_000} />);
    expect(chipNames()).toEqual(['Shadow Vulnerability (raid)', 'Shadow Vulnerability (no extra effect)']);
    cleanup();

    // Without the raid debuff the own aura counts and has no note.
    render(
      <TargetPanel
        spec={specFor([])}
        targetAuras={{ 'shadow-vulnerability': views['shadow-vulnerability'] }}
        fightRemainingMs={30_000}
      />,
    );
    expect(chipNames()).toEqual(['Shadow Vulnerability']);
  });
});

describe('Fight length (item actions and fight settings, Task 3)', () => {
  /** A stored setup, as GameView loads it at mount. */
  const storedSetup = (p: Partial<SetupConfig>) =>
    memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p }) }).storage;
  const elapsed = () => screen.getByLabelText('Elapsed').textContent;
  const digits = (label: string, root: HTMLElement = document.body) =>
    Number(within(root).getByLabelText(label).textContent?.replace(/[^0-9.]/g, ''));

  it('a 30 s fight: the label reads "/ 30s", the fight ends at 30 s and the summary DPS uses 30 s', () => {
    render(<GameView storage={storedSetup({ fightDurationSec: 30 })} />);
    expect(elapsed()).toBe('0.0 / 30s');
    press('1');
    advance(10_000);
    expect(elapsed()).toBe('10.0 / 30s');
    advance(19_000);
    expect(screen.queryByRole('region', { name: 'Fight summary' })).toBeNull();
    advance(2_000);
    const summary = screen.getByRole('region', { name: 'Fight summary' });
    expect(within(summary).getByLabelText('Duration').textContent).toBe('30.0 s');
    expect(elapsed()).toBe('30.0 / 30s');
    const damage = digits('Total damage', summary);
    expect(damage).toBeGreaterThan(0);
    expect(digits('DPS', summary)).toBeCloseTo(damage / 30, 0);
  });

  it('a 30 s fight with Heroism at 10 s: a Shadow Bolt started at 12 s is hasted', () => {
    render(
      <GameView
        storage={storedSetup({
          fightDurationSec: 30,
          enabledBuffs: ['heroism'],
          timed: { heroism: { startSec: 10, durationSec: 40 } },
        })}
      />,
    );
    press('1'); // 0: unhasted bolt, 2431 ms
    advance(2_500);
    expect(castBar()).toBeNull();
    expect(selfBuff(HEROISM)).toBeUndefined();
    advance(9_500); // 12 s
    expect(selfBuff(HEROISM)).toBeDefined();
    press('1');
    advance(1_840);
    expect(castBar()).not.toBeNull();
    advance(60); // past 1870 ms, long before 2431 ms
    expect(castBar()).toBeNull();
  });

  it('a 30 s fight with Heroism at 45 s: it never applies, and the panel warns against the chosen length', () => {
    render(
      <GameView
        storage={storedSetup({
          fightDurationSec: 30,
          enabledBuffs: ['heroism'],
          timed: { heroism: { startSec: 45, durationSec: 40 } },
        })}
      />,
    );
    expect(screen.getByText('Starts after the fight ends (30 s): no effect.')).toBeTruthy();
    press('1');
    advance(26_000);
    press('1'); // 26 s: still unhasted
    advance(1_900);
    expect(castBar()).not.toBeNull();
    expect(selfBuff(HEROISM)).toBeUndefined();
    advance(3_000);
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    expect(selfBuff(HEROISM)).toBeUndefined();
  });

  it('changing the length in the panel applies to a not-started fight at once and after R to a running one; it is saved', () => {
    const { storage, map } = memoryStorage();
    render(<GameView storage={storage} />);
    const length = () => spin('Fight length (s)');
    fireEvent.change(length(), { target: { value: '30' } });
    expect(elapsed()).toBe('0.0 / 30s'); // not started: at once
    expect(stored(map).fightDurationSec).toBe(30);

    press('1');
    advance(1_000);
    fireEvent.change(length(), { target: { value: '45' } });
    expect(elapsed()).toBe('1.0 / 30s'); // the running fight keeps its length
    expect(document.querySelector('.setup-pending')?.textContent).toMatch(/^The running fight keeps its setup/);
    advance(30_000);
    expect(within(screen.getByRole('region', { name: 'Fight summary' })).getByLabelText('Duration').textContent).toBe('30.0 s');

    press('r');
    expect(elapsed()).toBe('0.0 / 45s');
    expect(stored(map).fightDurationSec).toBe(45);

    // Kept on the next mount.
    cleanup();
    render(<GameView storage={storage} />);
    expect(length().value).toBe('45');
    expect(elapsed()).toBe('0.0 / 45s');
  });

  it('a length changed during a running fight: the Heroism warning uses the new length at once', () => {
    render(
      <GameView storage={storedSetup({ enabledBuffs: ['heroism'], timed: { heroism: { startSec: 40, durationSec: 40 } } })} />,
    );
    expect(screen.queryByText(/starts after the fight ends/i)).toBeNull(); // 40 s in a 60 s fight
    press('1');
    advance(500);
    fireEvent.change(spin('Fight length (s)'), { target: { value: '30' } });
    expect(screen.getByText('Starts after the fight ends (30 s): no effect.')).toBeTruthy();
    expect(elapsed()).toBe('0.5 / 60s'); // the running fight is still 60 s long
    fireEvent.change(spin('Fight length (s)'), { target: { value: '41' } });
    expect(screen.queryByText(/starts after the fight ends/i)).toBeNull();
  });

  it('a 120 s fight: runs past 60 s, mana regen ticks and a second Life Tap work, ends at 120 s', () => {
    render(<GameView storage={storedSetup({ fightDurationSec: 120 })} />);
    expect(elapsed()).toBe('0.0 / 120s');
    const mana = () => Number(screen.getByRole('progressbar', { name: 'Mana' }).getAttribute('aria-valuenow'));
    press('1');
    advance(61_000);
    expect(screen.queryByRole('region', { name: 'Fight summary' })).toBeNull();
    expect(elapsed()).toBe('61.0 / 120s');
    press('1'); // a Shadow Bolt spends mana
    advance(2_500);
    const afterBolt = mana();
    advance(10_000); // regen ticks (spirit regen back after the five-second rule)
    expect(mana()).toBeGreaterThan(afterBolt);
    const beforeTap = mana();
    press('6'); // Life Tap
    expect(mana()).toBeGreaterThan(beforeTap);
    advance(30_000); // 103.5 s: full again
    press('1');
    advance(2_500); // 106 s: the bolt spent mana
    const beforeSecondTap = mana();
    press('6');
    expect(mana()).toBeGreaterThan(beforeSecondTap);
    advance(20_000);
    const summary = screen.getByRole('region', { name: 'Fight summary' });
    expect(within(summary).getByLabelText('Duration').textContent).toBe('120.0 s');
    expect(elapsed()).toBe('120.0 / 120s');
  });
});

describe('Your buffs panel in the game view (player buffs panel, Task 2)', () => {
  /** A stored setup, as GameView loads it at mount. */
  const storedSetup = (p: Partial<SetupConfig>) =>
    memoryStorage({ [SETUP_STORAGE_KEY]: JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p }) }).storage;
  const heroismAt = (startSec: number) => ({ heroism: { startSec, durationSec: 40 } });
  const fightMs = () => Math.round(Number((screen.getByLabelText('Elapsed').textContent ?? '').split(' / ')[0]) * 1000);
  const barWidth = (li: HTMLElement | undefined) =>
    Number.parseFloat((li?.querySelector('.buff-bar-fill') as HTMLElement | null)?.style.width ?? 'NaN');
  const activeNames = () =>
    [...buffsPanel().querySelectorAll('.buffs-active .buff-name')].map((el) => el.textContent ?? '');
  const setupSummary = () => within(buffsPanel()).queryByText(/^Setup buffs \(\d+\)$/);

  it('Heroism enabled at 6 s: before the start the panel lists it as upcoming "at 6.0 s"; at 3 s of fight it says "in 3.0 s"; at 6 s it moves to active with about 40 s left and a bar near 100%; at 46 s it is gone', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['heroism'], timed: heroismAt(6) })} />);
    expect(upcomingTexts()).toEqual([`${HEROISM} at 6.0 s`]);
    expect(within(buffsPanel()).getByText('No active buffs')).toBeTruthy();

    press(' ');
    advance(3000);
    expect(upcomingTexts()).toEqual([`${HEROISM} in 3.0 s`]);
    expect(selfBuff(HEROISM)).toBeUndefined();

    // Frame by frame (1 ms steps) around the start: never both lists, never neither.
    advance(2900);
    let firstActive: HTMLElement | undefined;
    for (let t = 0; t < 200; t++) {
      advance(1);
      const up = upcomingTexts().length === 1;
      const active = selfBuff(HEROISM);
      expect(up !== (active !== undefined), `at ${fightMs()} ms`).toBe(true);
      if (active && !firstActive) {
        firstActive = active;
        expect(fightMs()).toBeGreaterThanOrEqual(6000);
        expect(active.getAttribute('aria-label')).toBe(`${HEROISM}, 40 seconds left`);
        expect(active.querySelector('.buff-time')?.textContent).toBe('40s');
        expect(barWidth(active)).toBeGreaterThanOrEqual(99);
      }
      if (!active) expect(fightMs()).toBeLessThanOrEqual(6000); // the label rounds to 0.1 s
    }
    expect(firstActive).toBeDefined();
    expect(upcomingTexts()).toEqual([]);

    advance(20_000); // about 26.1 s: 19.9 s left of 40, the bar about half
    const half = barWidth(selfBuff(HEROISM));
    expect(half).toBeGreaterThan(45);
    expect(half).toBeLessThan(55);
    advance(19_700); // about 45.8 s: expiring
    expect(selfBuff(HEROISM)?.classList.contains('buff-expiring')).toBe(true);
    advance(300); // about 46.1 s
    expect(selfBuff(HEROISM)).toBeUndefined();
    expect(upcomingTexts()).toEqual([]);
  });

  it('Heroism at 0: upcoming "at 0.0 s" before the start, active from the first frame of the fight', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['heroism'], timed: heroismAt(0) })} />);
    expect(upcomingTexts()).toEqual([`${HEROISM} at 0.0 s`]);
    expect(selfBuff(HEROISM)).toBeUndefined();
    press(' ');
    expect(upcomingTexts()).toEqual([]);
    expect(selfBuff(HEROISM)?.getAttribute('aria-label')).toBe(`${HEROISM}, 40 seconds left`);
  });

  it('item auras appear after use: using Icon from the item bar shows its aura with 20 s counting down; Destruction Potion 15 s', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['destruction-potion', 'icon-of-the-silver-crescent'] })} />);
    const DP = 'Destruction Potion';
    const ICON = 'Icon of the Silver Crescent';
    expect(within(buffsPanel()).getByText('No active buffs')).toBeTruthy();
    press('z'); // starts the fight
    expect(selfBuff(DP)?.getAttribute('aria-label')).toBe(`${DP}, 15 seconds left`);
    advance(2000);
    press('x');
    expect(selfBuff(ICON)?.getAttribute('aria-label')).toBe(`${ICON}, 20 seconds left`);
    expect(selfBuff(ICON)?.querySelector('.buff-time')?.textContent).toBe('20s');
    // The item's icon since gear item effects Task 2 (stage F: the buff's inv_trinket_naxxramas06),
    // served from public/icons/items/ (Task 3).
    expect(selfBuff(ICON)?.querySelector('img')?.getAttribute('src')).toContain('/icons/items/inv_weapon_shortblade_23.jpg');
    expect(activeNames()).toEqual([DP, ICON]); // first used first

    advance(8000); // 10 s: the potion has 5 s left, the Icon 12 s
    expect(selfBuff(DP)?.querySelector('.buff-time')?.textContent).toBe('5.0s');
    expect(selfBuff(ICON)?.getAttribute('aria-label')).toBe(`${ICON}, 12 seconds left`);
    advance(1000); // 11 s: below 5 s, the potion pulses
    expect(selfBuff(DP)?.classList.contains('buff-expiring')).toBe(true);
    expect(selfBuff(ICON)?.classList.contains('buff-expiring')).toBe(false);
    expect(barWidth(selfBuff(DP))).toBeLessThan(30);
    advance(4100); // 15.1 s: the potion is gone, the Icon has about 6.9 s
    expect(selfBuff(DP)).toBeUndefined();
    expect(selfBuff(ICON)?.querySelector('.buff-time')?.textContent).toMatch(/^[67]\.\ds$/);
    advance(7000); // 22.1 s
    expect(selfBuff(ICON)).toBeUndefined();
  });

  it('Band proc (seeded) shows its +95 aura for 10 s when it procs and its hidden ICD aura is never shown', () => {
    render(<GameView storage={storedSetup({ enabledBuffs: ['band-of-the-eternal-sage'] })} />);
    const BAND = 'Band of the Eternal Sage';
    const noIcd = () => expect(buffsPanel().textContent ?? '').not.toMatch(/internal cooldown/i);
    noIcd();
    // A 10% roll per landed spell: up to five fights of twelve Shadow Bolts (each fight has its
    // own seed), stopping at the first proc. The test checks every 200 ms.
    let procAt: number | null = null;
    for (let fight = 0; fight < 5 && procAt === null; fight++) {
      if (fight > 0) press('r');
      for (let bolt = 0; bolt < 12 && procAt === null; bolt++) {
        press('1');
        for (let step = 0; step < 13 && procAt === null; step++) {
          advance(200);
          noIcd();
          expect(activeNames().every((n) => n === BAND)).toBe(true);
          const band = selfBuff(BAND);
          if (band) {
            procAt = fightMs();
            expect(band.getAttribute('aria-label')).toBe(`${BAND}, 10 seconds left`);
            expect(band.getAttribute('title')).toContain('+95 spell power');
            expect(barWidth(band)).toBeGreaterThanOrEqual(99);
          }
        }
      }
    }
    expect(procAt, 'a seeded fight procs the Band').not.toBeNull();
    advance(9500); // seen at most 200 ms after the proc: still up
    expect(selfBuff(BAND)).toBeDefined();
    advance(600); // more than 10 s after the proc
    expect(selfBuff(BAND)).toBeUndefined();
    expect(activeNames()).toEqual([]);
    noIcd(); // the 60 s internal cooldown is running, unseen
  }, 30_000); // up to a few fights of real-time frames

  it('permanent setup buffs section counts the enabled stat-only buffs; toggling a buff updates it for a not-started fight and not for a running one (pending note rules)', () => {
    render(<GameView storage={null} />);
    expect(setupSummary()).toBeNull(); // none enabled: no section
    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(setupSummary()?.textContent).toBe('Setup buffs (1)');
    // Timed, item and target buffs are not "setup buffs".
    for (const name of [HEROISM, 'Misery', 'Destruction Potion', 'Band of the Eternal Sage']) fireEvent.click(checkbox(name));
    expect(setupSummary()?.textContent).toBe('Setup buffs (1)');
    fireEvent.click(checkbox('Blessing of Kings'));
    expect(setupSummary()?.textContent).toBe('Setup buffs (2)');
    const details = setupSummary()?.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(
      within(details)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Arcane Brilliance', 'Blessing of Kings']);

    press('1');
    advance(500);
    fireEvent.click(checkbox('Gift of the Wild')); // for the next fight
    advance(100); // new snapshots: the panel still shows the running fight's setup
    expect(document.querySelector('.setup-pending')?.textContent).toMatch(/^The running fight keeps its setup/);
    expect(setupSummary()?.textContent).toBe('Setup buffs (2)'); // not 3
    fireEvent.click(checkbox('Divine Spirit (Prayer of Spirit)'));
    advance(100);
    expect(setupSummary()?.textContent).toBe('Setup buffs (2)'); // not 4
    fireEvent.click(checkbox('Divine Spirit (Prayer of Spirit)'));
    fireEvent.click(checkbox('Arcane Brilliance'));
    press('r');
    expect(setupSummary()?.textContent).toBe('Setup buffs (2)'); // Gift of the Wild and Blessing of Kings
    expect(
      within(setupSummary()?.closest('details') as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Gift of the Wild', 'Blessing of Kings']);
  });

  it("fight length 30 s: upcoming at 45 s is not shown; an active aura's time left never exceeds the fight's remaining time", () => {
    render(<GameView storage={storedSetup({ fightDurationSec: 30, enabledBuffs: ['heroism'], timed: heroismAt(45) })} />);
    expect(upcomingTexts()).toEqual([]);
    press(' ');
    advance(1000);
    expect(upcomingTexts()).toEqual([]);
    expect(selfBuff(HEROISM)).toBeUndefined();
    cleanup();

    // Heroism at 10 s in a 30 s fight: 40 s of its own, cut to the 20 s the fight has left.
    render(<GameView storage={storedSetup({ fightDurationSec: 30, enabledBuffs: ['heroism'], timed: heroismAt(10) })} />);
    expect(upcomingTexts()).toEqual([`${HEROISM} at 10.0 s`]);
    press(' ');
    advance(10_100);
    for (let i = 0; i < 40; i++) {
      const heroism = selfBuff(HEROISM);
      const left = Number(/, (\d+) seconds? left$/.exec(heroism?.getAttribute('aria-label') ?? '')?.[1]);
      expect(left, `at ${fightMs()} ms`).toBeLessThanOrEqual(Math.ceil((30_000 - fightMs() + 50) / 1000));
      advance(487);
    }
    expect(fightMs()).toBeGreaterThan(29_000);
    expect(selfBuff(HEROISM)?.classList.contains('buff-expiring')).toBe(true); // the fight's end is near, not the aura's
    advance(1_000); // ended: the summary shows, the panel holds no upcoming entry
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    expect(upcomingTexts()).toEqual([]);
  });

  it('Heroism starting exactly at the fight end (the Setup panel says "no effect") is never upcoming and never shown, not even in the ended fight', () => {
    render(<GameView storage={storedSetup({ fightDurationSec: 30, enabledBuffs: ['heroism'], timed: heroismAt(30) })} />);
    expect(screen.getByText('Starts after the fight ends (30 s): no effect.')).toBeTruthy();
    expect(upcomingTexts()).toEqual([]);
    press(' ');
    advance(29_900);
    expect(upcomingTexts()).toEqual([]);
    advance(200);
    expect(screen.getByRole('region', { name: 'Fight summary' })).toBeTruthy();
    expect(selfBuff(HEROISM)).toBeUndefined();
    expect(within(buffsPanel()).getByText('No active buffs')).toBeTruthy();
  });

  it('the panel follows the running fight, not the pending setup: Heroism enabled mid-fight is neither upcoming nor active until R', () => {
    render(<GameView storage={storedSetup({ fightDurationSec: 30 })} />);
    press('1');
    advance(500);
    fireEvent.click(checkbox(HEROISM));
    fireEvent.change(spin('Heroism / Bloodlust start (s)'), { target: { value: '5' } });
    advance(100);
    expect(upcomingTexts()).toEqual([]); // the next fight's, not this one's
    advance(5000);
    expect(upcomingTexts()).toEqual([]);
    expect(selfBuff(HEROISM)).toBeUndefined();
    press('r');
    expect(upcomingTexts()).toEqual([`${HEROISM} at 5.0 s`]);
  });
});
