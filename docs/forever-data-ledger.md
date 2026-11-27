# WoW Forever data ledger (warlock leveling simulator)

Status as of 2026-11-25 (game version 1.60.1 per seemeta.com). Every number the simulator uses is
either **confirmed** from at least one Forever-specific source (listed here), or **flagged
`verify: true`** in `src/forever/data/*.json` with the reason. Anything not found is in the TODO
list at the end; the simulator needs a number there anyway, so the current stand-in is named.

Method: Wowhead Forever spell pages (`https://www.wowhead.com/forever/spell=<id>`, one page per
rank) were fetched through the web tool; they give mana, cast time, GCD, duration, tick size and
the spell power modifier per rank. Talent texts come from guildorder.com (rank 1 tooltip),
allthings.how and timesaver.gg (max rank), cross-checked; rank values are linear in rank
(23% x 3 = 70%, 7% x 3 = 20% and so on, displayed rounded). Blizzard's hotfix notes (10 Nov 2026)
fix the current Wrack and Soul Siphon.

## 1. Confirmed (with sources)

| Item | Value | Source |
|---|---|---|
| GCD | 1.5 s | Wowhead spell pages |
| Bane per rank | -0.1 s cast on Shadow Bolt, Immolate, Incinerate (0.5 s at 5/5). The earlier "1 s" reading was wrong; the players' 1.2 s rank 1 at 5/5 is exactly this | guildorder, allthings, timesaver |
| Shadow Bolt | 10 ranks; mana 25,40,70,110,160,210,265,315,370,380; cast 1.7, 2.2, 2.8, 3.0 s; SP mod .486,.629,.8,.857; rank 1 = 12-16, rank 2 = 22-27; rank levels 1,6,12,20,28,36,44,52,60,60; average damage 14,25,43,62,84,107,148,199,251,268 | Wowhead ids 686..25307; warcraft.wiki.gg; rankedboost (table) |
| Corruption | 7 ranks; 2 s cast; tick every 3 s: 10,13,22,28,40,57,73 over 12,15,18,18,18,18,18 s; SP mod 0.2 per tick; mana 35..340; levels 4,14,24,34,44,54,60. Totals match rankedboost's table | Wowhead ids 172..25311; rankedboost |
| Immolate | 8 ranks; 2 s cast; 15 s DoT, tick per 3 s 3,6,12,19,25,38,52,55; SP mod 0.2 direct / 0.13 per tick; mana 25,45,90,155,220,295,370,380; direct = rankedboost total - 5 ticks (10.8 at rank 1 per wiki) | Wowhead ids 348..25309; rankedboost verbatim table |
| Searing Pain | 6 ranks; 1.5 s; mana 45,68,91,118,141,168; SP mod 0.429; average damage 27,37,49,67,91,116; levels 18,26,34,42,50,58 | Wowhead ids 5676..17923; rankedboost |
| Bane of Agony | 6 ranks; instant; 24 s; tick every 2 s: 6,10,14,21,33,46; SP mod 0.133 per tick; mana 25,50,90,130,170,215 | Wowhead ids 980..11713 |
| Drain Life | 6 ranks; 5 s channel, leech per 1 s: 10,14,22,28,39,51; SP mod 0.1 per tick; mana 55,85,135,185,240,300 | Wowhead ids 689..11700 |
| Drain Soul | 4 ranks; 15 s channel, tick per 3 s: 17,34,54,84; SP mod 0.1 per tick; mana 55,125,210,290 | Wowhead ids 1120..11675 |
| Siphon Life | 4 ranks; instant; 30 s; leech per 3 s: 11,19,29,41; SP mod 0.05 per tick; mana 150,205,285,365 | Wowhead ids 18265..18881 |
| Wrack | 200 mana; 6 s channel, 1 s ticks; **60** damage per tick (after the 10 Nov hotfix: -30% damage and it no longer raises periodic damage); while channelling Siphon Life, Corruption, Bane of Agony tick 100% faster (skipped time carries over, durations unchanged, so the effects gain ticks: Blizzard's note "speeds up how often your periodic effects deal damage, not how long they last"); Wowhead spell 1316697: 25 per tick at level 40, SP mod 0.2002 (= 0.286 x 0.7) | warcraft.wiki.gg/wiki/Wrack, timesaver.gg, Blizzard hotfix notes, patchbot, wowhead.com/forever/spell=1316697 |
| Imp Firebolt | 7 ranks, levels 1,8,18,28,38,48,58; 2 s; mana 10,20,35,50,70,95,115; damage 6,11,15,18,25,35,44; SP mod .164,.314,.529,.571x4 | Wowhead ids 3110..11763; allthings (levels) |
| Succubus Lash of Pain | 6 ranks, levels 20,28,36,44,52,60; 12 s cooldown; mana 65,80,105,125,145,160; damage 16,22,30,36,43,50; SP mod 0.429 | Wowhead ids 7814..11780; wiki; allthings |
| Pet unlock levels | Imp 1, Voidwalker 10, Succubus/Incubus 20, Felhunter 30; Torment 5 s cooldown, 20 mana | allthings.how/?p=353577 |
| Talents (per rank) | Improved Life Tap +10% mana; Suppression +1% hit, -4% threat; Improved Corruption -0.4 s, +2%; Soul Harvest +50%/+100% regen 10 s; Improved Drains +20% at 3/3 (Drain Life/Soul/Mana only); Improved Bane of Agony +5%; Fel Concentration 70% at 3/3 (also Wrack); Pandemic +100% crit damage bonus at 3/3; Malevolence +1% crit on Shadow spells; Nightfall 2% per hit (Corruption, Drain Soul, Drain Life, Wrack), free cast time only; Soul Siphon +4% per effect per rank, 3 effects (Corruption, Siphon Life, Agony), 36% max, on Drain Life/Soul and Wrack; Shadow Mastery +2%; Improved Imp +10%; Unholy Power +2%; Demonic Aegis +15%; Fel Vitality +5%; Demonic Energies 8%/15% pet heal, Life Tap mana to pet 50%/100%; Improved Sayaad +10%; Demonic Sacrifice (Imp +15% Shadow, Succubus +15% Fire, Voidwalker 2% mana/4 s, Felhunter 3% HP/4 s); Demonic Brand 2/4/6 attacks, threat -17/-33/-50%; Soul Link 30%/+3%; Demonic Knowledge up to 100% of level; Master Demonologist 2%/rank; Demonic Pact; Improved Shadow Bolt +4% per rank Shadow damage taken for 12 s (not charges); Cataclysm -10% mana at 3/3; Aftermath +10% Immolate initial damage per rank; Ruin +20% crit bonus per rank; Agonizing Flames +3.3% damage and Searing Pain crit per rank | guildorder, allthings, timesaver (see `talents.json` `source`) |
| Tree layout | 17/19/16 talents, rows gated at 5 points, golden talents as in the task | guildorder |
| Downrank proc rule | Since 2 Nov most talents no longer lose proc chance with low ranks (Blizzard patch notes, via pcgames.de) | pcgames.de 3 Nov 2026 |

## 2. Corrections to the first report

The first report used Classic-era numbers from memory for spell ranks and some wrong talent
mechanics. Now fixed: Shadow Bolt/Corruption/Immolate/Searing Pain/Drain/Agony tables; Suppression
is +1% hit per rank on every spell; Nightfall is not free (only instant); Pandemic doubles the crit
*bonus* (x2.0 at 3/3, not +0.3); Malevolence is all Shadow spells including Shadow Bolt; Soul
Siphon counts only Corruption, Siphon Life, Agony; Improved Shadow Bolt is a 12 s debuff, not
4 charges; Demonic Brand marks 2 attacks per rank (6 at 3/3), not 3; Improved Voidwalker is not
HP; Wrack is a 6 s channel of 60 per tick, not a 2 s cast; Fel Concentration 23%/rank; Cataclysm
10%; the Bane 0.2 s scenario is dropped (0.1 s is confirmed).

## 3. Conflicts between sources and the choice made

- Wrack tick damage: 60 (wiki, timesaver) vs 124 (guildorder). Probably level-dependent tooltips
  (timesaver/wiki show the level the talent unlocks, guildorder shows level 60). **Used: 60 at
  level 40, 124 at level 60, linear in between** (assumption, flagged).
- Siphon Life: 11 per 3 s (rank 1) vs 27 on guildorder (probably the top rank) vs Wowhead ranks
  11/19/29/41. Wowhead used.
- Demonic Brand: user text says "next 3 attacks"; sources say 6 attacks at 3/3 (2 per rank). Sources used.
- Brand damage rank 1 = 90-93 (guildorder, older) vs (level-26)*1.5 + 14..17 + 0.078*SP (65-68 at
  level 60). **Used: Wowhead Forever (spells 1293697/1293698, read 26 Nov): the formula at every
  rank**, the rank changes only the number of attacks. The hit is multiplied by Unholy Power and
  Master Demonologist (Fire with the Imp, Shadow otherwise), and by Soul Link (assumption). Master
  Demonologist also raises the demon's own spells (spells 23759/23761: Imp Fire, Succubus Shadow).
- Demonic Sacrifice (Wowhead Forever spell 18788, read 26 Nov): Imp +15% Shadow, Voidwalker 2%
  mana per 4 s, Succubus +15% Fire, Felhunter 3% health per 4 s. Confirmed; it differs from Classic.
- Curse of the Elements: until 27 Nov only rank 1 (+4%) was in the data. **Used: Wowhead Forever
  ranks 4/6/8/10% for 50/100/150/200 mana at levels 20/30/40/50**; it raises the demon's magic
  damage too (not its melee).
- Pet critical strikes are **not modelled** (the 25 Nov hotfix fixed pet melee crit, so pets do
  crit); no chance found. Demonology results are a little low because of it.
- Life Tap: wiki "30 health -> 30 mana" at rank 1; guide summary "cost = base + Spirit, 1.2 mana
  per health". Used 1.0 and Spirit coefficient 1.0 (both flagged and in the sensitivity axes).

## 4. TODO: not found, to check or correct (most impactful first)

Every item has a stand-in in the data files (flagged `verify`). Each should be replaced by the
real value and the report regenerated.

1. **Mob health, damage, armor, level scaling, swing speed, spell miss chance for normal
   same-level mobs at levels 40-60.** Not published anywhere found. Stand-in: `levels.json`
   `mobs` anchors, `mob_miss_pct` 4%, `mob_swing_sec` 2. Affects every absolute result.
2. **Pet melee damage and attack speed** (Succubus/Incubus, Voidwalker, Felhunter), **pet health
   and mana per level** (the 10 Nov hotfix gave +15% base health), pet mana regeneration, pet armor.
   Stand-ins in `levels.json` `pets`. Affects the Demonology builds most.
3. **Spirit mana regeneration formula** (inside and outside the five-second rule), **drink and
   food restoration per level**, **base warlock health and mana per level**, Life Tap exact formula
   (Spirit term and conversion). Stand-ins: `spirit_regen_per_spirit`, `levels.json` `base`,
   `life_tap_spirit_coeff`, `life_tap_mana_per_health`. Affects downtime and therefore kills per hour.
4. **Gear profiles per level** (spell power, Spirit, Intellect, crit, hit, health). The three
   profiles in `levels.json` are invented. Best replaced by the user's real character stats.
5. **Wrack**: the damage scaling with level (60 vs 124), its spell power coefficient, and whether
   the DoT acceleration works exactly as modelled (the page text and the hotfix note differ in
   wording).
6. **Bane of Agony damage ramp** (shape over 24 s). Classic thirds assumed (flagged, in sensitivity).
7. **Downranking spell-power penalty**: the Forever beta notes (1 Oct) say low ranks get "less
   benefit from Spell Damage"; the formula is not published (rankedboost: level-20 rule
   unconfirmed). Default model `none` (flagged, in sensitivity).
