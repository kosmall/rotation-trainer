// Canonical printer of rotation script expressions: single spaces around binary operators, no
// redundant parentheses, numbers without exponent, strings in single quotes with \' and \\
// escaped, the ids of `has` and the other id functions bare when they read as a path (a variable
// or true/false there in parentheses, so it does not read back as a bare id). For every AST the parser can produce,
// parseExpr(printExpr(x)) deep-equals x.

import { PATH_RE } from './lexer';
import { ID_ARG_FUNCTIONS, type Expr } from './types';

/**
 * A finite number in plain decimal (no exponent): JavaScript's shortest round-trip digits, with
 * the exponent form ('1e-7', '1.5e+21') expanded by moving the point.
 */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0';
  const s = String(v);
  const e = s.indexOf('e');
  if (e < 0) return s;
  const sign = s.startsWith('-') ? '-' : '';
  const mantissa = s.slice(sign.length, e);
  const exp = Number(s.slice(e + 1));
  const dot = mantissa.indexOf('.');
  const digits = mantissa.replace('.', '');
  const point = (dot < 0 ? mantissa.length : dot) + exp;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

export function quoteString(v: string): string {
  return `'${v.replace(/[\\']/g, (c) => `\\${c}`)}'`;
}

function wrap(e: Expr, when: boolean): string {
  return when ? `(${printExpr(e)})` : printExpr(e);
}

const isBinary = (e: Expr) => e.kind === 'and' || e.kind === 'or' || e.kind === 'cmp';

export function printExpr(e: Expr): string {
  switch (e.kind) {
    case 'bool':
      return e.value ? 'true' : 'false';
    case 'num':
      return formatNumber(e.value);
    case 'str':
      return quoteString(e.value);
    case 'var':
      return e.path;
    case 'def':
      return `$${e.name}`;
    case 'not':
      return `!${wrap(e.arg, isBinary(e.arg))}`;
    case 'and':
      return e.args.map((a) => wrap(a, a.kind === 'and' || a.kind === 'or')).join(' && ');
    case 'or':
      return e.args.map((a) => wrap(a, a.kind === 'or')).join(' || ');
    case 'cmp':
      return `${wrap(e.left, isBinary(e.left))} ${e.op} ${wrap(e.right, isBinary(e.right))}`;
    case 'call': {
      const idArg = ID_ARG_FUNCTIONS.includes(e.fn);
      const args = e.args.map((a, i) => {
        if (i !== 0 || !idArg) return printExpr(a);
        if (a.kind === 'str' && PATH_RE.test(a.value)) return a.value;
        // A variable or true/false printed bare would read back as a bare id (a string): parenthesised.
        return a.kind === 'var' || a.kind === 'bool' ? `(${printExpr(a)})` : printExpr(a);
      });
      return `${e.fn}(${args.join(', ')})`;
    }
  }
}
