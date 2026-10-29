import { buildSetup } from '../../../engine/gear';
import type { RawStats, SimSnapshot, SpellModifier, StatMultipliers } from '../../../engine/types';
import type { PriorityStep, SpecData } from '../../types';
import { warlockAuras } from './auras';
import { warlockSpells } from './spells';

// Destruction Warlock (Shadow Bolt build) for stage 1: the author's own character
// (docs/samples/wowsimsexporter-destruction-warlock.json: Gnome, level 70).
// Source unless noted: github.com/wowsims/tbc-new master @ 91f869a. See docs/data-sources.md,
// section "Task 12a", for every number, the talent translation and what is not modeled.

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
const r = (name: string): number => rank[name] ?? 0;

/** wowsims warlock.go WarlockDestructionSpells, restricted to the spells defined in spells.ts. */
const DESTRUCTION_SPELLS = ['shadow-bolt', 'immolate', 'incinerate', 'conflagrate', 'shadowburn'];

/**
 * The talent build as spell modifiers. Each entry cites wowsims tbc-new
 * sim/warlock/talents.go and the rank used; spell data values from spell_data_auto_gen.go.
 */
const talentModifiers: SpellModifier[] = [
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
  // Demonic Sacrifice 1/1 with the Succubus sacrificed (applyDemonicSacrifice; tbc-new
  // ui/specs/warlock/dps/presets.ts DefaultOptions: summon Succubus, sacrificeSummon true):
  // SchoolDamageDealtMultiplier[shadow] x 1.15, direct and periodic. The export does not say
  // which pet the author sacrifices: the Succubus is an assumption (see docs, open questions).
  // UNVERIFIED (pet choice).
  ...(r('demonicSacrifice') > 0
    ? [{ schools: ['shadow'], damageMult: 1.15, dotDamageMult: 1.15 } satisfies SpellModifier]
    : []),
];

/**
 * Flat stat bonuses of the build. Fel Armor rank 2 (spell_data_auto_gen.go FelArmor 28189:
 * A_MOD_DAMAGE_DONE 100) x Demonic Aegis 3/3 (armors.go: x (1 + 0.1 x rank)) = +130 spell damage;
 * the self buff is kept up all fight (tbc-new DefaultOptions armor: FelArmor, made permanent).
 */
const talentStatBonuses: Partial<RawStats> = {
  spellPower: 100 * (1 + 0.1 * r('demonicAegis')),
};

/**
 * Percentage stat effects of race and talents (applied by computeStats to the totals):
 * - Gnome Expansive Mind: sim/core/racials.go MultiplyStat(Intellect, 1.05).
 * - Demonic Embrace 5/5: talents.go applyDemonicEmbrace MultiplyStat(Spirit, 1 - 0.01 x rank)
 *   (its +3% stamina per rank is irrelevant here).
 * - Fel Intellect 3/3: talents.go applyFelIntellect MultiplyStat(Mana, 1 + 0.01 x rank).
 */
export const destructionStatMultipliers: StatMultipliers = {
  intellect: 1.05,
  spirit: 1 - 0.01 * r('demonicEmbrace'),
  maxMana: 1 + 0.01 * r('felIntellect'),
};

// ---------------------------------------------------------------------------
// Character base stats (no gear, no raid buffs)
// ---------------------------------------------------------------------------

/**
 * Level 70 Gnome Warlock before racial multipliers: sim/core/base_stats.go
 * ClassBaseStats[Warlock] (Intellect 133, Spirit 139) + RaceOffsets[Gnome] (Intellect +3,
 * Spirit 0); baseMana = base_stats_auto_gen.go ExtraClassBaseStats[Warlock] Mana 2615 (class
 * base mana excluding intellect, ruling R12). Base spell crit 1.7% is added by computeStats.
 * Strength, agility and stamina do not affect the simulated spells.
 */
export const destructionBaseStats: RawStats = {
  intellect: 133 + 3,
  spirit: 139,
  spellPower: 0,
  shadowPower: 0,
  firePower: 0,
  critRating: 0,
  hitRating: 0,
  hasteRating: 0,
  baseMana: 2615,
  mp5: 0,
};

// Task 12b replaces `equipped: []` and the empty tables with the author's gear.
const { setup: gearSetup } = buildSetup({
  baseStats: destructionBaseStats,
  equipped: [],
  items: {},
  gems: {},
  enchants: {},
});

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function spellDef(id: string) {
  const s = warlockSpells.find((x) => x.id === id);
  if (!s) throw new Error(`unknown warlock spell ${id}`);
  return s;
}

/** Base cast time plus the talents' flat cast time deltas (no haste: snapshots carry none). */
function talentCastTimeMs(id: string): number {
  const s = spellDef(id);
  let ms = s.castTimeMs;
  for (const m of talentModifiers) {
    if ((m.spellIds === undefined || m.spellIds.includes(id)) && (m.schools === undefined || m.schools.includes(s.school))) {
      ms += m.castTimeMsDelta ?? 0;
    }
  }
  return ms;
}

