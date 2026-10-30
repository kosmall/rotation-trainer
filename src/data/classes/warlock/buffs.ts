// Warlock side of the setup catalog (stage 1.5 Part C): how the raid's debuffs relate to the
// warlock's own auras, the descriptions of the warlock options for the setup panel (see
// docs/data-sources.md, "Part C: consumables, debuffs and warlock options"), and the effects of
// the warlock's equipped items (see "Part C: cooldowns and item effects").

import type { AuraDef } from '../../../engine/types';
import { deepFreeze, itemAction } from '../../common/buffs';
import type { BuffDef } from '../../types';
import { warlockAuras } from './auras';
import type { WarlockOptions } from './destruction';
import { warlockSpells } from './spells';

/**
 * Raid debuff (catalog id, `src/data/common/buffs.ts` `debuffs`) -> the player's own target
 * auras whose damage multiplier it replaces. In the game (and in wowsims) these never stack:
 * - Curse of the Elements: wowsims tbc-new sim/core/debuffs.go `CurseOfElementsAura` registers
 *   the exclusive effect "CurseOfElements" for both the external and the self curse, so only the
 *   strongest one applies (ruling S1).
 * - Improved Shadow Bolt: debuffs.go `ImprovedShadowBoltAura` uses one aura label
 *   ("ImprovedShadowBolt-5") for the raid's and the player's own, so there is one x1.2 multiplier
 *   (ruling S2).
 * The raid aura and the own aura are separate auras in the trainer (the own curse keeps its
 * curse slot, the own Shadow Vulnerability is still applied by Shadow Bolt crits): while the raid
 * debuff is enabled, `applySetup` (Task 9) passes the spec's auras through `neutralizeOwnAuras`
 * so that the own aura multiplies by 1 and only the raid one counts.
 */
export const NEUTRALIZED_BY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'raid-curse-of-the-elements': Object.freeze(['curse-of-the-elements']),
  'isb-from-others': Object.freeze(['shadow-vulnerability']),
});

/**
 * The spec's auras with the own auras named by `NEUTRALIZED_BY` for the enabled buffs turned into
 * no-ops for damage: a copy whose `damageTakenMult.mult` is 1 (schools, charges and charge
 * consumption kept, so the aura still shows and still spends its charges as before). Every other
 * def is returned as is (same object). Pure: the input array and its defs are never mutated;
 * unknown buff ids are ignored.
 */
export function neutralizeOwnAuras(auras: readonly AuraDef[], enabledBuffIds: readonly string[]): AuraDef[] {
  const neutral = new Set(enabledBuffIds.flatMap((id) => (Object.hasOwn(NEUTRALIZED_BY, id) ? NEUTRALIZED_BY[id]! : [])));
  return auras.map((a) =>
    neutral.has(a.id) && a.damageTakenMult ? { ...a, damageTakenMult: { ...a.damageTakenMult, mult: 1 } } : a,
  );
}

/** What the setup panel shows for one warlock option. */
export interface WarlockOptionInfo {
  name: string;
  /** Icon of the self buff ('' when the option has none). */
  icon: string;
  /** Wowhead (TBC) spell id of the icon. */
  wowheadId?: number;
  description: string;
  source: string;
}

/** The armor choices of `WarlockOptions.armor`. */
export const WARLOCK_ARMOR_OPTIONS: Readonly<Record<WarlockOptions['armor'], Readonly<WarlockOptionInfo>>> =
  Object.freeze({
    fel: Object.freeze({
      name: 'Fel Armor',
      icon: 'spell_shadow_felarmour',
      wowheadId: 28189,
      description: '+130 spell power: Fel Armor rank 2 (+100) x Demonic Aegis 3/3 (x1.3). Stage 1 default.',
      // spell_data_auto_gen.go FelArmor 28189 A_MOD_DAMAGE_DONE 100; armors.go x (1 + 0.1 x Demonic Aegis).
      source:
        'wowsims/tbc-new sim/warlock/spell_data_auto_gen.go FelArmor 28189, sim/warlock/armors.go; https://www.wowhead.com/tbc/spell=28189',
    }),
    demon: Object.freeze({
      name: 'Demon Armor',
      icon: 'spell_shadow_ragingscream',
      wowheadId: 27260,
      description:
        'No effect on the simulated damage or mana: armor, shadow resistance and health regeneration only.',
      // Wowhead TBC spell=27260: armor +660, Shadow resistance +18, 18 health every 5 sec.
      source: 'https://www.wowhead.com/tbc/spell=27260',
    }),
    none: Object.freeze({
      name: 'No armor',
      icon: '',
      description: 'No armor self buff: no spell power from it.',
      source: 'no effect',
    }),
  });

