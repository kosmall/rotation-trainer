// The bundled example scenarios (rotation scripts Task 3): docs/scenarios/*.json is the one source
// (the files agents read and the CLI runs); this module imports those files as they are, so the
// UI (Task 5) offers exactly them. tests/scenarios/examples.test.ts checks that every file in the
// folder is listed here, that each one is valid and canonical (`exportScenario` writes it back
// byte for byte) and that each one runs.

import burstPotion from '../../docs/scenarios/burst-potion.json';
import conflagrateDestruction from '../../docs/scenarios/conflagrate-destruction.json';
import lifeTapMana from '../../docs/scenarios/life-tap-mana.json';
import potionHeroismShadowburn from '../../docs/scenarios/potion-heroism-shadowburn.json';
import shadowburnHold from '../../docs/scenarios/shadowburn-hold.json';
import trinketSequencing from '../../docs/scenarios/trinket-sequencing.json';
import type { ItemDb } from '../data/items/types';
import { readScenario } from './format';
import type { Scenario } from './types';

export interface ScenarioExample {
  /** The file name in docs/scenarios (without `.json`). */
  file: string;
  /** The file's JSON as written. */
  json: unknown;
}

/** The example files, in the order the UI lists them (the user's trinket example first). */
export const SCENARIO_EXAMPLES: readonly ScenarioExample[] = Object.freeze([
  { file: 'trinket-sequencing', json: trinketSequencing },
  { file: 'burst-potion', json: burstPotion },
  { file: 'potion-heroism-shadowburn', json: potionHeroismShadowburn },
  { file: 'conflagrate-destruction', json: conflagrateDestruction },
  { file: 'life-tap-mana', json: lifeTapMana },
  { file: 'shadowburn-hold', json: shadowburnHold },
]);

/**
 * The examples as scenarios (read with `readScenario`; a file that could not be read would be
 * left out, which the tests rule out). Fresh objects on every call. With `db`, gear ids are
 * checked against the item database.
 */
export function exampleScenarios(db?: ItemDb | null): { file: string; scenario: Scenario }[] {
  return SCENARIO_EXAMPLES.flatMap((e) => {
    const r = readScenario(e.json, db);
    return r.scenario !== undefined ? [{ file: e.file, scenario: r.scenario }] : [];
  });
}
