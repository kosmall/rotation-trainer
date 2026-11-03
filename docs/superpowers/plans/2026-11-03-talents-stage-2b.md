# Stage 2b: Talents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Data-driven Warlock talents: tree data generated from wowsims, talent effects as data feeding the engine and the bot, BIS-style presets and WowSimsExporter import/export of the talent string, and a Talents panel with a tree editor.

**Architecture:** A generator writes `talentTree.json` (committed); pure modules validate and encode talent strings; `TALENT_EFFECTS` turns ranks into engine primitives (modifiers, multipliers, auras, hooks, enabled spells); `SetupConfig.talents` carries the build into `buildDestructionWarlock` and the priority rules; the UI gets a Talents panel. Defaults stay the author's build so every stage 1–simulator number is unchanged.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest (node project for data/setup, jsdom for `tests/ui`), `@testing-library/react`, Playwright (smoke), node scripts. Wowsims clone (MIT, read-only, UNTRUSTED data): `/tmp/claude-0/-home-user-rotation-trainer/ace88de3-2ad9-58eb-888e-cd9aba355637/scratchpad/clone/tbc-new`.

**Spec:** `docs/superpowers/specs/2026-11-03-talents-stage-2b-design.md`. Builds on all earlier plans and ledgers (`.superpowers/sdd/*/progress.md`).

**Execution order:** Tasks 1–5 in order. Stopping after Task 3 leaves a working app (data and setup done, no editor).

## Global Constraints

