# Wrack: weryfikacja implementacji i porównanie AFF_WRACK z DT_SS

Data: 26 XI 2026. Tabele odtwarza `npm run forever:wrack-study` (120 sesji na komórkę, duele po 200 sesji, 95% CI z par).
Skróty: kph = zabicia na godzinę, TTK = średni czas zabicia moba, przerwy/h = przerwy na jedzenie/picie na godzinę.

## 1. Dane: źródła i stan modelu

| Co | Wowhead Forever (spell 1316697) | warcraft.wiki.gg / Blizzard | Model | Stan |
|---|---|---|---|---|
| Koszt, channel, ticki | 200 many, channel 6 s, tick co 1 s | to samo | 200, 6000 ms, 1000 ms | zgodne |
| Obrażenia na tick | "25 every 1 second" | wiki: 60 na tick (poziom 60); Blizzard: bazowo 36 → 86/s na 60, potem -30% | (36 + 2.5 x (lvl - 40)) x 0.7 = 25.2 na 40, 60.2 na 60 | zgodne (Wowhead pokazuje wartość dla 40) |
| Współczynnik SP | "SP mod: 0.2002" | Blizzard: 0.286, potem -30% | 0.286 x 0.7 = 0.2002 | zgodne. Wcześniej było to założenie, teraz potwierdzone. |
| Przyspieszenie DoT-ów | Effect #2: Dummy 100, skrypt serwerowy | Blizzard, hotfix 10 XI: "Wrack speeds up how often your periodic effects deal damage, not how long they last. Bane of Agony still lasts its full 24 seconds"; "the time it skips is kept after Wrack's channel ends" | do 26 XI: stała liczba ticków (DoT kończył się wcześniej) | **BŁĄD, poprawiony** |
| Które DoT-y | - | Siphon Life, Corruption, Bane of Agony | te trzy | zgodne |
| Soul Siphon | - | +4% na rangę za każdy efekt (Corruption/Siphon/Agony), max 36%, działa na Wrack | tak, bez liczenia samego Wracka | zgodne |
| Improved Drains | - | "no longer increases Wrack damage" | nie działa na Wrack | zgodne |
| Kryty | "Periodic Can Crit" | Pandemic obejmuje Wrack | kryty z Pandemic | zgodne |
| Nightfall, Fel Concentration | - | wiki: obie działają na Wrack | obie działają | zgodne |

### Poprawka (commit `fix(forever): Wrack speeds up DoT ticks without shortening them`)

- DoT ma teraz czas wygaśnięcia w czasie zegarowym (`expiresAt`). Wrack skraca odstęp między tickami o połowę, więc w tym samym czasie trwania DoT dostaje dodatkowe ticki.
- Czas "przeskoczony" przez Wracka zostaje zachowany po końcu channela, jak w przykładzie Blizzarda: 1 s Wracka w trakcie 3-sekundowego ticka Corruption daje następny tick za 1 s, a nie za 2.
- Tick wypadający po wygaśnięciu przepada.
- Rampa Bane of Agony (0.5/1/1.5) liczy się według upływu czasu trwania, a nie numeru ticka.
- Testy: `tests/forever/wrack.test.ts`. Sprawdzają liczby z Wowhead, brak ticków po końcu DoT-a, dodatkowe ticki pod Wrackiem, odstęp 1.5 s między tickami Corruption w trakcie channela i zachowanie przeskoczonego czasu. Test na dodatkowe ticki nie przechodzi na starym kodzie.

### Ile ten błąd faktycznie kosztował

Mniej, niż się wydawało. Przy domyślnym HP mobów walka trwa ok. 18 s, a DoT-y trwają 18–30 s. Mob ginie, zanim DoT dobiegnie końca, więc także w starym modelu przyspieszone ticki trafiały przed śmiercią moba.

