// The fight simulation. Framework-free and deterministic: fight time only moves through
// advanceTo(), all randomness comes from the seeded Rng, and all times are integer ms.

import { BASE_CRIT_MULTIPLIER, BASE_GCD_MS, MIN_GCD_MS } from '../data/common/ratings';
import type { SpecData } from '../data/types';
import { AuraTracker } from './auras';
import { computeDamage, effectiveMissPct, rollOutcome } from './damage';
import { EventQueue } from './events';
import type { EventId } from './events';
import { createRng } from './rng';
import type { Rng } from './rng';
import { activeSetBonuses } from './sets';
import { computeStats } from './stats';
import type {
  AuraDef,
  CastResult,
  DerivedStats,
  HitOutcome,
  LogEvent,
  RawStats,
  SimConfig,
  SimSnapshot,
  SpecHooks,
  SpellDef,
  SpellModifier,
  TargetData,
} from './types';

const DEFAULT_DURATION_MS = 60000;

type CastRejection = Extract<CastResult, { ok: false }>['reason'];

/**
 * A scheduled event: an action run when fight time reaches its `atMs`. Events at the same
 * time run in scheduling order. Cast completions, DoT ticks, aura expiry and mana regen
 * are scheduled through `Simulation.schedule`.
 */
type SimEvent = () => void;

/** The cast in progress: what snapshot().cast reports, plus its pending completion event. */
interface ActiveCast {
  spellId: string;
  startMs: number;
  endMs: number;
  completionEventId: EventId;
}

/** The pending events of an active aura; cancelled when it is refreshed or consumed. */
interface AuraEvents {
  tickEventIds: EventId[];
  fadeEventId: EventId;
}

/** Every modifier matching one spell, folded: multipliers multiplied, deltas summed. */
interface SpellMods {
  castTimeMsDelta: number;
  manaCostMult: number;
  damageMult: number;
  dotDamageMult: number;
  critPctDelta: number;
  critMultDelta: number;
}

function modifierMatches(m: SpellModifier, spell: SpellDef): boolean {
  return (
    (m.spellIds === undefined || m.spellIds.includes(spell.id)) &&
    (m.schools === undefined || m.schools.includes(spell.school))
  );
}

function foldModifiers(spell: SpellDef, modifiers: readonly SpellModifier[]): SpellMods {
  const mods: SpellMods = {
    castTimeMsDelta: 0,
    manaCostMult: 1,
    damageMult: 1,
    dotDamageMult: 1,
    critPctDelta: 0,
    critMultDelta: 0,
  };
  for (const m of modifiers) {
    if (!modifierMatches(m, spell)) continue;
    mods.castTimeMsDelta += m.castTimeMsDelta ?? 0;
    mods.manaCostMult *= m.manaCostMult ?? 1;
    mods.damageMult *= m.damageMult ?? 1;
    mods.dotDamageMult *= m.dotDamageMult ?? 1;
    mods.critPctDelta += m.critPctDelta ?? 0;
    mods.critMultDelta += m.critMultDelta ?? 0;
  }
  return mods;
}

function sumStatBonuses(bonuses: readonly Partial<RawStats>[]): Partial<RawStats> {
  const sum: Partial<RawStats> = {};
  for (const b of bonuses) {
    for (const key of Object.keys(b) as (keyof RawStats)[]) {
      sum[key] = (sum[key] ?? 0) + (b[key] ?? 0);
    }
  }
  return sum;
}

export class Simulation {
  private readonly target: TargetData;
  private readonly durationMs: number;
  private readonly rng: Rng;
  private readonly spells = new Map<string, SpellDef>();
  private readonly spellMods = new Map<string, SpellMods>();
  /** Spec hooks first, then the hooks of active set bonuses (invoked from Task 11 on). */
  private readonly hooks: SpecHooks[];
  private readonly events = new EventQueue<SimEvent>();
  private readonly auraDefs = new Map<string, AuraDef>();
  private readonly targetAuras: AuraTracker;
  private readonly selfAuras: AuraTracker;
  private readonly targetAuraEvents = new Map<string, AuraEvents>();
  private readonly selfAuraEvents = new Map<string, AuraEvents>();
  private readonly stats: DerivedStats;

  private phase: SimSnapshot['phase'] = 'ready';
  private nowMs = 0;
  private gcdEndsAtMs = 0;
  private activeCast: ActiveCast | null = null;
  private readonly cooldownReadyAtMs = new Map<string, number>();
  private mana: number;
  private damageTotal = 0;
  private readonly logEvents: LogEvent[] = [];

