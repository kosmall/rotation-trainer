// Persistence of the scenario library in localStorage (rotation scripts Task 3, spec §2 B), under
// its own key next to the setup's. The same rules as src/setup/storage.ts: stored data is never
// trusted (every entry is read again with `readScenario`), nothing here throws, and the storage is
// injected (tests pass in-memory fakes; the app passes `browserStorage()`).

import type { SetupStorage } from '../setup/storage';
import { readScenario } from './format';
import { LIBRARY_LIMITS, SCENARIO_ID_RE, type ScenarioEntry } from './library';

/** The localStorage key; the version suffix lets a later format move to a new key. */
export const SCENARIOS_STORAGE_KEY = 'rotation-trainer:scenarios:v1';

/** Longest stored text read or written: the library's total size cap (`LIBRARY_LIMITS.totalChars`) plus the wrapper. */
export const SCENARIOS_STORAGE_MAX_CHARS = LIBRARY_LIMITS.totalChars + 1000;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

/**
 * The stored library: `{ version: 1, scenarios: [{ id, scenario }] }` under
 * `SCENARIOS_STORAGE_KEY`. Never throws: no storage, nothing stored, a storage that throws, text
 * over `SCENARIOS_STORAGE_MAX_CHARS`, invalid JSON or the wrong shape all give an empty list. An
 * entry is kept when its id is a valid id (`[a-z0-9-]`, 1-64) not already taken and its scenario is
 * readable (`readScenario` gives one; it is stored normalized); at most 100 entries.
 */
export function loadScenarios(storage: SetupStorage | null): ScenarioEntry[] {
  let parsed: unknown;
  try {
    const text: unknown = storage?.getItem(SCENARIOS_STORAGE_KEY);
    if (typeof text === 'string' && text.length <= SCENARIOS_STORAGE_MAX_CHARS) parsed = JSON.parse(text);
  } catch {
    return [];
  }
  try {
    if (!isRecord(parsed) || own(parsed, 'version') !== 1) return [];
    const raw = own(parsed, 'scenarios');
    if (!Array.isArray(raw)) return [];
    const out: ScenarioEntry[] = [];
    const ids = new Set<string>();
    for (const entry of raw) {
      if (out.length >= LIBRARY_LIMITS.scenarios) break;
      if (!isRecord(entry)) continue;
      const id = own(entry, 'id');
      if (typeof id !== 'string' || !SCENARIO_ID_RE.test(id) || ids.has(id)) continue;
      const read = readScenario(own(entry, 'scenario'));
      if (read.scenario === undefined) continue;
      ids.add(id);
      out.push({ id, scenario: read.scenario });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Saves the library as JSON under `SCENARIOS_STORAGE_KEY`. Returns false (never throws) when there
 * is no storage, the list breaks the library's limits (over 100 entries, over the total size, a
 * malformed or repeated id), or the storage refuses it (quota, private mode).
 */
export function saveScenarios(storage: SetupStorage | null, list: readonly ScenarioEntry[]): boolean {
  if (!storage) return false;
  try {
    if (list.length > LIBRARY_LIMITS.scenarios) return false;
    const ids = new Set<string>();
    for (const e of list) {
      if (!SCENARIO_ID_RE.test(e.id) || ids.has(e.id)) return false;
      ids.add(e.id);
    }
    const text = JSON.stringify({ version: 1, scenarios: list });
    if (text.length > SCENARIOS_STORAGE_MAX_CHARS) return false;
    storage.setItem(SCENARIOS_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}
