// `npm run forever:optimize -- --build DEMO_PACT_R1 --core 31 --to 59 --profile average --sessions 20 --seed 1`
// Greedy search of the points after the first `--core` points of the build's own order.
import { loadOrder, loadVariant } from '../src/forever/builds';
import { loadParams } from '../src/forever/data/load';
import { optimizeBuild, toRuns } from '../src/forever/optimizer';
import { TALENT_BY_ID } from '../src/forever/talents';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : def;
};
const variant = loadVariant(arg('build', 'DEMO_PACT_R1'));
const core = loadOrder(variant.order).slice(0, Number(arg('core', '31')));
const res = optimizeBuild({ template: variant, core, toLevel: Number(arg('to', '59')), profile: arg('profile', 'average'), sessions: Number(arg('sessions', '20')), seed: Number(arg('seed', '1')), params: loadParams(), mobs: Number(arg('mobs', '1')) as 1 | 2 | 3 });
console.log(`Optimised order for ${variant.id} (first ${core.length} points fixed):`);
for (const s of res.steps) console.log(`level ${s.level}: ${TALENT_BY_ID.get(s.pick)?.name ?? s.pick}  (${s.kph.toFixed(1)} kills/h, gain ${s.gain.toFixed(2)})`);
console.log(JSON.stringify(toRuns(res.order.slice(core.length))));
