// Setup → Scenarios: the scenario library (rotation scripts Task 5, adapted to the redesigned
// Setup screen). Save the current setup (with or without its setup), Apply (asks first, names what
// it replaces), Duplicate, Rename, Delete, Import (paste or file: valid, invalid, hostile, huge),
// Export (copy, download, round trip), the bundled examples, persistence and storage failures.

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { ItemDb } from '../../src/data/items/types';
import { SCENARIO_EXAMPLES } from '../../src/scenarios/examples';
import { exportScenario, parseScenario, readScenario } from '../../src/scenarios/format';
import { SCENARIOS_STORAGE_KEY } from '../../src/scenarios/storage';
import type { Scenario } from '../../src/scenarios/types';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';
import type { SetupStorage } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { goTo, renderApp } from './renderApp';

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
  vi.restoreAllMocks();
  window.location.hash = '';
});

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

const db: ItemDb = itemDbSync();
const loadDb = () => Promise.resolve(db);

function memory(setup: Partial<SetupConfig> = {}, scenarios?: unknown, failScenarios = false) {
  const map = new Map<string, string>([[SETUP_STORAGE_KEY, JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...setup })]]);
  if (scenarios !== undefined) map.set(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios));
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (failScenarios && k === SCENARIOS_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

const library = (map: Map<string, string>) =>
  (JSON.parse(map.get(SCENARIOS_STORAGE_KEY) ?? '{"scenarios":[]}') as { scenarios: { id: string; scenario: Scenario }[] }).scenarios;
const config = (map: Map<string, string>) => JSON.parse(map.get(SETUP_STORAGE_KEY)!) as SetupConfig;
const saved = () => screen.queryByRole('list', { name: 'Saved scenarios' });
const savedNames = () => [...(saved()?.querySelectorAll('h3') ?? [])].map((h) => h.textContent);
const dialog = () => screen.getByRole('dialog');

const example = (file: string) => readScenario(SCENARIO_EXAMPLES.find((e) => e.file === file)!.json).scenario!;
const exampleText = (file: string) => exportScenario(example(file));

async function open(m = memory(), extra: Parameters<typeof renderApp>[0] = {}) {
  renderApp({ route: '#/setup/scenarios', storage: m.storage, loadDb, ...extra });
  await settle();
  return m;
}

function saveCurrent(name: string, includeSetup = true, description = '') {
  fireEvent.click(screen.getByRole('button', { name: 'Save Current as Scenario…' }));
  const d = dialog();
  fireEvent.change(within(d).getByRole('textbox', { name: 'Name' }), { target: { value: name } });
  if (description !== '') fireEvent.change(within(d).getByRole('textbox', { name: 'Description' }), { target: { value: description } });
  const box = within(d).getByRole('checkbox', { name: /Include the setup/ }) as HTMLInputElement;
  if (box.checked !== includeSetup) fireEvent.click(box);
  fireEvent.click(within(d).getByRole('button', { name: 'Save Scenario' }));
}

function importText(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Import Scenario…' }));
  fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }), { target: { value: text } });
}

