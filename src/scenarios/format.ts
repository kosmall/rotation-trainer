// The scenario file format (rotation scripts Task 3, spec §2 B and §3): reading untrusted scenario
// files (pasted text, a chosen file, stored data, an AI agent's output), checking their script
// against the setup they will play on, writing them back in a stable form, and applying one to a
// setup. Never throws; framework-free; no wall clock. Documented for agents in
// docs/scenario-format.md (and docs/scenario.schema.json); decisions in docs/data-sources.md,
// Part J, "Scenarios".

import { buildDestructionWarlock, type WarlockOptions } from '../data/classes/warlock/destruction';
import { talentPresetById } from '../data/classes/warlock/talentPresets';
import { decodeTalents, encodeTalents, TALENT_STRING_MAX_LENGTH } from '../data/classes/warlock/talentTree';
import type { ItemDb } from '../data/items/types';
import type { EquippedItem } from '../engine/types';
import { compileScript } from '../script/compile';
import { normalizeScript, SCRIPT_ID_MAX_LENGTH } from '../script/normalize';
import type { Script, ScriptContext, ScriptIssue } from '../script/types';
import { SCRIPT_LIMITS } from '../script/types';
import { validateScript } from '../script/validate';
import { closest } from '../script/vars';
import { applySetup } from '../setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../setup/defaults';
import { gearNeedsDb } from '../setup/gear';
import { LEGACY_ITEM_BUFF_IDS } from '../setup/gearEffects';
import type { AppliedSetup, SetupConfig } from '../setup/types';
import {
  SCENARIO_FORMAT,
  SCENARIO_KEYS,
  SCENARIO_LIMITS,
  SCENARIO_SCHEMA_URL,
  SCENARIO_SETUP_KEYS,
  SCENARIO_SIMULATION_LIMITS,
  SCENARIO_VERSION,
  type Scenario,
  type ScenarioIssue,
  type ScenarioParse,
  type ScenarioSetup,
  type ScenarioSimulation,
} from './types';

/** What a scenario's script is checked against. */
export interface ScenarioContext {
  /**
   * The setup the scenario will be applied to (its `setup` parts replace this one's): the ids of
   * the script are checked against the result. Absent: the default setup (`DEFAULT_SETUP`).
   */
  base?: SetupConfig;
  /**
   * The item database: gear ids are checked against it, and a gear the embedded author tables do
   * not know can be built. Absent: the gear's shape only, and when the gear needs the database the
   * script's ids are not checked (a warning says so; syntax and type errors still are).
   */
  db?: ItemDb | null;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const short = (v: unknown): string => {
  let s: string;
  try {
    s = typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v));
  } catch {
    s = typeof v;
  }
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
};
const json = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? 'undefined';
  } catch {
    return '?';
  }
};

class Issues {
  readonly errors: ScenarioIssue[] = [];
  readonly warnings: ScenarioIssue[] = [];
  add(kind: 'errors' | 'warnings', path: string, message: string, suggestion?: string): void {
    const list = this[kind];
    if (list.length >= SCENARIO_LIMITS.issues) return;
    list.push(suggestion === undefined ? { path, message } : { path, message, suggestion });
  }
  error(path: string, message: string, suggestion?: string): void {
    this.add('errors', path, message, suggestion);
  }
  warning(path: string, message: string, suggestion?: string): void {
    this.add('warnings', path, message, suggestion);
  }
}

// ---------------------------------------------------------------------------
// Shape limits of a parsed JSON value
// ---------------------------------------------------------------------------

/**
 * The first limit the value breaks (nesting deeper than `depth`, more than `nodes` values, an
 * array over `arrayItems` elements, an object over `objectKeys` keys), or null. Iterative (no
 * recursion on hostile nesting); never throws (a value that cannot be walked is reported).
 */
