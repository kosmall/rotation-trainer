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
  /**
   * Hit chance bonus in percent for matching spells (wowsims `SpellMod_BonusHit_Percent`, e.g.
   * Suppression), summed over the matching modifiers like `critPctDelta`; the hit roll uses the
   * caster's hit plus it, before the target's minimum miss chance (`effectiveMissPct`).
   */
  hitPctDelta?: number;
  critMultDelta?: number;
  /** Added to `DirectEffect.coeff` (direct damage only; DoT ticks use `AuraDef.tick.coeffTotal`). */
  coeffDelta?: number;
  /**
   * Extra ticks of the DoT the spell applies (its own `applyAura` on the target, an aura with a
   * `tick`), e.g. Voidheart Raiment 4pc (wowsims `SpellMod_DotNumberOfTicks_Flat`): the aura
   * lasts `durationMs + extra x tick.intervalMs` and ticks `base + extra` times; every tick is the
   * unchanged base tick (total and power snapshot over the base tick count), so each extra tick
   * adds one tick of damage. Summed over the matching modifiers when the DoT is applied; a
   * non-positive or non-finite sum adds nothing, a fraction is floored. Auras applied by hooks or
   * scheduled by the fight are never extended.
   */
  dotExtraTicks?: number;
}

/**
 * Percentage stat effects (racials such as Expansive Mind, talents such as Fel Intellect, buffs
 * such as Blessing of Kings or Heroism). Each factor scales the total (setup stats + extra
 * bonuses); absent means 1. Several sets of multipliers (the setup's and those of active self
 * auras) combine multiplicatively, factor by factor.
 */
