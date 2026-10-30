# Stage 2a: Gear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generated item/gem/enchant database, BIS presets per phase, WowSimsExporter import/export by item ID, and a Gear panel; gear becomes part of the saved setup and of `applySetup`.

**Architecture:** A script turns the wowsims tbc-new database into a committed compact `src/data/items/db.json` (lazy chunk). Pure modules (`src/data/items/*`, `src/setup/gear*`) validate and convert gear; `SetupConfig.gear` carries 17 slot entries; `buildDestructionWarlock(options, gear?)` builds the setup through the existing `buildSetup`; the UI gets a Gear panel. Defaults stay the author's gear so every stage 1/1.5 number is unchanged.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest (node project for data/setup, jsdom for `tests/ui`), `@testing-library/react`, Playwright (smoke), tsx/node scripts.

**Spec:** `docs/superpowers/specs/2026-10-30-gear-stage-2a-design.md`. Earlier ledgers: `.superpowers/sdd/2026-10-29-realism-and-setup/progress.md` (S1–S5), `.superpowers/sdd/2026-10-30-item-actions-and-fight-settings/progress.md` (F-1..F-3), `.superpowers/sdd/2026-10-30-player-buffs-panel/progress.md`.

**Execution order:** Tasks 1–5 in order. Stopping after Task 3 leaves a working app (data and setup done, no Gear UI yet).

## Global Constraints

