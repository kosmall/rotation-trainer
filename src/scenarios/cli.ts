// The scenario command line (rotation scripts Task 3, spec §2 B "for AI agents"): the logic of
// `npm run scenario:validate` and `npm run scenario:run` (thin wrappers in scripts/ give them the
// file system, the console and the item database). No Node imports here: everything comes in
// through `CliIo`, so the tests call these functions directly. Output format: docs/scenario-format.md,
// "Validator and runner".

import type { ItemDb } from '../data/items/types';
import { DEFAULT_SETUP } from '../setup/defaults';
import type { SetupConfig } from '../setup/types';
import { simulate } from '../sim-runner/run';
import type { SimResult } from '../sim-runner/types';
import { applyScenario, parseScenario } from './format';
import { SCENARIO_SIMULATION_LIMITS, type Scenario, type ScenarioIssue } from './types';

export interface CliIo {
  /** The file's text; throws when it cannot be read. */
  readFile(path: string): string;
  /** One line to standard output. */
  out(line: string): void;
  /** One line to standard error. */
  err(line: string): void;
}

/** Fights per `scenario:run` unless the scenario or `--runs` says otherwise. */
export const DEFAULT_CLI_RUNS = 1000;
export const DEFAULT_CLI_SEED = 1;
/** The spell queue window of the runs (the game's). */
export const CLI_SPELL_QUEUE_WINDOW_MS = 400;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One issue as a line: `error   script.rules[2].if: column 14: expected ')' (did you mean ...?)`. */
export function formatIssue(kind: 'error' | 'warning', issue: ScenarioIssue): string {
  const hint = issue.suggestion !== undefined ? ` (did you mean '${issue.suggestion}'?)` : '';
  return `${kind === 'error' ? 'error  ' : 'warning'} ${issue.path === '' ? '(file)' : issue.path}: ${issue.message}${hint}`;
}

