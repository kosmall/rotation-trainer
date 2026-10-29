# TBC Rotation Trainer — Stage 1: Engine and Playable Fight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable 60-second Destruction Warlock fight against a target dummy in the browser (hotkeys, cast bar, GCD, DoTs, cooldowns, mana, live DPS), driven by a headless, deterministic simulation engine.

**Architecture:** A framework-free TypeScript engine (`src/engine`) advances virtual time through an event queue and exposes `cast` / `cancelCast` / `advanceTo` / `snapshot`. Spells, auras and spec rules are plain data under `src/data`. A thin React layer drives the engine from `requestAnimationFrame` and renders snapshots. A priority-list bot plays the same engine for tests.

**Tech Stack:** Vite, React, TypeScript (strict), Vitest, `@testing-library/react` with jsdom.

**Spec:** `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (stage 1 of section 7). Stages 2–5 get their own plans.

## Global Constraints

- Pure frontend, static build; no backend, accounts or network calls at runtime.
- `src/engine` must not import React, the DOM, or anything from `src/ui`; it never reads the wall clock.
- All sim times are integer milliseconds of fight time (0 = fight start). RNG is always the seeded `Rng`.
- Character level 70, target boss level 73; fight length 60 000 ms; dummy never attacks.
- Every game number carries a source comment (wowsims/tbc or Wowhead TBC); unverified values carry `// UNVERIFIED`.
- Adding a class/spec must be possible by adding data under `src/data/classes/<class>/` without editing `src/engine`.
- Stage 1 scope: fixed talent build and fixed gear (no editor, no `localStorage`, no log/damage tabs, no dispels).
- Set bonuses are required from stage 1: active bonuses follow `CharacterSetup.setPieces` (a bonus is active when pieces worn >= its threshold, so 4 pieces include the 2-piece bonus); they may be modifiers, stat bonuses, hooks (procs with `roll()` and an internal cooldown expressed as a hidden self aura), or timed self auras.

## Review Focus

1. Pressing a spell that is on cooldown, unaffordable, or missing a required target aura → rejected with a reason, no state change (Task 6, 8, 9).
2. Cancelling a cast in progress → no damage, no mana spent, no cooldown started (Task 7).
3. Events landing exactly at fight end (tick or cast completing at 60 000 ms) and after it → counted / not counted per the rule in Task 6.
4. One huge `advanceTo` jump (hidden tab, throttled rAF) gives the same result as many small steps (Task 6).
5. Refreshing an active DoT (Corruption/Immolate recast) resets its duration without an extra tick and without double ticking; Conflagrate consumes Immolate (Task 8).
6. Set piece counts: 1 piece, exactly the 2-piece threshold, 3 pieces, 4 pieces, and a set id the spec does not know → only the bonuses whose threshold is met apply, 4 pieces include the 2-piece bonus, unknown ids are ignored (Tasks 5b, 6); a set proc cannot re-fire during its internal cooldown (Task 11b).

---

## File Structure

```
package.json  tsconfig.json  vite.config.ts  index.html  .gitignore
src/main.tsx
src/engine/{rng,events,types,stats,damage,auras,sets,sim}.ts
src/data/common/{ratings,target}.ts
src/data/classes/warlock/{spells,auras,sets,destruction}.ts
src/data/types.ts                      # SpecData, PriorityStep
src/bot/bot.ts
src/ui/{keys.ts,useSimulation.ts,App.tsx,GameView.tsx,ActionBar.tsx,CastBar.tsx,TargetPanel.tsx,ManaBar.tsx,StartOverlay.tsx,SetBonusList.tsx}
tests/fixtures/testSpec.ts
tests/engine/*.test.ts  tests/data/*.test.ts  tests/bot/*.test.ts  tests/ui/*.test.tsx
docs/data-sources.md                   # where each number came from, what stays UNVERIFIED
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/ui/App.tsx` (placeholder `<h1>`), `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`); Vitest configured with `environment: 'jsdom'` and `include: ['tests/**/*.test.{ts,tsx}']`.

- [ ] **Step 1: Write the failing test** — `tests/smoke.test.ts`: `it('runs the test runner', () => expect(1 + 1).toBe(2))`.
- [ ] **Step 2: Run `npx vitest run`** — Expected: FAIL (no vitest / no package.json).
- [ ] **Step 3: Scaffold** Vite + React + TS (strict, `noUncheckedIndexedAccess`), install `vitest jsdom @testing-library/react @testing-library/user-event`. Pin exact versions in `package.json`.
- [ ] **Step 4: Run `npm test && npm run build`** — Expected: smoke test passes, build succeeds.
- [ ] **Step 5: Commit** `chore: scaffold vite react ts vitest`.

---

### Task 2: Seeded RNG and event queue

**Files:**
- Create: `src/engine/rng.ts`, `src/engine/events.ts`
- Test: `tests/engine/rng.test.ts`, `tests/engine/events.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number }` (uniform in `[0, 1)`); `createRng(seed: number): Rng` (mulberry32).
  - `type EventId = number`; `class EventQueue<T> { schedule(atMs: number, payload: T): EventId; cancel(id: EventId): boolean; peekTime(): number | undefined; pop(): { id: EventId; atMs: number; payload: T } | undefined; readonly size: number }`. Ordering: ascending `atMs`, ties by insertion order. Cancelled events never pop.

