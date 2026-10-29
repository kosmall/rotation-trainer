import type { SpellModifier } from '../../../engine/types';
import { DESTRUCTION_SPELL_IDS } from './spells';

// The author's Destruction Warlock talent build (stage 1: fixed) and its spell modifiers, used by
// destruction.ts (the spec) and rotation.ts (the priority's talent cast times and Shadow Bolt
// cost). A module of its own so that neither of those two imports the other.
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a. See docs/data-sources.md,
// section "Task 12a".

// ---------------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------------

/** The author's build (WowSimsExporter `talents`): Affliction-Demonology-Destruction, 0/21/40. */
export const destructionTalentString = '000000000000000000000-2050130133200100000000-555000512200013330050';

/**
 * Talent order per tree, as the string encodes it: wowsims tbc-new
 * ui/sim/talents/trees/warlock.json `talents[].fieldName` (same order as proto/warlock.proto
 * WarlockTalents fields 1-64).
 */
const TALENT_ORDER: readonly (readonly string[])[] = [
  [
    'suppression', 'improvedCorruption', 'improvedCurseOfWeakness', 'improvedDrainSoul',
    'improvedLifeTap', 'soulSiphon', 'improvedCurseOfAgony', 'felConcentration', 'amplifyCurse',
    'grimReach', 'nightfall', 'empoweredCorruption', 'shadowEmbrace', 'siphonLife',
    'curseOfExhaustion', 'shadowMastery', 'contagion', 'darkPact', 'improvedHowlOfTerror',
    'malediction', 'unstableAffliction',
  ],
  [
    'improvedHealthstone', 'improvedImp', 'demonicEmbrace', 'improvedHealthFunnel',
    'improvedVoidwalker', 'felIntellect', 'improvedSayaad', 'felDomination', 'felStamina',
    'demonicAegis', 'masterSummoner', 'unholyPower', 'improvedSubjugateDemon', 'demonicSacrifice',
    'masterConjuror', 'manaFeed', 'masterDemonologist', 'demonicResilience', 'soulLink',
    'demonicKnowledge', 'demonicTactics', 'summonFelguard',
  ],
  [
    'improvedShadowBolt', 'cataclysm', 'bane', 'aftermath', 'improvedFirebolt',
    'improvedLashOfPain', 'devastation', 'shadowburn', 'intensity', 'destructiveReach',
    'improvedSearingPain', 'pyroclasm', 'improvedImmolate', 'ruin', 'netherProtection',
    'emberstorm', 'backlash', 'conflagrate', 'soulLeech', 'shadowAndFlame', 'shadowfury',
  ],
];

/** Splits a Wowhead/wowsims talent string into per-tree ranks and point totals. */
export function parseTalentString(talents: string): {
  trees: number[][];
  points: [number, number, number];
} {
  const parts = talents.split('-');
  if (parts.length !== 3) throw new Error(`talent string needs 3 trees: ${talents}`);
  const trees = parts.map((p) =>
    [...p].map((c) => {
      if (c < '0' || c > '9') throw new Error(`bad talent rank '${c}' in ${talents}`);
      return Number(c);
    }),
  );
  const sum = (ranks: number[]) => ranks.reduce((a, b) => a + b, 0);
  return { trees, points: [sum(trees[0] ?? []), sum(trees[1] ?? []), sum(trees[2] ?? [])] };
}

/** Rank of every talent in `talents`, by wowsims field name (missing trailing digits are 0). */
function talentRanks(talents: string): Record<string, number> {
  const { trees } = parseTalentString(talents);
  const ranks: Record<string, number> = {};
  TALENT_ORDER.forEach((names, t) => {
    names.forEach((name, i) => {
      ranks[name] = trees[t]?.[i] ?? 0;
    });
  });
  return ranks;
}

const rank = talentRanks(destructionTalentString);
/** Rank of a talent of the author's build, by wowsims field name (0 when not taken). */
export function talentRank(name: string): number {
  return rank[name] ?? 0;
}
const r = talentRank;

