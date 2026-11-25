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
| Wrack | 200 mana; 6 s channel, 1 s ticks; **60** damage per tick (after the 10 Nov hotfix: -30% damage and it no longer raises periodic damage); while channelling Siphon Life, Corruption, Bane of Agony tick 100% faster (skipped time carries over, durations unchanged) | warcraft.wiki.gg/wiki/Wrack, timesaver.gg, Blizzard hotfix notes, patchbot |
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
- Brand damage rank 1 = 90-93 (guildorder) vs rank 3 formula (66-68 at level 60). Rank 1 is
  reproduced by a x1.5 level term; rank 2 is interpolated (flagged).
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
