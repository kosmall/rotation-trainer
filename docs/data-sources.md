# Data sources

Every game number in `src/data` carries a source comment. Status is `verified` (read from the cited source) or `UNVERIFIED` (best value kept, marked `// UNVERIFIED` in code).
Primary source: github.com/wowsims/tbc-new (TBC Anniversary), `master` @ `91f869a` (2026-10-26). Secondary: github.com/wowsims/tbc `master` @ `3301fca`. Wowhead TBC was not needed for Tasks 3 and 9; Task 12a cites it where used.

## What the DPS excludes

The trainer's DPS is approximate: it scores the rotation, not the whole raid setting. The UI says so in one line under the live stats and in the end summary. Details are in the sections cited.

Not in the number:

- Raid buffs and consumables (no party/raid buffs, flasks, elixirs, food, oils or potions).
- Item effects: Icon of the Silver Crescent's on-use (+155 spell damage for 20 s, 2 min cooldown) and Band of the Eternal Sage's proc (+95 spell damage for 10 s, 10% chance, 60 s internal cooldown); Riding Crop has no combat effect. See Task 12b, "Not modeled".
- Since stage 1.5 Part A, missile travel time IS modelled (Shadow Bolt lands 1400 ms after its cast at the default 28 yd); a bolt still in flight at the end does not count. See "Part A: projectile travel".
- Life Tap's health cost (health is not simulated; only its mana gain is).
- Incinerate's extra base damage while Immolate is on the target (Task 12a, open question 4; Incinerate is not in the priority).
- Curse of the Elements' -88 resistances (the engine uses a fixed level-based resist multiplier; only its x1.10 damage taken is modeled).

Assumed, not measured from the author's play:

- The Succubus is sacrificed (Demonic Sacrifice: +15% shadow damage) and Fel Armor (+130 spell power) is up all fight, both from the start.
- The spell queue window is 400 ms (wowsims' setting; UNVERIFIED for the Anniversary client).

Not applicable on a training dummy:

- Backlash's proc (instant Shadow Bolt after being hit) needs incoming attacks; the dummy never attacks (its +3% crit is modeled). Nightfall-style procs are not in the build.

Rotation effect worth knowing:

- Under the verified DoT refresh rule (ruling R19) the bot stops refreshing Immolate and Corruption once a full DoT no longer fits, so its DoTs end about 13 s before the fight end. Refreshing later in your own play is not wrong.

## Icons

- Spell and aura icons are Blizzard artwork served by Wowhead's CDN. They are fetched once by `npm run icons` (`scripts/fetch-icons.mjs`, run with tsx) into `public/icons/spells/<icon>.jpg` and **committed**, so the app has no runtime network calls. Personal use; if this repo ever becomes public, decide whether to keep the files in it (the alternative is to gitignore `public/icons/` and run `npm run icons` after `npm install`).
- Every `SpellDef` and `AuraDef` carries `wowheadId` (the TBC spell id, same ids as the data comments). For each id the script asks `https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5&locale=0` for the real icon name, compares it with the `icon` in the data (mismatch = report + exit 1; it never edits source files) and downloads `https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg`. All 11 icon names that were first written from memory matched Wowhead.
- `tests/data/icons.test.ts` checks (offline) that every spell/aura has a `wowheadId` and that its file is committed; `tests/ui/icons.test.tsx` checks the UI wiring and the fallback to the initials tile when a file is missing.
- Not covered yet: item, gem and enchant icons (stage 2a, with the Gear tab; the same script will fetch them).

## Task 3

Files: `src/data/common/ratings.ts`, `src/data/common/target.ts`, `src/engine/stats.ts`.

| Constant | Value | Source (wowsims/tbc-new unless noted) | Status |
|---|---|---|---|
| `CRIT_RATING_PER_PCT` | 22.076923 | `sim/core/base_stats_auto_gen.go` `SpellCritRatingPerCritPercent` (old wowsims/tbc: 22.08) | verified |
| `HIT_RATING_PER_PCT` | 12.615385 | `sim/core/base_stats_auto_gen.go` `SpellHitRatingPerHitPercent` (old: 12.62) | verified |
| `HASTE_RATING_PER_PCT` | 15.76923 | `sim/core/base_stats_auto_gen.go` `SpellHasteRatingPerHastePercent` (old: 15.77) | verified |
| `BASE_CRIT_PCT` | 1.7 | `sim/core/base_stats_auto_gen.go` `ExtraClassBaseStats[Warlock]` `SpellCritPercent` | verified |
| `INT_PER_CRIT_PCT` | 1 / 0.0122 (about 81.97) | `sim/core/base_stats_auto_gen.go` `CritPerIntMaxLevel[Warlock]` = 0.0122 crit % per intellect | verified |
| `MANA_PER_INTELLECT` | 15 | `sim/core/mana.go` `EnableManaBarWithModifier` (same in wowsims/tbc) | verified |
| `INT_MANA_FREE_THRESHOLD` | 20 | same function: `AddStat(Mana, 20-15*20)`, i.e. the first 20 intellect give 1 mana each | verified |
| `SPIRIT_REGEN_BASE_PER_SEC` | 0.001 | `sim/core/mana.go` `SpiritManaRegenPerSecond` | verified |
| `SPIRIT_REGEN_PER_SPIRIT_SQRT_INT` | 0.009327 | same | verified |
| `MP5_INTERVAL_SEC` | 5 | `sim/core/mana.go` `MP5ManaRegenPerSecond` (`mp5 / 5.0`) | verified |
| `BASE_CRIT_MULTIPLIER` | 1.5 | `sim/core/spell.go` `CritDamageMultiplier` (magic base 1.5) | verified |
| `MIN_GCD_MS` / `BASE_GCD_MS` | 1000 / 1500 | `sim/core/constants.go` `GCDMin`, `GCDDefault` | verified |
| `SPELL_QUEUE_WINDOW_MS` | 400 | `sim/core/constants.go` `MaxSpellQueueWindow`; a simulator setting, not confirmed as the client value | UNVERIFIED |
| `BOSS_TARGET.missPct` | 17 | `sim/core/target.go` `NewAttackTable`: `BaseSpellMissChance` for a level 73 target (0.17) | verified |
| `BOSS_TARGET.minMissPct` | 1 | `sim/core/spell_result.go` `SpellChanceToMiss`: `max(0.01, 1 - hitChance)` | verified |
| `BOSS_TARGET.levelResistMult` | 0.955 | derived from `sim/core/spell_resistances.go`: level-based resistance coefficient 0.02 per level = 0.06; the partial-resist thresholds give mean damage multiplier 1 - 0.75 * 0.06 | verified (derived) |
| `BOSS_TARGET.armor` | 7685 | `sim/encounters/register_all.go` level 73 boss `stats.Armor` | verified |

### Formulas (`computeStats`)

Raw stats are first summed with `extra` (talent flat bonuses), then:

- `maxMana = baseMana + 20 + 15 * (intellect - 20)` (wowsims: `Mana` stat has `20 - 15*20` added, plus 15 per intellect). The task brief listed `baseMana + 15 * intellect` as UNVERIFIED; the source shows the first 20 intellect are worth 1 mana each, so the exact formula is used. `RawStats.baseMana` is the class base mana excluding intellect (wowsims Warlock level 70: 2615).
- `critPct = BASE_CRIT_PCT + critRating / CRIT_RATING_PER_PCT + intellect / INT_PER_CRIT_PCT`
- `hitPct = hitRating / HIT_RATING_PER_PCT`, `hastePct = hasteRating / HASTE_RATING_PER_PCT` (linear, haste applies as `1 + hastePct/100` to cast speed: `unit.go` `1 + SpellHasteRating / (SpellHasteRatingPerHastePercent * 100)`)
- `power[school] = spellPower + schoolPower` for shadow and fire; `spellPower` for all other schools
- `spiritRegenPerSec = 0.001 + spirit * sqrt(intellect) * 0.009327` (wowsims `SpiritManaRegenPerSecond`; this is the full rate outside the five-second rule, which `Simulation` applies per regen tick, see Task 9 below)
- `mp5RegenPerSec = mp5 / 5` (wowsims `MP5ManaRegenPerSecond`)

### Notes

- Hit rating conversion used is the spell one (12.615385); melee hit is 15.769233 and is not used.
- Base crit and crit per intellect are Warlock-specific; other classes (stage 5) need their own values (`CritPerIntMaxLevel`, `ExtraClassBaseStats` in the same file).

## Task 9

Files: `src/engine/sim.ts` (mana check, spend, regen ticks, five-second rule, `gainMana`, `infiniteMana`).

| Constant | Value | Source (wowsims/tbc-new) | Status |
|---|---|---|---|
| `MANA_TICK_MS` | 2000 | `sim/core/mana.go` `initManaTickAction`: `interval := time.Second * 2`, first tick at start + 2 s, then every 2 s; `UpdateManaRegenRates` makes one tick worth `rate * 2` | verified |
| `FIVE_SECOND_RULE_MS` | 5000 | `sim/core/mana.go` `ManaCost.SpendCost`: `FiveSecondRuleRefreshTime = max(sim.CurrentTime + time.Second*5, Hardcast.Expires)`; `ManaTick` checks `sim.CurrentTime < FiveSecondRuleRefreshTime` | verified |

### Rules

- Mana is checked at cast start and spent at cast completion: `sim/core/cast.go` `makeCastFunc` calls `Cost.MeetsRequirement` (current mana >= cost) before the cast starts and `Cost.SpendCost` in `Hardcast.OnComplete` (or at once for instants). A cancelled cast, or one cut off by the fight end, spends nothing. In `Simulation`, `castRejection` returns `'no-mana'` when `mana < cost`; the check is the last one (after busy, cooldown, gcd and missing-aura).
- Cost is `manaCost * manaCostMult` (a float, not rounded; wowsims `SpellCost.GetCurrentCost` is a float as well).
- Five-second rule: a completed spell with cost > 0 sets the refresh time to completion + 5 s. At completion `Hardcast.Expires` is not later than now, so the `max` reduces to `completion + 5 s`. A regen tick is inside the rule when `tickTime < refresh`, strictly. A spend exactly 5000 ms before a tick no longer suppresses spirit regen. Zero-cost spells (Life Tap) do not refresh the rule (`SpendCost` only acts when `Cost > 0`).
- Regen tick: `mp5RegenPerSec * 2` always, plus `spiritRegenPerSec * 2` only outside the rule (`ManaTick`: `manaTickWhileCasting` vs `manaTickWhileNotCasting`).
- Mana is capped at maxMana (`AddMana`: `min(oldMana + amount, MaxMana())`) and never goes below 0. In `Simulation` all regen ticks are scheduled at fight start, so at a shared time a regen tick runs before other events (wowsims gives regen its own `ActionPriorityRegen`).
- `gainMana` (Life Tap-like) adds `amount + coeff * power[spell school]` at completion, capped at maxMana; logged as `mana` with the actual change.
- `infiniteMana` (trainer option, no wowsims counterpart): every cost is 0, so nothing is rejected for mana or spent, the rule never starts, and mana stays at maxMana (regen ticks change nothing and are not logged).
- Not modelled: `SpiritRegenRateCasting` / `ForceFullSpiritRegen` / `SpiritRegenMultiplier` and `manaRegenMultiplier` (talents or effects that keep part of spirit regen inside the rule or scale regen). With no such effects, wowsims' casting rate reduces to mp5 only, which is what `Simulation` uses.

## Task 12a

Files: `src/data/classes/warlock/spells.ts`, `src/data/classes/warlock/auras.ts`, `src/data/classes/warlock/destruction.ts`; engine fields added for it (commit `feat(engine): coefficient modifiers, direct-only charges, stat multipliers`): `SpellModifier.coeffDelta`, `AuraDef.damageTakenMult.directOnly`, `CharacterSetup.statMultipliers`.
Paths are in wowsims/tbc-new @ `91f869a` unless noted; `SD` = `sim/warlock/spell_data_auto_gen.go`. Secondary sources: wowsims/tbc @ `3301fca`, Wowhead TBC (wowhead.com/tbc/spell=17800), warcraft.wiki.gg "Improved Shadow Bolt (Classic)".

### Spells (highest rank trainable at level 70)

| Spell | Rank / id | Values | Source | Status |
|---|---|---|---|---|
| Shadow Bolt | 11 / 27209 | cost 420, cast 3000 ms, 544-607, coeff 0.857, hit+crit | `SD` ShadowBolt; `sim/warlock/shadowbolt.go` | verified |
| Immolate | 9 / 27215 | cost 445, cast 2000 ms, direct 331-332 coeff 0.2, hit+crit; DoT applied on landing | `SD` Immolate; `immolate.go` | verified |
| Corruption | 8 / 27216 | cost 370, cast 2000 ms, hit roll only | `SD` Corruption; `corruption.go` | verified |
| Curse of Agony | 7 / 27218 | cost 265, instant (GCD 1500) | `SD` CurseOfAgony; `agony.go` | verified |
| Curse of Doom | 2 / 30910 | cost 380, instant, cooldown 60000 ms | `SD` CurseOfDoom; `doom.go` | verified |
| Curse of the Elements | 4 / 27228 | cost 260, instant | `SD` CurseOfTheElements; `curse_of_elements.go` | verified |
| Conflagrate | 6 / 30912 | cost 305, instant, cooldown 10000 ms, 579-721, coeff 0.429; requires and consumes the Immolate DoT | `SD` Conflagrate; `conflagrate.go` (`ExtraCastCondition`, `Immolate.Dot.Deactivate`) | verified |
| Shadowburn | 8 / 30546 | cost 515, instant, cooldown 15000 ms, 597-665, coeff 0.429 | `SD` Shadowburn; `shadowburn.go` | verified |
| Incinerate | 2 / 32231 | cost 355, cast 2500 ms, 444-514, coeff 0.714 | `SD` Incinerate; `incinerate.go` | verified |
| Life Tap | 7 / 27222 | no cost, GCD 1500, +582 + 0.8 x spell power mana; never misses or crits | `SD` LifeTap; `lifetap.go` | verified |
| Icons | all | Wowhead icon file names (cosmetic, initials fallback in the UI) | memory | UNVERIFIED |

Coefficients are the float32 values of `SD` rounded to 3 decimals (0.8569999933 -> 0.857).

### Auras

| Aura | Values | Source | Status |
|---|---|---|---|
| immolate | 15 s, tick 123 every 3 s x 5 = 615, coeff 0.13 x 5 = 0.65, fire | `SD` Immolate `Periodic` | verified |
| corruption | 18 s, tick 150 every 3 s x 6 = 900, coeff 0.156 x 6 = 0.936, shadow | `SD` Corruption `Periodic` | verified |
| curse-of-agony | 24 s, tick 113 every 2 s x 12 = 1356, coeff 0.1 x 12 = 1.2; even ticks (no ramp), as in wowsims | `SD` CurseOfAgony `Periodic`; `agony.go` | verified (ramp not modeled) |
| curse-of-doom | 60 s, one tick of 4200 + 2.0 x power at 60 s | `SD` CurseOfDoom `Periodic {Tick 4200, Coef 2, TickLength 60 s, NumberOfTicks 1}` | verified |
| curse-of-the-elements | 300 s, x1.10 damage taken for arcane, fire, frost, shadow (Malediction 0) | `sim/core/debuffs.go` `CurseOfElementsAura` (`1.10 + 0.01*ranks`, `time.Minute*5`) | verified |
| shadow-vulnerability | 12 s, 4 charges, shadow damage taken x1.2; direct (non-periodic) shadow damage spends a charge, ticks are multiplied but spend none (`directOnly`); a Shadow Bolt crit (re)applies it with 4 charges (spec hook) | `sim/core/debuffs.go` `ImprovedShadowBoltAura` (`0.04*points`, 12 s, `MaxStacks 4`, `OnSpellHitTaken` removes a stack); `shadowbolt.go` (`SetStacks(4)` on a crit); wowsims/tbc `sim/core/debuffs.go` same rule; Wowhead TBC spell=17800 (12 s, +20%); warcraft.wiki.gg: "until 4 non-periodic damage sources are applied" | verified |

### Character (`destructionBaseStats`, `destructionStatMultipliers`, `statBonuses`)

| Item | Value | Source | Status |
|---|---|---|---|
| Base intellect / spirit | 133 + 3 = 136 / 139 + 0 = 139 | `sim/core/base_stats.go` `ClassBaseStats[Warlock]` + `RaceOffsets[Gnome]` (pre-racial values, fitted to TBC Anniversary combat logs) | verified |
| `baseMana` | 2615 (class base mana excluding intellect, ruling R12) | `sim/core/base_stats_auto_gen.go` `ExtraClassBaseStats[Warlock].Mana` | verified |
| Expansive Mind | intellect x1.05 on the total | `sim/core/racials.go` `Race_RaceGnome: MultiplyStat(Intellect, 1.05)` (wowsims/tbc `racials.go` too); applied via `statMultipliers.intellect` | verified |
| Fel Armor | +100 spell damage (rank 2, 28189) x 1.3 (Demonic Aegis 3/3) = +130 `spellPower` in `statBonuses`, assumed up all fight | `SD` FelArmor rank 2 `A_MOD_DAMAGE_DONE 100`; `sim/warlock/armors.go`; tbc-new `ui/specs/warlock/dps/presets.ts` DefaultOptions `armor: FelArmor` | verified (assumption: buff kept up) |
| Strength / agility / stamina | not in `RawStats`; no effect on the simulated spells | - | - |

With no gear (12b adds it): maxMana = (2615 + 15 x 142.8 - 280) x 1.03 = 4611.3.

### Talents: `000000000000000000000-2050130133200100000000-555000512200013330050` (0/21/40)

Order: tbc-new `ui/sim/talents/trees/warlock.json` `talents[].fieldName` (= `proto/warlock.proto` `WarlockTalents` 1-64). `parseTalentString` + `TALENT_ORDER` in `talents.ts` (in `destruction.ts` until stage 1.5 Part B) read the ranks; every modeled effect is computed from its rank. Effects: tbc-new `sim/warlock/talents.go`.

| Talent | Rank | Effect in the trainer | Source | Status |
|---|---|---|---|---|
| Improved Shadow Bolt | 5/5 | hook: Shadow Bolt crit applies `shadow-vulnerability` | `applyImprovedShadowBolt`, `shadowbolt.go` | verified |
| Cataclysm | 5/5 | `manaCostMult` 0.95 on Destruction spells (Shadow Bolt, Immolate, Incinerate, Conflagrate, Shadowburn) | `applyCataclysm` (`PowerCost_Pct_Add -0.01*rank`, `WarlockDestructionSpells`) | verified |
| Bane | 5/5 | `castTimeMsDelta` -500 on Shadow Bolt and Immolate (Shadow Bolt 2500 ms, Immolate 1500 ms) | `applyBane` (`-100ms*rank`) | verified |
| Devastation | 5/5 | `critPctDelta` +5 on Destruction spells | `applyDevastation` | verified |
| Shadowburn | 1/1 | the spell is available | `applyShadowburn` | verified |
| Ruin | 1/1 | `critMultDelta` +0.5 on Destruction spells (crit x2.0) | `applyRuin` (`CritMultiplier_Flat 1.0`); `sim/core/spell.go` `CritDamageMultiplier`: `(1.5*pct-1)*(1+additive)+1` | verified |
| Emberstorm | 3/5 | fire `damageMult` and `dotDamageMult` x1.06; Incinerate `castTimeMsDelta` -150 (6% of 2500). Shadowburn deliberately left out: wowsims' `WarlockFireDamage` mask lists it, but Shadowburn is a shadow spell and Emberstorm raises fire damage (the modifier matches the fire school only) | `applyEmberstorm`; `SD` Emberstorm rank 3 (17956): damage 6, DoT 6, cast time -6 | verified (deliberate deviation: Shadowburn not included) |
| Backlash | 3/3 | `critPctDelta` +3 on every spell | `applyBacklash` (`AddStat(SpellCritPercent, rank)`) | verified |
| Shadow and Flame | 5/5 | `coeffDelta` +0.2 on Shadow Bolt and Incinerate (Shadow Bolt 1.057) | `applyShadowAndFlame`; `SD` ShadowAndFlame rank 5 (30292) value 20 | verified |
| Demonic Sacrifice | 1/1 | shadow `damageMult` and `dotDamageMult` x1.15 (Succubus sacrificed) | `applyDemonicSacrifice` (`Succubus: SchoolDamageDealtMultiplier[Shadow] *= 1.15`); pet choice from tbc-new DefaultOptions | verified (pet choice UNVERIFIED for the author) |
| Demonic Embrace | 5/5 | `statMultipliers.spirit` 0.95 (stamina part irrelevant) | `applyDemonicEmbrace` (`MultiplyStat(Spirit, 1-0.01*rank)`) | verified |
| Fel Intellect | 3/3 | `statMultipliers.maxMana` 1.03 | `applyFelIntellect` (`MultiplyStat(Mana, 1+0.01*rank)`) | verified |
| Demonic Aegis | 3/3 | Fel Armor x1.3 (+130 spell power, see above) | `armors.go` | verified |

Multiplier stacking: each spell has at most one additive damage talent in this build, so additive (wowsims `DamageMultiplierAdditive`) and multiplicative stacking agree.

### Task 12a — talents not modeled

| Talent | Rank | Why |
|---|---|---|
| Improved Healthstone | 2/2 | healing item |
| Improved Voidwalker | 1/3 | pet |
| Fel Domination | 1/1 | pet summon utility |
| Fel Stamina | 3/3 | health (warlock and pet) |
| Master Summoner | 2/2 | pet summon utility |
| Intensity | 2/2 | cast pushback; no incoming damage |
| Destructive Reach | 2/2 | range and threat |
| Nether Protection | 3/3 | defensive proc |
| Backlash (proc part) | 3/3 | instant Shadow Bolt after being hit; the dummy never attacks (its +3% crit is modeled) |
| Demonic Embrace (stamina part) | 5/5 | stamina/health not simulated |

No Conflagrate talent in this build: the spell is defined in `spells.ts` (for the stage 2b talent editor) but is neither bound to a key (slot 8 is empty) nor in the priority (ruling R17). Nightfall-style procs are not in the build either (and DoT ticks cannot trigger hooks).

### Priority (shadow Destruction)

The rules live in `src/data/classes/warlock/rotation.ts` (`buildPriority`, see "Part B: rotation configuration"); the spec's `priority` is the DoT preset at 28 yd. Order: Curse of the Elements (when not on the target) > Shadowburn (finisher: fight time left <= Shadow Bolt cast time 2500 ms + its travel time 1400 ms at 28 yd = 3900 ms since Part A, unhasted talent values throughout) > Immolate (left <= its cast time 1500 ms and the fight outlasts cast + 15 s, and Immolate is neither being cast nor in flight) > Corruption (same rule, 2000 ms + 18 s) > Life Tap (mana < 399, Shadow Bolt's cost) > Shadow Bolt.

