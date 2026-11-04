// Validation of a rotation script (untrusted data: stored, pasted or from a file). Errors make
// the script invalid; warnings do not (an unknown id leaves its rule in place, inactive or reading
// false / 0). Every issue has a stable path (`rules[2].if`, `defs.burst`), expression issues a
// 0-based `pos` and a "column N: " prefix (N = pos + 1), and a closest-name `suggestion` where one
// is near. Never throws: a script that cannot be read is one error.

import { ExprCompiler, TYPE_NAMES, type IssueSink, type ParsedDefs } from './evaluate';
import { DEF_NAME_RE } from './lexer';
import { parseExpr, positionOf } from './parser';
import type { Expr, Script, ScriptContext, ScriptIssue } from './types';
import { SCRIPT_LIMITS } from './types';
import { closest, itemActionOf, unknownItem } from './vars';

export { closest, levenshtein } from './vars';

export interface ScriptValidation {
  errors: ScriptIssue[];
  warnings: ScriptIssue[];
}

const RULE_FIELDS = ['action', 'id', 'if', 'label', 'comment', 'enabled'] as const;
const ACTIONS = ['cast', 'use', 'wait'];

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const shortText = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
};

class Issues {
  readonly errors: ScriptIssue[] = [];
  readonly warnings: ScriptIssue[] = [];
  constructor(private readonly cap: number) {}
  add(kind: 'errors' | 'warnings', issue: ScriptIssue): void {
    const list = this[kind];
    if (list.length >= this.cap) return;
    if (issue.suggestion === undefined) delete issue.suggestion;
    list.push(issue);
  }
  error(path: string, message: string, suggestion?: string): void {
    this.add('errors', { path, message, suggestion });
  }
  warning(path: string, message: string, suggestion?: string): void {
    this.add('warnings', { path, message, suggestion });
  }
  /** An issue inside an expression text: with its position. */
  at(kind: 'errors' | 'warnings', path: string, pos: number, message: string, suggestion?: string): void {
    this.add(kind, { path, pos, message: `column ${pos + 1}: ${message}`, suggestion });
  }
  sink(path: string): IssueSink {
    return {
      error: (node: Expr, message: string, suggestion?: string) => this.at('errors', path, positionOf(node), message, suggestion),
      warning: (node: Expr, message: string, suggestion?: string) => this.at('warnings', path, positionOf(node), message, suggestion),
    };
  }
}

/** The def names an expression references. */
export function defRefs(e: Expr, out: Set<string>): Set<string> {
  switch (e.kind) {
    case 'def':
      out.add(e.name);
      break;
    case 'not':
      defRefs(e.arg, out);
      break;
    case 'and':
    case 'or':
    case 'call':
      for (const a of e.args) defRefs(a, out);
      break;
    case 'cmp':
      defRefs(e.left, out);
      defRefs(e.right, out);
      break;
    default:
      break;
  }
  return out;
}

/** A path from `start` back to itself through the def references, or null. */
function findCycle(start: string, refs: ReadonlyMap<string, ReadonlySet<string>>): string[] | null {
  const seen = new Set<string>();
  const path: string[] = [start];
  const walk = (name: string): boolean => {
    for (const next of refs.get(name) ?? []) {
      if (next === start) {
        path.push(next);
        return true;
      }
      if (seen.has(next) || !refs.has(next)) continue;
      seen.add(next);
      path.push(next);
      if (walk(next)) return true;
      path.pop();
    }
    return false;
  };
  return walk(start) ? path : null;
}

function validateDefs(raw: unknown, issues: Issues): { defs: ParsedDefs; broken: Set<string> } {
  const defs = Object.create(null) as Record<string, Expr>;
  const broken = new Set<string>();
  if (raw === undefined) return { defs, broken };
  if (!isRecord(raw)) {
    issues.error('defs', 'defs must be an object of named conditions');
    return { defs, broken };
  }
  let names = Object.keys(raw);
  if (names.length > SCRIPT_LIMITS.defs) {
    issues.error('defs', `at most ${SCRIPT_LIMITS.defs} definitions (got ${names.length})`);
    names = names.slice(0, SCRIPT_LIMITS.defs);
  }
  for (const name of names) {
    const path = `defs.${name}`;
    if (!DEF_NAME_RE.test(name) || name.length > 64) {
      issues.error(path, `invalid definition name '${shortText(name)}' (letters, digits, '_' and '-', starting with a letter or '_')`);
      continue;
    }
    const text = raw[name];
    if (typeof text !== 'string') {
      issues.error(path, 'a definition must be a string');
      broken.add(name);
      continue;
    }
    const parsed = parseExpr(text);
    if (!parsed.ok) {
      issues.at('errors', path, parsed.error.pos, parsed.error.message);
      broken.add(name);
      continue;
    }
    defs[name] = parsed.ast;
  }
  // Cycles: each reported once, at its first def in key order.
  const refs = new Map<string, Set<string>>();
  for (const name of Object.keys(defs)) refs.set(name, defRefs(defs[name]!, new Set()));
  const inCycle = new Set<string>();
  for (const name of Object.keys(defs)) {
    if (inCycle.has(name)) continue;
    const cycle = findCycle(name, refs);
    if (cycle === null) continue;
    for (const n of cycle) inCycle.add(n);
    issues.error(`defs.${name}`, `definition cycle: ${cycle.map((n) => `$${n}`).join(' -> ')}`);
  }
  for (const n of inCycle) broken.add(n);
  return { defs, broken };
}

