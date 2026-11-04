// Canonical printer (parse(print(x)) deep-equals x on 200 random ASTs) and hostile inputs for the
// parser: never throws, finishes fast, no catastrophic backtracking.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { parseExpr } from '../../src/script/parser';
import { printExpr } from '../../src/script/printer';
import type { CmpOp, Expr } from '../../src/script/types';

const PATHS = [
  'mana',
  'mana.pct',
  'time.elapsed',
  'self.aura.heroism.active',
  'target.aura.shadow-vulnerability.remaining',
  'use.item:29370.count',
  'self.aura.item-buff:35163:29370.stacks',
  'cd.use-item-29370.ready',
  'casting',
  'casting.shadow-bolt',
];
const OPS: CmpOp[] = ['==', '!=', '<', '<=', '>', '>='];
const STRINGS = ['', 'shadow-bolt', "it's", 'a\\b', 'ünï', '  spaced  ', "''"];
const NUMBERS = [0, 1, -1, 2.5, -0.125, 123456789012345, 0.1, 1e-7, 3.000001, 999999999999999.9];

function randomExpr(rng: () => number, depth: number): Expr {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const leaf = depth <= 1 || rng() < 0.3;
  if (leaf) {
    const k = Math.floor(rng() * 6);
    if (k === 0) return { kind: 'bool', value: rng() < 0.5 };
    if (k === 1) return { kind: 'num', value: pick(NUMBERS) };
    if (k === 2) return { kind: 'str', value: pick(STRINGS) };
    if (k === 3) return { kind: 'def', name: pick(['burst', 'a_b', 'x-1', '__proto__']) };
    if (k === 4) return { kind: 'call', fn: 'has', args: [{ kind: 'str', value: pick(['shadowburn', 'item:29370', 'a b', 'true']) }] };
    return { kind: 'var', path: pick(PATHS) };
  }
  const k = Math.floor(rng() * 5);
  if (k === 0) return { kind: 'not', arg: randomExpr(rng, depth - 1) };
  if (k === 1 || k === 2) {
    const count = 2 + Math.floor(rng() * 3);
    return { kind: k === 1 ? 'and' : 'or', args: Array.from({ length: count }, () => randomExpr(rng, depth - 1)) };
  }
  if (k === 3) return { kind: 'cmp', op: pick(OPS), left: randomExpr(rng, depth - 1), right: randomExpr(rng, depth - 1) };
  return { kind: 'call', fn: 'fight.last', args: [randomExpr(rng, depth - 1)] };
}

describe('printer', () => {
  it('prints canonical text', () => {
    const cases: [string, string][] = [
      ['a&&b||!c', 'a && b || !c'],
      ['(a||b)&&c', '(a || b) && c'],
      ['(a&&b)&&c', '(a && b) && c'],
      ['a||(b||c)', 'a || (b || c)'],
      ['!(a<1)', '!(a < 1)'],
      ['(a<1)==(b>2)', '(a < 1) == (b > 2)'],
      ['!a==b', '!a == b'],
      ["has('x y')", "has('x y')"],
      ["has('item:29370')", 'has(item:29370)'],
      ['fight.last( 20 )', 'fight.last(20)'],
      ["casting=='it\\'s'", "casting == 'it\\'s'"],
      ['-0.50', '-0.5'],
      ['0.0000001', '0.0000001'],
      // A variable or true/false as the first argument of an id function is kept apart from a bare id.
      ['minGap((mana.pct), 3)', 'minGap((mana.pct), 3)'],
      ['has((true))', 'has((true))'],
      ['has(true)', 'has(true)'],
    ];
    for (const [text, printed] of cases) {
      const r = parseExpr(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect([text, printExpr(r.ast)]).toEqual([text, printed]);
    }
  });

  it('round trip: a variable or true/false first argument of an id function stays one (not a bare id)', () => {
    const asts: Expr[] = [
      { kind: 'call', fn: 'minGap', args: [{ kind: 'var', path: 'a.b' }, { kind: 'num', value: 100 }] },
      { kind: 'call', fn: 'has', args: [{ kind: 'var', path: 'heroism.active' }] },
      { kind: 'call', fn: 'dotRefreshDue', args: [{ kind: 'bool', value: false }] },
      { kind: 'call', fn: 'manaCost', args: [{ kind: 'bool', value: true }, { kind: 'var', path: 'mana' }] },
    ];
    for (const x of asts) {
      const r = parseExpr(printExpr(x));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.ast).toEqual(x);
    }
  });

  it('round trip: parse(print(x)) deep-equals x for 200 random ASTs', () => {
    const rng = createRng(20261103);
    const next = () => rng.next();
    let maxLen = 0;
    for (let i = 0; i < 200; i++) {
      const x = randomExpr(next, 2 + (i % 6));
      const text = printExpr(x);
      maxLen = Math.max(maxLen, text.length);
      const r = parseExpr(text, { maxLength: Infinity });
      if (!r.ok) throw new Error(`${text}: ${r.error.pos} ${r.error.message}`);
      expect(r.ast).toEqual(x);
      expect(printExpr(r.ast)).toBe(text);
    }
    expect(maxLen).toBeGreaterThan(80);
  });
});

