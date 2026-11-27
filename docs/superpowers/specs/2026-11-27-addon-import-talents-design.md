# Import of the wowsims addon export: talents (stage 1) — design

Approved in conversation 2026-11-27. Stage 2 (items and the fourth "Mój sprzęt" gear option) gets its own design.

## Intent
The player pastes the JSON that the wowsims exporter addon produces and gets a custom build with the talents of their character, so the simulator can rank their real build.

## Goals
- Paste the export into the existing "Eksport i import" textarea of the "Własny build" tab; "Importuj jako nowy" creates a build from it.
- The old build JSON format keeps working (autodetect: an object with `class` and `talents` is an addon export).

## Non-goals (stage 1)
- Items, gear, professions, race and level of the export are ignored (items come in stage 2).
- No new UI controls.

## Constraints and facts
- `talents` is a digit string: one digit per talent (its rank) in `talents.json` order, trees concatenated aff (17), demo (19), destro (16); missing trailing digits are 0. Verified on the sample `245202200300013` (24 points, level 33) and the screenshot (25 points = the sample + Soul Harvest 1 = `245212200300013`). Multi-tree strings are an assumption (no sample yet).
- A build stores an ordered list of picks; an export has only final ranks, so an order is derived.

## Approaches
One sensible way: a framework-free parser in `src/forever/web/addon-import.ts` (like `custom.ts`) feeding the existing `add()` flow. A dedicated second textarea/button was rejected: more UI for no gain.

## Design
- `parseAddonExport(raw)` returns `{ build: CustomBuildData; points: number; gameLevel: number | null }` or throws a readable error: not an object, `class` not `warlock`, `talents` not a digit string or longer than 52, a rank above the talent's max rank, an order that fails `validatePicks`.
- Pick order: talents row by row from the top, left to right within a row, `rank` copies of each id (always legal); the user can reorder in the existing list.
- Rotation from `spec`: affliction → affliction, demonology → demonology, destruction → fire. Filler, rank, pet and sacrificed pet are the defaults of the built-in builds of that rotation (affliction: filler wrack, pet voidwalker; demonology: shadow_bolt, rank 1, succubus; fire: searing_pain, imp). These are my calls; the user can change them in the view.
- Name `<name> (<spec>)`, made unique with `uniqueName`.
- CustomView import handler: if the parsed JSON looks like an export, use `parseAddonExport`, else `parseBuild`. Message after import: "Zaimportowano N punktów (level w grze L)".

## Tests
- Parser: the two sample strings, an empty string, too long, rank over max, a wrong class, each spec's rotation, the derived order is legal.
- UI: pasting the payload adds a build with the expected points; the old JSON still imports.

## Left to the builder
Exact wording of messages (Polish, like the rest of the view).
