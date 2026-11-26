# Forever build discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run forever:discover -- --level 40` searches talents × generated rotations × pet setups for one level and writes a top-20 report of the best combinations by kills per hour.

**Architecture:** The fight learns to play a rotation given as data (steps + estimate) next to the existing hard-coded path, which stays byte-for-byte the same. A pure module `src/forever/discover/` generates the rotation × pet space, searches talents per combination (hill climbing with random starts), runs three stages (screen → search → final) through an abstract task runner, and renders the report. Node-only parts (worker pool, files, CLI) live in `scripts/` because `tsconfig` has no Node types and only checks `src` and `tests`.

**Tech Stack:** TypeScript, Vitest, tsx, Node `worker_threads` (scripts only).

**Spec:** `docs/superpowers/specs/2026-11-26-forever-discover-design.md`

## Global Constraints

- Existing results must not change: every existing test passes unchanged; the hard-coded rotation path stays the default.
- `src/forever/**` stays framework-free and Node-free (no `fs`, `worker_threads`, `crypto`, `process`); Node code only in `scripts/`.
- Talent points at level L: `pointsAtLevel(L, perk)` (31 at level 40, perk 0); legality via `validatePicks`.
- Metric: kills per hour; ties broken by lower deaths per hour.
- Random starts only; known builds (`VARIANT_IDS` and `SCENARIO_IDS`) are only the baseline.
- Top 20: at most 2 entries per rotation × pet combination; the 2nd only when `pointDistance > 2` from the 1st.
- Final ranking: paired sessions on common seeds, 95% CI (`1.96·sd/√n`), via `pairedDiff` from `src/forever/duel.ts`.
- Report and code in English; the README section in Polish.
- Commit messages end with the session's attribution lines.

## Review Focus

- Low levels (e.g. `--level 20`): Felhunter and Siphon Life aren't learned yet and Wrack can't fit within the row gates → those combinations are skipped, with no crash and no duplicate rows (Task 2, Task 5 tests).
- `--perk` pushing points above 51 → capped at 51 by `pointsAtLevel`; random starts and moves stay legal at 51 (Task 3 test).
- Resuming after changing data, `--param` or flags → the state hash differs and the run starts over instead of mixing results (Task 4 test).
- Different worker counts or completion orders → identical top list (Task 4 test with a reversed runner).
- A combination whose required talents can't fit at the level (e.g. Wrack at level 30) → the search returns no result and the engine drops it (Task 3, Task 4 tests).

---

### Task 1: Data rotations in the fight

**Files:**
- Modify: `src/forever/rotation-spec.ts` (add `RotationEstimate`, `DataRotation`, `estimateOf`, `dataRotationOf`; widen `evaluateSteps` input)
- Modify: `src/forever/fight.ts:15-31` (PullConfig), `:486-491` (fillerRank), `:521` (dotSpells), `:539` (rotation)
- Modify: `src/forever/runner.ts` (CellConfig field passed into the pull config)
- Test: `tests/forever/data-rotation.test.ts`

**Interfaces:**
- Produces:
  - `interface RotationEstimate { filler: string; fillerRank: number | 'max'; dotSpells: string[] }`
  - `interface DataRotation { steps: SpecStep[]; estimate: RotationEstimate }`
  - `estimateOf(v: BuildVariant, p: Params): RotationEstimate`: the logic now in `fight.ts`. `filler`: fire → `p.fire_filler === 'searing_pain' ? 'searing_pain' : 'shadow_bolt'`; else `'wrack'` / `'drain_life'` / `'shadow_bolt'` from `v.filler`. `fillerRank`: fire → `1`, else `v.rank`. `dotSpells`: `['corruption','bane_of_agony','siphon_life']` plus `'immolate'` when affliction and (`p.aff_use_immolate || v.immolate`).
  - `dataRotationOf(v, p): DataRotation` = `{ steps: rotationSpec(v, p).steps, estimate: estimateOf(v, p) }`
  - `evaluateSteps(spec: Pick<RotationSpec, 'steps'>, ctx: SpecCtx): Candidate[]`
  - `PullConfig.rotation?: DataRotation` and `CellConfig.rotation?: DataRotation`
