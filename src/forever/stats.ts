import levelsJson from './data/levels.json';
import type { Params } from './types';
import type { Ranks } from './talents';

type Pair = [number, number];
interface Anchor { level: number; hp: number; swing: number; armor: number }
const LV = levelsJson as unknown as {
  mobs: { anchors: Anchor[] };
  base: Record<string, number>;
  profiles: Record<string, Record<string, Pair> | string | boolean>;
  pets: Record<string, Record<string, unknown>>;
};

export const PROFILE_IDS: readonly string[] = ['quest', 'average', 'good'];

/** GCD in ms: fixed 1.5 s unless haste shortens it (`haste_shortens_gcd`), never below `min_gcd_ms`. */
export function gcdMs(hastePct: number, params: Params): number {
  if (!params.haste_shortens_gcd) return params.gcd_ms;
  return Math.max(params.min_gcd_ms, Math.round(params.gcd_ms / (1 + hastePct / 100)));
}

/** Cast time with haste; haste always shortens casts. */
export function hastedCastMs(baseMs: number, hastePct: number): number {
  return Math.round(baseMs / (1 + hastePct / 100));
}

/** Milliseconds of GCD a cast leaves unused: casts shorter than the GCD do not speed up the next spell. */
export function gcdWasteMs(castMs: number, gcd: number): number {
  return castMs > 0 && castMs < gcd ? gcd - castMs : 0;
}

export interface MobStats { hp: number; swing: number; armor: number }

/** Normal same-level mob; levels outside the table clamp to its ends (anchors are linearly interpolated). */
export function mobAt(level: number): MobStats {
  const a = LV.mobs.anchors;
  const first = a[0] as Anchor;
  const last = a[a.length - 1] as Anchor;
  const l = Math.min(Math.max(level, first.level), last.level);
  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i] as Anchor;
    const hi = a[i + 1] as Anchor;
    if (l >= lo.level && l <= hi.level) {
      const f = (l - lo.level) / (hi.level - lo.level);
      return { hp: lo.hp + f * (hi.hp - lo.hp), swing: lo.swing + f * (hi.swing - lo.swing), armor: lo.armor + f * (hi.armor - lo.armor) };
    }
  }
  return { hp: last.hp, swing: last.swing, armor: last.armor };
}

export interface PlayerStats {
  level: number;
  maxHp: number;
  maxMana: number;
  spellPower: number;
  spirit: number;
  critPct: number;
  hitPct: number;
  armor: number;
  foodHpPerSec: number;
  drinkManaPerSec: number;
}

const prof = (profile: string, key: string, level: number): number => {
  const p = (LV.profiles as Record<string, Record<string, Pair>>)[profile];
  if (!p || !p[key]) throw new Error(`unknown gear profile ${profile}`);
  const [at40, per] = p[key] as Pair;
  return Math.max(0, at40 + per * (level - 40));
};

/** Player stats at a level for a gear profile and talent ranks (Fel Vitality, Demonic Embrace). */
export function playerStatsFor(level: number, profile: string, ranks: Ranks): PlayerStats {
  const b = LV.base;
  const intellect = prof(profile, 'intellect', level);
  const baseMana = (b.baseManaAt40 as number) + (b.baseManaPerLevel as number) * (level - 40);
  const manaMult = 1 + 0.05 * (ranks['fel_vitality'] ?? 0);
  const hpMult = 1 + 0.015 * (ranks['demonic_embrace'] ?? 0);
  return {
    level,
    maxHp: Math.round(prof(profile, 'hp', level) * hpMult),
    maxMana: Math.round((baseMana + (b.manaPerInt as number) * (intellect - (b.intFree as number))) * manaMult),
    spellPower: prof(profile, 'spellPower', level),
    spirit: prof(profile, 'spirit', level),
    critPct: prof(profile, 'critPct', level),
    hitPct: prof(profile, 'hitPct', level),
    armor: (b.armorBase as number) + (b.armorPerLevel as number) * level,
    foodHpPerSec: (b.foodHpPerSecPerLevel as number) * level,
    drinkManaPerSec: (b.drinkManaPerSecPerLevel as number) * level,
  };
}

export function demonArmorOf(level: number, ranks: Ranks): number {
  const b = LV.base;
  const raw = (b.demonArmorBase as number) + (b.demonArmorPerLevel as number) * level;
  return raw * (1 + 0.15 * (ranks['demonic_aegis'] ?? 0));
}

/** Physical damage reduction from armor (Classic formula, capped at 75%). */
export function armorReduction(armor: number, level: number): number {
  return Math.min(0.75, armor / (armor + 400 + 85 * level));
}

/** Health Life Tap costs: rank base + Spirit term (assumed, see params life_tap_spirit_coeff). */
export function lifeTapHealthCost(rankBase: number, spirit: number, params: Params): number {
  return rankBase + params.life_tap_spirit_coeff * spirit;
}

/** Mana gained by Life Tap: health cost x conversion x (1 + Improved Life Tap). */
export function lifeTapGain(rankBase: number, spirit: number, ranks: Ranks, params: Params): number {
  return lifeTapHealthCost(rankBase, spirit, params) * params.life_tap_mana_per_health * (1 + 0.1 * (ranks['improved_life_tap'] ?? 0));
}

/** Mana regeneration per second while fighting (outside combat drinking is handled by the runner). */
export function combatRegenPerSec(spirit: number, params: Params, soulHarvestBonus: number): number {
  const base = spirit * params.spirit_regen_per_spirit;
  if (soulHarvestBonus > 0) return base * (1 + soulHarvestBonus);
  return base * params.fsr_regen_fraction;
}

export function petData(kind: string): Record<string, unknown> {
  const d = LV.pets[kind];
  if (!d) throw new Error(`unknown pet ${kind}`);
  return d;
}
