# Scrolling Combat Text HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An MSBT-style HUD: floating combat text for damage (crits, DoT ticks, misses), buffs on/off, procs, mana gains and notifications, in configurable scroll areas with merging, throttling and a settings panel.

**Architecture:** A pure model turns new combat-log entries and snapshot changes into HUD events (`hudEvents.ts`), formats and styles them (`hudFormat.ts`), merges and throttles them (`hudQueue.ts`) under settings (`hudSettings.ts` with `normalize` + storage); a React component (`CombatTextHud.tsx`) renders the live texts with CSS transform/opacity animations in two scroll areas; `GameView` feeds it from the existing rAF-driven snapshot and log; a collapsible "Combat text" settings panel edits the preferences. The HUD only reads: the simulation is unchanged (at most a read-only `logSince`).

**Tech Stack:** React, TypeScript (strict), Vitest (pure model in the node project, components in `tests/ui` jsdom), `@testing-library/react`, Playwright (smoke only).

**Spec:** `docs/superpowers/specs/2026-10-30-scrolling-combat-text-design.md`. Runs after `docs/superpowers/plans/2026-10-30-gear-item-effects.md` (same UI files).

## Global Constraints

- The HUD never changes a simulation result: with the HUD on or off the same setup and seed give byte-identical logs and the golden bot means (1425.1766666666667 queue window 400, 1428.3350000000003 window 0). `src/engine` is untouched except an optional read-only `logSince(index)` (state why; no behaviour change, tests prove it). No wall clock inside `src/engine`; HUD timing uses the UI loop, not engine time.
- Pure model code in `src/ui/hud*.ts` has no React and no DOM; all of it is testable in the node project.
- Settings are untrusted when loaded (`localStorage`, key `rotation-trainer:hud:v1`): normalized, clamped, never throw, size-capped, prototype-pollution safe (same patterns as `src/setup/storage.ts`).
- Decorative: `aria-hidden="true"`; `prefers-reduced-motion` removes motion; dark and light themes readable; no horizontal scroll at 390 px; no pointer events on the HUD (clicks and hotkeys unaffected); no extra timers per text.
- Every log entry type has an explicit show/skip decision (table in code and in `docs/data-sources.md`); hidden auras never show.
- Hotkey rules stay (rulings S5, item row keys Z X C V B N once the item-effects plan is done). Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Event extraction correctness: no duplicates or drops across frames and after reset/new fight; DoT tick merge; crit/miss; aura on/off pairs; proc detection; mana gains; ready notifications; cooldown-ready only once (Task 1).
2. Throttling and caps: a 600 s fight and a burst of 100 events never exceed the cap and never drop a crit or proc notification (Task 1, 2).
3. Performance: no per-text timers, no full `GameView` re-render per text, no O(n²) log copies (Task 2).
4. Accessibility and motion: `aria-hidden`, reduced motion, readable in both themes, mobile (Task 2).

---

### Task 1: HUD model (events, formatting, merge/throttle, settings)

**Files:**
- Create: `src/ui/hudEvents.ts`, `src/ui/hudFormat.ts`, `src/ui/hudQueue.ts`, `src/ui/hudSettings.ts`, `tests/ui/hud-model.test.ts`
- Modify: `src/engine/sim.ts` (only a read-only `logSince(index: number): readonly LogEvent[]`, if the implementer needs it), `docs/data-sources.md`

