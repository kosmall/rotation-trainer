// Recursive-descent parser of rotation script expressions. Precedence (tightest first): `!`,
// comparisons (not chainable), `&&`, `||`; `&&` / `||` chains are flat n-ary nodes. Recursion is
// bounded by the nesting limit (parentheses, `!`, call arguments), so hostile input can never
// overflow the stack; the work is linear in the text. Never throws. EBNF: docs/data-sources.md,
// Part J.

import { tokenize, type Token } from './lexer';
import { ID_ARG_FUNCTIONS, SCRIPT_LIMITS, type CmpOp, type Expr } from './types';

export type ParseResult = { ok: true; ast: Expr } | { ok: false; error: { pos: number; message: string } };

export interface ParseOptions {
  /** Longest accepted text (default `SCRIPT_LIMITS.exprLength`); tests pass Infinity. */
  maxLength?: number;
}

const positions = new WeakMap<Expr, number>();

/** The 0-based offset where `node` starts in the text it was parsed from (0 when unknown). */
export function positionOf(node: Expr): number {
  return positions.get(node) ?? 0;
}

/** AST depth: a leaf is 1, every operator or call adds 1 over its deepest child. */
export function astDepth(e: Expr): number {
  switch (e.kind) {
    case 'not':
      return 1 + astDepth(e.arg);
    case 'and':
    case 'or':
    case 'call': {
      let d = 0;
      for (const a of e.args) d = Math.max(d, astDepth(a));
      return 1 + d;
    }
    case 'cmp':
      return 1 + Math.max(astDepth(e.left), astDepth(e.right));
    default:
      return 1;
  }
}

const CMP_OPS: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>=']);
const TOO_DEEP = `expression nested too deeply (at most ${SCRIPT_LIMITS.depth} levels)`;

class ParseError {
  constructor(
    readonly pos: number,
    readonly message: string,
  ) {}
}

function describe(t: Token): string {
  if (t.type === 'eof') return 'end of input';
  if (t.type === 'str') return 'a string';
  if (t.type === 'def') return `'$${t.value}'`;
  const v = t.value.length > 40 ? `${t.value.slice(0, 40)}...` : t.value;
  return `'${v}'`;
}

