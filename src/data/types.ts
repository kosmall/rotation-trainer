import type {
  AuraDef,
  CharacterSetup,
  RawStats,
  SetBonusDef,
  SimSnapshot,
  SpecHooks,
  SpellDef,
  SpellModifier,
} from '../engine/types';

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
