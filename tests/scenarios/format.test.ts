// The scenario file format (Task 3): reading, normalization, script checking against the setup,
// export with a stable key order, the round trip, hostile inputs and applyScenario.

import { describe, expect, it } from 'vitest';
import { destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { TALENT_PRESETS } from '../../src/data/classes/warlock/talentPresets';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { EquippedItem } from '../../src/engine/types';
import {
  applyScenario,
  exportScenario,
  jsonShapeProblem,
  parseScenario,
  parseScenarioValue,
  readScenario,
} from '../../src/scenarios/format';
import { SCENARIO_FORMAT, SCENARIO_LIMITS, SCENARIO_SCHEMA_URL, type Scenario } from '../../src/scenarios/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';

const db = itemDbSync();
const PIPE = 281735;
const base = (): SetupConfig => structuredClone(DEFAULT_SETUP) as SetupConfig;

function pipeGear(): (EquippedItem | null)[] {
  const gear: (EquippedItem | null)[] = structuredClone(destructionEquipped);
  gear[ITEM_SLOTS.indexOf('trinket1')] = { id: PIPE };
  return gear;
}

const minimal = () => ({
  format: SCENARIO_FORMAT,
  version: 1,
  name: 'Shadow Bolt spam',
  script: { rules: [{ action: 'cast', id: 'shadow-bolt' }] },
});

const full = () => ({
  $schema: '../scenario.schema.json',
  format: SCENARIO_FORMAT,
  version: 1,
  name: 'Pipe then Icon',
  description: 'Trinket sequencing',
  author: 'tester',
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T11:00:00.000Z',
  simulation: { runs: 500, seed: 7 },
  setup: {
    talents: 'destro-nightfall',
    gear: pipeGear(),
    enabledBuffs: ['heroism', 'destruction-potion'],
    timed: { heroism: { startSec: 10, durationSec: 40 } },
    distanceYd: 20,
    fightDurationSec: 90,
    warlock: { armor: 'fel' },
    rotation: { curse: 'doom' },
  },
  script: {
    rules: [
      { action: 'use', id: `item:${PIPE}`, if: 'heroism.active && target.aura.shadow-vulnerability.active', label: 'Pipe' },
      { action: 'use', id: 'item:29370', if: `use.item:${PIPE}.count >= 1` },
      { action: 'use', id: 'destruction-potion', if: '$burst' },
      { action: 'cast', id: 'shadow-bolt', comment: 'filler', enabled: true },
    ],
    defs: { burst: 'heroism.active' },
  },
  notes: 'free text',
});

describe('parseScenario: valid files', () => {
  it('reads a minimal scenario (no setup: the default) without issues', () => {
    const r = parseScenario(JSON.stringify(minimal()));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.scenario).toEqual({ $schema: SCENARIO_SCHEMA_URL, ...minimal() });
  });

  it('reads a full scenario: setup subset normalized (talent preset id -> string), ids checked against the scenario setup', () => {
    const r = parseScenario(JSON.stringify(full()), { db });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    const s = r.scenario!;
    expect(s.setup!.talents).toBe(TALENT_PRESETS.find((p) => p.id === 'destro-nightfall')!.talents);
    expect(s.setup!.gear![ITEM_SLOTS.indexOf('trinket1')]).toEqual({ id: PIPE, gems: [] });
    expect(s.setup!.rotation).toEqual({ curse: 'doom' });
    expect(s.setup!.warlock).toEqual({ armor: 'fel' });
    expect(s.setup!.timed).toEqual({ heroism: { startSec: 10, durationSec: 40 } });
    expect(s.simulation).toEqual({ runs: 500, seed: 7 });
    expect(s.$schema).toBe('../scenario.schema.json');
  });

  it('without the scenario setup the Pipe is not worn: a warning with the rule left out, not an error', () => {
    const f = full();
    delete (f as Partial<typeof f>).setup;
    const r = parseScenario(JSON.stringify(f), { db });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.path)).toContain('script.rules[0].id');
    expect(r.warnings.some((w) => w.path === 'script.rules[0]' && /left out/.test(w.message))).toBe(true);
  });

  it('the base setup is what the ids are checked against when the scenario has no setup', () => {
    const f = full();
    delete (f as Partial<typeof f>).setup;
    const config = { ...base(), gear: pipeGear(), enabledBuffs: ['heroism', 'destruction-potion'] };
    const r = parseScenario(JSON.stringify(f), { db, base: config });
    expect(r.warnings).toEqual([]);
  });

  it('without the item database a gear that needs it: ids not checked (a warning), syntax still checked', () => {
    const r = parseScenario(JSON.stringify(full()));
    expect(r.ok).toBe(true);
    expect(r.warnings).toContainEqual({ path: 'script', message: 'ids not checked: this gear needs the item database' });
    const bad = full();
    bad.script.rules[1]!.if = 'use.item:1.count >=';
    expect(parseScenario(JSON.stringify(bad)).errors[0]!.path).toBe('script.rules[1].if');
  });

  it('script errors have paths and positions; unknown ids are warnings with suggestions', () => {
    const s = minimal();
    s.script.rules = [
      { action: 'cast', id: 'shadow-bolt', if: 'mana < ' } as never,
      { action: 'cast', id: 'shadow-blot' },
      { action: 'cast', id: 'immolate', if: 'target.aura.imolate.active' } as never,
    ];
    const r = parseScenario(JSON.stringify(s));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ path: 'script.rules[0].if' });
    expect(r.errors[0]!.message).toMatch(/^column 8: /);
    // Warnings are only reported once the structure is error-free.
    s.script.rules.shift();
    const w = parseScenario(JSON.stringify(s));
    expect(w.ok).toBe(true);
    expect(w.warnings).toContainEqual({ path: 'script.rules[0].id', message: "unknown spell 'shadow-blot'", suggestion: 'shadow-bolt' });
    expect(w.warnings.find((x) => x.path === 'script.rules[1].if')!.suggestion).toBe('immolate');
  });

  it('setup values the normalization changes or drops are warnings with paths and suggestions', () => {
    const s = {
      ...minimal(),
      setup: {
        enabledBuffs: ['heroizm', 'heroism', 42],
        distanceYd: 500,
        fightDurationSec: 'long',
        warlock: { armor: 'plate', pet: 'imp' },
        rotation: { curse: 'dom', lifeTapBelowMana: 100 },
        timed: { heroism: { startSec: -5 }, potion: { startSec: 1 } },
        talents: '9-9-9',
        gearPresetId: 'x',
        script: { rules: [] },
        version: 1,
        colour: 'red',
      },
    };
    const r = parseScenario(JSON.stringify(s), { db });
    expect(r.ok).toBe(true);
    const byPath = Object.fromEntries(r.warnings.map((w) => [w.path, w]));
    expect(byPath['setup.enabledBuffs[0]']).toMatchObject({ message: "unknown buff 'heroizm' (ignored)", suggestion: 'heroism' });
    expect(byPath['setup.enabledBuffs[2]']!.message).toMatch(/must be a string/);
    expect(byPath['setup.distanceYd']!.message).toBe('invalid value 500: using 100');
    expect(byPath['setup.fightDurationSec']!.message).toBe('invalid value long: using 60');
    expect(byPath['setup.warlock.armor']!.message).toBe('invalid value plate: using fel');
    expect(byPath['setup.warlock.pet']).toBeDefined();
    expect(byPath['setup.rotation.curse']!.message).toBe('invalid value dom: using elements');
    expect(byPath['setup.rotation.lifeTapBelowMana']).toBeUndefined();
    expect(byPath['setup.timed.heroism.startSec']!.message).toBe('invalid value -5: using 0');
    expect(byPath['setup.timed.potion']).toBeDefined();
    expect(byPath['setup.talents']!.message).toMatch(/invalid talent build/);
    expect(byPath['setup.gearPresetId']!.message).toBe('ignored without `gear`');
    expect(byPath['setup.script']).toBeDefined();
    expect(byPath['setup.colour']).toBeDefined();
    expect(byPath['setup.version']).toBeUndefined();
    expect(r.scenario!.setup).toEqual({
      enabledBuffs: ['heroism'],
      timed: { heroism: { startSec: 0, durationSec: 40 } },
      distanceYd: 100,
      fightDurationSec: 60,
      warlock: { armor: 'fel' },
      rotation: { curse: 'elements', lifeTapBelowMana: 100 },
    });
  });

  it('gear entries the database drops are warnings', () => {
    const gear: unknown[] = pipeGear();
    gear[0] = { id: 999999999 };
    gear[ITEM_SLOTS.indexOf('trinket2')] = { id: PIPE };
    const r = parseScenario(JSON.stringify({ ...minimal(), setup: { gear } }), { db });
    expect(r.warnings.map((w) => w.path)).toEqual(['setup.gear[0]', `setup.gear[${ITEM_SLOTS.indexOf('trinket2')}]`]);
    expect(parseScenario(JSON.stringify({ ...minimal(), setup: { gear: [1, 2] } }), { db }).warnings[0]!.path).toBe('setup.gear');
  });

  it('unknown top-level, script and simulation fields are warnings with suggestions', () => {
    const r = parseScenario(JSON.stringify({ ...minimal(), descripton: 'x', script: { rules: minimal().script.rules, def: {} }, simulation: { run: 5 } }));
    expect(r.ok).toBe(true);
    expect(r.warnings).toContainEqual({ path: 'descripton', message: "unknown field 'descripton' (ignored)", suggestion: 'description' });
    expect(r.warnings).toContainEqual({ path: 'script.def', message: "unknown script field 'def' (ignored)", suggestion: 'defs' });
    expect(r.warnings).toContainEqual({ path: 'simulation.run', message: "unknown simulation field 'run' (ignored)", suggestion: 'runs' });
  });
});

