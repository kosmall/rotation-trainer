// `npm run forever:duel -- --a DEMO_PACT_R1 --b AFF_WRACK --levels 40-59 --profile average --mobs 1 --sessions 200 --seed 1
//   [--param bane_per_rank=0.2 ...] [--a-file build.json] [--b-file build.json] [--detail 50] [--respec 40] [--perk 0]`
import { readFileSync } from 'node:fs';
import { variantFromJson } from '../src/forever/builds';
import { duelBuilds, formatDetail, formatSummary, type BuildRef } from '../src/forever/duel';
import type { Params } from '../src/forever/types';

const args = process.argv.slice(2);
const all = (name: string): string[] => args.flatMap((x, i) => (x === `--${name}` && args[i + 1] ? [args[i + 1] as string] : []));
const arg = (name: string, def: string): string => all(name)[0] ?? def;

const parseLevels = (s: string): number[] => {
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return s.split(',').map(Number);
};
const ref = (id: string, file: string | undefined): BuildRef => (file ? variantFromJson(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : id);
const params: Record<string, unknown> = {};
for (const kv of all('param')) {
  const [k, v] = kv.split('=');
  params[k as string] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
if (arg('mobs', '')) params.mobs_per_pull = Number(arg('mobs', '1'));
const levels = parseLevels(arg('levels', '40-59'));
const report = duelBuilds(ref(arg('a', 'DEMO_PACT_R1'), all('a-file')[0]), ref(arg('b', 'AFF_WRACK'), all('b-file')[0]), {
  levels,
  profile: arg('profile', 'average'),
  mobs: Number(arg('mobs', '1')) as 1 | 2 | 3,
  sessions: Number(arg('sessions', '200')),
  seed: Number(arg('seed', '1')),
  params: params as Partial<Params>,
  picks: { legacyPerk: Number(arg('perk', '0')), respecLevel: arg('respec', '') ? Number(arg('respec', '40')) : undefined },
});
console.log(formatSummary(report));
const detail = arg('detail', '');
if (detail) {
  const r = report.results.find((x) => x.level === Number(detail));
  if (r) console.log('\n' + formatDetail(r, report.a, report.b));
}
