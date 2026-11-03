// The scenario command line (rotation scripts Task 3, spec §2 B "for AI agents"): the logic of
// `npm run scenario:validate` and `npm run scenario:run` (thin wrappers in scripts/ give them the
// file system, the console and the item database). No Node imports here: everything comes in
// through `CliIo`, so the tests call these functions directly. Output format: docs/scenario-format.md,
// "Validator and runner".

import type { ItemDb } from '../data/items/types';
import { DEFAULT_SETUP } from '../setup/defaults';
import type { SetupConfig } from '../setup/types';
import { compare } from '../sim-runner/compare';
import { simulate } from '../sim-runner/run';
import type { CompareResult, SimResult } from '../sim-runner/types';
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

/**
 * How a `ruleFires` key prints: a script key `rules[i]` with the rule's action, id and condition
 * (or its label), any other key (the basic rotation's spell or item entry id) with its label.
 */
function ruleName(scenario: Scenario, key: string, label: string): string {
  const m = /^rules\[(\d+)\]$/.exec(key);
  const rule = m ? scenario.script.rules[Number(m[1])] : undefined;
  if (rule === undefined) return `${key} ${label}`;
  const what = rule.label ?? (rule.action === 'wait' ? 'wait' : `${rule.action} ${rule.id ?? ''}`.trim());
  return `${key} ${what}${rule.if !== undefined && rule.label === undefined ? ` if ${rule.if}` : ''}`;
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
  const fires = result.ruleFires;
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
    for (const [key, f] of Object.entries(fires)) io.out(`  ${f.meanFires.toFixed(2).padStart(7)}  ${ruleName(scenario, key, f.label)}`);
  } else {
    io.out('Rule fires per fight: not reported by this simulator version');
  }
  return 0;
}

interface CompareArgs {
  files: string[];
  runs?: number;
  seed?: number;
  json: boolean;
}

function parseCompareArgs(args: readonly string[]): CompareArgs | string {
  const files: string[] = [];
  const out: Partial<CompareArgs> = { json: false };
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
    else files.push(a);
  }
  if (files.length < 2 || files.length > 5) return `give 2 to 5 scenario files (got ${files.length})`;
  return { ...out, files } as CompareArgs;
}

const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;

/** The verdict of a paired delta: better / worse when its 95% CI excludes 0, else no clear difference. */
export function verdictOf(d: NonNullable<CompareResult['deltas'][number]>): string {
  if (!d.significant) return 'no clear difference';
  return d.meanDiff > 0 ? 'better (significant)' : 'worse (significant)';
}

/**
 * `scenario:compare -- <a.json> <b.json> [up to 5 files] [--runs N] [--seed S] [--json]`: checks
 * every file like the runner (any file with errors: printed, exit 1, nothing runs), runs the
 * paired comparison (`compare`, src/sim-runner/compare.ts) on the default setup with each
 * scenario's setup parts and script, every scenario with the same runs and seed (the options, else
 * the FIRST file's `simulation`, else 1000 and 1; window 400 ms), and prints one table row per
 * scenario: rank, mean DPS, sigma, SEM, then against the first file (the baseline) the mean
 * difference, its paired standard error, its 95% CI and a verdict; then the rule fires of each
 * scenario and the multiple-comparisons caveat. `--json`: one object instead. Deterministic.
 * Exit 0, 1 on an error, 2 on bad options.
 */