- [ ] **Step 1: Write failing tests**
  - `rng`: `same seed gives same sequence of 5 values`; `different seeds differ`; `values are in [0,1)` over 1000 draws.
  - `events`: `pops in time order`; `ties pop in insertion order`; `cancelled event is skipped and cancel returns true once, false after`; `peekTime on empty is undefined`.
- [ ] **Step 2: Run `npx vitest run tests/engine`** — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules (binary heap or sorted insert; sequence counter for ties).
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): seeded rng and event queue`.

---

### Task 3: Core types, rating conversions and derived stats

**Files:**
- Create: `src/engine/types.ts`, `src/engine/stats.ts`, `src/data/common/ratings.ts`, `src/data/common/target.ts`
- Test: `tests/engine/stats.test.ts`

**Interfaces:**
- Produces in `types.ts` (all later tasks import from here):
  ```ts
  type School = 'physical'|'shadow'|'fire'|'arcane'|'frost'|'nature'|'holy'
  interface RawStats { intellect:number; spirit:number; spellPower:number; shadowPower:number; firePower:number;
                       critRating:number; hitRating:number; hasteRating:number; baseMana:number; mp5:number }
  interface CharacterSetup { stats: RawStats; setPieces: Record<string, number> }   // set id -> pieces worn
  interface DerivedStats { maxMana:number; power:Record<School,number>; critPct:number; hitPct:number; hastePct:number;
                           spiritRegenPerSec:number; mp5RegenPerSec:number }
  interface TargetData { missPct:number; minMissPct:number; levelResistMult:number; armor:number }
  interface SpellModifier { spellIds?:string[]; schools?:School[]; castTimeMsDelta?:number; manaCostMult?:number;
                            damageMult?:number; dotDamageMult?:number; critPctDelta?:number; critMultDelta?:number }
  ```
- `ratings.ts` exports `CRIT_RATING_PER_PCT`, `HIT_RATING_PER_PCT`, `HASTE_RATING_PER_PCT` (level 70), `BASE_CRIT_PCT`, `INT_PER_CRIT_PCT`, `BASE_CRIT_MULTIPLIER` (1.5), `MIN_GCD_MS` (1000), `BASE_GCD_MS` (1500). `target.ts` exports `BOSS_TARGET: TargetData` (level 73).
- `stats.ts`: `computeStats(setup: CharacterSetup, extra?: Partial<RawStats>): DerivedStats` — `extra` is added to raw stats (used for talent flat bonuses); crit includes the intellect contribution; `power[school]` = `spellPower + schoolPower` for shadow/fire, `spellPower` for the rest.

- [ ] **Step 1: Write failing tests** (use the exported constants, never literals)
  - `hasteRating = HASTE_RATING_PER_PCT * 10 gives hastePct 10`; same for hit and crit rating.
  - `shadow power adds shadowPower to spellPower, fire power adds firePower, arcane gets spellPower only`.
  - `extra stats are added before conversion` (extra `hitRating: HIT_RATING_PER_PCT * 3` → `hitPct 3`).
  - `crit includes intellect/INT_PER_CRIT_PCT plus BASE_CRIT_PCT`.
  - `maxMana = baseMana + 15 * intellect` (TBC mana per intellect; UNVERIFIED — confirm and adjust test).
- [ ] **Step 2: Run `npx vitest run tests/engine/stats.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement** the files. Source the constants from wowsims/tbc; add source comments. Regen formulas (`spiritRegenPerSec`, `mp5RegenPerSec`) follow wowsims; record them in `docs/data-sources.md`.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): types, ratings and derived stats`.

---

### Task 4: Hit table and damage calculation

**Files:**
- Create: `src/engine/damage.ts`
- Test: `tests/engine/damage.test.ts`

**Interfaces:**
- Consumes: `Rng`, `TargetData`, `School` (Tasks 2–3).
- Produces:
  ```ts
  type HitOutcome = 'miss'|'hit'|'crit'
  effectiveMissPct(target: TargetData, hitPct: number): number        // max(minMissPct, missPct - hitPct)
  rollOutcome(rng: Rng, p:{ missPct:number; critPct:number; canMiss:boolean; canCrit:boolean }): HitOutcome
  computeDamage(p:{ rng:Rng; min:number; max:number; coeff:number; power:number; damageMult:number;
                    targetMult:number; resistMult:number; outcome:'hit'|'crit'; critMultiplier:number }): number
  ```
  `rollOutcome` always draws exactly one number for the miss roll when `canMiss`, then one for crit when `canCrit` and not missed (fixed draw order for determinism). `computeDamage` draws one number for the min–max roll; result is `round((rolled + coeff*power) * damageMult * targetMult * resistMult * (crit ? critMultiplier : 1))`.

- [ ] **Step 1: Write failing tests** with a stub `Rng` returning scripted values.
  - `miss when roll < missPct/100`; `hit when roll >= missPct/100 and crit roll >= critPct/100`; `crit when crit roll < critPct/100`.
  - `canMiss false never misses and does not consume a draw`.
  - `effectiveMissPct floors at minMissPct` (hit above cap).
  - `computeDamage: min=max=100, coeff 0.5, power 200, all mults 1 → 200`; `crit with critMultiplier 1.5 → 300`; `damageMult 1.1 and targetMult 1.2 multiply`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): hit table and damage`.

