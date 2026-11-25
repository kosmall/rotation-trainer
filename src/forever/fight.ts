// One pull of the leveling simulation: the player (casting, GCD, DoTs, drains), an optional demon
// and 1-3 same-level mobs on a millisecond clock. Seeded and deterministic. See docs/superpowers.

import { createRng, type Rng } from '../engine/rng';
import type { BuildVariant } from './builds';
import { ranksAt } from './builds';
import { brandDamage, demonicKnowledgeSp, effectNum, rank as rk, schoolMults, soulHarvest, summonDemon, sacrificeDemon, type DemonState } from './effects';
import { rotationFor, type Candidate, type RotationCtx } from './rotations';
import { averageDirect, castMsOf, downrankFactor, getSpell, rankAt } from './spells';
import { armorReduction, combatRegenPerSec, demonArmorOf, gcdMs, gcdWasteMs, hastedCastMs, lifeTapGain, mobAt, petData, playerStatsFor } from './stats';
import type { Ranks } from './talents';
import type { Params, PetKind, SpellRank } from './types';

export interface PullConfig {
  variant: BuildVariant;
  level: number;
  profile: string;
  params: Params;
  mobs?: 1 | 2 | 3;
  /** Talent ranks override (optimizer); default: the variant's picks at the level. */
  ranks?: Ranks;
  startMana?: number;
  startHp?: number;
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
  playerDied: boolean;
  timedOut: boolean;
  soulHarvestProcs: number;
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
  endsAt: number;
  tickMs: number;
  tickDmg: number;
  healFrac: number;
}