| AFF_WRACK, average, 1 mob | stary model | nowy model |
|---|---:|---:|
| HP moba x1, poziom 50 | 110.8 kph, TTK 18.3 s | 110.7 kph, TTK 18.6 s |
| HP moba x2, poziom 50 | 36.8 kph, TTK 44.5 s | **58.2 kph, TTK 33.8 s** |
| HP moba x2, poziom 55 | 39.7 kph | **62.9 kph** |
| HP moba x3, poziom 50 | 29.8 kph | 20.3 kph |

Przy HP x3 wynik spada z innego powodu. Więcej obrażeń z DoT-ów daje więcej zagrożenia, mob częściej przechodzi z voidwalkera na gracza (1.95 vs 1.34 przełączeń na zabicie) i gracz ginie 19 razy na godzinę zamiast 11. To skrajny scenariusz.

**Wniosek:** to nie błąd w Wracku sprawiał, że AFF_WRACK przegrywał z DT_SS. Przyczyny są inne (rozdział 2).

## 2. Dlaczego AFF_WRACK przegrywa z DT_SS

Rozdzieliłem talenty od fillera za pomocą wariantów testowych:

- **W_DL**: talenty AFF_WRACK, ale punkt z Wracka idzie w Improved Health Funnel (niemodelowany, bez efektu); filler Drain Life.
- **DW_WRACK / DW_DL**: talenty DT_SS w innej kolejności. Amplify Curse i Malevolence idą przed Unholy Power i Demonic Energies, dzięki czemu Wrack jest od poziomu 40. Filler to odpowiednio Wrack zawsze albo Wrack na 1 moba i Drain Life na kilka.

1 mob, average, domyślne parametry:

| build | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 91.0 (25.0 s, 22/h) | 111.3 (19.2, 30) | 110.7 (18.6, 28) | 114.0 (17.6, 27) | 112.1 (17.6, 22) |
| W_DL | 106.8 (23.1, 12) | 113.1 (22.4, 9) | 117.4 (21.3, 7) | 121.6 (21.2, 2) | 119.1 (21.6, 2) |
| DT_SS | 116.7 (22.9, 0) | 116.5 (22.9, 0) | 123.4 (21.2, 0) | 126.2 (20.5, 0) | 115.4 (16.9, 23) |
| DW_WRACK | 105.4 (20.8, 21) | 119.7 (18.4, 24) | 119.6 (17.6, 24) | 121.1 (16.6, 24) | 115.4 (16.9, 23) |

Trzy przyczyny:

1. **Samowystarczalność.** Drain Life leczy, a Life Tap zamienia HP na manę. Przy Drain Life ta pętla domyka się prawie bez strat:
   - DT_SS na poziomie 50: netto ok. 100 many na zabicie i zero przerw.
   - Wrack nie leczy, więc HP zjedzone przez Life Tapa trzeba odzyskać jedzeniem: ok. 730 many netto na zabicie i 22–30 przerw na godzinę po ok. 5.5 s.
   - Obrażenia od moba prawie nie mają znaczenia, bo voidwalker tankuje. `mob_dmg_mult` 0.5 i 1.5 zmienia wynik o 1–6 kph.
2. **Szybkość.** Wrack jako filler skraca TTK o 2–4 s (9–19%). To nie wystarcza, żeby pokryć przerwy.
3. **Talenty.** Talenty AFF_WRACK są słabsze: W_DL przegrywa z DT_SS o 5–10 kph przy tym samym fillerze. DT_SS ma od 40 Suppression, Improved Life Tap, Unholy Power i Demonic Energies, a AFF_WRACK zamiast nich bierze Soul Harvest, Curse of Exhaustion i wcześniej Fel Concentration i Nightfall.

### Punkt w Wracka w DT_SS (pytanie z początku rozmowy)

DT_SS bierze Wracka jako 50. punkt, czyli dopiero na poziomie 59. Rotacja "drain_life" używa Wracka na pullach z jednym mobem, a bez progu HP to obniża wynik. Duel DT_SS z DT_SS bez Wracka (1 mob, average, 300 sesji):