export async function compareMain(args: readonly string[], io: CliIo, db: ItemDb): Promise<number> {
  const parsed = parseCompareArgs(args);
  if (typeof parsed === 'string') {
    io.err(`${parsed}\nusage: npm run scenario:compare -- <baseline.json> <other.json> [up to 5 files] [--runs N] [--seed S] [--json]`);
    return 2;
  }
  const scenarios: Scenario[] = [];
  let failed = false;
  for (const file of parsed.files) {
    const r = load(file, io, db);
    if (r === null) {
      failed = true;
      continue;
    }
    if (!r.ok || r.scenario === undefined) {
      io.err(`${file}: ${plural(r.errors.length, 'error')}: not run`);
      for (const e of r.errors) io.err(`  ${formatIssue('error', e)}`);
      failed = true;
      continue;
    }
    for (const w of r.warnings) io.err(`  ${file}: ${formatIssue('warning', w)}`);
    scenarios.push(r.scenario);
  }
  if (failed) return 1;
  const first = scenarios[0]!;
  const runs = parsed.runs ?? first.simulation?.runs ?? DEFAULT_CLI_RUNS;
  const seed = parsed.seed ?? first.simulation?.seed ?? DEFAULT_CLI_SEED;
  let result: CompareResult;
  try {
    result = await compare(
      scenarios.map((s) => ({ setup: scenarioRunSetup(s, db), db, runs, seed, spellQueueWindowMs: CLI_SPELL_QUEUE_WINDOW_MS })),
      { chunk: 1000 },
    );
  } catch (e) {
    io.err(`the comparison failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (parsed.json) {
    io.out(
      JSON.stringify(
        {
          runs: result.runs,
          seed: result.seed,
          spellQueueWindowMs: CLI_SPELL_QUEUE_WINDOW_MS,
          ranking: result.ranking,
          scenarios: scenarios.map((s, i) => {
            const r = result.results[i]!;
            const d = result.deltas[i];
            return {
              file: parsed.files[i],
              name: s.name,
              rank: result.ranks[i],
              meanDps: r.meanDps,
              stdDev: r.stdDev,
              stdErr: r.stdErr,
              ci95: r.ci95,
              delta: d === null || d === undefined ? null : { ...d, zscore: Number.isFinite(d.zscore) ? d.zscore : String(d.zscore), verdict: verdictOf(d) },
              ruleFires: r.ruleFires,
            };
          }),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  io.out(`Comparison: ${scenarios.length} scenarios, ${result.runs} paired runs (run i of every scenario uses the same seed), seed ${result.seed}, spell queue window ${CLI_SPELL_QUEUE_WINDOW_MS} ms`);
  io.out(`Baseline: 1. ${first.name}`);
  io.out(`${'#'.padEnd(3)}${'Rank'.padEnd(6)}${'Mean DPS'.padStart(10)}${'Sigma'.padStart(9)}${'SEM'.padStart(7)}${'Delta'.padStart(10)}${'SEM(d)'.padStart(8)}  ${'95% CI of delta'.padEnd(20)}  Verdict`);
  scenarios.forEach((_, i) => {
    const r = result.results[i]!;
    const d = result.deltas[i];
    const head = `${`${i + 1}.`.padEnd(3)}${String(result.ranks[i]).padEnd(6)}${f2(r.meanDps).padStart(10)}${f2(r.stdDev).padStart(9)}${f2(r.stdErr).padStart(7)}`;
    if (d === null || d === undefined) io.out(`${head}${'baseline'.padStart(10)}`);
    else io.out(`${head}${signed(d.meanDiff).padStart(10)}${f2(d.sem).padStart(8)}  ${`${signed(d.ci95[0])} .. ${signed(d.ci95[1])}`.padEnd(20)}  ${verdictOf(d)}`);
  });
  scenarios.forEach((s, i) => io.out(`${i + 1}. ${s.name} (${parsed.files[i]})`));
  io.out('Rule fires per fight:');
  scenarios.forEach((s, i) => {
    io.out(`  ${i + 1}. ${s.name}`);
    for (const [key, f] of Object.entries(result.results[i]!.ruleFires ?? {})) io.out(`    ${f.meanFires.toFixed(2).padStart(7)}  ${ruleName(s, key, f.label)}`);
  });
  io.out(
    `Verdict: "significant" means the 95% CI of the paired difference excludes 0. Each of the ${scenarios.length - 1} comparison(s) against the baseline is its own test with no correction: with no real difference about 1 in 20 still reads "significant"; with several scenarios, rerun with another --seed (or more --runs) before trusting a small difference.`,
  );
  return 0;
}