export interface StatMultipliers {
  /** Scales total intellect before it feeds mana, crit and spirit regen. */
  intellect?: number;
  /** Scales total spirit before spirit regen. */
  spirit?: number;
  /** Scales the whole mana pool (base mana and intellect mana). */
  maxMana?: number;
  /**
   * Multiplies the haste factor `1 + ratingHastePct / 100` (Heroism / Bloodlust: 1.3), so
   * `hastePct = ((1 + ratingHastePct / 100) * haste - 1) * 100` (wowsims tbc-new
   * sim/core/unit.go `TotalSpellHasteMultiplier` = `CastSpeedMultiplier * (1 + rating / ...)`;
   * buffs multiply `CastSpeedMultiplier` through `MultiplyCastSpeed`).
   */
  haste?: number;
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
  /**
   * Meta gems whose requirement compares two colours: active only with strictly more gems of
   * colour `more` than of colour `than` (wowsims tbc-new sim/core/reforge_optimizer/
   * meta_gem_constraints.go `compareColorGreater` / `compareColorLesser`). Checked by `buildSetup`
   * together with `metaRequires`.
   */
  metaCompare?: { more: 'red' | 'blue' | 'yellow'; than: 'red' | 'blue' | 'yellow' };
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
  /** Wowhead (TBC) spell id: source of the icon file; `npm run icons` verifies `icon` against it. */
  wowheadId?: number;
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
   * Applied while the aura is active on the player, combined multiplicatively with
   * `CharacterSetup.statMultipliers` and the other active self auras' multipliers. Like
   * `selfStatBonuses`, counted once whatever the stacks.
   */
  selfStatMultipliers?: StatMultipliers;
  /**
   * Bookkeeping aura (for example a set proc's internal cooldown): left out of
   * `SimSnapshot.selfAuras` / `targetAuras`. It is still applied, tracked (hook `hasSelfAura` /
   * `hasTargetAura`), keeps any effect and is logged like any other aura.
   */
  hidden?: boolean;
  /**
   * Auras sharing a group are mutually exclusive on one unit (for example a warlock's curses:
   * one per target). Applying an aura of a group removes every other live aura of that group on
   * the same unit (target or self) first, through the normal removal (pending ticks and fade
   * cancelled, `aura-fade` logged at that ms). Re-applying the same aura is a plain refresh. The
   * same group on the target and on the player does not interact.
   */
  exclusiveGroup?: string;
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
  /** Wowhead (TBC) spell id: source of the icon file; `npm run icons` verifies `icon` against it. */
  wowheadId?: number;
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
  /**
   * Missile speed in yd/s. With a positive speed and `SimConfig.distanceFromTarget` > 0 the spell
   * resolves when the missile lands (`projectileTravelMs`), not at cast end. Absent or 0: no
   * missile, resolves at cast end.
   */
  missileSpeed?: number;
  /**
   * An item action (trinket, potion, rune): used instantly, whatever the data says. The engine
   * treats it as off the GCD, with no cast time and no mana cost (`snapshot().spells` reports
   * 0 and 0), so it never starts the GCD or the five-second rule. Its use logs `cast-complete`
   * (no `cast-start`), spends nothing, starts its own and shared cooldowns, gives its mana
   * (`gainMana`, `gainManaRange`), then applies `applyAura`; nothing else: no hit or crit roll,
   * no damage, no aura consumption, no missile, no hooks. Rejections (`busy`, `cooldown`) and
   * the spell queue work as for any off-GCD spell: only a cast in progress blocks it.
   */
  item?: true;
  /**
   * A cooldown shared by every spell of `group` (wowsims "shared cooldown" categories, e.g.
   * trinkets or potions): on completion, each spell whose `sharedCooldown.group` matches
   * (including this one) becomes ready no earlier than now + `ms` (whole ms, >= 0). A longer
   * cooldown already running is never shortened; the spell's own `cooldownMs` also applies.
   * Invalid `ms` throws a RangeError when the Simulation is built.
   */
  sharedCooldown?: { group: string; ms: number };
  /**
   * A random mana gain at completion: one draw of the simulation's Rng, uniform over the
   * integers `min..max` (both included): `min + floor(rng() * (max - min + 1))`, added like
   * `gainMana` (capped at max mana) and logged as `mana` with this spell's id and the actual
   * gain. Drawn only when the spell is used. `min`/`max` must be non-negative integers with
   * `min <= max`, or the Simulation constructor throws a RangeError.
   */
  gainManaRange?: { min: number; max: number };
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
      /**
       * Gives the player up to `amount` mana (never past max mana; 0, negative or NaN gives
       * nothing) and returns the actual gain. A positive gain is logged as a `mana` event with
       * the resolving spell's id (Judgement of Wisdom-like procs).
       */
      addMana(amount: number): number;
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

/**
 * An aura applied by the fight itself, not by a spell (raid buffs and debuffs, Heroism,
 * potions, trinkets): `auraId` (an `AuraDef` of the spec) goes on the player (`self`) or the
 * target at fight time `atMs`. Applied through the normal aura rules (refresh, stacks, charges,
 * `exclusiveGroup`), with no source spell: logged `aura-apply` without `spellId`, no hooks, and a
 * DoT ticks with `dotDamageMult` 1.
 */
export interface ScheduledAura {
  auraId: string;
  on: 'self' | 'target';
  /**
   * Fight time in ms (floored). `<= 0`: applied when the fight starts, before the first cast.
   * After the fight's end, NaN or infinite: the entry is ignored.
   */
  atMs: number;
  /**
   * Replaces the aura's own `durationMs` for this application (floored). NaN, infinite or
   * `<= 0`: the entry is ignored. A duration running past the fight's end is cut by the end.
   * For a DoT the aura's total damage is spread over the ticks of the new duration, so use it
   * for self auras and non-DoT target debuffs only.
   */
  durationMs?: number;
}

export interface SimConfig {
  spec: SpecData;
  target: TargetData;
  seed: number;
  /** Fight length; defaults to 60000. */
  durationMs?: number;
  infiniteMana?: boolean;
  /** Defaults to 0. */
  spellQueueWindowMs?: number;
  /**
   * Distance to the target in yards; defaults to 0 (no travel: every spell resolves at cast end).
   * Missile spells (`SpellDef.missileSpeed`) land `projectileTravelMs(missileSpeed, distance)` ms
   * after their cast ends.
   */
  distanceFromTarget?: number;
  /** Auras the fight applies at set times (see `ScheduledAura`); entries applied in order. */
  scheduledAuras?: readonly ScheduledAura[];
}

export type CastResult =
  | { ok: true; queued?: boolean }
  | {
      ok: false;
      reason:
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
  /** A missile landed: logged first at the impact ms, before its damage/miss/aura entries. */
  | 'impact'
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
  /**
   * Per spell id, the values a cast started now would use: after talents, gear, set bonuses,
   * active self auras and haste, as the engine computes them (`castTimeMs` rounded to whole ms,
   * 0 = instant; `manaCost` unrounded, 0 with infiniteMana).
   */
  spells: Record<string, { manaCost: number; castTimeMs: number }>;
  /** The GCD an on-GCD spell started now would trigger (hasted, at least MIN_GCD_MS). */
  gcdMs: number;
  /** Active target auras, without `hidden` ones. */
  targetAuras: Record<string, AuraView>;
  /** Active self auras, without `hidden` ones. */
  selfAuras: Record<string, AuraView>;
  damageTotal: number;
  dps: number;
  queuedSpellId: string | null;
  /**
   * Missiles launched (cast completed) that have not landed yet, sorted by `landsAtMs` (launch
   * order on ties). Empty once the fight has ended: missiles still flying then never land.
   */
  inFlight: { spellId: string; landsAtMs: number }[];
}
