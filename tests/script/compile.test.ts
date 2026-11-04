// The script compiler (Task 2): rules -> priority steps, rules left out with warnings, wait steps,
// the fall-through of rejected presses, the item queue gate, the setup integration and the user's
// trinket example.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import type { EquippedItem, SimSnapshot } from '../../src/engine/types';
import { compileScript } from '../../src/script/compile';
import { normalizeScript } from '../../src/script/normalize';
import type { Script, ScriptContext } from '../../src/script/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../src/setup/defaults';
import { applySetupPreset, SETUP_PRESETS, setupFightKey } from '../../src/setup/presets';
import { loadSetup, saveSetup } from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';
import { prepareRun, runOnce } from '../../src/sim-runner/run';
import { convertToScript } from '../../src/script/convert';
import { applyConfig, newFight } from '../fixtures/script-fights';

const db = itemDbSync();
const base = (): SetupConfig => structuredClone(DEFAULT_SETUP) as SetupConfig;
const withScript = (script: Script, c: SetupConfig = base()): SetupConfig => ({ ...c, script });
const PIPE = 281735;
const ICON = 29370;

function pipeAndIcon(): (EquippedItem | null)[] {
  const gear: (EquippedItem | null)[] = structuredClone(destructionEquipped);
  gear[ITEM_SLOTS.indexOf('trinket1')] = { id: PIPE };
  gear[ITEM_SLOTS.indexOf('trinket2')] = { id: ICON };
  return gear;
}

const CTX: ScriptContext = {
  spellIds: ['shadow-bolt', 'immolate', 'life-tap', 'curse-of-doom'],
  auraIds: ['immolate', 'heroism', 'curse-of-doom'],
  itemActions: [{ id: 'item:29370', spellId: 'use-item-29370', cooldownMs: 120000 }],
  heroismEndMs: null,
  names: { 'shadow-bolt': 'Shadow Bolt', 'item:29370': 'Icon of the Silver Crescent' },
};

function snap(p: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    nowMs: 10000,
    phase: 'running',
    durationMs: 60000,
    gcdEndsAtMs: 0,
    cast: null,
    mana: 5000,
    maxMana: 10000,
    cooldownRemainingMs: {},
    spells: {},
    gcdMs: 1500,
    targetAuras: {},
    selfAuras: {},
    damageTotal: 0,
    dps: 0,
    queuedSpellId: null,
    inFlight: [],
    castCounts: {},
    useCounts: {},
    ...p,
  };
}

/** The accepted presses of a fight: [time, spell id]. */
function presses(config: SetupConfig, seed = 1, window = 400) {
  const applied = applyConfig(config, db);
  const { sim } = newFight(applied, seed, window);
  const out: { atMs: number; id: string; s: SimSnapshot }[] = [];
  const cast = sim.cast.bind(sim);
  sim.cast = (id: string) => {
    const before = sim.snapshot();
    const r = cast(id);
    if (r.ok) out.push({ atMs: before.nowMs, id, s: before });
    return r;
  };
  runBot(sim, applied.spec.priority);
  return { applied, out, log: sim.log() };
}

