// `npm run forever:wrack-thresholds [-- --sessions 200]` prints the tables of section 6 of reports/forever_wrack_vs_dt_ss.md:
// DT_SS_WRACK_70 with the Wrack health floor at 40..90% (Drain Life below it), against DT_SS, for 1-3 mobs and three gear profiles.
import { loadVariant, type BuildVariant } from '../src/forever/builds';
import { loadParams } from '../src/forever/data/load';
import { runCell, type CellMetrics } from '../src/forever/runner';

const args = process.argv.slice(2);
const sessions = Number(args[args.indexOf('--sessions') + 1] ?? 200) || 200;
const FLOORS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const LEVELS = [40, 45, 50, 55, 59];
const base = loadVariant('DT_SS_WRACK_70');
const rows: [string, BuildVariant][] = [['DT_SS', loadVariant('DT_SS')], ...FLOORS.map((f): [string, BuildVariant] => [`Wrack > ${f * 100}% HP`, { ...base, id: `DT_SS_WRACK_${f * 100}`, wrack_min_hp_pct: f }])];

function table(profile: string, mobs: 1 | 2 | 3): void {
  console.log(`\n### ${mobs} mob${mobs > 1 ? 'y' : ''}, gear ${profile}\n`);
  console.log('| wariant | ' + LEVELS.map((l) => `${l}`).join(' | ') + ' |');
  console.log('|---|' + LEVELS.map(() => '---:').join('|') + '|');
  const m: CellMetrics[][] = rows.map(([, v]) => LEVELS.map((level) => runCell({ variant: v, level, profile, params: loadParams({ mobs_per_pull: mobs }), mobs }, sessions, 1).metrics));
  const best = LEVELS.map((_, j) => Math.max(...m.map((r) => r[j]!.killsPerHour)));
  rows.forEach(([name], i) => {
    const cells = m[i]!.map((c, j) => {
      const s = `${c.killsPerHour.toFixed(1)} (${c.ttkMean.toFixed(1)} s, ${c.breaksPerHour.toFixed(0)}/h)`;
      return c.killsPerHour === best[j] ? `**${s}**` : s;
    });
    console.log(`| ${name} | ${cells.join(' | ')} |`);
  });
}

for (const mobs of [1, 2, 3] as const) table('average', mobs);
for (const profile of ['quest', 'good']) table(profile, 1);
