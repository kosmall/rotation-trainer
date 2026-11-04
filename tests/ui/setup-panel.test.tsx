// The Setup editors (src/ui/SetupPanel.tsx: the preset bar and the groups the Setup screen's
// sections host). Until the redesign's Task 5 these tests rendered the legacy collapsed "Setup"
// panel and the legacy layout (GameView); the panel was a container of these same groups, so the
// unit tests now mount the groups directly (`Groups`, each in a group named like the Setup screen's
// card), and the wiring tests run in the app (renderApp) on the Setup sections and the Fight screen.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { DEFAULT_SETUP, setupCatalogFor, SETUP_LIMITS } from '../../src/setup/defaults';
import { DEFAULT_GEAR } from '../../src/setup/gear';
import { isAlwaysBoundGearEntry } from '../../src/setup/gearEffects';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig, SetupPresetId } from '../../src/setup/types';
import type { BuffDef } from '../../src/data/types';
import { SETUP_STORAGE_KEY, type SetupStorage } from '../../src/setup/storage';
import {
  BUFF_GROUPS,
  BuffGroup,
  DistanceField,
  FightGroup,
  ItemsGroup,
  RotationGroup,
  SetupPresetBar,
  WarlockOptionsGroup,
} from '../../src/ui/SetupPanel';
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
/** Opens a Setup section of the app. */
async function setupAt(section: string) {
  goTo(`#/setup/${section}`);
  await settle();
}
/** An in-memory setup storage; `stored()` reads the config the app saved last. */
function memoryStorage() {
  const map = new Map<string, string>();
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, stored: () => JSON.parse(map.get(SETUP_STORAGE_KEY) ?? 'null') as SetupConfig };
}
/** "Reset to Defaults…" on Setup → Buffs & consumables, confirmed. */
function resetToDefaults() {
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults…' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset to Defaults' }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: /^start the fight$/i });
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));
const totalDamage = () => amount(screen.getByLabelText('Total damage'));

const presetSelect = () => screen.getByRole('combobox', { name: 'Rotation preset' }) as HTMLSelectElement;
const curseSelect = () => screen.getByRole('combobox', { name: 'Curse' }) as HTMLSelectElement;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
/** A worn on-use gear effect's checkbox: "Use automatically (bot, simulator)" (it is always on the item row). */
const AUTO = ': use automatically (bot, simulator)';
const ICON_AUTO = `Icon of the Silver Crescent${AUTO}`;
/** The accessible name of an entry's checkbox. */
const boxName = (b: BuffDef) => (isAlwaysBoundGearEntry(b) ? `${b.name}${AUTO}` : b.name);
const distanceInput = () => screen.getByRole('spinbutton', { name: 'Distance from target (yd)' }) as HTMLInputElement;
const lifeTapInput = () => screen.getByRole('spinbutton', { name: 'Life Tap below mana' }) as HTMLInputElement;
const startInput = (buffName: string) => screen.getByRole('spinbutton', { name: `${buffName} start (s)` }) as HTMLInputElement;
const durationInput = (buffName: string) =>
  screen.getByRole('spinbutton', { name: `${buffName} duration (s)` }) as HTMLInputElement;
const activePreset = () => screen.getByLabelText('Active preset').textContent;
const fightLengthInput = () => screen.getByRole('spinbutton', { name: 'Fight length (s)' }) as HTMLInputElement;

/** The catalog GameView passes for the author's gear: the static entries, then the derived Icon and Band (gear item effects Task 3). */
const CATALOG = setupCatalogFor(DEFAULT_GEAR);

const buff = (id: string): BuffDef => {
  const b = CATALOG.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
};

