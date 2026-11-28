// Argument handling of `npm run forever:ep` (the script scripts/forever-ep.ts only does the file and process I/O):
// `npm run forever:ep -- [--build ID | --builds A,B | --all] --levels 40-59 --profile average --mobs 1 --sessions 100 --seed 1
//   [--param k=v ...] [--delta stat=value ...] [--out reports/forever_ep.md]`
// Equivalency points: what one point of each stat is worth in points of spell power, per build and level.
import { VARIANT_IDS } from './builds';
import { EP_STATS } from './ep';
import { epReport, formatEp } from './ep-report';
import type { Params, StatKey } from './types';

const parseLevels = (s: string): number[] => {
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return s.split(',').map(Number);
};
const parseValue = (v: string | undefined): unknown => (v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v));

/**
 * The mobs per pull of a command line: `--mobs N` when given (also written to `params.mobs_per_pull`, so both
 * agree), otherwise undefined, which leaves `params.mobs_per_pull` (default 1, or `--param mobs_per_pull=N`) in
 * charge. Throws on a value other than 1, 2, 3.
 */
export function resolveMobs(flag: string | undefined, params: Record<string, unknown>): 1 | 2 | 3 | undefined {
  if (flag === undefined || flag === '') return undefined;
  const mobs = Number(flag);
  if (mobs !== 1 && mobs !== 2 && mobs !== 3) throw new Error(`--mobs must be 1, 2 or 3, got ${flag}`);
  params.mobs_per_pull = mobs;
  return mobs;
}

/** Runs the command on its arguments; throws an Error with a readable message on bad input. */
export function runEpCli(args: string[]): { text: string; out?: string } {
  const all = (name: string): string[] => args.flatMap((x, i) => (x === `--${name}` && args[i + 1] ? [args[i + 1] as string] : []));
  const arg = (name: string, def: string): string => all(name)[0] ?? def;
  const params: Record<string, unknown> = {};
  for (const kv of all('param')) {
    const [k, v] = kv.split('=');
    params[k as string] = parseValue(v);
  }
  const deltas: Partial<Record<StatKey, number>> = {};
  for (const kv of all('delta')) {
    const [k, v] = kv.split('=');
    if (!(EP_STATS as readonly string[]).includes(k as string) || !(Number(v) > 0)) throw new Error(`--delta wants <stat>=<positive number>, stat one of ${EP_STATS.join(', ')}; got ${kv}`);
    deltas[k as StatKey] = Number(v);
  }
  const builds = args.includes('--all') ? [...VARIANT_IDS] : arg('builds', '') ? arg('builds', '').split(',') : [arg('build', 'AFF_WRACK')];
  const levels = parseLevels(arg('levels', '40-59'));
  if (levels.length === 0 || levels.some((l) => !Number.isFinite(l))) throw new Error(`--levels wants a range like 40-59 (low to high) or a list like 45,50,55; got "${arg('levels', '40-59')}"`);
  const mobs = resolveMobs(arg('mobs', ''), params);
  const report = epReport(builds, levels, {
    profile: arg('profile', 'average'),
    mobs,
    sessions: Number(arg('sessions', '100')),
    seed: Number(arg('seed', '1')),
    params: params as Partial<Params>,
    deltas,
  });
  const out = arg('out', '');
  return { text: formatEp(report), ...(out ? { out } : {}) };
}