/** wowsims warlock.go WarlockDestructionSpells, restricted to the spells defined in spells.ts. */
const DESTRUCTION_SPELLS = [...DESTRUCTION_SPELL_IDS];

/**
 * Demonic Sacrifice 1/1 with the Succubus sacrificed (applyDemonicSacrifice; tbc-new
 * ui/specs/warlock/dps/presets.ts DefaultOptions: summon Succubus, sacrificeSummon true):
 * SchoolDamageDealtMultiplier[shadow] x 1.15, direct and periodic. The export does not say
 * which pet the author sacrifices: the Succubus is an assumption (see docs, open questions).
 * UNVERIFIED (pet choice). Its own export so that `buildDestructionWarlock` (destruction.ts) can
 * leave exactly these objects out when the setup keeps the pet (`sacrificeSuccubus: false`).
 */
export const demonicSacrificeModifiers: readonly SpellModifier[] =
  r('demonicSacrifice') > 0 ? [{ schools: ['shadow'], damageMult: 1.15, dotDamageMult: 1.15 }] : [];

/**
 * The talent build as spell modifiers. Each entry cites wowsims tbc-new
 * sim/warlock/talents.go and the rank used; spell data values from spell_data_auto_gen.go.
 */
export const talentModifiers: SpellModifier[] = [
  // Cataclysm 5/5 (applyCataclysm): PowerCost_Pct_Add -0.01 x rank on Destruction spells.
  { spellIds: DESTRUCTION_SPELLS, manaCostMult: 1 - 0.01 * r('cataclysm') },
  // Bane 5/5 (applyBane): CastTime_Flat -100 ms x rank on Shadow Bolt and Immolate.
  { spellIds: ['shadow-bolt', 'immolate'], castTimeMsDelta: -100 * r('bane') },
  // Devastation 5/5 (applyDevastation): BonusCrit_Percent +rank on Destruction spells.
  { spellIds: DESTRUCTION_SPELLS, critPctDelta: r('devastation') },
  // Ruin 1/1 (applyRuin): CritMultiplier_Flat +1.0 on Destruction spells. sim/core/spell.go
  // CritDamageMultiplier: (1.5 - 1) x (1 + 1.0) + 1 = 2.0, i.e. +0.5 over the base 1.5.
  { spellIds: DESTRUCTION_SPELLS, critMultDelta: r('ruin') > 0 ? 0.5 : 0 },
  // Emberstorm 3/5 (applyEmberstorm; Emberstorm rank 3 = 17956): +2% x rank fire damage, direct
  // (SPELLMOD_DAMAGE) and periodic (SPELLMOD_DOT) alike; Incinerate cast time -2% x rank of 2500 ms.
  // wowsims' WarlockFireDamage mask also lists Shadowburn; that is a shadow spell, left out here.
  {
    schools: ['fire'],
    damageMult: 1 + 0.02 * r('emberstorm'),
    dotDamageMult: 1 + 0.02 * r('emberstorm'),
  },
  { spellIds: ['incinerate'], castTimeMsDelta: -2500 * 0.02 * r('emberstorm') },
  // Backlash 3/3 (applyBacklash): AddStat(SpellCritPercent, rank) -> +3% crit on every spell.
  // Its proc (instant Shadow Bolt after being hit) needs incoming attacks: not modeled.
  { critPctDelta: r('backlash') },
  // Shadow and Flame 5/5 (applyShadowAndFlame; ShadowAndFlame rank 5 = 30292, Value 20):
  // BonusCoeffecient_Flat +0.04 x rank on Shadow Bolt and Incinerate.
  { spellIds: ['shadow-bolt', 'incinerate'], coeffDelta: 0.04 * r('shadowAndFlame') },
  // Demonic Sacrifice (Succubus): see demonicSacrificeModifiers above (same objects).
  ...demonicSacrificeModifiers,
];