- In `fight.ts`: `const est = cfg.rotation?.estimate ?? estimateOf(variant, params)`. Filler: `id = est.filler === 'wrack' && !known('wrack') ? 'shadow_bolt' : est.filler`, rank `id === 'shadow_bolt' ? est.fillerRank : 'max'`, the same `?? shadow_bolt max` fallback. DoT rates use `est.dotSpells`. Rotation: `cfg.rotation ? (ctx) => evaluateSteps(cfg.rotation, ctx) : rotationFor(variant.rotation)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/forever/data-rotation.test.ts
it.each([...VARIANT_IDS, ...SCENARIO_IDS])('%s: data rotation gives identical sessions', (id) => {
  const v = loadVariant(id);
  for (const level of [40, 47, 59]) for (const mobs of [1, 2] as const) {
    const p = loadParams({ session_pulls: 5 });
    const a = runCell({ variant: v, level, profile: 'average', params: p, mobs }, 3, 7).raw;
    const b = runCell({ variant: v, level, profile: 'average', params: p, mobs, rotation: dataRotationOf(v, p) }, 3, 7).raw;
    expect(b).toEqual(a);
  }
});
it('estimateOf matches the fight fallback for Wrack without the talent', () => {
  expect(estimateOf(loadVariant('AFF_WRACK'), loadParams())).toEqual({ filler: 'wrack', fillerRank: 'max', dotSpells: ['corruption', 'bane_of_agony', 'siphon_life'] });
  expect(estimateOf(loadVariant('DEMO_FIRE'), loadParams()).fillerRank).toBe(1);
});
```