class Parser {
  private i = 0;
  private nesting = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }
  private next(): Token {
    const t = this.tokens[this.i]!;
    if (t.type !== 'eof') this.i++;
    return t;
  }
  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }
  private at<T extends Expr>(node: T, pos: number): T {
    positions.set(node, pos);
    return node;
  }
  private enter(pos: number): void {
    if (++this.nesting > SCRIPT_LIMITS.depth) throw new ParseError(pos, TOO_DEEP);
  }

  parseTop(): Expr {
    if (this.peek().type === 'eof') throw new ParseError(this.peek().pos, 'empty expression');
    const e = this.parseOr();
    const t = this.peek();
    if (t.type !== 'eof') throw new ParseError(t.pos, `unexpected ${describe(t)} after the expression`);
    return e;
  }

  private parseOr(): Expr {
    const start = this.peek().pos;
    const first = this.parseAnd();
    if (!this.isOp('||')) return first;
    const args = [first];
    while (this.isOp('||')) {
      this.next();
      args.push(this.parseAnd());
    }
    return this.at({ kind: 'or', args }, start);
  }

  private parseAnd(): Expr {
    const start = this.peek().pos;
    const first = this.parseCmp();
    if (!this.isOp('&&')) return first;
    const args = [first];
    while (this.isOp('&&')) {
      this.next();
      args.push(this.parseCmp());
    }
    return this.at({ kind: 'and', args }, start);
  }

  private parseCmp(): Expr {
    const left = this.parseUnary();
    const t = this.peek();
    if (t.type !== 'op' || !CMP_OPS.has(t.value)) return left;
    this.next();
    const right = this.parseUnary();
    const again = this.peek();
    if (again.type === 'op' && CMP_OPS.has(again.value)) {
      throw new ParseError(again.pos, "comparisons cannot be chained: use '&&' (a < b && b < c)");
    }
    const node: Expr = { kind: 'cmp', op: t.value as CmpOp, left, right };
    // A comparison's position is its operator (type errors point at it).
    return this.at(node, t.pos);
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === 'op' && t.value === '!') {
      this.next();
      this.enter(t.pos);
      const arg = this.parseUnary();
      this.nesting--;
      return this.at({ kind: 'not', arg }, t.pos);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.next();
    switch (t.type) {
      case 'num': {
        const value = Number(t.value);
        return this.at({ kind: 'num', value: value === 0 ? 0 : value }, t.pos);
      }
      case 'str':
        return this.at({ kind: 'str', value: t.value }, t.pos);
      case 'def':
        return this.at({ kind: 'def', name: t.value }, t.pos);
      case 'lparen': {
        this.enter(t.pos);
        const e = this.parseOr();
        this.expect('rparen', "')'");
        this.nesting--;
        return e;
      }
      case 'ident': {
        if (this.peek().type === 'lparen') return this.parseCall(t);
        if (t.value === 'true' || t.value === 'false') return this.at({ kind: 'bool', value: t.value === 'true' }, t.pos);
        return this.at({ kind: 'var', path: t.value }, t.pos);
      }
      default:
        throw new ParseError(t.pos, `expected an expression but found ${describe(t)}`);
    }
  }

  private parseCall(name: Token): Expr {
    const open = this.next();
    this.enter(open.pos);
    const args: Expr[] = [];
    if (this.peek().type !== 'rparen') {
      for (;;) {
        args.push(this.parseArg(name.value, args.length));
        const t = this.peek();
        if (t.type === 'comma') {
          this.next();
          continue;
        }
        if (t.type === 'rparen') break;
        throw new ParseError(t.pos, `expected ',' or ')' but found ${describe(t)}`);
      }
    }
    this.next();
    this.nesting--;
    return this.at({ kind: 'call', fn: name.value, args }, name.pos);
  }

  /** A call argument; the first argument of an id function (`ID_ARG_FUNCTIONS`) is a string when it is a bare id (a path followed by ',' or ')'). */
  private parseArg(fn: string, index: number): Expr {
    const t = this.peek();
    const after = this.tokens[this.i + 1];
    if (index === 0 && ID_ARG_FUNCTIONS.includes(fn) && t.type === 'ident' && after !== undefined && (after.type === 'rparen' || after.type === 'comma')) {
      this.next();
      return this.at({ kind: 'str', value: t.value }, t.pos);
    }
    return this.parseOr();
  }

  private expect(type: Token['type'], what: string): void {
    const t = this.peek();
    if (t.type !== type) throw new ParseError(t.pos, `expected ${what} but found ${describe(t)}`);
    this.next();
  }
}

/**
 * Parses one expression. Errors: `{ pos (0-based offset), message }`; the text must be a string
 * of at most `maxLength` characters, the AST at most `SCRIPT_LIMITS.depth` deep. Never throws.
 */
export function parseExpr(text: string, options?: ParseOptions): ParseResult {
  if (typeof text !== 'string') return { ok: false, error: { pos: 0, message: 'expression must be a string' } };
  const maxLength = options?.maxLength ?? SCRIPT_LIMITS.exprLength;
  if (text.length > maxLength) {
    return { ok: false, error: { pos: maxLength, message: `expression longer than ${maxLength} characters` } };
  }
  const lexed = tokenize(text);
  if (!lexed.ok) return lexed;
  try {
    const ast = new Parser(lexed.tokens).parseTop();
    if (astDepth(ast) > SCRIPT_LIMITS.depth) return { ok: false, error: { pos: 0, message: TOO_DEEP } };
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: { pos: e.pos, message: e.message } };
    return { ok: false, error: { pos: 0, message: 'expression could not be parsed' } };
  }
}
