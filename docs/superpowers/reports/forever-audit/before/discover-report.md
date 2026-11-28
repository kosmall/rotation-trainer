# Build discovery: level 40

Talents × rotations composed from the simulator's spells × pet setups, ranked by kills per hour at level 40 (31 talent points).

- Gear profile: average; mobs per pull: 1; seed: 1; Talented perk: 0
- Changed parameters: none (params.json defaults)
- Searched: 36288 rotation × pet combinations screened plus 200 mixed variants (second filler, other effect floors) of the best ones, 39 searched in depth, 117536 simulations; run time N min
- Data and settings hash: `fcd5bcc5-144e5e86`

How to read: **✓** the difference to the best known build is significant (95% CI on paired sessions), **~** it is within the noise; **≈#1** the row is not significantly worse than row 1. "Nearest known" is the known build with the fewest talent points moved (in brackets).

## Known builds (baseline)

| Build | Kills/h | 95% CI |
|---|---:|---|
| DT_SS_WRACK_70_NOCOE | 126.3 | 126.0–126.7 |
| DT_SS_WRACK_50_NOCOE | 125.7 | 125.3–126.1 |
| DEMO_PACT_R1_NOCOE | 123.9 | 123.1–124.7 |
| DEMO_PACT_VIDEO_NOCOE | 123.9 | 123.1–124.7 |
| DT_SS_NOCOE | 120.5 | 120.3–120.8 |
| DT_SS | 118.7 | 117.8–119.6 |
| DT_SS_WRACK_70 | 118.0 | 115.4–120.6 |
| DEMO_PACT_R1 | 117.0 | 116.7–117.4 |
| DEMO_PACT_R1_PET | 117.0 | 116.7–117.4 |
| DEMO_PACT_VIDEO | 117.0 | 116.7–117.4 |
| DEMO_PACT_R2 | 116.7 | 116.3–117.0 |
| DT_SS_WRACK_50 | 115.3 | 113.5–117.2 |
| DT_SS_WRACK_50_PET | 115.3 | 113.5–117.2 |
| AFF_DRAINTANK_NOCOE | 115.2 | 115.0–115.5 |
| AFF_DRAINTANK | 114.8 | 114.7–115.0 |
| DT_SS_IMMO | 110.0 | 108.1–112.0 |
| DEMO_PACT_MAXRANK | 107.0 | 106.4–107.5 |
| AFF_DRAINTANK_IMMO | 103.1 | 100.1–106.2 |
| DEMO_FIRE | 90.0 | 87.7–92.4 |
| AFF_WRACK_IMMO | 86.6 | 81.5–91.7 |
| AFF_WRACK | 84.8 | 81.5–88.2 |
| AFF_WRACK_SH_PET | 84.8 | 81.5–88.2 |

## Top 20

