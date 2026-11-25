// Pure talent and demon mechanics: Demonic Brand damage, Demonic Sacrifice and Demonic Pact,
// Soul Harvest and the school multipliers. No randomness, no time; the fight loop calls these.

import { TALENT_BY_ID, type Ranks } from './talents';
import type { Params, PetKind } from './types';

export const rank = (ranks: Ranks, id: string): number => ranks[id] ?? 0;

/** A numeric effect value of a modelled talent (data in talents.json). */
export function effectNum(id: string, key: string): number {
  const v = TALENT_BY_ID.get(id)?.effect?.[key];
  if (typeof v !== 'number') throw new Error(`talent ${id} has no numeric effect ${key}`);
  return v;
}

/** Pet attacks branded by one Searing Pain: 2 per rank (6 at 3/3). */
export function brandAttacks(brandRank: number): number {
  return effectNum('demonic_brand', 'attacksPerRank') * brandRank;
}

/**
 * Demonic Brand damage per marked pet attack. Rank 3: (levelRef - 26) x 1.5 + avg(14, 17) + 0.078 x SP
 * (Wowhead, via timesaver.gg). Rank 1 reproduces the 90-93 tooltip when the level term is x1.5
 * (assumption); rank 2 is halfway (assumption). levelRef is 60 (`fixed_60`) or the caster level.
 */
export function brandDamage(level: number, spellPower: number, brandRank: number, params: Params): number {
  if (brandRank <= 0) return 0;
  const e = (k: string) => effectNum('demonic_brand', k);
  const levelRef = params.brand_scale === 'fixed_60' ? 60 : level;
  const levelTerm = Math.max(0, levelRef - e('levelBase')) * e('perLevel');
  const mult = 1 + (e('rank1Mult') - 1) * ((3 - Math.min(3, brandRank)) / 2);
  return (levelTerm * mult + (e('min') + e('max')) / 2 + e('spCoeff') * spellPower) * params.brand_mult;
}

export interface DemonState {
  /** The demon currently out, or null. */
  out: PetKind | null;
  /** The demon whose Demonic Sacrifice effect is active, or null. */
  sacrificed: PetKind | null;
}

/** Sacrifices the demon that is out: its effect starts, the slot is empty. */
export function sacrificeDemon(state: DemonState): DemonState {
  if (!state.out) return state;
  return { out: null, sacrificed: state.out };
}

/**
 * Summoning a demon. Without Demonic Pact any summon removes the Sacrifice effect; with it only
 * summoning the same demon that was sacrificed removes it.
 */
export function summonDemon(state: DemonState, kind: PetKind, hasPact: boolean): DemonState {
  const keep = hasPact && state.sacrificed !== null && state.sacrificed !== kind;
  return { out: kind, sacrificed: keep ? state.sacrificed : null };
}

/** Soul Harvest regen bonus (+100% at 2/2, linear in rank) and duration in ms. */
export function soulHarvest(ranks: Ranks): { bonus: number; durationMs: number } {
  const r = rank(ranks, 'soul_harvest');
  if (r === 0) return { bonus: 0, durationMs: 0 };
  return { bonus: effectNum('soul_harvest', 'regenBonusAtMax') * (r / 2), durationMs: effectNum('soul_harvest', 'durationMs') };
}

export interface SchoolMults {
  shadow: number;
  fire: number;
}

/**
 * Player damage multipliers by school (multiplicative, documented simplification): Shadow
 * Mastery, Demonic Sacrifice (Imp +15% shadow, Succubus +15% fire), Master Demonologist (Succubus
 * out +10% shadow, Imp out +10% fire at 5/5), Soul Link (+3%, needs the demon alive).
 */
export function schoolMults(ranks: Ranks, demons: DemonState, petAlive: boolean): SchoolMults {
  let shadow = 1 + effectNum('shadow_mastery', 'shadowDmgMultPerRank') * rank(ranks, 'shadow_mastery');
  let fire = 1;
  if (rank(ranks, 'demonic_sacrifice') > 0) {
    if (demons.sacrificed === 'imp') shadow *= 1 + effectNum('demonic_sacrifice', 'impShadowMult');
    if (demons.sacrificed === 'succubus') fire *= 1 + effectNum('demonic_sacrifice', 'succubusFireMult');
  }
  const md = rank(ranks, 'master_demonologist') / 5;
  if (md > 0 && petAlive) {
    if (demons.out === 'succubus') shadow *= 1 + effectNum('master_demonologist', 'succubusShadowMult') * md;
    if (demons.out === 'imp') fire *= 1 + effectNum('master_demonologist', 'impFireMult') * md;
  }
  if (rank(ranks, 'soul_link') > 0 && petAlive) {
    const m = 1 + effectNum('soul_link', 'dmgMult');
    shadow *= m;
    fire *= m;
  }
  return { shadow, fire };
}

/** Demonic Knowledge: spell power bonus (up to your level at 3/3) while a demon is out. */
export function demonicKnowledgeSp(level: number, ranks: Ranks, petAlive: boolean): number {
  const r = rank(ranks, 'demonic_knowledge');
  if (!petAlive || r === 0) return 0;
  return level * effectNum('demonic_knowledge', 'spBonusLevelFracAtMax') * (r / 3);
}
