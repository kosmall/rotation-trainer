# WoW Forever: build discovery for one level (design)

Status: draft, waiting for the user's approval.

## Intent

A tool that, given one level (e.g. 40), searches combinations of **talents, rotation, pet and
sacrificed pet** and reports the **top 20 combinations** by kills per hour at that level.

Why: to find **non-obvious builds**. A blue post or a patch may buff a spell or a talent in a way
that is not obvious; the user changes the data (`spells.json`, `talents.json`, `params.json` or a
`--param`), reruns the search and looks for a combination nobody plays that has become strong. The
tool is a discovery engine, not a confirmation of the known builds. Run time is not a concern
(hours per level are fine).

## Goals

- `npm run forever:discover -- --level 40` runs the whole search headless and writes a Markdown
  report with a top-20 table, plus a JSON file with the full results.
- The search covers:
  - **talents**: the ranks at that level (level − 9 points; with `--perk` the Talented perk adds points), any legal distribution;
  - **rotations composed from the simulator's spells** (not only the three hard-coded ones);
  - **pet** (none, imp, voidwalker, succubus, felhunter) and **sacrificed pet** (with Demonic Sacrifice).
- Every rotation × pet combination gets a fair chance: its own talent search (approach A below).
- The top 20 are **20 different ideas**, not 20 near-copies of one build.
- The known builds (`builds.json` variants and `scenarios.json`) are simulated at the same level
  with the same seeds as a **baseline**; every result shows its gain over the best known build.
- Final ranking uses many sessions and common random numbers, with a 95% confidence interval.
- Deterministic for a given `--seed`, parallel on all cores, resumable after an interruption.

## Non-goals

- No web UI (the report and JSON are the output; a web view is a later option).
- Not a 10-60 leveling order: the result is a distribution of points at one level (the user
  confirmed the order does not matter at a single level).
- Gear profile, mobs per pull, Life Tap policy, Eureka! policy and all other `params.json` values
  are **inputs** (flags / `--param`), not searched.
- No guarantee of the global optimum (the space is billions of talent distributions); the aim is
  very good, diverse combinations.
- No new mechanics: spells not in `spells.json` and talents marked `unmodelled` stay as they are.
  The tool only finds what the model can express.

## Anti-goals (a failure even if it runs)

- The search is anchored on the known builds and only rediscovers AFF_WRACK / DEMO_PACT variants.
- The top 20 is one archetype in 20 variants that differ in dead points.
- Results of the existing builds, tools, tests or the web app change.
- A "winner" that is noise: a top entry whose lead over the next is inside the confidence interval
  is presented as a clear win.

## Constraints (from the project)

- At level L a build has `pointsAtLevel(L)` = L − 9 points (31 at level 40). Legality:
  `validatePicks` (5 points per row in the tree, prerequisites, max rank).
- 36 talents are `modelled`, 16 `unmodelled` (no effect; they only count towards row gates).
- One `runCell` with 20 sessions takes 75–180 ms on this machine; 4 cores.
- `fight.ts` takes its rotation from `rotationFor(variant.rotation)` (three functions in
  `rotations.ts`). `rotation-spec.ts` already describes the same rotations as data
  (`RotationSpec`, `evaluateSteps`), and tests keep the two equal. `fight.ts` also reads
  `variant.rotation`, `variant.filler`, `variant.rank` and `variant.immolate` for the filler-rank
  and DPS estimates (lines ~488 and ~521); a data rotation must supply these.
- Repo conventions: framework-free code in `src/forever/`, CLI in `scripts/forever-*.ts`, report
  in `reports/`, tests in `tests/forever/` (Vitest), README section in Polish.

## Approaches

- **A. Two levels (chosen by the user).** Enumerate every rotation × pet combination; each gets
  its own talent search (local search with several random starts, cheap screening with few
  sessions). A quick round drops combinations that are hopeless with any talents; a full search
  for the rest; the top 20 get a precise re-run with a confidence interval. Every odd rotation gets
  a fair chance; the top 20 is diverse by construction. Cost: hours per level.
