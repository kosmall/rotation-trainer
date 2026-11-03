// `npm run scenario:compare -- <baseline.json> <other.json> [up to 5 files] [--runs N] [--seed S] [--json]`:
// a paired comparison of 2-5 scenarios on the simulator core without a browser (the same seed per
// run index in every scenario) and prints means, sigma, the paired delta against the first file,
// its 95% CI and a verdict. The logic is src/scenarios/cli.ts `compareMain`
// (docs/scenario-format.md, "Comparing scenarios").

import { readFileSync } from 'node:fs';
import { itemDbSync } from '../src/data/items/dbSync';
import { compareMain } from '../src/scenarios/cli';

const io = {
  readFile: (path: string) => readFileSync(path, 'utf8'),
  out: (line: string) => console.log(line),
  err: (line: string) => console.error(line),
};
compareMain(process.argv.slice(2), io, itemDbSync()).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
