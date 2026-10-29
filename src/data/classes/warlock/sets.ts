import type { SetBonusDef } from '../../../engine/types';

// Warlock set bonuses for the sets in the default gear (items.ts). Stage 2a adds the other sets.
// Source: github.com/wowsims/tbc-new master @ 91f869a, sim/warlock/items.go; descriptions are the
// Wowhead TBC tooltip text (wowhead.com/tbc/item-set=670). See docs/data-sources.md, "Task 12b".

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
