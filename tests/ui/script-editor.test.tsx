// Setup → Rotation, Script mode: the rotation script editor (rotation scripts Task 5, adapted to
// the redesigned Setup screen). Rules are added, edited, moved and validated live; Convert gives
// the basic rotation's equivalent script (the same Priority list); the JSON view applies only a
// valid script; named conditions; hostile text; no hotkey while typing; the edit plays from the
// next fight (at once when the fight has not started); the stored script survives a reload and a
// corrupt one falls back to the basic rotation.

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  window.location.hash = '';
});

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

function memory(p: Partial<SetupConfig> | string = {}): { storage: SetupStorage; map: Map<string, string> } {
  const text = typeof p === 'string' ? p : JSON.stringify({ ...structuredClone(DEFAULT_SETUP), ...p });
  const map = new Map([[SETUP_STORAGE_KEY, text]]);
  const storage: SetupStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

const stored = (map: Map<string, string>) => JSON.parse(map.get(SETUP_STORAGE_KEY)!) as SetupConfig;
const mode = () => screen.getByRole('group', { name: 'Rotation mode' });
const rulesList = () => screen.queryByRole('list', { name: 'Rotation rules' });
const rows = () => [...rulesList()!.children] as HTMLElement[];
const cond = (n: number) => screen.getByRole('textbox', { name: `Rule ${n} condition` }) as HTMLTextAreaElement;
const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement;
const priority = () => within(screen.getByRole('list', { name: 'Priority' })).queryAllByRole('listitem').map((li) => li.querySelector('strong')!.textContent);
const typeCond = (n: number, text: string) => fireEvent.change(cond(n), { target: { value: text } });
const check = () => screen.getByRole('status', { name: 'Script check' }).textContent;

async function openScript(options: Parameters<typeof memory>[0] = {}) {
  const m = memory(options);
  renderApp({ route: '#/setup/rotation', storage: m.storage });
  await settle();
  fireEvent.click(within(mode()).getByRole('button', { name: 'Script' }));
  await settle();
  return m;
}

describe('Script editor: rules', () => {
  it('adds, edits, moves, duplicates and deletes rules; each edit is saved and compiled into the Priority list', async () => {
    const { map } = await openScript();
    expect(screen.getByText(/No rules yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add the First Rule' }));
    expect(rows()).toHaveLength(1);
    fireEvent.change(select('Rule 1 id'), { target: { value: 'immolate' } });
    typeCond(1, '!target.aura.immolate.active');
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    fireEvent.change(select('Rule 2 id'), { target: { value: 'shadow-bolt' } });
    expect(stored(map).script).toEqual({
      rules: [
        { action: 'cast', id: 'immolate', if: '!target.aura.immolate.active' },
        { action: 'cast', id: 'shadow-bolt' },
      ],
    });
    expect(priority()).toEqual(['Immolate', 'Shadow Bolt']);
    expect(rows()[1]!.textContent).toContain('Always');
    expect(screen.getByText(/Script active: its 2 rules play/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }));
    expect(stored(map).script!.rules.map((r) => r.id)).toEqual(['shadow-bolt', 'immolate']);
    expect(priority()).toEqual(['Shadow Bolt', 'Immolate']);
    expect((screen.getByRole('button', { name: 'Move rule 1 up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move rule 2 down' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate rule 2' }));
    expect(stored(map).script!.rules.map((r) => r.id)).toEqual(['shadow-bolt', 'immolate', 'immolate']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 1' }));
    expect(stored(map).script!.rules.map((r) => r.id)).toEqual(['immolate', 'immolate']);

    // Action, label, comment and enabled.
    fireEvent.change(select('Rule 2 action'), { target: { value: 'wait' } });
    expect(stored(map).script!.rules[1]).toEqual({ action: 'wait', if: '!target.aura.immolate.active' });
    fireEvent.change(select('Rule 2 action'), { target: { value: 'use' } });
    expect(stored(map).script!.rules[1]!.action).toBe('use');
    expect(stored(map).script!.rules[1]!.id).toBe('item:29370'); // the first item action: the worn Icon
    fireEvent.click(screen.getByRole('button', { name: 'Label and comment of rule 1' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Rule 1 label' }), { target: { value: 'Keep Immolate up' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Rule 1 comment' }), { target: { value: 'A DoT.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rule 2 enabled' }));
    expect(stored(map).script!.rules).toEqual([
      { action: 'cast', id: 'immolate', if: '!target.aura.immolate.active', label: 'Keep Immolate up', comment: 'A DoT.' },
      { action: 'use', id: 'item:29370', if: '!target.aura.immolate.active', enabled: false },
    ]);
    expect(priority()).toEqual(['Keep Immolate up']);
    expect(check()).toMatch(/1 warning/); // rule 2 left out: disabled

    // An id that is not in the list: a text field, back to the list.
    fireEvent.change(select('Rule 1 id'), { target: { value: '\u0000other' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Rule 1 id' }), { target: { value: 'conflagrate' } });
    expect(stored(map).script!.rules[0]!.id).toBe('conflagrate');
    expect(within(rows()[0]!).getByText(/rules\[0\]\.id/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List of ids for rule 1' }));
    expect(select('Rule 1 id').value).toBe('shadow-bolt');
  });

  it('validates live: syntax errors with their column under the field, unknown ids with a suggestion, type errors', async () => {
    await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] } });
    expect(check()).toBe('No errors or warnings');
    typeCond(1, 'mana <');
    expect(cond(1).getAttribute('aria-invalid')).toBe('true');
    const describedBy = () => document.getElementById(cond(1).getAttribute('aria-describedby')!)!.textContent;
    expect(describedBy()).toMatch(/rules\[0\]\.if: column 7: /);
    expect(check()).toMatch(/^1 error/);
    expect(priority()).toEqual([]); // the rule is left out

    typeCond(1, 'target.aura.immolatee.active');
    expect(cond(1).getAttribute('aria-invalid')).toBeNull();
    expect(describedBy()).toMatch(/unknown.*immolatee/i);
    expect(describedBy()).toContain('Did you mean “immolate”?');
    expect(check()).toMatch(/^0 errors, [1-9]\d* warnings?$/);

    typeCond(1, 'mana && true');
    expect(describedBy()).toMatch(/column 1: /);
    expect(check()).toMatch(/^1 error/);

    typeCond(1, 'mana.pct < 35 && !heroism.active');
    expect(check()).toBe('No errors or warnings');
    expect(priority()).toEqual(['Shadow Bolt']);
  });

  it('a wait rule without a condition is an error; a blank condition of a cast rule means always', async () => {
    await openScript({ script: { rules: [{ action: 'wait', if: 'time.remaining < 3' }, { action: 'cast', id: 'shadow-bolt' }] } });
    expect(check()).toBe('No errors or warnings');
    typeCond(1, '');
    expect(check()).toMatch(/^1 error/);
    expect(screen.getAllByText(/rules\[0\]/).length).toBeGreaterThan(0);
  });
});

describe('Script editor: convert, clear, JSON', () => {
  it('Convert From Basic Rotation gives the equivalent script: the same Priority list; replacing a script asks first', async () => {
    const { map } = await openScript({ enabledBuffs: ['destruction-potion'] });
    fireEvent.click(within(mode()).getByRole('button', { name: 'Basic' }));
    const basic = priority();
    fireEvent.click(within(mode()).getByRole('button', { name: 'Script' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Convert the Basic Rotation' }));
    expect(priority()).toEqual(basic);
    const script = stored(map).script!;
    expect(script.rules.length).toBe(basic.length);
    expect(script.rules[0]).toMatchObject({ action: 'use', id: 'destruction-potion' });
    expect(check()).toBe('No errors or warnings');

    // With a script: Convert asks first; Cancel keeps it.
    typeCond(1, 'heroism.active');
    fireEvent.click(screen.getByRole('button', { name: 'Convert From Basic Rotation…' }));
    const dialog = screen.getByRole('dialog', { name: 'Replace the Script?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(stored(map).script!.rules[0]!.if).toBe('heroism.active');
    fireEvent.click(screen.getByRole('button', { name: 'Convert From Basic Rotation…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Convert' }));
    expect(stored(map).script).toEqual(script);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Script…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Script' }));
    expect(stored(map)).not.toHaveProperty('script');
    expect(priority()).toEqual(basic);
    expect(screen.getByText('The basic rotation plays.')).toBeTruthy();
  });

  it('the JSON view applies only a valid script', async () => {
    const { map } = await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON' }));
    const area = screen.getByRole('textbox', { name: 'Script as JSON' }) as HTMLTextAreaElement;
    expect(JSON.parse(area.value)).toEqual({ rules: [{ action: 'cast', id: 'shadow-bolt' }] });
    const apply = () => screen.getByRole('button', { name: 'Apply JSON' }) as HTMLButtonElement;
    const status = () => area.parentElement!.querySelector('[role="status"]')!.textContent;
    for (const [text, why] of [
      ['{ rules: [', /Not valid JSON/],
      ['[1, 2]', /an object with a "rules" array/],
      ['{"rules": [{"action": "jump"}]}', /1 of 1 rules cannot be read/],
      ['{"rules": [{"action": "cast", "id": "shadow-bolt", "if": "mana <"}]}', /1 error/],
      [`{"rules": [], "x": "${'a'.repeat(200_001)}"}`, /longer than 200,000/],
    ] as const) {
      fireEvent.change(area, { target: { value: text } });
      expect(status()).toMatch(why);
      expect(apply().disabled).toBe(true);
    }
    fireEvent.change(area, {
      target: { value: JSON.stringify({ rules: [{ action: 'cast', id: 'immolate', if: '$dot' }, { action: 'cast', id: 'shadow-bolt' }], defs: { dot: '!target.aura.immolate.active' } }) },
    });
    expect(status()).toBe('Valid: 2 rules.');
    fireEvent.click(apply());
    expect(stored(map).script).toEqual({ rules: [{ action: 'cast', id: 'immolate', if: '$dot' }, { action: 'cast', id: 'shadow-bolt' }], defs: { dot: '!target.aura.immolate.active' } });
    expect(screen.queryByRole('textbox', { name: 'Script as JSON' })).toBeNull();
    expect(priority()).toEqual(['Immolate', 'Shadow Bolt']);
  });
});

describe('Script editor: named conditions, variables help, hostile text', () => {
  it('adds, renames (only to a valid free name) and deletes named conditions', async () => {
    const { map } = await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: '$burst' }] } });
    expect(check()).toMatch(/^1 error/); // unknown $burst
    fireEvent.click(screen.getByRole('button', { name: 'Add Named Condition' }));
    expect(stored(map).script!.defs).toEqual({ cond: '' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Condition of $cond' }), { target: { value: 'heroism.active' } });
    const name = screen.getByRole('textbox', { name: 'Name of the named condition cond' });
    fireEvent.change(name, { target: { value: '1 bad' } });
    expect(screen.getByText(/Use letters, digits/)).toBeTruthy();
    fireEvent.blur(name);
    expect(stored(map).script!.defs).toEqual({ cond: 'heroism.active' });
    fireEvent.change(name, { target: { value: 'burst' } });
    fireEvent.blur(name);
    expect(stored(map).script!.defs).toEqual({ burst: 'heroism.active' });
    expect(check()).toBe('No errors or warnings');
    fireEvent.click(screen.getByRole('button', { name: 'Delete $burst' }));
    expect(stored(map).script).toEqual({ rules: [{ action: 'cast', id: 'shadow-bolt', if: '$burst' }] });
  });

  it('the variables help searches and inserts at the cursor of the last condition', async () => {
    const { map } = await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: ' && mana.pct > 20' }] } });
    const search = screen.getByRole('searchbox', { name: 'Search variables and ids' });
    fireEvent.click(screen.getByRole('button', { name: 'Insert heroism.active' }));
    expect(screen.getByText(/Click into a condition first/)).toBeTruthy();
    fireEvent.change(search, { target: { value: 'heroism' } });
    const list = screen.getByRole('list', { name: 'Variables and ids' });
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('code')!.textContent)).toEqual(['heroism.active', 'heroism.over']);
    cond(1).focus();
    cond(1).setSelectionRange(0, 0);
    fireEvent.select(cond(1));
    fireEvent.click(within(list).getByRole('button', { name: 'Insert heroism.active' }));
    expect(stored(map).script!.rules[0]!.if).toBe('heroism.active && mana.pct > 20');
    fireEvent.change(search, { target: { value: 'zzzz-nothing' } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it('hostile text stays text; an over-long paste is cut to the 500-character limit; __proto__ is a plain unknown id', async () => {
    const { map } = await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] } });
    typeCond(1, '<img src=x onerror=alert(1)> __proto__.constructor');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(cond(1).value).toBe('<img src=x onerror=alert(1)> __proto__.constructor');
    expect(check()).toMatch(/error/);
    typeCond(1, `self.aura.__proto__.active`);
    expect(check()).toMatch(/^0 errors, [1-9]/);
    expect(({} as Record<string, unknown>).active).toBeUndefined();
    typeCond(1, 'x'.repeat(10_000));
    expect(stored(map).script!.rules[0]!.if).toHaveLength(500);
    expect(rows()).toHaveLength(1);
  });

  it('keys typed into the editor are the field’s: no shortcut, no fight hotkey', async () => {
    await openScript({ script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] } });
    for (const key of ['g', 's', '?', '1', ' ', 'r']) fireEvent.keyDown(cond(1), { key });
    expect(window.location.hash).toBe('#/setup/rotation');
    expect(screen.queryByRole('dialog')).toBeNull();
    goTo('#/fight');
    expect(screen.getByRole('button', { name: /^start the fight$/i })).toBeTruthy();
  });
});

describe('Script editor: when it plays, storage', () => {
  it('a fight that has not started takes the script at once; a running fight keeps its rotation until R', async () => {
    const m = memory({});
    renderApp({ route: '#/fight', storage: m.storage });
    await settle();
    goTo('#/setup/rotation');
    await settle();
    fireEvent.click(within(mode()).getByRole('button', { name: 'Script' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Add the First Rule' }));
    expect(screen.queryByText(/^Changed since/)).toBeNull(); // not started: the next fight is this one
    goTo('#/fight');
    fireEvent.keyDown(window, { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    goTo('#/setup/rotation');
    await settle();
    fireEvent.click(within(mode()).getByRole('button', { name: 'Script' }));
    await settle();
    fireEvent.change(select('Rule 1 id'), { target: { value: 'immolate' } });
    expect(screen.getByText(/^Changed since the running fight started: it applies after you reset the fight/)).toBeTruthy();
  });

  it('the stored script survives a reload; a corrupt stored script falls back to the basic rotation', async () => {
    const m = await openScript();
    fireEvent.click(screen.getByRole('button', { name: 'Add the First Rule' }));
    typeCond(1, 'mana.pct > 50');
    cleanup();
    renderApp({ route: '#/setup/rotation', storage: m.storage });
    await settle();
    expect(within(mode()).getByRole('button', { name: 'Script' }).getAttribute('aria-pressed')).toBe('true');
    expect(cond(1).value).toBe('mana.pct > 50');
    cleanup();

    const corrupt = memory(JSON.stringify({ ...DEFAULT_SETUP, script: { rules: 'not a list', defs: { __proto__: 'x', 'bad name': 1 } } }));
    renderApp({ route: '#/setup/rotation', storage: corrupt.storage });
    await settle();
    expect(screen.getByText('The basic rotation plays.')).toBeTruthy();
    expect(within(mode()).getByRole('button', { name: 'Basic' }).getAttribute('aria-pressed')).toBe('true');
  });
});
