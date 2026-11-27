# Odkrywanie: expandable result rows (short design)

Status: approved by the user (26 Nov 2026).

- **Intent:** in the Odkrywanie top-20 table, open one result to see its whole build: the talent
  trees, the rotation and every statistic (the row shows only a few).
- **Design:** each row gets a ▸/▾ toggle (aria-expanded, label `Szczegóły #N`) in its first cell.
  An open row inserts a full-width row below with:
  1. the read-only `TalentTrees` (as in Buildy), with points per tree, free points and the
     insensitive talents;
  2. the `RotationFlow` diagram (as in Rotacje) of a variant built from the row (genes, pet, live
     sacrifice), plus the full-rotation note;
  3. a statistics table of every `CellMetrics` value with Polish labels, the CI, the gain vs the best
     known build and the nearest known build;
  4. the estimates the result leans on.

  Several rows can be open. This replaces the list of `<details>` under the table.
- **Approaches:** reuse the Buildy and Rotacje components (chosen; one look across the app). A
  separate detail page per result was rejected because it means leaving the list.
- **Non-goals:** no change to the search or to saving.
- **Builder's calls:** the layout (a grid of the three parts, wrapping on narrow screens) and the
  number formats.
