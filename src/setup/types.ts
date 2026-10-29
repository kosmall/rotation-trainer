// The player's setup (stage 1.5 Part C, design spec §5): what the next fight is built from.
// A plain, versioned, JSON-safe object: saved in localStorage (Task 10) and always passed through
// `normalizeSetup` (defaults.ts) before use, then turned into a spec and fight settings by
// `applySetup` (applySetup.ts). Framework-free.

import type { WarlockOptions } from '../data/classes/warlock/destruction';
import type { RotationConfig } from '../data/classes/warlock/rotation';
import type { BuffDef, SpecData } from '../data/types';
import type { ScheduledAura } from '../engine/types';

/** Start and length of a timed buff (`BuffDef.timed`), in seconds of fight time. */
export interface TimedSetting {
  startSec: number;
  durationSec: number;
}

export interface SetupConfig {
  version: 1;
  /** Catalog ids (`BuffDef.id`) of the enabled buffs, in the order they were enabled. */
  enabledBuffs: string[];
  /** One entry per timed catalog buff (enabled or not), keyed by its id. */
  timed: Record<string, TimedSetting>;
  rotation: RotationConfig;
  /** Distance to the target in yards (missile travel time and the Shadowburn finisher window). */
  distanceYd: number;
  warlock: WarlockOptions;
}

export type SetupPresetId = 'none' | 'raid-log';

export interface ApplySetupInput {
  /** Builds the spec for the warlock options (`buildDestructionWarlock`). */
  buildSpec(warlock: WarlockOptions): SpecData;
  /** The buff catalog (`SETUP_CATALOG`). */
  catalog: readonly BuffDef[];
  config: SetupConfig;
}

export interface AppliedSetup {
  spec: SpecData;
  /** The `SimConfig` fields the setup decides. */
  sim: { scheduledAuras: ScheduledAura[]; distanceFromTarget: number };
}