export function jsonShapeProblem(value: unknown): string | null {
  try {
    const stack: { v: unknown; depth: number }[] = [{ v: value, depth: 1 }];
    let nodes = 0;
    while (stack.length > 0) {
      const { v, depth } = stack.pop()!;
      nodes++;
      if (nodes > SCENARIO_LIMITS.nodes) return `the file has more than ${SCENARIO_LIMITS.nodes} values`;
      if (typeof v !== 'object' || v === null) continue;
      if (depth > SCENARIO_LIMITS.depth) return `the file nests deeper than ${SCENARIO_LIMITS.depth} levels`;
      if (Array.isArray(v)) {
        if (v.length > SCENARIO_LIMITS.arrayItems) return `an array has more than ${SCENARIO_LIMITS.arrayItems} elements`;
        for (let i = 0; i < v.length; i++) stack.push({ v: v[i], depth: depth + 1 });
      } else {
        const keys = Object.keys(v);
        if (keys.length > SCENARIO_LIMITS.objectKeys) return `an object has more than ${SCENARIO_LIMITS.objectKeys} keys`;
        for (const k of keys) stack.push({ v: (v as Rec)[k], depth: depth + 1 });
      }
    }
    return null;
  } catch {
    return 'the value could not be read';
  }
}

// ---------------------------------------------------------------------------
// Setup subset
// ---------------------------------------------------------------------------

const ROTATION_KEYS = ['curse', 'immolate', 'corruption', 'shadowburnFinisher', 'lifeTapBelowMana', 'itemUse', 'itemUseOrder'] as const;
const WARLOCK_KEYS = ['armor', 'sacrificeSuccubus'] as const;
const SETUP_IGNORED_SILENTLY = ['version'];
const CATALOG_IDS: readonly string[] = SETUP_CATALOG.map((b) => b.id);
const TIMED_IDS: readonly string[] = SETUP_CATALOG.filter((b) => b.timed).map((b) => b.id);

/** A warning when a normalized value differs from the one written. */
function noteChange(issues: Issues, path: string, raw: unknown, normalized: unknown): void {
  if (json(raw) === json(normalized)) return;
  if (normalized === undefined) issues.warning(path, `invalid value ${short(raw)} (ignored)`);
  else issues.warning(path, `invalid value ${short(raw)}: using ${short(normalized)}`);
}

/** The talents field: a talent string or a talent preset id, as a full-width string; else a warning and nothing. */
function readTalents(raw: unknown, issues: Issues): string | undefined {
  if (typeof raw !== 'string' || raw.length > TALENT_STRING_MAX_LENGTH) {
    issues.warning('setup.talents', `talents must be a talent string or a talent preset id (got ${short(raw)}; ignored)`);
    return undefined;
  }
  const preset = talentPresetById(raw.trim());
  if (preset !== undefined) return preset.talents;
  const decoded = decodeTalents(raw);
  if (decoded.errors.length > 0) {
    issues.warning('setup.talents', `invalid talent build: ${decoded.errors[0]} (ignored)`);
    return undefined;
  }
  return encodeTalents(decoded.ranks);
}

/** Warnings for gear entries the normalization dropped or changed. */
function noteGear(raw: unknown[], gear: readonly (EquippedItem | null)[], issues: Issues): void {
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const g = gear[i] ?? null;
    const path = `setup.gear[${i}]`;
    if (r === null) continue;
    const rid = isRecord(r) ? own(r, 'id') : undefined;
    if (g === null) {
      issues.warning(path, `item ${short(rid ?? r)} dropped (not an item of the database, does not fit this slot, or a second unique copy)`);
      continue;
    }
    if (!isRecord(r)) continue;
    const enchant = own(r, 'enchant');
    if (enchant !== undefined && g.enchant !== enchant) issues.warning(`${path}.enchant`, `enchant ${short(enchant)} dropped (unknown or does not fit the item)`);
    const gems = own(r, 'gems');
    if (Array.isArray(gems)) {
      const kept = g.gems ?? [];
      gems.forEach((gem, k) => {
        if (gem !== 0 && kept[k] !== gem) issues.warning(`${path}.gems[${k}]`, `gem ${short(gem)} dropped (unknown, no such socket, or does not fit it)`);
      });
    }
  }
}

/**
 * The setup subset of a scenario: each given field normalized as `normalizeSetup` normalizes it
 * (with `db`, gear ids checked), only the given fields (partial `rotation`, `warlock`, `timed`);
 * values changed or dropped by the normalization, unknown fields and a nested `script` are
 * warnings. Undefined when nothing is left.
 */