/** The labels of the steps of Setup → Rotation's "Priority" list (the legacy Priority panel), in order. */
function priorityLabels(): string[] {
  return within(screen.getByRole('list', { name: 'Priority' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('strong')?.textContent ?? '');
}

type Presets = Readonly<Record<SetupPresetId, { name: string; description?: string; config: SetupConfig }>>;

/**
 * The Setup editors as the Setup screen hosts them: the preset bar, then each group in a group
 * named like its Setup screen card. `disabled` puts them in a disabled fieldset.
 */
function Groups({
  config,
  onChange,
  presets = SETUP_PRESETS,
  disabled = false,
}: {
  config: SetupConfig;
  onChange(c: SetupConfig): void;
  presets?: Presets;
  disabled?: boolean;
}) {
  const group = { catalog: CATALOG, config, onChange };
  const card = (title: string, body: ReactNode) => (
    <section role="group" aria-label={title} key={title}>
      {body}
    </section>
  );
  return (
    <fieldset disabled={disabled}>
      <SetupPresetBar {...group} presets={presets} />
      {card('Fight', <FightGroup {...group} />)}
      {BUFF_GROUPS.map((g) => card(g.title, g.id === 'items' ? <ItemsGroup {...group} /> : <BuffGroup {...group} group={g.id} />))}
      {card('Warlock options', <WarlockOptionsGroup {...group} />)}
      {card('Rotation', <RotationGroup {...group} />)}
      {card('Distance', <DistanceField {...group} />)}
    </fieldset>
  );
}

/** The groups with their own config state, as the trainer holds it; the spy sees every config passed on (normalized). */
function Harness({
  onChange,
  initial = DEFAULT_SETUP,
  presets = SETUP_PRESETS,
}: {
  onChange(c: SetupConfig): void;
  initial?: SetupConfig;
  presets?: Presets;
}) {
  const [config, setConfig] = useState<SetupConfig>(() => structuredClone(initial));
  return (
    <Groups
      config={config}
      presets={presets}
      onChange={(c) => {
        onChange(c);
        setConfig(c);
      }}
    />
  );
}

/** The config of the last onChange call. */
const last = (spy: ReturnType<typeof vi.fn>): SetupConfig => spy.mock.calls.at(-1)?.[0] as SetupConfig;

describe('Setup editors', () => {
  it('Rotation shows the preset selector, a curse selector, checkboxes for Immolate, Corruption and Shadowburn finisher, a Life Tap threshold; Fight settings the distance', async () => {
    renderApp({ route: '#/setup/rotation' });
    await settle();
    expect(presetSelect().value).toBe('dot');
    expect(within(presetSelect()).getByRole('option', { name: 'DoT rotation' })).toBeTruthy();
    expect(within(presetSelect()).getByRole('option', { name: 'Shadow Bolt spam + curse' })).toBeTruthy();
    expect(curseSelect().value).toBe('elements');
    expect(within(curseSelect()).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual([
      'elements',
      'agony',
      'doom',
      'none',
    ]);
    expect(checkbox('Immolate').checked).toBe(true);
    expect(checkbox('Corruption').checked).toBe(true);
    expect(checkbox('Shadowburn finisher').checked).toBe(true);
    expect(checkbox('Auto (Shadow Bolt cost)').checked).toBe(true);
    expect(lifeTapInput().disabled).toBe(true);
    expect(lifeTapInput().min).toBe('0');
    await setupAt('fight');
    expect(distanceInput().value).toBe('28');
    expect(distanceInput().min).toBe('0');
    expect(distanceInput().max).toBe('100');
  });

  it('choosing the sb-spam preset removes Immolate and Corruption from the Priority list', async () => {
    renderApp({ route: '#/setup/rotation' });
    await settle();
    expect(priorityLabels()).toEqual(destructionWarlock.priority.map((s) => s.label));
    expect(priorityLabels()).toContain('Immolate');

    fireEvent.change(presetSelect(), { target: { value: 'sb-spam' } });
    expect(presetSelect().value).toBe('sb-spam');
    expect(priorityLabels()).toEqual(['Curse of Doom', 'Shadowburn (finisher)', 'Life Tap', 'Shadow Bolt']);
    expect(curseSelect().value).toBe('doom');
    expect(checkbox('Immolate').checked).toBe(false);
    expect(checkbox('Corruption').checked).toBe(false);

    fireEvent.change(presetSelect(), { target: { value: 'dot' } });
    expect(priorityLabels()).toEqual(destructionWarlock.priority.map((s) => s.label));
  });

  it('changing a flag marks the preset as Custom', async () => {
    renderApp({ route: '#/setup/rotation' });
    await settle();
    expect(within(presetSelect()).queryByRole('option', { name: 'Custom' })).toBeNull();

    fireEvent.click(checkbox('Immolate'));
    expect(presetSelect().value).toBe('custom');
    expect(within(presetSelect()).getByRole('option', { name: 'Custom' })).toBeTruthy();
    expect(priorityLabels()).not.toContain('Immolate');

    // Back to exactly the preset's values: the preset is recognised again.
    fireEvent.click(checkbox('Immolate'));
    expect(presetSelect().value).toBe('dot');

    fireEvent.change(curseSelect(), { target: { value: 'agony' } });
    expect(presetSelect().value).toBe('custom');
    expect(priorityLabels()[0]).toBe('Curse of Agony');
    fireEvent.change(curseSelect(), { target: { value: 'none' } });
    expect(priorityLabels()).not.toContain('Curse of Agony');

    fireEvent.change(curseSelect(), { target: { value: 'elements' } });
    expect(presetSelect().value).toBe('dot');
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(presetSelect().value).toBe('custom');
    expect(lifeTapInput().disabled).toBe(false);
    fireEvent.change(lifeTapInput(), { target: { value: '2000' } });
    expect(screen.getByText('Below 2000 mana: Life Tap converts health into mana.')).toBeTruthy();
  });

  it('the Life Tap threshold ignores NaN/empty and clamps negatives to 0', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    const first = last(onChange).rotation;
    expect(typeof first.lifeTapBelowMana).toBe('number');
    expect(first.lifeTapBelowMana).toBeGreaterThanOrEqual(0);

    onChange.mockClear();
    fireEvent.change(lifeTapInput(), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(lifeTapInput(), { target: { value: '-50' } });
    expect(last(onChange).rotation.lifeTapBelowMana).toBe(0);
    fireEvent.change(lifeTapInput(), { target: { value: '1500.6' } });
    expect(last(onChange).rotation.lifeTapBelowMana).toBe(1501);
    for (const [config] of onChange.mock.calls as [SetupConfig][]) {
      expect(Number.isFinite(config.rotation.lifeTapBelowMana)).toBe(true);
    }

    // Auto again, then off: the last number comes back.
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(last(onChange).rotation.lifeTapBelowMana).toBe('auto');
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(last(onChange).rotation.lifeTapBelowMana).toBe(1501);
  });

  it('the Life Tap number offered after Auto follows the config (a number set from outside, e.g. a loaded setup)', () => {
    const onChange = vi.fn();
    const withLifeTap = (lifeTapBelowMana: number | 'auto'): SetupConfig => ({
      ...structuredClone(DEFAULT_SETUP),
      rotation: { ...DEFAULT_SETUP.rotation, lifeTapBelowMana },
    });
    const props = { presets: SETUP_PRESETS, onChange };
    const { rerender } = render(<Groups {...props} config={withLifeTap('auto')} />);
    rerender(<Groups {...props} config={withLifeTap(1234)} />);
    expect(lifeTapInput().value).toBe('1234');
    rerender(<Groups {...props} config={withLifeTap('auto')} />);
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(last(onChange).rotation.lifeTapBelowMana).toBe(1234);
  });

  it('the distance input clamps 0..100 and ignores NaN/empty (keeps the last valid value)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = distanceInput();

    fireEvent.change(input, { target: { value: '150' } });
    expect(last(onChange).distanceYd).toBe(100);
    fireEvent.blur(input);
    expect(distanceInput().value).toBe('100');

    fireEvent.change(input, { target: { value: '-5' } });
    expect(last(onChange).distanceYd).toBe(0);
    fireEvent.change(input, { target: { value: '12.5' } });
    expect(last(onChange).distanceYd).toBe(12.5);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'abc' } }); // a number input reports '' for this
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(distanceInput().value).toBe('12.5'); // the last valid value

    fireEvent.change(input, { target: { value: '0' } });
    expect(last(onChange).distanceYd).toBe(0);
  });

  it('every control is a form control a disabled fieldset disables', () => {
    render(<Groups config={DEFAULT_SETUP} onChange={() => {}} disabled />);
    for (const el of [
      presetSelect(),
      curseSelect(),
      checkbox('Immolate'),
      distanceInput(),
      checkbox('Arcane Brilliance'),
      startInput('Heroism / Bloodlust'),
      fightLengthInput(),
      screen.getByRole('radio', { name: 'Fel Armor' }),
      screen.getByRole('button', { name: 'Raid as in my log' }),
    ]) {
      expect(el.matches(':disabled')).toBe(true);
    }
  });

  it('every catalog group renders and toggling a buff calls onChange with it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    // Timed buffs (Heroism) are in the Fight group; item actions and item procs under Items.
    const expectedGroup = (b: BuffDef) =>
      b.timed
        ? 'Fight'
        : b.effect.action || b.group === 'item'
          ? 'Items and cooldowns'
        : b.group === 'debuff'
          ? 'Target debuffs'
          : b.group === 'consumable'
            ? 'Consumables'
            : b.group === 'warlock'
              ? 'Warlock options'
              : 'Raid and party';
    for (const name of ['Fight', 'Raid and party', 'Consumables', 'Target debuffs', 'Items and cooldowns', 'Warlock options', 'Rotation', 'Distance']) {
      expect(screen.getByRole('group', { name }), name).toBeTruthy();
    }
    for (const b of CATALOG) {
      const group = screen.getByRole('group', { name: expectedGroup(b) });
      const box = within(group).getByRole('checkbox', { name: boxName(b) }) as HTMLInputElement;
      expect(box.checked, b.id).toBe(false);
      // Its icon (with the initials tile underneath as the fallback) and its description.
      expect(box.closest('.setup-buff')?.querySelector('img')?.getAttribute('src'), b.id).toContain(
        `/icons/${b.iconKind === 'item' ? 'items' : 'spells'}/${b.icon}.jpg`, // gear item effects: item icons
      );
      expect(box.getAttribute('aria-describedby'), b.id).toBeTruthy();
      // Described by its description (an on-use gear effect: by the "always on the item bar" hint first).
      const described = (box.getAttribute('aria-describedby') as string).split(' ').map((id) => document.getElementById(id)?.textContent);
      expect(described.at(-1), b.id).toBe(b.description);
      if (isAlwaysBoundGearEntry(b)) expect(described[0], b.id).toMatch(/^Always available on the item bar \(Z X C V B N\)/);
    }
    // The item actions (used from the item bar) are listed with the items, not with the consumables.
    for (const name of ['Destruction Potion', 'Super Mana Potion', 'Dark Rune', ICON_AUTO]) {
      expect(within(screen.getByRole('group', { name: 'Items and cooldowns' })).getByRole('checkbox', { name })).toBeTruthy();
      expect(within(screen.getByRole('group', { name: 'Consumables' })).queryByRole('checkbox', { name })).toBeNull();
    }

    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange).enabledBuffs).toEqual(['arcane-brilliance']);
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
    fireEvent.click(checkbox('Misery'));
    expect(last(onChange).enabledBuffs).toEqual(['arcane-brilliance', 'misery']);
    fireEvent.click(checkbox('Arcane Brilliance'));
    expect(last(onChange).enabledBuffs).toEqual(['misery']);
    expect(checkbox('Arcane Brilliance').checked).toBe(false);

    // Warlock options.
    fireEvent.click(screen.getByRole('radio', { name: 'Demon Armor' }));
    expect(last(onChange).warlock).toEqual({ armor: 'demon', sacrificeSuccubus: true });
    fireEvent.click(checkbox('Sacrifice the Succubus (Demonic Sacrifice)'));
    expect(last(onChange).warlock).toEqual({ armor: 'demon', sacrificeSuccubus: false });
  });

  it('toggling a flask unchecks the enabled elixirs', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(checkbox('Elixir of Major Shadow Power'));
    fireEvent.click(checkbox('Elixir of Draenic Wisdom'));
    expect(last(onChange).enabledBuffs).toEqual(['elixir-of-major-shadow-power', 'elixir-of-draenic-wisdom']);

    fireEvent.click(checkbox('Flask of Pure Death'));
    expect(last(onChange).enabledBuffs).toEqual(['flask-of-pure-death']);
    expect(checkbox('Flask of Pure Death').checked).toBe(true);
    expect(checkbox('Elixir of Major Shadow Power').checked).toBe(false);
    expect(checkbox('Elixir of Draenic Wisdom').checked).toBe(false);

    // The other way round: an elixir replaces the flask; a second food replaces the first.
    fireEvent.click(checkbox('Elixir of Major Firepower'));
    expect(last(onChange).enabledBuffs).toEqual(['elixir-of-major-firepower']);
    fireEvent.click(checkbox('Blackened Basilisk'));
    fireEvent.click(checkbox('Skullfish Soup'));
    expect(last(onChange).enabledBuffs).toEqual(['elixir-of-major-firepower', 'skullfish-soup']);
    expect(checkbox('Blackened Basilisk').checked).toBe(false);
  });

  it('a timed buff shows its start second; typing 9999 or abc clamps/ignores', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const heroism = buff('heroism');
    expect(heroism.timed).toBeDefined();
    expect(startInput(heroism.name).value).toBe(String(heroism.timed?.defaultStartSec));
    expect(durationInput(heroism.name).value).toBe(String(heroism.timed?.durationSec));
    // Every timed buff has both inputs.
    for (const b of CATALOG.filter((x) => x.timed)) {
      expect(startInput(b.name).value).toBe(String(DEFAULT_SETUP.timed[b.id]?.startSec));
      expect(durationInput(b.name).value).toBe(String(DEFAULT_SETUP.timed[b.id]?.durationSec));
    }

    fireEvent.change(startInput(heroism.name), { target: { value: '6.4' } });
    expect(last(onChange).timed.heroism).toEqual({ startSec: 6.4, durationSec: 40 });
    fireEvent.change(startInput(heroism.name), { target: { value: '9999' } });
    expect(last(onChange).timed.heroism?.startSec).toBe(SETUP_LIMITS.startSec.max);
    fireEvent.blur(startInput(heroism.name));
    expect(startInput(heroism.name).value).toBe(String(SETUP_LIMITS.startSec.max));
    // Past the fight's end: the panel says it has no effect.
    expect(screen.getByText(/starts after the fight ends/i)).toBeTruthy();

    onChange.mockClear();
    fireEvent.change(startInput(heroism.name), { target: { value: 'abc' } });
    fireEvent.change(startInput(heroism.name), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(startInput(heroism.name));
    expect(startInput(heroism.name).value).toBe(String(SETUP_LIMITS.startSec.max));

    fireEvent.change(startInput(heroism.name), { target: { value: '-3' } });
    expect(last(onChange).timed.heroism?.startSec).toBe(0);
    fireEvent.change(durationInput(heroism.name), { target: { value: '0' } });
    expect(last(onChange).timed.heroism?.durationSec).toBe(SETUP_LIMITS.durationSec.min);
    fireEvent.change(durationInput(heroism.name), { target: { value: '1e9' } });
    expect(last(onChange).timed.heroism?.durationSec).toBe(SETUP_LIMITS.durationSec.max);
    // Editing the start does not enable the buff.
    expect(last(onChange).enabledBuffs).toEqual([]);
  });

  it('preset buttons set the config; editing afterwards shows Custom', () => {
    const raid: SetupConfig = {
      ...structuredClone(DEFAULT_SETUP),
      enabledBuffs: ['arcane-brilliance', 'heroism'],
      timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec: 6, durationSec: 40 } },
    };
    const presets: Presets = {
      none: { name: 'None', config: structuredClone(DEFAULT_SETUP) },
      'raid-log': { name: 'Raid as in my log', description: 'Approximate. Guessed: Arcane Brilliance.', config: raid },
    };
    const onChange = vi.fn();
    render(<Harness onChange={onChange} presets={presets} />);
    expect(activePreset()).toBe('None');
    expect(screen.queryByText(/Guessed: Arcane Brilliance/)).toBeNull(); // None has no description

    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(last(onChange)).toEqual(raid);
    expect(last(onChange)).not.toBe(raid); // a copy: the preset is never edited
    expect(activePreset()).toBe('Raid as in my log');
    expect(screen.getByText(/Guessed: Arcane Brilliance/)).toBeTruthy(); // the preset states what is a guess
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
    expect(checkbox('Heroism / Bloodlust').checked).toBe(true);
    expect(startInput('Heroism / Bloodlust').value).toBe('6');

    fireEvent.click(checkbox('Misery'));
    expect(activePreset()).toBe('Custom');
    fireEvent.click(checkbox('Misery'));
    expect(activePreset()).toBe('Raid as in my log');
    fireEvent.change(startInput('Heroism / Bloodlust'), { target: { value: '7' } });
    expect(activePreset()).toBe('Custom');
    fireEvent.change(distanceInput(), { target: { value: '20' } });
    expect(activePreset()).toBe('Custom');

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(last(onChange)).toEqual(DEFAULT_SETUP);
    expect(activePreset()).toBe('None');
    expect(checkbox('Arcane Brilliance').checked).toBe(false);
    expect(distanceInput().value).toBe('28');
    // A start second of a buff that is not enabled does not change the match (Heroism is off in
    // None; it is the only timed buff since the potion and the Icon became item actions).
    fireEvent.change(startInput('Heroism / Bloodlust'), { target: { value: '30' } });
    expect(activePreset()).toBe('None');
  });

  it('Fight group: length input clamps (abc ignored, 5 -> 10, 9999 -> 600), Heroism start/duration inputs behave as before, the warning appears when start > length; Items group no longer lists Heroism', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const fight = screen.getByRole('group', { name: 'Fight' });
    const length = within(fight).getByRole('spinbutton', { name: 'Fight length (s)' }) as HTMLInputElement;
    expect(length.value).toBe('60');
    expect(length.min).toBe(String(SETUP_LIMITS.fightDurationSec.min));
    expect(length.max).toBe(String(SETUP_LIMITS.fightDurationSec.max));
    expect([SETUP_LIMITS.fightDurationSec.min, SETUP_LIMITS.fightDurationSec.max]).toEqual([10, 600]);

    fireEvent.change(length, { target: { value: 'abc' } });
    fireEvent.change(length, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(length);
    expect(length.value).toBe('60');
    fireEvent.change(length, { target: { value: '5' } });
    expect(last(onChange).fightDurationSec).toBe(10);
    fireEvent.blur(length);
    expect(length.value).toBe('10');
    fireEvent.change(length, { target: { value: '9999' } });
    expect(last(onChange).fightDurationSec).toBe(600);
    fireEvent.blur(length);
    expect(length.value).toBe('600');
    fireEvent.change(length, { target: { value: '90.4' } });
    expect(last(onChange).fightDurationSec).toBe(90);
    fireEvent.blur(length);
    expect(length.value).toBe('90');
    expect(activePreset()).toBe('None'); // the length alone never changes the preset match

    // Heroism lives here now: its checkbox, start and duration, the same validation as before.
    const heroBox = within(fight).getByRole('checkbox', { name: 'Heroism / Bloodlust' }) as HTMLInputElement;
    expect(within(fight).getByRole('spinbutton', { name: 'Heroism / Bloodlust start (s)' })).toBe(startInput('Heroism / Bloodlust'));
    fireEvent.click(heroBox);
    expect(last(onChange).enabledBuffs).toEqual(['heroism']);
    fireEvent.change(startInput('Heroism / Bloodlust'), { target: { value: '70' } });
    expect(last(onChange).timed.heroism).toEqual({ startSec: 70, durationSec: 40 });
    expect(screen.queryByText(/starts after the fight ends/i)).toBeNull(); // 70 < 90
    fireEvent.change(length, { target: { value: '60' } });
    expect(screen.getByText('Starts after the fight ends (60 s): no effect.')).toBeTruthy();
    fireEvent.change(length, { target: { value: '70' } });
    expect(screen.getByText('Starts after the fight ends (70 s): no effect.')).toBeTruthy(); // at the end: never up
    fireEvent.change(length, { target: { value: '71' } });
    expect(screen.queryByText(/starts after the fight ends/i)).toBeNull();
    fireEvent.change(durationInput('Heroism / Bloodlust'), { target: { value: '0' } });
    expect(last(onChange).timed.heroism?.durationSec).toBe(SETUP_LIMITS.durationSec.min);

    // The Items group: no Heroism, the items used from the item bar and the Band (a proc).
    const items = screen.getByRole('group', { name: 'Items and cooldowns' });
    expect(within(items).queryByRole('checkbox', { name: 'Heroism / Bloodlust' })).toBeNull();
    expect(within(items).queryByRole('spinbutton')).toBeNull();
    for (const name of ['Destruction Potion', 'Super Mana Potion', 'Dark Rune', ICON_AUTO, 'Band of the Eternal Sage']) {
      expect(within(items).getByRole('checkbox', { name })).toBeTruthy();
    }
    expect(items.textContent).toContain('item row (Z X C V B N;'); // 6 slots since gear item effects
    expect(items.textContent).toContain('Use automatically (bot, simulator)');
    expect(items.textContent).not.toMatch(/you do not press/i);

    // The legacy panel listed "Fight" first; on the Setup screen it is the Fight settings section's first card.
    cleanup();
    renderApp({ route: '#/setup/fight' });
    await settle();
    expect(document.querySelector('.sv-section .sv-card')?.getAttribute('aria-label')).toBe('Fight');
  });

  it('a bound item shows its item row key, as applySetup binds it (the worn Icon always first, then the enabled potions and rune in catalog order)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const keyOf = (name: string) => checkbox(name).closest('.setup-buff')?.querySelector('.setup-item-key')?.textContent ?? null;
    expect(keyOf('Dark Rune')).toBeNull();
    expect(keyOf(ICON_AUTO)).toBe('Item row: Z'); // worn: bound, not enabled
    expect(checkbox(ICON_AUTO).checked).toBe(false);
    fireEvent.click(checkbox(ICON_AUTO));
    fireEvent.click(checkbox('Dark Rune'));
    expect(keyOf(ICON_AUTO)).toBe('Item row: Z');
    expect(keyOf('Dark Rune')).toBe('Item row: X');
    fireEvent.click(checkbox('Destruction Potion'));
    expect(keyOf(ICON_AUTO)).toBe('Item row: Z');
    expect(keyOf('Destruction Potion')).toBe('Item row: X');
    expect(keyOf('Dark Rune')).toBe('Item row: C');
    expect(keyOf('Super Mana Potion')).toBeNull();
    expect(keyOf('Band of the Eternal Sage')).toBeNull(); // a proc, never pressed
    fireEvent.click(checkbox('Band of the Eternal Sage'));
    expect(keyOf('Band of the Eternal Sage')).toBeNull();
  });

  it('presets keep the chosen fight length (ruling F-2); Reset to Defaults resets it to 60', async () => {
    const { storage, stored } = memoryStorage();
    renderApp({ route: '#/setup/fight', storage });
    await settle();
    fireEvent.change(fightLengthInput(), { target: { value: '90' } });
    fireEvent.blur(fightLengthInput());

    await setupAt('buffs');
    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(stored()).toEqual({ ...SETUP_PRESETS['raid-log'].config, fightDurationSec: 90 });
    expect(activePreset()).toBe('Raid as in my log');
    await setupAt('fight');
    expect(fightLengthInput().value).toBe('90');

    await setupAt('buffs');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(stored()).toEqual({ ...SETUP_PRESETS.none.config, fightDurationSec: 90 });
    expect(activePreset()).toBe('None');

    resetToDefaults();
    expect(stored()).toEqual(DEFAULT_SETUP);
    await setupAt('fight');
    expect(fightLengthInput().value).toBe('60');
  });

  it('Reset to Defaults restores DEFAULT_SETUP', async () => {
    const { storage, stored } = memoryStorage();
    renderApp({ route: '#/setup/buffs', storage });
    await settle();
    fireEvent.click(checkbox('Arcane Brilliance'));
    await setupAt('rotation');
    fireEvent.change(curseSelect(), { target: { value: 'doom' } });
    await setupAt('fight');
    fireEvent.change(startInput('Heroism / Bloodlust'), { target: { value: '12' } });
    fireEvent.change(distanceInput(), { target: { value: '5' } });
    await setupAt('class');
    fireEvent.click(screen.getByRole('radio', { name: 'No armor' }));
    await setupAt('buffs');
    expect(activePreset()).toBe('Custom');

    resetToDefaults();
    expect(stored()).toEqual(DEFAULT_SETUP);
    expect(activePreset()).toBe('None');
    expect(checkbox('Arcane Brilliance').checked).toBe(false);
    fireEvent.click(checkbox('Misery')); // a fresh config: editable after the reset
    expect(stored().enabledBuffs).toEqual(['misery']);
    fireEvent.click(checkbox('Misery'));
    await setupAt('rotation');
    expect(curseSelect().value).toBe('elements');
    await setupAt('fight');
    expect(startInput('Heroism / Bloodlust').value).toBe('0');
    expect(distanceInput().value).toBe('28');
    await setupAt('class');
    expect((screen.getByRole('radio', { name: 'Fel Armor' }) as HTMLInputElement).checked).toBe(true);
  });

  it('the real presets: every preset button gives a config equal to its preset', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    for (const id of Object.keys(SETUP_PRESETS) as SetupPresetId[]) {
      fireEvent.click(screen.getByRole('button', { name: SETUP_PRESETS[id].name }));
      expect(last(onChange)).toEqual(SETUP_PRESETS[id].config);
    }
  });

  it("the real 'Raid as in my log' preset is told apart from None: clicking it shows it as active", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const raidButton = screen.getByRole('button', { name: 'Raid as in my log' });
    const noneButton = screen.getByRole('button', { name: 'None' });
    expect(activePreset()).toBe('None');
    expect(raidButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(raidButton);
    expect(activePreset()).toBe('Raid as in my log');
    expect(raidButton.getAttribute('aria-pressed')).toBe('true');
    expect(noneButton.getAttribute('aria-pressed')).toBe('false');
    expect(checkbox(buff('moonkin-aura').name).checked).toBe(true);
    expect(checkbox(buff('item:29305').name).checked).toBe(true); // Band of the Eternal Sage (gear item effect)
    expect(startInput(buff('heroism').name).value).toBe('6.4');
    // The Icon is an item action now: enabled, no start second.
    expect(checkbox(`${buff('item:29370').name}${AUTO}`).checked).toBe(true); // Icon of the Silver Crescent (gear item effect): used automatically
    expect(screen.queryByRole('spinbutton', { name: `${buff('item:29370').name} start (s)` })).toBeNull();
    expect(presetSelect().value).toBe('sb-spam');

    fireEvent.click(noneButton);
    expect(activePreset()).toBe('None');
    expect(noneButton.getAttribute('aria-pressed')).toBe('true');
    expect(raidButton.getAttribute('aria-pressed')).toBe('false');
  });
});

