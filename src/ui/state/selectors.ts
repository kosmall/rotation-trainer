// Pure label helpers of the trainer state (moved from GameView): the names the header chips, the
// Setup editors and the Simulator show for a setup, and which Setup sections changed since the
// running fight was built.

import { ROTATION_PRESETS } from '../../data/classes/warlock/rotation';
import type { RotationConfig } from '../../data/classes/warlock/rotation';
import { offeredGearPresets } from '../../data/classes/warlock/gearPresets';
import { offeredTalentPresets } from '../../data/classes/warlock/talentPresets';
import type { BuffDef } from '../../data/types';
import { setupGear } from '../../setup/gear';
import { SETUP_PRESETS, setupTalents } from '../../setup/presets';
import type { SetupConfig } from '../../setup/types';
import { CUSTOM_GEAR_NAME } from '../GearPanel';
import { matchingPreset } from '../gearView';
import { activePresetName } from '../SetupPanel';
import { talentBuildName } from '../talentView';

/** The gear presets the Gear panel offers (the author's gear first, then by phase). */
export const GEAR_PRESETS_OFFERED = offeredGearPresets();

/** The talent presets the Talents panel offers (the author's build first). */
export const TALENT_PRESETS_OFFERED = offeredTalentPresets();

/** The gear's preset name ("My gear (export)", "T6", ...) or "Custom". */
export const gearName = (config: SetupConfig): string =>
  matchingPreset(setupGear(config), GEAR_PRESETS_OFFERED)?.name ?? CUSTOM_GEAR_NAME;

/** The build's talent preset name ("My build (export)", "Destro/Nightfall", ...) or "Custom". */
export const talentsName = (config: SetupConfig): string => talentBuildName(setupTalents(config), TALENT_PRESETS_OFFERED);

/** The setup preset the config matches ("None", "Raid as in my log") or "Custom" (`activePresetName`). */
export const setupPresetName = (config: SetupConfig, catalog: readonly BuffDef[]): string =>
  activePresetName(config, SETUP_PRESETS, catalog);

/** The basic rotation's preset name ("DoT rotation"), or "Custom" (its item-use rules do not count). */
function rotationPresetName(rotation: RotationConfig): string {
  const keys = Object.keys(ROTATION_PRESETS.dot.config) as (keyof RotationConfig)[];
  const match = Object.values(ROTATION_PRESETS).find((p) => keys.every((k) => p.config[k] === rotation[k]));
  return match?.name ?? 'Custom';
}

/** The rotation that plays: "Script, 9 rules" when a script is active, else the basic rotation's preset name. */
export function rotationName(config: SetupConfig): string {
  const rules = config.script?.rules.length ?? 0;
  if (rules > 0) return `Script, ${rules} ${rules === 1 ? 'rule' : 'rules'}`;
  return rotationPresetName(config.rotation);
}

/** The fight settings in short ("60 s, 28 yd", with no-break spaces before the units). */
export const fightSettingsName = (config: SetupConfig): string => `${config.fightDurationSec} s, ${config.distanceYd} yd`;

/** The header's status chips, in order; each links to a Setup section. */
export const CHIP_SECTIONS = ['setup', 'gear', 'talents', 'rotation', 'fight'] as const;
export type ChipSection = (typeof CHIP_SECTIONS)[number];

/** The config fields each chip covers; 'setup' covers every field the others do not (buffs, class options). */
const SECTION_FIELDS: Readonly<Record<Exclude<ChipSection, 'setup'>, readonly (keyof SetupConfig)[]>> = {
  gear: ['gear', 'gearPresetId'],
  talents: ['talents'],
  rotation: ['rotation', 'script'],
  fight: ['fightDurationSec', 'distanceYd', 'timed'],
};
const OWNED = new Set<string>(Object.values(SECTION_FIELDS).flat());

function fieldsOf(section: ChipSection, config: SetupConfig): (keyof SetupConfig)[] {
  if (section !== 'setup') return [...SECTION_FIELDS[section]];
  return (Object.keys(config) as (keyof SetupConfig)[]).filter((k) => !OWNED.has(k));
}

/**
 * Whether the next fight's setup (`next`) differs from the running fight's (`running`) in the
 * fields of `section`. The caller decides when it counts (only a started or ended fight keeps its
 * own setup; one that has not started takes every edit at once).
 */
export function pendingFor(section: ChipSection, running: SetupConfig, next: SetupConfig): boolean {
  const keys = new Set([...fieldsOf(section, running), ...fieldsOf(section, next)]);
  for (const k of keys) {
    if (JSON.stringify(running[k]) !== JSON.stringify(next[k])) return true;
  }
  return false;
}

/** `pendingFor` of every chip. */
export function pendingSections(running: SetupConfig, next: SetupConfig): Record<ChipSection, boolean> {
  return {
    setup: pendingFor('setup', running, next),
    gear: pendingFor('gear', running, next),
    talents: pendingFor('talents', running, next),
    rotation: pendingFor('rotation', running, next),
    fight: pendingFor('fight', running, next),
  };
}

export const NO_PENDING: Readonly<Record<ChipSection, boolean>> = Object.freeze({
  setup: false,
  gear: false,
  talents: false,
  rotation: false,
  fight: false,
});
