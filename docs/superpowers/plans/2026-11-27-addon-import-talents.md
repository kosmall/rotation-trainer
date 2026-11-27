# Addon export import (talents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste the wowsims addon export into the "Własny build" import box and get a custom build with the character's talents.

**Architecture:** A framework-free parser `src/forever/web/addon-import.ts` turns the export into a `CustomBuildData`; `CustomView`'s existing "Importuj jako nowy" handler autodetects an export (object with `class` and `talents`) and otherwise keeps using `parseBuild`.

**Tech Stack:** TypeScript, React, vitest + Testing Library (`npm test`, `npm run typecheck`).

**Spec:** `docs/superpowers/specs/2026-11-27-addon-import-talents-design.md`

## Global Constraints

- Talent string: one digit (the rank) per talent in `TALENTS` order (`src/forever/talents.ts`, which is the `talents.json` order: aff 17, demo 19, destro 16); missing trailing digits are 0; max length 52.
- Pick order: talents in `TALENTS` order within each tree, `rank` copies of each id; trees in `TALENTS` order. Must pass `validatePicks`.
- Rotation by `spec`: `affliction`→`affliction` (filler `wrack`, rank `max`, pet `voidwalker`, sacrificed `null`); `demonology`→`demonology` (filler `shadow_bolt`, rank `1`, pet `succubus`, sacrificed `null`); `destruction`→`fire` (filler `searing_pain`, rank `max`, pet `imp`, sacrificed `null`).
- Name: `<name> (<spec>)`, cut to 40 characters, made unique with `uniqueName` in the view.
- UI texts in Polish. Only `class: "warlock"` is accepted. Items, race, level, professions are ignored.

## Review Focus

- `talents` empty string, or missing: build with 0 points imports (an empty build), no crash.
- A rank above a talent's max (e.g. `9` for Suppression) or a non-digit character: readable error naming the talent / the character.
- Trailing zeros trimmed vs. full 52-digit string give the same build.
- `spec` unknown or missing: falls back to the affliction defaults, no crash.
- Name missing or empty: falls back to a generic name, not an error.
- A pasted old-format build JSON still imports; invalid JSON shows the existing error message.

---

### Task 1: Addon export parser

**Files:**
- Create: `src/forever/web/addon-import.ts`
- Test: `tests/forever/addon-import.test.ts`

**Interfaces:**
- Consumes: `TALENTS`, `validatePicks` from `src/forever/talents`; `CustomBuildData` from `src/forever/builds`.
- Produces: `isAddonExport(raw: unknown): boolean` (true when `raw` is an object with both a `class` and a `talents` key); `parseAddonExport(raw: unknown): { build: CustomBuildData; points: number; gameLevel: number | null }` (throws `Error` with a readable message).

- [ ] **Step 1: Write the failing tests** in `tests/forever/addon-import.test.ts`, using `const SAMPLE = {class:'warlock',flavor:'forever',level:33,name:'Feliczita',spec:'affliction',talents:'245202200300013'}`:
  - `parses the sample`: `points === 24`, `gameLevel === 33`, `build.name === 'Feliczita (affliction)'`, `build.rotation === 'affliction'`, picks start `['improved_life_tap','improved_life_tap','suppression', ...]`, contain `'soul_siphon'` 3 times, no `'soul_harvest'`.
  - `the screenshot string adds Soul Harvest`: talents `245212200300013` → `points === 25`, picks contain `soul_harvest` once and `validatePicks(build.picks).ok === true`.
  - `trailing zeros do not matter`: `'2452022003000130000'` gives the same picks as the sample.
  - `spec decides the rotation`: `demonology` → rotation `demonology`, filler `shadow_bolt`, rank `1`, pet `succubus`; `destruction` → `fire`, `searing_pain`, pet `imp`; unknown spec → affliction defaults.
  - `rejects`: class `mage` (message matches `/warlock/`), `talents` with a letter, rank 9 in the first position (message includes `Improved Life Tap`... use the display name from `TALENTS`), string of 53 digits, non-object input.
  - `empty or missing talents → 0 points`, build valid; missing name → name `Import z addonu (affliction)`.
  - `isAddonExport`: true for `SAMPLE`, false for `emptyBuild('x')` and for `null`.
- [ ] **Step 2: Run** `npx vitest run tests/forever/addon-import.test.ts` — expected: FAIL (module not found).
- [ ] **Step 3: Implement** `isAddonExport` and `parseAddonExport` in `src/forever/web/addon-import.ts` per the Global Constraints. The order is built by walking `TALENTS` in order and pushing each id `rank` times; run `validatePicks` and throw with its first error if it fails; `gameLevel` is `level` when it is a finite number, else `null`.
- [ ] **Step 4: Run** the same command — expected: all PASS.
- [ ] **Step 5: Commit**

```bash
git add src/forever/web/addon-import.ts tests/forever/addon-import.test.ts
git commit -m "feat(forever): parse the wowsims addon export into a custom build"
```

### Task 2: Wire the import into CustomView

**Files:**
- Modify: `src/ui/forever/CustomView.tsx` (the "Importuj jako nowy" handler, the placeholder of the textarea, a success message state)
- Test: `tests/ui/forever/custom-view.test.tsx` (next to the existing `imports an exported build as a new one`)

**Interfaces:**
- Consumes: `isAddonExport`, `parseAddonExport` from Task 1; `uniqueName`, `parseBuild` from `src/forever/web/custom`.
- Produces: nothing for other tasks.

- [ ] **Step 1: Write the failing tests** in `custom-view.test.tsx`:
  - `imports the addon export`: render `<ForeverApp view="custom" runner={runner} />`, `await screen.findByText(/Punkty:/)`, set the `Build jako JSON` textarea to the JSON of the sample from the user's payload (`talents: '245212200300013'`, `class: 'warlock'`, `spec: 'affliction'`, `name: 'Feliczita'`, `level: 33`), click `Importuj jako nowy`; expect `25/51`, the `Nazwa` input value `Feliczita (affliction)`, and a status text matching `/Zaimportowano 25 punktów/`.
  - `refuses a non-warlock export`: `class: 'mage'` → an element with role `alert` matching `/Import nie powiódł się/` and the points still `0/51`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/forever/custom-view.test.tsx` — expected: the two new tests FAIL, the old ones pass.
- [ ] **Step 3: Implement** in the import button handler: `const raw = JSON.parse(io)`; if `isAddonExport(raw)` use `parseAddonExport(raw)` and call `add({ ...build, name: uniqueName(build.name, names) })`, then set an info message `Zaimportowano ${points} punktów${gameLevel ? ` (level w grze ${gameLevel})` : ''}.` shown in a `<p role="status" className="fv-note">`; otherwise keep the `parseBuild` path. Errors keep the existing `Import nie powiódł się: ...` alert. Make sure the info message clears on the next edit like `message` does. Update the textarea placeholder to mention "eksport z addonu".
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: everything PASSES with no type errors.
- [ ] **Step 5: Commit**

```bash
git add src/ui/forever/CustomView.tsx tests/ui/forever/custom-view.test.tsx
git commit -m "feat(ui): import the addon export in the custom build tab"
```
