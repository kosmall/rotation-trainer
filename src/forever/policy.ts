// The player's Life Tap and rest rules (the user's rules, 25 Nov 2026), shared by the fight (in
// combat) and the session runner (between mobs). The warlock keeps HP low on purpose: Life Tap
// converts HP into mana, and only a low HP forces a stop for food and water.

import type { Params } from './types';

const FULL = 0.995;

/**
 * Whether the player wants to Life Tap now.
 * In combat and between mobs: mana < 60% and HP > 80%, or mana < 20% and HP > 30%.
 * Between mobs only: HP at 100% and mana < 90%.
 */
export function lifeTapWanted(mana: number, maxMana: number, hp: number, maxHp: number, p: Params, betweenMobs: boolean): boolean {
  const m = mana / maxMana;
  const h = hp / maxHp;
  if (m < p.lt_combat_mana_pct && h > p.lt_combat_hp_pct) return true;
  if (m < p.lt_low_mana_pct && h > p.lt_low_hp_pct) return true;
  return betweenMobs && h >= FULL && m < p.lt_between_mana_pct;
}

/** Below this HP the player stops for food and water. */
export function needsBreak(hp: number, maxHp: number, p: Params): boolean {
  return hp / maxHp < p.break_hp_pct;
}