describe('Scenarios: library', () => {
  it('the empty state; Save Current as Scenario with and without the setup (the basic rotation converted when no script)', async () => {
    const { map } = await open(memory({ fightDurationSec: 90 }));
    expect(screen.getByText(/No scenarios saved/)).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Setup sections' })).getByRole('link', { name: /Scenarios/ }).textContent).toContain('None saved');

    saveCurrent('With setup', true, 'My setup <b>bold</b>');
    saveCurrent('Rotation only', false);
    expect(savedNames()).toEqual(['With setup', 'Rotation only']);
    expect(within(screen.getByRole('navigation', { name: 'Setup sections' })).getByRole('link', { name: /Scenarios/ }).textContent).toContain('2 saved');
    const [a, b] = library(map);
    expect(a!.id).toBe('with-setup');
    expect(a!.scenario.description).toBe('My setup <b>bold</b>');
    expect(document.querySelector('b')?.textContent).not.toBe('bold');
    expect(a!.scenario.setup!.fightDurationSec).toBe(90);
    expect(a!.scenario.setup!.enabledBuffs).toEqual(DEFAULT_SETUP.enabledBuffs);
    expect(b!.scenario).not.toHaveProperty('setup');
    expect(a!.scenario.script.rules.at(-1)).toMatchObject({ action: 'cast', id: 'shadow-bolt' });
    expect(a!.scenario.createdAt).toBe(new Date(FAKE_NOW).toISOString());
    expect(saved()!.textContent).toContain('with its');
    expect(saved()!.textContent).toContain('rotation only');
  });

  it('Apply asks first, names what it replaces, and applies the script and (optionally) the setup', async () => {
    const trinket = example('potion-heroism-shadowburn');
    const { map } = await open(memory({}, { version: 1, scenarios: [{ id: 'p', scenario: trinket }] }));
    fireEvent.click(within(saved()!).getByRole('button', { name: `Apply… ${trinket.name}` }));
    let d = screen.getByRole('dialog', { name: `Apply “${trinket.name}”?` });
    expect(d.textContent).toMatch(/This replaces your rotation \(the script, or the basic rotation\) and your .*buffs and items/);
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(config(map)).not.toHaveProperty('script');

    fireEvent.click(within(saved()!).getByRole('button', { name: `Apply… ${trinket.name}` }));
    d = dialog();
    fireEvent.click(within(d).getByRole('checkbox', { name: /Also apply its setup/ }));
    expect(d.textContent).not.toMatch(/and your/);
    fireEvent.click(within(d).getByRole('button', { name: 'Apply Scenario' }));
    expect(config(map).script).toEqual(trinket.script);
    expect(config(map).enabledBuffs).toEqual(DEFAULT_SETUP.enabledBuffs);
    expect(screen.getByText(/plays from the next fight/)).toBeTruthy();

    fireEvent.click(within(saved()!).getByRole('button', { name: `Apply… ${trinket.name}` }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Apply Scenario' }));
    expect(config(map).enabledBuffs).toEqual(trinket.setup!.enabledBuffs);
    goTo('#/setup/rotation');
    await settle();
    expect(screen.getByText(/Script active/)).toBeTruthy();
  });

  it('per-scenario buttons: the accessible name starts with the visible text (WCAG 2.5.3) and names the scenario', async () => {
    await open();
    saveCurrent('Base');
    const buttons = [
      ...within(saved()!).getAllByRole('button'),
      ...within(screen.getByRole('list', { name: 'Example scenarios' })).getAllByRole('button'),
    ];
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      const visible = [...b.childNodes]
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains('sr-only')))
        .map((n) => n.textContent)
        .join('')
        .trim();
      const name = b.getAttribute('aria-label') ?? b.textContent!.trim();
      expect(visible.length).toBeGreaterThan(0);
      expect(name.startsWith(visible), `${JSON.stringify(name)} starts with ${JSON.stringify(visible)}`).toBe(true);
      expect(name.length).toBeGreaterThan(visible.length);
    }
    expect(screen.getByRole('button', { name: 'Apply… Base' })).toBeTruthy();
  });

  it('Duplicate, Rename and Delete (asks first); a blank name is refused', async () => {
    const { map } = await open();
    saveCurrent('Base');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Base' }));
    expect(savedNames()).toEqual(['Base', 'Base (copy)']);
    fireEvent.click(screen.getByRole('button', { name: 'Rename… Base (copy)' }));
    const input = within(dialog()).getByRole('textbox', { name: 'New name' });
    fireEvent.change(input, { target: { value: '   ' } });
    expect((within(dialog()).getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '  Variant  ' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Rename' }));
    expect(savedNames()).toEqual(['Base', 'Variant']);
    expect(library(map).map((e) => e.id)).toEqual(['base', 'base-copy']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete… Base' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete “Base”?' })).getByRole('button', { name: 'Cancel' }));
    expect(savedNames()).toEqual(['Base', 'Variant']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete… Base' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete Scenario' }));
    expect(savedNames()).toEqual(['Variant']);
    expect(library(map).map((e) => e.scenario.name)).toEqual(['Variant']);
  });

  it('the library survives a reload; a corrupt stored library is empty and the panel still works', async () => {
    const m = await open();
    saveCurrent('Kept');
    cleanup();
    await open(m);
    expect(savedNames()).toEqual(['Kept']);
    cleanup();
    const bad = memory();
    bad.map.set(SCENARIOS_STORAGE_KEY, '{"version":1,"scenarios":[{"id":"__proto__","scenario":{}}, 42, {"id":"ok"}]');
    await open(bad);
    expect(screen.getByText(/No scenarios saved/)).toBeTruthy();
    saveCurrent('Fresh');
    expect(savedNames()).toEqual(['Fresh']);
  });

  it('a storage that refuses the library: an alert says it is not saved; the library is kept in memory', async () => {
    await open(memory({}, undefined, true));
    saveCurrent('Unsaved');
    expect(savedNames()).toEqual(['Unsaved']);
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.some((t) => /Not saved: the browser’s storage is full or blocked/.test(t ?? ''))).toBe(true);
  });

  it('the library limit: the 101st scenario is refused with a message', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `s-${i}`, scenario: { ...example('burst-potion'), name: `S ${i}` } }));
    await open(memory({}, { version: 1, scenarios: full }));
    expect(savedNames()).toHaveLength(100);
    saveCurrent('One too many');
    expect(screen.getAllByRole('alert').some((a) => /library is full/.test(a.textContent ?? ''))).toBe(true);
    expect(savedNames()).toHaveLength(100);
  });
});

