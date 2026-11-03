// The scenario library (rotation scripts Task 3, spec §2 B): the player's saved scenarios as a list
// of entries with unique ids, and the pure operations the Scenarios panel performs on it (add,
// duplicate, rename, update, delete) within the library's limits. Pure: every operation returns a
// new list and never mutates its input; timestamps come in as arguments (no wall clock here).
// Persistence: storage.ts.

import { exportScenario, readScenario } from './format';
import { SCENARIO_LIMITS, type Scenario } from './types';

export { applyScenario } from './format';

/** One saved scenario. */
export interface ScenarioEntry {
  /** Unique in the library: `[a-z0-9-]`, 1-64 characters. */
  id: string;
  scenario: Scenario;
}

export const LIBRARY_LIMITS = Object.freeze({
  scenarios: 100,
  /** Characters of the whole stored library (its JSON), below the browsers' localStorage quota. */
  totalChars: 2_000_000,
  idLength: 64,
});

/** An entry id: lower-case letters, digits and dashes, 1-64 characters. */
export const SCENARIO_ID_RE = /^[a-z0-9-]{1,64}$/;

export type LibraryResult = { ok: true; list: ScenarioEntry[]; id: string } | { ok: false; error: string };

const fail = (error: string): LibraryResult => ({ ok: false, error });

/**
 * A new id for a scenario named `name`: its slug (lower case, runs of other characters as one
 * dash, at most 56 characters; 'scenario' when nothing is left), with `-2`, `-3`, ... when taken.
 */
export function scenarioIdFor(name: string, list: readonly ScenarioEntry[]): string {
  const slug =
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56)
      .replace(/-+$/, '') || 'scenario';
  const taken = new Set(list.map((e) => e.id));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const id = `${slug}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** The scenario normalized (`readScenario`), or an error when it cannot be read or is too large. */
function normalized(scenario: Scenario): { ok: true; scenario: Scenario } | { ok: false; error: string } {
  const read = readScenario(scenario);
  if (read.scenario === undefined) return { ok: false, error: `the scenario cannot be read: ${read.errors[0]?.message ?? 'unknown error'}` };
  if (exportScenario(read.scenario).length > SCENARIO_LIMITS.fileChars) {
    return { ok: false, error: `the scenario is too large (over ${SCENARIO_LIMITS.fileChars} characters)` };
  }
  return { ok: true, scenario: read.scenario };
}

/** The list if it fits the library's limits, else an error. */
function within(list: ScenarioEntry[], id: string): LibraryResult {
  if (list.length > LIBRARY_LIMITS.scenarios) return fail(`the library is full (${LIBRARY_LIMITS.scenarios} scenarios)`);
  if (JSON.stringify(list).length > LIBRARY_LIMITS.totalChars) return fail('the library is full: the scenarios are too large together');
  return { ok: true, list, id };
}

const stamped = (s: Scenario, now: string | undefined, created: boolean): Scenario =>
  now === undefined ? s : { ...s, ...(created && { createdAt: now }), updatedAt: now };

const indexOf = (list: readonly ScenarioEntry[], id: string) => list.findIndex((e) => e.id === id);

/**
 * Adds `scenario` (normalized) at the end with a new id (`scenarioIdFor` its name). With `now`
 * (an ISO date), `createdAt` and `updatedAt` are set to it. Fails over 100 scenarios, over the
 * library's total size, for a scenario over 200 000 characters or one that cannot be read.
 */
export function addScenario(list: readonly ScenarioEntry[], scenario: Scenario, now?: string): LibraryResult {
  if (list.length >= LIBRARY_LIMITS.scenarios) return fail(`the library is full (${LIBRARY_LIMITS.scenarios} scenarios)`);
  const n = normalized(scenario);
  if (!n.ok) return fail(n.error);
  const id = scenarioIdFor(n.scenario.name, list);
  return within([...list, { id, scenario: stamped(n.scenario, now, true) }], id);
}

/** A copy of entry `id` right after it, named "<name> (copy)" (cut to 100 characters), with a new id. */
export function duplicateScenario(list: readonly ScenarioEntry[], id: string, now?: string): LibraryResult {
  const i = indexOf(list, id);
  if (i < 0) return fail(`no scenario '${id}'`);
  if (list.length >= LIBRARY_LIMITS.scenarios) return fail(`the library is full (${LIBRARY_LIMITS.scenarios} scenarios)`);
  const name = `${list[i]!.scenario.name} (copy)`.slice(0, SCENARIO_LIMITS.name);
  const copy = stamped({ ...structuredClone(list[i]!.scenario), name }, now, true);
  const newId = scenarioIdFor(name, list);
  return within([...list.slice(0, i + 1), { id: newId, scenario: copy }, ...list.slice(i + 1)], newId);
}

/** Renames entry `id` (the name trimmed; not blank, at most 100 characters); the id stays. */
export function renameScenario(list: readonly ScenarioEntry[], id: string, name: string, now?: string): LibraryResult {
  const i = indexOf(list, id);
  if (i < 0) return fail(`no scenario '${id}'`);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return fail('the name must not be blank');
  if (trimmed.length > SCENARIO_LIMITS.name) return fail(`the name is longer than ${SCENARIO_LIMITS.name} characters`);
  const next = [...list];
  next[i] = { id, scenario: stamped({ ...list[i]!.scenario, name: trimmed }, now, false) };
  return within(next, id);
}

/** Replaces entry `id`'s scenario (normalized), keeping its id and `createdAt`. */
export function updateScenario(list: readonly ScenarioEntry[], id: string, scenario: Scenario, now?: string): LibraryResult {
  const i = indexOf(list, id);
  if (i < 0) return fail(`no scenario '${id}'`);
  const n = normalized(scenario);
  if (!n.ok) return fail(n.error);
  const createdAt = list[i]!.scenario.createdAt;
  const s = stamped({ ...n.scenario, ...(createdAt !== undefined && { createdAt }) }, now, false);
  const next = [...list];
  next[i] = { id, scenario: s };
  return within(next, id);
}

/** Removes entry `id`. */
export function deleteScenario(list: readonly ScenarioEntry[], id: string): LibraryResult {
  const i = indexOf(list, id);
  if (i < 0) return fail(`no scenario '${id}'`);
  return { ok: true, list: list.filter((e) => e.id !== id), id };
}
