# UI Redesign (Setup, Fight, Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-column page (arena + 8 collapsible panels) with an app shell of three hash-routed modes: **Setup** (rail navigation, one section at a time, live "next fight" summary), **Fight** (a game-like arena: unit frames, aura rows with timers, bordered action bars, combat text zones, a Details-style meter, a log ticker) and **Report** (post-fight summary, Damage/Timeline/Log/Rotation tabs, Simulator and Compare), with design tokens, dark and light themes and class tokens, without changing the engine.

**Architecture:** (1) design tokens (`src/ui/theme/tokens.css`) and self-hosted fonts; (2) state lifted out of `GameView` into a `TrainerProvider` (context with `state`, `actions`, `meta`; the provider is the only place that knows about storage, the item database, the simulation hook); (3) an `AppShell` with a tiny hash router (`useRoute`), header with status chips, mode views lazily loaded; (4) Fight view split into small memoized components fed by narrow selectors of the per-frame snapshot; (5) Setup sections that re-host the existing panels' bodies (no `<details>` wrapper) under a rail; (6) Report view with new pure view-models (`reportView.ts`) computed from the ended fight's log. During the migration `GameView` stays as a **legacy all-in-one layout** over the same provider so every existing test stays green; tests move file by file to the new shell, and the legacy layout is deleted in Task 5.