function validateRule(raw: unknown, i: number, ctx: ScriptContext, issues: Issues, compileIf: (text: string, path: string) => void): void {
  const base = `rules[${i}]`;
  if (!isRecord(raw)) {
    issues.error(base, 'a rule must be an object');
    return;
  }
  const action = own(raw, 'action');
  const id = own(raw, 'id');
  const cond = own(raw, 'if');
  const validAction = typeof action === 'string' && ACTIONS.includes(action);
  if (!validAction) issues.error(`${base}.action`, `unknown action '${shortText(action)}' (cast, use or wait)`);
  if (id !== undefined && typeof id !== 'string') {
    issues.error(`${base}.id`, 'id must be a string');
  } else if (validAction && action !== 'wait') {
    if (id === undefined || id === '') {
      issues.error(`${base}.id`, `a '${action}' rule needs an id`);
    } else if (action === 'cast' && !ctx.spellIds.includes(id)) {
      const item = itemActionOf(ctx, id);
      if (item !== undefined) issues.warning(`${base}.id`, `'${id}' is an item action: use action 'use'`, item.id);
      else issues.warning(`${base}.id`, `unknown spell '${shortText(id)}'`, closest(id, ctx.spellIds));
    } else if (action === 'use') {
      const unknown = unknownItem(ctx, id);
      if (unknown !== undefined) issues.warning(`${base}.id`, unknown.message, unknown.suggestion);
    }
  }
  if (cond !== undefined && typeof cond !== 'string') {
    issues.error(`${base}.if`, 'if must be a string');
  } else if (typeof cond === 'string' && cond.trim() !== '') {
    compileIf(cond, `${base}.if`);
  } else if (action === 'wait') {
    issues.error(`${base}.if`, "a 'wait' rule needs an if (otherwise it would stop the rotation for good)");
  }
  for (const [field, limit] of [
    ['label', SCRIPT_LIMITS.label],
    ['comment', SCRIPT_LIMITS.comment],
  ] as const) {
    const v = own(raw, field);
    if (v === undefined) continue;
    if (typeof v !== 'string') issues.error(`${base}.${field}`, `${field} must be a string`);
    else if (v.length > limit) issues.error(`${base}.${field}`, `${field} longer than ${limit} characters`);
  }
  const enabled = own(raw, 'enabled');
  if (enabled !== undefined && typeof enabled !== 'boolean') issues.error(`${base}.enabled`, 'enabled must be true or false');
  for (const key of Object.keys(raw)) {
    if ((RULE_FIELDS as readonly string[]).includes(key)) continue;
    issues.warning(`${base}.${shortText(key)}`, `unknown field '${shortText(key)}' (ignored)`, closest(key, RULE_FIELDS));
  }
}

/**
 * Validates `script` (any value: untrusted) against `ctx`:
 * - errors: not an object, `rules` not an array or over 200 rules, more than 50 defs, bad def
 *   names or texts, def cycles, unknown `$name`, syntax errors (with position), expressions over
 *   500 characters or 20 levels, unknown variables or functions (closest suggested), type errors,
 *   a condition that is not true/false, an unknown action, a `cast` / `use` rule without id, a
 *   `wait` rule without `if`, fields of the wrong type, label / comment too long;
 * - warnings: ids not in the context (spells, auras, items not worn or not enabled; closest
 *   suggested), `cast` of an item action, `has()` of an absent id, unknown rule fields.
 * Issues are in script order (defs first); at most `SCRIPT_LIMITS.issues` of each kind
 * (`maxIssues`: compileScript reads them all, so a rule past the cap is still left out).
 */
export function validateScript(script: Script, ctx: ScriptContext, options?: { maxIssues?: number }): ScriptValidation {
  const issues = new Issues(options?.maxIssues ?? SCRIPT_LIMITS.issues);
  try {
    const raw: unknown = script;
    if (!isRecord(raw)) {
      issues.error('', 'script must be an object');
      return { errors: issues.errors, warnings: issues.warnings };
    }
    const { defs, broken } = validateDefs(own(raw, 'defs'), issues);
    const compiler = new BrokenAwareCompiler(ctx, defs, broken);
    for (const name of Object.keys(defs)) {
      if (broken.has(name)) continue;
      compiler.compile(defs[name]!, issues.sink(`defs.${name}`));
    }
    const compileIf = (text: string, path: string) => {
      const parsed = parseExpr(text);
      if (!parsed.ok) {
        issues.at('errors', path, parsed.error.pos, parsed.error.message);
        return;
      }
      const c = compiler.compile(parsed.ast, issues.sink(path));
      if (c.type !== null && c.type !== 'bool') {
        issues.at('errors', path, positionOf(parsed.ast), `a condition must be true/false, got ${TYPE_NAMES[c.type]}`);
      }
    };
    const rules = own(raw, 'rules');
    if (!Array.isArray(rules)) {
      issues.error('rules', 'rules must be an array');
    } else {
      if (rules.length > SCRIPT_LIMITS.rules) issues.error('rules', `at most ${SCRIPT_LIMITS.rules} rules (got ${rules.length})`);
      const n = Math.min(rules.length, SCRIPT_LIMITS.rules);
      for (let i = 0; i < n; i++) validateRule(rules[i], i, ctx, issues, compileIf);
    }
    return { errors: issues.errors, warnings: issues.warnings };
  } catch {
    return { errors: [{ path: '', message: 'script could not be read' }], warnings: [] };
  }
}

/** A compiler where a reference to a broken def (bad text, cycle) is silent: its error is at the def. */
class BrokenAwareCompiler extends ExprCompiler {
  constructor(
    ctx: ScriptContext,
    parsed: ParsedDefs,
    private readonly broken: ReadonlySet<string>,
  ) {
    super(ctx, parsed);
  }
  override compile(e: Expr, sink?: IssueSink) {
    if (e.kind === 'def' && this.broken.has(e.name)) return super.compile(e, undefined);
    return super.compile(e, sink);
  }
}