8. **Rank levels** for Bane of Agony, Drain Life, Drain Soul, Siphon Life, Life Tap (Classic levels
   assumed; only rank 1 confirmed), and the damage **spread** of Shadow Bolt ranks 3+ (only averages).
9. **Curse of the Elements** ranks 2-4 (4 ranks, rank 1 = +4% magic damage taken, level 20);
   Wowhead ids for the other ranks not found. Amplify Curse cooldown.
10. **Threat**: Searing Pain's threat factor ("high amount"), Torment's threat, how mobs choose
    targets in Forever, initial aggro on pulls. `searing_pain_threat_mult`, `pet_initial_threat_per_level`.
11. **Demonic Brand**: rank 2 damage, whether the 60 in the formula is the caster level, and whether
    the "Shadow SP" term is the Shadow-specific spell power.
12. **Improved Shadow Bolt** on pet damage and Siphon Life/drain health (assumed player attacks only);
    **Suppression** school restriction (assumed all spells); Demonic Embrace's HP effect.
13. Immolate rank 2-6 direct damage is derived (rankedboost total minus ticks), Searing Pain
    average damage and the Shadow Bolt averages come from one table (rankedboost) that agrees with
    Wowhead at rank 1-2.
14. Imp Firebolt: whether the pet's spell power equals only the Demonic Knowledge bonus.
15. Siphon Life: whether it damages the target for the amount it heals (assumed).
16. Soul Fire, Incinerate and Conflagrate ranks are not used by any build.

