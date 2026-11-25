# WoW Forever Leveling Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A headless, seeded simulator that compares warlock talent builds for leveling 40-60 in WoW Forever and reports kills per hour, plus the report `reports/forever_leveling_40plus.md`.

**Architecture:** New standalone module `src/forever/` (no React/DOM); only `src/engine/rng.ts` (`createRng(seed): Rng`) is reused. All game numbers live in JSON under `src/forever/data/`, each uncertain value carrying `verify: true` and `source`. A ms-clock event loop simulates one pull (player + optional pet vs 1-3 mobs); a runner repeats it with seeds and aggregates metrics; analysis scripts sweep parameters and write the report.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), vitest (node project, `tests/**/*.test.ts`), `tsx` for scripts, JSON data (`resolveJsonModule` is on).

**Spec:** `docs/superpowers/specs/2026-11-25-wow-forever-leveling-design.md` plus the user's original task (copied into Global Constraints below).

## Global Constraints

- Work on the current branch `claude/amazing-galileo-x0w50c`; do not touch TBC code (`src/engine/sim.ts`, `src/data/**`, `src/ui/**`). Only add files (and a README section, `package.json` scripts).
- Commit in small steps with descriptive messages; end each commit message with the two attribution lines from the session (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01CqwEqDKRy8NSDtvEKpns8D`).
- Data in config JSON, not logic. Every unsure value: `"verify": true` + `"source"` comment. Never guess silently.
- Talents: from level 10, 1 point per level, 51 points at 60; each row needs 5 more points in that tree than the previous; golden talents at 11, 16, 21, 31 points in a tree.
- GCD = 1.5 s; a cast shorter than GCD does not speed up the next spell; haste may shorten GCD, config `haste_shortens_gcd` default `false`.
- DoTs and drains can crit (Pandemic raises their crit damage); crit/hit apply to all attack types.
- Banes are separate from curses (Agony and Curse of the Elements coexist).
- Shadow Bolt r1: 1.7 s, 25 mana, 12-16; r2: 2.2 s, 40 mana, 22-27; higher ranks from game data, `verify`.
- `downrank_penalty_model` in {`none`, `classic`, `partial`}; `bane_per_rank` default 0.1 s (`verify`), also test 0.2 s.
- Builds are point orders for levels 10-60; checked levels: 40, 42, 45, 48, 50, 55, 60 with exactly `level - 9` points.
- Metrics per build x level x gear profile: TTK mean/spread, mana and HP lost per kill, drink/eat/Life Tap time per kill, kills/hour (with downtime and configurable transition time), GCD use and wasted sub-GCD cast time.
- No network is available for Wowhead; unconfirmable values are flagged, not invented as facts.

## Review Focus

- Build with more points than the level allows, or a talent whose row/prerequisite is unmet: must be rejected with a clear error.
- Level with no mobs/data (e.g. 41): nearest-lower table row with a `verify` warning, not a crash.
- Mob dies before DoT ticks / Drain Soul channel is interrupted: no ticks after death, no negative mana.
- Zero mana and no Life Tap allowed (HP too low): player must drink, not deadlock in an infinite loop.
- Pet dead or not summoned in a Demo build: no pet bonuses applied, no crash.
- Same seed twice gives identical results; different seeds differ.

---

### Task 1: Data schema, loader and verify registry

**Files:**
- Create: `src/forever/data/types.ts`, `src/forever/data/load.ts`, `src/forever/data/params.json`, `src/forever/data/spells.json` (Shadow Bolt r1/r2 first, plus placeholders loaded in later tasks), `scripts/forever-verify.ts`
- Test: `tests/forever/data.test.ts`

**Interfaces:**
- Produces: `interface Sourced<T> { value: T; verify?: boolean; source: string }`; `loadParams(): Params` (includes `downrank_penalty_model`, `bane_per_rank`, `haste_shortens_gcd`, `skip_agony_if_ttk_below`, `life_tap_mana_below`, `life_tap_hp_above`, `mobs_per_pull`, `transition_sec`); `collectVerify(): {path: string; source: string}[]` walks all loaded JSON and returns every node with `verify: true`.

- [ ] **Step 1: Write failing tests** `collectVerify returns every verify:true path`, `loadParams has bane_per_rank.value === 0.1 and verify === true`, `every leaf object with a numeric "value" has a non-empty source`.
- [ ] **Step 2:** Run `npx vitest run tests/forever/data.test.ts`; expect FAIL (modules missing).
- [ ] **Step 3:** Implement types, loader (static JSON imports) and `collectVerify` (recursive walk). `scripts/forever-verify.ts` prints the list as a markdown table.
- [ ] **Step 4:** Run the test; expect PASS.
- [ ] **Step 5:** Commit `feat(forever): data schema, loader and verify registry`.

### Task 2: Talent trees and build validation

**Files:**
- Create: `src/forever/data/talents.json` (three trees exactly as in the task description: rows 0-6, max ranks, prerequisites, per-rank values with `verify` where only the max rank is known), `src/forever/talents.ts`
- Test: `tests/forever/talents.test.ts`

**Interfaces:**
- Produces: `interface TalentTree`; `pointsAtLevel(level: number): number` (`max(0, level - 9)`); `validateBuild(order: TalentPick[], level: number): ValidationResult` where `TalentPick = { talent: string }` (one entry per point); `talentRanks(order, level): Record<string, number>` (ranks after the first `pointsAtLevel(level)` picks); throws/returns errors for row gating (5 points per row in the same tree), max rank, prerequisites (Curse of Exhaustion needs Amplify Curse, Wrack needs Siphon Life, Fel Domination needs 2 in Master Summoner, Soul Link needs Demonic Sacrifice, Demonic Pact needs Soul Link, Incinerate needs Bane of Havoc).

- [ ] **Step 1: Write failing tests:** `pointsAtLevel(60) === 51`, `pointsAtLevel(40) === 31`; `Wrack at 29 affliction points is rejected`; `Demonic Pact without Soul Link is rejected`; `row 1 talent with 4 points in tree rejected, accepted with 5`; `more picks than points rejected`; `talentRanks truncates to level`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. Rows require `5 * row` points in the same tree before the pick.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(forever): talent trees with row and prerequisite validation`.

### Task 3: Builds as point orders

**Files:**
- Create: `src/forever/data/builds.json`, `src/forever/builds.ts`
- Test: `tests/forever/builds.test.ts`

**Interfaces:**
- Consumes: `validateBuild`, `talentRanks`.
- Produces: `loadBuilds(): Record<BuildId, BuildDef>` for `AFF_WRACK`, `AFF_DRAINTANK`, `DEMO_PACT_R1`, `DEMO_PACT_VIDEO`, `DEMO_PACT_R2`, `DEMO_PACT_MAXRANK`, `DEMO_FIRE`; `BuildDef = { order: TalentPick[]; pet: 'imp'|'voidwalker'|'succubus'|'felhunter'|null; sacrificed: PetKind|null; filler: {spell: string; rank: number|'max'}; rotation: 'affliction'|'demonology'|'fire'; banePerRankOverride?: number }`. Unspecified points of DEMO_* after 49 are filled by the optimizer in Task 12; until then filled by a documented default order marked `verify`.

- [ ] **Step 1: Write failing tests:** every build validates at levels 40, 42, 45, 48, 50, 55, 60; `AFF_WRACK has exactly 51 picks`; `DEMO_PACT_R1 at level 40 has 31 picks and ends with Demonic Pact`; `DEMO_PACT_VIDEO has Bane 5/5 at level 60`. The user's build lists are copied exactly (for AFF_WRACK, "40 Wrack" etc.; where a list gives ranges, expand them per point).
- [ ] **Step 2:** Run; expect FAIL. If a user list violates a gate (e.g. a talent needing points the level hasn't given), record it in `docs/superpowers/forever-build-notes.md` and make the minimal reordering, flagged `verify`.
- [ ] **Step 3:** Implement loader; **Step 4:** Run; PASS. **Step 5:** Commit `feat(forever): seven build definitions`.

### Task 4: Spell data, ranks and downrank model

**Files:**
- Create: `src/forever/data/spells.json` (extend), `src/forever/spells.ts`
- Test: `tests/forever/spells.test.ts`

**Interfaces:**
- Produces: `spellAt(id: string, rank: number|'max', level: number): SpellRank`; `downrankFactor(model: DownrankModel, spellLevel: number, casterLevel: number): number` (`none` = 1; `classic` = `min(1, 1 - (20 - spellLevel) * 0.0375)` for `spellLevel < 20`, else 1; `partial` = midpoint between `none` and `classic`; all `verify`); `effectiveCastMs(spell, ranks)` applies Bane: `castMs - bane_per_rank * rank` (for Shadow Bolt, Immolate, Incinerate), floored at 0.5 s.

- [ ] **Step 1: Write failing tests:** `Shadow Bolt r1 cast is 1.7 s with Bane 0`; `Bane 5/5 at bane_per_rank 0.1 gives r1 = 1.2 s`; `Bane 5/5 at bane_per_rank 0.2 gives r1 = 0.7 s`; `Bane 5/5 r2 = 1.7 s at 0.1/rank`; `cast never drops below the 0.5 s floor`; `downrankFactor('none') === 1`; `classic < 1 at spellLevel 1`; `partial` strictly between the two.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement; add ranks 3+ of Shadow Bolt, Corruption, Agony, Immolate, Drain Soul, Drain Life, Siphon Life, Searing Pain, Wrack, Life Tap, all `verify: true` from memory of game data with source "Classic data, unconfirmed". **Step 4:** PASS. **Step 5:** Commit `feat(forever): spell ranks, downrank penalty model and Bane`.

### Task 5: Stats, GCD, mana and Life Tap

**Files:**
- Create: `src/forever/stats.ts`, `src/forever/data/gear-profiles.json` (profiles `quest`, `average`, `good` with spell power and Spirit by level; all `verify`), `src/forever/data/base-stats.json` (base mana, int, spirit, regen by level; `verify`)
- Test: `tests/forever/stats.test.ts`

**Interfaces:**
- Produces: `gcdMs(hastePct: number, params: Params): number` (1500 unless `haste_shortens_gcd`; floor 1000); `castTimeMs(baseMs, hastePct)`; `gcdWaste(castMs, gcdMs): number` (`max(0, gcd - cast)` for casts below GCD, the "wasted" shortening metric); `lifeTapGain(spirit, rank, talents): number` (Spirit-scaled, `verify`); `manaRegenPerSec(stats, inFiveSecondRule)`; `drinkRegenPerSec(level)`.

- [ ] **Step 1: Write failing tests:** `gcdMs ignores haste by default` (haste 20 -> 1500); `gcdMs with flag on and haste 20 -> 1250`; `a 1.2 s cast leaves 0.3 s waste and the next spell starts at 1.5 s` (assert via waste = 300); `Improved Life Tap 2/2 raises gain`; `Life Tap scales with Spirit`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(forever): GCD, mana regen and Spirit-scaled Life Tap`.

### Task 6: Mob model and fight loop core

**Files:**
- Create: `src/forever/data/mobs.json` (HP, armor, dps, level 38-60; `verify`), `src/forever/fight.ts`, `src/forever/events.ts`
- Test: `tests/forever/fight.test.ts`

**Interfaces:**
- Produces: `simulatePull(cfg: PullConfig, seed: number): PullResult` where `PullConfig = { build: BuildDef; level: number; profile: string; mobs: 1|2|3; params: Params }` and `PullResult = { ttkSec; manaSpent; hpLost; castTimeWaste; gcdBusySec; gcdTotalSec; events: LogEvent[]; died: boolean; killedAll: boolean }`. Core loop: ms-clock priority queue; GCD gating; cast completes; hit roll (miss by level); crit roll applying to direct, DoT ticks and drains; mob HP; pushback when mob attacks player while casting.

- [ ] **Step 1: Write failing tests:** `same seed => identical PullResult`; `different seeds => different results (10 seeds)`; `a single Shadow Bolt r1 hit deals 12-16 x downrankFactor at level 40 with spell power 0 and model none`; `DoT ticks stop at mob death`; `no negative mana`; `casts under GCD still start next spell at 1.5 s`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; rotation is injected as `(state) => Action` so Task 7+ plug in. **Step 4:** PASS. **Step 5:** Commit `feat(forever): pull simulation core with GCD, crits and mobs`.

### Task 7: Affliction mechanics (DoTs, Soul Harvest, Nightfall, Drains)

**Files:**
- Create: `src/forever/afflictionEffects.ts`, `src/forever/rotations/affliction.ts`
- Test: `tests/forever/affliction.test.ts`

**Interfaces:**
- Produces: `afflictionRotation(params): RotationFn`; effects: Improved Corruption (instant Corruption, +10% dmg), Improved Drains +20%, Pandemic (crit multiplier of DoT/drain), Soul Siphon (drain +X% per own effect on target, `verify`), Nightfall proc (instant free Shadow Bolt consumed immediately), Soul Harvest: killing under Drain Soul grants +100% mana regen for 10 s, and that regen continues at 100% while casting; Bane of Agony skipped if `ttk estimate < skip_agony_if_ttk_below`; Curse of the Elements and Agony coexist.

- [ ] **Step 1: Write failing tests:** `Soul Harvest: kill during Drain Soul yields buff for 10 s doubling regen and regen not reduced while casting`; `kill without Drain Soul gives no buff`; `Agony and Curse of the Elements coexist on one target`; `Agony skipped when estimated TTK below threshold`; `DoT tick can crit (seeded, rate within 3 sigma of crit%)`; `Pandemic 3/3 raises DoT crit damage`; `Nightfall proc casts instant free Shadow Bolt next decision`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(forever): affliction effects and rotation`.

### Task 8: Pet model, Demonic Brand, Pact, Sacrifice

**Files:**
- Create: `src/forever/pet.ts`, `src/forever/demoEffects.ts`, `src/forever/rotations/demonology.ts`, `src/forever/rotations/fire.ts`, `src/forever/data/pets.json` (auto attack, Lash of Pain, Firebolt, base HP/dmg by level; `verify`)
- Test: `tests/forever/demo.test.ts`

**Interfaces:**
- Produces: `PetState`, `stepPet(state, dtMs, rng): PetEvents`; `brandDamage(level: number, spellPower: number, rank: number, scale: BrandScale): number` where default formula for 3/3 is `(60 - 26) * 1.5 + avg(14, 17) + 0.078 * spellPower`, and `BrandScale` in {`fixed_60`, `level_scaled`} (`verify`, sensitivity later); `applyDemonicSacrifice(kind)` (Imp +15% shadow, Succubus +15% fire, Voidwalker 2% mana/4 s, Felhunter heal); `summonDemon(state, kind)`: with Demonic Pact summoning a different demon keeps Sacrifice, same demon removes it; Demonic Knowledge (bonus damage = level x rank/3, `verify`), Master Demonologist per active pet, Soul Link (pet takes 30% damage, +3% damage), Unholy Power +10% pet damage 5/5; Brand: Searing Pain marks target for 10 s with 3 charges on pet attacks, refreshed before expiry by the demonology rotation; threat: while Brand is active and pet alive the mob stays on pet, otherwise the mob switches to the player after a configurable threat delay.

- [ ] **Step 1: Write failing tests:** `brandDamage rank3 level 60 sp 0 === 51 + 15.5` (= (34*1.5)+15.5 = 66.5); `with 100 SP adds 7.8`; `Brand lasts 10 s and spends 3 charges on 3 pet attacks`; `Demonic Pact: summoning Succubus after Imp-Sacrifice keeps Sacrifice, summoning Imp again removes it`; `Soul Link: pet receives 30% of player damage, damage +3%`; `no pet: demo bonuses are not applied`; `Brand keeps aggro on pet, no Brand moves mob to player and player takes damage and pushback`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(forever): pet model, Demonic Brand, Pact and Sacrifice`.

### Task 9: Downtime and kills-per-hour runner

**Files:**
- Create: `src/forever/runner.ts`, `src/forever/metrics.ts`
- Test: `tests/forever/runner.test.ts`

**Interfaces:**
- Consumes: `simulatePull`.
- Produces: `runCell(cfg: PullConfig, runs: number, seed: number): CellMetrics` with `ttkMean, ttkStd, manaPerKill, hpPerKill, drinkSec, eatSec, lifeTapSec, kph, gcdUtil, gcdWasteSec`; downtime rule: after each pull restore mana to `rest_to_mana_pct` (default 90) by Life Tap (when `life_tap_mana_below` / `life_tap_hp_above` allow) then drink, restore HP by eating; `kph = 3600 / (ttk + downtime + transition_sec)`.

- [ ] **Step 1: Write failing tests:** `kph formula on fixed inputs (ttk 20, downtime 10, transition 6 => 100)`; `Life Tap time counted into downtime and reduces drink time`; `zero-regen profile does not loop forever (timeout guard returns finite downtime)`; `runCell deterministic for same seed`; `mobs=3 raises mana per kill vs mobs=1`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(forever): metrics runner with downtime and kills per hour`.

### Task 10: CLI, build comparison table, README

**Files:**
- Create: `scripts/forever-run.ts`, `src/forever/compare.ts`
- Modify: `package.json` (scripts `forever:run`, `forever:verify`, `forever:report`), `README.md` (new section "WoW Forever leveling simulator")
- Test: `tests/forever/compare.test.ts`

**Interfaces:**
- Produces: `compareBuilds(levels: number[], profiles: string[], runs: number, seed: number, overrides?: Partial<Params>): ComparisonRow[]`; `renderMarkdownTable(rows): string`; CLI `npm run forever:run -- --levels 40,50,60 --profile average --runs 500 --seed 1 [--mobs 2] [--param bane_per_rank=0.2]`.

- [ ] **Step 1: Write failing tests:** `compareBuilds returns one row per build x level x profile`; `markdown table has header and 7 builds rows per level`; `override of bane_per_rank changes results of DEMO_PACT_VIDEO`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement + README with commands and how to read `verify` flags. **Step 4:** PASS; also run `npm run typecheck`. **Step 5:** Commit `feat(forever): CLI, comparison table and README`.

### Task 11: Sensitivity analysis

**Files:**
- Create: `src/forever/sensitivity.ts`, `scripts/forever-sensitivity.ts`
- Test: `tests/forever/sensitivity.test.ts`

**Interfaces:**
- Produces: `sensitivity(axes: SensitivityAxis[], levels: number[], runs: number, seed: number): SensitivityResult[]` with axes `downrank_penalty_model` {none, classic, partial}, `bane_per_rank` {0.1, 0.2}, `shadow_bolt_r1_coeff` / `r2_coeff` (low/base/high), `mob_hp_mult` {0.8, 1, 1.25}, `brand_scale` {fixed_60, level_scaled}, `brand_mult`; each result lists ranking per level and `winnerChanged: boolean` vs base.

- [ ] **Step 1: Write failing tests:** `base axis value yields winnerChanged=false`; `result includes ranking of all 7 builds`; `axes listing is exhaustive for the spec's verify list`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(forever): sensitivity analysis`.

### Task 12: Optimizer (optional core)

**Files:**
- Create: `src/forever/optimizer.ts`
- Test: `tests/forever/optimizer.test.ts`

**Interfaces:**
- Produces: `optimizeBuild(core: TalentPick[], level: number, profile: string, runs: number, seed: number): { order: TalentPick[]; kph: number }`; greedy: at each free point try every legal talent (via `validateBuild`), keep the one maximizing kph with common random numbers; returns the order from the first free point to level 60 (points 41-60).

- [ ] **Step 1: Write failing tests:** `optimizeBuild result passes validateBuild at 60`; `result starts with the fixed core unchanged`; `deterministic for fixed seed`; `kph of result >= kph of default fill`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with a small run count per candidate. **Step 4:** PASS. **Step 5:** Commit `feat(forever): greedy build optimizer`.

### Task 13: Report

**Files:**
- Create: `scripts/forever-report.ts`, `reports/forever_leveling_40plus.md` (generated)
- Test: `tests/forever/report.test.ts`

**Interfaces:**
- Produces: `buildReport(): string` with sections: comparison table per level (40, 42, 45, 48, 50, 55, 60 x 3 profiles), respec recommendation (first level where DEMO_PACT_* beats the best affliction build, and where not), Bane 2/5 + r1 vs Bane 5/5 + r2 answer (from DEMO_PACT_R1 vs DEMO_PACT_R2), list of all `verify` assumptions via `collectVerify`, sensitivity results and which assumptions flip the winner, and a "not modelled" list.

- [ ] **Step 1: Write failing tests:** `report contains all five required headings`; `every collectVerify path appears in the assumptions section`; `report mentions Bane question verdict line`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; run `npm run forever:report` with 300 runs to generate the file. **Step 4:** PASS; run full `npx vitest run` and `npm run typecheck`. **Step 5:** Commit `docs: forever leveling report`; do not push without the user's go-ahead for new branches (current branch is allowed).

---

## Self-review

- Spec coverage: data/verify (T1), talents and gating (T2), seven builds (T3), ranks/downrank/Bane (T4), GCD/mana/Life Tap (T5), mobs and loop (T6), Affliction incl. Soul Harvest and `skip_agony_if_ttk_below` (T7), pets/Brand/Pact/threat (T8), downtime and kph (T9), CLI/README (T10), sensitivity (T11), optimizer (T12), report with recommendations (T13).
- Tests required by the user: GCD (T5), Bane (T4), Demonic Pact (T8), Soul Harvest (T7), Brand (T8).
- Known limitation to state in the report: no Wowhead access offline; many coefficients are `verify`.