---

### Task 5: Aura tracker and data types

**Files:**
- Create: `src/engine/auras.ts`, `src/data/types.ts`; extend `src/engine/types.ts`
- Test: `tests/engine/auras.test.ts`

**Interfaces:**
- Consumes: `School` (Task 3).
- Produces in `types.ts`:
  ```ts
  interface AuraDef { id:string; name:string; icon:string; durationMs:number; maxStacks?:number; charges?:number;
    tick?:{ intervalMs:number; total:number; coeffTotal:number; school:School };            // DoT
    damageTakenMult?:{ schools:School[]; mult:number; consumeChargeOnHit?:boolean };
    selfStatBonuses?:Partial<RawStats>; selfModifiers?:SpellModifier[] }      // while active on the player
  interface DirectEffect { min:number; max:number; coeff:number }
  interface SpellDef { id:string; name:string; icon:string; school:School; manaCost:number; castTimeMs:number;
    cooldownMs:number; onGcd:boolean; canMiss:boolean; canCrit:boolean; direct?:DirectEffect;
    applyAura?:{ auraId:string; on:'target'|'self' }; requiresTargetAura?:string; consumesTargetAura?:string;
    gainMana?:{ amount:number; coeff:number } }
  interface AuraView { auraId:string; stacks:number; charges:number; remainingMs:number }
  interface SpecHooks { onSpellResolved?(e:{ spellId:string; outcome:HitOutcome; damage:number },
    api:{ applyTargetAura(id:string):void; applySelfAura(id:string):void; roll():number;
          hasSelfAura(id:string):boolean; hasTargetAura(id:string):boolean }):void }
  interface SetBonusDef { setId:string; name:string; pieces:number; description:string;
    modifiers?:SpellModifier[]; statBonuses?:Partial<RawStats>; hooks?:SpecHooks }
  ```
- `auras.ts`: `class AuraTracker { constructor(defs: AuraDef[]); apply(id: string, nowMs: number): void` (refresh resets duration, stacks capped at `maxStacks ?? 1`, charges reset to `def.charges ?? 0`); `remove(id): boolean`; `get(id, nowMs): AuraView | undefined` (undefined once expired); `consumeCharge(id, nowMs): void` (removes the aura when charges reach 0); `damageTakenMult(school: School, nowMs: number): number` (product over active auras whose `schools` include it); `views(nowMs): Record<string, AuraView>` }`.
- `src/data/types.ts`: `interface PriorityStep { spellId:string; label:string; hint:string; when?:(s:SimSnapshot)=>boolean }`; `interface SpecData { id:string; name:string; spells:SpellDef[]; auras:AuraDef[]; modifiers:SpellModifier[]; statBonuses:Partial<RawStats>; sets:SetBonusDef[]; setup:CharacterSetup; priority:PriorityStep[]; keybinds:string[]; hooks:SpecHooks }` (`keybinds[i]` is the spell id for slot `i`). Declare `HitOutcome` (from Task 4) and `SimSnapshot` (exact shape in Task 6) in `src/engine/types.ts` in this task so `npm run typecheck` passes; Task 6 only implements the producer of `SimSnapshot`.

- [ ] **Step 1: Write failing tests**
  - `get returns remainingMs and undefined after expiry`; `reapply resets duration`; `stacks cap at maxStacks`.
  - `consumeCharge decrements and removes aura at 0 charges`.
  - `damageTakenMult multiplies matching schools only, ignores other schools and expired auras`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** the tracker and add the types.
- [ ] **Step 4: Run tests and `npm run typecheck`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): aura tracker and data types`.

---

### Task 5b: Active set bonuses

**Files:**
- Create: `src/engine/sets.ts`
- Test: `tests/engine/sets.test.ts`

**Interfaces:**
- Consumes: `SetBonusDef` (Task 5).
- Produces: `activeSetBonuses(sets: SetBonusDef[], setPieces: Record<string, number>): SetBonusDef[]` — returns, in input order, every bonus whose `pieces <= (setPieces[setId] ?? 0)`; ids missing from `setPieces` yield nothing, and entries in `setPieces` that match no bonus are ignored.

- [ ] **Step 1: Write failing tests** (bonuses `A2` pieces 2 and `A4` pieces 4 of set `a`; `B2` of set `b`)
  - `0 and 1 piece: nothing`; `exactly 2 pieces: A2 only`; `3 pieces: A2 only`; `4 pieces: A2 and A4`; `more than 4 pieces: A2 and A4`.
  - `bonuses of different sets are evaluated independently` (`{a: 2, b: 2}` → A2, B2).
  - `unknown set id in setPieces is ignored` and `missing set id counts as 0`.