Source pages can change with hotfixes (watch https://worldofwarcraft.blizzard.com/news/24315281).

## 5. Known model artifacts (not data, but they limit the conclusions)

- The rotations use an estimated time to kill (filler damage per second plus pet) to decide whether
  to cast DoTs (`corruption_min_ttk_sec`) and whether to skip Agony. Near these thresholds the
  result is not monotonic: Wrack x1.5 gave fewer kills per hour than x1.0 at level 50
  (88.8 vs 100.8). Treat differences of a few kills per hour near such points with care; a better
  rotation (cast DoTs when they pay back their mana, measured, not estimated) is an open task.
- The player's rest policy was a fixed mana threshold at first and produced steps from level to
  level; it is now adaptive (`pull_reserve_factor`), which is smoother but still an assumption.
- Pet HP, pet melee, mob damage and the player's regeneration are estimates (section 4), and the
  threat model is two numbers per mob. Absolute kills per hour are therefore not predictions.

## 6. Life Tap and break policy (user's rules, 25 Nov 2026)

In combat and between mobs: Life Tap when mana < 60% and HP > 80%, or mana < 20% and HP > 30%;
between mobs also when HP = 100% and mana < 90%. The only break is food and water below 30% HP; it
lasts until HP is full and the warlock drinks only during the meal. A Life Tap cast on the walk to the
next mob costs no extra time while the walk lasts (`transition_sec`). Assumptions to check:
**out-of-combat HP regeneration is taken as zero** (formula not found), HP is not healed by pets
or healing spells, and the HP safety floor of a Life Tap is 10% (`lt_safety_hp_pct`).

## 7. Second research round (25 Nov 2026): the eight open items

Rule followed: Classic Era numbers are not used for Forever. Where a source only gives Classic
numbers, the item stays open. Blizzard's own text (beta development notes, 3 Nov; hotfix notes,
5-23 Nov; class deep dive, 7 Oct) is used wherever it exists.

