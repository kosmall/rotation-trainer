# Rotation Scripts, Scenarios and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rotation scripting language (ordered rules with `if` expressions over fight state), compiled into the bot's priority list; a scenario library with JSON import/export, JSON Schema, CLI validator/runner for AI agents; a comparison tool with paired statistics.

**Architecture:** (1) `src/script/*` framework-free: expression lexer/parser/printer/evaluator over a documented variable set, rule/script/scenario types, validation with paths and suggestions; (2) a compiler turning a script into `PriorityStep[]` (plus a `wait` step kind) and a converter from the basic configurator to an equivalent script; (3) scenario storage and file format (`src/scenarios/*`), docs, schema, examples and CLI; (4) simulator extensions (`ruleFires`, paired comparison on common random numbers); (5) UI: script editor, scenarios panel, compare panel.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest (node for `src/script`, `src/scenarios`, `src/sim-runner`; jsdom for `tests/ui`), tsx for the CLI, Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-11-03-rotation-scripts-and-scenarios-design.md`. Builds on all earlier plans and ledgers (`.superpowers/sdd/*/progress.md`).

**Execution order:** Tasks 1–6 in order, starting after stage 2b is complete. Stopping after Task 4 leaves a usable CLI and library without UI.

## Global Constraints

- With no script (every existing setup) and with "Convert to script" applied to any existing configuration the bot logs, RNG draws and means stay BYTE-IDENTICAL: golden 1425.1766666666667 / 1428.3350000000003, raid-log 2294.108333333333, Icon+Band 1379.2966666666666 / 1373.4900000000002, and the simulator/bot equivalence fixtures. The converter is proven against the basic configurator over many scenarios.
- Scripts are DATA: own parser, no `eval`/`Function`/dynamic import; conditions are pure functions of the snapshot; step-skipping in the bot stays exact (equivalence property test with random scripts vs full 1-step stepping).
- Engine changes are read-only additions only (completed-cast and item-use counters in the snapshot), with byte-identical logs proven; no wall clock in `src/engine`/`src/script`.
- Untrusted input everywhere (stored scenarios, pasted JSON, files): size/depth/count limits, `__proto__`-safe, never throws, stable error strings with paths (`rules[2].if`), warnings vs errors distinction; file limit 200 000 chars, 100 scenarios, 200 rules, expression length 500, depth 20.
- Every game id reference (spells, auras, actions) is validated against the CURRENT build/gear/talents; unknown = warning with the closest id suggestion.
- Hotkey rules stay (S5; item row Z X C V B N); text-like fields and textareas swallow keys. Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Converter equivalence (basic configurator -> script) byte for byte over many scenarios; random-script equivalence of step skipping (Tasks 1, 2).
2. Parser correctness and safety: precedence, associativity, errors with positions, hostile inputs, round-trip print/parse, defs cycles (Task 1).
3. Semantics of each variable against the engine (units: seconds vs ms, aura remaining when inactive, counters) (Task 1).
4. Paired statistics: same seeds per run index, difference SEM from paired differences, CI, edge cases (Task 4).
5. Import/export robustness and the AI-agent workflow (docs, schema, CLI) (Task 3).
6. UI usability, accessibility, mobile (Task 5).

---

### Task 1: Script language (expressions, rules, validation)

**Files:**
- Create: `src/script/{types,lexer,parser,printer,evaluate,vars,validate}.ts`, `tests/script/*.test.ts`
- Modify: `src/engine/types.ts` + `src/engine/sim.ts` (read-only snapshot counters `castCounts`, `useCounts`), `tests/engine/*` (counter tests), `docs/data-sources.md` ("Part J: rotation scripts")

**Interfaces:**
- `type ScriptRule = { action: 'cast' | 'use' | 'wait'; id?: string; if?: string; label?: string; comment?: string; enabled?: boolean }`; `type Script = { rules: ScriptRule[]; defs?: Record<string, string> }`.
- Expression AST (`Expr`): literals, variable reads, `not`, `and`, `or`, comparisons, function calls (`fight.last(N)`, `has(id)`), def references `$name`; `parseExpr(text): { ok: true; ast } | { ok: false; error: { pos; message } }`; `printExpr(ast)` (canonical, parse(print(x)) deep-equals x); `compileExpr(ast, ctx): (s: SimSnapshot, ext: Ext) => boolean | number | string` (closures, no allocation per call); variables resolved from the documented list (spec section 2 A) with units: seconds as numbers, `remaining` of an inactive aura = 0, `stacks`/`charges` of an inactive aura = 0, `casting` = spell id or '', ids contain letters, digits, `-`, `:`.
- Snapshot additions: `SimSnapshot.castCounts: Record<string, number>` (completed non-item casts per spell id) and `useCounts: Record<string, number>` (item actions used per id); engine tests prove logs byte-identical and counters correct (including queue, cancelled casts excluded, items counted at use).
- `validateScript(script, ctx): { errors: ScriptIssue[]; warnings: ScriptIssue[] }` with `ScriptIssue = { path: string; message: string; suggestion?: string }`: syntax errors, unknown variables (suggest closest), unknown ids (warning, closest id), wrong types (`cd.x.remaining < 'a'`), defs cycles and depth/length/count limits, `wait` with no `if`, `use` of an item not worn (warning).

- [ ] **Step 1: Write the failing tests:** lexer/parser: precedence (`!` > comparison > `&&` > `||`), associativity, parentheses, strings, numbers (decimals, negative), identifiers with `-` and `:`, errors with positions for 25 malformed inputs, depth 21 rejected, length 501 rejected, unicode/`__proto__`, 10k-char hostile strings finish fast; round trip on 200 random ASTs; evaluation of every variable against a hand-built snapshot (units, inactive auras, counters, `heroism.over`, `fight.last(20)`); defs expansion and cycle detection; `has(id)`; type errors; engine counters (castCounts/useCounts) with a scripted fight; snapshot byte-identity of logs; golden values.
- [ ] **Step 2: Run `npx vitest run tests/script tests/engine` — Expected: FAIL.**
- [ ] **Step 3: Implement**; document the grammar, variable list and error format in Part J.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(script): rotation script language with expressions and validation`.

---

### Task 2: Compiler, wait steps, converter and setup integration

**Files:**
- Create: `src/script/compile.ts`, `src/script/convert.ts`, `tests/script/compile.test.ts`, `tests/script/convert-equivalence.test.ts`
- Modify: `src/data/types.ts` (`PriorityStep` gets an optional `kind: 'cast' | 'use' | 'wait'` or equivalent), `src/bot/bot.ts` (wait steps), `src/setup/{types,defaults,applySetup}.ts` (`SetupConfig.script?: Script`), `src/sim-runner/*` (nothing but passing through), `src/ui/GameView.tsx` only if the Priority list display needs the new step shape

**Interfaces:**
- `compileScript(script, ctx): { steps: PriorityStep[]; fires: string[] (stable rule keys); warnings }` (pure; each rule becomes a step with a `when` over snapshot and counters; `wait` rules stop the decision for that step; disabled rules and rules with unknown ids are dropped from steps but reported; labels from `label` or generated).
- `SetupConfig.script?`: when present and non-empty it replaces `spec.priority` (the basic rotation and item rules are ignored but kept in the config); normalization (limits, hostile input), stored configs without it unchanged; preset matching (`fightKey`) includes a non-default script.
- `convertToScript(setup/config, ctx): Script`: reproduces the CURRENT priority exactly: item steps (with itemUse rules), curse, finisher, Immolate, Corruption, Life Tap, Shadow Bolt as rules whose `if` expressions are equivalent to today's `when` functions (including the unhasted cast time constants, the in-flight and in-cast guards, the fight-time rules, talents' effects as in the build); state each translation and where an exact textual form is impossible (use helper variables such as `dotRefreshDue('immolate')` documented as built-in functions if needed: add them to the language, clearly named, rather than approximate).

- [ ] **Step 1: Write the failing tests:** `convert-equivalence`: for default, Icon+Band, raid-log, consumables setups, all 9 gear presets, sb-spam and dot rotations, doom/agony/elements/none curses, several queue windows (0, 400), fight lengths (10, 60, 300), a build without Shadowburn (if the talents plan provides it) the bot logs and RNG draws with the converted script are BYTE-IDENTICAL to the basic configurator (full logs, seeds 1-10); compile: ordering, disabled rules, unknown ids dropped with warnings, `wait` blocks lower rules, a rule rejected by the engine falls through; the user's example scenario (trinket 1 when `heroism.active && target.aura.shadow-vulnerability.active`, then trinket 2 when `use.item:<id1>.count >= 1`) scripted in a fight: trinket 1 not before both are up, trinket 2 only after; random-script property test: 200 random valid scripts, step skipping (the bot's optimisation) equals full 1-ms stepping logs; golden values.
- [ ] **Step 2: Run `npx vitest run tests/script tests/bot tests/setup` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(script): compiler, wait steps and converter from the basic rotation`.

---

### Task 3: Scenario format, library, import/export, docs, schema, examples, CLI

**Files:**
- Create: `src/scenarios/{types,format,storage,library}.ts`, `docs/scenario-format.md`, `docs/scenario.schema.json`, `docs/scenarios/*.json` (3-5 examples incl. the user's trinket example), `scripts/scenario-validate.ts`, `scripts/scenario-run.ts`, `tests/scenarios/*.test.ts`
- Modify: `package.json` (scripts `scenario:validate`, `scenario:run`), `docs/data-sources.md`

**Interfaces:**
- `Scenario = { $schema?; format: 'rotation-trainer.scenario'; version: 1; name; description?; author?; script: Script; setup?: unknown (normalized as a SetupConfig subset); simulation?: { runs?; seed? }; notes?; createdAt?; updatedAt? }`; `parseScenario(text, ctx): { ok; scenario?; errors; warnings }` (size cap 200 000, depth, proto-safe, never throws, wrong format/version -> clear error, unknown extra fields ignored with a warning); `exportScenario(scenario): string` (pretty, stable key order, round trip equal); library: `loadScenarios(storage)`, `saveScenarios(storage, list)`, add/duplicate/rename/delete/update with unique ids, limits (100 scenarios, total size cap), corrupt storage -> empty list.
- `applyScenario(config, scenario, { includeSetup })` pure: returns the new SetupConfig (script set; setup parts replaced when included, normalized through `normalizeSetup`).
- `docs/scenario-format.md`: a self-contained spec an AI agent can follow without reading code: format, rule fields, expression grammar (EBNF), the full variable and function list with units and examples, how to find spell/aura/item ids (tables generated from the data: `npm run scenario:ids` prints them, or a generated section in the doc kept in sync by a test), worked examples, common mistakes, and a prompt template for asking an agent to build a scenario; `docs/scenario.schema.json` (JSON Schema draft 2020-12, validated by a test with a JSON Schema validator already present or a small structural check test; if adding a dependency, say so) ; examples validated by a test.
- CLI: `npm run scenario:validate -- file.json` prints errors/warnings with paths, exit code 1 on errors; `npm run scenario:run -- file.json [--runs N] [--seed S] [--json]` runs the simulator core (default setup unless the scenario has one) and prints mean DPS, sigma, SEM, CI, per-rule fires; usable without a browser (tsx).

- [ ] **Step 1: Write the failing tests:** parse/export round trip; 30 hostile inputs (empty, huge, deep, `__proto__`, wrong types, wrong version, extra fields); examples all valid and runnable (the user's example yields plausible results); library operations and limits; corrupt storage; applyScenario with and without setup; schema validates every example and rejects mutated ones; docs id tables in sync with the data (generated section test); CLI validate on good/bad files (spawn via tsx or call the module main), CLI run determinism (same seed same output); golden values.
- [ ] **Step 2: Run `npx vitest run tests/scenarios tests/script` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(scenarios): scenario format, library, schema, docs and CLI`.

---

### Task 4: Simulator extensions: rule fires and paired comparison

**Files:**
- Create: `src/sim-runner/compare.ts`, `tests/sim-runner/compare.test.ts`
- Modify: `src/sim-runner/{types,run}.ts`, `src/sim-runner/worker.ts`, `src/sim-runner/client.ts`, `docs/data-sources.md`

**Interfaces:**
- `SimResult.ruleFires?: Record<string, { label; meanFires: number }>` (average times each rule's action was accepted per fight; from the log: attribute each accepted cast/use to the rule that fired: the bot reports the winning step key through a read-only callback so the log is unchanged).
- `compare(requests: SimRequest[] (2-5), opts): Promise<CompareResult>` running every scenario with the SAME seeds per run index (`mixSeed(seed, i)` as today), results: per scenario `SimResult`, and for each non-baseline `delta = { mean; sem (from paired differences, n-1); ci95; zscore; significant: boolean (CI excludes 0); ranks }`; chunked, abortable, worker-capable; deterministic.

- [ ] **Step 1: Write the failing tests:** ruleFires sums equal accepted action counts and are 0 for rules that never fire; paired delta of identical scenarios is exactly 0 with sem 0 and not significant; delta against a known worse scenario (potion `never`) negative, CI excludes 0 at 1000 runs; delta mean equals the difference of means exactly; sem equals a reference two-pass computation on the paired differences; common random numbers verified (same seed index -> same RNG stream start: sample i of scenario A and B built from the same mixSeed); ranking; abort; chunk independence; worker equals fallback; hostile requests; golden values unchanged.
- [ ] **Step 2: Run `npx vitest run tests/sim-runner` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(sim-runner): rule fires and paired scenario comparison`.

---

### Task 5: UI: script editor, scenarios panel, compare panel

**Files:**
- Create: `src/ui/ScriptEditor.tsx`, `src/ui/ScenariosPanel.tsx`, `src/ui/ComparePanel.tsx`, `tests/ui/script-editor.test.tsx`, `tests/ui/scenarios-panel.test.tsx`, `tests/ui/compare-panel.test.tsx`
- Modify: `src/ui/GameView.tsx`, `src/ui/SetupPanel.tsx` (the Rotation section links to the editor and shows "script active"), `src/ui/game.css`, `README.md`

**Interfaces:**
- `ScriptEditor`: collapsible `<details>` "Rotation script": rule list (rows: enable checkbox, action select (cast/use/wait), id select with search from the current build (spells, available item actions, with names and icons) or a text field when unknown, `if` text field with live validation (errors under the field with position, warnings), variable help popover (searchable list of variables/functions/ids with insert buttons), label/comment fields, up/down/duplicate/delete, add rule), `defs` editor (name + expression), "Convert from basic rotation", "Use basic rotation (clear script)", JSON view/edit of the whole script (textarea, Apply only when valid), validation summary; fully controlled; edits through `normalizeSetup`; hotkey guard S5; applies from the next fight; the Priority list display shows the script's rules.
- `ScenariosPanel`: library list (name, description, updated), New/Duplicate/Rename/Delete, "Save current as scenario" (script + optional setup snapshot checkbox), Apply (with a confirmation naming what is replaced), Export (copy JSON, download file), Import (paste or file input; validation report; Save), example scenarios offered from `docs/scenarios` (bundled as data), storage-failure messages.
- `ComparePanel`: pick 2-5 scenarios (library + current), runs, seed, Run/Cancel/progress as the Simulator panel, result table (mean, sigma, SEM, delta vs baseline with CI and verdict, rank), histograms side by side, rule fires per scenario, a text explaining paired statistics and caveats (multiple comparisons).

- [ ] **Step 1: Write the failing tests** (jsdom; the runner injected; fake timers): editor: add/edit/move rules, live validation messages for syntax/unknown id/type errors, convert from basic gives the equivalent script and the same Priority list, clear script, JSON apply valid/invalid, defs, hostile text, hotkeys not triggered while typing, applies from the next fight (not-started fight at once), stored script round trip and corrupt fallback; scenarios: save/apply/duplicate/rename/delete, import valid/invalid/hostile/huge, export round trip, setup included or not, examples listed and applicable, storage failures; compare: runs 3 scenarios on the same seeds, delta/verdict displayed, cancel, clamp, settings snapshot at click, labels; the user's example scenario can be built through the UI path (typing the expressions) and its simulation result differs from the basic rotation plausibly; golden values.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): scripts, scenarios, import/export and the AI-agent workflow, compare.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): build the trinket scenario by typing, run it and the basic rotation in Compare (2000 runs, responsive UI), save to the library, export, clear storage, import it back, reload (persisted), phone 390 px and desktop dark/light screenshots (read them, fix visible defects), no console errors — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): rotation script editor, scenarios and compare panels`.

---

### Task 6: Docs and final review

**Files:** `README.md`, `docs/data-sources.md`, `docs/scenario-format.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list pointer)

- [ ] **Step 1:** complete Part J (grammar, variables with units and the engine facts behind them, compiler rules, converter equivalence, scenario format, limits, CLI, statistics of the comparison, known limits); README Polish; keep `docs/scenario-format.md` and the schema in sync (tests).
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run icons`.
- [ ] **Step 3:** final whole-feature review (diff from the plan's base commit, the Review Focus list; independent byte-identity comparison of old basic-rotation bot vs converted script in a scratch checkout for ~20 new scenarios; random-script step-skipping equivalence; parser fuzz; hostile scenario/storage fuzz; independent recomputation of the paired statistics; CLI end to end; AI-agent dry run: follow only `docs/scenario-format.md` to write a new scenario from a one-sentence request and validate/run it; Playwright end to end); fix Critical/Important defects with tests and cheap minors.
- [ ] **Step 4: Commit** `docs: rotation scripts and scenarios`.

---

## Self-Review

- **Spec coverage:** §2 A → Tasks 1–2 (+ editor in 5); §2 B → Task 3 (+ panel in 5); §2 C → Task 4 (+ panel in 5); §3 safety → Global Constraints and tests; §4 risks → Review Focus and Task 6.
- **Type consistency:** `Script`/`ScriptRule`/`Expr` (Task 1) feed `compileScript`/`convertToScript` (Task 2), `Scenario` (Task 3), `SimResult.ruleFires` and `compare` (Task 4) and the editors (Task 5); `SimSnapshot.castCounts/useCounts` (Task 1) are read by compiled conditions (Task 2).
- **Judgement left to the executor:** exact textual form of the converted conditions (built-in helper functions allowed if named and documented), the JSON Schema validation approach, the variable help UX, how rule firing is attributed.
