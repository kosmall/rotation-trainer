// validateScript: errors (block) vs warnings (the rule stays, maybe inactive), stable messages with
// paths (`rules[2].if`), positions, closest-id suggestions, defs cycles and limits. Never throws.

import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock, DEFAULT_WARLOCK_OPTIONS } from '../../src/data/classes/warlock/destruction';
import type { Script, ScriptContext } from '../../src/script/types';
import { SCRIPT_LIMITS } from '../../src/script/types';
import { closest, levenshtein, validateScript } from '../../src/script/validate';
import { scriptContextOf } from '../../src/script/vars';

const CTX: ScriptContext = {
  spellIds: ['shadow-bolt', 'immolate', 'corruption', 'curse-of-doom', 'life-tap', 'shadowburn', 'incinerate'],
  auraIds: ['heroism', 'shadow-vulnerability', 'immolate', 'corruption', 'curse-of-doom'],
  itemActions: [
    { id: 'item:29370', spellId: 'use-item-29370' },
    { id: 'destruction-potion', spellId: 'use-destruction-potion' },
  ],
  heroismEndMs: 40000,
};

const check = (script: unknown) => validateScript(script as Script, CTX);

describe('levenshtein and closest', () => {
  it('distances and the closest candidate within a sensible distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
    expect(closest('shadow-blot', ['immolate', 'shadow-bolt', 'shadowburn'])).toBe('shadow-bolt');
    expect(closest('xyzzy', ['immolate', 'shadow-bolt'])).toBeUndefined();
    expect(closest('a'.repeat(10000), ['a'])).toBeUndefined();
  });
});