- **B. One evolutionary search over everything (genome = talents + rotation + pet).** Faster, but
  the population converges on the dominant archetype and an unusual rotation that needs other
  talents dies out before its talents are found: works against the intent. Rejected.
- **C. Greedy point-by-point (like `forever:optimize`).** Misses synergies that need several points
  at once (row gates). Rejected.

## Design

### 1. Rotations as data in the fight

- `fight.ts` accepts a rotation as a `RotationSpec`-like list of steps (new optional field on the
  pull/cell config, or on the variant). When it is absent, the existing `rotationFor` path runs
  unchanged, so every existing result stays the same (tests prove it).
- The estimates that today read `variant.filler/rank/rotation/immolate` take them from the data
  rotation instead: its filler step (spell and rank) and its maintained DoT set.
- The three built-in rotations, converted with `rotationSpec(...)` and run through the data path,
  must give **identical** results to the code path for the known builds (a regression test across
  all variants at a few levels).

### 2. Rotation grammar (what the generator composes)

A rotation is generated from a small set of genes; the steps are built in a fixed canonical order
(the order of DoTs barely matters and enumerating it would multiply the space):

1. Shadow Bolt on Shadow Trance: always included (it only fires with Nightfall taken).
2. Demonic Brand refresh with Searing Pain: always included (only fires with the talent and a live pet).
3. Maintained effects, each on/off: Curse of the Elements, Bane of Agony, Corruption, Siphon Life,
   Immolate. (In the data Bane of Agony is a bane, not a curse, so it coexists with Curse of the
   Elements, as the current model already does.)
4. Minimum estimated TTK to apply DoTs: a few values (e.g. 0, the default `corruption_min_ttk_sec`, a higher one).
5. Drain Soul finisher: on/off.
6. Filler: Shadow Bolt r1 / r2 / max, Searing Pain, Drain Life, Wrack (health floor none / 50% / 70%),
   Wrack on single-mob pulls then Drain Life.
7. The cheap Shadow Bolt fallback (r2, r1) always closes the list, as today.

That is roughly 32 × 3 × 2 × 9 ≈ 1,700 rotations. Rotations that are **identical at the level**
(a step whose spell is not known at that level, e.g. Wrack without the talent or Siphon Life below
its level, a filler that falls through to the same spell) are collapsed before the search, given
the talents of the candidate (see 4).

### 3. Pets

Active pet ∈ {none, imp, voidwalker, succubus, felhunter}; sacrificed pet ∈ {none, imp, voidwalker,
succubus, felhunter} (only meaningful with Demonic Sacrifice; without it the combination is
collapsed into "no sacrifice"). Pets whose `unlock` level (`levels.json` → `pets`) is above the
level are skipped.

### 4. Talent search (per rotation × pet)

- A candidate is a **rank map** (modelled talents) plus the minimum number of points in
  `unmodelled` talents needed to pass row gates. Two candidates with the same modelled ranks are
  the same build (the dead points are reported as "free points").
- Legality is checked by building a canonical pick list (rows in ascending order, prerequisites
  first) and calling `validatePicks`.
- Moves: move one point from talent a to talent b; move several points of one talent at once (to
  cross a row gate); swap tree mass. Illegal results are repaired or discarded.
- Local search (first-improvement hill climbing with a tabu list) from several random legal
  starts per combination, **not** from known builds (anti-goal 1). Random starts are drawn across
  all three trees and mixed distributions.
- Every comparison uses common random numbers (the same session seeds).

### 5. Stages and budget

1. **Screening**: every rotation × pet combination, a short talent search on few sessions
   (e.g. 4 starts × ~50 evaluations × 3 sessions).
2. **Full search**: the best N combinations (e.g. 200, and at least the best 3 of each rotation
   family so no family is dropped by noise alone) get a long search (more starts, more evaluations,
   10–20 sessions).