| poziom | DT_SS | bez Wracka | różnica |
|---|---:|---:|---:|
| 58 | 113.9 | 126.0 | -11.5 (CI -12.4..-10.6) |
| 59 | 114.8 | 124.6 | -9.5 |
| 60 | 115.0 | 123.9 | -8.6 |

Na 2 moby różnicy nie ma. Z progiem `wrack_min_hp_pct` (rozdział 3) ten punkt zaczyna się opłacać: DT_SS na 58 ma wtedy 127.7 kph.

## 3. Kiedy Wrack jako filler wypada lepiej

### Nowa opcja rotacji: `wrack_min_hp_pct`

Wrack jest używany, tylko gdy HP gracza jest powyżej progu. Poniżej progu fillerem jest Drain Life, które leczy, więc Life Tap dalej opłaca rzucanie. Wartość 0, czyli domyślna, oznacza dotychczasowe zachowanie (Wrack zawsze). Opcja jest też w specyfikacji rotacji dla addonu, jako warunek `hp_pct_above`.

Wpływ progu, 1 mob, average:

| build / próg | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS (bez Wracka do 58) | 116.7 | 116.5 | 123.4 | 126.2 | 115.4 → 127.3 z progiem 0.55–0.7 |
| DW_WRACK, próg 0 | 105.4 | 119.7 | 119.6 | 121.1 | 115.4 |
| DW_WRACK, próg 0.4 | 117.9 | 121.2 | 127.9 | 129.5 | 123.4 |
| DW_WRACK, próg 0.55 | 120.8 | 120.9 | **129.8** | **132.2** | 127.3 |
| DW_WRACK, próg 0.7 | **121.6** | **122.3** | 128.7 | 131.4 | 127.3 |
| DW_WRACK, próg 0.85 | 119.3 | 118.3 | 124.1 | 125.3 | 125.5 |
| AFF_WRACK, próg 0.7 | 106.4 | 114.3 | 118.5 | 124.3 | 121.6 |

Najlepszy zakres to **0.55–0.7**. Wrack daje wtedy krótsze TTK, a Drain Life utrzymuje HP, więc przerw jest prawie zero.

### Sparowane duele: DT_SS (a) vs DW_DL (b), próg 0.6 dla obu

Wynik ujemny oznacza, że lepszy jest Wrack z progiem (DW_DL). Na 58 oba buildy mają te same talenty, więc wynik jest identyczny.

| scenariusz | 40 | 45 | 50 | 55 | uwagi |
|---|---:|---:|---:|---:|---|
| average, 1 mob | -4.0 | -4.1 (44) | -5.9 | -5.9 (54) | wygrywa Wrack na każdym poziomie 40–56 |
| quest, 1 mob | -2.2 | -3.9 | -3.0 | -3.7 | mniejszy zysk przy słabym gearze |
| good, 1 mob | -5.0 | -7.2 | -7.5 | -7.9 | Wrack skaluje się z SP dwa razy lepiej niż Drain Life (0.2 vs 0.1 na tick) |
| HP moba x1.5 | -6.2 | -7.8 | -6.7 | -7.2 | dłuższa walka daje więcej ticków DoT-ów pod Wrackiem |
| HP moba x2 | -1.4 | -2.9 | ~0 | -3.4 | wraca problem many i przerw |
| obrażenia moba x1.5 | -4.0 | -4.3 | -5.0 | -5.2 | bez zmian |
| przerwa przy 50% HP | -2.3 | -4.5 | -4.6 | -3.9 | wciąż wygrywa |
| average, 2 moby | -1.4 | -0.8 (44) | +1.1 | -0.1 (54) | remis: na 2+ moby DW_DL i tak używa Drain Life |
| average, 3 moby | **+26.0** | **+21.7** (44) | +1.1 | -0.1 (54) | DW_DL przegrywa na 40–45, bo odkłada Unholy Power (pet tankuje 3 moby) |