Also add one case with `aff_use_immolate: true` and one with `eureka_policy: 'filler'` (the Eureka! filler policy reads the filler).

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/forever/data-rotation.test.ts`
Expected: FAIL (`dataRotationOf` is not exported)

- [ ] **Step 3: Implement the interfaces above.** Move the estimate logic out of `fight.ts` rather than duplicating it.

- [ ] **Step 4: Run the new test and the whole Forever suite**

Run: `npx vitest run tests/forever && npm run typecheck`
Expected: all PASS. If any session differs, the data path is wrong; do not adjust the old path.

- [ ] **Step 5: Commit** `feat(forever): the fight plays a rotation given as data`

---

### Task 2: Rotation and pet space

**Files:**
- Create: `src/forever/discover/space.ts`
- Test: `tests/forever/discover-space.test.ts`

**Interfaces:**
- Consumes: `DataRotation`, `SpecStep`, `Cond` (Task 1, `rotation-spec.ts`); `getSpell`, `rankAt` (`spells.ts`); `TALENT_BY_ID`; pet `unlock` levels from `levels.json` → `pets` (imp 1, voidwalker 10, succubus 20, felhunter 30).
- Produces:
  - `type FillerGene = 'sb_r1' | 'sb_r2' | 'sb_max' | 'searing_pain' | 'drain_life' | 'wrack' | 'wrack_hp50' | 'wrack_hp70' | 'wrack_single_then_drain_life'`
  - `interface RotationGenes { coe: boolean; agony: boolean; corruption: boolean; siphon: boolean; immolate: boolean; minTtkSec: 0 | 6 | 12; drainSoulFinisher: boolean; filler: FillerGene }`
  - `interface PetSetup { pet: PetKind | null; sacrificed: PetKind | null }`
  - `interface Combo { id: string; genes: RotationGenes; pets: PetSetup }`. `id` = `rotationId(genes) + '|' + (pet ?? 'none') + '>' + (sacrificed ?? '-')`.
  - `interface SpaceFilter { fillers?: FillerGene[]; minTtk?: (0|6|12)[]; pets?: (PetKind|null)[]; sacrifice?: boolean; maxDots?: number }` (for tests and `--quick`)
  - `enumerateCombos(level: number, filter?: SpaceFilter): Combo[]`, sorted by `id`
  - `buildRotation(g: RotationGenes, p: Params): DataRotation`
  - `requiredRanks(c: Combo): Ranks`: `demonic_sacrifice: 1` when sacrificed; `wrack: 1` for `wrack*` fillers (not for `wrack_single_then_drain_life`); `siphon_life: 1` when siphon; `soul_harvest: 1` when the DS finisher is on
  - `rotationLabel(g: RotationGenes): string`, e.g. `"CoE, Corruption, Immolate → Searing Pain; DS finish; DoTs if TTK ≥ 6 s"`
  - `effectiveKey(c: Combo, level: number, ranks: Ranks): string`: the JSON of the live steps (a step is dead when its spell has no rank at the level or its `teachesTalent` rank is 0, or a `talent_rank_at_least` in its condition is unmet) plus the pet setup, with `sacrificed` set to null when `demonic_sacrifice` is 0
- Step order in `buildRotation` (mirror `stepsOf` in `rotation-spec.ts`, same ids and conditions):
  1. trance (SB at the filler rank for `sb_*`, else `'max'`)
  2. brand refresh
  3. CoE, Agony (both with the `skip_agony_if_ttk_below` condition like `dots()`), Corruption, Siphon Life, Immolate, each gated by `ttk_at_least minTtkSec` (omit the TTK condition when it is 0)
  4. DS finisher (`drain_soul_kills_within 1..p.drain_soul_window_sec`)
  5. the filler steps
  6. `shadow_bolt` max (unless the filler is already SB), then SB r2 and r1

  Filler steps:
  - `sb_rX`: SB rank X, `filler: true`
  - `searing_pain`: SP max, filler
  - `drain_life`: DL `knows`, filler
  - `wrack` / `wrack_hpNN`: Wrack `knows` (+ `hp_pct_above NN`), filler, then DL `knows`
  - `wrack_single_then_drain_life`: Wrack `knows` + `mobs_in_pull_is 1`, then DL filler

  Estimate:
  - `filler`: `shadow_bolt` / `searing_pain` / `drain_life` (also for `wrack_single…`) / `wrack`
  - `fillerRank`: 1, 2 or `'max'`
  - `dotSpells`: the chosen ones among corruption, agony, siphon, immolate
- Pet setups at a level: pets unlocked at the level plus `null`; `sacrificed` ∈ unlocked pets ∪ {null}, never equal to `pet`. At level 40: 21 setups.

- [ ] **Step 1: Write failing tests**
  - `enumerateCombos(40).length === 32*3*2*9*21`
  - `enumerateCombos(20)` has no `felhunter`
  - ids are unique and sorted
  - `buildRotation` for genes equal to AFF_WRACK's rotation gives `dataRotationOf(loadVariant('AFF_WRACK'), p).steps` (same `spell`, `rank`, `when` in order). Genes: `{coe: p.use_curse_of_elements, agony: true, corruption: true, siphon: true, immolate: false, minTtkSec: 6, drainSoulFinisher: p.use_drain_soul_finisher, filler: 'wrack'}`.
  - `requiredRanks` for a sacrifice + wrack_hp70 + siphon combo is `{demonic_sacrifice:1, wrack:1, siphon_life:1}`
  - `effectiveKey` is equal for two combos that differ only in `wrack_hp50` vs `wrack_hp70` when `ranks.wrack === 0`, and differs when `wrack === 1`
  - `rotationLabel` snapshot for one combo
- [ ] **Step 2: Run** `npx vitest run tests/forever/discover-space.test.ts`. Expected: FAIL (module missing)
- [ ] **Step 3: Implement `space.ts`**
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS
- [ ] **Step 5: Commit** `feat(forever): rotation and pet space for build discovery`

---

### Task 3: Talent search

**Files:**
- Create: `src/forever/discover/talent-search.ts`
- Test: `tests/forever/discover-talents.test.ts`

**Interfaces:**
- Consumes: `TALENTS`, `validatePicks`, `Ranks` (`talents.ts`); `createRng`, `Rng` (`src/engine/rng.ts`)
- Produces:
  - `interface TalentSpace { points: number; required: Ranks }`
  - `canonicalPicks(r: Ranks): string[]`: talents sorted by `row`, then `col`, with a prerequisite always before its dependant, each repeated rank times
  - `isLegal(r: Ranks, s: TalentSpace): boolean`: the sum equals `s.points`, `validatePicks(canonicalPicks(r)).ok`, and every required rank is met
  - `randomStart(s: TalentSpace, rng: Rng): Ranks | null`: draw tree weights (one main tree with weight U(0.4,1), the rest split randomly), place the required talents first (with the row-gate points they need), then add points one by one, picking a tree by weight and a random talent that can take a point now. `null` after 50 failed attempts.
  - `randomMove(r: Ranks, s: TalentSpace, rng: Rng): Ranks | null`: with p=0.7 move 1 point from talent a to talent b, otherwise move k ∈ [2,5] points (k capped by a's rank) from a to one or more targets; `null` if the result is not legal
  - `modelledKey(r: Ranks): string`: sorted `id:rank` of modelled talents with rank > 0
  - `freePoints(r: Ranks): number`: points in unmodelled talents
  - `pointDistance(a: Ranks, b: Ranks): number` = Σ|a−b| / 2 over all talents
  - `interface Scored { ranks: Ranks; kph: number }`
  - `hillClimb(o: { space: TalentSpace; evaluate: (r: Ranks) => number; starts: number; evals: number; rng: Rng; keep: number }): Scored[]`: `evals` is the total evaluation budget across starts, split evenly. Per start: random start, then first-improvement moves; skip moves whose `modelledKey` was already seen in this start (tabu). `evaluate` is called at most once per `modelledKey` (cache). Return the best `keep` results with distinct `modelledKey`, kph descending. `[]` when `randomStart` fails.

- [ ] **Step 1: Write failing tests**
  - 200 `randomStart` draws at points 31, required `{}`: all `isLegal`, and the main tree differs between draws (all 3 trees appear)
  - points 51 (`pointsAtLevel(60, 3)`): `randomStart` and 500 `randomMove`s stay legal
  - required `{wrack:1}` at points 31: every start has `wrack >= 1`, and moves never drop it
  - required `{wrack:1}` at points 21 (level 30): `randomStart` → `null`; `hillClimb` → `[]`
  - `hillClimb` with `evaluate = r => r.improved_corruption ?? 0` (points 31) finds `improved_corruption === 5`; `evaluate` call count ≤ `evals` and no `modelledKey` is evaluated twice
  - same seed gives the same result
  - `pointDistance({a:2},{b:2}) === 2`
- [ ] **Step 2: Run** `npx vitest run tests/forever/discover-talents.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement `talent-search.ts`**
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS
- [ ] **Step 5: Commit** `feat(forever): talent search for build discovery`

