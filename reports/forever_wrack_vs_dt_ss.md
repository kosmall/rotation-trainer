> **Uwaga (27 XI 2026): ten raport jest nieaktualny.** Liczby i wnioski poniżej pochodzą z 26 XI, z modelu, w którym demon zaczynał każdy pull z pełnym HP i maną. Od 27 XI HP i mana peta są przenoszone między pullami, reguła Succubusa na 20-29 została usunięta (patrz `builds.json`). Aktualne tabele są w sekcji na końcu. Wnioski z 26 XI o Succubusie nie obowiązują. Wnioski o AFF_WRACK zmieniły się wyraźnie (poziom 40: 91 → 77 kph w nowych tabelach); DT_SS prawie bez zmian.

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

## 5. Build DT_SS_WRACK_70 (dodany 26 XI jako DT_SS_WRACK)

Build ma talenty DT_SS w kolejności z Wrackiem na 40. Amplify Curse i Malevolence idą przed Unholy Power i Demonic Energies, a na 60 talenty są takie same jak w DT_SS.

Rotacja to Affliction. Filler to Wrack, dopóki HP gracza jest powyżej 70% (pole buildu `wrack_min_hp_pct: 0.7`, które nadpisuje parametr). Poniżej tego progu filler to Drain Life. Reguła działa przy każdej liczbie mobów.

Na pullach z kilkoma mobami wariant z Wrackiem od progu 70% wypadł lepiej niż wariant "Wrack tylko na 1 moba". Przy 2 mobach i progu 0.7: poziom 50 to 145.2 vs 139.5 kph, poziom 55 to 148.2 vs 141.6.

Sparowane duele z DT_SS (domyślne parametry, 200 sesji, seed 7). Wynik ujemny oznacza, że DT_SS_WRACK_70 jest lepszy.

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

## 6. Próg HP dla Wracka: 40–90% co 10 p.p.

Wszystkie warianty mają talenty DT_SS_WRACK_70 (order `DT_SS_WRACK`). Wrack jest fillerem, gdy HP gracza jest powyżej progu, a przy HP równym progowi lub niższym fillerem jest Drain Life, przy każdej liczbie mobów. Dla porównania w tabelach jest DT_SS.

Każda komórka to kills/h (TTK, przerwy na godzinę), 200 sesji na komórkę. Pogrubiony jest najlepszy wynik w kolumnie. Tabele odtwarza `npm run forever:wrack-thresholds`.

### 1 mob, gear average

| wariant | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS | 116.6 (22.9 s, 0/h) | 116.4 (22.9 s, 0/h) | 123.3 (21.2 s, 0/h) | 126.2 (20.5 s, 0/h) | 115.0 (17.0 s, 23/h) |
| Wrack > 40% HP | 117.9 (20.7 s, 10/h) | 121.2 (20.9 s, 6/h) | 127.9 (18.9 s, 8/h) | 129.5 (18.6 s, 6/h) | 123.2 (18.3 s, 13/h) |
| Wrack > 50% HP | 120.3 (21.7 s, 1/h) | 121.1 (21.7 s, 0/h) | **129.8 (19.7 s, 0/h)** | **132.1 (19.2 s, 0/h)** | 126.5 (19.2 s, 5/h) |
| Wrack > 60% HP | 120.7 (21.8 s, 0/h) | 120.9 (21.8 s, 0/h) | 129.2 (19.9 s, 0/h) | 131.8 (19.3 s, 0/h) | **127.4 (19.6 s, 3/h)** |
| Wrack > 70% HP | **121.5 (21.6 s, 0/h)** | **122.2 (21.4 s, 0/h)** | 128.6 (20.0 s, 0/h) | 131.3 (19.4 s, 0/h) | 127.2 (19.9 s, 2/h) |
| Wrack > 80% HP | 119.3 (22.2 s, 0/h) | 118.3 (22.4 s, 0/h) | 124.0 (21.0 s, 0/h) | 125.3 (20.7 s, 0/h) | 125.6 (20.6 s, 0/h) |
| Wrack > 90% HP | 119.1 (22.2 s, 0/h) | 118.2 (22.5 s, 0/h) | 124.0 (21.0 s, 0/h) | 125.3 (20.7 s, 0/h) | 125.5 (20.6 s, 0/h) |

### 2 moby, gear average