- [ ] **Step 2: Run `npx vitest run tests/engine/sets.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement `activeSetBonuses`.**
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): active set bonuses`.

---

### Task 6: Simulation core — lifecycle, instant spells, cooldowns, log, snapshot

**Files:**
- Create: `src/engine/sim.ts`, `tests/fixtures/testSpec.ts`
- Test: `tests/engine/sim-core.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  ```ts
  interface SimConfig { spec: SpecData; target: TargetData; seed: number; durationMs?: number /*60000*/;
                        infiniteMana?: boolean; spellQueueWindowMs?: number /*0*/ }
  type CastResult = { ok:true; queued?:boolean } | { ok:false; reason:'not-ready'|'ended'|'unknown-spell'|'cooldown'|'gcd'|'busy'|'no-mana'|'missing-aura' }
  type LogType = 'cast-start'|'cast-complete'|'cast-cancel'|'damage'|'miss'|'tick'|'aura-apply'|'aura-fade'|'mana'|'queue-drop'
  interface LogEvent { atMs:number; type:LogType; spellId?:string; auraId?:string; amount?:number; crit?:boolean }
  interface SimSnapshot { nowMs:number; phase:'ready'|'running'|'ended'; durationMs:number; gcdEndsAtMs:number;
    cast:{ spellId:string; startMs:number; endMs:number }|null; mana:number; maxMana:number;
    cooldownRemainingMs:Record<string,number>; targetAuras:Record<string,AuraView>; selfAuras:Record<string,AuraView>;
    damageTotal:number; dps:number; queuedSpellId:string|null }
  class Simulation { constructor(config: SimConfig); start(): void; advanceTo(tMs: number): void;
    cast(spellId: string): CastResult; cancelCast(): void; snapshot(): SimSnapshot; log(): readonly LogEvent[] }
  ```
- `tests/fixtures/testSpec.ts` exports `makeTestSpec(overrides?)` and `TEST_TARGET` (`missPct 0, minMissPct 0, levelResistMult 1, armor 0`), a spec with deterministic spells: `bolt` (cast 2000, direct min=max=100, coeff 0, cost 50, gcd), `zap` (instant, direct 50, cd 8000, cost 20, gcd), `free` (instant, off gcd, no damage), `setup` with `critRating 0` and `intellect 0`, `baseMana 1000`, `spellPower 0`, `mp5 0` (so crit 0, no regen) and `setPieces {}`; `sets` holds `test-set` bonuses: 2 pieces `modifiers [{spellIds:['zap'], damageMult:1.1}]`, 4 pieces `modifiers [{spellIds:['bolt'], damageMult:1.5}]`.

Rules: phase starts `ready`; `advanceTo` is a no-op in `ready`; `cast` in `ready` calls `start()` first; `nowMs` is fight time. Instant GCD spell: cast completes immediately, GCD = `max(MIN_GCD_MS, round(BASE_GCD_MS / (1 + hastePct/100)))`; cooldown starts at completion; damage and mana apply at completion. Events with `atMs <= durationMs` are processed in order; at the end `phase` becomes `ended`, `nowMs = durationMs`, and later `cast` returns `{ok:false, reason:'ended'}`. `dps = damageTotal / (nowMs/1000)` (0 at 0 ms). `advanceTo` must be idempotent for earlier times (never moves back).

- [ ] **Step 1: Write failing tests**
  - `advanceTo does nothing before start`; `first cast starts the fight`.
  - `zap deals 50 damage, snapshot.damageTotal 50, dps = 50 / elapsed seconds`.
  - `second cast inside GCD returns {ok:false, reason:'gcd'}` and changes nothing; works after `advanceTo(1500)`.
  - `off-gcd spell can be cast during GCD`.
  - `zap on cooldown returns reason 'cooldown' until 8000 ms, then succeeds`; `cooldownRemainingMs.zap` counts down.
  - `unknown spell id returns 'unknown-spell'`.
  - `fight ends at durationMs: phase ended, nowMs 60000, cast returns 'ended'`.
  - `an effect scheduled exactly at 60000 ms is counted, one at 60001 is not` (use `durationMs: 5000` with a zap at 3500+1500).
  - `Review Focus 4: advanceTo(60000) in one call equals 600 steps of 100 ms` (compare `snapshot()` and `log()` for a scripted cast sequence; casts happen between steps in both runs).
  - `same seed gives identical log; different seeds with crit enabled differ`.
  - Review Focus 6: `with setPieces {test-set: 1} zap deals 50`; `{test-set: 2} zap deals 55 and bolt is unchanged`; `{test-set: 4} zap deals 55 and bolt deals 150`; `{unknown-set: 4} changes nothing`.
- [ ] **Step 2: Run `npx vitest run tests/engine/sim-core.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement `Simulation`** with the event queue, the constructor merging `activeSetBonuses(spec.sets, spec.setup.setPieces)` into the modifier list, the `statBonuses` passed to `computeStats`, and the hook list (set hooks run after spec hooks), spell/modifier lookup tables built in the constructor (modifiers applied per spell: `castTimeMsDelta`, `manaCostMult`, `damageMult`, `critPctDelta`, `critMultDelta`, matched by `spellIds`/`schools`), `computeStats(spec.setup, spec.statBonuses)` for stats. Direct damage uses `rollOutcome` + `computeDamage` from Task 4 with `targetMult = targetAuras.damageTakenMult(school)` and `resistMult = target.levelResistMult`.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): simulation core with instant spells`.

---

### Task 7: Cast-time spells, haste and cancel

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-casting.test.ts`

