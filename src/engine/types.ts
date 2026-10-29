// Core engine types shared by every later module. Framework-free: no React, no DOM.

import type { SpecData } from '../data/types';

export type School = 'physical' | 'shadow' | 'fire' | 'arcane' | 'frost' | 'nature' | 'holy';

/** Totals of the character's stats before rating conversion (gear + base + buffs). */
export interface RawStats {
  intellect: number;
  spirit: number;
  spellPower: number;
  shadowPower: number;
  firePower: number;
  critRating: number;
  hitRating: number;
  hasteRating: number;
  /**
   * Class base mana EXCLUDING intellect (wowsims `ExtraClassBaseStats[class].Mana`; Warlock level
   * 70: 2615). `computeStats` adds intellect mana: maxMana = baseMana + 15 * intellect - 280
   * (the first 20 intellect give 1 mana each).
   */
  baseMana: number;
  mp5: number;
}

export interface SpellModifier {
  spellIds?: string[];
  schools?: School[];
  castTimeMsDelta?: number;
  manaCostMult?: number;
  damageMult?: number;
  dotDamageMult?: number;
  critPctDelta?: number;
  critMultDelta?: number;
  /** Added to `DirectEffect.coeff` (direct damage only; DoT ticks use `AuraDef.tick.coeffTotal`). */
  coeffDelta?: number;
}

/**
 * Percentage stat effects (racials such as Expansive Mind, talents such as Fel Intellect). Each
 * factor scales the total (setup stats + extra bonuses); absent means 1.
 */
export interface StatMultipliers {
  /** Scales total intellect before it feeds mana, crit and spirit regen. */
  intellect?: number;
  /** Scales total spirit before spirit regen. */
  spirit?: number;
  /** Scales the whole mana pool (base mana and intellect mana). */
  maxMana?: number;
}

export interface CharacterSetup {
  stats: RawStats;
  /** Set id -> number of pieces worn. */
  setPieces: Record<string, number>;
  /** Gear-derived modifiers (for example a meta gem's effect). */
  modifiers: SpellModifier[];
  /** Racial and talent percentage stat effects, applied by `computeStats`. */
  statMultipliers?: StatMultipliers;
}

export type GemColor =
  | 'meta'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'green'
  | 'prismatic';

export interface ItemDef {
  id: number;
  name: string;
  slot: string;
  stats: Partial<RawStats>;
  setId?: string;
  sockets?: GemColor[];
  socketBonus?: Partial<RawStats>;
}

export interface GemDef {
  id: number;
  name: string;
  color: GemColor;
  stats: Partial<RawStats>;
  metaRequires?: Partial<Record<'red' | 'blue' | 'yellow', number>>;
  metaModifiers?: SpellModifier[];
}

export interface EnchantDef {
  id: number;
  name: string;
  stats: Partial<RawStats>;
}

/** Same shape as the WowSimsExporter gear.items entries. */
export interface EquippedItem {
  id: number;
  enchant?: number;
  gems?: number[];
}

export interface DerivedStats {
  maxMana: number;
  power: Record<School, number>;
  critPct: number;
  hitPct: number;
  hastePct: number;
  /** Full (outside the five-second rule) spirit-based mana regeneration per second. */
  spiritRegenPerSec: number;
  mp5RegenPerSec: number;
}

export interface TargetData {
  missPct: number;
  minMissPct: number;
  /** Average damage multiplier from level-based partial resists (1 = no mitigation). */
  levelResistMult: number;
  armor: number;
}

export type HitOutcome = 'miss' | 'hit' | 'crit';

// ---------------------------------------------------------------------------
// Spell and aura definitions (data-driven; see src/data/types.ts for SpecData)
// ---------------------------------------------------------------------------