---

### Task 4: Discovery engine (tasks, stages, selection, state)

**Files:**
- Create: `src/forever/discover/engine.ts`
- Test: `tests/forever/discover-engine.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `runCell`, `SessionResult`, `CellMetrics` (`runner.ts`); `pairedDiff` (`duel.ts`); `loadVariant`, `ranksAt`, `VARIANT_IDS`, `SCENARIO_IDS` (`builds.ts`); `pointsAtLevel`; `loadParams`; data JSONs for the hash.
- Produces:
  - `interface StageBudget { starts: number; evals: number; sessions: number }`
  - `interface Budget { screen: StageBudget; keep: number; perFamilyMin: number; search: StageBudget; final: number; finalSessions: number }`
  - `DEFAULT_BUDGET = { screen: {starts:2, evals:30, sessions:2}, keep:200, perFamilyMin:3, search: {starts:8, evals:200, sessions:10}, final:60, finalSessions:200 }`
  - `QUICK_BUDGET = { screen: {starts:1, evals:8, sessions:1}, keep:20, perFamilyMin:1, search: {starts:2, evals:20, sessions:3}, final:25, finalSessions:20 }`
  - `interface DiscoverOptions { level: number; profile: string; mobs: 1|2|3; seed: number; perk: number; params: Params; top: number; budget: Budget; space?: SpaceFilter }`
  - `type Task = { kind: 'search'; stage: 'screen' | 'search'; combo: Combo } | { kind: 'final'; key: string; combo: Combo; ranks: Ranks } | { kind: 'baseline'; id: string }`
  - `type TaskResult = { kind: 'search'; comboId: string; found: Scored[]; evals: number } | { kind: 'final' | 'baseline'; key: string; metrics: CellMetrics; raw: SessionResult[] }` (a baseline's `key` is its id)
  - `runTask(o: DiscoverOptions, t: Task): TaskResult`. Pure, runs inside a worker. Seeds:
    - session seeds per stage: `o.seed * 1000 + {screen:1, search:2, final:3}`, the same for every task of the stage (common random numbers); baseline uses the final seed
    - talent RNG: `createRng(fnv1a(combo.id) ^ o.seed)`
    - `evaluate` = `runCell({variant: comboVariant(combo), level, profile, params, mobs, ranks, rotation: buildRotation(genes, params)}, sessions, stageSeed).metrics.killsPerHour`
  - `comboVariant(c: Combo): BuildVariant`: id `c.id`, the pets, `rotation: 'affliction'`, `filler: ''`, `rank: 'max'`, `order: ''`, `pre_respec_build: null`, `respec_level: 40`
  - `type Runner = (tasks: Task[], onDone: (r: TaskResult) => void) => Promise<TaskResult[]>`, which returns results in task order
  - `inlineRunner(o: DiscoverOptions): Runner` (for tests)
  - `interface DiscoverState { hash: string; screen: Record<string, TaskResult>; search: Record<string, TaskResult> }`
  - `stateHash(o: DiscoverOptions): string`: FNV-1a hex over `JSON.stringify` of spells, talents, levels, classic_base, `o.params`, level, profile, mobs, seed, perk, budget, space
  - `discover(o: DiscoverOptions, run: Runner, io?: { state?: DiscoverState; save?: (s: DiscoverState) => void; progress?: (stage: string, done: number, total: number) => void }): Promise<DiscoverResult>`
  - `interface TopRow { rank: number; combo: Combo; ranks: Ranks; label: string; perTree: Record<Tree, number>; freePoints: number; metrics: CellMetrics; kphCi: [number, number]; gainVsBest: MetricDiff & { pct: number }; tiedWithFirst: boolean; nearestKnown: { id: string; distance: number }; insensitive?: string[] }`
  - `interface DiscoverResult { meta: { level; points; profile; mobs; seed; perk; changedParams: Record<string, unknown>; hash: string; combos: number; evaluations: number }; baseline: { id: string; metrics: CellMetrics; kphCi: [number, number] }[]; top: TopRow[] }`
  - `pickTop(rows: {combo: Combo; ranks: Ranks; metrics: CellMetrics; effKey: string}[], top: number): typeof rows`: sort by kph desc, then deaths/h asc; at most 2 per `effKey` with the pet setup; the 2nd only when its `pointDistance > 2` from the 1st
- `discover` flow:
  1. If `io.state.hash !== stateHash(o)`, start a fresh state.
  2. Screen every combo of `enumerateCombos(level, space)`, skipping ones already in the state, and `save` after every 50 results.
  3. Stage 2 takes the best `keep` combos by their best screened kph, plus the best `perFamilyMin` per `genes.filler`.
  4. Search them the same way.
  5. Gather all `found` from stage 2, dedupe by `effectiveKey + modelledKey`, take the best `final`, and run `final` tasks plus `baseline` tasks for every known build.
  6. `pickTop`, then fill the gain vs the best baseline (`pairedDiff(...).killsPerHour`, `pct` = mean / best kph × 100), `tiedWithFirst` (paired diff vs row 1 not significant), `nearestKnown` (min `pointDistance` to `ranksAt(known, level)`) and `kphCi` (1.96·std/√n).
  7. Insensitivity for the top 5: for each modelled talent with rank > 0 not in `required`, move one point to any legal unmodelled talent. Skip it when none is legal. Run a final task, and list the talent when the paired diff is not significant.
- `changedParams`: the keys where `o.params` differs from `loadParams()`.

- [ ] **Step 1: Write failing tests** (all use a tiny space: `space = {fillers:['sb_r1','drain_life'], minTtk:[6], pets:['voidwalker','succubus'], sacrifice:false, maxDots:2}`, `QUICK_BUDGET` with `final: 6, finalSessions: 6`, `session_pulls: 4`, level 40)
  - `discover` returns at most `top` rows with ranks 1..n, each row legal at 31 points, no more than 2 rows per effective combo
  - determinism: same result with `inlineRunner` and with a runner that executes tasks in reverse order (but returns them in task order)
  - resume: `save` receives a state; rerunning with that state calls the runner with no screen tasks; with `params` changed (`mob_hp_mult: 1.1`) the hash differs and screen tasks run again
  - level 20 with a space including `felhunter` and `wrack`: no crash, no felhunter combos, no row with a `wrack*` filler
  - the baseline contains every known build id; the top row's kph ≥ the best baseline kph − its CI half-width (sanity: the search isn't worse than what exists; the tiny space includes a demonology-like SB r1 + succubus)
  - `pickTop` unit test with handmade rows: 3 rows of one combo at distances 0/1/4 → keeps rows 1 and 3
- [ ] **Step 2: Run** `npx vitest run tests/forever/discover-engine.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement `engine.ts`**
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS, test file under ~60 s (reduce the space if it is slower)
- [ ] **Step 5: Commit** `feat(forever): discovery engine with stages, selection and resumable state`