Wrack bez progu i bez Drain Life na kilka mobów (DW_WRACK) na 2–3 mobach przegrywa za każdym razem, o 30–75 kph.

### Odpowiedź w skrócie

Wrack jako filler wygrywa, gdy spełnione są trzy warunki:

1. Pull z **jednym mobem**.
2. Wrack jest **przeplatany z Drain Life** według HP (`wrack_min_hp_pct` ok. 0.6). Sam Wrack przegrywa przez przerwy na jedzenie.
3. Talenty mają **Suppression i Improved Life Tap od 40**, jak w DT_SS. Wrack trzeba wtedy wziąć zamiast wczesnych punktów w Demonology.

Zysk to +4–6 kph na average, +7–8 kph na good gear i +6–8 kph przy grubszych mobach. Na pule z 3 mobami na poziomach 40–45 lepszy jest DT_SS, bo wcześnie ma Unholy Power. Od 46 oba warianty wychodzą na to samo.

Build AFF_WRACK w obecnej postaci nie wygrywa z DT_SS w żadnym sprawdzonym scenariuszu, także z progiem HP. Ogranicza go zestaw talentów.

## 4. Ograniczenia

- Model przerw: przerwa jest tylko poniżej 30% HP (`break_hp_pct`), a wtedy gracz je i pije do pełna. Jeśli w praktyce pije się częściej, Wrack bez progu wypada jeszcze gorzej.
- Tick, który wypada po wygaśnięciu DoT-a, przepada. W Classic tak było, ale dla Forever nie jest to potwierdzone.
- Kolejność talentów w DW (Wrack na 40 zamiast Unholy Power) to propozycja testowa. Nie jest dodana do `builds.json`.
- Rampa Agony 0.5/1/1.5 nadal jest niepotwierdzona dla Forever.

## 5. Build DT_SS_WRACK (dodany 26 XI)

Build ma talenty DT_SS w kolejności z Wrackiem na 40. Amplify Curse i Malevolence idą przed Unholy Power i Demonic Energies, a na 60 talenty są takie same jak w DT_SS.

Rotacja to Affliction. Filler to Wrack, dopóki HP gracza jest powyżej 70% (pole buildu `wrack_min_hp_pct: 0.7`, które nadpisuje parametr). Poniżej tego progu filler to Drain Life. Reguła działa przy każdej liczbie mobów.

Na pullach z kilkoma mobami wariant z Wrackiem od progu 70% wypadł lepiej niż wariant "Wrack tylko na 1 moba". Przy 2 mobach i progu 0.7: poziom 50 to 145.2 vs 139.5 kph, poziom 55 to 148.2 vs 141.6.

Sparowane duele z DT_SS (domyślne parametry, 200 sesji, seed 7). Wynik ujemny oznacza, że DT_SS_WRACK jest lepszy.

| poziom | 1 mob | 2 moby | 3 moby |
|---:|---:|---:|---:|
| 40 | -4.9 | -1.1 | +22.1 |
| 42 | -5.5 | -5.2 | +16.3 |
| 44 | -5.6 | -3.7 | +16.9 |
| 46 | -4.7 | -4.6 | -4.1 |
| 48 | -3.7 | -2.1 | -1.7 |
| 50 | -5.3 | -4.5 | -4.5 |
| 52 | -7.5 | -7.9 | -7.8 |
| 54 | -5.1 | -6.2 | -6.3 |
| 56 | -3.9 | -4.7 | -6.1 |
| 58 | -13.9 | ~0 | +1.6 |
| 60 | -9.9 | +1.3 | +4.5 |

Na pullach z 3 mobami na poziomach 40–45 lepszy jest DT_SS, bo ma Unholy Power od 40 (voidwalker tankuje 3 moby).

Na poziomach 58–60 DT_SS na pojedynczym mobie używa Wracka bez progu HP, stąd duża różnica na 1 moba.

W addonie próg jest warunkiem `hp_pct_above` 70, czyli "HP powyżej 70%". Przy dokładnie 70% wybierany jest Drain Life.
