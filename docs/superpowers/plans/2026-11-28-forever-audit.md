# Forever Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The plan is run by one **orchestrator** (the session that starts it), which spawns the agents described below and never edits product code itself.

**Goal:** Audit the Forever simulator for logic errors and inconsistencies, fix the confirmed ones through separate agents, verify the result, and leave a morning report. The run is unattended overnight.

**Architecture:** Five read-only auditors write findings in one format. The orchestrator dedups them, verifies the high ones itself and builds a dependency graph. Fix agents work in worktrees (parallel waves where files are disjoint, sequential otherwise), test-first. Final verification compares a before and an after snapshot and reviews the whole diff.

**Tech Stack:** TypeScript, vitest (`npm test`), tsx scripts (`npm run forever:*`), git worktrees, Agent tool.

**Spec:** `docs/superpowers/specs/2026-11-28-forever-audit-design.md` (every agent reads it first; section numbers below refer to it).

## Global Constraints

- Working branch `claude/youthful-hopper-op9tox`; push only there; **no pull request**.
- Scope (spec §2): `src/forever/**`, `src/ui/forever/**`, `scripts/forever-*.ts`, `tests/forever/**`, `tests/ui/forever/**`, `docs/forever-data-ledger.md`. Nothing in `src/engine`, `src/bot`, `src/scenarios`, trainer UI.
- Source of truth: `docs/forever-data-ledger.md` and `src/data/classes/warlock/talentDescriptions.json`. Conflicting sources, missing data, or `verify: true` values are **never changed**; they go to "Decyzje dla właściciela" (spec §4).
- JSON data changes only when the ledger unambiguously confirms the current value is wrong, and the change is logged in the ledger (spec §4 rule 4).
- No disabled, skipped or weakened tests; no history rewrite; max 3 repair attempts per fix, then revert and mark `failed`.
- No questions to the user at any point; doubt becomes a report entry.
- Snapshot configuration, identical before and after: seed 1, levels 40, 50, 59, profile `average`, mobs 1, sessions 100; discover `--level 40 --quick --seed 1`.
- Reports live in `docs/superpowers/reports/forever-audit/` (`findings/`, `before/`, `after/`, `STATE.md`, `fix-plan.md`, `REPORT.md`). The orchestrator updates `STATE.md` after every task.

## Review Focus

Inputs and conditions the spec implies but no ordinary test exercises; the owning task adds a check for each.

- A build with `coe:false` or `genes` set goes through duel, run, EP and discover: all four must agree on its numbers for the same seed (Task 6, check 4).
- Level boundaries: 40 (first level of the range), 59/60 (rank availability, Wrack damage interpolation 60 to 124), respec level for DEMO builds (Task 2 audit A3/A2 checklists).
- Zero-mana and low-HP states: Life Tap thresholds, eating and drinking, a dead pet returning after the summon penalty (Task 2 A1/A4).
- Imported addon data (empty gear, unknown item ids, 0 or 51 talent points) must not change sim results silently (Task 2 A5).
- A fix that moves results must be explained by a finding; an unexplained before/after difference is an alarm, not a pass (Task 6).

---

### Task 1: Baseline and "before" snapshot

**Files:**
- Create: `scripts/forever-audit-snapshot.sh`
- Create: `docs/superpowers/reports/forever-audit/STATE.md`
- Create: `docs/superpowers/reports/forever-audit/before/` (outputs)

**Interfaces:**
- Produces: `bash scripts/forever-audit-snapshot.sh <out_dir>` writes one text file per command into `<out_dir>` plus `index.txt` listing them; exit code non-zero if any command fails. Used again in Task 6 with `after/`.

- [ ] **Step 1:** Run `npm ci` only if `node_modules` is missing, then `npm run typecheck` and `npm test`. Record counts and any failures in `STATE.md` under "Baseline". Expected: green. If red, list failing tests in `REPORT.md` draft and mark every finding that touches them `skipped` later (spec §5 Phase 0).
- [ ] **Step 2:** Write `scripts/forever-audit-snapshot.sh` (`set -euo pipefail`, takes the out dir as `$1`). It runs, each with output to its own file under `$1`:
  - `npm run forever:run -- --levels 40,50,59 --profile average --mobs 1 --sessions 100 --seed 1`
  - `npm run forever:ep -- --all --levels 40,50,59 --profile average --mobs 1 --sessions 100 --seed 1`
  - `npm run forever:duel -- --a DEMO_PACT_R1 --b AFF_WRACK --levels 40-59 --profile average --mobs 1 --sessions 100 --seed 1`
  - `npm run forever:duel -- --a DT_SS --b AFF_DRAINTANK --levels 40-59 --profile average --mobs 1 --sessions 100 --seed 1`
  - `npm run forever:discover -- --level 40 --quick --seed 1 --fresh --state "$1/discover-state.json"`
  
  Before choosing flags, run each once with `--help`-free dry invocation to confirm it exits 0 on a small `--sessions 5`; if a flag is rejected, adapt it and note the change in `STATE.md` (the same file is used for the after snapshot, so it stays identical).