function readSetup(raw: unknown, db: ItemDb | undefined, issues: Issues): ScenarioSetup | undefined {
  if (!isRecord(raw)) {
    issues.error('setup', 'setup must be an object');
    return undefined;
  }
  const given: Rec = { version: 1 };
  for (const key of Object.keys(raw)) {
    if ((SCENARIO_SETUP_KEYS as readonly string[]).includes(key)) given[key] = raw[key];
    else if (key === 'script') issues.warning('setup.script', "ignored: the scenario's rotation is the top-level `script`");
    else if (!SETUP_IGNORED_SILENTLY.includes(key))
      issues.warning(`setup.${short(key)}`, `unknown setup field '${short(key)}' (ignored)`, closest(key, SCENARIO_SETUP_KEYS));
  }
  const probe = normalizeSetup(given, SETUP_CATALOG, db);
  const out: ScenarioSetup = {};
  if (Object.hasOwn(given, 'talents')) {
    const t = readTalents(given.talents, issues);
    if (t !== undefined) out.talents = t;
  }
  if (Object.hasOwn(given, 'gear')) {
    const g = given.gear;
    if (!Array.isArray(g) || g.length !== 17) {
      issues.warning('setup.gear', 'gear must be an array of 17 entries in slot order (ignored)');
    } else {
      out.gear = probe.gear;
      noteGear(g, probe.gear ?? [], issues);
      if (Object.hasOwn(given, 'gearPresetId')) {
        if (probe.gearPresetId !== undefined) out.gearPresetId = probe.gearPresetId;
        else issues.warning('setup.gearPresetId', `invalid gear preset id ${short(given.gearPresetId)} (ignored)`);
      }
    }
  } else if (Object.hasOwn(given, 'gearPresetId')) {
    issues.warning('setup.gearPresetId', 'ignored without `gear`');
  }
  if (Object.hasOwn(given, 'enabledBuffs')) {
    const e = given.enabledBuffs;
    if (!Array.isArray(e)) {
      issues.warning('setup.enabledBuffs', 'enabledBuffs must be an array of buff ids (ignored)');
    } else if (e.length > SCENARIO_LIMITS.enabledBuffs) {
      issues.error('setup.enabledBuffs', `at most ${SCENARIO_LIMITS.enabledBuffs} buffs (got ${e.length})`);
    } else {
      out.enabledBuffs = probe.enabledBuffs;
      const kept = new Set(probe.enabledBuffs);
      e.forEach((id, i) => {
        const path = `setup.enabledBuffs[${i}]`;
        if (typeof id !== 'string') issues.warning(path, `a buff id must be a string (got ${short(id)}; ignored)`);
        else if (kept.has(Object.hasOwn(LEGACY_ITEM_BUFF_IDS, id) ? LEGACY_ITEM_BUFF_IDS[id]! : id)) return;
        else if (CATALOG_IDS.includes(id) || /^item:\d+(:\d+)?$/.test(id))
          issues.warning(path, `'${id}' dropped (a duplicate, or replaced by a later buff of the same group)`);
        else issues.warning(path, `unknown buff '${short(id)}' (ignored)`, closest(id, CATALOG_IDS));
      });
    }
  }
  if (Object.hasOwn(given, 'timed')) {
    const t = given.timed;
    if (!isRecord(t)) {
      issues.warning('setup.timed', 'timed must be an object of { startSec, durationSec } by buff id (ignored)');
    } else {
      const timed: Record<string, { startSec: number; durationSec: number }> = {};
      for (const id of Object.keys(t)) {
        if (!TIMED_IDS.includes(id)) {
          issues.warning(`setup.timed.${short(id)}`, `'${short(id)}' is no timed buff (${TIMED_IDS.join(', ')}; ignored)`, closest(id, TIMED_IDS));
          continue;
        }
        timed[id] = probe.timed[id]!;
        const r = t[id];
        if (!isRecord(r)) issues.warning(`setup.timed.${id}`, `invalid value ${short(r)}: using ${short(timed[id])}`);
        else for (const k of ['startSec', 'durationSec'] as const) noteChange(issues, `setup.timed.${id}.${k}`, own(r, k), timed[id]![k]);
      }
      if (Object.keys(timed).length > 0) out.timed = timed;
    }
  }
  for (const key of ['distanceYd', 'fightDurationSec'] as const) {
    if (!Object.hasOwn(given, key)) continue;
    out[key] = probe[key];
    noteChange(issues, `setup.${key}`, given[key], probe[key]);
  }
  for (const [key, fields] of [
    ['warlock', WARLOCK_KEYS],
    ['rotation', ROTATION_KEYS],
  ] as const) {
    if (!Object.hasOwn(given, key)) continue;
    const r = given[key];
    if (!isRecord(r)) {
      issues.warning(`setup.${key}`, `${key} must be an object (ignored)`);
      continue;
    }
    const normalized = probe[key] as unknown as Rec;
    const part: Rec = {};
    for (const k of Object.keys(r)) {
      if (!(fields as readonly string[]).includes(k)) {
        issues.warning(`setup.${key}.${short(k)}`, `unknown ${key} field '${short(k)}' (ignored)`, closest(k, fields));
        continue;
      }
      const v = normalized[k];
      if (v !== undefined) part[k] = v;
      noteChange(issues, `setup.${key}.${k}`, r[k], v);
    }
    // Stable key order: the field list's.
    const ordered: Rec = {};
    for (const k of fields) if (Object.hasOwn(part, k)) ordered[k] = part[k];
    if (Object.keys(ordered).length > 0) (out as Rec)[key] = ordered;
  }
  const ordered: ScenarioSetup = {};
  for (const k of SCENARIO_SETUP_KEYS) if (out[k] !== undefined) (ordered as Rec)[k] = out[k];
  return Object.keys(ordered).length > 0 ? ordered : undefined;
}