interface Mob {
  hp: number;
  maxHp: number;
  alive: boolean;
  dots: Dot[];
  curseUntil: number;
  curseVal: number;
  vulnCharges: number;
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

const AFF_SPELLS = new Set(['corruption', 'bane_of_agony', 'siphon_life', 'drain_life', 'drain_soul', 'curse_of_elements', 'wrack']);
const DESTRO_SPELLS = new Set(['shadow_bolt', 'immolate', 'searing_pain']);
const pv = (pair: unknown, level: number): number => {
  const [slope, add] = pair as [number, number];
  return slope * level + add;
};

export function simulatePull(cfg: PullConfig, seed: number): PullResult {
  const { variant, level, params } = cfg;
  const rng: Rng = createRng(seed);
  const ranks = cfg.ranks ?? ranksAt(variant, level);
  const stats = playerStatsFor(level, cfg.profile, ranks);
  const nMobs = cfg.mobs ?? params.mobs_per_pull;
  const mobBase = mobAt(level);
  const trace: string[] = [];
  const log = (t: number, msg: string): void => {
    if (cfg.trace) trace.push(`${(t / 1000).toFixed(2)}s ${msg}`);
  };

  // ---- demons -------------------------------------------------------------------------
  const hasPact = rk(ranks, 'demonic_pact') > 0;
  let demons: DemonState = { out: null, sacrificed: null };
  if (variant.sacrificed && rk(ranks, 'demonic_sacrifice') > 0) {
    demons = sacrificeDemon({ out: variant.sacrificed, sacrificed: null });
  }
  if (variant.pet) demons = summonDemon(demons, variant.pet, hasPact);
  const petKind: PetKind | null = demons.out;
  const pd = petKind ? petData(petKind) : null;
  const petUnlocked = !pd || level >= (pd.unlock as number);
  let petAlive = petKind !== null && petUnlocked;

  const petHpMult = (1 + effectNum('fel_vitality', 'petHpManaPerRank') * rk(ranks, 'fel_vitality')) * (petKind === 'voidwalker' ? 1 + effectNum('improved_voidwalker', 'voidwalkerHpMultPerRank') * rk(ranks, 'improved_voidwalker') : 1);
  const pet = {
    maxHp: pd ? pv(pd.hp, level) * petHpMult : 0,
    hp: 0,
    mana: pd ? pv(pd.mana, level) * (1 + effectNum('fel_vitality', 'petHpManaPerRank') * rk(ranks, 'fel_vitality')) : 0,
    nextAct: 0,
    nextLash: 0,
    nextTorment: 0,
    armor: pd ? pv(pd.armor, level) : 0,
  };
  pet.hp = pet.maxHp;
  const soulLink = rk(ranks, 'soul_link') > 0;
  const petDmgMult = (1 + effectNum('unholy_power', 'petDmgMultPerRank') * rk(ranks, 'unholy_power')) * (soulLink ? 1 + effectNum('soul_link', 'dmgMult') : 1);

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
      hp: hpv, maxHp: hpv, alive: true, dots: [], curseUntil: 0, curseVal: 0, vulnCharges: 0, vulnUntil: 0, brandCharges: 0, brandUntil: 0,
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
  let shUntil = 0;
  let res: PullResult = {
    pullSec: 0, mobsKilled: 0, mobsInPull: nMobs, killTimesSec: [], manaSpent: 0, manaFromLifeTap: 0, lifeTapCount: 0, lifeTapHpSpent: 0, damageTaken: 0, healed: 0,
    startMana, endMana: 0, startHp, endHp: 0, maxMana, maxHp, gcdBusyMs: 0, castWasteMs: 0, castCount: 0, petDied: false, playerDied: false, timedOut: false,
    soulHarvestProcs: 0, nightfallProcs: 0, brandHits: 0, threatSwitches: 0, playerDamage: 0, petDamage: 0, trace,
  };

  const firstAlive = (): Mob | undefined => mobs.find((m) => m.alive);
  const spEff = (): number => stats.spellPower + demonicKnowledgeSp(level, ranks, petAlive);
  const mults = () => schoolMults(ranks, demons, petAlive);

  const targetMult = (m: Mob, school: 'shadow' | 'fire'): number => (t < m.curseUntil ? 1 + m.curseVal : 1) * (school === 'shadow' || school === 'fire' ? 1 : 1);

  const coeffMult = (spellId: string, r: SpellRank): number => {
    if (spellId !== 'shadow_bolt') return 1;
    if (r.rank === 1) return params.sb_r1_coeff_mult;
    if (r.rank === 2) return params.sb_r2_coeff_mult;
    return 1;
  };

  const critPct = (spellId: string): number => {
    let c = stats.critPct;
    if (AFF_SPELLS.has(spellId)) c += params.malevolence_crit_pct_per_rank * rk(ranks, 'malevolence');
    return c;
  };
  const critMult = (spellId: string, periodic: boolean): number => {
    let c = params.base_crit_mult;
    if (periodic) c += effectNum('pandemic', 'dotCritMultDeltaPerRank') * rk(ranks, 'pandemic');
    if (DESTRO_SPELLS.has(spellId) && !periodic) c += effectNum('ruin', 'destroCritMultDeltaPerRank') * rk(ranks, 'ruin');
    return c;
  };
  const missPct = (spellId: string): number => {
    let m = params.mob_miss_pct - stats.hitPct;
    if (AFF_SPELLS.has(spellId)) m -= effectNum('suppression', 'hitPctPerRank') * rk(ranks, 'suppression');
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
    }
    if (cast && cast.mob === m) cast = null;
  };

