import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../data/common/ratings';
import type { SpecData } from '../data/types';
import type { Simulation } from '../engine/sim';
import type { CastResult, LogEvent, ScheduledAura, SimSnapshot } from '../engine/types';
import { createFightSimulation } from '../sim-runner/fight';

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
  /** The current fight's seed (a new one per fight): the bot replays the same fight with it (Report). */
  seed: number;
  /**
   * The running fight's clock is stopped because no fight view is attached (`pauseOnLeave`); the
   * next `start()` or accepted `cast()` resumes it from the same fight time. False otherwise.
   */
  paused: boolean;
  /**
   * A fight view is on screen (`pauseOnLeave`): call on mount, call the returned function on
   * unmount. When the last one goes, a running fight pauses (its loop stops; fight time stays).
   * Attaching does not resume a paused fight: Space or a spell does. A no-op without `pauseOnLeave`.
   */
  attach(): () => void;
}

export interface SimulationOptions {
  /**
   * Only an attached fight view runs the clock (UI redesign spec §3.3, Q1: leaving the Fight
   * screen pauses the fight). Without it (default) the clock runs whenever the fight does.
   */
  pauseOnLeave?: boolean;
}

let seedCounter = 0;

/** A fresh seed per fight: wall-clock based (outside the engine), distinct even within one ms. */
function freshSeed(): number {
  seedCounter += 1;
  return (Date.now() + Math.imul(seedCounter, 0x9e3779b9)) >>> 0;
}

/**
 * What a fight is built from: the spec and the fight settings the setup decides (`applySetup`'s
 * result, src/setup/applySetup.ts). Callers may carry more (the TrainerProvider adds the config).
 */
export interface FightSetup {
  spec: SpecData;
  sim: { scheduledAuras: readonly ScheduledAura[]; distanceFromTarget: number; durationMs: number };
}

/**
 * The fight as the bot tests build it (`createFightSimulation`, shared with the simulator): boss
 * target, default spell queue window, the setup's auras, distance and fight length, a fresh seed.
 */
function createSimulation(setup: FightSetup): { sim: Simulation; seed: number } {
  const seed = freshSeed();
  return { sim: createFightSimulation(setup, seed, SPELL_QUEUE_WINDOW_MS), seed };
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
export function useSimulation<S extends FightSetup>(setup: S, options: SimulationOptions = {}): SimulationControls<S> {
  const pauseOnLeave = options.pauseOnLeave === true;
  const simRef = useRef<Simulation | null>(null);
  /** The setup the current Simulation was built with. */
  const builtRef = useRef<S>(setup);
  /** The latest setup passed in, read by `reset()` (kept current after every commit). */
  const setupRef = useRef<S>(setup);
  /** The current Simulation's seed. */
  const seedRef = useRef(0);
  if (simRef.current === null) {
    const built = createSimulation(setup);
    simRef.current = built.sim;
    seedRef.current = built.seed;
    builtRef.current = setup;
  }
  const [fight, setFight] = useState<S>(setup);
  const [seed, setSeed] = useState(() => seedRef.current);
  const [fightId, setFightId] = useState(0);
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() => (simRef.current as Simulation).snapshot());
  /** performance.now() at fight time 0, or null before the fight starts. */
  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Fight views attached (`attach`). */
  const attachedRef = useRef(0);
  const pauseOnLeaveRef = useRef(pauseOnLeave);
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    setupRef.current = setup;
    pauseOnLeaveRef.current = pauseOnLeave;
  }, [setup, pauseOnLeave]);

  const sim = useCallback((): Simulation => {
    // Not reached after the first render; uses the last built setup so that a setup change does
    // not recreate this callback (and every callback and effect that depends on it).
    if (simRef.current === null) {
      const built = createSimulation(builtRef.current);
      simRef.current = built.sim;
      seedRef.current = built.seed;
    }
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

  /** Stops the loop and the wall clock of a running fight; fight time stays where it is. */
  const pause = useCallback(() => {
    if (sim().snapshot().phase !== 'running') return;
    catchUp();
    stopLoop();
    startedAtRef.current = null;
    setPaused(true);
    setSnapshot(sim().snapshot());
  }, [catchUp, sim, stopLoop]);

  /**
   * Starts (or resumes) the wall clock and the frame loop once the Simulation is running: fight
   * time continues from the snapshot's `nowMs` (0 at the start). With `pauseOnLeave` and no fight
   * view attached the fight pauses instead.
   */
  const ensureClock = useCallback(() => {
    const s = sim().snapshot();
    if (s.phase !== 'running') return;
    if (pauseOnLeaveRef.current && attachedRef.current === 0) {
      if (startedAtRef.current !== null || frameRef.current !== null) pause();
      else setPaused(true);
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = performance.now() - s.nowMs;
    setPaused(false);
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(frame);
  }, [frame, pause, sim]);

  const attach = useCallback(() => {
    attachedRef.current += 1;
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      attachedRef.current -= 1;
      if (attachedRef.current === 0 && pauseOnLeaveRef.current) pause();
    };
  }, [pause]);

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
    setPaused(false);
    const next = setupRef.current;
    const built = createSimulation(next);
    simRef.current = built.sim;
    seedRef.current = built.seed;
    builtRef.current = next;
    setFight(next);
    setSeed(built.seed);
    setFightId((n) => n + 1);
    setSnapshot(built.sim.snapshot());
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

  return { snapshot, fight, cast, cancel, reset, start, logSince, fightId, seed, paused, attach };
}
