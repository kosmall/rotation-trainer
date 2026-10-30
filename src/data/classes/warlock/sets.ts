import type { AuraDef, School, SetBonusDef, SpecHooks } from '../../../engine/types';
import { BAND_PROC_SPELL_IDS } from './buffs';
import { warlockSpells } from './spells';

// Set bonuses of the sets in the item database that matter to a Destruction Warlock (stage 2a):
// the warlock tiers T4 Voidheart, T5 Corruptor, T6 Malefic (also the ZA and Sunwell gear: the
// Sunwell bracers, belt and boots are Malefic pieces), the caster sets of the wowsims warlock
// presets (Mana-Etched, Spellstrike, Wrath of Spellfire, Shadow's Embrace) and the other cloth
// caster sets of the database (Oblivion, the Netherweave sets, Soulcloth, Primal Mooncloth,
// Battlecast, Whitemend). What the engine can express (flat stats, spell modifiers, hooks with
// self auras) is in `WARLOCK_SET_BONUSES`; the rest is in `UNMODELLED_SETS` with the reason.
// `warlockSets` (the stage 1 list: the Malefic bonuses of the author's gear) keeps its identity:
// a spec gets the bonuses of the sets its gear wears (`setBonusesFor`), which for the author's
// gear is `warlockSets` itself.
// Sources: github.com/wowsims/tbc-new master @ 91f869a sim/warlock/items.go (warlock tiers) and
// sim/common/tbc/items_sets.go (cloth sets); the descriptions are the Wowhead TBC item-set tooltip
// text (https://www.wowhead.com/tbc/item-set=<id>: 645 Voidheart, 646 Corruptor, 670 Malefic,
// 658 Mana-Etched, 559 Spellstrike, 552 Wrath of Spellfire, 553 Shadow's Embrace, 644 Oblivion,
// 555 Netherweave Vestments, 556 Imbued Netherweave, 557 Soulcloth Embrace, 554 Primal Mooncloth,
// 572 Battlecast Garb, 571 Whitemend Wisdom). See docs/data-sources.md, "Task 12b" and Part E.
// The set ids are the slugs of the database's set names (src/data/items/types.ts `setName`).

/** Flameshadow (Voidheart 2pc, shadow spells): +135 shadow damage for 15 s. */
export const VOIDHEART_SHADOW_AURA_ID = 'voidheart-flameshadow';
/** Shadowflame (Voidheart 2pc, fire spells): +135 fire damage for 15 s. */
export const VOIDHEART_FIRE_AURA_ID = 'voidheart-shadowflame';
/** Lesser Spell Blasting (Spellstrike 2pc): +92 spell damage for 10 s. */
export const SPELLSTRIKE_AURA_ID = 'spellstrike-lesser-spell-blasting';
/** Insight (Mana-Etched 4pc): +110 spell damage for 15 s. */
export const MANA_ETCHED_INSIGHT_AURA_ID = 'mana-etched-insight';

/**
 * The self auras the set bonus hooks apply (`GearSetBonus.auras`). A spec has them when its gear
 * wears the set (`buildDestructionWarlock`).
 */
export const warlockSetAuras: readonly AuraDef[] = [
  {
    // items.go Voidheart 2pc: NewTemporaryStatsAura("Flameshadow", SpellID 37379, ShadowDamage 135,
    // 15 s). Wowhead TBC spell=37379 "Shadow damage increased by up to 135." (15 seconds).
    id: VOIDHEART_SHADOW_AURA_ID,
    name: 'Flameshadow',
    icon: 'spell_shadow_shadowfury',
    wowheadId: 37379,
    durationMs: 15000,
    selfStatBonuses: { shadowPower: 135 },
  },
  {
    // items.go Voidheart 2pc: FireDamage 135, 15 s (wowsims labels it with spell 39437, the
    // trigger). The buff itself is Wowhead TBC spell=37378 "Shadowflame": "Fire damage increased by
    // up to 135." (15 seconds).
    id: VOIDHEART_FIRE_AURA_ID,
    name: 'Shadowflame',
    icon: 'spell_shadow_shadowandflame',
    wowheadId: 37378,
    durationMs: 15000,
    selfStatBonuses: { firePower: 135 },
  },
  {
    // items_sets.go Spellstrike 2pc: NewTemporaryStatsAura("Lesser Spell Blasting", SpellID 32108,
    // SpellDamage 92, 10 s). Wowhead TBC spell=32108 "Spell effects increased by 92." (10 seconds).
    id: SPELLSTRIKE_AURA_ID,
    name: 'Lesser Spell Blasting',
    icon: 'spell_lightning_lightningbolt01',
    wowheadId: 32108,
    durationMs: 10000,
    selfStatBonuses: { spellPower: 92 },
  },
  {
    // items_sets.go Mana-Etched 4pc: NewTemporaryStatsAura("Spell Power Bonus", SpellID 37619,
    // SpellDamage 110, 15 s). The buff is Wowhead TBC spell=37620 "Insight": "Increases you spell
    // damage and healing by up to 110." (15 seconds); 37619 is the trigger (no icon on Wowhead).
    id: MANA_ETCHED_INSIGHT_AURA_ID,
    name: 'Insight',
    icon: 'spell_arcane_blink',
    wowheadId: 37620,
    durationMs: 15000,
    selfStatBonuses: { spellPower: 110 },
  },
];