// ---------------------------------------------------------------------------
// Applying a scenario to a setup
// ---------------------------------------------------------------------------

export interface ApplyScenarioOptions {
  /** Replace the setup's parts the scenario has (gear, talents, buffs, fight, options). */
  includeSetup: boolean;
  /** The item database, for `normalizeSetup` (gear ids). */
  db?: ItemDb | null;
}

/**
 * The setup `config` with the scenario applied, normalized (`normalizeSetup` with
 * `SETUP_CATALOG`). Pure: `config` and `scenario` are not mutated; the result shares nothing with
 * them.
 * - `script`: always the scenario's script (it replaces the basic rotation).
 * - With `includeSetup` and a scenario `setup`: each field it has replaces the config's;
 *   `rotation`, `warlock` and `timed` key by key (the config's other keys stay); `gear` without
 *   `gearPresetId` drops the config's preset label; `talents` is the scenario's build (the
 *   author's build normalizes to no `talents`). Fields the scenario does not have stay as they are.
 * - Without `includeSetup`: only the script changes.
 */
export function applyScenario(config: SetupConfig, scenario: Scenario, { includeSetup, db }: ApplyScenarioOptions): SetupConfig {
  const next: SetupConfig = structuredClone(config);
  const s = scenario.setup;
  if (includeSetup && s !== undefined) {
    if (s.gear !== undefined) {
      next.gear = structuredClone(s.gear);
      delete next.gearPresetId;
      if (s.gearPresetId !== undefined) next.gearPresetId = s.gearPresetId;
    }
    if (s.talents !== undefined) next.talents = s.talents;
    if (s.enabledBuffs !== undefined) next.enabledBuffs = [...s.enabledBuffs];
    if (s.timed !== undefined) next.timed = { ...next.timed, ...structuredClone(s.timed) } as SetupConfig['timed'];
    if (s.distanceYd !== undefined) next.distanceYd = s.distanceYd;
    if (s.fightDurationSec !== undefined) next.fightDurationSec = s.fightDurationSec;
    if (s.warlock !== undefined) next.warlock = { ...next.warlock, ...s.warlock };
    if (s.rotation !== undefined) next.rotation = { ...next.rotation, ...structuredClone(s.rotation) };
  }
  next.script = structuredClone(scenario.script);
  return normalizeSetup(next, SETUP_CATALOG, db ?? undefined);
}

/**
 * `applySetup` for a normalized config as the simulator applies it (src/sim-runner/run.ts
 * `prepareRun`: `STATIC_SETUP_CATALOG`, the spec built with the database when there is a gear and
 * a database, the talents forwarded). Throws what `applySetup` throws.
 */