**Interfaces:**
- `HudSettings` (all fields clamped by `normalizeHudSettings(input: unknown): HudSettings`; defaults documented): `enabled`; categories `damage`, `crits`, `ticks`, `misses`, `buffsOn`, `buffsOff`, `procs`, `targetDebuffs` (default off), `mana`, `itemUse`, `cooldownReady`, `lowMana`; `animation: 'straight' | 'parabola'`; `durationMs` (600–4000, default 1600); `fontPx` (10–32), `critScale` (1–2.5); `showIcons`, `showSpellNames`; `minDamage` (0–100000); `mergeTicks`, `mergeManaBelow`; `maxTexts` (4–60); `lowManaPct` (5–80). Storage: `loadHudSettings(storage)`, `saveHudSettings(storage, settings)` (cap 10 000 chars, key `rotation-trainer:hud:v1`).
- `HudEvent = { id: number; atMs: number; area: 'outgoing' | 'notifications'; kind: HudKind; text: string; color: string; sticky: boolean; icon?: string; lane: number }` produced by `extractHudEvents(prev: HudCursor, log: readonly LogEvent[], snapshot: SimSnapshot, ctx: HudContext, settings: HudSettings): { events: HudEvent[]; cursor: HudCursor }` (pure): `HudContext` carries spell and aura definitions (names, icons, school colours, hidden flags, which auras are procs: aura ids applied by hooks or item effect hooks, and Heroism-like timed buffs), item actions and cooldown spells for ready notifications. `HudCursor` = log index + per-id state (last cooldown values, low-mana latch). Show/skip table for every `LogType` (`cast-start`, `cast-complete`, `cast-cancel`, `impact`, `damage`, `miss`, `tick`, `aura-apply`, `aura-fade`, `mana`, `queue`, `queue-drop`) lives in code (`HUD_LOG_DECISIONS`) and is mirrored in docs.
- `formatHudText(event, settings)`, damage thousands separators like the rest of the UI (`formatInt`), crit "N!" with the larger scale, tick lighter, miss "Miss", buffs "+Name"/"-Name", procs "Name!", mana "+N Mana", item use "Name", ready "Name ready", low mana "Low Mana".
- `HudQueue`: `push(events, nowMs, settings)` merges ticks of the same spell within `mergeTicks` window (amounts summed, one text), merges small mana gains, throttles to `maxTexts` (drops oldest non-sticky first, never drops sticky/proc/crit), assigns lanes to avoid overlap, and `expire(nowMs)` removes texts past `durationMs`.

