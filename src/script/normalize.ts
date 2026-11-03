// Normalization of a stored rotation script (`SetupConfig.script`, untrusted: localStorage, a
// pasted or imported setup). Keeps only the script's shape, within the limits; the expressions
// are not checked here (`validateScript` / `compileScript` report and leave out invalid rules), so
// a script with a typo survives storage and can be fixed. Never throws; idempotent.

import { DEF_NAME_RE } from './lexer';
import { SCRIPT_LIMITS, type Script, type ScriptRule } from './types';

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

/** Longest id kept (spell ids and catalog entry ids are far shorter). */
export const SCRIPT_ID_MAX_LENGTH = 128;
const ACTIONS: readonly ScriptRule['action'][] = ['cast', 'use', 'wait'];

function normalizeRule(v: unknown): ScriptRule | null {
  if (!isRecord(v)) return null;
  const action = ACTIONS.find((a) => a === own(v, 'action'));
  if (action === undefined) return null;
  const rule: ScriptRule = { action };
  const id = own(v, 'id');
  if (id !== undefined) {
    if (typeof id !== 'string' || id.length > SCRIPT_ID_MAX_LENGTH) return null;
    rule.id = id;
  }
  const cond = own(v, 'if');
  if (cond !== undefined) {
    // Dropping a condition would turn the rule into "always": the rule goes instead.
    if (typeof cond !== 'string' || cond.length > SCRIPT_LIMITS.exprLength) return null;
    rule.if = cond;
  }
  const label = own(v, 'label');
  if (typeof label === 'string') rule.label = label.slice(0, SCRIPT_LIMITS.label);
  const comment = own(v, 'comment');
  if (typeof comment === 'string') rule.comment = comment.slice(0, SCRIPT_LIMITS.comment);
  const enabled = own(v, 'enabled');
  if (typeof enabled === 'boolean') rule.enabled = enabled;
  return rule;
}

/**
 * A valid copy of a stored script, or undefined (no script: the basic rotation plays):
 * - not a plain object, or neither a rule nor a def left: undefined;
 * - `rules`: the first 200 entries of an array (`SCRIPT_LIMITS.rules`); a rule is kept when it is
 *   an object with a known `action` ('cast', 'use', 'wait'), an `id` (if any) that is a string of
 *   at most 128 characters and an `if` (if any) that is a string of at most 500 characters
 *   (`SCRIPT_LIMITS.exprLength`); otherwise it is dropped whole (a dropped condition would make it
 *   "always"). `label` / `comment` strings are cut to 100 / 1000 characters, `enabled` is kept
 *   when a boolean; other fields and values of the wrong type are dropped;
 * - `defs`: the first 50 own keys (`SCRIPT_LIMITS.defs`) that are valid def names (letters,
 *   digits, `_`, `-`, starting with a letter or `_`, at most 64 characters; never `__proto__`)
 *   with a string of at most 500 characters.
 * Expressions are kept as written (validated where the script is used). Idempotent; never throws.
 */
export function normalizeScript(v: unknown): Script | undefined {
  try {
    if (!isRecord(v)) return undefined;
    const rawRules = own(v, 'rules');
    const rules: ScriptRule[] = [];
    if (Array.isArray(rawRules)) {
      const n = Math.min(rawRules.length, SCRIPT_LIMITS.rules);
      for (let i = 0; i < n; i++) {
        const r = normalizeRule(rawRules[i]);
        if (r !== null) rules.push(r);
      }
    }
    const rawDefs = own(v, 'defs');
    const defs: Record<string, string> = {};
    let nDefs = 0;
    if (isRecord(rawDefs)) {
      for (const name of Object.keys(rawDefs)) {
        if (nDefs >= SCRIPT_LIMITS.defs) break;
        if (name === '__proto__' || name.length > 64 || !DEF_NAME_RE.test(name)) continue;
        const t = rawDefs[name];
        if (typeof t !== 'string' || t.length > SCRIPT_LIMITS.exprLength) continue;
        defs[name] = t;
        nDefs++;
      }
    }
    if (rules.length === 0 && nDefs === 0) return undefined;
    return nDefs > 0 ? { rules, defs } : { rules };
  } catch {
    return undefined;
  }
}

/** Whether a (normalized) script replaces the basic rotation: it has at least one rule. */
export function scriptIsActive(script: Script | undefined): script is Script {
  return script !== undefined && Array.isArray(script.rules) && script.rules.length > 0;
}
