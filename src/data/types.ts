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

export interface PriorityStep {
  spellId: string;
  label: string;
  hint: string;
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