function auraDurationMs(id: string): number {
  const a = warlockAuras.find((x) => x.id === id);
  if (!a) throw new Error(`unknown warlock aura ${id}`);
  return a.durationMs;
}

const SHADOW_BOLT_CAST_MS = talentCastTimeMs('shadow-bolt'); // 2500
/** Shadow Bolt's cost after Cataclysm: below it the filler cannot be cast. */
const SHADOW_BOLT_COST = spellDef('shadow-bolt').manaCost * (1 - 0.01 * r('cataclysm')); // 399

const remainingFightMs = (s: SimSnapshot) => s.durationMs - s.nowMs;
const targetAuraMs = (s: SimSnapshot, id: string) => s.targetAuras[id]?.remainingMs ?? 0;

/**
 * tbc-new ui/specs/warlock/dps/apls/destruction.apl.json "Should Cast Immolate": refresh when
 * the DoT's remaining time <= the spell's cast time and the fight lasts at least cast time +
 * DoT duration longer. Reused for Corruption (UNVERIFIED: the tbc-new APL does not cast it).
 */
function dotRefreshDue(spellId: string, auraId: string) {
  const castMs = talentCastTimeMs(spellId);
  const durationMs = auraDurationMs(auraId);
  return (s: SimSnapshot) =>
    targetAuraMs(s, auraId) <= castMs && remainingFightMs(s) >= castMs + durationMs;
}

/**
 * Shadow (Shadow Bolt) Destruction priority. Order and rules from tbc-new destruction.apl.json
 * (assigned curse, Shadowburn as a finisher, Immolate, Shadow Bolt, Life Tap when nothing else
 * can be cast) plus Corruption from old wowsims/tbc sim/warlock/rotations.go
 * (`Rotation.Corruption && !CorruptionDot.IsActive()`, before the main spell). Conflagrate is not
 * listed: the author's build has no Conflagrate talent.
 */
const priority: PriorityStep[] = [
  {
    // APL group "Cast Curse": castWarlockAssignedCurse when the assigned curse is not active.
    // UNVERIFIED (choice): Curse of the Elements as the assigned curse (tbc-new defaults to
    // Recklessness for raids); Curse of Doom's one tick at 60 s rarely fits a 60 s fight.
    spellId: 'curse-of-the-elements',
    label: 'Curse of the Elements',
    hint: 'Keep Curse of the Elements on the target: +10% fire and shadow damage taken.',
    when: (s) => s.targetAuras['curse-of-the-elements'] === undefined,
  },
  {
    // APL "Should Cast Shadow Burn": remaining fight time <= Shadow Bolt cast time (+ travel).
    spellId: 'shadowburn',
    label: 'Shadowburn (finisher)',
    hint: 'In the last Shadow Bolt cast time of the fight, finish with instant Shadowburn.',
    when: (s) => remainingFightMs(s) <= SHADOW_BOLT_CAST_MS,
  },
  {
    spellId: 'immolate',
    label: 'Immolate',
    hint: 'Refresh Immolate when it has less than its cast time left and the fight outlasts the new DoT.',
    when: dotRefreshDue('immolate', 'immolate'),
  },
  {
    // UNVERIFIED: wowsims/tbc rotations.go option; tbc-new's Destruction APL does not cast it.
    spellId: 'corruption',
    label: 'Corruption',
    hint: 'Keep Corruption ticking while a full 18 s DoT still fits in the fight.',
    when: dotRefreshDue('corruption', 'corruption'),
  },
  {
    // APL: Life Tap is the last action, cast when nothing else can be (out of mana).
    spellId: 'life-tap',
    label: 'Life Tap',
    hint: 'Out of mana for Shadow Bolt: Life Tap converts health into mana.',
    when: (s) => s.mana < SHADOW_BOLT_COST,
  },
  {
    spellId: 'shadow-bolt',
    label: 'Shadow Bolt',
    hint: 'Filler: cast Shadow Bolt; its crits apply Improved Shadow Bolt (+20% shadow damage).',
  },
];

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

export const destructionWarlock: SpecData = {
  id: 'destruction-warlock',
  name: 'Destruction Warlock',
  spells: warlockSpells,
  auras: warlockAuras,
  modifiers: talentModifiers,
  statBonuses: talentStatBonuses,
  sets: [],
  setup: { ...gearSetup, statMultipliers: destructionStatMultipliers },
  priority,
  // Action bar slots 1-9, 0, -, =.
  keybinds: [
    'shadow-bolt',
    'immolate',
    'corruption',
    'curse-of-the-elements',
    'shadowburn',
    'life-tap',
    'incinerate',
    'conflagrate',
    'curse-of-agony',
    'curse-of-doom',
    '',
    '',
  ],
  hooks: {
    // Improved Shadow Bolt 5/5 (shadowbolt.go): a landed Shadow Bolt crit (re)applies the
    // debuff with all 4 charges (SetStacks(4)); it runs after the crit's own damage.
    onSpellResolved(e, api) {
      if (r('improvedShadowBolt') > 0 && e.spellId === 'shadow-bolt' && e.outcome === 'crit') {
        api.applyTargetAura('shadow-vulnerability');
      }
    },
  },
};