| Rule | Source | Status |
|---|---|---|
| Curse first, assigned curse when not active | tbc-new `ui/specs/warlock/dps/apls/destruction.apl.json` group "Cast Curse"; wowsims/tbc `sim/warlock/rotations.go` | verified |
| Curse of the Elements as the warlock's curse | tbc-new DefaultOptions assign Recklessness (raid choice); CoE chosen here as it raises the warlock's own fire and shadow damage. Curse of Doom is a real alternative: cast at the pull, its single tick lands at exactly 60 s and counts (a tick at the fight end counts, ruling R6); the bot measured about the same DPS with Doom instead of CoE (1483 vs 1486, 20 seeds, window 400). Only one curse can be up (see "Curses: one per target" below) | UNVERIFIED (choice) |
| Shadowburn only as a finisher (Soul Shard cost) | APL "Should Cast Shadow Burn" (`remainingTime <= spellCastTime(SB) + travel`) | verified (travel included since Part A: 2500 + 1400 ms at the default 28 yd; unhasted 2500 ms on purpose, see Task 12b open question 3) |
| Immolate refresh | APL "Should Cast Immolate" | verified |
| Immolate and Corruption rules are false while that same spell is being cast (`dotRefreshDue`, `s.cast?.spellId !== spellId`) or in flight (`!s.inFlight.some(f => f.spellId === spellId)`, Part A) | Spell-queue guard, not from the wowsims APL: with a queue window the bot or player could press the DoT again during its own cast and clip the first one, because the DoT is not on the target until the cast lands. wowsims evaluates its APL only when the player is free, so it never needs this. Added in Task 13; the in-flight part in stage 1.5 Task 2 (the real Immolate and Corruption have no missile, so it only matters for a DoT that flies; tested with a hypothetical missile Immolate/Corruption); tested in `tests/data/destruction.test.ts` and `tests/bot/bot.test.ts` | deliberate deviation from the APL |
| Corruption | wowsims/tbc `rotations.go` (`Rotation.Corruption && !CorruptionDot.IsActive()`); the tbc-new APL does not cast it; refresh rule copied from Immolate | UNVERIFIED |
| Life Tap when Shadow Bolt is unaffordable | APL: Life Tap is the last action, cast only when nothing else can be | verified (threshold derived) |
| Shadow Bolt filler | APL | verified |