/** Reads and checks one file: the parse, or null after printing why it could not be read. */
function load(path: string, io: CliIo, db: ItemDb): ReturnType<typeof parseScenario> | null {
  let text: string;
  try {
    text = io.readFile(path);
  } catch (e) {
    io.err(`${path}: cannot read the file (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
  return parseScenario(text, { db });
}

/**
 * `scenario:validate -- <file>...`: per file a summary line (`<file>: OK` or
 * `<file>: N errors, M warnings`), then one line per error and warning with its path. Exit code
 * 0 when every file is valid (warnings allowed), 1 when any has an error or cannot be read, 2 for
 * no file given.
 */
export function validateMain(args: readonly string[], io: CliIo, db: ItemDb): number {
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0 || args.includes('--help')) {
    io.err('usage: npm run scenario:validate -- <scenario.json> [more files]');
    return 2;
  }
  let failed = false;
  for (const file of files) {
    const r = load(file, io, db);
    if (r === null) {
      failed = true;
      continue;
    }
    const summary =
      r.errors.length === 0
        ? `OK${r.warnings.length > 0 ? ` (${plural(r.warnings.length, 'warning')})` : ''}`
        : `${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')}`;
    io.out(`${file}: ${summary}${r.scenario !== undefined ? ` - "${r.scenario.name}"` : ''}`);
    for (const e of r.errors) io.out(`  ${formatIssue('error', e)}`);
    for (const w of r.warnings) io.out(`  ${formatIssue('warning', w)}`);
    if (!r.ok) failed = true;
  }
  return failed ? 1 : 0;
}

interface RunArgs {
  file: string;
  runs?: number;
  seed?: number;
  json: boolean;
}

function parseRunArgs(args: readonly string[]): RunArgs | string {
  let file: string | undefined;
  const out: Partial<RunArgs> = { json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--json') out.json = true;
    else if (a === '--runs' || a === '--seed') {
      const v = Number(args[++i]);
      const key = a === '--runs' ? 'runs' : 'seed';
      const { min, max } = SCENARIO_SIMULATION_LIMITS[key];
      if (!Number.isInteger(v) || v < min || v > max) return `${a} must be an integer from ${min} to ${max}`;
      out[key] = v;
    } else if (a.startsWith('--')) return `unknown option ${a}`;
    else if (file === undefined) file = a;
    else return 'one scenario file at a time';
  }
  if (file === undefined) return 'no scenario file given';
  return { ...out, file } as RunArgs;
}

const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** The rule a `ruleFires` key (`rules[i]`, Task 4) names, for display. */
function ruleName(scenario: Scenario, key: string): string {
  const m = /^rules\[(\d+)\]$/.exec(key);
  const rule = m ? scenario.script.rules[Number(m[1])] : undefined;
  if (rule === undefined) return key;
  const what = rule.label ?? (rule.action === 'wait' ? 'wait' : `${rule.action} ${rule.id ?? ''}`.trim());
  return `${key} ${what}${rule.if !== undefined && rule.label === undefined ? ` if ${rule.if}` : ''}`;
}

/** The per-rule fires of a result when the simulator reports them (Task 4), else undefined. */
function ruleFiresOf(result: SimResult): Record<string, number> | undefined {
  const v = (result as unknown as { ruleFires?: unknown }).ruleFires;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  return out;
}

/** The setup a scenario runs on: the default setup with the scenario's setup parts. */
export function scenarioRunSetup(scenario: Scenario, db: ItemDb, base: SetupConfig = DEFAULT_SETUP as SetupConfig): SetupConfig {
  return applyScenario(base, scenario, { includeSetup: true, db });
}

/**
 * `scenario:run -- <file> [--runs N] [--seed S] [--json]`: checks the file like the validator
 * (errors: printed, exit 1; warnings: printed to standard error, the run goes on), runs the
 * simulator core on the default setup with the scenario's setup parts and script (runs and seed:
 * the options, else the scenario's `simulation`, else 1000 and 1; spell queue window 400 ms) and
 * prints mean DPS, sigma, SEM, the 95% CI, min / median / max, the per-spell damage share, item
 * uses and, when the simulator reports them, the mean fires per rule. `--json`: one JSON object
 * instead. Deterministic: the same file, runs and seed print the same text. Exit 0, or 1 on an
 * error, 2 on bad options.
 */
export async function runMain(args: readonly string[], io: CliIo, db: ItemDb): Promise<number> {
  const parsed = parseRunArgs(args);
  if (typeof parsed === 'string') {
    io.err(`${parsed}\nusage: npm run scenario:run -- <scenario.json> [--runs N] [--seed S] [--json]`);
    return 2;
  }
  const r = load(parsed.file, io, db);
  if (r === null) return 1;
  if (!r.ok || r.scenario === undefined) {
    io.err(`${parsed.file}: ${plural(r.errors.length, 'error')}: not run`);
    for (const e of r.errors) io.err(`  ${formatIssue('error', e)}`);
    return 1;
  }
  const scenario = r.scenario;
  for (const w of r.warnings) io.err(`  ${formatIssue('warning', w)}`);
  const runs = parsed.runs ?? scenario.simulation?.runs ?? DEFAULT_CLI_RUNS;
  const seed = parsed.seed ?? scenario.simulation?.seed ?? DEFAULT_CLI_SEED;
  const setup = scenarioRunSetup(scenario, db);
  let result: SimResult;
  try {
    result = await simulate({ setup, db, runs, seed, spellQueueWindowMs: CLI_SPELL_QUEUE_WINDOW_MS }, { chunk: 1000 });
  } catch (e) {
    io.err(`${parsed.file}: the simulation failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const spells = Object.entries(result.perSpell).sort((a, b) => b[1].share - a[1].share);
  const items = Object.entries(result.itemUses);
  const fires = ruleFiresOf(result);
  if (parsed.json) {
    io.out(
      JSON.stringify(
        {
          file: parsed.file,
          name: scenario.name,
          runs: result.runs,
          seed: result.seed,
          fightSec: result.fightMs / 1000,
          spellQueueWindowMs: result.spellQueueWindowMs,
          meanDps: result.meanDps,
          stdDev: result.stdDev,
          stdErr: result.stdErr,
          ci95: result.ci95,
          min: result.min,
          median: result.median,
          max: result.max,
          perSpell: Object.fromEntries(spells.map(([id, s]) => [id, { name: s.name, share: s.share, meanDamage: s.meanDamage, meanCasts: s.meanCasts }])),
          itemUses: result.itemUses,
          meanLifeTaps: result.meanLifeTaps,
          ...(fires !== undefined && { ruleFires: fires }),
          warnings: r.warnings,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  io.out(`Scenario: ${scenario.name} (${parsed.file})`);
  io.out(`Setup: ${scenario.setup !== undefined ? 'the default setup with the scenario setup' : 'the default setup'}; fight ${result.fightMs / 1000} s; ${plural(r.warnings.length, 'warning')}`);
  io.out(`Runs: ${result.runs}, seed ${result.seed}, spell queue window ${result.spellQueueWindowMs} ms`);
  io.out(`Mean DPS: ${f2(result.meanDps)}`);
  io.out(`Sigma: ${f2(result.stdDev)}   SEM: ${f2(result.stdErr)}   95% CI: ${f2(result.ci95[0])} - ${f2(result.ci95[1])}`);
  io.out(`Min / median / max: ${f2(result.min)} / ${f2(result.median)} / ${f2(result.max)}`);
  io.out('Damage share per spell (mean casts per fight):');
  for (const [, s] of spells) io.out(`  ${s.name.padEnd(24)} ${pct(s.share).padStart(6)}  (${s.meanCasts.toFixed(2)} casts)`);
  if (items.length > 0) {
    io.out('Item uses per fight:');
    for (const [id, n] of items) io.out(`  ${(result.labels.items[id] ?? id).padEnd(32)} ${n.toFixed(2)}`);
  }
  io.out(`Life Taps per fight: ${result.meanLifeTaps.toFixed(2)}`);
  if (fires !== undefined) {
    io.out('Rule fires per fight:');
    for (const [key, n] of Object.entries(fires)) io.out(`  ${n.toFixed(2).padStart(7)}  ${ruleName(scenario, key)}`);
  } else {
    io.out('Rule fires per fight: not reported by this simulator version');
  }
  return 0;
}
