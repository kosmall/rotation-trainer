// `npm run forever:ep -- [--build ID | --builds A,B | --all] --levels 40-59 --profile average --mobs 1 --sessions 100 --seed 1
//   [--param k=v ...] [--delta stat=value ...] [--out reports/forever_ep.md]`
// Equivalency points: what one point of each stat is worth in points of spell power, per build and level.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { VARIANT_IDS } from '../src/forever/builds';
import { EP_STATS } from '../src/forever/ep';
import { epReport, formatEp } from '../src/forever/ep-report';
import type { Params, StatKey } from '../src/forever/types';

const args = process.argv.slice(2);
const all = (name: string): string[] => args.flatMap((x, i) => (x === `--${name}` && args[i + 1] ? [args[i + 1] as string] : []));
const arg = (name: string, def: string): string => all(name)[0] ?? def;

const parseLevels = (s: string): number[] => {
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return s.split(',').map(Number);
};
const parseValue = (v: string | undefined): unknown => (v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v));

try {
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
  const report = epReport(builds, parseLevels(arg('levels', '40-59')), {
    profile: arg('profile', 'average'),
    mobs: Number(arg('mobs', '1')) as 1 | 2 | 3,
    sessions: Number(arg('sessions', '100')),
    seed: Number(arg('seed', '1')),
    params: params as Partial<Params>,
    deltas,
  });
  const text = formatEp(report);
  console.log(text);
  const out = arg('out', '');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text + '\n');
  }
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
