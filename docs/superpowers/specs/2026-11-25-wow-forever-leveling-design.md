# WoW Forever: warlock leveling build simulator (design)

Status: approved by the user (approach A, work on the current branch, TBC frozen).

## Intent
Compare warlock talent builds for leveling 40-60 in WoW Forever: time to kill (TTK), mana and HP
per kill, downtime (drink/eat/Life Tap) per kill, and the key metric, effective kills per hour.
Output: code with tests, README instructions, and `reports/forever_leveling_40plus.md`.

## Goals
- **Primary: a simulator for head-to-head comparison of two builds** (faster kills, less mana, fewer drink/Life Tap breaks, more kills per hour), with paired seeds and confidence intervals. The wide table/report is secondary; the TBC trainer UI is a frozen, secondary feature.
- Headless, seeded, deterministic simulation in a new module `src/forever/` (no React/DOM).
- All game data in JSON under `src/forever/data/`; every uncertain value has `verify: true` and a
  `source` note. A script lists all `verify` assumptions for the report.
- Builds are point orders for levels 10-60; any level can be simulated (points = level - 9).
- Sensitivity analysis over every `verify` parameter that can change the winner.
- Optional greedy/local-search optimizer with a fixed core (e.g. Demonic Pact).

## Non-goals
- No UI (the existing TBC trainer stays untouched; a Forever front end is a later option). No changes to the TBC engine, bot, UI or data (TBC is frozen; history keeps it).
- No raid/boss modelling, no elites, no PvP, no gear optimisation.
- Not a replica of the real client; relative ranking of builds is the goal.

## Approaches considered
- A (chosen): new standalone module; reuses `src/engine/rng.ts` only. Lowest regression risk.
- B: extend `src/engine/sim.ts` with a ruleset. Rejected: pets, mobs, DoT crits and levelling
  would touch a 1000-line real-time engine with many TBC-dependent tests.
- C: separate repo. Rejected by the user's request.

## Design
- `data/`: `spells.json` (ranks, cast, mana, damage, coeff), `talents.json` (three trees, rows,
  requirements, per-rank values), `builds.json`, `mobs.json` (HP/dmg/armor by level),
  `gear-profiles.json`, `params.json` (`downrank_penalty_model`, `bane_per_rank`, GCD haste...).
- `engine/`: event-driven fight on a ms clock: GCD 1.5 s (casts shorter than GCD do not speed up
  the next), optional haste, hit/crit for all spell types, DoT/drain crits (Pandemic), Bane and
  Curse as separate slots, Life Tap from Spirit, mana regen (5 s rule, drinking), pushback.
- `pet/`: separate damage model (auto, Lash of Pain, Firebolt), Unholy Power, Demonic Knowledge,
  Master Demonologist, Soul Link, Demonic Sacrifice/Pact, Demonic Brand procs, simple threat
  (pet holds aggro vs mob switches to player).
- `rotations/`: affliction and demonology priority lists with parameters
  (`skip_agony_if_ttk_below`, Life Tap rule, Drain Soul finisher, Nightfall procs).
- `metrics/`: TTK mean/spread, mana and HP per kill, downtime breakdown, kills/hour, GCD use and
  wasted sub-GCD cast time.
- `analysis/`: sensitivity sweeps, optimizer, report generator.
- `tests/forever/`: GCD, Bane, Demonic Pact, Soul Harvest, Brand, talent row validation, builds
  point counts per level.

## Left to the implementer
Exact numeric tables (Wowhead values I cannot confirm offline are flagged `verify`), file layout
details, number of Monte Carlo runs per cell.