| wariant | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS | 133.2 (23.0 s, 0/h) | 130.8 (23.5 s, 0/h) | 140.7 (21.6 s, 0/h) | 142.2 (21.3 s, 0/h) | 139.5 (21.5 s, 1/h) |
| Wrack > 40% HP | 122.5 (22.1 s, 12/h) | 134.5 (21.9 s, 6/h) | 143.4 (20.1 s, 6/h) | 147.7 (19.7 s, 4/h) | 130.0 (19.9 s, 13/h) |
| Wrack > 50% HP | 128.9 (22.6 s, 5/h) | 134.4 (22.7 s, 0/h) | **146.0 (20.6 s, 0/h)** | **149.5 (20.1 s, 0/h)** | 135.2 (20.3 s, 9/h) |
| Wrack > 60% HP | 132.9 (22.7 s, 1/h) | 134.5 (22.8 s, 0/h) | 145.8 (20.7 s, 0/h) | 149.2 (20.1 s, 0/h) | 138.2 (20.6 s, 5/h) |
| Wrack > 70% HP | 134.4 (22.6 s, 1/h) | **135.4 (22.6 s, 0/h)** | 145.2 (20.8 s, 0/h) | 148.3 (20.3 s, 0/h) | **140.5 (20.8 s, 3/h)** |
| Wrack > 80% HP | **135.1 (22.6 s, 0/h)** | 132.5 (23.2 s, 0/h) | 140.8 (21.6 s, 0/h) | 142.1 (21.3 s, 0/h) | 140.4 (21.3 s, 1/h) |
| Wrack > 90% HP | 135.0 (22.7 s, 0/h) | 132.5 (23.2 s, 0/h) | 140.8 (21.6 s, 0/h) | 142.1 (21.3 s, 0/h) | 140.4 (21.3 s, 1/h) |

### 3 moby, gear average

| wariant | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS | **135.2 (23.4 s, 1/h)** | **136.8 (23.7 s, 0/h)** | 147.4 (21.8 s, 0/h) | 148.4 (21.5 s, 0/h) | 144.1 (21.8 s, 1/h) |
| Wrack > 40% HP | 103.9 (22.7 s, 9/h) | 122.5 (21.3 s, 15/h) | 148.5 (20.7 s, 3/h) | 153.7 (20.1 s, 4/h) | 120.5 (21.7 s, 10/h) |
| Wrack > 50% HP | 107.8 (22.6 s, 10/h) | 121.3 (21.7 s, 14/h) | 152.2 (20.9 s, 0/h) | **156.1 (20.4 s, 0/h)** | 130.7 (21.4 s, 7/h) |
| Wrack > 60% HP | 111.3 (22.7 s, 9/h) | 119.8 (22.3 s, 11/h) | **152.3 (21.0 s, 0/h)** | 155.8 (20.4 s, 0/h) | 138.2 (21.3 s, 5/h) |
| Wrack > 70% HP | 113.1 (23.0 s, 6/h) | 120.1 (22.9 s, 8/h) | 151.8 (21.0 s, 0/h) | 154.9 (20.6 s, 0/h) | 142.4 (21.4 s, 3/h) |
| Wrack > 80% HP | 111.9 (23.5 s, 4/h) | 115.2 (24.0 s, 5/h) | 147.3 (21.8 s, 0/h) | 148.1 (21.6 s, 0/h) | 144.5 (21.7 s, 1/h) |
| Wrack > 90% HP | 112.1 (23.5 s, 4/h) | 114.1 (24.0 s, 5/h) | 147.3 (21.8 s, 0/h) | 148.1 (21.6 s, 0/h) | **144.5 (21.7 s, 1/h)** |

### 1 mob, gear quest

| wariant | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS | 111.4 (24.3 s, 0/h) | 105.8 (26.0 s, 0/h) | 116.5 (22.9 s, 0/h) | 116.5 (22.9 s, 0/h) | 98.5 (20.8 s, 23/h) |
| Wrack > 40% HP | 104.0 (23.9 s, 13/h) | **110.9 (23.1 s, 11/h)** | 115.9 (21.7 s, 8/h) | 117.2 (21.2 s, 9/h) | 108.1 (21.1 s, 17/h) |
| Wrack > 50% HP | 111.2 (23.7 s, 4/h) | 109.6 (24.7 s, 1/h) | 118.0 (22.3 s, 1/h) | **120.7 (21.8 s, 0/h)** | 110.2 (22.0 s, 11/h) |
| Wrack > 60% HP | 113.6 (23.6 s, 1/h) | 109.7 (24.8 s, 0/h) | 119.5 (22.1 s, 0/h) | 120.3 (21.9 s, 0/h) | 112.4 (22.6 s, 6/h) |
| Wrack > 70% HP | **114.6 (23.4 s, 0/h)** | 110.0 (24.7 s, 0/h) | **119.9 (22.0 s, 0/h)** | 120.0 (22.0 s, 0/h) | 113.9 (22.8 s, 3/h) |
| Wrack > 80% HP | 113.3 (23.8 s, 0/h) | 108.0 (25.3 s, 0/h) | 117.2 (22.7 s, 0/h) | 117.4 (22.7 s, 0/h) | 114.4 (23.3 s, 1/h) |
| Wrack > 90% HP | 113.2 (23.8 s, 0/h) | 107.4 (25.5 s, 0/h) | 117.2 (22.7 s, 0/h) | 117.4 (22.7 s, 0/h) | **114.5 (23.2 s, 1/h)** |