describe('parser on hostile input', () => {
  const big = 10000;
  const hostile: string[] = [
    '('.repeat(big),
    ')'.repeat(big),
    '!'.repeat(big),
    '!'.repeat(big) + 'a',
    `${'('.repeat(big)}a${')'.repeat(big)}`,
    "'".repeat(big),
    `'${'a'.repeat(big)}`,
    `'${'\\'.repeat(big)}`,
    'a'.repeat(big),
    `a${'.b'.repeat(big / 2)}`,
    `a${'.'.repeat(big)}`,
    '-'.repeat(big),
    '-1'.repeat(big / 2),
    '1'.repeat(big),
    `1.${'1'.repeat(big)}`,
    '$'.repeat(big),
    `$${'a'.repeat(big)}`,
    '&&'.repeat(big / 2),
    '||'.repeat(big / 2),
    Array.from({ length: big / 5 }, () => 'a').join(' && '),
    Array.from({ length: big / 5 }, () => 'a').join(' || '),
    Array.from({ length: big / 5 }, () => 'a < b').join(' < '),
    `f(${'1,'.repeat(big / 2)}`,
    `f(${'f('.repeat(big / 2)}`,
    '=='.repeat(big / 2),
    '\u0000'.repeat(big),
    '\uD83D'.repeat(big),
    '😀'.repeat(big / 2),
    ' '.repeat(big),
    '\n\t'.repeat(big / 2),
    `${'a && ('.repeat(big / 6)}b`,
    `has(${'x'.repeat(big)})`,
    '__proto__.'.repeat(big / 10),
    'constructor'.repeat(big / 11),
  ];

  it(`never throws and finishes fast on ${hostile.length} hostile strings of ~10k characters`, () => {
    expect(hostile.length).toBeGreaterThanOrEqual(30);
    const t0 = performance.now();
    for (const text of hostile) {
      for (const maxLength of [undefined, Infinity]) {
        const r = parseExpr(text, maxLength === undefined ? undefined : { maxLength });
        expect(typeof r.ok).toBe('boolean');
        if (!r.ok) {
          expect(r.error.pos).toBeGreaterThanOrEqual(0);
          expect(r.error.pos).toBeLessThanOrEqual(text.length);
          expect(r.error.message.length).toBeGreaterThan(0);
        }
      }
    }
    // Linear-time lexer and bounded recursion: the whole batch (68 parses of ~10k characters,
    // half without the length limit) takes a few ms; a generous bound against backtracking.
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('the default length limit rejects them at once; non-strings never throw', () => {
    for (const text of hostile) {
      if (text.length > 500) expect(parseExpr(text)).toEqual({ ok: false, error: { pos: 500, message: 'expression longer than 500 characters' } });
    }
    for (const junk of [undefined, null, 5, {}, [], { toString: () => 'mana' }] as unknown[]) {
      expect(parseExpr(junk as string)).toEqual({ ok: false, error: { pos: 0, message: 'expression must be a string' } });
    }
  });
});
