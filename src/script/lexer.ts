// Lexer of rotation script expressions (grammar: docs/data-sources.md, Part J). One pass, linear
// in the text, no regex backtracking on the input; never throws.

export type TokenType = 'num' | 'str' | 'ident' | 'def' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  type: TokenType;
  /** num: the literal text; str: the unescaped value; ident: the whole dotted path; def: the name without `$`; op: the operator. */
  value: string;
  /** 0-based offset of the token's first character. */
  pos: number;
}

export type LexResult = { ok: true; tokens: Token[] } | { ok: false; error: { pos: number; message: string } };

/** Most digits before the point: keeps every literal exact and printable without an exponent. */
export const MAX_INT_DIGITS = 15;

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isDigit = (c: string) => c >= '0' && c <= '9';
/** Characters inside an id segment: letters, digits, `_`, `-`, `:`. */
const isSegChar = (c: string) => isLetter(c) || isDigit(c) || c === '_' || c === '-' || c === ':';
const isDefChar = (c: string) => isLetter(c) || isDigit(c) || c === '_' || c === '-';
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** A path as the lexer reads it: the first segment starts with a letter. */
export const PATH_RE = /^[A-Za-z][A-Za-z0-9_:-]*(\.[A-Za-z0-9_:-]+)*$/;
/** A def name (`$name`). */
export const DEF_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBER_RE = /^-?[0-9]+(\.[0-9]+)?$/;

/** A character for an error message (a lone surrogate or control character as an escape). */
function shown(c: string): string {
  const code = c.charCodeAt(0);
  return code < 0x20 || (code >= 0xd800 && code <= 0xdfff) ? `\\u${code.toString(16).padStart(4, '0')}` : c;
}

export function tokenize(text: string): LexResult {
  const tokens: Token[] = [];
  const n = text.length;
  let i = 0;
  const fail = (pos: number, message: string): LexResult => ({ ok: false, error: { pos, message } });
  while (i < n) {
    const c = text[i]!;
    if (isSpace(c)) {
      i++;
      continue;
    }
    const start = i;
    if (isLetter(c)) {
      // A dotted path: segment ('.' segment)*. Ids never contain '.', so dots only split segments.
      i++;
      while (i < n && isSegChar(text[i]!)) i++;
      while (i < n && text[i] === '.') {
        if (i + 1 >= n || !isSegChar(text[i + 1]!)) return fail(start, `expected a name after '.' in '${text.slice(start, i + 1)}'`);
        i++;
        while (i < n && isSegChar(text[i]!)) i++;
      }
      tokens.push({ type: 'ident', value: text.slice(start, i), pos: start });
      continue;
    }
    if (isDigit(c) || (c === '-' && i + 1 < n && isDigit(text[i + 1]!))) {
      // Greedy over number-like characters, then checked as a whole ('5abc', '1.2.3' are errors).
      i++;
      while (i < n && (isSegChar(text[i]!) || text[i] === '.')) i++;
      const lit = text.slice(start, i);
      if (!NUMBER_RE.test(lit)) return fail(start, `invalid number '${lit.length > 40 ? `${lit.slice(0, 40)}...` : lit}'`);
      const intDigits = lit.replace('-', '').split('.')[0]!.length;
      if (intDigits > MAX_INT_DIGITS) return fail(start, `number out of range (at most ${MAX_INT_DIGITS} digits before the point)`);
      tokens.push({ type: 'num', value: lit, pos: start });
      continue;
    }
    if (c === "'") {
      let value = '';
      i++;
      let closed = false;
      while (i < n) {
        const d = text[i]!;
        if (d === "'") {
          closed = true;
          i++;
          break;
        }
        if (d === '\\') {
          const e = text[i + 1];
          if (e === "'" || e === '\\') {
            value += e;
            i += 2;
            continue;
          }
          if (e === undefined) break;
          return fail(i, `invalid escape '\\${shown(e)}' in a string (only \\' and \\\\)`);
        }
        value += d;
        i++;
      }
      if (!closed) return fail(start, 'unterminated string');
      tokens.push({ type: 'str', value, pos: start });
      continue;
    }
    if (c === '$') {
      i++;
      if (i >= n || !(isLetter(text[i]!) || text[i] === '_')) return fail(start, "expected a definition name after '$'");
      while (i < n && isDefChar(text[i]!)) i++;
      tokens.push({ type: 'def', value: text.slice(start + 1, i), pos: start });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', value: two, pos: start });
      i += 2;
      continue;
    }
    switch (c) {
      case '!':
      case '<':
      case '>':
        tokens.push({ type: 'op', value: c, pos: start });
        i++;
        continue;
      case '(':
        tokens.push({ type: 'lparen', value: c, pos: start });
        i++;
        continue;
      case ')':
        tokens.push({ type: 'rparen', value: c, pos: start });
        i++;
        continue;
      case ',':
        tokens.push({ type: 'comma', value: c, pos: start });
        i++;
        continue;
      case '=':
        return fail(start, "single '=': use '==' to compare");
      case '&':
        return fail(start, "single '&': use '&&'");
      case '|':
        return fail(start, "single '|': use '||'");
      default:
        return fail(start, `unexpected character '${shown(c)}'`);
    }
  }
  tokens.push({ type: 'eof', value: '', pos: n });
  return { ok: true, tokens };
}