### 1 mob, gear good

| wariant | 40 | 45 | 50 | 55 | 59 |
|---|---:|---:|---:|---:|---:|
| DT_SS | 123.2 (21.2 s, 0/h) | 124.1 (21.0 s, 0/h) | 133.0 (19.1 s, 0/h) | 134.7 (18.7 s, 0/h) | 126.6 (14.8 s, 21/h) |
| Wrack > 40% HP | 126.5 (19.3 s, 6/h) | 130.8 (18.9 s, 4/h) | 139.0 (17.1 s, 5/h) | 140.9 (17.0 s, 3/h) | 136.1 (16.7 s, 7/h) |
| Wrack > 50% HP | 128.3 (20.0 s, 0/h) | 131.2 (19.4 s, 0/h) | 140.3 (17.6 s, 0/h) | 142.5 (17.2 s, 0/h) | 139.0 (17.5 s, 2/h) |
| Wrack > 60% HP | 128.2 (20.1 s, 0/h) | **131.3 (19.4 s, 0/h)** | **140.5 (17.6 s, 0/h)** | 142.5 (17.3 s, 0/h) | 139.6 (17.6 s, 1/h) |
| Wrack > 70% HP | **129.3 (19.8 s, 0/h)** | 131.0 (19.5 s, 0/h) | 139.9 (17.7 s, 0/h) | **142.8 (17.2 s, 0/h)** | **140.1 (17.6 s, 0/h)** |
| Wrack > 80% HP | 125.6 (20.7 s, 0/h) | 129.0 (19.9 s, 0/h) | 134.0 (18.9 s, 0/h) | 139.2 (17.9 s, 0/h) | 135.9 (18.5 s, 0/h) |
| Wrack > 90% HP | 125.5 (20.7 s, 0/h) | 126.8 (20.4 s, 0/h) | 133.6 (18.9 s, 0/h) | 138.1 (18.1 s, 0/h) | 135.8 (18.5 s, 0/h) |


### Wnioski z progów

- **Najlepszy zakres to 50–70%.** Wyniki w tym przedziale różnią się zwykle o 1–2 kph, czyli mniej więcej tyle, ile wynosi rozrzut symulacji.
  - Poziomy 40–45 (najlepszy próg): 1 mob z gearem average 70%; quest 70% na 40 i 40% na 45; good 70% na 40 i 60% na 45; 2 moby 80% na 40 i 70% na 45.
  - Poziomy 50–55: najczęściej wygrywa 50–60%.
  - Poziom 59: wygrywa 60–90%, ale różnice są małe.
  - Próg 70% (DT_SS_WRACK_70) to dobry wybór "na wszystko". Nigdzie nie traci więcej niż ok. 2 kph do najlepszego progu.
- **40% to za nisko.** Wraca problem przerw na jedzenie (6–17 na godzinę), bo po Life Tapie HP nie zdąży się odbudować. Na 2–3 moby na poziomach 40 i 59 traci 10–24 kph do najlepszego progu.
- **80% i 90% dają prawie to samo.** Po pierwszych Life Tapach HP rzadko wraca powyżej 80%, więc Wrack wchodzi głównie na początku walki. Wynik zbliża się do czystego Drain Life (DT_SS), z niewielkim zyskiem z szybszego startu.
- **3 moby na 40–45:** każdy próg przegrywa z DT_SS o 14–31 kph. Przyczyną są talenty (Unholy Power dopiero po Wracku), a nie próg.
- **Gear:** z gearem good zysk z Wracka jest największy (+5 do +13 kph przy 50–70%). Z gearem quest jest mały, a na poziomie 40 przy progu 40% Wrack przegrywa z DT_SS (104.0 vs 111.4).

## 7. DT_SS_WRACK_50 vs DT_SS_WRACK_70

Oba buildy mają tę samą kolejność talentów (order `DT_SS_WRACK`) i różnią się tylko progiem HP dla Wracka: 50% albo 70%. Poniżej Drain Life.

Sparowane duele (200 sesji, seed 7). Wynik dodatni oznacza, że lepszy jest próg 70%, a ujemny, że 50%.