describe('exportScenario', () => {
  it('stable key order, pretty, final newline, $schema pointer', () => {
    const shuffled = { notes: 'n', script: minimal().script, name: 'A', version: 1, format: SCENARIO_FORMAT, simulation: { seed: 2, runs: 3 } };
    const s = parseScenario(JSON.stringify(shuffled)).scenario!;
    const text = exportScenario(s);
    expect(text.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual(['$schema', 'format', 'version', 'name', 'simulation', 'script', 'notes']);
    expect(Object.keys(JSON.parse(text).simulation)).toEqual(['runs', 'seed']);
    expect(text).toContain('\n  "format": "rotation-trainer.scenario",\n');
    const noSchema = { ...s };
    delete noSchema.$schema;
    expect(JSON.parse(exportScenario(noSchema)).$schema).toBe(SCENARIO_SCHEMA_URL);
  });

  it('round trip: parse(export(s)) equals s, and export is a fixed point', () => {
    for (const v of [minimal(), full()]) {
      const s = parseScenario(JSON.stringify(v), { db }).scenario!;
      const text = exportScenario(s);
      const again = parseScenario(text, { db });
      expect(again.errors).toEqual([]);
      expect(again.scenario).toEqual(s);
      expect(exportScenario(again.scenario!)).toBe(text);
    }
  });

  it('rule keys in the order action, id, if, label, comment, enabled', () => {
    const s = parseScenario(JSON.stringify({ ...minimal(), script: { rules: [{ enabled: false, comment: 'c', label: 'l', if: 'mana < 5', id: 'shadow-bolt', action: 'cast' }] } })).scenario!;
    expect(Object.keys(JSON.parse(exportScenario(s)).script.rules[0])).toEqual(['action', 'id', 'if', 'label', 'comment', 'enabled']);
  });
});

describe('parseScenario: hostile and wrong inputs (never throws, clear errors)', () => {
  const deep = (n: number) => '['.repeat(n) + ']'.repeat(n);
  const cases: [string, unknown, RegExp][] = [
    ['empty text', '', /empty/],
    ['blank text', '   \n ', /empty/],
    ['not JSON', '{name:', /not valid JSON/],
    ['truncated JSON', JSON.stringify(minimal()).slice(0, 40), /not valid JSON/],
    ['over the size cap', ' '.repeat(SCENARIO_LIMITS.fileChars + 1), /longer than 200000/],
    ['huge string value', JSON.stringify({ ...minimal(), notes: 'x'.repeat(150_000) }), /notes longer than/],
    ['deep arrays (100 000)', deep(100_000), /longer than|not valid JSON|deeper/],
    ['deep arrays (30)', deep(30), /deeper than 20/],
    ['deep objects in a field', JSON.stringify({ ...minimal(), x: JSON.parse('{"a":'.repeat(25) + '1' + '}'.repeat(25)) }), /deeper than 20/],
    ['too many array elements', JSON.stringify({ ...minimal(), x: new Array(1001).fill(0) }), /more than 1000 elements/],
    ['too many keys', JSON.stringify({ ...minimal(), x: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, 0])) }), /more than 500 keys/],
    ['null', 'null', /JSON object/],
    ['a number', '42', /JSON object/],
    ['a string', '"scenario"', /JSON object/],
    ['an array', '[]', /JSON object/],
    ['no format', JSON.stringify({ version: 1, name: 'x', script: { rules: [] } }), /format must be/],
    ['a saved setup', JSON.stringify(base()), /looks like a saved setup/],
    ['wrong format', JSON.stringify({ ...minimal(), format: 'wowsims' }), /unknown format/],
    ['newer version', JSON.stringify({ ...minimal(), version: 2 }), /version 2 is newer/],
    ['version 0', JSON.stringify({ ...minimal(), version: 0 }), /unsupported scenario version 0/],
    ['version as string', JSON.stringify({ ...minimal(), version: '1' }), /unsupported scenario version/],
    ['no script', JSON.stringify({ ...minimal(), script: undefined }), /needs a script/],
    ['script an array', JSON.stringify({ ...minimal(), script: [] }), /script must be an object/],
    ['no rules', JSON.stringify({ ...minimal(), script: { rules: [] } }), /at least one rule/],
    ['rules not an array', JSON.stringify({ ...minimal(), script: { rules: {} } }), /rules must be an array/],
    ['201 rules', JSON.stringify({ ...minimal(), script: { rules: new Array(201).fill({ action: 'cast', id: 'shadow-bolt' }) } }), /at most 200 rules/],
    ['unknown action', JSON.stringify({ ...minimal(), script: { rules: [{ action: 'jump' }] } }), /unknown action/],
    ['expression over 500', JSON.stringify({ ...minimal(), script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: 'true && '.repeat(70) + 'true' }] } }), /500/],
    ['id over 128', JSON.stringify({ ...minimal(), script: { rules: [{ action: 'cast', id: 'x'.repeat(129) }] } }), /id longer than 128/],
    ['name missing', JSON.stringify({ ...minimal(), name: undefined }), /needs a name/],
    ['name a number', JSON.stringify({ ...minimal(), name: 5 }), /name must be a string/],
    ['name blank', JSON.stringify({ ...minimal(), name: '  ' }), /blank/],
    ['name too long', JSON.stringify({ ...minimal(), name: 'n'.repeat(101) }), /name longer than 100/],
    ['description a number', JSON.stringify({ ...minimal(), description: 1 }), /description must be a string/],
    ['simulation runs 0', JSON.stringify({ ...minimal(), simulation: { runs: 0 } }), /runs must be an integer/],
    ['simulation runs 1.5', JSON.stringify({ ...minimal(), simulation: { runs: 1.5 } }), /runs must be an integer/],
    ['simulation seed -1', JSON.stringify({ ...minimal(), simulation: { seed: -1 } }), /seed must be an integer/],
    ['simulation a string', JSON.stringify({ ...minimal(), simulation: 'fast' }), /simulation must be an object/],
    ['setup an array', JSON.stringify({ ...minimal(), setup: [] }), /setup must be an object/],
    ['101 buffs', JSON.stringify({ ...minimal(), setup: { enabledBuffs: new Array(101).fill('heroism') } }), /at most 100 buffs/],
    ['def cycle', JSON.stringify({ ...minimal(), script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: '$a' }], defs: { a: '$b', b: '$a' } } }), /cycle/],
    ['eval attempt', JSON.stringify({ ...minimal(), script: { rules: [{ action: 'cast', id: 'shadow-bolt', if: 'eval("1")' }] } }), /column/],
  ];

  it(`has at least 30 cases (${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  for (const [title, input, message] of cases) {
    it(title, () => {
      const r = parseScenario(input as string, { db });
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.map((e) => e.message).join(' | ')).toMatch(message);
      for (const e of r.errors) expect(typeof e.path).toBe('string');
    });
  }

  it('__proto__ and constructor keys are plain unknown fields; nothing is polluted', () => {
    const text = `{"format":"${SCENARIO_FORMAT}","version":1,"name":"p","__proto__":{"polluted":true},"constructor":{"x":1},
      "setup":{"__proto__":{"polluted":true},"timed":{"__proto__":{"startSec":1}},"rotation":{"__proto__":{"curse":"doom"}},"warlock":{"constructor":1}},
      "script":{"rules":[{"action":"cast","id":"shadow-bolt","__proto__":{"if":"false"}}],"defs":{"__proto__":"true"}}}`;
    const r = parseScenario(text);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const s = r.scenario!;
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
    expect(Object.hasOwn(s, '__proto__')).toBe(false);
    expect(s.setup).toBeUndefined();
    expect(s.script).toEqual({ rules: [{ action: 'cast', id: 'shadow-bolt' }] });
    expect(r.warnings.map((w) => w.path)).toEqual(expect.arrayContaining(['__proto__', 'constructor', 'setup.__proto__']));
  });

  it('non-string text, proxies and throwing getters never throw', () => {
    for (const v of [undefined, null, 5, {}, [], Symbol('x')]) expect(parseScenario(v as never).ok).toBe(false);
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
        ownKeys() {
          throw new Error('boom');
        },
      },
    );
    expect(() => readScenario(hostile)).not.toThrow();
    expect(readScenario(hostile).ok).toBe(false);
    const getter = { ...minimal() };
    Object.defineProperty(getter, 'name', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(parseScenarioValue(getter).ok).toBe(false);
  });

  it('jsonShapeProblem: limits at their edges', () => {
    const nest = (n: number): unknown => (n === 1 ? [] : [nest(n - 1)]);
    expect(jsonShapeProblem(nest(20))).toBeNull();
    expect(jsonShapeProblem(nest(21))).toMatch(/deeper/);
    expect(jsonShapeProblem(new Array(1000).fill(1))).toBeNull();
    expect(jsonShapeProblem(new Array(1001).fill(1))).toMatch(/1000/);
    expect(jsonShapeProblem(Array.from({ length: 60 }, () => new Array(999).fill(1)))).toMatch(/50000 values/);
  });

  it('finishes quickly on the largest inputs', () => {
    const t0 = performance.now();
    parseScenario(' '.repeat(SCENARIO_LIMITS.fileChars));
    parseScenario(JSON.stringify({ ...minimal(), script: { rules: new Array(200).fill({ action: 'cast', id: 'shadow-bolt', if: 'mana < 1 && '.repeat(40) + 'true' }) } }));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('applyScenario', () => {
  const scenario = (): Scenario => parseScenario(JSON.stringify(full()), { db }).scenario!;

  it('without the setup: only the script changes (normalized), the input is not mutated', () => {
    const config = { ...base(), enabledBuffs: ['arcane-brilliance'], distanceYd: 10 };
    const before = structuredClone(config);
    const s = scenario();
    const out = applyScenario(config, s, { includeSetup: false, db });
    expect(config).toEqual(before);
    expect(out).toEqual(normalizeSetup({ ...config, script: s.script }, SETUP_CATALOG, db));
    expect(out.script).toEqual(s.script);
    expect(out.script).not.toBe(s.script);
  });

  it('with the setup: the scenario parts replace the config parts, partial objects key by key, the rest kept', () => {
    const config = {
      ...base(),
      enabledBuffs: ['arcane-brilliance'],
      gear: structuredClone(destructionEquipped),
      gearPresetId: 'author',
      rotation: { ...base().rotation, immolate: false },
      warlock: { armor: 'demon' as const, sacrificeSuccubus: false },
    };
    const s = scenario();
    const out = applyScenario(config, s, { includeSetup: true, db });
    expect(out.enabledBuffs).toEqual(['heroism', 'destruction-potion']);
    expect(out.gear).toEqual(s.setup!.gear);
    expect(out.gearPresetId).toBeUndefined();
    expect(out.talents).toBe(s.setup!.talents);
    expect(out.timed.heroism).toEqual({ startSec: 10, durationSec: 40 });
    expect(out.distanceYd).toBe(20);
    expect(out.fightDurationSec).toBe(90);
    expect(out.warlock).toEqual({ armor: 'fel', sacrificeSuccubus: false });
    expect(out.rotation.curse).toBe('doom');
    expect(out.rotation.immolate).toBe(false);
    expect(out.script).toEqual(s.script);
    expect(normalizeSetup(out, SETUP_CATALOG, db)).toEqual(out);
  });

  it("the author's talents in a scenario give the author's build (no talents field)", () => {
    const s = parseScenario(JSON.stringify({ ...minimal(), setup: { talents: 'my-build' } })).scenario!;
    expect(s.setup!.talents).toBeDefined();
    const out = applyScenario({ ...base(), talents: TALENT_PRESETS[1]!.talents }, s, { includeSetup: true });
    expect(out.talents).toBeUndefined();
  });

  it('a scenario without setup applied with includeSetup changes only the script', () => {
    const s = parseScenario(JSON.stringify(minimal())).scenario!;
    const config = { ...base(), distanceYd: 5 };
    expect(applyScenario(config, s, { includeSetup: true })).toEqual(applyScenario(config, s, { includeSetup: false }));
  });
});
