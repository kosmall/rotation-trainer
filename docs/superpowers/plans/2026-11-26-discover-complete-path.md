# Complete discovered builds to 59 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tick results in Odkrywanie and complete them to level 59 with the path that minimises the total leveling time.
**Architecture:** A pure `src/forever/discover/complete.ts` (path cost, greedy, local search, tasks). The worker pool becomes generic over a task dispatcher `runAnyTask`. The `useDiscover` hook gains a `complete` run, and DiscoverView gains the checkboxes and the results.
**Spec:** `docs/superpowers/specs/2026-11-26-discover-complete-path-design.md`

## Global Constraints
- Picks of a completed build = `canonicalPicks(row.ranks)` + path; it is legal (`validatePicks`) and has `pointsAtLevel(59)` = 50 points.
- Same rotation genes and pets as the row (`rowVariant`).
- UI copy in Polish; labels `Uzupełnij #N`, `Uzupełnij do 59 (N)`, section `Kompletne buildy (do 59)`.

## Review Focus
- Rows found at level 59 or when nothing is ticked: the button is disabled (Task 3 test).
- A path must stay legal after every move, including blocks that cross row gates (Task 1 test: every candidate path the search accepts is legal).
- A stored discovery from before this change (no `completions`) still loads (Task 3 test).

### Task 1: Path search (pure)
- Create `src/forever/discover/complete.ts`, with `legalNext(r: Ranks): string[]` exported from `talent-search.ts`.
- Produces:
  - `CompleteCtx { combo: Combo; baseRanks: Ranks; fromLevel: number; toLevel: number; profile: string; mobs: 1|2|3; params: Params; sessions: number; seed: number }`
  - `pathCost(ctx, path, cache): { cost: number; kph: number[] }`
  - `greedyPath(ctx, cache): string[]`
  - `improvePath(ctx, start: string[], maxSims: number, rng): string[]`
  - `harmonicKph(kph: number[]): number`
- Tests (`tests/forever/discover-complete.test.ts`, level 40 → 44, sessions 2, `session_pulls: 3`):
  - the greedy path has 4 points and is legal;
  - `improvePath` never returns a costlier path than its start and keeps it legal;
  - the cost equals Σ 1/kph;
  - `harmonicKph([100, 200]) ≈ 133.33`;
  - a 59 → 59 context gives an empty path.

### Task 2: Tasks, generic pool, orchestration
- `CompleteTask` (`complete-greedy` | `complete-improve` | `complete-final`) with results; `runCompleteTask`.
- `runAnyTask(options, task)` in `src/forever/web/discover-tasks.ts`, used by the worker and the inline pool.
- `discoverPool` is generic: `<T, R>`.
- `completeBuilds(rows, ctx, budget, run, progress)`: returns a `CompletedBuild[]`.
- Tests:
  - `completeBuilds` with the inline runner on 2 rows: each has 4 path points (40→44), legal picks, `avgKph >= greedyAvgKph - 1e-9`, and `perLevel` levels 41..44;
  - the pool works with `complete-*` tasks.

### Task 3: Hook and view
- `useDiscover().complete(ranks: number[], budget)`, completion progress, `saved.completions`; `completedBuild(c, existing): CustomBuildData`.
- View: checkbox column, button, progress, the Kompletne buildy section with Zapisz.
- Tests (jsdom, tuning): tick #1 → Uzupełnij → the section shows a table with levels up to 44 (tuning `toLevel` override) → Zapisz stores 35 picks with genes. The button is disabled with nothing ticked. An old stored discovery without completions loads.
- Browser check in Chromium (Szybkie, 2 rows), full `npm test`, typecheck, build.