**Tech Stack:** Vite, React 19, TypeScript (strict), Vitest + Testing Library (jsdom), Playwright (smoke and screenshots, outside the repo's test run), `@fontsource/marcellus`, `@fontsource/barlow`, `@fontsource/barlow-semi-condensed` (SIL OFL 1.1; the only new dependencies).

**Spec:** `docs/superpowers/specs/2026-11-04-ui-redesign-design.md`. **Prototype (visual reference, source of tokens and CSS to port):** `docs/design/prototype/{index.html,styles.css,app.js}`; screenshots `docs/design/screens/*.png`.

**Execution order:** Tasks 1–5 in order. Task 3 and Task 4 are independent of each other once Task 2 is merged and may run in parallel worktrees.

## Global Constraints

- **No behaviour change in the engine, bot, simulator, setup normalization or storage:** `src/engine`, `src/bot`, `src/sim-runner`, `src/setup`, `src/script`, `src/data` are untouched except for read-only helpers if a task explicitly lists them. Every golden stays byte-identical (default 1425.1766666666667 / 1428.3350000000003, raid-log 2294.108333333333, Icon+Band 1379.2966666666666 / 1373.4900000000002, simulator/bot fixtures, converter equivalence). `npm test` is green after every task.
- **Storage keys unchanged:** `rotation-trainer:setup:v1`, the combat text key, `rotation-trainer:scenarios:v1`. New UI-only preferences (theme, dock open, coach hint) live under one new key `rotation-trainer:ui:v1`, versioned, read with try/catch, never required to render.
- **Accessible names stay stable** where tests use them: "Action bar", "Item bar", "Cast bar", "Mana", "Target health", "Your buffs", "Active buffs", "Upcoming buffs", "Setup buffs", "Fight summary", "Stats at the pull", "Set bonuses", "Start the fight" (button), "Gear presets", "Talent presets", "Equipped items", "Item use rules", "Simulation result", "DPS histogram", every form label and preset button name, `DPS` / `Total damage` / `Elapsed` / `Duration` labels. A renamed visible title (e.g. "Start the Fight") keeps the old accessible name via the same text in a case-insensitive test or an explicit `aria-label`; prefer updating tests to Title Case only where the plan says so.
- **Hotkeys:** fight keys (1–0, -, =, Z X C V B N, Space, Esc, R) only while the route is Fight; rule S5 (text fields, selects, textareas, contenteditable, open modals swallow keys; toggles keep only Space/Enter) unchanged; new global `g s`/`g f`/`g r` and `?` never fire inside fields or during a running fight.
- **Accessibility (Vercel web-interface-guidelines):** skip link, landmarks, one `h1` per view, `:focus-visible` rings (never `outline: none` without replacement), `aria-current` on nav, icon-only buttons with `aria-label`, `aria-live="polite"` for async status, touch targets ≥ 44 px on coarse pointers, `prefers-reduced-motion` honoured, animate `transform`/`opacity` only, never `transition: all`, `color-scheme` + `<meta name="theme-color">` per theme, tabular numerals for numbers, `Intl.NumberFormat`, `…` and curly quotes in copy, Title Case button labels, destructive actions confirm.
- **Performance:** only Fight components re-render per animation frame; the header, Setup, Report and the dock's slow parts must not (verified with a render counter test). Lazy routes via `React.lazy` + `Suspense`. No component defined inside another component; derived state computed during render (no syncing effects); no boolean-prop proliferation (variants are separate components or a `variant` union).
- **Class-agnostic:** no "Warlock" string or warlock spell id in shell, header, Fight layout or Report components; names, icons, class colour and resource come from `SpecData`/tokens (`data-class` on `<html>`). Warlock-only UI stays in clearly named `*Warlock*` / class-option components selected by the spec.
- Playwright runs (smoke, screenshots) are started outside `npm test`; `npx vite preview` is started in the background and killed **by PID** (never `pkill -f`). Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Test migration: no test deleted without an equivalent; accessible names preserved; goldens untouched (Tasks 1–5).
2. Re-render budget of the Fight view and the shell (Task 2, Task 5).
3. Hotkey scoping and focus management across routes (Tasks 1, 2).
4. Correctness of Report view-models against the fight log (per-spell sums equal `damageTotal`; uptimes; bot comparison uses the same seed and setup) (Task 4).
5. Visual fidelity to the prototype at 1440/1024/390 in both themes; contrast numbers from the spec (Task 5).

---

### Task 1: Design tokens, fonts, app shell, hash router, header summary, theme

**Files:**
- Create: `src/ui/theme/tokens.css` (palette, type scale, spacing, radii, bevel, class tokens, light theme, reduced motion; ported from the prototype's `:root` blocks), `src/ui/theme/fonts.ts` (imports of the needed `@fontsource/*` weights), `src/ui/theme/theme.ts` (`useTheme(): { theme: 'dark' | 'light'; toggle(): void }`: reads `rotation-trainer:ui:v1`, falls back to `prefers-color-scheme`, sets `data-theme` and `<meta name="theme-color">`), `src/ui/state/TrainerProvider.tsx` (context `TrainerContext` = `{ state, actions, meta }`; everything `GameView` owns today: config, hud settings, item db status, next fight, `useSimulation` result, pending flags, labels), `src/ui/state/selectors.ts` (pure label helpers moved from `GameView`: `gearName`, `talentsName`, `activePresetName` wiring, `pendingFor(section)`), `src/ui/shell/router.ts` (`parseRoute(hash): Route`, `routeHref(route)`, `useRoute(): [Route, navigate]`; `Route = { mode: 'setup'; section: SetupSection } | { mode: 'fight'; overlay?: 'ready' } | { mode: 'report'; tab: ReportTab }`; unknown → `{mode:'fight'}`), `src/ui/shell/AppShell.tsx` (skip link, `Header`, `<main id="main" tabIndex={-1}>`, lazy views, mobile `TabBar`, focus moves to `main` on mode change, `document.title`), `src/ui/shell/Header.tsx` (brand, mode links, `SpecChip`, `StatusChips`, theme button), `src/ui/shell/StatusChips.tsx`, `src/ui/shell/TabBar.tsx`, `src/ui/shell/shortcuts.ts` (`g`-sequences and `?`), `src/ui/shell/ShortcutsDialog.tsx`, `tests/ui/shell/router.test.ts`, `tests/ui/shell/app-shell.test.tsx`, `tests/ui/shell/theme.test.ts`, `tests/ui/renderApp.tsx` (test helper: `renderApp({ route, storage, ...providerProps })`)
- Modify: `src/ui/App.tsx` (renders `<TrainerProvider><AppShell/></TrainerProvider>`), `src/ui/GameView.tsx` (becomes `<TrainerProvider {...props}><LegacyLayout/></TrainerProvider>`; `LegacyLayout` is today's JSX reading the context; same props, same output), `src/main.tsx` (imports tokens and fonts), `index.html` (`theme-color`, `viewport-fit=cover`, early theme script), `package.json` (3 font packages), `src/ui/game.css` (keeps legacy rules; new rules go to new files)

**Interfaces:**
- `TrainerProvider` props = today's `GameViewProps` (`buildSpec`, `loadDb`, `onReload`, `storage`, `hudStorage`, `simRunner`); routing is not the provider's concern (the shell owns it; tests set `location.hash` through `renderApp`). Context value is memoized in three parts so per-frame snapshot changes do not re-render consumers of `state`/`actions`: `TrainerContext` (config, labels, actions; changes on edits) and `FightFrameContext` (snapshot; changes per frame; consumed only by Fight components). `useTrainer()` and `useFightFrame()` hooks.
- `StatusChips` reads `meta.labels` (`setupPreset`, `gear`, `talents`, `rotation`, `fight`) and `meta.pending` (`Record<'setup'|'gear'|'talents'|'rotation'|'fight', boolean>`), renders `<ul aria-label="Next fight">` of links `routeHref({mode:'setup', section})`.
- Spec-driven header: `SpecChip` takes `spec.name`, `spec.className`, `spec.icon` (add read-only `className`/`icon` to the warlock `SpecData` only if absent; otherwise derive from existing fields; no engine change).

- [ ] **Step 1: Write the failing tests:** router parse/serialize round trip for every route, unknown and empty hashes → fight, `#/setup` → gear, `#/report` → damage; shell: mode links have `aria-current`, chips link to sections, pending chip has the marker when the running fight's config differs, skip link focuses main, mode change moves focus to `main` and sets `document.title`, theme toggle sets `data-theme`, persists, survives a throwing storage, `g s` navigates but not inside an input or while a fight runs, `?` opens the shortcuts dialog and Esc closes it; `GameView` (legacy) renders exactly as before (the whole existing suite is the test).
- [ ] **Step 2: Run `npx vitest run tests/ui/shell` — Expected: FAIL.**
- [ ] **Step 3: Implement** (move state into the provider by cut-and-paste first, then wire `LegacyLayout`; no logic change).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS (all existing tests unchanged).**
- [ ] **Step 5: Commit** `feat(ui): design tokens, fonts, trainer provider and hash-routed app shell`.

---

### Task 2: Fight screen

**Files:**
- Create: `src/ui/fight/FightView.tsx` (arena grid + dock; mounts the hotkeys), `src/ui/fight/useFightHotkeys.ts` (today's keydown handler and S5 guard moved out of `GameView`, enabled only while mounted), `src/ui/fight/Hud.tsx` (timer, progress with Heroism mark, DPS, damage, hints, `Meter` toggle below 1280 px), `src/ui/fight/UnitFrame.tsx` (compound: `UnitFrame`, `UnitFrame.Portrait`, `UnitFrame.Name`, `UnitFrame.Bar` (`variant: 'health' | 'resource'`), `UnitFrame.Auras`), `src/ui/fight/TargetFrame.tsx` and `src/ui/fight/PlayerFrame.tsx` (compositions; player frame shows the five-second-rule line), `src/ui/fight/AuraRow.tsx` (`AuraIcon` with timer text, stacks/charges, expiring state; used for target debuffs (own vs others) and player buffs (active, upcoming, setup)), `src/ui/fight/ActionButton.tsx` (slot with key label, cooldown/GCD sweep via a CSS variable written in a ref effect, reject flash, coach glow), `src/ui/fight/Bars.tsx` (cast bar with the queue window, item bar, action bar), `src/ui/fight/World.tsx` (selection ring, nameplate), `src/ui/fight/Dock.tsx` (`MiniMeter`, `NextUp`, `SoFar`, `LogTicker`, combat text switch), `src/ui/fight/fightView.ts` (pure view-models: `meterRows(log, now)`, `soFar(snapshot)`, `nextUp(priority, snapshot)`, `logTicker(log, n)`), `src/ui/fight/fight.css`, `tests/ui/fight/*.test.tsx`, `tests/ui/fight/fight-view-model.test.ts`, `tests/ui/fight/render-budget.test.tsx`
- Modify: `src/ui/ActionBar.tsx`, `src/ui/CastBar.tsx`, `src/ui/ManaBar.tsx`, `src/ui/TargetPanel.tsx`, `src/ui/PlayerBuffsPanel.tsx` (become thin wrappers or are replaced; keep exports used by tests until Task 5), `src/ui/CombatTextHud.tsx` (only the container/zones: outgoing and notification zones as two positioned layers; the queue and settings logic unchanged), `src/ui/StartOverlay.tsx` (new card copy with setup links; button keeps the accessible name "Start the fight" (case-insensitive match in tests)), `src/ui/GameView.tsx` (EndSummary moves to `src/ui/fight/EndCard.tsx`: DPS, % of the bot when known, "Open Report" link, Reset; region "Fight summary" unchanged)

**Interfaces:**
- Per-frame data flows only through `useFightFrame()`; each frame component receives primitives or memoized arrays (e.g. `AuraRow` gets `views` rebuilt once per snapshot by `buildBuffViews`, already the case); `React.memo` on `UnitFrame.*`, `ActionButton` (props: `spellId`, `hotkey`, `state: 'ready' | 'cooldown' | 'nomana' | 'busy'`, `cdFraction`, `cdText`), `MiniMeter` updates at most 4×/s (`useThrottledValue(log, 250)`).
- Leaving the Fight route pauses the fight clock (spec Q1 recommendation; implement behind `pauseOnLeave` in `useSimulation` options: the rAF loop stops on unmount and the virtual clock resumes from the same `nowMs` on remount; if the author picks another answer, change only this option).
- `REJECT_LABELS`, `keyToSlot`, `ITEM_SLOT_KEYS`, `hudQueue`, `buildBuffViews`, `buildHudContext` are reused unchanged.

- [ ] **Step 1: Write the failing tests:** at `#/fight` the arena exposes "Target health", the debuffs list ("Debuffs on the target") with "Immolate, 4.1s left"-style names, "Your buffs"/"Active buffs"/"Upcoming buffs"/"Setup buffs", "Cast bar", "Mana", "Action bar" with "Shadow Bolt (1)", "Item bar"; hotkeys cast in Fight and do nothing at `#/setup/gear`; Space starts, Esc cancels, R resets; leaving and returning pauses and resumes the clock; meter rows sum to `damageTotal`; `nextUp` matches the bot's first castable step; the end card shows DPS and "Open Report" links to `#/report/damage`; render budget: 60 simulated frames re-render `Header`, `StatusChips` and any Setup component 0 times and `MiniMeter` ≤ 15 times; reduced motion: no pulse class; all existing fight tests (`game`, `item-bar`, `player-buffs`, `combat-text`, `icons`) migrated to `renderApp({ route: '#/fight' })` and green.
- [ ] **Step 2: Run `npx vitest run tests/ui/fight` — Expected: FAIL.**
- [ ] **Step 3: Implement** (port CSS from `docs/design/prototype/styles.css`, section FIGHT).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright run (preview by PID): play 10 s at 1440×900 and 390×844, screenshot, read, fix defects; measure frame time in DevTools protocol (`Performance.getMetrics`), target < 4 ms script per frame — Expected: green.**
- [ ] **Step 5: Commit** `feat(ui): game-like fight screen with unit frames, aura rows, action bars and meter`.

---

### Task 3: Setup screens

**Files:**
- Create: `src/ui/setup/SetupView.tsx` (rail + section outlet + summary), `src/ui/setup/SetupRail.tsx` (sections from a data list `SETUP_SECTIONS` with id, label, icon resolver and value resolver; Keybinds disabled "Coming with stage 2c"), `src/ui/setup/SummaryAside.tsx` (`CharacterStats` and `SetBonusList` moved here; "Simulate this setup" card with the last result and a link to `#/report/simulator`), `src/ui/setup/sections/{GearSection,TalentsSection,BuffsSection,ItemsSection,RotationSection,FightSettingsSection,ClassOptionsSection,ScenariosSection,CombatTextSection}.tsx`, `src/ui/setup/setup.css`, `tests/ui/setup/*.test.tsx`
- Modify: `src/ui/SetupPanel.tsx` (split: each `Group` body becomes an exported component (`FightGroup`, `BuffGroup`, `ItemsGroup`, `WarlockOptionsGroup`, `RotationGroup`, `DistanceField`), the old `SetupPanel` composes them for the legacy layout until Task 5), `src/ui/GearPanel.tsx` (export `GearEditor` without the `<details>`: presets, character-pane slots, item card, Import/Export as dialogs; `GearPanel` wraps it for legacy), `src/ui/TalentsPanel.tsx` (export `TalentsEditor`; trees side by side ≥ 1280 px), `src/ui/CombatTextSettings.tsx` (export `CombatTextForm`), `src/ui/ItemUseEditor.tsx` (unchanged API), the script editor and scenarios panel from the scripts plan Task 5 (`ScriptEditor`, `ScenariosPanel`) are mounted in `RotationSection` (tab "Script") and `ScenariosSection`; if that plan has not landed yet, the sections render a designed placeholder with the planned empty state

**Interfaces:**
- Sections receive nothing but read `useTrainer()`; editors keep their current controlled props so their unit tests (`setup-panel`, `gear-panel`, `talents-panel`, `item-use-editor`) keep rendering them directly.
- The rail item's value line is derived (`railValue(section, state)`), e.g. Gear → gear preset name, Talents → "My build, 0 / 21 / 40", Buffs → "14 on, 3 target debuffs", Rotation → "Basic, DoT rotation" or "Script, 9 rules", Fight settings → "60 s, Heroism at 6.4 s".
- The pending note ("Changed since the running fight started: it applies after you reset the fight (R)") shows in the section header when `meta.pending[section]`.
- Destructive actions (Reset to Defaults, Clear script, Delete scenario) open a confirm dialog naming what is replaced.

- [ ] **Step 1: Write the failing tests:** rail lists every section with `aria-current` on the active one; each section reachable by URL; Gear section: presets group "Gear presets", "Equipped items", "Change Head" opens the picker; Buffs: "Raid and party", "Consumables", "Target debuffs", "Items and cooldowns" groups by name; Rotation: "Rotation preset", "Curse", "Item use rules", Basic/Script switch; Fight settings: "Fight length (s)", Heroism start/duration, "Distance from target (yd)"; summary shows "Stats at the pull" and "Set bonuses" updating at once after a gear change; Reset to Defaults asks for confirmation; hotkeys typed into fields do nothing; existing `setup-wiring`, `gear-effects-ui`, `simulator-panel` (summary card part) migrated to `renderApp({ route })` and green.
- [ ] **Step 2: Run `npx vitest run tests/ui/setup` — Expected: FAIL.**
- [ ] **Step 3: Implement** (port CSS from the prototype's SETUP section; Gear character pane exactly as `docs/design/screens/setup-gear-1440-*.png`).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, Playwright screenshots of every section at 1440 dark/light and 390 (read them, fix defects) — Expected: green.**
- [ ] **Step 5: Commit** `feat(ui): setup mode with rail navigation, sections and live summary`.

---

### Task 4: Report screen

**Files:**
- Create: `src/ui/report/ReportView.tsx` (summary header + tabs as links + lazy tab panels), `src/ui/report/reportView.ts` (pure: `spellTable(log, durationMs)` → rows `{ spellId, damage, share, dps, casts, hits, crits, critPct, avgHit, avgCrit, misses }`, `auraUptimes(log, durationMs)`, `dpsSeries(log, durationMs, windowSec = 5)`, `cumulativeDps(...)`, `buffWindows(log)`, `insights(player, bot)` (2–4 sentences from uptime and cast differences; never more than the data says)), `src/ui/report/botRun.ts` (runs the bot once on the ended fight's setup and seed with the existing bot API, memoized per fight id; on the main thread, < 50 ms), `src/ui/report/DamageTab.tsx`, `src/ui/report/TimelineTab.tsx`, `src/ui/report/LogTab.tsx` (filter by text and kind, virtual list), `src/ui/report/RotationTab.tsx` (rules: your count vs bot count), `src/ui/report/SimulatorTab.tsx` (wraps the existing `SimulatorPanel` body: `SimulatorForm` + `SimulationResult`, histogram restyled, "Your fight" marker when a fight exists), `src/ui/report/CompareTab.tsx` (the scripts plan's `ComparePanel`, or the designed empty state), `src/ui/charts/{LineChart,Histogram,Lanes}.tsx` (SVG, one axis, `ResizeObserver` width, crosshair + tooltip, keyboard focusable points, `role="img"` + title, "Show data" table), `src/ui/report/report.css`, `tests/ui/report/*.test.tsx`, `tests/ui/report/report-view-model.test.ts`
- Modify: `src/ui/SimulatorPanel.tsx` (export `SimulatorForm` and `SimulationResult`; keep `SimulatorPanel` for legacy until Task 5; the "DPS histogram" accessible name and "Simulation result" region unchanged)

**Interfaces:**
- Report reads the last ended fight from the provider (`meta.lastFight: { id, log, snapshot, config, labels, seed } | null`); nothing is stored across reloads (as today).
- `spellTable` sums equal `snapshot.damageTotal` exactly (test with the golden default fight and raid-log fight); DPS uses the fight's duration.
- The bot comparison uses the same seed and setup as the played fight; when the setup cannot be replayed (e.g. database not loaded) the "% of the bot" line is omitted, never guessed.

- [ ] **Step 1: Write the failing tests:** view-models on the golden fights (default and raid-log bot logs as the "played" fight): per-spell sums, casts, crits, misses, uptimes, series length 60, cumulative DPS at 60 s equals `dps`; Report without a fight shows "Play a fight to see its report." with a link to `#/fight`; tabs are links with `aria-current` and deep-linkable; Damage tab table headers and totals; Log filter narrows rows and the list renders ≤ 60 DOM rows for 1,000 events; Simulator tab runs with an injected runner (existing simulator-panel tests migrated) and shows the "You" marker after a fight; Compare tab empty state links to `#/setup/scenarios`.
- [ ] **Step 2: Run `npx vitest run tests/ui/report` — Expected: FAIL.**
- [ ] **Step 3: Implement** (charts follow the dataviz rules in the spec: thin marks, one axis, buff windows as lanes, legend, tooltip, table view; the chart palette pair `--mark-shadow`/`--mark-fire` is validated).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, Playwright: play a 20 s fight, open Report, screenshot all tabs at 1440 dark/light and 390 (read, fix) — Expected: green.**
- [ ] **Step 5: Commit** `feat(ui): report mode with damage table, DPS timeline, log, rotation and simulator`.

---

### Task 5: Polish, accessibility and performance pass, visual regression, README

**Files:**
- Delete: `LegacyLayout` and the legacy wrappers (`SetupPanel`/`GearPanel`/`TalentsPanel`/`SimulatorPanel` `<details>` shells) once no test imports them; `src/ui/game.css` rules no longer referenced
- Create: `scripts/screens.mjs` (Playwright: preview by PID, every route at 1440 dark/light, 1024 dark, 390 dark/light, writes `docs/design/screens-app/*.png`, fails on console errors or horizontal overflow), `tests/ui/a11y.test.tsx` (landmarks, one `h1` per view, skip link, focus after navigation, icon buttons named, no `outline: none` in CSS files (grep test), no `transition: all` (grep test), every `<img>` has width/height)
- Modify: `README.md` (Polish: the three modes, routes, hotkeys only in Fight, `g`-shortcuts and `?`, themes, where each old panel went, screenshots), `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list pointer to this redesign), `package.json` (`"screens": "node scripts/screens.mjs"`)

- [ ] **Step 1:** Migrate the remaining tests from `render(<GameView …/>)` to `renderApp({ route })`; run the Vercel web-interface-guidelines checklist over `src/ui/**` and fix every finding (file:line list in the commit body); verify the contrast table of the spec against the final CSS tokens with a small script (`tests/ui/contrast.test.ts` computes WCAG ratios from `tokens.css` values for the pairs listed in the spec, ≥ 4.5 for text, ≥ 3 for focus and large text).
- [ ] **Step 2:** Performance: React Profiler run of a full 60 s fight (Playwright + `window.__RENDER_COUNTS__` in dev builds only), confirm the render budget; Lighthouse-style checks: first load JS of the Fight route not larger than today's main chunk + 10%, fonts ≤ 100 KB on first paint.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build && npm run screens`; read every screenshot; fix alignment, overflow, contrast and density defects; repeat until clean (at least two passes).
- [ ] **Step 4:** Final review against the spec (mapping table complete, state matrix, motion, a11y, responsive, performance, copy) and the Review Focus list; goldens byte-identical (`npx vitest run tests/smoke.test.ts tests/bot tests/sim-runner tests/script`).
- [ ] **Step 5: Commit** `feat(ui): polish, accessibility and performance pass; docs and screenshots`.

---

## Self-Review

- **Spec coverage:** §3 IA and routes → Task 1 (shell, router, chips, shortcuts) + Tasks 2–4 (views); §3.4 mapping table → Task 2 (fight rows), Task 3 (setup rows), Task 4 (report rows), Task 5 (legacy removal); §4 tokens/type → Task 1; §5 wireframes → Tasks 2–4 (port from the prototype); §6 state matrix → tests in Tasks 2–4; §7 motion → Task 2 (arena entrance, sweeps, reduced motion); §8 a11y → Global Constraints + Task 5 a11y tests; §9 responsive → screenshots in Tasks 2–5; §10 performance → render budget tests (Task 2) and Task 5 profiling; §11 copy → Global Constraints; §12 questions → `pauseOnLeave` option (Q1), arena tokens (Q2), coach glow switch in the dock (Q3), end card (Q4), fonts isolated in `fonts.ts` (Q5), Simulator tab (Q6), ring loop as one CSS rule (Q7).
- **Test strategy:** the legacy layout keeps the whole suite green while the shell is built; every task migrates the tests of its area to `renderApp({ route })` and keeps names stable; Task 5 removes the legacy layout only when nothing imports it.
- **Judgement left to the executor:** exact component split inside sections, the throttle implementation, whether `useSyncExternalStore` or context splitting carries the per-frame snapshot (must meet the render budget), the virtual list implementation (no new dependency unless needed).