describe('compileScript', () => {
  it('one step per rule in order: kinds, ids, labels (given, else the name, else the id), hints and keys', () => {
    const r = compileScript(
      {
        rules: [
          { action: 'use', id: 'item:29370', if: 'heroism.active' },
          { action: 'wait', if: 'time.elapsed < 2', comment: 'hold' },
          { action: 'cast', id: 'immolate', if: '!target.aura.immolate.active', label: 'Keep Immolate' },
          { action: 'cast', id: 'shadow-bolt' },
          { action: 'cast', id: 'life-tap', if: '  ' },
        ],
      },
      CTX,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.steps.map((s) => [s.kind, s.spellId, s.label, s.hint, s.key])).toEqual([
      ['use', 'use-item-29370', 'Icon of the Silver Crescent', 'If heroism.active', 'rules[0]'],
      ['wait', '', 'Wait', 'hold', 'rules[1]'],
      ['cast', 'immolate', 'Keep Immolate', 'If !target.aura.immolate.active', 'rules[2]'],
      ['cast', 'shadow-bolt', 'Shadow Bolt', 'Always', 'rules[3]'],
      ['cast', 'life-tap', 'life-tap', 'Always', 'rules[4]'],
    ]);
    expect(r.keys).toEqual(['rules[0]', 'rules[1]', 'rules[2]', 'rules[3]', 'rules[4]']);
    expect(r.steps[3]!.when).toBeUndefined();
    expect(r.steps[4]!.when).toBeUndefined();
    expect(r.steps[2]!.when!(snap())).toBe(true);
    expect(r.steps[2]!.when!(snap({ targetAuras: { immolate: { auraId: 'immolate', stacks: 1, charges: 0, remainingMs: 5 } } }))).toBe(false);
  });

  it('a use step has the item queue gate: never in place of a queued spell (no cast, nothing queued, or itself queued)', () => {
    const [always, withCond] = compileScript(
      { rules: [{ action: 'use', id: 'item:29370' }, { action: 'use', id: 'use-item-29370', if: 'mana > 0' }] },
      CTX,
    ).steps;
    const casting = { spellId: 'shadow-bolt', startMs: 9000, endMs: 11000 };
    for (const step of [always!, withCond!]) {
      expect(step.spellId).toBe('use-item-29370');
      expect(step.when!(snap())).toBe(true);
      expect(step.when!(snap({ cast: casting }))).toBe(true);
      expect(step.when!(snap({ cast: casting, queuedSpellId: 'shadow-bolt' }))).toBe(false);
      expect(step.when!(snap({ cast: casting, queuedSpellId: 'use-item-29370' }))).toBe(true);
      expect(step.when!(snap({ queuedSpellId: 'shadow-bolt' }))).toBe(true);
    }
    expect(withCond!.when!(snap({ mana: 0 }))).toBe(false);
  });

  it('rules left out, each with a warning: disabled, unknown ids (id or if, defs too), errors; has() of an absent id is fine', () => {
    const r = compileScript(
      {
        defs: { bad: 'target.aura.nope.active', good: 'mana > 10', usesBad: '$bad || $good', broken: 'mana >' },
        rules: [
          { action: 'cast', id: 'shadow-bolt', enabled: false },
          { action: 'cast', id: 'shadow-blot' },
          { action: 'use', id: 'item:12345' },
          { action: 'cast', id: 'use-item-29370' },
          { action: 'cast', id: 'immolate', if: '!target.aura.immolat.active' },
          { action: 'cast', id: 'immolate', if: '$usesBad' },
          { action: 'cast', id: 'immolate', if: '$broken' },
          { action: 'cast', id: 'immolate', if: 'mana >' },
          { action: 'wait' },
          { action: 'cast', id: 'immolate', if: 'cd.no-such.ready' },
          { action: 'cast', id: 'life-tap', if: '!has(shadowburn) && $good', bogus: 1 } as never,
          { action: 'cast', id: 'shadow-bolt', enabled: true },
        ],
      },
      CTX,
    );
    expect(r.steps.map((s) => s.key)).toEqual(['rules[10]', 'rules[11]']);
    const leftOut = r.warnings.filter((w) => w.message.startsWith('rule left out')).map((w) => [w.path, w.message]);
    expect(leftOut).toEqual([
      ['rules[0]', 'rule left out: disabled'],
      ['rules[1]', 'rule left out: it names an id this setup does not have (see the warnings above)'],
      ['rules[2]', 'rule left out: it names an id this setup does not have (see the warnings above)'],
      ['rules[3]', 'rule left out: it names an id this setup does not have (see the warnings above)'],
      ['rules[4]', 'rule left out: it names an id this setup does not have (see the warnings above)'],
      ['rules[5]', 'rule left out: it uses a definition with errors or unknown ids'],
      ['rules[6]', 'rule left out: it uses a definition with errors or unknown ids'],
      ['rules[7]', 'rule left out: it has errors'],
      ['rules[8]', 'rule left out: it has errors'],
      ['rules[9]', 'rule left out: it names an id this setup does not have (see the warnings above)'],
    ]);
    // The validation warnings come first, with their suggestions.
    expect(r.warnings.find((w) => w.path === 'rules[1].id')).toMatchObject({ suggestion: 'shadow-bolt' });
    expect(r.warnings.some((w) => w.path === 'rules[10].if' && /has\(\) is false/.test(w.message))).toBe(true);
    expect(r.errors.map((e) => e.path)).toEqual(['defs.broken', 'rules[7].if', 'rules[8].if']);
    // has(shadowburn) is false in this context: !has(...) && mana > 10.
    expect(r.steps[0]!.when!(snap({ mana: 11 }))).toBe(true);
  });

  it('never throws on hostile input; nothing to press is reported', () => {
    for (const v of [null, 3, 'x', [], { rules: 'x' }, { rules: [null, 1, 'a', { action: 'cast' }] }, { rules: [], defs: { __proto__: 'x' } }]) {
      const r = compileScript(v, CTX);
      expect(r.steps).toEqual([]);
    }
    expect(compileScript({ rules: [{ action: 'wait', if: 'true' }] }, CTX).warnings.at(-1)).toEqual({
      path: 'rules',
      message: 'no cast or use rule is active: the bot has nothing to press',
    });
    const many = { rules: Array.from({ length: 5000 }, () => ({ action: 'cast', id: 'shadow-bolt', if: 'mana > 1' })) };
    const r = compileScript(many, CTX);
    expect(r.steps).toHaveLength(200);
    expect(r.errors[0]).toMatchObject({ path: 'rules' });
  });

  it('rules past the reported-issue cap (200 of each kind) are still left out for their errors and unknown ids', () => {
    // Each of the first rules has 60 errors (unknown variables) or 20 warnings (unknown auras), so
    // the issue lists fill up before the later rules are read.
    const manyErrors = Array.from({ length: 60 }, (_, i) => `x${i}`).join(' && ');
    const warnHeavy = Array.from({ length: 20 }, (_, i) => `self.aura.z${i}.active`).join(' || ');
    const script = {
      rules: [
        ...Array.from({ length: 4 }, () => ({ action: 'cast', id: 'immolate', if: manyErrors })),
        ...Array.from({ length: 12 }, () => ({ action: 'cast', id: 'life-tap', if: warnHeavy })),
        { action: 'wait' },
        { action: 'cast', id: 'no-such-spell' },
        { action: 'cast', id: 'life-tap', if: 'target.aura.nope.active || true' },
        { action: 'cast', id: 'shadow-bolt' },
      ],
    };
    expect(manyErrors.length).toBeLessThanOrEqual(500);
    expect(warnHeavy.length).toBeLessThanOrEqual(500);
    const r = compileScript(script, CTX);
    expect(r.errors).toHaveLength(200);
    expect(r.warnings.filter((w) => !w.message.startsWith('rule left out')).length).toBe(200);
    expect(r.steps.map((s) => [s.key, s.kind, s.spellId])).toEqual([['rules[19]', 'cast', 'shadow-bolt']]);
    for (const i of [16, 17, 18]) expect(r.warnings.some((w) => w.path === `rules[${i}]` && w.message.startsWith('rule left out'))).toBe(true);
  });
});

