import { useCallback, useEffect, useRef, useState } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../data/common/ratings';
import { BOSS_TARGET } from '../data/common/target';
import type { SpecData } from '../data/types';
import { Simulation } from '../engine/sim';
import type { CastResult, SimSnapshot } from '../engine/types';

export interface SimulationControls {
  snapshot: SimSnapshot;
  cast(spellId: string): CastResult;
  cancel(): void;
  reset(): void;
  start(): void;
}

let seedCounter = 0;

/** A fresh seed per fight: wall-clock based (outside the engine), distinct even within one ms. */
function freshSeed(): number {
  seedCounter += 1;
  return (Date.now() + Math.imul(seedCounter, 0x9e3779b9)) >>> 0;
}

/** The fight exactly as the bot builds it (src/bot tests): boss target, default spell queue window. */
function createSimulation(spec: SpecData): Simulation {
  return new Simulation({ spec, target: BOSS_TARGET, seed: freshSeed(), spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS });
}

/**
 * Owns one Simulation and drives it in real time: fight time is `performance.now()` minus the
 * wall time the fight started at, applied once per animation frame. A backgrounded tab gets no
 * frames; on return the next frame catches up with a single `advanceTo` (the engine runs the
 * skipped events in order). `reset()` replaces the Simulation with a fresh seed.
 */
export function useSimulation(spec: SpecData): SimulationControls {
  const simRef = useRef<Simulation | null>(null);
  if (simRef.current === null) simRef.current = createSimulation(spec);
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() => (simRef.current as Simulation).snapshot());
  /** performance.now() at fight time 0, or null before the fight starts. */
  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const sim = useCallback((): Simulation => {
    if (simRef.current === null) simRef.current = createSimulation(spec);
    return simRef.current;
  }, [spec]);

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
    simRef.current = createSimulation(spec);
    setSnapshot(simRef.current.snapshot());
  }, [spec, stopLoop]);

  // Resume the loop after a remount (StrictMode) and stop it on unmount.
  useEffect(() => {
    ensureClock();
    return stopLoop;
  }, [ensureClock, stopLoop]);

  return { snapshot, cast, cancel, reset, start };
}
