# Forever build discovery in the web app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Forever view "Odkrywanie" that runs the build discovery in the browser on up to 8 Web Workers and saves any result as a custom build that carries its generated rotation.

**Architecture:** Rotation genes move out of `discover/space.ts` into `src/forever/rotation-genes.ts`. A `BuildVariant` may carry `genes`, and the fight and `rotationSpec` play the generated rotation for such a variant, so every existing job works with it. Custom builds store optional genes (and the editor can compose them). A browser pool runner feeds `runTask` to module workers, while the `discover` orchestration runs on the main thread inside a React hook behind the new view.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library (jsdom), Vite module workers.

**Spec:** `docs/superpowers/specs/2026-11-26-forever-discover-web-design.md`

## Global Constraints

- A variant without `genes` plays exactly as today; all existing tests stay green.
- Worker count: `min(8, navigator.hardwareConcurrency || 4)`.
- Custom storage key unchanged: `wow-forever-sim:custom:v1`. Last discovery: `wow-forever-sim:discover:v1`.
- UI copy in Polish. View id `discover`, title `Odkrywanie`, placed between `compare` and `ep`.
- Saved build name: `L{level} #{rank} {label}`, cut to 40 characters and made unique with `uniqueName`.
- `src/forever/**` stays DOM-free except `src/forever/web/discover-client.ts` and `discover-worker.ts` (like `client.ts`/`worker.ts`).

## Review Focus

- Old stored custom builds without `genes`, or with malformed genes, still load; malformed genes are dropped, not the build (Task 2 test).
- A saved discovered build simulated at levels below and above its own level: legal picks at every level 10-59, no throw in ranking or sweep (Task 3 test).
- Leaving the view or pressing Przerwij mid-search terminates every worker and leaves no stale progress (Task 3 pool test, Task 4 view test).
- A sacrifice that was not live in the found build (pet summoned, no Pact) is not saved as a sacrifice (Task 3 test).
- The Rotacje diagram and Buildy facts of a genes build show the generated steps and label, not a template title (Task 2 test).

---

### Task 1: Rotation genes on build variants

**Files:**
- Create: `src/forever/conds.ts` (move `T`, `all`, `not`, `knows`, `lacksDot` out of `rotation-spec.ts`, which re-exports them)
- Create: `src/forever/rotation-genes.ts` (move `FillerGene`, `FILLERS`, `MinTtk`, `MIN_TTKS`, `RotationGenes`, `rotationId`, `rotationLabel`, `buildRotation` and its private tables from `discover/space.ts`; `space.ts` re-exports them)
- Modify: `src/forever/builds.ts` (`BuildVariant.genes?: RotationGenes`; `CustomBuildData.genes?: RotationGenes`; `customVariant` and `variantFromJson` copy genes)
- Modify: `src/forever/fight.ts` (data rotation = `cfg.rotation ?? (variant.genes ? buildRotation(variant.genes, params) : undefined)`, the estimate from the same)
- Modify: `src/forever/rotation-spec.ts` (`stepsOf` returns `buildRotation(v.genes, p).steps` when `v.genes` is set)
- Test: `tests/forever/variant-genes.test.ts`

**Interfaces:**
- Produces: `import { buildRotation, rotationLabel, FILLERS, MIN_TTKS, type RotationGenes, type FillerGene, type MinTtk } from 'src/forever/rotation-genes'`; `BuildVariant.genes?`, `CustomBuildData.genes?`.

- [ ] **Step 1: Failing tests**
  - `a variant with genes plays its generated rotation`: for genes `{coe:false, agony:true, corruption:false, siphon:false, immolate:false, minTtkSec:6, drainSoulFinisher:false, filler:'drain_life'}` on `{...loadVariant('DEMO_PACT_R1'), genes}`, `runCell(...)` at level 40 (3 sessions, seed 7, `session_pulls: 5`) has `.raw` equal to `runCell` of the plain variant with `rotation: buildRotation(genes, p)`, and is not equal to the plain variant without rotation.
  - `rotationSpec uses the genes`: `rotationSpec({...v, genes}, p).steps` equals `buildRotation(genes, p).steps`.
  - `customVariant keeps genes`: `customVariant({...emptyBuild('G'), picks: ['suppression'], genes}).genes` equals `genes`; `loadVariant(customId('G')).genes` equals `genes`.
- [ ] **Step 2: Run** `npx vitest run tests/forever/variant-genes.test.ts`. Expected: FAIL (module `rotation-genes` missing).
- [ ] **Step 3: Implement the moves and fields above.**
- [ ] **Step 4: Run** `npx vitest run tests/forever && npm run typecheck`. Expected: PASS, including `data-rotation` and the `discover-*` tests unchanged.
- [ ] **Step 5: Commit** `feat(forever): build variants may carry rotation genes`

---

