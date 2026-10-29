// Core engine types shared by every later module. Framework-free: no React, no DOM.

export type School = 'physical' | 'shadow' | 'fire' | 'arcane' | 'frost' | 'nature' | 'holy';

/** Totals of the character's stats before rating conversion (gear + base + buffs). */
export interface RawStats {
  intellect: number;
  spirit: number;
  spellPower: number;
  shadowPower: number;
  firePower: number;
  critRating: number;
  hitRating: number;
  hasteRating: number;
  baseMana: number;
  mp5: number;
}

export interface SpellModifier {
  spellIds?: string[];
  schools?: School[];
  castTimeMsDelta?: number;
  manaCostMult?: number;
  damageMult?: number;
  dotDamageMult?: number;
  critPctDelta?: number;
  critMultDelta?: number;
}

export interface CharacterSetup {
  stats: RawStats;
  /** Set id -> number of pieces worn. */
  setPieces: Record<string, number>;
  /** Gear-derived modifiers (for example a meta gem's effect). */
  modifiers: SpellModifier[];
}

export interface DerivedStats {
  maxMana: number;
  power: Record<School, number>;
  critPct: number;
  hitPct: number;
  hastePct: number;
  /** Full (outside the five-second rule) spirit-based mana regeneration per second. */
  spiritRegenPerSec: number;
  mp5RegenPerSec: number;
}

export interface TargetData {
  missPct: number;
  minMissPct: number;
  /** Average damage multiplier from level-based partial resists (1 = no mitigation). */
  levelResistMult: number;
  armor: number;
}
