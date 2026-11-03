// The simulator request limits, in their own tiny module so the UI can read them without pulling
// the simulator core into the main chunk (the core is loaded with the runner, on the first Run).

/** Accepted ranges of the request's numbers (rounded, then clamped into them). */
export const SIM_LIMITS = Object.freeze({
  runs: Object.freeze({ min: 1, max: 100_000 }),
  spellQueueWindowMs: Object.freeze({ min: 0, max: 1000 }),
});