DoT uptime under this rule (ruling R19, measured by the Task 13 bot over seeds 1-10, `BOSS_TARGET`, 60 s). The verified refresh rule only recasts while the cast and a full DoT still fit in the remaining fight. So in a 60 s fight the last Immolate is not refreshed near 47 s, and the third Corruption near 40 s is borderline. The uptimes are:

| Aura | Share of the whole fight | Share from the first application to the end of the last one |
|---|---|---|
| Immolate | about 75% | 97.4% |
| Corruption | about 81% | 99.2% (window 400), 99.8% (window 0) |
| Curse of the Elements | 99.8% | |

`tests/bot/bot.test.ts` asserts more than 90% over the second window for both DoTs, and more than 95% of the fight for Curse of the Elements. Keeping the DoTs up to the end would need a different rule (a data decision).

### Curses: one per target (ruling R22)

In the game a warlock keeps one curse per target: casting another curse replaces the current one (wowsims `DeactivateOtherCurses`). The engine models this with `AuraDef.exclusiveGroup`: applying an aura of a group first removes every other live aura of that group on the same unit (through the normal removal: pending ticks and fade cancelled, `aura-fade` logged at that ms). Re-applying the same aura is a plain refresh; the same group on the target and on the player does not interact. Curse of the Elements, Curse of Agony and Curse of Doom are all in the group `curse`.