| # | Kills/h | ± CI | vs DT_SS_WRACK_70_NOCOE | Trees | Pet | Rotation | TTK s | Downtime % | Deaths/h | Nearest known |
|---|---:|---:|---:|---|---|---|---:|---:|---:|---|
| 1 | 131.3 | 0.7 | +3.9% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; if TTK ≥ Agony 6 s, Immolate 0 s; Shadow Bolt r2 when pet dead | 17.8 | 6.0 | 0.00 | DEMO_PACT_R1 (6) |
| 2 | 129.8 | 0.7 | +2.8% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r2 when pet dead | 18.0 | 6.2 | 0.00 | DEMO_PACT_R1 (7) |
| 3 | 127.3 | 0.6 | +0.8% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r1 when mana < 50% | 18.5 | 6.1 | 0.00 | DEMO_PACT_R1 (10) |
| 4 | 127.3 | 0.6 | +0.8% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r1 when TTK ≤ 5 s | 18.6 | 6.1 | 0.00 | DEMO_PACT_R1 (8) |
| 5 | 127.1 | 0.3 | +0.6% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life | 20.3 | 0.0 | 0.00 | AFF_WRACK (9) |
| 6 | 126.6 | 0.7 | +0.2% ~ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt when mana < 30% | 18.2 | 7.9 | 0.00 | DEMO_PACT_R1 (9) |
| 7 | 125.7 | 0.9 | -0.5% ~ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; if TTK ≥ Agony 6 s, Immolate 0 s; Shadow Bolt r2 when pet dead | 18.7 | 6.9 | 0.00 | DEMO_FIRE (8) |
| 8 | 125.5 | 0.7 | -0.7% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r2 when mana < 50% | 20.6 | 0.4 | 0.00 | AFF_WRACK (7) |
| 9 | 124.9 | 0.3 | -1.1% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r2 when mana < 50% | 20.8 | 0.0 | 0.00 | DT_SS_WRACK_70 (7) |
| 10 | 123.9 | 0.5 | -1.9% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r1 when mana < 50% | 21.0 | 0.1 | 0.00 | DT_SS_WRACK_70 (4) |
| 11 | 123.6 | 0.4 | -2.2% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s; Shadow Bolt when more than 1 mob in the pull | 21.0 | 0.4 | 0.00 | AFF_WRACK (7) |
| 12 | 123.4 | 0.7 | -2.3% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | CoE, Immolate → Drain Life; DoTs if TTK ≥ 6 s | 19.2 | 6.7 | 0.00 | DEMO_PACT_R1 (5) |
| 13 | 123.0 | 0.8 | -2.6% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt when mana < 30% | 18.4 | 9.8 | 0.00 | DEMO_PACT_R1 (11) |
| 14 | 123.0 | 0.9 | -2.6% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s | 18.4 | 9.8 | 0.00 | DEMO_PACT_R1 (10) |
| 15 | 122.6 | 0.5 | -3.0% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Corruption, Immolate → Shadow Bolt r1; DoTs if TTK ≥ 12 s | 17.6 | 12.9 | 0.00 | DEMO_FIRE (9) |
| 16 | 122.4 | 0.3 | -3.1% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s | 21.3 | 0.2 | 0.00 | AFF_WRACK (8) |
| 17 | 122.3 | 0.6 | -3.2% ✓ | 0/31/0 | Succubus (sacrificed Voidwalker) | Agony, Corruption → Shadow Bolt r2 | 18.9 | 8.7 | 0.00 | DEMO_PACT_R1 (9) |
| 18 | 121.9 | 1.2 | -3.5% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s | 21.0 | 1.9 | 0.00 | AFF_WRACK (9) |
| 19 | 121.6 | 0.6 | -3.7% ✓ | 31/0/0 | Voidwalker | Agony, Corruption → Wrack above 70% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s | 21.5 | 0.5 | 0.00 | DT_SS_WRACK_70 (6) |
| 20 | 121.5 | 0.6 | -3.8% ✓ | 31/0/0 | Voidwalker | Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r1 when TTK ≥ 15 s | 21.1 | 1.7 | 0.00 | DT_SS_WRACK_70 (7) |

## Details

### 1. Agony, Immolate → Drain Life; if TTK ≥ Agony 6 s, Immolate 0 s; Shadow Bolt r2 when pet dead, Succubus (sacrificed Voidwalker)

