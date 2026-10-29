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
import type { CharacterSetup, DerivedStats, RawStats } from './types';

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

/**
 * Converts raw stats to derived stats. `extra` (for example talent flat bonuses) is added to the
 * raw stats before conversion; then `setup.statMultipliers` scale total intellect and spirit, and
 * the finished mana pool (wowsims `MultiplyStat`: a multiplier applies to the stat's total,
 * unrounded). `setPieces` and `modifiers` of the setup are not used here.
 */
export function computeStats(setup: CharacterSetup, extra: Partial<RawStats> = {}): DerivedStats {
  const s = { ...setup.stats };
  for (const key of STAT_KEYS) s[key] += extra[key] ?? 0;
  const mult = setup.statMultipliers ?? {};
  s.intellect *= mult.intellect ?? 1;
  s.spirit *= mult.spirit ?? 1;

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
    hastePct: s.hasteRating / HASTE_RATING_PER_PCT,
    spiritRegenPerSec:
      SPIRIT_REGEN_BASE_PER_SEC +
      s.spirit * Math.sqrt(s.intellect) * SPIRIT_REGEN_PER_SPIRIT_SQRT_INT,
    mp5RegenPerSec: s.mp5 / MP5_INTERVAL_SEC,
  };
}
