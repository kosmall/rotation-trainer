# Odkrywanie: complete selected results to level 59 (design)

Status: approved by the user (26 Nov 2026: variant B, approach 2, "tak, implementuj").

## Intent
In the Odkrywanie top 20 the user ticks some results (e.g. the first 3) and has the tool choose the
talents for the rest of the leveling path, from the found level + 1 to 59 inclusive, so each becomes
a complete build. The rotation and pets stay as found; the found points stay as they are.

## Decisions by the user
- **Variant B:** the best whole path, not the strongest build at 59. Objective: the shortest total
  leveling time from L+1 to 59 with every level weighted equally:
  `time = Σ_l 1 / kph(l)`. This is Claude's reading of "each level counts the same"; the model has
  no XP per level. It is shown as the average kills/h over those levels (harmonic mean
  `n / Σ 1/kph`).
- **Approach 2:** start from the greedy path (each level takes the point with the best kills/h at that
  level), then improve the whole sequence of points with local search. The moves are:
  - replace one point;
  - swap two points;
  - replace a block of 2–5 consecutive points with new legal points (to pay for a row gate).

  Every candidate is judged by the total time.

## Goals
- A checkbox per row (label `Uzupełnij #N`). The button `Uzupełnij do 59 (N)` uses the same Zakres
  (Pełne/Szybkie). Przerwij, progress and ETA work as for the search. Leaving the view stops it.
- Settings: those the discovery was made with (level, profile, mobs, policy, seed), not the bar's.
- A result per ticked row, under **Kompletne buildy (do 59)**:
  - the average kills/h over L+1..59 for the found path and for the greedy path, and the time saved
    vs greedy;
  - a table `Level | Talent | Kills/h`;
  - the talent trees at 59;
  - **Zapisz**, which saves a custom build with picks = found points in row order + path, the genes
    and the pets as found, named `L40→59 #1 …` (cut to 36 characters, unique).
- The last completions are kept with the saved discovery (localStorage), and they are dropped when
  a new search replaces the result.
- Work runs in the same worker pool. Each row gets one greedy task, then R local-search restarts
  (Pełne: 4 restarts, 10 sessions, 1500 simulations per row; Szybkie: 2, 4, 300), then a final
  evaluation of the best and the greedy path at 40 sessions. Common seeds within a row.
- Disabled when the result's level is 59.

## Non-goals
- Reordering the points below the found level (they stay in row order).
- A CLI command; XP-per-level weights.

## Approaches
- Chosen: greedy start + local search over the whole path (optimises the total time directly; can
  pay dead points for a row that pays off later).
- Rejected: beam search level by level (still short-sighted at row gates); strongest build at 59
  then a path to it (variant A, the user chose B).

## Left to the builder
- Move probabilities, idle limits and the restart seeds; the exact layout.