The action bar binds Curse of the Elements (key 4), Curse of Agony (key 9) and Curse of Doom (key 0), so the author can practise any of them, but must choose ONE: pressing another curse replaces the one on the target (a Curse of Doom replaced before 60 s never ticks; Curse of the Elements' x1.10 is gone the moment another curse lands). The DoT preset (the spec's priority, and the bot by default) uses Curse of the Elements; Part B makes the curse configurable. Tested in `tests/engine/sim-exclusive.test.ts` and `tests/data/destruction.test.ts`.

### Open questions

1. Conflagrate is not in the author's build. Ruling R17: unbound; SpellDef kept for stage 2b.
2. Resolved (ruling R22): curses are mutually exclusive through `AuraDef.exclusiveGroup` (see "Curses: one per target" above).
3. Which pet the author sacrifices (Succubus assumed, +15% shadow).
4. Incinerate's bonus 111-128 base damage while Immolate is up (`incinerate.go`) needs conditional damage in `SpellDef`.
5. Curse of the Elements' -88 resistances and Shadowburn's binary resist are not modeled (fixed level-based resist multiplier).
6. Fel Armor is assumed up all fight (stat bonus, not a castable buff).

## Task 12b

Files: `src/data/classes/warlock/items.ts` (`items`, `gems`, `enchants`), `src/data/classes/warlock/sets.ts` (`warlockSets`), `src/data/classes/warlock/destruction.ts` (`destructionEquipped`, `sets`, `setup`), `DESTRUCTION_SPELL_IDS` moved to `spells.ts` (shared by the talents and the meta gem). Engine: `AuraDef.hidden` (commit `feat(engine): hidden auras left out of snapshots`): `snapshot().selfAuras` / `targetAuras` omit hidden auras; they are still tracked for `hasSelfAura` / `hasTargetAura`, keep their effects and are logged. Meant for set-proc internal cooldowns; the default gear has no such proc, so no warlock aura uses it yet. `tsconfig.json`: `resolveJsonModule` (the gear test imports the sample export).

Default gear: `gear.items` of `docs/samples/wowsimsexporter-destruction-warlock.json`, copied verbatim into `destructionEquipped` (a test asserts equality with the file). `setPieces` and the meta gem's modifiers come from `buildSetup`; `statMultipliers` (Expansive Mind, Demonic Embrace, Fel Intellect) are spread back in, so they also scale the gear's intellect and spirit.

Sources: `DB` = wowsims/tbc-new @ `91f869a` `assets/database/db.json` (`items[]`, `gems[]`, `enchants[]` by `effectId`; stat index = `proto/common.proto` `Stat`: 3 Int, 5 SpellDamage, 11 ShadowDamage, 12 hit, 13 crit, 14 haste, 16 Spirit). `OLD` = wowsims/tbc @ `3301fca` `sim/core/items/all_items.go` / `all_gems.go` / `all_enchants.go`. Every value below matches in both unless noted, so all are **verified**. Only modeled stats are kept: stamina, healing (always equal to spell damage here), armor, strength, agility and weapon damage are dropped.

### Items

| Id | Item | Slot | Modeled stats | Sockets (bonus) | Set | Source |
|---|---|---|---|---|---|---|
| 31051 | Hood of the Malefic | head | Int 36, SD 63, hit 16, crit 32 | meta, yellow (+5 SD) | Malefic Raiment (670) | DB, OLD |
| 32349 | Translucent Spellthread Necklace | neck | SD 46, hit 15, crit 24 | - | - | DB, OLD |
| 31054 | Mantle of the Malefic | shoulder | Int 22, SD 46, hit 21, crit 13 | blue, yellow (+4 SD) | 670 | DB, OLD |
| 32590 | Nethervoid Cloak | back | Int 18, shadow 53, hit 18 | - | - | DB, OLD |
| 30913 | Robes of Rhonin | chest | Int 38, SD 81, hit 27, crit 24 | - | - | DB, OLD |
| 32586 | Bracers of Nimble Thought | wrist | Int 20, SD 34, haste 28 | - | - | DB, OLD |
| 31050 | Gloves of the Malefic | hands | Int 27, SD 46, hit 11, crit 19 | yellow (+2 hit) | 670 | DB, OLD |
| 30038 | Belt of Blasting | waist | SD 50, hit 23, crit 30 | blue, yellow (+4 SD) | - | DB, OLD |
| 31053 | Leggings of the Malefic | legs | Int 44, SD 62, hit 19, crit 37 | yellow (+2 hit) | 670 | DB, OLD |
| 28517 | Boots of Foretelling | feet | Int 23, SD 26, crit 19 | red, yellow (+3 Int) | - | DB, OLD |
| 29305 | Band of the Eternal Sage | finger | Int 25, SD 34, crit 24 | - | - | DB, OLD |
| 32247 | Ring of Captured Storms | finger | SD 42, hit 19, crit 29 | - | - | DB, OLD |
| 25653 | Riding Crop | trinket | none (mount speed only) | - | - | DB (`stat_bonus_procs_auto_gen.go`: "Not simulated"); not in OLD |
| 29370 | Icon of the Silver Crescent | trinket | SD 43 | - | - | DB, OLD |
| 32237 | The Maelstrom's Fury | mainHand | Int 21, SD 236, crit 22 | - | - | DB, OLD |
| 33334 | Fetish of the Primal Gods | offHand | Int 17, SD 37, haste 17 | - | - | DB, OLD |
| 29982 | Wand of the Forgotten Star | ranged | SD 23, hit 11, crit 14 | - | - | DB, OLD |

Malefic Raiment membership: DB `setId 670` / `setName`; Wowhead TBC item-set=670 lists 31050, 31051, 31053, 31054 (plus Robe 31052 and the Sunwell bracers, belt and boots, not worn).

### Gems