| poziom | 1 mob | 2 moby | 3 moby |
|---:|---:|---:|---:|
| 40 | +1.2 | +5.2 | +5.1 |
| 42 | +0.9 | +1.1 | +1.3 |
| 44 | +1.5 | +1.1 | +2.6 |
| 46 | +0.3 | +1.3 | +2.6 |
| 48 | -0.6 | +0.7 | +2.2 |
| 50 | -1.3 | -0.8 | -0.3 |
| 52 | -1.4 | -1.5 | -1.3 |
| 54 | -1.1 | -1.1 | -1.1 |
| 56 | ~0 | +3.9 | +8.3 |
| 58 | +1.1 | +7.5 | +10.7 |
| 60 | +1.7 | +4.5 | +10.4 |

Gear quest, 1 mob (40/45/50/55/59): +3.3 / +0.4 / +1.7 / -0.8 / +3.4.
Gear good, 1 mob: +1.1 / -0.2 / -0.4 / +0.2 / +1.1.

- **Próg 50% wygrywa tylko na poziomach ok. 48–54,** i to o ok. 1 kph.
- **Próg 70% wygrywa na pozostałych poziomach.** Na 56–60 przewaga przy 2–3 mobach to 4–11 kph. Przy progu 50% na tych poziomach przerw na jedzenie jest 2–3 razy więcej (3–12 na godzinę wobec 1–7), bo Life Tap zjada więcej HP, niż Drain Life zdąży odbudować.
- **Rekomendacja:** DT_SS_WRACK_70 jako domyślny. DT_SS_WRACK_50 daje mały zysk tylko w środku zakresu poziomów.


## Aktualizacja 27 XI 2026: tabele po przeniesieniu HP i many peta

Wyjście `npm run forever:wrack-study` (120 sesji na komórkę, seed 11).

### 1 mob, average, domyślne parametry

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 76.5 (30.7, 18) | 110.0 (19.2, 32) | 105.5 (19.0, 30) | 111.0 (17.6, 29) | 108.2 (17.9, 24) |
| W_DL | 103.3 (23.3, 15) | 111.3 (22.4, 12) | 113.5 (21.3, 12) | 120.4 (20.7, 6) | 119.6 (21.0, 4) |
| DT_SS | 119.0 (22.1, 1) | 118.7 (22.3, 0) | 126.7 (20.4, 0) | 127.1 (20.3, 0) | 108.2 (18.1, 24) |
| DW_WRACK | 95.5 (23.6, 21) | 117.4 (18.4, 27) | 109.8 (19.2, 25) | 114.8 (17.3, 26) | 108.2 (18.1, 24) |

### 1 mob, quest

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 62.1 (38.9, 17) | 93.0 (24.2, 29) | 85.6 (24.8, 25) | 97.0 (20.8, 28) | 96.5 (20.6, 25) |
| W_DL | 85.4 (28.8, 16) | 96.8 (26.3, 15) | 99.2 (25.3, 12) | 106.1 (23.9, 9) | 106.6 (23.9, 7) |
| DT_SS | 109.7 (24.3, 2) | 108.3 (25.3, 0) | 119.2 (22.2, 0) | 117.1 (22.5, 1) | 92.0 (22.1, 23) |
| DW_WRACK | 89.7 (25.3, 25) | 98.2 (24.4, 24) | 92.4 (23.4, 23) | 98.0 (21.4, 24) | 92.0 (22.1, 23) |

### 1 mob, good

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 106.9 (19.1, 26) | 121.8 (16.5, 29) | 121.7 (15.9, 27) | 123.4 (15.4, 25) | 122.3 (15.3, 22) |
| W_DL | 114.7 (20.7, 11) | 123.0 (19.9, 8) | 126.4 (18.8, 9) | 133.8 (18.5, 2) | 132.4 (18.8, 2) |
| DT_SS | 124.7 (20.9, 0) | 124.4 (20.9, 0) | 135.6 (18.5, 0) | 137.0 (18.3, 0) | 124.7 (14.7, 23) |
| DW_WRACK | 115.2 (17.6, 24) | 127.4 (16.0, 26) | 124.9 (15.7, 24) | 129.1 (14.6, 23) | 124.9 (14.6, 23) |

