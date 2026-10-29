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
    expect(auraChip('Buffs', 'Heroism')).toBeUndefined();
    advance(500); // 2500
    expect(castBar()).toBeNull();

    press('r');
    expect(screen.queryByText(/applies from the next fight/i)).toBeNull();
    press('1');
    expect(auraChip('Buffs', 'Heroism')).toBeDefined();
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
    const heroism = auraChip('Buffs', 'Heroism');
    expect(heroism?.querySelector('img')?.getAttribute('src')).toContain('/icons/spells/ability_shaman_heroism.jpg');
    expect(heroism?.querySelector('.aura-time')?.textContent).toBe('40s');

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
      buildSpec: buildDestructionWarlock,
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
