// The AI-agent kit (Task 3): the generated id tables of docs/scenario-format.md in sync with the
// data, the JSON Schema accepting every example and rejecting broken ones, and the doc's claims
// that the tests can pin.

import { describe, expect, it } from 'vitest';
import doc from '../../docs/scenario-format.md?raw';
import schemaText from '../../docs/scenario.schema.json?raw';
import { itemDbSync } from '../../src/data/items/dbSync';
import { SCENARIO_EXAMPLES } from '../../src/scenarios/examples';
import { exportScenario, parseScenario } from '../../src/scenarios/format';
import { extractIdReference, ID_REFERENCE_END, ID_REFERENCE_START, replaceIdReference, scenarioIdReference } from '../../src/scenarios/idReference';
import { SCENARIO_LIMITS, SCENARIO_SCHEMA_URL, SCENARIO_SETUP_KEYS } from '../../src/scenarios/types';
import { VARIABLE_DOCS } from '../../src/script/vars';
import { checkSchema } from './schema-check';

const db = itemDbSync();
const schema = JSON.parse(schemaText) as Record<string, unknown>;

describe('docs/scenario-format.md', () => {
  it('the generated id reference is in sync with the data (run `npm run scenario:ids -- --write`)', () => {
    expect(extractIdReference(doc)).toBe(scenarioIdReference(db));
  });

  it('the generated reference lists the ids the examples and the docs rely on', () => {
    const ref = scenarioIdReference(db);
    for (const id of ['`shadow-bolt`', '`conflagrate`', '`shadow-vulnerability`', '`heroism`', '`item:29370`', '`item:281735`', '`item-buff:1312270`', '`destruction-potion`', '`destro-nightfall`', 'trinket1']) {
      expect(ref).toContain(id);
    }
  });

  it('replaceIdReference / extractIdReference: markers kept, missing markers detected', () => {
    const text = `a\n${ID_REFERENCE_START}\nold\n${ID_REFERENCE_END}\nb`;
    const next = replaceIdReference(text, 'new')!;
    expect(next).toBe(`a\n${ID_REFERENCE_START}\n\nnew\n\n${ID_REFERENCE_END}\nb`);
    expect(extractIdReference(next)).toBe('new');
    expect(replaceIdReference('no markers', 'x')).toBeNull();
    expect(extractIdReference('no markers')).toBeNull();
  });

  it('documents every variable and function of the language', () => {
    for (const v of VARIABLE_DOCS) {
      const name = v.name.replace(/\(.*\)$/, '(');
      expect(doc, v.name).toContain(`\`${name}`);
    }
  });

  it('documents every setup field and the limits', () => {
    for (const k of SCENARIO_SETUP_KEYS) expect(doc).toContain(`\`${k}\``);
    expect(doc).toContain('200 000 characters');
    expect(doc).toContain(`up to ${SCENARIO_LIMITS.name} characters`);
    expect(doc).toContain(SCENARIO_SCHEMA_URL);
  });

  it("the doc's worked example rules are the trinket example file's (after its first two rules' labels and comments)", () => {
    const block = /### 7\.1[\s\S]*?```json\n([\s\S]*?)```/.exec(doc)![1]!;
    const docRules = JSON.parse(`{${block}}`).rules as Record<string, unknown>[];
    const file = SCENARIO_EXAMPLES.find((e) => e.file === 'trinket-sequencing')!.json as { script: { rules: Record<string, unknown>[] } };
    const strip = (r: Record<string, unknown>) => ({ action: r.action, id: r.id, ...(r.if !== undefined && { if: r.if }) });
    expect(file.script.rules.map(strip)).toEqual(docRules.map(strip));
  });

  it('the file example of section 1 is a valid scenario', () => {
    const block = /## 1\. File structure[\s\S]*?```json\n([\s\S]*?)```/.exec(doc)![1]!;
    const r = parseScenario(block, { db });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(checkSchema(schema, JSON.parse(block))).toEqual([]);
  });
});

describe('docs/scenario.schema.json', () => {
  it('is a draft 2020-12 schema whose $id is the exported $schema pointer', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe(SCENARIO_SCHEMA_URL);
    expect(String(schema.description)).toMatch(/NOT checked by this schema/);
  });

  for (const e of SCENARIO_EXAMPLES) {
    it(`accepts the example ${e.file} and its export`, () => {
      expect(checkSchema(schema, e.json)).toEqual([]);
      const s = parseScenario(JSON.stringify(e.json), { db }).scenario!;
      expect(checkSchema(schema, JSON.parse(exportScenario({ ...s, $schema: undefined } as never)))).toEqual([]);
    });
  }

  const base = () => structuredClone(SCENARIO_EXAMPLES[0]!.json) as Record<string, any>;
  const mutations: [string, (s: Record<string, any>) => void][] = [
    ['no name', (s) => delete s.name],
    ['blank name', (s) => (s.name = '   ')],
    ['no script', (s) => delete s.script],
    ['wrong format', (s) => (s.format = 'other')],
    ['version 2', (s) => (s.version = 2)],
    ['unknown top-level field', (s) => (s.extra = 1)],
    ['no rules', (s) => (s.script.rules = [])],
    ['unknown action', (s) => (s.script.rules[0].action = 'jump')],
    ['cast without id', (s) => (s.script.rules = [{ action: 'cast' }])],
    ['wait without if', (s) => (s.script.rules = [{ action: 'wait' }])],
    ['wait with a blank if', (s) => (s.script.rules = [{ action: 'wait', if: ' ' }])],
    ['unknown rule field', (s) => (s.script.rules[0].when = 'x')],
    ['if not a string', (s) => (s.script.rules[0].if = true)],
    ['if over 500', (s) => (s.script.rules[0].if = 'x'.repeat(501))],
    ['bad def name', (s) => (s.script.defs = { '9x': 'true' })],
    ['runs 0', (s) => (s.simulation.runs = 0)],
    ['runs 1.5', (s) => (s.simulation.runs = 1.5)],
    ['gear of 16', (s) => s.setup.gear.pop()],
    ['gear id a string', (s) => (s.setup.gear[0] = { id: '31051' })],
    ['fight 5 s', (s) => (s.setup.fightDurationSec = 5)],
    ['armor plate', (s) => (s.setup.warlock = { armor: 'plate' })],
    ['unknown setup field', (s) => (s.setup.colour = 'red')],
    ['timed start -1', (s) => (s.setup.timed.heroism.startSec = -1)],
  ];
  for (const [title, mutate] of mutations) {
    it(`rejects a mutated example: ${title}`, () => {
      const s = base();
      mutate(s);
      expect(checkSchema(schema, s).length).toBeGreaterThan(0);
    });
  }

  it('the checker refuses keywords it does not know (so the schema cannot outgrow the test)', () => {
    expect(() => checkSchema({ type: 'object', oneOf: [] }, {})).toThrow(/not supported/);
  });
});
