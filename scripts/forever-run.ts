// `npm run forever:run -- --levels 40-59 --profile average --sessions 100 --seed 1 [--mobs 2 | --param mobs_per_pull=2] [--param bane_per_rank=0.2] [--builds A,B]`
import { compareBuilds, renderMarkdownTable } from '../src/forever/compare';
import { resolveMobs } from '../src/forever/ep-cli';
import { formatRunHeader } from '../src/forever/report';
import type { Params } from '../src/forever/types';

const args = process.argv.slice(2);
const all = (name: string): string[] => args.flatMap((x, i) => (x === `--${name}` && args[i + 1] ? [args[i + 1] as string] : []));
const arg = (name: string, def: string): string => all(name)[0] ?? def;
const parseLevels = (s: string): number[] => {
  const m = /^(\d+)-(\d+)$/.exec(s);
  return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i) : s.split(',').map(Number);
};
const params: Record<string, unknown> = {};
for (const kv of all('param')) {
  const [k, v] = kv.split('=');
  params[k as string] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
const levels = parseLevels(arg('levels', '40,50,59'));
const sessions = Number(arg('sessions', '60'));
const seed = Number(arg('seed', '1'));
// --mobs N wins; without it --param mobs_per_pull=N applies (default 1)
const mobs = resolveMobs(arg('mobs', ''), params);
const rows = compareBuilds({
  levels,
  profiles: arg('profile', 'average').split(','),
  sessions,
  seed,
  mobs,
  params: params as Partial<Params>,
  builds: arg('builds', '') ? arg('builds', '').split(',') : undefined,
});
console.log(formatRunHeader({ levels, profiles: arg('profile', 'average').split(','), mobs: mobs ?? (params.mobs_per_pull as number | undefined) ?? 1, sessions, seed, params }));
console.log(renderMarkdownTable(rows));