- [ ] **Step 3:** Run the script twice into two temp dirs and diff them: **expected: identical** (seeded determinism). If they differ, the differing command is dropped from the snapshot and noted as a nondeterminism finding `A5-000` (severity high).
- [ ] **Step 4:** Run it into `docs/superpowers/reports/forever-audit/before/`.
- [ ] **Step 5:** Commit.

```bash
git add scripts/forever-audit-snapshot.sh docs/superpowers/reports/forever-audit
git commit -m "chore(forever): audit baseline snapshot script and before-snapshot"
```

### Task 2: Audit wave (five read-only agents, parallel)

**Files:**
- Create: `docs/superpowers/reports/forever-audit/findings/A1.md` ... `A5.md`

**Interfaces:**
- Consumes: spec §5 Phase 1 table (areas, files, checklists) and §6 finding format.
- Produces: one file per auditor; each finding follows the §6 block (`id` as `A<n>-<nnn>`, `waga`, `status`, `dowód`, `pliki do zmiany`, `zależy od / koliduje z`), followed by a "Sprawdzone i w porządku" list.

- [ ] **Step 1:** Spawn five agents in a single message (`general-purpose`, parallel), one per row A1-A5 of the spec table. Each prompt is the template below with `<ID>`, `<AREA>`, `<FILES>`, `<CHECKLIST>` copied from the spec row:

  > You are auditor `<ID>` for the Forever (warlock leveling) simulator in /home/user/rotation-trainer. Read `docs/superpowers/specs/2026-11-28-forever-audit-design.md` (sections 2, 4, 6) and `docs/forever-data-ledger.md` first. Audit only: `<FILES>`. Checklist: `<CHECKLIST>`. For every claim compare code against the source of truth, not code against itself. Each finding needs evidence: `file:line`, the ledger/description quote, and where possible a short reproduction script kept in the scratchpad whose output you paste in. Do NOT modify any repository file except your own `findings/<ID>.md`. Where sources conflict, data is missing or the value is `verify: true`, set `status: needs-owner`, do not propose changing it. Write findings in the format of spec section 6; finish with a list of what you checked and found correct. Budget: be exhaustive within your files, ignore other areas (put out-of-scope bugs in an "Uwagi spoza zakresu" list).

- [ ] **Step 2:** Wait for all five. If an agent fails or returns an empty file, rerun it once with the same prompt; if it fails again, record the area as "not audited" in `STATE.md`.
- [ ] **Step 3:** Commit the findings.

```bash
git add docs/superpowers/reports/forever-audit/findings
git commit -m "docs(forever): audit findings A1-A5"
```

### Task 3: Dedup, verification and fix plan (orchestrator)

**Files:**
- Modify: `docs/superpowers/reports/forever-audit/findings/*.md` (statuses only)
- Create: `docs/superpowers/reports/forever-audit/fix-plan.md`

**Interfaces:**
- Consumes: Task 2 findings.
- Produces: `fix-plan.md` with a table `wave | fix id | findings | files | depends on | agent prompt notes`; every row's findings have `status: confirmed`.

- [ ] **Step 1:** Merge duplicates (same root cause) under the lowest ID; mark the others `rejected: duplicate of <ID>`.
- [ ] **Step 2:** For each `high` finding, rerun its reproduction (or write one) and compare with the quoted source. Reproduced and source-backed becomes `confirmed`; otherwise `rejected` with the reason. `medium`/`low` become `confirmed` only if their evidence cites both a file line and a source quote.
- [ ] **Step 3:** For each confirmed finding list the files its fix will touch. Group findings sharing a root cause or file into one fix. Order fixes: severity, then dependency (a fix that changes mana or HP flow goes before fixes that tune thresholds on top of it).
- [ ] **Step 4:** Build waves: fixes in the same wave touch **disjoint files and do not depend on each other's results**; everything else goes into a later wave. Cap a wave at 4 parallel agents.
- [ ] **Step 5:** Write `fix-plan.md`; commit.

```bash
git add docs/superpowers/reports/forever-audit
git commit -m "docs(forever): audit dedup and fix plan"
```

### Task 4: Fix waves (one agent per fix, worktree each)

**Files:** per fix, as listed in `fix-plan.md`; tests go beside existing ones in `tests/forever/` or `tests/ui/forever/`.

**Interfaces:**
- Consumes: one `fix-plan.md` row.
- Produces: a commit on a worktree branch `audit/<fix id>` with message `fix(forever): <what> (<finding ids>)`; the commit message body states the **expected direction of the result change**.

- [ ] **Step 1:** For each wave, spawn the wave's agents in one message with `isolation: "worktree"`, each given this prompt with the row filled in:

  > Fix `<fix id>` (findings `<ids>` in `docs/superpowers/reports/forever-audit/findings/`) in the Forever simulator. Read the spec `docs/superpowers/specs/2026-11-28-forever-audit-design.md` sections 3, 4 and 5 (Phase 3). Work test-first: write a regression test (in `<test dir>`, name it after the finding id) that FAILS on the current code and run it to confirm; then fix the code; then run `npm run typecheck` and `npm test` (all green). Touch only these files: `<files>` plus your test. Do not change data values unless the ledger unambiguously confirms the current one is wrong, and then add a line to `docs/forever-data-ledger.md`. Never skip, delete or loosen an existing test. At most 3 repair attempts; if still failing, stop, discard your changes and report `failed` with the failing output. Commit as `fix(forever): <what> (<finding ids>)`, body: what changed and which way the results should move (up/down/which builds or levels). Report the branch name and commit hash.

