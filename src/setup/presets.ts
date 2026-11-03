// Ready-made setups for the setup panel (stage 1.5 Part C, design spec §4.3).

import { ROTATION_PRESETS, type RotationConfig } from '../data/classes/warlock/rotation';
import { destructionTalentString } from '../data/classes/warlock/talents';
import { deepFreeze } from '../data/common/buffs';
import type { BuffDef } from '../data/types';
import { DEFAULT_SETUP, normalizeSetup } from './defaults';
import { isGearEffectId } from './gearEffects';
import type { SetupConfig, SetupPresetId } from './types';

/**
 * The author's raid as in the Naj'entus log (2026-10). Calibrated in stage 1.5 Task 12 against
 * the log's checkpoints (tests/setup/raid-log.test.ts; docs/data-sources.md, "Part C: setup rules
 * and calibration"): spirit 191.2 (log 191), Life Tap 1834.8 (log 1856: shadow power 1566 vs about
 * 1592), intellect 567.1 (log 593: 26 short, no catalog subset reaches it together with the Life
 * Tap; the export's gear is not the raid's), crit rating 359 (log 361), haste rating 45 (45).
 *
 * What each entry rests on:
 * - Seen in the log: Moonkin Aura, Mana Spring Totem (20 mana per 2 s), Judgement of Wisdom (74 mana
 *   procs), Heroism from 6.4 s, Destruction Potion (log: used at 7.5 s) and Icon of the Silver
 *   Crescent (log: Blessing of the Silver Crescent at 30.2 s), Band of the Eternal Sage (procs at
 *   0.8 s and 69.5 s; a proc, so enabled, never scheduled); the rotation (Curse of Doom, Shadow
 *   Bolt, Life Tap, Shadowburn: the 'sb-spam' rotation preset) at 28 yd. The potion and the Icon
 *   are item actions (item bar Z X C V B N): when to use them is the player's choice (the bot uses
 *   them while Heroism is up); stage 1.5 scheduled them at the log's 7.5 s and 30.2 s (superseded).
 *   No Super Mana Potion or Dark Rune: the log shows neither.
 * - From the design spec's preset list, not measured: Improved Shadow Bolt from other warlocks
 *   (100% uptime assumed).
 * - GUESSED (the raid's exact buffs are unknown; the standard ones that reproduce the totals):
 *   Arcane Brilliance, Gift of the Wild, Blessing of Kings (with GotW and the food: spirit 191.2),
 *   Wrath of Air Totem, Flask of Pure Death, Blackened Basilisk and Superior Wizard Oil (+266
 *   shadow power together, for the Life Tap; Superior rather than Brilliant oil because Brilliant's
 *   +14 crit rating would overshoot the header's 361).
 * - Fight length: the default 60 s (`fightDurationSec`, inherited from DEFAULT_SETUP; the log's
 *   fight was longer, its Life Taps at 63 s and 99 s): the calibrated numbers are 60 s ones.
 * - Left out on purpose: Prayer of Spirit (spirit 222.6, far over 191), Totem of Wrath (no sign of
 *   it; Shadow Bolt crit at the pull is already 37.9%), Blessing of Wisdom, Misery, Shadow Weaving,
 *   the raid's Curse of the Elements and Inspiring Presence (nothing in the log shows them).
 */
// The Icon and the Band are the gear's item effects (src/setup/gearEffects.ts, ids `item:<itemId>`;
// stage 1.5 had the hand ids 'icon-of-the-silver-crescent' / 'band-of-the-eternal-sage', which
// `normalizeSetup` migrates). The preset keeps the author's gear, which wears both.
const RAID_LOG_SETUP: SetupConfig = {
  ...structuredClone(DEFAULT_SETUP),
  // Catalog order (applySetup folds in catalog order anyway).
  enabledBuffs: [
    // Raid and party buffs.
    'arcane-brilliance', // GUESSED
    'gift-of-the-wild', // GUESSED
    'moonkin-aura', // author's log
    'mana-spring-totem', // author's log
    'wrath-of-air-totem', // GUESSED
    'blessing-of-kings', // GUESSED
    // Consumables.
    'flask-of-pure-death', // GUESSED
    'blackened-basilisk', // GUESSED
    'superior-wizard-oil', // GUESSED
    // Target debuffs.
    'judgement-of-wisdom', // author's log
    'isb-from-others', // design spec §4.3 preset list
    // Cooldowns and items.
    'heroism', // author's log
    'destruction-potion', // author's log (item action)
    'item:29370', // Icon of the Silver Crescent: author's log (item action, derived from the gear)
    'item:29305', // Band of the Eternal Sage: author's log (proc, derived from the gear)
  ],
  timed: {
    ...structuredClone(DEFAULT_SETUP.timed),
    // Start: the author's log (Heroism 6.4 s); duration: the catalog's (also the log's: 40 s).
    heroism: { startSec: 6.4, durationSec: 40 },
  },
  rotation: { ...ROTATION_PRESETS['sb-spam'].config },
};

