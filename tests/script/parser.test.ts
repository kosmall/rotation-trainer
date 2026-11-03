// Rotation script expressions: lexer and parser (rotation scripts Task 1). Grammar in
// docs/data-sources.md, "Part J: rotation scripts".

import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/script/lexer';
import { astDepth, parseExpr } from '../../src/script/parser';
import { printExpr } from '../../src/script/printer';
import type { Expr } from '../../src/script/types';
import { SCRIPT_LIMITS } from '../../src/script/types';

const v = (path: string): Expr => ({ kind: 'var', path });
const n = (value: number): Expr => ({ kind: 'num', value });

function ast(text: string): Expr {
  const r = parseExpr(text);
  if (!r.ok) throw new Error(`parse failed for ${JSON.stringify(text)}: ${r.error.pos} ${r.error.message}`);
  return r.ast;
}

function err(text: string) {
  const r = parseExpr(text);
  if (r.ok) throw new Error(`expected an error for ${JSON.stringify(text)}, got ${printExpr(r.ast)}`);
  return r.error;
}

describe('lexer', () => {
  it('reads paths with ids containing - and :, numbers, strings, defs and operators', () => {
    const r = tokenize("self.aura.item-buff:35163:29370.active&&x>=-1.5||$burst!='a\\'b'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => [t.type, t.value, t.pos])).toEqual([
      ['ident', 'self.aura.item-buff:35163:29370.active', 0],
      ['op', '&&', 38],
      ['ident', 'x', 40],
      ['op', '>=', 41],
      ['num', '-1.5', 43],
      ['op', '||', 47],
      ['def', 'burst', 49],
      ['op', '!=', 55],
      ['str', "a'b", 57],
      ['eof', '', 63],
    ]);
  });

  it('rejects unknown characters with their position', () => {
    const r = tokenize('mana > 5 # x');
    expect(r).toEqual({ ok: false, error: { pos: 9, message: "unexpected character '#'" } });
  });
});

describe('parser: literals, paths, calls', () => {
  it('numbers: integers, decimals, negative; -0 is 0', () => {
    expect(ast('5')).toEqual(n(5));
    expect(ast('2.25')).toEqual(n(2.25));
    expect(ast('-3')).toEqual(n(-3));
    expect(ast('-0.5')).toEqual(n(-0.5));
    expect(Object.is((ast('-0') as { value: number }).value, 0)).toBe(true);
  });

  it('strings with escapes, booleans, def references', () => {
    expect(ast("'shadow-bolt'")).toEqual({ kind: 'str', value: 'shadow-bolt' });
    expect(ast("'it\\'s \\\\ ok'")).toEqual({ kind: 'str', value: "it's \\ ok" });
    expect(ast("''")).toEqual({ kind: 'str', value: '' });
    expect(ast('true')).toEqual({ kind: 'bool', value: true });
    expect(ast('false')).toEqual({ kind: 'bool', value: false });
    expect(ast('$burst')).toEqual({ kind: 'def', name: 'burst' });
    expect(ast('$my-def_2')).toEqual({ kind: 'def', name: 'my-def_2' });
  });

  it('identifiers with -, : and digits in id segments', () => {
    expect(ast('target.aura.shadow-vulnerability.active')).toEqual(v('target.aura.shadow-vulnerability.active'));
    expect(ast('use.item:29370.count')).toEqual(v('use.item:29370.count'));
    expect(ast('self.aura.item-buff:35163:29370.remaining')).toEqual(v('self.aura.item-buff:35163:29370.remaining'));
    expect(ast('cd.use-item-29370.ready')).toEqual(v('cd.use-item-29370.ready'));
  });

  it('function calls: fight.last(N) and has(id) (bare or quoted id)', () => {
    expect(ast('fight.last(20)')).toEqual({ kind: 'call', fn: 'fight.last', args: [n(20)] });
    expect(ast('has(shadowburn)')).toEqual({ kind: 'call', fn: 'has', args: [{ kind: 'str', value: 'shadowburn' }] });
    expect(ast("has('item:29370')")).toEqual(ast('has(item:29370)'));
    expect(ast('f(1, 2,3)')).toEqual({ kind: 'call', fn: 'f', args: [n(1), n(2), n(3)] });
    expect(ast('f()')).toEqual({ kind: 'call', fn: 'f', args: [] });
  });

  it('whitespace is free', () => {
    expect(ast(' \t\n( mana\n>\t5 ) ')).toEqual(ast('mana>5'));
  });
});