- [ ] **Step 2:** Merge each successful branch into the working branch (`git merge --no-ff audit/<fix id>`), then run `npm run typecheck && npm test`. If the merge conflicts or tests fail, revert that merge, mark the fix `failed` (reason in `STATE.md`), and continue; fixes that depend on it become `skipped`.
- [ ] **Step 3:** After each wave, update finding statuses (`fixed`/`failed`/`skipped`) and `STATE.md`; push the branch (`git push -u origin claude/youthful-hopper-op9tox`, retry network errors up to 4 times).
- [ ] **Step 4:** Remove merged worktrees and branches.

### Task 5: Independent review of the night's diff

**Files:**
- Create: `docs/superpowers/reports/forever-audit/review.md`

- [ ] **Step 1:** Spawn one fresh agent (not involved in any fix) with the prompt:

  > Review `git diff <first-commit-of-run>..HEAD` of the Forever audit run against the spec `docs/superpowers/specs/2026-11-28-forever-audit-design.md` (sections 3 and 4). Report only: (a) fixes with no regression test that failed before the fix, (b) data changes with no matching ledger confirmation or ledger line, (c) skipped/disabled/loosened tests, (d) changes outside the scope in §2, (e) fixes whose commit message direction of change contradicts the code. Write `docs/superpowers/reports/forever-audit/review.md`, each item with `file:line` and a verdict `block` or `note`. Do not edit code.

- [ ] **Step 2:** For each `block` item: revert the offending commit (not a history rewrite: `git revert`), set the finding to `failed` with the review's reason, rerun `npm test`. Commit review file and reverts.

### Task 6: Final verification and morning report

**Files:**
- Create: `docs/superpowers/reports/forever-audit/after/` (outputs)
- Create: `tests/forever/path-consistency.test.ts`
- Create: `docs/superpowers/reports/forever-audit/REPORT.md`
- Modify: `docs/forever-data-ledger.md` (new conflicts and any data changes not yet logged)

**Interfaces:**
- Consumes: `scripts/forever-audit-snapshot.sh` (Task 1), final statuses of all findings.

- [ ] **Step 1:** Run `npm run typecheck`, `npm test`, `npm run build`. Record results; a red result is reported verbatim in `REPORT.md`, never hidden.
- [ ] **Step 2:** Run `bash scripts/forever-audit-snapshot.sh docs/superpowers/reports/forever-audit/after` and diff against `before/`. For each changed number or ranking, map it to at least one fixed finding. A difference with no explaining finding is an **alarm**: bisect the fixes (revert one at a time on a scratch branch, rerun the affected command) and revert the culprit if found; list it in the report either way.
- [ ] **Step 3:** Write `tests/forever/path-consistency.test.ts` with test `same build, level and seed agree across duel, run and EP` (assertions: the per-build kills/hour from `runner`, `duel` and `ep` base runs are equal for `AFF_WRACK`, `DT_SS_NOCOE`, one build with `genes`; levels 40 and 59; seed 1; small session count) and one `discover` check that a known build re-evaluated by the discover engine returns the same kills/hour as `duel`. Use the existing helpers in `tests/forever/duel.test.ts`, `ep.test.ts`, `discover-engine.test.ts` for how to call each path. If the test fails, that is a finding (`A5-xxx`, high): do not weaken it; report it unfixed or fix it if the cause is clear and the fix is in scope.
- [ ] **Step 4:** Update `docs/forever-data-ledger.md` with the run's data changes and newly found conflicts (section "Audit 2026-11-28").
- [ ] **Step 5:** Write `REPORT.md` with the seven sections from spec §7 (summary of 10 sentences; findings table with commit hashes; before/after table for levels 40, 50, 59 with explanations; owner decisions with options and a recommendation; reverted fixes and why; out-of-scope notes; coverage list from the auditors).
- [ ] **Step 6:** Commit and push.

```bash
git add -A docs/superpowers/reports/forever-audit tests/forever/path-consistency.test.ts docs/forever-data-ledger.md
git commit -m "docs(forever): audit report, after-snapshot and path consistency test"
git push -u origin claude/youthful-hopper-op9tox
```

---

## Self-review notes

- Spec coverage: §5 Phase 0 = Task 1; Phase 1 = Task 2; Phase 2 = Task 3; Phase 3 = Task 4; Phase 4 steps 1, 2, 4, 5 = Task 6, step 3 (diff review) = Task 5; §7 report = Task 6; §8 constraints = Global Constraints.
- Orchestrator rule: if the context grows large, keep state in `STATE.md` and resume from it; do not rely on memory.