**Interfaces:**
- Consumes: `Simulation` (Task 6). Produces: same API; `snapshot().cast` is non-null while casting.

Rules: cast time = `max(0, round((base + castTimeMsDelta) / (1 + hastePct/100)))`; GCD starts at cast start. Damage, cooldown start, mana spend and `cast-complete` happen at cast end. A cast attempted while `cast !== null` returns `reason:'busy'` (queueing is Task 10). `cancelCast()` aborts the current cast: `cast-cancel` logged, no damage, no mana spent, no cooldown; the GCD already started stays.

- [ ] **Step 1: Write failing tests**
  - `bolt lands 2000 ms after start: damage appears at 2000, not before`.
  - `with hasteRating = HASTE_RATING_PER_PCT * 10, bolt completes at round(2000/1.1)` and GCD is `round(1500/1.1)`.
  - `GCD never drops below MIN_GCD_MS` with very large haste.
  - `snapshot.cast reports spellId/startMs/endMs while casting, null after`.
  - `casting bolt then zap returns 'busy'` and changes nothing.
  - `Review Focus 2: cancelCast mid-bolt: no damage, mana unchanged, zap/bolt cooldown unchanged, log has cast-cancel; GCD still blocks bolt until it expires`.
  - `cancelCast with nothing casting is a no-op`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** cast scheduling in `sim.ts`.
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): cast times, haste and cancel`.

---

### Task 8: DoTs, aura application and requirements

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-auras.test.ts`; extend `tests/fixtures/testSpec.ts` with `dot` (instant, applies target aura `dotAura`: duration 6000, tick every 2000, total 300, coeffTotal 0), `needy` (instant, `requiresTargetAura: 'dotAura'`, `consumesTargetAura: 'dotAura'`, direct 10), `curse` (instant, applies aura `weak` with `damageTakenMult` shadow ×1.2, 10 s)

**Interfaces:**
- Consumes: `AuraTracker`, `SpellDef.applyAura/requiresTargetAura/consumesTargetAura`.
- Produces: `tick` log events; `targetAuras` populated in snapshot.

Rules: a successful hit (not a miss) applies the aura; a miss applies nothing. DoT tick damage = `(total + coeffTotal * power) / ticks` rounded, `power` snapshotted at application; DoT damage multiplier = `dotDamageMult` modifiers × current `damageTakenMult` × `levelResistMult`; DoT ticks never crit. Refreshing an active DoT cancels its pending tick events and reschedules ticks from the refresh time (no extra immediate tick). When an aura expires an `aura-fade` event is logged. Missing `requiresTargetAura` returns `reason:'missing-aura'` before spending anything; `consumesTargetAura` removes the aura (cancelling its ticks) on successful hit.

- [ ] **Step 1: Write failing tests**
  - `dot ticks at +2000, +4000, +6000 for 100 each, then fades; total 300`.
  - `Review Focus 5: recasting dot at +3000 resets expiry to +9000 and yields ticks at 5000, 7000, 9000 only (no tick at 4000, no double ticks)`.
  - `a tick falling after fight end is not counted`.
  - `needy returns 'missing-aura' with no dotAura, spends no mana, starts no cooldown`; `needy with dotAura deals damage and removes dotAura and its remaining ticks` (Review Focus 5).
  - `curse makes later shadow damage ×1.2 and does not affect fire damage`.
  - `a missed dot (missPct 100) applies no aura and logs miss` (override target in test).
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** tick scheduling and aura expiry events in `sim.ts`.
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): dots, auras and spell requirements`.

---

### Task 9: Mana, five-second rule, Life Tap, infinite mana

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-mana.test.ts`; extend fixture with `tap` (instant, off gcd false, cost 0, `gainMana: {amount: 300, coeff: 0}`)

**Interfaces:**
- Consumes: `DerivedStats.spiritRegenPerSec / mp5RegenPerSec / maxMana`. Produces: `reason:'no-mana'`; `mana` log events for regen and gains.

Rules (verify against wowsims/tbc and record in `docs/data-sources.md`): mana is checked at cast start and spent at cast completion; regen ticks every 2000 ms; `mp5RegenPerSec` always applies, `spiritRegenPerSec` only when no mana-costing spell completed in the last 5000 ms; mana is capped at `maxMana`; `infiniteMana` makes cost 0 and keeps `mana == maxMana`.

