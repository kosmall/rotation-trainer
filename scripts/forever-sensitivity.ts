// `npm run forever:sensitivity -- --levels 40,45,50,55,59 --profile average --sessions 40 --seed 1`
import { renderSensitivity, sensitivity } from '../src/forever/sensitivity';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : def;
};
const rep = sensitivity({ levels: arg('levels', '40,45,50,55,59').split(',').map(Number), profile: arg('profile', 'average'), sessions: Number(arg('sessions', '40')), seed: Number(arg('seed', '1')) });
console.log(renderSensitivity(rep));
