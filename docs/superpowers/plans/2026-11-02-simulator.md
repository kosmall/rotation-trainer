# Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run N deterministic simulations of the configured setup (gear, buffs, rotation incl. when to use consumables and cooldowns) and show mean DPS ± standard deviation (with standard error, 95% CI, percentiles, histogram, per-spell breakdown).

**Architecture:** (1) A rotation configurator extends the setup with `itemUse` rules compiled into pure priority steps (`buildItemSteps` generalised); (2) a framework-free simulator core (`src/sim-runner/*`) runs the bot N times with derived seeds and aggregates with Welford statistics, in chunks with progress/cancel; (3) a Web Worker wrapper plus a main-thread fallback; (4) a Simulator panel and an `itemUse` editor in the Setup panel. The engine and game data are unchanged.

**Tech Stack:** Vite (module workers), React, TypeScript (strict), Vitest (node project for the core and rule compilation, jsdom `tests/ui` for panels), Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-11-02-simulator-design.md`. Builds on all earlier plans and ledgers (`.superpowers/sdd/*/progress.md`).

**Execution order:** Tasks 1–4 in order. Stopping after Task 2 leaves a working core without UI.

## Global Constraints

- With the default and every existing stored setup the bot logs and the golden means (1425.1766666666667 queue window 400, 1428.3350000000003 window 0; the raid-log preset 2294.108333333333; Icon+Band 1379.2966666666666 / 1373.4900000000002) stay EXACT: default `itemUse` rules reproduce today's `itemRules.ts` behaviour byte for byte.
- `src/engine` untouched. The simulator core is framework-free (no React, no DOM, no wall clock; randomness only from the seeded Rng; the per-run seed is a pure function of base seed and run index).
- Statistics: Welford online mean/variance (sample variance n−1), numerically stable; standard error σ/√n; 95% CI ±1.96·SEM (state it); percentiles from a fixed-size histogram or a bounded reservoir (state which; exactness bounds documented).
- Untrusted input: `runs` clamped to [1, 100 000], `seed` to a 32-bit integer, `itemUse` rules normalized (unknown kinds/ids dropped, numbers clamped, list sizes capped), nothing throws on hostile stored data.
- Hotkey rules stay (S5; item row keys Z X C V B N); the panel is decorative-safe: Run/Cancel keyboard accessible, progress announced politely (not per tick). Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Golden equality of default `itemUse` rules (byte-identical logs) and RNG draw counts (Task 1).
2. Per-run determinism: run i alone equals run i inside a batch; results independent of chunking and of worker vs fallback (Task 2, 3).
3. Statistics correctness against a reference (hand-computed small samples, known distributions), numerical stability for 100 000 values, histogram/percentile edge cases (Task 2).
4. UI responsiveness (worker, chunking, cancel), memory (no per-run logs kept), hostile inputs (Task 3).

---

### Task 1: Rotation configurator for consumables and cooldowns

**Files:**
- Create: `src/data/classes/warlock/itemUse.ts`, `tests/data/item-use.test.ts`
- Modify: `src/data/classes/warlock/itemRules.ts`, `src/data/classes/warlock/rotation.ts` (types only if needed), `src/setup/types.ts`, `src/setup/defaults.ts`, `src/setup/applySetup.ts`, `src/setup/presets.ts`, `docs/data-sources.md`
- Test: `tests/setup/item-use-setup.test.ts`

**Interfaces:**
- `type ItemUseTrigger = { kind: 'ready' } | { kind: 'pull' } | { kind: 'at'; sec: number } | { kind: 'with-heroism' } | { kind: 'with-buff'; auraId: string } | { kind: 'mana-below'; mana: number } | { kind: 'mana-missing'; amount: number } | { kind: 'fight-end'; lastSec: number } | { kind: 'never' }`; `interface ItemUseRule { trigger: ItemUseTrigger; notBeforeSec?: number; notAfterSec?: number; minGapSec?: number }`; `RotationConfig.itemUse?: Record<string, ItemUseRule>` (key = catalog id: `destruction-potion`, `super-mana-potion`, `dark-rune`, `item:<id>`) and `RotationConfig.itemUseOrder?: string[]`.
- `compileItemUse(actions, config, ctx): PriorityStep[]` (pure): each rule becomes a `when(snapshot)` over snapshot fields only (time, mana, selfAuras, cooldowns, `durationMs`); `with-heroism` means the Heroism self aura is up, or Heroism is over/not scheduled (the current rule: reproduce exactly); `minGapSec` uses `cooldownRemainingMs` of the action and last-use tracking via snapshot only (no mutable state: derive from cooldown remaining vs known cooldown length); `mana-missing`/`mana-below` read `maxMana - mana`/`mana`; `at`/`pull`/`fight-end` use `nowMs` and `durationMs`.
- `DEFAULT_ITEM_USE(actions, heroismEnabled)` returns exactly today's rules: Icon/trinkets/Destruction Potion `with-heroism` (or `pull` when Heroism is off), Super Mana Potion `mana-missing 3000`, Dark Rune `mana-missing 1500`; `buildItemSteps` becomes a thin wrapper over `compileItemUse(DEFAULT_ITEM_USE(...))` and its existing tests pass unchanged.
- `normalizeSetup`: validates `itemUse` (only known trigger kinds, numbers clamped: sec 0–3600, mana 0–100 000, list sizes ≤ 32, ids as in the catalog or `item:<digits>`, prototype-safe), drops rules for ids not present; stored configs without `itemUse` get defaults at apply time (not written back).

- [ ] **Step 1: Write the failing tests:** `default rules reproduce today's steps (same ids, same labels/hints, same when() results over 5 000 random snapshots vs the pre-change buildItemSteps captured as a literal copy in the test)`; `bot logs byte-identical to the previous implementation for default, Icon+Band, raid-log (seeds 1-10, windows 400 and 0; capture the old logs from git into a fixture hash or compute with the old function kept in the test)`; each trigger kind: ready, pull (only at nowMs 0..GCD), at 30 s, with-heroism, with-buff (another trinket's aura), mana-below, mana-missing, fight-end (last 20 s), never, notBefore/notAfter windows, minGap; order list changes priority; a potion at 30 s and another trinket with-buff in a scripted fight behave as configured; normalize: hostile `itemUse` (proto keys, huge lists, wrong kinds, NaN) never throws and is idempotent; stale ids dropped; golden values.
- [ ] **Step 2: Run `npx vitest run tests/data tests/setup tests/bot` — Expected: FAIL.**
- [ ] **Step 3: Implement**; document the rule kinds and defaults in `docs/data-sources.md` ("Part H: simulator and item-use rules").
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS (golden values exact).**
- [ ] **Step 5: Commit** `feat(setup): configurable item and consumable use rules`.

---

### Task 2: Simulator core

**Files:**
- Create: `src/sim-runner/run.ts`, `src/sim-runner/stats.ts`, `src/sim-runner/types.ts`, `tests/sim-runner/run.test.ts`, `tests/sim-runner/stats.test.ts`
- Modify: `docs/data-sources.md`

**Interfaces:**
- `interface SimRequest { setup: SetupConfig; db?: ItemDb; runs: number; seed: number; spellQueueWindowMs: number }`; `interface SimResult { runs: number; seed: number; meanDps: number; stdDev: number; stdErr: number; ci95: [number, number]; min: number; max: number; median: number; percentiles: { p5; p25; p75; p95 }; histogram: { binStart: number; binWidth: number; counts: number[] }; perSpell: Record<string, { name: string; meanDamage: number; share: number; meanCasts: number; meanCrits: number; meanMisses: number; meanTickDamage: number }>; itemUses: Record<string, number>; uptimes: Record<string, number>; meanManaSpent: number; meanLifeTaps: number; fightMs: number }`.
- `prepareRun(request): RunFactory` (applies the setup once, builds the spec/priority/sim settings) and `runOnce(factory, index): RunSample` (per-run seed `mixSeed(seed, index)`; builds a fresh `Simulation`, plays `runBot`, extracts DPS and the per-spell aggregates from the log without keeping it); `class Aggregator { add(sample); result() }` using Welford; `simulate(request, { chunk = 50, onProgress, signal }): Promise<SimResult>` (async chunks yielding to the event loop between chunks, respects `AbortSignal`, deterministic regardless of chunking); histogram with a fixed bin count (e.g. 40) over [min, max] computed exactly from stored DPS values (a Float64Array of runs ≤ 100 000: 800 KB; percentiles exact via sort).
- `mixSeed(seed, i)`: a documented 32-bit mix (e.g. splitmix-style) so neighbouring runs are decorrelated; stable forever (pinned by a test).

- [ ] **Step 1: Write the failing tests:** `stats: Welford mean/variance equals a two-pass reference on random data to 1e-9 relative; n=1 gives stdDev 0 and no NaN; 100 000 values stable; percentiles exact on a known array; histogram counts sum to n and bin edges cover min..max; all-equal values give a single-bin histogram`; `run: runOnce(i) alone equals the i-th sample of a batch; simulate with chunk 1, 7 and 1000 gives byte-equal results; abort stops early and returns a partial flag/rejects with AbortError (state which) with no leaks; the sample for seed s equals a manual Simulation + runBot fight with seed mixSeed(base, i) (compare DPS exactly); mean over 200 runs of the default setup is within 3 standard errors of the golden-band centre (state the expected band from the bot tests) and stdDev matches the bot test's per-seed deviation order of magnitude (~130); perSpell shares sum to 1 (direct+ticks) and damage sums equal total damage per run; itemUses counts match the log; uptimes between 0 and 1; hostile request (runs 0, NaN, 1e9, seed NaN, setup garbage) -> clamped or a clear error, never a hang; performance: 1000 runs under a stated bound on this machine (record the measured time; the test uses a generous bound)`.
- [ ] **Step 2: Run `npx vitest run tests/sim-runner` — Expected: FAIL.**
- [ ] **Step 3: Implement**; document statistics definitions and the seed mix in Part H.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(sim-runner): multi-run simulator core with Welford statistics`.

---

### Task 3: Worker, Simulator panel and the item-use editor

**Files:**
- Create: `src/sim-runner/worker.ts`, `src/sim-runner/client.ts`, `src/ui/SimulatorPanel.tsx`, `src/ui/ItemUseEditor.tsx`, `tests/ui/simulator-panel.test.tsx`, `tests/ui/item-use-editor.test.tsx`
- Modify: `src/ui/GameView.tsx`, `src/ui/SetupPanel.tsx`, `src/ui/game.css`, `vite.config.ts` (worker format if needed), `README.md`, `docs/data-sources.md`

**Interfaces:**
- `client.ts`: `runSimulation(request, { onProgress, signal }): Promise<SimResult>`: spawns a module worker (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`), posts the request (db passed as plain JSON only when the gear needs it), receives progress and the result, terminates on abort/finish; falls back to `simulate()` on the main thread in chunks when `Worker` is unavailable or fails to start (jsdom, errors).
- `SimulatorPanel`: collapsible `<details>` "Simulator" next to Setup/Gear/Combat text: number input `Runs` (clamp 1–100 000 on blur), `Seed` (blank = random, shown after the run), Run/Cancel buttons, progress bar `role="progressbar"` with polite text updates at most once per second, result table (Mean DPS, σ, standard error, 95% CI, min, max, median, p5/p25/p75/p95), SVG/CSS histogram (accessible name and a text summary), per-spell table (name, share %, mean damage, casts, crit %, miss %), item uses, uptimes, mana spent, Life Taps, the settings the result came from (gear preset or "Custom", setup preset, rotation summary, fight length, runs, seed), `Copy result` (clipboard guarded), explanatory note on what ± means (σ between fights vs standard error of the mean) and the model limits. The run uses the CURRENT setup (the next-fight setup) and the loaded item db; running disables nothing in the game; a run in progress is cancelled when the setup changes? (decide: keep running, label the result with its setup; state it).
- `ItemUseEditor` in the Setup panel's rotation section: one row per available action (worn on-use trinkets, Destruction Potion, Super Mana Potion, Dark Rune, enabled ones only), trigger select, parameter inputs (sec, mana, amount, buff select for `with-buff`), optional window/min gap, move up/down, Reset to default; fully controlled; edits through `normalizeSetup`; text-like fields swallow hotkeys (S5); explains each trigger in a one-line hint; changes apply from the next fight like the rest of the setup and are used by the simulator immediately.

- [ ] **Step 1: Write the failing tests** (jsdom; the client falls back to the main thread; fake timers where needed): panel: `Run with 50 runs shows mean, σ, SEM and CI; the result matches simulate() for the same request exactly; progress appears and Cancel stops and keeps the previous result; runs clamp (0, 1e9, abc); seed blank vs fixed gives the same result twice for a fixed seed; the result lists the settings it came from; Copy result; the note about ±; typing in the inputs never triggers hotkeys; settings change during a run does not alter the running result; corrupt stored setup does not break the panel`; editor: `rows follow the worn gear and enabled items (swap a trinket -> row appears), changing a trigger changes the bot's behaviour in the next fight (scripted: potion at 30 s), with-buff select lists the player's buff auras, move up/down changes order, Reset restores defaults and the default logs are byte-identical, hostile inputs clamp`; client: `worker path mocked: messages, progress and abort; failure to start falls back`.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): the Simulator and the item-use rules; explain σ vs SEM; the limits.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): run 2000 simulations (check the UI stays responsive during the run: type in another field, open another panel; the worker is used: assert no long tasks over 200 ms), cancel a run, change the potion rule and compare results (mean DPS differs plausibly), swap gear preset and rerun, reload (settings persist), desktop dark/light and phone 390 px screenshots (read them, fix visible defects), no console errors — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): simulator panel, worker and item-use editor`.

---

### Task 4: Docs and final review

**Files:** `README.md`, `docs/data-sources.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list pointer)

- [ ] **Step 1:** complete Part H (rule kinds and defaults, statistics definitions, seed mix, histogram/percentiles, worker/fallback, limits and what the model leaves out); README Polish; pointer in the spec.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run icons`.
- [ ] **Step 3:** final whole-feature review (diff from this plan's base commit, the Review Focus list; byte-identical default logs; determinism across chunking and worker/fallback; statistics against a reference implementation; hostile inputs fuzz; performance of 100 000 runs with memory measurement; Playwright end to end); fix Critical/Important findings with tests and cheap minors.
- [ ] **Step 4: Commit** `docs: simulator and item-use rules`.

---

## Self-Review

- **Spec coverage:** §2 A → Task 1 (+ editor in Task 3); §2 B → Tasks 2–3; §3 rules → Global Constraints and tests; §4 risks → Review Focus and the performance tests.
- **Type consistency:** `ItemUseRule`/`RotationConfig.itemUse` (Task 1) feed `compileItemUse` (Task 1), `prepareRun` (Task 2) and the editor (Task 3); `SimRequest`/`SimResult` (Task 2) are used by `client.ts` and the panel (Task 3).
- **Judgement left to the executor:** the percentile method (exact sort vs bounded), histogram bin count, how `with-buff` lists candidate auras, whether a setup change cancels a running simulation (state it).