const SPELL_SCHOOL: ReadonlyMap<string, School> = new Map(warlockSpells.map((s) => [s.id, s.school]));

/**
 * Voidheart 2pc (items.go: ProcChance 0.05, CallbackOnSpellHitDealt, RequireDamageDealt): a spell
 * hit that deals damage rolls once; a shadow spell gives Flameshadow, a fire spell Shadowflame.
 * DoT ticks never run hooks (wowsims: periodic damage is a different callback, so no proc there
 * either); a miss or a spell without direct damage (Corruption's application, the curses, Life
 * Tap) deals none: no roll.
 */
const VOIDHEART_PROC_CHANCE = 0.05;
const voidheartHooks: SpecHooks = {
  onSpellResolved(e, api) {
    if (e.outcome === 'miss' || !(e.damage > 0)) return;
    const school = SPELL_SCHOOL.get(e.spellId);
    if (school !== 'shadow' && school !== 'fire') return;
    if (api.roll() < VOIDHEART_PROC_CHANCE) {
      api.applySelfAura(school === 'shadow' ? VOIDHEART_SHADOW_AURA_ID : VOIDHEART_FIRE_AURA_ID);
    }
  },
};

/**
 * Spellstrike 2pc (items_sets.go: ProcChance 0.05, ProcMaskSpellDamage, CallbackOnSpellHitDealt,
 * class spells only). The tooltip says "when your harmful spells land": the damaging spells of
 * the Band of the Eternal Sage (`BAND_PROC_SPELL_IDS`: a direct part or a DoT; Life Tap and Curse
 * of the Elements never) that do not miss. wowsims sets no outcome filter, so it also rolls on a
 * miss there; the trainer follows the tooltip.
 */
const SPELLSTRIKE_PROC_CHANCE = 0.05;
const spellstrikeHooks: SpecHooks = {
  onSpellResolved(e, api) {
    if (e.outcome === 'miss' || !BAND_PROC_SPELL_IDS.includes(e.spellId)) return;
    if (api.roll() < SPELLSTRIKE_PROC_CHANCE) api.applySelfAura(SPELLSTRIKE_AURA_ID);
  },
};

/**
 * Mana-Etched 4pc (items_sets.go: ProcChance 0.02, ProcMaskSpellDamage, CallbackOnSpellHitDealt,
 * no outcome filter): any damaging spell (`BAND_PROC_SPELL_IDS`), a miss included, rolls once.
 * Tooltip: "Your harmful spells have a chance".
 */
const MANA_ETCHED_PROC_CHANCE = 0.02;
const manaEtchedHooks: SpecHooks = {
  onSpellResolved(e, api) {
    if (!BAND_PROC_SPELL_IDS.includes(e.spellId)) return;
    if (api.roll() < MANA_ETCHED_PROC_CHANCE) api.applySelfAura(MANA_ETCHED_INSIGHT_AURA_ID);
  },
};

/** A set bonus with the self auras its hooks apply (the spec needs them among its auras). */
export interface GearSetBonus extends SetBonusDef {
  auras?: readonly AuraDef[];
}

const setAura = (id: string): AuraDef => {
  const a = warlockSetAuras.find((x) => x.id === id);
  if (!a) throw new Error(`unknown set aura ${id}`);
  return a;
};

