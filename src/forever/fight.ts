// One pull of the leveling simulation: the player (casting, GCD, DoTs, drains), an optional demon
// and 1-3 same-level mobs on a millisecond clock. Seeded and deterministic. See docs/superpowers.

import { createRng, type Rng } from '../engine/rng';
import type { BuildVariant } from './builds';
import { ranksAt } from './builds';
import { brandAttacks, brandDamage, brandSchool, demonicKnowledgeSp, effectNum, petSchoolMult, rank as rk, schoolMults, soulHarvest, summonDemon, sacrificeDemon, type DemonState } from './effects';
import { lifeTapWanted } from './policy';
import { rotationFor, type Candidate, type RotationCtx } from './rotations';
import { estimateOf, evaluateSteps, type DataRotation, type SpecCtx } from './rotation-spec';
import { buildRotation } from './rotation-genes';
import { averageDirect, castMsOf, downrankFactor, getSpell, rankAt } from './spells';
import { armorReduction, combatRegenPerSec, demonArmorOf, demonsAt, gcdMs, gcdWasteMs, hastedCastMs, lifeTapGain, lifeTapHealthCost, mobAt, petBaseAt, petData, playerStatsFor } from './stats';
import type { Ranks } from './talents';
import type { Params, PetKind, SpellRank, StatDelta } from './types';

export interface PullConfig {
  variant: BuildVariant;
  level: number;
  profile: string;
  params: Params;
  mobs?: 1 | 2 | 3;
  /** Talent ranks override (optimizer); default: the variant's picks at the level. */
  ranks?: Ranks;
  /** A rotation given as data; default: the variant's built-in rotation code. */
  rotation?: DataRotation;
  /** Extra stats on top of the gear profile (equivalency points). */
  statDelta?: StatDelta;
  startMana?: number;
  startHp?: number;
  /** The demon's health when the pull starts (default and at most: its maximum). */
  startPetHp?: number;
  /** The demon's mana when the pull starts (default and at most: its maximum). */
  startPetMana?: number;
  /** Soul Harvest time left from the previous kill (ms), carried into this pull. */
  startSoulHarvestMs?: number;
  /** Gnome Eureka!: cooldown left (ms) and buff time left (ms) when the pull starts. */
  startEurekaCdMs?: number;
  startEurekaBuffMs?: number;
  trace?: boolean;
}

export interface PullResult {
  pullSec: number;
  mobsKilled: number;
  mobsInPull: number;
  killTimesSec: number[];
  manaSpent: number;
  manaFromLifeTap: number;
  lifeTapCount: number;
  lifeTapHpSpent: number;
  damageTaken: number;
  healed: number;
  startMana: number;
  endMana: number;
  startHp: number;
  endHp: number;
  maxMana: number;
  maxHp: number;
  gcdBusyMs: number;
  castWasteMs: number;
  castCount: number;
  petDied: boolean;
  /** The demon's health when the pull ended (0 when it died) and its maximum (0 without a demon). */
  endPetHp: number;
  petMaxHp: number;
  /** The demon's mana when the pull ended and its maximum (0 without a demon), and its kind. */
  endPetMana: number;
  petMaxMana: number;
  petKind: PetKind | null;
  playerDied: boolean;
  timedOut: boolean;
  soulHarvestProcs: number;
  /** Soul Harvest time still running when the pull ended (ms). */
  soulHarvestLeftMs: number;
  eurekaUses: number;
  /** The numbers the rotation conditions use (for the addon export): damage per second estimates and the mob health. */
  rates: { mobHp: number; fillerDps: number; petDps: number; dpsEstimate: number; dotsDps: number; drainSoulDps: number };
  /** Eureka! cooldown and buff still running when the pull ended (ms). */
  eurekaCdLeftMs: number;
  eurekaBuffLeftMs: number;
  nightfallProcs: number;
  brandHits: number;
  threatSwitches: number;
  playerDamage: number;
  petDamage: number;
  trace: string[];
}

interface Dot {
  id: string;
  spellId: string;
  school: 'shadow' | 'fire';
  aff: boolean;
  nextTickAt: number;
  tickMs: number;
  tickDmg: number;
  healFrac: number;
  /** Wall-clock time the effect was applied and the time it ends. Wrack does not change the end, only how often it ticks. */
  appliedAt: number;
  expiresAt: number;
  /** 2 while Wrack makes the periodic effect tick twice as fast. */
  speed: number;
  factors?: number[];
}

interface Mob {
  hp: number;
  maxHp: number;
  alive: boolean;
  dots: Dot[];
  curseUntil: number;
  curseVal: number;
  vulnUntil: number;
  brandCharges: number;
  brandUntil: number;
  swingAt: number;
  threatPlayer: number;
  threatPet: number;
  target: 'player' | 'pet';
}

interface CastState { spellId: string; rank: SpellRank; mob: Mob; endsAt: number; free: boolean }
interface ChannelState { spellId: string; mob: Mob; nextTickAt: number; endsAt: number; tickMs: number; tickDmg: number; healFrac: number; isDrainSoul: boolean }

/** Mana of one Voidwalker Torment (docs/forever-data-ledger.md section 1, "Pet unlock levels"). */
const TORMENT_MANA = 20;
const SOUL_SIPHON_EFFECTS = new Set(['corruption', 'siphon_life', 'bane_of_agony']);
const DRAINS = new Set(['drain_life', 'drain_soul', 'wrack']);
const NIGHTFALL_SPELLS = new Set(['corruption', 'drain_soul', 'drain_life', 'wrack']);
const AFF_SPELLS = new Set(['corruption', 'bane_of_agony', 'siphon_life', 'drain_life', 'drain_soul', 'curse_of_elements', 'wrack']);
const DESTRO_SPELLS = new Set(['shadow_bolt', 'immolate', 'searing_pain']);
// Eureka! (Wowhead Forever spell 1259821, 'Modifies' list): the spells of the model it changes.
const EUREKA_COST = new Set(['shadow_bolt', 'immolate', 'searing_pain', 'drain_life', 'drain_soul', 'wrack']);
const EUREKA_DIRECT = new Set(['shadow_bolt', 'immolate', 'searing_pain']);
const EUREKA_PERIODIC = new Set(['drain_life', 'drain_soul', 'wrack']);
const pv = (pair: unknown, level: number): number => {
  const [slope, add] = pair as [number, number];
  return slope * level + add;
};