---

### Task 5: Report

**Files:**
- Create: `src/forever/discover/report.ts`
- Test: `tests/forever/discover-report.test.ts`

**Interfaces:**
- Consumes: `DiscoverResult`, `TopRow` (Task 4); `collectVerify` (`verify.ts`); `TALENT_BY_ID`
- Produces:
  - `verifyFor(row: TopRow): string[]`, in the form `file:name`. Includes:
    - spells used by the rotation's live steps that are flagged in `spells.json`
    - talents with rank > 0 flagged in `talents.json`
    - every `levels.json` pets entry when a pet or sacrifice is set
    - params from this map when flagged:
      - always: `mob_hp_mult`, `mob_dmg_mult`
      - `wrack`: `wrack_dmg_mult`
      - `drain_life` / `drain_soul`: `drain_dmg_mult`
      - any pet: `pet_dmg_mult`, `pet_hit_chance`
      - `demonic_brand` > 0: `brand_mult`, `brand_scale`
      - SB rank 1 / 2 used: `sb_r1_coeff_mult` / `sb_r2_coeff_mult`
  - `renderDiscoverReport(r: DiscoverResult, runSec: number): string`. Sections:
    - header (level, points, profile, mobs, seed, perk, changed params, hash, run time, combos, evaluations)
    - `## Known builds (baseline)` table: build, kills/h ± CI
    - `## Top N` table with columns: `#`, `Kills/h`, `± CI`, `vs best known` (`+12.3% ✓` when significant, `+1.0% ~` otherwise), `Trees` (`21/10/0`), `Pet`, `Rotation`, `TTK s`, `Downtime %`, `Deaths/h`, `Nearest known (points apart)`. Rows tied with #1 get `≈#1` after the rank.
    - `## Details`: per row, the talent ranks grouped by tree with names, free points, rotation steps (`spell rank — condition summary`), insensitive talents (top 5) and "Leans on estimates": `verifyFor`
  - `toJson(r: DiscoverResult): string` (2-space JSON, `raw` sessions excluded)

