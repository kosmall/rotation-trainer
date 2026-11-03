import type { SpellModifier } from '../../../engine/types';
import { effectsForBuild } from './talentEffects';

// The talent tree data and the validating codec (pure, never throws) live in talentTree.ts;
// re-exported here for the modules that already import talents from this file.
export {
  TALENT_POINTS_MAX,
  TALENT_TREE,
  canAddPoint,
  canRemovePoint,
  decodeTalents,
  encodeTalents,
  talentById,
  validateTalents,
} from './talentTree';
export type { DecodedTalents, TalentCheck, TalentDef, TalentRanks } from './talentTree';

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
 * WarlockTalents fields 1-64). Kept by hand: tests/data/talent-tree.test.ts checks that the generated
 * TALENT_TREE (talentTree.json) has exactly this order.
 */
export const TALENT_ORDER: readonly (readonly string[])[] = [
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

/**
 * Splits a Wowhead/wowsims talent string into per-tree ranks and point totals. Throws on a
 * malformed string (trusted constants only); untrusted strings go through `decodeTalents`.
 */
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
/**
 * The author's talents as the stage 1 spell modifiers, now computed from the data
 * (talentEffects.ts `effectsForBuild`): Cataclysm, Bane, Devastation, Ruin, Emberstorm (2),
 * Backlash, Shadow and Flame, Demonic Sacrifice, in that order (pinned literally in
 * tests/data/talent-effects.test.ts). Kept for importers; specs use `effectsForBuild`.
 */
const authorEffects = effectsForBuild(rank);
export const talentModifiers: SpellModifier[] = authorEffects.modifiers;

/**
 * Demonic Sacrifice's entries of `talentModifiers` (the same objects): Succubus, shadow x1.15
 * direct and periodic (talentEffects.ts). Kept for importers.
 */
export const demonicSacrificeModifiers: readonly SpellModifier[] = talentModifiers.filter(
  (_, i) => authorEffects.modifierSources[i] === 'demonicSacrifice',
);

/** The spells the author's talents make available (Shadowburn). */
export const authorTalentSpells: readonly string[] = authorEffects.spells;
