# Council question: when should a queued spell's requirements be checked?

## Product
A personal rotation-practice app for WoW TBC Classic Anniversary (Destruction Warlock first). A deterministic, event-driven simulation engine (TypeScript) drives a playable 60 s fight vs a target dummy; the player presses action-bar keys. Goal: the *feel* of the real game's rotation (GCD, cast times, DoTs, cooldowns, spell queue), so the player can practise. The simulation is also used headless by a priority-list bot (tests, "ideal DPS" comparison).

## The mechanic
The engine has a single-slot spell queue with a window `spellQueueWindowMs` (default 400, UNVERIFIED for Anniversary). If the player presses a spell while a cast is in progress ("busy") or during the GCD ("gcd") and the time left until the blocking cast end / GCD end is <= window, the spell is queued and fires automatically at the exact moment the block ends. Otherwise the press is rejected with its reason and nothing changes.

## The open design question
What happens with the spell's OTHER requirements (cooldown ready, enough mana, required target aura present) at press time?
- Option A (current implementation, set by the controller): they are checked at PRESS time. A spell that is on cooldown / unaffordable / missing its required aura when pressed is rejected immediately with that reason and is never queued. At fire time the requirements are re-checked; if they now fail, the spell is dropped with a 'queue-drop' log entry.
- Option B: queue purely on the block (gcd/busy) and check ALL other requirements only at FIRE time.
- Option C (hybrid): at press time check the cooldown against the block end (a cooldown that comes up before the block ends is fine, a longer one is rejected); mana and required aura are checked only at fire time.

Concrete example for A's downside: Conflagrate cooldown ready at t=1400, GCD ends at t=1500, key pressed at t=1200 -> under A it is rejected ("on cooldown") and the press is lost although it would have been castable at 1500. Another: Immolate is being cast (lands at the block end), Conflagrate (requires Immolate on the target) pressed during that cast -> under A it is rejected "missing aura", under B/C it is queued and fires once Immolate is up.
Downside of B/C: input that can never succeed is silently queued then dropped at fire time (less immediate feedback, may hide misplays; also the queue slot is occupied by a doomed spell and replaces a possibly valid earlier request).

## Constraints
- Deterministic, integer-ms, seeded RNG; many existing tests (148) encode current behavior (the test for A would change).
- Later tasks add hooks/procs and self-aura stat changes that can move cooldowns/auras after a spell is queued (so fire-time re-checking is already required in every option).
- Real-game fidelity matters but exact Anniversary client behavior is unverified; the author is a single player using this for practice, not a speedrun-accurate sim.
- The author is away; the decision must be made autonomously and recorded as a ruling they can undo.
