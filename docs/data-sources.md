# Data sources

Every game number in `src/data` carries a source comment. Status is `verified` (read from the cited source) or `UNVERIFIED` (best value kept, marked `// UNVERIFIED` in code).
Primary source: github.com/wowsims/tbc-new (TBC Anniversary), `master` @ `91f869a` (2026-10-26). Secondary: github.com/wowsims/tbc `master` @ `3301fca`. Wowhead TBC was not needed for Tasks 3 and 9; Task 12a cites it where used.

## What the DPS excludes

The trainer's DPS is approximate: it scores the rotation, not the whole raid setting. The UI says so in one line under the live stats and in the end summary. Details are in the sections cited.

Not in the number:

- Raid buffs and consumables unless enabled in the setup (stage 1.5 Part C, all off by default): no party/raid buffs, flasks, elixirs, food, oils, potions, Heroism or debuffs in the default run. The "Raid as in my log" preset enables an approximation of the author's raid, several of whose buffs are guesses (see "Part C: setup rules and calibration").
- Item actions unless enabled in the setup and used: since the item actions (see "Part D: item actions"), Icon of the Silver Crescent (+155 spell damage for 20 s), Destruction Potion, Super Mana Potion and Dark Rune are pressed from the item row (Z X C V) by the player or the bot; enabling them alone adds nothing. Dark Rune's health cost (600-1000) is not simulated, like Life Tap's. Improved Divine Spirit's spell power (10% of spirit) is not modelled (see "Part C: raid, party and individual buffs"). (Stage 1.5 left Super Mana Potion and Dark Rune out and scheduled the potion and the Icon at a set second: superseded.)
- Item effects unless enabled in the setup: Band of the Eternal Sage's proc (+95 spell damage for 10 s, 10% chance, 60 s internal cooldown) is modelled since stage 1.5 Task 8 as an optional setup entry, off by default (see "Part C: cooldowns and item effects"); Riding Crop has no combat effect.
- Since stage 1.5 Part A, missile travel time IS modelled (Shadow Bolt lands 1400 ms after its cast at the default 28 yd); a bolt still in flight at the end does not count. See "Part A: projectile travel".
- Life Tap's health cost (health is not simulated; only its mana gain is).
- Incinerate's extra base damage while Immolate is on the target (Task 12a, open question 4; Incinerate is not in the priority).
- Curse of the Elements' -88 resistances (the engine uses a fixed level-based resist multiplier; only its x1.10 damage taken is modeled).

Assumed, not measured from the author's play:

- The Succubus is sacrificed (Demonic Sacrifice: +15% shadow damage) and Fel Armor (+130 spell power) is up all fight, both from the start. Since stage 1.5 both are warlock options (`buildDestructionWarlock`, default on); see "Part C: consumables, debuffs and warlock options".
- The spell queue window is 400 ms (wowsims' setting; UNVERIFIED for the Anniversary client).
- There are no range checks: Shadowburn (20 yd, 24 yd with Destructive Reach) is cast at the default 28 yd (see "Effect on the bot (stage 1.5 Task 2)").

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
| Curse of the Elements as the warlock's curse | tbc-new DefaultOptions assign Recklessness (raid choice); CoE chosen here as it raises the warlock's own fire and shadow damage. Curse of Doom is a real alternative: cast at the pull, its single tick lands at exactly 60 s and counts (a tick at the fight end counts, ruling R6); the bot measured about the same DPS with Doom instead of CoE (1483 vs 1486, 20 seeds, window 400; a stage 1 measurement taken before travel time, see Part A for the current numbers). Only one curse can be up (see "Curses: one per target" below) | UNVERIFIED (choice) |
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
| Riding Crop (25653) | Mount speed (out of combat) | DB (`Mount Speed` 48776) |
| Malefic Raiment 2pc | Heal 70 per Corruption/Immolate tick | see above |
| Enchant Cloak - Subtlety (2621) | threat reduction (no damage effect) | DB, OLD (no stats) |
| Stamina, armor, healing, Str/Agi on items, gems and enchants | health and defence are not simulated | - |
| Wand of the Forgotten Star (29982) | wand attacks are not simulated (its stats count) | - |

The Maelstrom's Fury and Fetish of the Primal Gods have no on-use or proc effect in DB.

Icon of the Silver Crescent's on-use and Band of the Eternal Sage's proc left this table in stage 1.5 Task 8: they are setup entries now (off by default), see "Part C: cooldowns and item effects".

### Open questions

1. Malefic 4pc stacking with Emberstorm on Incinerate: wowsims adds both (`DamageMultiplierAdditive` 1 + 0.06 + 0.06 = 1.12), the engine multiplies (1.06 x 1.06 = 1.1236, +0.3%). Shadow Bolt is exact (its only other damage modifier, Demonic Sacrifice, is a school multiplier). Incinerate is not in the priority; an additive-damage modifier field would fix it. This supersedes the Task 12a note "each spell has at most one additive damage talent".
2. The meta gem's Ruin term is tied to the fixed build (see above).
3. The priority's rules use the unhasted talent cast times on purpose (Shadow Bolt 2500, Immolate 1500, Corruption 2000 ms; with gear haste they are 2431, 1458 and 1945 ms). Since ruling R20 the snapshot carries the effective cast times (`s.spells[id].castTimeMs`), and reading them was tried in the final fix wave: the DoT refresh then becomes due slightly later, sometimes just after the bot started another Shadow Bolt, so a DoT drops for up to one bolt (uptime from first to last application fell to 84% in one seed, below the bot test's 90%) and the mean DPS moved by about 4% (window 400). The unhasted values keep that margin; the finisher window is 69 ms wider than one hasted bolt. A rule that accounts for the cast in progress would be the real fix (a data decision for a later stage).
4. Band of the Eternal Sage and Icon of the Silver Crescent: resolved in stage 1.5 Task 8 (the Band as a hook with a hidden internal-cooldown aura, the Icon as a timed buff, not a castable item); see "Part C: cooldowns and item effects".

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

Ten seeds give the mean a standard deviation of about 41 DPS (Task 2), so these are indications only. Without DoTs, Curse of Doom's single tick at 60 s seems to beat Curse of the Elements' x1.10 (1453 vs 1422): the tick is about 8962, i.e. about 149 DPS over 60 s, while CoE adds about 10% of the no-curse 1286, about 129 DPS; paired seeds put Doom ahead in 8 of 10 (+31 +- 19 standard error). With the DoTs, which Curse of the Elements also raises, the two are about even (1417 vs 1425). Both presets keep the Shadowburn finisher, although Shadowburn's range (24 yd with Destructive Reach) is shorter than the 28 yd default and the engine has no range checks (see "Effect on the bot (stage 1.5 Task 2)").

## Part C: raid, party and individual buffs