  const dealToMob = (m: Mob, amount: number, fromPlayer: boolean, threatMult: number): void => {
    if (!m.alive) return;
    m.hp -= amount;
    if (fromPlayer) {
      res.playerDamage += amount;
      m.threatPlayer += amount * threatMult;
      const heal = effectNum('demonic_energies', 'petHealFracPerRank') * rk(ranks, 'demonic_energies');
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
    if (spellId === 'immolate') m *= 1 + effectNum('aftermath', 'immolateDmgPerRank') * rk(ranks, 'aftermath');
    if (spellId === 'immolate' || spellId === 'searing_pain') m *= 1 + effectNum('agonizing_flames', 'fireDmgPerRank') * rk(ranks, 'agonizing_flames');
    return m;
  };

  const directBase = (spellId: string, r: SpellRank): number => {
    const spell = getSpell(spellId);
    const coeff = (r.coeff ?? spell.coeffDirect ?? 0) * coeffMult(spellId, r);
    let base = averageDirect(r) + spEff() * coeff * downrankFactor(params.downrank_penalty_model, r.level);
    base *= aftermathMult(spellId);
    if (spellId === 'wrack') base *= params.wrack_dmg_mult;
    return base;
  };

  const dotTickBase = (spellId: string, r: SpellRank): { tickDmg: number; tickMs: number; durationMs: number } => {
    const spell = getSpell(spellId);
    const tickMs = spell.tickMs ?? 3000;
    const durationMs = spell.channelMs ?? spell.durationMs ?? 0;
    const ticks = Math.max(1, Math.round(durationMs / tickMs));
    let total = (r.dotTotal ?? 0) + spEff() * (spell.coeffDot ?? 0) * downrankFactor(params.downrank_penalty_model, r.level);
    if (spellId === 'corruption') total *= 1 + effectNum('improved_corruption', 'dmgMultPerRank') * rk(ranks, 'improved_corruption');
    if (spellId === 'bane_of_agony') total *= 1 + effectNum('improved_bane_of_agony', 'dmgMultPerRank') * rk(ranks, 'improved_bane_of_agony');
    if (spellId === 'drain_life' || spellId === 'drain_soul') total *= 1 + effectNum('improved_drains', 'drainDmgMultAtMax') * (rk(ranks, 'improved_drains') / 3);
    if (spellId === 'immolate') total *= aftermathMult('immolate');
    return { tickDmg: total / ticks, tickMs, durationMs };
  };

  const effectsOn = (m: Mob): number => m.dots.filter((d) => d.aff || d.id === 'immolate').length;
  const soulSiphon = (m: Mob): number => {
    const r = rk(ranks, 'soul_siphon');
    if (r === 0) return 1;
    return 1 + effectNum('soul_siphon', 'drainBonusPerEffectAtMax') * (r / 3) * Math.min(effectNum('soul_siphon', 'maxEffects'), effectsOn(m));
  };

  const tickDamage = (m: Mob, spellId: string, school: 'shadow' | 'fire', base: number, drain: boolean): number => {
    let d = base * (school === 'shadow' ? mults().shadow : mults().fire) * targetMult(m, school);
    if (drain) d *= soulSiphon(m);
    const crit = rng.next() * 100 < critPct(spellId);
    if (crit) d *= critMult(spellId, true);
    log(t, `tick ${spellId} ${Math.round(d)}${crit ? ' CRIT' : ''}`);
    return d;
  };

  const maybeNightfall = (spellId: string): void => {
    const r = rk(ranks, 'nightfall');
    if (r > 0 && (spellId === 'corruption' || spellId === 'drain_life') && rng.next() < effectNum('nightfall', 'procPerTickPerRank') * r) {
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
  const manaCost = (spellId: string, r: SpellRank): number => {
    let c = r.mana;
    if (DESTRO_SPELLS.has(spellId)) c *= 1 - effectNum('cataclysm', 'destroManaCostReducePerRank') * rk(ranks, 'cataclysm');
    return Math.round(c);
  };

  const applyDot = (m: Mob, spellId: string, r: SpellRank): void => {
    const spell = getSpell(spellId);
    const b = dotTickBase(spellId, r);
    m.dots = m.dots.filter((d) => d.id !== spellId);
    m.dots.push({ id: spellId, spellId, school: spell.school, aff: AFF_SPELLS.has(spellId), nextTickAt: t + b.tickMs, endsAt: t + b.durationMs, tickMs: b.tickMs, tickDmg: b.tickDmg, healFrac: spell.healFrac ?? 0 });
  };

  const brandHit = (m: Mob): void => {
    if (m.brandCharges > 0 && t < m.brandUntil) {
      m.brandCharges--;
      res.brandHits++;
      dealToMob(m, brandDamage(level, spEff(), rk(ranks, 'demonic_brand'), params), false, 1);
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
      if (spell.school === 'shadow' && m.vulnCharges > 0 && t < m.vulnUntil) {
        d *= 1 + effectNum('improved_shadow_bolt', 'shadowTakenPerRank') * rk(ranks, 'improved_shadow_bolt');
        m.vulnCharges--;
      }
      const crit = rng.next() * 100 < critPct(spellId);
      if (crit) d *= critMult(spellId, false);
      if (spellId === 'shadow_bolt' && crit && rk(ranks, 'improved_shadow_bolt') > 0) {
        m.vulnCharges = effectNum('improved_shadow_bolt', 'charges');
        m.vulnUntil = t + effectNum('improved_shadow_bolt', 'durationMs');
      }
      if (spellId === 'searing_pain' && rk(ranks, 'demonic_brand') > 0) {
        m.brandCharges = effectNum('demonic_brand', 'charges');
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
      channel = { spellId, mob: m, nextTickAt: t + b.tickMs, endsAt: t + b.durationMs, tickMs: b.tickMs, tickDmg: b.tickDmg, healFrac: spell.healFrac ?? 0, isDrainSoul: spellId === 'drain_soul' };
      res.gcdBusyMs += b.durationMs - gcd > 0 ? b.durationMs - gcd : 0;
    }
  };

  const lifeTap = (): boolean => {
    const r = rankAt('life_tap', 'max', level);
    if (!r) return false;
    const gain = lifeTapGain(r.base ?? 0, stats.spirit, ranks, params);
    const cost = gain * params.life_tap_hp_cost_frac;
    if (hp - cost < maxHp * 0.15 || mana >= maxMana) return false;
    const got = Math.min(gain, maxMana - mana);
    mana += got;
    hp -= cost;
    res.manaFromLifeTap += got;
    res.lifeTapCount++;
    res.lifeTapHpSpent += cost;
    if (rk(ranks, 'demonic_energies') > 0) pet.mana += got;
    gcdUntil = t + gcd;
    res.gcdBusyMs += gcd;
    log(t, `Life Tap +${Math.round(got)} mana`);
    return true;
  };

  const known = (spellId: string): boolean => {
    const s = getSpell(spellId);
    if (s.teachesTalent && rk(ranks, s.teachesTalent) === 0) return false;
    return rankAt(spellId, 'max', level) !== undefined;
  };

  // ---- estimates for rotation rules ---------------------------------------------------------
  const fillerRank = (): { id: string; r: SpellRank } => {
    const want = variant.rank;
    const id = variant.rotation === 'fire' ? (params.fire_filler === 'searing_pain' ? 'searing_pain' : 'shadow_bolt') : variant.filler === 'wrack' && known('wrack') ? 'wrack' : variant.filler === 'drain_life' ? 'drain_life' : 'shadow_bolt';
    const r = rankAt(id, id === 'shadow_bolt' ? (variant.rotation === 'fire' ? 1 : want) : 'max', level) ?? (rankAt('shadow_bolt', 'max', level) as SpellRank);
    return { id, r };
  };
  const fillerCastMs = (id: string, r: SpellRank): number => Math.max(gcd, hastedCastMs(castMsOf(getSpell(id), r, rk(ranks, 'bane'), params), params.haste_pct));
  const expectedDirect = (id: string, r: SpellRank): number => {
    const spell = getSpell(id);
    if (spell.kind === 'channel') {
      const b = dotTickBase(id, r);
      return b.tickDmg * Math.round(b.durationMs / b.tickMs) * mults().shadow;
    }
    const c = critPct(id) / 100;
    return directBase(id, r) * (spell.school === 'shadow' ? mults().shadow : mults().fire) * (1 + c * (critMult(id, false) - 1));
  };
  const estPetDps = (): number => {
    if (!pd || !petAlive) return 0;
    if (petKind === 'imp') return ((pv(pd.fireboltAvg, level) + demonicKnowledgeSp(level, ranks, true) * 0.57) * petDmgMult) / ((pd.fireboltCastMs as number) / 1000);
    return pv(pd.meleeDps, level) * petDmgMult * params.pet_hit_chance;
  };
  const estDps = (): number => {
    const f = fillerRank();
    return expectedDirect(f.id, f.r) / (fillerCastMs(f.id, f.r) / 1000) * 0.9 + estPetDps();
  };
  const dpsEstimate = estDps();

  // ---- rotation context ---------------------------------------------------------------------
  const rotation = rotationFor(variant.rotation);
  const makeCtx = (m: Mob): RotationCtx => ({
    params, variant, mobsInPull: nMobs, petAlive, hasShadowTrance: trance,
    known, talentRank: (id) => rk(ranks, id),
    targetHasDot: (id) => m.dots.some((d) => d.id === id && d.endsAt > t),
    targetDotRemainingMs: (id) => Math.max(0, (m.dots.find((d) => d.id === id)?.endsAt ?? 0) - t),
    targetHasCurse: () => t < m.curseUntil,
    targetBrandRemainingMs: () => Math.max(0, m.brandUntil - t),
    targetBrandCharges: () => m.brandCharges,
    targetHp: () => m.hp,
    estTtkSec: () => m.hp / Math.max(1, dpsEstimate),
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
    const cost = free ? 0 : manaCost(c.spellId, r);
    if (mana < cost) return false;
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
    log(t, `cast ${c.spellId} r${r.rank} (${castMs} ms${free ? ', free' : ''})`);
    if (castMs === 0) resolveCast(c.spellId, r, m);
    else cast = { spellId: c.spellId, rank: r, mob: m, endsAt: t + castMs, free };
    return true;
  };

  const decide = (): void => {
    const m = firstAlive();
    if (!m) return;
    if (known('life_tap') && mana < maxMana * params.life_tap_mana_below && hp > maxHp * params.life_tap_hp_above && lifeTap()) return;
    for (const c of rotation(makeCtx(m))) {
      if (startCast(c, m)) return;
    }
    if (params.sb_filler_lifetap_when_oom && known('life_tap') && lifeTap()) return;
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
      const cost = pv(pd.fireboltMana, level);
      if (pet.mana >= cost) {
        pet.mana -= cost;
        if (rng.next() < params.pet_hit_chance) {
          const d = (pv(pd.fireboltAvg, level) + dk * 0.57) * petDmgMult * (1 + effectNum('improved_imp', 'firebolt_dmg_per_rank') * rk(ranks, 'improved_imp'));
          dealToMob(m, d, false, 1);
          if (m.alive) brandHit(m);
        }
      }
      pet.nextAct = t + (pd.fireboltCastMs as number);
      return;
    }
    if (rng.next() < params.pet_hit_chance) {
      const d = pv(pd.meleeDps, level) * ((pd.swingMs as number) / 1000) * (1 - mobArmorRed) * petDmgMult;
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
    const cost = pv(pd.lashMana, level);
    if (pet.mana >= cost) {
      pet.mana -= cost;
      const d = (pv(pd.lashAvg, level) + demonicKnowledgeSp(level, ranks, true) * 0.57) * petDmgMult * (1 + effectNum('improved_sayaad', 'lashMultPerRank') * rk(ranks, 'improved_sayaad'));
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
    if (cast) cast.endsAt += params.pushback_ms;
    else if (channel && rng.next() >= effectNum('fel_concentration', 'channelPushbackResistPerRank') * rk(ranks, 'fel_concentration')) {
      channel.endsAt -= channel.tickMs;
      if (channel.endsAt <= channel.nextTickAt) channel.nextTickAt = Math.min(channel.nextTickAt, channel.endsAt);
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
      const bonus = t < shUntil ? sh.bonus : 0;
      mana = Math.min(maxMana, mana + (combatRegenPerSec(stats.spirit, params, bonus) + sacManaPerMs * 1000) * (dt / 1000));
      if (sacHealPerMs > 0) healPlayer(sacHealPerMs * dt);
      if (petAlive && petKind !== 'imp') pet.mana = Math.min(pet.mana + 0.5 * (dt / 1000), 1e9);
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
      if (finished && channel === ch) channel = null;
    }
    // 3. DoT ticks
    for (const m of mobs) {
      if (!m.alive) continue;
      for (const d of [...m.dots]) {
        if (!m.alive) break;
        if (d.nextTickAt > t) continue;
        const dmg = tickDamage(m, d.spellId, d.school, d.tickDmg, false);
        d.nextTickAt += d.tickMs;
        if (d.healFrac > 0) healPlayer(dmg * d.healFrac);
        maybeNightfall(d.spellId);
        const over = d.nextTickAt > d.endsAt;
        if (over) m.dots = m.dots.filter((x) => x !== d);
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
        if (m) {
          m.threatPet += tor.threatPerLevel * level;
          reevaluate(m);
        }
        pet.nextTorment = t + tor.intervalMs;
      }
    }
    // 5. mob swings
    for (const m of mobs) if (m.alive && m.swingAt <= t) mobSwing(m);
  }

  res.pullSec = t / 1000;
  res.endMana = mana;
  res.endHp = Math.max(0, hp);
  if (res.playerDied) res.endHp = 0;
  return res;
}
