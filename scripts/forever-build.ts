// `npm run forever:build -- --build AFF_WRACK --level 47 [--perk 0] [--respec 40]`
// --respec N: no shipped build has a pre_respec_build (all are null), so this option does nothing today (the respec analysis in forever:report does not use it either).
import { describeBuild, loadVariant } from '../src/forever/builds';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : def;
};
const variant = loadVariant(arg('build', 'AFF_WRACK'));
const level = Number(arg('level', '50'));
const s = describeBuild(variant, level, { legacyPerk: Number(arg('perk', '0')), respecLevel: Number(arg('respec', String(variant.respec_level))) });
console.log(`${variant.id} at level ${level}: ${s.points} points (aff ${s.perTree.aff} / demo ${s.perTree.demo} / destro ${s.perTree.destro})`);
console.log(`last: ${s.lastPick ?? '-'}   next: ${s.nextPick ?? '-'}`);
for (const [id, r] of Object.entries(s.ranks)) console.log(`  ${id} ${r}`);
