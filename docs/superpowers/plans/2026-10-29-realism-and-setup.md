# Realism and Setup (stage 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trainer's numbers comparable with a real raid: projectile travel time (A), a configurable rotation (B), and configurable buffs, debuffs, consumables and timed cooldowns with a saved settings panel (C).

**Architecture:** Engine gets projectile impacts, scheduled auras, `api.addMana` and percentage haste multipliers; everything else is data and a pure `applySetup` that merges the enabled buffs into a derived `SpecData` plus `SimConfig` extras. A React `SetupPanel` edits a versioned `SetupConfig` stored in `localStorage`. Defaults reproduce the stage 1 numbers (plus the travel time of part A).

**Tech Stack:** Vite, React, TypeScript (strict), Vitest (node project for engine/data/bot/setup tests, jsdom project for `tests/ui`), `@testing-library/react`, Playwright (pre-installed, smoke only).

**Spec:** `docs/superpowers/specs/2026-10-29-realism-and-setup-design.md`. Stage 1 plan and ledger: `docs/superpowers/plans/2026-10-29-stage-1-engine-and-playable-fight.md`, `docs/decisions/2026-10-29-stage-1-sdd-ledger.md`.

**Execution order:** Tasks 1–12 in numeric order. Parts: A = Tasks 1–2, B = Tasks 3–4, C = Tasks 5–12. Stopping after a part leaves a working app.

## Global Constraints

- Pure frontend, static build; no runtime network calls (icons are committed files). `src/engine` must not import React, the DOM or `src/ui`, and never reads the wall clock; integer-ms fight time; randomness only from the seeded `Rng`.
- Every game number carries a source comment (wowsims/tbc-new `sim/core/buffs.go`, `consumes.go`, `sim/warlock/spell_data_auto_gen.go`, proto files, or Wowhead TBC) or `// UNVERIFIED`; new numbers go into `docs/data-sources.md`. Values measured in the author's Naj'entus log are checkpoints, cited as such: Shadow Bolt travel 1.39 s at 28 yd (20 yd/s), Heroism +30% haste for 40 s, Mana Spring 20 mana per 2 s (50 mp5), Judgement of Wisdom 74 mana (20 procs on 37 hits), Destruction Potion 15 s, Icon of the Silver Crescent 20 s, Band of the Eternal Sage 10 s with 60 s internal cooldown, Life Tap 1856 mana (spell power ≈ 1592 with raid buffs).
- Default distance 28 yd. Default setup = no buffs, DoT rotation, Fel Armor and the Succubus sacrifice kept (they are part of the stage 1 numbers); with the default setup the spec's stats and the spec's bot results equal those of the end of part B (golden test in Task 9).
- `applySetup` and `buildPriority` are pure and never mutate their inputs or the shared `destructionWarlock`; a running `Simulation` is never mutated; setup changes apply from the next fight.
- Setup persistence: key `rotation-trainer:setup:v1`; every `localStorage` access in `try/catch`; stored data is validated, unknown ids dropped, numbers clamped, never trusted.
- Keybinds stay as they are (slot 8 empty, R17). Only stage 1.5 scope: no gear/talent editor, no log import, no Curse of Doom immunity flag.
- Commit messages end with the attribution trailers the controller gives in each dispatch.

## Review Focus

1. A missile still in flight at fight end: impact at exactly `durationMs` counts, later does not; no state leaks after the end (Task 1).
2. A DoT pressed again while its previous cast is in flight (the aura is not up yet), with and without the spell queue window (Tasks 1, 2).
3. Corrupt, old-version, wrong-type or unknown-id `localStorage` content, and storage that throws (Task 10).
4. Conflicting or duplicate buffs: flask + elixir, two foods, the same id twice, own curse vs raid Curse of the Elements (one 10% effect), Improved Shadow Bolt from others vs own (one multiplier) (Task 9).
5. Out-of-range input: distance 0, negative, NaN or huge; timed start after the fight end; duration running past it (Tasks 5, 9, 11).
6. Changing settings while a fight runs does not alter that fight; the next fight uses the new ones (Task 11).

---

## File Structure

```
src/engine/{types,sim,travel,stats,auras}.ts     travel.ts new (projectileTravelMs)
src/data/types.ts                               + BuffDef, BuffEffect, SetupConfig lives in src/setup
src/data/common/{target,buffs}.ts               target.ts + DEFAULT_DISTANCE_FROM_TARGET_YD; buffs.ts new (common catalog)
src/data/classes/warlock/{spells,destruction,rotation,buffs}.ts   rotation.ts, buffs.ts new
src/setup/{types,defaults,presets,applySetup,storage}.ts          new
src/ui/{SetupPanel,useSimulation,GameView,TargetPanel}.tsx        SetupPanel new
tests/engine/*  tests/data/*  tests/setup/*  tests/ui/*  tests/bot/*
docs/data-sources.md  README.md
```

---

### Task 1: Projectile travel in the engine

**Files:**
- Create: `src/engine/travel.ts`, `tests/engine/travel.test.ts`, `tests/engine/sim-projectiles.test.ts`
- Modify: `src/engine/types.ts`, `src/engine/sim.ts`, `tests/fixtures/testSpec.ts`