| # | Item | Result |
|---|---|---|
| 1 | Mob HP, damage, armor by level | **NOT FOUND.** Blizzard (3 Nov): "increased the health of higher level creatures to compensate", no multiplier, no levels. Raw posts 1, 4-10 of the beta notes thread read in full: no table. Wowhead Forever NPC pages are JavaScript-rendered: the page reader returns no stats and a direct request is answered with an empty body (bot protection, not bypassed). PC Gamer and MassivelyOP bodies not retrievable; Icy Veins 403. **Needs:** Health of a few normal mobs per level bracket copied from Wowhead Forever (npc pages, "Health"/level) or measured in game. The data file `levels.json` keeps the estimates, flagged. |
| 2 | Pets | **Partly.** Confirmed: health from the master's Stamina is **2 per point (was 7.5)** (Blizzard, 3 Nov); Voidwalker base health +40 at all levels (6 Nov); Imp, Voidwalker, Succubus, Incubus base health +~15% (10 Nov); Orc Command +5% pet damage; Fel Vitality +5%/rank; Firebolt and Lash of Pain ranks (Wowhead). **Not found:** base health, mana, armor, melee damage and attack speed per level for any pet, whether armor/attack power/spell power are inherited. The pet numbers in `levels.json` (HP, mana, melee) remain estimates and are probably too high in health (the 7.5 -> 2 cut). |
| 3 | Spirit regeneration | **NOT FOUND.** Blizzard says Life Tap and Dark Sacrifice "scale with Spirit", Meditation-type talents keep 50% of regen while casting (30 Sep: "Mana benefit from spirit increased substantially"), Soul Harvest +50/100%. No coefficient anywhere (rankedboost: "not yet tested in play"). Stand-in `spirit_regen_per_spirit`. |
| 4 | Drink and food | **NOT FOUND.** Blizzard only notes "fixed drink tooltips" (16 Oct). Wowhead Forever item pages return titles only. **Needs:** the "Restores N mana over S sec" lines of the drinks and foods you use (item pages or in game). Stand-ins `drinkManaPerSecPerLevel`, `foodHpPerSecPerLevel`. |
| 5 | Base HP, mana, stats | **Partly, third party only.** Stamina -> 10 health per point (rankedboost, Warcraft Tavern; Blizzard has not confirmed); Intellect -> 15 mana (Tavern) while rankedboost says "not announced"; warlock spell crit about 1% per 60 Intellect at level 60, "far less at low levels" (rankedboost, Tavern). Base health and mana per level: not found. |
| 6 | Wrack scaling | **RESOLVED.** Blizzard (3 Nov): coefficient doubled to 0.286 per second, base damage per second +2.5 per level, 36 at level 40 and 86 at level 60 (hotfix 10 Nov: -30%, so 60 at level 60 = the wiki/timesaver tooltip). In the model: (36 + 2.5 x (level - 40) + 0.286 x SP) x 0.7 per tick (the -30% on the coefficient is confirmed by Wowhead's SP mod 0.2002, 26 Nov). Until 26 Nov the model kept the DoT tick count fixed under Wrack, so the effects expired early and Wrack added no DoT damage; fixed (tests/forever/wrack.test.ts). guildorder's 124 stays unexplained. |
| 7 | Bane of Agony ramp | **NOT FOUND.** Blizzard (3 Nov): Bane of Agony "now updates dynamically" and Amplify Curse (+50%, 30 s) now affects it. The 0.5/1.0/1.5 thirds pattern stays an assumption (in the sensitivity analysis). |
| 8a | Downranking | **Partly.** Blizzard (1 Oct, character sheet): spells at ranks "vastly below" your level "receive less benefit from your Spell Damage and Spell Healing". No formula or threshold published. Blizzard (3 Nov): "various talents no longer have a penalty to their chance to trigger" with low ranks; the penalty stays only for Arcane Concentration, Frostbite and Fingers of Frost (ranks learned more than 12 levels lower), so the warlock procs (Nightfall, Improved Shadow Bolt) are modelled without a penalty. |
| 8b | Curse of the Elements ranks 2-4 | **NOT FOUND** (rank 1: +4% magic damage taken, level 20). |
| 8c | Threat | **Partly.** Searing Pain "causes a high amount of threat" (wiki), Demonic Brand: Searing Pain -50% threat at 3/3, the Brand bonus damage "only does high threat when it deals Shadow damage" (Blizzard, 8 Oct); Torment 5 s cooldown, 20 mana. Factors not published. |
| - | Spell miss vs same level | Conflict: 4% (Method.gg) vs 3% (Warcraft Tavern); in the sensitivity analysis. |

Two non-Blizzard facts used with care: pet health numbers above come from Blizzard's notes; the
Stamina and Intellect conversions come from rankedboost/Tavern.

## 8. Third research round (25 Nov 2026): Classic data and Wowhead Forever in a real browser

Method: Wowhead Forever pages are JavaScript-rendered; the page reader sees nothing, but the
Chromium that ships with this environment (Playwright) loads them like a normal visitor (zone and
item list data are in the page, NPC and item pages show Health and tooltips). Classic data comes from the
cmangos emulator databases on GitHub (`cmangos/mangos-classic`, `cmangos/classic-db`), read with
`scripts/forever-extract-classic.py` into `src/forever/data/classic_base.json`. The user asked to
use Classic for items 1-4 below and to treat them as valid for Forever.

| Item | Result |
|---|---|
| Mob health | Wowhead Forever NPC pages show Health for 46 of the 292 mobs sampled in levels 38-60 (only "discovered" NPCs have stats). **44 of 46 equal the Classic value exactly**, so the pages carry Classic health, not Blizzard's pre-launch increase ("increased the health of higher level creatures", no number). Model: Classic health = class-1 base health x (1.15 + 0.01 x (level-40)) (fits the Classic medians at levels 38, 40, 45, 50, 55); `mob_hp_mult` (default 1.0) is the unknown Forever factor, tested at 1.25 and 1.5. |
| Mob damage and armor | Classic only: median melee damage per swing of normal mobs by level (line through the medians: -49.5 + 2.97 x level; 65 at 40, 99 at 50, about 126 at 59), attack speed 2.0 s, armor from `creature_template_classlevelstats` (class 1: 1964 at 40, 2999 at 50, 3489 at 59). |
| Warlock base health and mana | `player_classlevelstats` (class 9): e.g. level 40: 634 health, 923 mana; level 50: 979, 1163; level 59: 1366, 1352. Stamina gives 1 health per point for the first 20 and 10 after; Intellect 1 mana for the first 20 and 15 after (cmangos StatSystem.cpp). Third-party Forever guides say the same (10 per Stamina, 15 per Intellect). (Checked in game, see section 9: health matches, mana does not.) |
| Gnome warlock base stats | `player_levelstats` (race 7, class 9): level 40: Str 29, Agi 40, Sta 45, Int 79, Spi 75; level 50: 34/46/54/98/93; level 59: 39/52/63/117/111. (Gnome Expansion was first applied as +5% Intellect: wrong in Forever, see section 9.) |
| Spirit mana regeneration | Classic warlock: (Spirit/5 + 15) per 2 s tick outside the five-second rule (cmangos `OCTRegenMPPerSpirit`). That is 15 mana/s at Spirit 75: much more than the 5.8/s the first versions assumed. After a cast the regeneration waits 5 s (`fsr_sec`). Forever has not published a formula (rankedboost: untested). |
| Out-of-combat health regeneration | Classic warlock: (Spirit x 0.12 + 1.5) per 2 s tick (cmangos `OCTRegenHPPerSpirit`), about 5 health/s at Spirit 75. Replaces the earlier zero assumption. |
| Drink and food | **Forever tooltips (Wowhead Forever item pages):** Sweet Nectar (req 25) 1345 mana/27 s; Moonberry Juice and Bottled Winterspring Water (req 35) 1915/30 s; Morning Glory Dew (req 45) 2821/30 s. Food: req 25 841 health/27 s; req 35 1338/30 s; req 45 2065/30 s. Best vendor item per level. Whether Spirit regeneration adds to a drink is unknown (assumed not, `drink_adds_spirit_regen`). |
| Pets | Classic `pet_levelstats` (health, mana, armor per level, e.g. Voidwalker 2052 health at 40, 2527 at 50), Classic melee from the cmangos pet damage formula (Voidwalker about 44 per 2 s swing at 40, 66 at 50), Forever rules on top: +2 health per point of the master's Stamina, +15% base health (10 Nov), Voidwalker +40 (6 Nov). **Not Forever tooltips**: Forever pet base health is said to be lower than Classic. |
| Bane of Agony ramp | **Not found.** WarcraftLogs returns 403 (no public data without login). Classic wiki: damage "dealt slowly at first, and builds up". The 0.5/1.0/1.5 thirds pattern comes from the AzerothCore Wrath implementation; kept as an assumption in the sensitivity analysis. A player can measure it in game: tick damage of the first, fifth and ninth tick of a fresh Bane of Agony on a target dummy. |
| Gear | **Placeholders.** Gear stat bonuses (Stamina, Intellect, Spirit, spell power, crit, hit, armor) per profile are guesses added on top of the base stats. Real totals from the user's character replace them. |

### Still open after this round
Pre-launch creature health factor; real gear totals; Bane of Agony ramp; Spirit-regeneration and
drink behaviour in Forever as opposed to Classic; pet base health in Forever; spell crit by level.

## 9. Measured in game (user, 25 Nov 2026): level 1 warlocks without gear

| Character | Stamina | Intellect | Health | Mana |
|---|---:|---:|---:|---:|
| Gnome warlock | 20 | 25 | 43 | 194 |
| Human warlock | 21 | 22 | 53 | 140 |

- **Health matches Classic**: 23 base + 1 per Stamina for the first 20 + 10 per Stamina after (43 and 53).
- **Mana does not match Classic** (prediction for the gnome was 154, human 109). Wowhead Forever spell 20591:
  gnome racial "Expansive Mind: Maximum Mana increased by 5%" (not +5% Intellect). With that, the two
  points fit `(base + 20 + 15 x (Intellect - 20)) x racial` with a slope of 14.9 (15) per Intellect and a
  **base of 90 at level 1, i.e. 31 more than Classic's 59**: human 90 + 20 + 30 = 140, gnome
  (90 + 20 + 75) x 1.05 = 194.25.
- **Level 31 measurement (gnome warlock, with gear):** Stamina 72 (38 base + 34 gear) -> 938 health;
  Intellect 89 (61 base + 28 gear) -> 1815 mana. Classic formulas give exactly 938 and
  (674 + 20 + 15 x 69) x 1.05 = 1815.45, so the **+31 base mana offset is gone at level 31**: the
  Forever base mana equals Classic's there. Model: offset 31 at level 1, 0 from level 31 (linear
  between), so levels 38-60 use the Classic base mana, the 15 mana per Intellect and x 1.05 for the gnome.
