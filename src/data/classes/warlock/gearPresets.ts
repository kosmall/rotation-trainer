import { deepFreeze } from '../../common/buffs';
import type { EquippedItem } from '../../../engine/types';
import { destructionEquipped } from './destruction';

// Gear presets (stage 2a, design spec §3): the wowsims warlock gear sets, one per content phase,
// plus the author's own gear. Each gear has the 17 entries of `ITEM_SLOTS` (src/data/items/db.ts,
// WowSimsExporter order: head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet,
// finger1, finger2, trinket1, trinket2, mainHand, offHand, ranged), null for an empty slot, in the
// normalized form `normalizeGear` (src/setup/gear.ts) produces: tests/data/gear-presets.test.ts
// checks that `normalizeGear` keeps every preset unchanged (every id in the item database, every
// item in its slot, every gem in a fitting socket, every enchant on a fitting item).
//
// Source: github.com/wowsims/tbc-new master @ 91f869a (MIT licence),
// ui/specs/warlock/dps/gear_sets/<file>.gear.json, names from ui/specs/warlock/dps/presets.ts
// (`PresetUtils.makePresetGear`). The same files are copied, unchanged, into
// tests/fixtures/wowsims-warlock-gear-sets.json, against which the test compares every preset.
// Changes to the wowsims data (each also in the preset's `note`):
// - preraid, fire-preraid: Stormcaller (29155, Horde only: db.json `factionRestriction` 2;
//   `sources` rep 947 Thrallmar, level 8 Exalted) is replaced by its Alliance counterpart Blade of
//   the Archmage (29153; rep 946 Honor Hold, Exalted), because the trainer's character is a
//   Gnome. Same spell damage (159) and crit rating (21), 1 Intellect less (11 vs 12; db.json).
// - za: the shoulder and cloak enchants missing from tbc-new's za.gear.json are restored from
//   the previous sim, github.com/wowsims/tbc master @ 3301fca ui/warlock/presets.ts 'P4 Destro'
//   (enchant 28886 Greater Inscription of Discipline = effect 2982, 33150 Subtlety = effect 2621,
//   sim/core/items/all_enchants.go); every other tbc-new set has both.

export type GearPresetSpec = 'shadow' | 'fire';

export interface GearPreset {
  /** Stable id (`SetupConfig.gearPresetId`: lower-case letters, digits and dashes). */
  id: string;
  name: string;
  /** Content phase the gear is for: 0 pre-raid, 1 T4 ... 5 Sunwell Plateau. */
  phase: 0 | 1 | 2 | 3 | 4 | 5;
  /**
   * Which spell the gear is built for: 'shadow' (Shadow Bolt, the trainer's rotation; offered)
   * or 'fire' (Incinerate/Immolate gearing; kept, not offered: `offeredGearPresets`).
   */
  spec: GearPresetSpec;
  /** 17 entries in `ITEM_SLOTS` order, null for an empty slot. Deep-frozen: copy before editing. */
  gear: readonly (EquippedItem | null)[];
  /** Where the gear comes from. */
  source: string;
  /** What was changed from the source, if anything. */
  note?: string;
}

/** A gear.json entry: `{}` is an empty slot. */
interface Entry {
  id?: number;
  enchant?: number;
  gems?: number[];
}

/** The normalized gear form: `{}` -> null, `gems` always present, `enchant` only when set. */
function gear(entries: Entry[]): (EquippedItem | null)[] {
  return entries.map((e) => {
    if (e.id === undefined) return null;
    const out: EquippedItem = { id: e.id };
    if (e.enchant !== undefined) out.enchant = e.enchant;
    out.gems = e.gems ?? [];
    return out;
  });
}

const WOWSIMS = 'wowsims/tbc-new @ 91f869a ui/specs/warlock/dps/gear_sets';
const STORMCALLER_NOTE =
  "Stormcaller (29155) is Horde only; replaced by the Alliance Blade of the Archmage (29153: same spell damage and crit, 1 Intellect less) because the trainer's character is a Gnome.";