**Interfaces:**
- Produces:
  - `SpellDef.missileSpeed?: number` (yd/s; absent or 0 = lands at cast end, as today); `SimConfig.distanceFromTarget?: number` (yd, default 0 = no travel); `LogType` gains `'impact'`; `SimSnapshot.inFlight: { spellId: string; landsAtMs: number }[]` sorted by `landsAtMs`.
  - `projectileTravelMs(missileSpeed: number | undefined, distanceYd: number): number` in `travel.ts`: `Math.round(distanceYd / missileSpeed * 1000)`; 0 when the speed is missing/≤ 0 or the distance is ≤ 0 or not finite.
- Fixture: `lob` (cast 1000 ms, shadow, direct 100, no coefficient, missileSpeed 20, cost 0) and `slowdot` (instant, on GCD, `applyAura` target `dotAura`, missileSpeed 20), both added to `makeTestSpec`'s default spells and to every `cooldownRemainingMs`/`spells` literal the existing whole-snapshot tests compare (update those expectations, never weaken them).

Rules: at cast end the cost is spent, the cooldown and `gainMana` happen as today and `cast-complete` is logged; then, if the travel time is > 0, the rest of `resolveSpell` (hit roll, damage, consumption, aura application, hooks) is scheduled at `now + travelMs` and logged first as `impact`; with travel 0 it runs inline (no `impact` log, existing logs unchanged). The in-flight entry is removed at impact. Events with `atMs <= durationMs` run; the end of the fight discards the rest (`inFlight` empty after the end). `cancelCast` does not affect missiles already launched. Stats and modifiers at impact time are used (the spec's model; wowsims computes at cast end and only deals damage at impact, see ruling S4 and docs/data-sources.md "Part A: projectile travel"); document it in the code comment.

- [ ] **Step 1: Write the failing tests**
  - `travel.test.ts`: `28 yd at 20 yd/s → 1400`; `rounds to whole ms (25 yd at 24 yd/s → 1042)`; `0 for missing speed, speed 0, distance 0, negative, NaN, Infinity`.
  - `sim-projectiles.test.ts` (fixture with `distanceFromTarget: 28`): `lob cast at 0 completes at 1000, damage lands at 2400 and not before`; `log order is cast-complete 1000, impact 2400, damage 2400`; `snapshot().inFlight lists lob with landsAtMs 2400 between 1000 and 2400, empty after`; `the hook (use makeTestSpec hooks) runs at impact, not at cast end`; `slowdot applies dotAura at impact and the ticks start from the impact`; `a miss at impact applies no aura` (target override missPct 100); `a lob landing exactly at durationMs counts (durationMs 2400)` and `one ms later does not (durationMs 2399) and inFlight is empty after the end` (Review Focus 1); `cancelCast after the cast completed does not stop the missile`; `distanceFromTarget 0 or unset: lob damage lands at cast end and no impact entry is logged`; `one advanceTo(60000) equals 70 ms steps` with several lobs (snapshot and log equal); `a spell without missileSpeed (zap) is unchanged`.
- [ ] **Step 2: Run `npx vitest run tests/engine` — Expected: FAIL (module/fields missing).**
- [ ] **Step 3: Implement** `projectileTravelMs`, the types, the fixture spells and the engine change in `completeCast`/`resolveSpell`/`snapshot()`/`endFight()`; update the existing whole-snapshot literals.
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: all PASS.**
- [ ] **Step 5: Commit** `feat(engine): projectile travel time`.

---

### Task 2: Warlock travel data, priority and bot band

**Files:**
- Modify: `src/data/common/target.ts`, `src/data/classes/warlock/spells.ts`, `src/data/classes/warlock/destruction.ts`, `src/ui/useSimulation.ts`, `tests/bot/bot.test.ts`, `tests/data/destruction.test.ts`, `docs/data-sources.md`
- Test: `tests/data/travel.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `DEFAULT_DISTANCE_FROM_TARGET_YD = 28` in `target.ts` (source comment: author's Naj'entus log, 1.39 s × 20 yd/s ≈ 27.8 yd); `missileSpeed` on the warlock spells that have a missile (Shadow Bolt 20 is verified; read the others from tbc-new `spell_data_auto_gen.go` `MissileSpeed`, instant spells have none); every `new Simulation` for the real spec in production code and bot tests passes `distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD`.

Rules: `dotRefreshDue` also refuses a spell that is in flight (`s.inFlight.some(f => f.spellId === spellId)`) so a DoT is not pressed again before its first cast has landed; the Shadowburn finisher window becomes `Shadow Bolt cast time + its travel time` (a bolt started later would land after the end; source: tbc-new APL "Should Cast Shadow Burn" comment "(+ travel)"). The bot DPS band test is re-derived from the verified numbers: the last Shadow Bolt no longer counts when it lands after the end, so expect about 2% less than before; update the derivation comment honestly (do not widen the band to hide a shift).

- [ ] **Step 1: Write the failing tests**
  - `travel.test.ts`: `shadow-bolt missileSpeed is 20`; `with 28 yd Shadow Bolt lands 1400 ms after the cast ends` (real spec, scripted); `every warlock spell with a missileSpeed cites its source or UNVERIFIED` (read spells.ts text? no: assert instant spells have none and the listed missile spells have a positive speed).
  - `destruction.test.ts`/`bot.test.ts`: `the bot does not press Immolate or Corruption again while the first is in flight` (count `aura-apply` per DoT and `cast-start`/`cast-complete` per DoT in the log with the 400 ms queue window and with 0: each DoT is cast at most once per refresh); `Shadowburn is still cast at most once, as the last spell, and it is cast when remaining time <= Shadow Bolt cast + travel`; `bot DPS mean over seeds 1–10 stays within the re-derived band` for both queue windows; the uptime and no-mana-loop assertions still hold.
- [ ] **Step 2: Run `npx vitest run tests/data tests/bot` — Expected: FAIL.**
- [ ] **Step 3: Implement** the data, the priority changes and the constant; update `useSimulation.ts` and test helpers; re-derive the band and rewrite the comment with the new arithmetic; document the travel model and the numbers in `docs/data-sources.md` (section "Part A: projectile travel").
- [ ] **Step 4: Run `npm run typecheck && npm test` and `npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(data): warlock missile speeds, in-flight aware priority`.

---

### Task 3: Rotation configuration

**Files:**
- Create: `src/data/classes/warlock/rotation.ts`, `tests/data/rotation.test.ts`
- Modify: `src/data/classes/warlock/destruction.ts` (priority built by `buildPriority`), `docs/data-sources.md`

**Interfaces:**
- Consumes: Task 2 (`dotRefreshDue`, finisher window).
- Produces:
  ```ts
  type CurseChoice = 'elements' | 'agony' | 'doom' | 'none'
  interface RotationConfig { curse: CurseChoice; immolate: boolean; corruption: boolean;
                             shadowburnFinisher: boolean; lifeTapBelowMana: number | 'auto' }   // 'auto' = Shadow Bolt's cost
  const ROTATION_PRESETS: Record<'dot' | 'sb-spam', { name: string; config: RotationConfig }>
  function buildPriority(config: RotationConfig, distanceYd: number): PriorityStep[]
  ```
  `dot` = the stage 1 list (curse `elements`, Immolate, Corruption, Shadowburn finisher, Life Tap `auto`); `sb-spam` = the author's raid (curse `doom`, no DoTs, Shadowburn finisher, Life Tap `auto`). `destructionWarlock.priority = buildPriority(ROTATION_PRESETS.dot.config, DEFAULT_DISTANCE_FROM_TARGET_YD)`; the helpers (`dotRefreshDue`, windows) move into `rotation.ts` and take the distance.

Rules: step order is curse, Shadowburn finisher, Immolate, Corruption, Life Tap, Shadow Bolt, omitting disabled ones; curse `none` has no curse step; the curse step's `when` is "its aura is not on the target" (Curse of Doom is also gated by its 60 s cooldown through `cast` rejection, no extra rule); `lifeTapBelowMana` as a number replaces Shadow Bolt's cost; hints (English) say which curse and that another curse replaces it.

- [ ] **Step 1: Write the failing tests** (`rotation.test.ts`)
  - `dot preset equals the Task 2 priority: same spell ids, labels and hints in the same order` (record the Task 2 list's ids/labels in the test as literals); `bot mean DPS over seeds 1–10 with the dot preset equals the value recorded at the end of Task 2` (store that number in the test as a constant with a comment, both queue windows).
  - `sb-spam has no Immolate or Corruption step and the bot casts neither (log has no aura-apply for them), casts Curse of Doom first, Shadow Bolt as filler, Shadowburn last at most once`.
  - `each flag removes exactly its step`; `curse 'none' removes the curse step`; `curse choices map to curse-of-the-elements / curse-of-agony / curse-of-doom with the matching aura check`; `lifeTapBelowMana 2000 casts Life Tap below 2000 mana and 'auto' below 399`; `buildPriority is pure: same input twice gives equal output and does not mutate the preset configs`; `distanceYd changes only the finisher window (28 vs 0 differs by Shadow Bolt's travel time)`.
- [ ] **Step 2: Run `npx vitest run tests/data/rotation.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** `rotation.ts` and the refactor of `destruction.ts`; document presets in `docs/data-sources.md`.
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS (bot band unchanged).**
- [ ] **Step 5: Commit** `feat(data): configurable warlock rotation`.

---

### Task 4: Rotation and distance controls in the UI (no saving yet)

**Files:**
- Create: `src/ui/SetupPanel.tsx`, `tests/ui/setup-panel.test.tsx`
- Modify: `src/ui/useSimulation.ts`, `src/ui/GameView.tsx`, `src/ui/game.css`

**Interfaces:**
- Consumes: `RotationConfig`, `ROTATION_PRESETS`, `buildPriority` (Task 3), `DEFAULT_DISTANCE_FROM_TARGET_YD`.
- Produces: `SetupPanel({ rotation, distanceYd, onRotation, onDistance, disabled? })` (collapsed `<details>` titled "Setup"); `useSimulation(spec, options?: { distanceYd?: number })` building the `Simulation` with that distance; GameView keeps `rotation` and `distanceYd` in React state (initial: dot preset, 28), shows `buildPriority(rotation, distanceYd)` in the Priority list, and passes the distance to the next `Simulation`; the running fight is not changed (the hook reads the distance at `reset()`/creation only).

- [ ] **Step 1: Write the failing tests** (jsdom)
  - `the panel shows the preset selector, a curse selector, checkboxes for Immolate, Corruption and Shadowburn finisher, a Life Tap threshold and the distance`; `choosing the sb-spam preset removes Immolate and Corruption from the Priority list`; `changing a flag marks the preset as Custom`; `the distance input clamps 0..100 and ignores NaN/empty (keeps the last valid value)` (Review Focus 5); `changing the distance does not change a running fight` (cast Shadow Bolt, change the distance, advance: damage lands at the old travel time) and `after R the new distance applies` (Review Focus 6); `keys typed into the panel's inputs do not trigger spells` (the key handler ignores events from input, select, textarea and summary targets; also resolves the stage 1 deferred minor).
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement** the panel, the state and the key-handler guard; style it for light and dark.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`; then a Playwright smoke (script outside the repo): open the page, switch to sb-spam, check the Priority list, play Shadow Bolt with the keyboard, no console errors, screenshot desktop and phone — Expected: green; describe the screenshots in the report.**
- [ ] **Step 5: Commit** `feat(ui): rotation and distance settings`.

---

### Task 5: Engine support for buffs (scheduled auras, `addMana`, haste multiplier)

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/sim.ts`, `src/engine/stats.ts`
- Test: `tests/engine/sim-scheduled.test.ts`, `tests/engine/stats.test.ts` (extend), `tests/engine/sim-hooks.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface ScheduledAura { auraId: string; on: 'self' | 'target'; atMs: number; durationMs?: number }`; `SimConfig.scheduledAuras?: ScheduledAura[]`. Entries with `atMs <= 0` are applied inside `start()` before the first cast; later ones are events at `atMs`. `durationMs` overrides the aura's own duration for that application (the fade event and removal use it). Entries with `atMs > durationMs` of the fight, NaN or negative `durationMs` are ignored; a duration running past the end is cut by the end of the fight. The log shows `aura-apply` without `spellId`.
  - `SpecHooks.onSpellResolved` `api.addMana(amount: number): number` (returns the actual gain, caps at max mana, logs a `mana` event with the resolving spell id).
  - `StatMultipliers.haste?: number` (multiplicative factor on `1 + hastePct/100`, default 1) and `AuraDef.selfStatMultipliers?: StatMultipliers` (applied while the self aura is active, combined multiplicatively with the base multipliers; the base setup multipliers stay as they are). `computeStats` result: `hastePct = ((1 + ratingHastePct/100) × hasteFactor − 1) × 100`.
  - `applyAura`'s `source` becomes optional (`SpellDef | undefined`) for scheduled applications; a DoT target aura scheduled without a source uses `dotDamageMult` 1.

- [ ] **Step 1: Write the failing tests**
  - `scheduled-auras`: `a self aura scheduled at 0 is active from the first cast and fades at its duration`; `scheduled at 5000 appears at 5000`; `durationMs override shortens the aura`; `atMs after the fight end never applies`; `a duration running past the end is cut by the end (no aura-fade logged after it)`; `a finite atMs <= 0 applies at start; NaN and Infinity entries are ignored`; `a target aura scheduled for the whole fight multiplies later damage (damageTakenMult) from the first cast`; `jump-vs-steps with scheduled auras and a haste aura`.
  - `stats`: `haste factor 1.3 with 45 haste rating gives hastePct ≈ 33.7 (multiplicative, from the log: Shadow Bolt 2500 ms → 1870 ms)` and an engine test `Heroism-like aura: Shadow Bolt started during it takes round(2500/1.337)`, `after it fades the cast time returns`.
  - `hooks`: `api.addMana adds mana, caps at max mana, returns the gain, logs a mana event with the spell id`; `api object stays frozen`.
- [ ] **Step 2: Run `npx vitest run tests/engine` — Expected: FAIL.**
- [ ] **Step 3: Implement** the types and engine changes (extend `buildStatsAndModifiers` to fold the self auras' multipliers).
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS (no existing expectation changes).**
- [ ] **Step 5: Commit** `feat(engine): scheduled auras, addMana and haste multipliers`.

---

### Task 6: Buff catalog model and raid/party/individual buffs

**Files:**
- Create: `src/data/common/buffs.ts`, `tests/data/buffs.test.ts`
- Modify: `src/data/types.ts`, `docs/data-sources.md`

**Interfaces:**
- Produces in `src/data/types.ts`:
  ```ts
  type BuffGroup = 'raid' | 'party' | 'individual' | 'consumable' | 'debuff' | 'item' | 'warlock'
  interface BuffEffect { statBonuses?: Partial<RawStats>; statMultipliers?: StatMultipliers; modifiers?: SpellModifier[];
                         targetAura?: AuraDef;    // debuff on the target for the whole fight (scheduled at 0)
                         selfAura?: AuraDef;      // timed self buff (needs BuffDef.timed)
                         auras?: AuraDef[];       // helper auras (hidden internal cooldowns)
                         hooks?: SpecHooks }
  interface BuffDef { id: string; name: string; icon: string; wowheadId?: number; group: BuffGroup; exclusiveGroup?: string;
                      description: string;
                      source: string;          // repo path/symbol or URL of the values, or 'UNVERIFIED' (with the reason in description)
                      effect: BuffEffect; timed?: { defaultStartSec: number; durationSec: number } }
  ```
- Produces in `buffs.ts`: `commonBuffs: BuffDef[]` — static buffs: Arcane Brilliance, Gift of the Wild, Divine Spirit (Prayer of Spirit), Blessing of Kings (Int/Spirit multiplier), Blessing of Wisdom (mp5), Moonkin Aura (spell crit via `modifiers` `critPctDelta`), Mana Spring Totem (50 mp5, the log checkpoint), Wrath of Air Totem (spell power), Totem of Wrath (crit and hit), Heroic Presence (hit; 1% = `HIT_RATING_PER_PCT` rating, comment it). Values from tbc-new `sim/core/buffs.go` (improved/unimproved ranks: pick the maximum rank and note it); percentage Int/Spirit multipliers multiply with the setup's existing multipliers (state the stacking rule found in wowsims; `UNVERIFIED` if not clear).

- [ ] **Step 1: Write the failing tests**
  - `ids are unique; every buff has name, icon, group and a non-empty effect`; `static buffs carry no timed field, timed ones carry both selfAura and timed`; `Mana Spring Totem gives 50 mp5 (20 mana per 2 s)`; `Blessing of Kings multiplies intellect and spirit by 1.1`; `every BuffDef has a non-empty description and source`.
- [ ] **Step 2: Run `npx vitest run tests/data/buffs.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** the types and the catalog; research each value in the cloned wowsims sources (`/tmp/claude-0/-home-user-rotation-trainer/ace88de3-2ad9-58eb-888e-cd9aba355637/scratchpad/clone`, read-only) and Wowhead TBC; add a "Part C: raid, party and individual buffs" section to `docs/data-sources.md`.
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(data): raid, party and individual buff catalog`.

---

### Task 7: Consumables, debuffs and warlock options

**Files:**
- Create: `src/data/classes/warlock/buffs.ts`, `tests/data/consumables.test.ts`
- Modify: `src/data/common/buffs.ts`, `src/data/classes/warlock/destruction.ts`, `docs/data-sources.md`

**Interfaces:**
- Consumes: Tasks 5, 6.
- Produces:
  - In `src/data/common/buffs.ts`: `consumables` (flasks Supreme Power and Distilled Wisdom with `exclusiveGroup: 'flask'`; battle elixirs `'elixir-battle'`; guardian elixirs `'elixir-guardian'`; food `'food'`; weapon oil `'weapon-oil'`) and the exported table `EXCLUDES: Record<string, string[]> = { flask: ['elixir-battle', 'elixir-guardian'] }` (enabling a flask disables enabled elixirs; used by `normalizeSetup`, Task 9). Super Mana Potion and Dark Rune are NOT modelled (they are player-cast actions with an instant mana effect, not passive buffs; documented as a deviation from spec §4.2 in `docs/data-sources.md`). `debuffs`: Curse of the Elements from another warlock (aura id `raid-curse-of-the-elements`, NOT in the `'curse'` group, 10% fire/shadow/frost/arcane; the player's own `curse-of-the-elements` and this one must not both apply: `exclusiveGroup: 'coe-effect'` shared by both auras' effects handled in `applySetup`), Misery, Shadow Weaving (stacking behaviour from wowsims), Judgement of Wisdom (target debuff + hook: on a landed spell hit (`outcome !== 'miss'`), `api.roll() < chance` → `api.addMana(74)`; chance from wowsims, 20 procs on 37 hits observed), and `isb-from-others` (permanent ×1.2 shadow damage taken on direct damage with `directOnly`, not stacking with the player's own `shadow-vulnerability`: implement by giving both auras `exclusiveGroup: 'isb'`).
  - `warlockOptions`: `buildDestructionWarlock(options: WarlockOptions): SpecData` in `destruction.ts` with `WarlockOptions = { armor: 'fel' | 'demon' | 'none'; sacrificeSuccubus: boolean }`; `destructionWarlock = buildDestructionWarlock({ armor: 'fel', sacrificeSuccubus: true })` (all stage 1 numbers identical); `armor` other than `fel` drops the +130 spell power, `sacrificeSuccubus: false` drops the ×1.15 shadow modifier.

- [ ] **Step 1: Write the failing tests**
  - `flask, elixir and food ids share the documented exclusive groups`; `Judgement of Wisdom: hook gives 74 mana on a hit and never on a miss; with a seeded Rng the proc rate over 2000 hits is within 3% of the configured chance; api.roll draws only when the debuff is on` (existing runs unchanged when it is off); `raid-curse-of-the-elements multiplies fire and shadow damage by 1.1 while the player's own curse-of-agony is also up`; `own Curse of the Elements plus the raid one give a single ×1.1`; `isb-from-others and the player's own Shadow Vulnerability never give ×1.44 together`; `buildDestructionWarlock default equals destructionWarlock field by field`; `armor none removes 130 spell power; demon the same`; `sacrificeSuccubus false removes the shadow multiplier`.
- [ ] **Step 2: Run `npx vitest run tests/data` — Expected: FAIL.**
- [ ] **Step 3: Implement** with values researched from wowsims (`consumes.go`, `buffs.go`, `debuffs.go`) and Wowhead; extend `docs/data-sources.md`.
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS (bot band unchanged).**
- [ ] **Step 5: Commit** `feat(data): consumables, debuffs and warlock options`.

---

### Task 8: Timed cooldowns and item effects

**Files:**
- Modify: `src/data/common/buffs.ts`, `src/data/classes/warlock/buffs.ts`, `docs/data-sources.md`
- Test: `tests/data/cooldowns.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces timed `BuffDef`s (`effect.selfAura` + `timed`): Bloodlust/Heroism (`selfStatMultipliers.haste` 1.3, 40 s, default start 0; the log started it around 6 s: that is the preset's choice, Task 12), Destruction Potion (15 s, spell power and crit from wowsims), Icon of the Silver Crescent (+155 spell power, 20 s, 120 s cooldown, default start 0), Band of the Eternal Sage (proc: `hooks` on a landed damaging spell: `roll() < chance`, then apply the 10 s `+spell power` self aura unless the hidden 60 s internal-cooldown aura is up and apply the ICD aura; values from tbc-new `stat_bonus_procs_auto_gen.go` and the log). Item effects belong to group `item`.

- [ ] **Step 1: Write the failing tests**
  - `Heroism scheduled at 6000: a Shadow Bolt started at 7000 takes round(2500/1.337) = 1870 ms (±1) and one started at 47000 takes 2431` (log checkpoint); `Destruction Potion lasts 15000 ms from its start`; `Icon adds 155 spell power for 20 s` (a scripted Shadow Bolt before/during/after, damage ratio from the coefficient); `Band: proc rate over many seeds is near the configured chance, never twice within 60 s of the first proc (log), buff lasts 10 s`; `a timed buff scheduled after the fight end never applies`; `timed buffs with a custom start/duration from the config are honoured` (via Task 9 later; here via ScheduledAura directly).
- [ ] **Step 2: Run `npx vitest run tests/data/cooldowns.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** the entries and docs ("Part C: cooldowns and item effects"; remove Icon and Band from the "Not modeled" list only when they are modelled).
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(data): timed cooldowns and item effects`.

---

### Task 9: SetupConfig and applySetup

**Files:**
- Create: `src/setup/types.ts`, `src/setup/defaults.ts`, `src/setup/presets.ts`, `src/setup/applySetup.ts`, `tests/setup/applySetup.test.ts`

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces:
  ```ts
  interface SetupConfig { version: 1; enabledBuffs: string[];
                          timed: Record<string, { startSec: number; durationSec: number }>;
                          rotation: RotationConfig; distanceYd: number; warlock: WarlockOptions }
  const DEFAULT_SETUP: SetupConfig                 // no buffs, dot rotation, 28 yd, fel armor + succubus sacrifice
  const SETUP_PRESETS: Record<'none' | 'raid-log', { name: string; config: SetupConfig }>   // 'raid-log' is filled in Task 12 (start as a copy of none)
  function normalizeSetup(input: unknown, catalog: readonly BuffDef[]): SetupConfig        // never throws
  function applySetup(i: { buildSpec(w: WarlockOptions): SpecData; catalog: readonly BuffDef[]; config: SetupConfig }):
    { spec: SpecData; sim: { scheduledAuras: ScheduledAura[]; distanceFromTarget: number } }
  ```
  `normalizeSetup`: object check, `version` must be 1 else defaults; drops non-string and unknown buff ids and duplicates; enforces `exclusiveGroup` (keep the last in the saved list's order) and the `EXCLUDES` table (a flask removes enabled elixirs); clamps `distanceYd` to [0, 100] (NaN → 28), `startSec` to [0, 600], `durationSec` to [1, 600]; fills `timed` defaults from the catalog; rotation fields validated against their types and the curse union. `applySetup`: spec = `buildSpec(config.warlock)`; static effects merged by summing `statBonuses`, multiplying `statMultipliers` into `spec.setup.statMultipliers`, appending `modifiers`; `targetAura` buffs become scheduled target auras (atMs 0, `durationMs` = fight length) with their aura defs appended to `spec.auras`; timed buffs become scheduled self auras with the configured start and duration; `hooks` composed after the spec's own (`composeHooks`); `spec.priority = buildPriority(config.rotation, config.distanceYd)`; own `curse-of-the-elements` and `raid-curse-of-the-elements` and the two ISB auras stay mutually exclusive (Task 7 groups); inputs never mutated.

- [ ] **Step 1: Write the failing tests**
  - `golden: applySetup with DEFAULT_SETUP gives a spec whose derived stats (computeStats of setup + statBonuses), spells, auras, modifiers and priority ids equal destructionWarlock's, and the bot's mean DPS over seeds 1–10 equals the Task 2/3 value exactly (same seeds)`.
  - `enabling Arcane Brilliance and Blessing of Kings changes intellect as expected (flat bonus first, then ×1.1 with the Gnome multiplier)`; `a target-debuff buff appears in scheduledAuras at 0 with the fight length`; `a timed buff uses the configured start and duration`; `startSec above the fight length yields a scheduled aura the engine ignores (no crash)`.
  - normalize (Review Focus 4, 5): `unknown ids dropped, duplicates collapsed, same id twice once`; `flask + elixir keep only the last`; `two foods keep one`; `distance NaN → 28, -5 → 0, 1e9 → 100, '12' (string) → 28`; `version 2 or missing → defaults`; `null, a string, an array, a number → defaults`; `rotation with an invalid curse → the default curse`.
  - `applySetup does not mutate destructionWarlock or the config (deep-freeze them in the test)`; `own CoE + raid CoE give one ×1.1`; `isb-from-others and own ISB do not multiply together`.
- [ ] **Step 2: Run `npx vitest run tests/setup` — Expected: FAIL.**
- [ ] **Step 3: Implement** the four modules (`SETUP_PRESETS['raid-log']` is a copy of `none` for now).
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): setup config and applySetup`.

---

### Task 10: Persistence

**Files:**
- Create: `src/setup/storage.ts`, `tests/setup/storage.test.ts`

**Interfaces:**
- Produces: `SETUP_STORAGE_KEY = 'rotation-trainer:setup:v1'`; `type SetupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`; `loadSetup(storage: SetupStorage | null, catalog: readonly BuffDef[]): SetupConfig` (never throws, returns defaults on any problem); `saveSetup(storage: SetupStorage | null, config: SetupConfig): boolean` (false when it could not save); `browserStorage(): SetupStorage | null` (accessing `window.localStorage` in `try/catch`).

- [ ] **Step 1: Write the failing tests** (Review Focus 3)
  - `round trip: save then load returns the same normalized config`; `null storage → defaults, save returns false`; `getItem throws → defaults`; `setItem throws (quota) → save returns false, no throw`; `stored text is not JSON → defaults`; `stored JSON with an old version, a wrong type, unknown ids, out-of-range numbers → normalized, not trusted`; `stored value is huge (1 MB string) → defaults without hanging`; `prototype pollution payload ({"__proto__": ...}) does not change Object.prototype`.
- [ ] **Step 2: Run `npx vitest run tests/setup/storage.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** with `JSON.parse` in `try/catch`, passing the result through `normalizeSetup`.
- [ ] **Step 4: Run `npm run typecheck && npm test` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): localStorage persistence`.

---

### Task 11: Setup panel and wiring

**Files:**
- Modify: `src/ui/SetupPanel.tsx`, `src/ui/GameView.tsx`, `src/ui/useSimulation.ts`, `src/ui/TargetPanel.tsx`, `src/ui/game.css`, `src/main.tsx`/`src/ui/App.tsx` as needed
- Test: `tests/ui/setup-panel.test.tsx` (extend), `tests/ui/setup-wiring.test.tsx`

**Interfaces:**
- Consumes: Tasks 4, 9, 10.
- Produces: `SetupPanel({ catalog, config, presets, onChange, disabled? })` with groups from the catalog (Raid/party, Consumables, Debuffs, Items & cooldowns with a start second and duration input per timed buff, Warlock options, Rotation (Task 4 controls), Distance), preset buttons, "Reset to defaults" and a label of the active preset ("None", "Raid as in my log", "Custom"); GameView holds `SetupConfig` state (initial `loadSetup(browserStorage(), catalog)`), saves on every change (`saveSetup`), builds the `Simulation` for the next fight from `applySetup` (`scheduledAuras`, `distanceFromTarget` included); the active preset name appears next to the DPS note and in the end summary; the DPS note text depends on what is enabled (still says "No raid buffs…" only when no buff is enabled, else "Includes the enabled buffs; trinket/proc effects not selected are excluded").

- [ ] **Step 1: Write the failing tests** (jsdom; storage via an injected fake, `vi` fake timers as in `game.test.tsx`)
  - `every catalog group renders and toggling a buff calls onChange with it`; `toggling a flask unchecks the enabled elixirs`; `a timed buff shows its start second; typing 9999 or abc clamps/ignores (Review Focus 5)`; `preset buttons set the config; editing afterwards shows Custom`; `Reset to defaults restores DEFAULT_SETUP`.
  - wiring: `settings are saved on change and restored on the next mount`; `corrupt stored data mounts with defaults and no crash` (Review Focus 3); `enabling Heroism with start 0 makes the first Shadow Bolt shorter (~1.87 s) in the next fight, while the running fight is unchanged until R` (Review Focus 6); `storage unavailable (throws): the app still works and keeps settings in memory`; `the DPS note changes with the enabled buffs and the preset name is shown in the summary`; `keys typed into the panel's inputs do not cast`.
- [ ] **Step 2: Run `npx vitest run tests/ui` — Expected: FAIL.**
- [ ] **Step 3: Implement** the panel groups, state, saving and wiring; show aura icons for debuffs (the icon script covers new `wowheadId`s: extend `scripts/fetch-icons.mjs` to cover the buff catalog and commit the new files).
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build`, then a Playwright smoke (outside the repo): open the panel, enable a few buffs, press R, play a short fight, reload and confirm the settings persisted, no console errors, screenshots desktop and phone; read them and fix visible defects — Expected: green, defects fixed.**
- [ ] **Step 5: Commit** `feat(ui): setup panel with buffs, cooldowns and persistence`.

---

### Task 12: "Raid as in my log" preset, calibration and docs

**Files:**
- Modify: `src/setup/presets.ts`, `docs/data-sources.md`, `README.md`
- Test: `tests/setup/raid-log.test.ts`

**Interfaces:**
- Consumes: everything above. Reference values (author's Naj'entus log, 2026-10 raid): header Int 593, Spirit 191, crit rating 361, haste rating 45, hit rating 177; Life Tap 1856 and 1855 mana (spell power ≈ 1592 at 63 s and 99 s, before any timed buff); Heroism from 6.4 s, Destruction Potion at 7.5 s, Icon at 30.2 s, Band proc at 0.8 s and 69.5 s; Mana Spring Totem and Judgement of Wisdom active; Moonkin Aura on.

Rules: choose the catalog entries and the timed starts so the derived stats approximate those values; document in the test and `docs/data-sources.md` the residual differences (the export's gear differs from the raid gear: crit 339 vs 361, hit 196 vs 177) and which buffs are guesses (the raid's exact buffs are unknown: pick the standard ones that reproduce the totals, say so). The preset must not claim more precision than that.

- [ ] **Step 1: Write the failing tests**
  - `raid-log preset: intellect within 3% of 593 and spirit within 3% of 191 after buffs and multipliers`; `Life Tap yield 582 + 0.8 × shadow power is within 2% of 1856`; `Heroism, Destruction Potion and Icon start at 6.4 s, 7.5 s and 30.2 s in the preset's timed settings`; `the preset normalizes to itself (idempotent)`; `a Simulation built from it runs a 60 s bot fight deterministically (same seed twice equal) and its mean DPS exceeds the 'none' preset's mean over the same seeds`; `crit chance is higher than with 'none' by roughly the Moonkin + potion + Int contribution` (assert > none, not a magic number).
- [ ] **Step 2: Run `npx vitest run tests/setup/raid-log.test.ts` — Expected: FAIL.**
- [ ] **Step 3: Implement** the preset values; update `README.md` (Polish: Setup panel, presets, distance, rotation presets, `npm run icons` covers buffs) and the "What the DPS excludes" section of `docs/data-sources.md` (travel time now modelled; Icon/Band/consumables/raid buffs now optional); add the log checkpoints to the data-sources "Calibration" notes.
- [ ] **Step 4: Run `npm run typecheck && npm test && npm run build` — Expected: PASS.**
- [ ] **Step 5: Commit** `feat(setup): raid-as-in-my-log preset and docs`.

---

## Self-Review

- **Spec coverage:** A → Tasks 1–2 (missile speed, distance, impact timing, in-flight snapshot, priority/bot changes, band re-derivation); B → Tasks 3–4 (`RotationConfig`, `buildPriority`, presets, UI without saving); C → Tasks 5–12 (scheduled auras, `addMana`, haste multiplier, catalog groups raid/party/individual/consumables/debuffs/warlock options/timed/items, exclusivity, `applySetup`, normalization, persistence, panel, presets, calibration). Spec §8 risks: unverified values flagged in Tasks 6–8 and 12; Improved Shadow Bolt simplification in Task 7; bot band shift in Task 2.
- **Type consistency:** `ScheduledAura`, `StatMultipliers.haste`, `AuraDef.selfStatMultipliers`, `api.addMana` (Task 5) are the names used in Tasks 7–9; `WarlockOptions`, `buildDestructionWarlock` (Task 7) are used by `applySetup` (Task 9); `RotationConfig`, `buildPriority(config, distanceYd)` (Task 3) by Tasks 4, 9, 11; `DEFAULT_DISTANCE_FROM_TARGET_YD` (Task 2) by Tasks 3, 4, 9.
- **Deviation from the spec to confirm with the author:** Super Mana Potion and Dark Rune are left out of the catalog (Task 7), because they are player-cast actions with instant effects, not passive or scheduled auras; everything else in spec §4.2 is covered.
- **Known judgement left to the executor:** stacking rules for percentage multipliers (read them from wowsims, flag `UNVERIFIED` if unclear) and which standard buffs reproduce the log's totals (Task 12).
