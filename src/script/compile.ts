// The rotation script compiler (rotation scripts Task 2): a script becomes the bot's priority list
// (`PriorityStep[]`, src/data/types.ts), one step per active rule, in rule order. Pure and
// framework-free; never throws on untrusted input. Rules: docs/data-sources.md, Part J,
// "Compiler".

import { itemPressFree } from '../data/classes/warlock/itemUse';
import type { PriorityStep } from '../data/types';
import type { SimSnapshot } from '../engine/types';
import { EMPTY_EXT, ExprCompiler, HAS_ABSENT_WARNING } from './evaluate';
import { DEF_NAME_RE } from './lexer';
import { parseExpr } from './parser';
import { SCRIPT_LIMITS, type Expr, type Script, type ScriptContext, type ScriptIssue } from './types';
import { defRefs, validateScript } from './validate';
import { itemActionOf } from './vars';

export interface CompiledScript {
  /** The bot's priority list: one step per active rule, in rule order. */
  steps: PriorityStep[];
  /** The stable key of each step's rule (`rules[3]`: its index in the script), `steps[i].key`. */
  keys: string[];
  /** `validateScript`'s warnings, then one per rule left out (path `rules[i]`) and an empty-list notice. */
  warnings: ScriptIssue[];
  /** `validateScript`'s errors; a rule with an error is left out. */
  errors: ScriptIssue[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Whether a warning deactivates its rule: every unknown-id warning does (an unknown spell, aura or
 * item, in `id` or in `if`, a function's unknown id, a function unavailable in the context), so a
 * typo never silently reads false / 0 inside a live rule (spec §2 A: "the rule is inactive"); only
 * `has()` of an absent id does not, since testing for an absent id is what `has()` is for.
 */
const deactivates = (w: ScriptIssue) => !w.message.endsWith(HAS_ABSENT_WARNING);

/** The script's defs as parsed ASTs (the ones `validateScript` accepts; broken ones are tainted anyway). */
function parsedDefs(raw: unknown): Record<string, Expr> {
  const defs = Object.create(null) as Record<string, Expr>;
  if (!isRecord(raw)) return defs;
  for (const name of Object.keys(raw).slice(0, SCRIPT_LIMITS.defs)) {
    if (!DEF_NAME_RE.test(name) || name.length > 64) continue;
    const t = raw[name];
    if (typeof t !== 'string') continue;
    const p = parseExpr(t);
    if (p.ok) defs[name] = p.ast;
  }
  return defs;
}

/**
 * Defs that would deactivate a rule using them: a def with an error or a deactivating warning at
 * `defs.<name>` (bad text, cycle, unknown id, ...), and every def that references one, directly
 * or not.
 */
function taintedDefs(defs: Readonly<Record<string, Expr>>, errors: readonly ScriptIssue[], warnings: readonly ScriptIssue[]): Set<string> {
  const tainted = new Set<string>();
  for (const i of errors) if (i.path.startsWith('defs.')) tainted.add(i.path.slice(5));
  for (const w of warnings) if (w.path.startsWith('defs.') && deactivates(w)) tainted.add(w.path.slice(5));
  const refs = new Map<string, Set<string>>();
  for (const name of Object.keys(defs)) refs.set(name, defRefs(defs[name]!, new Set()));
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, r] of refs) {
      if (tainted.has(name)) continue;
      for (const x of r) {
        if (tainted.has(x)) {
          tainted.add(name);
          changed = true;
          break;
        }
      }
    }
  }
  return tainted;
}

/**
 * Compiles `script` (untrusted) against `ctx` into the bot's priority list:
 * - The rules are validated (`validateScript`); each rule becomes one step, in order, unless it is
 *   left out: a rule with an error (any issue at `rules[i]` or below), `enabled: false`, a
 *   deactivating warning in its `id` or `if` (an id the context does not know; not `has()` of an
 *   absent id), or a reference to a def that has one of those. Every rule left out gets a warning
 *   at `rules[i]` saying why. Only the first 200 rules are read.
 * - `cast`: presses the spell `id`. `use`: presses the item action of the catalog entry id (or
 *   action id) `id`, and only when that press cannot take a spell's place in the spell queue (no
 *   cast in progress, nothing queued, or itself queued: itemUse.ts `itemPressFree`, the gate every
 *   basic item step has). `wait`: when its `if` holds the bot presses nothing at this step and tries
 *   no later rule (src/bot/bot.ts; not in the `ready` phase).
 * - The step's `when` is the compiled `if` (a pure function of the snapshot: closures over
 *   constants of the context); a blank `if` means always (no `when`, or the item gate alone).
 * - `label`: the rule's label, else the spell's or item's name from the context (`names`), else the
 *   id ('Wait' for a wait rule). `hint`: the rule's comment, else `if <condition>` / `always`.
 *   `key`: `rules[i]` (`keys`).
 * A press the engine rejects falls through to the next step, as for every priority list. Pure:
 * new step objects on every call; never throws.
 */