/** `WarlockOptions.sacrificeSuccubus`. */
export const SACRIFICE_SUCCUBUS_OPTION: Readonly<WarlockOptionInfo> = Object.freeze({
  name: 'Sacrifice the Succubus (Demonic Sacrifice)',
  icon: 'spell_shadow_psychicscream',
  wowheadId: 18791,
  description:
    "Touch of Shadow: shadow damage x1.15 (direct and periodic). Off: the pet is kept and no bonus applies (the pet's own damage is not simulated). Stage 1 default: on.",
  // talents.go applyDemonicSacrifice: SchoolDamageDealtMultiplier[shadow] x 1.15 (Succubus);
  // Wowhead TBC spell=18791 Touch of Shadow.
  source: 'wowsims/tbc-new sim/warlock/talents.go applyDemonicSacrifice; https://www.wowhead.com/tbc/spell=18791',
});

// ===========================================================================
// Item effects of the equipped gear (stage 1.5 Task 8, group 'item')
// Both items are in the default gear (destruction.ts `destructionEquipped`: 29370 trinket, 29305
// ring) and their equip stats (Icon +43 spell damage; Band +25 int, +34 spell damage, +24 crit
// rating) are already in the gear stats. These entries add ONLY the on-use / proc buff, so
// nothing is counted twice. The Icon is an item action (pressed from the item row; stage 1.5
// scheduled it at a configurable second: superseded, see docs/data-sources.md "Part D: item
// actions"). Values: wowsims/tbc-new @ 91f869a assets/database/db.json
// `itemEffects` of the items (read by sim/common/tbc/stat_bonus_cds_auto_gen.go and
// stat_bonus_procs_auto_gen.go), cross-checked with Wowhead TBC tooltips; durations and the
// internal cooldown are checkpoints of the author's Naj'entus log. Every aura here is its own
// object (the catalog is deep-frozen).
// ===========================================================================

/** Band of the Eternal Sage: proc chance per roll (db.json item 29305 `proc.procChance` 0.1). */
export const BAND_PROC_CHANCE = 0.1;
/** Band of the Eternal Sage: internal cooldown (db.json `proc.icdMs` 60000; author's log: 60 s). */
export const BAND_ICD_MS = 60000;
/** Id of the Band's hidden internal-cooldown aura. */
export const BAND_ICD_AURA_ID = 'band-of-the-eternal-sage-icd';

/**
 * The warlock spells that can proc the Band: the "offensive spells" that deal damage (a direct
 * part, or a DoT applied on the target). Life Tap (no target) and Curse of the Elements (no damage)
 * never do. Derived from the spell and aura data, so a new damaging spell is included.
 */
export const BAND_PROC_SPELL_IDS: readonly string[] = Object.freeze(
  warlockSpells
    .filter((s) => s.direct !== undefined || warlockAuras.some((a) => a.id === s.applyAura?.auraId && a.tick !== undefined))
    .map((s) => s.id),
);

