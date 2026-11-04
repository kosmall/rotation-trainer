// Setup → Rotation, Script mode (rotation scripts Task 5, spec §2 A; UI redesign spec §5.1, §6):
// the rotation script editor. A rule list (enabled, action, id from the build's spells and item
// actions, condition with live validation under the field, label and comment, move, duplicate,
// delete), the named conditions (`defs`), a searchable list of variables, functions and ids with
// Insert buttons, the whole script as JSON (Apply only when valid) and a validation summary.
// Fully controlled: every edit is a new script passed to `onChange` (the trainer normalizes, saves
// and applies it: from the next fight, at once when the fight has not started). Loaded lazily by
// the Rotation section. Fields swallow every key (rule S5: the shell's guard reads them as fields).

import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BuffDef } from '../../data/types';
import type { AuraDef, SpellDef } from '../../engine/types';
import { compileScript } from '../../script/compile';
import { DEF_NAME_RE } from '../../script/lexer';
import { normalizeScript } from '../../script/normalize';
import type { Script, ScriptContext, ScriptIssue, ScriptRule } from '../../script/types';
import { SCRIPT_LIMITS } from '../../script/types';
import { validateScript } from '../../script/validate';
import { VARIABLE_DOCS } from '../../script/vars';
import { SpellIcon } from '../SpellIcon';

/** The longest JSON text the JSON view reads (a scenario file's limit). */
export const SCRIPT_JSON_MAX_CHARS = 200_000;

export interface ScriptEditorProps {
  /** The setup's script (normalized), or undefined: no script, the basic rotation plays. */
  script: Script | undefined;
  /** A new script (undefined: no rule and no named condition left). */
  onChange(script: Script | undefined): void;
  /** What ids resolve against: the next fight's build and gear (`AppliedSetup.script.context`). */
  context: ScriptContext;
  spells: readonly SpellDef[];
  auras: readonly AuraDef[];
  catalog: readonly BuffDef[];
  /** Mean fires per fight by rule key (`rules[i]`) from the last simulation of this very setup, or null. */
  fires: Readonly<Record<string, number>> | null;
  onConvert(): void;
  onClear(): void;
}

const ACTION_LABELS: Readonly<Record<ScriptRule['action'], string>> = { cast: 'Cast', use: 'Use', wait: 'Wait' };

interface IdOption {
  id: string;
  name: string;
  icon: string;
  iconKind: 'spell' | 'item';
}

/** The ids a `cast` or `use` rule can pick: the build's spells, the setup's item actions (by catalog entry id). */
function idOptions(context: ScriptContext, spells: readonly SpellDef[], catalog: readonly BuffDef[]) {
  const spellOf = new Map(spells.map((s) => [s.id, s]));
  const cast: IdOption[] = context.spellIds.map((id) => {
    const s = spellOf.get(id);
    return { id, name: s?.name ?? id, icon: s?.icon ?? '', iconKind: 'spell' };
  });
  const use: IdOption[] = context.itemActions.map((a) => {
    const entry = catalog.find((b) => b.id === a.id);
    const spell = spellOf.get(a.spellId);
    return {
      id: a.id,
      name: entry?.name ?? context.names?.[a.id] ?? spell?.name ?? a.id,
      icon: entry?.icon ?? spell?.icon ?? '',
      iconKind: entry?.iconKind === 'item' ? 'item' : 'spell',
    };
  });
  return { cast, use };
}

/** "Cast Shadow Bolt", "Use Destruction Potion", "Wait". */
export function ruleTitle(rule: ScriptRule, options: { cast: readonly IdOption[]; use: readonly IdOption[] }): string {
  if (rule.action === 'wait') return 'Wait';
  const list = rule.action === 'cast' ? options.cast : options.use;
  const name = list.find((o) => o.id === rule.id || (rule.action === 'use' && `use-${o.id}` === rule.id))?.name;
  return `${ACTION_LABELS[rule.action]} ${name ?? rule.id ?? '?'}`;
}