### 2 moby, average

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 67.7 (30.2, 10) | 83.3 (26.6, 15) | 83.8 (25.3, 15) | 100.3 (21.4, 20) | 111.5 (19.1, 23) |
| W_DL | 93.9 (25.7, 13) | 107.3 (23.9, 13) | 110.6 (22.6, 13) | 122.6 (21.5, 9) | 123.5 (21.5, 7) |
| DT_SS | 115.8 (23.7, 7) | 126.1 (23.1, 2) | 140.0 (21.2, 0) | 141.6 (21.1, 1) | 135.3 (21.5, 3) |
| DW_WRACK | 90.7 (24.3, 18) | 125.3 (19.0, 29) | 102.8 (22.5, 21) | 98.5 (22.8, 18) | 103.9 (20.7, 21) |
| DW_DL | 110.8 (23.3, 8) | 117.4 (23.1, 6) | 138.7 (21.4, 0) | 143.3 (21.1, 0) | 135.3 (21.5, 3) |

### 3 moby, average

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 108.1 (19.9, 34) | 114.7 (19.0, 34) | 101.7 (19.2, 26) | 84.8 (21.1, 14) | 70.9 (24.3, 3) |
| W_DL | 76.9 (25.8, 4) | 89.6 (24.6, 6) | 90.0 (23.3, 6) | 108.5 (22.2, 6) | 113.5 (22.0, 6) |
| DT_SS | 102.5 (23.9, 7) | 116.7 (23.4, 7) | 123.3 (21.9, 4) | 124.4 (21.8, 5) | 121.6 (22.1, 6) |
| DW_WRACK | 69.9 (24.7, 6) | 74.8 (23.9, 8) | 67.6 (26.1, 0) | 64.4 (28.5, 0) | 65.2 (28.7, 1) |
| DW_DL | 99.8 (24.0, 5) | 110.3 (23.9, 6) | 122.5 (22.0, 4) | 133.3 (21.5, 2) | 121.6 (22.1, 6) |

### 1 mob, average, wrack_min_hp_pct=0.4

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 98.4 (22.7, 23) | 112.1 (20.0, 25) | 111.4 (19.8, 22) | 119.0 (18.8, 16) | 118.2 (18.6, 15) |
| DT_SS | 119.0 (22.1, 1) | 118.7 (22.3, 0) | 126.7 (20.4, 0) | 127.1 (20.3, 0) | 122.4 (18.5, 12) |
| DW_WRACK | 113.5 (21.4, 11) | 119.7 (20.8, 9) | 126.5 (19.3, 7) | 129.2 (18.9, 5) | 122.4 (18.5, 12) |

### 1 mob, average, wrack_min_hp_pct=0.55

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 100.1 (22.9, 20) | 112.1 (20.5, 22) | 113.4 (20.0, 18) | 121.4 (19.5, 10) | 120.1 (19.6, 10) |
| DT_SS | 119.0 (22.1, 1) | 118.7 (22.3, 0) | 126.7 (20.4, 0) | 127.1 (20.3, 0) | 124.7 (19.4, 5) |
| DW_WRACK | 116.3 (21.9, 5) | 119.9 (22.0, 0) | 127.7 (20.2, 0) | 131.1 (19.5, 0) | 124.7 (19.4, 5) |

### 1 mob, average, wrack_min_hp_pct=0.7

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 103.5 (22.6, 17) | 112.2 (21.3, 17) | 116.1 (20.2, 15) | 122.8 (19.8, 7) | 121.3 (20.1, 6) |
| DT_SS | 119.0 (22.1, 1) | 118.7 (22.3, 0) | 126.7 (20.4, 0) | 127.1 (20.3, 0) | 126.9 (19.8, 3) |
| DW_WRACK | 119.5 (21.8, 2) | 120.9 (21.8, 0) | 128.1 (20.1, 0) | 130.8 (19.5, 0) | 126.9 (19.8, 3) |

### 1 mob, average, wrack_min_hp_pct=0.85

| build | 40: kph (TTK s, przerwy/h) | 45: kph (TTK s, przerwy/h) | 50: kph (TTK s, przerwy/h) | 55: kph (TTK s, przerwy/h) | 59: kph (TTK s, przerwy/h) |
|---|---:|---:|---:|---:|---:|
| AFF_WRACK | 103.7 (23.3, 14) | 113.0 (21.9, 12) | 115.6 (20.8, 12) | 121.8 (20.5, 5) | 120.8 (20.8, 4) |
| DT_SS | 119.0 (22.1, 1) | 118.7 (22.3, 0) | 126.7 (20.4, 0) | 127.1 (20.3, 0) | 126.9 (20.2, 1) |
| DW_WRACK | 120.7 (21.8, 0) | 119.1 (22.2, 0) | 126.0 (20.6, 0) | 127.7 (20.2, 0) | 126.9 (20.2, 1) |

