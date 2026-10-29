// Deterministic priority-list player, used by tests and by the scoring feature. Framework-free:
// it drives a Simulation only through its public API (cast, advanceTo, snapshot) and has no
// clock or randomness of its own.

import type { PriorityStep } from '../data/types';
import type { Simulation } from '../engine/sim';
import type { SimSnapshot } from '../engine/types';

/**
 * Plays `priority` until the fight ends. Every `stepMs` of fight time it takes one snapshot and
 * walks the steps in order: a step whose `when(snapshot)` is false is skipped; otherwise its
 * spell is pressed, and a rejected cast (busy, gcd, cooldown, no-mana, missing-aura) falls
 * through to the next step. The first accepted cast (queued counts) ends the walk. Then fight
 * time moves to `now + stepMs`.
 *
 * With a spell queue window, the spell already in the queue is not pressed again (that would
 * replace it with itself and log `queue-drop`): reaching its step ends the walk, while an
 * earlier step that becomes castable replaces it.
 *
 * A rejected cast in `ready` does not start the fight; if no step can start it the bot throws
 * instead of looping forever. Returns the final snapshot's `dps` and `damageTotal`.
 */
export function runBot(
  sim: Simulation,
  priority: readonly PriorityStep[],
  stepMs = 10,
): { dps: number; damageTotal: number } {
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new RangeError(`runBot needs a positive stepMs, got ${stepMs}`);
  for (let s = sim.snapshot(); s.phase !== 'ended'; s = sim.snapshot()) {
    pressFirstCastable(sim, priority, s);
    if (sim.snapshot().phase === 'ready') {
      throw new Error('runBot: no priority step can start the fight (every cast was rejected in ready)');
    }
    sim.advanceTo(s.nowMs + stepMs);
  }
  const { dps, damageTotal } = sim.snapshot();
  return { dps, damageTotal };
}

function pressFirstCastable(sim: Simulation, priority: readonly PriorityStep[], s: SimSnapshot): void {
  for (const step of priority) {
    if (step.when && !step.when(s)) continue;
    if (step.spellId === s.queuedSpellId) return;
    if (sim.cast(step.spellId).ok) return;
  }
}