`src/data/common/buffs.ts` (`commonBuffs`, stage 1.5 Task 6): the static buffs, active the whole fight when enabled. Types `BuffGroup`, `BuffEffect`, `BuffDef` are in `src/data/types.ts`; each `BuffDef` carries a `description` and a `source` (repo symbol and Wowhead URL). The catalog and every entry in it are deep-frozen (shared data; `applySetup`, Task 9, builds new objects). Nothing is enabled by default, so the stage 1 numbers do not change.

Source: wowsims/tbc-new @ `91f869a` `sim/core/buffs.go` (function named per row), cross-checked against the Wowhead TBC tooltip of the `wowheadId` (`nether.wowhead.com/tbc/tooltip/spell/<id>`; the icon names were taken from the same tooltips). Groups follow wowsims' `RaidBuffs` / `PartyBuffs` / `IndividualBuffs` (`proto/common.proto`).

| Id | Effect in the trainer | Rank chosen | Source | Status |
|---|---|---|---|---|
| `arcane-brilliance` | +40 intellect | only rank | `ArcaneBrillianceAura` (`Intellect, 40`); Wowhead spell=27127 | verified |
| `gift-of-the-wild` | +18 intellect, +18 spirit | improved (Improved Mark of the Wild 5/5: `math.Floor(14 * 1.35)` = 18; unimproved 14) | `GiftOfTheWildAura`; Wowhead spell=26991, 17055 | verified |
| `prayer-of-spirit` | +50 spirit | unimproved part only (see below) | `DivineSpiritAura` (`makeExclusiveFlatStatBuff(Spirit, 50)`); Wowhead spell=32999 | verified |
| `moonkin-aura` | +5% crit on every spell (`modifiers: [{critPctDelta: 5}]`) and +20 crit rating | improved (the druid wears Idol of the Raven Goddess, item 32387; unimproved +5% only) | `MoonkinAuraBuff` (`SpellCritPercent 5`, improved `SpellCritRating 20`); Wowhead item=32387 | verified |
| `mana-spring-totem` | 50 mp5 = 20 mana per 2 s regen tick | unimproved (the log checkpoint: 20 mana per 2 s; Restorative Totems 5/5 would give 62.5) | `ManaSpringTotemAura` (`mp5Buff := 50.0`, x1.25 improved); Wowhead spell=25570 "20 mana every 2 seconds"; author's log | verified |
| `wrath-of-air-totem` | +121 spell power | improved (101 + 20 from Improved Wrath of Air Totem, the shaman Cyclone Regalia 2-piece (tbc-new sim/shaman/totems.go), Wowhead spell=37212; the improved value assumes the shaman wears it; unimproved 101) | `WrathOfAirTotemValue` (`101 + 20`); Wowhead spell=3738, 37212 | verified |
| `totem-of-wrath` | +3% crit on every spell (`critPctDelta: 3`), +3% spell hit (as `3 x HIT_RATING_PER_PCT` = 37.85 hit rating) | one totem (`count 1`; wowsims allows up to 5 for several shamans, the in-game aura does not stack) | `TotemOfWrathAura` (`3.0 * count` crit and hit percent); Wowhead spell=30706 | verified |
| `inspiring-presence` | +1% spell hit (as `HIT_RATING_PER_PCT` = 12.615385 hit rating) | only rank | `DraneiRacialAura(caster)` (`SpellHitPercent 1`, Alliance only); Wowhead spell=28878 | verified |
| `blessing-of-kings` | intellect x1.1, spirit x1.1 (`statMultipliers`) | only rank (Greater Blessing of Kings, 25898) | `BlessingOfKingsAura` (`Intellect, 1.1, true`, `Spirit, 1.1, true`); Wowhead spell=25898 "total stats by 10%" | verified |
| `blessing-of-wisdom` | 49 mp5 | improved (Improved Blessing of Wisdom 2/2: `math.Floor(41 * 1.20)` = 49; unimproved 41) | `BlessingOfWisdomAura`; Wowhead spell=27143, 20245 | verified |

### Decisions

