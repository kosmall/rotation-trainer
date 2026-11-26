// `npm run forever:ep -- [--build ID | --builds A,B | --all] --levels 40-59 --profile average --mobs 1 --sessions 100 --seed 1
//   [--param k=v ...] [--delta stat=value ...] [--out reports/forever_ep.md]`  (arguments: src/forever/ep-cli.ts)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runEpCli } from '../src/forever/ep-cli';

try {
  const { text, out } = runEpCli(process.argv.slice(2));
  console.log(text);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text + '\n');
  }
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
