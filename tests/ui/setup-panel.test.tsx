import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { ROTATION_PRESETS } from '../../src/data/classes/warlock/rotation';
import type { RotationConfig } from '../../src/data/classes/warlock/rotation';
import { DEFAULT_DISTANCE_FROM_TARGET_YD } from '../../src/data/common/target';
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

/** The labels of the Priority panel's steps, in order. */
function priorityLabels(): string[] {
  const summary = screen.getByText('Priority', { selector: 'summary' });
  const panel = summary.closest('details') as HTMLElement;
  return within(panel)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('strong')?.textContent ?? '');
}

/** SetupPanel with its own state, as GameView uses it; the spies see every value passed on. */
function Harness({ onRotation, onDistance }: { onRotation(c: RotationConfig): void; onDistance(yd: number): void }) {
  const [rotation, setRotation] = useState<RotationConfig>({ ...ROTATION_PRESETS.dot.config });
  const [distanceYd, setDistanceYd] = useState(DEFAULT_DISTANCE_FROM_TARGET_YD);
  return (
    <SetupPanel
      rotation={rotation}
      distanceYd={distanceYd}
      onRotation={(c) => {
        onRotation(c);
        setRotation(c);
      }}
      onDistance={(yd) => {
        onDistance(yd);
        setDistanceYd(yd);
      }}
    />
  );
}

describe('SetupPanel', () => {
  it('the panel shows the preset selector, a curse selector, checkboxes for Immolate, Corruption and Shadowburn finisher, a Life Tap threshold and the distance', () => {
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
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
    const onRotation = vi.fn();
    render(<Harness onRotation={onRotation} onDistance={() => {}} />);
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    const first = onRotation.mock.calls.at(-1)?.[0] as RotationConfig;
    expect(typeof first.lifeTapBelowMana).toBe('number');
    expect(first.lifeTapBelowMana).toBeGreaterThanOrEqual(0);

    onRotation.mockClear();
    fireEvent.change(lifeTapInput(), { target: { value: '' } });
    expect(onRotation).not.toHaveBeenCalled();
    fireEvent.change(lifeTapInput(), { target: { value: '-50' } });
    expect(onRotation.mock.calls.at(-1)?.[0].lifeTapBelowMana).toBe(0);
    fireEvent.change(lifeTapInput(), { target: { value: '1500.6' } });
    expect(onRotation.mock.calls.at(-1)?.[0].lifeTapBelowMana).toBe(1501);
    for (const [config] of onRotation.mock.calls as [RotationConfig][]) {
      expect(Number.isFinite(config.lifeTapBelowMana)).toBe(true);
    }

    // Auto again, then off: the last number comes back.
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(onRotation.mock.calls.at(-1)?.[0].lifeTapBelowMana).toBe('auto');
    fireEvent.click(checkbox('Auto (Shadow Bolt cost)'));
    expect(onRotation.mock.calls.at(-1)?.[0].lifeTapBelowMana).toBe(1501);
  });

  it('the distance input clamps 0..100 and ignores NaN/empty (keeps the last valid value)', () => {
    const onDistance = vi.fn();
    render(<Harness onRotation={() => {}} onDistance={onDistance} />);
    const input = distanceInput();

    fireEvent.change(input, { target: { value: '150' } });
    expect(onDistance).toHaveBeenLastCalledWith(100);
    fireEvent.blur(input);
    expect(distanceInput().value).toBe('100');

    fireEvent.change(input, { target: { value: '-5' } });
    expect(onDistance).toHaveBeenLastCalledWith(0);
    fireEvent.change(input, { target: { value: '12.5' } });
    expect(onDistance).toHaveBeenLastCalledWith(12.5);

    onDistance.mockClear();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'abc' } }); // a number input reports '' for this
    expect(onDistance).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(distanceInput().value).toBe('12.5'); // the last valid value

    fireEvent.change(input, { target: { value: '0' } });
    expect(onDistance).toHaveBeenLastCalledWith(0);
  });

  it('disabled disables every control', () => {
    render(
      <SetupPanel
        rotation={ROTATION_PRESETS.dot.config}
        distanceYd={28}
        onRotation={() => {}}
        onDistance={() => {}}
        disabled
      />,
    );
    for (const el of [presetSelect(), curseSelect(), checkbox('Immolate'), distanceInput()]) {
      expect(el.matches(':disabled')).toBe(true);
    }
  });
});

describe('SetupPanel in GameView', () => {
  it('changing the distance does not change a running fight', () => {
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
    fireEvent.change(distanceInput(), { target: { value: '0' } });
    fireEvent.keyDown(window, { key: '1' });
    advance(2500);
    expect(totalDamage()).toBeGreaterThan(0);
  });

  it('keys typed into the panel inputs do not trigger spells', () => {
    render(<GameView spec={destructionWarlock} />);
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
    render(<GameView spec={destructionWarlock} />);
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