| Id | Gem | Color | Modeled stats | Source |
|---|---|---|---|---|
| 34220 | Chaotic Skyfire Diamond | meta | crit 12; needs 2 blue gems; crit damage +3% (see below) | DB, OLD; `sim/common/tbc/metagems.go`; `sim/core/reforge_optimizer/meta_gem_constraints.go` (`34220: {minBlue: 2}`) |
| 32218 | Potent Pyrestone | orange | SD 6, crit 5 | DB, OLD |
| 32215 | Glowing Shadowsong Amethyst | purple | SD 6 (stamina 7 dropped) | DB, OLD |
| 32196 | Runed Crimson Spinel | red | SD 12 | DB, OLD |
| 24056 | Glowing Nightseye | purple | SD 5 (stamina 6 dropped) | DB, OLD |
| 32207 | Gleaming Lionseye | yellow | crit 10 | DB, OLD |
| 28123 | Potent Ornate Topaz | orange | SD 6, crit 5 | DB, OLD |
| 28118 | Runed Ornate Ruby | red | SD 12 | DB, OLD |
| 33133 | Don Julio's Heart | red | SD 14 | DB, OLD |

### Enchants (by effect id)

| Id | Enchant | Modeled stats | Source |
|---|---|---|---|
| 3002 | Glyph of Power (head) | SD 22, hit 14 | DB, OLD |
| 2995 | Greater Inscription of the Orb (shoulder) | SD 12, crit 15 | DB, OLD |
| 2621 | Enchant Cloak - Subtlety | none (threat) | DB, OLD |
| 2661 | Enchant Chest - Exceptional Stats | Int 6, Spirit 6 (Str/Agi/Sta dropped) | DB, OLD |
| 2650 | Enchant Bracer - Spellpower | SD 15 | DB, OLD |
| 2937 | Enchant Gloves - Major Spellpower | SD 20 | DB, OLD |
| 2748 | Runic Spellthread (legs) | SD 35 (stamina 20 dropped) | DB, OLD |
| 2649 | Enchant Boots - Fortitude | none (stamina 12) | DB, OLD (two items share effect 2649; the export puts it on boots) |
| 2928 | Enchant Ring - Spellpower (x2) | SD 12 | DB, OLD |
| 2669 | Enchant Weapon - Major Spellpower | SD 40 | DB, OLD |

### Socket bonus decisions (`buildSetup` socket matching)

| Item | Sockets | Gems | Bonus |
|---|---|---|---|
| Hood | meta, yellow | Chaotic Skyfire (meta), Potent Pyrestone (orange fits yellow) | +5 SD |
| Mantle | blue, yellow | Glowing Shadowsong Amethyst (purple fits blue), Potent Pyrestone (orange fits yellow) | +4 SD |
| Gloves | yellow | Runed Crimson Spinel (red) | none (red does not fit yellow) |
| Belt | blue, yellow | Glowing Nightseye (purple), Gleaming Lionseye (yellow) | +4 SD |
| Leggings | yellow | Potent Ornate Topaz (orange) | +2 hit |
| Boots | red, yellow | Runed Ornate Ruby (red), Don Julio's Heart (red in yellow) | none |

Meta requirement: 2 blue gems; the two purple gems count as blue (and red), so Chaotic Skyfire is active.

### Meta gem crit damage (Chaotic Skyfire Diamond)

wowsims: `core.ApplyMetaGemCriticalDamageEffect` sets `PseudoStats.CritDamageMultiplier *= 1.03`, and `sim/core/spell.go` `CritDamageMultiplier` = `(1.5 x CritDamageMultiplier - 1) x (CritMultiplierAdditive + 1) + 1`; Ruin is `CritMultiplier_Flat 1.0` (additive). The engine sums `critMultDelta` onto 1.5 (Ruin = +0.5, Task 12a).

- Without Ruin: 1.5 x 1.03 = 1.545, so +0.045.
- Destruction spells with Ruin: (1.545 - 1) x 2 + 1 = 2.09 vs 2.0 for Ruin alone, so +0.09.