- [ ] **Step 1: Write failing tests**
  - `cast with insufficient mana returns 'no-mana' and nothing changes` (Review Focus 1).
  - `bolt spends 50 at completion, not at start`.
  - `mana never goes below 0 and never above maxMana`.
  - `tap gives +300, capped at maxMana`.
  - `spirit regen is suppressed for 5000 ms after a mana-costing cast, resumes after` (fixture with nonzero spirit/regen).
  - `mp5 regen applies even inside the five-second rule`.
  - `infiniteMana: bolt always castable, snapshot.mana === maxMana`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** regen events and mana checks.
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): mana, five-second rule, life tap`.

---

### Task 10: Spell queue

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-queue.test.ts`

**Interfaces:**
- Consumes: `SimConfig.spellQueueWindowMs`. Produces: `{ok:true, queued:true}`, `snapshot().queuedSpellId`, `queue-drop` log event.

Rules: when a cast is rejected with `gcd` or `busy` and the time until the blocking cast end (or GCD end if not casting) is `<= spellQueueWindowMs`, the spell is queued instead (single slot; a newer request replaces the old one). At the moment the block ends, the queued spell is attempted; if it fails (cooldown, mana, aura) it is dropped with `queue-drop`. Outside the window the original rejection is returned unchanged. `cancelCast` clears the queue.

- [ ] **Step 1: Write failing tests** (window 400)
  - `zap pressed 300 ms before GCD end is queued and fires exactly at GCD end`.
  - `zap pressed 500 ms before GCD end is rejected with 'gcd'`.
  - `queued bolt during a bolt cast fires at cast end`.
  - `second queue request replaces the first`.
  - `queued spell that is on cooldown at fire time is dropped and logged`.
  - `window 0 never queues`.
  - `cancelCast clears the queue`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** in `sim.ts`.
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): spell queue`.

---

### Task 11: Spec hooks (procs) and charge-consuming auras

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-hooks.test.ts`; extend fixture with `procAura` (target aura, 12 s, `charges: 2`, `damageTakenMult` shadow ×1.2 with `consumeChargeOnHit`) and a hook that applies `procAura` when `bolt` crits

**Interfaces:**
- Consumes: `SpecHooks.onSpellResolved` (Task 5), including its `api` (`applyTargetAura`, `applySelfAura`, `roll`, `hasSelfAura`, `hasTargetAura`). Produces: hooks called for every completed spell, including pure-aura spells with no direct damage (`outcome` includes `miss`); `api.roll()` draws from the simulation's seeded `Rng`.

Rules: hook runs after the spell's damage is applied; `consumeChargeOnHit` auras lose one charge per damage instance of a matching school (direct hits and DoT ticks) after that instance's damage is calculated.

- [ ] **Step 1: Write failing tests**
  - `hook is called with outcome and damage for hit, crit and miss` (force outcomes with `critRating` huge / `missPct 100`).
  - `crit of bolt applies procAura on target` (via hook).
  - `charged aura multiplies the next 2 shadow hits by 1.2, then disappears; the third hit is unmodified`.
  - `a fire hit does not consume a charge`.
  - `hook is also called for a pure-aura spell (dot) with no direct damage`.
  - `api.roll() is deterministic for a seed and hasSelfAura/hasTargetAura reflect current auras`.
  - `set-bonus hooks (SetBonusDef.hooks) are called after spec hooks, only while the bonus is active`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** hook invocation and charge consumption.
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): spec hooks and charged auras`.

---

### Task 11b: Self stat and modifier auras (set procs and buffs)

**Files:**
- Modify: `src/engine/sim.ts`
- Test: `tests/engine/sim-selfauras.test.ts`; extend `tests/fixtures/testSpec.ts` with `pump` (instant, off GCD, applies self aura `pumped`: 10 000 ms, `selfStatBonuses {spellPower: 100}`), `hasteUp` (self aura 10 000 ms, `selfStatBonuses {hasteRating: HASTE_RATING_PER_PCT * 10}`), `dmgUp` (self aura 10 000 ms, `selfModifiers [{schools:['shadow'], damageMult: 1.5}]`), `scaled` (instant, shadow, `direct min=max=0, coeff 1`)

**Interfaces:**
- Consumes: `AuraDef.selfStatBonuses / selfModifiers` (Task 5), hook `api` (Task 11), `computeStats`.
- Produces: stats and modifiers that change while self auras are up; `selfAuras` in the snapshot already lists them.

Rules: while a self aura is active its `selfStatBonuses` are added to the raw stats and its `selfModifiers` to the modifier list; derived stats are recomputed when such an aura is applied, refreshed or fades (refresh never stacks the stats). Only casts started and damage rolled after the change see it: a cast in progress keeps its cast time, a DoT keeps the power snapshotted at its application, ticks still pick up current damage-taken multipliers. Internal cooldowns are modeled by a hidden self aura (`hasSelfAura`) that the hook checks before proccing.

- [ ] **Step 1: Write failing tests**
  - `scaled deals 0 before pump, 100 during pumped, 0 again after it fades at +10000`.
  - `refreshing pumped extends the duration and still adds 100 only once`.
  - `hasteUp shortens a bolt started after it (round(2000/1.1)) but not a bolt already in progress`.
  - `dmgUp multiplies shadow damage by 1.5 while active and not after it fades`.
  - `a dot applied before pumped keeps its original power in later ticks, a dot applied during pumped uses power +100`.
  - Review Focus 6: `a set hook that procs pumped with roll() < 1 and an internal-cooldown aura 'icd' (duration 5000, checked via hasSelfAura) fires at most once per 5000 ms across repeated casts`.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement** stat/modifier recomputation on self-aura apply and expiry in `sim.ts` (recompute `DerivedStats` and the active modifier list from base + active self auras).
- [ ] **Step 4: Run all engine tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): self stat and modifier auras`.