### Duel: DT_SS (a) vs DW_DL (b), average, 1 mob(y), wrack_min_hp_pct=0.6

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  119.1 |  117.6 |    1.3 (0.8..1.9)            |      a | 22.1/21.8 | 1212/1180 | 0.1/0.7 | 0.6/3.8
   42 |  116.3 |  119.7 |   -3.4 (-3.5..-3.2)          |      b | 22.9/22.0 | 1212/1195 | 0.0/0.1 | 0.0/0.3
   44 |  119.6 |  119.5 |    0.1 (-0.0..0.3)           |      ~ | 22.1/21.9 | 1279/1261 | 0.0/0.2 | 0.0/1.1
   46 |  122.8 |  126.2 |   -3.4 (-3.5..-3.2)          |      b | 21.3/20.5 | 1441/1360 | 0.0/0.0 | 0.0/0.0
   48 |  126.5 |  127.0 |   -0.5 (-0.7..-0.4)          |      b | 20.4/20.3 | 1542/1478 | 0.0/0.0 | 0.0/0.2
   50 |  126.7 |  127.6 |   -1.0 (-1.1..-0.8)          |      b | 20.4/20.2 | 1604/1513 | 0.0/0.0 | 0.0/0.0
   52 |  123.6 |  129.1 |   -5.5 (-5.7..-5.4)          |      b | 21.1/19.9 | 1613/1485 | 0.0/0.0 | 0.0/0.0
   54 |  128.4 |  131.6 |   -3.2 (-3.4..-3.0)          |      b | 20.0/19.3 | 1778/1613 | 0.0/0.0 | 0.0/0.1
   56 |  127.2 |  129.5 |   -2.4 (-3.1..-1.7)          |      b | 20.1/19.4 | 1879/1692 | 0.2/0.4 | 0.9/1.8
   58 |  126.1 |  126.1 |    0.0 (0.0..0.0)            |      ~ | 19.3/19.3 | 1857/1857 | 1.2/1.2 | 5.3/5.3
Crossover: from level 42 the winner is DW_DL.
```

### Duel: DT_SS (a) vs DW_DL (b), average, 2 mob(y), wrack_min_hp_pct=0.6

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  115.9 |  110.5 |    5.4 (4.3..6.5)            |      a | 23.7/23.3 | 1204/1208 | 2.6/4.4 | 6.8/8.0
   42 |  122.9 |  115.1 |    7.8 (7.3..8.3)            |      a | 23.4/23.1 | 1211/1211 | 1.8/4.0 | 2.5/4.9
   44 |  123.4 |  115.3 |    8.1 (7.5..8.7)            |      a | 23.1/22.9 | 1274/1273 | 1.9/4.1 | 4.2/7.1
   46 |  136.8 |  131.2 |    5.5 (5.2..5.9)            |      a | 21.6/21.7 | 1441/1439 | 0.8/1.7 | 0.0/1.0
   48 |  137.1 |  135.3 |    1.9 (1.1..2.6)            |      a | 21.3/21.5 | 1531/1544 | 0.8/0.9 | 1.8/2.1
   50 |  140.1 |  138.7 |    1.3 (1.1..1.5)            |      a | 21.2/21.4 | 1587/1597 | 0.5/0.6 | 0.1/0.1
   52 |  139.3 |  139.4 |   -0.1 (-0.2..-0.1)          |      b | 21.4/21.4 | 1609/1609 | 0.4/0.4 | 0.0/0.0
   54 |  145.6 |  145.4 |    0.2 (0.0..0.3)            |      a | 20.7/20.7 | 1748/1766 | 0.0/0.0 | 0.0/0.0
   56 |  137.8 |  144.0 |   -6.0 (-7.1..-5.0)          |      b | 21.1/20.8 | 1872/1861 | 0.6/0.1 | 2.9/0.6
   58 |  134.8 |  134.8 |    0.0 (0.0..0.0)            |      ~ | 21.2/21.2 | 1990/1990 | 0.9/0.9 | 4.5/4.5
Crossover: from level 52 the winner is DW_DL.
```

