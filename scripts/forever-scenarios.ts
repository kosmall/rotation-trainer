// `npm run forever:scenarios -- [--levels 40,45,50,55,59] [--sessions 100] [--seed 1] [--mobs 1] [--policy BEST_1MOB] [--profile average] [--out reports/forever_scenarios.md]`
// Ranks the built-in builds and the guide scenarios (src/forever/data/scenarios.json) per level and writes a markdown report.
import { writeFileSync } from 'node:fs';
import { SCENARIOS, SCENARIO_IDS, VARIANT_IDS } from '../src/forever/builds';
import { DEFAULT_SETTINGS, runJob, type RankingResult } from '../src/forever/web/api';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : def;
};
const levels = arg('levels', '40,45,50,55,59').split(',').map(Number);
const settings = { ...DEFAULT_SETTINGS, sessions: Number(arg('sessions', '100')), seed: Number(arg('seed', '1')), mobs: (Number(arg('mobs', '1')) === 2 ? 2 : 1) as 1 | 2, policy: arg('policy', 'BEST_1MOB'), profile: arg('profile', 'average') };
const out = arg('out', 'reports/forever_scenarios.md');

const results = levels.map((level) => runJob({ kind: 'ranking', settings: { ...settings, level }, scenarios: true }) as RankingResult);
const ids = [...VARIANT_IDS, ...SCENARIO_IDS];
const info = new Map(SCENARIOS.map((s) => [s.id, s]));
const kph = (r: RankingResult, id: string) => r.rows.find((x) => x.metrics.variant === id)?.metrics;
const mean = (id: string) => levels.reduce((a, _, i) => a + (kph(results[i] as RankingResult, id)?.killsPerHour ?? 0), 0) / levels.length;
const order = [...ids].sort((a, b) => mean(b) - mean(a));
const f = (x: number, d = 1) => x.toFixed(d);
const avg = (id: string, pick: (m: NonNullable<ReturnType<typeof kph>>) => number) => levels.reduce((a, _, i) => a + pick(kph(results[i] as RankingResult, id) as never), 0) / levels.length;

const lines: string[] = [
  '# WoW Forever: scenariusze z poradników (levele 40-59)',
  '',
  `Sprzęt: ${settings.profile}, ${settings.mobs} mob/pull, strategia: ${settings.policy}, ${settings.sessions} sesji, seed ${settings.seed}. Zabicia na godzinę; średnia z leveli ${levels.join(', ')}.`,
  '',
  '| # | Build | pet | kills/h średnio | ' + levels.map((l) => `L${l}`).join(' | ') + ' | picie s/zab. | przestój | zgony/h |',
  '|---|---|---|---:|' + levels.map(() => '---:').join('|') + '|---:|---:|---:|',
];
order.forEach((id, i) => {
  const s = info.get(id);
  lines.push(`| ${i + 1} | ${id} | ${s ? (s.pet ?? '-') + (s.sacrificed ? ` (sac ${s.sacrificed})` : '') : 'wbudowany'} | **${f(mean(id))}** | ${levels.map((_, k) => f(kph(results[k] as RankingResult, id)?.killsPerHour ?? 0)).join(' | ')} | ${f(avg(id, (m) => m.drinkSecPerKill))} | ${f(100 * avg(id, (m) => m.downtimeShare), 0)}% | ${f(avg(id, (m) => m.deathsPerHour), 2)} |`);
});
lines.push('', '## Scenariusze i źródła', '');
for (const s of SCENARIOS) lines.push(`- **${s.id}**: ${s.title}. Rotacja ${s.rotation}${s.rotation === 'demonology' ? `, Shadow Bolt ${s.rank}` : ''}. Źródło: ${s.source}.${s.note ? ' ' + s.note : ''}`);
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
