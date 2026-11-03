// `npm run scenario:run -- <scenario.json> [--runs N] [--seed S] [--json]`: runs a scenario on the
// simulator core without a browser and prints mean DPS, sigma, SEM, the 95% CI, the damage share
// per spell and the rule fires. The logic is src/scenarios/cli.ts `runMain`
// (docs/scenario-format.md, "Validator and runner").

import { readFileSync } from 'node:fs';
import { itemDbSync } from '../src/data/items/dbSync';
import { runMain } from '../src/scenarios/cli';

const io = {
  readFile: (path: string) => readFileSync(path, 'utf8'),
  out: (line: string) => console.log(line),
  err: (line: string) => console.error(line),
};
runMain(process.argv.slice(2), io, itemDbSync()).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
