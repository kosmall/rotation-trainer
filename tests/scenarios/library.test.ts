// The scenario library (Task 3): pure list operations with unique ids and limits, and its own
// localStorage key with corrupt-storage handling.

import { describe, expect, it } from 'vitest';
import { parseScenario } from '../../src/scenarios/format';
import {
  addScenario,
  deleteScenario,
  duplicateScenario,
  LIBRARY_LIMITS,
  renameScenario,
  scenarioIdFor,
  updateScenario,
  type ScenarioEntry,
} from '../../src/scenarios/library';
import { loadScenarios, saveScenarios, SCENARIOS_STORAGE_KEY, SCENARIOS_STORAGE_MAX_CHARS } from '../../src/scenarios/storage';
import { SCENARIO_FORMAT, type Scenario } from '../../src/scenarios/types';
import { SETUP_STORAGE_KEY } from '../../src/setup/storage';

const make = (name: string, extra: Partial<Scenario> = {}): Scenario =>
  parseScenario(JSON.stringify({ format: SCENARIO_FORMAT, version: 1, name, script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] }, ...extra })).scenario!;

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe('library operations', () => {
  it('add: a unique id from the name, timestamps from `now`, the list not mutated', () => {
    const empty: ScenarioEntry[] = [];
    const a = ok(addScenario(empty, make('Pipe then Icon!'), '2026-11-03T10:00:00.000Z'));
    expect(empty).toEqual([]);
    expect(a.id).toBe('pipe-then-icon');
    expect(a.list[0]!.scenario.createdAt).toBe('2026-11-03T10:00:00.000Z');
    expect(a.list[0]!.scenario.updatedAt).toBe('2026-11-03T10:00:00.000Z');
    const b = ok(addScenario(a.list, make('Pipe then Icon')));
    expect(b.id).toBe('pipe-then-icon-2');
    const c = ok(addScenario(b.list, make('Pipe then Icon')));
    expect(c.id).toBe('pipe-then-icon-3');
    expect(new Set(c.list.map((e) => e.id)).size).toBe(3);
    expect(scenarioIdFor('***', [])).toBe('scenario');
    expect(scenarioIdFor('Ü'.repeat(100), [])).toBe('scenario');
    expect(scenarioIdFor('a'.repeat(200), []).length).toBeLessThanOrEqual(LIBRARY_LIMITS.idLength);
  });

  it('duplicate: a copy after the original with " (copy)" and a new id', () => {
    const a = ok(addScenario([], make('A')));
    const b = ok(addScenario(a.list, make('B')));
    const d = ok(duplicateScenario(b.list, a.id, '2026-11-04T00:00:00.000Z'));
    expect(d.list.map((e) => e.scenario.name)).toEqual(['A', 'A (copy)', 'B']);
    expect(d.id).toBe('a-copy');
    expect(d.list[1]!.scenario.script).toEqual(d.list[0]!.scenario.script);
    expect(d.list[1]!.scenario.script).not.toBe(d.list[0]!.scenario.script);
    expect(d.list[1]!.scenario.createdAt).toBe('2026-11-04T00:00:00.000Z');
    expect(duplicateScenario(b.list, 'nope').ok).toBe(false);
  });

  it('rename: trimmed, not blank, at most 100 characters; the id stays', () => {
    const a = ok(addScenario([], make('A')));
    const r = ok(renameScenario(a.list, a.id, '  New name  ', '2026-11-05T00:00:00.000Z'));
    expect(r.list[0]!.scenario.name).toBe('New name');
    expect(r.list[0]!.id).toBe(a.id);
    expect(r.list[0]!.scenario.updatedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(renameScenario(a.list, a.id, '   ').ok).toBe(false);
    expect(renameScenario(a.list, a.id, 'x'.repeat(101)).ok).toBe(false);
    expect(renameScenario(a.list, 'nope', 'x').ok).toBe(false);
  });

  it('update: replaces the scenario, keeps id and createdAt', () => {
    const a = ok(addScenario([], make('A'), '2026-11-03T10:00:00.000Z'));
    const u = ok(updateScenario(a.list, a.id, make('A2', { notes: 'n' }), '2026-11-06T00:00:00.000Z'));
    expect(u.list[0]!.scenario).toMatchObject({ name: 'A2', notes: 'n', createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' });
    expect(updateScenario(a.list, 'nope', make('x')).ok).toBe(false);
  });

  it('delete', () => {
    const a = ok(addScenario([], make('A')));
    const b = ok(addScenario(a.list, make('B')));
    const d = ok(deleteScenario(b.list, a.id));
    expect(d.list.map((e) => e.id)).toEqual([b.id]);
    expect(deleteScenario(b.list, 'nope').ok).toBe(false);
  });

  it('limits: 100 scenarios, the per-scenario file cap, the total size; unreadable scenarios refused', () => {
    let list: ScenarioEntry[] = [];
    for (let i = 0; i < LIBRARY_LIMITS.scenarios; i++) list = ok(addScenario(list, make(`S${i}`))).list;
    const full = addScenario(list, make('one more'));
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toMatch(/100 scenarios/);
    expect(duplicateScenario(list, list[0]!.id).ok).toBe(false);
    // Total size: a few large scenarios fill the library.
    const big = make('big', { notes: 'x'.repeat(9_000), description: 'd'.repeat(2000) });
    const rules = Array.from({ length: 200 }, () => ({ action: 'cast' as const, id: 'shadow-bolt', if: 'mana < 1', comment: 'c'.repeat(800) }));
    const huge = { ...big, script: { rules } };
    let biglist: ScenarioEntry[] = [];
    let refused = false;
    for (let i = 0; i < 20; i++) {
      const r = addScenario(biglist, huge);
      if (!r.ok) {
        expect(r.error).toMatch(/too large|library is full/);
        refused = true;
        break;
      }
      biglist = r.list;
    }
    expect(refused).toBe(true);
    expect(JSON.stringify(biglist).length).toBeLessThanOrEqual(LIBRARY_LIMITS.totalChars);
    expect(addScenario([], { name: 'x' } as unknown as Scenario).ok).toBe(false);
  });
});

describe('library storage', () => {
  it('own key, round trip, nothing else touched', () => {
    const s = memory({ [SETUP_STORAGE_KEY]: 'keep' });
    const list = ok(addScenario(ok(addScenario([], make('A'))).list, make('B', { setup: { distanceYd: 5 } }))).list;
    expect(saveScenarios(s, list)).toBe(true);
    expect([...s.data.keys()].sort()).toEqual([SCENARIOS_STORAGE_KEY, SETUP_STORAGE_KEY].sort());
    expect(s.data.get(SETUP_STORAGE_KEY)).toBe('keep');
    expect(SCENARIOS_STORAGE_KEY).toBe('rotation-trainer:scenarios:v1');
    expect(loadScenarios(s)).toEqual(list);
  });

  it('corrupt or hostile storage gives an empty list; bad entries are dropped', () => {
    const cases: unknown[] = [
      null,
      '',
      'not json',
      '[]',
      '{}',
      '{"version":2,"scenarios":[]}',
      '{"version":1,"scenarios":{}}',
      '[' .repeat(10000),
      ' '.repeat(SCENARIOS_STORAGE_MAX_CHARS + 1),
      '{"__proto__":{"scenarios":[1]}}',
    ];
    for (const text of cases) expect(loadScenarios(memory(text === null ? {} : { [SCENARIOS_STORAGE_KEY]: text as string }))).toEqual([]);
    expect(loadScenarios(null)).toEqual([]);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    expect(loadScenarios(throwing)).toEqual([]);
    expect(saveScenarios(throwing, [])).toBe(false);
    expect(saveScenarios(null, [])).toBe(false);
    const good = ok(addScenario([], make('A'))).list[0]!;
    const mixed = {
      version: 1,
      scenarios: [good, { id: good.id, scenario: good.scenario }, { id: 'Bad Id', scenario: good.scenario }, { id: 'x', scenario: { name: 'no format' } }, 5, { id: 'y' }, { ...good, id: 'z' }],
    };
    expect(loadScenarios(memory({ [SCENARIOS_STORAGE_KEY]: JSON.stringify(mixed) })).map((e) => e.id)).toEqual([good.id, 'z']);
  });

  it('at most 100 entries are loaded; a list over the limits is not saved', () => {
    const entry = ok(addScenario([], make('A'))).list[0]!;
    const many = Array.from({ length: 120 }, (_, i) => ({ id: `s-${i}`, scenario: entry.scenario }));
    const s = memory({ [SCENARIOS_STORAGE_KEY]: JSON.stringify({ version: 1, scenarios: many }) });
    expect(loadScenarios(s)).toHaveLength(100);
    expect(saveScenarios(memory(), many)).toBe(false);
  });
});
