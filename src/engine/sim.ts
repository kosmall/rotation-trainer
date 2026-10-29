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
import { projectileTravelMs } from './travel';
import type {
  AuraDef,
  AuraView,
  CastResult,
  CharacterSetup,
  DerivedStats,
  HitOutcome,
  LogEvent,
  RawStats,
  School,
  SimConfig,
  SimSnapshot,
  SpecHooks,
  SpellDef,
  SpellModifier,
  TargetData,
} from './types';

const DEFAULT_DURATION_MS = 60000;
/** Mana regenerates in ticks every 2 s of fight time, from fight start (wowsims `initManaTickAction`). */
const MANA_TICK_MS = 2000;
/**
 * Spirit regen stops for this long after a mana-costing cast completes (the five-second rule;
 * wowsims `ManaCost.SpendCost` sets `FiveSecondRuleRefreshTime` to completion + 5 s).
 */
const FIVE_SECOND_RULE_MS = 5000;

type CastRejection = Extract<CastResult, { ok: false }>['reason'];

/**
 * A scheduled event: an action run when fight time reaches its `atMs`. Events at the same
 * time run in scheduling order. Cast completions, missile impacts, DoT ticks, aura expiry and
 * mana regen are scheduled through `Simulation.schedule`.
 */
type SimEvent = () => void;

/**
 * The cast in progress: what snapshot().cast reports, plus its pending completion event and the
 * mana cost checked at its start (spent at completion, whatever the modifiers are by then).
 */
interface ActiveCast {
  spellId: string;
  startMs: number;
  endMs: number;
  completionEventId: EventId;
  manaCost: number;
}

/** The spell waiting in the single-slot queue, and the event that attempts it when the block ends. */
interface QueuedSpell {
  spellId: string;
  fireEventId: EventId;
}

