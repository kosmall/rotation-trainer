# WoW Forever: build discovery in the web app (design)

Status: approved by the user in conversation (26 Nov 2026: "pisz projekt i implementuj").

## Intent

The build discovery of `npm run forever:discover` (spec `2026-11-26-forever-discover-design.md`)
becomes a view of the Forever web app. The user picks a level, runs the search in the browser,
sees the top 20 and **saves any result as a custom build** (localStorage, like the existing
custom builds). A saved build then runs **at every level** in the ranking, the level curve, the
duel (Porównanie) and EP, like any other build. Why: to use discovered builds in comparisons.

## Decisions by the user

- The search runs in the browser on several threads, up to 8.
- A saved result is an ordinary custom build (option A): its points are stored in the order of the
  talent rows, so below the level it has the first N of them and above it the extra points are
  unspent; the user can reorder and extend it to 51 in the custom-build editor.
- Rotations are composed from spells (the generator's genes), not only the three templates; the
  tool must be able to create new rotations. Custom builds can hold such a rotation, and the editor
  can compose one by hand.

## Goals

- New Forever view **Odkrywanie** (`#/forever/discover`), between Porównanie and Wagi statów.
  - Inputs: the settings bar (level 10-59, profile, mobs 1/2, Life Tap policy, Spellstone, Eureka!,
    seed), plus a budget switch **Pełne** (DEFAULT_BUDGET) / **Szybkie** (QUICK_BUDGET).
  - **Szukaj** starts, **Przerwij** stops (all workers terminated). Progress bar with the stage
    (screen, search, final, insensitivity), done/total and an ETA.
  - Result: the best known build line and a top-20 table (rank, kills/h ± CI, vs best known with
    ✓/~, ≈#1, trees, pet, rotation, TTK, downtime, nearest known) with expandable details (talents
    per tree, free points, rotation steps, insensitive talents, "Leans on estimates").
  - Each row has **Zapisz jako własny build**; after saving, a note with the build name and a link to
    Własny build.
  - The last result is remembered in localStorage and shown on return (with its settings).
- Same results as the CLI for the same inputs (same engine, same tasks, same seeds).
- Worker pool: `min(8, navigator.hardwareConcurrency || 4)` module Web Workers, each running
  `runTask`; the orchestration (`discover`) runs on the main thread. Without Worker support the
  tasks run on the main thread, yielding between tasks.
- A build variant may carry **rotation genes**; the fight then plays the generated rotation, so
  every existing job (ranking, sweep, duel, EP), the Rotacje diagram and the Buildy facts work with
  it unchanged in shape.
- Custom builds: optional `genes`; the editor's rotation select gets **Własna (z klocków)** with the
  gene controls (CoE, Agony, Corruption, Siphon Life, Immolate checkboxes; "DoT-y gdy TTK ≥" 0/6/12 s;
  Drain Soul na dobicie; filler select of the 9 fillers). Picking a template removes the genes.

## Non-goals

- No resume after a page reload (the search state is MBs; localStorage is ~5 MB).
- No change to the search itself (space, budget values, scoring, report text) beyond what saving
  and the browser runner need.
- No server, no shared storage; no sharing of results between users.

## Anti-goals

- A saved build that plays something other than what was found (e.g. mapped to a template).
- Existing builds, jobs or results changing (a variant without genes must play exactly as today).
- The UI freezing during a search (the main thread only orchestrates).

## Constraints (from the project)

- Engine: `src/forever/discover/engine.ts` (`discover`, `runTask`, `Runner`, budgets) is
  framework- and Node-free; the CLI pool is `scripts/forever-discover.ts`.
- Web jobs: `src/forever/web/{api,client,worker,custom}.ts`; views in `src/ui/forever/`; routes in
  `src/ui/shell/router.ts` (`FOREVER_VIEWS`, `FOREVER_VIEW_TITLES`); app state in `ForeverApp.tsx`.
- Custom builds: `CustomBuildData` in `builds.ts`, storage `wow-forever-sim:custom:v1` via
  `custom.ts` (`parseBuild`, `loadCustom`, `saveCustom`), `customVariant` registers it by id.
- Rotation genes and `buildRotation` live in `src/forever/discover/space.ts`, which imports the
  condition helpers from `rotation-spec.ts`; `rotationSpec(v, p)` (diagram, addon export) must
  return the generated steps for a variant with genes, so the genes code moves where both can use it
  without an import cycle.
- UI texts in Polish, like the rest of the Forever app.

## Approaches

- **Chosen: the CLI engine in the browser with a pool of up to 8 Web Workers; genes stored in the
  build.** Same results as the CLI; the comparisons work unchanged because the variant carries its
  rotation.
- Rejected: running the search through the existing one-worker job queue (an hour instead of
  minutes, and it blocks the other simulations).
- Rejected: mapping a found rotation to the nearest of the three templates (the saved build would
  play something else).
- Rejected: a separate list of discovered builds (the user chose ordinary custom builds; a separate
  list would need changes in every comparison).

## Design

1. **Genes module.** `RotationGenes`, `FillerGene`, `MinTtk`, `FILLERS`, `MIN_TTKS`,
   `buildRotation`, `rotationLabel`, `rotationId` move from `discover/space.ts` to a new
   `src/forever/rotation-genes.ts`; the condition helpers (`T`, `all`, `not`, `knows`, `lacksDot`)
   move to `src/forever/conds.ts`. `space.ts` re-exports what it used to export, so existing imports
   keep working.
2. **Variant genes.** `BuildVariant.genes?: RotationGenes`. `fight.ts`: the data rotation is
   `cfg.rotation ?? (variant.genes ? buildRotation(variant.genes, params) : undefined)`.
   `rotationSpec(v, p)` uses the generated steps when `v.genes` is set (the `kind` stays
   `v.rotation`). `customVariant` and `variantFromJson` copy `genes`.
3. **Custom builds.** `CustomBuildData.genes?: RotationGenes`; `parseBuild` validates it (booleans,
   minTtk in 0/6/12, filler in `FILLERS`; anything else drops the genes). Storage key unchanged
   (older entries have no genes).
4. **Saving a result.** `discoveredBuild(row: TopRow, level: number, existing: string[]):
   CustomBuildData`: name `uniqueName("L{level} #{rank} {label}".slice(0, 40))`, picks
   `canonicalPicks(row.ranks)`, `genes` = the row's genes, `pet` = the row's pet, `sacrificed` = the
   row's sacrifice only when `sacrificeLive`, template fields `rotation: 'affliction', filler:
   'drain_life', rank: 'max'` (unused while genes are set). Saving adds it to the custom state and
   makes it active.
5. **Browser runner.** `src/forever/web/discover-client.ts`: `discoverPool(options, n): { runner:
   Runner; close(): void }` over `new Worker(new URL('./discover-worker.ts', import.meta.url), { type:
   'module' })`; each worker gets the options once and answers `{ i, task }` with `{ i, result }`;
   results in task order; worker `error` rejects. Without Worker: `inlineRunner` with a
   `setTimeout(0)` yield between tasks. Abort terminates the workers and rejects with AbortError.
6. **Hook and view.** `useDiscover(factory?)` keeps status, stage, done/total, ETA, error and the
   result; `run(options)`, `cancel()`. `DiscoverView` renders as in Goals. Options from settings:
   `{ level, profile, mobs, seed, perk: 0, params: paramsOf(settings), top: 20, budget }`. The last
   `DiscoverResult` and the settings it was made with are kept under `wow-forever-sim:discover:v1`.
7. **Facts for genes builds.** Buildy and Rotacje show "Własna rotacja: {label}" instead of the
   template title, and the generated steps in the diagram.

## Tests

- A variant with genes plays exactly `runCell(..., rotation: buildRotation(genes))`; a variant
  without genes is unchanged (the existing data-rotation tests stay green).
- `rotationSpec` of a genes variant returns the generated steps.
- `parseBuild` keeps valid genes and drops invalid ones; storage round-trip with genes.
- `discoveredBuild`: legal picks of the level's points, genes and pets as found, unique name.
- The pool runner returns results in task order (fake Worker class) and terminates on abort.
- DiscoverView (jsdom, injected inline runner, tiny space): runs, shows the table, saving a row adds
  a custom build with genes; Przerwij stops; the last result is shown after a remount.
- Custom editor: choosing Własna shows the gene controls and stores genes; choosing a template
  removes them.

## Calls made by Claude

- View name "Odkrywanie", position between Porównanie and Wagi statów.
- Budget switch Pełne/Szybkie instead of exposing every flag.
- Saved names "L40 #1 Agony → Drain Life" (cut to 40 characters, unique).
- Template fields of a saved build set to affliction/drain_life/max (not used while genes exist).

## Left to the builder

- Exact layout and CSS within the existing `fv-*` styles; the ETA formula.
- How tests inject a small space and budget into the view (a prop on the view/hook).