/** The issues of one rule (`rules[i]`, `rules[i].if`, `rules[i].id`, ...), split by where they show. */
function issuesOf(list: readonly ScriptIssue[], prefix: string) {
  const cond: ScriptIssue[] = [];
  const other: ScriptIssue[] = [];
  for (const issue of list) {
    if (issue.path === `${prefix}.if`) cond.push(issue);
    else if (issue.path === prefix || issue.path.startsWith(`${prefix}.`)) other.push(issue);
  }
  return { cond, other };
}

function IssueText({ issue }: { issue: ScriptIssue }) {
  return (
    <>
      <b>{issue.path || 'script'}</b>: {issue.message}
      {issue.suggestion !== undefined && <> Did you mean “{issue.suggestion}”?</>}
    </>
  );
}

function IssueList({ id, errors, warnings }: { id?: string; errors: readonly ScriptIssue[]; warnings: readonly ScriptIssue[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <ul className="se-issues" id={id}>
      {errors.map((e, i) => (
        <li key={`e${i}`} className="err">
          <span className="sr-only">Error: </span>
          <IssueText issue={e} />
        </li>
      ))}
      {warnings.map((w, i) => (
        <li key={`w${i}`} className="warn">
          <span className="sr-only">Warning: </span>
          <IssueText issue={w} />
        </li>
      ))}
    </ul>
  );
}

/** Lines a condition field starts with: about 44 characters a line, 1 to 4 lines (then `useAutoHeight` fits it). */
const rowsFor = (text: string) => Math.min(4, Math.max(1, Math.ceil(text.length / 44)));

/** Grows a condition field to its text (at most 8 lines; it scrolls past that), after each change. */
function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || el.scrollHeight === 0) return; // not laid out (jsdom, hidden)
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 19;
    el.style.height = `${Math.min(el.scrollHeight + 2, line * 8 + 14)}px`;
  }, [value]);
  return ref;
}

/** The focused condition field (rule or def), for Insert. */
type FieldRef = { kind: 'rule'; index: number } | { kind: 'def'; name: string };

interface RuleRowProps {
  index: number;
  count: number;
  rule: ScriptRule;
  options: { cast: readonly IdOption[]; use: readonly IdOption[] };
  errors: { cond: ScriptIssue[]; other: ScriptIssue[] };
  warnings: { cond: ScriptIssue[]; other: ScriptIssue[] };
  fires: number | null;
  open: boolean;
  onOpen(index: number, open: boolean): void;
  onRule(index: number, rule: ScriptRule): void;
  onMove(index: number, by: -1 | 1): void;
  onDuplicate(index: number): void;
  onDelete(index: number): void;
  onFocusField(field: FieldRef, el: HTMLTextAreaElement): void;
}