describe('parser: precedence and associativity', () => {
  it('! binds tighter than comparison, comparison than &&, && than ||', () => {
    expect(ast('a || b && c')).toEqual({ kind: 'or', args: [v('a'), { kind: 'and', args: [v('b'), v('c')] }] });
    expect(ast('a && b || c')).toEqual({ kind: 'or', args: [{ kind: 'and', args: [v('a'), v('b')] }, v('c')] });
    expect(ast('!a == b')).toEqual({ kind: 'cmp', op: '==', left: { kind: 'not', arg: v('a') }, right: v('b') });
    expect(ast('x < 1 && y >= 2')).toEqual({
      kind: 'and',
      args: [
        { kind: 'cmp', op: '<', left: v('x'), right: n(1) },
        { kind: 'cmp', op: '>=', left: v('y'), right: n(2) },
      ],
    });
    expect(ast('!a && !b')).toEqual({ kind: 'and', args: [{ kind: 'not', arg: v('a') }, { kind: 'not', arg: v('b') }] });
    expect(ast('!!a')).toEqual({ kind: 'not', arg: { kind: 'not', arg: v('a') } });
  });

  it('&& and || chains are flat (left-associative, n-ary); parentheses keep their grouping', () => {
    expect(ast('a && b && c')).toEqual({ kind: 'and', args: [v('a'), v('b'), v('c')] });
    expect(ast('a || b || c || d')).toEqual({ kind: 'or', args: [v('a'), v('b'), v('c'), v('d')] });
    expect(ast('(a && b) && c')).toEqual({ kind: 'and', args: [{ kind: 'and', args: [v('a'), v('b')] }, v('c')] });
    expect(ast('a && (b && c)')).toEqual({ kind: 'and', args: [v('a'), { kind: 'and', args: [v('b'), v('c')] }] });
    expect(ast('(a || b) && c')).toEqual({ kind: 'and', args: [{ kind: 'or', args: [v('a'), v('b')] }, v('c')] });
    expect(ast('!(a == b)')).toEqual({ kind: 'not', arg: { kind: 'cmp', op: '==', left: v('a'), right: v('b') } });
    expect(ast('((a))')).toEqual(v('a'));
  });

  it('every comparison operator', () => {
    for (const op of ['==', '!=', '<', '<=', '>', '>='] as const) {
      expect(ast(`mana ${op} 3`)).toEqual({ kind: 'cmp', op, left: v('mana'), right: n(3) });
    }
  });

  it('a long flat chain stays shallow (depth 2)', () => {
    const text = Array.from({ length: 60 }, (_, i) => `x${i}`).join(' && ');
    expect(astDepth(ast(text))).toBe(2);
  });
});

describe('parser: errors with positions', () => {
  const cases: [string, number, string][] = [
    ['', 0, 'empty expression'],
    ['   ', 3, 'empty expression'],
    ['(', 1, 'expected an expression but found end of input'],
    ['(mana > 5', 9, "expected ')' but found end of input"],
    ['mana > 5)', 8, "unexpected ')' after the expression"],
    ['mana >', 6, 'expected an expression but found end of input'],
    ['&& mana', 0, "expected an expression but found '&&'"],
    ['mana && || x', 8, "expected an expression but found '||'"],
    ['mana = 5', 5, "single '=': use '==' to compare"],
    ['a & b', 2, "single '&': use '&&'"],
    ['a | b', 2, "single '|': use '||'"],
    ['a < b < c', 6, "comparisons cannot be chained: use '&&' (a < b && b < c)"],
    ["'abc", 0, 'unterminated string'],
    ["'a\\x'", 2, "invalid escape '\\x' in a string (only \\' and \\\\)"],
    ['1.2.3', 0, "invalid number '1.2.3'"],
    ['5abc', 0, "invalid number '5abc'"],
    ['1.', 0, "invalid number '1.'"],
    ['mana.', 0, "expected a name after '.' in 'mana.'"],
    ['a..b', 0, "expected a name after '.' in 'a.'"],
    ['$', 0, "expected a definition name after '$'"],
    ['$1x', 0, "expected a definition name after '$'"],
    ['f(1,', 4, 'expected an expression but found end of input'],
    ['f(1 2)', 4, "expected ',' or ')' but found '2'"],
    ['mana 5', 5, "unexpected '5' after the expression"],
    ['- 5', 0, "unexpected character '-'"],
    ['ąę > 1', 0, "unexpected character 'ą'"],
    ['__proto__', 0, "unexpected character '_'"],
    ['9999999999999999', 0, 'number out of range (at most 15 digits before the point)'],
    ['()', 1, "expected an expression but found ')'"],
    ['!', 1, 'expected an expression but found end of input'],
  ];
  it(`reports ${cases.length} malformed inputs with position and message`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    for (const [text, pos, message] of cases) {
      expect([text, err(text)]).toEqual([text, { pos, message }]);
    }
  });

  it(`rejects an expression longer than ${SCRIPT_LIMITS.exprLength} characters (and accepts exactly 500)`, () => {
    const chain = (len: number) => {
      let s = 'a';
      while (s.length + 5 <= len) s += ' && a';
      return s.padEnd(len, ' ');
    };
    expect(chain(500)).toHaveLength(500);
    expect(parseExpr(chain(500)).ok).toBe(true);
    expect(err(chain(501))).toEqual({ pos: 500, message: 'expression longer than 500 characters' });
  });

  it('rejects depth 21 and accepts depth 20 (AST depth and nesting of parentheses and !)', () => {
    const nots = (k: number) => `${'!'.repeat(k)}a`;
    expect(astDepth(ast(nots(19)))).toBe(20);
    expect(err(nots(20)).message).toBe('expression nested too deeply (at most 20 levels)');
    const parens = (k: number) => `${'('.repeat(k)}a${')'.repeat(k)}`;
    expect(parseExpr(parens(20)).ok).toBe(true);
    expect(err(parens(21))).toEqual({ pos: 20, message: 'expression nested too deeply (at most 20 levels)' });
    // Alternating && / || through parentheses: each level adds one node.
    let deep = 'a';
    for (let i = 0; i < 19; i++) deep = `(${deep} ${i % 2 ? '&&' : '||'} b)`;
    expect(astDepth(ast(deep))).toBe(20);
    deep = `(${deep} && c) || d`;
    expect(err(deep).message).toBe('expression nested too deeply (at most 20 levels)');
  });

  it('prototype-like names are plain ids and never touch prototypes', () => {
    expect(ast('self.aura.__proto__.active')).toEqual(v('self.aura.__proto__.active'));
    expect(ast('$__proto__')).toEqual({ kind: 'def', name: '__proto__' });
    expect(ast('has(constructor)')).toEqual({ kind: 'call', fn: 'has', args: [{ kind: 'str', value: 'constructor' }] });
    expect(({} as Record<string, unknown>).active).toBeUndefined();
  });
});