---

### Task 12: Destruction Warlock data

**Files:**
- Create: `src/data/classes/warlock/spells.ts`, `src/data/classes/warlock/auras.ts`, `src/data/classes/warlock/sets.ts`, `src/data/classes/warlock/destruction.ts`, `docs/data-sources.md`
- Test: `tests/data/destruction.test.ts`

**Interfaces:**
- Consumes: `SpecData`, `SpellDef`, `AuraDef`, `SpellModifier`, `PriorityStep` (Task 5), `ratings.ts` constants.
- Produces: `export const destructionWarlock: SpecData` with spell ids `shadow-bolt, immolate, corruption, curse-of-agony, curse-of-doom, curse-of-the-elements, conflagrate, shadowburn, incinerate, life-tap`; aura ids `immolate, corruption, curse-of-agony, curse-of-doom, curse-of-the-elements, shadow-vulnerability`; `keybinds` = those spell ids in action-bar order (slots 1–9, 0, -, = ; unused slots empty string); `priority` (shadow-destruction priority list: curse, Immolate, Corruption, Conflagrate when Immolate up, Shadowburn on cooldown, Life Tap when low mana, Shadow Bolt filler — final order and `when` rules per verified sources).

Work: look up each spell's TBC Classic values (base damage range, coefficient, cast time, cost, cooldown, DoT total/ticks/duration, Conflagrate and Shadowburn rules, Life Tap yield, Curse of the Elements amount, Improved Shadow Bolt: 4 charges / 12 s, crit-triggered via `hooks.onSpellResolved`) from wowsims/tbc and Wowhead TBC. The fixed build is encoded as `modifiers` + `statBonuses` (Bane, Ruin, Cataclysm, Devastation, Emberstorm/Shadow Mastery as applicable to the chosen shadow build) and the fixed gear as `setup.stats`; stage 2 replaces both with talent/gear editors. Document every number's source and each `UNVERIFIED` item in `docs/data-sources.md`. If Conflagrate needs an engine feature the current `SpellDef` lacks, add it to `src/engine` with its own test before using it.

Set bonuses: `sets.ts` exports `warlockSets: SetBonusDef[]` covering every Warlock tier/PvE set the author may wear in TBC Classic Anniversary (the author picks the default tier and piece counts; ask before coding if not yet decided — the default goes in `setup.setPieces`). Each bonus is encoded as the right mix of `modifiers`, `statBonuses`, `hooks` (procs with `roll()` and an internal cooldown aura) and self auras defined in `auras.ts`, with its description text copied from the source and the source recorded in `docs/data-sources.md`. A bonus the engine cannot express is added as an engine feature with its own test before use.

- [ ] **Step 1: Write failing tests** (these pin the data, not the engine)
  - `every set bonus has a unique (setId, pieces) pair`; `setup.setPieces only references known set ids`; `every aura id used by set hooks/bonuses is defined`.
  - `with the default setPieces, each active set bonus changes the expected stat/damage: a Simulation with the bonus's setPieces removed produces different damage totals for the same seed`.
  - `every keybind entry is empty or a defined spell id`; `every priority step references a defined spell`; `every spell.applyAura/requiresTargetAura/consumesTargetAura references a defined aura`.
  - `shadow-bolt cast time after modifiers equals the verified value` (value from the sources; record it in the test).
  - `conflagrate requires and consumes immolate`; `life-tap gains mana and costs no mana`.
  - `improved shadow bolt: crit of shadow-bolt applies shadow-vulnerability (via hook), a miss does not`.
  - `a Simulation built from destructionWarlock constructs without throwing and a 60 s run does not throw`.
