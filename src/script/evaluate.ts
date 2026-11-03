// Type checking and compilation of rotation script expressions into closures over
// (snapshot, ext). Compiled once; a call allocates nothing and reads only the snapshot and
// constants of the context. Strict types: `&&`, `||`, `!` take true/false values, `<` `<=` `>`
// `>=` take numbers, `==` `!=` take two values of the same type; nothing is coerced. Invalid
// parts (unknown variables or functions, type errors, def cycles) compile to `false` and are
// reported through the optional sink (validate.ts); compilation never throws.

import type { Expr, ScriptContext, ScriptExt, ValueType } from './types';
import { minGapCheck } from '../data/classes/warlock/itemUse';
import { closest, contextHas, FUNCTION_NAMES, itemActionOf, resolveVar, unknownItem, type Reader } from './vars';

export type { Reader } from './vars';

/** The `ext` to pass when nothing else is needed (see `ScriptExt`). */
export const EMPTY_EXT: ScriptExt = Object.freeze({});

/** Receives the issues of one expression, at the node they are about. */
export interface IssueSink {
  error(node: Expr, message: string, suggestion?: string): void;
  warning(node: Expr, message: string, suggestion?: string): void;
}

/** A compiled node: its type (null when invalid) and its reader. */
export interface Compiled {
  type: ValueType | null;
  read: Reader;
}

const FALSE: Reader = () => false;
const ZERO: Reader = () => 0;
const UNAVAILABLE = 'is not available here (no basic-rotation facts in this context)';
/** The end of the warning `has()` gives for an absent id: has() is designed to test absent ids, so this warning never deactivates a rule (compile.ts). */
export const HAS_ABSENT_WARNING = 'has() is false';
const INVALID: Compiled = Object.freeze({ type: null, read: FALSE });

export const TYPE_NAMES: Readonly<Record<ValueType, string>> = Object.freeze({
  bool: 'a true/false value',
  num: 'a number',
  str: 'a string',
});

/** Defs as parsed ASTs, by name (own properties only are read). */
export type ParsedDefs = Readonly<Record<string, Expr>>;

/**
 * Compiles expressions of one script against one context. Defs are compiled once each (shared
 * cache) with no sink: their own issues are reported where they are defined (validate.ts), a
 * reference only reports an unknown name. A def that reaches itself compiles to false.
 */
export class ExprCompiler {
  private readonly cache = new Map<string, Compiled>();
  private readonly active = new Set<string>();

  constructor(
    private readonly ctx: ScriptContext,
    private readonly defs: ParsedDefs = {},
  ) {}

  /** The compiled def `name` (INVALID when absent or cyclic). */
  def(name: string): Compiled {
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    if (!Object.hasOwn(this.defs, name) || this.active.has(name)) return INVALID;
    this.active.add(name);
    const c = this.compile(this.defs[name]!);
    this.active.delete(name);
    this.cache.set(name, c);
    return c;
  }

  compile(e: Expr, sink?: IssueSink): Compiled {
    switch (e.kind) {
      case 'bool': {
        const v = e.value;
        return { type: 'bool', read: v ? () => true : () => false };
      }
      case 'num': {
        const v = e.value;
        return { type: 'num', read: () => v };
      }
      case 'str': {
        const v = e.value;
        return { type: 'str', read: () => v };
      }
      case 'var': {
        const r = resolveVar(e.path, this.ctx);
        if (!r.ok) {
          sink?.error(e, r.message, r.suggestion);
          return INVALID;
        }
        if (r.unknownId !== undefined) sink?.warning(e, r.unknownId.message, r.unknownId.suggestion);
        return { type: r.type, read: r.read };
      }
      case 'def': {
        if (!Object.hasOwn(this.defs, e.name)) {
          const near = closest(e.name, Object.keys(this.defs));
          sink?.error(e, `unknown definition '$${e.name}'`, near === undefined ? undefined : `$${near}`);
          return INVALID;
        }
        return this.def(e.name);
      }
      case 'not': {
        const a = this.compile(e.arg, sink);
        if (a.type === null) return { type: 'bool', read: FALSE };
        if (a.type !== 'bool') {
          sink?.error(e, `'!' needs a true/false value, got ${TYPE_NAMES[a.type]}`);
          return { type: 'bool', read: FALSE };
        }
        const r = a.read;
        return { type: 'bool', read: (s, x) => r(s, x) !== true };
      }
      case 'and':
      case 'or':
        return this.logic(e, sink);
      case 'cmp':
        return this.cmp(e, sink);
      case 'call':
        return this.call(e, sink);
    }
  }

