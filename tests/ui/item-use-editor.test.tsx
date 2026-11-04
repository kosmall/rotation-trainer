import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import { itemDbSync } from '../../src/data/items/dbSync';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, setupCatalogFor, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../../src/setup/defaults';
import { setupGear } from '../../src/setup/gear';
import { SETUP_PRESETS } from '../../src/setup/presets';
import { SETUP_STORAGE_KEY, type SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { createFightSimulation } from '../../src/sim-runner/fight';
import { ItemsGroup, RotationGroup, SetupPresetBar } from '../../src/ui/SetupPanel';
import { goTo, renderApp } from './renderApp';
import { quagBloodgemGear } from '../fixtures/item-use-reference';

// The item-use rules editor in the Setup panel's Rotation group (simulator Task 3). Fully
// controlled: every edit goes through the panel's normalizeSetup; the bot of the next fight
// (applySetup) follows it.

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

const db = itemDbSync();

/**
 * The Setup editors the item rules touch (the setup presets, Items and cooldowns, Rotation: the
 * groups the legacy Setup panel held until redesign Task 5) with their own config, the catalog
 * following the config's gear (as the trainer does).
 */
function Harness({ initial, onChange }: { initial: SetupConfig; onChange(c: SetupConfig): void }) {
  const [config, setConfig] = useState<SetupConfig>(() => normalizeSetup(structuredClone(initial), SETUP_CATALOG, db));
  const catalog = setupCatalogFor(setupGear(config), db);
  const group = {
    catalog,
    config,
    onChange: (c: SetupConfig) => {
      onChange(c);
      setConfig(c);
    },
  };
  return (
    <>
      <SetupPresetBar {...group} presets={SETUP_PRESETS} />
      <ItemsGroup {...group} />
      <RotationGroup {...group} />
      <button
        type="button"
        onClick={() => {
          const next = { ...config, gear: quagBloodgemGear() };
          onChange(next);
          setConfig(next);
        }}
      >
        Swap trinkets
      </button>
    </>
  );
}

const setup = (p: Partial<SetupConfig>): SetupConfig => ({ ...structuredClone(DEFAULT_SETUP), ...p });
const lastConfig = (spy: ReturnType<typeof vi.fn>): SetupConfig => spy.mock.calls.at(-1)?.[0] as SetupConfig;
const editor = () => screen.getByRole('list', { name: 'Item use rules' });
const rowNames = () => within(editor()).queryAllByRole('listitem').map((li) => li.querySelector('.item-use-name')?.textContent);
const triggerSelect = (name: string) => screen.getByRole('combobox', { name: `${name}: when` }) as HTMLSelectElement;
const spin = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;
const catalogName = (id: string, gear = setupGear(DEFAULT_SETUP)) => setupCatalogFor(gear, db).find((b) => b.id === id)!.name;
const ICON = catalogName('item:29370');
const BLOODGEM = catalogName('item:29132', quagBloodgemGear());

function typeInto(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

/** The bot's log of the config's next fight (seed 1, window 400), as JSON. */
function botLog(config: SetupConfig): string {
  const c = normalizeSetup(config, SETUP_CATALOG, db);
  const fight = applySetup({
    buildSpec: (w, gear) => (gear === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, gear, db)),
    catalog: STATIC_SETUP_CATALOG,
    config: c,
    db,
  });
  const sim = createFightSimulation(fight, 1, 400);
  runBot(sim, fight.spec.priority);
  return JSON.stringify(sim.log());
}

function firstUseMs(config: SetupConfig, spellId: string): number | undefined {
  const log = JSON.parse(botLog(config)) as { type: string; spellId?: string; atMs: number }[];
  return log.find((e) => e.type === 'cast-complete' && e.spellId === spellId)?.atMs;
}

describe('ItemUseEditor', () => {
  it('rows follow the worn gear and the enabled items (swap a trinket: its row appears)', () => {
    const spy = vi.fn();
    render(<Harness initial={setup({ enabledBuffs: ['destruction-potion', 'super-mana-potion', 'item:29370', 'item:29132'] })} onChange={spy} />);
    expect(rowNames()).toEqual(['Destruction Potion', 'Super Mana Potion', ICON]); // the Bloodgem is not worn
    fireEvent.click(screen.getByRole('button', { name: 'Swap trinkets' }));
    expect(rowNames()).toEqual(['Destruction Potion', 'Super Mana Potion', BLOODGEM]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Super Mana Potion' }));
    expect(rowNames()).toEqual(['Destruction Potion', BLOODGEM]);
    // Defaults shown: without Heroism a burst item is used whenever ready, a mana item when its largest gain is missing.
    expect(triggerSelect('Destruction Potion').value).toBe('ready');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Super Mana Potion' }));
    expect(triggerSelect('Super Mana Potion').value).toBe('mana-missing');
    expect(spin('Super Mana Potion: missing mana').value).toBe('3000');
    expect(lastConfig(spy).rotation.itemUse).toBeUndefined(); // showing defaults writes nothing
  });

  it('no enabled item: a hint instead of rows', () => {
    render(<Harness initial={setup({})} onChange={vi.fn()} />);
    expect(screen.queryByRole('list', { name: 'Item use rules' })).toBeNull();
    expect(screen.getByText(/enable a potion, the rune or an on-use item/i)).toBeTruthy();
  });

  it('changing a trigger changes the bot in the next fight (potion from 35 s); every trigger has a hint', () => {
    const spy = vi.fn();
    const initial = setup({ enabledBuffs: ['heroism', 'destruction-potion'] });
    render(<Harness initial={initial} onChange={spy} />);
    expect(triggerSelect('Destruction Potion').value).toBe('with-heroism');
    expect(firstUseMs(initial, 'use-destruction-potion')!).toBeLessThan(30000);
    fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: 'at' } });
    expect(lastConfig(spy).rotation.itemUse).toEqual({ 'destruction-potion': { trigger: { kind: 'at', sec: 30 } } });
    typeInto(spin('Destruction Potion: from second'), '35');
    const edited = lastConfig(spy);
    expect(edited.rotation.itemUse).toEqual({ 'destruction-potion': { trigger: { kind: 'at', sec: 35 } } });
    expect(firstUseMs(edited, 'use-destruction-potion')!).toBeGreaterThanOrEqual(35000);
    const row = within(editor()).getAllByRole('listitem')[0]!;
    expect(row.textContent).toMatch(/from 35 s on/);
    for (const option of Array.from(triggerSelect('Destruction Potion').options)) {
      fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: option.value } });
      expect(within(editor()).getAllByRole('listitem')[0]!.querySelector('.item-use-kind-hint')?.textContent).toBeTruthy();
    }
    fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: 'never' } });
    expect(firstUseMs(lastConfig(spy), 'use-destruction-potion')).toBeUndefined();
  });

  it("with-buff lists the player's buff auras (Heroism, the enabled items' buffs; not its own, not mana items)", () => {
    const spy = vi.fn();
    render(<Harness initial={setup({ enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'item:29370'] })} onChange={spy} />);
    fireEvent.change(triggerSelect(ICON), { target: { value: 'with-buff' } });
    const buffSelect = screen.getByRole('combobox', { name: `${ICON}: buff` }) as HTMLSelectElement;
    const options = Array.from(buffSelect.options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['heroism', 'Heroism / Bloodlust'],
      ['destruction-potion', 'Destruction Potion'],
    ]);
    fireEvent.change(buffSelect, { target: { value: 'destruction-potion' } });
    expect(lastConfig(spy).rotation.itemUse?.['item:29370']).toEqual({ trigger: { kind: 'with-buff', auraId: 'destruction-potion' } });
  });

  it('move up/down changes the order; back to the default order removes it (the preset still matches)', () => {
    const spy = vi.fn();
    render(<Harness initial={structuredClone(SETUP_PRESETS['raid-log'].config) as SetupConfig} onChange={spy} />);
    expect(screen.getByLabelText('Active preset').textContent).toBe('Raid as in my log');
    expect(rowNames()).toEqual(['Destruction Potion', ICON]);
    expect((screen.getByRole('button', { name: 'Move Destruction Potion up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: `Move ${ICON} down` }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `Move ${ICON} up` }));
    expect(lastConfig(spy).rotation.itemUseOrder).toEqual(['item:29370', 'destruction-potion']);
    expect(rowNames()).toEqual([ICON, 'Destruction Potion']);
    expect(screen.getByLabelText('Active preset').textContent).toBe('Custom');
    fireEvent.click(screen.getByRole('button', { name: `Move ${ICON} down` }));
    expect(lastConfig(spy).rotation.itemUseOrder).toBeUndefined();
    expect(rowNames()).toEqual(['Destruction Potion', ICON]);
    expect(screen.getByLabelText('Active preset').textContent).toBe('Raid as in my log');
  });

  it('Reset restores the defaults (one row, then all); the bot log is byte-identical to the default one', () => {
    const spy = vi.fn();
    const initial = setup({ enabledBuffs: ['heroism', 'destruction-potion', 'dark-rune', 'item:29370'] });
    render(<Harness initial={initial} onChange={spy} />);
    const defaultLog = botLog(initial);
    expect((screen.getByRole('button', { name: 'Reset Destruction Potion' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: 'fight-end' } });
    fireEvent.change(triggerSelect('Dark Rune'), { target: { value: 'mana-below' } });
    typeInto(spin('Dark Rune: not before (s)'), '10');
    fireEvent.click(screen.getByRole('button', { name: `Move ${ICON} up` }));
    expect(botLog(lastConfig(spy))).not.toBe(defaultLog);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Destruction Potion' }));
    expect(lastConfig(spy).rotation.itemUse?.['destruction-potion']).toBeUndefined();
    expect(triggerSelect('Destruction Potion').value).toBe('with-heroism');
    fireEvent.click(screen.getByRole('button', { name: 'Reset all item rules to default' }));
    const reset = lastConfig(spy);
    expect(reset.rotation).toEqual(DEFAULT_SETUP.rotation);
    expect(reset).toEqual(normalizeSetup(initial, SETUP_CATALOG));
    expect(botLog(reset)).toBe(defaultLog);
  });

  it('hostile inputs clamp: seconds 0-3600, mana 0-100 000; an empty window field removes the window', () => {
    const spy = vi.fn();
    render(<Harness initial={setup({ enabledBuffs: ['destruction-potion', 'super-mana-potion'] })} onChange={spy} />);
    fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: 'at' } });
    typeInto(spin('Destruction Potion: from second'), '-5');
    expect(lastConfig(spy).rotation.itemUse?.['destruction-potion']?.trigger).toEqual({ kind: 'at', sec: 0 });
    typeInto(spin('Destruction Potion: from second'), '99999');
    expect(lastConfig(spy).rotation.itemUse?.['destruction-potion']?.trigger).toEqual({ kind: 'at', sec: 3600 });
    typeInto(spin('Destruction Potion: from second'), 'abc');
    expect(spin('Destruction Potion: from second').value).toBe('3600');
    fireEvent.change(triggerSelect('Super Mana Potion'), { target: { value: 'mana-below' } });
    typeInto(spin('Super Mana Potion: mana below'), '1e9');
    expect(lastConfig(spy).rotation.itemUse?.['super-mana-potion']?.trigger).toEqual({ kind: 'mana-below', mana: 100000 });
    typeInto(spin('Super Mana Potion: not after (s)'), '20');
    expect(lastConfig(spy).rotation.itemUse?.['super-mana-potion']?.notAfterSec).toBe(20);
    typeInto(spin('Super Mana Potion: not after (s)'), '');
    expect(lastConfig(spy).rotation.itemUse?.['super-mana-potion']).toEqual({ trigger: { kind: 'mana-below', mana: 100000 } });
  });

  it('the rotation preset select and the setup preset buttons keep the item rules', () => {
    const spy = vi.fn();
    const rules = { 'destruction-potion': { trigger: { kind: 'at' as const, sec: 30 } } };
    render(
      <Harness
        initial={setup({ enabledBuffs: ['destruction-potion', 'dark-rune'], rotation: { ...DEFAULT_SETUP.rotation, itemUse: rules, itemUseOrder: ['dark-rune'] } })}
        onChange={spy}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Rotation preset' }), { target: { value: 'sb-spam' } });
    expect(lastConfig(spy).rotation).toMatchObject({ curse: 'doom', immolate: false, itemUse: rules, itemUseOrder: ['dark-rune'] });
    fireEvent.click(screen.getByRole('button', { name: 'Raid as in my log' }));
    expect(lastConfig(spy).rotation).toMatchObject({ itemUse: rules, itemUseOrder: ['dark-rune'] });
    // The item rules are part of the fight: the preset reads Custom, and the panel says why.
    expect(screen.getByLabelText('Active preset').textContent).toBe('Custom');
    expect(screen.getByText(/Raid as in my log.*except the item-use rules/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all item rules to default' }));
    expect(screen.getByLabelText('Active preset').textContent).toBe('Raid as in my log');
  });
});

describe('ItemUseEditor in the game', () => {
  function storage(config: SetupConfig): SetupStorage {
    const map = new Map([[SETUP_STORAGE_KEY, JSON.stringify(config)]]);
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  }

  it('the Priority list follows a rule at once; typing in the editor never triggers hotkeys', async () => {
    renderApp({ route: '#/setup/rotation', storage: storage(setup({ enabledBuffs: ['destruction-potion'] })) });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    fireEvent.change(triggerSelect('Destruction Potion'), { target: { value: 'at' } });
    const sec = spin('Destruction Potion: from second');
    sec.focus();
    for (const key of ['1', 'z', ' ', 'r']) fireEvent.keyDown(sec, { key });
    typeInto(sec, '45');
    const priority = screen.getByRole('list', { name: 'Priority' });
    expect(priority.textContent).toMatch(/from 45 s on/);
    goTo('#/fight');
    expect(screen.queryByRole('button', { name: /^start the fight$/i })).not.toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Cast bar' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10);
    });
  });
});