Encoded as `metaModifiers` `[{critMultDelta: 0.045}, {spellIds: DESTRUCTION_SPELL_IDS, critMultDelta: 0.045}]`: every spell gets +0.045, the Destruction spells another +0.045 (Ruin doubling the meta's part). The second term assumes Ruin 1/1 (fixed stage 1 build); the stage 2b talent editor must make it conditional. A test checks the crit/non-crit ratio of Shadow Bolt and Shadowburn is 2.09 on the same seed.

### Default gear totals (`setup.stats`, before talents and multipliers)

| Stat | Total | Arithmetic |
|---|---|---|
| spellPower | 1117 | items 869 (63+46+46+81+34+46+50+62+26+34+42+43+236+37+23) + gems 67 (6+6+6+12+5+6+12+14) + socket bonuses 13 (5+4+4) + enchants 168 (22+12+15+20+35+12+12+40) |
| shadowPower | 53 | Nethervoid Cloak |
| critRating | 339 | items 287 (32+24+13+24+19+30+37+19+24+29+22+14) + gems 37 (12+5+5+10+5) + Orb 15 |
| hitRating | 196 | items 180 (16+15+21+18+27+11+23+19+19+11) + Leggings bonus 2 + Glyph of Power 14 (15.5% of the 16% cap) |
| hasteRating | 45 | 28 + 17 (2.85%: Shadow Bolt 2500 -> 2431 ms) |
| intellect | 433 -> 454.65 | base 136 + items 291 (36+22+18+38+20+27+44+23+25+21+17) + chest enchant 6; x1.05 Expansive Mind |
| spirit | 145 -> 137.75 | base 139 + chest enchant 6; x0.95 Demonic Embrace |
| maxMana | 9429.39 | (2615 + 20 + 15 x (454.65 - 20)) x 1.03 = 9154.75 x 1.03 |

With Fel Armor (+130): shadow power 1300, fire power 1247. A scripted 60 s run of the priority on `BOSS_TARGET` (100 ms steps) does about 1330-1570 DPS with real mana (seeds 1, 7, 42; one Life Tap) and 1380-1640 with infinite mana.

### Set bonuses (`warlockSets`)

| Set | Pieces | Description (Wowhead TBC item-set=670) | Encoding | Source | Status |
|---|---|---|---|---|---|
| Malefic Raiment (`malefic-raiment`, wowsims 670) | 2 | "Each time one of your Corruption or Immolate spells deals periodic damage, you heal 70 health." | none (no damage effect; the engine has no health); kept so the UI lists it | tbc-new `sim/warlock/items.go` `ItemSetMaleficRaiment` bonus 2 (Dot Heals 38394, `GainHealth(70)` on periodic damage) | verified |
| Malefic Raiment | 4 | "Increases the damage dealt by your Shadow Bolt and Incinerate abilities by 6%." | `modifiers: [{spellIds: ['shadow-bolt', 'incinerate'], damageMult: 1.06}]` | `items.go` bonus 4 (38393, `SpellMod_DamageDone_Flat 0.06`, `WarlockSpellShadowBolt \| WarlockSpellIncinerate`) | verified |

Worn: 4 pieces (Hood, Mantle, Gloves, Leggings), so both bonuses are active. No other set has pieces in the default gear. No set in the default gear needs a proc, hook, self aura or new engine feature.

### Not modeled (equipped effects excluded from the trainer's DPS)

| Item / enchant | Effect | Source |
|---|---|---|
| Icon of the Silver Crescent (29370) | On use: +155 spell damage for 20 s, 2 min cooldown (shared 20 s trinket category) | DB `itemEffects` (buff 35163); tbc-new `stat_bonus_cds_auto_gen.go` `NewSimpleStatActive(29370)`; OLD `caster_trinkets.go` |
| Band of the Eternal Sage (29305) | "Your offensive spells have a chance on hit to increase your spell damage by 95 for 10 secs": 10% on cast complete, 60 s internal cooldown | DB `itemEffects` (buff 35084, `procChance 0.1`, `icdMs 60000`); tbc-new `stat_bonus_procs_auto_gen.go`; OLD `caster_items.go` |
| Riding Crop (25653) | Mount speed (out of combat) | DB (`Mount Speed` 48776) |
| Malefic Raiment 2pc | Heal 70 per Corruption/Immolate tick | see above |
| Enchant Cloak - Subtlety (2621) | threat reduction (no damage effect) | DB, OLD (no stats) |
| Stamina, armor, healing, Str/Agi on items, gems and enchants | health and defence are not simulated | - |
| Wand of the Forgotten Star (29982) | wand attacks are not simulated (its stats count) | - |

The Maelstrom's Fury and Fetish of the Primal Gods have no on-use or proc effect in DB.

### Open questions

1. Malefic 4pc stacking with Emberstorm on Incinerate: wowsims adds both (`DamageMultiplierAdditive` 1 + 0.06 + 0.06 = 1.12), the engine multiplies (1.06 x 1.06 = 1.1236, +0.3%). Shadow Bolt is exact (its only other damage modifier, Demonic Sacrifice, is a school multiplier). Incinerate is not in the priority; an additive-damage modifier field would fix it. This supersedes the Task 12a note "each spell has at most one additive damage talent".
2. The meta gem's Ruin term is tied to the fixed build (see above).
3. The priority's rules use the unhasted talent cast times on purpose (Shadow Bolt 2500, Immolate 1500, Corruption 2000 ms; with gear haste they are 2431, 1458 and 1945 ms). Since ruling R20 the snapshot carries the effective cast times (`s.spells[id].castTimeMs`), and reading them was tried in the final fix wave: the DoT refresh then becomes due slightly later, sometimes just after the bot started another Shadow Bolt, so a DoT drops for up to one bolt (uptime from first to last application fell to 84% in one seed, below the bot test's 90%) and the mean DPS moved by about 4% (window 400). The unhasted values keep that margin; the finisher window is 69 ms wider than one hasted bolt. A rule that accounts for the cast in progress would be the real fix (a data decision for a later stage).
4. Band of the Eternal Sage and Icon of the Silver Crescent would add DPS once item effects arrive (stage 2a): the procs fit a set-style hook with a hidden internal-cooldown aura; the on-use trinket needs a castable item.

## Part A: projectile travel

Stage 1.5, Tasks 1-2. Files: `src/engine/travel.ts`, `src/engine/sim.ts` (Task 1), `src/data/common/target.ts`, `src/data/classes/warlock/spells.ts`, `src/data/classes/warlock/destruction.ts`, `src/ui/useSimulation.ts` (Task 2). Paths in wowsims/tbc-new @ `91f869a`; `SD` = `sim/warlock/spell_data_auto_gen.go`.

### Numbers