### Task 2: Custom builds with composed rotations

**Files:**
- Modify: `src/forever/web/custom.ts` (`parseGenes(raw: unknown): RotationGenes | undefined`; `parseBuild` keeps valid genes and drops invalid ones)
- Modify: `src/ui/forever/CustomView.tsx` (rotation select gets the option `custom` labelled `Własna (z klocków)`; with genes it shows the gene controls; choosing a template removes `genes`)
- Modify: `src/ui/forever/buildFacts.tsx`, `BuildsView.tsx`, `RotationsView.tsx` (a genes build shows `Własna rotacja: {rotationLabel(genes)}` instead of `TITLES[v.rotation]`; filler facts from the genes' estimate)
- Test: `tests/forever/custom-genes.test.ts`, `tests/ui/forever/custom-view.test.tsx` (add cases)

**Interfaces:**
- Consumes: Task 1.
- Produces: `parseGenes`; `DEFAULT_GENES: RotationGenes = {coe:true, agony:true, corruption:true, siphon:false, immolate:false, minTtkSec:6, drainSoulFinisher:true, filler:'drain_life'}` (the start value when switching to Własna).
- Gene controls, all with these accessible labels:
  - checkboxes `Curse of the Elements`, `Bane of Agony`, `Corruption`, `Siphon Life`, `Immolate`, `Drain Soul na dobicie`
  - select `DoT-y gdy TTK ≥` (0, 6, 12 s)
  - select `Filler`, with the options named by `rotationLabel`'s filler names

- [ ] **Step 1: Failing tests**
  - `parseBuild` with valid genes keeps them.
  - With `genes: {coe: 'yes'}` it returns the build without `genes`.
  - With `filler: 'nope'` the genes are dropped.
  - A stored build without genes loads unchanged.
  - UI: in Własny build, choose `Własna (z klocków)` in `Szablon rotacji`, untick `Corruption`, pick filler `Searing Pain`. The stored build has `genes.corruption === false` and `genes.filler === 'searing_pain'`, and the page shows `Własna rotacja: CoE, Agony → Searing Pain`.
  - Switching back to `Affliction` removes `genes` from storage.
  - UI: Rotacje for a genes build shows `Własna rotacja:`.
- [ ] **Step 2: Run** `npx vitest run tests/forever/custom-genes.test.ts tests/ui/forever/custom-view.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/forever tests/ui/forever && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(forever): custom builds can compose their rotation from spells`

---

### Task 3: Saving results and the browser worker pool

**Files:**
- Create: `src/forever/web/discover.ts` (pure)
- Create: `src/forever/web/discover-worker.ts`, `src/forever/web/discover-client.ts`
- Test: `tests/forever/web-discover.test.ts`

**Interfaces:**
- Consumes: `TopRow`, `DiscoverResult`, `DiscoverOptions`, `Runner`, `runTask`, `inlineRunner`, `DEFAULT_BUDGET`, `QUICK_BUDGET` (engine); `canonicalPicks`; `sacrificeLive`; `uniqueName`; `paramsOf`, `Settings`.
- Produces:
  - `discoveredBuild(row: TopRow, level: number, existing: readonly string[]): CustomBuildData`. Template fields `rotation:'affliction', filler:'drain_life', rank:'max'`; `sacrificed` only when `sacrificeLive(row.combo, row.ranks)`.
  - `discoverOptions(s: Settings, budget: 'full' | 'quick'): DiscoverOptions` = `{level: s.level, profile: s.profile, mobs: s.mobs, seed: s.seed, perk: 0, params: paramsOf(s), top: 20, budget: full ? DEFAULT_BUDGET : QUICK_BUDGET}`.
  - `workerCount(hc: number | undefined): number` = `min(8, hc || 4)`, at least 1.
  - `interface DiscoverPool { runner: Runner; close(): void }`.
  - `discoverPool(options: DiscoverOptions, n: number, signal: AbortSignal, makeWorker?: () => WorkerLike | null): DiscoverPool`. `WorkerLike` = `{ postMessage(m: unknown): void; terminate(): void; onmessage; onerror }`.
    - Default `makeWorker`: `new Worker(new URL('./discover-worker.ts', import.meta.url), {type:'module'})`, or `null` when `Worker` is undefined. With `null` the runner is the inline runner, yielding `setTimeout(0)` between tasks.
    - Messages: `{type:'init', options}` once, then `{i, task}` → `{i, result}`.
    - Results in task order. A worker `error` rejects. On abort, every worker is terminated and the runner rejects with `DOMException('…', 'AbortError')`.

- [ ] **Step 1: Failing tests**
  - `discoveredBuild` on a handmade `TopRow` (level 40, ranks of a legal 31-point build, genes, pet `imp`, sacrificed `voidwalker` with `demonic_sacrifice:1, demonic_pact:1`):
    - picks equal `canonicalPicks(ranks)` and are legal;
    - genes and pets as found;
    - the name starts with `L40 #1 `, is at most 40 characters, and is unique against an existing equal name;
    - without `demonic_pact`, `sacrificed` is null.
  - A saved build plays at every level: `customVariant(build)`, then `runCell` at levels 10, 25, 40 and 59 does not throw.
  - `workerCount(16) === 8`, `workerCount(undefined) === 4`, `workerCount(2) === 2`.
  - Pool with a fake `WorkerLike` that answers asynchronously, in reverse order, via `runTask`: results come back in task order and equal `inlineRunner`'s.
  - Aborting mid-run terminates every fake worker and rejects with `name === 'AbortError'`.
  - `makeWorker` returning null falls back to inline.
- [ ] **Step 2: Run** `npx vitest run tests/forever/web-discover.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(forever): save discovered builds and a browser worker pool for discovery`

---

### Task 4: The Odkrywanie view

**Files:**
- Create: `src/ui/forever/useDiscover.ts`, `src/ui/forever/DiscoverView.tsx`
- Modify: `src/ui/shell/router.ts` (`FOREVER_VIEWS` gains `'discover'` after `'compare'`; title `Odkrywanie`), `src/ui/forever/ForeverApp.tsx` (prop `discoverPool?: (o: DiscoverOptions, signal: AbortSignal) => DiscoverPool` for tests; the SettingsBar run label `Uruchom (użyj Szukaj)` on this view), `src/ui/forever/forever.css` if needed, `README.md` (Forever app section: the view, saving, threads)
- Test: `tests/ui/forever/discover-view.test.tsx`

**Interfaces:**
- Consumes: Task 3, engine `discover`, `TopRow` fields, `verifyFor` (report.ts), `liveSteps`.
- Produces:
  - `useDiscover(pool?)` → `{ status: 'idle'|'running'|'done'|'error'; stage: string; done: number; total: number; etaSec: number | null; error: string | null; result: {settings: Settings; result: DiscoverResult} | null; run(s: Settings, budget: 'full'|'quick'): void; cancel(): void }`.
  - The hook persists `result` to `wow-forever-sim:discover:v1` (try/catch) and loads it on mount.
  - Leaving the view cancels a running search (the hook's cleanup).
  - `ForeverApp` also takes an optional `discoverSpace?: SpaceFilter` prop, merged into the options, so tests can use a tiny space.
- View content:
  - select `Zakres` (`Pełne (~15 min)` / `Szybkie (~3 min)`), buttons `Szukaj` and `Przerwij`
  - a progress line `Etap {stage}: {done}/{total}` with `~{min} min`
  - the line `Najlepszy znany: {id} {kph} kills/h`
  - the table with columns `#`, `Kills/h`, `± CI`, `vs znany`, `Drzewka`, `Pet`, `Rotacja`, `TTK s`, `Przestoje %`, `Najbliższy znany`, and a button `Zapisz jako własny build`, which after saving shows `Zapisano: {name}` with a link to `#/forever/custom`
  - `<details>` with talents, rotation steps, insensitive talents and `Opiera się na szacunkach`

- [ ] **Step 1: Failing tests** (jsdom; inject `discoverPool` returning an inline runner, and `discoverSpace = {fillers:['sb_r1','drain_life'], minTtk:[6], pets:['succubus','imp'], sacrifice:false, maxDots:1}`; settings `session_pulls` cannot be injected, so `Szybkie` with level 40 and settings `sessions` irrelevant)
  - `searches and shows the top`: click `Szukaj` → table rows appear (`findAllByRole('row')` > 1) and a line `Najlepszy znany:`.
  - `saves a row as a custom build`: click the first `Zapisz jako własny build` → the localStorage custom state has a build named `L40 #1 …` with `genes` and 31 picks; the text `Zapisano:` is shown.
  - `remembers the last result`: unmount and render again → the table is shown without searching.
  - `Przerwij stops`: with a pool whose runner never resolves until aborted, `Szukaj` then `Przerwij` → status text `Przerwano` and the abort signal fired.
  - Router: `parseRoute('#/forever/discover')` is the discover view; the tab `Odkrywanie` exists.
- [ ] **Step 2: Run** `npx vitest run tests/ui/forever/discover-view.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: everything passes except the pre-existing `tests/data/talent-tree.test.ts` talent-icons failure; the build emits a separate worker chunk for `discover-worker`.
- [ ] **Step 5: Browser check**: `npm run build && npm run preview`, then open `#/forever/discover` in Playwright (Chromium) and run `Szybkie` on level 40. Expected: progress moves, the table appears, saving adds a build visible in Własny build, and that build runs in Porównanie at its sweep.
- [ ] **Step 6: Commit** `feat(forever): Odkrywanie view: build discovery in the browser with saving to custom builds`
