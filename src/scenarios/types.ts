// Scenarios (rotation scripts Task 3, spec §2 B): a rotation script with an optional setup and
// simulation settings, as a versioned JSON file (`format: "rotation-trainer.scenario"`,
// `version: 1`) that people and AI agents write, import, export and run. Plain JSON-safe data;
// framework-free. The file format is documented for agents in docs/scenario-format.md and as a
// JSON Schema in docs/scenario.schema.json.

import type { Script } from '../script/types';
import type { SetupConfig } from '../setup/types';

/** The `format` value of every scenario file. */
export const SCENARIO_FORMAT = 'rotation-trainer.scenario';
/** The only format version this app reads and writes. */
export const SCENARIO_VERSION = 1;
/**
 * The `$schema` pointer written by `exportScenario` when a scenario has none: the schema in the
 * project's repository (editors that know JSON Schema validate the file against it).
 */
export const SCENARIO_SCHEMA_URL = 'https://raw.githubusercontent.com/kosmall/rotation-trainer/main/docs/scenario.schema.json';

/**
 * The setup fields a scenario may carry: any subset of a `SetupConfig` without `version` and
 * `script` (the scenario's own `script` is the rotation). Normalized as `normalizeSetup`
 * normalizes them; `rotation`, `warlock` and `timed` may be partial (only the given keys).
 */
export interface ScenarioSetup {
  gear?: SetupConfig['gear'];
  gearPresetId?: string;
  talents?: string;
  enabledBuffs?: string[];
  timed?: Partial<SetupConfig['timed']>;
  rotation?: Partial<SetupConfig['rotation']>;
  distanceYd?: number;
  fightDurationSec?: number;
  warlock?: Partial<SetupConfig['warlock']>;
}

/** The keys of `ScenarioSetup`, in the order `exportScenario` writes them. */
export const SCENARIO_SETUP_KEYS = Object.freeze([
  'talents',
  'gear',
  'gearPresetId',
  'enabledBuffs',
  'timed',
  'distanceYd',
  'fightDurationSec',
  'warlock',
  'rotation',
] as const satisfies readonly (keyof ScenarioSetup)[]);

/** Simulation settings a scenario suggests (the CLI and the UI use them unless told otherwise). */
export interface ScenarioSimulation {
  /** Fights, an integer 1-100 000. */
  runs?: number;
  /** Base seed, an integer 0-4 294 967 295. */
  seed?: number;
}

export interface Scenario {
  /** A JSON Schema pointer for editors; kept as written, never checked. */
  $schema?: string;
  format: typeof SCENARIO_FORMAT;
  version: typeof SCENARIO_VERSION;
  name: string;
  description?: string;
  author?: string;
  /** The rotation (src/script; docs/scenario-format.md): at least one rule. */
  script: Script;
  /** Absent: the scenario plays on whatever setup it is applied to. */
  setup?: ScenarioSetup;
  simulation?: ScenarioSimulation;
  notes?: string;
  /** ISO 8601 timestamps, kept as written (at most 64 characters). */
  createdAt?: string;
  updatedAt?: string;
}

/** The top-level keys of a scenario, in the order `exportScenario` writes them. */
export const SCENARIO_KEYS = Object.freeze([
  '$schema',
  'format',
  'version',
  'name',
  'description',
  'author',
  'createdAt',
  'updatedAt',
  'simulation',
  'setup',
  'script',
  'notes',
] as const satisfies readonly (keyof Scenario)[]);

/** A message about a scenario: `path` like `script.rules[2].if`, `setup.enabledBuffs[3]` or `name`. */
export interface ScenarioIssue {
  path: string;
  message: string;
  /** The closest known name or id, when one is near. */
  suggestion?: string;
}

export const SCENARIO_LIMITS = Object.freeze({
  /** Characters of a scenario file (and of one exported scenario). */
  fileChars: 200_000,
  /** Nesting depth of the JSON value (objects and arrays). */
  depth: 20,
  /** JSON values (objects, arrays and primitives) in one file. */
  nodes: 50_000,
  /** Elements of any one array (the script's own limit, 200 rules, is reported separately). */
  arrayItems: 1000,
  /** Keys of any one object. */
  objectKeys: 500,
  name: 100,
  description: 2000,
  author: 100,
  notes: 10_000,
  timestamp: 64,
  schema: 500,
  enabledBuffs: 100,
  /** At most this many issues of each kind are reported. */
  issues: 200,
});

export const SCENARIO_SIMULATION_LIMITS = Object.freeze({
  runs: Object.freeze({ min: 1, max: 100_000 }),
  seed: Object.freeze({ min: 0, max: 4_294_967_295 }),
});

/** The result of reading a scenario. */
export interface ScenarioParse {
  /** No errors: the scenario may be imported, saved and run (warnings do not block). */
  ok: boolean;
  /**
   * The normalized scenario whenever the file could be read as one (format, version, name and a
   * script object), even with errors elsewhere (for a preview); absent when it could not.
   */
  scenario?: Scenario;
  errors: ScenarioIssue[];
  warnings: ScenarioIssue[];
}