/** A launched missile: its spell resolves at `landsAtMs` (the impact event). */
interface Missile {
  spellId: string;
  landsAtMs: number;
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
  coeffDelta: number;
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
    coeffDelta: 0,
  };
  for (const m of modifiers) {
    if (!modifierMatches(m, spell)) continue;
    mods.castTimeMsDelta += m.castTimeMsDelta ?? 0;
    mods.manaCostMult *= m.manaCostMult ?? 1;
    mods.damageMult *= m.damageMult ?? 1;
    mods.dotDamageMult *= m.dotDamageMult ?? 1;
    mods.critPctDelta += m.critPctDelta ?? 0;
    mods.critMultDelta += m.critMultDelta ?? 0;
    mods.coeffDelta += m.coeffDelta ?? 0;
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
  /** Spec hooks first, then the hooks of active set bonuses; all run after every completed spell. */
  private readonly hooks: SpecHooks[];
  private readonly events = new EventQueue<SimEvent>();
  private readonly auraDefs = new Map<string, AuraDef>();
  private readonly targetAuras: AuraTracker;
  private readonly selfAuras: AuraTracker;
  private readonly targetAuraEvents = new Map<string, AuraEvents>();
  private readonly selfAuraEvents = new Map<string, AuraEvents>();
  private readonly setup: CharacterSetup;
  /** Stat bonuses and modifiers that never change: spec, gear and active set bonuses. */
  private readonly baseStatBonuses: Partial<RawStats>[];
  private readonly baseModifiers: SpellModifier[];
  /** Built from the base inputs plus the self auras in `statsAuraIds` (see `syncSelfStats`). */
  private stats: DerivedStats;
  /** The active self aura ids (sorted) that `stats` and `spellMods` were last built from. */
  private statsAuraIds: string[] = [];
  private readonly infiniteMana: boolean;
  private readonly spellQueueWindowMs: number;
  /** Yards to the target (0: no travel); with `SpellDef.missileSpeed` gives the travel time. */
  private readonly distanceYd: number;

  private phase: SimSnapshot['phase'] = 'ready';
  private nowMs = 0;
  private gcdEndsAtMs = 0;
  private activeCast: ActiveCast | null = null;
  private queued: QueuedSpell | null = null;
  private readonly cooldownReadyAtMs = new Map<string, number>();
  private mana: number;
  /** When the last spell with a mana cost completed (null: none yet); drives the five-second rule. */
  private lastManaSpendMs: number | null = null;
  private damageTotal = 0;
  private readonly logEvents: LogEvent[] = [];
  /** Missiles in flight, in launch order; each removed by its impact, all dropped at the end. */
  private inFlight: Missile[] = [];

  constructor(config: SimConfig) {
    const spec: SpecData = config.spec;
    this.target = config.target;
    this.durationMs = config.durationMs ?? DEFAULT_DURATION_MS;
    this.infiniteMana = config.infiniteMana ?? false;
    this.spellQueueWindowMs = config.spellQueueWindowMs ?? 0;
    this.distanceYd = config.distanceFromTarget ?? 0;
    this.rng = createRng(config.seed);

    const sets = activeSetBonuses(spec.sets, spec.setup.setPieces);
    this.setup = spec.setup;
    this.baseStatBonuses = [spec.statBonuses, ...sets.map((s) => s.statBonuses ?? {})];
    this.baseModifiers = [...spec.modifiers, ...spec.setup.modifiers, ...sets.flatMap((s) => s.modifiers ?? [])];
    for (const spell of spec.spells) this.spells.set(spell.id, spell);
    for (const aura of spec.auras) this.auraDefs.set(aura.id, aura);
    this.stats = this.buildStatsAndModifiers([]);
    this.hooks = [spec.hooks, ...sets.flatMap((s) => (s.hooks ? [s.hooks] : []))];
    this.targetAuras = new AuraTracker(spec.auras);
    this.selfAuras = new AuraTracker(spec.auras);
    this.mana = this.stats.maxMana;
  }

  /**
   * Starts the fight at 0 ms and schedules every mana regen tick of the fight (at 2000, 4000, ...).
   * They are scheduled first, so a regen tick runs before any other event at the same time.
   * No-op once started.
   */
  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    for (let atMs = MANA_TICK_MS; atMs <= this.durationMs; atMs += MANA_TICK_MS) {
      this.schedule(atMs, () => this.manaTick());
    }
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
    this.syncSelfStats();
    if (tMs >= this.durationMs) this.endFight();
  }

  /**
   * Casts `spellId`, or returns why not without changing anything. In `ready` the checks run
   * at 0 ms, and only an accepted cast starts the fight.
   *
   * Spell queue (ruling R15): a spell blocked by a cast in progress or the GCD whose block ends
   * within `spellQueueWindowMs` is queued instead (`{ok: true, queued: true}`, logged `queue`)
   * and attempted when the block ends, if its press-time checks pass (see
   * `queuePressRejection`); otherwise that reason is returned and nothing changes (an already
   * queued spell stays). A valid press replaces the queued spell (`queue-drop`, reason
   * `replaced`). Outside the window the plain rejection order applies.
   */
  cast(spellId: string): CastResult {
    if (this.phase === 'ended') return { ok: false, reason: 'ended' };
    const spell = this.spells.get(spellId);
    if (!spell) return { ok: false, reason: 'unknown-spell' };
    const blockEndMs = this.blockEndMs(spell);
    if (blockEndMs > this.nowMs && blockEndMs - this.nowMs <= this.spellQueueWindowMs) {
      const pressRejection = this.queuePressRejection(spell, blockEndMs);
      if (pressRejection) return { ok: false, reason: pressRejection };
      this.queueSpell(spell, blockEndMs);
      return { ok: true, queued: true };
    }
    const rejection = this.castRejection(spell);
    if (rejection) return { ok: false, reason: rejection };
    this.start();
    this.startCast(spell);
    return { ok: true };
  }

  /**
   * Aborts the cast in progress: logs `cast-cancel`; no damage, mana or cooldown. The GCD the
   * cast started stays. Also clears the queued spell (silently), even when nothing is being
   * cast. Otherwise a no-op.
   */
  cancelCast(): void {
    this.clearQueue();
    const cast = this.activeCast;
    if (!cast) return;
    this.events.cancel(cast.completionEventId);
    this.activeCast = null;
    this.addLog({ type: 'cast-cancel', spellId: cast.spellId });
  }

  snapshot(): SimSnapshot {
    const cooldownRemainingMs: Record<string, number> = {};
    const spells: SimSnapshot['spells'] = {};
    for (const [id, spell] of this.spells) {
      cooldownRemainingMs[id] = this.cooldownRemaining(id);
      spells[id] = { manaCost: this.manaCost(spell), castTimeMs: this.castTimeMs(spell) };
    }
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
      spells,
      gcdMs: this.gcdMs(),
      targetAuras: this.visibleViews(this.targetAuras),
      selfAuras: this.visibleViews(this.selfAuras),
      damageTotal: this.damageTotal,
      dps: this.nowMs > 0 ? this.damageTotal / (this.nowMs / 1000) : 0,
      queuedSpellId: this.queued?.spellId ?? null,
      // Stable sort: missiles landing in the same ms keep their launch order.
      inFlight: this.inFlight.map((m) => ({ ...m })).sort((a, b) => a.landsAtMs - b.landsAtMs),
    };
  }

  /** The tracker's active auras at `nowMs`, minus those whose def is `hidden`. */
  private visibleViews(tracker: AuraTracker): Record<string, AuraView> {
    const views = tracker.views(this.nowMs);
    for (const id of Object.keys(views)) {
      if (this.auraDefs.get(id)?.hidden) delete views[id];
    }
    return views;
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
      this.syncSelfStats();
      event.payload();
    }
  }

  /**
   * Ends the fight. A cast still in progress is cut off, a queued spell is discarded without
   * `queue-drop` and missiles still in flight never land (no event runs after the end).
   */
  private endFight(): void {
    this.activeCast = null;
    this.queued = null;
    this.inFlight = [];
    this.nowMs = this.durationMs;
    this.phase = 'ended';
  }

  // -------------------------------------------------------------------------
  // Casting
  // -------------------------------------------------------------------------

  /**
   * Why `spell` cannot be cast now, or null. Checks only; changes nothing.
   * Order: busy, cooldown, gcd, missing-aura, no-mana (the mana check is the last one).
   */
  private castRejection(spell: SpellDef): CastRejection | null {
    if (this.activeCast) return 'busy';
    if (this.cooldownRemaining(spell.id) > 0) return 'cooldown';
    if (spell.onGcd && this.nowMs < this.gcdEndsAtMs) return 'gcd';
    if (spell.requiresTargetAura && !this.targetAuras.get(spell.requiresTargetAura, this.nowMs)) {
      return 'missing-aura';
    }
    if (this.mana < this.manaCost(spell)) return 'no-mana';
    return null;
  }

  /**
   * When the busy/gcd block on `spell` ends: the later of the active cast's end and, for an
   * on-GCD spell, the GCD end (a cast shorter than the GCD still leaves the GCD running).
   */
  private blockEndMs(spell: SpellDef): number {
    const castEndMs = this.activeCast?.endMs ?? 0;
    return spell.onGcd ? Math.max(castEndMs, this.gcdEndsAtMs) : castEndMs;
  }

  /**
   * Press-time checks for a spell entering the queue, judged against the block end: the
   * cooldown must be ready at or before `blockEndMs`; the required target aura must be up now
   * or be applied by the cast in progress (which ends by the block end; if it misses, or its
   * missile has not landed by then, the fire-time check drops the spell); the current mana must
   * cover the cost. Order: cooldown, missing-aura, no-mana. Checks only; changes nothing.
   */
  private queuePressRejection(spell: SpellDef, blockEndMs: number): CastRejection | null {
    if ((this.cooldownReadyAtMs.get(spell.id) ?? 0) > blockEndMs) return 'cooldown';
    const auraId = spell.requiresTargetAura;
    if (auraId && !this.targetAuras.get(auraId, this.nowMs) && !this.activeCastAppliesTargetAura(auraId)) {
      return 'missing-aura';
    }
    if (this.mana < this.manaCost(spell)) return 'no-mana';
    return null;
  }

  private activeCastAppliesTargetAura(auraId: string): boolean {
    const cast = this.activeCast;
    if (!cast) return false;
    const applies = this.spells.get(cast.spellId)?.applyAura;
    return applies?.on === 'target' && applies.auraId === auraId;
  }

  /**
   * Puts `spell` in the queue slot, attempted at `fireAtMs`; logs `queue`. A spell already
   * queued is displaced first (`queue-drop`, reason `replaced`).
   */
  private queueSpell(spell: SpellDef, fireAtMs: number): void {
    const displaced = this.queued;
    if (displaced) {
      this.clearQueue();
      this.addLog({ type: 'queue-drop', spellId: displaced.spellId, reason: 'replaced' });
    }
    this.addLog({ type: 'queue', spellId: spell.id });
    this.queued = { spellId: spell.id, fireEventId: this.schedule(fireAtMs, () => this.fireQueued(spell)) };
  }

  /**
   * The block has ended. Every other event at this ms runs first (cast landing, aura apply,
   * ticks, fades, regen), even one scheduled after the queue request: while any is pending the
   * fire moves to the back of this ms. Then all checks run against live state: the spell is
   * cast like a normal cast, or dropped with `queue-drop` and the CastResult reason.
   */
  private fireQueued(spell: SpellDef): void {
    if (this.events.peekTime() === this.nowMs) {
      this.queued = { spellId: spell.id, fireEventId: this.schedule(this.nowMs, () => this.fireQueued(spell)) };
      return;
    }
    this.queued = null;
    const rejection = this.castRejection(spell);
    if (rejection) {
      this.addLog({ type: 'queue-drop', spellId: spell.id, reason: rejection });
      return;
    }
    this.startCast(spell);
  }

  private clearQueue(): void {
    if (!this.queued) return;
    this.events.cancel(this.queued.fireEventId);
    this.queued = null;
  }

  /**
   * Starts the GCD now; completes at once (instant) or schedules the completion at cast end.
   * GCD length, cast time and mana cost are fixed here from the current stats and modifiers:
   * a self aura that changes during the cast does not change them.
   */
  private startCast(spell: SpellDef): void {
    if (spell.onGcd) this.gcdEndsAtMs = this.nowMs + this.gcdMs();
    const castMs = this.castTimeMs(spell);
    const manaCost = this.manaCost(spell);
    if (castMs === 0) {
      this.completeCast(spell, manaCost);
      return;
    }
    const endMs = this.nowMs + castMs;
    this.addLog({ type: 'cast-start', spellId: spell.id });
    const completionEventId = this.schedule(endMs, () => {
      // This event is cancelled with the cast (cancelCast) and never runs after the fight ends,
      // so the active cast is the one it completes.
      const cast = this.activeCast;
      this.activeCast = null;
      if (cast) this.completeCast(spell, cast.manaCost);
    });
    this.activeCast = { spellId: spell.id, startMs: this.nowMs, endMs, completionEventId, manaCost };
  }

  /**
   * Cast end: `cost` (checked at cast start) is spent (a costly spell also starts the
   * five-second rule), the cooldown starts, a `gainMana` spell gives its mana, then the spell's
   * effects resolve: at once, or when its missile lands (see `launchMissile`). Cancelled and
   * cut-off casts never get here, so they spend nothing.
   */
  private completeCast(spell: SpellDef, cost: number): void {
    this.addLog({ type: 'cast-complete', spellId: spell.id });
    if (cost > 0) {
      this.mana = Math.max(0, this.mana - cost);
      this.lastManaSpendMs = this.nowMs;
    }
    if (spell.cooldownMs > 0) this.cooldownReadyAtMs.set(spell.id, this.nowMs + spell.cooldownMs);
    if (spell.gainMana) {
      const amount = this.addMana(spell.gainMana.amount + spell.gainMana.coeff * this.stats.power[spell.school]);
      this.addLog({ type: 'mana', spellId: spell.id, amount });
    }
    const travelMs = projectileTravelMs(spell.missileSpeed, this.distanceYd);
    if (travelMs > 0) this.launchMissile(spell, travelMs);
    else this.resolveSpell(spell);
  }

  /**
   * Schedules the spell's resolution (`resolveSpell`: hit roll, damage, consumption, aura
   * application, hooks) `travelMs` from now, logged first as `impact`, and lists the missile in
   * `inFlight` until then. `cancelCast` does not touch a launched missile; the end of the fight
   * discards it (an impact at exactly `durationMs` still runs).
   *
   * Everything is computed at impact, with the stats, modifiers and target auras current then
   * (design spec, Part A: "at impact: hit/crit roll, damage, aura, charges, hooks"). Note this
   * differs from wowsims tbc-new, which rolls the outcome and computes the damage at cast end
   * (`spell.CalcDamage` in e.g. warlock/shadowbolt.go) and only deals it at impact
   * (`spell.WaitTravelTime` -> `DealDamage`, core/spell_result.go).
   */
  private launchMissile(spell: SpellDef, travelMs: number): void {
    const missile: Missile = { spellId: spell.id, landsAtMs: this.nowMs + travelMs };
    this.inFlight.push(missile);
    this.schedule(missile.landsAtMs, () => {
      this.inFlight = this.inFlight.filter((m) => m !== missile);
      this.addLog({ type: 'impact', spellId: spell.id });
      this.resolveSpell(spell);
    });
  }

  /**
   * Rolls the hit table once per spell (at cast end, or at impact for a missile). On a hit or
   * crit: direct damage, then the consumed target aura is removed, then the spell's aura is
   * applied. A miss does none of these. Then, on every outcome, the hooks run (see `runHooks`).
   */
  private resolveSpell(spell: SpellDef): void {
    const mods = this.modsFor(spell);
    const outcome = rollOutcome(this.rng, {
      missPct: effectiveMissPct(this.target, this.stats.hitPct),
      critPct: this.stats.critPct + mods.critPctDelta,
      canMiss: spell.canMiss,
      canCrit: spell.canCrit,
    });
    let damage = 0;
    if (outcome === 'miss') {
      this.addLog({ type: 'miss', spellId: spell.id });
    } else {
      if (spell.direct) damage = this.dealDirectDamage(spell, spell.direct, mods, outcome);
      if (spell.consumesTargetAura) this.removeAura('target', spell.consumesTargetAura);
      if (spell.applyAura) this.applyAura(spell.applyAura.on, spell.applyAura.auraId, spell);
    }
    this.runHooks(spell, outcome, damage);
  }

  /**
   * Calls `onSpellResolved` of the spec hooks, then of each active set bonus's hooks, once per
   * completed spell, when it resolves (at cast end, or at impact for a missile; every outcome,
   * including spells with no direct damage; `damage` is the direct damage dealt, 0 for none or
   * a miss). They run after the spell's damage, consumption and aura application. Auras
   * applied through the api are logged with this spell as source.
   * `api.roll()` draws from the simulation's seeded Rng, so it shifts every later draw, but
   * only when a hook calls it: hooks that never roll leave the draw order unchanged. The api
   * object is frozen.
   */
  private runHooks(spell: SpellDef, outcome: HitOutcome, damage: number): void {
    const api = Object.freeze({
      applyTargetAura: (id: string) => this.applyAura('target', id, spell),
      applySelfAura: (id: string) => this.applyAura('self', id, spell),
      roll: () => this.rng.next(),
      hasSelfAura: (id: string) => this.selfAuras.get(id, this.nowMs) !== undefined,
      hasTargetAura: (id: string) => this.targetAuras.get(id, this.nowMs) !== undefined,
    });
    for (const hooks of this.hooks) {
      hooks.onSpellResolved?.({ spellId: spell.id, outcome, damage }, api);
    }
  }

  /** Deals and logs the direct damage of a hit or crit; returns the amount. */
  private dealDirectDamage(
    spell: SpellDef,
    direct: NonNullable<SpellDef['direct']>,
    mods: SpellMods,
    outcome: Exclude<HitOutcome, 'miss'>,
  ): number {
    const amount = computeDamage({
      rng: this.rng,
      min: direct.min,
      max: direct.max,
      coeff: direct.coeff + mods.coeffDelta,
      power: this.stats.power[spell.school],
      damageMult: mods.damageMult,
      targetMult: this.targetAuras.damageTakenMult(spell.school, this.nowMs),
      resistMult: this.target.levelResistMult,
      outcome,
      critMultiplier: BASE_CRIT_MULTIPLIER + mods.critMultDelta,
    });
    this.damageTotal += amount;
    this.addLog({ type: 'damage', spellId: spell.id, amount, crit: outcome === 'crit' });
    this.consumeDamageCharges(spell.school, false);
    return amount;
  }

  // -------------------------------------------------------------------------
  // Mana
  // -------------------------------------------------------------------------

  /** The cost checked and stored at cast start (spent at completion); 0 with infiniteMana. */
  private manaCost(spell: SpellDef): number {
    if (this.infiniteMana) return 0;
    return spell.manaCost * this.modsFor(spell).manaCostMult;
  }

  /**
   * One regen tick (2 s worth): mp5 regen always, spirit regen only when no mana-costing spell
   * completed in the last 5000 ms (a spend exactly 5000 ms ago no longer counts). Logged as a
   * `mana` event (no spellId) only when the bar actually changed.
   */
  private manaTick(): void {
    const inFiveSecondRule =
      this.lastManaSpendMs !== null && this.nowMs - this.lastManaSpendMs < FIVE_SECOND_RULE_MS;
    const perSec = this.stats.mp5RegenPerSec + (inFiveSecondRule ? 0 : this.stats.spiritRegenPerSec);
    const amount = this.addMana((perSec * MANA_TICK_MS) / 1000);
    if (amount > 0) this.addLog({ type: 'mana', amount });
  }

  /** Adds up to `amount` (negative counts as 0) without passing maxMana; returns the actual gain. */
  private addMana(amount: number): number {
    const room = this.stats.maxMana - this.mana;
    if (amount >= room) {
      this.mana = this.stats.maxMana;
      return Math.max(0, room);
    }
    if (amount <= 0) return 0;
    this.mana += amount;
    return amount;
  }

  // -------------------------------------------------------------------------
  // Auras and DoTs
  // -------------------------------------------------------------------------

  /**
   * Applies (or refreshes) `auraId` from `source`. A refresh cancels the aura's pending ticks
   * and fade, then reschedules them from now: no immediate tick, no double ticks. Ticks are
   * scheduled for target auras only. The fade event removes the aura through `removeAura`.
   * A self aura's stat bonuses and modifiers take effect at once (`syncSelfStats`).
   * An aura with an `exclusiveGroup` first removes every other applied aura of that group on the
   * same unit (`removeAura`: their pending events cancelled, `aura-fade` logged now).
   */
  private applyAura(on: 'target' | 'self', auraId: string, source: SpellDef): void {
    const def = this.auraDef(auraId);
    const tracker = on === 'target' ? this.targetAuras : this.selfAuras;
    const pending = on === 'target' ? this.targetAuraEvents : this.selfAuraEvents;
    if (def.exclusiveGroup !== undefined) {
      for (const otherId of [...pending.keys()]) {
        if (otherId !== auraId && this.auraDef(otherId).exclusiveGroup === def.exclusiveGroup) {
          this.removeAura(on, otherId);
        }
      }
    }
    this.cancelAuraEvents(pending, auraId);
    tracker.apply(auraId, this.nowMs);
    this.addLog({ type: 'aura-apply', spellId: source.id, auraId });
    const tickEventIds = on === 'target' && def.tick ? this.scheduleTicks(def, def.tick, source) : [];
    const fadeEventId = this.schedule(this.nowMs + def.durationMs, () => this.removeAura(on, auraId));
    pending.set(auraId, { tickEventIds, fadeEventId });
    if (on === 'self') this.syncSelfStats();
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
          this.consumeDamageCharges(tick.school, true);
        }),
      );
    }
    return ids;
  }

  /**
   * The one removal routine for every path: expiry (the fade event), consumption by a spell
   * and running out of charges; target and self auras alike. Cancels the aura's pending ticks
   * and fade, removes it and logs `aura-fade`. An aura counts as applied while it has pending
   * events (set by `applyAura`, cleared here), so each application logs exactly one fade, at
   * the time it actually ends. No-op for an aura that is not applied.
   */
  private removeAura(on: 'target' | 'self', auraId: string): void {
    const pending = on === 'target' ? this.targetAuraEvents : this.selfAuraEvents;
    if (!pending.has(auraId)) return;
    this.cancelAuraEvents(pending, auraId);
    (on === 'target' ? this.targetAuras : this.selfAuras).remove(auraId);
    this.addLog({ type: 'aura-fade', auraId });
    if (on === 'self') this.syncSelfStats();
  }

  /**
   * After one damage instance of `school` (a direct hit or a DoT tick) has been calculated:
   * every active target aura with `damageTakenMult.consumeChargeOnHit` for that school loses
   * one charge (unless the instance is `periodic` and the aura is `directOnly`); one that runs
   * out is removed (`removeAura`, logged `aura-fade` now).
   */
  private consumeDamageCharges(school: School, periodic: boolean): void {
    for (const auraId of Object.keys(this.targetAuras.views(this.nowMs))) {
      const mult = this.auraDef(auraId).damageTakenMult;
      if (!mult?.consumeChargeOnHit || !mult.schools.includes(school)) continue;
      if (periodic && mult.directOnly) continue;
      this.targetAuras.consumeCharge(auraId, this.nowMs);
      if (!this.targetAuras.get(auraId, this.nowMs)) this.removeAura('target', auraId);
    }
  }

  private cancelAuraEvents(pending: Map<string, AuraEvents>, auraId: string): void {
    const events = pending.get(auraId);
    if (!events) return;
    for (const id of events.tickEventIds) this.events.cancel(id);
    this.events.cancel(events.fadeEventId);
    pending.delete(auraId);
  }

  // -------------------------------------------------------------------------
  // Self stats
  // -------------------------------------------------------------------------

  /**
   * Rebuilds the derived stats and the modifier table when the set of active self auras
   * (the self tracker's view at `nowMs`) differs from the one they were built from. Runs
   * before every event, at the end of `advanceTo`, and after a self aura is applied or removed.
   * Because it reads the tracker, an aura is gone from the stats from its exact expiry ms on,
   * even for events at that ms that run before its fade event (e.g. a regen tick).
   *
   * Rules: each active self aura adds its `selfStatBonuses` and `selfModifiers` once, whatever
   * its stacks (a refresh changes nothing). Mana: raising maxMana adds no mana; lowering it
   * clamps mana to [0, maxMana]; with infiniteMana, mana is pinned to the new maxMana.
   */
  private syncSelfStats(): void {
    const ids = Object.keys(this.selfAuras.views(this.nowMs)).sort();
    if (ids.length === this.statsAuraIds.length && ids.every((id, i) => id === this.statsAuraIds[i])) return;
    this.statsAuraIds = ids;
    this.stats = this.buildStatsAndModifiers(ids);
    this.mana = this.infiniteMana ? this.stats.maxMana : Math.max(0, Math.min(this.mana, this.stats.maxMana));
  }

  /**
   * Derived stats from the base bonuses plus the self auras `auraIds`; also rebuilds the
   * per-spell modifier table from the base modifiers plus those auras' modifiers.
   */
  private buildStatsAndModifiers(auraIds: readonly string[]): DerivedStats {
    const auras = auraIds.map((id) => this.auraDef(id));
    const modifiers = [...this.baseModifiers, ...auras.flatMap((a) => a.selfModifiers ?? [])];
    for (const spell of this.spells.values()) this.spellMods.set(spell.id, foldModifiers(spell, modifiers));
    return computeStats(
      this.setup,
      sumStatBonuses([...this.baseStatBonuses, ...auras.map((a) => a.selfStatBonuses ?? {})]),
    );
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
