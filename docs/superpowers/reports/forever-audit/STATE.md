# Audit STATE

Branch: claude/youthful-hopper-op9tox (merged origin/claude/peaceful-goldberg-kbrl0d at 1c6743e before the run)

## Baseline (Task 1)
- `npm ci` needed (new dependency recharts from the merge). After it: typecheck clean, `npm test` 172 files / 2172 tests green.
- Snapshot script: `scripts/forever-audit-snapshot.sh`. Flags verified with small sessions. `forever:discover --quick` also writes `reports/forever_discover_L40_quick.{md,json}`; the script copies them into the snapshot dir and restores the repo copies with `git checkout`.
- Snapshot config: seed 1, levels 40,50,59 (duels 40-59), profile average, mobs 1, sessions 100; discover level 40 quick.

## Progress
- [x] Task 1 baseline + determinism check (two runs identical except discover run-time line, now normalized) + before-snapshot
- [x] Task 2 audit wave (A1-A5 done; A1 and A5 agents hit the weekly API limit right after writing their final files, files complete)
- [x] Task 3 dedup and fix plan (fix-plan.md)
- [ ] Task 4 fix waves (wave 1 merged at d92c407: F-settings, F-custom, F-data, F-fight; wave 2 F-runner and F-genes next, then wave 3 F-stats and F-tools)
- [ ] Task 5 diff review
- [ ] Task 6 verification and report
