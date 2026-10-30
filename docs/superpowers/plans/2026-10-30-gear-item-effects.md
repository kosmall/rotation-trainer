# Gear Item Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The on-use and proc effects of the items the player wears become the "Items and cooldowns" entries: derived from the gear and the item database instead of hard-coded Icon/Band.

**Architecture:** The generator extends `src/data/items/db.json` with structured stat-buff effects; a pure `deriveGearEffects(gear, db)` turns the worn items' effects into catalog entries (item actions for on-use, hooks plus auras for procs); `applySetup` uses the derived catalog next to the static one; the Setup panel lists the worn items' effects; the item row grows to 6 slots.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest, Playwright (smoke), node scripts. Wowsims clone (MIT, read-only, UNTRUSTED data): `/tmp/claude-0/-home-user-rotation-trainer/ace88de3-2ad9-58eb-888e-cd9aba355637/scratchpad/clone/tbc-new`.

**Spec:** `docs/superpowers/specs/2026-10-30-gear-item-effects-design.md`. Builds on the item actions plan (`2026-10-30-item-actions-and-fight-settings.md`) and stage 2a (`2026-10-30-gear-stage-2a.md`).

**Execution order:** Tasks 1–3 in order. Runs after stage 2a Task 5 (docs and final review) is committed.

## Global Constraints