// The legacy "Setup panel in GameView" wiring tests in the app: the distance is edited on Setup →
// Fight settings, the fight is played on the Fight screen (leaving it pauses a running fight; Space
// resumes it, as the Paused card says).
describe('Setup editors in the app', () => {
  /** Back to the Fight screen; a fight paused by leaving it resumes. */
  function fightAgain() {
    goTo('#/fight');
    if (screen.queryByRole('region', { name: 'Paused' })) fireEvent.keyDown(window, { key: ' ' });
  }

  it('changing the distance does not change a running fight', async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' }); // Shadow Bolt: cast ends 2431, lands 3831 at 28 yd
    advance(500);
    await setupAt('fight');
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    expect(distanceInput().value).toBe('0');
    fightAgain();

    advance(2500); // 3000: past the cast end, which is when it would land at 0 yd
    expect(castBar()).toBeNull();
    expect(totalDamage()).toBe(0);
    advance(1000); // 4000: past the 28 yd impact
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('after R the new distance applies', async () => {
    renderApp({ route: '#/fight' });
    fireEvent.keyDown(window, { key: '1' });
    advance(500);
    await setupAt('fight');
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    goTo('#/fight');
    fireEvent.keyDown(window, { key: 'r' });
    expect(startOverlay()).not.toBeNull();

    fireEvent.keyDown(window, { key: '1' });
    advance(2500); // the cast ends at 2431 and at 0 yd the bolt lands at once
    expect(castBar()).toBeNull();
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('a distance set before the first press applies to that fight', async () => {
    renderApp({ route: '#/setup/fight' });
    await settle();
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    goTo('#/fight');
    fireEvent.keyDown(window, { key: '1' });
    advance(2500);
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('keys typed into the Setup inputs do not trigger spells', async () => {
    renderApp({ route: '#/setup/fight' });
    await settle();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    try {
      // Text-like fields own every key; on the Setup screen no key reaches the fight at all.
      const targets = () => [distanceInput(), textarea];
      for (const target of targets()) {
        fireEvent.keyDown(target, { key: '1' });
        fireEvent.keyDown(target, { key: ' ' });
      }
      await setupAt('rotation');
      fireEvent.keyDown(presetSelect(), { key: '1' });
      fireEvent.keyDown(presetSelect(), { key: ' ' });
      goTo('#/fight');
      expect(castBar()).toBeNull();
      expect(startOverlay()).not.toBeNull(); // Space did not start the fight

      // In a running fight: R and Escape typed there neither reset the fight nor cancel the cast.
      fireEvent.keyDown(window, { key: '1' });
      advance(500);
      await setupAt('fight');
      for (const target of targets()) {
        fireEvent.keyDown(target, { key: 'r' });
        fireEvent.keyDown(target, { key: 'Escape' });
      }
      await setupAt('rotation');
      fireEvent.keyDown(presetSelect(), { key: 'r' });
      fireEvent.keyDown(presetSelect(), { key: 'Escape' });
      fightAgain();
      expect(castBar()).not.toBeNull();
      expect(screen.getByLabelText('Elapsed').textContent).toBe('0:00.5 / 1:00');

      // The same keys on the Fight screen still work.
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(castBar()).toBeNull();
    } finally {
      textarea.remove();
    }
  });

  it("after clicking a toggle (the dock's Combat text switch, a Setup checkbox) the other hotkeys still work; only Space and Enter belong to them", async () => {
    renderApp({ route: '#/setup/rotation' });
    await settle();
    fireEvent.keyDown(checkbox('Immolate'), { key: ' ' });
    goTo('#/fight');
    expect(startOverlay()).not.toBeNull();
    const toggle = within(screen.getByRole('complementary', { name: 'Fight details' })).getByRole('checkbox', { name: 'Combat text' });
    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(startOverlay()).not.toBeNull(); // Space did not start the fight

    // A key that is not Space/Enter pressed with a toggle focused reaches the action bar.
    fireEvent.keyDown(toggle, { key: '1' });
    expect(castBar()).not.toBeNull();
  });
});