describe('validateScript', () => {
  it('a valid script: no errors, no warnings', () => {
    const script: Script = {
      defs: { burst: 'heroism.active && target.aura.shadow-vulnerability.active' },
      rules: [
        { action: 'use', id: 'item:29370', if: '$burst' },
        { action: 'use', id: 'destruction-potion', if: 'use.item:29370.count >= 1' },
        { action: 'wait', if: "casting == 'immolate'" },
        { action: 'cast', id: 'curse-of-doom', if: '!target.aura.curse-of-doom.active && time.remaining > 60', label: 'Doom' },
        { action: 'cast', id: 'immolate', if: 'target.aura.immolate.remaining < 2 && !casting.immolate' },
        { action: 'cast', id: 'shadowburn', if: 'has(shadowburn) && fight.last(5)', enabled: false, comment: 'finisher' },
        { action: 'cast', id: 'life-tap', if: 'mana.pct < 10' },
        { action: 'cast', id: 'shadow-bolt' },
      ],
    };
    expect(check(script)).toEqual({ errors: [], warnings: [] });
  });

  it('syntax errors carry the path, the position (1-based column in the text) and the message', () => {
    const r = check({ rules: [{ action: 'cast', id: 'shadow-bolt' }, { action: 'cast', id: 'immolate' }, { action: 'cast', id: 'corruption', if: '(mana > 5 && x' }] });
    expect(r.errors).toEqual([{ path: 'rules[2].if', pos: 14, message: "column 15: expected ')' but found end of input" }]);
  });

  it('unknown variables are errors with the closest name suggested', () => {
    const r = check({ rules: [{ action: 'cast', id: 'immolate', if: 'mana.pt < 10 && time.elpased > 1 && foo' }] });
    expect(r.errors).toEqual([
      { path: 'rules[0].if', pos: 0, message: "column 1: unknown variable 'mana.pt'", suggestion: 'mana.pct' },
      { path: 'rules[0].if', pos: 16, message: "column 17: unknown variable 'time.elpased'", suggestion: 'time.elapsed' },
      { path: 'rules[0].if', pos: 36, message: "column 37: unknown variable 'foo'" },
    ]);
    const r2 = check({ rules: [{ action: 'cast', id: 'immolate', if: 'target.aura.immolate.remainig < 2' }] });
    expect(r2.errors).toEqual([
      { path: 'rules[0].if', pos: 0, message: "column 1: unknown field 'remainig' of target.aura.<id> (active, remaining, stacks, charges)", suggestion: 'target.aura.immolate.remaining' },
    ]);
  });

  it('unknown ids are warnings with the closest id suggested (spells, auras, items)', () => {
    const r = check({
      rules: [
        { action: 'cast', id: 'shadow-blot' },
        { action: 'use', id: 'item:29371' },
        { action: 'cast', id: 'immolate', if: 'target.aura.shadow-vulnerabilty.active && cd.shadowbrun.ready && use.destruction-potoin.count < 1' },
        { action: 'cast', id: 'immolate', if: "casting == 'shadowbolt' || has(conflagrat)" },
        { action: 'cast', id: 'use-item-29370' },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { path: 'rules[0].id', message: "unknown spell 'shadow-blot'", suggestion: 'shadow-bolt' },
      { path: 'rules[1].id', message: "item 'item:29371' is not in this setup (not worn or not enabled)", suggestion: 'item:29370' },
      { path: 'rules[2].if', pos: 0, message: "column 1: unknown aura 'shadow-vulnerabilty'", suggestion: 'shadow-vulnerability' },
      { path: 'rules[2].if', pos: 42, message: "column 43: unknown spell 'shadowbrun'", suggestion: 'shadowburn' },
      { path: 'rules[2].if', pos: 65, message: "column 66: item 'destruction-potoin' is not in this setup (not worn or not enabled)", suggestion: 'destruction-potion' },
      { path: 'rules[3].if', pos: 11, message: "column 12: unknown spell 'shadowbolt'", suggestion: 'shadow-bolt' },
      { path: 'rules[3].if', pos: 31, message: "column 32: 'conflagrat' is not a spell or item of this setup: has() is false" },
      { path: 'rules[4].id', message: "'use-item-29370' is an item action: use action 'use'", suggestion: 'item:29370' },
    ]);
  });

  it('type errors: comparing a number with a string, logic on numbers, a non-boolean condition', () => {
    const r = check({
      rules: [
        { action: 'cast', id: 'immolate', if: "cd.immolate.remaining < 'a'" },
        { action: 'cast', id: 'immolate', if: 'mana && heroism.active' },
        { action: 'cast', id: 'immolate', if: 'mana.pct' },
        { action: 'cast', id: 'immolate', if: 'heroism.active == 1' },
        { action: 'cast', id: 'immolate', if: "!casting || fight.last('x') || has(1)" },
      ],
    });
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([
      { path: 'rules[0].if', pos: 22, message: "column 23: '<' needs two numbers, got a number and a string" },
      { path: 'rules[1].if', pos: 0, message: "column 1: '&&' needs true/false values, got a number (write a comparison such as 'mana > 0')" },
      { path: 'rules[2].if', pos: 0, message: 'column 1: a condition must be true/false, got a number' },
      { path: 'rules[3].if', pos: 15, message: "column 16: '==' compares values of the same type, got a true/false value and a number" },
      { path: 'rules[4].if', pos: 0, message: "column 1: '!' needs a true/false value, got a string" },
      { path: 'rules[4].if', pos: 12, message: 'column 13: fight.last(N) needs one number, in seconds' },
      { path: 'rules[4].if', pos: 31, message: "column 32: has(id) needs one id, for example has(shadowburn) or has('item:29370')" },
    ]);
    const bare = check({ rules: [{ action: 'cast', id: 'immolate', if: 'fight.last && self.aura.x' }] });
    expect(bare.errors).toEqual([
      { path: 'rules[0].if', pos: 0, message: "column 1: 'fight.last' is a function: write fight.last(N)" },
      { path: 'rules[0].if', pos: 14, message: "column 15: unknown variable 'self.aura.x' (expected self.aura.<id>.active|remaining|stacks|charges)" },
    ]);
    const field = check({ rules: [{ action: 'cast', id: 'immolate', if: 'cd.immolate.redy' }] });
    expect(field.errors).toEqual([
      { path: 'rules[0].if', pos: 0, message: "column 1: unknown variable 'cd.immolate.redy' (field 'redy': ready, remaining)", suggestion: 'cd.immolate.ready' },
    ]);
    const unknownFn = check({ rules: [{ action: 'cast', id: 'immolate', if: 'fight.lst(5)' }] });
    expect(unknownFn.errors).toEqual([{ path: 'rules[0].if', pos: 0, message: "column 1: unknown function 'fight.lst'", suggestion: 'fight.last' }]);
  });

  it('defs: bad names and syntax (key order), then cycles, then unknown references at the use', () => {
    const r = check({
      defs: { a: '$b && mana > 1', b: '$c', c: '$a', self: '$self', ok: 'heroism.active', 'bad name': 'true', bad: '(' },
      rules: [{ action: 'cast', id: 'immolate', if: '$ok && $a && $nope && $okk' }],
    });
    expect(r.errors).toEqual([
      { path: 'defs.bad name', message: "invalid definition name 'bad name' (letters, digits, '_' and '-', starting with a letter or '_')" },
      { path: 'defs.bad', pos: 1, message: 'column 2: expected an expression but found end of input' },
      { path: 'defs.a', message: 'definition cycle: $a -> $b -> $c -> $a' },
      { path: 'defs.self', message: 'definition cycle: $self -> $self' },
      { path: 'rules[0].if', pos: 13, message: "column 14: unknown definition '$nope'" },
      { path: 'rules[0].if', pos: 22, message: "column 23: unknown definition '$okk'", suggestion: '$ok' },
    ]);
  });

  it('a def used where its type does not fit is a type error at the use', () => {
    const r = check({ defs: { pct: 'mana.pct' }, rules: [{ action: 'cast', id: 'immolate', if: '$pct' }, { action: 'cast', id: 'immolate', if: '$pct < 50' }] });
    expect(r.errors).toEqual([{ path: 'rules[0].if', pos: 0, message: 'column 1: a condition must be true/false, got a number' }]);
  });

  it('rule shape: actions, ids, wait needs an if, field types, unknown fields', () => {
    const r = check({
      rules: [
        { action: 'jump', id: 'x' },
        { action: 'cast' },
        { action: 'wait' },
        { action: 'wait', if: '   ' },
        { action: 'cast', id: 5 },
        { action: 'cast', id: 'immolate', if: 7, label: 3, comment: false, enabled: 'yes' },
        'nope',
        { action: 'cast', id: 'immolate', when: 'x' },
        { action: 'use' },
      ],
    });
    expect(r.errors).toEqual([
      { path: 'rules[0].action', message: "unknown action 'jump' (cast, use or wait)" },
      { path: 'rules[1].id', message: "a 'cast' rule needs an id" },
      { path: 'rules[2].if', message: "a 'wait' rule needs an if (otherwise it would stop the rotation for good)" },
      { path: 'rules[3].if', message: "a 'wait' rule needs an if (otherwise it would stop the rotation for good)" },
      { path: 'rules[4].id', message: 'id must be a string' },
      { path: 'rules[5].if', message: 'if must be a string' },
      { path: 'rules[5].label', message: 'label must be a string' },
      { path: 'rules[5].comment', message: 'comment must be a string' },
      { path: 'rules[5].enabled', message: 'enabled must be true or false' },
      { path: 'rules[6]', message: 'a rule must be an object' },
      { path: 'rules[8].id', message: "a 'use' rule needs an id" },
    ]);
    expect(r.warnings).toEqual([{ path: 'rules[7].when', message: "unknown field 'when' (ignored)" }]);
  });

  it('a blank if means always (cast / use); a disabled rule is still validated', () => {
    expect(check({ rules: [{ action: 'cast', id: 'shadow-bolt', if: '  ' }] })).toEqual({ errors: [], warnings: [] });
    expect(check({ rules: [{ action: 'cast', id: 'shadow-bolt', enabled: false, if: 'mana >' }] }).errors).toEqual([
      { path: 'rules[0].if', pos: 6, message: 'column 7: expected an expression but found end of input' },
    ]);
  });

  it('limits: rules, defs, expression length, label and comment length', () => {
    const many = { rules: Array.from({ length: SCRIPT_LIMITS.rules + 1 }, () => ({ action: 'cast', id: 'shadow-bolt' })) };
    expect(check(many).errors).toEqual([{ path: 'rules', message: 'at most 200 rules (got 201)' }]);
    const defs: Record<string, string> = {};
    for (let i = 0; i <= SCRIPT_LIMITS.defs; i++) defs[`d${i}`] = 'true';
    expect(check({ defs, rules: [] }).errors).toEqual([{ path: 'defs', message: 'at most 50 definitions (got 51)' }]);
    const long = check({ rules: [{ action: 'cast', id: 'shadow-bolt', if: `${'true && '.repeat(70)}true` }] });
    expect(long.errors).toEqual([{ path: 'rules[0].if', pos: 500, message: 'column 501: expression longer than 500 characters' }]);
    const label = check({ rules: [{ action: 'cast', id: 'shadow-bolt', label: 'x'.repeat(SCRIPT_LIMITS.label + 1), comment: 'y'.repeat(SCRIPT_LIMITS.comment + 1) }] });
    expect(label.errors).toEqual([
      { path: 'rules[0].label', message: `label longer than ${SCRIPT_LIMITS.label} characters` },
      { path: 'rules[0].comment', message: `comment longer than ${SCRIPT_LIMITS.comment} characters` },
    ]);
  });

  it('hostile input never throws: garbage, __proto__, getters that throw', () => {
    const evil = JSON.parse('{"rules":[{"action":"cast","id":"__proto__","if":"self.aura.__proto__.active"}],"defs":{"__proto__":"true","constructor":"$__proto__"}}');
    const r = check(evil);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { path: 'rules[0].id', message: "unknown spell '__proto__'" },
      { path: 'rules[0].if', pos: 0, message: "column 1: unknown aura '__proto__'" },
    ]);
    for (const junk of [null, undefined, 5, 'x', [], { rules: 'x' }, { rules: [], defs: [] }, { rules: [], defs: 'x' }]) {
      expect(() => check(junk)).not.toThrow();
      expect(check(junk).errors.length).toBeGreaterThan(0);
    }
    const throwing = { get rules(): never { throw new Error('boom'); } };
    expect(check(throwing)).toEqual({ errors: [{ path: '', message: 'script could not be read' }], warnings: [] });
  });

  it('the context of a real build knows its spells, auras and Heroism', () => {
    const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS);
    const ctx = scriptContextOf(spec, { heroismEndMs: null });
    expect(ctx.spellIds).toContain('shadow-bolt');
    expect(ctx.auraIds).toContain('shadow-vulnerability');
    expect(ctx.heroismEndMs).toBeNull();
    const r = validateScript({ rules: [{ action: 'cast', id: 'immolate', if: 'target.aura.immolate.remaining < 2' }] }, ctx);
    expect(r).toEqual({ errors: [], warnings: [] });
  });
});