describe('the bot plays compiled scripts', () => {
  it('a wait step holds every lower rule while its condition holds (not in the ready phase)', () => {
    const { out } = presses(
      withScript({
        rules: [
          { action: 'wait', if: 'time.elapsed < 5' },
          { action: 'cast', id: 'shadow-bolt' },
        ],
      }),
    );
    // The pull is not held (the fight starts with the first press); then nothing until 5 s.
    expect(out[0]).toMatchObject({ atMs: 0, id: 'shadow-bolt' });
    expect(out[1]!.atMs).toBeGreaterThanOrEqual(5000 - 400);
    expect(out[1]!.atMs).toBeLessThan(5100);
    expect(out.slice(1).every((p) => p.atMs >= 5000 - 400)).toBe(true);
  });

  it('a wait step does not hold the rules above it', () => {
    const { out } = presses(
      withScript({
        rules: [
          { action: 'cast', id: 'life-tap', if: 'time.elapsed >= 1 && cast.life-tap.count == 0' },
          { action: 'wait', if: 'time.elapsed < 8' },
          { action: 'cast', id: 'shadow-bolt' },
        ],
      }),
    );
    expect(out.map((p) => p.id).slice(0, 3)).toEqual(['shadow-bolt', 'life-tap', 'shadow-bolt']);
    expect(out[1]!.atMs).toBeGreaterThanOrEqual(1000);
    expect(out[2]!.atMs).toBeGreaterThanOrEqual(8000 - 400);
  });

  it('a press the engine rejects falls through to the next rule (Curse of Doom on cooldown, then Shadow Bolt)', () => {
    const { out } = presses(
      withScript({ rules: [{ action: 'cast', id: 'curse-of-doom' }, { action: 'cast', id: 'life-tap', if: 'mana < 500' }, { action: 'cast', id: 'shadow-bolt' }] }),
    );
    expect(out[0]).toMatchObject({ atMs: 0, id: 'curse-of-doom' });
    expect(out.filter((p) => p.id === 'curse-of-doom')).toHaveLength(1);
    expect(out.filter((p) => p.id === 'shadow-bolt').length).toBeGreaterThan(15);
  });

  it("the user's example: trinket 1 only with Heroism and Improved Shadow Bolt up, trinket 2 only after it (both worn, NOT enabled: ruling T-1)", () => {
    const config: SetupConfig = {
      ...base(),
      gear: pipeAndIcon(),
      enabledBuffs: ['heroism'],
      timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec: 10, durationSec: 40 } },
      fightDurationSec: 90,
      script: {
        rules: [
          { action: 'use', id: `item:${PIPE}`, if: 'heroism.active && target.aura.shadow-vulnerability.active' },
          { action: 'use', id: `item:${ICON}`, if: `use.item:${PIPE}.count >= 1` },
          { action: 'cast', id: 'curse-of-the-elements', if: '!target.aura.curse-of-the-elements.active' },
          { action: 'cast', id: 'life-tap', if: 'mana < manaCost(shadow-bolt)' },
          { action: 'cast', id: 'shadow-bolt' },
        ],
      },
    };
    for (const seed of [1, 2, 3, 4, 5]) {
      const { applied, out } = presses(config, seed);
      expect(applied.script.active).toBe(true);
      expect(applied.script.warnings).toEqual([]);
      expect(applied.script.context.itemActions.map((a) => a.id)).toEqual([`item:${PIPE}`, `item:${ICON}`]);
      // Not enabled: the basic rotation would never use them.
      expect(applied.basic.steps.some((s) => s.spellId.startsWith('use-item'))).toBe(false);
      const pipe = out.filter((p) => p.id === `use-item-${PIPE}`);
      const icon = out.filter((p) => p.id === `use-item-${ICON}`);
      expect(pipe).toHaveLength(1);
      expect(pipe[0]!.s.selfAuras['heroism']).toBeDefined();
      expect(pipe[0]!.s.targetAuras['shadow-vulnerability']).toBeDefined();
      expect(pipe[0]!.atMs).toBeGreaterThanOrEqual(10000);
      expect(icon).toHaveLength(1);
      expect(icon[0]!.atMs).toBeGreaterThan(pipe[0]!.atMs);
      expect(icon[0]!.s.useCounts[`use-item-${PIPE}`]).toBe(1);
    }
  });
});