  private logic(e: Extract<Expr, { kind: 'and' | 'or' }>, sink?: IssueSink): Compiled {
    const parts = e.args.map((a) => this.compile(a, sink));
    const op = e.kind === 'and' ? '&&' : '||';
    let valid = true;
    for (const p of parts) {
      if (p.type === null) valid = false;
      else if (p.type !== 'bool') {
        if (valid) sink?.error(e, `'${op}' needs true/false values, got ${TYPE_NAMES[p.type]} (write a comparison such as 'mana > 0')`);
        valid = false;
      }
    }
    if (!valid) return { type: 'bool', read: FALSE };
    const rs = parts.map((p) => p.read);
    if (e.kind === 'and') {
      if (rs.length === 2) {
        const [a, b] = rs as [Reader, Reader];
        return { type: 'bool', read: (s, x) => a(s, x) === true && b(s, x) === true };
      }
      return {
        type: 'bool',
        read: (s, x) => {
          for (let i = 0; i < rs.length; i++) if (rs[i]!(s, x) !== true) return false;
          return true;
        },
      };
    }
    if (rs.length === 2) {
      const [a, b] = rs as [Reader, Reader];
      return { type: 'bool', read: (s, x) => a(s, x) === true || b(s, x) === true };
    }
    return {
      type: 'bool',
      read: (s, x) => {
        for (let i = 0; i < rs.length; i++) if (rs[i]!(s, x) === true) return true;
        return false;
      },
    };
  }

  private cmp(e: Extract<Expr, { kind: 'cmp' }>, sink?: IssueSink): Compiled {
    const l = this.compile(e.left, sink);
    const r = this.compile(e.right, sink);
    if (l.type === null || r.type === null) return { type: 'bool', read: FALSE };
    const a = l.read;
    const b = r.read;
    if (e.op === '==' || e.op === '!=') {
      if (l.type !== r.type) {
        sink?.error(e, `'${e.op}' compares values of the same type, got ${TYPE_NAMES[l.type]} and ${TYPE_NAMES[r.type]}`);
        return { type: 'bool', read: FALSE };
      }
      this.checkCastingLiteral(e.left, e.right, sink);
      this.checkCastingLiteral(e.right, e.left, sink);
      return { type: 'bool', read: e.op === '==' ? (s, x) => a(s, x) === b(s, x) : (s, x) => a(s, x) !== b(s, x) };
    }
    if (l.type !== 'num' || r.type !== 'num') {
      sink?.error(e, `'${e.op}' needs two numbers, got ${TYPE_NAMES[l.type]} and ${TYPE_NAMES[r.type]}`);
      return { type: 'bool', read: FALSE };
    }
    type N = (s: Parameters<Reader>[0], x: ScriptExt) => number;
    const na = a as N;
    const nb = b as N;
    switch (e.op) {
      case '<':
        return { type: 'bool', read: (s, x) => na(s, x) < nb(s, x) };
      case '<=':
        return { type: 'bool', read: (s, x) => na(s, x) <= nb(s, x) };
      case '>':
        return { type: 'bool', read: (s, x) => na(s, x) > nb(s, x) };
      case '>=':
        return { type: 'bool', read: (s, x) => na(s, x) >= nb(s, x) };
    }
  }

  /** `casting == 'id'`: warn when the literal is no spell of the context ('' is fine). */
  private checkCastingLiteral(v: Expr, lit: Expr, sink?: IssueSink): void {
    if (sink === undefined || v.kind !== 'var' || v.path !== 'casting' || lit.kind !== 'str' || lit.value === '') return;
    if (this.ctx.spellIds.includes(lit.value)) return;
    sink.warning(lit, `unknown spell '${lit.value}'`, closest(lit.value, this.ctx.spellIds));
  }

  private call(e: Extract<Expr, { kind: 'call' }>, sink?: IssueSink): Compiled {
    if (e.fn === 'fight.last') {
      const args = e.args.map((a) => this.compile(a, sink));
      if (args.some((a) => a.type === null)) return { type: 'bool', read: FALSE };
      if (args.length !== 1 || args[0]!.type !== 'num') {
        sink?.error(e, 'fight.last(N) needs one number, in seconds');
        return { type: 'bool', read: FALSE };
      }
      const arg = e.args[0]!;
      if (arg.kind === 'num') {
        const ms = arg.value * 1000;
        return { type: 'bool', read: (s) => s.durationMs - s.nowMs <= ms };
      }
      const n = args[0]!.read as (s: Parameters<Reader>[0], x: ScriptExt) => number;
      return { type: 'bool', read: (s, x) => s.durationMs - s.nowMs <= n(s, x) * 1000 };
    }
    if (e.fn === 'has') {
      const arg = e.args[0];
      if (e.args.length !== 1 || arg === undefined || arg.kind !== 'str') {
        sink?.error(e, "has(id) needs one id, for example has(shadowburn) or has('item:29370')");
        return { type: 'bool', read: FALSE };
      }
      const present = contextHas(this.ctx, arg.value);
      if (!present) {
        const pool = [...this.ctx.spellIds, ...this.ctx.itemActions.map((a) => a.id)];
        sink?.warning(arg, `'${arg.value}' is not a spell or item of this setup: ${HAS_ABSENT_WARNING}`, closest(arg.value, pool));
      }
      return { type: 'bool', read: present ? () => true : FALSE };
    }
    if (e.fn === 'dotRefreshDue' || e.fn === 'manaCost') return this.rotationIdCall(e, sink);
    if (e.fn === 'finisherWindow') {
      if (e.args.length !== 0) {
        for (const a of e.args) this.compile(a, sink);
        sink?.error(e, 'finisherWindow() takes no argument');
        return { type: 'num', read: ZERO };
      }
      const facts = this.ctx.rotation;
      if (facts === undefined) {
        sink?.warning(e, `finisherWindow() ${UNAVAILABLE}: it reads 0`);
        return { type: 'num', read: ZERO };
      }
      const sec = facts.finisherWindowMs / 1000;
      return { type: 'num', read: () => sec };
    }
    if (e.fn === 'minGap') return this.minGap(e, sink);
    for (const a of e.args) this.compile(a, sink);
    sink?.error(e, `unknown function '${e.fn}'`, closest(e.fn, FUNCTION_NAMES));
    return INVALID;
  }

