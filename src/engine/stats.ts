import {
  BASE_CRIT_PCT,
  CRIT_RATING_PER_PCT,
  HASTE_RATING_PER_PCT,
  HIT_RATING_PER_PCT,
  INT_MANA_FREE_THRESHOLD,
  INT_PER_CRIT_PCT,
  MANA_PER_INTELLECT,
  MP5_INTERVAL_SEC,
  SPIRIT_REGEN_BASE_PER_SEC,
  SPIRIT_REGEN_PER_SPIRIT_SQRT_INT,
} from '../data/common/ratings';
import type { CharacterSetup, DerivedStats, RawStats, StatMultipliers } from './types';

const STAT_KEYS: (keyof RawStats)[] = [
  'intellect',
  'spirit',
  'spellPower',
  'shadowPower',
  'firePower',
  'critRating',
  'hitRating',
  'hasteRating',
  'baseMana',
  'mp5',
];

const MULTIPLIER_KEYS: (keyof StatMultipliers)[] = ['intellect', 'spirit', 'maxMana', 'haste'];

/**
 * Combines sets of stat multipliers factor by factor (multiplicatively; an absent factor counts
 * as 1). A factor is present in the result only when some input has it.
 */
export function combineStatMultipliers(...sets: readonly (StatMultipliers | undefined)[]): StatMultipliers {
  const out: StatMultipliers = {};
  for (const m of sets) {
    if (!m) continue;
    for (const key of MULTIPLIER_KEYS) {
      const f = m[key];
      if (f !== undefined) out[key] = (out[key] ?? 1) * f;
    }
  }
  return out;
}

/**
 * Converts raw stats to derived stats. `extra` (for example talent flat bonuses) is added to the
 * raw stats before conversion; then the multipliers (`setup.statMultipliers` combined with every
 * set in `extraMultipliers`, for example active self auras') scale total intellect and spirit,
 * the finished mana pool (wowsims `MultiplyStat`: a multiplier applies to the stat's total,
 * unrounded) and the haste factor. `setPieces` and `modifiers` of the setup are not used here.
 */
export function computeStats(
  setup: CharacterSetup,
  extra: Partial<RawStats> = {},
  extraMultipliers: readonly StatMultipliers[] = [],
): DerivedStats {
  const s = { ...setup.stats };
  for (const key of STAT_KEYS) s[key] += extra[key] ?? 0;
  const mult = combineStatMultipliers(setup.statMultipliers, ...extraMultipliers);
  s.intellect *= mult.intellect ?? 1;
  s.spirit *= mult.spirit ?? 1;
  const ratingHastePct = s.hasteRating / HASTE_RATING_PER_PCT;
  const hasteFactor = mult.haste ?? 1;

  return {
    maxMana:
      (s.baseMana +
        INT_MANA_FREE_THRESHOLD +
        MANA_PER_INTELLECT * (s.intellect - INT_MANA_FREE_THRESHOLD)) *
      (mult.maxMana ?? 1),
    power: {
      physical: s.spellPower,
      shadow: s.spellPower + s.shadowPower,
      fire: s.spellPower + s.firePower,
      arcane: s.spellPower,
      frost: s.spellPower,
      nature: s.spellPower,
      holy: s.spellPower,
    },
    critPct: BASE_CRIT_PCT + s.critRating / CRIT_RATING_PER_PCT + s.intellect / INT_PER_CRIT_PCT,
    hitPct: s.hitRating / HIT_RATING_PER_PCT,
    // Haste multipliers multiply the rating's factor (wowsims tbc-new sim/core/unit.go
    // TotalSpellHasteMultiplier). Factor 1 keeps the rating percentage bit for bit.
    hastePct: hasteFactor === 1 ? ratingHastePct : ((1 + ratingHastePct / 100) * hasteFactor - 1) * 100,
    spiritRegenPerSec:
      SPIRIT_REGEN_BASE_PER_SEC +
      s.spirit * Math.sqrt(s.intellect) * SPIRIT_REGEN_PER_SPIRIT_SQRT_INT,
    mp5RegenPerSec: s.mp5 / MP5_INTERVAL_SEC,
  };
}
