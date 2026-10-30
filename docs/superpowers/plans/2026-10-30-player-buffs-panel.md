# Player Buffs Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated "Your buffs" panel that shows the player's active auras with time left (Heroism/Bloodlust, trinket and potion auras, Band proc), the scheduled auras still to come, and the permanent buffs enabled in the setup.

**Architecture:** UI only. A pure helper turns `snapshot.selfAuras`, the applied setup's scheduled auras and the enabled catalog entries into three view lists; a small hook remembers each aura's largest seen remaining time for the bar; a presentational `PlayerBuffsPanel` renders them; `GameView` replaces the small "Buffs" chip list with it. No engine or data changes.

**Tech Stack:** React, TypeScript (strict), Vitest (`tests/ui` jsdom project, pure helper tests in the node project), `@testing-library/react`, Playwright (pre-installed, smoke only).

**Spec:** `docs/superpowers/specs/2026-10-30-player-buffs-panel-design.md`. Runs after `docs/superpowers/plans/2026-10-30-item-actions-and-fight-settings.md` is complete (same UI files).

## Global Constraints

- Pure frontend; no engine, data or setup changes (if one seems needed, stop and report). `src/engine` untouched.
- Hotkey rules stay (rulings S5 and the item row keys Z X C V): the panel's interactive element (the collapsible summary of permanent buffs) must not break them.
- All displayed times come from the snapshot or the applied setup, clamped to the fight's end (`fightRemainingMs`), formatted with `remainingText`; seconds with one decimal below 10 s as elsewhere in the UI.
- Accessible: list semantics, labels with the time left in words, no `aria-live` spam, contrast in dark and light, no horizontal scroll at 390 px; `prefers-reduced-motion` disables the pulse.
- Commit messages end with the attribution trailers the controller gives in each dispatch. No PR is created.

## Review Focus

1. The bar's total never exceeds 100% or goes negative; a refreshed aura restarts it; an aura that fades and returns restarts it (Task 1).
2. Upcoming entries disappear exactly when the aura applies (no frame with both, no frame with neither), including before the fight starts and after it ends (Task 1, 2).
3. No re-render storm or timer leak: the panel reads the existing rAF-driven snapshot, adds no timers (Task 2).
4. A fight length other than 60 s, an upcoming aura beyond the end (not shown), item auras from the item bar appearing in the panel (Task 1, 2).

---

### Task 1: View model, hook and panel component

**Files:**
- Create: `src/ui/buffsView.ts`, `src/ui/PlayerBuffsPanel.tsx`
- Modify: `src/ui/game.css`
- Test: `tests/ui/buffs-view.test.ts` (node-safe pure tests), `tests/ui/player-buffs.test.tsx`

**Interfaces:**
- Produces in `buffsView.ts` (pure, no React): `buildBuffViews(input: { selfAuras: Record<string, AuraView>; spec: SpecData; catalog: readonly BuffDef[]; scheduled: readonly ScheduledAura[]; enabledBuffIds: readonly string[]; nowMs: number; phase: 'ready' | 'running' | 'ended'; fightDurationMs: number }): { active: ActiveBuffView[]; upcoming: UpcomingBuffView[]; permanent: PermanentBuffView[] }` where `ActiveBuffView = { auraId; name; icon; description; count: number | null; remainingMs (clamped to fight end); totalMs? }` (totalMs filled by the hook, not here), `UpcomingBuffView = { auraId; name; icon; startsAtMs; inMs }` (only `on: 'self'` entries with `atMs > nowMs` and `atMs <= fightDurationMs`; in `ready` `inMs = atMs`), `PermanentBuffView = { id; name; icon; description }`. Active order: first applied first (stable by the order of `Object.values(selfAuras)` as the tracker gives it, then by auraId). Permanent = enabled catalog entries with no `timed`, no `action`, and none of `selfAura`/`targetAura` set (stat-only buffs).
- Hook `useAuraTotals(active: ActiveBuffView[]): Map<string, number>` in `PlayerBuffsPanel.tsx` or `buffsView.ts` (React-free core `nextTotals(prev, active)` exported and tested): per auraId the largest remaining time seen since the last application; restarts when `remainingMs` increases between two snapshots (refresh) or the aura was absent.
- `PlayerBuffsPanel({ active, upcoming, permanent, totals, phase })`: `<section aria-label="Your buffs">` with an active list (`role="list"`; entries: icon via `SpellIcon` with school-neutral tile fallback, name, count badge, time text, bar `role="progressbar"`-less decorative div with `style.width` percent; entry `aria-label` "Name, 23 seconds left"), an "Upcoming" list ("Heroism / Bloodlust in 12.0 s" / "at 6.4 s" in `ready`), a collapsible `<details>` "Setup buffs (N)" with permanent icons (title = name and description). Empty state text "No active buffs". Entries below 5 s remaining get class `buff-expiring` (pulse; disabled under `prefers-reduced-motion`).