  /** `dotRefreshDue(id)` (true/false) and `manaCost(id)` (a number): the basic rotation's rules (`ScriptContext.rotation`). */
  private rotationIdCall(e: Extract<Expr, { kind: 'call' }>, sink?: IssueSink): Compiled {
    const isDot = e.fn === 'dotRefreshDue';
    const fallback: Compiled = isDot ? { type: 'bool', read: FALSE } : { type: 'num', read: ZERO };
    const arg = e.args[0];
    if (e.args.length !== 1 || arg === undefined || arg.kind !== 'str') {
      sink?.error(e, `${e.fn}(id) needs one spell id, for example ${isDot ? 'dotRefreshDue(immolate)' : "manaCost('shadow-bolt')"}`);
      return fallback;
    }
    const facts = this.ctx.rotation;
    if (facts === undefined) {
      sink?.warning(e, `${e.fn}() ${UNAVAILABLE}: it reads ${isDot ? 'false' : '0'}`);
      return fallback;
    }
    const id = arg.value;
    if (isDot) {
      const due = facts.dotRefreshDue(id);
      if (due === undefined) {
        sink?.warning(arg, `'${id}' is no DoT spell of this build: dotRefreshDue() is false`, closest(id, this.ctx.spellIds));
        return fallback;
      }
      return { type: 'bool', read: due };
    }
    const cost = facts.manaCost(id);
    if (cost === undefined) {
      sink?.warning(arg, `unknown spell '${id}': manaCost() is 0`, closest(id, this.ctx.spellIds));
      return fallback;
    }
    return { type: 'num', read: () => cost };
  }

  /** `minGap(id, N)`: the item-use rules' minimum gap (itemUse.ts `minGapCheck`). */
  private minGap(e: Extract<Expr, { kind: 'call' }>, sink?: IssueSink): Compiled {
    const fallback: Compiled = { type: 'bool', read: FALSE };
    const [idArg, nArg] = e.args;
    if (e.args.length !== 2 || idArg === undefined || nArg === undefined || idArg.kind !== 'str') {
      for (const a of e.args) if (a.kind !== 'str') this.compile(a, sink);
      sink?.error(e, 'minGap(id, N) needs an item id and a number of seconds, for example minGap(item:29370, 30)');
      return fallback;
    }
    const n = this.compile(nArg, sink);
    if (n.type === null) return fallback;
    if (n.type !== 'num') {
      sink?.error(e, `minGap(id, N) needs a number of seconds, got ${TYPE_NAMES[n.type]}`);
      return fallback;
    }
    const item = itemActionOf(this.ctx, idArg.value);
    if (item === undefined) {
      const unknown = unknownItem(this.ctx, idArg.value)!;
      sink?.warning(idArg, `${unknown.message}: minGap() is false`, unknown.suggestion);
      return fallback;
    }
    const cooldownMs = item.cooldownMs ?? 0;
    const spellId = item.spellId;
    if (nArg.kind === 'num') {
      const check = minGapCheck(spellId, cooldownMs, nArg.value);
      return { type: 'bool', read: check ?? (() => true) };
    }
    const sec = n.read as (s: Parameters<Reader>[0], x: ScriptExt) => number;
    // The same arithmetic as minGapCheck, with N read at run time.
    return {
      type: 'bool',
      read: (s, x) => {
        const v = sec(s, x);
        if (!(v > 0 && cooldownMs > 0)) return true;
        const gapMs = Math.min(v * 1000, cooldownMs);
        return cooldownMs - (Object.hasOwn(s.cooldownRemainingMs, spellId) ? s.cooldownRemainingMs[spellId]! : 0) >= gapMs;
      },
    };
  }
}

/**
 * Compiles `ast` against `ctx` (and the script's parsed defs) into a reader of the snapshot:
 * true/false, a number or a string. Never throws; invalid parts read as false (validate first:
 * `validateScript` reports them). Unknown ids read as false / 0 at run time.
 */
export function compileExpr(ast: Expr, ctx: ScriptContext, defs?: ParsedDefs): Reader {
  return new ExprCompiler(ctx, defs).compile(ast).read;
}