- [ ] **Step 1: Write failing tests** on a handmade `DiscoverResult` with 2 rows and 2 baseline rows:
  - the headings above are present
  - the vs-best cell shows `✓` only for the significant row
  - the `≈#1` marker is present
  - `verifyFor` on a row with succubus + Wrack + SB r1 contains `params.json:wrack_dmg_mult`, `params.json:pet_dmg_mult` and `params.json:sb_r1_coeff_mult`
  - `toJson` round-trips without `raw`
- [ ] **Step 2: Run** `npx vitest run tests/forever/discover-report.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement `report.ts`**
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS
- [ ] **Step 5: Commit** `feat(forever): discovery report`

---

### Task 6: CLI, worker pool, docs and the level 40 run

**Files:**
- Create: `scripts/forever-discover.ts`, `scripts/forever-discover-worker.ts`
- Modify: `package.json` (script `"forever:discover": "tsx scripts/forever-discover.ts"`), `README.md` (a Polish section after the `forever:wrack-thresholds` line in the Forever command block, plus a short paragraph)
- Output: `reports/forever_discover_L40.md`, `reports/forever_discover_L40.json`; state file `reports/.forever_discover_L40.state.json` (add `reports/.forever_discover_*.state.json` to `.gitignore`)

**Interfaces:**
- Consumes: `discover`, `runTask`, `Runner`, `DEFAULT_BUDGET`, `QUICK_BUDGET`, `stateHash` (Task 4); `renderDiscoverReport`, `toJson` (Task 5); `loadParams`.
- CLI flags:
  - `--level` (required, 10–60)
  - `--profile average`, `--mobs 1`, `--seed 1`, `--perk 0`, `--top 20`
  - `--param k=v` (repeatable; an unknown key is an error listing the valid keys; parse numbers and booleans like `forever-duel.ts` does)
  - `--quick`, `--workers <os.cpus().length>`
  - `--screen-sessions`, `--search-sessions`, `--final-sessions`, `--keep`
  - `--state <path>`, `--fresh` (ignore the state)
- Worker pool: `new Worker('scripts/forever-discover-worker.ts', { workerData: options, execArgv: ['--import', 'tsx'] })`. If tsx can't load in workers, fall back to `tsx`'s documented worker approach and note it in the commit. Each worker answers `{task}` messages with `runTask(options, task)`. The runner keeps results in task order.
- Progress on stderr every 10 s: stage, done/total, rate, ETA. Before stage 1 it prints the combo count and an estimate.
- Exit code 1 with a message on bad flags.

- [ ] **Step 1: Write the CLI and worker; run the quick check**

Run: `npm run forever:discover -- --level 40 --quick --workers 4`
Expected: it finishes in minutes and writes `reports/forever_discover_L40.md` with a baseline and a top-20 table; rerunning it immediately resumes ("resumed: N screen results") and finishes faster.

- [ ] **Step 2: Bad-input checks**

Run: `npm run forever:discover -- --level 40 --param nope=1`. Expected: exit 1, "unknown param nope".
Run: `npm run forever:discover -- --level 20 --quick`. Expected: finishes; no felhunter in the report.

- [ ] **Step 3: README section (Polish)** covering the command, what is searched, the stages and flags, the runtime estimate, resume, how to read the table (✓ / ~ / ≈#1, "Leans on estimates"), and the patch workflow (change the data or `--param`, rerun, compare with the previous report).

- [ ] **Step 4: Full suite** `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(forever): forever:discover CLI with a worker pool`

- [ ] **Step 6: Full default run for level 40** (in the background; hours)

Run: `npm run forever:discover -- --level 40`
Expected: `reports/forever_discover_L40.md` and `.json` with the default budget. Check that the top 20 has rows from more than one rotation family and that the best-known baseline matches `forever:run` at level 40 within its CI. Commit `docs: forever discovery report for level 40`.
