import { combineStatMultipliers } from '../../../engine/stats';
import type { AuraDef, RawStats, SpecHooks, SpellModifier, StatMultipliers } from '../../../engine/types';
import { warlockAuras } from './auras';
import { DESTRUCTION_SPELL_IDS, TALENT_SPELL_IDS, warlockSpells } from './spells';
import { TALENT_TREE } from './talentTree';

// Talent effects as data (stage 2b Task 2): every warlock talent is either MODELLED
// (`TALENT_EFFECTS`: its effect at a rank, in the engine's primitives) or UNMODELLED
// (`UNMODELLED_TALENTS`: why not). Never both, never neither (tests/data/talent-effects.test.ts).
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a, sim/warlock/talents.go (the
// apply<Talent> function named in each entry) and sim/warlock/spell_data_auto_gen.go (the talent's
// row: `Value` per rank), checked against the Wowhead TBC tooltips (talentDescriptions.json).
// See docs/data-sources.md, "Part I: talents", Task 2, for the table and the decisions.
//
// Stacking note: the engine multiplies matching `damageMult` / `dotDamageMult` factors, while
// wowsims adds its SpellMod_DamageDone_Flat bonuses (Shadow Mastery, Contagion, Emberstorm,
// Improved Immolate) on one spell. Builds that combine two of them on one spell come out slightly
// higher here (Corruption with Shadow Mastery 5 + Contagion 5: x1.155 vs x1.15; Immolate's direct
// damage with Improved Immolate 5 + Emberstorm 5: x1.375 vs x1.35). The author's build has no such
// pair.

/** A talent's effect at one rank, in the engine's primitives. Absent fields: no effect. */
export interface TalentEffect {
  modifiers?: SpellModifier[];
  statMultipliers?: StatMultipliers;
  statBonuses?: Partial<RawStats>;
  /** Aura defs that replace the spec's aura of the same id (or are added when it has none). */
  auras?: AuraDef[];
  hooks?: SpecHooks;
  /** Spell ids this talent makes available (`TALENT_SPELL_IDS`). */
  spells?: string[];
  /** Multiplies the armor self buff's bonus (Fel Armor's spell power): Demonic Aegis. */
  armorMult?: number;
}

const baseAura = (id: string): AuraDef => {
  const a = warlockAuras.find((x) => x.id === id);
  if (!a) throw new Error(`unknown warlock aura ${id}`);
  return a;
};

/**
 * Improved Shadow Bolt (shadowbolt.go; core/debuffs.go ImprovedShadowBoltAura): a Shadow Bolt crit
 * applies the debuff with all charges. One shared frozen object for every rank, so that every spec
 * built with the talent has the same `hooks` (the stage 1 spec's behaviour, `toBe` in applySetup).
 */
const IMPROVED_SHADOW_BOLT_HOOK: SpecHooks = Object.freeze({
  onSpellResolved(e: { spellId: string; outcome: string }, api: { applyTargetAura(id: string): void }) {
    if (e.spellId === 'shadow-bolt' && e.outcome === 'crit') api.applyTargetAura('shadow-vulnerability');
  },
}) as SpecHooks;

const lifeTapHooks = new Map<number, SpecHooks>();
/**
 * Improved Life Tap (lifetap.go): baseRestore = 582 x (1 + 0.1 x rank); the 0.8 x spell power part
 * is not increased. The spell's own gain stays 582 + 0.8 x power (spells.ts); this hook adds the
 * talent's 582 x 0.1 x rank as a second gain (logged `mana` with spellId life-tap). Capped at max
 * mana like the first, so the total equals one combined gain. One frozen object per rank.
 */
function lifeTapHook(rank: number): SpecHooks {
  let h = lifeTapHooks.get(rank);
  if (!h) {
    const extra = 582 * 0.1 * rank;
    h = Object.freeze({
      onSpellResolved(e: { spellId: string }, api: { addMana(amount: number): number }) {
        if (e.spellId === 'life-tap') api.addMana(extra);
      },
    }) as SpecHooks;
    lifeTapHooks.set(rank, h);
  }
  return h;
}

/** Rank 0 (or less) gives no effect; otherwise `f(rank)`. */
const ranked =
  (f: (rank: number) => TalentEffect) =>
  (rank: number): TalentEffect =>
    rank > 0 ? f(rank) : {};

/**
 * Modelled talents. Key order = application order: the Destruction tree, then Affliction, then
 * Demonology (tree order within each), so the author's build gives exactly stage 1's modifier list
 * (Cataclysm, Bane, Devastation, Ruin, Emberstorm, Backlash, Shadow and Flame, Demonic Sacrifice).
 */
export const TALENT_EFFECTS: Readonly<Record<string, (rank: number) => TalentEffect>> = Object.freeze({
  // --- Destruction ---
  // Improved Shadow Bolt 5 (applyImprovedShadowBolt -> core/debuffs.go ImprovedShadowBoltAura:
  // shadow damage taken x (1 + 0.04 x rank), 12 s, 4 non-periodic hits; Wowhead 17803 "by 20%").
  // The 5/5 aura is auras.ts `shadow-vulnerability` (mult 1.2); lower ranks replace it.
  improvedShadowBolt: ranked((rank) => {
    const sv = baseAura('shadow-vulnerability');
    return {
      hooks: IMPROVED_SHADOW_BOLT_HOOK,
      auras: [{ ...sv, damageTakenMult: { ...sv.damageTakenMult!, mult: 1 + 0.04 * rank } }],
    };
  }),
  // Cataclysm 5 (applyCataclysm): PowerCost_Pct_Add -0.01 x rank on Destruction spells.
  cataclysm: ranked((rank) => ({ modifiers: [{ spellIds: [...DESTRUCTION_SPELL_IDS], manaCostMult: 1 - 0.01 * rank }] })),
  // Bane 5 (applyBane): CastTime_Flat -100 ms x rank on Shadow Bolt and Immolate (Soul Fire's
  // -400 ms x rank: no Soul Fire in the model).
  bane: ranked((rank) => ({ modifiers: [{ spellIds: ['shadow-bolt', 'immolate'], castTimeMsDelta: -100 * rank }] })),
  // Devastation 5 (applyDevastation): BonusCrit_Percent +rank on Destruction spells.
  devastation: ranked((rank) => ({ modifiers: [{ spellIds: [...DESTRUCTION_SPELL_IDS], critPctDelta: rank }] })),
  // Shadowburn 1 (applyShadowburn -> registerShadowBurn): the spell (spells.ts, rank 8).
  shadowburn: ranked(() => ({ spells: ['shadowburn'] })),
  // Improved Immolate 5 (applyImprovedImmolate; ImprovedImmolate 17836 SPELLMOD_DAMAGE 25):
  // DamageDone_Flat +0.05 x rank on WarlockSpellImmolate, the direct part only (the DoT is
  // WarlockSpellImmolateDot; Wowhead "initial damage ... by 25%").
  improvedImmolate: ranked((rank) => ({ modifiers: [{ spellIds: ['immolate'], damageMult: 1 + 0.05 * rank }] })),
  // Ruin 1 (applyRuin): CritMultiplier_Flat +1.0 on Destruction spells. sim/core/spell.go
  // CritDamageMultiplier: (1.5 - 1) x (1 + 1.0) + 1 = 2.0, i.e. +0.5 over the base 1.5.
  ruin: ranked(() => ({ modifiers: [{ spellIds: [...DESTRUCTION_SPELL_IDS], critMultDelta: 0.5 }] })),
  // Emberstorm 5 (applyEmberstorm; Emberstorm 17954-17958 SPELLMOD_DAMAGE 2 x rank): +2% x rank fire
  // damage, direct and periodic; Incinerate cast time -2% x rank of 2500 ms. wowsims'
  // WarlockFireDamage mask also lists Shadowburn; that is a shadow spell, left out here.
  emberstorm: ranked((rank) => ({
    modifiers: [
      { schools: ['fire'], damageMult: 1 + 0.02 * rank, dotDamageMult: 1 + 0.02 * rank },
      { spellIds: ['incinerate'], castTimeMsDelta: -2500 * 0.02 * rank },
    ],
  })),
  // Backlash 3 (applyBacklash): AddStat(SpellCritPercent, rank) -> +rank% crit on every spell. Its
  // proc (instant Shadow Bolt after being hit) needs incoming attacks: not modelled.
  backlash: ranked((rank) => ({ modifiers: [{ critPctDelta: rank }] })),
  // Conflagrate 1 (applyConflagrate -> registerConflagrate): the spell (spells.ts, rank 6).
  conflagrate: ranked(() => ({ spells: ['conflagrate'] })),
  // Shadow and Flame 5 (applyShadowAndFlame; ShadowAndFlame 30292 Value 20): BonusCoeffecient_Flat
  // +0.04 x rank on Shadow Bolt and Incinerate.
  shadowAndFlame: ranked((rank) => ({ modifiers: [{ spellIds: ['shadow-bolt', 'incinerate'], coeffDelta: 0.04 * rank }] })),

  // --- Affliction ---
  // Suppression 5 (applySuppression: SpellMod_BonusHit_Percent, spell_data_auto_gen.go Suppression
  // 18174-18178 Value 2 x rank, ClassMask WarlockAfflictionSpells = Corruption, Curse of Agony,
  // Curse of Doom, Curse of Recklessness, Curse of the Elements, Drain Life, Seed of Corruption,
  // Death Coil (warlock.go); Wowhead 18178 "resist your Affliction spells by 10%"): +2% hit x rank
  // on the modelled ones: Corruption and the curses of Agony, Doom and the Elements.
  suppression: ranked((rank) => ({
    modifiers: [{ spellIds: ['corruption', 'curse-of-agony', 'curse-of-doom', 'curse-of-the-elements'], hitPctDelta: 2 * rank }],
  })),
  // Improved Corruption 5 (applyImprovedCorruption): CastTime_Flat -400 ms x rank on Corruption
  // (Wowhead 17814 "by 2 sec").
  improvedCorruption: ranked((rank) => ({ modifiers: [{ spellIds: ['corruption'], castTimeMsDelta: -400 * rank }] })),
  // Improved Life Tap 2 (lifetap.go baseRestore = 582 x ImprovedLifeTap.MultiplierAt(rank), Value
  // 10 x rank; Wowhead 18183 "by 20%"): see lifeTapHook.
  improvedLifeTap: ranked((rank) => ({ hooks: lifeTapHook(rank) })),
  // Improved Curse of Agony 2 (applyImprovedCurseOfAgony; 18829 SPELLMOD_DOT 10): DotDamageDone_Pct
  // +0.05 x rank on Curse of Agony (Wowhead "by 10%").
  improvedCurseOfAgony: ranked((rank) => ({ modifiers: [{ spellIds: ['curse-of-agony'], dotDamageMult: 1 + 0.05 * rank }] })),
  // Empowered Corruption 3 (applyEmpoweredCorruption; 32383 Value 6: DotBonusCoeffecient_Flat
  // +0.02 x rank per tick, 6 ticks; Wowhead "an additional 36% of your bonus spell damage"): the
  // Corruption aura's total coefficient + 0.12 x rank. (wowsims only applies it when Improved
  // Corruption is also taken, an apparent slip; the tooltip has no such condition.)
  empoweredCorruption: ranked((rank) => {
    const c = baseAura('corruption');
    return { auras: [{ ...c, tick: { ...c.tick!, coeffTotal: c.tick!.coeffTotal + 0.12 * rank } }] };
  }),
  // Shadow Mastery 5 (applyShadowMastery; 18275 SPELLMOD_DAMAGE 10): DamageDone_Flat +0.02 x rank
  // on WarlockShadowDamage, direct and periodic: of the modelled spells Shadow Bolt, Corruption,
  // Curse of Agony, Shadowburn. Curse of Doom is not in that mask (Wowhead says "your Shadow
  // spells": UNVERIFIED whether Doom benefits in game; wowsims followed).
  shadowMastery: ranked((rank) => ({
    modifiers: [
      {
        spellIds: ['shadow-bolt', 'corruption', 'curse-of-agony', 'shadowburn'],
        damageMult: 1 + 0.02 * rank,
        dotDamageMult: 1 + 0.02 * rank,
      },
    ],
  })),
  // Contagion 5 (applyContagion; 30064 SPELLMOD_DOT 5): DamageDone_Flat +0.01 x rank on Curse of
  // Agony and Corruption (both periodic only here). The dispel part does nothing in the model.
  contagion: ranked((rank) => ({ modifiers: [{ spellIds: ['corruption', 'curse-of-agony'], dotDamageMult: 1 + 0.01 * rank }] })),
  // Malediction 3 (curse_of_elements.go CurseOfElementsAura(target, 1, Malediction) -> core/debuffs.go
  // multiplier 1.10 + 0.01 x rank; Wowhead 32484 "an additional 3%"): the own Curse of the
  // Elements aura with the higher multiplier (the raid one, setup buffs, keeps 1.1).
  malediction: ranked((rank) => {
    const coe = baseAura('curse-of-the-elements');
    return { auras: [{ ...coe, damageTakenMult: { ...coe.damageTakenMult!, mult: 1.1 + 0.01 * rank } }] };
  }),

  // --- Demonology ---
  // Demonic Embrace 5 (applyDemonicEmbrace): MultiplyStat(Spirit, 1 - 0.01 x rank) (its +3% x rank
  // stamina is irrelevant here).
  demonicEmbrace: ranked((rank) => ({ statMultipliers: { spirit: 1 - 0.01 * rank } })),
  // Fel Intellect 3 (applyFelIntellect): MultiplyStat(Mana, 1 + 0.01 x rank) (the pets' part: no pet).
  felIntellect: ranked((rank) => ({ statMultipliers: { maxMana: 1 + 0.01 * rank } })),
  // Demonic Aegis 3 (armors.go: Fel Armor's spell damage x (1 + 0.1 x rank); 30145 Value 30).
  demonicAegis: ranked((rank) => ({ armorMult: 1 + 0.1 * rank })),
  // Demonic Sacrifice 1 with the Succubus sacrificed (applyDemonicSacrifice; tbc-new DefaultOptions
  // summon Succubus, sacrificeSummon true): SchoolDamageDealtMultiplier[shadow] x 1.15, direct and
  // periodic. Which pet the author sacrifices is UNVERIFIED (docs, open questions);
  // buildDestructionWarlock leaves it out when the setup keeps the pet.
  demonicSacrifice: ranked(() => ({ modifiers: [{ schools: ['shadow'], damageMult: 1.15, dotDamageMult: 1.15 }] })),
  // Demonic Tactics 5 (applyDemonicTactics): AddStat(SpellCritPercent, rank) on the warlock.
  demonicTactics: ranked((rank) => ({ modifiers: [{ critPctDelta: rank }] })),
});

const NO_DPS = 'No effect on the damage the trainer simulates';
const PET = 'Needs the pet, which is not simulated (spec §1)';
const NO_SPELL = 'Its spell is not in the model (spec §1: no new spells from talents)';

/** Talents left out, with the reason (shown by the talent editor and docs/data-sources.md). */
export const UNMODELLED_TALENTS: Readonly<Record<string, string>> = Object.freeze({
  // Affliction
  improvedCurseOfWeakness: `${NO_SPELL}: Curse of Weakness.`,
  improvedDrainSoul: `${NO_SPELL}: Drain Soul; its threat reduction has no effect either.`,
  soulSiphon: `${NO_SPELL}: Drain Life / Drain Soul.`,
  felConcentration: `${NO_DPS}: pushback protection for Drain spells (not in the model).`,
  amplifyCurse: `${NO_SPELL}: Amplify Curse is a cooldown spell of its own.`,
  grimReach: `${NO_DPS}: spell range.`,
  nightfall: 'Procs from Corruption ticks: hooks never run on DoT ticks.',
  shadowEmbrace: `${NO_DPS}: reduces the target's physical damage.`,
  siphonLife: `${NO_SPELL}: Siphon Life.`,
  curseOfExhaustion: `${NO_SPELL}: Curse of Exhaustion.`,
  darkPact: `${NO_SPELL}: Dark Pact (drains the pet's mana).`,
  improvedHowlOfTerror: `${NO_SPELL}: Howl of Terror.`,
  unstableAffliction: `${NO_SPELL}: Unstable Affliction.`,
  // Demonology
  improvedHealthstone: `${NO_DPS}: Healthstone healing.`,
  improvedImp: `${PET}: the Imp's spells.`,
  improvedHealthFunnel: `${NO_DPS}: Health Funnel.`,
  improvedVoidwalker: `${PET}: the Voidwalker's spells.`,
  improvedSayaad: `${PET}: the Succubus' spells.`,
  felDomination: `${NO_DPS}: faster pet summons.`,
  felStamina: `${NO_DPS}: health only (the pets' stamina: no pet).`,
  masterSummoner: `${NO_DPS}: faster, cheaper pet summons.`,
  unholyPower: `${PET}: the pets' damage.`,
  improvedSubjugateDemon: `${NO_SPELL}: Subjugate Demon.`,
  masterConjuror: 'Firestone and Spellstone are not in the model.',
  manaFeed: `${PET}: gives mana to the pet.`,
  masterDemonologist: `${PET}: its effect lasts only while the demon is out; with the Succubus sacrificed it gives nothing.`,
  demonicResilience: `${NO_DPS}: crits taken and the pet's damage taken.`,
  soulLink: `${PET}: +5% damage only while the demon is out (wowsims applies it unconditionally, a TODO there).`,
  demonicKnowledge: `${PET}: spell damage from the active demon's stamina and intellect.`,
  summonFelguard: `${PET}: the Felguard.`,
  // Destruction
  aftermath: `${NO_DPS}: a chance to daze the target (wowsims skips it too).`,
  improvedFirebolt: `${PET}: the Imp's Firebolt.`,
  improvedLashOfPain: `${PET}: the Succubus' Lash of Pain.`,
  intensity: `${NO_DPS}: pushback protection (no damage taken in the model).`,
  destructiveReach: `${NO_DPS}: spell range and threat.`,
  improvedSearingPain: `${NO_SPELL}: Searing Pain.`,
  pyroclasm: `${NO_SPELL}: Rain of Fire, Hellfire and Soul Fire (its stun).`,
  netherProtection: `${NO_DPS}: procs when hit by spells (no damage taken in the model).`,
  soulLeech: `${NO_DPS}: heals the warlock (health is not modelled).`,
  shadowfury: `${NO_SPELL}: Shadowfury.`,
});

/** The order effects are applied in: Destruction, Affliction, Demonology (tree order within each). */
const EFFECT_ORDER: readonly string[] = [2, 0, 1].flatMap((t) =>
  TALENT_TREE.trees[t]!.talents.map((d) => d.id).filter((id) => Object.hasOwn(TALENT_EFFECTS, id)),
);

/**
 * The 64 talent ranks of an untrusted rank map: own properties only, unknown keys ignored; an
 * integer rank is clamped to 0..maxRank, anything else (NaN, fraction, string, ...) is 0. Never
 * throws (a non-object, an array or an unreadable object gives every rank 0).
 */
export function talentRanksOf(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const all = TALENT_TREE.trees.flatMap((t) => t.talents);
  for (const d of all) out[d.id] = 0;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return out;
  try {
    for (const d of all) {
      if (!Object.prototype.hasOwnProperty.call(input, d.id)) continue;
      const v = (input as Record<string, unknown>)[d.id];
      out[d.id] = typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(v, 0), d.maxRank) : 0;
    }
  } catch {
    for (const d of all) out[d.id] = 0;
  }
  return out;
}

