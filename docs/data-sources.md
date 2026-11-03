# Data sources

Every game number in `src/data` carries a source comment. Status is `verified` (read from the cited source) or `UNVERIFIED` (best value kept, marked `// UNVERIFIED` in code).
Primary source: github.com/wowsims/tbc-new (TBC Anniversary), `master` @ `91f869a` (2026-10-26). Secondary: github.com/wowsims/tbc `master` @ `3301fca`. Wowhead TBC was not needed for Tasks 3 and 9; Task 12a cites it where used.

## What the DPS excludes

The trainer's DPS is approximate: it scores the rotation, not the whole raid setting. The UI says so in one line under the live stats and in the end summary. Details are in the sections cited.

Not in the number:

- Raid buffs and consumables unless enabled in the setup (stage 1.5 Part C, all off by default): no party/raid buffs, flasks, elixirs, food, oils, potions, Heroism or debuffs in the default run. The "Raid as in my log" preset enables an approximation of the author's raid, several of whose buffs are guesses (see "Part C: setup rules and calibration").
- Item actions unless enabled in the setup and used: since the item actions (see "Part D: item actions"), Icon of the Silver Crescent (+155 spell damage for 20 s), Destruction Potion, Super Mana Potion and Dark Rune are pressed from the item row (Z X C V B N since "Part F: gear item effects"; the Icon only while worn) by the player or the bot; enabling them alone adds nothing. Dark Rune's health cost (600-1000) is not simulated, like Life Tap's. Improved Divine Spirit's spell power (10% of spirit) is not modelled (see "Part C: raid, party and individual buffs"). (Stage 1.5 left Super Mana Potion and Dark Rune out and scheduled the potion and the Icon at a set second: superseded.)
- Gear effects the trainer does not model (stage 2a, see "Part E: gear"): on-use and proc effects of items other than the Icon and the Band (e.g. The Lightning Capacitor, Quagmirran's Eye, Sextant of Unstable Currents), meta gem effects other than Chaotic Skyfire's crit damage, and the set bonuses in `UNMODELLED_SETS` (Corruptor Raiment 2pc and 4pc, Wrath of Spellfire 3pc and others). The Gear panel lists the ones the worn gear has.
- Item effects unless enabled in the setup: Band of the Eternal Sage's proc (+95 spell damage for 10 s, 10% chance, 60 s internal cooldown) is modelled since stage 1.5 Task 8 as an optional setup entry, off by default (see "Part C: cooldowns and item effects"); Riding Crop has no combat effect. *Since "Part F: gear item effects": every worn item's plain on-use, proc and pre-pull stat buff is an optional setup entry derived from the gear (off by default); the effects the trainer does not model are listed in the Setup panel ("Not modelled effects of your gear").*
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
- Every `SpellDef` and `AuraDef` carries `wowheadId` (the TBC spell id, same ids as the data comments). For each id the script asks `https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5&locale=0` for the real icon name, compares it with the `icon` in the data (mismatch = report + exit 1; it never edits source files) and downloads `https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg`. All 11 icon names that were first written from memory matched Wowhead. Since the item actions the script also walks the setup catalog's item actions (`effect.action`), and for a spell whose Wowhead tooltip has only the placeholder icon `classic_temp` it reads the icon from the item tooltip instead (`ICON_FROM_ITEM`: Super Mana Potion's spell 28499 -> item 22832); it never saves a placeholder (see "Part D: item actions", Icons).
- `tests/data/icons.test.ts` checks (offline) that every spell/aura has a `wowheadId` and that its file is committed; `tests/ui/icons.test.tsx` checks the UI wiring and the fallback to the initials tile when a file is missing.
- Item, gem and enchant icons (stage 2a): the same script also downloads every distinct `icon` of the item database into `public/icons/items/<icon>.jpg` (no tooltip call: the names come from wowsims db.json). See "Part E: gear", Icons.
- Talent icons (stage 2b): the same script also downloads every distinct `icon` of the talent tree into `public/icons/talents/<icon>.jpg` (no tooltip call: `npm run talents:build` took the names from Wowhead's tooltip API). See "Part I: talents", Icons.

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
4. Band of the Eternal Sage and Icon of the Silver Crescent: resolved in stage 1.5 Task 8 (the Band as a hook with a hidden internal-cooldown aura, the Icon as a timed buff, not a castable item); see "Part C: cooldowns and item effects". *Superseded for the Icon (2026-10-30): it is an item action the player uses from the item bar; see "Part D: item actions".*

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

Rules: the order is curse > Shadowburn (finisher) > Immolate > Corruption > Life Tap > Shadow Bolt, and disabled steps are left out (`curse: 'none'` has no curse step). Every rule is the one in "Priority (shadow Destruction)" above. The curse step is wanted while its own aura is not on the target. Another curse on the target does not count, because casting this one replaces it. Curse of Doom's 60 s cooldown makes the engine reject a second cast, so it needs no extra condition. *Superseded with the configurable fight length (2026-10-30, item actions and fight settings Task 3): in a fight longer than 60 s a recast near the end could never tick, so the Curse of Doom step is also only wanted while the remaining fight is at least the curse's 60 s (`>=`: a tick at exactly the end counts, R6). In a 60 s fight this changes nothing (only the cast at the pull fits).* A number for `lifeTapBelowMana` replaces Shadow Bolt's cost as the Life Tap threshold. `distanceYd` changes only the finisher window: Shadow Bolt's unhasted cast (2500 ms) + its flight (`projectileTravelMs`; 1400 ms at 28 yd, 0 at 0 yd or for a negative or non-finite distance).

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
- **Cooldowns are not modelled as cooldowns.** Heroism (10 min, plus Exhaustion), the potion (2 min shared potion cooldown) and the Icon (2 min, plus the 20 s shared trinket category) can each be used once in a 60 s fight, so each is one timed buff and its cooldown only matters for a re-use the fight never needs. The setup can still move or shorten them (Task 9: `startSec` 0-600, `durationSec` 1-600). *Superseded for the potion and the Icon: item actions with their own and shared cooldowns ("Part D: item actions"). Still true for Heroism: its 10 min cooldown allows one use in any fight up to the 600 s maximum length (Task 3).*
- **Heroism** is one entry for Heroism (Alliance, the author's log) and Bloodlust (Horde): identical effect. The aura is not hidden; its haste goes through `computeStats` (Task 5 formula).
- **Destruction Potion's crit** is a percentage modifier on every spell (as Moonkin Aura), identical to wowsims' 44.153846 crit rating (2.000%); it does not show in `critRating` or `computeStats(...).critPct`. `exclusiveGroup: 'potion'`: one potion per fight (the only potion in the catalog for now). *Superseded: no exclusive group; the shared 2 min `potion` cooldown with Super Mana Potion decides in the fight.*
- **No double counting with the gear.** Both items are in the default gear (`destructionEquipped`: Icon 29370, Band 29305) and their equip stats are already in `setup.stats` (Icon +43 spell damage; Band +25 intellect, +34 spell damage, +24 crit rating; see "Items"). The catalog entries carry only the use / proc buff (+155, +95), no `statBonuses` (test).
- **Band proc.** `effect.auras` holds two helper auras (Task 9 appends them to `spec.auras`): `band-of-the-eternal-sage` (10 s, +95 spell power, visible) and `band-of-the-eternal-sage-icd` (60 s, `hidden`). The hook (run after every resolved spell; DoT ticks never call hooks) returns for a miss or a spell not in `BAND_PROC_SPELL_IDS`, then returns while the ICD aura is up, and only then calls `api.roll()`; a roll under 0.1 applies the ICD aura, then the buff. So no random draw happens while the Band is on cooldown, and a setup without the Band never composes the hook and keeps every draw (and every stage 1 result) unchanged.
- **Which spells proc the Band:** `BAND_PROC_SPELL_IDS` is derived from the warlock data: spells with a direct part or applying a DoT (Shadow Bolt, Immolate, Corruption, Curse of Agony, Curse of Doom, Conflagrate, Shadowburn, Incinerate). Life Tap and Curse of the Elements never roll: the tooltip says "offensive spells ... on hit", Life Tap does not target the enemy and Curse of the Elements deals no damage. Deviation from wowsims: there the proc rolls at cast end (`CallbackOnCastComplete`) for any `ProcMaskSpellDamage` cast, misses and Life Tap included (`lifetap.go` has `ProcMaskSpellDamage`); the trainer rolls when the spell lands (ruling S4) and only for a landed damaging spell, as the tooltip reads. A miss chance of about 1.5% (default gear, 15.54% hit against 17%) and few Life Taps in a 60 s fight make the difference small; it is mostly a different moment (impact instead of cast end) and RNG order.
- **ICD from the proc.** wowsims starts the ICD when it procs (`icd.Use` right before the handler); the trainer applies the ICD aura in the same step. The buff lasts 10 s, so a proc never refreshes a running buff (the ICD is 60 s).


## Part C: setup rules and calibration

Stage 1.5 Tasks 9-12. Files: `src/setup/{types,defaults,applySetup,storage,presets}.ts`, the panel `src/ui/SetupPanel.tsx`, the wiring in `src/ui/GameView.tsx` and `src/ui/useSimulation.ts`.

### Setup config and `normalizeSetup` (`src/setup/defaults.ts`)

`SetupConfig = { version: 1, enabledBuffs, timed, rotation, distanceYd, warlock, fightDurationSec }` (`fightDurationSec` since the item actions and fight settings, Task 3). `SETUP_CATALOG` lists every buff in a fixed order: `commonBuffs`, `consumables`, `debuffs`, `cooldowns` (`src/data/common/buffs.ts`), then `warlockItemBuffs` (`src/data/classes/warlock/buffs.ts`). `DEFAULT_SETUP` has no buff enabled, the DoT rotation, 28 yd, Fel Armor and the Succubus sacrificed, and every timed buff at its catalog start and duration (since the item actions: Heroism only). With it `applySetup` reproduces the stage 1 spec (plus an empty item row in `keybinds`) and the Part B bot means exactly (golden test in `tests/setup/applySetup.test.ts`).

`normalizeSetup(input, catalog)` turns untrusted data (storage, a preset, a UI edit) into a valid config. It never throws, never mutates `input`, reads own properties only, and a hostile getter or proxy gives the defaults.
- A value that is not a plain object, or has a `version` other than 1, gives the defaults.
- `enabledBuffs`: catalog ids only (non-strings, unknown ids and duplicates are dropped). In an exclusive group, and for the `EXCLUDES` pairs (a flask vs the battle and guardian elixirs, both ways), the buff later in the list wins.
- `timed`: one entry per timed catalog buff, enabled or not. `startSec` is clamped to [0, 600] and `durationSec` to [1, 600] (`SETUP_LIMITS`); a missing or non-number value takes the catalog default. Entries for other ids are dropped: a stored stage 1.5 config's Destruction Potion and Icon starts disappear on load (item actions now), the buffs stay enabled.
- `distanceYd` is clamped to [0, 100]; NaN or a non-number gives 28.
- `fightDurationSec` (fight length, item actions and fight settings Task 3; design spec §3): clamped to [10, 600] (`SETUP_LIMITS.fightDurationSec`) and rounded to whole seconds (90.7 gives 91); missing, not a number, NaN or ±Infinity gives 60, the stage 1 fight. A config stored before the field existed loads with 60 (no version bump). Both presets keep 60 s (`raid-log` keeps Heroism at 6.4 s). A Heroism start at or after the chosen length gets the panel's warning and never applies.
- `rotation` and `warlock`: each field is checked against its type or union, else its default. `lifeTapBelowMana` is `auto` unless it is a finite number >= 0 (capped at 100000), so `buildPriority` never throws on it.

`applySetup` trusts its config: every UI edit and every storage load goes through `normalizeSetup` first.

### `applySetup` wiring (`src/setup/applySetup.ts`)

`applySetup({ buildSpec, catalog, config })` returns `{ spec, sim: { scheduledAuras, distanceFromTarget, durationMs } }` (`durationMs = fightDurationSec x 1000`; `useSimulation` builds each fight with it, and every UI text about the fight's length reads the snapshot's `durationMs`, except the Setup panel's Heroism-start warning, which uses the chosen length of the next fight). It is pure: the spec from `buildSpec(config.warlock)`, the catalog and the config are never mutated.
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
- `raid-log`: 2305 DPS, with either queue window (400 or 0 ms). *Stage 1.5 (potion at 7.5 s, Icon at 30.2 s scheduled). Since the item actions: 2294.1 with either window (within seed noise: forcing the Icon back to about 31 s gives about 2300, per-seed DPS ranges from 1846 to 2603); the bot uses the potion and the Icon at the end of the cast in progress when Heroism starts (8.75-8.79 s), so the Icon's 20 s overlap Heroism (the log used it at 30.2 s) and the potion's start is a little later.*
- `none`: 1425 (400 ms) / 1428 (0 ms).
- `raid-log` with the DoT rotation instead: 2250 / 2227.

## Part D: item actions

Item actions and fight settings, Tasks 2-5 (2026-10-30; spec `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md`). The engine side (`SpellDef.item`, `sharedCooldown`, `gainManaRange`: no GCD, no cost, no hit roll, no hooks, no five-second rule) is Task 1 (`src/engine/sim.ts`). The data side: `BuffEffect.action` (`src/data/types.ts`), built with `itemAction` (`src/data/common/buffs.ts`).

### The items

| Catalog id | Action id | Effect | Own cooldown | Shared cooldown group | Source | Status |
|---|---|---|---|---|---|---|
| `icon-of-the-silver-crescent` (`warlockItemBuffs`, group `item`) | `use-icon-of-the-silver-crescent` | applies the Icon aura: +155 spell power for 20 s | 120 s | `trinket` 20 s | tbc-new `assets/database/db.json` item 29370 `itemEffects[0]`: `buffId 35163`, `effectDurationMs 20000`, stats 155, `onUse { cooldownMs 120000, categoryId 1141, categoryCooldownMs 20000 }`; Wowhead item=29370 "(2 Min Cooldown)", spell=35163; author's log: 20 s | verified |
| `destruction-potion` (`cooldowns`, group `consumable`) | `use-destruction-potion` | applies the potion aura: +120 spell power and +2% crit (`critPctDelta`, as in stage 1.5) for 15 s | 120 s | `potion` 120 s | db.json consumable 22839: `categoryId 4`, `categoryCooldownDuration 120`, `buffDuration 15`; `sim/core/consumes.go` `makePotionActivationSpellInternal` (own CD 2 min, `SharedCD` on `GetPotionCD()` 2 min); Wowhead item=22839 "(2 Min Cooldown)" | verified |
| `super-mana-potion` (`cooldowns`, group `consumable`) | `use-super-mana-potion` | 1800-3000 mana (`gainManaRange`) | 120 s | `potion` 120 s | db.json consumable 22832: `categoryId 4`, `categoryCooldownDuration 120`, effect 847151 (`spellEffects`: spell 28499, mana, `minEffectSize 1799`, `effectSpread 1201`); wowsims/tbc @ 3301fca `consumes.go` `makePotionActivation`: `1800 + rand x 1200` "Restores 1800 to 3000 mana. (2 Min Cooldown)"; Wowhead item=22832 "Restores 1800 to 3000 mana. (2 Min Cooldown)" | verified |
| `dark-rune` (`cooldowns`, group `consumable`) | `use-dark-rune` | 900-1500 mana (`gainManaRange`); health cost not modelled | 120 s | `rune` 120 s | Wowhead item=20520 Dark Rune (use spell 27869) "Restores 900 to 1500 mana at the cost of 600 to 1000 life. (2 Min Cooldown)"; wowsims/tbc `consumes.go` `makeConjuredActivation` (item 20520: `900 + rand x 600`, conjured cooldown 2 min); tbc-new db.json lists only Demonic Rune 12662 (same tooltip on Wowhead): `categoryId 1153`, `categoryCooldownDuration 120`, effect 694074 (spell 16666, `minEffectSize 899`, `effectSpread 601`), `makeConjuredActivationSpellInternal` (`SharedCD` on the category 1153 timer, 2 min) | verified (Dark Rune's own category id: from Demonic Rune, see below) |

- **Which rune.** The catalog models Dark Rune (item 20520, the rune a raid warlock uses), with the numbers from its Wowhead tooltip and old wowsims/tbc. tbc-new has only Demonic Rune (12662), whose effect, cooldown and category are the same; that its category 1153 also covers Dark Rune is inferred, not read from a Dark Rune record: tbc-new puts Demonic Rune, Flame Cap and Master Healthstone in 1153, and old wowsims/tbc puts Dark Rune, Flame Cap and Healthstone on one shared conjured timer, separate from potions (so the separate `rune` group is well supported; the game's runes share it; Wowhead's tooltip API does not give categories and its item pages were not reachable): the trainer has one rune, so this changes nothing. Category 1153 also holds Flame Cap (180 s; out of scope).
- **Mana ranges.** wowsims draws a real number `min + rand x spread` (1799 + [0, 1201), 899 + [0, 601)); the trainer draws one integer in `min..max` inclusive (1800..3000, 900..1500), as the tooltips state. One Rng draw per use, only when used (Task 1), so a setup without these items keeps every draw unchanged. At full mana the gain is capped (logged 0).
- **Shared groups.** Destruction Potion and Super Mana Potion share `potion` 120 s (category 4): one potion per 2 min, the in-fight choice between burst and mana the design spec wants; they are no longer in an exclusive group, both can be enabled. The Icon's `trinket` group (category 1141, 20 s) blocks other on-use trinkets (none in the catalog yet) for 20 s after its use. Dark Rune is alone in `rune`. A shared cooldown never shortens a longer one already running (Task 1).
- **Own cooldowns.** All four 120 s (Wowhead "(2 Min Cooldown)"; for the potions also the group).
- **No health cost.** Dark Rune's 600-1000 health, like Life Tap's, is not simulated: the trainer has no health.
- **Icons.** Each action uses its entry's `icon` and `wowheadId` (the use spell): Icon `inv_trinket_naxxramas06` (35163; the trinket item's own icon is `inv_weapon_shortblade_23`), Destruction Potion `inv_potion_107` (28508), Dark Rune `inv_misc_rune_04` (27869; Wowhead also gives it for Demonic Rune's item; Dark Rune's item icon is `spell_shadow_sealofkings`). Super Mana Potion: `inv_potion_137` from its item (22832; db.json `itemIcons` and the Wowhead item tooltip), because its use spell 28499 "Restore Mana" has the placeholder `classic_temp` on Wowhead: `npm run icons` reads that one icon from the item tooltip (`ICON_FROM_ITEM` in `scripts/fetch-icons.mjs`, spell 28499 -> item 22832) and refuses to save a `classic_temp` placeholder. The script also checks the item actions (`effect.action`). `inv_potion_137.jpg` and `inv_misc_rune_04.jpg` are committed.
- **School.** An action's `school` is `physical` (an item has no spell school; it only picks the slot's fallback colour). Item data also says `onGcd: false`, `castTimeMs: 0`, `manaCost: 0`, `canMiss: false`, `canCrit: false` (the engine enforces them anyway).

### Setup (`applySetup`)

- Each enabled entry with an `action`, in catalog order, is appended to a new `spec.spells` and bound to the next free slot of the **item row**: `spec.keybinds` is always a new array of `SPELL_SLOT_COUNT + ITEM_SLOT_COUNT` = 12 + 4 slots (`src/data/types.ts`); slots 12-15 are keys Z X C V (`ITEM_SLOT_KEYS`, `src/ui/keys.ts`; `keyToSlot` reads a single letter in either case). The shared `destructionWarlock.keybinds` keeps its 12 slots; with no item enabled slots 12-15 are ''. Catalog order gives Destruction Potion, Super Mana Potion, Dark Rune, then the Icon. The catalog has exactly 4 actions (test), so the row cannot overflow; `applySetup` throws a RangeError if a future catalog ever enabled more. *Superseded by "Part F: gear item effects": 12 + 6 slots (Z X C V B N, slots 12-17); the Icon comes from the worn gear; an action past the 6th is left out (no RangeError) and the Setup panel warns.*
- The entry's `selfAura` is appended to `spec.auras` (the action's `applyAura` names it) and is never scheduled; the entry has no `timed`. Heroism stays timed.
- `spec.priority` = the item steps (`buildItemSteps`), then `buildPriority(...)`.

### Priority steps (`src/data/classes/warlock/itemRules.ts`)

*Since "Part H: simulator and item-use rules" these are the DEFAULT rules (`DEFAULT_ITEM_USE`); the setup can change them per item (`RotationConfig.itemUse`).* `buildItemSteps(enabledActionIds, heroismEndMs)` (pure) gives one step per enabled action, in catalog order, at the START of the priority (items are off the GCD). `heroismEndMs` is Heroism's scheduled start + duration in ms of fight time; `applySetup` passes null when Heroism is disabled, or when it starts at or after the fight's end (it never comes up, so the items do not wait for it).
- **Icon of the Silver Crescent, Destruction Potion:** with Heroism in the fight, while Heroism is up (`selfAuras.heroism`) OR once it is over (`nowMs >= heroismEndMs`): used with Heroism, then again whenever the 120 s cooldown allows (a 300 s fight with Heroism at 6.4 s uses each three times, about 120 s apart). Without Heroism always (at the pull, then whenever the cooldown allows). Both stack with Heroism; using them with it is the common raid practice. UNVERIFIED as optimal: it is guidance. (Task 2 had "only while Heroism is up", so in fights longer than one cooldown they were used once; changed in Task 3 with the fight length.)
- **Super Mana Potion:** when max mana - mana >= 3000; **Dark Rune:** when >= 1500. From old wowsims/tbc `consumes.go` `ShouldActivate` (it also subtracts 5 s of mana regen; the trainer leaves that out so the player can follow the rule). Both values are the item's largest gain, so no mana is wasted.
- **The queue gate.** A step is wanted only when no cast is in progress, or nothing is queued yet, or its own item is the queued spell. Reason: a valid item press during a cast with a spell already queued would replace that spell in the one queue slot (Task 1 Decision 1), and the next spell would start late. With the gate the bot uses an item at once between casts (also during the GCD alone, where a queued spell keeps its slot), or queues it in the window before any spell, then it fires at the cast's end and the next spell starts at the bot's next step (10 ms later). A press the engine rejects (cooldown, `busy` outside the window) falls through to the rotation like any rejected step.
- The rules are guidance for the bot and the Priority panel, reasonable rather than optimal: e.g. Super Mana Potion may take the shared potion cooldown before Heroism, and after Heroism the Icon is used as soon as it is ready rather than saved for a later burst. (Task 2's case "Heroism enabled but scheduled after the fight's end: the Icon and the potion are never used" no longer happens: such a Heroism counts as not enabled.)

### Effect on the bot (seeds 1-10, 28 yd, 60 s, real mana)

- Default setup: unchanged (1425.1766666666667 with the 400 ms queue window, 1428.3350000000003 with 0; golden test).
- DoT rotation with Heroism at 6.4 s: 1717.9 (400 ms) / 1676.8 (0 ms) without items; with Destruction Potion, Dark Rune and the Icon 1763.5 / 1784.3 (`tests/data/item-actions.test.ts` asserts only "more").
- `raid-log`: 2294.1 (both windows), stage 1.5's scheduled items 2305.3 (see "Calibration").
- Long fights: Curse of Doom is only wanted while the fight still lasts its 60 s (its single tick), so a 90 s fight casts it once and a 300 s fight four times. With Destruction Potion and Super Mana Potion both enabled the bot takes the Destruction Potion at every ready moment (shared potion cooldown) and never the Super Mana Potion: the rules are guidance, not an optimizer.
- After the Task 3 rule change ("Heroism up OR over") every 60 s number above is unchanged (re-measured: in 60 s the second use would come at about 129 s). With `fightDurationSec` 300, `raid-log` goes from 1800.8 to 1815.8 (400 ms) and from 1793.8 to 1811.3 (0 ms): the Icon and the potion are used again at about 129 s and 249 s.

### Using an item in the fight (engine and player)

- An item action is instant and off the GCD: it never starts or waits for the GCD, costs no mana, never starts the five-second rule, never rolls the hit table, launches no missile and never runs hooks (so Judgement of Wisdom and the Band never proc from it). Its log is `cast-complete`, then `mana` (a mana item), then `aura-apply` (a buff item; ruling F-1), with no `cast-start`.
- **Busy and the queue (design spec §2.4, a simplification).** A cast in progress blocks an item exactly as it blocks an off-GCD instant: outside the spell queue window (400 ms before the cast ends) the press is rejected `busy` (the slot flashes "Busy"); inside it the item is queued and used at the cast's end, without a GCD. The GCD alone never blocks it: during the GCD with no cast the item is used at once and a spell already queued for the GCD's end keeps its place. Items share the one queue slot with spells: an item pressed in the window replaces a queued spell (`queue-drop` `replaced`) and a later spell press replaces a queued item. `Esc` cancels the cast and clears the queue (a queued item too); a used item is never undone. The player uses items between casts.
- A press of an item in `ready` starts the fight like a cast (R13); a rejected one leaves it unstarted. A queued item at the fight's end is dropped silently, like a spell.
- Rejections: `cooldown` (own or shared; the slot flashes "Cooldown"), `busy`. The snapshot's `cooldownRemainingMs[id]` is the larger of the item's own and its group's cooldown (one ready-time map; a group cooldown only ever pushes a ready time later).

### Item bar (UI, Task 4)

- A second row "Items" (`role="group"`, `aria-label="Item bar"`) under the spell row with only the bound item slots, keys Z X C V (`ITEM_SLOT_KEYS`; either case; never while typing in a text-like field, rulings S5). No item enabled: no row. Slots are as large as spell slots (same 12-column grid, 6 on phones). *Since "Part F: gear item effects": 6 slots, keys Z X C V B N.*
- The enabled actions fill Z X C V in catalog order (Destruction Potion, Super Mana Potion, Dark Rune, Icon); the Setup panel shows "Item bar: Z" (etc.) under each enabled item, computed by the same rule as `applySetup` (a UI test pins them together). *Since "Part F: gear item effects": 6 slots Z X C V B N, the label reads "Item row: Z"; see "Setup panel and item row (Task 3)" there.*
- Tooltip: the name, "Item · off the GCD" and the catalog description. Cooldown text: the larger of own and shared cooldown, "2m" from 100 s, else seconds (ruling F-3: a 4-character "118s" overflowed a slot). The item's buff shows in the "Your buffs" panel under the item's name (e.g. "Destruction Potion 15s", "Icon of the Silver Crescent 20s"; see "Player buffs panel (UI)").
- The Setup panel lists the item actions (the potions and the rune moved from Consumables) and the Band in "Items and cooldowns"; Heroism moved to the "Fight" group.

### Fight length (Tasks 3-4)

- `SetupConfig.fightDurationSec`: whole seconds, 10-600, default 60 (normalize rules in "Setup config and `normalizeSetup`"); `applySetup` returns `durationMs`, `useSimulation` builds each fight with it. The panel's "Fight" group has "Fight length (s)" and Heroism / Bloodlust (checkbox, "Start (s)", "Duration (s)"; warning "Starts after the fight ends (N s): no effect." when the start is at or after the chosen length). A change applies from the next fight; a fight not yet started takes it at once.
- Presets keep the player's chosen length; "Reset to defaults" sets 60 s (ruling F-2). Preset matching ignores the length.
- Everything reads the fight's `durationMs`: the regen ticks (scheduled for the whole fight), scheduled auras (a start at or after the end is ignored, a duration past the end is cut), the "Time" label and the end summary, the aura time shown (clamped to the fight's end, ruling S3), the DoT refresh and Shadowburn finisher rules (remaining fight time) and the item rules (Heroism's end).
- Long fights: Curse of Doom only while at least 60 s remain (Part B, superseded note); Heroism's 10 min cooldown allows one use in any fight up to 600 s, so it stays one timed buff; the Icon and the potions are used again whenever their 120 s cooldowns allow (with Heroism: after it). A 600 s bot fight runs in about 0.4 s. The "Raid as in my log" calibration stays a 60 s one (the preset inherits 60 s).
- Determinism (final review, Task 5): the same setup and seed give byte-identical logs twice, and a replay of the bot's presses gives the same log and snapshot with one jump per press and with 70 ms or 7 ms steps (all four items and Heroism at 15 s, fights of 45 s and 137 s); the default setup's golden bot means are unchanged (1425.1766666666667 / 1428.3350000000003).

### Player buffs panel (UI)

UI only: no engine, data or setup change, no new game number. Plan `docs/superpowers/plans/2026-10-30-player-buffs-panel.md`, spec `docs/superpowers/specs/2026-10-30-player-buffs-panel-design.md`.

- "Your buffs" (`src/ui/PlayerBuffsPanel.tsx`, view model `src/ui/buffsView.ts`) replaces the small "Buffs" chip list; it sits in the player box under the action bar and the item row, so the bars never move while buffs come and go. The target debuff list is unchanged.
- Sources, all from the running (or ended) fight, never the pending setup: active = `snapshot.selfAuras` (hidden auras such as the Band's internal cooldown are never in it); upcoming = the fight's own `AppliedSetup.sim.scheduledAuras` (`on: 'self'`, kept by the engine's rule: floored, at least 0, not after the fight's end), `atMs > nowMs` while running, every planned entry before the start (the ready snapshot does not hold the at-0 auras yet), none after the end; an entry starting exactly at the fight's end (the Setup panel's "no effect" warning; the engine applies it as the fight ends) is never upcoming and not shown in the ended fight; setup buffs = the fight's enabled catalog entries with no `timed`, `action`, `selfAura`, `targetAura`, helper `auras` or `hooks` (stat-only: raid, party and individual buffs, flasks, elixirs, food, oils).
- Names: the catalog entry's name when the aura comes from one (so the Icon's aura reads "Icon of the Silver Crescent", Heroism "Heroism / Bloodlust"), else the aura's name. Time left is clamped to the fight's end; one decimal below 10 s ("4.3s", rounded up), else `remainingText`; the label reads "Name, N seconds left" (whole seconds rounded up). Expiring below 5 s: bold warn-coloured time, warn bar and a pulsing icon (no pulse under `prefers-reduced-motion`, none after the end).
- The bar's total is the largest time left seen since the aura was (re)applied (`nextTotals`; the engine does not report an application's full duration). An aura that applied between two frames starts its bar up to one frame (~16 ms, at most 100 ms on a slow frame) short of full; a refresh shorter than the time still left would not restart the bar (no such refresh in the data).
- Rebuilt once per snapshot (`useMemo` on the snapshot and the fight): no timer or interval of its own (a UI test checks `vi.getTimerCount`).