- **Naked base stats differ slightly from the Classic table at level 31:** Stamina 38 and Intellect 61
  (Forever) against 37 and 64 (Classic). Not applied (Spirit and other levels not measured; a difference
  of a few points, about 2% of mana).
- Open: a measurement at level 50-60 would confirm that the Classic base mana and stat tables hold higher up.

## 10. Eureka! (gnome racial, 26 Nov 2026)

Source: Wowhead Forever spell 1259821, read in the browser (the plain page request is blocked), with its
"Modifies" list (89 rows). Instant, off the GCD, 2 min cooldown, 8 s, level 1.

- Effect 1: -10% mana cost. Effect 2: +10% damage of non-periodic abilities. Effect 3: +10% periodic damage,
  but only for Drain Life, Drain Soul, Wrack and Haunt.
- Spells it modifies: Immolate (cost and the direct part only), Shadow Bolt, Drain Life, Drain Soul,
  Hellfire, Searing Pain, Rain of Fire, Soul Fire, Death Coil, Conflagrate, Shadowburn, Wrack, Haunt.
  **Not** modified: Corruption, Bane of Agony, Siphon Life, Life Tap, curses, the damage over time of Immolate.
- Model: `eureka_policy` (default `off`, so earlier results do not change), `eureka_dur_sec`, `eureka_cd_sec`,
  `eureka_mod`. Assumption (verify): a channel tick inside the 8 s gets the bonus (not a snapshot at the start of the channel).
- Timing comparison (3000 paired pulls per cell, levels 25/35/45/55, BEST_1MOB, 1 mob; seconds off the pull,
  standard error about 0.01 s): using it with the **first cast of a modified spell** (`first_affected`) is best or
  tied for best in every rotation: Drain Life 0.35-0.42 s, Wrack 0.42-0.54 s, Demonology (Shadow Bolt)
  0.02-0.44 s, Fire (Searing Pain) 0.21-0.51 s, plus 8-105 mana. Using it with the first cast of the pull
  (`pull_start`) gives about half (it opens with Corruption and Bane, which it does not modify); keeping it for
  the end of the fight (`ttk`) or using it 9+ s in loses a third to nine tenths of the gain. Over a whole session
  the gain is 0.3-1 kills per hour (under 1%): it is a small bonus, one use per about five pulls.