export function compileScript(script: unknown, ctx: ScriptContext): CompiledScript {
  const { errors, warnings } = validateScript(script as Script, ctx);
  const out: CompiledScript = { steps: [], keys: [], warnings: [...warnings], errors: [...errors] };
  try {
    if (!isRecord(script)) return out;
    const rules = own(script, 'rules');
    if (!Array.isArray(rules)) return out;
    const defs = parsedDefs(own(script, 'defs'));
    const tainted = taintedDefs(defs, errors, warnings);
    const compiler = new ExprCompiler(ctx, defs);
    const names = ctx.names ?? {};
    const nameOf = (id: string) => (Object.hasOwn(names, id) ? names[id]! : id);
    const leftOut = (path: string, why: string) => out.warnings.push({ path, message: `rule left out: ${why}` });
    const n = Math.min(rules.length, SCRIPT_LIMITS.rules);
    for (let i = 0; i < n; i++) {
      const base = `rules[${i}]`;
      const raw: unknown = rules[i];
      if (errors.some((e) => e.path === base || e.path.startsWith(`${base}.`)) || !isRecord(raw)) {
        leftOut(base, 'it has errors');
        continue;
      }
      if (own(raw, 'enabled') === false) {
        leftOut(base, 'disabled');
        continue;
      }
      if (warnings.some((w) => (w.path === `${base}.id` || w.path === `${base}.if`) && deactivates(w))) {
        leftOut(base, 'it names an id this setup does not have (see the warnings above)');
        continue;
      }
      const action = own(raw, 'action') as 'cast' | 'use' | 'wait';
      const id = text(own(raw, 'id'));
      const cond = text(own(raw, 'if'));
      let read: ((s: SimSnapshot) => boolean) | undefined;
      if (cond !== '') {
        const parsed = parseExpr(cond);
        if (!parsed.ok) {
          leftOut(base, 'its condition does not parse');
          continue;
        }
        const usesTainted = [...defRefs(parsed.ast, new Set())].some((d) => tainted.has(d));
        if (usesTainted) {
          leftOut(base, 'it uses a definition with errors or unknown ids');
          continue;
        }
        const c = compiler.compile(parsed.ast);
        // A rule without errors has a true/false condition (validateScript), whose reader returns
        // exactly true or false; no variable reads `ext` (reserved), so the reader is the step's
        // `when` as it is (one call less per evaluation).
        const r = c.read;
        read = c.type === 'bool' ? (r as (s: SimSnapshot) => boolean) : (s) => r(s, EMPTY_EXT) === true;
      }
      let spellId = '';
      let label = text(own(raw, 'label'));
      if (action === 'cast') {
        spellId = id;
        if (label === '') label = nameOf(id);
      } else if (action === 'use') {
        const item = itemActionOf(ctx, id);
        if (item === undefined) {
          leftOut(base, `item '${id}' is not in this setup`);
          continue;
        }
        spellId = item.spellId;
        if (label === '') label = Object.hasOwn(names, item.id) ? names[item.id]! : nameOf(item.spellId);
      } else if (label === '') {
        label = 'Wait';
      }
      const comment = text(own(raw, 'comment'));
      const hint = comment !== '' ? comment : cond !== '' ? `${action === 'wait' ? 'Press nothing while' : 'If'} ${cond}` : 'Always';
      let when = read;
      if (action === 'use') {
        const gated = spellId;
        const r = read;
        when = r === undefined ? (s) => itemPressFree(s, gated) : (s) => itemPressFree(s, gated) && r(s);
      }
      const step: PriorityStep = { spellId, label, hint, kind: action, key: base };
      if (when !== undefined) step.when = when;
      out.steps.push(step);
      out.keys.push(base);
    }
    if (!out.steps.some((s) => s.kind !== 'wait')) {
      out.warnings.push({ path: 'rules', message: 'no cast or use rule is active: the bot has nothing to press' });
    }
    return out;
  } catch {
    return { steps: [], keys: [], warnings: out.warnings, errors: [...out.errors, { path: '', message: 'script could not be compiled' }] };
  }
}
