// Rotation scripts (rotation scripts Task 1, spec §2 A): an ordered list of rules with `if`
// expressions over the fight state. Scripts are DATA: this module family has its own lexer,
// parser, printer and closure compiler (no eval/Function), reads only the snapshot and a fixed
// context, and never throws on untrusted input. Framework-free; no wall clock. Grammar, variables,
// units and error format: docs/data-sources.md, "Part J: rotation scripts".

/** One rule: the first rule whose condition holds and whose action the engine accepts wins. */
export interface ScriptRule {
  /** `cast` a spell, `use` an item action, or `wait` (do nothing at this step while `if` holds). */
  action: 'cast' | 'use' | 'wait';
  /** Spell id (`cast`), item catalog entry id such as `item:29370` or `destruction-potion` (`use`); unused by `wait`. */
  id?: string;
  /** The condition (an expression, see Part J); absent or blank: always. Required by `wait`. */
  if?: string;
  label?: string;
  comment?: string;
  /** false: the rule is kept but skipped. Absent: true. */
  enabled?: boolean;
}

export interface Script {
  rules: ScriptRule[];
  /** Named conditions, used as `$name` in any expression (no cycles). */
  defs?: Record<string, string>;
}

export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

/**
 * Expression AST. `and` / `or` are n-ary (at least two args): an unparenthesized chain
 * `a && b && c` is one node; parentheses keep their grouping (`(a && b) && c` nests). Positions
 * are not part of the AST (see `positionOf` in parser.ts), so a parse of the printed text
 * deep-equals the original.
 */
export type Expr =
  | { kind: 'bool'; value: boolean }
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  /** A variable path such as `mana.pct` or `target.aura.immolate.remaining`. */
  | { kind: 'var'; path: string }
  /** `$name`: a reference to `Script.defs[name]`. */
  | { kind: 'def'; name: string }
  | { kind: 'not'; arg: Expr }
  | { kind: 'and'; args: Expr[] }
  | { kind: 'or'; args: Expr[] }
  | { kind: 'cmp'; op: CmpOp; left: Expr; right: Expr }
  /** `fight.last(N)` or `has(id)` (a bare id argument of `has` parses as a string). */
  | { kind: 'call'; fn: string; args: Expr[] };

/** The value types of the language: no coercion between them. */
export type ValueType = 'bool' | 'num' | 'str';

/**
 * What the ids of a script resolve against: the CURRENT build, gear and fight (Task 2 builds it
 * from the applied setup; `scriptContextOf` in vars.ts from a spec).
 */
export interface ScriptContext {
  /** Castable spells (not item actions): `cast` rules, `cd.`, `cast.`, `casting.`, `inflight.`, `has()`. */
  readonly spellIds: readonly string[];
  /** Visible aura ids (self or target): `self.aura.<id>.*`, `target.aura.<id>.*`. */
  readonly auraIds: readonly string[];
  /**
   * The item actions of the setup: catalog entry id (`item:29370`, `destruction-potion`) and the
   * action's spell id (`use-item-29370`, `use-destruction-potion`). `use` rules, `use.<id>.count`,
   * `cd.<id>.*` and `has()` accept either id.
   */
  readonly itemActions: readonly { readonly id: string; readonly spellId: string }[];
  /**
   * When Heroism ends in this fight (ms), or null when the fight has no Heroism that comes up
   * (disabled, or starting at or after the end): `heroism.over`, as the item-use rules
   * (itemUse.ts `with-heroism`).
   */
  readonly heroismEndMs: number | null;
}

/**
 * Run-time extension passed to every compiled expression next to the snapshot. Reserved: no
 * variable reads it yet (all state comes from the snapshot); pass `EMPTY_EXT`.
 */
export type ScriptExt = Readonly<Record<string, unknown>>;

/** A validation message. `path` like `rules[2].if` or `defs.burst`; `pos` 0-based in that text. */
export interface ScriptIssue {
  path: string;
  message: string;
  pos?: number;
  suggestion?: string;
}

export const SCRIPT_LIMITS = Object.freeze({
  rules: 200,
  defs: 50,
  /** Characters of one expression (`if` or a def). */
  exprLength: 500,
  /** AST depth and nesting of parentheses, `!` and calls. */
  depth: 20,
  label: 100,
  comment: 1000,
  /** At most this many issues of each kind are reported. */
  issues: 200,
});
