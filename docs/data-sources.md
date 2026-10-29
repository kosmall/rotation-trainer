# Data sources

Every game number in `src/data` carries a source comment. Status is `verified` (read from the cited source) or `UNVERIFIED` (best value kept, marked `// UNVERIFIED` in code).
Primary source: github.com/wowsims/tbc-new (TBC Anniversary), `master` @ `91f869a` (2026-10-26). Secondary: github.com/wowsims/tbc `master` @ `3301fca`. Wowhead TBC was not needed.

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
