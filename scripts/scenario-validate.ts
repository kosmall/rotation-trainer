// `npm run scenario:validate -- <scenario.json> [more files]`: checks scenario files without a
// browser and prints every error and warning with its path; exit code 1 on errors. The logic is
// src/scenarios/cli.ts `validateMain` (docs/scenario-format.md, "Validator and runner").

import { readFileSync } from 'node:fs';
import { itemDbSync } from '../src/data/items/dbSync';
import { validateMain } from '../src/scenarios/cli';

const io = {
  readFile: (path: string) => readFileSync(path, 'utf8'),
  out: (line: string) => console.log(line),
  err: (line: string) => console.error(line),
};
process.exitCode = validateMain(process.argv.slice(2), io, itemDbSync());