const RuleRow = memo(function RuleRow({
  index,
  count,
  rule,
  options,
  errors,
  warnings,
  fires,
  open,
  onOpen,
  onRule,
  onMove,
  onDuplicate,
  onDelete,
  onFocusField,
}: RuleRowProps) {
  const uid = useId();
  const n = index + 1;
  const list = rule.action === 'cast' ? options.cast : rule.action === 'use' ? options.use : [];
  const known = rule.id !== undefined && list.some((o) => o.id === rule.id);
  const [typing, setTyping] = useState(false);
  const showText = rule.action !== 'wait' && (typing || (rule.id !== undefined && rule.id !== '' && !known) || list.length === 0);
  const selected = list.find((o) => o.id === rule.id);
  const condText = rule.if ?? '';
  const hasErr = errors.cond.length + errors.other.length > 0;
  const condIssuesId = `${uid}-cond-issues`;
  const condRef = useAutoHeight(condText);
  const set = (patch: Partial<ScriptRule>, drop: (keyof ScriptRule)[] = []) => {
    const next: ScriptRule = { ...rule, ...patch };
    for (const k of drop) delete next[k];
    onRule(index, next);
  };
  const changeAction = (action: ScriptRule['action']) => {
    if (action === rule.action) return;
    if (action === 'wait') set({ action }, ['id']);
    else {
      const first = (action === 'cast' ? options.cast : options.use)[0];
      setTyping(false);
      set({ action, id: first?.id ?? '' });
    }
  };
  return (
    <li className={`rule${rule.enabled === false ? ' off' : ''}${hasErr ? ' has-err' : ''}`}>
      <input
        type="checkbox"
        checked={rule.enabled !== false}
        aria-label={`Rule ${n} enabled`}
        onChange={(e) => (e.target.checked ? set({}, ['enabled']) : set({ enabled: false }))}
      />
      <div className="se-act-cell">
        <span className="act">
          {selected !== undefined && selected.icon !== '' && <SpellIcon kind={selected.iconKind} icon={selected.icon} className="se-icon" />}
          <span>{ruleTitle(rule, options)}</span>
        </span>
        {rule.label !== undefined && rule.label !== '' && rule.label !== selected?.name && <small className="se-label">{rule.label}</small>}
        <div className="se-pick">
          <select aria-label={`Rule ${n} action`} value={rule.action} onChange={(e) => changeAction(e.target.value as ScriptRule['action'])}>
            <option value="cast">Cast</option>
            <option value="use">Use</option>
            <option value="wait">Wait</option>
          </select>
          {rule.action !== 'wait' &&
            (showText ? (
              <span className="se-id-text">
                <input
                  type="text"
                  aria-label={`Rule ${n} id`}
                  value={rule.id ?? ''}
                  maxLength={128}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => set({ id: e.target.value.slice(0, 128) })}
                />
                {list.length > 0 && (
                  <button
                    type="button"
                    className="btn small quiet"
                    aria-label={`List of ids for rule ${n}`}
                    onClick={() => {
                      setTyping(false);
                      set({ id: list[0]!.id });
                    }}
                  >
                    List
                  </button>
                )}
              </span>
            ) : (
              <select
                aria-label={`Rule ${n} id`}
                title={rule.id}
                value={rule.id ?? ''}
                onChange={(e) => {
                  if (e.target.value === '\u0000other') setTyping(true);
                  else set({ id: e.target.value });
                }}
              >
                {list.map((o) => (
                  <option key={o.id} value={o.id} title={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value={'\u0000other'}>Other id…</option>
              </select>
            ))}
        </div>
      </div>
      <div className="se-cond-cell">
        <textarea
          ref={condRef}
          className="cond"
          rows={rowsFor(condText)}
          aria-label={`Rule ${n} condition`}
          aria-invalid={errors.cond.length > 0 || undefined}
          aria-describedby={errors.cond.length + warnings.cond.length > 0 ? condIssuesId : undefined}
          placeholder={rule.action === 'wait' ? 'Required: when to wait' : 'Always (leave blank)'}
          value={condText}
          maxLength={SCRIPT_LIMITS.exprLength}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          onFocus={(e) => onFocusField({ kind: 'rule', index }, e.currentTarget)}
          onSelect={(e) => onFocusField({ kind: 'rule', index }, e.currentTarget)}
          onChange={(e) => {
            // A pasted text over the limit is cut (a longer condition would make the stored rule unreadable).
            const v = e.target.value.slice(0, SCRIPT_LIMITS.exprLength);
            if (v === '') set({}, ['if']);
            else set({ if: v });
          }}
        />
        {condText.trim() === '' && rule.action !== 'wait' && <span className="se-always">Always (no condition)</span>}
        <IssueList id={condIssuesId} errors={errors.cond} warnings={warnings.cond} />
        <IssueList errors={errors.other} warnings={warnings.other} />
        {open && (
          <div className="se-more">
            <label>
              <span>Label</span>
              <input
                type="text"
                value={rule.label ?? ''}
                maxLength={SCRIPT_LIMITS.label}
                aria-label={`Rule ${n} label`}
                onChange={(e) => (e.target.value === '' ? set({}, ['label']) : set({ label: e.target.value }))}
              />
            </label>
            <label>
              <span>Comment</span>
              <textarea
                rows={2}
                value={rule.comment ?? ''}
                maxLength={SCRIPT_LIMITS.comment}
                aria-label={`Rule ${n} comment`}
                onChange={(e) => (e.target.value === '' ? set({}, ['comment']) : set({ comment: e.target.value }))}
              />
            </label>
          </div>
        )}
      </div>
      <span className="fires" title="Mean fires per fight in the last simulation of this setup">
        <b>{fires === null ? '–' : fires.toFixed(1)}</b>
        <small>per fight</small>
      </span>
      <span className="row-tools">
        <button type="button" aria-label={`Move rule ${n} up`} disabled={index === 0} onClick={() => onMove(index, -1)}>
          ↑
        </button>
        <button type="button" aria-label={`Move rule ${n} down`} disabled={index === count - 1} onClick={() => onMove(index, 1)}>
          ↓
        </button>
        <button type="button" aria-label={`Label and comment of rule ${n}`} aria-expanded={open} onClick={() => onOpen(index, !open)}>
          …
        </button>
        <button type="button" aria-label={`Duplicate rule ${n}`} onClick={() => onDuplicate(index)}>
          ⧉
        </button>
        <button type="button" aria-label={`Delete rule ${n}`} onClick={() => onDelete(index)}>
          ✕
        </button>
      </span>
    </li>
  );
});

function DefRow({
  name,
  text,
  taken,
  errors,
  warnings,
  onRename,
  onText,
  onDelete,
  onFocusField,
}: {
  name: string;
  text: string;
  taken: (n: string) => boolean;
  errors: readonly ScriptIssue[];
  warnings: readonly ScriptIssue[];
  onRename(from: string, to: string): void;
  onText(name: string, text: string): void;
  onDelete(name: string): void;
  onFocusField(field: FieldRef, el: HTMLTextAreaElement): void;
}) {
  const uid = useId();
  const textRef = useAutoHeight(text);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const problem =
    draft === name
      ? null
      : draft === '__proto__' || draft.length > 64 || !DEF_NAME_RE.test(draft)
        ? 'Use letters, digits, _ and -, starting with a letter or _ (at most 64).'
        : taken(draft)
          ? 'That name is taken.'
          : null;
  return (
    <li className={errors.length > 0 ? 'def has-err' : 'def'}>
      <div className="def-name">
        <span aria-hidden="true">$</span>
        <input
          type="text"
          aria-label={`Name of the named condition ${name}`}
          aria-invalid={problem !== null || undefined}
          value={draft}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== name && problem === null) onRename(name, draft);
            else setDraft(name);
          }}
        />
      </div>
      <div className="se-cond-cell">
        <textarea
          ref={textRef}
          className="cond"
          rows={rowsFor(text)}
          aria-label={`Condition of $${name}`}
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby={errors.length + warnings.length > 0 ? `${uid}-issues` : undefined}
          value={text}
          maxLength={SCRIPT_LIMITS.exprLength}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => onFocusField({ kind: 'def', name }, e.currentTarget)}
          onSelect={(e) => onFocusField({ kind: 'def', name }, e.currentTarget)}
          onChange={(e) => onText(name, e.target.value.slice(0, SCRIPT_LIMITS.exprLength))}
        />
        {problem !== null && <p className="se-issues err">{problem}</p>}
        <IssueList id={`${uid}-issues`} errors={errors} warnings={warnings} />
      </div>
      <button type="button" className="btn small quiet" aria-label={`Delete $${name}`} onClick={() => onDelete(name)}>
        Delete
      </button>
    </li>
  );
}

