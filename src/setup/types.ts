// The player's setup (stage 1.5 Part C, design spec §5): what the next fight is built from.
// A plain, versioned, JSON-safe object: saved in localStorage (Task 10) and always passed through
// `normalizeSetup` (defaults.ts) before use, then turned into a spec and fight settings by
// `applySetup` (applySetup.ts). Framework-free.

import type { WarlockOptions } from '../data/classes/warlock/destruction';
import type { RotationConfig } from '../data/classes/warlock/rotation';
import type { BuffDef, SpecData } from '../data/types';
import type { EquippedItem, ScheduledAura } from '../engine/types';

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
  /**
   * Fight length in whole seconds, 10-600 (`SETUP_LIMITS.fightDurationSec`), default 60. A stored
   * config saved before the field existed gets 60 (`normalizeSetup`; no version bump).
   */
  fightDurationSec: number;
  /**
   * The equipped gear (stage 2a): 17 entries in WowSimsExporter slot order (src/data/items/db.ts
   * `ITEM_SLOTS`), null for an empty slot. Absent (every config saved before stage 2a, the
   * default setup and the setup presets): the author's gear (`setupGear`, src/setup/gear.ts).
   * `normalizeSetup` checks its shape always and, given the item database, its ids
   * (`normalizeGear`); no version bump.
   */
  gear?: (EquippedItem | null)[];
  /** The gear preset the gear came from, for its label (`[a-z0-9-]`, up to 64 characters). */
  gearPresetId?: string;
}

export type SetupPresetId = 'none' | 'raid-log';

export interface ApplySetupInput {
  /**
   * Builds the spec for the warlock options and the config's gear (`buildDestructionWarlock`,
   * bound to the item database when the gear needs it: src/setup/gear.ts `gearNeedsDb`).
   * `gear` is undefined for a config without gear (the author's).
   */
  buildSpec(warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[]): SpecData;
  /** The buff catalog (`SETUP_CATALOG`). */
  catalog: readonly BuffDef[];
  config: SetupConfig;
}

export interface AppliedSetup {
  spec: SpecData;
  /** The `SimConfig` fields the setup decides (`durationMs` = `fightDurationSec` x 1000). */
  sim: { scheduledAuras: ScheduledAura[]; distanceFromTarget: number; durationMs: number };
}