export const warlockItemBuffs: readonly BuffDef[] = deepFreeze<BuffDef[]>([
  {
    id: 'icon-of-the-silver-crescent',
    name: 'Icon of the Silver Crescent',
    icon: 'inv_trinket_naxxramas06',
    wowheadId: 35163,
    group: 'item',
    description:
      "On use (item bar): +155 spell power for 20 s (author's log: 20 s). 2 min cooldown; other on-use trinkets are blocked for 20 s. Its equip +43 spell power is already in the gear.",
    // db.json item 29370 itemEffects: buffId 35163 "Blessing of the Silver Crescent",
    // effectDurationMs 20000, stats SpellDamage 155, onUse { cooldownMs 120000, categoryId 1141,
    // categoryCooldownMs 20000 } (the shared trinket category); stat_bonus_cds_auto_gen.go
    // NewSimpleStatActive(29370). Wowhead TBC spell=35163 "Increases damage and healing done by
    // magical spells and effects by up to 155 for 20 sec.", item=29370 "(2 Min Cooldown)".
    source:
      "wowsims/tbc-new sim/common/tbc/stat_bonus_cds_auto_gen.go NewSimpleStatActive(29370) + assets/database/db.json item 29370; https://www.wowhead.com/tbc/spell=35163; author's log",
    effect: {
      // Used from the item row: applies the aura below; no `timed` (the player chooses when).
      action: itemAction({
        id: 'use-icon-of-the-silver-crescent',
        name: 'Icon of the Silver Crescent',
        icon: 'inv_trinket_naxxramas06',
        wowheadId: 35163,
        cooldownMs: 120000, // db.json onUse cooldownMs
        sharedCooldown: { group: 'trinket', ms: 20000 }, // db.json onUse categoryId 1141, categoryCooldownMs
        applyAura: { auraId: 'icon-of-the-silver-crescent', on: 'self' },
      }),
      selfAura: {
        id: 'icon-of-the-silver-crescent',
        name: 'Blessing of the Silver Crescent',
        icon: 'inv_trinket_naxxramas06',
        wowheadId: 35163,
        durationMs: 20000,
        selfStatBonuses: { spellPower: 155 },
      },
    },
  },
  {
    id: 'band-of-the-eternal-sage',
    name: 'Band of the Eternal Sage',
    icon: 'spell_holy_mindvision',
    wowheadId: 35084,
    group: 'item',
    description:
      "Proc: each landed damaging spell has a 10% chance to give +95 spell power for 10 s, then not again for 60 s (author's log: 10 s buff, 60 s internal cooldown). DoT ticks, Life Tap and Curse of the Elements never proc it; wowsims rolls at cast end, the trainer when the spell lands. Its equip stats are already in the gear.",
    // db.json item 29305 itemEffects: buffId 35084, effectDurationMs 10000, stats SpellDamage 95,
    // proc { icdMs 60000, procChance 0.1 }; stat_bonus_procs_auto_gen.go: CallbackOnCastComplete,
    // ProcMaskSpellDamage. aura_helpers.go AttachProcTriggerCallback: the ICD is checked before
    // the roll (no draw while on cooldown) and starts when it procs. Wowhead TBC spell=35083 "Your
    // offensive spells have a chance on hit to increase your spell damage by 95 for 10 secs.
    // (Proc chance: 10%, 1m cooldown)", spell=35084 the buff.
    source:
      "wowsims/tbc-new sim/common/tbc/stat_bonus_procs_auto_gen.go (29305) + assets/database/db.json item 29305; https://www.wowhead.com/tbc/spell=35083; author's log",
    effect: {
      auras: [
        {
          id: 'band-of-the-eternal-sage',
          name: 'Band of the Eternal Sage',
          icon: 'spell_holy_mindvision',
          wowheadId: 35084,
          durationMs: 10000,
          selfStatBonuses: { spellPower: 95 },
        },
        {
          // Bookkeeping only: while it is up the Band cannot proc.
          id: BAND_ICD_AURA_ID,
          name: 'Band of the Eternal Sage (internal cooldown)',
          icon: 'inv_misc_head_tiger_01',
          wowheadId: 35083,
          durationMs: BAND_ICD_MS,
          hidden: true,
        },
      ],
      hooks: {
        // Runs after every resolved spell (DoT ticks never call hooks). The internal cooldown is
        // checked before the roll, so no random draw happens while it is up; a setup without the
        // Band never composes this hook and keeps every draw unchanged.
        onSpellResolved(e, api) {
          if (e.outcome === 'miss' || !BAND_PROC_SPELL_IDS.includes(e.spellId)) return;
          if (api.hasSelfAura(BAND_ICD_AURA_ID)) return;
          if (api.roll() < BAND_PROC_CHANCE) {
            api.applySelfAura(BAND_ICD_AURA_ID);
            api.applySelfAura('band-of-the-eternal-sage');
          }
        },
      },
    },
  },
]);