/** What a build's talents add to the spec (`effectsForBuild`). */
export interface TalentBuildEffects {
  /** All modifiers in application order (see `EFFECT_ORDER`). */
  modifiers: SpellModifier[];
  /** The talent id of each entry of `modifiers` (same index). */
  modifierSources: string[];
  /** The talents' stat multipliers combined factor by factor (no racials). */
  statMultipliers: StatMultipliers;
  statBonuses: Partial<RawStats>;
  /** Aura defs replacing the spec's of the same id (or new ones). */
  auras: AuraDef[];
  /** The talents' hooks run in order; a single one as is; none: a shared empty object. */
  hooks: SpecHooks;
  /** Spell ids the talents make available, in `TALENT_SPELL_IDS` terms. */
  spells: string[];
  /** Product of the `armorMult` of the talents (1 without). */
  armorMult: number;
  /** Ids of the build's unmodelled talents with points, in string order. */
  unmodelled: string[];
}

const NO_HOOKS: SpecHooks = Object.freeze({});

/**
 * The combined effect of a build (`ranks`: any rank map, see `talentRanksOf`). Pure, never throws;
 * every call returns new arrays, modifier, aura and multiplier objects (hook objects are shared,
 * frozen and stateless).
 */
export function effectsForBuild(ranks: unknown): TalentBuildEffects {
  const r = talentRanksOf(ranks);
  const modifiers: SpellModifier[] = [];
  const modifierSources: string[] = [];
  const multipliers: StatMultipliers[] = [];
  const statBonuses: Partial<RawStats> = {};
  const auras: AuraDef[] = [];
  const hooks: SpecHooks[] = [];
  const spells: string[] = [];
  let armorMult = 1;
  for (const id of EFFECT_ORDER) {
    const rank = r[id] ?? 0;
    if (rank <= 0) continue;
    const fx = TALENT_EFFECTS[id]!(rank);
    for (const m of fx.modifiers ?? []) {
      modifiers.push(m);
      modifierSources.push(id);
    }
    if (fx.statMultipliers) multipliers.push(fx.statMultipliers);
    for (const [key, value] of Object.entries(fx.statBonuses ?? {}) as [keyof RawStats, number][]) {
      statBonuses[key] = (statBonuses[key] ?? 0) + value;
    }
    for (const a of fx.auras ?? []) {
      const i = auras.findIndex((x) => x.id === a.id);
      if (i >= 0) auras[i] = a;
      else auras.push(a);
    }
    if (fx.hooks) hooks.push(fx.hooks);
    for (const s of fx.spells ?? []) if (!spells.includes(s)) spells.push(s);
    if (fx.armorMult !== undefined) armorMult *= fx.armorMult;
  }
  const unmodelled = TALENT_TREE.trees.flatMap((t) =>
    t.talents.filter((d) => Object.hasOwn(UNMODELLED_TALENTS, d.id) && (r[d.id] ?? 0) > 0).map((d) => d.id),
  );
  return {
    modifiers,
    modifierSources,
    statMultipliers: combineStatMultipliers(...multipliers),
    statBonuses,
    auras,
    hooks: composeTalentHooks(hooks),
    spells,
    armorMult,
    unmodelled,
  };
}

