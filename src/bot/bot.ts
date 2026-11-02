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
 *
 * Steps at which no press can be accepted are skipped (simulator Task 2 performance wave): after
 * the walk, the bot moves straight to the first step time at or after
 * `sim.nextPressOpportunityMs()` (never before `now + stepMs`). At a skipped step every press
 * would have been rejected, and a rejected press changes nothing; taking a snapshot changes
 * nothing; and one `advanceTo` over several steps runs the same events in the same order as one
 * call per step. So the fight (log, RNG draws, result) is exactly that of a walk at every step
 * (pinned in tests/bot/bot-equivalence.test.ts). `when` conditions must be pure functions of the
 * snapshot (they are never called at a skipped step).
 */
export function runBot(
  sim: Simulation,
  priority: readonly PriorityStep[],
  stepMs = 10,
): { dps: number; damageTotal: number } {
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new RangeError(`runBot needs a positive stepMs, got ${stepMs}`);
  for (let s = sim.snapshot(); s.phase !== 'ended'; s = sim.snapshot()) {
    pressFirstCastable(sim, priority, s);
    if (sim.currentPhase() === 'ready') {
      throw new Error('runBot: no priority step can start the fight (every cast was rejected in ready)');
    }
    sim.advanceTo(nextStepMs(s.nowMs, stepMs, sim.nextPressOpportunityMs()));
  }
  const { dps, damageTotal } = sim.snapshot();
  return { dps, damageTotal };
}

/**
 * The next step time: `now + k x stepMs` for the smallest k >= 1 with that time at or after
 * `opensAtMs` (the same grid the bot would walk one step at a time).
 */
function nextStepMs(nowMs: number, stepMs: number, opensAtMs: number): number {
  const next = nowMs + stepMs;
  // A fractional step is floored by every advanceTo: walk it one step at a time, as before.
  if (!Number.isInteger(stepMs)) return next;
  return opensAtMs > next ? next + Math.ceil((opensAtMs - next) / stepMs) * stepMs : next;
}

function pressFirstCastable(sim: Simulation, priority: readonly PriorityStep[], s: SimSnapshot): void {
  for (const step of priority) {
    if (step.when && !step.when(s)) continue;
    if (step.spellId === s.queuedSpellId) return;
    if (sim.cast(step.spellId).ok) return;
  }
}
