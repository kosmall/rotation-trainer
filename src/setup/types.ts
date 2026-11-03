// The player's setup (stage 1.5 Part C, design spec §5): what the next fight is built from.
// A plain, versioned, JSON-safe object: saved in localStorage (Task 10) and always passed through
// `normalizeSetup` (defaults.ts) before use, then turned into a spec and fight settings by
// `applySetup` (applySetup.ts). Framework-free.

import type { WarlockOptions } from '../data/classes/warlock/destruction';
import type { RotationConfig } from '../data/classes/warlock/rotation';
import type { ItemDb } from '../data/items/types';
import type { BuffDef, SpecData } from '../data/types';
import type { EquippedItem, ScheduledAura } from '../engine/types';
import type { ConvertContext } from '../script/convert';
import type { Script, ScriptContext, ScriptIssue } from '../script/types';

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
  /**
   * The talent build (stage 2b) as a full-width talent string (`encodeTalents`: 21/22/21 digits).
   * Absent (every config saved before stage 2b, the default setup, the setup presets): the
   * author's build (`destructionTalentString`). `normalizeSetup` keeps only a valid build
   * (`decodeTalents` without errors) other than the author's; anything else leaves it absent.
   */
  talents?: string;
  /**
   * The rotation script (rotation scripts Task 2, src/script; Part J). Absent (every config saved
   * before, the default setup, the presets): the basic rotation (`rotation`) plays. Present with
   * at least one rule: it replaces the whole priority list (`applySetup` compiles it with
   * `compileScript`); `rotation` (its fields and item-use rules) is kept but inactive.
   * `normalizeSetup` keeps its shape within the limits (`normalizeScript`); its expressions are
   * validated where it is used.
   */
  script?: Script;
}

export type SetupPresetId = 'none' | 'raid-log';

export interface ApplySetupInput {
  /**
   * Builds the spec for the warlock options, the config's gear and its talents
   * (`buildDestructionWarlock(warlock, gear, db, talents)`, bound to the item database when the
   * gear needs it: src/setup/gear.ts `gearNeedsDb`). `gear` is undefined for a config without gear
   * (the author's), `talents` for a config without talents (the author's build). Every caller must
   * forward `talents`: the priority `applySetup` builds follows them.
   */
  buildSpec(warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string): SpecData;
  /**
   * The buff catalog (`SETUP_CATALOG`, `STATIC_SETUP_CATALOG` or `setupCatalogFor(...)`): only its
   * gear-independent entries are used; the item entries are derived from `config.gear`.
   */
  catalog: readonly BuffDef[];
  config: SetupConfig;
  /**
   * The item database, for the gear's item effects (src/setup/gearEffects.ts). Absent or null (not
   * loaded yet): the embedded author records, which know only the author's items (the default
   * gear's Icon and Band work without the database).
   */
  db?: ItemDb | null;
}

export interface AppliedSetup {
  spec: SpecData;
  /** The `SimConfig` fields the setup decides (`durationMs` = `fightDurationSec` x 1000). */
  sim: { scheduledAuras: ScheduledAura[]; distanceFromTarget: number; durationMs: number };
  /** The fight's script context and, when a script is active, what its compilation reported. */
  script: AppliedScript;
  /** The basic rotation of the config (active or not): what `convertToScript` reads. */
  basic: ConvertContext;
}

export interface AppliedScript {
  /**
   * What script ids resolve against in this fight: the spec's spells and visible auras, every
   * bound item action (worn on-use items whether enabled or not, ruling T-1, and the enabled
   * potions and rune) by catalog entry id with its rule's cooldown, Heroism's end, the basic
   * rotation's facts (`rotationScriptFacts`) and display names.
   */
  context: ScriptContext;
  /** `config.script` has at least one rule: its compiled steps are `spec.priority`. */
  active: boolean;
  /** The compiled steps' rule keys (`CompiledScript.keys`); empty when no script is active. */
  keys: string[];
  /** `compileScript`'s warnings and errors; empty when no script is active. */
  warnings: ScriptIssue[];
  errors: ScriptIssue[];
}