/**
 * Demonic Energies: the share of the mana a Life Tap gives the warlock that the demon gets as well.
 * Returns the demon's mana after the tap, at most `petMaxMana` (the same value when the talent is not taken).
 * Call it only for a living demon. The fight and the runner (the Life Taps between pulls) share it.
 * @param ranks talent ranks of the build
 * @param lifeTapMana mana the warlock actually gained from the tap (after the cap at its own maximum)
 * @param petMana the demon's mana before the tap
 * @param petMaxMana the demon's maximum mana
 */
export function grantDemonicEnergiesMana(ranks: Ranks, lifeTapMana: number, petMana: number, petMaxMana: number): number {
  const r = rk(ranks, 'demonic_energies');
  if (r <= 0) return petMana;
  return Math.min(petMaxMana, petMana + lifeTapMana * effectNum('demonic_energies', 'lifeTapManaToPetPerRank') * r);
}

export function simulatePull(cfg: PullConfig, seed: number): PullResult {
  const { variant, level, params } = cfg;
  const rng: Rng = createRng(seed);
  const ranks = cfg.ranks ?? ranksAt(variant, level);
  // a rotation given as data, or the rotation composed from the variant's genes
  const dataRotationCfg = cfg.rotation ?? (variant.genes ? buildRotation(variant.genes, params) : undefined);
  const stats = playerStatsFor(level, cfg.profile, ranks, cfg.statDelta);
  const nMobs = cfg.mobs ?? params.mobs_per_pull;
  const mobBase = mobAt(level);
  const trace: string[] = [];
  const log = (t: number, msg: string): void => {
    if (cfg.trace) trace.push(`${(t / 1000).toFixed(2)}s ${msg}`);
  };

  // ---- demons -------------------------------------------------------------------------
  const hasPact = rk(ranks, 'demonic_pact') > 0;
  let demons: DemonState = { out: null, sacrificed: null };
  // before the build's own demon is learned another one stands in (a warlock never levels without a demon)
  const own = demonsAt(variant, level, nMobs);
  if (own.sacrificed && rk(ranks, 'demonic_sacrifice') > 0) {
    demons = sacrificeDemon({ out: own.sacrificed, sacrificed: null });
  }
  if (own.pet) demons = summonDemon(demons, own.pet, hasPact);
  const petKind: PetKind | null = demons.out;
  const pd = petKind ? petData(petKind) : null;
  let petAlive = petKind !== null;

  const petHpMult = (1 + effectNum('fel_vitality', 'petHpManaPerRank') * rk(ranks, 'fel_vitality'));
  const petBase = petKind ? petBaseAt(petKind, level) : { hp: 0, mana: 0, armor: 0, meleeAvg: 0 };
  const pet = {
    // Forever: +2 health per point of the master's Stamina (Blizzard, 3 Nov), on top of the base health.
    maxHp: pd ? (petBase.hp + 2 * stats.stamina) * petHpMult : 0,
    hp: 0,
    mana: pd ? petBase.mana * (1 + effectNum('fel_vitality', 'petHpManaPerRank') * rk(ranks, 'fel_vitality')) : 0,
    nextAct: 0,
    nextLash: 0,
    nextTorment: 0,
    armor: petBase.armor,
  };
  pet.hp = Math.min(pet.maxHp, cfg.startPetHp ?? pet.maxHp);
  const petMaxMana = pet.mana;
  pet.mana = Math.min(petMaxMana, cfg.startPetMana ?? petMaxMana);
  const soulLink = rk(ranks, 'soul_link') > 0;
  // Talents that raise everything the demon does, the brand included (pet_dmg_mult is only for the estimated pet tables).
  const petTalentMult = (1 + effectNum('unholy_power', 'petDmgMultPerRank') * rk(ranks, 'unholy_power')) * (soulLink ? 1 + effectNum('soul_link', 'dmgMult') : 1);
  const petDmgMult = petTalentMult * params.pet_dmg_mult;
  const petMd = (school: 'shadow' | 'fire'): number => (petKind ? petSchoolMult(ranks, petKind, school) : 1);

  // ---- player ---------------------------------------------------------------------------
  const maxMana = stats.maxMana;
  const maxHp = stats.maxHp;
  let mana = Math.min(maxMana, cfg.startMana ?? maxMana * params.rest_to_mana_pct);
  let hp = Math.min(maxHp, cfg.startHp ?? maxHp * params.rest_to_hp_pct);
  const startMana = mana;
  const startHp = hp;
  const playerArmor = stats.armor + demonArmorOf(level, ranks);
  const gcd = gcdMs(params.haste_pct, params);
  const sh = soulHarvest(ranks);

  const mobs: Mob[] = [];
  for (let i = 0; i < nMobs; i++) {
    const hpv = mobBase.hp * params.mob_hp_mult;
    mobs.push({
      hp: hpv, maxHp: hpv, alive: true, dots: [], curseUntil: 0, curseVal: 0, vulnUntil: 0, brandCharges: 0, brandUntil: 0,
      swingAt: Math.round(params.mob_swing_sec * 1000 * (0.5 + 0.1 * i)), threatPlayer: 0,
      threatPet: petAlive && params.pet_opens ? params.pet_initial_threat_per_level * level : 0,
      target: petAlive && params.pet_opens ? 'pet' : 'player',
    });
  }

  let t = 0;
  let gcdUntil = 0;
  let waitUntil = 0;
  let cast = null as CastState | null;
  let channel = null as ChannelState | null;
  let trance = false;
  let busyEnd = 0;
  /** Gives back the busy time that a cancelled cast or channel will not use. */
  const cutBusy = (): void => {
    const over = Math.max(0, busyEnd - t);
    res.gcdBusyMs -= over;
    busyEnd = t;
  };
  let shUntil = cfg.startSoulHarvestMs ?? 0;
  let eurekaUntil = cfg.startEurekaBuffMs ?? 0;
  let eurekaReadyAt = cfg.startEurekaCdMs ?? 0;
  const eurekaOn = (): boolean => t < eurekaUntil;
  let res: PullResult = {
    pullSec: 0, mobsKilled: 0, mobsInPull: nMobs, killTimesSec: [], manaSpent: 0, manaFromLifeTap: 0, lifeTapCount: 0, lifeTapHpSpent: 0, damageTaken: 0, healed: 0,
    startMana, endMana: 0, startHp, endHp: 0, maxMana, maxHp, gcdBusyMs: 0, castWasteMs: 0, castCount: 0, petDied: false, endPetHp: 0, petMaxHp: pet.maxHp, endPetMana: 0, petMaxMana, petKind, playerDied: false, timedOut: false,
    soulHarvestProcs: 0, soulHarvestLeftMs: 0, eurekaUses: 0, eurekaCdLeftMs: 0, eurekaBuffLeftMs: 0, rates: { mobHp: 0, fillerDps: 0, petDps: 0, dpsEstimate: 0, dotsDps: 0, drainSoulDps: 0 }, nightfallProcs: 0, brandHits: 0, threatSwitches: 0, playerDamage: 0, petDamage: 0, trace,
  };

  const firstAlive = (): Mob | undefined => mobs.find((m) => m.alive);
  const spEff = (spellId?: string): number => stats.spellPower + demonicKnowledgeSp(level, ranks, petAlive) + (spellId !== undefined && getSpell(spellId).school === 'shadow' ? params.shadow_spell_power_bonus : 0);
  const mults = () => schoolMults(ranks, demons, petAlive);

  /** Curse of the Elements raises all magic damage the target takes, the demon's too. */
  const curseMult = (m: Mob): number => (t < m.curseUntil ? 1 + m.curseVal : 1);
  const targetMult = (m: Mob, school: 'shadow' | 'fire'): number => {
    let x = curseMult(m);
    if (school === 'shadow' && t < m.vulnUntil) x *= 1 + effectNum('improved_shadow_bolt', 'shadowTakenPerRank') * rk(ranks, 'improved_shadow_bolt');
    return x;
  };

  const coeffMult = (spellId: string, r: SpellRank): number => {
    if (spellId !== 'shadow_bolt') return 1;
    if (r.rank === 1) return params.sb_r1_coeff_mult;
    if (r.rank === 2) return params.sb_r2_coeff_mult;
    return 1;
  };

  const critPct = (spellId: string): number => {
    let c = stats.critPct;
    if (getSpell(spellId).school === 'shadow') c += effectNum('malevolence', 'critPctPerRank') * rk(ranks, 'malevolence');
    if (spellId === 'searing_pain') c += 100 * effectNum('agonizing_flames', 'critDmgPctAtMax') * (rk(ranks, 'agonizing_flames') / 3);
    return c;
  };
  const critMult = (spellId: string, periodic: boolean): number => {
    let bonus = params.base_crit_mult - 1;
    if (periodic) bonus *= 1 + effectNum('pandemic', 'critBonusAtMax') * (rk(ranks, 'pandemic') / 3);
    if (DESTRO_SPELLS.has(spellId) && !periodic) bonus *= 1 + effectNum('ruin', 'critBonusPerRank') * rk(ranks, 'ruin');
    return 1 + bonus;
  };
  const missPct = (spellId: string): number => {
    const m = params.mob_miss_pct - stats.hitPct - effectNum('suppression', 'hitPctPerRank') * rk(ranks, 'suppression');
    return Math.max(1, m);
  };

  // ---- threat -------------------------------------------------------------------------------
  const reevaluate = (m: Mob): void => {
    if (!m.alive) return;
    if (!petAlive) {
      m.target = 'player';
      return;
    }
    const petRanged = petKind === 'imp';
    if (m.target === 'pet' && m.threatPlayer > m.threatPet * params.threat_overtake_ranged) {
      m.target = 'player';
      res.threatSwitches++;
      log(t, 'mob switches to player');
    } else if (m.target === 'player' && m.threatPet > m.threatPlayer * (petRanged ? params.threat_overtake_ranged : params.threat_overtake_melee)) {
      m.target = 'pet';
    }
  };

  // ---- damage and death ---------------------------------------------------------------------
  const healPlayer = (amount: number): void => {
    const gain = Math.min(amount, maxHp - hp);
    if (gain > 0) {
      hp += gain;
      res.healed += gain;
    }
  };

  const killMob = (m: Mob): void => {
    m.alive = false;
    m.dots = [];
    res.mobsKilled++;
    res.killTimesSec.push(t / 1000);
    log(t, 'mob dies');
    if (channel && channel.mob === m) {
      if (channel.isDrainSoul && sh.bonus > 0) {
        shUntil = t + sh.durationMs;
        res.soulHarvestProcs++;
        log(t, 'Soul Harvest');
      }
      channel = null;
      cutBusy();
    }
    if (cast && cast.mob === m) {
      cast = null;
      cutBusy();
    }
  };

  const dealToMob = (m: Mob, amount: number, fromPlayer: boolean, threatMult: number): void => {
    if (!m.alive) return;
    m.hp -= amount;
    if (fromPlayer) {
      res.playerDamage += amount;
      m.threatPlayer += amount * threatMult;
      const heal = effectNum('demonic_energies', 'petHealFracAtMax') * (rk(ranks, 'demonic_energies') / 2);
      if (heal > 0 && petAlive) pet.hp = Math.min(pet.maxHp, pet.hp + amount * heal);
    } else {
      res.petDamage += amount;
      m.threatPet += amount * threatMult;
    }
    if (m.hp <= 0) killMob(m);
    else reevaluate(m);
  };

  // ---- spell numbers ------------------------------------------------------------------------
  const aftermathMult = (spellId: string): number => {
    let m = 1;
    if (DESTRO_SPELLS.has(spellId)) m *= 1 + effectNum('agonizing_flames', 'destroDmgAtMax') * (rk(ranks, 'agonizing_flames') / 3);
    return m;
  };

  const directBase = (spellId: string, r: SpellRank): number => {
    const spell = getSpell(spellId);
    const coeff = (r.coeff ?? spell.coeffDirect ?? 0) * coeffMult(spellId, r);
    let base = averageDirect(r) + spEff(spellId) * coeff * downrankFactor(params.downrank_penalty_model, r.level);
    base *= aftermathMult(spellId);
    if (spellId === 'immolate') base *= 1 + effectNum('aftermath', 'immolateInitialDmgPerRank') * rk(ranks, 'aftermath');
    return base;
  };

  /** Base damage of one tick (talents of the spell applied, school and target multipliers not), the tick spacing and the tick count. */
  const dotTickBase = (spellId: string, r: SpellRank): { tickDmg: number; tickMs: number; ticks: number } => {
    const spell = getSpell(spellId);
    const tickMs = spell.tickMs ?? 3000;
    const durationMs = r.durationMs ?? spell.channelMs ?? spell.durationMs ?? 0;
    const ticks = Math.max(1, Math.round(durationMs / tickMs));
    let tick: number;
    if (spellId === 'wrack') {
      // Blizzard dev notes (3 Nov): base damage per second 36 at level 40, +2.5 per level; coefficient 0.286 per tick; hotfix 10 Nov: -30%.
      const base = (r.baseAt40 ?? 0) + (r.perLevel ?? 0) * (level - 40);
      tick = (base + spEff(spellId) * (spell.coeffTick ?? 0)) * (r.hotfixMult ?? 1) * params.wrack_dmg_mult;
    } else {
      tick = (r.tickDmg ?? 0) + spEff(spellId) * (spell.coeffTick ?? 0) * downrankFactor(params.downrank_penalty_model, r.level);
    }
    if (spellId === 'corruption') tick *= 1 + effectNum('improved_corruption', 'dmgMultPerRank') * rk(ranks, 'improved_corruption');
    if (spellId === 'bane_of_agony') tick *= (1 + effectNum('improved_bane_of_agony', 'dmgMultPerRank') * rk(ranks, 'improved_bane_of_agony'));
    if (spellId === 'drain_life' || spellId === 'drain_soul') tick *= (1 + effectNum('improved_drains', 'drainDmgMultAtMax') * (rk(ranks, 'improved_drains') / 3)) * params.drain_dmg_mult;
    if (spellId === 'immolate') tick *= aftermathMult('immolate');
    return { tickDmg: tick, tickMs, ticks };
  };

  const effectsOn = (m: Mob): number => m.dots.filter((d) => SOUL_SIPHON_EFFECTS.has(d.id) && dotActive(d)).length;
  const soulSiphon = (m: Mob): number => {
    const r = rk(ranks, 'soul_siphon');
    if (r === 0) return 1;
    return 1 + effectNum('soul_siphon', 'perEffectPerRank') * r * Math.min(effectNum('soul_siphon', 'maxEffects'), effectsOn(m));
  };

  const tickDamage = (m: Mob, spellId: string, school: 'shadow' | 'fire', base: number, drain: boolean): number => {
    let d = base * (school === 'shadow' ? mults().shadow : mults().fire) * targetMult(m, school);
    if (drain && DRAINS.has(spellId)) d *= soulSiphon(m);
    if (EUREKA_PERIODIC.has(spellId) && eurekaOn()) d *= 1 + params.eureka_mod;
    const crit = rng.next() * 100 < critPct(spellId);
    if (crit) d *= critMult(spellId, true);
    log(t, `tick ${spellId} ${Math.round(d)}${crit ? ' CRIT' : ''}`);
    return d;
  };

  const maybeNightfall = (spellId: string): void => {
    const r = rk(ranks, 'nightfall');
    if (r > 0 && NIGHTFALL_SPELLS.has(spellId) && rng.next() < effectNum('nightfall', 'procPerTickPerRank') * r) {
      trance = true;
      res.nightfallProcs++;
      log(t, 'Nightfall proc');
    }
  };

  const spellThreat = (spellId: string): number => {
    if (spellId !== 'searing_pain') return 1;
    const cut = effectNum('demonic_brand', 'spThreatMult') * (rk(ranks, 'demonic_brand') / 3);
    return params.searing_pain_threat_mult * (1 - cut);
  };

  // ---- cast resolution ----------------------------------------------------------------------
  const manaCost = (spellId: string, r: SpellRank, eurekaStarts = false): number => {
    let c = r.mana;
    if (DESTRO_SPELLS.has(spellId)) c *= 1 - effectNum('cataclysm', 'destroManaCostReduceAtMax') * (rk(ranks, 'cataclysm') / 3);
    if (EUREKA_COST.has(spellId) && (eurekaOn() || eurekaStarts)) c *= 1 - params.eureka_mod;
    return Math.round(c);
  };

  /** A tick due at the expiry moment still lands; float slack for the halved spacing under Wrack. */
  const DOT_EPS_MS = 1e-6;
  const dotActive = (d: Dot): boolean => t < d.expiresAt + DOT_EPS_MS && d.nextTickAt <= d.expiresAt + DOT_EPS_MS;

  const applyDot = (m: Mob, spellId: string, r: SpellRank): void => {
    const spell = getSpell(spellId);
    const b = dotTickBase(spellId, r);
    const factors = spellId === 'bane_of_agony' && params.agony_ramp === 'classic_thirds' ? spell.rampFactors : undefined;
    const speed = channel && channel.spellId === 'wrack' && channel.mob === m && (getSpell('wrack').accelerates ?? []).includes(spellId) ? 2 : 1;
    m.dots = m.dots.filter((d) => d.id !== spellId);
    m.dots.push({ id: spellId, spellId, school: spell.school, aff: AFF_SPELLS.has(spellId), nextTickAt: t + b.tickMs / speed, tickMs: b.tickMs, tickDmg: b.tickDmg, healFrac: spell.healFrac ?? 0, appliedAt: t, expiresAt: t + b.ticks * b.tickMs, speed, factors });
  };

  /**
   * Wrack: the target's Siphon Life, Corruption and Bane of Agony tick `to` times as fast. Blizzard (hotfix 10 Nov 2026):
   * "Wrack speeds up how often your periodic effects deal damage, not how long they last" and "the time it skips is kept
   * after Wrack's channel ends": the remaining time to the next tick scales, the expiry stays, so the effect gains ticks.
   * A next tick that would land after the expiry is lost (the effect ends without it).
   */
  const setDotSpeed = (m: Mob, to: number): void => {
    for (const d of m.dots) {
      if (!(getSpell('wrack').accelerates ?? []).includes(d.id) || d.speed === to) continue;
      d.nextTickAt = t + ((d.nextTickAt - t) * d.speed) / to;
      d.speed = to;
    }
    m.dots = m.dots.filter(dotActive);
  };

  const brandHit = (m: Mob): void => {
    if (m.brandCharges > 0 && t < m.brandUntil) {
      m.brandCharges--;
      res.brandHits++;
      const d = brandDamage(level, spEff(), rk(ranks, 'demonic_brand'), params) * petTalentMult * (petKind ? petMd(brandSchool(petKind)) : 1) * curseMult(m);
      log(t, `pet brand ${d.toFixed(3)}`);
      dealToMob(m, d, false, 1);
    }
  };

  const resolveCast = (spellId: string, r: SpellRank, m: Mob): void => {
    const spell = getSpell(spellId);
    if (!m.alive) return;
    const missed = rng.next() * 100 < missPct(spellId);
    log(t, `${spellId} r${r.rank} ${missed ? 'MISS' : 'lands'}`);
    if (missed) return;
    if (spell.kind === 'direct' || spell.kind === 'direct+dot') {
      let d = directBase(spellId, r) * (spell.school === 'shadow' ? mults().shadow : mults().fire) * targetMult(m, spell.school);
      if (EUREKA_DIRECT.has(spellId) && eurekaOn()) d *= 1 + params.eureka_mod;
      const crit = rng.next() * 100 < critPct(spellId);
      if (crit) d *= critMult(spellId, false);
      if (spellId === 'shadow_bolt' && crit && rk(ranks, 'improved_shadow_bolt') > 0) {
        m.vulnUntil = t + effectNum('improved_shadow_bolt', 'durationMs');
      }
      if (spellId === 'searing_pain' && rk(ranks, 'demonic_brand') > 0) {
        m.brandCharges = brandAttacks(rk(ranks, 'demonic_brand'));
        m.brandUntil = t + effectNum('demonic_brand', 'durationMs');
      }
      dealToMob(m, d, true, spellThreat(spellId));
      if (spell.kind === 'direct+dot' && m.alive) applyDot(m, spellId, r);
    } else if (spell.kind === 'dot') {
      applyDot(m, spellId, r);
    } else if (spell.kind === 'curse') {
      m.curseUntil = t + (spell.durationMs ?? 0);
      m.curseVal = r.damageTaken ?? 0;
    } else if (spell.kind === 'channel') {
      const b = dotTickBase(spellId, r);
      const durationMs = b.ticks * b.tickMs;
      channel = { spellId, mob: m, nextTickAt: t + b.tickMs, endsAt: t + durationMs, tickMs: b.tickMs, tickDmg: b.tickDmg, healFrac: spell.healFrac ?? 0, isDrainSoul: spellId === 'drain_soul' };
      res.gcdBusyMs += Math.max(0, durationMs - gcd);
      busyEnd = t + Math.max(durationMs, gcd);
      if (spellId === 'wrack') setDotSpeed(m, 2);
    }
  };

  const lifeTap = (safetyHpPct: number): boolean => {
    const r = rankAt('life_tap', 'max', level);
    if (!r) return false;
    const cost = lifeTapHealthCost(r.base ?? 0, stats.spirit, params);
    const gain = lifeTapGain(r.base ?? 0, stats.spirit, ranks, params);
    if (hp - cost < maxHp * safetyHpPct || mana >= maxMana) return false;
    const got = Math.min(gain, maxMana - mana);
    mana += got;
    hp -= cost;
    res.manaFromLifeTap += got;
    res.lifeTapCount++;
    res.lifeTapHpSpent += cost;
    if (petAlive) pet.mana = grantDemonicEnergiesMana(ranks, got, pet.mana, petMaxMana);
    gcdUntil = t + gcd;
    res.gcdBusyMs += gcd;
    busyEnd = t + gcd;
    log(t, `Life Tap +${Math.round(got)} mana`);
    return true;
  };

  const known = (spellId: string): boolean => {
    const s = getSpell(spellId);
    if (s.teachesTalent && rk(ranks, s.teachesTalent) === 0) return false;
    return rankAt(spellId, 'max', level) !== undefined;
  };

  const petRank = (ranksList: unknown): { level: number; mana: number; dmg: number; coeff: number } | undefined => {
    const list = ranksList as { level: number; mana: number; dmg: number; coeff: number }[];
    let best: (typeof list)[number] | undefined;
    for (const r of list) if (r.level <= level) best = r;
    return best;
  };
  // ---- estimates for rotation rules ---------------------------------------------------------
  const est = dataRotationCfg?.estimate ?? estimateOf(variant, params);
  const fillerRank = (): { id: string; r: SpellRank } => {
    const id = est.filler === 'wrack' && !known('wrack') ? 'shadow_bolt' : est.filler;
    const r = rankAt(id, id === 'shadow_bolt' ? est.fillerRank : 'max', level) ?? (rankAt('shadow_bolt', 'max', level) as SpellRank);
    return { id, r };
  };
  const fillerCastMs = (id: string, r: SpellRank): number => Math.max(gcd, hastedCastMs(castMsOf(getSpell(id), r, rk(ranks, 'bane'), params), params.haste_pct));
  const expectedDirect = (id: string, r: SpellRank): number => {
    const spell = getSpell(id);
    if (spell.kind === 'channel') {
      const b = dotTickBase(id, r);
      return b.tickDmg * b.ticks * mults().shadow;
    }
    const c = critPct(id) / 100;
    return directBase(id, r) * (spell.school === 'shadow' ? mults().shadow : mults().fire) * (1 + c * (critMult(id, false) - 1));
  };
  const estPetDps = (): number => {
    if (!pd || !petAlive) return 0;
    if (petKind === 'imp') {
      const fr = petRank(pd.fireboltRanks);
      return fr ? ((fr.dmg + demonicKnowledgeSp(level, ranks, true) * fr.coeff) * petDmgMult * petMd('fire')) / ((pd.fireboltCastMs as number) / 1000) : 0;
    }
    return (petBase.meleeAvg / ((pd.swingMs as number) / 1000)) * petDmgMult * params.pet_hit_chance;
  };
  const estDps = (): number => {
    const f = fillerRank();
    return expectedDirect(f.id, f.r) / (fillerCastMs(f.id, f.r) / 1000) * 0.9 + estPetDps();
  };
  const dpsEstimate = estDps();
  {
    // Rates behind the rotation conditions (`estTtkSec`, `drainSoulKillSec`), with every DoT on the target.
    const f = fillerRank();
    const sh = mults().shadow;
    let dots = 0;
    const dotSpells = est.dotSpells;
    for (const id of dotSpells) {
      const r = known(id) ? rankAt(id, 'max', level) : undefined;
      if (r) {
        const b = dotTickBase(id, r);
        dots += (b.tickDmg * sh) / (b.tickMs / 1000);
      }
    }
    const dsr = known('drain_soul') ? rankAt('drain_soul', 'max', level) : undefined;
    let ds = 0;
    if (dsr) {
      const b = dotTickBase('drain_soul', dsr);
      ds = ((b.tickDmg * sh) / (b.tickMs / 1000)) * (1 + effectNum('soul_siphon', 'perEffectPerRank') * rk(ranks, 'soul_siphon') * Math.min(effectNum('soul_siphon', 'maxEffects'), 3));
    }
    res.rates = { mobHp: mobBase.hp * params.mob_hp_mult, fillerDps: (expectedDirect(f.id, f.r) / (fillerCastMs(f.id, f.r) / 1000)) * 0.9, petDps: estPetDps(), dpsEstimate, dotsDps: dots, drainSoulDps: ds };
  }

  // ---- rotation context ---------------------------------------------------------------------
  const dataRotation = dataRotationCfg;
  const rotation: (ctx: RotationCtx) => Candidate[] = dataRotation ? (ctx) => evaluateSteps(dataRotation, ctx) : rotationFor(variant.rotation);
  const makeCtx = (m: Mob): SpecCtx => ({
    params, variant, mobsInPull: nMobs, petAlive, hasShadowTrance: trance, hpPct: (hp / maxHp) * 100,
    // the facts the second-filler conditions read ("mana below 30 / 50 %", "fight longer than 20 s"); without them they could never hold
    manaPct: (mana / maxMana) * 100, combatSec: t / 1000,
    known, talentRank: (id) => rk(ranks, id),
    targetHasDot: (id) => m.dots.some((d) => d.id === id && dotActive(d)),
    targetDotRemainingMs: (id) => { const d = m.dots.find((x) => x.id === id && dotActive(x)); return d ? Math.max(0, d.expiresAt - t) : 0; },
    targetHasCurse: () => t < m.curseUntil,
    targetBrandRemainingMs: () => Math.max(0, m.brandUntil - t),
    targetBrandCharges: () => m.brandCharges,
    targetHp: () => m.hp,
    estTtkSec: () => m.hp / Math.max(1, dpsEstimate),
    drainSoulKillSec: () => {
      const r = rankAt('drain_soul', 'max', level);
      if (!r) return Infinity;
      const bgDots = m.dots.reduce((a, d) => (dotActive(d) ? a + (d.tickDmg * (d.factors ? 1 : 1) * (d.school === 'shadow' ? mults().shadow : mults().fire)) / (d.tickMs / d.speed / 1000) : a), 0);
      const b = dotTickBase('drain_soul', r);
      const dsDps = (b.tickDmg * mults().shadow * soulSiphon(m)) / (b.tickMs / 1000);
      const total = bgDots + estPetDps() + dsDps;
      return total > 0 ? m.hp / total : Infinity;
    },
    drainSoulExpected: () => {
      const r = rankAt('drain_soul', 'max', level);
      return r ? expectedDirect('drain_soul', r) * soulSiphon(m) : 0;
    },
    fillerExpected: () => {
      const f = fillerRank();
      return expectedDirect(f.id, f.r);
    },
  });

  const startCast = (c: Candidate, m: Mob): boolean => {
    const spell = getSpell(c.spellId);
    const r = rankAt(c.spellId, c.rankWant, level);
    if (!r) return false;
    const free = trance && c.spellId === 'shadow_bolt';
    // Eureka! is spent only on a cast that really starts; the cost is checked with the discount it would give.
    const eureka = eurekaWanted(c, m);
    const cost = manaCost(c.spellId, r, eureka);
    if (mana < cost) return false;
    if (eureka) startEureka();
    if (free) trance = false;
    mana -= cost;
    res.manaSpent += cost;
    res.castCount++;
    let castMs = 0;
    if (!free && (spell.baseCastMs !== undefined || r.castMs !== undefined)) {
      const ic = c.spellId === 'corruption' ? effectNum('improved_corruption', 'castMsReducePerRank') * rk(ranks, 'improved_corruption') : 0;
      castMs = hastedCastMs(castMsOf(spell, r, rk(ranks, 'bane'), params, ic), params.haste_pct);
    }
    gcdUntil = t + gcd;
    res.castWasteMs += gcdWasteMs(castMs, gcd);
    res.gcdBusyMs += Math.max(castMs, gcd);
    busyEnd = t + Math.max(castMs, gcd);
    log(t, `cast ${c.spellId} r${r.rank} (${castMs} ms${free ? ', trance' : ''})`);
    if (castMs === 0) resolveCast(c.spellId, r, m);
    else cast = { spellId: c.spellId, rank: r, mob: m, endsAt: t + castMs, free };
    return true;
  };

  /** Gnome Eureka!: instant, off the GCD; the policy decides whether the cast about to start suits it. */
  const eurekaWanted = (c: Candidate, m: Mob): boolean => {
    const pol = params.eureka_policy;
    if (pol === 'off' || t < eurekaReadyAt || eurekaOn()) return false;
    const affected = EUREKA_COST.has(c.spellId);
    if (pol === 'pull_start') return true;
    if (pol === 'first_affected') return affected;
    if (pol === 'filler') return c.spellId === fillerRank().id;
    if (pol === 'delay') return affected && t >= params.eureka_delay_sec * 1000;
    if (pol === 'ttk') return affected && m.hp / Math.max(1, dpsEstimate) <= params.eureka_dur_sec;
    return false;
  };
  const startEureka = (): void => {
    eurekaUntil = t + params.eureka_dur_sec * 1000;
    eurekaReadyAt = t + params.eureka_cd_sec * 1000;
    res.eurekaUses++;
    log(t, 'Eureka!');
  };

  const decide = (): void => {
    const m = firstAlive();
    if (!m) return;
    if (known('life_tap') && lifeTapWanted(mana, maxMana, hp, maxHp, params, false) && lifeTap(params.lt_safety_hp_pct)) return;
    for (const c of rotation(makeCtx(m))) {
      if (startCast(c, m)) return;
    }
    // Emergency: nothing is affordable, so Life Tap down to the safety floor even below the usual HP rule (otherwise the warlock idles).
    if (params.sb_filler_lifetap_when_oom && known('life_tap') && lifeTap(params.lt_safety_hp_pct)) return;
    waitUntil = t + 300;
  };

  // ---- pet actions --------------------------------------------------------------------------
  if (petAlive) {
    pet.nextAct = 1000;
    pet.nextLash = 0;
    pet.nextTorment = 3000;
  }
  const petAct = (): void => {
    const m = firstAlive();
    if (!m || !pd || !petKind) return;
    const mobArmorRed = armorReduction(mobBase.armor, level);
    const dk = demonicKnowledgeSp(level, ranks, true);
    if (petKind === 'imp') {
      const fr = petRank(pd.fireboltRanks);
      if (fr && pet.mana >= fr.mana) {
        pet.mana -= fr.mana;
        if (rng.next() < params.pet_hit_chance) {
          const d = (fr.dmg + dk * fr.coeff) * petDmgMult * petMd('fire') * (1 + effectNum('improved_imp', 'fireboltDmgPerRank') * rk(ranks, 'improved_imp')) * curseMult(m);
          log(t, `pet firebolt ${d.toFixed(3)}`);
          dealToMob(m, d, false, 1);
          if (m.alive) brandHit(m);
        }
      }
      pet.nextAct = t + (pd.fireboltCastMs as number);
      return;
    }
    if (rng.next() < params.pet_hit_chance) {
      const d = petBase.meleeAvg * (1 - mobArmorRed) * petDmgMult;
      log(t, `pet melee ${d.toFixed(3)}`);
      dealToMob(m, d, false, 1);
      if (m.alive) brandHit(m);
    }
    pet.nextAct = t + (pd.swingMs as number);
  };
  const petLash = (): void => {
    const m = firstAlive();
    if (!m || petKind !== 'succubus' || !pd) {
      pet.nextLash = Infinity;
      return;
    }
    const lr = petRank(pd.lashRanks);
    if (lr && pet.mana >= lr.mana) {
      pet.mana -= lr.mana;
      const d = (lr.dmg + demonicKnowledgeSp(level, ranks, true) * lr.coeff) * petDmgMult * petMd('shadow') * (1 + effectNum('improved_sayaad', 'lashMultPerRank') * rk(ranks, 'improved_sayaad')) * curseMult(m);
      log(t, `pet lash ${d.toFixed(3)}`);
      dealToMob(m, d, false, 1);
      if (m.alive) brandHit(m);
    }
    pet.nextLash = t + (pd.lashCdMs as number);
  };

  const petDies = (): void => {
    petAlive = false;
    res.petDied = true;
    log(t, 'pet dies');
    for (const m of mobs) if (m.alive) m.target = 'player';
  };

  const mobSwing = (m: Mob): void => {
    const swing = mobBase.swing * params.mob_dmg_mult;
    m.swingAt += Math.round(params.mob_swing_sec * 1000);
    if (m.target === 'pet' && petAlive) {
      const red = armorReduction(pet.armor, level) + (petKind === 'voidwalker' ? effectNum('master_demonologist', 'voidwalkerPhysReduce') * (rk(ranks, 'master_demonologist') / 5) : 0);
      pet.hp -= swing * (1 - Math.min(0.9, red));
      if (pet.hp <= 0) petDies();
      return;
    }
    let dmg = swing * (1 - armorReduction(playerArmor, level));
    if (soulLink && petAlive) {
      const share = dmg * effectNum('soul_link', 'petShare');
      dmg -= share;
      pet.hp -= share;
      if (pet.hp <= 0) petDies();
    }
    hp -= dmg;
    res.damageTaken += dmg;
    if (cast) {
      cast.endsAt += params.pushback_ms;
      // The GCD already covers the first part of a short cast: only the time past the old busy end is new.
      const newBusyEnd = Math.max(busyEnd, cast.endsAt);
      res.gcdBusyMs += newBusyEnd - busyEnd;
      busyEnd = newBusyEnd;
    }
    else if (channel && rng.next() >= effectNum('fel_concentration', 'noPushbackChanceAtMax') * (rk(ranks, 'fel_concentration') / 3)) {
      channel.endsAt -= channel.tickMs;
      const newBusyEnd = Math.max(t, busyEnd - channel.tickMs);
      res.gcdBusyMs -= busyEnd - newBusyEnd;
      busyEnd = newBusyEnd;
      if (channel.endsAt <= t) {
        // The pushback took the rest of the channel: it ends now, with the ticks it already delivered (no extra tick at the hit).
        log(t, `${channel.spellId} channel cut`);
        if (channel.spellId === 'wrack') setDotSpeed(channel.mob, 1);
        channel = null;
        cutBusy();
      } else if (channel.endsAt <= channel.nextTickAt) channel.nextTickAt = Math.min(channel.nextTickAt, channel.endsAt);
    }
  };

  // ---- main loop ----------------------------------------------------------------------------
  const limitMs = params.pull_time_limit_sec * 1000;
  const sacManaPerMs = demons.sacrificed === 'voidwalker' && rk(ranks, 'demonic_sacrifice') > 0 ? (effectNum('demonic_sacrifice', 'voidwalkerManaPctPer4s') * maxMana) / 4000 : 0;
  const sacHealPerMs = demons.sacrificed === 'felhunter' && rk(ranks, 'demonic_sacrifice') > 0 ? (effectNum('demonic_sacrifice', 'felhunterHealPctPer4s') * maxHp) / 4000 : 0;

  while (mobs.some((m) => m.alive)) {
    if (hp <= 0) {
      res.playerDied = true;
      break;
    }
    if (t >= limitMs) {
      res.timedOut = true;
      break;
    }
    // Player decision when free.
    if (!cast && !channel && t >= gcdUntil && t >= waitUntil) {
      decide();
      continue;
    }
    // Next event time.
    let next = limitMs;
    const consider = (x: number): void => {
      if (x > t && x < next) next = x;
      else if (x <= t && x < next) next = t;
    };
    if (cast) consider(cast.endsAt);
    if (channel) consider(channel.nextTickAt);
    for (const m of mobs) {
      if (!m.alive) continue;
      consider(m.swingAt);
      for (const d of m.dots) consider(d.nextTickAt);
    }
    if (petAlive) {
      consider(pet.nextAct);
      consider(pet.nextLash);
    }
    if (!cast && !channel) consider(Math.max(gcdUntil, waitUntil));
    if (shUntil > t) consider(shUntil);
    // Regen over the interval.
    const dt = Math.max(0, next - t);
    if (dt > 0) {
      mana = Math.min(maxMana, mana + (combatRegenPerSec(stats.spirit, params, t < shUntil ? sh : null) + sacManaPerMs * 1000) * (dt / 1000));
      if (sacHealPerMs > 0) healPlayer(sacHealPerMs * dt);
      if (petAlive && petKind !== 'imp') pet.mana = Math.min(petMaxMana, pet.mana + 0.5 * (dt / 1000));
    }
    t = next;
    // 1. cast completion
    if (cast && cast.endsAt <= t) {
      const c = cast;
      cast = null;
      resolveCast(c.spellId, c.rank, c.mob);
    }
    // 2. channel ticks
    while (channel && channel.nextTickAt <= t) {
      const ch = channel;
      const d = tickDamage(ch.mob, ch.spellId, 'shadow', ch.tickDmg, true);
      if (ch.healFrac > 0) healPlayer(d * ch.healFrac);
      ch.nextTickAt += ch.tickMs;
      maybeNightfall(ch.spellId);
      const finished = ch.nextTickAt > ch.endsAt;
      dealToMob(ch.mob, d, true, 1);
      if (finished && channel === ch) {
        channel = null;
        if (ch.spellId === 'wrack') setDotSpeed(ch.mob, 1);
      }
    }
    // 3. DoT ticks
    for (const m of mobs) {
      if (!m.alive) continue;
      for (const d of [...m.dots]) {
        if (!m.alive) break;
        if (d.nextTickAt > t) continue;
        if (!dotActive(d)) {
          m.dots = m.dots.filter((x) => x !== d);
          continue;
        }
        // Bane of Agony's ramp goes by the share of the duration elapsed (ticks gained under Wrack keep their stage).
        const factor = d.factors ? (d.factors[Math.min(d.factors.length - 1, Math.max(0, Math.ceil(((d.nextTickAt - d.appliedAt) / (d.expiresAt - d.appliedAt)) * d.factors.length - 1e-9) - 1))] ?? 1) : 1;
        const dmg = tickDamage(m, d.spellId, d.school, d.tickDmg * factor, false);
        d.nextTickAt += d.tickMs / d.speed;
        if (d.healFrac > 0) healPlayer(dmg * d.healFrac);
        maybeNightfall(d.spellId);
        if (!dotActive(d)) m.dots = m.dots.filter((x) => x !== d);
        dealToMob(m, dmg, true, 1);
      }
    }
    // 4. pet
    if (petAlive) {
      if (pet.nextAct <= t) petAct();
      if (petAlive && pet.nextLash <= t) petLash();
      if (petAlive && petKind === 'voidwalker' && pd && t >= pet.nextTorment) {
        const m = firstAlive();
        const tor = pd.torment as { intervalMs: number; threatPerLevel: number };
        // Torment costs 20 mana (ledger, allthings.how/?p=353577); a Voidwalker that cannot pay does not taunt.
        if (m && pet.mana >= TORMENT_MANA) {
          pet.mana -= TORMENT_MANA;
          m.threatPet += tor.threatPerLevel * level * (1 + effectNum('improved_voidwalker', 'tormentEffectPerRank') * rk(ranks, 'improved_voidwalker'));
          log(t, 'pet torment');
          reevaluate(m);
        }
        pet.nextTorment = t + tor.intervalMs;
      }
    }
    // 5. mob swings
    for (const m of mobs) if (m.alive && m.swingAt <= t) mobSwing(m);
  }

  cutBusy();
  res.soulHarvestLeftMs = Math.max(0, shUntil - t);
  res.eurekaCdLeftMs = Math.max(0, eurekaReadyAt - t);
  res.eurekaBuffLeftMs = Math.max(0, eurekaUntil - t);
  res.pullSec = t / 1000;
  res.endMana = mana;
  res.endHp = Math.max(0, hp);
  if (res.playerDied) res.endHp = 0;
  res.endPetHp = petAlive ? Math.max(0, pet.hp) : 0;
  res.endPetMana = petAlive ? Math.max(0, pet.mana) : 0;
  return res;
}