- [ ] **Step 1: Write the failing tests**
  - view model: `active entries carry name/icon/count/remaining clamped to the fight end`; `hidden auras are not in selfAuras (nothing to do) and unknown aura ids fall back to the id as name`; `upcoming lists only self entries after now and within the fight, sorted by atMs; in ready inMs equals atMs; an entry at atMs equal to now is not upcoming (it has applied)`; `permanent lists stat-only enabled buffs and none of the timed/action/aura buffs`; `fight length other than 60 s clamps correctly`.
  - `nextTotals`: `a new aura starts at its remaining time; the total is the max seen; a refresh (remaining rises) restarts; an aura that fades is dropped and returns as new`; bar fraction `remaining / total` is within [0, 1] for 10 000 random sequences.
  - component: renders the three parts; `aria-label` text with time left; `buff-expiring` below 5000 ms and not at 5000; reduced-motion media rule present in CSS (grep the stylesheet in the test, as game.test does for other CSS); empty state; details closed by default; keys typed while the summary is focused follow the S5 guard (Space/Enter belong to it; other hotkeys still cast: reuse the GameView wiring test in Task 2).
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement** the helper, the hook core, the component and the CSS (both themes, 390 px).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(ui): player buffs panel component`.

---

### Task 2: Wire it into the game view, smoke test, docs

**Files:**
- Modify: `src/ui/GameView.tsx`, `src/ui/TargetPanel.tsx` (remove only what the panel replaces), `src/ui/game.css`, `README.md`, `docs/data-sources.md` (a short "Player buffs panel" note under the UI/Setup notes)
- Test: `tests/ui/setup-wiring.test.tsx` and `tests/ui/game.test.tsx` (extend; update the few tests that looked for the old "Buffs" list by label)

**Interfaces:**
- `GameView`: builds the view with `buildBuffViews` from `snapshot`, `fight.sim.scheduledAuras` (the running fight's own applied setup), `fight.config.enabledBuffs` and the catalog, memoised on `snapshot` identity (no extra timers); renders `PlayerBuffsPanel` where the small "Buffs" `AuraList` was (the target debuff list is unchanged); shows the active preset's fight, not the pending setup (same rule as the Priority note).

- [ ] **Step 1: Write the failing tests** (jsdom, fake timers as in `setup-wiring.test.tsx`)
  - `Heroism enabled at 6 s: before the start the panel lists it as upcoming "at 6.0 s"; at 3 s of fight it says "in 3.0 s"; at 6 s it moves to active with about 40 s left and a bar near 100%; at 46 s it is gone`.
  - `item auras appear after use: using Icon from the item bar shows its aura with 20 s counting down; Destruction Potion 15 s` (needs the item-actions feature; write the test against it).
  - `Band proc (seeded) shows its +95 aura for 10 s when it procs and its hidden ICD aura is never shown`.
  - `permanent setup buffs section counts the enabled stat-only buffs; toggling a buff updates it for a not-started fight and not for a running one (pending note rules)`.
  - `fight length 30 s: upcoming at 45 s is not shown; an active aura's time left never exceeds the fight's remaining time`.
  - `no extra timers: advancing fake timers does not create intervals (vi.getTimerCount unchanged)`.
  - Existing UI tests keep passing (label changes only where the old "Buffs" list was queried).
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement** the wiring and docs; README (Polish): the panel and what its three parts show.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): enable Heroism (start 8 s), Icon, Destruction Potion, Band; press R, cast, use items; watch the panel at several moments (upcoming countdown, active timers and bars, expiring pulse, setup buffs details), reload, no console errors; screenshots desktop dark/light and phone 390 px (read them, fix visible defects: overlap, clipping, contrast, horizontal scroll) — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): show player buffs in the game view`.
- [ ] **Step 6: Final review of the feature** (whole diff from this plan's base commit, the Review Focus list above); fix Critical/Important findings and cheap minors; commit.

---

## Self-Review

- **Spec coverage:** §2 three parts and the replaced chip list → Tasks 1–2; §3 data sources and the total-time rule → Task 1 (`nextTotals`, `buildBuffViews`); §4 behavior and accessibility → Tasks 1–2; §5 risks → Review Focus.
- **Type consistency:** `ActiveBuffView`, `UpcomingBuffView`, `PermanentBuffView` and `buildBuffViews` (Task 1) are the names Task 2 uses; `AppliedSetup.sim.scheduledAuras` and `SetupConfig.enabledBuffs` come from stage 1.5 and the item-actions plan.
- **Judgement left to the executor:** exact CSS layout and placement on screen, bar styling, the school-neutral tile colour for auras without a spell.
