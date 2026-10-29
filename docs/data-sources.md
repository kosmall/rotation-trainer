# Data sources

Every game number in `src/data` carries a source comment. Status is `verified` (read from the cited source) or `UNVERIFIED` (best value kept, marked `// UNVERIFIED` in code).
Primary source: github.com/wowsims/tbc-new (TBC Anniversary), `master` @ `91f869a` (2026-10-26). Secondary: github.com/wowsims/tbc `master` @ `3301fca`. Wowhead TBC was not needed for Tasks 3 and 9; Task 12a cites it where used.

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

Order: tbc-new `ui/sim/talents/trees/warlock.json` `talents[].fieldName` (= `proto/warlock.proto` `WarlockTalents` 1-64). `parseTalentString` + `TALENT_ORDER` in `destruction.ts` read the ranks; every modeled effect is computed from its rank. Effects: tbc-new `sim/warlock/talents.go`.

| Talent | Rank | Effect in the trainer | Source | Status |
|---|---|---|---|---|
| Improved Shadow Bolt | 5/5 | hook: Shadow Bolt crit applies `shadow-vulnerability` | `applyImprovedShadowBolt`, `shadowbolt.go` | verified |
| Cataclysm | 5/5 | `manaCostMult` 0.95 on Destruction spells (Shadow Bolt, Immolate, Incinerate, Conflagrate, Shadowburn) | `applyCataclysm` (`PowerCost_Pct_Add -0.01*rank`, `WarlockDestructionSpells`) | verified |
| Bane | 5/5 | `castTimeMsDelta` -500 on Shadow Bolt and Immolate (Shadow Bolt 2500 ms, Immolate 1500 ms) | `applyBane` (`-100ms*rank`) | verified |
| Devastation | 5/5 | `critPctDelta` +5 on Destruction spells | `applyDevastation` | verified |
| Shadowburn | 1/1 | the spell is available | `applyShadowburn` | verified |
| Ruin | 1/1 | `critMultDelta` +0.5 on Destruction spells (crit x2.0) | `applyRuin` (`CritMultiplier_Flat 1.0`); `sim/core/spell.go` `CritDamageMultiplier`: `(1.5*pct-1)*(1+additive)+1` | verified |
| Emberstorm | 3/5 | fire `damageMult` and `dotDamageMult` x1.06; Incinerate `castTimeMsDelta` -150 (6% of 2500) | `applyEmberstorm`; `SD` Emberstorm rank 3 (17956): damage 6, DoT 6, cast time -6 | verified |
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

No Conflagrate talent in this build: the spell is defined (and bound to a key) per the stage 1 interface, but is not in the priority. Nightfall-style procs are not in the build either (and DoT ticks cannot trigger hooks).

### Priority (shadow Destruction)

Order: Curse of the Elements (when not on the target) > Shadowburn (finisher: fight time left <= Shadow Bolt cast time 2500 ms) > Immolate (left <= its cast time 1500 ms and the fight outlasts cast + 15 s) > Corruption (same rule, 2000 ms + 18 s) > Life Tap (mana < 399, Shadow Bolt's cost) > Shadow Bolt.

| Rule | Source | Status |
|---|---|---|
| Curse first, assigned curse when not active | tbc-new `ui/specs/warlock/dps/apls/destruction.apl.json` group "Cast Curse"; wowsims/tbc `sim/warlock/rotations.go` | verified |
| Curse of the Elements as the warlock's curse | tbc-new DefaultOptions assign Recklessness (raid choice); CoE chosen here as it raises the warlock's own fire and shadow damage; Curse of Doom's single tick at 60 s rarely fits a 60 s fight | UNVERIFIED (choice) |
| Shadowburn only as a finisher (Soul Shard cost) | APL "Should Cast Shadow Burn" (`remainingTime <= spellCastTime(SB) + travel`) | verified (travel time and haste ignored) |
| Immolate refresh | APL "Should Cast Immolate" | verified |
| Corruption | wowsims/tbc `rotations.go` (`Rotation.Corruption && !CorruptionDot.IsActive()`); the tbc-new APL does not cast it; refresh rule copied from Immolate | UNVERIFIED |
| Life Tap when Shadow Bolt is unaffordable | APL: Life Tap is the last action, cast only when nothing else can be | verified (threshold derived) |
| Shadow Bolt filler | APL | verified |

### Open questions

1. Conflagrate is not in the author's build but is defined and on the action bar (stage 1 interface). Remove it from `keybinds` or add a "not learned" flag?
2. Curses are not mutually exclusive in the engine (wowsims `DeactivateOtherCurses`): a player can stack Curse of the Elements with Curse of Doom or Agony. Needs an engine rule (e.g. an aura exclusivity group).
3. Which pet the author sacrifices (Succubus assumed, +15% shadow).
4. Incinerate's bonus 111-128 base damage while Immolate is up (`incinerate.go`) needs conditional damage in `SpellDef`.
5. Curse of the Elements' -88 resistances and Shadowburn's binary resist are not modeled (fixed level-based resist multiplier).
6. Fel Armor is assumed up all fight (stat bonus, not a castable buff).
