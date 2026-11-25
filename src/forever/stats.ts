import baseJson from './data/classic_base.json';
import levelsJson from './data/levels.json';
import type { Params } from './types';
import type { Ranks } from './talents';

type Pair = [number, number];
interface BaseRow { hp: number; mana: number }
interface StatRow { str: number; agi: number; sta: number; int: number; spi: number }
interface MobRow { hp: number; armor: number; swing: number }
interface PetRow { hp: number; mana: number; armor: number; sta: number }
const BASE = baseJson as unknown as {
  warlock: Record<string, BaseRow>;
  gnomeWarlockBase: Record<string, StatRow>;
  mob: Record<string, MobRow>;
  pet: Record<string, Record<string, PetRow>>;
  petMeleeAvgPerSwing: Record<string, Record<string, number>>;
};
const LV = levelsJson as unknown as {
  profiles: Record<string, Record<string, Pair> | string | boolean>;
  consumables: { drink: { fromLevel: number; manaPerSec: number }[]; food: { fromLevel: number; hpPerSec: number }[] };
  demonArmor: { ranks: [number, number][] };
  pets: Record<string, Record<string, unknown>>;
};

export const PROFILE_IDS: readonly string[] = ['quest', 'average', 'good'];

const clampLevel = (level: number): string => String(Math.min(60, Math.max(20, Math.round(level))));

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

/** Normal same-level mob (WoW Classic data, classic_base.json); levels clamp to 20-60. */
export function mobAt(level: number): MobStats {
  const m = BASE.mob[clampLevel(level)] as MobRow;
  return { hp: m.hp, swing: m.swing, armor: m.armor };
}

export interface PlayerStats {
  level: number;
  maxHp: number;
  maxMana: number;
  stamina: number;
  intellect: number;
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

/** Classic Stamina to health: the first 20 points give 1 each, the rest 10 each. */
export function healthFromStamina(sta: number): number {
  return Math.min(sta, 20) + 10 * Math.max(sta - 20, 0);
}

/** Classic Intellect to mana: the first 20 points give 1 each, the rest 15 each. */
export function manaFromIntellect(int: number): number {
  return Math.min(int, 20) + 15 * Math.max(int - 20, 0);
}

function consumableRate(list: { fromLevel: number; manaPerSec?: number; hpPerSec?: number }[], level: number, key: 'manaPerSec' | 'hpPerSec'): number {
  let rate = list[0]?.[key] ?? 0;
  for (const c of list) if (level >= c.fromLevel) rate = c[key] ?? rate;
  return rate;
}

/**
 * Player stats at a level: the gnome warlock's base stats and the warlock's base health and mana
 * (WoW Classic tables), plus the gear profile, Stamina and Intellect conversion, Gnome Expansion
 * (+5% Intellect), Demonic Embrace (+3% Stamina per rank) and Fel Vitality (+5% mana per rank).
 */
export function playerStatsFor(level: number, profile: string, ranks: Ranks): PlayerStats {
  const L = clampLevel(level);
  const base = BASE.gnomeWarlockBase[L] as StatRow;
  const wl = BASE.warlock[L] as BaseRow;
  const sta = (base.sta + prof(profile, 'stamina', level)) * (1 + 0.03 * (ranks['demonic_embrace'] ?? 0));
  const int = (base.int + prof(profile, 'intellect', level)) * 1.05;
  const maxHp = Math.round(wl.hp + healthFromStamina(sta));
  const maxMana = Math.round((wl.mana + manaFromIntellect(int)) * (1 + 0.05 * (ranks['fel_vitality'] ?? 0)));
  return {
    level,
    maxHp,
    maxMana,
    stamina: sta,
    intellect: int,
    spellPower: prof(profile, 'spellPower', level),
    spirit: base.spi + prof(profile, 'spirit', level),
    critPct: prof(profile, 'critPct', level),
    hitPct: prof(profile, 'hitPct', level),
    armor: base.agi * 2 + prof(profile, 'armor', level),
    foodHpPerSec: consumableRate(LV.consumables.food, level, 'hpPerSec'),
    drinkManaPerSec: consumableRate(LV.consumables.drink, level, 'manaPerSec'),
  };
}

export function demonArmorOf(level: number, ranks: Ranks): number {
  let armor = 0;
  for (const [lv, a] of LV.demonArmor.ranks) if (level >= lv) armor = a;
  return armor * (1 + 0.15 * (ranks['demonic_aegis'] ?? 0));
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

/** Spirit mana regeneration per second outside the five-second rule: warlock (Spirit/5 + 15) per 2 s tick (Classic, cmangos). */
export function spiritManaRegenPerSec(spirit: number): number {
  return (spirit / 5 + 15) / 2;
}

/** Out-of-combat health regeneration per second: warlock (Spirit x 0.12 + 1.5) per 2 s tick (Classic, cmangos). */
export function healthRegenPerSec(spirit: number): number {
  return (spirit * 0.12 + 1.5) / 2;
}

/** Mana regeneration per second while fighting: none inside the five-second rule, doubled-or-more by Soul Harvest. */
export function combatRegenPerSec(spirit: number, params: Params, soulHarvestBonus: number): number {
  const base = spiritManaRegenPerSec(spirit);
  if (soulHarvestBonus > 0) return base * (1 + soulHarvestBonus);
  return base * params.fsr_regen_fraction;
}

export function petData(kind: string): Record<string, unknown> {
  const d = LV.pets[kind];
  if (!d) throw new Error(`unknown pet ${kind}`);
  return d;
}

export interface PetBase { hp: number; mana: number; armor: number; meleeAvg: number }

/** Pet base health (Classic pet_levelstats, +15% hotfix 10 Nov, Voidwalker +40), mana, armor and average melee swing (Classic). */
export function petBaseAt(kind: string, level: number): PetBase {
  const L = clampLevel(level);
  const row = BASE.pet[kind]?.[L] as PetRow | undefined;
  if (!row) return { hp: 0, mana: 0, armor: 0, meleeAvg: 0 };
  const hp = (row.hp + (kind === 'voidwalker' ? 40 : 0)) * (kind === 'felhunter' ? 1 : 1.15);
  return { hp, mana: row.mana, armor: row.armor, meleeAvg: BASE.petMeleeAvgPerSwing[kind]?.[L] ?? 0 };
}