/**
 * The stage 1 set bonuses: Malefic Raiment (T6), the set of the author's gear. Also the first
 * two entries of `WARLOCK_SET_BONUSES` (same objects).
 */
export const warlockSets: SetBonusDef[] = [
  {
    // T6 2pc (items.go ItemSetMaleficRaiment ID 670, bonus 2: "Dot Heals" 38394): GainHealth(70)
    // on every Corruption/Immolate periodic tick. No damage effect: the engine has no health, so
    // nothing is encoded. Kept so the UI can list the active bonus.
    setId: 'malefic-raiment',
    name: 'Malefic Raiment (2)',
    pieces: 2,
    description: 'Each time one of your Corruption or Immolate spells deals periodic damage, you heal 70 health.',
  },
  {
    // T6 4pc (items.go bonus 4, spell 38393): SpellMod_DamageDone_Flat +0.06 on Shadow Bolt and
    // Incinerate. wowsims adds it to the additive damage multiplier; the engine multiplies. For
    // Shadow Bolt the result is the same (no other additive damage modifier in this build:
    // Demonic Sacrifice is a school multiplier). For Incinerate wowsims gives 1 + 0.06 + 0.06
    // (Emberstorm 3/5) = 1.12, the engine 1.06 x 1.06 = 1.1236 (+0.3%; Incinerate is not in the
    // priority). Open question in docs.
    setId: 'malefic-raiment',
    name: 'Malefic Raiment (4)',
    pieces: 4,
    description: 'Increases the damage dealt by your Shadow Bolt and Incinerate abilities by 6%.',
    modifiers: [{ spellIds: ['shadow-bolt', 'incinerate'], damageMult: 1.06 }],
  },
];

/** Every modelled set bonus of the database's warlock-relevant sets, Malefic first. */
export const WARLOCK_SET_BONUSES: readonly GearSetBonus[] = [
  ...warlockSets,
  {
    // T4 2pc (items.go ItemSetVoidheartRaiment ID 645, bonus 2; spells 37377/39437): see
    // `voidheartHooks` and the auras Flameshadow / Shadowflame.
    setId: 'voidheart-raiment',
    name: 'Voidheart Raiment (2)',
    pieces: 2,
    description:
      'Your shadow damage spells have a chance to grant you 135 bonus shadow damage for 15 sec. Your fire damage spells have a chance to grant you 135 bonus fire damage for 15 sec. (Proc chance: 5%)',
    hooks: voidheartHooks,
    auras: [setAura(VOIDHEART_SHADOW_AURA_ID), setAura(VOIDHEART_FIRE_AURA_ID)],
  },
  {
    // T4 4pc (items.go ItemSetVoidheartRaiment bonus 4, "Improved Corruption and Immolate" 37380):
    // SpellModConfig{Kind: SpellMod_DotNumberOfTicks_Flat, IntValue: 1, ClassMask:
    // WarlockSpellCorruption | WarlockSpellImmolateDot}: one more tick of each DoT. Both tick every
    // 3 s (auras.ts; Wowhead TBC spell=27216 "150 Shadow damage every 3 seconds", spell=27215 "123
    // Fire damage every 3 seconds"), so +3 s = +1 tick: Corruption 18 -> 21 s (7 ticks), Immolate
    // 15 -> 18 s (6 ticks). wowsims snapshots a fixed base per tick (corruption.go / immolate.go
    // `dot.Snapshot(target, TickBaseDamage)`) with a per-tick coefficient, so the extra tick is a
    // full tick (+1/6 Corruption, +1/5 Immolate DoT damage per full cast), as the engine's
    // `dotExtraTicks` does. Tooltip: Wowhead TBC spell=37380.
    setId: 'voidheart-raiment',
    name: 'Voidheart Raiment (4)',
    pieces: 4,
    description: 'Increases the duration of your Corruption and Immolate abilities by 3 sec.',
    modifiers: [{ spellIds: ['corruption', 'immolate'], dotExtraTicks: 1 }],
  },
  {
    // Dungeon set 3 (items_sets.go ItemSetManaEtchedRegalia ID 658, bonus 2, spell 37607):
    // AttachStatBuff(SpellHitRating, 35).
    setId: 'mana-etched-regalia',
    name: 'Mana-Etched Regalia (2)',
    pieces: 2,
    description: 'Increases your spell hit rating by 35.',
    statBonuses: { hitRating: 35 },
  },
  {
    // items_sets.go Mana-Etched bonus 4 (spell 37619): see `manaEtchedHooks` and the aura Insight.
    setId: 'mana-etched-regalia',
    name: 'Mana-Etched Regalia (4)',
    pieces: 4,
    description:
      'Your harmful spells have a chance to grant you up to 110 spell damage and healing for 15 sec. (Proc chance: 2%)',
    hooks: manaEtchedHooks,
    auras: [setAura(MANA_ETCHED_INSIGHT_AURA_ID)],
  },
  {
    // Tailoring (items_sets.go ItemSetSpellstrikeInfusion ID 559, bonus 2, spell 32106): see
    // `spellstrikeHooks` and the aura Lesser Spell Blasting.
    setId: 'spellstrike-infusion',
    name: 'Spellstrike Infusion (2)',
    pieces: 2,
    description:
      'Gives a chance when your harmful spells land to increase the damage of your spells and effects by 92 for 10 sec. (Proc chance: 5%)',
    hooks: spellstrikeHooks,
    auras: [setAura(SPELLSTRIKE_AURA_ID)],
  },
  {
    // Tailoring (items_sets.go ItemSetNetherweaveVestments ID 555, bonus 2): SpellDamage 23 (and
    // HealingPower 23, not modelled).
    setId: 'netherweave-vestments',
    name: 'Netherweave Vestments (2)',
    pieces: 2,
    description: 'Increases damage and healing done by magical spells and effects by up to 23.',
    statBonuses: { spellPower: 23 },
  },
  {
    // items_sets.go Netherweave Vestments bonus 4: AttachStatBuff(SpellCritRating, 14).
    setId: 'netherweave-vestments',
    name: 'Netherweave Vestments (4)',
    pieces: 4,
    description: 'Increases your spell critical strike rating by 14.',
    statBonuses: { critRating: 14 },
  },
  {
    // Tailoring (items_sets.go ItemSetImbuedNetherweave ID 556, bonus 3): SpellCritRating 28.
    setId: 'imbued-netherweave',
    name: 'Imbued Netherweave (3)',
    pieces: 3,
    description: 'Increases your spell critical strike rating by 28.',
    statBonuses: { critRating: 28 },
  },
  {
    // Tailoring (items_sets.go ItemSetSoulclothEmbrace ID 557, bonus 3): SpellHitRating 16.
    setId: 'soulcloth-embrace',
    name: 'Soulcloth Embrace (3)',
    pieces: 3,
    description: 'Increases your spell hit rating by 16.',
    statBonuses: { hitRating: 16 },
  },
];