export function applyScenarioSetup(config: SetupConfig, db?: ItemDb | null): AppliedSetup {
  const buildSpec = (w: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string) =>
    gear === undefined || db == null ? buildDestructionWarlock(w, gear, undefined, talents) : buildDestructionWarlock(w, gear, db, talents);
  return applySetup({ buildSpec, catalog: STATIC_SETUP_CATALOG, config, db: db ?? null });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** A context with no ids at all: syntax, type and shape errors do not depend on the ids. */
const EMPTY_CONTEXT: ScriptContext = Object.freeze({ spellIds: [], auraIds: [], itemActions: [], heroismEndMs: null });

const prefixed = (i: ScriptIssue): ScenarioIssue => {
  const path = i.path === '' ? 'script' : `script.${i.path}`;
  return i.suggestion === undefined ? { path, message: i.message } : { path, message: i.message, suggestion: i.suggestion };
};

function readString(raw: Rec, key: 'description' | 'author' | 'notes', limit: number, issues: Issues): string | undefined {
  const v = own(raw, key);
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    issues.error(key, `${key} must be a string`);
    return undefined;
  }
  if (v.length > limit) {
    issues.error(key, `${key} longer than ${limit} characters`);
    return undefined;
  }
  return v;
}

function readSimulation(raw: unknown, issues: Issues): ScenarioSimulation | undefined {
  if (!isRecord(raw)) {
    issues.error('simulation', 'simulation must be an object { runs?, seed? }');
    return undefined;
  }
  const out: ScenarioSimulation = {};
  for (const key of Object.keys(raw)) {
    if (key !== 'runs' && key !== 'seed') {
      issues.warning(`simulation.${short(key)}`, `unknown simulation field '${short(key)}' (ignored)`, closest(key, ['runs', 'seed']));
      continue;
    }
    const v = raw[key];
    const { min, max } = SCENARIO_SIMULATION_LIMITS[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      issues.error(`simulation.${key}`, `${key} must be an integer from ${min} to ${max} (got ${short(v)})`);
      continue;
    }
    out[key] = v;
  }
  return out.runs === undefined && out.seed === undefined ? undefined : { ...(out.runs !== undefined && { runs: out.runs }), ...(out.seed !== undefined && { seed: out.seed }) };
}

/**
 * The structural reading of a scenario value: format and version, the fields' types and limits,
 * the setup subset normalized (gear ids checked with `db`), the script's shape, syntax and types
 * (`validateScript` errors; its ids are not checked here: `checkScenarioScript`). Unknown fields
 * are warnings. Never throws.
 */