/**
 * - `none`: the default setup (no buffs; the stage 1 numbers).
 * - `raid-log`: the author's raid as in the Naj'entus log (`RAID_LOG_SETUP` above); approximate,
 *   several buffs are guesses (`description` says which).
 * Both keep the author's gear: they have no `gear` (`setupGear`, src/setup/gear.ts), so choosing
 * one also returns the gear to the author's export. Neither has `rotation.itemUse` /
 * `itemUseOrder`: the default item-use rules (itemUse.ts `DEFAULT_ITEM_USE`, applied by
 * `applySetup`), so choosing one also resets the item rules; a config whose rules equal the
 * defaults still matches a preset (`normalizeSetup` drops them).
 * Deep-frozen: copy a preset's config (structuredClone) before editing it.
 */
export const SETUP_PRESETS: Readonly<Record<SetupPresetId, { name: string; description: string; config: SetupConfig }>> =
  deepFreeze({
    none: {
      name: 'None',
      description: 'No buffs, the DoT rotation, 28 yd, Fel Armor and the Succubus sacrificed: the stage 1 numbers.',
      config: structuredClone(DEFAULT_SETUP),
    },
    'raid-log': {
      name: 'Raid as in my log',
      description:
        "Approximate. From the Naj'entus log: Moonkin Aura, Mana Spring Totem, Judgement of Wisdom, Heroism at 6.4 s, Destruction Potion and Icon of the Silver Crescent on the item row (the log used them at 7.5 s and 30.2 s: now your choice), Band of the Eternal Sage, the Shadow Bolt + Curse of Doom rotation. From the design spec: Improved Shadow Bolt from others. Guessed to match the log's intellect, spirit and Life Tap: Arcane Brilliance, Gift of the Wild, Blessing of Kings, Wrath of Air Totem, Flask of Pure Death, Blackened Basilisk, Superior Wizard Oil.",
      config: RAID_LOG_SETUP,
    },
  });

/**
 * The talent build a (normalized) config plays: its `talents`, or the author's build
 * (`destructionTalentString`) when it has none.
 */
export function setupTalents(config: Pick<SetupConfig, 'talents'>): string {
  return config.talents ?? destructionTalentString;
}

/**
 * The config a setup preset gives when chosen while `current` is the setup (ruling F-2: a preset
 * sets the buffs, the rotation and the distance but keeps the player's own choices): the preset's
 * config with the current fight length, gear (`gear`, `gearPresetId`), item-use rules
 * (`rotation.itemUse` / `itemUseOrder`) and talents (`talents`; absent stays absent, the author's
 * build). "Reset to defaults" is `DEFAULT_SETUP` instead: no talents, the author's build. Pure: a
 * new object; the fields it copies are shared with its inputs (normalize before storing).
 */
export function applySetupPreset(preset: SetupConfig, current: SetupConfig): SetupConfig {
  const itemUse: Pick<RotationConfig, 'itemUse' | 'itemUseOrder'> = {};
  if (current.rotation.itemUse !== undefined) itemUse.itemUse = current.rotation.itemUse;
  if (current.rotation.itemUseOrder !== undefined) itemUse.itemUseOrder = current.rotation.itemUseOrder;
  const { gear: _gear, gearPresetId: _gearPresetId, talents: _talents, ...rest } = preset;
  return {
    ...rest,
    rotation: { ...preset.rotation, ...itemUse },
    fightDurationSec: current.fightDurationSec,
    ...(current.gear !== undefined && { gear: current.gear }),
    ...(current.gearPresetId !== undefined && { gearPresetId: current.gearPresetId }),
    ...(current.talents !== undefined && { talents: current.talents }),
  };
}

/**
 * What decides a fight, as a comparable string, for preset matching: the enabled buffs as a set
 * (a gear item effect only when `catalog`, the worn gear's, has it), the start and length of the
 * enabled timed buffs, the rotation, the distance, the warlock options and, only when the build
 * is not the author's, the talents (so the key of every config without talents is the stage 2a
 * one). The fight length and the gear are left out: the presets keep them (`applySetupPreset`).
 * Compare a config with `applySetupPreset(preset, config)` to match a preset: the talents are
 * then kept on both sides. The Setup panel's own key (src/ui/SetupPanel.tsx `fightKey`) is the
 * same without the talents part.
 */
export function setupFightKey(config: SetupConfig, catalog: readonly BuffDef[]): string {
  const c = normalizeSetup(config, catalog);
  const ids = new Set(catalog.map((b) => b.id));
  const enabled = c.enabledBuffs.filter((id) => !isGearEffectId(id) || ids.has(id)).sort();
  const timed = enabled.flatMap((id) => {
    const t = c.timed[id];
    return t ? [[id, t.startSec, t.durationSec]] : [];
  });
  return JSON.stringify([enabled, timed, c.rotation, c.distanceYd, c.warlock, ...(c.talents !== undefined ? [{ talents: c.talents }] : [])]);
}