| Value | Number | Source | Status |
|---|---|---|---|
| Travel time | `round(distance / missileSpeed x 1000)` ms | `sim/core/spell.go` `TravelTime()` = `DistanceFromTarget / MissileSpeed` | verified |
| Shadow Bolt `missileSpeed` | 20 yd/s | `SD` ShadowBolt rank 11 (27209) `MissileSpeed: 20`; `shadowbolt.go` deals the damage in `spell.WaitTravelTime` | verified |
| Incinerate `missileSpeed` | 24 yd/s | `SD` Incinerate rank 2 (32231) `MissileSpeed: 24` (rank 1, 29722, has 20); `incinerate.go` reads the rank's value | verified (source data; not checked in a log) |
| No missile | Immolate, Corruption, Curse of Agony/Doom/the Elements, Conflagrate, Shadowburn, Life Tap | their `SD` rows have no `MissileSpeed` (the spec's "Immolate to check" is resolved: none); they resolve at cast end as in stage 1 | verified |
| `DEFAULT_DISTANCE_FROM_TARGET_YD` | 28 yd | author's Naj'entus log (Warcraft Logs): 25 of 25 Shadow Bolts landed 1.33-1.41 s after the cast ended, about 1.39 s; 1.39 s x 20 yd/s = 27.8 yd, rounded to 28 (1400 ms) | log checkpoint |
| Shadow Bolt flight at 28 yd | 1400 ms | 28 / 20 | derived |
| Incinerate flight at 28 yd | 1167 ms | 28 / 24 | derived |
| Shadowburn finisher window | Shadow Bolt cast + travel = 2500 + 1400 = 3900 ms | tbc-new `ui/specs/warlock/dps/apls/destruction.apl.json` "Should Cast Shadow Burn": `remainingTime <= spellCastTime(27209) + spellTravelTime(27209)` | verified (unhasted cast time on purpose, Task 12b open question 3) |

The engine default distance stays 0 (no travel) so engine fixtures are unaffected; the data layer passes 28 yd: `useSimulation` and the bot tests build every real-spec `Simulation` with `distanceFromTarget: DEFAULT_DISTANCE_FROM_TARGET_YD`. Stage 1 data tests that check timings at cast end keep distance 0 explicitly. Since Part B `buildPriority(config, distanceYd)` computes the finisher window from its distance argument; the spec's `priority` uses 28 yd.

### Model

At cast end the cost is spent, the cooldown starts and `cast-complete` is logged (unchanged). A missile spell is then listed in `snapshot().inFlight` and resolves at impact (`impact` log entry first): hit/crit roll, damage, consumption of target-aura charges (Improved Shadow Bolt), aura application and hooks (the Improved Shadow Bolt proc). An impact at exactly the fight length counts; a later one is discarded. `cancelCast` does not stop a launched missile. The priority does not press a DoT again while its first cast is in flight.

### Known difference from wowsims (ruling S4)

The trainer evaluates everything at IMPACT, with the stats, modifiers and target auras of that moment (the design spec's model). wowsims tbc-new does not: `shadowbolt.go` (likewise `incinerate.go`, `shadowfury.go`) calls `spell.CalcDamage` at cast end, so the hit/crit roll, spell power, attacker multipliers and target multipliers (e.g. whether Improved Shadow Bolt's x1.2 is up, `core/spell_result.go` `applyTargetModifiers`) are fixed when the cast ends; only `DealDamage` waits for `spell.WaitTravelTime`. The charge is spent at impact in both (`core/debuffs.go` `ImprovedShadowBoltAura` `OnSpellHitTaken` -> `RemoveStack`), and the ISB proc is applied at impact in both. An earlier plan sentence said impact-time evaluation is "as wowsims does"; that was wrong (corrected in the plan).

The difference is only visible when a buff or debuff starts or ends during a missile's ~1.4 s flight: e.g. Improved Shadow Bolt's last charge spent, or its 12 s duration running out, between a bolt's cast end and its impact, or a self buff (once Part C adds them) starting or ending mid-flight. That is a few boundaries per fight; the estimated effect is about 0.1% DPS. It also moves the RNG draws from cast end to impact, so a seed plays a different fight than in stage 1 (intended). Reversible inside `launchMissile`/`resolveSpell` if wowsims parity is wanted.

### Spell queue and missiles

`queuePressRejection` accepts a queued spell that requires a target aura while the spell being cast applies it, but does not look at missiles already in flight: such a queued spell is dropped at fire time (`missing-aura`) if the missile has not landed. For the warlock data this never matters: the only missile spells (Shadow Bolt, Incinerate) apply no aura through `applyAura` (Shadow Bolt's Improved Shadow Bolt comes from a hook, and nothing requires it), and the one aura requirement (Conflagrate needs Immolate) involves a spell without a missile; Conflagrate is also unbound (ruling R17).

### Effect on the bot (stage 1.5 Task 2)

Only the end of the fight changes: a Shadow Bolt counts only if it lands by 60 s, so the finisher window grows from 2500 to 3900 ms and the expected DPS falls from 1484 to 1448 (-2.4%, 0.57 Shadow Bolts fewer; derivation in `tests/bot/bot.test.ts`). Measured over seeds 1-10: 1425 (window 400) and 1428 (window 0), stage 1: 1483 and 1487. In this 60 s fight the bot's timeline barely varies between seeds: it lands exactly 18 Shadow Bolts in every seed (stage 1: 19) because the finisher point always falls 2.9-3.6 s before the end, inside the widened window, so one whole bolt (about 63 DPS, -4.2%) is lost against stage 1; the estimate's 18.58 assumed a uniform finisher point. Travel itself changes almost nothing (0 yd with the 3900 ms window gives about the same DPS).

Range: tbc-new gives Shadowburn (30546) `MaxRange: 20`, which even with Destructive Reach 2/2 is 24 yd, less than the 28 yd default distance, so a real player could not cast the finisher from that far. The engine has no range checks; a later task may consider it. The band stays +-12% around the re-derived value: [1274, 1622].

## Part B: rotation configuration

`src/data/classes/warlock/rotation.ts`: `buildPriority(config: RotationConfig, distanceYd)` is the only source of the priority list (the spec's `priority`, the UI's priority panel and the bot). It is pure: it reads only its arguments and the static data and returns new step objects. Keybinds do not change with the configuration. The talent build and its spell modifiers moved from `destruction.ts` to `talents.ts` (unchanged), so that `rotation.ts` can read the talent cast times without `destruction.ts` and `rotation.ts` importing each other.

`RotationConfig`: `curse` (`elements`, `agony`, `doom` or `none`), `immolate`, `corruption`, `shadowburnFinisher` (booleans) and `lifeTapBelowMana` (a number >= 0, or `auto` = Shadow Bolt's cost after Cataclysm, 399; NaN or a negative number throws `RangeError`).

Rules: the order is curse > Shadowburn (finisher) > Immolate > Corruption > Life Tap > Shadow Bolt, and disabled steps are left out (`curse: 'none'` has no curse step). Every rule is the one in "Priority (shadow Destruction)" above. The curse step is wanted while its own aura is not on the target. Another curse on the target does not count, because casting this one replaces it. Curse of Doom's 60 s cooldown makes the engine reject a second cast, so it needs no extra condition. A number for `lifeTapBelowMana` replaces Shadow Bolt's cost as the Life Tap threshold. `distanceYd` changes only the finisher window: Shadow Bolt's unhasted cast (2500 ms) + its flight (`projectileTravelMs`; 1400 ms at 28 yd, 0 at 0 yd or for a negative or non-finite distance).

| Preset | Config | Source | Status |
|---|---|---|---|
| `dot`, "DoT rotation" | Curse of the Elements, Immolate, Corruption, Shadowburn finisher, Life Tap `auto` | the stage 1 list (tbc-new APL + Corruption from wowsims/tbc, see above) | as above (curse UNVERIFIED (choice), Corruption UNVERIFIED) |
| `sb-spam`, "Shadow Bolt spam + curse" | Curse of Doom, no Immolate, no Corruption, Shadowburn finisher, Life Tap `auto` | the author's raid (spec Part B: curse on the pull, Shadow Bolt, Life Tap at low mana, Shadowburn at the end) | author's choice |

Effect on the bot (`tests/data/rotation.test.ts`, seeds 1-10, 28 yd). The `dot` preset gives exactly the Task 2 means: 1425.18 (window 400) and 1428.34 (window 0). Measured for comparison (not asserted):
- `sb-spam`: 1453 in both windows, with one Life Tap per fight.
- The DoT list with Curse of Doom: 1417 / 1421.
- `sb-spam` with Curse of the Elements: 1422.

Ten seeds give the mean a standard deviation of about 41 DPS (Task 2), so these are indications only. Without DoTs, Curse of Doom's single tick at 60 s beats Curse of the Elements' x1.10 (1453 vs 1422). With the DoTs, which Curse of the Elements also raises, the two are about even (1417 vs 1425). Both presets keep the Shadowburn finisher, although Shadowburn's range (24 yd with Destructive Reach) is shorter than the 28 yd default and the engine has no range checks (see "Effect on the bot (stage 1.5 Task 2)").
