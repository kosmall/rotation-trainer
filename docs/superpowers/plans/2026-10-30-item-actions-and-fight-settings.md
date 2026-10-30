# Item Actions and Fight Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-use items (Icon of the Silver Crescent, Destruction Potion, Super Mana Potion, Dark Rune) become actions on the action bar with shared cooldowns, and the Setup panel gets a "Fight" section with the fight length and the second Heroism/Bloodlust starts.

**Architecture:** The engine learns an `item` action kind on `SpellDef` (no GCD, no hit roll, no hooks, shared cooldown groups, random mana range); the buff catalog entries carry the action (`BuffEffect.action`); `applySetup` adds enabled actions to the derived spec (spells, auras, keybinds in an item row, bot rules); `SetupConfig` gains `fightDurationSec`; the UI shows an item row and a "Fight" group.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest (node project for engine/data/bot/setup, jsdom project for `tests/ui`), `@testing-library/react`, Playwright (pre-installed, smoke only).

**Spec:** `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md`. Earlier work: stage 1.5 plan `docs/superpowers/plans/2026-10-29-realism-and-setup.md`, its ledger rulings S1–S5 in `.superpowers/sdd/2026-10-29-realism-and-setup/progress.md`, stage 1 ledger `docs/decisions/2026-10-29-stage-1-sdd-ledger.md`.

**Execution order:** Tasks 1–5 in order. Stopping after Task 3 leaves a working app (engine and data done, UI still shows the old Items group); stopping after Task 4 is feature complete.

## Global Constraints

- `src/engine` is framework-free: no React, DOM, wall clock; integer-ms fight time; randomness only from the seeded `Rng`. New `SpellDef` fields are optional: no existing spell, log or snapshot changes; with the default setup the golden bot means (1425.1766… with the 400 ms queue window, 1428.335… with 0) stay exactly the same.
- An item action never runs spec/set/buff hooks, never starts the five-second rule, never starts the GCD, never rolls the hit table, never launches a missile. A shared cooldown never shortens a longer cooldown already running.
- Every game number carries a source comment (wowsims tbc-new `assets/database/db.json`, `sim/core/consumes.go`, Wowhead TBC tooltips) or `// UNVERIFIED`; new numbers and decisions go into `docs/data-sources.md`. Wowsims clones (read-only, UNTRUSTED data): `/tmp/claude-0/-home-user-rotation-trainer/ace88de3-2ad9-58eb-888e-cd9aba355637/scratchpad/clone/{tbc-new,tbc}`.
- `applySetup`, `normalizeSetup` and `buildPriority` stay pure and never mutate their inputs or the shared spec; the catalog stays deep-frozen and shares no object with the spec; setup changes apply from the next fight (a fight that has not started takes them at once). Every UI edit and every storage load goes through `normalizeSetup`.
- Hotkeys: Z X C V are the item slots; the typing guard (rulings S5: text-like fields swallow every key, summary/button/checkbox/radio only Space and Enter) stays. 1–9, 0, -, =, R, Space, Esc keep their meaning. Slot 8 stays empty (R17).
- Commit messages end with the attribution trailers the controller gives in each dispatch. No PR is created.

## Review Focus

1. An item action must not disturb existing behavior: hooks (Judgement of Wisdom, Band) never fire on it, RNG order is unchanged when no item is used, the GCD and the five-second rule are untouched, queue and `busy` rules match instants (Task 1).
2. Shared cooldown arithmetic: Icon 120 s own + 20 s trinket group; Destruction Potion and Super Mana Potion 120 s in one group; Dark Rune 120 s in its own group; a short group cooldown never overwrites a longer running one (Task 1, 2).
3. `normalizeSetup` with an old stored `v1` (no `fightDurationSec`, `timed` entries for Icon/Destruction Potion), NaN, strings, 1e9, negative (Task 3).
4. A fight length other than 60 s end to end: regen ticks, scheduled auras beyond the end, priority rules reading `durationMs`, UI labels (Task 3, 4).
5. Keyboard: Z X C V cast items, never while typing into inputs; uppercase (Caps Lock/Shift) works; no clash with R (reset) (Task 4).