- [ ] **Step 2: Run `npx vitest run tests/data`** — Expected: FAIL.
- [ ] **Step 3: Implement the data files** and `docs/data-sources.md`.
- [ ] **Step 4: Run tests and `npm run typecheck`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): destruction warlock spec data`.

---

### Task 13: Priority bot and integration test

**Files:**
- Create: `src/bot/bot.ts`
- Test: `tests/bot/bot.test.ts`

**Interfaces:**
- Consumes: `Simulation`, `PriorityStep`, `destructionWarlock`.
- Produces: `runBot(sim: Simulation, priority: PriorityStep[], stepMs?: number /*10*/): { dps: number; damageTotal: number }` — loops until `phase === 'ended'`: at each step, tries priority steps in order (skipping those whose `when(snapshot)` is false) until one `cast` returns `ok`, then `advanceTo(now + stepMs)`.

- [ ] **Step 1: Write failing tests**
  - `bot on the fixture spec casts zap every 8000 ms and fills with bolt` (deterministic damage total).
  - `Destruction priority beats a shadow-bolt-only bot in DPS (same seed, infiniteMana)`.
  - `bot run is deterministic for a given seed`.
  - `bot DPS with real mana stays within [lo, hi]` — bounds taken from the verified sources and written in the test with a comment citing them.
- [ ] **Step 2: Run tests** — Expected: FAIL.
- [ ] **Step 3: Implement `runBot`.**
- [ ] **Step 4: Run all tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(bot): priority bot and integration test`.

---

### Task 14: Playable UI

**Files:**
- Create: `src/ui/keys.ts`, `src/ui/useSimulation.ts`, `src/ui/GameView.tsx`, `src/ui/ActionBar.tsx`, `src/ui/CastBar.tsx`, `src/ui/TargetPanel.tsx`, `src/ui/ManaBar.tsx`, `src/ui/StartOverlay.tsx`, `src/ui/SetBonusList.tsx`; modify `src/ui/App.tsx`, `src/main.tsx`
- Test: `tests/ui/keys.test.ts`, `tests/ui/game.test.tsx`

**Interfaces:**
- Consumes: `Simulation`, `SimSnapshot`, `destructionWarlock`.
- Produces:
  - `keyToSlot(key: string): number | undefined` — `'1'..'9'` → 0..8, `'0'` → 9, `'-'` → 10, `'='` → 11, anything else `undefined`.
  - `useSimulation(spec: SpecData): { snapshot: SimSnapshot; cast(spellId: string): CastResult; cancel(): void; reset(): void; start(): void }` — owns one `Simulation`, advances it with `requestAnimationFrame` using `performance.now()` relative to start (clamped so a backgrounded tab resumes by a single `advanceTo` jump), re-creates it with a fresh random seed on `reset()`.
  - `GameView` shows: target dummy with target auras, cast bar (spell name + progress), mana bar, action bar slots with spell name tile (initials if the icon file is missing), hotkey label, cooldown overlay and GCD sweep, DPS / total damage / elapsed `x.x / 60s`, a `SetBonusList` (`SetBonusList({ sets, setPieces })` lists each bonus of the spec with its piece threshold and description, marked active or inactive using `activeSetBonuses`), and an end-of-fight summary with a Reset button. `StartOverlay` shows “Start the fight” until the first cast or Space. Key handling: slot keys cast, `Esc` cancels, `Space` starts (before start) and `R` resets.

- [ ] **Step 1: Write failing tests**
  - `keyToSlot maps 1..9, 0, -, = and ignores others`.
  - `pressing "1" in the rendered GameView casts the spell bound to slot 0` (spy on the hook's `cast` via the real `Simulation` and check `snapshot.damageTotal`/log after advancing fake timers).
  - `Esc during a cast removes the cast bar and logs cast-cancel`.
  - `Space before the fight hides the start overlay`.
  - `SetBonusList marks bonuses active exactly when pieces worn >= threshold` (2 and 4 piece cases).
  - `after 60 s the end summary shows total damage and DPS`.
- [ ] **Step 2: Run `npx vitest run tests/ui`** — Expected: FAIL.
- [ ] **Step 3: Implement** the components; no engine logic in components (only `snapshot` reads and `cast` / `cancel` calls).
- [ ] **Step 4: Run `npm test && npm run build`** — Expected: all green. Then run `npm run dev` and play one full fight manually: hotkeys cast, cast bar fills, DoTs tick on the target, GCD sweep visible, Esc cancels, fight ends at 60 s with a summary, Reset starts over.
- [ ] **Step 5: Commit** `feat(ui): playable destruction warlock fight`.

---

## Self-Review

- **Spec coverage (stage 1 slice):** engine architecture, virtual time, event queue, pipeline, spell queue, mana/5SR/Life Tap/infinite mana, target debuffs, snapshot/log API (Tasks 2–11); data model with sources and `UNVERIFIED` markers (Tasks 3, 12); set bonuses (Tasks 5b, 6, 11, 11b, 12, 14); UI game tab with hotkeys, start overlay, cast bar, mana, target, DPS (Task 14); bot and Vitest strategy (Tasks 6–13). Deferred by design to later plans: character editor and `localStorage` (stage 2), Rotation/Damage/Log tabs, scoring (stage 3), dispels, pre-pull setup, scenarios (stage 4), other classes (stage 5).
- **Type consistency:** `SpecData`, `SpellDef`, `AuraDef`, `SimSnapshot`, `CastResult`, `PriorityStep` are each defined once (Tasks 5–6) and reused by name; `keybinds` is `string[]` everywhere; `reason` strings are the closed set in Task 6.
- **Known risk:** Task 12 depends on researched game values; if a rule needs an engine field that does not exist yet, the task adds it with its own test.
