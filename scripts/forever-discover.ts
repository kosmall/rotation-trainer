// `npm run forever:discover -- --level 40 [--profile average] [--mobs 1] [--seed 1] [--perk 0] [--top 20]
//   [--param key=value ...] [--quick] [--workers N] [--screen-sessions N] [--search-sessions N]
//   [--final-sessions N] [--keep N] [--state path] [--fresh]`
// Searches talents × generated rotations × pet setups for one level and writes
// reports/forever_discover_L<level>.md and .json (resumable: the state file is saved as it goes).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { loadParams } from '../src/forever/data/load';
import { DEFAULT_BUDGET, discover, QUICK_BUDGET, runTask, stateHash, type DiscoverOptions, type DiscoverState, type Runner, type Task, type TaskResult } from '../src/forever/discover/engine';
import { renderDiscoverReport, toJson } from '../src/forever/discover/report';
import { enumerateCombos } from '../src/forever/discover/space';
import type { Params } from '../src/forever/types';

const args = process.argv.slice(2);
const all = (name: string): string[] => args.flatMap((x, i) => (x === `--${name}` && args[i + 1] && !args[i + 1]!.startsWith('--') ? [args[i + 1] as string] : []));
const arg = (name: string): string | undefined => all(name)[0];
const flag = (name: string): boolean => args.includes(`--${name}`);
const fail = (msg: string): never => {
  console.error(`forever:discover: ${msg}`);
  process.exit(1);
};
const int = (name: string, def: number, min: number, max: number): number => {
  const raw = arg(name);
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(`--${name} must be an integer ${min}-${max}, got ${raw}`);
  return n;
};

if (arg('level') === undefined) fail('--level is required (10-60), e.g. --level 40');
const level = int('level', 40, 10, 60);
const defaults = loadParams();
const overrides: Record<string, unknown> = {};
for (const kv of all('param')) {
  const [k, v] = kv.split('=');
  if (!k || v === undefined) fail(`--param needs key=value, got ${kv}`);
  if (!(k! in defaults)) fail(`unknown param ${k}; valid: ${Object.keys(defaults).sort().join(', ')}`);
  overrides[k!] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
const quick = flag('quick');
const base = quick ? QUICK_BUDGET : DEFAULT_BUDGET;
const budget = {
  ...base,
  screen: { ...base.screen, sessions: int('screen-sessions', base.screen.sessions, 1, 1000) },
  search: { ...base.search, sessions: int('search-sessions', base.search.sessions, 1, 1000) },
  keep: int('keep', base.keep, 1, 100000),
  finalSessions: int('final-sessions', base.finalSessions, 2, 10000),
};
const options: DiscoverOptions = {
  level,
  profile: arg('profile') ?? 'average',
  mobs: int('mobs', 1, 1, 3) as 1 | 2 | 3,
  seed: int('seed', 1, 0, 2 ** 31 - 1),
  perk: int('perk', 0, 0, 10),
  params: loadParams(overrides as Partial<Params>),
  top: int('top', 20, 1, 200),
  budget,
};
const workers = int('workers', cpus().length, 1, 256);
const suffix = quick ? '_quick' : '';
const outBase = resolve(`reports/forever_discover_L${level}${suffix}`);
const statePath = resolve(arg('state') ?? `reports/.forever_discover_L${level}${suffix}.state.json`);

// ---- worker pool --------------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const pool: Worker[] = Array.from({ length: workers }, () => new Worker(resolve(here, 'forever-discover-worker.ts'), { workerData: options, execArgv: ['--import', 'tsx'] }));
const runner: Runner = (tasks, onDone) =>
  new Promise((done, reject) => {
    const out: TaskResult[] = new Array(tasks.length);
    let next = 0;
    let finished = 0;
    if (tasks.length === 0) return done(out);
    const feed = (w: Worker): void => {
      if (next < tasks.length) {
        w.postMessage({ i: next, task: tasks[next] as Task });
        next++;
      }
    };
    for (const w of pool) {
      w.removeAllListeners('message').removeAllListeners('error');
      w.on('error', reject);
      w.on('message', (m: { i: number; result: TaskResult }) => {
        out[m.i] = m.result;
        finished++;
        onDone(m.result);
        if (finished === tasks.length) done(out);
        else feed(w);
      });
      feed(w);
    }
  });

// ---- state, progress ----------------------------------------------------------------------------
let state: DiscoverState | undefined;
if (!flag('fresh') && existsSync(statePath)) {
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8')) as DiscoverState;
    if (s.hash === stateHash(options)) {
      state = s;
      console.error(`resumed: ${Object.keys(s.screen).length} screen results, ${Object.keys(s.search).length} search results from ${statePath}`);
    } else console.error('the saved state is from other data or settings: starting over');
  } catch {
    console.error(`could not read ${statePath}: starting over`);
  }
}
const save = (s: DiscoverState): void => {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(`${statePath}.tmp`, JSON.stringify(s));
  renameSync(`${statePath}.tmp`, statePath);
};

const combos = enumerateCombos(level);
{
  // rough estimate from screen tasks timed here (after one warm-up task)
  const sample = (k: number): Task => ({ kind: 'search', stage: 'screen', combo: combos[Math.floor((combos.length * k) / 7)]! });
  runTask(options, sample(0));
  const t0 = performance.now();
  for (let k = 1; k <= 6; k++) runTask(options, sample(k));
  const one = (performance.now() - t0) / 1000 / 6;
  const perEval = one / budget.screen.evals / budget.screen.sessions;
  const screenSec = (one * combos.length) / workers;
  const searchSec = (perEval * budget.search.evals * budget.search.sessions * (budget.keep + 9 * budget.perFamilyMin)) / workers;
  console.error(`level ${level}: ${combos.length} combinations, ${workers} workers; estimate ~${Math.round((screenSec + searchSec) / 60)} min (screen ~${Math.round(screenSec / 60)}, search ~${Math.round(searchSec / 60)})`);
}
const started = Date.now();
let last = { stage: '', at: 0 };
const progress = (stage: string, done: number, total: number): void => {
  const now = Date.now();
  if (stage === last.stage && now - last.at < 10000 && done < total) return;
  if (stage !== last.stage) stageStart = { at: now, done };
  last = { stage, at: now };
  const rate = (done - stageStart.done) / Math.max(1, (now - stageStart.at) / 1000);
  const eta = rate > 0 ? Math.round((total - done) / rate / 60) : NaN;
  console.error(`[${new Date(now).toISOString().slice(11, 19)}] ${stage}: ${done}/${total}${Number.isFinite(eta) && done < total ? `, ~${eta} min left` : ''}`);
};
let stageStart = { at: started, done: 0 };

const result = await discover(options, runner, { state, save, progress });
const runSec = (Date.now() - started) / 1000;
mkdirSync(dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.md`, renderDiscoverReport(result, runSec) + '\n');
writeFileSync(`${outBase}.json`, toJson(result) + '\n');
console.error(`wrote ${outBase}.md and ${outBase}.json (${Math.round(runSec / 60)} min)`);
await Promise.all(pool.map((w) => w.terminate()));
