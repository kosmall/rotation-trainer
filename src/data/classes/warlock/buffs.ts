// Warlock side of the setup catalog (stage 1.5 Part C): how the raid's debuffs relate to the
// warlock's own auras, the descriptions of the warlock options for the setup panel (see
// docs/data-sources.md, "Part C: consumables, debuffs and warlock options"), and which spells
// trigger the gear's proc effects (see "Part F: gear item effects").

import type { AuraDef } from '../../../engine/types';
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
 * `raidMults` (buff id -> the raid debuff's own multiplier, e.g. 1.1 for the raid Curse of the
 * Elements): when the own aura is the stronger one (Malediction: 1.10 + 0.01 x rank, stage 2b), it
 * keeps the excess, own / raid, so the two together give the own multiplier ("only the strongest
 * applies", rulings S1/S2). An own aura not stronger than the raid one (every build without
 * Malediction, Improved Shadow Bolt at any rank) still multiplies by exactly 1.
 */
export function neutralizeOwnAuras(
  auras: readonly AuraDef[],
  enabledBuffIds: readonly string[],
  raidMults: Readonly<Record<string, number>> = {},
): AuraDef[] {
  // Own aura id -> the strongest raid multiplier replacing it (1 when unknown: plain neutralizing).
  const neutral = new Map<string, number>();
  for (const id of enabledBuffIds) {
    if (!Object.hasOwn(NEUTRALIZED_BY, id)) continue;
    const raid = Object.hasOwn(raidMults, id) ? raidMults[id]! : 1;
    for (const own of NEUTRALIZED_BY[id]!) neutral.set(own, Math.max(neutral.get(own) ?? 1, raid));
  }
  return auras.map((a) => {
    const raid = neutral.get(a.id);
    if (raid === undefined || !a.damageTakenMult) return a;
    const mult = raid > 1 && a.damageTakenMult.mult > raid ? a.damageTakenMult.mult / raid : 1;
    return { ...a, damageTakenMult: { ...a.damageTakenMult, mult } };
  });
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
// Proc triggers of the gear's item effects (gear item effects Task 2)
// The item effects themselves are derived from the worn gear and the item database
// (src/setup/gearEffects.ts `deriveGearEffects`); stage 1.5 Task 8 hand-wrote the Icon of the
// Silver Crescent and the Band of the Eternal Sage here (superseded: the derived entries reproduce
// them exactly, tests/setup/gear-effects.test.ts). What stays here is warlock data: which spells
// count for the `hit`/`crit` and `cast` triggers (rulings E-1, E-2; src/data/items/types.ts
// `ItemProcTrigger`).
// ===========================================================================

/**
 * The warlock spells that a `hit` (and `crit`) proc rolls on: the "offensive spells" that deal
 * damage (a direct part, or a DoT applied on the target). Life Tap (no target) and Curse of the
 * Elements (no damage) never do. Derived from the spell and aura data, so a new damaging spell is
 * included. The stage F Band rule (ruling E-2), hence the name.
 */
export const BAND_PROC_SPELL_IDS: readonly string[] = Object.freeze(
  warlockSpells
    .filter((s) => s.direct !== undefined || warlockAuras.some((a) => a.id === s.applyAura?.auraId && a.tick !== undefined))
    .map((s) => s.id),
);

/**
 * The completed player spells a `cast` proc does NOT roll on (ruling E-1): Curse of the Elements
 * (wowsims curse_of_elements.go: `ProcMaskEmpty`). Every other spell rolls, whatever its outcome.
 */
export const CAST_TRIGGER_EXCLUDED_SPELL_IDS: readonly string[] = Object.freeze(['curse-of-the-elements']);