### Duel: DT_SS (a) vs DW_DL (b), average, 3 mob(y), wrack_min_hp_pct=0.6

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  102.6 |   99.9 |    2.6 (1.4..3.7)            |      a | 23.9/24.0 | 1236/1265 | 4.3/1.2 | 6.6/4.6
   42 |  108.5 |  108.1 |    0.4 (-0.5..1.3)           |      ~ | 24.0/23.9 | 1243/1261 | 3.7/1.0 | 5.4/3.6
   44 |  113.2 |  105.2 |    7.9 (7.0..8.9)            |      a | 23.3/23.8 | 1282/1327 | 4.8/1.9 | 7.7/5.2
   46 |  122.3 |  117.3 |    5.0 (4.0..6.1)            |      a | 22.2/22.3 | 1444/1462 | 3.3/2.9 | 3.9/3.9
   48 |  122.4 |  120.8 |    1.7 (0.5..2.9)            |      a | 21.8/22.0 | 1540/1549 | 3.6/3.7 | 6.4/6.0
   50 |  123.8 |  122.7 |    1.1 (0.0..2.1)            |      a | 21.8/22.0 | 1594/1602 | 3.4/3.4 | 3.9/3.8
   52 |  132.2 |  132.5 |   -0.2 (-0.6..0.2)           |      ~ | 21.8/21.8 | 1604/1605 | 2.7/2.7 | 1.0/1.1
   54 |  132.9 |  131.9 |    1.0 (0.1..1.9)            |      a | 21.3/21.3 | 1754/1769 | 2.5/2.6 | 2.8/3.3
   56 |  121.2 |  129.3 |   -8.0 (-9.3..-6.7)          |      b | 21.9/21.5 | 1881/1862 | 2.9/2.6 | 5.8/3.8
   58 |  121.0 |  121.0 |    0.0 (0.0..0.0)            |      ~ | 22.0/22.0 | 1995/1995 | 3.1/3.1 | 6.8/6.8
Crossover: from level 56 the winner is DW_DL.
```

### Duel: DT_SS vs DW_DL, quest, 1 mob, wrack_min_hp_pct=0.6

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  109.3 |  105.8 |    3.2 (2.1..4.3)            |      a | 24.4/24.5 | 1210/1186 | 0.5/1.3 | 2.5/6.8
   45 |  108.1 |  109.6 |   -1.4 (-1.7..-1.2)          |      b | 25.3/24.7 | 1315/1295 | 0.0/0.2 | 0.0/1.1
   50 |  119.1 |  119.0 |    0.1 (-0.3..0.4)           |      ~ | 22.2/22.2 | 1618/1570 | 0.0/0.1 | 0.0/0.4
   55 |  117.3 |  120.2 |   -2.9 (-3.1..-2.6)          |      b | 22.5/21.9 | 1905/1713 | 0.2/0.0 | 1.1/0.1
   58 |  110.4 |  110.4 |    0.0 (0.0..0.0)            |      ~ | 22.2/22.2 | 1927/1927 | 2.2/2.2 | 9.7/9.7
Crossover: from level 45 the winner is DW_DL.
```

### Duel: DT_SS vs DW_DL, good, 1 mob, wrack_min_hp_pct=0.6

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  124.6 |  126.0 |   -1.4 (-1.7..-1.2)          |      b | 20.9/20.3 | 1210/1178 | 0.0/0.2 | 0.0/1.1
   45 |  124.4 |  129.0 |   -4.6 (-4.8..-4.5)          |      b | 20.9/19.9 | 1268/1233 | 0.0/0.0 | 0.0/0.0
   50 |  135.6 |  139.1 |   -3.5 (-3.7..-3.3)          |      b | 18.6/17.9 | 1486/1404 | 0.0/0.0 | 0.0/0.0
   55 |  136.9 |  142.0 |   -5.1 (-5.3..-4.9)          |      b | 18.3/17.4 | 1666/1492 | 0.0/0.0 | 0.0/0.0
   58 |  139.3 |  139.3 |    0.0 (0.0..0.0)            |      ~ | 17.2/17.2 | 1743/1743 | 0.6/0.6 | 2.9/2.9
No crossover: the winner does not change over these levels.
```

### Duel: DT_SS vs DW_DL, average, 1 mob, wrack_min_hp_pct=0.6, {"mob_hp_mult":1.5}

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |   86.4 |   90.0 |   -3.7 (-3.9..-3.4)          |      b | 33.7/31.4 | 1583/1483 | 0.0/0.6 | 0.0/0.2
   45 |   83.7 |   89.2 |   -5.5 (-5.7..-5.4)          |      b | 35.0/31.9 | 1680/1590 | 0.0/0.5 | 0.0/0.2
   50 |   97.3 |  101.8 |   -4.5 (-4.6..-4.4)          |      b | 29.0/27.3 | 2043/1870 | 0.0/0.1 | 0.0/0.3
   55 |   99.7 |  105.0 |   -5.3 (-5.5..-5.2)          |      b | 28.1/26.3 | 2264/1907 | 0.0/0.0 | 0.0/0.1
   58 |  102.2 |  102.2 |    0.0 (0.0..0.0)            |      ~ | 25.8/25.8 | 2225/2225 | 1.0/1.0 | 3.8/3.8
No crossover: the winner does not change over these levels.
```