- Default setup (author's gear, nothing enabled) gives exactly 1425.1766666666667 (queue window 400) and 1428.3350000000003 (0); the "Raid as in my log" preset keeps its stats at the pull and its mean DPS within seed noise of today's (state the numbers before/after); stage 1/1.5/F/2a tests keep their intent (any changed assertion is listed with the reason).
- `src/engine` untouched unless unavoidable (state why). Derived catalog entries are built fresh per call, deep-frozen if shared, never mutating the DB, the gear or the static catalog; no AuraDef/hook object shared with the spec.
- Hooks never run on DoT ticks; `api.roll` is drawn only when the proc can actually trigger (ICD not running), so runs without such an item draw nothing extra.
- Hostile input: stored `enabledBuffs` with unknown/old ids, gear with unknown ids, huge lists: never throws, never hangs (normalize functions stay pure).
- Every game number has a source (db.json fields, `stat_bonus_procs_auto_gen.go`, Wowhead TBC tooltip) or `// UNVERIFIED`; sources, counts and unmodelled lists go into `docs/data-sources.md` ("Part F: gear item effects").
- Hotkeys: rulings S5; item row keys Z X C V B N. Commit messages end with the attribution trailers the controller gives. No PR is created.

## Review Focus

1. Trigger semantics of procs (cast/hit/crit), ICD handling, chance, duration refresh vs stack, interaction with the Band-like existing behavior (Task 1, 2).
2. Migration: old ids and presets, stale enabled ids, golden equality (Task 2).
3. Changing gear updates the list and keeps enable state by id; two trinkets with on-use at once; 6 item slots and the cap (Task 3).

---

### Task 1: Structured item effects in the database

**Files:**
- Modify: `scripts/build-item-db.mjs`, `src/data/items/types.ts`, `src/data/items/db.json` (regenerated), `docs/data-sources.md`
- Test: `tests/data/item-effects-db.test.ts` (extend `tests/data/item-db.test.ts` only for the size cap)

**Interfaces:**
- `ItemRecord.effects?: string[]` stays (text for everything unmodelled); new `ItemRecord.useEffect?: { stats: Partial<RawStats>; durationMs: number; cooldownMs: number; group?: { id: number; ms: number }; buffName: string }` and `ItemRecord.procEffect?: { stats: Partial<RawStats>; durationMs: number; chance: number; icdMs: number; trigger: 'cast' | 'hit' | 'crit'; buffName: string }` (arrays if an item has several: use `useEffects`/`procEffects` arrays; keep fields sparse). Only buffs whose stats are all modelled `RawStats` keys (spell power/shadow/fire, int, spirit, crit, hit, haste, mp5); the rest stay text.
- Trigger source: wowsims tbc-new `sim/**/stat_bonus_procs_auto_gen.go` and item definitions (find how each proc item registers: `ProcMask`, `Callback` (`OnSpellHitDealt`, `OnCastComplete`, `OnPeriodicDamageDealt`, crit-only)); map to `cast` (any cast complete), `hit` (landed spell hit), `crit` (crit only); anything else (periodic damage, healing, melee, on-damage-taken) → not modelled (text).

- [ ] **Step 1: Write the failing tests:** `Icon of the Silver Crescent (29370): useEffect +155 spell power, 20000 ms, cooldown 120000, group 1141 / 20000`; `Band of the Eternal Sage (29305): procEffect +95 spell power, 10000 ms, chance 0.1, icd 60000, trigger per the wowsims definition (state which)`; `Quagmirran's Eye (27683): proc +320 haste 6000 ms chance 0.1 icd 45000`; `Call of the Nexus item 34321... (verify name/id)`; every on-use trinket in the DB with a stat buff has useEffect with positive cooldown and duration; every stat-buff proc item has trigger in the allowed set or is text-only; none of the effect stats key outside RawStats; counts pinned; gzip/raw size cap.
- [ ] **Step 2: Run `npx vitest run tests/data` — Expected: FAIL.**
- [ ] **Step 3: Implement** the generator extension, regenerate, document in Part F (counts per kind, trigger mapping, what stays text and why).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build && npm run icons` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(data): structured on-use and proc effects in the item database`.

---

### Task 2: Derive the effects from the gear

**Files:**
- Create: `src/setup/gearEffects.ts`, `tests/setup/gear-effects.test.ts`
- Modify: `src/setup/applySetup.ts`, `src/setup/defaults.ts`, `src/setup/presets.ts`, `src/data/common/buffs.ts`, `src/data/classes/warlock/buffs.ts`, `src/engine/types.ts` only if hook triggers need it

**Interfaces:**
- `deriveGearEffects(gear: (EquippedItem|null)[], db: ItemDb): BuffDef[]` (pure): per worn item (both rings and trinkets) and per modelled effect: a `BuffDef` with id `item:<itemId>` (`item:<itemId>:<n>` for a second effect of the same item), `group: 'item'`, name/description from the item record, `icon` the item icon file name (plus a flag so the UI uses the item icon path), `effect.action` (SpellDef item action, id `use-item-<id>`, `sharedCooldown` from the group, `cooldownMs` own) and `effect.selfAura` for on-use; `effect.hooks` + `effect.auras` (ICD hidden aura + buff aura) for procs with trigger semantics: `cast` runs on every completed player spell, `hit` on outcome hit or crit, `crit` on crit only; `api.roll()` only when the ICD aura is not up. Unmodelled effects return as text in a separate `unmodelledGearEffects(gear, db)`.
- `applySetup` takes the derived entries (`gear` from the config, `db` as an argument or via a prepared catalog): enabled ids whose derived entry exists are applied, others ignored; `normalizeSetup` migrates `icon-of-the-silver-crescent` → `item:29370` and `band-of-the-eternal-sage` → `item:29305`; the static catalog drops the two hard-coded entries (consumables, Heroism, debuffs and warlock options stay); `raid-log` preset uses the new ids.
- Item action slots: up to 6 (keybinds extended to 18: 12 spells + Z X C V B N); more than 6 enabled on-use effects → the extra ones are not bound and `describeGear`/panel reports it.

- [ ] **Step 1: Write the failing tests:** derivation for the author's gear gives exactly the entries for Icon (use) and Band (proc) with the same numbers as the old hard-coded entries (compare field by field with the stage F values: +155/20 s/120 s/group 20 s; +95/10 s/10%/60 s ICD); golden: with nothing enabled results exactly 1425.17…/1428.33…; with Icon+Band enabled via NEW ids the bot's mean DPS over seeds 1–10 equals the previous hard-coded run exactly (same seeds, windows 400 and 0) and the logs are byte-identical to the old behavior for the Icon+Band run (capture old logs from the commit before this task); old ids migrate and the raid-log preset's stats at the pull and mean DPS are unchanged; swapping a trinket for one with an on-use stat buff adds its action to the item row and its aura works in a scripted fight; a proc item (Quagmirran's Eye) procs at the configured chance with ICD (seeds, many rolls), never twice inside ICD, never rolls while the ICD is up (RNG draws pinned), `cast`/`hit`/`crit` trigger semantics each tested; two on-use trinkets share the 20 s group; stale enabled ids (item no longer worn) are inactive and not shown; hostile `enabledBuffs`; 7 on-use effects → 6 bound; jump-vs-steps equality with a proc item.
- [ ] **Step 2: Run `npx vitest run tests/setup tests/data tests/bot` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): item effects derived from the worn gear`.

---

### Task 3: UI, docs and final review

**Files:**
- Modify: `src/ui/SetupPanel.tsx`, `src/ui/GameView.tsx`, `src/ui/ActionBar.tsx`, `src/ui/keys.ts`, `src/ui/game.css`, `src/ui/buffsView.ts` (if names/icons need it), `README.md`, `docs/data-sources.md`
- Test: `tests/ui/gear-effects-ui.test.tsx`, existing UI tests updated minimally

**Interfaces:**
- The Setup panel's "Items and cooldowns" group is built from `deriveGearEffects(gear, db)` for the worn items (item icon path helper from stage 2a, name, description line: stats, duration, cooldown, chance/ICD, trigger), with the enable checkbox; Heroism stays in the Fight group; consumables unchanged. A "Not modelled effects of your gear" list under the group (text from the DB). Before the database has loaded (default gear) the derived entries of the author's embedded gear are available without the db (embedded copy or the same data path: state how); when the gear changes the list updates at once and the enabled state is kept by id.
- Item row: 6 slots with keys Z X C V B N (`SLOT_KEYS`, `keyToSlot`, `ActionBar`), same behaviors as before; `GameView` hotkey rules unchanged.
- Buffs panel (`buffsView`) names and icons of the derived auras (the catalog source for aura names now includes the derived entries).

- [ ] **Step 1: Write the failing tests** (jsdom, db injected): `the Items group lists the Icon and the Band for the author's gear (not hard-coded: remove it from the static catalog and it is still there)`; `swapping the trinket in the Gear panel for another on-use trinket updates the list at once and the old one disappears, enabled state kept by id for items still worn`; `enabling a worn on-use trinket puts it on the item row with its key; B and N work; Z X C V unchanged; typing in inputs never fires them`; `a proc item shows chance/ICD/trigger and its aura appears in the buffs panel after a proc (seeded)`; `unmodelled effects listed`; `more than 6 on-use effects: warning, 6 bound`; `stored old ids load as the new ones`; `the pending-setup note covers the effects list`.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): the effects now follow the worn gear; update `docs/data-sources.md` Part F (derivation rules, triggers, migration, unmodelled lists, the 6-slot item row).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build && npm run icons`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): open Gear, swap a trinket for an on-use one, see it in Items and cooldowns, enable it, press R, use it from the item row, watch the buffs panel, reload (persisted), no console errors, screenshots desktop dark/light and phone 390 px (read them, fix visible defects) — Expected: green, defects fixed.**
- [ ] **Step 5: Final review of the whole feature (diff from this plan's base commit, Review Focus list, determinism and golden values, hostile input fuzz); fix Critical/Important findings with tests, cheap minors.**
- [ ] **Step 6: Commit** `feat(ui): items and cooldowns follow the worn gear`.

---

## Self-Review

- **Spec coverage:** §2 A → Task 1; B and C → Task 2; D → Task 3; §3 rules → tests in Tasks 1–3; §4 risks → Review Focus.
- **Type consistency:** `useEffect`/`procEffect` fields (Task 1) are read by `deriveGearEffects` (Task 2) and displayed by the panel (Task 3); derived `BuffDef` ids `item:<id>` are used by `normalizeSetup` migration (Task 2), the panel and the buffs panel (Task 3).
- **Judgement left to the executor:** exact proc trigger mapping from wowsims, how the embedded default gear's effects are available before the db loads, the shape of effect descriptions.
