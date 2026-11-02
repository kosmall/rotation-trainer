import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../data/common/ratings';
import { BOSS_TARGET } from '../data/common/target';
import type { SpecData } from '../data/types';
import { Simulation } from '../engine/sim';
import type { CastResult, LogEvent, ScheduledAura, SimSnapshot } from '../engine/types';

export interface SimulationControls<S extends FightSetup = FightSetup> {
  snapshot: SimSnapshot;
  /** The setup the current fight was built with (the spec its auras and spells come from). */
  fight: S;
  cast(spellId: string): CastResult;
  cancel(): void;
  reset(): void;
  start(): void;
  /**
   * The current fight's log entries from `index` on (the Simulation's read-only `logSince`): an
   * incremental reader keeps its own copy and asks only for the new entries each frame, never the
   * whole log. Stable across fights; pair it with `fightId`.
   */
  logSince(index: number): readonly LogEvent[];
  /** Counts the Simulations built: a new number means a new fight (reset, or a rebuilt fight not started yet). */
  fightId: number;
}

let seedCounter = 0;

/** A fresh seed per fight: wall-clock based (outside the engine), distinct even within one ms. */
function freshSeed(): number {
  seedCounter += 1;
  return (Date.now() + Math.imul(seedCounter, 0x9e3779b9)) >>> 0;
}

/**
 * What a fight is built from: the spec and the fight settings the setup decides (`applySetup`'s
 * result, src/setup/applySetup.ts). Callers may carry more (GameView adds the config).
 */
export interface FightSetup {
  spec: SpecData;
  sim: { scheduledAuras: readonly ScheduledAura[]; distanceFromTarget: number; durationMs: number };
}

/** The fight as the bot tests build it: boss target, default spell queue window, the setup's auras, distance and fight length. */
function createSimulation(setup: FightSetup): Simulation {
  return new Simulation({
    spec: setup.spec,
    target: BOSS_TARGET,
    seed: freshSeed(),
    spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
    distanceFromTarget: setup.sim.distanceFromTarget,
    scheduledAuras: setup.sim.scheduledAuras,
    durationMs: setup.sim.durationMs,
  });
}

/**
 * Owns one Simulation and drives it in real time: fight time is `performance.now()` minus the
 * wall time the fight started at, applied once per animation frame. A backgrounded tab gets no
 * frames; on return the next frame catches up with a single `advanceTo` (the engine runs the
 * skipped events in order). `reset()` replaces the Simulation with a fresh seed.
 *
 * `setup` is read only when a Simulation is built (creation and `reset()`): a fight that has
 * started (or ended) keeps the setup it was built with, and `fight` returns that one; the next
 * fight gets the new setup. A fight that has not started yet (phase 'ready') is rebuilt at once
 * when `setup` changes (a new object), so a setup changed before the first press applies to that
 * fight. Pass a memoized object: every new object counts as a change.
 */
export function useSimulation<S extends FightSetup>(setup: S): SimulationControls<S> {
  const simRef = useRef<Simulation | null>(null);
  /** The setup the current Simulation was built with. */
  const builtRef = useRef<S>(setup);
  /** The latest setup passed in, read by `reset()` (kept current after every commit). */
  const setupRef = useRef<S>(setup);
  if (simRef.current === null) {
    simRef.current = createSimulation(setup);
    builtRef.current = setup;
  }
  const [fight, setFight] = useState<S>(setup);
  const [fightId, setFightId] = useState(0);
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() => (simRef.current as Simulation).snapshot());
  /** performance.now() at fight time 0, or null before the fight starts. */
  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    setupRef.current = setup;
  }, [setup]);

  const sim = useCallback((): Simulation => {
    // Not reached after the first render; uses the last built setup so that a setup change does
    // not recreate this callback (and every callback and effect that depends on it).
    if (simRef.current === null) simRef.current = createSimulation(builtRef.current);
    return simRef.current;
  }, []);

  /** Moves fight time to the wall clock (clamped to [0, fight length]; never NaN or infinite). */
  const catchUp = useCallback(() => {
    const startedAt = startedAtRef.current;
    const s = sim();
    if (startedAt === null) return;
    const elapsed = performance.now() - startedAt;
    if (!Number.isFinite(elapsed)) return;
    const durationMs = s.snapshot().durationMs;
    s.advanceTo(Math.floor(Math.min(Math.max(elapsed, 0), durationMs)));
  }, [sim]);

  const frame = useCallback(() => {
    frameRef.current = null;
    catchUp();
    const next = sim().snapshot();
    setSnapshot(next);
    if (next.phase === 'running') frameRef.current = requestAnimationFrame(frame);
  }, [catchUp, sim]);

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  /** Starts the wall clock and the frame loop once the Simulation is running. */
  const ensureClock = useCallback(() => {
    if (sim().snapshot().phase !== 'running') return;
    if (startedAtRef.current === null) startedAtRef.current = performance.now();
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(frame);
  }, [frame, sim]);

  const cast = useCallback(
    (spellId: string): CastResult => {
      catchUp();
      const result = sim().cast(spellId);
      ensureClock();
      setSnapshot(sim().snapshot());
      return result;
    },
    [catchUp, ensureClock, sim],
  );

  const cancel = useCallback(() => {
    catchUp();
    sim().cancelCast();
    setSnapshot(sim().snapshot());
  }, [catchUp, sim]);

  const start = useCallback(() => {
    sim().start();
    ensureClock();
    setSnapshot(sim().snapshot());
  }, [ensureClock, sim]);

  const reset = useCallback(() => {
    stopLoop();
    startedAtRef.current = null;
    const next = setupRef.current;
    simRef.current = createSimulation(next);
    builtRef.current = next;
    setFight(next);
    setFightId((n) => n + 1);
    setSnapshot(simRef.current.snapshot());
  }, [stopLoop]);

  const logSince = useCallback((index: number): readonly LogEvent[] => sim().logSince(index), [sim]);

  // A new setup rebuilds a fight that has not started; a started or ended fight keeps its own.
  useEffect(() => {
    if (builtRef.current === setup) return;
    if (sim().snapshot().phase !== 'ready') return;
    reset();
  }, [setup, reset, sim]);

  // Resume the loop after a remount (StrictMode) and stop it on unmount.
  useEffect(() => {
    ensureClock();
    return stopLoop;
  }, [ensureClock, stopLoop]);

  return { snapshot, fight, cast, cancel, reset, start, logSince, fightId };
}