describe('Scenarios: import and export', () => {
  it('imports a valid file: preview, report, Save to Library; the export is the same file (round trip)', async () => {
    const { map } = await open();
    const text = exampleText('burst-potion');
    importText(text);
    const preview = within(dialog()).getByRole('group', { name: 'Preview' });
    expect(preview.textContent).toContain(example('burst-potion').name);
    expect(within(dialog()).getByRole('group', { name: 'Validation report' }).textContent).toContain('No errors or warnings');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save to Library' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(savedNames()).toEqual([example('burst-potion').name]);

    fireEvent.click(screen.getByRole('button', { name: `Export… ${example('burst-potion').name}` }));
    const exported = (within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }) as HTMLTextAreaElement).value;
    const back = parseScenario(exported, { db });
    expect(back.ok).toBe(true);
    const stored = library(map)[0]!.scenario;
    expect(back.scenario).toEqual(stored);
    const { createdAt: _c, updatedAt: _u, ...rest } = stored;
    const { createdAt: _c2, updatedAt: _u2, ...original } = example('burst-potion');
    expect(rest).toEqual(original);
    expect(stored.createdAt).toBe(new Date(FAKE_NOW).toISOString());
  });

  it('Copy JSON writes the file to the clipboard; Download File saves it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:x';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await open(memory({}, { version: 1, scenarios: [{ id: 'b', scenario: example('burst-potion') }] }));
    fireEvent.click(screen.getByRole('button', { name: `Export… ${example('burst-potion').name}` }));
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Copy JSON' }));
    });
    expect(writeText).toHaveBeenCalledWith(exportScenario(example('burst-potion')));
    expect(within(dialog()).getByText('Copied.')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Download File' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(await created[0]!.text()).toBe(exportScenario(example('burst-potion')));
    expect(within(dialog()).getByText(/Downloading .*\.json/)).toBeTruthy();
  });

  it('invalid, hostile and huge files: the report lists the errors and Save is blocked; nothing is polluted', async () => {
    await open();
    const save = () => within(dialog()).getByRole('button', { name: 'Save to Library' }) as HTMLButtonElement;
    const report = () => within(dialog()).getByRole('group', { name: 'Validation report' }).textContent;
    importText('{ not json');
    expect(report()).toMatch(/not valid JSON/);
    expect(save().disabled).toBe(true);

    const withError = JSON.parse(exampleText('burst-potion')) as Scenario;
    withError.script.rules[0]!.if = 'heroism.active &&';
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }), { target: { value: JSON.stringify(withError) } });
    expect(report()).toMatch(/script\.rules\[0\]\.if: column/);
    expect(save().disabled).toBe(true);

    const hostile = `{"format":"rotation-trainer.scenario","version":1,"name":"<script>alert(1)</script>","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"script":{"rules":[{"action":"cast","id":"shadow-bolt"}]}}`;
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }), { target: { value: hostile } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(report()).toMatch(/warning/);
    expect(save().disabled).toBe(false); // warnings do not block
    expect(document.querySelector('script')).toBeNull();

    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }), { target: { value: `{${' '.repeat(200_001)}}` } });
    expect(report()).toMatch(/longer than 200000 characters/);
    expect(save().disabled).toBe(true);

    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Scenario JSON' }), { target: { value: `${'['.repeat(5000)}${']'.repeat(5000)}` } });
    expect(save().disabled).toBe(true);
  });

  it('imports a file: "Reading file…", then the report; a file over the limit is not read', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Import Scenario…' }));
    const input = within(dialog()).getByLabelText('Or choose a file') as HTMLInputElement;
    const file = new File([exampleText('life-tap-mana')], 'life-tap.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise<void>((r) => queueMicrotask(r));
    });
    await vi.waitFor(() => expect(within(dialog()).getByText('Read life-tap.json.')).toBeTruthy());
    expect(within(dialog()).getByRole('group', { name: 'Preview' }).textContent).toContain(example('life-tap-mana').name);
    const big = new File(['x'], 'big.json');
    Object.defineProperty(big, 'size', { value: 10_000_000 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } });
    });
    expect(within(dialog()).getByText(/The file is too large/)).toBeTruthy();
  });
});

describe('Scenarios: examples', () => {
  it('lists the bundled examples (loaded lazily); Save to Library and Apply work', async () => {
    const { map } = await open();
    const list = await vi.waitFor(() => screen.getByRole('list', { name: 'Example scenarios' }));
    const names = [...list.querySelectorAll('h3')].map((h) => h.textContent);
    expect(names).toEqual(SCENARIO_EXAMPLES.map((e) => example(e.file).name));
    const trinket = example('trinket-sequencing');
    fireEvent.click(within(list).getByRole('button', { name: `Save to Library ${trinket.name}` }));
    expect(savedNames()).toEqual([trinket.name]);
    fireEvent.click(within(list).getByRole('button', { name: `Apply… ${trinket.name}` }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Apply Scenario' }));
    expect(config(map).script).toEqual(trinket.script);
    expect(config(map).fightDurationSec).toBe(90);
    expect(config(map).gear).toEqual(trinket.setup!.gear);
  });
});