/**
 * The set bonuses for a spec: every modelled bonus (`WARLOCK_SET_BONUSES`, in its order) of a
 * set worn with at least one piece, so the set bonus panel lists the sets of the gear (active or
 * not). When that is exactly the stage 1 list (the author's gear: Malefic), `warlockSets` itself.
 */
export function setBonusesFor(setPieces: Readonly<Record<string, number>>): GearSetBonus[] {
  const worn = WARLOCK_SET_BONUSES.filter((b) => (Object.hasOwn(setPieces, b.setId) ? setPieces[b.setId]! : 0) >= 1);
  const isStage1 = worn.length === warlockSets.length && worn.every((b, i) => b === warlockSets[i]);
  return isStage1 ? warlockSets : worn;
}

/** A set bonus of the database that the trainer does not model, and why. */
export interface UnmodelledSetBonus {
  setId: string;
  name: string;
  pieces: number;
  /** The game's tooltip text (Wowhead TBC). */
  description: string;
  /** Why it is not modelled (what it does to the simulated fight, if anything). */
  reason: string;
  source: string;
}

const ITEMS_GO = 'wowsims/tbc-new sim/warlock/items.go';
const ITEMS_SETS_GO = 'wowsims/tbc-new sim/common/tbc/items_sets.go';

/**
 * Set bonuses that matter to a warlock's gear but are not modelled. `describeGear`
 * (src/setup/gear.ts) lists the worn ones; a worn set (2+ pieces) found in neither this list nor
 * `warlockSets` is listed as "not reviewed".
 */
