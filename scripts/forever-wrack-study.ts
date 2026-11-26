// `npm run forever:wrack-study [-- --sessions 120]` prints the tables of reports/forever_wrack_vs_dt_ss.md:
// Wrack as the filler against Drain Life, with the talents and the filler separated, and the wrack_min_hp_pct floor.
import buildsJson from '../src/forever/data/builds.json';
import { loadVariant, variantFromJson, type BuildVariant } from '../src/forever/builds';
import { loadParams } from '../src/forever/data/load';
import { duelBuilds, formatSummary } from '../src/forever/duel';
import { runCell } from '../src/forever/runner';
import type { Params } from '../src/forever/types';

const args = process.argv.slice(2);
const sessions = Number(args[args.indexOf('--sessions') + 1] ?? 120) || 120;

const O = (buildsJson as unknown as { orders: Record<string, [string, number][]> }).orders;
const base = { pet: 'voidwalker', sacrificed: null, rotation: 'affliction', rank: 'max', pre_respec_build: null, respec_level: 40 };
// AFF_WRACK talents without Wrack: the point goes to Improved Health Funnel (not modelled, no effect).
const wNoWrack = O.AFF_WRACK!.map(([t, p]) => (t === 'wrack' ? ['improved_health_funnel', 1] : [t, p]));
// DT_SS talents reordered so Wrack comes at level 40: Amplify Curse and Malevolence before the Demonology points.
const dWrack: [string, number][] = [
  ['improved_corruption', 5], ['suppression', 5], ['improved_drains', 3], ['improved_bane_of_agony', 2], ['pandemic', 3], ['improved_life_tap', 2],
  ['siphon_life', 1], ['soul_siphon', 3], ['amplify_curse', 1], ['malevolence', 5], ['wrack', 1], ['unholy_power', 5], ['demonic_energies', 2],
  ['shadow_mastery', 5], ['fel_concentration', 3], ['nightfall', 2], ['demonic_embrace', 3],
];
const V: Record<string, BuildVariant> = {
  AFF_WRACK: loadVariant('AFF_WRACK'),
  W_DL: variantFromJson({ ...base, id: 'W_DL', order: wNoWrack, filler: 'drain_life' }),
  DT_SS: loadVariant('DT_SS'),
  DW_WRACK: variantFromJson({ ...base, id: 'DW_WRACK', order: dWrack, filler: 'wrack' }),
  DW_DL: variantFromJson({ ...base, id: 'DW_DL', order: dWrack, filler: 'drain_life' }),
};

function grid(title: string, ids: string[], levels: number[], profile: string, mobs: 1 | 2 | 3, over: Partial<Params>): void {
  console.log(`\n### ${title}\n`);
  console.log('| build | ' + levels.map((l) => `${l}: kph (TTK s, przerwy/h)`).join(' | ') + ' |');
  console.log('|---|' + levels.map(() => '---:').join('|') + '|');
  for (const id of ids) {
    const cells = levels.map((level) => {
      const m = runCell({ variant: V[id]!, level, profile, params: loadParams({ ...over, mobs_per_pull: mobs }), mobs }, sessions, 1).metrics;
      return `${m.killsPerHour.toFixed(1)} (${m.ttkMean.toFixed(1)}, ${m.breaksPerHour.toFixed(0)})`;
    });
    console.log(`| ${id} | ${cells.join(' | ')} |`);
  }
}

const L5 = [40, 45, 50, 55, 59];
grid('1 mob, average, domyślne parametry', ['AFF_WRACK', 'W_DL', 'DT_SS', 'DW_WRACK'], L5, 'average', 1, {});
for (const p of ['quest', 'good']) grid(`1 mob, ${p}`, ['AFF_WRACK', 'W_DL', 'DT_SS', 'DW_WRACK'], L5, p, 1, {});
for (const m of [2, 3] as const) grid(`${m} moby, average`, ['AFF_WRACK', 'W_DL', 'DT_SS', 'DW_WRACK', 'DW_DL'], L5, 'average', m, {});
for (const f of [0.4, 0.55, 0.7, 0.85]) grid(`1 mob, average, wrack_min_hp_pct=${f}`, ['AFF_WRACK', 'DT_SS', 'DW_WRACK'], L5, 'average', 1, { wrack_min_hp_pct: f });

const duel = (title: string, b: string, profile: string, mobs: 1 | 2 | 3, over: Partial<Params>, levels: number[]): void => {
  console.log(`\n### ${title}\n\n\`\`\``);
  console.log(formatSummary(duelBuilds(loadVariant('DT_SS'), V[b]!, { levels, profile, mobs, sessions: 200, seed: 7, params: { mobs_per_pull: mobs, ...over } })));
  console.log('```');
};
const L10 = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58];
for (const m of [1, 2, 3] as const) duel(`Duel: DT_SS (a) vs DW_DL (b), average, ${m} mob(y), wrack_min_hp_pct=0.6`, 'DW_DL', 'average', m, { wrack_min_hp_pct: 0.6 }, L10);
for (const p of ['quest', 'good']) duel(`Duel: DT_SS vs DW_DL, ${p}, 1 mob, wrack_min_hp_pct=0.6`, 'DW_DL', p, 1, { wrack_min_hp_pct: 0.6 }, [40, 45, 50, 55, 58]);
for (const x of [{ mob_hp_mult: 1.5 }, { mob_hp_mult: 2 }, { mob_dmg_mult: 1.5 }, { break_hp_pct: 0.5 }])
  duel(`Duel: DT_SS vs DW_DL, average, 1 mob, wrack_min_hp_pct=0.6, ${JSON.stringify(x)}`, 'DW_DL', 'average', 1, { wrack_min_hp_pct: 0.6, ...x }, [40, 45, 50, 55, 58]);
duel('Duel: DT_SS vs AFF_WRACK, average, 1 mob, wrack_min_hp_pct=0.6', 'AFF_WRACK', 'average', 1, { wrack_min_hp_pct: 0.6 }, [40, 45, 50, 55, 58]);