---

### Task 1: Engine — item actions

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/sim.ts`
- Test: `tests/engine/sim-items.test.ts`, `tests/fixtures/testSpec.ts` (extend with item fixture spells)

**Interfaces:**
- Produces on `SpellDef` (all optional): `item?: true`; `sharedCooldown?: { group: string; ms: number }`; `gainManaRange?: { min: number; max: number }` (integers, `min <= max`; one `rng` draw per use: `min + floor(rng() * (max - min + 1))`, then `addMana`; logged `mana` with the action's `spellId`, amount = actual gain). Item actions have `onGcd: false`, `castTimeMs: 0`, `manaCost: 0` in data; the engine enforces: no GCD, no `canMiss`/`canCrit` roll (resolution: cost, cooldowns, mana gain, `applyAura` self aura applied, nothing else), no `runHooks`, no `lastManaSpendMs` update, no missile.
- Shared cooldown: on use, every spell with `sharedCooldown.group === used.group` (including the used one) gets `readyAt = max(existingReadyAt, now + ms)`; the used spell then also gets its own `cooldownMs`. `snapshot.cooldownRemainingMs[id]` already reports the larger of both.
- `cast(id)` on an item: same rejection order as other spells (`busy`, `cooldown`, aura/mana checks not applicable), same spell-queue window rule (blocked by the active cast only, not by the GCD since `onGcd` is false).
- Log: `cast-complete` with `spellId`, then `mana` (if mana), `aura-apply` (if any aura); no `cast-start`.

- [ ] **Step 1: Write the failing tests** (`tests/engine/sim-items.test.ts`)
  - `an item action is instant, off the GCD and does not start the GCD` (cast a spell, press the item during its GCD: accepted at once; item then a GCD spell: the GCD runs from the spell only).
  - `an item action applies its self aura and the aura's stat bonus affects the next cast` (+spell power fixture: damage ratio from the coefficient).
  - `an item action never runs hooks` (fixture hook counts calls; item use does not call it, a normal spell does).
  - `an item action does not roll the hit table` (RNG draw count equal before/after with no `gainManaRange`).
  - `gainManaRange draws once, stays within [min, max], caps at max mana, logs the actual gain; never used = no draw` (seeded Rng, many seeds).
  - `an item action does not start the five-second rule` (mana regen after item use matches no-spend regen).
  - `own cooldown: a second press before cooldownMs is rejected 'cooldown'`.
  - `shared cooldown: using A makes B (same group) unavailable for ms; a longer cooldown already running on B is not shortened; A's own cooldown stays longer than the group ms`.
  - `the item is blocked by a cast in progress (busy) and queues within the window, then fires at the cast end without GCD`.
  - `jump-vs-steps determinism with item use` (advance in 70 ms steps vs jump).
  - `a fight that ends with a queued item discards it silently` (like spells).