export const GEAR_PRESETS: readonly GearPreset[] = deepFreeze([
  {
    id: 'preraid',
    name: 'Pre-Raid',
    phase: 0,
    spec: 'shadow',
    source: `${WOWSIMS}/preraid.gear.json`,
    note: STORMCALLER_NOTE,
    gear: gear([
      { id: 28193, enchant: 3002, gems: [30564, 34220] },
      { id: 28134 },
      { id: 21869, enchant: 2982, gems: [31867, 31116] },
      { id: 27981, enchant: 2621 },
      { id: 21871, enchant: 2661, gems: [31867, 30555] },
      { id: 24250, enchant: 2650, gems: [31867] },
      { id: 27465, enchant: 2937, gems: [24030, 31867] },
      { id: 24256, gems: [28123, 31867] },
      { id: 24262, enchant: 2748, gems: [28118, 31867, 30588] },
      { id: 21870, enchant: 2940, gems: [31867, 24056] },
      { id: 29172 },
      { id: 28227 },
      { id: 29370 },
      { id: 27683 },
      { id: 29153, enchant: 2672 }, // Blade of the Archmage (wowsims: Stormcaller 29155)
      { id: 29273 },
      { id: 29350 },
    ]),
  },
  {
    id: 't4',
    name: 'T4',
    phase: 1,
    spec: 'shadow',
    source: `${WOWSIMS}/t4.gear.json`,
    gear: gear([
      { id: 28963, enchant: 3002, gems: [34220, 24030] },
      { id: 28530 },
      { id: 28967, enchant: 2982, gems: [30555, 31867] },
      { id: 28766, enchant: 2621 },
      { id: 28964, enchant: 2661, gems: [30564, 30588, 24030] },
      { id: 24250, enchant: 2650, gems: [28123] },
      { id: 28968, enchant: 2937 },
      { id: 24256, gems: [24030, 24059] },
      { id: 24262, enchant: 2748, gems: [24030, 28118, 24030] },
      { id: 21870, enchant: 2940, gems: [31867, 31116] },
      { id: 28793 },
      { id: 28753 },
      { id: 27683 },
      { id: 29370 },
      { id: 28802, enchant: 2672 },
      { id: 28734 },
      { id: 28673 },
    ]),
  },
  {
    id: 't5',
    name: 'T5',
    phase: 2,
    spec: 'shadow',
    source: `${WOWSIMS}/t5.gear.json`,
    gear: gear([
      { id: 30212, enchant: 3002, gems: [34220, 31116] },
      { id: 30015 },
      { id: 28967, enchant: 2982, gems: [30564, 31867] },
      { id: 28766, enchant: 2621 },
      { id: 30107, enchant: 2661, gems: [30588, 31867, 30555] },
      { id: 29918, enchant: 2650 },
      { id: 28968, enchant: 2937 },
      { id: 30038, gems: [28118, 31867] },
      { id: 30213, enchant: 2748, gems: [28123] },
      { id: 30037, enchant: 2940 },
      { id: 30109 },
      { id: 29302 },
      { id: 29370 },
      { id: 27683 },
      { id: 30095, enchant: 2672 },
      { id: 30049 },
      { id: 29982 },
    ]),
  },
  {
    id: 't6',
    name: 'T6',
    phase: 3,
    spec: 'shadow',
    source: `${WOWSIMS}/t6.gear.json`,
    gear: gear([
      { id: 31051, enchant: 3002, gems: [34220, 32218] },
      { id: 32349 },
      { id: 31054, enchant: 2982, gems: [32196, 32196] },
      { id: 32524, enchant: 2621 },
      { id: 30107, enchant: 2661, gems: [32196, 32196, 32196] },
      { id: 32586, enchant: 2650 },
      { id: 31050, enchant: 2937, gems: [32196] },
      { id: 30038, gems: [32215, 32218] },
      { id: 31053, enchant: 2748, gems: [32196] },
      { id: 32239, enchant: 2940, gems: [32218, 32215] },
      { id: 32527 },
      { id: 32527 },
      { id: 32483 },
      { id: 29370 },
      { id: 32374, enchant: 2672 }, // a staff: no off hand
      {},
      { id: 29982 },
    ]),
  },
  {
    id: 'za',
    name: "Zul'Aman",
    phase: 4,
    spec: 'shadow',
    source: `${WOWSIMS}/za.gear.json`,
    note: "Shoulder enchant Greater Inscription of Discipline (2982) and cloak enchant Subtlety (2621) added: missing from tbc-new's za.gear.json, present in every other set and in the previous sim's P4 preset (wowsims/tbc ui/warlock/presets.ts).",
    gear: gear([
      { id: 31051, enchant: 3002, gems: [34220, 32218] },
      { id: 32349 },
      { id: 31054, enchant: 2982, gems: [32215, 32218] }, // enchant 2982 restored
      { id: 32524, enchant: 2621 }, // enchant 2621 restored
      { id: 30107, enchant: 2661, gems: [32196, 32196, 32196] },
      { id: 32586, enchant: 2650 },
      { id: 31050, enchant: 2937, gems: [32196] },
      { id: 30038, gems: [32196, 32196] },
      { id: 31053, enchant: 2748, gems: [32196] },
      { id: 32239, enchant: 2940, gems: [32218, 32215] },
      { id: 32527 },
      { id: 32527 },
      { id: 32483 },
      { id: 33829 },
      { id: 32374, enchant: 2672 }, // a staff: no off hand
      {},
      { id: 33192, gems: [32196] },
    ]),
  },
  {
    id: 'swp',
    name: 'Sunwell Plateau',
    phase: 5,
    spec: 'shadow',
    source: `${WOWSIMS}/swp.gear.json`,
    gear: gear([
      { id: 34340, enchant: 3002, gems: [34220, 35759] },
      { id: 34204 },
      { id: 31054, enchant: 2982, gems: [35759, 35761] },
      { id: 34242, enchant: 2621, gems: [35760] },
      { id: 34364, enchant: 2661, gems: [35760, 35760, 35760] },
      { id: 34436, enchant: 2650, gems: [35761] },
      { id: 34344, enchant: 2937, gems: [35761, 35760] },
      { id: 34541, gems: [35761] },
      { id: 34181, enchant: 2748, gems: [35760, 35760, 35761] },
      { id: 34564, enchant: 2940, gems: [35761] },
      { id: 34362 },
      { id: 34230 },
      { id: 34429 },
      { id: 32483 },
      { id: 34336, enchant: 2672 },
      { id: 34179 },
      { id: 34347, gems: [35761] },
    ]),
  },
  {
    id: 'fire-preraid',
    name: 'Pre-Raid (Fire)',
    phase: 0,
    spec: 'fire',
    source: `${WOWSIMS}/destro_fire_preraid.gear.json`,
    note: STORMCALLER_NOTE,
    gear: gear([
      { id: 28193, enchant: 3002, gems: [28118, 34220] },
      { id: 28134 },
      { id: 27796, enchant: 2982, gems: [31867, 28123] },
      { id: 27981, enchant: 2621 },
      { id: 21848, enchant: 2661, gems: [31867, 30555] },
      { id: 24250, enchant: 2650, gems: [31867] },
      { id: 21847, enchant: 2937, gems: [24030, 30564] },
      { id: 21846, gems: [31867, 30606] },
      { id: 24262, enchant: 2748, gems: [30588, 31867, 31861] },
      { id: 28406, enchant: 2940, gems: [24030, 31867] },
      { id: 28227 },
      { id: 29172 },
      { id: 27683 },
      { id: 29370 },
      { id: 29153, enchant: 2671 }, // Blade of the Archmage (wowsims: Stormcaller 29155)
      { id: 29270 },
      { id: 29350 },
    ]),
  },
  {
    id: 'fire-t4',
    name: 'T4 (Fire)',
    phase: 1,
    spec: 'fire',
    source: `${WOWSIMS}/destro_fire_t4.gear.json`,
    gear: gear([
      { id: 28963, enchant: 3002, gems: [34220, 28118] },
      { id: 28530 },
      { id: 28967, enchant: 2982, gems: [30605, 31867] },
      { id: 28766, enchant: 2621 },
      { id: 21848, enchant: 2661, gems: [31867, 31861] },
      { id: 24250, enchant: 2650, gems: [31867] },
      { id: 21847, enchant: 2937, gems: [31867, 30588] },
      { id: 21846, gems: [31867, 30564] },
      { id: 24262, enchant: 2748, gems: [30606, 31867, 28123] },
      { id: 28517, enchant: 2940, gems: [24030, 31867] },
      { id: 28793 },
      { id: 28753 },
      { id: 27683 },
      { id: 29370 },
      { id: 28802, enchant: 2671 },
      { id: 29270 },
      { id: 28673 },
    ]),
  },
  {
    id: 'author',
    name: 'My gear (export)',
    // The newest item is phase 4 (Fetish of the Primal Gods 33334, item database `phase`).
    phase: 4,
    spec: 'shadow',
    source:
      "The author's WowSimsExporter export, docs/samples/wowsimsexporter-destruction-warlock.json (destruction.ts `destructionEquipped`, the default gear)",
    gear: structuredClone(destructionEquipped),
  },
] satisfies GearPreset[]);

/** The preset with this id (own entries only), or undefined. */
export function gearPresetById(id: string): GearPreset | undefined {
  return GEAR_PRESETS.find((p) => p.id === id);
}

/**
 * The presets the gear panel offers: the author's gear first, then the shadow presets in phase
 * order (pre-raid, T4, T5, T6, Zul'Aman, Sunwell Plateau). The Fire presets are not offered:
 * the trainer's rotation is Shadow Bolt; they stay in `GEAR_PRESETS` for a later Fire rotation.
 */
export function offeredGearPresets(): readonly GearPreset[] {
  const author = GEAR_PRESETS.filter((p) => p.id === 'author');
  const shadow = GEAR_PRESETS.filter((p) => p.spec === 'shadow' && p.id !== 'author');
  return [...author, ...[...shadow].sort((a, b) => a.phase - b.phase)];
}