export function readScenario(value: unknown, db?: ItemDb | null): ScenarioParse {
  const issues = new Issues();
  const done = (scenario?: Scenario): ScenarioParse => ({
    ok: issues.errors.length === 0 && scenario !== undefined,
    ...(scenario !== undefined && { scenario }),
    errors: issues.errors,
    warnings: issues.warnings,
  });
  try {
    const shape = jsonShapeProblem(value);
    if (shape !== null) {
      issues.error('', shape);
      return done();
    }
    if (!isRecord(value)) {
      issues.error('', 'a scenario must be a JSON object');
      return done();
    }
    const format = own(value, 'format');
    if (format !== SCENARIO_FORMAT) {
      const looksLikeSetup = Object.hasOwn(value, 'enabledBuffs') || Object.hasOwn(value, 'warlock');
      issues.error(
        'format',
        format === undefined
          ? `not a scenario: format must be '${SCENARIO_FORMAT}'${looksLikeSetup ? ' (this looks like a saved setup: put it under `setup`)' : ''}`
          : `unknown format ${short(format)} (expected '${SCENARIO_FORMAT}')`,
      );
      return done();
    }
    const version = own(value, 'version');
    if (version !== SCENARIO_VERSION) {
      issues.error(
        'version',
        typeof version === 'number' && version > SCENARIO_VERSION
          ? `scenario version ${version} is newer than this app reads (${SCENARIO_VERSION}): update the app`
          : `unsupported scenario version ${short(version)} (expected ${SCENARIO_VERSION})`,
      );
      return done();
    }
    const rawScript = own(value, 'script');
    if (!isRecord(rawScript)) {
      issues.error('script', rawScript === undefined ? 'a scenario needs a script { rules: [...] }' : 'script must be an object { rules: [...], defs?: {...} }');
      return done();
    }
    for (const key of Object.keys(value)) {
      if (!(SCENARIO_KEYS as readonly string[]).includes(key)) {
        issues.warning(short(key), `unknown field '${short(key)}' (ignored)`, closest(key, SCENARIO_KEYS));
      }
    }
    const rawName = own(value, 'name');
    let name = 'Untitled scenario';
    if (rawName === undefined) issues.error('name', 'a scenario needs a name');
    else if (typeof rawName !== 'string') issues.error('name', 'name must be a string');
    else if (rawName.trim() === '') issues.error('name', 'name must not be blank');
    else if (rawName.length > SCENARIO_LIMITS.name) issues.error('name', `name longer than ${SCENARIO_LIMITS.name} characters`);
    else name = rawName;
    const scenario: Scenario = { $schema: SCENARIO_SCHEMA_URL, format: SCENARIO_FORMAT, version: SCENARIO_VERSION, name, script: { rules: [] } };
    const schema = own(value, '$schema');
    if (typeof schema === 'string' && schema.length <= SCENARIO_LIMITS.schema) scenario.$schema = schema;
    else if (schema !== undefined) issues.warning('$schema', `$schema must be a URL or path of at most ${SCENARIO_LIMITS.schema} characters (replaced)`);
    const description = readString(value, 'description', SCENARIO_LIMITS.description, issues);
    if (description !== undefined) scenario.description = description;
    const author = readString(value, 'author', SCENARIO_LIMITS.author, issues);
    if (author !== undefined) scenario.author = author;
    for (const key of ['createdAt', 'updatedAt'] as const) {
      const v = own(value, key);
      if (v === undefined) continue;
      if (typeof v === 'string' && v.length <= SCENARIO_LIMITS.timestamp) scenario[key] = v;
      else issues.warning(key, `${key} must be an ISO 8601 date string (ignored)`);
    }
    if (Object.hasOwn(value, 'simulation')) {
      const sim = readSimulation(value.simulation, issues);
      if (sim !== undefined) scenario.simulation = sim;
    }
    if (Object.hasOwn(value, 'setup')) {
      const setup = readSetup(value.setup, db ?? undefined, issues);
      if (setup !== undefined) scenario.setup = setup;
    }
    // The script: errors that do not depend on the ids (shape, syntax, types, limits).
    for (const e of validateScript(rawScript as unknown as Script, EMPTY_CONTEXT).errors) issues.error(prefixed(e).path, e.message, e.suggestion);
    const rules = own(rawScript, 'rules');
    if (Array.isArray(rules)) {
      if (rules.length === 0) issues.error('script.rules', 'a scenario needs at least one rule');
      rules.slice(0, SCRIPT_LIMITS.rules).forEach((r, i) => {
        const id = isRecord(r) ? own(r, 'id') : undefined;
        if (typeof id === 'string' && id.length > SCRIPT_ID_MAX_LENGTH) issues.error(`script.rules[${i}].id`, `id longer than ${SCRIPT_ID_MAX_LENGTH} characters`);
      });
    }
    for (const key of Object.keys(rawScript)) {
      if (key !== 'rules' && key !== 'defs') issues.warning(`script.${short(key)}`, `unknown script field '${short(key)}' (ignored)`, closest(key, ['rules', 'defs']));
    }
    scenario.script = normalizeScript(rawScript) ?? { rules: [] };
    const notes = readString(value, 'notes', SCENARIO_LIMITS.notes, issues);
    if (notes !== undefined) scenario.notes = notes;
    return done(orderScenario(scenario));
  } catch {
    return { ok: false, errors: [{ path: '', message: 'the scenario could not be read' }], warnings: [] };
  }
}

/**
 * The script's ids checked against the setup the scenario plays on: `applyScenario(base,
 * scenario, { includeSetup: true })` applied as the simulator applies it, then `compileScript`
 * (its errors and warnings, including "rule left out"), paths prefixed with `script.`. When the
 * gear needs the item database and `db` is absent, only the errors (a warning says the ids were
 * not checked). Never throws.
 */
export function checkScenarioScript(scenario: Scenario, ctx: ScenarioContext = {}): { errors: ScenarioIssue[]; warnings: ScenarioIssue[] } {
  try {
    const config = applyScenario(ctx.base ?? (DEFAULT_SETUP as SetupConfig), scenario, { includeSetup: true, db: ctx.db });
    if (config.gear !== undefined && ctx.db == null && gearNeedsDb(config.gear)) {
      const v = validateScript(scenario.script, EMPTY_CONTEXT);
      return {
        errors: v.errors.map(prefixed),
        warnings: [{ path: 'script', message: 'ids not checked: this gear needs the item database' }],
      };
    }
    const applied = applyScenarioSetup(config, ctx.db);
    const compiled = compileScript(scenario.script, applied.script.context);
    return { errors: compiled.errors.map(prefixed), warnings: compiled.warnings.map(prefixed) };
  } catch {
    return { errors: [], warnings: [{ path: 'setup', message: 'the setup could not be applied: ids not checked' }] };
  }
}

