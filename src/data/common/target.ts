import type { TargetData } from '../../engine/types';

// Level 73 raid boss, attacked by a level 70 caster.
// Sources: github.com/wowsims/tbc-new (TBC Anniversary), master @ 91f869a.
export const BOSS_TARGET: TargetData = {
  // sim/core/target.go NewAttackTable: BaseSpellMissChance = UnitLevelFloat64(level, 0.02, 0.04, 0.05, 0.06, 0.17); +3 levels = 17%
  missPct: 17,
  // sim/core/spell_result.go SpellChanceToMiss: math.Max(0.01, 1-hitChance); hit cap leaves 1% miss
  minMissPct: 1,
  // sim/core/spell_resistances.go: levelBasedResist = 0.02 per level = 0.06 at +3 levels, and
  // partialResistRollThresholds(0.06) gives P(0/25/50/75% resist) = 0.8632/0.099/0.0324/0.0054,
  // whose mean damage multiplier is 0.955 (= 1 - 0.75 * 0.06). Derived from the formulas, not a literal in the repo.
  levelResistMult: 0.955,
  // sim/encounters/register_all.go: level 73 boss stats.Armor = 7685. Irrelevant to Warlock spells (non-physical).
  armor: 7685,
};