describe('SetupConfig.script', () => {
  const script: Script = {
    rules: [
      { action: 'cast', id: 'curse-of-doom', if: '!target.aura.curse-of-doom.active', label: 'Doom', comment: 'pull' },
      { action: 'cast', id: 'shadow-bolt', enabled: true },
    ],
    defs: { low: 'mana < 500' },
  };

  it('normalizeSetup: absent stays absent, a valid script is kept as is, garbage is dropped; idempotent', () => {
    expect(normalizeSetup(base(), SETUP_CATALOG)).not.toHaveProperty('script');
    expect(normalizeSetup(withScript(script), SETUP_CATALOG).script).toEqual(script);
    for (const v of [null, 1, 'x', [], {}, { rules: [] }, { rules: [{ action: 'jump' }] }, { defs: { '9x': 'a' } }]) {
      expect(normalizeSetup({ ...base(), script: v } as never, SETUP_CATALOG)).not.toHaveProperty('script');
    }
    const n1 = normalizeSetup({ ...base(), script: { rules: [{ action: 'wait' }], defs: { only: 'true' } } } as never, SETUP_CATALOG);
    expect(n1.script).toEqual({ rules: [{ action: 'wait' }], defs: { only: 'true' } });
    expect(normalizeSetup(n1, SETUP_CATALOG)).toEqual(n1);
  });

  it('normalizeScript: limits and hostile input', () => {
    const hostile = JSON.parse(
      JSON.stringify({
        rules: [
          ...Array.from({ length: 300 }, (_, i) => ({ action: 'cast', id: 'shadow-bolt', if: `mana > ${i}`, extra: 1 })),
        ],
        defs: { __proto__x: 'a', ok: 'true', 'bad name': 'x', long: 'x'.repeat(501) },
      }).replace('"__proto__x"', '"__proto__"'),
    );
    const n = normalizeScript(hostile)!;
    expect(n.rules).toHaveLength(200);
    expect(n.rules[0]).toEqual({ action: 'cast', id: 'shadow-bolt', if: 'mana > 0' });
    expect(Object.getPrototypeOf(n.defs)).toBe(Object.prototype);
    expect(n.defs).toEqual({ ok: 'true' });
    const rules = normalizeScript({
      rules: [
        { action: 'cast', id: 'x'.repeat(129) },
        { action: 'cast', id: 3 },
        { action: 'cast', id: 'a', if: 'x'.repeat(501) },
        { action: 'cast', id: 'a', if: 7 },
        { action: 'use', id: 'item:1', label: 'L'.repeat(150), comment: 'C'.repeat(1500), enabled: 'yes' },
        { action: 'wait', if: 'true', enabled: false },
      ],
    })!.rules;
    expect(rules).toEqual([
      { action: 'use', id: 'item:1', label: 'L'.repeat(100), comment: 'C'.repeat(1000) },
      { action: 'wait', if: 'true', enabled: false },
    ]);
    expect(normalizeScript({ rules: [] })).toBeUndefined();
    expect(normalizeScript(normalizeScript(hostile))).toEqual(normalizeScript(hostile));
    const throwing = new Proxy({}, { get: () => { throw new Error('x'); }, ownKeys: () => { throw new Error('y'); } });
    expect(normalizeScript(throwing)).toBeUndefined();
    expect(normalizeScript({ rules: throwing })).toBeUndefined();
  });

  it('applySetup: a script with rules replaces the priority; the basic rotation is still built but not played', () => {
    const plain = applyConfig(base(), db);
    expect(plain.script.active).toBe(false);
    expect(plain.spec.priority).toBe(plain.basic.steps);
    const scripted = applyConfig(withScript(script), db);
    expect(scripted.script.active).toBe(true);
    expect(scripted.spec.priority.map((s) => [s.spellId, s.label, s.hint])).toEqual([
      ['curse-of-doom', 'Doom', 'pull'],
      ['shadow-bolt', 'Shadow Bolt', 'Always'],
    ]);
    expect(scripted.script.keys).toEqual(['rules[0]', 'rules[1]']);
    expect(scripted.basic.steps.map((s) => s.spellId)).toEqual(plain.basic.steps.map((s) => s.spellId));
    // Defs only: not active.
    const defsOnly = applyConfig({ ...base(), script: { rules: [], defs: { a: 'true' } } }, db);
    expect(defsOnly.script.active).toBe(false);
    // The context: the author's Icon is worn (bound, not enabled), the rotation facts are there.
    expect(plain.script.context.itemActions).toEqual([{ id: 'item:29370', spellId: 'use-item-29370', cooldownMs: 120000 }]);
    expect(plain.script.context.rotation!.finisherWindowMs).toBe(3900);
    expect(plain.script.context.names!['item:29370']).toBe('Icon of the Silver Crescent');
    // Unknown ids are reported on the applied setup.
    const typo = applyConfig(withScript({ rules: [{ action: 'cast', id: 'shadow-blot' }, { action: 'cast', id: 'shadow-bolt' }] }), db);
    expect(typo.spec.priority.map((s) => s.spellId)).toEqual(['shadow-bolt']);
    expect(typo.script.warnings.map((w) => w.path)).toEqual(['rules[0].id', 'rules[0]']);
  });

  it('preset matching: a config with a script is never a preset; choosing a preset drops the script; storage keeps it', () => {
    const none = SETUP_PRESETS.none.config;
    expect(setupFightKey(withScript(script), SETUP_CATALOG)).not.toBe(setupFightKey(base(), SETUP_CATALOG));
    expect(setupFightKey(base(), SETUP_CATALOG)).toBe(setupFightKey(applySetupPreset(none, base()), SETUP_CATALOG));
    expect(applySetupPreset(none, withScript(script))).not.toHaveProperty('script');
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(saveSetup(storage, withScript(script))).toBe(true);
    expect(loadSetup(storage, SETUP_CATALOG).script).toEqual(script);
  });

  it('the simulator passes the script through (prepareRun normalizes and applies it): the converted default plays the default runs', () => {
    const plain = prepareRun({ setup: base(), runs: 5, seed: 9, spellQueueWindowMs: 400 } as never);
    const script = convertToScript(base(), plain.fight.basic);
    const scripted = prepareRun({ setup: withScript(script), runs: 5, seed: 9, spellQueueWindowMs: 400 } as never);
    expect(scripted.config.script).toEqual(script);
    expect(scripted.fight.script.active).toBe(true);
    for (let i = 0; i < 5; i++) expect(runOnce(scripted, i)).toEqual(runOnce(plain, i));
    const sbOnly = prepareRun({ setup: withScript({ rules: [{ action: 'cast', id: 'shadow-bolt' }] }), runs: 1, seed: 9, spellQueueWindowMs: 400 } as never);
    expect(runOnce(sbOnly, 0).dps).not.toBe(runOnce(plain, 0).dps);
  });
});