interface VarEntry {
  text: string;
  insert: string;
  about: string;
}

/** The variables help: every variable and function, the named conditions and the build's ids. */
function VariableHelp({
  context,
  spells,
  auras,
  catalog,
  defs,
  onInsert,
  message,
}: {
  context: ScriptContext;
  spells: readonly SpellDef[];
  auras: readonly AuraDef[];
  catalog: readonly BuffDef[];
  defs: readonly string[];
  onInsert(text: string): void;
  message: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const all = useMemo<VarEntry[]>(() => {
    const spellName = new Map(spells.map((s) => [s.id, s.name]));
    const auraName = new Map(auras.map((a) => [a.id, a.name]));
    return [
      ...VARIABLE_DOCS.map((v) => ({ text: v.name, insert: v.name, about: `${v.type === 'num' ? 'number' : v.type === 'bool' ? 'true/false' : 'text'}: ${v.description}` })),
      ...defs.map((d) => ({ text: `$${d}`, insert: `$${d}`, about: 'Named condition of this script.' })),
      ...context.spellIds.map((s) => ({ text: s, insert: s, about: `Spell id: ${spellName.get(s) ?? s}` })),
      ...context.auraIds.map((a) => ({ text: a, insert: a, about: `Aura id: ${auraName.get(a) ?? a}` })),
      ...context.itemActions.map((a) => ({ text: a.id, insert: a.id, about: `Item action: ${catalog.find((b) => b.id === a.id)?.name ?? a.id}` })),
    ];
  }, [context, spells, auras, catalog, defs]);
  const q = query.trim().toLowerCase();
  const shown = (q === '' ? all : all.filter((v) => v.text.toLowerCase().includes(q) || v.about.toLowerCase().includes(q))).slice(0, 40);
  return (
    <section className="vars" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Variables and Ids</h2>
      <label className="sr-only" htmlFor={`${id}-q`}>
        Search variables and ids
      </label>
      <input
        id={`${id}-q`}
        type="search"
        placeholder="Search, e.g. aura, mana, trinket…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="note">Insert puts the text where the cursor was in the last condition you edited. Seconds everywhere except time.elapsedMs.</p>
      {message !== '' && (
        <p className="note" role="status">
          {message}
        </p>
      )}
      <ul aria-label="Variables and ids">
        {shown.map((v) => (
          <li key={`${v.text}|${v.about}`}>
            <code>{v.text}</code>
            <span>{v.about}</span>
            <button type="button" className="btn small quiet" aria-label={`Insert ${v.insert}`} onClick={() => onInsert(v.insert)}>
              Insert
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="note">Nothing matches “{query}”.</li>}
      </ul>
    </section>
  );
}

/** The JSON view: the whole script as text; Apply only when it reads as a valid script. */
function JsonView({ script, context, onApply, onClose }: { script: Script | undefined; context: ScriptContext; onApply(s: Script | undefined): void; onClose(): void }) {
  const id = useId();
  const [text, setText] = useState(() => JSON.stringify(script ?? { rules: [] }, null, 2));
  const check = useMemo(() => {
    if (text.length > SCRIPT_JSON_MAX_CHARS) return { ok: false as const, message: `The text is longer than ${SCRIPT_JSON_MAX_CHARS.toLocaleString('en-US')} characters.` };
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false as const, message: `Not valid JSON${e instanceof SyntaxError ? `: ${e.message.slice(0, 200)}` : ''}.` };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !Array.isArray((value as { rules?: unknown }).rules)) {
      return { ok: false as const, message: 'A script is an object with a "rules" array (and optional "defs").' };
    }
    const normalized = normalizeScript(value);
    const given = (value as { rules: unknown[] }).rules.length;
    const kept = normalized?.rules.length ?? 0;
    if (kept < Math.min(given, SCRIPT_LIMITS.rules) || given > SCRIPT_LIMITS.rules) {
      return { ok: false as const, message: `${given - kept} of ${given} rules cannot be read (each needs an action cast, use or wait; ids at most 128 characters; conditions at most 500; at most 200 rules).` };
    }
    if (normalized === undefined) return { ok: true as const, script: undefined, message: 'Valid: no rules and no named conditions (Apply clears the script).' };
    const v = validateScript(normalized, context);
    if (v.errors.length > 0) return { ok: false as const, message: `${v.errors.length} ${v.errors.length === 1 ? 'error' : 'errors'}.`, errors: v.errors };
    return {
      ok: true as const,
      script: normalized,
      message: `Valid: ${normalized.rules.length} ${normalized.rules.length === 1 ? 'rule' : 'rules'}${v.warnings.length > 0 ? `, ${v.warnings.length} ${v.warnings.length === 1 ? 'warning' : 'warnings'}` : ''}.`,
    };
  }, [text, context]);
  return (
    <div className="se-json">
      <label htmlFor={`${id}-json`}>Script as JSON</label>
      <textarea id={`${id}-json`} rows={14} spellCheck={false} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      <p role="status" className={check.ok ? 'note' : 'note se-bad'}>
        {check.message}
      </p>
      {'errors' in check && check.errors !== undefined && <IssueList errors={check.errors.slice(0, 10)} warnings={[]} />}
      <div className="script-tools">
        <button type="button" className="btn small primary" disabled={!check.ok} onClick={() => check.ok && onApply(check.script)}>
          Apply JSON
        </button>
        <button type="button" className="btn small quiet" onClick={onClose}>
          Close JSON
        </button>
      </div>
    </div>
  );
}

/** A def name not in `taken`: cond, cond2, cond3, … */
function freeDefName(taken: Readonly<Record<string, string>>): string {
  if (!Object.hasOwn(taken, 'cond')) return 'cond';
  for (let n = 2; ; n++) if (!Object.hasOwn(taken, `cond${n}`)) return `cond${n}`;
}

/** The rotation script editor (see the file comment). */
export function ScriptEditor({ script, onChange, context, spells, auras, catalog, fires, onConvert, onClear }: ScriptEditorProps) {
  const rules = useMemo(() => script?.rules ?? [], [script]);
  const defs = useMemo(() => script?.defs ?? {}, [script]);
  const defNames = Object.keys(defs);
  const options = useMemo(() => idOptions(context, spells, catalog), [context, spells, catalog]);
  const [json, setJson] = useState(false);
  const [openRows, setOpenRows] = useState<ReadonlySet<number>>(() => new Set());
  const [insertMessage, setInsertMessage] = useState('');
  const fieldRef = useRef<{ field: FieldRef; el: HTMLTextAreaElement } | null>(null);
  const caretRef = useRef<{ el: HTMLTextAreaElement; at: number } | null>(null);

  // Live validation against the next fight's build (compileScript: validateScript plus "rule left out").
  const issues = useMemo(() => {
    if (script === undefined) return { errors: [] as ScriptIssue[], warnings: [] as ScriptIssue[] };
    const c = compileScript(script, context);
    return { errors: c.errors, warnings: c.warnings };
  }, [script, context]);

  // Puts the caret after an inserted text once the new value is rendered.
  useEffect(() => {
    const c = caretRef.current;
    if (c === null) return;
    caretRef.current = null;
    if (!c.el.isConnected) return;
    c.el.focus();
    c.el.setSelectionRange(c.at, c.at);
  });

  const emit = (nextRules: ScriptRule[], nextDefs: Record<string, string> = defs) => {
    const hasDefs = Object.keys(nextDefs).length > 0;
    if (nextRules.length === 0 && !hasDefs) onChange(undefined);
    else onChange(hasDefs ? { rules: nextRules, defs: nextDefs } : { rules: nextRules });
  };
  const handlers = useRef({
    onRule: (_i: number, _r: ScriptRule) => {},
    onMove: (_i: number, _by: -1 | 1) => {},
    onDuplicate: (_i: number) => {},
    onDelete: (_i: number) => {},
  });
  handlers.current = {
    onRule: (i, r) => emit(rules.map((x, j) => (j === i ? r : x))),
    onMove: (i, by) => {
      const j = i + by;
      if (j < 0 || j >= rules.length) return;
      const next = [...rules];
      [next[i], next[j]] = [next[j]!, next[i]!];
      setOpenRows(new Set());
      emit(next);
    },
    onDuplicate: (i) => {
      if (rules.length >= SCRIPT_LIMITS.rules) return;
      setOpenRows(new Set());
      emit([...rules.slice(0, i + 1), { ...rules[i]! }, ...rules.slice(i + 1)]);
    },
    onDelete: (i) => {
      setOpenRows(new Set());
      emit(rules.filter((_, j) => j !== i));
    },
  };
  // Stable callbacks for the memoized rows.
  const stable = useMemo(
    () => ({
      onRule: (i: number, r: ScriptRule) => handlers.current.onRule(i, r),
      onMove: (i: number, by: -1 | 1) => handlers.current.onMove(i, by),
      onDuplicate: (i: number) => handlers.current.onDuplicate(i),
      onDelete: (i: number) => handlers.current.onDelete(i),
      onOpen: (i: number, open: boolean) =>
        setOpenRows((prev) => {
          const next = new Set(prev);
          if (open) next.add(i);
          else next.delete(i);
          return next;
        }),
      onFocusField: (field: FieldRef, el: HTMLTextAreaElement) => {
        fieldRef.current = { field, el };
      },
    }),
    [],
  );

  const addRule = () => {
    if (rules.length >= SCRIPT_LIMITS.rules) return;
    const first = options.cast[0];
    setOpenRows(new Set([rules.length]));
    emit([...rules, { action: 'cast', id: first?.id ?? '' }]);
  };
  const addDef = () => {
    if (defNames.length >= SCRIPT_LIMITS.defs) return;
    emit(rules, { ...defs, [freeDefName(defs)]: '' });
  };
  const renameDef = (from: string, to: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(defs)) next[k === from ? to : k] = v;
    emit(rules, next);
  };
  const setDef = (name: string, text: string) => emit(rules, { ...defs, [name]: text });
  const deleteDef = (name: string) => {
    const next = { ...defs };
    delete next[name];
    emit(rules, next);
  };

  const insert = (text: string) => {
    const f = fieldRef.current;
    if (f === null || !f.el.isConnected) {
      setInsertMessage('Click into a condition first, then Insert.');
      return;
    }
    const value = f.el.value;
    const start = f.el.selectionStart ?? value.length;
    const end = f.el.selectionEnd ?? start;
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > SCRIPT_LIMITS.exprLength) {
      setInsertMessage(`A condition is at most ${SCRIPT_LIMITS.exprLength} characters.`);
      return;
    }
    setInsertMessage('');
    caretRef.current = { el: f.el, at: start + text.length };
    if (f.field.kind === 'rule') {
      const i = f.field.index;
      const rule = rules[i];
      if (rule === undefined) return;
      handlers.current.onRule(i, { ...rule, if: next });
    } else if (Object.hasOwn(defs, f.field.name)) setDef(f.field.name, next);
  };

  const ruleIssues = useMemo(
    () =>
      rules.map((_, i) => ({
        errors: issuesOf(issues.errors, `rules[${i}]`),
        warnings: issuesOf(issues.warnings, `rules[${i}]`),
      })),
    [rules, issues],
  );
  const loose = {
    errors: issues.errors.filter((e) => !/^(rules\[\d+\]|defs\.)/.test(e.path)),
    warnings: issues.warnings.filter((w) => !/^(rules\[\d+\]|defs\.)/.test(w.path)),
  };
  const nErr = issues.errors.length;
  const nWarn = issues.warnings.length;
  const summary =
    nErr + nWarn === 0
      ? 'No errors or warnings'
      : `${nErr} ${nErr === 1 ? 'error' : 'errors'}, ${nWarn} ${nWarn === 1 ? 'warning' : 'warnings'}`;

  return (
    <div className="script-editor">
      <div className="script-tools">
        <button type="button" className="btn small" onClick={addRule} disabled={rules.length >= SCRIPT_LIMITS.rules}>
          Add Rule
        </button>
        <button type="button" className="btn small quiet" onClick={onConvert}>
          Convert From Basic Rotation{rules.length > 0 ? '…' : ''}
        </button>
        <button type="button" className="btn small quiet" aria-pressed={json} onClick={() => setJson((j) => !j)}>
          Edit as JSON
        </button>
        {script !== undefined && (
          <button type="button" className="btn small quiet" onClick={onClear}>
            Clear Script…
          </button>
        )}
        <span className="spacer" />
        {script !== undefined && (
          <span className={nErr > 0 ? 'valid bad' : nWarn > 0 ? 'valid warn' : 'valid'} role="status" aria-label="Script check">
            {summary}
          </span>
        )}
      </div>
      {json && (
        <JsonView
          script={script}
          context={context}
          onClose={() => setJson(false)}
          onApply={(s) => {
            setJson(false);
            setOpenRows(new Set());
            onChange(s);
          }}
        />
      )}
      <IssueList errors={loose.errors} warnings={loose.warnings} />
      {rules.length === 0 ? (
        <div className="empty-state">
          <p>
            <strong>No rules yet.</strong> Add a rule or convert the basic rotation.
          </p>
          <p className="note">
            A script is a priority list: the first rule whose condition holds and whose action is ready wins; a rule the game
            refuses (cooldown, no mana) passes to the next. While it has rules, it plays instead of the basic rotation.
          </p>
          <div className="script-tools">
            <button type="button" className="btn small primary" onClick={addRule}>
              Add the First Rule
            </button>
            <button type="button" className="btn small" onClick={onConvert}>
              Convert the Basic Rotation
            </button>
          </div>
        </div>
      ) : (
        <ol className="rules se-rules" aria-label="Rotation rules">
          {rules.map((rule, i) => (
            <RuleRow
              key={i}
              index={i}
              count={rules.length}
              rule={rule}
              options={options}
              errors={ruleIssues[i]!.errors}
              warnings={ruleIssues[i]!.warnings}
              fires={fires === null ? null : (fires[`rules[${i}]`] ?? 0)}
              open={openRows.has(i)}
              {...stable}
            />
          ))}
        </ol>
      )}
      <div className="defs">
        <section aria-label="Named conditions">
          <h2>Named Conditions</h2>
          <p className="note">
            Write a condition once and use it as <code>$name</code> in any rule (no cycles).
          </p>
          {defNames.length > 0 && (
            <ul className="se-defs">
              {defNames.map((name) => (
                <DefRow
                  key={name}
                  name={name}
                  text={defs[name] ?? ''}
                  taken={(n) => Object.hasOwn(defs, n)}
                  errors={issues.errors.filter((e) => e.path === `defs.${name}`)}
                  warnings={issues.warnings.filter((w) => w.path === `defs.${name}`)}
                  onRename={renameDef}
                  onText={setDef}
                  onDelete={deleteDef}
                  onFocusField={stable.onFocusField}
                />
              ))}
            </ul>
          )}
          <button type="button" className="btn small quiet" onClick={addDef} disabled={defNames.length >= SCRIPT_LIMITS.defs}>
            Add Named Condition
          </button>
        </section>
        <VariableHelp context={context} spells={spells} auras={auras} catalog={catalog} defs={defNames} onInsert={insert} message={insertMessage} />
      </div>
    </div>
  );
}

export default ScriptEditor;