3. **Final**: the deduplicated top ~60 are re-run with many sessions (e.g. 200) on common seeds; the
   top 20 by kills per hour are reported with 95% CIs.

Stage sizes are flags with defaults; `--quick` gives a minutes-long run for checking. Rough cost
with the defaults: a few hours per level on 4 cores; the script prints an estimate and progress.

### 6. Diversity of the top 20

- Collapse equivalent results: same rotation-as-played (after the level collapse), same pet setup,
  same modelled ranks.
- At most 2 entries per rotation × pet combination in the top 20 (the 2nd only when its talents
  differ in more than a couple of points from the 1st).
- A separate short section lists, for the best 5, the talents the result is insensitive to (moving
  the point elsewhere costs less than the CI).

### 7. Parallelism, determinism, resume

- `worker_threads`, one worker per core; the main thread hands out work units (a combination's
  search) and gathers results. Each unit has its own seed derived from `--seed` and the unit id, so
  the result does not depend on scheduling.
- A checkpoint file (JSON) in `reports/` (or a `--state` path) after every finished unit; rerunning
  the same command resumes. The checkpoint records the data hash (spells/talents/params) and the
  flags; a mismatch starts over.

### 8. CLI

```
npm run forever:discover -- --level 40 [--profile average] [--mobs 1] [--seed 1]
  [--param key=value ...] [--perk 0] [--top 20] [--quick] [--workers 4]
  [--screen-sessions 3] [--search-sessions 15] [--final-sessions 200] [--keep 200]
```

### 9. Report (`reports/forever_discover_L<level>.md`) and JSON

- Header: level, points, profile, mobs, seed, changed params, data hash, run time, how many
  combinations and evaluations were searched.
- **Baseline**: every known build at the level with kills/h ± CI.
- **Top 20 table**: rank; kills/h ± CI; gain vs the best known build (% and whether the CI
  excludes zero); points per tree (e.g. 21/10/0); pet (+ sacrificed); rotation in one line (e.g.
  "CoE, Corruption, Immolate → Searing Pain; DS finish"); TTK; downtime %; deaths per hour; the
  nearest known build (fewest differing points) and how many points differ.
- Under the table: each entry's full talent ranks and its rotation steps.
- **Assumptions it leans on**: for each of the top 20, the `verify: true` values of the spells,
  talents, pet and parameters the build actually uses (static listing, like `forever:verify`, not a
  sensitivity run), so a "broken" discovery that rests on an estimated number is visible at once.
- `reports/forever_discover_L<level>.json`: all final results (ranks, rotation spec, pet setup,
  metrics), so a result can be re-simulated or turned into a custom build later.

### 10. Tests

- Data-path rotation equals code-path rotation for all known builds (results identical).
- Grammar: generated rotations are valid; collapse of identical rotations works.
- Talent moves always give legal builds; canonical pick lists validate.
- Determinism: same seed and flags give the same top list, regardless of `--workers`.
- End-to-end `--quick` run on a low level finishes and writes a report; the top entry is at
  least as good as the best known build within its CI (sanity check that the search is not
  worse than what exists).

## Calls made by Claude (the user can override)

- Metric: kills per hour (the project's key metric); ties broken by deaths per hour.
- Canonical DoT order instead of permutations; the trance and brand steps always included.
- Each top entry lists the estimated (`verify`) values it depends on; no sensitivity run per entry.
- Random starts only (no seeding from known builds); known builds only as the baseline.
- At most 2 entries per rotation × pet combination in the top 20.
- Report and code in English like the other Forever reports; a README section in Polish.

## Left to the builder

- Exact move set and tabu details, stage sizes and default budgets (tuned so a default run on
  level 40 takes at most a few hours on 4 cores).
- Where the data rotation plugs in (cell config vs variant) as long as the existing path is untouched.
- Checkpoint file format.