- **Rank rule.** Where wowsims has an "improved" tristate, the catalog uses the improved (maximum) value, named in the description. Exception: Mana Spring Totem is the unimproved 50 mp5, the value measured in the author's log (and the plan's checkpoint). Only one entry per buff, so a setup cannot pick the unimproved rank of the others; Task 12 documents the residual difference if that matters.
- **Heroic Presence vs Inspiring Presence.** The plan said "Heroic Presence (hit)". In TBC the Draenei racial is two auras: Heroic Presence (6562) for melee and hunters, which wowsims models as physical hit only (`PhysicalHitPercent`), and Inspiring Presence (28878) for casters, `SpellHitPercent 1`. Only the second raises a warlock's spell hit, so the catalog has `inspiring-presence`.
- **Percentages.** Spell crit percentages (Moonkin, Totem of Wrath) are `modifiers` with `critPctDelta` and no spell or school filter (so every spell gets them, as wowsims' `SpellCritPercent` stat does); they do not appear in `critRating`, so the rating stays comparable with a log's character sheet. They are also not in `computeStats(...).critPct`: a display or test that reads only the derived stats must add the modifiers. Spell hit has no percentage field in `SpellModifier`, so the hit percentages are rating: 1% = `HIT_RATING_PER_PCT` (12.615385), exact in `computeStats` (`hitPct = hitRating / HIT_RATING_PER_PCT`).
- **Hit cap.** The default gear has 196 hit rating = 15.54% against the boss's 17% miss chance (1% minimum, `effectiveMissPct`), so only 0.46% of Totem of Wrath's or Inspiring Presence's hit is used; the rest is wasted, as in the game.
- **Not modelled: Improved Divine Spirit's spell damage** (10% of total spirit as spell damage and healing, `DivineSpiritAura` dynamic `Spirit -> SpellDamage 0.1` dependency): the engine's stats have no spirit-to-spell-power dependency, and a flat approximation would be wrong as soon as spirit changes. At about 190 spirit it is about +19 spell power (0.1 x spirit); Task 12's spell power calibration (Life Tap at about 1592) should keep that in mind. The +50 spirit is the same in both ranks.

### Stacking rule

- Flat bonuses (`statBonuses`) are added to the raw stats (gear + base + the spec's own flat bonuses); then every percentage multiplier scales the total. Multipliers of one stat multiply together: wowsims `sim/core/stats/deps.go` combines same-stat dependencies with `amount *= dep.amount`, and `MultiplyStat` applies to the stat's total. In the trainer, `computeStats` does the same with `combineStatMultipliers` (Task 5). Example with the default gear: intellect (433 + Arcane Brilliance 40 + Gift of the Wild 18) x 1.05 (Gnome) x 1.1 (Kings) = 567.1; spirit (145 + 18 + 50) x 0.95 (Demonic Embrace) x 1.1 = 222.6.
- No double counting with the spec: the default gear (`destructionEquipped`, Task 12b) comes from the wowsims exporter's item ids with item, gem and enchant stats only (no raid buff is in `setup.stats`); the spec's own multipliers are Expansive Mind, Demonic Embrace and Fel Intellect, and its only flat bonus is Fel Armor (+130 spell power, a warlock option, Task 7). None of them is in this catalog, and a test pins the spec's values.
- Exclusive categories in wowsims that matter only for buffs not in the catalog yet (`StatBuffCategory`: Arcane Brilliance and Prayer of Spirit vs scrolls; the totem categories vs a second shaman's totem): no `exclusiveGroup` is needed among these ten entries. The consumables (Task 7) add their own groups.
- Icons: the `icon` names match Wowhead's tooltip for each `wowheadId`; the files are not committed yet (Task 11 extends `npm run icons` to the buff catalog).

## Part C: consumables, debuffs and warlock options

Stage 1.5 Task 7. `src/data/common/buffs.ts` gains `consumables` and `debuffs` (deep-frozen, like `commonBuffs`) and the `EXCLUDES` table; `src/data/classes/warlock/buffs.ts` holds the warlock side (`NEUTRALIZED_BY`, `neutralizeOwnAuras`, the option descriptions); `destruction.ts` gains `buildDestructionWarlock(options)`. Nothing is enabled by default: `destructionWarlock = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS)` (Fel Armor, Succubus sacrificed) is field by field the stage 1 spec, and the bot means do not move.

### Consumables (static flat bonuses)

Source: wowsims/tbc-new @ `91f869a` `assets/database/db.json` `consumables` (the `stats` array is indexed by `proto/common.proto` `Stat`; `applyConsumeEffects` in `sim/core/consumes.go` adds it with `AddStats`), weapon oils from `consumes.go` `registerStaticImbue`; every value cross-checked with the Wowhead TBC item tooltip. `wowheadId` is the buff (use) spell; its icon was taken from Wowhead's spell tooltip (for food the buff spell, whose icon is the generic `spell_misc_food`, because the use spells' `inv_misc_fork-knife` is not a valid icon file name for `npm run icons`).

| Id | Group | Effect | Source (item) | Status |
|---|---|---|---|---|
| `flask-of-supreme-power` | `flask` | +70 spell power | db.json 13512 `SpellDamage 70`; Wowhead item=13512 | verified |
| `flask-of-distilled-wisdom` | `flask` | +65 intellect | db.json 13511 `Intellect 65`; Wowhead item=13511 | verified |
| `flask-of-pure-death` | `flask` | +80 shadow and fire power (frost unused) | db.json 22866 `Fire/Frost/ShadowDamage 80`; Wowhead item=22866 | verified |
| `elixir-of-major-shadow-power` | `elixir-battle` | +55 shadow power | db.json 22835; Wowhead item=22835 | verified |
| `elixir-of-major-firepower` | `elixir-battle` | +55 fire power | db.json 22833; Wowhead item=22833 | verified |
| `adepts-elixir` | `elixir-battle` | +24 spell power, +24 crit rating | db.json 28103; Wowhead item=28103 | verified |
| `greater-arcane-elixir` | `elixir-battle` | +35 spell power | db.json 13454; Wowhead item=13454 | verified |
| `elixir-of-draenic-wisdom` | `elixir-guardian` | +30 intellect, +30 spirit | db.json 32067; Wowhead item=32067 | verified |
| `elixir-of-major-mageblood` | `elixir-guardian` | 16 mp5 | db.json 22840; Wowhead item=22840 | verified |
| `blackened-basilisk` | `food` | +23 spell power, +20 spirit (same buff as Crunchy Serpent, Poached Bluefish) | db.json 27657; Wowhead item=27657, buff spell=33263 | verified |
| `skullfish-soup` | `food` | +20 crit rating, +20 spirit | db.json 33825; Wowhead item=33825, buff spell=43722 | verified |
| `blackened-sporefish` | `food` | 8 mp5 (its stamina is irrelevant) | db.json 27663; Wowhead item=27663, buff spell=33265 | verified |
| `brilliant-wizard-oil` | `weapon-oil` | +36 spell power, +14 crit rating | `registerStaticImbue` 25122; Wowhead item=20749 | verified |
| `superior-wizard-oil` | `weapon-oil` | +42 spell power | `registerStaticImbue` 28017; Wowhead item=22522 | verified |

Exclusivity: one entry per `exclusiveGroup` (flask, battle elixir, guardian elixir, food, weapon oil). `EXCLUDES = { flask: ['elixir-battle', 'elixir-guardian'] }`: a flask "counts as both a Battle and Guardian elixir" (the flask tooltips), so a flask and any elixir cannot be enabled together (Task 9's `normalizeSetup` keeps the later one; the wowsims UI clears both ways too, tbc-new `ui/features/settings/model/consumables.ts:431-438`). The weapon oil is a temporary enchant and stacks with the permanent weapon enchant of the gear (Major Spellpower on the main hand), as in the game.

Choice of entries: the spec named Supreme Power and Distilled Wisdom; Flask of Pure Death (the TBC warlock flask) was added because it is what a Shadow Bolt warlock would use. Elixirs and foods: the ones that change a simulated stat for a warlock.

**Deviation from the design spec §4.2 (to be confirmed by the author): Super Mana Potion and Dark Rune are not modelled.** They are actions the player takes for an instant mana gain at a moment of their choice (potion and rune cooldowns), not passive or scheduled buffs; the setup has no player-used consumables (spec §4.3: no automatic use by the player). If wanted later they need a spell-like action, not a catalog buff.
*Superseded by the item actions (2026-10-30): both are now catalog entries with an item action (`cooldowns` in `src/data/common/buffs.ts`), pressed from the item row; see "Part D: item actions".*

### Target debuffs from other raid members

Source: wowsims/tbc-new `sim/core/debuffs.go` (function per row), cross-checked with Wowhead TBC. Each is a target aura with its own id (never one of the spec's aura objects), no `exclusiveGroup`, and a 1-hour own duration (`SCHEDULED_DEBUFF_DURATION_MS` = 3600000, ruling S3: scheduled at 0 without an override, the end of the fight cuts it).

| Id | Effect | Source | Status |
|---|---|---|---|
| `raid-curse-of-the-elements` | x1.10 arcane, fire, frost, shadow damage taken | `CurseOfElementsAura(target, -1, 0)` (`1.10 + 0.01 x ranks`, unimproved; wowsims' improved option x1.13 is not offered); Wowhead spell=27228 | verified |
| `misery` | x1.05 arcane, fire, frost, holy, nature, shadow damage taken | `MiseryAura(target, 5)` (`1 + 0.01 x 5`); Wowhead spell=33195 "an additional 5% spell damage" | verified |
| `shadow-weaving` | x1.10 shadow damage taken | `ShadowWeavingAura`: `1.0 + 0.02 x stacks` (one additive multiplier, not 1.02^5), 5 stacks; Wowhead spell=15334 | verified (ramp simplified, below) |
| `judgement-of-wisdom` | 50% chance per landed spell to gain 74 mana | `JudgementOfWisdomAura`: `ProcChance 0.5`, `ProcMaskDirect`, landed spells only, `AddMana(74.0)`; Wowhead spell=27164 "(Proc chance: 50%)"; author's log: 74 per proc, 20 procs on 37 hits | verified |
| `isb-from-others` | x1.2 shadow damage taken, whole fight, no charges | `ImprovedShadowBoltAura(target, uptime, 5)` (`1 + 0.04 x 5`; with an uptime it has no charges); Wowhead spell=17800 | verified (100% uptime: simplification) |

Stacking (wowsims): Curse of the Elements, Misery and Shadow Weaving are exclusive effects of their own category ("CurseOfElements", "MiseryBonus", "ShadowWeaving"): one of each, the strongest. Different debuffs multiply each other (each multiplies `SchoolDamageTakenMultiplier`), as `damageTakenMult` does in the engine (`AuraTracker.damageTakenMult` multiplies every active aura): Misery and Shadow Weaving together are x1.05 x 1.10 on shadow.

Simplifications:
- **Shadow Weaving ramp**: wowsims adds one stack every 1.5 s from 0 (full at 6 s, `applyDebuffEffects` `ScheduledAura`); the trainer has the full x1.10 from the pull (the engine's `damageTakenMult` does not scale with stacks). Only the hits of the first 6 s are affected (at most 4 points of the 10%), a few tenths of a percent over a 60 s fight.
- **Improved Shadow Bolt from others**: always up (wowsims takes an uptime percentage, `IsbUptime`); it multiplies DoT ticks too, like the own debuff (`SchoolDamageTakenMultiplier`). The plan's `directOnly` was left out: in the engine it only restricts which hits spend a charge, and this aura has no charges.
- **Judgement of Wisdom**: the hook (run after every resolved spell; never for DoT ticks, matching `ProcMaskDirect`) rolls only for a landed spell (`outcome !== 'miss'`) and only while the debuff is on, so a setup without it keeps every random draw (and every stage 1 result) unchanged. Life Tap and Curse of the Elements never roll: in wowsims Life Tap deals no outcome to the target (`lifetap.go`) and Curse of the Elements has `ProcMaskEmpty` (`curse_of_elements.go`); every other trainer spell (Shadow Bolt, Immolate, Corruption, Curse of Agony, Curse of Doom, Shadowburn, Incinerate) has `ProcMaskSpellDamage`. Order of the roll differs from wowsims (which rolls before its landed check, on misses too); the rate per landed spell is the same. The log's 20 procs on 37 hits (54%) fits the 50% chance.

### Own vs raid debuff: one effect (rulings S1, S2)

In wowsims the raid's and the player's own Curse of the Elements share the exclusive effect "CurseOfElements", and the raid's and the player's own Improved Shadow Bolt are the same aura (label `ImprovedShadowBolt-5`): one multiplier each. In the trainer the raid debuff is a separate aura (the own curse keeps its curse slot, the own Shadow Vulnerability is still applied by Shadow Bolt crits), so giving them one `exclusiveGroup` would let the own application remove the permanent raid one. Instead `NEUTRALIZED_BY` (`src/data/classes/warlock/buffs.ts`) maps `raid-curse-of-the-elements` -> own `curse-of-the-elements` and `isb-from-others` -> own `shadow-vulnerability`, and `neutralizeOwnAuras(spec.auras, enabledBuffIds)` returns the auras with those own defs copied with `damageTakenMult.mult` 1 (schools, charges and charge spending kept). Task 9's `applySetup` must run the spec's auras through it; tests show that without it the two would give x1.21 and x1.44.

### Warlock options (`buildDestructionWarlock`)

`WarlockOptions = { armor: 'fel' | 'demon' | 'none'; sacrificeSuccubus: boolean }`, default `{ armor: 'fel', sacrificeSuccubus: true }` (stage 1).
- `armor: 'fel'`: +130 spell power (`FEL_ARMOR_SPELL_POWER`: Fel Armor rank 2 +100, Wowhead spell=28189, x Demonic Aegis 3/3; `armors.go`). `demon` and `none`: no bonus. Demon Armor (Wowhead spell=27260; `armors.go`: armor and shadow resistance) changes nothing the trainer simulates.
- `sacrificeSuccubus: false`: the Demonic Sacrifice modifier (shadow x1.15 direct and periodic, `talents.go applyDemonicSacrifice`, Wowhead spell=18791 Touch of Shadow "Shadow damage increased by 15%") is left out. The kept pet's own damage is not simulated; Master Demonologist (which wowsims applies only with the pet kept) has 0 points in this build.
- The Demonic Sacrifice modifier is exported on its own from `talents.ts` (`demonicSacrificeModifiers`; `talentModifiers` still contains the same objects), so the builder can drop exactly it.
- Every build returns new `modifiers`, `statBonuses`, `setup` and `priority` containers; spells, auras, sets, the priority steps and the hooks are the shared static data, so the default build equals the stage 1 spec field by field (`when` closures and hooks included).

## Part C: cooldowns and item effects

Stage 1.5 Task 8. `src/data/common/buffs.ts` gains `cooldowns` (Heroism, Destruction Potion); `src/data/classes/warlock/buffs.ts` gains `warlockItemBuffs` (group `item`: Icon of the Silver Crescent, Band of the Eternal Sage), because both items belong to the warlock's equipped gear, and the Band's proc list is made of warlock spell ids. Both lists are deep-frozen; every aura in them is its own object (never one of the spec's). Nothing is enabled by default, so the stage 1 numbers do not change.

A **timed** buff (`timed: { defaultStartSec, durationSec }` + `effect.selfAura`) is a self aura the fight applies at a configurable second for a configurable duration: Task 9's `applySetup` turns it into a `ScheduledAura` (`on: 'self'`, `atMs = startSec x 1000`, `durationMs = durationSec x 1000`) and appends the aura def to `spec.auras`. The aura's own `durationMs` equals the default duration. The player does not press them (spec §4.3). A start after the fight's end is ignored by the engine, and a duration running past the end is cut by it (Task 5).

*Superseded in part by the item actions (2026-10-30): only Heroism is still timed. Destruction Potion and the Icon lost `timed` and `exclusiveGroup: 'potion'`; each has an `effect.action` (an item action pressed from the item row) that applies the same aura below, and `cooldowns` gained Super Mana Potion and Dark Rune. The table and the decisions below are the stage 1.5 record; the aura values in it still hold. See "Part D: item actions".*

| Id | Group | Effect | Default start / duration | Source | Status |
|---|---|---|---|---|---|
| `heroism` ("Heroism / Bloodlust") | `raid` | `selfStatMultipliers: { haste: 1.3 }`: multiplies the rating haste factor, so with the gear's 45 haste rating x1.0285 x 1.3 = x1.337 (Shadow Bolt 2431 -> 1870 ms, GCD 1458 -> 1122 ms) | 0 s / 40 s | tbc-new `sim/core/buffs.go` `BloodlustAura` (`BloodlustDuration` 40 s, `multiplyCastSpeedEffect(aura, 1.3)`), `sim/core/unit.go` `TotalSpellHasteMultiplier` = `CastSpeedMultiplier x (1 + rating haste)`; Wowhead spell=32182 "spell haste by 30% ... Lasts 40 sec." (Bloodlust 2825 the same); author's log: Heroism 40 s, Shadow Bolt 1.86-1.89 s under it | verified |
| `destruction-potion` | `consumable` (`exclusiveGroup: 'potion'`) | `selfStatBonuses: { spellPower: 120 }`, `selfModifiers: [{ critPctDelta: 2 }]` | 0 s / 15 s | tbc-new `assets/database/db.json` consumable 22839: `SpellDamage 120`, `SpellCritRating 44.153846` (= 2 x 22.076923, exactly 2%), `buffDuration 15`, `categoryCooldownDuration 120`; `consumes.go` `makePotionActivationSpellInternal`; Wowhead item=22839 / spell=28508 "spell critical chance by 2% and spell damage by 120 for 15 sec. (2 Min Cooldown)"; author's log: 15 s | verified |
| `icon-of-the-silver-crescent` | `item` | `selfStatBonuses: { spellPower: 155 }` (aura "Blessing of the Silver Crescent") | 0 s / 20 s | db.json item 29370 `itemEffects`: buff 35163, `effectDurationMs 20000`, `SpellDamage 155`, `onUse.cooldownMs 120000` (trinket category 1141, 20 s); `sim/common/tbc/stat_bonus_cds_auto_gen.go` `NewSimpleStatActive(29370)`; Wowhead spell=35163, item=29370; author's log: 20 s | verified |
| `band-of-the-eternal-sage` | `item` | proc (below): +95 spell power for 10 s, 10% chance, 60 s internal cooldown | not timed | db.json item 29305 `itemEffects`: buff 35084, `effectDurationMs 10000`, `SpellDamage 95`, `proc { icdMs 60000, procChance 0.1 }`; `sim/common/tbc/stat_bonus_procs_auto_gen.go` (29305: `CallbackOnCastComplete`, `ProcMaskSpellDamage`); `sim/core/aura_helpers.go` `AttachProcTriggerCallback` (ICD checked before the roll, started on a proc); Wowhead spell=35083 "(Proc chance: 10%, 1m cooldown)", spell=35084; author's log: 10 s buff, 60 s internal cooldown | verified |

Decisions:
- **Cooldowns are not modelled as cooldowns.** Heroism (10 min, plus Exhaustion), the potion (2 min shared potion cooldown) and the Icon (2 min, plus the 20 s shared trinket category) can each be used once in a 60 s fight, so each is one timed buff and its cooldown only matters for a re-use the fight never needs. The setup can still move or shorten them (Task 9: `startSec` 0-600, `durationSec` 1-600). *Superseded for the potion and the Icon: item actions with their own and shared cooldowns ("Part D: item actions"). Still true for Heroism.*
- **Heroism** is one entry for Heroism (Alliance, the author's log) and Bloodlust (Horde): identical effect. The aura is not hidden; its haste goes through `computeStats` (Task 5 formula).
- **Destruction Potion's crit** is a percentage modifier on every spell (as Moonkin Aura), identical to wowsims' 44.153846 crit rating (2.000%); it does not show in `critRating` or `computeStats(...).critPct`. `exclusiveGroup: 'potion'`: one potion per fight (the only potion in the catalog for now). *Superseded: no exclusive group; the shared 2 min `potion` cooldown with Super Mana Potion decides in the fight.*
- **No double counting with the gear.** Both items are in the default gear (`destructionEquipped`: Icon 29370, Band 29305) and their equip stats are already in `setup.stats` (Icon +43 spell damage; Band +25 intellect, +34 spell damage, +24 crit rating; see "Items"). The catalog entries carry only the use / proc buff (+155, +95), no `statBonuses` (test).
- **Band proc.** `effect.auras` holds two helper auras (Task 9 appends them to `spec.auras`): `band-of-the-eternal-sage` (10 s, +95 spell power, visible) and `band-of-the-eternal-sage-icd` (60 s, `hidden`). The hook (run after every resolved spell; DoT ticks never call hooks) returns for a miss or a spell not in `BAND_PROC_SPELL_IDS`, then returns while the ICD aura is up, and only then calls `api.roll()`; a roll under 0.1 applies the ICD aura, then the buff. So no random draw happens while the Band is on cooldown, and a setup without the Band never composes the hook and keeps every draw (and every stage 1 result) unchanged.
- **Which spells proc the Band:** `BAND_PROC_SPELL_IDS` is derived from the warlock data: spells with a direct part or applying a DoT (Shadow Bolt, Immolate, Corruption, Curse of Agony, Curse of Doom, Conflagrate, Shadowburn, Incinerate). Life Tap and Curse of the Elements never roll: the tooltip says "offensive spells ... on hit", Life Tap does not target the enemy and Curse of the Elements deals no damage. Deviation from wowsims: there the proc rolls at cast end (`CallbackOnCastComplete`) for any `ProcMaskSpellDamage` cast, misses and Life Tap included (`lifetap.go` has `ProcMaskSpellDamage`); the trainer rolls when the spell lands (ruling S4) and only for a landed damaging spell, as the tooltip reads. A miss chance of about 1.5% (default gear, 15.54% hit against 17%) and few Life Taps in a 60 s fight make the difference small; it is mostly a different moment (impact instead of cast end) and RNG order.
- **ICD from the proc.** wowsims starts the ICD when it procs (`icd.Use` right before the handler); the trainer applies the ICD aura in the same step. The buff lasts 10 s, so a proc never refreshes a running buff (the ICD is 60 s).


## Part C: setup rules and calibration

Stage 1.5 Tasks 9-12. Files: `src/setup/{types,defaults,applySetup,storage,presets}.ts`, the panel `src/ui/SetupPanel.tsx`, the wiring in `src/ui/GameView.tsx` and `src/ui/useSimulation.ts`.

### Setup config and `normalizeSetup` (`src/setup/defaults.ts`)

`SetupConfig = { version: 1, enabledBuffs, timed, rotation, distanceYd, warlock }`. `SETUP_CATALOG` lists every buff in a fixed order: `commonBuffs`, `consumables`, `debuffs`, `cooldowns` (`src/data/common/buffs.ts`), then `warlockItemBuffs` (`src/data/classes/warlock/buffs.ts`). `DEFAULT_SETUP` has no buff enabled, the DoT rotation, 28 yd, Fel Armor and the Succubus sacrificed, and every timed buff at its catalog start and duration (since the item actions: Heroism only). With it `applySetup` reproduces the stage 1 spec (plus an empty item row in `keybinds`) and the Part B bot means exactly (golden test in `tests/setup/applySetup.test.ts`).

`normalizeSetup(input, catalog)` turns untrusted data (storage, a preset, a UI edit) into a valid config. It never throws, never mutates `input`, reads own properties only, and a hostile getter or proxy gives the defaults.
- A value that is not a plain object, or has a `version` other than 1, gives the defaults.
- `enabledBuffs`: catalog ids only (non-strings, unknown ids and duplicates are dropped). In an exclusive group, and for the `EXCLUDES` pairs (a flask vs the battle and guardian elixirs, both ways), the buff later in the list wins.
- `timed`: one entry per timed catalog buff, enabled or not. `startSec` is clamped to [0, 600] and `durationSec` to [1, 600] (`SETUP_LIMITS`); a missing or non-number value takes the catalog default. Entries for other ids are dropped: a stored stage 1.5 config's Destruction Potion and Icon starts disappear on load (item actions now), the buffs stay enabled.
- `distanceYd` is clamped to [0, 100]; NaN or a non-number gives 28.
- `rotation` and `warlock`: each field is checked against its type or union, else its default. `lifeTapBelowMana` is `auto` unless it is a finite number >= 0 (capped at 100000), so `buildPriority` never throws on it.

`applySetup` trusts its config: every UI edit and every storage load goes through `normalizeSetup` first.

### `applySetup` wiring (`src/setup/applySetup.ts`)

`applySetup({ buildSpec, catalog, config })` returns `{ spec, sim: { scheduledAuras, distanceFromTarget } }`. It is pure: the spec from `buildSpec(config.warlock)`, the catalog and the config are never mutated.
- The enabled buffs are folded in CATALOG order. Unknown ids are ignored.
  - `statBonuses` are summed into the spec's flat bonuses.
  - `statMultipliers` are multiplied into a new `setup.statMultipliers` (see "Stacking rule").
  - `modifiers` are appended.
  - `targetAura`, `selfAura` and helper `auras` are appended to `spec.auras`.
  - `hooks` run after the spec's own hook (`composeHooks`, in catalog order: Judgement of Wisdom before the Band).
  - An item `action` (since the item actions) is appended to a new `spec.spells` and bound to the next free item slot (see "Part D: item actions"); its `selfAura` is not scheduled.
- `neutralizeOwnAuras`: with the raid's Curse of the Elements, the own curse multiplies by 1; with `isb-from-others`, the own Shadow Vulnerability multiplies by 1 (rulings S1, S2). The own auras still show (the target panel marks them "(no extra effect)") and keep their curse slot and charges.
- `scheduledAuras`:
  - Each `targetAura` is put on the target at 0 with no duration override. Its own 1 h duration is cut by the end of the fight (ruling S3).
  - Each timed `selfAura` is put on the player at `startSec x 1000` for `durationSec x 1000` ms.
  - A `selfAura` without `timed` (and without an item action) is put on at 0.
  - A start after the fight's end is kept; the engine ignores it.
- `spec.priority = buildPriority(config.rotation, config.distanceYd)`; `distanceFromTarget = config.distanceYd`. Since the item actions the item steps (`buildItemSteps`) come first, and `spec.keybinds` is always a new 16-slot array (see "Part D: item actions").

### Persistence (`src/setup/storage.ts`)

- The setup is saved in `localStorage` under the key `rotation-trainer:setup:v1`.
- Text longer than `SETUP_STORAGE_MAX_CHARS` (100000 UTF-16 code units; a full config is under 1 kB) is ignored before `JSON.parse` and never written.
- `loadSetup`, `saveSetup` and `clearSetup` never throw. Every access is in `try/catch`. A throwing or missing storage, invalid JSON, or deep nesting all give the defaults (load) or `false` (save, clear); the app then keeps the setting in memory.
- Loads and saves both normalize, so storage only ever holds a normalized config.
- A change applies from the next fight: a running fight keeps the setup it was built with (the panel shows a pending note), and a fight that has not started yet is rebuilt at once.

### Simplifications of the setup model

- **Own vs raid debuff:** one effect each, by neutralizing the own aura (rulings S1, S2; "Own vs raid debuff: one effect").
- **Shadow Weaving** is at full stacks (x1.10) from the pull. wowsims ramps it up over the first 6 s.
- **Improved Shadow Bolt from others** has 100% uptime. wowsims uses an uptime percentage.
- **Band of the Eternal Sage** rolls when a damaging spell lands, DoT applications included (Immolate, Corruption, Curse of Agony, Curse of Doom). It never rolls on misses, DoT ticks, Life Tap or Curse of the Elements. wowsims rolls at cast end.
- **Impact-time evaluation (ruling S4):** a missile's hit, crit and damage use the buffs and debuffs at impact. A buff that starts or ends during the 1.4 s flight shows the difference (see "Known difference from wowsims (ruling S4)").
- **No range checks:** the Shadowburn finisher is cast at 28 yd, although its range is 20 yd (24 yd with Destructive Reach; `SD` Shadowburn `MaxRange: 20`).
- **Cooldowns are timed buffs:** each is used once, at its start second; no cooldown is tracked ("Part C: cooldowns and item effects"). *Superseded for Destruction Potion and the Icon (item actions with real cooldowns, "Part D: item actions"); still true for Heroism.*
- **Not modelled:**
  - Super Mana Potion and Dark Rune: actions the player takes, not buffs. *Superseded: item actions ("Part D: item actions"); Dark Rune's health cost is still not modelled.*
  - Improved Divine Spirit's spell power.

### Calibration: the "Raid as in my log" preset (`SETUP_PRESETS['raid-log']`, Task 12)

The preset approximates the author's Naj'entus raid (Warcraft Logs, 2026-10). The raid's exact buffs are unknown: the log shows some of them, and the rest were chosen as the standard buffs that reproduce the character totals. Tests: `tests/setup/raid-log.test.ts`.

**What each entry rests on:**

| Entry | Basis |
|---|---|
| Moonkin Aura, Mana Spring Totem, Judgement of Wisdom | seen in the log (Mana Spring 20 mana per 2 s, Judgement of Wisdom 74 mana per proc) |
| Heroism from 6.4 s, Destruction Potion at 7.5 s, Icon of the Silver Crescent at 30.2 s | seen in the log (start seconds as timed settings; durations 40 / 15 / 20 s, as in the log and the catalog). *Since the item actions only Heroism is timed (6.4 s); the potion and the Icon are enabled as item actions and used by the player (the bot: while Heroism is up). The log's 7.5 s and 30.2 s are no longer in the preset.* |
| Band of the Eternal Sage | seen in the log (procs at 0.8 s and 69.5 s). It is a proc, so it is enabled and never scheduled: its procs in the trainer are random. |
| Rotation `sb-spam` (Curse of Doom, Shadow Bolt, Life Tap, Shadowburn finisher), 28 yd | the log (Part B; travel checkpoint, Part A) |
| Improved Shadow Bolt from others | the design spec's preset list; not measured |
| Arcane Brilliance, Gift of the Wild, Blessing of Kings, Blackened Basilisk | **guessed**: the intellect and spirit totals |
| Wrath of Air Totem, Flask of Pure Death, Superior Wizard Oil (and the Basilisk's +23) | **guessed**: the Life Tap's spell power. Superior rather than Brilliant oil because Brilliant's +14 crit rating would overshoot the header's crit rating. |
| Left out | Prayer of Spirit (spirit would be 222.6, far over 191; so Improved Divine Spirit's spell power, which the engine does not model, plays no part either); Totem of Wrath (nothing shows it; Shadow Bolt crit is already about the log's); Blessing of Wisdom, Misery, Shadow Weaving, the raid's Curse of the Elements, Inspiring Presence (nothing in the log shows them) |

Warlock options: Fel Armor and the Succubus sacrificed (the defaults).

**Checkpoints.** Character header at the pull; Life Tap at 63 s and 99 s, when no timed buff is up (Heroism ended at 46.4 s, the potion at 22.5 s, the Icon at 50.2 s; the Band's buffs were up at 0.8-10.8 s and 69.5-79.5 s).

| Checkpoint | Log | `none` | `raid-log` | Residual and reason |
|---|---|---|---|---|
| Intellect | 593 | 454.65 | 567.1 = (433 + 40 + 18) x 1.05 x 1.1 | -4.4% (26 intellect, about 0.3% crit and 400 mana): see below |
| Spirit | 191 | 137.75 | 191.2 = (145 + 18 + 20) x 0.95 x 1.1 | +0.1% |
| Crit rating | 361 | 339 | 359 = 339 + Moonkin idol 20 | -2. The raid's druid wore the idol, or the gear differs by 22 rating and there was no idol; the log cannot tell. |
| Hit rating | 177 | 196 | 196 | The export's gear has 19 more (15.54% vs 14.03% hit), so the gear is not the raid's. The trainer misses about 1.5 points less often than the log. |
| Haste rating | 45 | 45 | 45 | exact |
| Shadow power (from Life Tap) | about 1592 (1856 = 582 + 0.8 x 1592.5; 1855 gives 1591.25) | 1300 | 1566 = 1117 + 53 + Fel Armor 130 + Wrath of Air 121 + Pure Death 80 + Basilisk 23 + oil 42 | -26.5 |
| Life Tap | 1856, 1855 | 1622 | 1834.8 | -1.1% |
| Shadow Bolt crit at the pull | 37.8% (the design spec's figure from the log) | 30.60% | 37.88% = 24.88 + Moonkin 5 + Backlash 3 + Devastation 5 | Matches. Only the observed Shadow Bolt crit rate fits the header ratings (as a sheet crit, 361 rating + 593 Int + Moonkin gives only about 30%; the design spec's "symulacja: 22,6%" was the sheet crit without talents). Over about 40 Shadow Bolts it carries about +-8 points of noise anyway. The Destruction Potion adds 2% from 7.5 to 22.5 s. |

**Why intellect is 26 short.** An exhaustive search covered every combination of the catalog's intellect, spirit and spell power entries, normalized: 3168 distinct setups. None meets intellect within 3%, spirit within 3% and Life Tap within 2% together.
- The only intellect consumables, Flask of Distilled Wisdom and Elixir of Draenic Wisdom, exclude every flask.
- Without Flask of Pure Death or Flask of Supreme Power, Life Tap stays at or below 1815 (-2.2%).
- The closest intellect-and-spirit match (Kings, Gift of the Wild, Flask of Distilled Wisdom, Basilisk: 596 intellect, 191.2 spirit, no Arcane Brilliance) gives a Life Tap of only 1771 (-4.6%).

The preset keeps the spell power right, because it matters far more for the damage. It leaves the intellect residual, which the gear difference (shown by the hit rating) can explain. The test allows 5% on intellect instead of the plan's 3% and says why.

**Bot results** (seeds 1-10, 28 yd; not asserted, only "more than `none`"):
- `raid-log`: 2305 DPS, with either queue window (400 or 0 ms). *Stage 1.5 (potion at 7.5 s, Icon at 30.2 s scheduled). Since the item actions: 2294.1 with either window; the bot uses the potion and the Icon at the end of the cast in progress when Heroism starts (8.75-8.79 s), so the Icon's 20 s overlap Heroism (the log used it at 30.2 s) and the potion's start is a little later.*
- `none`: 1425 (400 ms) / 1428 (0 ms).
- `raid-log` with the DoT rotation instead: 2250 / 2227.

## Part D: item actions

Item actions and fight settings, Task 2 (2026-10-30; spec `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md`). The engine side (`SpellDef.item`, `sharedCooldown`, `gainManaRange`: no GCD, no cost, no hit roll, no hooks, no five-second rule) is Task 1 (`src/engine/sim.ts`). The data side: `BuffEffect.action` (`src/data/types.ts`), built with `itemAction` (`src/data/common/buffs.ts`).

### The items

| Catalog id | Action id | Effect | Own cooldown | Shared cooldown group | Source | Status |
|---|---|---|---|---|---|---|
| `icon-of-the-silver-crescent` (`warlockItemBuffs`, group `item`) | `use-icon-of-the-silver-crescent` | applies the Icon aura: +155 spell power for 20 s | 120 s | `trinket` 20 s | tbc-new `assets/database/db.json` item 29370 `itemEffects[0]`: `buffId 35163`, `effectDurationMs 20000`, stats 155, `onUse { cooldownMs 120000, categoryId 1141, categoryCooldownMs 20000 }`; Wowhead item=29370 "(2 Min Cooldown)", spell=35163; author's log: 20 s | verified |
| `destruction-potion` (`cooldowns`, group `consumable`) | `use-destruction-potion` | applies the potion aura: +120 spell power and +2% crit (`critPctDelta`, as in stage 1.5) for 15 s | 120 s | `potion` 120 s | db.json consumable 22839: `categoryId 4`, `categoryCooldownDuration 120`, `buffDuration 15`; `sim/core/consumes.go` `makePotionActivationSpellInternal` (own CD 2 min, `SharedCD` on `GetPotionCD()` 2 min); Wowhead item=22839 "(2 Min Cooldown)" | verified |
| `super-mana-potion` (`cooldowns`, group `consumable`) | `use-super-mana-potion` | 1800-3000 mana (`gainManaRange`) | 120 s | `potion` 120 s | db.json consumable 22832: `categoryId 4`, `categoryCooldownDuration 120`, effect 847151 (`spellEffects`: spell 28499, mana, `minEffectSize 1799`, `effectSpread 1201`); wowsims/tbc @ 3301fca `consumes.go` `makePotionActivation`: `1800 + rand x 1200` "Restores 1800 to 3000 mana. (2 Min Cooldown)"; Wowhead item=22832 "Restores 1800 to 3000 mana. (2 Min Cooldown)" | verified |
| `dark-rune` (`cooldowns`, group `consumable`) | `use-dark-rune` | 900-1500 mana (`gainManaRange`); health cost not modelled | 120 s | `rune` 120 s | Wowhead item=20520 Dark Rune (use spell 27869) "Restores 900 to 1500 mana at the cost of 600 to 1000 life. (2 Min Cooldown)"; wowsims/tbc `consumes.go` `makeConjuredActivation` (item 20520: `900 + rand x 600`, conjured cooldown 2 min); tbc-new db.json lists only Demonic Rune 12662 (same tooltip on Wowhead): `categoryId 1153`, `categoryCooldownDuration 120`, effect 694074 (spell 16666, `minEffectSize 899`, `effectSpread 601`), `makeConjuredActivationSpellInternal` (`SharedCD` on the category 1153 timer, 2 min) | verified (Dark Rune's own category id: from Demonic Rune, see below) |

- **Which rune.** The catalog models Dark Rune (item 20520, the rune a raid warlock uses), with the numbers from its Wowhead tooltip and old wowsims/tbc. tbc-new has only Demonic Rune (12662), whose effect, cooldown and category are the same; that its category 1153 also covers Dark Rune is taken from Demonic Rune (the game's runes share it; Wowhead's tooltip API does not give categories and its item pages were not reachable): the trainer has one rune, so this changes nothing. Category 1153 also holds Flame Cap (180 s; out of scope).
- **Mana ranges.** wowsims draws a real number `min + rand x spread` (1799 + [0, 1201), 899 + [0, 601)); the trainer draws one integer in `min..max` inclusive (1800..3000, 900..1500), as the tooltips state. One Rng draw per use, only when used (Task 1), so a setup without these items keeps every draw unchanged. At full mana the gain is capped (logged 0).
- **Shared groups.** Destruction Potion and Super Mana Potion share `potion` 120 s (category 4): one potion per 2 min, the in-fight choice between burst and mana the design spec wants; they are no longer in an exclusive group, both can be enabled. The Icon's `trinket` group (category 1141, 20 s) blocks other on-use trinkets (none in the catalog yet) for 20 s after its use. Dark Rune is alone in `rune`. A shared cooldown never shortens a longer one already running (Task 1).
- **Own cooldowns.** All four 120 s (Wowhead "(2 Min Cooldown)"; for the potions also the group).
- **No health cost.** Dark Rune's 600-1000 health, like Life Tap's, is not simulated: the trainer has no health.
- **Icons.** Each action uses its entry's `icon` and `wowheadId` (the use spell): Icon `inv_trinket_naxxramas06` (35163; the trinket item's own icon is `inv_weapon_shortblade_23`), Destruction Potion `inv_potion_107` (28508), Dark Rune `inv_misc_rune_04` (27869; Wowhead also gives it for Demonic Rune's item; Dark Rune's item icon is `spell_shadow_sealofkings`). Super Mana Potion: `inv_potion_137` from its item (22832; db.json `itemIcons` and the Wowhead item tooltip), because its use spell 28499 "Restore Mana" has the placeholder `classic_temp` on Wowhead, so `npm run icons` (which checks spell ids) will report a mismatch for it until it can look up item icons. The files for `inv_potion_137` and `inv_misc_rune_04` are not committed yet (the UI falls back to the initials tile).
- **School.** An action's `school` is `physical` (an item has no spell school; it only picks the slot's fallback colour). Item data also says `onGcd: false`, `castTimeMs: 0`, `manaCost: 0`, `canMiss: false`, `canCrit: false` (the engine enforces them anyway).

### Setup (`applySetup`)

- Each enabled entry with an `action`, in catalog order, is appended to a new `spec.spells` and bound to the next free slot of the **item row**: `spec.keybinds` is always a new array of `SPELL_SLOT_COUNT + ITEM_SLOT_COUNT` = 12 + 4 slots (`src/data/types.ts`); slots 12-15 are keys Z X C V (`ITEM_SLOT_KEYS`, `src/ui/keys.ts`; `keyToSlot` reads a single letter in either case). The shared `destructionWarlock.keybinds` keeps its 12 slots; with no item enabled slots 12-15 are ''. Catalog order gives Destruction Potion, Super Mana Potion, Dark Rune, then the Icon. The catalog has exactly 4 actions (test), so the row cannot overflow; `applySetup` throws a RangeError if a future catalog ever enabled more.
- The entry's `selfAura` is appended to `spec.auras` (the action's `applyAura` names it) and is never scheduled; the entry has no `timed`. Heroism stays timed.
- `spec.priority` = the item steps (`buildItemSteps`), then `buildPriority(...)`.

### Priority steps (`src/data/classes/warlock/itemRules.ts`)

`buildItemSteps(enabledActionIds, heroismEnabled)` (pure) gives one step per enabled action, in catalog order, at the START of the priority (items are off the GCD):
- **Icon of the Silver Crescent, Destruction Potion:** while Heroism is up (`selfAuras.heroism`) when Heroism is enabled in the setup; otherwise always (at the pull, then whenever the cooldown allows). Both stack with Heroism; using them with it is the common raid practice. UNVERIFIED as optimal: it is guidance.
- **Super Mana Potion:** when max mana - mana >= 3000; **Dark Rune:** when >= 1500. From old wowsims/tbc `consumes.go` `ShouldActivate` (it also subtracts 5 s of mana regen; the trainer leaves that out so the player can follow the rule). Both values are the item's largest gain, so no mana is wasted.
- **The queue gate.** A step is wanted only when no cast is in progress, or nothing is queued yet, or its own item is the queued spell. Reason: a valid item press during a cast with a spell already queued would replace that spell in the one queue slot (Task 1 Decision 1), and the next spell would start late. With the gate the bot uses an item at once between casts (also during the GCD alone, where a queued spell keeps its slot), or queues it in the window before any spell, then it fires at the cast's end and the next spell starts at the bot's next step (10 ms later). A press the engine rejects (cooldown, `busy` outside the window) falls through to the rotation like any rejected step.
- The rules are guidance for the bot and the Priority panel, reasonable rather than optimal: e.g. with Heroism enabled but scheduled after the fight's end the Icon and the potion are never used, and Super Mana Potion may take the shared potion cooldown before Heroism.

### Effect on the bot (seeds 1-10, 28 yd, 60 s, real mana)

- Default setup: unchanged (1425.1766666666667 with the 400 ms queue window, 1428.3350000000003 with 0; golden test).
- DoT rotation with Heroism at 6.4 s: 1717.9 (400 ms) / 1676.8 (0 ms) without items; with Destruction Potion, Dark Rune and the Icon 1763.5 / 1784.3 (`tests/data/item-actions.test.ts` asserts only "more").
- `raid-log`: 2294.1 (both windows), stage 1.5's scheduled items 2305.3 (see "Calibration").
