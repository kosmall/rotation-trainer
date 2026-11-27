# Addon export import (items, "mój sprzęt") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Items of the addon export become a fourth gear option used by the simulations.

**Architecture:** `gear.ts` (parser, totals, storage) → runtime gear profile in `stats.ts` + `JobRequest.gear` → UI wiring in `ForeverApp`/`SettingsBar`/`CustomView`.

**Tech Stack:** TypeScript, React, vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-addon-import-items-design.md`

## Global Constraints
- Profile id `mine`; slot order and totals rules as in the spec; Polish UI texts.
- Failed item fetch never aborts the import.

## Review Focus
- Fetch fails / bad JSON / item without stats: listed with an error or zero stats, import continues.
- Empty `gear.items` (all null): no gear, dropdown unchanged.
- `mine` selected then gear removed: falls back to `average`, no crash.
- Reload: gear restored from storage; corrupt storage ignored.
- A second import replaces the gear, not appends.

### Task 1: gear module (`src/forever/web/gear.ts`, `tests/forever/gear.test.ts`)
Produces: `SLOTS`, `ItemStats`, `GearItem`, `MyGear = {items: GearItem[]}`, `GearTotals`, `parseTooltip(id, slot, json): GearItem`, `totalsOf(g): GearTotals`, `fetchGear(ids: (number|null)[], fetcher: (id:number)=>Promise<unknown>): Promise<MyGear>`, `gearIdsOf(raw: unknown): (number|null)[] | null`, `wowheadFetcher`, `loadGear(storage)`, `saveGear(storage, gear|null)`, `GEAR_STORAGE_KEY`.
- [ ] Tests on fixtures `tests/forever/fixtures/items/*.json`: Filigreed Shadow Circlet → stamina 12, shadowSpellPower 14, armor 38; Green Silken Shoulders → intellect 11, spellPower 8; Aetherwisp Bracers armor 45; Satchel of Potions → empty stats, `unmodelled` has the Use line; totals of a few items; fetchGear with a failing fetcher keeps going; gearIdsOf of the user's payload gives 17 entries with nulls; storage round trip and corrupt storage.
- [ ] Run (FAIL), implement, run (PASS), commit.

### Task 2: engine (`stats.ts`, `api.ts`, `tests/forever/gear-job.test.ts`)
- [ ] Tests: `playerStatsFor(40,'mine',{})` after `registerGearProfile` reads the totals; a ranking with `profile:'mine'` and gear differs from `average`; shadow bonus raises spell power of shadow spells (kills/h with bigger shadowSpellPower ≥ without); missing gear with `mine` throws.
- [ ] Implement `MY_GEAR='mine'`, `registerGearProfile(t: GearTotals)`, `normalizeSettings` accepts `mine`, `JobRequest.gear`, shared overrides (`overridesOf(s, gear?)`). Commit.

### Task 3: UI (`ForeverApp`, `SettingsBar`, `CustomView`, tests in `tests/ui/forever/gear-view.test.tsx`)
- [ ] Tests with a fake `itemFetcher`: pasting the export lists items and totals and shows the "mój sprzęt" option; choosing it and running a ranking works; without gear the option is absent; removing gear falls back.
- [ ] Implement per spec; run `npm test && npm run typecheck`; commit.