131.3 kills/h (95% CI 130.6–132.0), +3.9% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Improved Imp 1, Demonic Embrace 2, Unholy Power 5, Demonic Aegis 2, Fel Vitality 2, Demonic Energies 2, Improved Sayaad 2, Demonic Sacrifice 1, Master Summoner 1*, Decimation 2*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 3, Demonic Pact 1
- Free points (no modelled effect, marked *): 3
- Insensitive (a point moved to a dead talent costs nothing significant): Demonic Aegis, Demonic Embrace, Improved Health Funnel, Improved Imp

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate
5. Shadow Bolt r2: not pet alive (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 2. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r2 when pet dead, Succubus (sacrificed Voidwalker)

129.8 kills/h (95% CI 129.1–130.5), +2.8% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Demonic Embrace 3, Unholy Power 5, Demonic Aegis 2, Improved Voidwalker 3, Fel Vitality 2, Demonic Energies 2, Improved Sayaad 2, Demonic Sacrifice 1, Master Summoner 1*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 2, Demonic Pact 1
- Free points (no modelled effect, marked *): 1
- Insensitive (a point moved to a dead talent costs nothing significant): Demonic Aegis, Demonic Embrace, Improved Health Funnel, Improved Sayaad, Improved Voidwalker

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Shadow Bolt r2: not pet alive (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 3. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r1 when mana < 50%, Succubus (sacrificed Voidwalker)

127.3 kills/h (95% CI 126.7–127.9), +0.8% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Imp 3, Demonic Embrace 5, Unholy Power 3, Demonic Aegis 2, Improved Voidwalker 1, Fel Vitality 3, Demonic Energies 2, Improved Sayaad 3, Demonic Sacrifice 1, Decimation 1*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Demonic Pact 1
- Free points (no modelled effect, marked *): 1
- Insensitive (a point moved to a dead talent costs nothing significant): Demonic Aegis, Improved Imp, Improved Sayaad, Improved Voidwalker, Unholy Power

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Shadow Bolt r1: mana < 50% (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:decimation`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 4. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt r1 when TTK ≤ 5 s, Succubus (sacrificed Voidwalker)

127.3 kills/h (95% CI 126.6–127.9), +0.8% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 2, Improved Imp 1, Demonic Embrace 3, Unholy Power 4, Demonic Aegis 2, Improved Voidwalker 1, Fel Vitality 3, Demonic Energies 2, Improved Sayaad 1, Demonic Sacrifice 1, Master Summoner 1*, Demonic Brand 2, Improved Felhunter 1*, Soul Link 1, Demonic Knowledge 3, Master Demonologist 2, Demonic Pact 1
- Free points (no modelled effect, marked *): 2
- Insensitive (a point moved to a dead talent costs nothing significant): Demonic Aegis, Demonic Embrace, Improved Health Funnel, Improved Imp, Improved Sayaad, Improved Voidwalker, Unholy Power

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Shadow Bolt r1: TTK ≤ 5 s (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:demonic_brand`, `talents.json:improved_felhunter`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 5. Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life, Voidwalker

127.1 kills/h (95% CI 126.7–127.4), +0.6% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 5, Improved Corruption 5, Grim Reach 2*, Soul Harvest 1, Improved Drains 3, Fel Concentration 2, Malevolence 1, Siphon Life 1, Soul Siphon 3, Shadow Mastery 5, Wrack 1
- Free points (no modelled effect, marked *): 2
- Insensitive (a point moved to a dead talent costs nothing significant): Fel Concentration, Malevolence, Soul Harvest, Suppression

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony
3. Corruption: target lacks Corruption
4. Siphon Life: target lacks Siphon Life
5. Wrack: health > 70% (filler)
6. Drain Life: always
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 6. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt when mana < 30%, Succubus (sacrificed Voidwalker)

126.6 kills/h (95% CI 126.0–127.3), +0.2% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 2, Improved Imp 1, Demonic Embrace 2, Unholy Power 5, Improved Voidwalker 1, Fel Vitality 3, Demonic Energies 1, Improved Sayaad 2, Demonic Sacrifice 1, Master Summoner 2*, Decimation 2*, Fel Domination 1*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 1, Demonic Pact 1
- Free points (no modelled effect, marked *): 5

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Shadow Bolt: mana < 30% (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:fel_domination`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 7. Agony, Immolate → Drain Life; if TTK ≥ Agony 6 s, Immolate 0 s; Shadow Bolt r2 when pet dead, Succubus (sacrificed Voidwalker)

125.7 kills/h (95% CI 124.9–126.6), -0.5% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Improved Imp 1, Demonic Embrace 3, Unholy Power 5, Demonic Aegis 2, Improved Voidwalker 2, Fel Vitality 2, Demonic Energies 2, Demonic Sacrifice 1, Master Summoner 1*, Decimation 2*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 2, Master Demonologist 3, Demonic Pact 1
- Free points (no modelled effect, marked *): 3

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate
5. Shadow Bolt r2: not pet alive (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 8. Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r2 when mana < 50%, Voidwalker

125.5 kills/h (95% CI 124.8–126.2), -0.7% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Improved Corruption 4, Grim Reach 2*, Soul Harvest 2, Improved Drains 3, Improved Bane of Agony 1, Fel Concentration 2, Amplify Curse 1*, Pandemic 3, Malevolence 2, Curse of Exhaustion 1*, Siphon Life 1, Soul Siphon 3, Shadow Mastery 3, Wrack 1
- Free points (no modelled effect, marked *): 4

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony
3. Corruption: target lacks Corruption
4. Siphon Life: target lacks Siphon Life
5. Shadow Bolt r2: mana < 50% (filler)
6. Wrack: health > 70% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 9. Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r2 when mana < 50%, Voidwalker

124.9 kills/h (95% CI 124.6–125.3), -1.1% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 2, Improved Corruption 5, Grim Reach 2*, Soul Harvest 1, Improved Drains 3, Improved Bane of Agony 2, Fel Concentration 3, Amplify Curse 1*, Pandemic 3, Malevolence 1, Siphon Life 1, Soul Siphon 3, Shadow Mastery 1, Wrack 1
- Free points (no modelled effect, marked *): 3

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony
3. Corruption: target lacks Corruption
4. Siphon Life: target lacks Siphon Life
5. Shadow Bolt r2: mana < 50% (filler)
6. Wrack: health > 70% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 10. Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r1 when mana < 50%, Voidwalker

123.9 kills/h (95% CI 123.4–124.4), -1.9% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 5, Improved Corruption 4, Grim Reach 2*, Soul Harvest 2, Improved Drains 3, Improved Bane of Agony 2, Amplify Curse 1*, Pandemic 2, Malevolence 3, Siphon Life 1, Soul Siphon 3, Wrack 1
- Free points (no modelled effect, marked *): 3

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony
3. Corruption: target lacks Corruption
4. Siphon Life: target lacks Siphon Life
5. Shadow Bolt r1: mana < 50% (filler)
6. Wrack: health > 70% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 11. Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s; Shadow Bolt when more than 1 mob in the pull, Voidwalker

123.6 kills/h (95% CI 123.2–123.9), -2.2% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 2, Improved Corruption 4, Grim Reach 1*, Soul Harvest 2, Improved Drains 3, Improved Bane of Agony 1, Fel Concentration 3, Amplify Curse 1*, Pandemic 2, Malevolence 2, Curse of Exhaustion 1*, Siphon Life 1, Soul Siphon 3, Shadow Mastery 2, Wrack 1
- Free points (no modelled effect, marked *): 3

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
3. Corruption: target lacks Corruption and TTK ≥ 6 s
4. Siphon Life: target lacks Siphon Life and TTK ≥ 6 s
5. Drain Soul: with Soul Harvest and Drain Soul kills in 1-5 s
6. Shadow Bolt: not 1 mob in the pull (filler)
7. Wrack: health > 50% (filler)
8. Drain Life: always
9. Shadow Bolt: always
10. Shadow Bolt r2: always
11. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:drain_soul`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 12. CoE, Immolate → Drain Life; DoTs if TTK ≥ 6 s, Succubus (sacrificed Voidwalker)

123.4 kills/h (95% CI 122.7–124.1), -2.3% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Demonic Embrace 3, Unholy Power 5, Demonic Aegis 2, Fel Vitality 3, Demonic Energies 2, Improved Sayaad 3, Demonic Sacrifice 1, Master Summoner 1*, Decimation 1*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 2, Demonic Pact 1
- Free points (no modelled effect, marked *): 2

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Curse of the Elements: target has no curse and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Drain Life: always (filler)
6. Shadow Bolt: always
7. Shadow Bolt r2: always
8. Shadow Bolt r1: always

Leans on estimates: `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 13. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s; Shadow Bolt when mana < 30%, Succubus (sacrificed Voidwalker)

123.0 kills/h (95% CI 122.2–123.9), -2.6% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Improved Imp 2, Demonic Embrace 4, Unholy Power 2, Demonic Aegis 1, Improved Voidwalker 2, Fel Vitality 2, Demonic Energies 1, Improved Sayaad 2, Demonic Sacrifice 1, Master Summoner 2*, Fel Domination 1*, Demonic Brand 2, Improved Felhunter 1*, Soul Link 1, Demonic Knowledge 3, Master Demonologist 2, Demonic Pact 1
- Free points (no modelled effect, marked *): 4

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Shadow Bolt: mana < 30% (filler)
6. Drain Life: always (filler)
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:fel_domination`, `talents.json:demonic_brand`, `talents.json:improved_felhunter`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 14. Agony, Immolate → Drain Life; DoTs if TTK ≥ 6 s, Succubus (sacrificed Voidwalker)

123.0 kills/h (95% CI 122.0–123.9), -2.6% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 2, Improved Imp 1, Demonic Embrace 4, Unholy Power 4, Demonic Aegis 2, Fel Vitality 2, Demonic Energies 1, Improved Sayaad 3, Demonic Sacrifice 1, Master Summoner 1*, Decimation 2*, Demonic Brand 2, Improved Felhunter 1*, Soul Link 1, Demonic Knowledge 3, Demonic Pact 1
- Free points (no modelled effect, marked *): 4

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
4. Immolate: target lacks Immolate and TTK ≥ 6 s
5. Drain Life: always (filler)
6. Shadow Bolt: always
7. Shadow Bolt r2: always
8. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:demonic_brand`, `talents.json:improved_felhunter`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`

### 15. Agony, Corruption, Immolate → Shadow Bolt r1; DoTs if TTK ≥ 12 s, Succubus (sacrificed Voidwalker)

122.6 kills/h (95% CI 122.1–123.1), -3.0% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 1, Improved Imp 2, Demonic Embrace 4, Unholy Power 5, Demonic Aegis 1, Improved Voidwalker 1, Fel Vitality 2, Demonic Energies 2, Improved Sayaad 1, Demonic Sacrifice 1, Master Summoner 1*, Decimation 2*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 1, Demonic Pact 1
- Free points (no modelled effect, marked *): 3

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt r1: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony and TTK ≥ 12 s
4. Corruption: target lacks Corruption and TTK ≥ 12 s
5. Immolate: target lacks Immolate and TTK ≥ 12 s
6. Shadow Bolt r1: always (filler)
7. Shadow Bolt r2: always
8. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:improved_voidwalker`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`, `params.json:sb_r1_coeff_mult`

### 16. Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s, Voidwalker

122.4 kills/h (95% CI 122.1–122.6), -3.1% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 3, Improved Corruption 5, Grim Reach 1*, Soul Harvest 2, Improved Drains 3, Improved Bane of Agony 2, Fel Concentration 3, Pandemic 1, Malevolence 2, Siphon Life 1, Soul Siphon 2, Shadow Mastery 3, Wrack 1
- Free points (no modelled effect, marked *): 1

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
3. Corruption: target lacks Corruption and TTK ≥ 6 s
4. Siphon Life: target lacks Siphon Life and TTK ≥ 6 s
5. Drain Soul: with Soul Harvest and Drain Soul kills in 1-5 s
6. Wrack: health > 50% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:drain_soul`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 17. Agony, Corruption → Shadow Bolt r2, Succubus (sacrificed Voidwalker)

122.3 kills/h (95% CI 121.6–122.9), -3.2% vs DT_SS_WRACK_70_NOCOE.

- **Demonology (31):** Improved Health Funnel 2, Improved Imp 1, Demonic Embrace 3, Unholy Power 4, Demonic Aegis 1, Fel Vitality 3, Demonic Energies 2, Improved Sayaad 1, Demonic Sacrifice 1, Master Summoner 2*, Decimation 2*, Fel Domination 1*, Demonic Brand 2, Soul Link 1, Demonic Knowledge 3, Master Demonologist 1, Demonic Pact 1
- Free points (no modelled effect, marked *): 5

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt r2: Shadow Trance
2. Searing Pain: with Demonic Brand and pet alive and Demonic Brand needs a refresh
3. Bane of Agony: target lacks Bane of Agony
4. Corruption: target lacks Corruption
5. Shadow Bolt r2: always (filler)
6. Shadow Bolt r2: always
7. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:life_tap`, `spells.json:searing_pain`, `spells.json:shadow_bolt`, `talents.json:demonic_embrace`, `talents.json:master_summoner`, `talents.json:decimation`, `talents.json:fel_domination`, `talents.json:demonic_brand`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`, `params.json:brand_mult`, `params.json:brand_scale`, `params.json:sb_r2_coeff_mult`

### 18. Agony, Corruption, Siphon Life → Wrack above 50% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s, Voidwalker

121.9 kills/h (95% CI 120.7–123.1), -3.5% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 4, Improved Corruption 2, Grim Reach 2*, Soul Harvest 2, Improved Drains 3, Fel Concentration 2, Amplify Curse 1*, Pandemic 1, Malevolence 2, Nightfall 1, Curse of Exhaustion 1*, Siphon Life 1, Soul Siphon 3, Shadow Mastery 3, Wrack 1
- Free points (no modelled effect, marked *): 4

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
3. Corruption: target lacks Corruption and TTK ≥ 6 s
4. Siphon Life: target lacks Siphon Life and TTK ≥ 6 s
5. Drain Soul: with Soul Harvest and Drain Soul kills in 1-5 s
6. Wrack: health > 50% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:drain_soul`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 19. Agony, Corruption → Wrack above 70% HP, else Drain Life; DS finish; DoTs if TTK ≥ 6 s, Voidwalker

121.6 kills/h (95% CI 121.0–122.3), -3.7% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 5, Improved Corruption 1, Grim Reach 1*, Soul Harvest 2, Improved Drains 3, Improved Bane of Agony 2, Amplify Curse 1*, Pandemic 3, Malevolence 3, Nightfall 1, Siphon Life 1, Soul Siphon 3, Shadow Mastery 2, Wrack 1
- Free points (no modelled effect, marked *): 2

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony and TTK ≥ 6 s
3. Corruption: target lacks Corruption and TTK ≥ 6 s
4. Drain Soul: with Soul Harvest and Drain Soul kills in 1-5 s
5. Wrack: health > 70% (filler)
6. Drain Life: always
7. Shadow Bolt: always
8. Shadow Bolt r2: always
9. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:drain_soul`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:amplify_curse`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

### 20. Agony, Corruption, Siphon Life → Wrack above 70% HP, else Drain Life; Shadow Bolt r1 when TTK ≥ 15 s, Voidwalker

121.5 kills/h (95% CI 120.9–122.1), -3.8% vs DT_SS_WRACK_70_NOCOE.

- **Affliction (31):** Improved Life Tap 2, Suppression 4, Improved Corruption 4, Grim Reach 2*, Soul Harvest 1, Improved Drains 3, Improved Bane of Agony 1, Fel Concentration 3, Pandemic 2, Malevolence 3, Nightfall 1, Siphon Life 1, Soul Siphon 3, Wrack 1
- Free points (no modelled effect, marked *): 2

Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):

1. Shadow Bolt: Shadow Trance
2. Bane of Agony: target lacks Bane of Agony
3. Corruption: target lacks Corruption
4. Siphon Life: target lacks Siphon Life
5. Shadow Bolt r1: TTK ≥ 15 s (filler)
6. Wrack: health > 70% (filler)
7. Drain Life: always
8. Shadow Bolt: always
9. Shadow Bolt r2: always
10. Shadow Bolt r1: always

Leans on estimates: `spells.json:bane_of_agony`, `spells.json:drain_life`, `spells.json:life_tap`, `spells.json:shadow_bolt`, `spells.json:siphon_life`, `spells.json:wrack`, `talents.json:suppression`, `talents.json:siphon_life`, `talents.json:wrack`, `levels.json:levels.pets`, `params.json:mob_hp_mult`, `params.json:mob_dmg_mult`, `params.json:wrack_dmg_mult`, `params.json:drain_dmg_mult`, `params.json:pet_dmg_mult`, `params.json:pet_hit_chance`

