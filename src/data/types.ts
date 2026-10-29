import type {
  AuraDef,
  CharacterSetup,
  RawStats,
  SetBonusDef,
  SimSnapshot,
  SpecHooks,
  SpellDef,
  SpellModifier,
  StatMultipliers,
} from '../engine/types';

/**
 * Where a buff comes from, as the setup panel groups it: raid, party and individual buffs follow
 * wowsims' `RaidBuffs` / `PartyBuffs` / `IndividualBuffs` (proto/common.proto).
 */
export type BuffGroup = 'raid' | 'party' | 'individual' | 'consumable' | 'debuff' | 'item' | 'warlock';

/**
 * What an enabled buff does, in the engine's own primitives. `applySetup` (src/setup) merges the
 * static parts into the derived spec: `statBonuses` are summed into the spec's flat bonuses
 * (added to the raw stats before any multiplier), `statMultipliers` multiply the setup's
 * (combineStatMultipliers: factor by factor), `modifiers` are appended to the spec's.
 */
export interface BuffEffect {
  statBonuses?: Partial<RawStats>;
  statMultipliers?: StatMultipliers;
  modifiers?: SpellModifier[];
  /** Debuff on the target for the whole fight (scheduled at 0). */
  targetAura?: AuraDef;
  /** Timed self buff (needs `BuffDef.timed`). */
  selfAura?: AuraDef;
  /** Helper auras (for example hidden internal cooldowns). */
  auras?: AuraDef[];
  hooks?: SpecHooks;
}

export interface BuffDef {
  id: string;
  name: string;
  icon: string;
  /** Wowhead (TBC) spell id: source of the icon file. */
  wowheadId?: number;
  group: BuffGroup;
  /** Buffs of one group are mutually exclusive in a setup (flask, food, ...). */
  exclusiveGroup?: string;
  description: string;
  /** Repo path/symbol or URL of the values, or 'UNVERIFIED' (with the reason in `description`). */
  source: string;
  effect: BuffEffect;
  /** A cooldown-like buff: starts at a configurable second and lasts `durationSec`. */
  timed?: { defaultStartSec: number; durationSec: number };
}

/**
 * One rule of a spec's priority list, as played by `runBot` (src/bot/bot.ts): the steps are tried
 * in order; a step whose `when` is false is skipped; otherwise its spell is pressed, and a press
 * the Simulation rejects (cooldown, gcd, busy, no-mana, missing-aura) falls through to the next
 * step. The first accepted press (a queued one counts) is the decision.
 *
 * So `when` only states when the spell is wanted; it need not repeat what `cast` already checks.
 * For example a Life Tap rule that only covers the filler's mana cost is enough: a costlier spell
 * rejected for mana falls through to it.
 *
 * `when` reads only the snapshot, which is taken before the press and can be up to the spell
 * queue window before the current cast ends: the cast in progress (`s.cast`) has not landed yet,
 * so a rule about the aura that cast applies must also exclude that cast.
 */
export interface PriorityStep {
  spellId: string;
  label: string;
  hint: string;
  /** The spell is wanted now; absent means always. */
  when?: (s: SimSnapshot) => boolean;
}

export interface SpecData {
  id: string;
  name: string;
  spells: SpellDef[];
  auras: AuraDef[];
  modifiers: SpellModifier[];
  statBonuses: Partial<RawStats>;
  sets: SetBonusDef[];
  setup: CharacterSetup;
  priority: PriorityStep[];
  /** keybinds[i] is the spell id for action-bar slot i. */
  keybinds: string[];
  hooks: SpecHooks;
}
