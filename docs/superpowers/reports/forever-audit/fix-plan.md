# Fix plan (Task 3)

Findings: 84 total (A1 18, A2 17, A3 19, A4 15, A5 19). Confirmed: 49. needs-owner: 35 (none fixed; they go to the report). The two `high` findings were re-checked by the orchestrator against the code (A1-001: `manaPct`/`combatSec` are never set in `fight.ts` `makeCtx`, so `evalCond` falls back to its defaults; A5-001: the copy path stores no `coe/immolate/wrack_min_hp_pct/pet_rules`, repro in the finding).

Duplicates merged: A3-001 = A4-002 (one fix); A3-002 = A4-003; A3-014 = A4-007; A2-007 = A3-009 = A4-015 (one fix); A3-018 = A4-011 = A5-009 (one fix); A2-011 = A4-001 (one fix); A5-017 and A1-010 estimate fixes touch `rotation-spec.ts` (one fix).

## Deliberately NOT fixed in this run (go to the report as owner decisions)

- A5-003 (paired seeds do not pair): redesign of the RNG streams; it would shift every seeded number and make the before/after check useless. Recommend a separate run.
- A5-013, A5-014, A5-019 (CI quantile, EP validity, sensitivity significance): methodology changes that move intervals; owner decides.
- A4-008, A4-009 (`*_PET` duplicate variants): renaming/removing builds is a product decision (README, addon vectors, scripts reference them).
- A3-017 `--respec` dead option: fix only the misleading option text (in F-tools), not the mechanism.
- Everything `needs-owner`.

## Waves

Fixes in one wave touch disjoint files. Each fix agent: worktree, test-first, as in plan Task 4 step 1. Fix ids are also the agent names.

### Wave 1 (parallel)

| Fix | Findings | Files (exclusive) |
|---|---|---|
| F-fight | A1-001, A1-002, A1-005, A1-010, A1-012, A3-002/A4-003 (cap demon mana at max, in a shared helper exported from fight.ts for the runner), A4-001 (Torment 20 mana) , A4-006 (Lash hit roll), A3-014/A4-007 (Improved Imp, Lash, armor in `estPetDps`), A5-017 (`estimateOf`) | `src/forever/fight.ts`, `src/forever/rotation-spec.ts`, tests in `tests/forever/` (new files named after finding ids; may edit `fight.test.ts`, `discover-mix.test.ts`, `pet-health.test.ts`) |
| F-custom | A5-001, A5-002, A5-008 (test only), A3-018/A4-011/A5-009 | `src/forever/builds.ts`, `src/forever/web/custom.ts`, `src/ui/forever/CustomView.tsx`, `tests/forever/custom.test.ts`, `tests/forever/builds.test.ts`, `tests/forever/variant-genes.test.ts` |
| F-settings | A5-007 | `src/ui/forever/SettingsBar.tsx`, `tests/ui/forever/forever-app.test.tsx` |
| F-data | A2-003 (negative mob damage), A2-008, A2-010 (verify flags), A1-013 (ledger text) | `scripts/forever-extract-classic.py`, `src/forever/data/classic_base.json`, `src/forever/data/spells.json`, `src/forever/data/levels.json` (A4-001 note: F-fight must not edit this file), `docs/forever-data-ledger.md`, `tests/forever/spells-stats.test.ts` |

### Wave 2 (after Wave 1 is merged; parallel)

| Fix | Findings | Files |
|---|---|---|
| F-runner | A3-001/A4-002 (between-pull Life Tap gives the demon Demonic Energies mana; use the helper from F-fight), A1-003, A1-004, A1-008, A1-014, A1-011 (ltpolicy presets), A5-006 (seed overflow: keep the old formula for seeds below the safe limit so existing results do not move; fix only large seeds; validate in `web/api.ts`), A4-014 (pet tests) | `src/forever/runner.ts`, `src/forever/ltpolicy.ts`, `src/forever/discover/engine.ts` (`stageSeed` only), `src/forever/web/api.ts` (seed validation only), `tests/forever/runner.test.ts`, `tests/forever/pet-health.test.ts`, `tests/forever/builds.test.ts` (the `DEMO_CORE` filter only), `tests/forever/ltpolicy.test.ts` |
| F-genes | A5-005 (genes builds honour the template parameters) | `src/forever/rotation-genes.ts`, `tests/forever/variant-genes.test.ts` (if F-custom added a test there, append only) |

### Wave 3 (after Wave 2 is merged; parallel)

| Fix | Findings | Files |
|---|---|---|
| F-stats | A2-007/A3-009/A4-015 (read talent constants from data; drop dead keys only if no code reads them; no value changes), A2-017, A3-019 (rename misleading identifiers) | `src/forever/stats.ts`, `src/forever/data/talents.json`, `src/forever/fight.ts` (renames only), `tests/forever/spells-stats.test.ts`, `tests/forever/talents.test.ts` |
| F-tools | A5-004 (labels), A5-010 (result headers), A5-011 (discover state/saved discovery keyed with a simulator version), A5-012 (`mobs_per_pull` param honoured by run/ep), A5-018 (display defects), A3-017 (option text) | `src/forever/duel.ts` (labels), `src/forever/ep-cli.ts`, `scripts/forever-run.ts`, `scripts/forever-duel.ts`, `scripts/forever-build.ts`, `src/forever/report.ts`, `src/forever/discover/report.ts`, `src/forever/discover/engine.ts` (state key), `src/ui/forever/SimView.tsx`, `CompareView.tsx`, `ForeverApp.tsx`, `useDiscover.ts`, matching tests |

## Expected direction of result changes (for the before/after explanation)

- F-fight A1-001/A1-002: discover mixes with mana/time conditions start behaving differently (discover output changes); filler estimates change rotation decisions for Wrack/Drain Life builds.
- F-fight A4-001: Voidwalker builds lose some kills/h (more so with 2+ mobs).
- F-runner A3-001: Demonology builds (Imp/Succubus) gain +1..+5 kills/h; Life Tap after-break and break accounting move all builds slightly.
- F-data A2-003: only levels 13, 27, 33 (and nearby) change; not in the snapshot levels 40/50/59.
- F-custom, F-settings, F-stats, F-tools: no sim number changes expected in the snapshot (custom builds and UI only).