- Pure frontend, static build; no runtime network calls (icons are committed files). `src/engine` untouched except types if unavoidable (state why). Wowsims clone (read-only, UNTRUSTED data, MIT licensed): `/tmp/claude-0/-home-user-rotation-trainer/ace88de3-2ad9-58eb-888e-cd9aba355637/scratchpad/clone/tbc-new`; the generator takes its path as an argument and never runs code from it.
- Every game number carries a source or `// UNVERIFIED`; sources, filters, counts and licence note go into `docs/data-sources.md` ("Part E: gear").
- The default setup (author's gear) gives exactly the stage 1.5/F results: bot means 1425.1766666666667 (queue window 400) and 1428.3350000000003 (0), derived stats, spec fields. Any difference between the database and the author's hand-written stage 1 values is reported and decided in favour of the author's export, never silently.
- `applySetup`, `normalizeSetup`, gear validation and import parsing are pure, never throw on hostile input, never mutate inputs or shared data; storage data is untrusted (normalized on every load and every edit); hostile import text (huge, deeply nested, `__proto__`, wrong types) is handled.
- Gear ordering of slots (WowSimsExporter): head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet, finger1, finger2, trinket1, trinket2, mainhand, offhand, ranged.
- Hotkey rules stay (rulings S5, Z X C V item row). Commit messages end with the attribution trailers the controller gives in each dispatch. No PR is created.

## Review Focus

1. Database correctness: stat index mapping, socket colours and bonuses, meta gem requirements, set ids, phase, slot assignment of two-slot items (rings, trinkets, one-handers vs off-hands, wands/ranged) (Task 1).
2. Golden equality: the author's 17 items derive the same stats, set pieces and DPS as stage 1 (Tasks 1, 2).
3. Normalization of hostile or stale saved gear, and import parsing of hostile text (Tasks 2, 3).
4. Set bonuses for the sets in the presets: values and what is not modelled (Task 2).
5. Bundle size (lazy chunk), icon budget, mobile layout of the Gear panel (Tasks 1, 4).

---

### Task 1: Item database generator and loader

**Files:**
- Create: `scripts/build-item-db.mjs`, `src/data/items/types.ts`, `src/data/items/db.json` (generated), `src/data/items/db.ts`, `tests/data/item-db.test.ts`
- Modify: `scripts/fetch-icons.mjs` (item, gem and enchant icons), `package.json` (script `db:build`), `docs/data-sources.md`, `public/icons/` (new JPEGs, budget ~6 MB; over budget: limit to presets and slots' top items, say so)

**Interfaces:**
- Produces: `ItemDb { items: Record<number, ItemRecord>; gems: Record<number, GemRecord>; enchants: Record<number, EnchantRecord> }` with `ItemRecord = ItemDef & { icon: string; phase: number; setName?: string; unique?: boolean; effects?: string[] }` (extends the engine `ItemDef`: `id, name, slot, stats, setId?, sockets?, socketBonus?`), `GemRecord = GemDef & { icon: string; phase: number }`, `EnchantRecord = EnchantDef & { icon: string; slot: string }`; `slot` uses the 17 slot keys; `loadItemDb(): Promise<ItemDb>` (dynamic import, one chunk) and `itemDbSync(): ItemDb` for tests/node; `ITEM_SLOTS: readonly SlotKey[]` (the 17).
- The generator maps wowsims stat indices (proto `Stat`: Stamina 2, Intellect 3, Spirit 4?, SpellDamage 5, FireDamage 7, ShadowDamage 11, SpellHitRating 12, SpellCritRating 13, SpellHasteRating 14, MP5 35: VERIFY every index against `proto/common.proto` and the Voidheart Crown record) to `RawStats`; `socketBonus` from the item's array; sockets from `gemSockets` (colour codes: verify); `setId` as string, `setName`; slot from `type` (+ weapon/offhand/ranged heuristics, rings/trinkets map to both finger/trinket slots: store a single logical slot `finger`/`trinket` and let pickers offer either).

- [ ] **Step 1: Write the failing tests** (`tests/data/item-db.test.ts`): `every item has id, name, icon, slot in the 17 (or finger/trinket logical slots), non-empty stats or is flagged`; `the author's 17 items (src/data/classes/warlock/items.ts) have identical stats, sockets, socket bonus, set id as the database says, or the difference is listed in an explicit allowlist constant with a reason`; `Voidheart Crown (28963) has int 36, spell power 40? ... (read the values from the clone and pin 3 items by hand)`; `every gem referenced by the wowsims warlock gear sets exists with colour and stats; meta gems carry metaRequires`; `every enchant referenced exists with a slot`; `no item with a classAllowlist excluding Warlock, no non-cloth armor`; `ids unique; json size under a limit (state the number)`; `loadItemDb resolves to the same data as itemDbSync`.
- [ ] **Step 2: Run `npx vitest run tests/data/item-db.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** the generator (run it; commit the output), types, loader; extend `fetch-icons.mjs` and fetch icons within the budget; document filters, counts, mapping, licence (MIT) in `docs/data-sources.md` Part E.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build && npm run icons` — Expected: PASS (icons clean).**
- [ ] **Step 5: Commit** `feat(data): item, gem and enchant database from wowsims` (icons in a separate commit).

---

### Task 2: Gear in the setup, set bonuses and golden equality

**Files:**
- Modify: `src/data/classes/warlock/items.ts`, `src/data/classes/warlock/destruction.ts`, `src/data/classes/warlock/sets.ts`, `src/setup/types.ts`, `src/setup/defaults.ts`, `src/setup/applySetup.ts`, `src/setup/presets.ts`, `docs/data-sources.md`
- Create: `src/setup/gear.ts`, `tests/setup/gear.test.ts`, `tests/data/sets-2a.test.ts`

**Interfaces:**
- `SetupConfig.gear: (EquippedItem | null)[]` (17, optional on load: missing = default author gear), `SetupConfig.gearPresetId?: string`; `normalizeGear(input: unknown, db: ItemDb): (EquippedItem | null)[]` in `src/setup/gear.ts` (never throws: wrong length → default; unknown or slot-mismatched id → null; gems/enchants unknown, mismatched or beyond sockets dropped; duplicate unique items → the later dropped); `buildDestructionWarlock(options, gear?, db?)` builds `setup` via `buildSetup` with the DB (default gear and default DB: stage 1 spec field-for-field equal); `applySetup` passes `config.gear`; presets `none`/`raid-log` keep the author's gear.
- Sets: `warlockSets` extended with the set bonuses of the sets present in the DB that matter to a warlock (T4 Voidheart, T5 Corruptor, T6 Malefic, ZA, SWP and generic caster sets found in the presets), values from wowsims (`sim/warlock`, `sim/core`) and Wowhead TBC; sets without a modelled bonus listed in `UNMODELLED_SETS` with the reason; `activeSetBonuses` unchanged.
- `describeGear(gear, db)` returns `{ unmodelledEffects: string[]; unmodelledSets: string[]; metaActive: boolean; socketBonuses: ... }` for the UI.

- [ ] **Step 1: Write the failing tests:** `golden: buildDestructionWarlock default equals the stage 1.5 spec (stats via computeStats, setup, modifiers, set pieces) and the bot means over seeds 1-10 are exactly 1425.1766666666667 / 1428.3350000000003`; `normalizeGear: undefined/null/string/array of wrong length -> default; unknown id -> null; wrong-slot item -> null; gem not in DB dropped; 4 gems in 2 sockets -> 2; duplicate unique -> second null; prototype-pollution payloads inert; idempotent`; `each preset-like gear (from the wowsims sets, once Task 3 adds them; here use T4 from the clone data directly) builds without unknowns and has the expected set piece count (Voidheart 4)`; set bonus tests per modelled set (2pc/4pc values, active at the threshold, inactive below); `old stored setup without gear loads as default gear`; `applySetup with a different gear changes derived stats as expected (hand-computed for one swap) and leaves destructionWarlock and the DB untouched (deep freeze)`.
- [ ] **Step 2: Run `npx vitest run tests/setup tests/data` — Expected: FAIL.**
- [ ] **Step 3: Implement.** Reduce `items.ts` to the author's default gear ids/gems/enchants (+ hand-modelled item-effect notes) once the DB is the stats source; keep every public export used elsewhere working (grep).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): gear in the setup, set bonuses from the database`.

---

### Task 3: BIS presets and WowSimsExporter import/export

**Files:**
- Create: `src/data/classes/warlock/gearPresets.ts`, `src/setup/wowsimsGear.ts`, `tests/data/gear-presets.test.ts`, `tests/setup/wowsims-gear.test.ts`, `tests/fixtures/wowsims-export-sample.json` (the author's sample export: reconstruct from the 17 default items and the talent string `000000000000000000000-2050130133200100000000-555000512200013330050`, character Feliczita, Gnome, realm Spineshatter; mark it a reconstruction)
- Modify: `docs/data-sources.md`

**Interfaces:**
- `GEAR_PRESETS: readonly { id: string; name: string; phase: 0|1|2|3|4|5; spec: 'shadow' | 'fire'; gear: (EquippedItem | null)[]; source: string }[]`: from wowsims `ui/specs/warlock/dps/gear_sets/{preraid,t4,t5,t6,za,swp}.gear.json` (shadow) and the Fire variants (spec 'fire', not offered) plus `author` ("My gear (export)") ; `offeredGearPresets()` returns the shadow ones in phase order.
- `parseWowSimsExport(text: string, db: ItemDb): ImportResult` = `{ ok: boolean; gear: (EquippedItem | null)[]; talents?: string; race?: string; character?: string; unknown: { items: number[]; gems: number[]; enchants: number[] }; warnings: string[] }`; accepts the WowSimsExporter shape (`items` array with `id`, `enchant`, `gems`, possibly nested under `gear`) and the wowsims `*.gear.json` shape; places items into the 17 slots by order when the array has 17 entries, otherwise by DB slot (rings and trinkets fill finger1/2 and trinket1/2 in order); size cap 200 000 chars; never throws; hostile JSON handled; non-Gnome race gives a warning (stats use Gnome racials). `exportWowSimsGear(gear): string` (pretty JSON in the `*.gear.json` shape; round trip equal).

- [ ] **Step 1: Write the failing tests:** presets: `every preset's items/gems/enchants exist in the DB, slot-compatible, no unknowns; phase order; shadow presets offered, fire hidden; each preset's derived stats are plausible (spell power increases with the phase for the shadow presets: assert >, no magic numbers) and set piece counts match the tier`; import: `the author's sample parses to exactly the default gear and returns the talents string and race Gnome`; `round trip export -> import equals`; `wowsims gear.json shape parses`; `unknown ids are listed and slots left null, ok stays true with warnings; all-unknown -> ok false`; `huge text, deep nesting, __proto__, non-JSON, arrays, numbers, null -> ok false, no throw`; `slot placement fallback by DB slot for a short list`.
- [ ] **Step 2: Run `npx vitest run tests/data tests/setup` — Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): BIS gear presets and WowSimsExporter import/export`.

---

### Task 4: Gear panel (UI)

**Files:**
- Create: `src/ui/GearPanel.tsx`, `src/ui/ItemPicker.tsx`, `tests/ui/gear-panel.test.tsx`
- Modify: `src/ui/GameView.tsx`, `src/ui/game.css`, `README.md`

**Interfaces:**
- `GearPanel({ gear, presets, db, onChange, disabled? })` (fully controlled; every change through `normalizeGear` then `normalizeSetup`): collapsible "Gear" `<details>` (like the Setup panel) with: preset buttons by phase (aria-pressed for the matching preset, "Custom" otherwise), the 17 slots (icon via `SpellIcon`-style fallback, item name, stats summary, gem sockets coloured with the chosen gem icon, enchant name, a button to change), `ItemPicker` (a dialog or inline list: search box, phase filter, slot's candidates sorted by phase then name, shows key stats, "unmodelled effect" marker, keyboard accessible, text fields swallow hotkeys per S5), gem and enchant pickers per socket/slot (filter by colour and slot; meta requirement and socket bonus status line), "Import" (textarea, parse report listing unknown ids and warnings, "Apply"), "Export" (read-only textarea + copy), the db loads lazily (`loadItemDb`) with a loading state; warnings from `describeGear`; derived totals use the existing stats panel.
- `GameView` holds gear in the setup config (it already normalizes every edit), shows the Gear panel next to the Setup panel, same "applies from the next fight; a fight that has not started takes it at once" rule and pending note.

- [ ] **Step 1: Write the failing tests** (jsdom, db via the sync loader injected as a prop for tests): `renders 17 slots for the default gear with item names`; `choosing a preset changes the gear and the stats at the pull; Custom after editing a slot`; `the item picker filters by slot and search text and picking an item updates the slot; unique duplicates rejected with a message`; `gems offered by colour; socket bonus line toggles when colours match; meta requirement status`; `enchants per slot`; `import: paste the author's sample -> report and apply; unknown ids listed; invalid text -> error message, no change`; `export contains the current items and round-trips`; `typing in the search/import fields never triggers hotkeys (Z, R, digits)`; `setup storage round trip keeps the gear; corrupt stored gear falls back to default`; `a fight that has started keeps its gear until R`.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement**; README (Polish): the Gear panel, presets, import/export steps with WowSimsExporter.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo; `npx vite preview` started and killed by PID, never `pkill -f`): open Gear, choose each phase preset and compare the stats at the pull, swap an item and a gem, import the author's sample (and a corrupted text), reload (persisted), play a short fight, no console errors, screenshots desktop dark/light and phone 390 px (read them, fix visible defects) — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): gear panel with presets, picker and import/export`.

---

### Task 5: Docs, final review

**Files:** `README.md`, `docs/data-sources.md`, `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage list)

