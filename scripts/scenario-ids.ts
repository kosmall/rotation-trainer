// Prints the scenario id reference (spells, auras, buff ids, consumables, on-use items, talent
// presets, gear slots) generated from the data: src/scenarios/idReference.ts. With --write it
// rewrites the generated section of docs/scenario-format.md between its markers (a test keeps the
// two in sync: tests/scenarios/docs.test.ts).
//
//   npm run scenario:ids              (print)
//   npm run scenario:ids -- --write   (update docs/scenario-format.md)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemDbSync } from '../src/data/items/dbSync';
import { replaceIdReference, scenarioIdReference } from '../src/scenarios/idReference';

const docPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'scenario-format.md');
const section = scenarioIdReference(itemDbSync());
if (process.argv.includes('--write')) {
  const next = replaceIdReference(readFileSync(docPath, 'utf8'), section);
  if (next === null) {
    console.error(`FAIL the markers are missing in ${docPath}`);
    process.exit(1);
  }
  writeFileSync(docPath, next);
  console.log(`updated ${docPath}`);
} else {
  console.log(section);
}