- Default setup (author's talents) gives exactly the earlier results: bot means 1425.1766666666667 (queue window 400) / 1428.3350000000003 (0), raid-log 2294.108333333333, Icon+Band 1379.2966666666666 / 1373.4900000000002, all bot logs byte-identical (the simulator equivalence tests pin them), derived stats and spec fields equal for the author's build.
- `src/engine` untouched unless unavoidable (state why; prefer new modifier/aura/hook data). The talent modules are pure and never throw on hostile input (talent strings from storage and imports are untrusted: length-capped, validated, prototype-safe); `applySetup`/`normalizeSetup` stay pure.
- Every game number carries a source (wowsims `sim/warlock/talents.go`, `spell_data_auto_gen.go`, tree JSON, Wowhead TBC tooltip) or `// UNVERIFIED`; sources, counts and the unmodelled list go into `docs/data-sources.md` ("Part I: talents").
- Unmodelled talents are never silently skipped: listed with reasons, flagged in the UI.
- Hotkey rules stay (rulings S5; item row keys Z X C V B N); slot 8 (R17) becomes Conflagrate only when the talent is taken. Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Golden equality for the author's build through the new data-driven path, byte-identical logs, RNG draw counts (Tasks 2, 3).
2. Talent effect values and which talents are expressible (Task 2): a wrong value silently corrupts every number.
3. Validation: point budget 61, row requirements (5 points per row), prerequisites, max ranks, removal that would break dependants (Task 1, 5).
4. Spell availability from talents (Conflagrate/Shadowburn/Shadowfury...) and the bot with builds that lack the rotation's spell (Task 2).
5. UI: keyboard and touch operation of the tree, mobile layout, hostile imports (Task 4).

---

### Task 1: Tree data, talent string codec and validation

**Files:**
- Create: `scripts/build-talent-tree.mjs`, `src/data/classes/warlock/talentTree.json` (generated), `src/data/classes/warlock/talentTree.ts`, `tests/data/talent-tree.test.ts`
- Modify: `scripts/fetch-icons.mjs` (talent icons), `public/icons/talents/` (new JPEGs), `package.json` (script), `src/data/classes/warlock/talents.ts` (re-export the codec: `parseTalentString`/`TALENT_ORDER` consumers keep working), `docs/data-sources.md`

**Interfaces:**
- `TalentDef { id: string (wowsims fieldName); name; tree: 0|1|2; row: number; col: number; maxRank: number; prereq?: string; icon: string; wowheadIds: number[] (per rank); descriptions: string[] (per rank) }`; `TALENT_TREE: { trees: { name; talents: TalentDef[] }[] }`; `encodeTalents(ranks: Record<string, number>): string`, `decodeTalents(text: string): { ranks: Record<string, number>; points: [number, number, number]; errors: string[] }`, `validateTalents(ranks): string[]` (violations: exceeds maxRank, row needs N points in the tree, prereq not maxed, total > 61, unknown talent), `canAddPoint(ranks, id)` / `canRemovePoint(ranks, id)` (removal blocked when it would break a dependant or a lower row requirement) with reason strings; strings are capped (e.g. 200 chars), never throw.
- Generator reads `ui/sim/talents/trees/warlock.json` (check its real structure: fieldName, location row/col, prereqLocation, spellIds, maxPoints, iconName; the 3 trees; verify 64 talents and the order against the existing `TALENT_ORDER`), icons via the CDN like `fetch-icons.mjs`; descriptions from the Wowhead tooltip API (one generator pass, sequential and gentle; committed output; if a tooltip is unavailable the description is empty and a test counts them).

- [ ] **Step 1: Write the failing tests:** `64 talents, 21/22/21 per tree order equal to TALENT_ORDER`; `the author's build string decodes to 0/21/40 and re-encodes identically`; each wowsims preset string from ui/specs/warlock/dps/presets.ts validates with 0 errors and 61 or fewer points; row/prereq/maxRank/total violations are detected one by one (hand-built cases: 6 points in row 2 without 5 in row 1; Conflagrate without Backlash? use the real prerequisites from the JSON; maxRank+1; 62 points); `canRemovePoint` blocks removing Cataclysm points that support row N talents; hostile strings (empty, 'abc', 10k chars, '--', '9-9-9', unicode, __proto__) -> errors, no throw, idempotent re-encode; trailing zeros trimmed or kept as today (state which and pin: the existing parseTalentString behaviour must not change for its current callers); icons present for every talent (`npm run icons` clean).
- [ ] **Step 2: Run `npx vitest run tests/data` — Expected: FAIL.**
- [ ] **Step 3: Implement** the generator, run it, commit the JSON, icons in a separate commit; document in Part I.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build && npm run icons` — Expected: PASS (golden values unchanged).**
- [ ] **Step 5: Commit** `feat(data): warlock talent tree data and talent string codec`.

---

### Task 2: Talent effects as data, talents in the spec and the bot

**Files:**
- Create: `src/data/classes/warlock/talentEffects.ts`, `tests/data/talent-effects.test.ts`
- Modify: `src/data/classes/warlock/talents.ts`, `src/data/classes/warlock/destruction.ts`, `src/data/classes/warlock/rotation.ts`, `src/data/classes/warlock/spells.ts` (availability flags only), `src/data/types.ts` (if the spec needs a `talents` field), `docs/data-sources.md`

**Interfaces:**
- `TalentEffect = { modifiers?: SpellModifier[]; statMultipliers?: StatMultipliers; statBonuses?: Partial<RawStats>; auras?: AuraDef[]; hooks?: SpecHooks; spells?: string[] (spell ids made available) }`; `TALENT_EFFECTS: Record<string, (rank: number) => TalentEffect>` with a source comment per entry; `UNMODELLED_TALENTS: Record<string, string>` (reason); `effectsForBuild(ranks): { modifiers; statMultipliers; statBonuses; auras; hooks; spells; unmodelled: string[] }` (pure; fresh objects per call).
- The author's talents (Cataclysm, Bane, Devastation, Ruin, Emberstorm, Backlash, Shadow and Flame, Demonic Sacrifice, Fel Intellect, Expansive-Mind-like multipliers already in `destructionStatMultipliers`...) reproduced EXACTLY as today (same values, same order of modifiers so logs and floats are identical). Add the other expressible talents per the spec (research each in wowsims/Wowhead; mark `UNVERIFIED` where unclear): record in the report which are modelled and which not and why.
- `buildDestructionWarlock(options, gear?, db?, talents?)`: talents default = the author's string; the spec's modifiers/multipliers/spells come from `effectsForBuild`; spells not talented are absent (Shadowburn, Conflagrate, Shadowfury, ...) and are not bound; Conflagrate bound to slot 8 only when talented (R17 closed; the default build has none, so the default keybinds are unchanged); `rotation.ts` reads `talentCastTimeMs`, the Shadow Bolt cost and the Shadowburn window from the build instead of module constants (buildPriority gets the build/derived numbers as an optional argument; absent = author's, byte-identical); a rotation whose spell is not available (e.g. Shadowburn finisher without the talent, Immolate...) skips that step and `describe`s a warning instead of failing; `dotExtraTicks` etc. remain driven by set bonuses.

- [ ] **Step 1: Write the failing tests:** `golden: the author's build through effectsForBuild gives exactly the old talentModifiers (deep equal, same order), same spec, bot logs byte-identical (default, Icon+Band, raid-log, 9 gear presets: reuse the equivalence fixtures), means exact`; `each modelled talent: rank 0 gives no effect; max rank values (hand-checked table with sources); ranks scale linearly where the source does`; `unmodelled talents listed with reasons`; `Conflagrate talent binds slot 8 and the spell is castable; without it unknown-spell`; `a build without Shadowburn: the finisher step is dropped, bot still plays; Shadow Bolt cast time and cost follow Bane/Cataclysm ranks (e.g. no Bane: 3000 ms)`; `an Affliction-heavy build changes damage in the expected direction (Shadow Mastery, Improved Corruption...) in a seeded 20-fight comparison`; `buildPriority default unchanged (view equality with the previous output)`; hostile rank maps.
- [ ] **Step 2: Run `npx vitest run tests/data tests/bot tests/setup` — Expected: FAIL.**
- [ ] **Step 3: Implement**; keep `talentRank`/`destructionTalentString` exports working for existing imports; document in Part I.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS (golden values exact).**
- [ ] **Step 5: Commit** `feat(data): data-driven talent effects`.

---

### Task 3: Talents in the setup, presets and import/export

**Files:**
- Create: `src/data/classes/warlock/talentPresets.ts`, `tests/data/talent-presets.test.ts`, `tests/setup/talents-setup.test.ts`
- Modify: `src/setup/types.ts`, `src/setup/defaults.ts`, `src/setup/applySetup.ts`, `src/setup/presets.ts`, `src/setup/wowsimsGear.ts` (apply the imported talents), `src/sim-runner/*` only where the request builds specs (check it passes talents through `applySetup`)

**Interfaces:**
- `SetupConfig.talents?: string` (optional; absent = the author's; present and valid = that build; invalid strings normalize to the author's build with no throw); `normalizeSetup` validates through `decodeTalents`/`validateTalents` (an invalid build is not silently "fixed": it falls back to the author's); `applySetup` passes the talents to `buildSpec`; setup presets keep the player's talents (like gear, F-2 style), `Reset to defaults` restores the author's; the preset-matching key (`fightKey`) includes talents when non-default.
- `TALENT_PRESETS` (id, name, spec, phase note, string, source) from wowsims `ui/specs/warlock/dps/presets.ts` + "My build (export)" (author's); each validated; Fire presets (if any) hidden; `offeredTalentPresets()`.
- WowSimsExporter import: `parseWowSimsExport` already returns `talents` (stage 2a stored only): Task 3 lets the Gear/Talents UI apply it through the validator; `exportTalents(ranks)`.
- The simulator (`src/sim-runner`) uses the setup's talents (same path as the game): equivalence test game vs simulator for a non-default build.

- [ ] **Step 1: Write the failing tests:** normalize (missing/invalid/hostile `talents` -> author's, valid kept, idempotent, storage round trip, old stored setups unchanged, size cap); presets validate and build; applying a preset changes derived numbers; setup presets keep talents; import of the real sample applies the author's string; simulator equivalence for a Destro/Nightfall preset (game fight vs core run, exact); the pending-setup rules (talents change applies from the next fight) at the setup level; golden values.
- [ ] **Step 2: Run `npx vitest run tests/data tests/setup tests/sim-runner` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): talents in the setup, presets and import`.

---

### Task 4: Talents panel (tree editor)

**Files:**
- Create: `src/ui/TalentsPanel.tsx`, `src/ui/talentView.ts`, `tests/ui/talents-panel.test.tsx`
- Modify: `src/ui/GameView.tsx`, `src/ui/game.css`, `README.md`

**Interfaces:**
- `TalentsPanel({ talents, presets, onChange, disabled? })`: collapsible `<details>` "Talents"; three trees as CSS grids (row/col from the data), each talent a button with icon (fallback initials tile), rank badge `r/max`, accessible name "Name, rank r of max" plus state (available, locked: reason, unmodelled); click or Enter/Space adds a point, right click or Shift+Enter/dedicated − button removes; `canAddPoint`/`canRemovePoint` reasons shown in a polite status line; prerequisite arrows (CSS lines or a simple marker); tooltip/popover with the current and next rank description and "not modelled"; counters per tree and total ("0 / 21 / 40, 0 left"); presets (aria-pressed by deep equality, "Custom"); import/export text field (`textarea`, hostile text handled, Apply only when valid, shows violations), Reset to the author's build; summary of modelled/unmodelled points; fully controlled; every edit through the validators then `normalizeSetup`; hotkey guard S5; mobile: trees stack vertically, touch targets >= 32 px, no horizontal scroll at 390 px; applies from the next fight (a not-started fight takes it at once) with the pending note.

- [ ] **Step 1: Write the failing tests** (jsdom; fake timers as in the Gear panel tests): renders three trees with 64 talents and the author's ranks; clicking adds a point and updates counters; a locked talent shows its reason and does nothing; removing a supporting point is blocked with a message; right click and the − button remove; keyboard operation; presets and Custom; import valid/invalid/hostile; export round trip; reset; unmodelled markers; `typing in the textarea never triggers hotkeys`; stored talents round trip, corrupt stored talents fall back; a fight that started keeps its talents until R; Conflagrate talent appears on slot 8 of the action bar after the next fight; golden values.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): the Talents panel, presets, import/export.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): open Talents, pick each preset and compare Stats/DPS (simulator mean), add and remove points, hit a prerequisite block, import a string, take Conflagrate and see slot 8 and cast it, reload (persisted), desktop dark/light and phone 390 px screenshots (read them, fix visible defects), no console errors — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): talents panel with tree editor`.

---

### Task 5: Docs and final review

**Files:** `README.md`, `docs/data-sources.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list)

- [ ] **Step 1:** complete Part I (sources, tree data, talent effect table with values and ranks, unmodelled list with reasons, validation rules, presets and origin, import/export, UI notes, known simplifications); README Polish; stage list pointer.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run icons`.
- [ ] **Step 3:** final whole-feature review (diff from the plan's base commit, the Review Focus list; independent re-derivation of every modelled talent value from wowsims/Wowhead; golden equality and byte-identical logs against the pre-feature commit in a scratch copy for ~10 new scenarios; hostile talent strings fuzz; the simulator with non-default builds; Playwright end to end); fix Critical/Important defects with tests and cheap minors.
- [ ] **Step 4: Commit** `docs: stage 2b talents`.

---

## Self-Review

- **Spec coverage:** §2 → Task 1; §3 → Task 2; §4 → Task 3; §5 → Task 4; §6 risks → Review Focus and Task 5.
- **Type consistency:** `TalentDef`, `decodeTalents`, `validateTalents`, `canAddPoint`, `canRemovePoint` (Task 1) are used by `effectsForBuild` (Task 2), the setup validation (Task 3) and the panel (Task 4); `SetupConfig.talents` (Task 3) feeds `buildDestructionWarlock` (Task 2) and the simulator.
- **Judgement left to the executor:** exactly which talents are expressible with the current primitives, trailing-zero handling of the string, how prerequisites are drawn, tooltip vs popover.