export interface AuraDef {
  id: string;
  name: string;
  icon: string;
  durationMs: number;
  maxStacks?: number;
  charges?: number;
  /** Damage over time. */
  tick?: { intervalMs: number; total: number; coeffTotal: number; school: School };
  damageTakenMult?: {
    schools: School[];
    mult: number;
    consumeChargeOnHit?: boolean;
    /**
     * With `consumeChargeOnHit`: only direct (non-periodic) damage spends a charge; DoT ticks are
     * still multiplied but spend nothing (Improved Shadow Bolt).
     */
    directOnly?: boolean;
  };
  /** Applied while the aura is active on the player. */
  selfStatBonuses?: Partial<RawStats>;
  selfModifiers?: SpellModifier[];
  /**
   * Bookkeeping aura (for example a set proc's internal cooldown): left out of
   * `SimSnapshot.selfAuras` / `targetAuras`. It is still applied, tracked (hook `hasSelfAura` /
   * `hasTargetAura`), keeps any effect and is logged like any other aura.
   */
  hidden?: boolean;
}

export interface DirectEffect {
  min: number;
  max: number;
  coeff: number;
}

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  school: School;
  manaCost: number;
  castTimeMs: number;
  cooldownMs: number;
  onGcd: boolean;
  canMiss: boolean;
  canCrit: boolean;
  direct?: DirectEffect;
  applyAura?: { auraId: string; on: 'target' | 'self' };
  requiresTargetAura?: string;
  consumesTargetAura?: string;
  gainMana?: { amount: number; coeff: number };
}

export interface AuraView {
  auraId: string;
  stacks: number;
  charges: number;
  remainingMs: number;
}

export interface SpecHooks {
  onSpellResolved?(
    e: { spellId: string; outcome: HitOutcome; damage: number },
    api: {
      applyTargetAura(id: string): void;
      applySelfAura(id: string): void;
      roll(): number;
      hasSelfAura(id: string): boolean;
      hasTargetAura(id: string): boolean;
    },
  ): void;
}

export interface SetBonusDef {
  setId: string;
  name: string;
  pieces: number;
  description: string;
  modifiers?: SpellModifier[];
  statBonuses?: Partial<RawStats>;
  hooks?: SpecHooks;
}

// ---------------------------------------------------------------------------
// Simulation interface shapes (implemented by Simulation in a later task)
// ---------------------------------------------------------------------------

export interface SimConfig {
  spec: SpecData;
  target: TargetData;
  seed: number;
  /** Fight length; defaults to 60000. */
  durationMs?: number;
  infiniteMana?: boolean;
  /** Defaults to 0. */
  spellQueueWindowMs?: number;
}

export type CastResult =
  | { ok: true; queued?: boolean }
  | {
      ok: false;
      reason:
        | 'not-ready'
        | 'ended'
        | 'unknown-spell'
        | 'cooldown'
        | 'gcd'
        | 'busy'
        | 'no-mana'
        | 'missing-aura';
    };

export type LogType =
  | 'cast-start'
  | 'cast-complete'
  | 'cast-cancel'
  | 'damage'
  | 'miss'
  | 'tick'
  | 'aura-apply'
  | 'aura-fade'
  | 'mana'
  | 'queue'
  | 'queue-drop';

export interface LogEvent {
  atMs: number;
  type: LogType;
  spellId?: string;
  auraId?: string;
  amount?: number;
  crit?: boolean;
  /**
   * `queue-drop` only: why the queued spell was dropped: a CastResult reason when its fire-time
   * check failed ('cooldown', 'no-mana', 'missing-aura', 'busy', 'gcd'), or 'replaced'.
   */
  reason?: string;
}

export interface SimSnapshot {
  nowMs: number;
  phase: 'ready' | 'running' | 'ended';
  durationMs: number;
  gcdEndsAtMs: number;
  cast: { spellId: string; startMs: number; endMs: number } | null;
  mana: number;
  maxMana: number;
  cooldownRemainingMs: Record<string, number>;
  /** Active target auras, without `hidden` ones. */
  targetAuras: Record<string, AuraView>;
  /** Active self auras, without `hidden` ones. */
  selfAuras: Record<string, AuraView>;
  damageTotal: number;
  dps: number;
  queuedSpellId: string | null;
}