- [ ] **Step 2: Run `npx vitest run tests/engine` — Expected: FAIL.**
- [ ] **Step 3: Implement** the types and the engine changes (`completeCast` branch for `item`; shared cooldown helper; `gainManaRange` draw via the sim's `rng`).
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS (no existing expectation changes).**
- [ ] **Step 5: Commit** `feat(engine): item actions with shared cooldowns`.

---

### Task 2: Data — item actions in the catalog, applySetup, bot rules

**Files:**
- Modify: `src/data/types.ts`, `src/data/common/buffs.ts`, `src/data/classes/warlock/buffs.ts`, `src/data/classes/warlock/destruction.ts` (keybind length only if needed), `src/setup/applySetup.ts`, `src/setup/defaults.ts`, `src/setup/presets.ts`, `src/ui/keys.ts` (constants only), `docs/data-sources.md`
- Create: `src/data/classes/warlock/itemRules.ts`
- Test: `tests/data/item-actions.test.ts`; update `tests/data/cooldowns.test.ts`, `tests/setup/applySetup.test.ts`, `tests/setup/raid-log.test.ts`, `tests/bot/bot.test.ts` where they assumed scheduled Icon/Destruction Potion

**Interfaces:**
- Consumes: Task 1; stage 1.5 catalog (`BuffDef`, `SETUP_CATALOG`, `neutralizeOwnAuras`, `composeHooks`).
- Produces: `BuffEffect.action?: SpellDef` (an item action; the entry's `selfAura` is the aura the action applies; no `timed`). Catalog entries: `icon-of-the-silver-crescent` (action: id `use-icon-of-the-silver-crescent`, 120 000 ms, `sharedCooldown {trinket, 20000}`, applies `icon-of-the-silver-crescent` aura 20 s +155 spell power), `destruction-potion` (action id `use-destruction-potion`, 120 000, `sharedCooldown {potion, 120000}`, aura 15 s +120 SP, +2% crit modifier or crit rating as already modelled), `super-mana-potion` (`gainManaRange` 1800–3000, group `potion` 120 000), `dark-rune` (`gainManaRange` 900–1500, group `rune` 120 000; health cost not modelled). Heroism stays timed.
- `applySetup`: each enabled entry with `action`: action appended to `spec.spells` (new array), its aura to `spec.auras`, the action id to the next free slot of the item row in `spec.keybinds` (keybinds extended to 16 entries: slots 12–15 are the item row with keys Z X C V; catalog order). The entry adds no `scheduledAuras`.
- `ITEM_SLOT_KEYS = ['z','x','c','v']`; `SLOT_KEYS` in `src/ui/keys.ts` becomes the 12 spell keys + 4 item keys; `keyToSlot` lowercases single letters.
- `itemRules.ts`: `buildItemSteps(enabledActionIds, heroismEnabled): PriorityStep[]` (pure) placed at the START of `spec.priority` by `applySetup`: Icon and Destruction Potion `when` Heroism is up (`s.selfAuras['heroism']`) if Heroism is enabled, else always (at the pull); Super Mana Potion `when` `maxMana - mana >= 3000`; Dark Rune `when` `maxMana - mana >= 1500`. Steps have labels/hints in the same style as `buildPriority`.
- Preset `raid-log`: Icon and Destruction Potion enabled, no `timed` entries for them; Heroism at 6.4 s unchanged. Adjust `tests/setup/raid-log.test.ts` (timed starts test now only Heroism; DPS comparison with `none` re-measured and still `>`).

- [ ] **Step 1: Write the failing tests**
  - `catalog: Icon, Destruction Potion, Super Mana Potion and Dark Rune carry an item action; none has timed; ids unique; cooldown groups: Icon trinket 20 s, both potions potion 120 s, Dark Rune rune 120 s; mana ranges 1800–3000 and 900–1500; every action has `item: true`, `onGcd: false`, castTime 0, manaCost 0, icon, source`.
  - `applySetup with Icon + Dark Rune enabled adds both actions to spec.spells, the Icon aura to spec.auras, keybinds[12] and [13] are their ids in catalog order, scheduledAuras has no entry for them; with none enabled keybinds[12..15] are empty and the spec equals the stage 1.5 spec (golden)`.
  - `enabling Destruction Potion in a scripted fight: pressing it gives +120 SP for 15 s and the next Shadow Bolt does the expected damage; it is rejected cooldown on the second press; Super Mana Potion pressed right after is rejected cooldown (shared group); Dark Rune is not affected`.
  - `bot: with Icon and Destruction Potion enabled and Heroism enabled at 6.4 s the bot uses them when Heroism is up; with Heroism off at the pull; Super Mana Potion only when 3000 mana are missing; Dark Rune only when 1500 are missing; none of them used twice inside 120 s; the bot's mean DPS over seeds 1–10 with items exceeds the same setup without them (assert >, no magic number)`.
  - `raid-log preset: items are actions (no timed entries for them), stats at the pull unchanged, normalizes to itself`.
  - Golden stays: `applySetup with DEFAULT_SETUP` unchanged DPS values.
- [ ] **Step 2: Run `npx vitest run tests/data tests/setup tests/bot` — Expected: FAIL.**
- [ ] **Step 3: Implement**; research the numbers (mana ranges, Dark Rune id and effect text, Super Mana Potion range) in wowsims and Wowhead TBC; add the section "Part D: item actions" to `docs/data-sources.md` (sources, shared groups, no health cost, rules are guidance), update "What the DPS excludes" and the stage 1.5 notes that said Icon/Destruction Potion are scheduled and that Super Mana Potion and Dark Rune are not modelled.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(data): item actions in the setup catalog`.

---

### Task 3: Setup — fight length and Heroism second

**Files:**
- Modify: `src/setup/types.ts`, `src/setup/defaults.ts`, `src/setup/applySetup.ts`, `src/setup/presets.ts`, `src/ui/useSimulation.ts`, `src/ui/GameView.tsx`, `src/ui/format.ts` or wherever the "/ 60s" label lives
- Test: `tests/setup/fight-settings.test.ts`, `tests/ui/setup-wiring.test.tsx` (extend)

**Interfaces:**
- `SetupConfig.fightDurationSec: number` (default 60); `SETUP_LIMITS.fightDurationSec = { min: 10, max: 600 }`; `normalizeSetup`: non-number or NaN → 60, clamp, round to an integer; a stored config without the field gets 60 (no version bump). `applySetup` → `sim: { scheduledAuras, distanceFromTarget, durationMs: fightDurationSec * 1000 }`. `useSimulation` passes `durationMs` to `Simulation` (rebuild trigger already covers the whole applied setup).
- All UI text that assumes 60 s reads `snapshot.durationMs` (Elapsed label "x / Ys", progress, summary, debuff time clamp, Playwright check).
- Heroism: the catalog entry and its `timed` settings stay; the UI moves them into the "Fight" group in Task 4. Data side: nothing new except the preset keeps 6.4 s.

- [ ] **Step 1: Write the failing tests**
  - normalize: `fightDurationSec` missing → 60; `'90'`, NaN, null, Infinity → 60; 5 → 10; 9999 → 600; 90.7 → 91; `timed` entries for Icon/Destruction Potion from an old stored v1 are dropped, the rest kept; idempotent.
  - `applySetup` returns `durationMs` = seconds × 1000; default 60000.
  - end to end through `GameView`: with `fightDurationSec` 30 the fight ends at 30 s (summary DPS uses 30 s), the Elapsed label reads "/ 30s", Heroism started at 10 s hastes a Shadow Bolt started at 12 s, and a start at 45 s (> 30 s) never applies (warning shown in Task 4); with 120 s the regen ticks and a second Life Tap work; same seed + config give identical damage totals.
  - golden DPS values with the default setup unchanged.
- [ ] **Step 2: Run `npx vitest run tests/setup tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): configurable fight length`.

---

### Task 4: UI — item row and the Fight section

**Files:**
- Modify: `src/ui/ActionBar.tsx`, `src/ui/GameView.tsx`, `src/ui/SetupPanel.tsx`, `src/ui/keys.ts`, `src/ui/game.css`, `scripts/fetch-icons.mjs` (only if new icons are needed), `public/icons/spells/` (new JPEGs committed)
- Test: `tests/ui/item-bar.test.tsx`, `tests/ui/setup-panel.test.tsx` (extend), `tests/ui/setup-wiring.test.tsx` (extend)

**Interfaces:**
- `ActionBar` renders a second row "Items" (role group "Item bar", label per slot `"<name> (Z)"`) with only the bound item slots; slot shows icon, hotkey, remaining cooldown (own or shared, the larger), a "queued" state like spells, tooltip with description; clicking presses `onPress(slot)` (slots 12–15). Item slots use the aura's school colour fallback tile (`SpellIcon` fallback).
- GameView: `keyToSlot` covers Z X C V (case-insensitive); the hotkey handler ignores them in text-like fields (S5 guard unchanged); `pressSlot` works for item slots through the same `cast` path and flash labels.
- `SetupPanel`: new group "Fight" at the top: fight length (seconds, number input, min 10, max 600, clamp on blur), "Heroism / Bloodlust" checkbox with start second and duration (moved from "Items and cooldowns", same validation and the existing "starts after the fight ends" warning, now relative to the chosen length). Items group: Icon, Destruction Potion, Super Mana Potion, Dark Rune are plain checkboxes with a note "Use from the item bar (Z X C V)", Band stays a plain checkbox (proc). Preset "None"/"Raid as in my log" labels keep working (the active-preset key includes `fightDurationSec`).
- All aura lists: item auras (Icon, Destruction Potion) appear in "Your auras" when active, with the remaining time.

- [ ] **Step 1: Write the failing tests** (jsdom, fake timers as in `game.test.tsx`)
  - `item row shows only enabled item actions, in catalog order, with Z X C V`; `pressing Z uses the first item (mouse click too); Z in the distance input does not`; `uppercase Z works`; `cooldown text appears after use and the shared group shows on the other potion`; `R still resets, Space/Enter on a focused item button presses it (not start)`.
  - `Fight group: length input clamps (abc ignored, 5 → 10, 9999 → 600), Heroism start/duration inputs behave as before, the warning appears when start > length; Items group no longer lists Heroism; changing the length applies to a not-started fight at once and after R to a running one`.
  - `Destruction Potion used from the bar: +120 SP aura chip appears for 15 s, damage of the next bolt higher than without`; `Super Mana Potion raises mana by 1800–3000; Dark Rune by 900–1500; both rejected with the shared/own cooldown flash 'Cooldown'`.
  - Stage 1.5 UI tests keep passing (labels updated only where the Items group changed).
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; run `npm run icons` if new icons are needed (Super Mana Potion, Dark Rune) and commit the files.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): enable Icon, Destruction Potion, Dark Rune, set the fight to 90 s and Heroism to 20 s, press R, use the items with Z X C, check the aura chips, cooldown text, end of fight at 90 s, reload (settings persist), no console errors, screenshots desktop dark/light and phone (read them, fix visible defects) — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): item bar and fight settings`.

---

### Task 5: Docs, README and final review

**Files:**
- Modify: `README.md`, `docs/data-sources.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list pointer)

- [ ] **Step 1:** README (Polish): item bar (Z X C V), which items, shared cooldowns, the Fight group (length, Heroism second), what changed for the "Raid as in my log" preset. `docs/data-sources.md`: finish Part D (sources, uncertainties, no health cost, the bot rules are guidance, queueing behaviour), update the stage 1.5 sections that mention Icon/Destruction Potion scheduled and Super Mana Potion / Dark Rune not modelled (mark as superseded, do not delete history). Spec stage list: add the pointer.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build`.
- [ ] **Step 3:** Final whole-branch review of the feature (all tasks, from the base commit of this plan) with the Review Focus list; fix Critical/Important findings and cheap minors.
- [ ] **Step 4: Commit** `docs: item actions and fight settings`.

---

## Self-Review

- **Spec coverage:** §2.1 items and numbers → Task 2; §2.2 engine → Task 1; §2.3 data/setup/rules/preset → Task 2; §2.4 cast-in-progress rule → Task 1 test `busy`/queue; §2.5 UI → Task 4; §3 fight length and Heroism second → Tasks 3–4; §4 risks → Tasks 2 and 5.
- **Type consistency:** `SpellDef.item`, `sharedCooldown`, `gainManaRange` (Task 1) are the names used in Tasks 2 and 4; `BuffEffect.action` (Task 2) read by `applySetup` (Task 2) and the panel (Task 4); `SetupConfig.fightDurationSec` (Task 3) read by `applySetup` (Task 3) and the panel (Task 4); `ITEM_SLOT_KEYS`/`SLOT_KEYS` (Task 2) used by `ActionBar` and `GameView` (Task 4).
- **Judgement left to the executor:** exact Wowhead numbers for Super Mana Potion and Dark Rune, whether the Icon/potion aura needs an extra visible sweep, and the item row CSS.