- [ ] **Step 1:** complete Part E in `docs/data-sources.md` (sources, filters and counts, stat mapping, licence, presets and their origin, set bonuses modelled/unmodelled, unmodelled item effects, import/export format, limits, known simplifications); README Polish section; stage list pointer.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && npm run icons`.
- [ ] **Step 3:** final whole-feature review (diff from the plan's base commit, the Review Focus list, determinism and golden values, bundle size of the main chunk before/after, hostile import and storage fuzz, Playwright end-to-end); fix Critical/Important defects with tests and cheap minors.
- [ ] **Step 4: Commit** `docs: stage 2a gear`.

---

## Self-Review

- **Spec coverage:** §2.1–2.3 → Tasks 1–2; §3 setup/engine/presets/import → Tasks 2–3; §4 UI → Task 4; §5 risks → Review Focus and Task 5.
- **Type consistency:** `ItemDb`, `ItemRecord`, `GemRecord`, `EnchantRecord`, `ITEM_SLOTS`, `loadItemDb` (Task 1) are used by `normalizeGear`, `buildDestructionWarlock` (Task 2), presets and the importer (Task 3) and the panel (Task 4); `EquippedItem` is the engine's existing type; `SetupConfig.gear` (Task 2) is read by `GearPanel` (Task 4).
- **Judgement left to the executor:** exact stat/colour index mappings (verified in Task 1), the weapon-type filter, which generic caster sets get bonuses, the icon budget decision, picker UX details.