function composeTalentHooks(hooks: readonly SpecHooks[]): SpecHooks {
  if (hooks.length === 0) return NO_HOOKS;
  if (hooks.length === 1) return hooks[0]!;
  return {
    onSpellResolved(e, api) {
      for (const h of hooks) h.onSpellResolved?.(e, api);
    },
  };
}

/**
 * `base` with each of `overrides` in place of the aura of the same id (an override equal to the
 * base def keeps the base object), new ids appended. Returns `base` itself when nothing changes,
 * so the author's spec keeps the shared `warlockAuras`.
 */
export function withTalentAuras(base: readonly AuraDef[], overrides: readonly AuraDef[]): readonly AuraDef[] {
  let out: AuraDef[] | undefined;
  for (const a of overrides) {
    const i = (out ?? base).findIndex((x) => x.id === a.id);
    if (i >= 0 && JSON.stringify((out ?? base)[i]) === JSON.stringify(a)) continue;
    out ??= [...base];
    if (i >= 0) out[i] = a;
    else out.push(a);
  }
  return out ?? base;
}

/** The warlock spells a build has: every spell, minus the talent spells it does not take. */
export function availableWarlockSpells(talentSpells: readonly string[]) {
  return warlockSpells.filter((s) => !TALENT_SPELL_IDS.includes(s.id) || talentSpells.includes(s.id));
}