export const UNMODELLED_SETS: readonly UnmodelledSetBonus[] = [
  {
    setId: 'corruptor-raiment',
    name: 'Corruptor Raiment (2)',
    pieces: 2,
    description: 'Causes your pet to be healed for 15% of the damage you deal.',
    reason: 'Pet healing: no pet is simulated. No effect on the damage.',
    source: `${ITEMS_GO} ItemSetCorruptorRaiment bonus 2 (37381); https://www.wowhead.com/tbc/item-set=646`,
  },
  {
    setId: 'corruptor-raiment',
    name: 'Corruptor Raiment (4)',
    pieces: 4,
    description:
      'Your Shadowbolt spell hits increase the damage of Corruption by 10% and your Incinerate spell hits increase the damage of Immolate by 10%.',
    reason:
      "Each landed Shadow Bolt multiplies the base damage of the running Corruption's ticks by 1.1 (stacking until the DoT is reapplied; the spell power part keeps its snapshot; Incinerate the same for Immolate). The engine cannot change a DoT already on the target, so the bonus is missing: this gear deals less Corruption damage than in the game.",
    source: `${ITEMS_GO} ItemSetCorruptorRaiment bonus 4 (37384); https://www.wowhead.com/tbc/item-set=646`,
  },
  {
    setId: 'wrath-of-spellfire',
    name: 'Wrath of Spellfire (3)',
    pieces: 3,
    description: 'Increases spell damage by up to 7% of your total Intellect.',
    reason:
      'A spell damage bonus that follows total intellect (wowsims NewDynamicStatDependency Intellect -> SpellDamage 0.07). The engine has flat stats and stat multipliers, no conversion between stats: the spell power is missing (about 35 for a typical 500 intellect).',
    source: `${ITEMS_SETS_GO} ItemSetWrathOfSpellfire (552); https://www.wowhead.com/tbc/item-set=552`,
  },
  {
    setId: 'shadows-embrace',
    name: "Shadow's Embrace (3)",
    pieces: 3,
    description: 'Your Frost and Shadow damage spells heal you for 2% of the damage they deal.',
    reason: 'Self healing: the trainer has no health. No effect on the damage (wowsims: TODO, not modelled either).',
    source: `${ITEMS_SETS_GO} ItemSetShadowsEmbrace; https://www.wowhead.com/tbc/item-set=553`,
  },
  {
    setId: 'oblivion-raiment',
    name: 'Oblivion Raiment (2)',
    pieces: 2,
    description: 'Grants your pet 45 mana per 5 sec.',
    reason: 'Pet mana: no pet is simulated. No effect on the damage.',
    source: `${ITEMS_GO} ItemSetOblivionRaiment bonus 2 (37375); https://www.wowhead.com/tbc/item-set=644`,
  },
  {
    setId: 'oblivion-raiment',
    name: 'Oblivion Raiment (4)',
    pieces: 4,
    description: 'Your Seed of Corruption deals 180 additional damage when it detonates.',
    reason: 'Seed of Corruption is not in the trainer\'s spell book (single target). No effect.',
    source: `${ITEMS_GO} ItemSetOblivionRaiment bonus 4 (37376); https://www.wowhead.com/tbc/item-set=644`,
  },
  {
    setId: 'primal-mooncloth',
    name: 'Primal Mooncloth (3)',
    pieces: 3,
    description: 'Allow 5% of your Mana regeneration to continue while casting.',
    reason:
      'Spirit regeneration while casting (wowsims PseudoStats.SpiritRegenRateCasting +0.05): the engine has no casting regeneration rate. Only mana is affected, never the damage per cast.',
    source: `${ITEMS_SETS_GO} ItemSetPrimalMooncloth (554); https://www.wowhead.com/tbc/item-set=554`,
  },
  {
    setId: 'battlecast-garb',
    name: 'Battlecast Garb (2)',
    pieces: 2,
    description: 'Increases the chance spell pushback and spell interrupt will be resisted by 5%.',
    reason: 'Pushback and interrupts are not simulated (wowsims: not modelled either). No effect.',
    source: `${ITEMS_SETS_GO} ItemSetBattlecastGarb (572); https://www.wowhead.com/tbc/item-set=572`,
  },
  {
    setId: 'whitemend-wisdom',
    name: 'Whitemend Wisdom (2)',
    pieces: 2,
    description: 'Increases healing by up to 10% of your total Intellect.',
    reason: 'Healing only. No effect on the damage.',
    source: `${ITEMS_SETS_GO} ItemSetWhitemendWisdom (571); https://www.wowhead.com/tbc/item-set=571`,
  },
];