  constructor(config: SimConfig) {
    const spec: SpecData = config.spec;
    this.target = config.target;
    this.durationMs = config.durationMs ?? DEFAULT_DURATION_MS;
    this.rng = createRng(config.seed);

    const sets = activeSetBonuses(spec.sets, spec.setup.setPieces);
    this.stats = computeStats(
      spec.setup,
      sumStatBonuses([spec.statBonuses, ...sets.map((s) => s.statBonuses ?? {})]),
    );
    const modifiers = [
      ...spec.modifiers,
      ...spec.setup.modifiers,
      ...sets.flatMap((s) => s.modifiers ?? []),
    ];
    for (const spell of spec.spells) {
      this.spells.set(spell.id, spell);
      this.spellMods.set(spell.id, foldModifiers(spell, modifiers));
    }
    this.hooks = [spec.hooks, ...sets.flatMap((s) => (s.hooks ? [s.hooks] : []))];
    for (const aura of spec.auras) this.auraDefs.set(aura.id, aura);
    this.targetAuras = new AuraTracker(spec.auras);
    this.selfAuras = new AuraTracker(spec.auras);
    // Mana is not spent yet (Task 9); the bar stays full.
    this.mana = this.stats.maxMana;
  }

  /** Starts the fight at 0 ms. No-op once started. */
  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
  }

  /**
   * Moves fight time forward to `timeMs` floored to whole ms (`tMs`), running every event with
   * `atMs <= min(tMs, durationMs)` in order. Reaching `durationMs` ends the fight. No-op before
   * start, after the end, and for times not after the current time. NaN and infinite times
   * throw a RangeError (in every phase).
   */
  advanceTo(timeMs: number): void {
    if (!Number.isFinite(timeMs)) throw new RangeError(`advanceTo needs a finite time, got ${timeMs}`);
    const tMs = Math.floor(timeMs);
    if (this.phase !== 'running') return;
    const untilMs = Math.min(tMs, this.durationMs);
    this.runEventsThrough(untilMs);
    if (untilMs > this.nowMs) this.nowMs = untilMs;
    if (tMs >= this.durationMs) this.endFight();
  }

  /**
   * Casts `spellId`, or returns why not without changing anything. In `ready` the checks run
   * at 0 ms, and only an accepted cast starts the fight.
   */
  cast(spellId: string): CastResult {
    if (this.phase === 'ended') return { ok: false, reason: 'ended' };
    const spell = this.spells.get(spellId);
    if (!spell) return { ok: false, reason: 'unknown-spell' };
    const rejection = this.castRejection(spell);
    if (rejection) return { ok: false, reason: rejection };
    this.start();
    this.startCast(spell);
    return { ok: true };
  }

  /**
   * Aborts the cast in progress: logs `cast-cancel`; no damage, mana or cooldown. The GCD the
   * cast started stays. No-op when nothing is being cast.
   */
  cancelCast(): void {
    const cast = this.activeCast;
    if (!cast) return;
    this.events.cancel(cast.completionEventId);
    this.activeCast = null;
    this.addLog({ type: 'cast-cancel', spellId: cast.spellId });
  }

  snapshot(): SimSnapshot {
    const cooldownRemainingMs: Record<string, number> = {};
    for (const id of this.spells.keys()) cooldownRemainingMs[id] = this.cooldownRemaining(id);
    return {
      nowMs: this.nowMs,
      phase: this.phase,
      durationMs: this.durationMs,
      gcdEndsAtMs: this.gcdEndsAtMs,
      cast: this.activeCast
        ? { spellId: this.activeCast.spellId, startMs: this.activeCast.startMs, endMs: this.activeCast.endMs }
        : null,
      mana: this.mana,
      maxMana: this.stats.maxMana,
      cooldownRemainingMs,
      targetAuras: this.targetAuras.views(this.nowMs),
      selfAuras: this.selfAuras.views(this.nowMs),
      damageTotal: this.damageTotal,
      dps: this.nowMs > 0 ? this.damageTotal / (this.nowMs / 1000) : 0,
      queuedSpellId: null,
    };
  }

  /** A copy of the combat log (entries copied too), oldest first. */
  log(): readonly LogEvent[] {
    return this.logEvents.map((e) => ({ ...e }));
  }

  // -------------------------------------------------------------------------
  // Time and events
  // -------------------------------------------------------------------------

  /** Schedules `action` at fight time `atMs` (never in the past); the id cancels it. */
  private schedule(atMs: number, action: SimEvent): EventId {
    if (atMs < this.nowMs) throw new Error(`cannot schedule in the past: ${atMs} < ${this.nowMs}`);
    return this.events.schedule(atMs, action);
  }

  private runEventsThrough(untilMs: number): void {
    for (;;) {
      const atMs = this.events.peekTime();
      if (atMs === undefined || atMs > untilMs) return;
      const event = this.events.pop();
      if (!event) return;
      this.nowMs = event.atMs;
      event.payload();
    }
  }

  /** Ends the fight. A cast still in progress is cut off (no event runs after the end). */
  private endFight(): void {
    this.activeCast = null;
    this.nowMs = this.durationMs;
    this.phase = 'ended';
  }

  // -------------------------------------------------------------------------
  // Casting
  // -------------------------------------------------------------------------

  /** Why `spell` cannot be cast now, or null. Checks only; changes nothing. */
  private castRejection(spell: SpellDef): CastRejection | null {
    if (this.activeCast) return 'busy';
    if (this.cooldownRemaining(spell.id) > 0) return 'cooldown';
    if (spell.onGcd && this.nowMs < this.gcdEndsAtMs) return 'gcd';
    if (spell.requiresTargetAura && !this.targetAuras.get(spell.requiresTargetAura, this.nowMs)) {
      return 'missing-aura';
    }
    return null;
  }

  /** Starts the GCD now; completes at once (instant) or schedules the completion at cast end. */
  private startCast(spell: SpellDef): void {
    if (spell.onGcd) this.gcdEndsAtMs = this.nowMs + this.gcdMs();
    const castMs = this.castTimeMs(spell);
    if (castMs === 0) {
      this.completeCast(spell);
      return;
    }
    const endMs = this.nowMs + castMs;
    this.addLog({ type: 'cast-start', spellId: spell.id });
    const completionEventId = this.schedule(endMs, () => {
      this.activeCast = null;
      this.completeCast(spell);
    });
    this.activeCast = { spellId: spell.id, startMs: this.nowMs, endMs, completionEventId };
  }

  /** Cast end: cooldown, then the spell's effects. Mana is spent here from Task 9 on. */
  private completeCast(spell: SpellDef): void {
    this.addLog({ type: 'cast-complete', spellId: spell.id });
    if (spell.cooldownMs > 0) this.cooldownReadyAtMs.set(spell.id, this.nowMs + spell.cooldownMs);
    this.resolveSpell(spell);
  }

  /**
   * Rolls the hit table once per spell. On a hit or crit: direct damage, then the consumed
   * target aura is removed, then the spell's aura is applied. A miss does none of these.
   */
  private resolveSpell(spell: SpellDef): void {
    const mods = this.modsFor(spell);
    const outcome = rollOutcome(this.rng, {
      missPct: effectiveMissPct(this.target, this.stats.hitPct),
      critPct: this.stats.critPct + mods.critPctDelta,
      canMiss: spell.canMiss,
      canCrit: spell.canCrit,
    });
    if (outcome === 'miss') {
      this.addLog({ type: 'miss', spellId: spell.id });
      return;
    }
    if (spell.direct) this.dealDirectDamage(spell, mods, outcome);
    if (spell.consumesTargetAura) this.removeTargetAura(spell.consumesTargetAura);
    if (spell.applyAura) this.applyAura(spell.applyAura.on, spell.applyAura.auraId, spell);
  }

  private dealDirectDamage(spell: SpellDef, mods: SpellMods, outcome: Exclude<HitOutcome, 'miss'>): void {
    const direct = spell.direct;
    if (!direct) return;
    const amount = computeDamage({
      rng: this.rng,
      min: direct.min,
      max: direct.max,
      coeff: direct.coeff,
      power: this.stats.power[spell.school],
      damageMult: mods.damageMult,
      targetMult: this.targetAuras.damageTakenMult(spell.school, this.nowMs),
      resistMult: this.target.levelResistMult,
      outcome,
      critMultiplier: BASE_CRIT_MULTIPLIER + mods.critMultDelta,
    });
    this.damageTotal += amount;
    this.addLog({ type: 'damage', spellId: spell.id, amount, crit: outcome === 'crit' });
  }

  // -------------------------------------------------------------------------
  // Auras and DoTs
  // -------------------------------------------------------------------------

  /**
   * Applies (or refreshes) `auraId` from `source`. A refresh cancels the aura's pending ticks
   * and fade, then reschedules them from now: no immediate tick, no double ticks. Ticks are
   * scheduled for target auras only. The fade event removes the aura and logs `aura-fade`.
   */
  private applyAura(on: 'target' | 'self', auraId: string, source: SpellDef): void {
    const def = this.auraDef(auraId);
    const tracker = on === 'target' ? this.targetAuras : this.selfAuras;
    const pending = on === 'target' ? this.targetAuraEvents : this.selfAuraEvents;
    this.cancelAuraEvents(pending, auraId);
    tracker.apply(auraId, this.nowMs);
    this.addLog({ type: 'aura-apply', spellId: source.id, auraId });
    const tickEventIds = on === 'target' && def.tick ? this.scheduleTicks(def, def.tick, source) : [];
    const fadeEventId = this.schedule(this.nowMs + def.durationMs, () => {
      pending.delete(auraId);
      tracker.remove(auraId);
      this.addLog({ type: 'aura-fade', auraId });
    });
    pending.set(auraId, { tickEventIds, fadeEventId });
  }

  /**
   * Schedules the DoT's `durationMs / intervalMs` ticks (floored) at every interval from now.
   * Power and the source spell's `dotDamageMult` are snapshotted here; each tick reads the
   * target's damage-taken multiplier current at that tick. Ticks never crit.
   */
  private scheduleTicks(def: AuraDef, tick: NonNullable<AuraDef['tick']>, source: SpellDef): EventId[] {
    const count = Math.floor(def.durationMs / tick.intervalMs);
    if (count <= 0) return [];
    const perTick = (tick.total + tick.coeffTotal * this.stats.power[tick.school]) / count;
    const dotDamageMult = this.modsFor(source).dotDamageMult;
    const ids: EventId[] = [];
    for (let k = 1; k <= count; k++) {
      ids.push(
        this.schedule(this.nowMs + k * tick.intervalMs, () => {
          const amount = Math.round(
            perTick *
              dotDamageMult *
              this.targetAuras.damageTakenMult(tick.school, this.nowMs) *
              this.target.levelResistMult,
          );
          this.damageTotal += amount;
          this.addLog({ type: 'tick', spellId: source.id, auraId: def.id, amount });
        }),
      );
    }
    return ids;
  }

  /** Removes an active target aura and its pending ticks and fade; logs `aura-fade`. */
  private removeTargetAura(auraId: string): void {
    if (!this.targetAuras.get(auraId, this.nowMs)) return;
    this.cancelAuraEvents(this.targetAuraEvents, auraId);
    this.targetAuras.remove(auraId);
    this.addLog({ type: 'aura-fade', auraId });
  }

  private cancelAuraEvents(pending: Map<string, AuraEvents>, auraId: string): void {
    const events = pending.get(auraId);
    if (!events) return;
    for (const id of events.tickEventIds) this.events.cancel(id);
    this.events.cancel(events.fadeEventId);
    pending.delete(auraId);
  }

  private auraDef(auraId: string): AuraDef {
    const def = this.auraDefs.get(auraId);
    if (!def) throw new Error(`unknown aura: ${auraId}`);
    return def;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** `max(0, round((base + castTimeMsDelta) / (1 + haste)))`; 0 means instant. */
  private castTimeMs(spell: SpellDef): number {
    const baseMs = spell.castTimeMs + this.modsFor(spell).castTimeMsDelta;
    return Math.max(0, Math.round(baseMs / (1 + this.stats.hastePct / 100)));
  }

  private gcdMs(): number {
    return Math.max(MIN_GCD_MS, Math.round(BASE_GCD_MS / (1 + this.stats.hastePct / 100)));
  }

  private cooldownRemaining(spellId: string): number {
    return Math.max(0, (this.cooldownReadyAtMs.get(spellId) ?? 0) - this.nowMs);
  }

  private modsFor(spell: SpellDef): SpellMods {
    const mods = this.spellMods.get(spell.id);
    if (!mods) throw new Error(`no modifiers for spell: ${spell.id}`);
    return mods;
  }

  private addLog(event: Omit<LogEvent, 'atMs'>): void {
    this.logEvents.push({ atMs: this.nowMs, ...event });
  }
}
