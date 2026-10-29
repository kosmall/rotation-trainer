import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { DEFAULT_SETUP, SETUP_CATALOG, SETUP_LIMITS } from '../../src/setup/defaults';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig, SetupPresetId } from '../../src/setup/types';
import type { BuffDef } from '../../src/data/types';
import { GameView } from '../../src/ui/GameView';
import { SetupPanel } from '../../src/ui/SetupPanel';

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

const castBar = () => screen.queryByRole('progressbar', { name: 'Cast bar' });
const startOverlay = () => screen.queryByRole('button', { name: 'Start the fight' });
const amount = (el: HTMLElement) => Number((el.textContent ?? '').replace(/[^0-9.]/g, ''));
const totalDamage = () => amount(screen.getByLabelText('Total damage'));

const presetSelect = () => screen.getByRole('combobox', { name: 'Rotation preset' }) as HTMLSelectElement;
const curseSelect = () => screen.getByRole('combobox', { name: 'Curse' }) as HTMLSelectElement;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const distanceInput = () => screen.getByRole('spinbutton', { name: 'Distance from target (yd)' }) as HTMLInputElement;
const lifeTapInput = () => screen.getByRole('spinbutton', { name: 'Life Tap below mana' }) as HTMLInputElement;
const startInput = (buffName: string) => screen.getByRole('spinbutton', { name: `${buffName} start (s)` }) as HTMLInputElement;
const durationInput = (buffName: string) =>
  screen.getByRole('spinbutton', { name: `${buffName} duration (s)` }) as HTMLInputElement;
const activePreset = () => screen.getByLabelText('Active preset').textContent;

const buff = (id: string): BuffDef => {
  const b = SETUP_CATALOG.find((x) => x.id === id);
  if (!b) throw new Error(`no buff ${id}`);
  return b;
};

/** The labels of the Priority panel's steps, in order. */
function priorityLabels(): string[] {
  const summary = screen.getByText('Priority', { selector: 'summary' });
  const panel = summary.closest('details') as HTMLElement;
  return within(panel)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('strong')?.textContent ?? '');
}

type Presets = Readonly<Record<SetupPresetId, { name: string; config: SetupConfig }>>;

/**
 * SetupPanel with its own config state, as GameView holds it; the spy sees every config passed
 * on (the panel passes normalized configs only).
 */
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
    <SetupPanel
      catalog={SETUP_CATALOG}
      config={config}
      presets={presets}
      fightLengthSec={60}
      onChange={(c) => {
        onChange(c);
        setConfig(c);
      }}
    />
  );
}

/** The config of the last onChange call. */
const last = (spy: ReturnType<typeof vi.fn>): SetupConfig => spy.mock.calls.at(-1)?.[0] as SetupConfig;