### Known simplifications (item actions and fight settings)

- An item cannot be used during a cast (busy, or queued in the window; see above).
- No health: Dark Rune's 600-1000 health cost (like Life Tap's) is not simulated.
- Mana gains are integers drawn uniformly over the tooltip's range (wowsims draws a real number).
- Dark Rune's shared category is inferred from Demonic Rune (see "Which rune"); the `trinket` group has only the Icon (no other on-use trinket in the catalog).
- An item's buff lasts its fixed duration (Icon 20 s, Destruction Potion 15 s); unlike Heroism, it has no duration setting.
- Heroism's cooldown is not tracked (one use; the longest fight is 600 s).
- The bot's item rules are guidance, not an optimizer: with both potions enabled it always takes the Destruction Potion; after Heroism it uses the Icon as soon as it is ready instead of saving it; after a queued item fires, the next spell starts at the bot's next step (up to 10 ms later).
- The fight length input emits on every keystroke (a not-started fight is rebuilt each time; harmless).

## Part E: gear

Stage 2a (plan `docs/superpowers/plans/2026-10-30-gear-stage-2a.md`, spec `docs/superpowers/specs/2026-10-30-gear-stage-2a-design.md`). Task 1: the item database. Task 2: gear in the setup, socket and meta gem rules, set bonuses. Task 3: gear presets, WowSimsExporter import and wowsims gear export. Task 4: the Gear panel. Task 6: Voidheart Raiment 4pc (DoT extra ticks). Task 5: this summary and the final review. In short:

- Data: wowsims tbc-new (MIT), filtered to what a warlock can wear; Spirit is stat index **16** (not 4).
- Rules: meta gems need their colour requirement and fit only meta sockets; unique items and gems, ring limit categories, a staff empties the off hand; untrusted gear (storage, import) is normalized, never trusted.
- Not modelled: item on-use/proc effects other than the Icon and the Band (*since "Part F: gear item effects": every plain stat buff on use, proc or pre-pull is modelled; the rest is listed*); Corruptor 2pc and 4pc, Wrath of Spellfire 3pc and the other bonuses listed below.
- The default gear (the author's export) gives the stage 1 numbers exactly: bot means 1425.1766666666667 (queue window 400) and 1428.3350000000003 (0).

### Item database (`src/data/items/db.json`)

- Source: github.com/wowsims/tbc-new `master` @ `91f869a`, `assets/database/db.json` (8253 items, 214 gems, 144 enchant entries). wowsims is **MIT licensed** (`LICENSE` in the repo); the generated file records its source in its `source` field.
- Generator: `npm run db:build -- <path to a tbc-new clone>` (`scripts/build-item-db.mjs`). It only reads JSON from the clone (`assets/database/db.json`, `ui/specs/warlock/dps/gear_sets/*.gear.json`) and `.git/HEAD` for the commit id, and never runs its code. Output: `src/data/items/db.json` (committed; one record per line) and `tests/fixtures/wowsims-warlock-gear-sets.json` (a copy of the 9 wowsims warlock gear sets: preraid, t4, t5, t6, za, swp, destro_fire_preraid, destro_fire_t4, blank). The output is deterministic (a second run is byte-identical).
- Size: 359 521 bytes raw, about 57 KB gzip. `tests/data/item-db.test.ts` caps `JSON.stringify(db).length` at 540 000 (about 1.5x the real size). Since the structured item effects ("Part F: gear item effects"): 362 730 bytes raw, 57 287 gzip; the file itself is capped at 380 000 raw and 62 000 gzip.
- Loading: `loadItemDb()` (`src/data/items/db.ts`) imports the JSON with a dynamic `import()`, so Vite emits it as its own chunk (`db-*.js`: 357.50 kB, 56.63 kB gzip in the final build; see "Bundle" below). `itemDbSync()` (`src/data/items/dbSync.ts`, tests and scripts only) imports it statically; app code must not import `dbSync.ts`, or the database lands in the main chunk.

### Mapping (verified)

Enums from tbc-new `proto/common.proto`, checked by hand on Voidheart Crown 28963 (db.json stats `{2: 39, 3: 36, 4: 40, 5: 40, 13: 19, 31: 164}`, sockets `[1, 2]`, socket bonus index 12 = 4; Wowhead TBC: +39 Stamina, +36 Intellect, +40 spell damage, +19 spell crit rating, meta and red sockets, socket bonus +4 spell hit rating), Icon of the Silver Crescent 29370 and Band of the Eternal Sage 29305 (pinned in the test).

| `Stat` index | proto name | `RawStats` |
|---|---|---|
| 3 | StatIntellect | `intellect` |
| 5 | StatSpellDamage | `spellPower` |
| 7 | StatFireDamage | `firePower` |
| 11 | StatShadowDamage | `shadowPower` |
| 12 | StatSpellHitRating | `hitRating` |
| 13 | StatSpellCritRating | `critRating` |
| 14 | StatSpellHasteRating | `hasteRating` |
| 16 | StatSpirit | `spirit` (the plan's "Spirit 4?" was wrong: 4 is StatHealingPower) |
| 35 | StatMP5 | `mp5` |

Dropped (not modelled): stamina 2, healing 4 (equal to or above spell damage on caster items), arcane/frost/holy/nature damage, spell penetration 15, physical and tank stats, armor 31/32, resistances, health/mana 33/34.

- Item stats: `scalingOptions["0"].stats` (every item has only the `"0"` entry). Socket bonus: the 42-entry `socketBonus` array. Gem and enchant stats: their 42-entry `stats` arrays. Negative values are kept (zeros dropped): the only kept item with one is Kreeg's Mug 18425 (Intellect -10, Spirit 15); no gem, enchant or socket bonus has a negative modelled stat. A negative stat alone never makes an item relevant (the filter needs a positive modelled stat).
- Sockets and gem colours: proto `GemColor` (1 meta, 2 red, 3 blue, 4 yellow, 5 green, 6 orange, 7 purple, 8 prismatic); `gemSockets` only uses 1-4.
- Slot (proto `ItemType` 1-14): head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet; rings and trinkets have ONE logical slot `finger` / `trinket` (pickers offer them for finger1/finger2 and trinket1/trinket2: `itemsForSlot(db, slotKey)`, `logicalSlot`); wands `ranged`. Weapons: held-in-off-hand items (`weaponType` 5) `offHand`; staves (`handType` 4) `mainHand` with `twoHand: true` (they also take the off hand: gear validation must clear the off hand, Task 2); main-hand and one-hand daggers and swords `mainHand` (a Warlock cannot dual wield, so never the off hand).
- Sets: `setId` = slug of `setName` (e.g. "Malefic Raiment" -> `malefic-raiment`, the stage 1 `SetBonusDef.setId`); the generator fails if two wowsims set ids share a slug. 52 sets in the database.
- `unique: true` from db.json `unique` (`limitCategory`, e.g. the Band of the Eternal ... rings' shared category, is not kept in the database; Task 2 lists the 21 rings that have one in `RING_LIMIT_CATEGORIES`, below).
- `faction` from db.json `factionRestriction` (proto/ui.proto `FactionRestriction`: 1 Alliance only -> `'alliance'`, 2 Horde only -> `'horde'`; checked on Stormcaller 29155 = 2, Horde only, and Blade of the Archmage 29153 = 1). Kept items: 18 Alliance only, 1 Horde only (Stormcaller, kept by reference). db.json also marks Ashtongue Talisman of Shadows 32493 Alliance only (data as given).
- `requiredProfession` (items, gems, enchants) from db.json, as the proto/common.proto `Profession` id: 1 Alchemy, 3 Enchanting, 4 Engineering, 7 Jewelcrafting, 11 Tailoring are the ones present. Kept items: 29 (16 Tailoring, 6 Engineering, 4 Jewelcrafting, 3 Alchemy); gems: 7 (Jewelcrafting: 33131 Crimson Sun, 33133 Don Julio's Heart, 33134, 33135, 33140, 33143, 33144); enchants: 4 (Enchanting: the ring enchants 2928, 2929, 2930, 2931). The trainer does not check professions (the author has Enchanting and Jewelcrafting).
- `effects`: one short text per wowsims `itemEffects` entry, built from its structured fields only (buff name without the `(spell id)` suffix, modelled stats, stacks, duration, on-use cooldown): "On use: ..." (`onUse`), "Proc: ..." (`proc`/`stackProc`), else "Equip: ...". Unnamed effects read "spell <id>" (e.g. The Lightning Capacitor "Proc: spell 37657"). Effects implemented only in wowsims Go code (meta gem bonuses, set bonuses) are not in db.json. 148 items carry effects; the trainer models none of them except through setup entries (Icon of the Silver Crescent, Band of the Eternal Sage). *Since "Part F: gear item effects": a plain on-use or proc stat buff is a structured `useEffects` / `procEffects` entry instead of a text line (43 items); 106 items keep `effects` text.*

### Filters and counts (items: 1730 kept of 8253)

Warlock equippability is wowsims' `canEquipItem` (`ui/sim/proto/items.ts`) with the Warlock capabilities of `sim/core/character_constants.go` (= `ui/sim/player/classes/capabilities_auto_gen.ts`): cloth armour; daggers, held-in-off-hand items, staves (the only two-hander) and one-hand swords; wands; no dual wield.

| Dropped | Count | Rule |
|---|---|---|
| armour heavier than cloth | 2496 | `armorType` > 1 (necks, rings and trinkets have type 0, backs are all cloth, type 1) |
| class allowlist excludes Warlock | 1777 | `classAllowlist` set and without class 9 |
| no modelled stat | 928 | none of the stats above in the item's or its effects' stats, and not an effect-only item of item level >= 90 |
| weapon type | 646 | axe, fist, mace, polearm, shield, unknown |
| random suffix item | 306 | `randomSuffixOptions`: the stats depend on a suffix stored elsewhere; not supported |
| ranged type other than wand | 273 | bows, guns, crossbows, thrown, idols, librams, totems |
| two-hand weapon other than a staff | 71 | |
| off-hand-only weapon | 17 | `handType` 3 dagger/sword (no dual wield) |
| Horde only | 5 | `factionRestriction` 2: the trainer models a Gnome (Alliance) |
| no item type | 4 | |

- Phase: every db.json item has phase 1-5, so the "phase <= 5" limit drops nothing.
- Always kept: every item referenced by a wowsims warlock gear set or by the author's export (`docs/samples/...`); the generator fails if one is missing or not equippable. Two were kept only for that reason: Riding Crop 25653 (no stat; the author's trinket) and Stormcaller 29155 (Horde only; in a wowsims gear set: its Alliance counterpart is Blade of the Archmage 29153).
- Effect-only items (no stat at all, an `itemEffects` entry, item level >= 90): 11 are kept, e.g. The Lightning Capacitor, Mark of the Champion; 26 kept items have no modelled stat (they carry `effects`).
- Kept items: 1511 with a damage, hit, crit or haste stat; 193 with only Intellect, Spirit or MP5; 26 effect-only. By phase: 1378 / 86 / 109 / 37 / 120.

Gems: all 214 (small; an import may name any of them); 114 have no modelled stat (strength, agility, stamina, defence gems). Meta gems carry their activation rule from tbc-new `sim/core/reforge_optimizer/meta_gem_constraints.go` (copied by hand into the generator: it is Go source, not data): 14 as `metaRequires` minimum counts, 4 as `metaCompare` ("more red than blue": 25897, 25895; "more blue than yellow": 25893, 32640), which `buildSetup` evaluates since Task 2 (below). Meta gem bonuses beyond their stats (e.g. Chaotic Skyfire's +3% crit damage) are code in wowsims, not data: only the author's Chaotic Skyfire is modelled (`items.ts`).

Enchants: 128 records from 144 entries, keyed by effect id (the export's `enchant`). Dropped: 7 shield enchants, 4 scopes (wands take no enchant). Kept: every other enchant (84 without a modelled stat), with `slot` from `type` and `extraSlots` from `extraTypes` (armor kits: chest, hands, legs, feet); 2H weapon enchants carry `twoHandOnly` (staves). Five effect ids appear twice in db.json and are merged into one record with both slots and both names joined by " / ": 963, 2564, 2617, 2648, 2649 (e.g. 2649 "Enchant Bracer - Fortitude / Enchant Boots - Fortitude", wrist + feet).

### Consistency with stage 1

The author's 17 items (`src/data/classes/warlock/items.ts`) have the same name, slot, modelled stats, sockets, socket bonus and set id in the database, and their 9 gems and 10 enchants the same name/colour/stats/meta requirement (enchants: stats); `tests/data/item-db.test.ts` checks it with an explicit allowlist for differences, which is empty.

### Icons

`npm run icons` downloads every distinct icon of the database (697: items, gems and enchants) into `public/icons/items/<icon>.jpg` from `https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg`: 3 concurrent requests, 150 ms pause, 3 attempts with backoff, idempotent (present files are kept), exit 0 only when every icon is present and the folder stays under the 6 000 000-byte budget. All 697 fit: 1 250 183 bytes, so nothing was left out. `tests/data/item-db.test.ts` checks (offline) that every icon is committed.

### Gear in the setup (Task 2)

- `SetupConfig.gear?: (EquippedItem | null)[]` (17 entries, WowSimsExporter slot order, null = empty) and `gearPresetId?: string` (`[a-z0-9-]`, 1-64 characters). **Absent = the author's gear** (`setupGear(config)`, `DEFAULT_GEAR` = `destructionEquipped`): every stage 1.5 config, `DEFAULT_SETUP` and the setup presets `none` / `raid-log` have no `gear`, so they normalize, save and build exactly as before (no version bump).
- Decision (database at load): `normalizeSetup(input, catalog, db?)` stays synchronous. Without the database (it is a lazy chunk) a present `gear` is checked for its shape only (`normalizeGearShape`: 17 entries, positive integer ids, at most 3 gems, malformed parts dropped; a wrong length or a non-array gives the author's gear); with the database, `normalizeGear(gear, db)` checks every id. The caller runs `normalizeGear` once `loadItemDb()` has resolved. `gearNeedsDb(gear)` says whether a gear has anything outside the embedded author tables (`AUTHOR_GEAR_TABLES` = `items.ts`): the author's gear builds without the database, so the first paint does not wait for the chunk.
- `buildDestructionWarlock(options, gear?, db?)`: the gear's setup from `db` (or the author tables without one) through `buildSetup`; without `gear` the setup built at load (the stage 1 spec, shared). The database has no `metaModifiers`: the hand-modelled Chaotic Skyfire modifiers (`metaGemModifiers`, `items.ts`) are added to the database's gem 34220. `applySetup` calls `buildSpec(config.warlock, config.gear)`. Golden (`tests/setup/gear.test.ts`): the author's gear through the database gives the stage 1 setup field for field and the bot means 1425.1766666666667 / 1428.3350000000003.
- Decision (`items.ts`): kept as the embedded copy of the author's 17 items, 9 gems and 10 enchants (the brief's "reduce it to ids" would make the default setup wait for the database chunk); `tests/data/item-db.test.ts` keeps it equal to the database. It also holds `metaGemModifiers` and `MODELLED_ITEM_EFFECTS` (Icon of the Silver Crescent, Band of the Eternal Sage: modelled through the setup catalog, so `describeGear` does not list them).

`normalizeGear(input, db)` rules (never throws, never mutates, idempotent; the earlier slot wins every conflict):

| Input | Result |
|---|---|
| not an array of 17 entries, or a hostile getter | the author's gear (a fresh copy) |
| entry not a plain object, `id` not a positive integer, not in the database, or not fitting the slot (rings/trinkets fit both of their slots) | null |
| staff (`twoHand`) in the main hand | off hand null |
| a second copy of a `unique` item (rings and trinkets included) | null |
| a second ring of one limit category (`RING_LIMIT_CATEGORIES`: 475 Signet Ring of the Bronze Dragonflight, 495 Violet Signet, 497 Band of Eternity; tbc-new db.json `limitCategory`, Wowhead TBC "Unique-Equipped: Band of Eternity (1)") | null |
| `enchant` not in the database, not for the item's slot (`slot` or `extraSlots`: armour kits, Fortitude), or a 2H enchant (`twoHandOnly`) on a non-staff | dropped |
| gem beyond the item's sockets | dropped |
| gem not in the database, not fitting its socket (meta only in a meta socket, nothing else there), or a second `unique` gem | that socket empty (`0`, the WowSimsExporter convention; trailing zeros trimmed) |
| Horde-only item (Stormcaller 29155) | kept; `describeGear` warns (the trainer's character is a Gnome, Alliance). Decision: an import or a wowsims preset keeps working; Task 3 swaps Stormcaller for Blade of the Archmage in the presets |
| profession-only item, gem or enchant | kept, not checked |

Socket and meta gem rules (`src/engine/gear.ts`, ledger carry (a), (b); engine change because `buildSetup` is where gem stats are summed):

- A meta gem fits only a meta socket and a meta socket only a meta gem (`gemFitsSocket`); a misfit gem counts as an empty socket (no stats, no colour, no socket bonus). A prismatic gem fits and matches every coloured socket (tbc-new `sim/core/database.go` `ColorIntersects`; the stage 1 table matched it with nothing).
- A meta gem gives its stats and its modifiers only while its requirement holds: the `metaRequires` minimums and, new, `metaCompare` (strictly more gems of one colour than of another; `GemDef.metaCompare` added to the engine type). Before, its stats always applied. tbc-new `sim/core/database.go` `ItemEquipmentGemAndEnchantStats` skips a disabled meta gem's stats and keeps its colour for the socket bonus; so does `buildSetup` (an inactive meta still fills the meta socket). The author's Chaotic Skyfire is active (2 blue: two purple gems), so the default numbers are unchanged.
- Gem id 0 is an empty socket, not an unknown gem.

`describeGear(gear, db)` (for the Gear panel): `unmodelledEffects` (the items' `effects` texts except the Icon and the Band; *since Part F: every `effects` text, the structured effects being modelled, plus `modelledEffects` and `unboundItemEffects`*; an active meta gem other than Chaotic Skyfire: "its effect beyond its stats is not modelled"), `unmodelledSets` (the worn bonuses of `UNMODELLED_SETS` with the reason; a set worn with 2+ pieces that is in neither list: "set bonuses not reviewed, not modelled", e.g. the PvP sets), `metaActive`, `socketBonuses` (per item with a bonus: active or not) and `warnings` (Horde-only items).

### Set bonuses (Task 2)

`WARLOCK_SET_BONUSES` (`src/data/classes/warlock/sets.ts`) holds every modelled bonus; a spec gets those of the sets its gear wears with 1+ piece (`setBonusesFor`; for the author's gear the stage 1 `warlockSets`, Malefic only, same array, so the set bonus panel lists only worn sets). The proc bonuses' self auras are added to the spec's auras when their set is worn. Sets searched: the setNames of the 9 wowsims warlock gear sets (Voidheart, Corruptor, Malefic, Mana-Etched, Spellstrike, Wrath of Spellfire, Shadow's Embrace) and the other cloth caster sets of the database. Sources: tbc-new @ 91f869a `sim/warlock/items.go` (warlock tiers), `sim/common/tbc/items_sets.go` (cloth sets), Wowhead TBC item-set and spell tooltips.

| Set (Wowhead item-set) | Bonus | Modelled as | Source |
|---|---|---|---|
| Malefic Raiment (670, T6; also the ZA/SWP gear) | 2: heal 70 per Corruption/Immolate tick | listed, no effect (no health) | items.go 38394 |
| | 4: Shadow Bolt and Incinerate +6% | `damageMult` 1.06 | items.go 38393 |
| Voidheart Raiment (645, T4) | 2: 5% on a shadow/fire spell hit that deals damage: +135 shadow damage (Flameshadow 37379) / +135 fire damage (Shadowflame 37378) for 15 s | hook + self aura | items.go (ProcChance 0.05, RequireDamageDealt); Wowhead spell=37379, 37378 |
| | 4: Corruption and Immolate last 3 s longer: one more tick each (Corruption 7 ticks over 21 s, Immolate DoT 6 over 18 s) | `dotExtraTicks` 1 on `corruption`, `immolate` (Task 6, see below) | items.go bonus 4: `SpellMod_DotNumberOfTicks_Flat` IntValue 1, ClassMask Corruption + ImmolateDot ("Improved Corruption and Immolate" 37380); Wowhead spell=37380 "Increases the duration of your Corruption and Immolate abilities by 3 sec." |
| Mana-Etched Regalia (658, D3) | 2: +35 spell hit rating | `statBonuses` | items_sets.go 37607 |
| | 4: 2% on any damaging spell, a miss included: +110 spell damage for 15 s (Insight 37620) | hook + self aura | items_sets.go (ProcChance 0.02, no outcome filter); Wowhead spell=37620 |
| Spellstrike Infusion (559) | 2: 5% when a damaging spell lands: +92 spell damage for 10 s (Lesser Spell Blasting 32108) | hook + self aura | items_sets.go (ProcChance 0.05); tooltip "land": the trainer skips misses (wowsims has no outcome filter) |
| Netherweave Vestments (555) | 2: +23 spell damage; 4: +14 spell crit rating | `statBonuses` | items_sets.go; Wowhead item-set=555 |
| Imbued Netherweave (556) | 3: +28 spell crit rating | `statBonuses` | items_sets.go |
| Soulcloth Embrace (557) | 3: +16 spell hit rating | `statBonuses` | items_sets.go; Wowhead item-set=557 |

The procs roll in the hook after a resolved spell (the trainer's hooks run when a spell lands, wowsims rolls on its hit callback; DoT ticks run no hook, as in wowsims, whose periodic damage is a separate callback). "Damaging spells" are those of the Band of the Eternal Sage (`BAND_PROC_SPELL_IDS`: a direct part or a DoT; never Life Tap or Curse of the Elements). No proc has an internal cooldown (wowsims sets none).

Not modelled (`UNMODELLED_SETS`, listed by `describeGear` when worn):

| Set | Bonus | Why |
|---|---|---|
| Corruptor Raiment (2) | pet healed for 15% of damage | no pet |
| Corruptor Raiment (4) | each landed Shadow Bolt multiplies the running Corruption's base tick damage by 1.1 (Incinerate: Immolate) | the engine cannot change a DoT already on the target. No offered preset wears 4 Corruptor pieces (the T5 preset wears 2 Corruptor + 2 Voidheart), so only a custom gear with the 4-piece is understated |
| Wrath of Spellfire (3) | spell damage +7% of total intellect | no stat-to-stat conversion in the engine (about 35 spell power missing at 500 intellect). Worn only by the Fire presets, which are not offered: left unmodelled on purpose (Task 6 decision) |
| Shadow's Embrace (3) | shadow spells heal for 2% | no health (wowsims: TODO) |
| Oblivion Raiment (2) / (4) | pet mana regen / Seed of Corruption +180 | no pet; no Seed of Corruption |
| Primal Mooncloth (3) | 5% mana regeneration while casting | no casting regen rate in the engine (mana only) |
| Battlecast Garb (2) | pushback/interrupt resistance | not simulated |
| Whitemend Wisdom (2) | healing +10% of intellect | healing only |

Not reviewed: the other 38 sets of the database (PvP sets, vanilla tiers, healer and off-class cloth sets); `describeGear` flags any of them worn with 2+ pieces. The 4 proc aura icons (`spell_shadow_shadowfury`, `spell_shadow_shadowandflame`, `spell_lightning_lightningbolt01`, `spell_arcane_blink`, names checked against the Wowhead tooltip API) are committed in `public/icons/spells/`; since Task 6 `npm run icons` verifies them too (`warlockSetAuras`, as "set aura" entries).

#### Voidheart 4pc: DoT extra ticks (Task 6)

- Source: tbc-new @ 91f869a `sim/warlock/items.go` `ItemSetVoidheartRaiment` bonus 4 attaches `SpellModConfig{Kind: SpellMod_DotNumberOfTicks_Flat, IntValue: 1, ClassMask: WarlockSpellCorruption | WarlockSpellImmolateDot}`. Corruption and Immolate (`corruption.go`, `immolate.go`) snapshot a fixed base per tick (`dot.Snapshot(target, TickBaseDamage)`: 150 and 123) with a per-tick coefficient (0.156 and 0.13), so the extra tick is a full tick, not the same total spread thinner. Wowhead TBC: spell=37380 "Increases the duration of your Corruption and Immolate abilities by 3 sec."; spell=27216 "150 Shadow damage every 3 seconds" (18 s), spell=27215 "123 Fire damage every 3 seconds" (15 s). 3 s = one tick of each.
- Engine: `SpellModifier.dotExtraTicks` (summed over the matching modifiers; a non-positive or non-finite sum adds nothing, a fraction is floored). It extends only the DoT a spell applies itself (`applyAura` on the target, an aura with a tick), read when the DoT is applied: the aura lasts `durationMs + extra x intervalMs` (the snapshot's remaining time includes it), and it ticks `base + extra` times. Each tick is the unchanged base tick, `(total + coeffTotal x power at application) / base count`. Everything else is as before: the snapshot of power and `dotDamageMult` at application, the fight end cutting ticks (a tick at exactly the end counts), a refresh replacing the aura and cancelling its pending ticks (no pandemic in TBC), ticks never calling hooks. A DoT applied by a hook or scheduled by the fight is never extended. Without the modifier, the code path and the floating-point operations are unchanged (stage 1, 1.5 and F golden values exact).
- Rotation (decision): `buildPriority(config, distanceYd, dotExtraTicks = {})` takes the extra ticks per spell id. The Immolate and Corruption refresh rules use the extended duration in "the fight outlasts cast time + DoT" (Corruption 2000 + 21000 ms, Immolate 1500 + 18000 ms with 4 Voidheart pieces). The Corruption hint names the duration (default "18 s", unchanged). The map comes from `dotExtraTicksForSpec(spec)` (rotation.ts). It uses the spec's modifiers, the gear's (meta gem) and the active set bonuses', the same list the Simulation folds before any self aura, with the engine's rounding. `applySetup` passes it (buffs' modifiers included), and `buildDestructionWarlock` builds the spec's own priority with it when it is non-empty (otherwise the shared default steps, as before). Without the modifier, the list is the old one, rule for rule.
- Effect: T4 preset (DEFAULT_SETUP, bot, seeds 1-5, window 400), mean DPS 1060.94 -> 1093.08 (+3.0%). Corruption deals 7 ticks per cast (70 ticks from 10 casts), and every Immolate that runs out deals 6. No other preset wears 4 Voidheart pieces, and their bot DPS is unchanged, to the last digit (`tests/data/sets-2a.test.ts`).

### Gear presets (Task 3)

`GEAR_PRESETS` (`src/data/classes/warlock/gearPresets.ts`): the 8 warlock gear sets of github.com/wowsims/tbc-new @ `91f869a` `ui/specs/warlock/dps/gear_sets/*.gear.json` (MIT; names from `ui/specs/warlock/dps/presets.ts`) plus the author's gear. Each gear is stored in the normalized form, and `tests/data/gear-presets.test.ts` checks that `normalizeGear` keeps every preset unchanged (no unknown id, every item in its slot, every gem in a fitting socket, every enchant on a fitting item), that `buildSetup` reports no unknown ids, and that every preset equals its wowsims file (the copy in `tests/fixtures/wowsims-warlock-gear-sets.json`) except for the changes listed below.

| id | Name | Phase | Spec | wowsims file | Set pieces |
|---|---|---|---|---|---|
| `preraid` | Pre-Raid | 0 | shadow (offered) | preraid | Shadow's Embrace 3, Mana-Etched 2, Spellstrike 1 |
| `t4` | T4 | 1 | shadow (offered) | t4 | Voidheart 4 (+ Spellstrike 1, Shadow's Embrace 1) |
| `t5` | T5 | 2 | shadow (offered) | t5 | Corruptor 2, Voidheart 2 |
| `t6` | T6 | 3 | shadow (offered) | t6 | Malefic 4 |
| `za` | Zul'Aman | 4 | shadow (offered) | za | Malefic 4 |
| `swp` | Sunwell Plateau | 5 | shadow (offered) | swp | Malefic 4 |
| `fire-preraid` | Pre-Raid (Fire) | 0 | fire (not offered) | destro_fire_preraid | Wrath of Spellfire 3, Mana-Etched 2, Spellstrike 1 |
| `fire-t4` | T4 (Fire) | 1 | fire (not offered) | destro_fire_t4 | Wrath of Spellfire 3, Voidheart 2, Spellstrike 1 |
| `author` | My gear (export) | 4 (its newest item: Fetish of the Primal Gods) | shadow (offered first) | the author's export (`destructionEquipped`) | Malefic 4 |

- Phase: the content phase the gear is for (0 pre-raid, 1 T4/Karazhan-Gruul-Magtheridon, 2 T5/SSC-TK, 3 T6/Hyjal-BT, 4 Zul'Aman, 5 Sunwell), not the item database's `phase` (the pre-raid items are phase 1 there).
- `offeredGearPresets()`: the author's gear, then the shadow presets in phase order. The Fire presets are kept but not offered: the trainer's rotation is Shadow Bolt.
- Shadow power rises with every offered phase (checked by the test against the previous phase, no fixed numbers). Derived shadow power with the default warlock options and no buffs: Pre-Raid 1130, T4 1163, T5 1222, T6 1350, Zul'Aman 1367, Sunwell 1381 (these figures are informational; the test only checks that each phase is higher than the one before).
- Decision (Gnome, Alliance): Stormcaller 29155 (Horde only, db.json `factionRestriction` 2; `sources` rep 947 Thrallmar, Exalted) in `preraid` and `destro_fire_preraid` is replaced by its Alliance counterpart Blade of the Archmage 29153 (rep 946 Honor Hold, Exalted; db.json: both +159 spell damage and +21 spell crit rating, Intellect 11 against 12). The enchant (Soulfrost 2672 / Sunfire 2671) stays. The preset's `note` says so. After the swap no preset holds a Horde-only item (`describeGear` gives no warning for any preset). The presets do hold two Alliance-only items, both fine for a Gnome: Blade of the Archmage 29153 and Ashyen's Gift 29172 (`preraid`, `fire-preraid`). Ashtongue Talisman of Shadows 32493 (Alliance-only in the source data) is in no preset.
- Decision (`za`): tbc-new's `za.gear.json` has no shoulder or cloak enchant, unlike every other set. Without them the Zul'Aman preset would have less spell power than T6. Both enchants are restored from the previous sim's 'P4 Destro' preset (github.com/wowsims/tbc @ `3301fca` `ui/warlock/presets.ts`: enchant item 28886 Greater Inscription of Discipline = effect 2982, +18 spell damage and +10 crit rating; 33150 Subtlety = effect 2621; mapping from `sim/core/items/all_enchants.go`). The preset's `note` says so.
- Not modelled in these gears: Corruptor 2pc, Wrath of Spellfire 3pc (Fire) and every on-use or proc item effect other than the Icon and the Band (*since "Part F: gear item effects": only the effects that stay text*) (see "Set bonuses (Task 2)"; `describeGear` lists them).

### WowSimsExporter import and wowsims gear export (Task 3)

`parseWowSimsExport(text, db)` and `exportWowSimsGear(gear)` (`src/setup/wowsimsGear.ts`); tests in `tests/setup/wowsims-gear.test.ts`.

- Formats. (1) The WowSimsExporter addon export. The author's real export is `docs/samples/wowsimsexporter-destruction-warlock.json` (addon v3.2.4: `name`, `realm`, `race`, `class`, `spec`, `level`, `talents`, `professions` [{name, level}], `version`, `id`, `unit`, `gear.items` with 17 entries `{id, enchant?, gems}`). It was already in the repository since stage 1, so the importer test reads it directly. It is the real export, not a reconstruction. The fields read are the ones wowsims reads in tbc-new `ui/features/import-export/importers/addon.ts`: null entries for empty slots, `gem || 0` for empty sockets. (2) The wowsims `*.gear.json` shape: `{ "items": [...] }`, `{}` for an empty slot. A top-level `items` list and a `gear.items` list are both accepted.
- Placement. A list of exactly 17 entries is read in slot order (`ITEM_SLOTS`, the addon's order). An item that does not fit its position leaves that slot empty and gets a warning. A list of any other length is placed by each known item's database slot, into the first free one. Rings and trinkets fill finger1/finger2 and trinket1/trinket2 in list order, as wowsims `Database.lookupEquipmentSpec` does. An item with no free slot is skipped with a warning. At most 64 entries are read.
- Then `normalizeGear` runs, so every Task 2 rule applies (unique items, ring categories, a staff empties the off hand, enchant and socket fit). Each id of the text that it drops gets a readable warning. Empty sockets are gem 0 (or null) and stay empty.
- `unknown`: the item, gem and enchant ids not in the item database, each once, in order. Their slots or sockets stay empty, and `ok` stays true while at least one known item was placed. With no known item `ok` is false and `gear` is 17 empty slots (not to be applied).
- Never throws. Size cap: **200 000 characters** (`IMPORT_MAX_CHARS`; the author's export is 967). Non-JSON, a top-level array, a number, a string, null, no `items` list, or no known item give `ok` false. Only own properties are read (`__proto__` and `constructor` keys are plain data). Nesting up to the size cap is safe, because the parser never walks the tree: it reads fixed keys only. Every result is a fresh object.
- Character fields. `talents` is returned untouched when it is digits and dashes (1-128 characters); stage 2b applies it. `race` and `character` ("Name-Realm") are returned as well. Warnings are given for a race other than Gnome (the trainer's base stats and racials are a Gnome's), a class other than warlock (wowsims refuses the import; the trainer imports what it knows) and a level other than 70.
- Profession warnings. When the export lists professions, an item, gem or enchant whose `requiredProfession` is not among them gets a warning ("Don Julio's Heart needs Jewelcrafting"). The proto `Profession` names come from tbc-new `ui/sim/proto/names.ts`. Without a professions list (the gear.json shape) nothing is assumed.
- Other warnings come from `describeGear` (Horde-only items). An inactive meta gem also gets a warning. Each warning appears once.
- Export: `exportWowSimsGear(gear)` writes the exact layout of the wowsims gear files: tabs, one entry per line, `{}` for an empty slot, `enchant` and `gems` only when set, and 0 for an empty socket before a filled one. The `t6` preset exports to the content of tbc-new's `t6.gear.json`. Export then import gives back the same gear for the author's gear and every preset.

### Derived stats per preset (Task 5)

Default warlock options (Fel Armor, Succubus sacrificed), no buffs, the default setup otherwise. "Before set bonuses" is `computeStats(spec.setup, spec.statBonuses)`: gear, talents and multipliers, with no set bonus `statBonuses` (the Task 3 ledger table). "With set bonuses" is what the Gear panel's "Stats at the pull" shows: it adds the active set bonuses' `statBonuses` too. The only offered preset where they differ is Pre-Raid, whose Mana-Etched Regalia 2pc adds 35 spell hit rating: **10.30% before, 13.08% with** (35 rating / 12.615 per 1% = +2.77%). Crit is `computeStats`' crit, without the talent crit modifiers the panel's "Spell crit" adds. The bot mean DPS is over seeds 1-10, queue window 400, 28 yd, 60 s, real mana: the default setup (no buffs) and "Raid as in my log".

| Preset | Int | Spirit | Shadow power | Crit % | Hit % before / with set bonuses | Haste % | Max mana | Bot DPS: default / raid |
|---|---|---|---|---|---|---|---|---|
| My gear (export) | 433 | 145 | 1300 | 22.60 | 15.54 / 15.54 | 2.85 | 9429 | 1425.18 / 2294.11 |
| Pre-Raid | 313 | 145 | 1130 | 12.73 | 10.30 / **13.08** | 0 | 7483 | 1047.55 / 1766.92 |
| T4 | 424 | 145 | 1163 | 14.74 | 13.00 / 13.00 | 0 | 9283 | 1125.44 / 1812.24 |
| T5 | 414 | 145 | 1222 | 22.86 | 13.16 / 13.16 | 0 | 9121 | 1253.31 / 1961.86 |
| T6 | 447 | 163 | 1350 | 21.11 | 14.43 / 14.43 | 11.22 | 9657 | 1573.14 / 2407.21 |
| Zul'Aman | 462 | 163 | 1367 | 20.66 | 13.55 / 13.55 | 11.22 | 9900 | 1577.02 / 2418.93 |
| Sunwell Plateau | 526 | 145 | 1381 | 19.85 | 13.40 / 13.40 | 37.03 | 10938 | 1872.98 / 2967.72 |

The final Playwright smoke (Task 5) read the same shadow power, hit, haste and max mana from "Stats at the pull" for each preset, at desktop and phone width. T4's DPS includes Voidheart 4pc (Task 6). The DPS column is informational: no test pins it except the author's gear (golden) and the Task 6 table in `tests/data/sets-2a.test.ts`.

### Meta gems, unique items and limit categories (summary)

- A meta gem fits only a meta socket, and a meta socket takes only a meta gem; a prismatic gem fits and matches every coloured socket (`gemFitsSocket`, `socketMatches`, `src/engine/gear.ts`).
- A meta gem is active only while its requirement holds: the `metaRequires` minimums (14 metas) or the `metaCompare` rule "strictly more gems of colour A than of colour B" (4 metas: 25897, 25895 more red than blue; 25893, 32640 more blue than yellow). The colours counted are those of every socketed non-meta gem (orange, purple and green count for both of their colours). An inactive meta gives no stats and no effect, but still fills its socket for the socket bonus. The Gear panel's "Meta gem" line says which meta is worn, whether it is active and what it needs.
- Only Chaotic Skyfire Diamond's effect beyond its stats (+3% critical damage) is modelled; any other active meta gem's effect is listed as not modelled.
- `unique` items and gems: a second copy anywhere in the gear (both ring slots, both trinket slots, any socket) is dropped by `normalizeGear`; the Gear panel refuses the pick with a message instead.
- Ring limit categories (`RING_LIMIT_CATEGORIES`): at most one ring of each of 475 Signet Ring of the Bronze Dragonflight, 495 Violet Signet and 497 Band of Eternity.

### Gear panel (Task 4): loading and filters

- **When the database loads.** The default gear (the author's) is embedded in the main chunk (`items.ts`, `AUTHOR_GEAR_TABLES`), so the first paint and a fight with it never wait for the database. The `db-*.js` chunk is requested (once) when the Gear panel is first opened, or at start when the stored setup has a gear the embedded tables cannot build (`gearNeedsDb`). Until it has loaded, the next fight uses the author's gear, never a gear with unknown ids (`buildSetup` would skip them silently and give a wrong DPS); the DPS note names the fight's gear ("Gear: …"). When it has loaded, the stored gear is checked by `normalizeGear`; loading never writes to storage, and the next edit saves the checked config.
- **A failed load.** The panel shows "Could not load the item database…" and a **Reload the page** button, not a retry. A browser keeps a failed dynamic `import()` in its module map, so a second `import()` of the same chunk fails again without a request. After a redeploy the old chunk name no longer exists either. Only a page reload can help. The setup is saved, so nothing is lost.
- **Hidden in the pickers.** The 114 gems and 84 enchants with no modelled stat (strength, agility, stamina, defence, threat and similar) are not offered. A gem or enchant already worn stays listed. The 26 effect-only items (no modelled stat, only an `effects` text, e.g. The Lightning Capacitor) are hidden behind "Show items with only an unmodelled effect". *Since "Part F: gear item effects", 7 of them have only a structured effect and no text (e.g. Talisman of Ephemeral Power), so the picker no longer counts them as effect-only (19 left).* Items are sorted newest phase first, with an "Up to phase N" filter. Gems that match the socket's colour come first, with a "Matches the socket" filter. Markers: "Horde only" or "Alliance only", the required profession, "Effect not modelled" (or "Effect: Setup panel" for the Icon and the Band); gems also "Unique". *Since Part F Task 3: "Effect: Setup panel" for every item with a modelled (structured) effect and "Effect not modelled" for every item with an `effects` text, both on an item that has both (Bangle of Endless Blessings); an item is effect-only (hidden) only with no modelled stat, no modelled effect and a text effect, so Bangle is shown.*

### Bundle (Task 5)

`npm run build`:

| Chunk | Before stage 2a (de95e40) | After (final) |
|---|---|---|
| main `index-*.js` | 308.97 kB (95.68 kB gzip) | 357.09 kB (111.00 kB gzip) |
| `db-*.js` (item database, lazy) | - | 357.50 kB (56.63 kB gzip) |

The main chunk grew about 48 kB (15 kB gzip): the embedded presets, the importer, the set bonuses and the setup's gear rules (about 6 kB by the end of Task 3: 315.11 kB), then the Gear panel and the item picker (Task 4). Measured by building both commits with the same Vite version. Lazy-loading `GearPanel` would move about 22 kB out of it (an optional follow-up). Icons: 697 item, gem and enchant icons, 1 250 183 bytes in `public/icons/items/` (budget 6 000 000).

### Known simplifications (stage 2a)

- **Feet enchant name.** The author's Feet enchant shows the merged name "Enchant Bracer - Fortitude / Enchant Boots - Fortitude", with no modelled stat. Effect id 2649 is listed twice in db.json, once per slot, and the generator merges duplicate effect ids into one record (see "Filters and counts"). Stamina is not modelled, so the number is unaffected.
- **Faction and professions are only flagged.** Horde-only items (Stormcaller) are kept and warned about, and Alliance-only items are fine for the Gnome. Profession-only items, gems and enchants are never checked against the character; the importer warns only when the export lists professions.
- **Item buffs are not coupled to the gear.** The Icon of the Silver Crescent and Band of the Eternal Sage setup entries count when enabled in Setup, whether or not the item is worn. The Gear panel warns when one is enabled but the item is not worn. A worn Icon or Band adds nothing until its setup entry is enabled.
- **Item effects.** On-use and proc effects of items are not modelled, except the Icon and the Band (above). Of the 148 items with an `effects` text, every one but those two is marked "Effect not modelled" in the picker, and the worn ones are listed in the Gear notes. *Superseded by "Part F: gear item effects": the 43 items whose effects are structured are modelled (derived from the worn gear, enabled in the Setup panel, marked "Effect: Setup panel"); only the `effects` texts stay unmodelled and are listed.*
- **Set bonuses.** See "Set bonuses (Task 2)": Corruptor Raiment 2pc (no pet) and 4pc (needs an engine change to a running DoT), Wrath of Spellfire 3pc (no stat-to-stat conversion; Fire presets only, not offered) and the others in that table are listed, not modelled. Spellstrike and Mana-Etched use slightly different miss rules (a known, negligible inconsistency: the trainer skips misses for Spellstrike's "land", wowsims has no outcome filter).
- **Talents and race.** The import's `talents` are not applied (stage 2b), and its race is only checked (warning for a race other than Gnome).
- **Setup presets keep the gear.** Choosing a Setup preset ("None", "Raid as in my log") keeps the player's gear, like the fight length (ruling F-2). "Reset to defaults" restores the author's gear.

### Optional follow-ups

- Lazy-load `GearPanel` (`React.lazy`) to cut the main chunk by about 22 kB.
- Wrath of Spellfire 3pc (+7% of Intellect as spell damage): a `spellPowerPerIntellect`-style stat dependency in `computeStats`. It only matters for the Fire presets.
- Corruptor Raiment 4pc: each landed Shadow Bolt (Incinerate) raises the running Corruption (Immolate) tick damage by 10%. This needs an engine operation on a DoT already on the target.
- Stage 2b: apply the import's `talents` string (talent presets and editor).

## Part F: gear item effects

Gear item effects (plan `docs/superpowers/plans/2026-10-30-gear-item-effects.md`, spec `docs/superpowers/specs/2026-10-30-gear-item-effects-design.md`). Task 1: the item database carries the plain on-use and proc stat buffs of the items as structured data. Task 2 derives the setup entries from the worn gear (the hand-written Icon and Band entries of "Part C: cooldowns and item effects" are gone), Task 3 shows them in the UI.

### Fields (`src/data/items/types.ts`)

- `useEffects?: ItemUseEffect[]`: `{ buffName, buffId, stats, durationMs, cooldownMs, group?, prepull? }`. `prepull: true` marks an on-use buff of 10 min or more (`PREPULL_MIN_DURATION_MS`): a pre-pull buff, not an item action (below). `group` is `{ id, ms }`: db.json `onUse.categoryId` and `categoryCooldownMs`, or the buff's duration when that is not positive; no `group` when `categoryId` is 0 or missing, even if `categoryCooldownMs` is set (Heavenly Inspiration 30293). This is wowsims `sim/common/shared/shared_utils.go` `sharedCooldown`.
- `procEffects?: ItemProcEffect[]`: `{ buffName, buffId, stats, durationMs, chance, icdMs, trigger }`. `chance` is `proc.procChance`; `icdMs` is `proc.icdMs`, or 0 when there is none (e.g. Wrath of Cenarius, Circlet of Arcane Might).
- `buffName` is db.json `buffName` without its "(spell id)" suffix; `buffId` is db.json `buffId` (Wowhead spell id of the buff). `stats` are sparse, use modelled `RawStats` keys only, and are all positive.
- `effects?: string[]` keeps one text line for every effect that is not structured. **Rule:** each `itemEffects` entry of an item becomes exactly one of a `useEffects` entry, a `procEffects` entry or an `effects` line, never two. So a structured effect is never listed as unmodelled text, and an item with both kinds keeps the text of the unmodelled one: Bangle of Endless Blessings 28370 has `useEffects` (Endless Blessings, +130 Spirit) and `effects: ["Proc: Meditation (15 s)"]`. All three fields are absent when empty. Tested in `tests/data/item-effects-db.test.ts`.

### What becomes structured

An effect is structured when all of the following hold (`structuredEffect` in `scripts/build-item-db.mjs`):

1. It is a plain buff: no `maxCumulativeStacks`, `stackingAura` or `stackProc`.
2. It has a `buffId`, a name, and a positive whole `effectDurationMs`.
3. **Every stat of the buff is modelled**: Intellect 3, Spirit 16, SpellDamage 5, FireDamage 7, ShadowDamage 11, SpellHitRating 12, SpellCritRating 13, SpellHasteRating 14, MP5 35 (the Part E mapping), with positive values. The one exception is healing power (StatHealingPower 4), which is ignored. wowsims lists the "damage and healing" buffs with both stats (e.g. Icon of the Silver Crescent `{4: 155, 5: 155}`), and healing does nothing for a warlock's DPS. A buff with any other stat stays text (spell penetration, attack power, armor, health).
4. On use: a positive whole `onUse.cooldownMs`. Proc: `procChance` in (0, 1], no PPM rate, and a trigger in `PROC_TRIGGERS` (below) that is not null.

### Counts (tbc-new @ 91f869a)

| | Count |
|---|---|
| `itemEffects` entries on the 1730 kept items | 161: 69 on-use, 33 proc, 59 equip |
| Structured on-use (`useEffects`) | 31 (30 trinkets and Chain of the Twilight Owl, a neck); 20 in category 1141 (12 at 20 s, 8 at 15 s), 11 without a category (10 trinkets and the pre-pull Chain of the Twilight Owl) |
| Structured proc (`procEffects`) | 12: `cast` 6, `hit` 4, `crit` 2 |
| Items with a structured effect | 43 (no item has two of one kind) |
| Items keeping `effects` text | 106 (148 before; Bangle of Endless Blessings has both text and a structured effect) |
| Effects with a modelled stat that stay text | 10 (one per item; table below) |
| Pre-pull on-use (`prepull: true`) | 1 (Chain of the Twilight Owl) |
| db.json size | 359 521 -> 362 730 bytes raw (+3 209), 56 610 -> 57 287 gzip |

The regeneration is deterministic: a second `npm run db:build` is byte-identical.

### Proc triggers

The trainer has three triggers (`ItemProcTrigger`), each rolled once per event and only while the internal cooldown is not running:
- `cast`: every completed player spell, whatever its outcome (a miss too), **except Curse of the Elements** (ruling for Task 2). Items and DoT ticks do not count. This is close to, not identical with, wowsims `CallbackOnCastComplete` + `ProcMaskSpellDamage`: wowsims counts only class spells with that mask, so Life Tap counts (`lifetap.go`: `ProcMaskSpellDamage`) and Curse of the Elements does not (`curse_of_elements.go`: `ProcMaskEmpty`). The trainer's other warlock spells all deal damage. Hooks also run when the spell resolves (at impact, ruling S4), not at cast end.
- `hit`: a landed (hit or crit) offensive player spell, meaning one with a direct damage part or one that applies a DoT on the target. A miss, Life Tap and Curse of the Elements do not count. This is the stage F Band rule (`BAND_PROC_SPELL_IDS`, "Part C: cooldowns and item effects") and corresponds to wowsims `CallbackOnSpellHitDealt` with `OutcomeLanded`.
- `crit`: a critical hit of a player spell (wowsims `OutcomeCrit`).

Triggers come from the wowsims Go registrations, which are source code, not data. They are copied by hand into `PROC_TRIGGERS` in the generator, with the callback, mask, outcome and tooltip line of each. The build fails if a proc stat buff has no entry, if an entry is unused, or if one item has more than one proc stat buff reaching the table (it is keyed by item id; none does today). I exercised the last guard on a synthetic copy of the clone, with Quagmirran's Eye's effects doubled: the build fails before writing anything. Mapping:
- `CallbackOnSpellHitDealt` + `OutcomeCrit` -> `crit`.
- `CallbackOnSpellHitDealt` + `OutcomeLanded` -> `hit`.
- `CallbackOnCastComplete` + `ProcMaskSpellDamage` -> `hit` when the tooltip says the spell must land or hit, else `cast`.
- Everything else -> text: heals only, periodic damage, a resisted spell, a kill, melee.

| Item | Buff | wowsims registration (`stat_bonus_procs_auto_gen.go` unless noted) | Trigger |
|---|---|---|---|
| 21190 Wrath of Cenarius | Spell Blasting +132 spell damage 10 s, 5%, no ICD | OnCastComplete, ProcMaskSpellDamage; "when your harmful spells land" | `hit` |
| 24122 Coronet of Verdant Flame | Verdant Flame +45 MP5 10 s, 75%, ICD 25 s | OnCastComplete, ProcMaskSpellDamage; "Chance on successful spellcast" | `cast` |
| 24123 Circlet of Arcane Might | Arcane Might +120 spell damage 15 s, 2%, no ICD | OnCastComplete, ProcMaskSpellDamage; "chance on successful spellcast" | `cast` |
| 27683 Quagmirran's Eye | Spell Haste +320 haste rating 6 s, 10%, ICD 45 s | OnCastComplete, ProcMaskSpellDamage; "Your harmful spells have a chance" | `cast` |
| 28418 Shiffar's Nexus-Horn | Call of the Nexus (buff 34321) +225 spell damage 10 s, 20%, ICD 45 s | OnSpellHitDealt or OnHealDealt, OutcomeCrit; "Chance on spell critical hit" | `crit` |
| 28578 Masquerade Gown | Love Struck +145 Spirit 15 s, 10%, ICD 50 s | OnCastComplete, ProcMaskSpellDamage; "Chance on spell cast" | `cast` |
| 28602 Robe of the Elder Scribes | Power of Arcanagos +130 spell damage 10 s, 20%, ICD 50 s | OnCastComplete, ProcMaskSpellDamage; "when your harmful spells land" | `hit` |
| 29305 Band of the Eternal Sage | Band of the Eternal Sage +95 spell damage 10 s, 10%, ICD 60 s | OnCastComplete, ProcMaskSpellDamage; "Your offensive spells have a chance on hit" | `hit` |
| 29309 Band of the Eternal Restorer | +59 spell damage 10 s, 10%, ICD 60 s | OnSpellHitDealt or OnHealDealt, OutcomeLanded | `hit` |
| 30626 Sextant of Unstable Currents | Unstable Currents +190 spell damage 15 s, 20%, ICD 45 s | OnSpellHitDealt or OnHealDealt, OutcomeCrit; "Your spell critical strikes" | `crit` |
| 31336 Blade of Wizardry | Forgotten Knowledge +280 haste rating 6 s, 15%, ICD 50 s | OnCastComplete, ProcMaskSpellDamage; "Your harmful spells have a chance" | `cast` |
| 32496 Memento of Tyrande | Wisdom +76 MP5 15 s, 10%, ICD 50 s | OnCastComplete, ProcMaskSpellDamage or SpellHealing; "Each time you cast a spell" | `cast` |

**Band of the Eternal Sage against the hand model.** The generated Band has trigger `hit`, which is what stage F models: a landed damaging spell rolls, DoT applications included; misses, Life Tap and Curse of the Elements do not roll; no draw while the ICD runs. Its numbers equal the hand-written entry field for field: +95 spell power, 10 000 ms, chance 0.1 (`BAND_PROC_CHANCE`), ICD 60 000 (`BAND_ICD_MS`), and buff 35084 (the aura's `wowheadId`). The only difference is the name: the hand entry's hidden ICD aura is a trainer construct, not data, so Task 2 builds it. Against wowsims, the Part C deviation stands: wowsims rolls at cast end for any SpellDamage cast, misses and Life Tap included. The same `hit` reading applies to Wrath of Cenarius and Robe of the Elder Scribes, whose tooltips say "land". The other OnCastComplete items keep `cast`, which is close to wowsims but not identical (Curse of the Elements excluded, hooks at impact; see the `cast` definition above).

**Icon of the Silver Crescent against the hand model.** `useEffects[0]`: +155 spell power, 20 000 ms, cooldown 120 000, `group { id: 1141, ms: 20000 }`, buff "Blessing of the Silver Crescent" 35163. These equal the hand entry: action `cooldownMs`, `sharedCooldown` 20 s (named `trinket` there), and the aura's duration, stats, name and `wowheadId`.

### What stays text, and why

Equip effects stay text (59, e.g. Fear Cast Pushback Reduction, Alchemist's Stone, Demon Slaying, Increase Spell Dam Undead, Sunwell Exalted Caster Neck, Mount Speed), and so do on-use or proc effects without a modelled stat. Examples are summons, mana restores, absorbs, threat, the Lightning Capacitor's damage proc and Shifting Naaru Sliver's Power Circle. The effects below carry a modelled stat but stay text:

| Item | Why |
|---|---|
| 19337 The Black Book | A pet buff: +200 spell damage, attack power and armor for the pet. Attack power and armor are not modelled. |
| 21473 Eye of Moam | Also +100 spell penetration (not modelled). |
| 22678 Talisman of Ascendance, 28727 Pendant of the Violet Eye | The buff stacks per spell (stacking aura); stacking is not modelled. The text now says "up to N stacks". |
| 28190 Scarab of the Infinite Cycle | Procs from heals only (OnHealDealt). |
| 28789 Eye of Magtheridon | Procs on a resisted spell (items_trinkets.go: OutcomeMiss). The trainer has no `miss` trigger. |
| 31856 Darkmoon Card: Crusade, 31857 Darkmoon Card: Wrath | Stacking buffs (Crusade's second effect is melee attack power; Wrath's crit is melee and spell). |
| 32493 Ashtongue Talisman of Shadows | Procs on Corruption ticks (sim/warlock/items.go: OnPeriodicDamageDealt). Hooks never run on ticks (spec: out of scope). |
| 32771 Airman's Ribbon of Gallantry | Procs on a kill that gives honor or experience. Not implemented in wowsims (CallbackEmpty). |

### Decisions and UNVERIFIED

- **Healing power ignored** in the "all stats modelled" rule (above). Healer trinkets with a spell damage part become their spell damage (e.g. Hibernation Crystal +117, Essence of the Martyr +99, Direbrew Hops +135), exactly as wowsims' `NewSimpleStatActive` applies them.
- **On-use list.** All 31 structured on-use items are registered by wowsims as plain stat on-use effects: `NewSimpleStatActive` in `stat_bonus_cds_auto_gen.go`, and the summoning figurines 24126 and 35700 in `items_trinkets.go`. The one exception is **Chain of the Twilight Owl 24121**. See the next item.
- **Pre-pull buffs (`prepull: true`).** An on-use buff lasting 10 min or more is a buff you put up before the pull, not something pressed during the fight. Today the only one is **Chain of the Twilight Owl 24121**: Wowhead TBC "Use: +2% spell crit to nearby party members for 30 min (1 Hour Cooldown), 10 Charges". wowsims makes it a permanent, exclusive party aura (`items_armor.go` lines 46-48 and `sim/core/buffs.go` `ChainOfTheTwilightOwlAura`: `SpellCritPercent 2`, `ExclusiveCategory`). db.json gives it as stat 13 (SpellCritRating) 44.153846 = exactly 2% at 22.076923 rating per % (the rating the Destruction Potion uses, "Part C"). That is the RawStats `critRating`, so the effect is structured (`stats: { critRating: 44.153846 }`, 1 800 000 ms, cooldown 3 600 000) with `prepull: true`; it stays in `useEffects` with the flag, not in a separate list. Task 2 derives it as a toggle aura active from the pull, with no action and no item slot; it is an exclusive party buff (one per party, the wearer's or a party member's).
- **`cast` or `hit` for OnCastComplete items** follows the tooltip, as the stage F Band decision did. It is a reading, not a wowsims field.
- **Coronet of Verdant Flame 24122** is a mana-regen proc, structured as a stat buff: +45 MP5 for 10 s (spell 31036: 45 mana every 5 s = 90 mana over 10 s), chance 0.75, ICD 25 s, trigger `cast`. Verified: db.json `proc { icdMs 25000, procChance 0.75 }` and the Wowhead TBC tooltip "Chance on successful spellcast to restore 90 Mana over 10 sec. (Proc chance: 75%, 25s cooldown)". Memento of Tyrande (+76 MP5, 15 s) is the same kind.
- `tests/data/item-effects-db.test.ts` pins the trigger table, the hand-checked numbers of the Icon, the Band, Quagmirran's Eye, Shiffar's Nexus-Horn and Chain of the Twilight Owl, and a compact line for every structured effect (`ALL_STRUCTURED_EFFECTS`), so any regeneration that changes an effect shows up as a test diff.
- Not decided here: what a proc does while its buff is still up (only possible when the ICD is shorter than the buff, e.g. no ICD), and two worn items with the same buff (e.g. Scryer's Bloodgem and Xi'ri's Gift, both "Spell Power" 35337). Task 2 owns the aura semantics: see "Derived setup entries" below.

### Derived setup entries (gear item effects Task 2, `src/setup/gearEffects.ts`)

- **Derivation.** `deriveGearEffects(gear, db)` turns every modelled effect of every worn item into a setup entry (group `item`, `iconKind: 'item'`: the item's own icon from public/icons/items/). Ids: `item:<itemId>` for the item's first effect, `item:<itemId>:<n>` for further ones (useEffects first, then procEffects); item action `use-item-<itemId>` (`-<n>`); buff aura `item-buff:<buffId>`; ICD aura `item-icd:<itemId>` (`:<n>`), hidden. Order: on-use effects in slot order, then pre-pull, then procs (keeps the stage F Icon-then-Band catalog order). Pure and total: hostile gear, unknown ids, a repeated item and malformed effects are skipped. Every call builds fresh, deep-frozen entries.
- **On use.** An item action with the item's own cooldown and, when the effect has a category, the shared cooldown `category-<id>` for the category's time (wowsims `sharedCooldown`: the shared cooldown follows wowsims exactly; 10 on-use trinkets have no category and so no shared cooldown: 19947, 20636, 23047, 25634, 27828, 28370, 29376, 30293, 33828, 281748; the pre-pull Chain of the Twilight Owl 24121 has none either but has no action). The Icon's group was `trinket` in stage F; the name is internal (never logged).
- **Procs.** One hook per proc: the trigger (`cast`: every completed spell except Curse of the Elements, misses included; `hit`: landed spell of `BAND_PROC_SPELL_IDS`; `crit`: a crit of one of those), then nothing while the item's ICD aura is up, then a proc when the chance is 1 (no random draw: wowsims `aura_helpers.go` `ProcChance != 1 && RandomFloat`) or when `roll() < chance`; a proc applies the ICD aura, then the buff. A proc while the buff is up (no ICD: Wrath of Cenarius, Circlet of Arcane Might) refreshes it; it never stacks. Each item keeps its own ICD.
- **Same buff on two items.** Scryer's Bloodgem and Xi'ri's Gift (35337), and the pairs 32355 and 33662, share one aura `item-buff:<buffId>` (same stats and duration in the data): using both refreshes one buff, never doubles it. A buff id with other numbers would get `item-buff:<buffId>:<itemId>`.
- **Pre-pull** (Chain of the Twilight Owl): a toggle whose aura is on the player from 0 ms for its 30 min (the whole fight); no action, no slot. The item is unique, so two copies cannot be worn.
- **Item row.** 6 slots (Z X C V B N). Static actions (potions, rune) come first, then the gear's; an enabled action past the 6th is left out entirely and listed by `describeGear(gear, db, { enabledBuffs, catalog })` in `unboundItemEffects` and in the Setup panel (real gear has at most 2 on-use trinkets + 3 consumables = 5).
- **Migration.** `normalizeSetup` maps `icon-of-the-silver-crescent` to `item:29370` and `band-of-the-eternal-sage` to `item:29305` (storage and the "Raid as in my log" preset follow). An enabled `item:` id of an item not worn stays in the config, inactive (not applied, not listed, no warning: the stage 2a "enabled but not worn" Gear note is gone). At most 32 such ids that are not in the catalog normalized against are kept, the last ones (`MAX_STORED_ITEM_EFFECT_IDS`); `normalizeEnabled` runs in linear time (one pass from the end; 30 000 ids well under a second), with the stage 1.5 rule unchanged (a later entry removes an earlier duplicate or conflict).
- **Without the database.** The author's three effect items (Icon, Band, Riding Crop) are embedded in items.ts (`authorItemEffects`, pinned equal to db.json), so the default gear's entries exist on the first paint. A test pins that both sources derive the same entries.
- **Equality with stage F.** With the Icon and the Band enabled through the new ids, the bot logs for seeds 1-10 and queue windows 400 and 0 are identical to the stage F hand entries' logs once the ids are renamed (means 1379.2966666666666 / 1373.4900000000002); the raid-log preset keeps its stats at the pull and its means (2294.108333333333 for both windows) and logs. Nothing enabled: 1425.1766666666667 / 1428.3350000000003.

### Setup panel and item row (gear item effects Task 3, UI)

- **No fixed list.** No catalog constant holds gear entries: `SETUP_CATALOG` is the gear-independent catalog (the same array as `STATIC_SETUP_CATALOG`), and GameView builds the fight's catalog with `setupCatalogFor(gear, db)` (static entries, then the worn gear's derived entries). The Setup panel's "Items and cooldowns" lists that catalog's item actions and gear entries (Heroism stays in "Fight"); `applySetup` gets the database (`db`) and derives the same entries, so the list, the item row, the bot's priority and the buffs panel agree.
- **Before the database loads** (db loading rule of stage 2a: it loads when the Gear panel opens or when the stored gear needs it; the author's gear never waits for it): the entries come from the embedded author records (`EMBEDDED_GEAR_EFFECT_SOURCE`, items.ts `authorItemEffects`, pinned equal to db.json). A stored gear that needs the database is never built without it: until it loads the next fight wears My gear, and the panel lists My gear's effects with a note saying so ("Loading the item database ...", or "could not load").
- **Gear changes** apply to the list at once (the next fight's catalog); the enabled state is kept by id (`item:<id>`), so an item worn again comes back enabled. A fight that has started keeps its own catalog, item row and auras until R; the Items group then shows "The running fight keeps its gear and item effects: this list is for the next fight (press R)." The Setup presets keep the player's gear (ruling F-2 style), and preset matching (`fightKey`) ignores enabled ids of items not worn.
- **Description line.** On use: "On use (item row): +150 spell power for 15 s; 90 s cooldown; other items of its category wait 15 s." Proc: "Proc on spell cast / on spell hit / on spell crit: 10% chance, +320 haste rating for 6 s; 45 s internal cooldown." followed by the trigger rule (rulings E-1, E-2). Pre-pull: "Before the pull, whole fight: ...". Icons: entries with `iconKind: 'item'` load public/icons/items/<icon>.jpg in the Setup panel, the item row and the "Your buffs" panel (active, upcoming and setup lists); potions, the rune and every other aura keep public/icons/spells/. Target aura chips never show a gear aura (all gear buffs are self auras).
- **Not modelled list.** "Not modelled effects of your gear" under the group: `unmodelledGearEffects(gear, db or embedded)`, one "<item>: <text>" per `effects` text of a worn item (e.g. "Riding Crop: Equip: Mount Speed", "Bangle of Endless Blessings: Proc: Meditation (15 s)"). The Gear panel keeps its own notes (meta gem, sets).
- **Item row.** 6 slots, keys `ITEM_SLOT_KEYS` = Z X C V B N (`SLOT_KEYS` slots 12-17; `keyToSlot` either case); only bound slots render. B and N follow the hotkey rules of S5 (never inside text-like fields, modals; toggles keep only Space and Enter). On phones (<= 560 px) the "Items" label takes its own row so the six slots fit one row of six (checked at 390 px: no horizontal scroll). An enabled action past the 6th: its row says "Not on the item row (6 slots, all taken): no effect." and the group lists "<name>: not on the item row (6 slots, all taken)", the same text as `describeGear(...).unboundItemEffects`. Hint texts build the key list from `ITEM_SLOT_KEYS`.
- **Gear panel.** "Item effects: <name> (on use), <name> (proc), <name> (before the pull)" for the worn gear, and the same for each gear preset in its button tooltip. Picker markers: "Effect: Setup panel" when `hasModelledGearEffect` (the derivation's own validators), "Effect not modelled" when the item has an `effects` text; effect-only (hidden) = no modelled stat, no modelled effect, a text effect. Hints: one per worn effect that is not enabled. `describeGear(...).modelledEffects` uses the same validator.


## Part G: combat text HUD

Scrolling combat text in the style of MikScrollingBattleText (design spec `docs/superpowers/specs/2026-10-30-scrolling-combat-text-design.md`). The HUD only reads the fight: the model (`src/ui/hudEvents.ts`, `hudFormat.ts`, `hudQueue.ts`, `hudSettings.ts`, pure, no React, no DOM) turns new log entries and snapshot changes into texts. The only engine change is the read-only `Simulation.logSince(index)` (copies of the entries from `index` on, so a reader does not copy the whole log every frame); tests/engine/sim-logsince.test.ts proves a fight read with it every step gives a byte-identical log and the same result, and the golden means stay 1425.1766666666667 / 1428.3350000000003.

### Show/skip table (`HUD_LOG_DECISIONS`)

| Log type | HUD | Rule |
| --- | --- | --- |
| `cast-start` | skip | The cast bar shows it. |
| `cast-complete` | show | Item actions only (`SpellDef.item`): item use "Name" (Notifications). Other spells show their result instead. |
| `cast-cancel` | skip | Nothing happened. |
| `impact` | skip | The damage/miss entries that follow it are shown. |
| `damage` | show | Outgoing: a hit "3,141" (category `damage`) or a crit "4,712!" (category `crits`, larger, bold, sticky), school colour (`SCHOOL_COLORS`); below `minDamage` skipped. |
| `miss` | show | Outgoing: "Miss" (category `misses`). |
| `tick` | show | Outgoing: a DoT tick, smaller (x0.85) and lighter (opacity 0.8), the DoT's school colour (category `ticks`); merged per spell within `mergeTicks`; below `minDamage` skipped. |
| `aura-apply` | show | Visible auras only: a proc "Name!" (gold, sticky, category `procs`), another player buff "+Name" (green, `buffsOn`), an aura on the target "+Name" (`targetDebuffs`, default off; a refresh of a target aura already up logs another `aura-apply` and is skipped: the cursor keeps the set of target auras up, also while the HUD is off). Never: hidden auras, whole-fight auras the fight puts on at 0. |
| `aura-fade` | show | Visible auras only: a player buff (procs included) "-Name" (red, `buffsOff`), an aura on the target "-Name" (`targetDebuffs`). |
| `mana` | show | Gains with a source spell: Life Tap, Judgement of Wisdom (logged with the resolving spell), potions, runes: "+1,622 Mana" (blue, `mana`). Regen ticks (no spell id, every 2 s) never. Gains below `mergeManaBelow` merge within 2 s. |
| `queue` | skip | The spell queue shows on the action bar. |
| `queue-drop` | skip | Nothing happened. |

From the snapshot (running fights only, stamped with the snapshot's fight time): "Name ready" (`cooldownReady`) when a tracked cooldown that was running reaches 0 (a cooldown at 0 from the start never fires); "Low Mana" (`lowMana`) once when mana drops below `lowManaPct` % of max mana, re-armed when it climbs back to `lowManaPct + 5` % (hysteresis: regen and casts around the threshold would otherwise repeat it).

### Which aura is what (`buildHudContext`, from the fight's data; no hook is run)

- **Unit**: the `on` of the aura's first scheduled entry, else of the first spell applying it (`applyAura`), else the target for an aura with a DoT tick or a damage-taken multiplier (hook-applied target auras: Shadow Vulnerability), else the player.
- **Proc**: a visible player aura that no spell applies and the fight does not schedule, so only a hook can apply it: set bonus procs (Flameshadow, Shadowflame, Lesser Spell Blasting, Insight), gear procs `item-buff:<id>` (Band of the Eternal Sage, Quagmirran's Eye's "Spell Haste" aura, shown with its setup entry's name: "Quagmirran's Eye!"). Item-use buffs (applied by their item action: the Icon, Destruction Potion) and timed buffs (Heroism) are "+Name" buffs. Backlash and Shadow Trance are not modelled as auras in the trainer (Backlash is a flat +3 % crit talent), so they have no text.
- **Whole fight at 0**: an aura scheduled at 0 (or before) with no duration override (raid debuffs on the target, 1 h; the pre-pull Chain of the Twilight Owl buff) gives no "+Name" at 0, whatever the settings. A timed buff scheduled at 0 (Heroism at 0 s: it has a duration) shows "+Heroism" at 0.
- **Ready notifications** track item actions and spells with a cooldown of at least 30 s (`HUD_READY_MIN_COOLDOWN_MS`): Curse of Doom (60 s) and every item action (potions, rune, on-use trinkets; a shared cooldown counts: after a Destruction Potion, "Super Mana Potion ready" when the shared 2 min ends). Shadowburn (15 s) and Conflagrate (10 s) are left out as noise.
- **Icons**: item icons (public/icons/items/) for ids the catalog marks `iconKind: 'item'` and the derived gear ids (`use-item-`, `item-buff:`, `item-icd:`), spell icons otherwise.

### Cursor, queue

- `HudCursor` = log index read so far, last snapshot time, next event id, last remaining cooldown per tracked spell, low-mana latch. Each entry is read once (a test feeds 10 000 entries one frame at a time and counts exactly 10 000 reads). A log shorter than the index, or a snapshot earlier than the last one, is a new fight: reading restarts at entry 0 with fresh cooldown and low-mana state; ids keep counting (unique React keys). Settings filter what is emitted, never the cursor state.
- `HudQueue`: merges ticks with the same key (`tick:<spell id>`) whose first tick is at most `mergeTicks` ms of fight time older (amounts summed, one text) and small mana gains within 2 s; at `maxTexts` it drops the oldest non-sticky text; a sticky text (crit, proc) is never dropped: when all texts on screen are sticky it waits (up to 100 waiting: only past that is the oldest waiting dropped) and comes up when one expires. Lanes: 3 per area, round robin, so consecutive texts of an area never share a lane. `expire(nowMs)` removes texts `durationMs` after they came up, in the caller's clock: CombatTextLayer passes the snapshot's fight time (1x real time while the fight runs).

### Settings (`rotation-trainer:hud:v1`, interface preferences, not part of the setup)

| Setting | Default | Range |
| --- | --- | --- |
| `enabled` | on | |
| `damage`, `crits`, `ticks`, `misses`, `buffsOn`, `buffsOff`, `procs`, `mana`, `itemUse`, `cooldownReady`, `lowMana` | on | |
| `targetDebuffs` | off | |
| `animation` | `straight` | `straight`, `parabola` |
| `durationMs` | 1600 | 600-4000 |
| `fontPx` | 16 | 10-32 |
| `critScale` | 1.5 | 1-2.5 (two decimals) |
| `showIcons` | on | |
| `showSpellNames` | off | |
| `minDamage` | 0 | 0-100000 |
| `mergeTicks` (ms, 0 = off) | 250 | 0-2000 |
| `mergeManaBelow` (0 = off) | 100 (Judgement of Wisdom's 74 merges) | 0-10000 |
| `maxTexts` | 24 | 4-60 |
| `lowManaPct` | 20 | 5-80 |

`normalizeHudSettings` takes each field only with the right type (booleans as booleans, finite numbers clamped and rounded, a known animation), own properties only (prototype pollution inert); everything else is the default. `loadHudSettings` / `saveHudSettings` never throw; text over 10 000 characters is ignored before parsing and never written.

### Rendering and wiring (`CombatTextHud.tsx`, `CombatTextSettings.tsx`, GameView)

- **Areas**: two absolutely positioned areas inside the arena, under its start and end overlays (the summary stays clean): Outgoing in the right half, top 62 % (texts rise 96 px, 80 px on phones); Notifications at the bottom left, in a 64 px band the arena keeps free under the target panel while the HUD is on (`.arena-hud` padding-bottom: the debuff list, two rows on a phone, never sits where a notification starts; texts rise 72 px / 60 px). Outgoing lanes are columns (22 %, 50 %, 76 % of the area); notification lanes a small indent. Start steps (`assignSteps`, up to `HUD_STACK_STEPS` = 6 lines up): a new text takes the lowest step at least one line from where every older text of its area (Outgoing: of its lane) is now, i.e. its step plus how far it has risen (linear, 96 / 72 px over its life, in lines of 1.25 x `fontPx`); so five texts born in one frame (Heroism at 0, the Icon, the potion and their buffs) start on five lines, and a text born 50-500 ms after another does not start on the risen one. A step is kept for the text's life. At 390 px the areas stay inside the arena (the HUD clips to it) and the font is 0.85 x; no horizontal scroll.
- **Animation**: CSS only, `transform` and `opacity` (`hud-rise` straight up; `hud-arc` a parabola: x follows 1 - (1 - t)^2 of a per-lane `--hud-arc`, y rises evenly); crits pop (scale 1.6 -> 1 in 240 ms on an inner span); the animation lasts the text's life (`durationMs`). `prefers-reduced-motion: reduce`: `hud-fade` (opacity only, no movement, no pop). `aria-hidden="true"`, `pointer-events: none`.
- **Colours** (`color-mix` in sRGB of the kind's or school's colour): light theme 62 % colour + black with a white outline: contrast against the white panel at least 3.50 (item beige 3.50, proc gold 4.17, ready 5.06, miss 5.56, buff on 5.62, low mana 6.27, holy 6.36, debuff on 6.88, debuff off 7.25, mana 7.33, buff off 8.24, nature 8.30, frost 8.63, fire 9.22, physical 9.85, arcane 10.06, shadow 12.31); dark theme 65 % colour + white with a black outline: at least 5.01 against the panel #201f27 (shadow 5.01, arcane 5.75, fire 6.20, physical 6.21, buff off 6.76, frost 6.73, nature 6.97, mana 7.63, debuff off 7.89, debuff on 8.11, low mana 8.36, holy 8.60, buff on 9.23, miss 9.60, ready 10.08, proc 11.65, item 13.41). Before: light theme unchanged colours (item 1.36, proc 1.66), dark 72 % (shadow 4.29).
- **Feeding**: `CombatTextLayer` owns the queue, the cursor and a local copy of the log; GameView only owns the settings (loaded once from the `hudStorage` prop, default the setup's storage, else localStorage; saved on change). Once per snapshot (one per animation frame while the fight runs) it appends `useSimulation`'s `logSince(copy.length)` to the copy (only the new entries are copied: O(new entries) per frame, not O(log)), extracts, pushes at the snapshot's fight time and expires; its state changes re-render only the HUD, never GameView (a test counts GameView renders with the HUD on and off: equal). Events older than `nowMs - durationMs` are dropped before the push: after a backgrounded tab the catch-up frame reads the whole gap, and only what would still be on screen comes up (no crits replayed for seconds). The first 'ended' snapshot of a fight reads the log once more (entries logged in the frame that ended it, e.g. Curse of Doom's tick at 60 s); snapshot events (ready, low mana) stay with the running fight, and nothing comes after. No timer per text: a text leaves when the queue expires it in the frame loop, or, after the fight (no frames any more), when its CSS animation ends (one native `animationend` listener on the HUD). A new fight (`useSimulation`'s `fightId`: R, or a not-started fight rebuilt by a setup change) or a fight not started clears the queue, the cursor and the copy. Turning the HUD off clears the queue (the cursor keeps reading, so nothing is replayed when it is turned on again).
- **Names**: an aura that comes from a setup entry is named like in "Your buffs" (the entry's name: "+Heroism / Bloodlust", not the aura's "Heroism").
- **Settings panel**: collapsed `<details>` after Gear; its body is rendered only while open (a collapsed panel adds no controls to the page). Number fields pass a value in range at once and clamp on blur; text-like fields swallow every key (ruling S5).
- **Known limits**: no per-area switches (spec §2.4 asked for areas; the plan's `HudSettings` has categories only) and no speed setting (a text travels its fixed rise in `durationMs`); the Incoming area is unused (the dummy never hits); no sounds. A sticky text (crit, proc) is dropped only in a flood of more than 100 waiting.


## Part H: simulator and item-use rules

Simulator Task 1 (2026-11-02; spec `docs/superpowers/specs/2026-11-02-simulator-design.md` §2 A). When the bot uses each item action is no longer fixed (Part D, "Priority steps"): `RotationConfig.itemUse` holds a rule per item action, `RotationConfig.itemUseOrder` their order, and `compileItemUse` (`src/data/classes/warlock/itemUse.ts`, pure) turns them into the item steps that `applySetup` puts at the start of the priority. The simulator itself (Tasks 2-3) is documented below as it lands ("Simulator core").

### Rules (`itemUse`)

Keys: the catalog entry ids of the item actions, `destruction-potion`, `super-mana-potion`, `dark-rune`, and the gear's on-use entries `item:<itemId>` (`item:<itemId>:<n>`). A rule is `{ trigger, notBeforeSec?, notAfterSec?, minGapSec? }`. Every condition below reads only the snapshot (and Heroism's end, a constant of the setup); the bot has no memory between steps.

| Trigger | Wanted when | Notes |
|---|---|---|
| `ready` | always | at the pull and whenever the cooldown allows |
| `pull` | `nowMs < 1500` (`PULL_WINDOW_MS`, one unhasted GCD) | the opening press only; once the window has passed, never again in the fight |
| `at` `sec` | `nowMs >= sec x 1000` | from that second on, whenever ready |
| `with-heroism` | Heroism's self aura is up (`selfAuras.heroism`) OR `nowMs >=` Heroism's end; always when the fight has no Heroism that comes up (disabled, or starting at or after the end) | the rule of Part D, unchanged |
| `with-buff` `auraId` | `selfAuras` has that own key (an aura id: `heroism`, `destruction-potion`, `item-buff:35163`, ...) | e.g. a trinket with another trinket's buff or proc; hidden auras (internal cooldowns) are not in the snapshot, so never match |
| `mana-below` `mana` | `mana < mana` | |
| `mana-missing` `amount` | `maxMana - mana >= amount` | the rule of Super Mana Potion and Dark Rune |
| `fight-end` `lastSec` | `durationMs - nowMs <= lastSec x 1000` | |
| `never` | never: no step at all | the action keeps its item slot (the player can press it) |

- **Window and gap.** `notBeforeSec` (`nowMs >= x 1000`) and `notAfterSec` (`nowMs <= x 1000`) bound every trigger; a time outside the window means the step is not wanted (the bot falls through to the next step), whatever the trigger says. `minGapSec`: the time since the last use is read as the item's own cooldown minus `cooldownRemainingMs` (a lower bound: a shared cooldown can only make the remaining time longer); the step is wanted only when that is at least the gap. A gap longer than the item's cooldown is capped at the cooldown: once the item is ready, a snapshot cannot tell how long ago it was used, and the rules keep no state (a rule must stay a pure function of the snapshot so that one compiled priority serves any number of fights). So `minGapSec` only matters inside the cooldown (e.g. it stops a press queued in the spell queue window before the cooldown has quite run out); "at most every 3 min" for a 2 min item cannot be expressed (UNVERIFIED as useful; the editor, Task 3, should explain it).
- **The queue gate stays.** Every step, whatever its rule, is wanted only when the press cannot replace a queued spell: no cast in progress, nothing queued, or the item itself queued (Part D). `ready` therefore means "whenever ready and the press is free".
- **Order.** Item steps stand before the rotation (they are off the GCD). Default order: the bound actions in catalog order, then the gear's (as before). `itemUseOrder` lists entry ids that go first, in that order; actions it does not list follow in the default order; unknown or repeated ids are ignored.
- **Rules of entries that are not bound actions** (an item not worn, not enabled, or past the 6th item slot) are ignored at apply time and kept in the config (like `enabledBuffs`).

### Defaults (`DEFAULT_ITEM_USE`)

The rules of Part D, reproduced exactly: Destruction Potion and every gear on-use item `with-heroism` when the fight has Heroism, otherwise `ready` (the same steps: `with-heroism` without Heroism is always wanted); Super Mana Potion `mana-missing` 3000 and Dark Rune `mana-missing` 1500 (their largest gains). `buildItemSteps` (itemRules.ts) is now a thin wrapper, `compileItemUse(actions, { itemUse: DEFAULT_ITEM_USE(actions, heroismEndMs) }, { heroismEndMs })`, with the same labels and hints. Proof (`tests/data/item-use.test.ts`, `tests/setup/item-use-setup.test.ts`, fixtures `tests/fixtures/item-use-reference*.ts`): captured at c121206, the bot logs (hash and length), means and RNG draw counts for seeds 1-10 at queue windows 400 and 0 of the default setup, Icon + Band, `raid-log`, the three consumables with and without Heroism, a 300 s fight and a Quagmirran's Eye + Scryer's Bloodgem gear are identical; the item steps (ids, labels, hints, `when()` over 5000 random snapshots) equal both the capture and a literal copy of the old code. Golden means unchanged: 1425.1766666666667 / 1428.3350000000003 (default), 2294.108333333333 (`raid-log`), 1379.2966666666666 / 1373.4900000000002 (Icon + Band).

### Stored configs and limits (`normalizeSetup`)

- A config without `itemUse` / `itemUseOrder` (everything saved before, the presets) stays without them: the defaults are applied by `applySetup`, never written back, so storage and preset matching are unchanged.
- Present: only own keys that are catalog entries with an item action or well-formed gear effect ids (worn or not; prototype keys such as `__proto__` never pass); unknown trigger kinds, missing or non-finite parameters drop the rule (the default applies); seconds (`sec`, `lastSec`, `notBeforeSec`, `notAfterSec`, `minGapSec`) are clamped to 0-3600 and rounded to whole ms, mana (`mana`, `amount`) to 0-100 000 and rounded; `with-buff` takes an aura id of `[a-z0-9:-]`, up to 64 characters; at most 32 rules (the first ones) and 32 order entries (each id once). Never throws (throwing getters and proxies give no rules); idempotent.
- **Setup identity.** A rule equal to its default in every fight (no window or gap; `with-heroism` for Destruction Potion and the gear's items; `mana-missing` at the item's largest gain for Super Mana Potion and Dark Rune) is dropped, and an empty result leaves the field absent, so spelling out the defaults still matches "None" / "Raid as in my log" (the panel's preset matching normalizes and compares the rotation, `itemUse` included). Any other rule, and any `itemUseOrder`, is part of the identity ("Custom"; an order equal to the default order also counts as Custom: the default order depends on the gear, which the normalizer does not know). `ready` without Heroism behaves like the default but is kept (turning Heroism on later would otherwise change its meaning). The rotation preset select ignores `itemUse`.

### Simulator core (`src/sim-runner/`, simulator Task 2)

`simulate(request, { chunk, onProgress, signal })` plays the request's setup `runs` times with the bot and aggregates the results. Framework-free (no DOM, no React, no wall clock); the item database comes in with the request (the core never loads it).

- **One fight = the game's fight.** `prepareRun` applies the setup once exactly as GameView does (`applySetup` with `STATIC_SETUP_CATALOG`; the spec built with the database only when there is a gear and a database). Each run builds a fresh `Simulation` through `createFightSimulation` (`src/sim-runner/fight.ts`: boss target, real mana, the setup's scheduled auras, distance and fight length, the request's spell queue window), the same helper `useSimulation` now calls with a fresh seed and the 400 ms window, and plays it with `runBot` (10 ms steps). So run `i` is the game's fight with seed `mixSeed(seed, i)` played by the bot. Tests: the sample equals a hand-built fight + `runBot` exactly (DPS and damage); seeds 1-10 through the core reproduce every pinned scenario mean of Task 1 exactly, golden 1425.1766666666667 / 1428.3350000000003 included.
- **Seeds.** `mixSeed(seed, i)`: z = (seed + (i + 1) x 0x9e3779b9) mod 2^32, then the MurmurHash3 fmix32 finalizer (z ^= z >>> 16; z x= 0x85ebca6b; z ^= z >>> 13; z x= 0xc2b2ae35; z ^= z >>> 16), unsigned. Both steps are bijections of 32-bit integers, so one request's runs get distinct seeds, and neighbouring runs get unrelated streams (mulberry32 seeded with s and s + 1 would not). Pinned by literal values (`tests/sim-runner/run.test.ts`): `mixSeed(0, 0)` = 2462723854, `mixSeed(0, 1)` = 1020716019, `mixSeed(1, 0)` = 2527132011, `mixSeed(12345, 0)` = 1200724404, `mixSeed(12345, 99999)` = 2430907145, `mixSeed(4294967295, 7)` = 1650816001; changing it changes every result. Decorrelation sanity (final review): over 200 000 consecutive runs of one base seed the seeds are all distinct, every bit is set 49.2-50.4% of the time, the lag-1 correlation of seed / 2^32 is 0.0009, and over 200 000 neighbouring base seeds (run 0) it is -0.004. The per-run seed is a pure function of the base seed and the run index, so run `i` alone equals run `i` in any batch, and the result does not depend on the chunk size (byte-equal JSON for chunks 1, 7, 1000: samples are aggregated in index order).
- **Request limits.** `runs`, `seed`, `spellQueueWindowMs` must be finite numbers, otherwise a TypeError naming the field (NaN, Infinity, strings, missing). `runs` is rounded and clamped to 1-100 000; `seed` truncated and reduced modulo 2^32 (`>>> 0`, so -1 is 4294967295); the window rounded and clamped to 0-1000 ms. A request that is not an object or whose fields throw, and a `db` that is not an item database (object with `items`, `gems`, `enchants`), are TypeErrors. The setup goes through `normalizeSetup(setup, SETUP_CATALOG, db)` like stored data: garbage gives the default setup. A gear the embedded author tables cannot build (`gearNeedsDb`) without a `db` is an Error (the game plays the author's gear until the database loads; a simulator result must not silently be another gear's). Every run is bounded (fight at most 600 s, at most 100 000 runs), so nothing hangs.
- **Per run, from the log (the log is dropped after the run).** Per spell id, item actions excluded: direct damage (`damage` events), tick damage (`tick`, keyed by the source spell, or the aura id without one), completed casts (`cast-complete`; a Shadow Bolt still flying at the end counts as a cast with no damage), hits (direct damage events), crits, misses. Item uses: `cast-complete` of item actions, by action id (`use-destruction-potion`, `use-item-29370`, ...). Life Taps: `cast-complete` of `life-tap`. Uptime of every aura that is not `hidden` (target DoTs and debuffs, player buffs): from an `aura-apply` (a refresh applies again without a fade and is ignored) to its `aura-fade`, or to the fight's end when still up (a fade after the end never runs). Mana spent: start mana (max mana with the auras applied at 0, read once from a started Simulation) + every logged gain (`mana`: regen, Life Tap, potions, hooks) - the mana at the end; this equals the sum of the completed casts' costs (tested for the default setup), except when a self aura that raised max mana fades with the bar above the new maximum (the engine clamps without a log: counted as spent; no current buff does this, UNVERIFIED for future gear).
- **Statistics.** DPS per fight = the engine's `dps` (damage up to the end / fight length). Mean and variance: Welford's online update (count, mean, M2), sample variance M2 / (n - 1), σ = its square root, 0 for one run (never NaN); tested against a two-pass reference (1e-9 relative) and on 100 000 values around 1e9 where the naive sum of squares fails. Standard error of the mean SEM = σ / sqrt(n); 95% CI = mean -+ 1.96 SEM (normal approximation; fine for n of 30 or more, optimistic for a handful of runs). σ is the spread between single fights (what one pull may give), SEM the uncertainty of the mean (what comparing two setups needs).
- **Percentiles and histogram.** Every run's DPS is stored in a Float64Array of `runs` values (800 KB at 100 000), sorted once at the end: percentiles are exact, linear interpolation between the closest ranks, h = (n - 1) p, x[floor h] + (h - floor h)(x[floor h + 1] - x[floor h]) (Hyndman-Fan type 7, R's and NumPy's default); median = p50; min and max exact. Histogram: 40 equal bins from min to max, bin k = [min + k w, min + (k + 1) w), the last bin also holds max; all values equal: one bin of width 0.
- **Per spell, items, uptimes.** Means over the runs (sums / n, in order of first appearance). `share` = the spell's total damage over all runs / the total damage of all spells (direct + ticks; shares sum to 1; Life Tap and Curse of the Elements have 0). Item uses: mean uses per fight. Uptime: mean fraction of the fight. The result also carries display names (`labels`) and the settings it came from (`runs`, `seed`, `spellQueueWindowMs`, `fightMs`).
- **Chunks, progress, abort.** Runs go in index order in chunks (default 50); after each chunk `onProgress(done, runs)` and a `setTimeout(0)` yield. Abort: the signal is checked before the first run, after each progress call and after each yield; an aborted simulation rejects with a DOMException named `AbortError` and no partial result (the panel keeps its previous result), and nothing runs or reports afterwards. Nothing is registered on the signal (no listener to leak).
- **Cost (development container, Node 22).** First version: about 15 ms per default run, nearly all of it the bot (a full `snapshot()` and a walk of the priority every 10 ms: 12 000 snapshots per 60 s fight). Performance wave (same Task): (1) the bot skips the steps at which no press can be accepted: after its walk it asks the engine for `nextPressOpportunityMs()` (read-only; a lower bound on when any `cast()` could be accepted or queued: the cast in progress's end minus the queue window, else the GCD end minus the window for on-GCD spells and the cooldown ready time for item actions; these change only when a cast starts or completes, so events in between cannot lower it) and advances straight to the first 10 ms grid time at or after it. A skipped step would have rejected every press (a rejected press changes nothing), a snapshot changes nothing, and one `advanceTo` over several steps runs the same events in the same order, so the fights are identical; (2) the ready check after the walk reads `currentPhase()` instead of building a second snapshot; (3) `snapshot()` caches the per-spell `manaCost` / `castTimeMs` until the stats and modifiers are rebuilt (output unchanged, fresh objects every call). Proof: `tests/bot/bot-equivalence.test.ts` pins 23 scenarios (Task 1's seven, all 9 gear presets with every item effect, Heroism and the three consumables, sb-spam at 60 s and 300 s, a Life Tap threshold at 40 yd, item rules `at` / `mana-below` / `fight-end` / `with-buff` / `pull` / `never` with windows, gap and order, a 10 s fight, Quagmirran's Eye at 300 s) x seeds 1-10 x windows 400 and 0 against a capture made with the stepping bot before the change (log hash and length, RNG draws, means: golden values included), compares live with a literal copy of the old bot at windows 0, 1, 150, 399, 400, 1000 and steps 1, 2.5, 7, 10, 33, 100 ms (full logs, results, draws, final snapshots), and checks that walking every 1 ms no press is ever accepted before the bound; moving the bound 10 or 20 ms later makes 23-24 of these tests fail. Now: default 60 s about 1.2 ms per run (was 15.6), the 300 s default fight about 6.3 ms (was 79), `raid-log` about 2.6 ms (was 24.6); 1000 default runs about 1.2 s, 100 000 about 110 s (1.1 ms per run). What remains is mostly the snapshots inside the spell queue window (the bot walks every step there: a queued spell can be replaced by an earlier step) and the GCD gaps. Memory for 100 000 runs: the 800 KB DPS array plus about 35 KB of sums; heap peak 25 MB during the run (per-run garbage), 8 MB after; the result is about 2 KB of JSON. 100 000 default runs (seed 4242): mean 1393.51, σ 137.98, SEM 0.44.
- **Reference numbers (default setup, window 400).** 5000 runs (seed 4242): mean 1390.75, σ 137.4, SEM 1.94, 95% CI [1386.9, 1394.6], p5 1165, median 1388, p95 1620, min 973, max 1906; 1.00 Life Taps and 10 311 mana per fight; uptimes Curse of the Elements 99.96%, Corruption 86.9%, Immolate 75.0%, Shadow Vulnerability (ISB) 60.4%; shares Shadow Bolt 79.6%, Corruption 9.0%, Immolate 8.8%, Shadowburn 2.6%. The bot test's mean over seeds 1-10 (1425.18) is 0.8 of its own standard error (about 43) above this; its estimate `EXPECTED_DPS` 1448 is 4.1% above (the band [1274, 1622] still holds the long-run mean). The core's test therefore checks the 200-run mean against the seeds 1-10 mean within 3 combined standard errors, and inside the band, not against 1448.

### Worker and fallback (`src/sim-runner/worker.ts`, `client.ts`, simulator Task 3)

- **Worker.** `runSimulation(request, { onProgress, signal })` starts one module worker per run, `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`; Vite bundles it as its own chunk (`dist/assets/worker-*.js`, about 83 kB: the engine, data, setup and core; no React, no DOM, no item database). Vite's default worker format is kept (no `vite.config.ts` change): the chunk is a self-contained script, valid as a module worker. Protocol (structured clone, plain data): `{ type: 'run', request }` in; `started`, `progress { done, total }` after each chunk of 100 runs, `result`, or `error { name, message }` (an invalid request: `prepareRun`'s TypeError) out. The worker is terminated on the result, on an error and on Cancel (abort: the promise rejects with an AbortError and late messages are ignored).
- **Item database.** The panel adds `request.db` only when the gear needs it (`gearNeedsDb`); it is the database GameView loaded with `loadItemDb` (the panel never loads it; `dbSync` is test-only). While a gear that needs it is still loading (or failed to load), Run is disabled with a note: a gear is never simulated without the database it needs.
- **Fallback.** No `Worker` (Node, jsdom, old browsers), a throwing constructor, a request that cannot be cloned, or an `error` event before the worker's first message (its script failed to load): the same `simulate()` runs on the main thread in chunks of 10 runs yielding with `setTimeout(0)` (about 12 ms of default fights per chunk). `simulate` is independent of the chunk size, so worker and fallback give the same result (unit test with the real handler behind a mocked Worker; in Chromium, 2000 runs seed 4242: 1395.4 both ways). An `error` event after the worker started rejects (no second run).
- **Measured (Chromium headless, `vite preview`, development container).** 2000 default runs: about 2.4 s in the worker with no main-thread gap over 50 ms (a 20 ms heartbeat timer; a 300 ms busy loop shows as a 304 ms gap); typing into a field and opening another panel during the run answered in 150 ms and 70 ms. The fallback took 3.0 s with gaps up to 59 ms. Main chunk 386.5 -> 415.9 kB (gzip 120.7 -> 130.3 kB) for the panel, the editor and the fallback core; since the final review the panel's default runner is a dynamic `import('../sim-runner/client')` on the first Run (`lazyRunSimulation`; the request limits moved to `src/sim-runner/limits.ts` so the panel needs nothing else from the core), so the client and the core are a separate 8.0 kB chunk (gzip 3.4 kB) and the main chunk is 408.1 kB (gzip 127.4 kB). A chunk that fails to load rejects the run: the panel shows the error and keeps its previous result.

### Simulator panel and item-use editor (UI, simulator Task 3)

- **Snapshot.** Run takes the next fight's setup object at the click (configs are never mutated) and labels the result with it: gear preset name or Custom, setup preset name or Custom, rotation summary (curse, DoTs, finisher, Life Tap), item rules default/customised, fight length, spell queue window (400 ms, the game's), runs and seed. A setup changed during a run does not change that run (decision: the run is not cancelled; the label says what it was). Running disables nothing in the game. A cancelled or failed run keeps the previous result. The result is not saved.
- **Inputs.** Runs: rounded and clamped to 1-100 000 on blur (invalid text: the last valid value). Seed: blank = `Math.random()` (the only use, in the UI), else truncated and clamped to 0-4294967295. The time estimate is runs x 1.2 ms x (fight length / 60 s): an estimate (items, a 300 s fight and the raid preset cost more per second, Part H "Cost").
- **Progress.** The bar follows every progress message; the polite status text changes at most once per second (with the time left from the measured rate).
- **Result.** As `SimResult` (above): mean, σ, SEM, 95% CI, min, max, median, p5/p25/p75/p95, the 40-bin histogram (one `role="img"` with a text summary, no per-bar focus stops), per spell (share, mean damage, mean casts, crit = crits / hits, miss = misses / casts), item uses, uptimes, mana spent, Life Taps; Copy result (clipboard, else the text shown selected). The panel's note explains σ (spread between fights) vs the standard error of the mean and the model's limits.
- **Item-use editor.** One row per enabled item action that gets an item row slot and has a bot rule (catalog order, the gear's on-use items from `setupCatalogFor(gear, db)`), in the bot's order. Trigger select with its parameter (seconds 0-3600, mana 0-100 000, a buff: Heroism and the enabled items' visible self auras, not the row's own), optional `notBeforeSec` / `notAfterSec` (an emptied field removes it), up/down, per-row Reset (removes the stored rule) and "Reset all item rules to default" (removes `itemUse` and `itemUseOrder`). Every edit goes through `normalizeSetup` (a rule equal to its default is dropped there); an order equal to the default order is removed by the editor, so moving an item up and back down keeps the preset identity. `minGapSec` is not offered (it only acts inside the item's own cooldown, see "Window and gap"); a stored one is kept and shown in the row's summary. The rotation preset select and the setup preset buttons keep `itemUse` / `itemUseOrder` (the presets define none); since the rules are part of the fight, the preset then reads "Custom", and the panel adds which preset the rest of the setup matches.

### Bot step skipping: proof summary

`runBot` (src/bot/bot.ts) used to take a snapshot and walk the priority every 10 ms of fight time. Since the performance wave it walks the priority at a step, then asks the engine for `nextPressOpportunityMs()` and advances straight to the first time on the same grid (`now + k x stepMs`, k >= 1) at or after it. The fights are exactly those of the 10 ms walk, for four reasons:

1. **The bound is a true lower bound.** No `cast()` of any spell can be accepted or queued before it, whatever events run meanwhile (a cast in progress: every spell is `busy` until its end and its queue block ends no earlier, so nothing is accepted before end - window; no cast: an on-GCD spell gets `gcd` and cannot be queued before GCD end - window, an off-GCD item action gets `cooldown` until its ready time; a queued spell or the `ready` / `ended` phase: now). Its inputs (the cast's end, the GCD end, the cooldowns) change only when a cast starts (through `cast()` or the queue, which the bound covers) or completes (at the cast's end, at or after the bound); hooks and auras change stats, mana and auras, never the GCD end or a cooldown.
2. **A skipped step would have done nothing.** Every press there would have been rejected, and a rejected `cast()` changes nothing (no log, no state); taking a snapshot changes nothing either (lazy aura expiry finds nothing to drop: every fade at or before now has already run).
3. **One long advance equals many short ones.** `advanceTo(t)` runs every event up to t in the same order whatever the intermediate stops; the per-stop `syncSelfStats` is a no-op between events (the aura set only changes at event times, where it is synced anyway).
4. **`when` conditions are pure functions of the snapshot.** They are not called at the skipped steps, so a condition with a side effect or a counter would see fewer calls and could change the fight. This is a rule for every priority step (rotation.ts, itemUse.ts: they read only the snapshot and constants compiled from the setup) and is stated in the bot's doc comment. A fractional `stepMs` keeps the old one-step walk (`advanceTo` floors times and the grid would drift).

Evidence: the pinned 23-scenario capture and the live comparison with a literal copy of the old bot (above, "Cost"); a lower-bound property test walking every 1 ms; mutation checks (a bound 10 or 20 ms too late fails 23-24 tests). Final review, independently: 10 new random scenarios (random gear preset or the author's gear x DoT or SB-spam variants with every curse, Life Tap thresholds, random raid buffs and consumables, Heroism at 0-75 s, distance 0-40 yd, fights of 25-420 s, windows 0-1000 ms), played (a) by c121206's full code (old engine, old bot, old item rules; item rules stripped) against HEAD with default rules, 100 fights, and (b) by HEAD's setup code with c121206's engine and bot against HEAD, with a hand-written item rule per item covering every trigger kind, windows, gaps and orders, at steps 10, 7 and 1 ms, 300 fights: full logs (SHA-256 of the JSON), log lengths, RNG draw counts, DPS and final snapshots all identical. The per-spell snapshot cache is checked against an uncached recomputation at every ms of a fight with Heroism, Quagmirran's Eye's haste proc, Scryer's Bloodgem, Destruction Potion and a Backlash-style instant-cast aura (`tests/engine/sim-snapshot-cache.test.ts`; removing the invalidation fails it).

### Measured cost

Development container, Node 22 (core) and headless Chromium (`vite preview`, worker), default setup, window 400 ms:

| Case | Cost |
|---|---|
| default 60 s, Node | about 1.1-1.2 ms per run (was 15.6 before the performance wave) |
| default 300 s, Node | about 6.3 ms per run |
| `raid-log` preset, Node | about 2.6 ms per run |
| 1000 default runs, Node | about 1.2 s |
| 100 000 default runs, Node (seed 4242) | about 110 s (136 s in the final review with other jobs running; mean 1393.51, σ 137.98, SEM 0.44 both times); DPS array 800 KB (array buffers peak 825 KB), heap 7.6 MB before, peak 27 MB (per-run garbage), 8.6 MB after; result about 2.4 KB of JSON |
| 10 000 default runs, Chromium worker (seed 99) | 9.7 s; no main-thread heartbeat gap over 32 ms; another panel opened in 76 ms during the run; page heap 5.0 -> 5.3 MB |
| 300 default runs, Chromium worker / main-thread fallback | equal to the Node core byte for byte (worker: the full result JSON; fallback: the copied result text); fallback 1.0 s with gaps up to 91 ms |

The panel's estimate uses 1.2 ms per 60 s fight, scaled by the fight length; heavier setups (many items, the raid preset) cost more per fight second.

### What the model leaves out

The simulator is the bot playing the trainer's model, so it inherits every limit of the model ("What the DPS excludes", Parts A-G) plus the bot's:

- The bot has perfect reactions: it presses on a 10 ms grid with the 400 ms spell queue window, never misclicks, never waits, and always follows the priority (it does not plan ahead, e.g. it does not hold a cooldown for a later burst unless a rule says so).
- One target, standing still, no movement, no health or execute phase except the fight's end, no interrupts, no threat, no deaths; the fight length is fixed.
- Raid buffs and debuffs are constant (or scheduled like Heroism), not tied to other players' actions; procs and effects the trainer does not model are absent.
- The item rules are pure functions of the snapshot: they cannot remember past uses ("at most every 3 min" for a 2 min item cannot be expressed; `minGapSec` only acts inside the item's own cooldown).
- The statistics describe the bot's DPS distribution for that setup: σ is the spread between single fights, the standard error and 95% CI (normal approximation, mean -+ 1.96 SEM) the uncertainty of the mean of the simulated runs, not of the model. Results are for comparing setups, not an absolute DPS forecast.

### Final review (simulator Task 4)

Checks run on the whole feature (c121206..HEAD), beyond the unit tests: the equivalence runs and cache test above; a recomputation of mean, σ (n - 1), SEM, the CI, min, max, median, p5/p25/p75/p95 and the 40-bin histogram with Python (`statistics`, NumPy type 7 percentiles and `histogram`) from the per-run DPS of 500 runs rebuilt by hand (`Simulation` + `runBot` with `mixSeed` seeds) for two setups (largest relative difference 7e-16; histograms identical), plus 1 and 2 runs (σ 0 and SEM 0 for one run; one bin of width 0 when all equal); 3000 random hostile stored `itemUse` / `itemUseOrder` values (wrong kinds, NaN, Infinity, strings, throwing proxies and getters, `__proto__` keys, 50 000-entry orders) through `normalizeSetup` (never throws, idempotent, JSON-safe, at most 32 rules) and 30 of them through a fight; every trigger kind in a scripted 300 s fight; hostile messages sent straight to the built worker (garbage, no request, NaN runs, a non-database `db`, a 17-slot gear of unknown ids with an empty database, out-of-range numbers): each gives a clear `error` message or a clamped result, none hangs. Playwright end to end: the 300-run and 10 000-run worker results equal the Node core exactly; Cancel mid-run terminates the worker and keeps the previous result; changing the curse during a run does not change the result (the original setup's, labelled with it); a reload during a run leaves no errors; typing 1, Space, z and r in the Runs field starts no cast. Fixed: `normalizeItemUse` now skips an own `__proto__` key itself (it relied on the id check; a permissive check would have set the result's prototype); the panel's runner is loaded lazily (above).

## Part I: talents

Stage 2b (plan `docs/superpowers/plans/2026-11-03-talents-stage-2b.md`, spec `docs/superpowers/specs/2026-11-03-talents-stage-2b-design.md`). Task 1: the tree data, the talent string codec and validation (below). Tasks 2-5 add their sections.

### Tree data (`src/data/classes/warlock/talentTree.json`)

- Source: github.com/wowsims/tbc-new `master` @ `91f869a` (MIT licence), `ui/sim/talents/trees/warlock.json`: 3 trees (Affliction 21, Demonology 22, Destruction 21 talents = **64**). Per talent: `fieldName` (our `id`), `fancyName` (`name`), `location.rowIdx`/`colIdx` (`row`/`col`, 0-based, rows 0-8, columns 0-3), `maxPoints` (`maxRank`), `spellIds` (`wowheadIds`, one TBC spell id per rank) and, for 10 talents, `prereqLocation` (resolved to the talent id in that cell: `prereq`). The JSON has no icon names.
- Order: the per-tree order of the JSON is the talent string order; it equals proto/warlock.proto `WarlockTalents` fields 1-64 (the generator checks it, after converting snake_case to camelCase) and the hand-written `TALENT_ORDER` of `talents.ts` (the test checks it).
- Prerequisites (from `prereqLocation`): Curse of Exhaustion <- Amplify Curse; Shadow Mastery <- Siphon Life; Unstable Affliction <- Contagion; Master Summoner <- Fel Domination; Master Demonologist <- Unholy Power; Soul Link <- Demonic Sacrifice; Pyroclasm <- Intensity; Ruin <- Devastation; Conflagrate <- Improved Immolate; Shadowfury <- Shadow and Flame.
- Icons and descriptions: Wowhead TBC tooltip API, `https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5&locale=0`, for each of the 184 rank spell ids. The talent's `icon` is the rank 1 tooltip's `icon` (63 distinct names: Improved Corruption and Empowered Corruption share `spell_shadow_abominationexplosion`). `descriptions[rank - 1]` is the text of the tooltip's `<div class="q">` blocks with HTML comments and tags removed, `<br>` as a space, entities decoded and whitespace collapsed. **0 of 184** ranks came back without a description (the test pins the count; an unavailable tooltip would be an empty string). Every Wowhead name equalled the wowsims `fancyName`. Talents that teach a spell (Shadowburn, Conflagrate, Shadowfury, Siphon Life, Dark Pact, ...) show the tooltip of their rank 1 spell, with Wowhead's level-scaled numbers for that rank (e.g. Shadowburn "91 to 104 Shadow damage"): text for the UI, never used for game numbers.
- Generator: `npm run talents:build -- <path to a tbc-new clone> [--refresh]` (`scripts/build-talent-tree.mjs`). It reads only JSON/text from the clone (the tree JSON, `proto/warlock.proto`, `.git/HEAD`), never runs its code, checks every field (types and ranges, 3 trees of 21/22/21, 64 proto fields in the same order, prerequisites in a higher row of the same tree, one talent per cell, row/column order) and exits 1 on any difference, on a missing clone (usage error: exit 2) or when a talent's icon cannot be resolved. Tooltips: one request at a time, 250 ms apart, 3 attempts with 1 s / 3 s backoff. Without `--refresh` it reuses the descriptions and icons already in the committed JSON (by spell id) and asks only for new ids, so a normal run makes no request; both a plain run and a `--refresh` run (184 requests) reproduced the committed file byte for byte. Output: one talent per line, fixed key order, 33 631 bytes, with a `source` field. Since Task 3 the descriptions are written to a second file, `talentDescriptions.json` (see "Bundle (Task 3)" below).
- Bundle: `talentTree.ts` builds its indexes on first use, so a bundle that never calls the codec leaves the data out (the Task 1 build is byte-identical to the previous one).

### Talent string

- Format: `affliction-demonology-destruction`, one digit (the rank) per talent in tree order. `encodeTalents` always writes every tree at full width (21/22/21 digits, **trailing zeros kept**), which is the WowSimsExporter form of the author's build: `encodeTalents(decodeTalents(destructionTalentString).ranks)` equals `000000000000000000000-2050130133200100000000-555000512200013330050` byte for byte. wowsims' presets trim trailing zeros (`-20500301332101-50500051220051053105`); `decodeTalents` accepts any tree shorter than its talent count (missing trailing digits are 0) and empty trees, like `parseTalentString`. Surrounding whitespace is ignored (a pasted string); nothing else is.
- `parseTalentString` (and `talentRank`, `destructionTalentString`) are unchanged: it still throws on a malformed string and is used only on the trusted constant. Untrusted strings go through `decodeTalents`. `TALENT_ORDER` is now exported (unchanged list). `talents.ts` re-exports the codec.
- `decodeTalents(text)` never throws: a non-string, a string over **200** characters, not exactly 3 trees, a tree with more digits than talents, or any character other than `0`-`9` gives all-zero ranks, points `[0, 0, 0]` and one format error. A well-formed string gives every talent's rank as read (a digit above the maximum is kept, e.g. `9-9-9`) and the rule violations as `errors`. `encodeTalents(ranks)` clamps what a string cannot hold (ranks to 0..maxRank, malformed ranks 0, unknown keys dropped), so re-encoding is idempotent for any input.

### Rules (`validateTalents`, `canAddPoint`, `canRemovePoint`)

TBC rules (Wowhead TBC talent calculator): 61 points at level 70 (`TALENT_POINTS_MAX`); a talent in row N (0-based) needs 5 x N points spent in **the rows above it** in its tree (points in its own row or lower rows do not count: this cumulative form is exactly the in-game "points spent when the point was added" rule for any order of adding); a talent with a prerequisite needs the prerequisite at its maximum rank.

- `validateTalents(ranks | string)` lists every violation (an empty list = valid), in this order: unknown talents; per tree, per talent in string order: malformed rank, rank above the maximum, row requirement, prerequisite; then the total. The list stops after 20 entries plus one `... and N more problems.` line. Rank maps are untrusted: only own keys are read (an inherited `suppression` is ignored; `__proto__`/`constructor` own keys are unknown talents), a non-object or an array is refused, and a map that throws when read (a proxy, a getter) gives `Talent ranks could not be read.`.
- `canAddPoint(ranks, id)`: refused when the talent is unknown, at its maximum, all 61 points are spent, the row requirement is not met, or the prerequisite is not at full rank. `canRemovePoint(ranks, id)`: refused when the talent has no points, a talent with points has it as its prerequisite (dependants first), or, with the point removed, some talent with points in a lower row of the same tree would have fewer than 5 x row points above it (the first such talent in string order is named). Both read ranks clamped to 0..maxRank and answer `{ ok: true }` or `{ ok: false, reason }`.
- Messages (stable English strings for the UI; names and keys in messages are limited to 40 printable ASCII characters):

| Case | Message |
|---|---|
| not a string | `Talent string must be text.` |
| too long | `Talent string is too long (<n> characters, at most 200).` |
| tree count | `Talent string needs 3 trees separated by '-' (got <n>).` |
| too many digits | `<Tree>: <n> digits, the tree has <m> talents.` |
| bad character | `<Tree>: unexpected character '<c>' at position <i>.` (`U+XXXX` when not printable ASCII) |
| ranks not an object / unreadable | `Talent ranks must be an object.` / `Talent ranks could not be read.` |
| unknown talent | `Unknown talent '<key>'.` (`Unknown talent.` for a non-string id) |
| malformed rank | `<Talent>: rank must be a whole number from 0 to <max>.` |
| above maximum | `<Talent>: rank <r> is above the maximum <max>.` |
| row requirement | `<Talent> needs <5N> points in <Tree> rows above it (has <n>).` |
| prerequisite | `<Talent> needs <Prereq> at full rank (<r>/<max>).` |
| total | `Too many points: <n> spent, at most 61.` |
| add: maximum / budget | `<Talent> is at its maximum rank (<r>/<max>).` / `All 61 talent points are spent.` |
| remove: none / dependant / row | `<Talent> has no points to remove.` / `<Dependant> depends on <Talent> at full rank.` / `<Talent below> needs <5N> points in <Tree> rows above it: <Talent> is one of them.` |

- Checked strings: the author's build (0/21/40, 61 points) and the 5 wowsims presets of `ui/specs/warlock/dps/presets.ts` (Affliction, Demo/Ruin, Demonology Felguard, Destro/Nightfall, Destruction) validate with no error and at most 61 points; each can be built point by point with `canAddPoint` in row order and taken apart with `canRemovePoint` from the deepest row.

### Icons

`npm run icons` downloads the 63 distinct talent icons from `https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg` into `public/icons/talents/` (sequential, 150 ms apart, 3 attempts; only files starting with the JPEG signature are written; present files are kept; exit 1 on a missing icon or over budget). 122 191 bytes in total, budget 150 000 (checked by the script and by `tests/data/talent-tree.test.ts`, which also checks that the folder holds exactly the talent icons). `talentIconPath(icon)` gives `icons/talents/<icon>.jpg`, relative to the app's base URL (the UI prefixes `import.meta.env.BASE_URL`, like `itemIconUrl`).

### Talent effects (Task 2: `src/data/classes/warlock/talentEffects.ts`)

Every talent is in exactly one of two tables (tested): `TALENT_EFFECTS` (its effect at a rank in the engine's primitives: spell modifiers, stat multipliers, aura overrides, hooks, available spells, `armorMult`) or `UNMODELLED_TALENTS` (the reason). `effectsForBuild(ranks)` is pure and never throws: own keys only, unknown keys ignored, integer ranks clamped to 0..maxRank, anything else 0; every call returns new arrays and objects (the hook objects are shared, frozen and stateless so equal builds have the same `hooks`). Effects apply in tree order Destruction, Affliction, Demonology, which reproduces the stage 1 modifier list of the author's build exactly (same objects' values, same order, same floats: pinned literally in `tests/data/talent-effects.test.ts`, with every bot log and golden mean unchanged). Sources: wowsims tbc-new @ 91f869a `sim/warlock/talents.go` (function named), `spell_data_auto_gen.go` (rank values), `core/debuffs.go`, `armors.go`, `lifetap.go`; checked against the Wowhead TBC tooltips (the tree's descriptions).

**Modelled (24; Suppression since Task 3)**

| Talent | Per rank (max) | Primitive | Source |
|---|---|---|---|
| Improved Shadow Bolt | debuff x(1 + 0.04 r) (5: x1.2) | hook on a Shadow Bolt crit + `shadow-vulnerability` aura (5/5 = auras.ts def; lower ranks replace it) | applyImprovedShadowBolt, core/debuffs.go ImprovedShadowBoltAura; Wowhead 17803 |
| Cataclysm | mana cost x(1 - 0.01 r) (5: x0.95) | Destruction spells | applyCataclysm |
| Bane | -100 ms x r (5: -500) | Shadow Bolt, Immolate (Soul Fire part: no Soul Fire) | applyBane |
| Devastation | +r% crit (5: +5) | Destruction spells | applyDevastation |
| Shadowburn | the spell | available + bar slot 5 | applyShadowburn |
| Improved Immolate | direct x(1 + 0.05 r) (5: x1.25) | Immolate direct only | applyImprovedImmolate (WarlockSpellImmolate, not ImmolateDot); Wowhead "initial damage" |
| Ruin | crit bonus +0.5 (x2.0) | Destruction spells | applyRuin |
| Emberstorm | fire x(1 + 0.02 r) direct and periodic; Incinerate -2% x r of 2500 ms | | applyEmberstorm |
| Backlash | +r% crit (3: +3) | all spells (proc not modelled: needs incoming hits) | applyBacklash |
| Conflagrate | the spell | available + bar slot 8 (ruling R17 closed) | applyConflagrate |
| Shadow and Flame | coefficient +0.04 r (5: +0.2) | Shadow Bolt, Incinerate | applyShadowAndFlame |
| Suppression (Task 3) | +2% hit x r (5: +10%) | `hitPctDelta` on Corruption, Curse of Agony, Curse of Doom, Curse of the Elements (the modelled spells of wowsims `WarlockAfflictionSpells`: + Curse of Recklessness, Drain Life, Seed of Corruption, Death Coil, not in the model) | applySuppression (SpellMod_BonusHit_Percent), spell_data_auto_gen.go Suppression 18174-18178 Value 2 r, warlock.go mask; Wowhead 18178 "by 10%" |
| Improved Corruption | -400 ms x r (5: instant) | Corruption | applyImprovedCorruption |
| Improved Life Tap | +582 x 0.1 x r mana (2: +116.4) | hook: a second Life Tap gain (base part only, as wowsims; UNVERIFIED whether the 0.8 x power part is increased in game) | lifetap.go |
| Improved Curse of Agony | periodic x(1 + 0.05 r) (2: x1.1) | Curse of Agony | applyImprovedCurseOfAgony |
| Empowered Corruption | coefficient +0.12 r over the DoT (3: +0.36, 0.936 -> 1.296) | `corruption` aura override | applyEmpoweredCorruption (0.02 x r per tick x 6); Wowhead "36%". wowsims only applies it with Improved Corruption (apparent slip): not copied |
| Shadow Mastery | x(1 + 0.02 r) direct and periodic (5: x1.1) | Shadow Bolt, Corruption, Curse of Agony, Shadowburn (wowsims WarlockShadowDamage; Curse of Doom is not in it: UNVERIFIED) | applyShadowMastery |
| Contagion | periodic x(1 + 0.01 r) (5: x1.05) | Corruption, Curse of Agony | applyContagion |
| Malediction | Curse of the Elements 1.10 + 0.01 r (3: 1.13) | own `curse-of-the-elements` aura override (the raid CoE keeps 1.1) | core/debuffs.go CurseOfElementsAura |
| Demonic Embrace | spirit x(1 - 0.01 r) (5: x0.95) | stat multiplier | applyDemonicEmbrace |
| Fel Intellect | max mana x(1 + 0.01 r) (3: x1.03) | stat multiplier | applyFelIntellect |
| Demonic Aegis | Fel Armor x(1 + 0.1 r) (3: 130 spell power) | `armorMult` | armors.go |
| Demonic Sacrifice | shadow x1.15 direct and periodic (Succubus) | modifiers, only with `sacrificeSuccubus` | applyDemonicSacrifice |
| Demonic Tactics | +r% crit (5: +5) | all spells | applyDemonicTactics |

Stacking: the engine multiplies matching damage multipliers; wowsims adds its DamageDone_Flat bonuses on one spell. Builds combining two on one spell are slightly high here (Corruption with Shadow Mastery 5 + Contagion 5: x1.155 vs x1.15; Immolate direct with Improved Immolate 5 + Emberstorm 5: x1.375 vs x1.35). The author's build has no such pair.

**Unmodelled (40)**, reasons in `UNMODELLED_TALENTS` (shown by the editor): Nightfall (procs on DoT ticks, hooks never run on ticks); spells not in the model: Improved Curse of Weakness, Improved Drain Soul, Soul Siphon, Amplify Curse, Siphon Life, Curse of Exhaustion, Dark Pact, Improved Howl of Terror, Unstable Affliction, Improved Subjugate Demon, Improved Searing Pain, Pyroclasm, Shadowfury, Master Conjuror (stones); the pet (not simulated): Improved Imp, Improved Voidwalker, Improved Sayaad, Unholy Power, Mana Feed, Master Demonologist, Soul Link, Demonic Knowledge, Summon Felguard, Improved Firebolt, Improved Lash of Pain; no effect on the simulated damage: Fel Concentration, Grim Reach, Shadow Embrace, Improved Healthstone, Improved Health Funnel, Fel Domination, Fel Stamina, Master Summoner, Demonic Resilience, Aftermath, Intensity, Destructive Reach, Nether Protection, Soul Leech. The author's build has points in 8 of them (Improved Healthstone, Improved Voidwalker, Fel Domination, Fel Stamina, Master Summoner, Intensity, Destructive Reach, Nether Protection), none of which changes the simulated damage.

**Spec and priority.** `buildDestructionWarlock(options, gear?, db?, talents?)`: `talents` is a talent string (decoded with `decodeTalents`; malformed = no talents) or a rank map, absent = the author's. Talent spells (`TALENT_SPELL_IDS` in spells.ts: Conflagrate, Shadowburn) are in `spells` and on the bar only when talented; casting one otherwise gives the engine's existing `'unknown-spell'` (no new CastResult reason). The author's spec no longer lists Conflagrate in `spells` (it was never castable by the bot or bound). `buildPriority(config, distance, dotExtraTicks?, talents?)` reads the unhasted cast times (DoT refresh windows, Shadowburn finisher window: no Bane 3000 + flight), the Shadow Bolt cost for Life Tap 'auto' (no Cataclysm: 420) and the available spells from `talents` (`RotationTalents`: the build's modifiers and talent spells; absent = the author's, rule for rule the old list); steps whose spell the build lacks are dropped and `rotationWarnings(config, talents)` returns one message per dropped step for the UI. `applySetup` does not pass talents yet (Task 3).

### Setup, presets and import (Task 3)

- **`SetupConfig.talents`** (src/setup/types.ts): the build as a full-width talent string. Absent = the author's build (`destructionTalentString`); every config saved before stage 2b, `DEFAULT_SETUP` and both setup presets have none, so their numbers, stored JSON and preset matching are unchanged. `normalizeSetup` keeps the field only for a valid build other than the author's: a string of at most 200 characters (`TALENT_STRING_MAX_LENGTH`) that `decodeTalents` reads with no format or rule error, stored as `encodeTalents` of it (one spelling per build: a wowsims short string and the full-width one are equal; surrounding whitespace is trimmed). Anything else (non-string, malformed, too long, too many points, a broken row or prerequisite rule, hostile getters, inherited keys, the author's build in any spelling) leaves it absent: the author's build. An invalid build is never repaired into a different one. `setupTalents(config)` (src/setup/presets.ts) gives the build a config plays.
- **`applySetup`** builds the spec with `buildSpec(config.warlock, config.gear, config.talents)` and the priority with `buildPriority(..., rotationTalentsFor(config.talents))` (destruction.ts: the build's modifiers and talent spells; undefined for the author's build, i.e. the stage 1 list rule for rule). So cast times (DoT refresh and Shadowburn finisher windows), Shadow Bolt's cost (Life Tap 'auto') and the steps of spells the build lacks follow the build: tested with Bane 0/5 (Shadowburn window 3900 -> 4400 ms at 28 yd; every bot Shadow Bolt 1.2x as long), Cataclysm 0/5 (Life Tap below 420 instead of 399), no Shadowburn (step dropped, never cast). Every `buildSpec` passed to `applySetup` must forward `talents` (the type has the third parameter; `buildDestructionWarlock` cannot be passed directly any more: its third parameter is the item database).
- **Simulator**: `prepareRun` normalizes the request's setup (talents included) and forwards the talents to `buildDestructionWarlock`; a Destro/Nightfall run equals the hand-built game fight exactly (DPS, damage and the full log, windows 400 and 0, with and without the busy item setup).
- **Setup presets and Reset**: a setup preset keeps the player's talents like the gear and the fight length (ruling F-2; `applySetupPreset(preset, current)`), "Reset to defaults" (`DEFAULT_SETUP`) restores the author's build. Preset matching: `setupFightKey` adds the talents only when they are not the author's (the key of every config without talents is the stage 2a one); a config is compared with `applySetupPreset(preset, config)`, so the kept talents never make a preset "Custom".
- **`TALENT_PRESETS`** (src/data/classes/warlock/talentPresets.ts), each validated by a test (0 errors, at most 61 points, builds a spec): "My build (export)" = the author's WowSimsExporter string; from wowsims tbc-new @ 91f869a `ui/specs/warlock/dps/presets.ts` (MIT): Destruction `-20500301332101-50500051220051053105` (0/21/40), Destro/Nightfall `150222201023--505020510200510531051` (20/0/41), Affliction `05022221112351055003--50500051220001` (40/0/21), Demo/Ruin `01-205003213305010150134-50500251020001` (1/39/21), Demonology Felguard `01-2050030133250101501351-5050005112` (1/41/19). Each keeps the wowsims string verbatim (`wowsimsString`) and its full-width form (`talents`). Phases: wowsims has one talent build per spec for every phase (its builds are all "P1" settings), so each is offered for every phase; no per-phase data is invented. Fire: wowsims's "Destruction (Fire)" build reuses `TalentsDestruction`, so there is no Fire talent preset to hide (`offeredTalentPresets()` returns all six; the `fire` flag would hide one).
- **Import / export**: `parseWowSimsExport` returns the export's `talents` untouched; `applyImportedTalents(result)` (src/setup/wowsimsGear.ts) validates it: a valid build gives `{ ok: true, talents }` (full width; the author's sample gives the author's string, which `normalizeSetup` stores as no field), a missing, malformed or rule-breaking one `{ ok: false, errors }` (the validator's sentences, or "The export has no talent string.") and nothing changes. `exportTalents(ranks)` writes the full-width string (unknown keys ignored, ranks clamped).
- **Pending setup**: the talents are part of the setup, so like every setup change they apply from the next fight; a fight already built keeps its spec (applySetup is pure: tested at the setup level).

### Suppression and `SpellModifier.hitPctDelta` (Task 3, engine)

Decision: modelled. `SpellModifier.hitPctDelta` (src/engine/types.ts) is a per-spell hit chance bonus in percent, summed over the matching modifiers like `critPctDelta` (`foldModifiers`), and the hit roll uses `effectiveMissPct(target, stats.hitPct + mods.hitPctDelta)`, so the target's minimum miss chance (1% against the boss) still caps it, as in wowsims (`SpellMod_BonusHit_Percent` adds to the spell's hit before the cap). Behaviour-preserving: without such a modifier the sum is `hitPct + 0`, the same float, and the roll draws exactly as before; every pinned scenario (23 bot logs, RNG draw counts, means), the golden means 1425.1766666666667 / 1428.3350000000003, raid-log 2294.108333333333 and Icon+Band 1379.2966666666666 / 1373.4900000000002 are unchanged. Only builds with Suppression points change (of the presets: Destro/Nightfall, Suppression 1/5).

### Bundle (Task 3)

The tooltip texts (two thirds of the old talentTree.json) moved to `src/data/classes/warlock/talentDescriptions.json` (`{ source, descriptions: { <talent id>: [rank 1, ...] } }`, written by the same generator; a plain run reproduces both files byte for byte, and the descriptions equal the Task 1 ones). `talentTree.json` keeps the structure (10 334 bytes, was 33 631); `TalentDef` has no `descriptions`; `loadTalentDescriptions()` imports the descriptions dynamically (a separate chunk once the talent editor calls it; shared, frozen, prototype-free). Production build: main chunk 450.23 kB -> 427.55 kB (gzip 136.50 -> 132.94 kB), simulator worker 125.00 -> 102.32 kB; no description text is in either.


### Talents panel (Task 4, UI)

`src/ui/TalentsPanel.tsx` with the pure view model `src/ui/talentView.ts`. Every edit goes through `canAddPoint` / `canRemovePoint`, then `validateTalents` of the whole build, and leaves as a full-width string (`encodeTalents`); GameView puts it into `SetupConfig.talents` and runs `normalizeSetup` (the author's build is stored as no field). Import accepts a bare talent string or a WowSimsExporter JSON (`talents`, own property only; a non-warlock `class` is refused) through `applyImportedTalents`; the text is capped at `IMPORT_MAX_CHARS`. Presets are matched by equal ranks in all 64 talents. The rotation warnings are `rotationWarnings(config.rotation, rotationTalentsFor(config.talents))`. The descriptions chunk (`talentDescriptions-*.js`, 23.6 kB, gzip 3.9 kB) loads when the panel first opens. Main chunk with the panel and the tree structure now in it: 427.55 -> about 444 kB (gzip 132.94 -> about 137.6 kB). Wiring: GameView's spec builder forwards the talents to `buildSpec`; the Setup panel's preset click is `applySetupPreset` (keeps the talents) and preset matching compares `setupFightKey` of the config with that of `applySetupPreset(preset, config without its item-use rules)`; the Simulator's result label has "Talents: <preset or Custom>"; the DPS note shows the fight's talents.
