# Verdict: when a queued spell's requirements are checked

## 1. Points of agreement
- A loses legitimate early presses (the Conflagrate case at 1200 with cooldown ready at 1400 and GCD end at 1500). That goes against the queue's purpose and the app's practice goal.
- Pure B hides misplays and lets a doomed press take the single slot. That is unacceptable in a trainer.
- Cooldown is a timing quantity, so checking it against the block end is cheap and deterministic.
- Fire-time re-checks stay in every option. Hooks and procs do not decide the question.

## 2. Real disagreements
- Mana and aura. C checks them only at fire time. E checks them at press time. D uses vague "hard impossibility" checks.
- Immolate mid-cast. E calls a Conflagrate press during the cast a misplay. A, C and D call it core queue-ahead play.
- Config flag. B wants `queueStrictness`. The others do not.

## 3. Blind spots caught in peer review
- The aura applied by the in-progress cast is certain to be up at the block end. So it is a timing case, not a decision error, and E's rule mishandles it.
- Same-millisecond ordering (aura lands, cooldown expires and the queued spell fires at one timestamp) needs a fixed tie-break and a test.
- D never defines "hard impossibility". Its "stale prediction" objection to C is already covered by the fire-time re-check.
- Real client behaviour is unverified, which favours the cheapest reversible choice.

## 4. Recommendation: D (E's split, plus a predicted aura)
- **Press time**, after the existing block/window check passes:
  - Cooldown passes if it is ready at or before the block end.
  - Required aura passes if it is on the target now, or will be applied by the in-progress cast that ends at the block end.
  - Mana passes if current mana covers the cost (unchanged).
- **Fire time:** re-check all three against live state, exactly as today.
- **Doomed request vs a valid queued one:** a press that fails a press-time check is rejected and leaves the queue untouched. A press that passes replaces the queued spell (latest wins, as today).
- **Reject reasons:** keep the existing `gcd` / `busy` (block outside the window), `cooldown` (ready after the block end), `mana` and `missing-aura`. Add no new strings.
- **Logging:**
  - `queue` when a spell is queued.
  - `queue-drop` with reason `cooldown` | `mana` | `missing-aura` when the fire-time check fails.
  - `queue-drop` with reason `replaced` when a later valid press displaces it.
- **Tie-break:** at the block-end timestamp, cast landing, aura application and cooldown expiry run before the queued fire.
- **Config flag: no.** There is one user, and the bot shares the engine, so both should follow one policy. Undo means reverting the commit, which is documented in the ruling. A flag doubles the test matrix for no current consumer.
- **Tests:**
  - Change the cooldown-at-press rejection test so that the Conflagrate press at 1200 fires at 1500.
  - Change the missing-aura test to cover a press during the Immolate cast that then fires.
  - Add tests for a cooldown ready after the block end (rejected), a doomed press that keeps the valid queued spell, a `replaced` drop, and the same-ms ordering.
  - Mana tests stay unchanged.

## 5. First action
Write a failing test: Conflagrate pressed at t=1200, with its cooldown ready at 1400 and the GCD ending at 1500, is queued and fires at exactly 1500.