### Duel: DT_SS vs DW_DL, average, 1 mob, wrack_min_hp_pct=0.6, {"mob_hp_mult":2}

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |   70.7 |   67.2 |    3.1 (2.5..3.8)            |      a | 42.9/41.4 | 2056/1958 | 0.0/3.0 | 0.0/4.5
   45 |   69.2 |   69.8 |   -0.6 (-1.0..-0.2)          |      b | 44.0/40.3 | 2273/2114 | 0.0/3.0 | 0.0/7.6
   50 |   76.5 |   71.6 |    4.3 (3.2..5.4)            |      a | 38.3/37.1 | 2709/2409 | 0.6/3.0 | 2.3/10.0
   55 |   77.6 |   80.8 |   -3.2 (-3.5..-2.9)          |      b | 38.0/36.1 | 3021/2590 | 0.3/0.4 | 1.0/1.4
   58 |   75.6 |   75.6 |    0.0 (0.0..0.0)            |      ~ | 34.9/34.9 | 2830/2830 | 3.0/3.0 | 8.0/8.0
Crossover: from level 45 the winner is DW_DL.
```

### Duel: DT_SS vs DW_DL, average, 1 mob, wrack_min_hp_pct=0.6, {"mob_dmg_mult":1.5}

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  119.1 |  113.2 |    5.6 (4.8..6.4)            |      a | 22.1/21.5 | 1212/1172 | 0.1/1.9 | 0.6/7.2
   45 |  118.6 |  115.7 |    2.8 (2.6..3.1)            |      a | 22.4/22.1 | 1279/1263 | 0.0/0.9 | 0.0/1.3
   50 |  126.1 |  126.8 |   -0.7 (-0.8..-0.5)          |      b | 20.5/20.4 | 1595/1525 | 0.0/0.0 | 0.0/0.1
   55 |  124.6 |  129.0 |   -4.4 (-4.7..-4.1)          |      b | 20.5/19.8 | 1824/1662 | 0.4/0.1 | 2.1/0.5
   58 |  120.8 |  120.8 |    0.0 (0.0..0.0)            |      ~ | 19.0/19.0 | 1832/1832 | 2.5/2.5 | 10.9/10.9
Crossover: from level 50 the winner is DW_DL.
```

### Duel: DT_SS vs DW_DL, average, 1 mob, wrack_min_hp_pct=0.6, {"break_hp_pct":0.5}

```
DT_SS (a) vs DW_DL (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  118.9 |  117.0 |    1.9 (1.6..2.1)            |      a | 22.1/20.9 | 1213/1160 | 0.2/1.9 | 1.4/13.7
   45 |  118.6 |  119.5 |   -0.9 (-1.0..-0.7)          |      b | 22.4/21.1 | 1279/1238 | 0.0/1.0 | 0.0/10.2
   50 |  126.7 |  126.6 |    0.1 (-0.1..0.2)           |      ~ | 20.4/19.4 | 1604/1472 | 0.0/1.0 | 0.0/8.6
   55 |  126.6 |  129.3 |   -2.7 (-2.9..-2.4)          |      b | 20.2/19.0 | 1826/1556 | 0.2/0.8 | 1.3/6.2
   58 |  124.9 |  124.9 |    0.0 (0.0..0.0)            |      ~ | 18.4/18.4 | 1782/1782 | 2.5/2.5 | 15.1/15.1
Crossover: from level 45 the winner is DW_DL.
```

### Duel: DT_SS vs AFF_WRACK, average, 1 mob, wrack_min_hp_pct=0.6

```
DT_SS (a) vs AFF_WRACK (b) - kills per hour; differences are a - b with paired 95% CI
level |  kph a |  kph b |  diff (CI)            | winner | ttk a/b s | mana/kill a/b | rest s/kill a/b | breaks/h a/b
   40 |  119.1 |  101.4 |   17.3 (16.4..18.2)          |      a | 22.1/22.6 | 1212/1184 | 0.1/4.6 | 0.6/20.1
   45 |  118.6 |  112.1 |    6.3 (5.7..6.9)            |      a | 22.4/20.7 | 1279/1286 | 0.0/3.3 | 0.0/20.5
   50 |  126.7 |  114.1 |   12.3 (11.5..13.1)          |      a | 20.4/20.2 | 1604/1481 | 0.0/3.2 | 0.0/16.8
   55 |  127.0 |  122.0 |    5.0 (4.6..5.4)            |      a | 20.3/19.6 | 1825/1702 | 0.1/1.9 | 0.3/9.1
   58 |  126.1 |  121.5 |    4.8 (4.1..5.5)            |      a | 19.3/19.4 | 1857/1850 | 1.2/2.2 | 5.3/9.2
No crossover: the winner does not change over these levels.
```