- [ ] **Step 1: Write the failing tests** (`tests/ui/hud-model.test.ts`, node project): settings: `defaults, clamping of every field, NaN/strings/null/arrays -> defaults, prototype pollution inert, storage round trip, corrupt JSON, oversize text, throwing storage`; extraction: `a damage entry becomes an outgoing event with school colour and spell name when enabled; crit has sticky and the '!' form; a miss; a tick; aura-apply/aura-fade of a visible aura give '+'/'-' notifications in order; hidden aura never; aura applied at 0 ms (Heroism at 0) shows; a proc aura (Backlash, Shadow Trance, Band buff) is a proc notification (gold, '!'); target debuff only with the setting; mana entries become '+N Mana' with the spell as source (Life Tap, JoW 74, rune); item use ('cast-complete' of an item action) gives the item notification; cooldown ready: fires once when a tracked cooldown goes from >0 to 0 and not at fight start for cooldowns that begin at 0; low mana latch fires once per crossing and re-arms after recovery; settings categories each disable exactly their events; minDamage filter; impact entries are skipped; the cursor never reprocesses an entry (call twice with the same log), a new fight (log shorter than cursor) resets; 10 000 entries processed in under a time bound without quadratic behaviour (count operations)`; queue: `ticks of one spell inside the window merge into one text with the summed amount; ticks of two spells do not merge; maxTexts cap drops oldest non-sticky first and never a crit/proc; expire removes by durationMs; lanes alternate to avoid overlap; 600 s of synthetic events stays within the cap`; HUD_LOG_DECISIONS has an entry for every LogType (type-level check plus test); determinism: running the same log twice gives equal events (ids deterministic).
- [ ] **Step 2: Run `npx vitest run tests/ui/hud-model.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** the model modules, `logSince` only if needed; document the show/skip table and defaults in `docs/data-sources.md` ("Part G: combat text HUD").
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS (golden values unchanged).**
- [ ] **Step 5: Commit** `feat(ui): combat text model, queue and settings`.

---

### Task 2: HUD component, animations, wiring and the settings panel

**Files:**
- Create: `src/ui/CombatTextHud.tsx`, `src/ui/CombatTextSettings.tsx`, `tests/ui/combat-text.test.tsx`
- Modify: `src/ui/GameView.tsx`, `src/ui/useSimulation.ts` (only what exposes new log entries cheaply), `src/ui/game.css`, `README.md`, `docs/data-sources.md`

**Interfaces:**
- `CombatTextHud({ events, settings, nowMs })` renders `HudQueue` output in two absolutely positioned areas inside the arena (Outgoing: above and right of the target; Notifications: above the player/cast bar), each text a `span` with CSS animation (`straight`: translateY; `parabola`: x/y curve via keyframes with a per-lane variable), icon via `SpellIcon`, crit style (scale pop, outline), `aria-hidden="true"`, `pointer-events: none`, reduced-motion rule, both themes (outline/shadow), responsive font size. Elements are keyed by event id and removed by the queue's `expire` in the existing rAF update (no timer per text).
- `CombatTextSettings({ settings, onChange })`: collapsible `<details>` "Combat text" next to the Setup/Gear panels with the controls above (checkbox per category, animation select, number inputs with clamp-on-blur like the Setup panel, Reset to defaults); fully controlled; edits through `normalizeHudSettings`; saved on change; hotkey guard (rulings S5) respected; works while a fight is running.
- `GameView`: owns `HudSettings` state (loaded once, saved on change), a `HudCursor` ref and the queue; on each snapshot update it reads new log entries (`logSince` or an index into `sim.log()` without copying the whole log every frame: measure and state), extracts events, pushes them into the queue and renders; a reset or a new fight clears the queue and cursor; before the fight starts and after it ends no new text appears (the end summary stays clean: texts already on screen fade out within `durationMs`).

- [ ] **Step 1: Write the failing tests** (jsdom, fake timers like `game.test.tsx`; storage injected): `casting Shadow Bolt shows its damage text in the outgoing area with the school colour; a crit shows the larger '!' text; a DoT tick shows a smaller merged text; Heroism enabled at 6 s shows '+Heroism / Bloodlust' at 6 s and '-Heroism / Bloodlust' at its end; an item use shows its name; Life Tap shows '+N Mana'; texts disappear after durationMs and the DOM never holds more than maxTexts; the HUD is aria-hidden and has pointer-events none (class/CSS rule check); reduced-motion rule present in the stylesheet (read game.css as other tests do); disabling the HUD or a category stops exactly those texts; settings panel: every control, clamping on blur, Reset to defaults, saved and restored on the next mount, corrupt stored settings fall back to defaults, throwing storage still works; typing in the settings inputs never triggers hotkeys; reset (R) clears all texts; the end of the fight leaves no new texts; HUD on/off gives identical simulation results (compare log and damage totals); no extra timers (vi.getTimerCount unchanged vs HUD off); a 300 s fight in tests with many events stays under the cap and keeps UI responsive (frame count bound)`.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): the HUD, categories, animation styles, how to turn it off, that it never changes results.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): play a 40 s fight with Heroism at 10 s and items, watch outgoing and notification texts (screenshots at several moments), change settings live (animation, categories, size), reload (settings persisted), reduced-motion emulation (`page.emulateMedia({ reducedMotion: 'reduce' })`), desktop dark/light and phone 390 px (read the screenshots, fix visible defects: overlap, clipping, unreadable colours, horizontal scroll), no console errors — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): scrolling combat text HUD with settings`.

---

### Task 3: Docs and final review

**Files:** `README.md`, `docs/data-sources.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list pointer)

- [ ] **Step 1:** complete "Part G: combat text HUD" (event show/skip table, defaults, settings, performance notes, known limits: incoming area unused, no sounds); README Polish section; stage list pointer.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build`.
- [ ] **Step 3:** final whole-feature review (diff from this plan's base commit, the Review Focus list, golden values and byte-identical logs with the HUD on/off, hostile settings fuzz, performance measurement of a 600 s fight with the HUD, Playwright end to end); fix Critical/Important defects with tests and cheap minors.
- [ ] **Step 4: Commit** `docs: combat text HUD`.

---

## Self-Review

- **Spec coverage:** §2 categories and settings → Tasks 1–2; §3 event source, merging, throttling, areas → Tasks 1–2; §4 look, accessibility, performance → Task 2 and Review Focus; §5 risks → tests and Task 3.
- **Type consistency:** `HudSettings`, `HudEvent`, `HudCursor`, `HudContext`, `extractHudEvents`, `HudQueue` (Task 1) are the names Task 2 uses; `LogEvent`/`SimSnapshot` come from the engine.
- **Judgement left to the executor:** exact animation keyframes and lane geometry, colour palette per kind, which aura ids count as procs (derive from the data: hook-applied auras and item effect auras), the cooldown-ready tracking set.