describe('SetupPanel', () => {
  it('the panel shows the preset selector, a curse selector, checkboxes for Immolate, Corruption and Shadowburn finisher, a Life Tap threshold and the distance', () => {
    render(<GameView storage={null} />);
    const summary = screen.getByText('Setup', { selector: 'summary' });
    expect((summary.closest('details') as HTMLDetailsElement).open).toBe(false); // collapsed

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
    expect(distanceInput().value).toBe('28');
    expect(distanceInput().min).toBe('0');
    expect(distanceInput().max).toBe('100');
  });

  it('choosing the sb-spam preset removes Immolate and Corruption from the Priority list', () => {
    render(<GameView storage={null} />);
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

  it('changing a flag marks the preset as Custom', () => {
    render(<GameView storage={null} />);
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
    const props = { catalog: SETUP_CATALOG, presets: SETUP_PRESETS, onChange };
    const { rerender } = render(<SetupPanel {...props} config={withLifeTap('auto')} />);
    rerender(<SetupPanel {...props} config={withLifeTap(1234)} />);
    expect(lifeTapInput().value).toBe('1234');
    rerender(<SetupPanel {...props} config={withLifeTap('auto')} />);
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

  it('disabled disables every control', () => {
    render(
      <SetupPanel catalog={SETUP_CATALOG} config={DEFAULT_SETUP} presets={SETUP_PRESETS} onChange={() => {}} disabled />,
    );
    for (const el of [
      presetSelect(),
      curseSelect(),
      checkbox('Immolate'),
      distanceInput(),
      checkbox('Arcane Brilliance'),
      startInput('Heroism / Bloodlust'),
      screen.getByRole('radio', { name: 'Fel Armor' }),
      screen.getByRole('button', { name: 'Reset to defaults' }),
    ]) {
      expect(el.matches(':disabled')).toBe(true);
    }
  });

  it('every catalog group renders and toggling a buff calls onChange with it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const expectedGroup = (b: BuffDef) =>
      b.timed || b.group === 'item'
        ? 'Items and cooldowns'
        : b.group === 'debuff'
          ? 'Target debuffs'
          : b.group === 'consumable'
            ? 'Consumables'
            : b.group === 'warlock'
              ? 'Warlock options'
              : 'Raid and party';
    for (const name of ['Raid and party', 'Consumables', 'Target debuffs', 'Items and cooldowns', 'Warlock options', 'Rotation', 'Distance']) {
      expect(screen.getByRole('group', { name }), name).toBeTruthy();
    }
    for (const b of SETUP_CATALOG) {
      const group = screen.getByRole('group', { name: expectedGroup(b) });
      const box = within(group).getByRole('checkbox', { name: b.name }) as HTMLInputElement;
      expect(box.checked, b.id).toBe(false);
      // Its icon (with the initials tile underneath as the fallback) and its description.
      expect(box.closest('.setup-buff')?.querySelector('img')?.getAttribute('src'), b.id).toContain(`/icons/spells/${b.icon}.jpg`);
      expect(box.getAttribute('aria-describedby'), b.id).toBeTruthy();
      expect(document.getElementById(box.getAttribute('aria-describedby') as string)?.textContent).toBe(b.description);
    }
    // Super Mana Potion and Dark Rune are intentionally not in the catalog.
    expect(screen.queryByRole('checkbox', { name: /Super Mana Potion|Dark Rune/ })).toBeNull();

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
    for (const b of SETUP_CATALOG.filter((x) => x.timed)) {
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
      'raid-log': { name: 'Raid as in my log', config: raid },
    };
    const onChange = vi.fn();
    render(<Harness onChange={onChange} presets={presets} />);
    expect(activePreset()).toBe('None');

    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(last(onChange)).toEqual(raid);
    expect(last(onChange)).not.toBe(raid); // a copy: the preset is never edited
    expect(activePreset()).toBe('Raid as in my log');
    expect(checkbox('Arcane Brilliance').checked).toBe(true);
    expect(checkbox('Heroism / Bloodlust').checked).toBe(true);
    expect(startInput('Heroism / Bloodlust').value).toBe('6');

    fireEvent.click(checkbox('Misery'));
    expect(activePreset()).toBe('Custom');
    fireEvent.click(checkbox('Misery'));
    expect(activePreset()).toBe('Raid as in my log');
    // A start second of a buff that is not enabled does not change the match.
    fireEvent.change(startInput('Destruction Potion'), { target: { value: '30' } });
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
  });

  it('Reset to defaults restores DEFAULT_SETUP', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(checkbox('Arcane Brilliance'));
    fireEvent.change(curseSelect(), { target: { value: 'doom' } });
    fireEvent.change(startInput('Heroism / Bloodlust'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('radio', { name: 'No armor' }));
    fireEvent.change(distanceInput(), { target: { value: '5' } });
    expect(activePreset()).toBe('Custom');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(last(onChange)).toEqual(DEFAULT_SETUP);
    expect(Object.isFrozen(last(onChange))).toBe(false); // a fresh copy, editable
    expect(activePreset()).toBe('None');
    expect(checkbox('Arcane Brilliance').checked).toBe(false);
    expect(curseSelect().value).toBe('elements');
    expect(startInput('Heroism / Bloodlust').value).toBe('0');
    expect((screen.getByRole('radio', { name: 'Fel Armor' }) as HTMLInputElement).checked).toBe(true);
    expect(distanceInput().value).toBe('28');
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
    expect(checkbox(buff('band-of-the-eternal-sage').name).checked).toBe(true);
    expect(startInput(buff('heroism').name).value).toBe('6.4');
    expect(startInput(buff('icon-of-the-silver-crescent').name).value).toBe('30.2');
    expect(presetSelect().value).toBe('sb-spam');

    fireEvent.click(noneButton);
    expect(activePreset()).toBe('None');
    expect(noneButton.getAttribute('aria-pressed')).toBe('true');
    expect(raidButton.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('SetupPanel in GameView', () => {
  it('changing the distance does not change a running fight', () => {
    render(<GameView storage={null} />);
    fireEvent.keyDown(window, { key: '1' }); // Shadow Bolt: cast ends 2431, lands 3831 at 28 yd
    advance(500);
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    expect(distanceInput().value).toBe('0');

    advance(2500); // 3000: past the cast end, which is when it would land at 0 yd
    expect(castBar()).toBeNull();
    expect(totalDamage()).toBe(0);
    advance(1000); // 4000: past the 28 yd impact
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('after R the new distance applies', () => {
    render(<GameView storage={null} />);
    fireEvent.keyDown(window, { key: '1' });
    advance(500);
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    fireEvent.keyDown(window, { key: 'r' });
    expect(startOverlay()).not.toBeNull();

    fireEvent.keyDown(window, { key: '1' });
    advance(2500); // the cast ends at 2431 and at 0 yd the bolt lands at once
    expect(castBar()).toBeNull();
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('a distance set before the first press applies to that fight', () => {
    render(<GameView storage={null} />);
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    fireEvent.keyDown(window, { key: '1' });
    advance(2500);
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('keys typed into the panel inputs do not trigger spells', () => {
    render(<GameView storage={null} />);
    const summary = screen.getByText('Setup', { selector: 'summary' });
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    try {
      // Text-like fields own every key; toggles (summary, checkbox) own only Space (see the next test).
      const targets = () => [distanceInput(), presetSelect(), textarea];
      for (const target of targets()) {
        fireEvent.keyDown(target, { key: '1' });
        expect(castBar()).toBeNull();
        fireEvent.keyDown(target, { key: ' ' });
        expect(startOverlay()).not.toBeNull(); // Space did not start the fight
      }

      // In a running fight: R and Escape typed there neither reset the fight nor cancel the cast.
      fireEvent.keyDown(window, { key: '1' });
      advance(500);
      for (const target of targets()) {
        fireEvent.keyDown(target, { key: 'r' });
        fireEvent.keyDown(target, { key: 'Escape' });
        expect(castBar()).not.toBeNull();
        expect(screen.getByLabelText('Elapsed').textContent).toBe('0.5 / 60s');
      }

      // The same keys outside the panel still work.
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(castBar()).toBeNull();
    } finally {
      textarea.remove();
    }
  });

  it('after clicking a summary or a checkbox the other hotkeys still work; only Space and Enter belong to them', () => {
    render(<GameView storage={null} />);
    const setupSummary = screen.getByText('Setup', { selector: 'summary' });
    for (const toggle of [setupSummary, screen.getByText('Priority', { selector: 'summary' })]) {
      fireEvent.keyDown(toggle, { key: ' ' });
      fireEvent.keyDown(toggle, { key: 'Enter' });
      expect(startOverlay()).not.toBeNull(); // Space did not start the fight
    }
    fireEvent.keyDown(checkbox('Immolate'), { key: ' ' });
    expect(startOverlay()).not.toBeNull();

    // A key that is not Space/Enter pressed with a toggle focused reaches the action bar.
    fireEvent.keyDown(setupSummary, { key: '1' });
    expect(castBar()).not.toBeNull();
  });
});