/**
 * Reads a scenario value (parsed JSON, a stored entry, a bundled example) and checks its script
 * against the setup it plays on (`checkScenarioScript`): `readScenario`'s issues, then the
 * script's (for a readable scenario without structural errors). Never throws.
 */
export function parseScenarioValue(value: unknown, ctx: ScenarioContext = {}): ScenarioParse {
  const read = readScenario(value, ctx.db);
  if (read.scenario === undefined || read.errors.length > 0) return read;
  const check = checkScenarioScript(read.scenario, ctx);
  const errors = [...read.errors, ...check.errors].slice(0, SCENARIO_LIMITS.issues);
  const warnings = [...read.warnings, ...check.warnings].slice(0, SCENARIO_LIMITS.issues);
  return { ok: errors.length === 0, scenario: read.scenario, errors, warnings };
}

/**
 * Reads a scenario file's text: at most 200 000 characters (`SCENARIO_LIMITS.fileChars`, checked
 * before parsing), JSON (a syntax error gives one error), within the shape limits (depth 20,
 * 50 000 values, 1000 elements per array, 500 keys per object), then `parseScenarioValue`.
 * `__proto__` and `constructor` keys are plain unknown fields. Never throws.
 */
export function parseScenario(text: string, ctx: ScenarioContext = {}): ScenarioParse {
  const fail = (message: string): ScenarioParse => ({ ok: false, errors: [{ path: '', message }], warnings: [] });
  try {
    if (typeof text !== 'string') return fail('a scenario file must be text');
    if (text.length > SCENARIO_LIMITS.fileChars) return fail(`the file is longer than ${SCENARIO_LIMITS.fileChars} characters`);
    if (text.trim() === '') return fail('the file is empty');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      const detail = e instanceof SyntaxError ? `: ${e.message}` : '';
      return fail(`not valid JSON${detail.slice(0, 200)}`);
    }
    return parseScenarioValue(value, ctx);
  } catch {
    return fail('the scenario could not be read');
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const RULE_KEYS = ['action', 'id', 'if', 'label', 'comment', 'enabled'] as const;

/** A copy of a script with the rule keys in a fixed order. */
function orderScript(script: Script): Script {
  const rules = script.rules.map((r) => {
    const out: Rec = {};
    for (const k of RULE_KEYS) if (r[k] !== undefined) out[k] = r[k];
    return out as unknown as Script['rules'][number];
  });
  return script.defs !== undefined ? { rules, defs: { ...script.defs } } : { rules };
}

/** A copy of a scenario with every key in the export order. */
function orderScenario(s: Scenario): Scenario {
  const out: Rec = {};
  for (const k of SCENARIO_KEYS) {
    const v = s[k];
    if (v === undefined) continue;
    if (k === 'script') out[k] = orderScript(v as Script);
    else if (k === 'setup') {
      const setup: Rec = {};
      for (const sk of SCENARIO_SETUP_KEYS) if ((v as Rec)[sk] !== undefined) setup[sk] = structuredClone((v as Rec)[sk]);
      out[k] = setup;
    } else if (k === 'simulation') {
      const sim = v as ScenarioSimulation;
      out[k] = { ...(sim.runs !== undefined && { runs: sim.runs }), ...(sim.seed !== undefined && { seed: sim.seed }) };
    } else out[k] = v;
  }
  return out as unknown as Scenario;
}

/**
 * The scenario as a file: pretty JSON (2 spaces, a final newline), keys in a fixed order
 * (`SCENARIO_KEYS`, `SCENARIO_SETUP_KEYS`, rule keys action, id, if, label, comment, enabled), a
 * `$schema` pointer (`SCENARIO_SCHEMA_URL` when the scenario has none). For a scenario read by
 * `parseScenario`, `parseScenario(exportScenario(s)).scenario` deep-equals `s`.
 */
export function exportScenario(scenario: Scenario): string {
  const ordered = orderScenario({ ...scenario, $schema: scenario.$schema ?? SCENARIO_SCHEMA_URL });
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
