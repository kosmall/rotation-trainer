# Wnioski: czy EP są takie same dla wszystkich buildów?

**Nie. Wagi różnią się mocno i istotnie, zwłaszcza Stamina, Spirit i hit.** Źródło: poniższy przebieg (`npm run forever:ep -- --all --levels 40,45,50,55,59 --profile average --mobs 1 --sessions 100 --seed 1`, 11 buildów, ok. 4 min). Liczby dotyczą profilu `average`, którego wartości są placeholderami, więc to kierunki, nie dokładne wagi.

- **Rozstrzygnięcie par:** na każdym levelu porównano 55 par buildów. Na levelach 40, 45 i 59 prawie każda para różni się istotnie przynajmniej jedną statą (brak różnic w 1, 1 i 3 parach z 55); na 50 i 55 jest więcej par bez istotnych różnic (10 i 9).
- **Stamina** różni się najczęściej (istotnie w 53, 42, 38, 33 i 37 parach na levelach 40, 45, 50, 55, 59). Na levelu 40 Stamina ma wagę 0,03 SP w DEMO_PACT_R1, 1,82 w AFF_WRACK i 5,61 w DEMO_PACT_MAXRANK.
- **Spirit** różni się w 44, 49, 33, 33 i 32 parach. Dla AFF_WRACK i AFF_WRACK_IMMO jest **ujemny lub bliski zera** na wszystkich levelach (np. -0,55 na levelu 50), czyli w tym modelu więcej Spirita nie zwiększa kills/h. Nie rozdzielałem przyczyny; Spirit wchodzi do symulacji m.in. przez Life Tap (`life_tap_spirit_coeff` ma `verify`) i regenerację, więc wniosek warto potwierdzić na prawdziwych danych, zanim wpłynie na wybór itemów.
- **Hit:** dla większości buildów Affliction i Drain Tank jest `capped` (limit trafienia już osiągnięty w profilu `average`), więc +hit nic nie daje; dla buildów Demonology (np. DEMO_PACT_R2) ma wagę 2-4 SP, a na levelu 59 bywa bardzo wysoka (DEMO_PACT_VIDEO 13,3; DEMO_FIRE 11,2) przy szerokich przedziałach.
- **Crit i Intellect:** crit ma zwykle wagę od 0 do ok. 7 SP (czasem ujemną) z szerokimi przedziałami; Intellect jest niski (0-0,7 SP), ale rośnie z levelem i różni się między buildami (np. na levelu 40 AFF_DRAINTANK_IMMO 0,44, DEMO_PACT_R1 -0,02).
- **Zmiana z levelem:** wagi nie są stałe: na przykład Stamina w DEMO_PACT_R1 rośnie z ~0 (level 40) do ok. 1 (levele 50-59), a hit dla AFF_WRACK zaczyna od 5,9 na levelu 40 i przechodzi w `capped` do levelu 50.
- **DEMO_FIRE na levelu 50:** spell power nie zwiększa tam kills/h (nachylenie około zera), więc wagi są `n/a`. Pokazuje to, że wagi względem SP tracą sens, gdy SP prawie nie wpływa na wynik. Dla builda z małym wpływem SP wagi innych staty są zawyżone i niestabilne.
- **Przybliżenie:** gwiazdka `*` przy wadze oznacza, że krok w dół i w górę dają istotnie różne nachylenia; dotyczy to wielu wag Staminy i Spirita (progi HP i przerw). Mniejszy krok daje inne wagi, więc czytaj je jako średnią z kroku +/-40.
- **Hipoteza:** częściowo potwierdzona. Na levelu 40 buildy Pact (DEMO_PACT_R1, DEMO_PACT_VIDEO) mają wagę Staminy 0,03 i Intellectu -0,02, a AFF_WRACK Staminę 1,82 i Spirit -0,36. Przyczyn nie rozdzielałem (pet, DoT-y czy Life Tap).

**Praktycznie:** do wyboru itemów używaj wag **swojego** buildu i levelu, nie jednej tabeli dla wszystkich.

---

# Equivalency points (1.00 = one point of spell power), gear: average, 100 sessions, seed 1

## Level 40

| stat | AFF_WRACK | AFF_WRACK_IMMO | AFF_DRAINTANK | AFF_DRAINTANK_IMMO | DT_SS | DT_SS_IMMO | DEMO_PACT_R1 | DEMO_PACT_VIDEO | DEMO_PACT_R2 | DEMO_PACT_MAXRANK | DEMO_FIRE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| spellPower | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * |
| intellect | -0.05 (-0.15..0.03) * | 0.30 (0.13..0.49) * | 0.01 (0.01..0.02) | 0.44 (0.39..0.49) * | 0.01 (-0.00..0.01) * | 0.27 (0.23..0.33) | -0.02 (-0.03..-0.01) * | -0.02 (-0.03..-0.01) * | 0.11 (0.10..0.12) * | 0.40 (0.22..0.68) | 0.32 (0.11..0.55) |
| spirit | -0.36 (-0.46..-0.27) * | -0.78 (-1.00..-0.61) * | 0.07 (0.06..0.07) * | 0.12 (0.05..0.16) | 0.06 (0.05..0.06) * | 0.03 (-0.02..0.08) | 0.15 (0.14..0.17) * | 0.15 (0.14..0.17) * | 0.07 (0.06..0.08) * | -3.52 (-5.17..-2.69) * | -1.38 (-1.83..-1.12) * |
| stamina | 1.82 (1.67..1.99) * | 3.23 (2.74..3.86) * | 0.00 (-0.00..0.01) | 1.07 (0.92..1.21) * | -0.01 (-0.01..-0.00) * | 0.57 (0.46..0.68) * | 0.03 (0.02..0.05) * | 0.03 (0.02..0.05) * | 0.08 (0.04..0.13) * | 5.61 (4.36..8.13) * | 3.40 (2.90..4.37) * |
| critPct | 3.09 (1.48..4.62) | 4.90 (2.63..7.33) | 2.45 (2.36..2.53) | 1.85 (1.29..2.37) | 2.55 (2.45..2.65) | 3.42 (2.83..4.00) | 0.55 (0.48..0.60) | 0.55 (0.48..0.60) | 1.04 (0.90..1.19) | -1.28 (-3.50..0.85) | 0.28 (-2.22..2.78) |
| hitPct | 5.86 (3.14..8.60) | 7.06 (1.75..12.22) | capped (0) | capped (0) | capped (0) | capped (0) | 1.45 (1.30..1.59) | 1.45 (1.30..1.59) | 2.33 (1.95..2.69) | 2.02 (-2.61..6.45) | 1.79 (-2.86..7.84) |
| kills/h at base | 85.7 | 83.5 | 113.1 | 111.8 | 116.7 | 111.7 | 114.9 | 114.9 | 113.8 | 104.0 | 114.0 |

Differences between builds (95% interval of the difference excludes 0):

- AFF_WRACK vs AFF_WRACK_IMMO: intellect -0.05 vs 0.30 (diff -0.35, -0.58..-0.14); spirit -0.36 vs -0.78 (diff 0.42, 0.21..0.66); stamina 1.82 vs 3.23 (diff -1.42, -2.13..-0.88)
- AFF_WRACK vs AFF_DRAINTANK: spirit -0.36 vs 0.07 (diff -0.43, -0.53..-0.34); stamina 1.82 vs 0.00 (diff 1.81, 1.67..1.99); hitPct 5.86 vs 0.00 (diff 5.86, 3.14..8.60)
- AFF_WRACK vs AFF_DRAINTANK_IMMO: intellect -0.05 vs 0.44 (diff -0.49, -0.60..-0.40); spirit -0.36 vs 0.12 (diff -0.48, -0.59..-0.36); stamina 1.82 vs 1.07 (diff 0.75, 0.53..0.98); hitPct 5.86 vs 0.00 (diff 5.86, 3.14..8.60)
- AFF_WRACK vs DT_SS: spirit -0.36 vs 0.06 (diff -0.42, -0.52..-0.32); stamina 1.82 vs -0.01 (diff 1.83, 1.68..2.00); hitPct 5.86 vs 0.00 (diff 5.86, 3.14..8.60)
- AFF_WRACK vs DT_SS_IMMO: intellect -0.05 vs 0.27 (diff -0.33, -0.44..-0.22); spirit -0.36 vs 0.03 (diff -0.39, -0.50..-0.29); stamina 1.82 vs 0.57 (diff 1.25, 1.07..1.47); hitPct 5.86 vs 0.00 (diff 5.86, 3.14..8.60)
- AFF_WRACK vs DEMO_PACT_R1: spirit -0.36 vs 0.15 (diff -0.51, -0.61..-0.42); stamina 1.82 vs 0.03 (diff 1.78, 1.63..1.96); critPct 3.09 vs 0.55 (diff 2.55, 0.96..4.08); hitPct 5.86 vs 1.45 (diff 4.41, 1.67..7.12)
- AFF_WRACK vs DEMO_PACT_VIDEO: spirit -0.36 vs 0.15 (diff -0.51, -0.61..-0.42); stamina 1.82 vs 0.03 (diff 1.78, 1.63..1.96); critPct 3.09 vs 0.55 (diff 2.55, 0.96..4.08); hitPct 5.86 vs 1.45 (diff 4.41, 1.67..7.12)
- AFF_WRACK vs DEMO_PACT_R2: intellect -0.05 vs 0.11 (diff -0.16, -0.26..-0.08); spirit -0.36 vs 0.07 (diff -0.43, -0.53..-0.34); stamina 1.82 vs 0.08 (diff 1.73, 1.58..1.90); critPct 3.09 vs 1.04 (diff 2.05, 0.52..3.63); hitPct 5.86 vs 2.33 (diff 3.53, 0.79..6.35)
- AFF_WRACK vs DEMO_PACT_MAXRANK: intellect -0.05 vs 0.40 (diff -0.45, -0.74..-0.24); spirit -0.36 vs -3.52 (diff 3.16, 2.32..4.85); stamina 1.82 vs 5.61 (diff -3.80, -6.36..-2.51); critPct 3.09 vs -1.28 (diff 4.38, 2.08..7.05)
- AFF_WRACK vs DEMO_FIRE: intellect -0.05 vs 0.32 (diff -0.37, -0.63..-0.17); spirit -0.36 vs -1.38 (diff 1.02, 0.72..1.48); stamina 1.82 vs 3.40 (diff -1.58, -2.56..-1.06)
- AFF_WRACK_IMMO vs AFF_DRAINTANK: intellect 0.30 vs 0.01 (diff 0.29, 0.12..0.48); spirit -0.78 vs 0.07 (diff -0.84, -1.06..-0.68); stamina 3.23 vs 0.00 (diff 3.23, 2.74..3.86); critPct 4.90 vs 2.45 (diff 2.45, 0.18..4.84); hitPct 7.06 vs 0.00 (diff 7.06, 1.75..12.22)
- AFF_WRACK_IMMO vs AFF_DRAINTANK_IMMO: spirit -0.78 vs 0.12 (diff -0.90, -1.10..-0.73); stamina 3.23 vs 1.07 (diff 2.17, 1.63..2.94); critPct 4.90 vs 1.85 (diff 3.05, 0.88..5.30); hitPct 7.06 vs 0.00 (diff 7.06, 1.75..12.22)
- AFF_WRACK_IMMO vs DT_SS: intellect 0.30 vs 0.01 (diff 0.29, 0.12..0.49); spirit -0.78 vs 0.06 (diff -0.83, -1.06..-0.67); stamina 3.23 vs -0.01 (diff 3.24, 2.75..3.88); critPct 4.90 vs 2.55 (diff 2.35, 0.11..4.79); hitPct 7.06 vs 0.00 (diff 7.06, 1.75..12.22)
- AFF_WRACK_IMMO vs DT_SS_IMMO: spirit -0.78 vs 0.03 (diff -0.81, -1.04..-0.62); stamina 3.23 vs 0.57 (diff 2.67, 2.18..3.31); hitPct 7.06 vs 0.00 (diff 7.06, 1.75..12.22)
- AFF_WRACK_IMMO vs DEMO_PACT_R1: intellect 0.30 vs -0.02 (diff 0.32, 0.15..0.52); spirit -0.78 vs 0.15 (diff -0.93, -1.15..-0.76); stamina 3.23 vs 0.03 (diff 3.20, 2.71..3.83); critPct 4.90 vs 0.55 (diff 4.36, 2.11..6.76); hitPct 7.06 vs 1.45 (diff 5.62, 0.37..10.80)
- AFF_WRACK_IMMO vs DEMO_PACT_VIDEO: intellect 0.30 vs -0.02 (diff 0.32, 0.15..0.52); spirit -0.78 vs 0.15 (diff -0.93, -1.15..-0.76); stamina 3.23 vs 0.03 (diff 3.20, 2.71..3.83); critPct 4.90 vs 0.55 (diff 4.36, 2.11..6.76); hitPct 7.06 vs 1.45 (diff 5.62, 0.37..10.80)
- AFF_WRACK_IMMO vs DEMO_PACT_R2: intellect 0.30 vs 0.11 (diff 0.19, 0.02..0.38); spirit -0.78 vs 0.07 (diff -0.85, -1.07..-0.68); stamina 3.23 vs 0.08 (diff 3.15, 2.66..3.80); critPct 4.90 vs 1.04 (diff 3.86, 1.62..6.19)
- AFF_WRACK_IMMO vs DEMO_PACT_MAXRANK: spirit -0.78 vs -3.52 (diff 2.75, 1.91..4.41); stamina 3.23 vs 5.61 (diff -2.38, -4.85..-1.04); critPct 4.90 vs -1.28 (diff 6.19, 3.11..9.71)
- AFF_WRACK_IMMO vs DEMO_FIRE: spirit -0.78 vs -1.38 (diff 0.61, 0.27..1.11); critPct 4.90 vs 0.28 (diff 4.63, 1.06..8.00)
- AFF_DRAINTANK vs AFF_DRAINTANK_IMMO: intellect 0.01 vs 0.44 (diff -0.43, -0.48..-0.38); stamina 0.00 vs 1.07 (diff -1.06, -1.21..-0.92); critPct 2.45 vs 1.85 (diff 0.60, 0.10..1.12)
- AFF_DRAINTANK vs DT_SS: spirit 0.07 vs 0.06 (diff 0.01, 0.00..0.02); stamina 0.00 vs -0.01 (diff 0.01, 0.00..0.02)
- AFF_DRAINTANK vs DT_SS_IMMO: intellect 0.01 vs 0.27 (diff -0.26, -0.32..-0.22); stamina 0.00 vs 0.57 (diff -0.56, -0.68..-0.45); critPct 2.45 vs 3.42 (diff -0.97, -1.55..-0.38)
- AFF_DRAINTANK vs DEMO_PACT_R1: intellect 0.01 vs -0.02 (diff 0.04, 0.02..0.05); spirit 0.07 vs 0.15 (diff -0.08, -0.10..-0.07); stamina 0.00 vs 0.03 (diff -0.03, -0.05..-0.02); critPct 2.45 vs 0.55 (diff 1.90, 1.80..2.00); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- AFF_DRAINTANK vs DEMO_PACT_VIDEO: intellect 0.01 vs -0.02 (diff 0.04, 0.02..0.05); spirit 0.07 vs 0.15 (diff -0.08, -0.10..-0.07); stamina 0.00 vs 0.03 (diff -0.03, -0.05..-0.02); critPct 2.45 vs 0.55 (diff 1.90, 1.80..2.00); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- AFF_DRAINTANK vs DEMO_PACT_R2: intellect 0.01 vs 0.11 (diff -0.10, -0.11..-0.08); stamina 0.00 vs 0.08 (diff -0.08, -0.13..-0.04); critPct 2.45 vs 1.04 (diff 1.41, 1.25..1.59); hitPct 0.00 vs 2.33 (diff -2.33, -2.69..-1.95)
- AFF_DRAINTANK vs DEMO_PACT_MAXRANK: intellect 0.01 vs 0.40 (diff -0.39, -0.67..-0.20); spirit 0.07 vs -3.52 (diff 3.59, 2.76..5.24); stamina 0.00 vs 5.61 (diff -5.61, -8.13..-4.36); critPct 2.45 vs -1.28 (diff 3.73, 1.58..5.92)
- AFF_DRAINTANK vs DEMO_FIRE: intellect 0.01 vs 0.32 (diff -0.31, -0.53..-0.10); spirit 0.07 vs -1.38 (diff 1.45, 1.18..1.89); stamina 0.00 vs 3.40 (diff -3.40, -4.36..-2.90)
- AFF_DRAINTANK_IMMO vs DT_SS: intellect 0.44 vs 0.01 (diff 0.44, 0.38..0.48); stamina 1.07 vs -0.01 (diff 1.07, 0.93..1.22); critPct 1.85 vs 2.55 (diff -0.70, -1.26..-0.19)
- AFF_DRAINTANK_IMMO vs DT_SS_IMMO: intellect 0.44 vs 0.27 (diff 0.17, 0.09..0.24); spirit 0.12 vs 0.03 (diff 0.09, 0.01..0.15); stamina 1.07 vs 0.57 (diff 0.50, 0.32..0.67); critPct 1.85 vs 3.42 (diff -1.57, -2.52..-0.70)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R1: intellect 0.44 vs -0.02 (diff 0.47, 0.41..0.52); stamina 1.07 vs 0.03 (diff 1.03, 0.89..1.18); critPct 1.85 vs 0.55 (diff 1.30, 0.76..1.81); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_VIDEO: intellect 0.44 vs -0.02 (diff 0.47, 0.41..0.52); stamina 1.07 vs 0.03 (diff 1.03, 0.89..1.18); critPct 1.85 vs 0.55 (diff 1.30, 0.76..1.81); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R2: intellect 0.44 vs 0.11 (diff 0.33, 0.28..0.38); stamina 1.07 vs 0.08 (diff 0.98, 0.84..1.14); critPct 1.85 vs 1.04 (diff 0.81, 0.25..1.33); hitPct 0.00 vs 2.33 (diff -2.33, -2.69..-1.95)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_MAXRANK: spirit 0.12 vs -3.52 (diff 3.64, 2.82..5.25); stamina 1.07 vs 5.61 (diff -4.55, -7.10..-3.28); critPct 1.85 vs -1.28 (diff 3.13, 1.03..5.44)
- AFF_DRAINTANK_IMMO vs DEMO_FIRE: spirit 0.12 vs -1.38 (diff 1.50, 1.23..1.97); stamina 1.07 vs 3.40 (diff -2.33, -3.34..-1.83)
- DT_SS vs DT_SS_IMMO: intellect 0.01 vs 0.27 (diff -0.27, -0.32..-0.22); stamina -0.01 vs 0.57 (diff -0.58, -0.69..-0.47); critPct 2.55 vs 3.42 (diff -0.86, -1.45..-0.29)
- DT_SS vs DEMO_PACT_R1: intellect 0.01 vs -0.02 (diff 0.03, 0.02..0.04); spirit 0.06 vs 0.15 (diff -0.09, -0.11..-0.08); stamina -0.01 vs 0.03 (diff -0.04, -0.06..-0.03); critPct 2.55 vs 0.55 (diff 2.01, 1.90..2.11); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- DT_SS vs DEMO_PACT_VIDEO: intellect 0.01 vs -0.02 (diff 0.03, 0.02..0.04); spirit 0.06 vs 0.15 (diff -0.09, -0.11..-0.08); stamina -0.01 vs 0.03 (diff -0.04, -0.06..-0.03); critPct 2.55 vs 0.55 (diff 2.01, 1.90..2.11); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- DT_SS vs DEMO_PACT_R2: intellect 0.01 vs 0.11 (diff -0.10, -0.12..-0.09); stamina -0.01 vs 0.08 (diff -0.09, -0.14..-0.05); critPct 2.55 vs 1.04 (diff 1.52, 1.33..1.69); hitPct 0.00 vs 2.33 (diff -2.33, -2.69..-1.95)
- DT_SS vs DEMO_PACT_MAXRANK: intellect 0.01 vs 0.40 (diff -0.39, -0.67..-0.21); spirit 0.06 vs -3.52 (diff 3.58, 2.75..5.23); stamina -0.01 vs 5.61 (diff -5.62, -8.14..-4.37); critPct 2.55 vs -1.28 (diff 3.84, 1.66..6.09)
- DT_SS vs DEMO_FIRE: intellect 0.01 vs 0.32 (diff -0.31, -0.54..-0.10); spirit 0.06 vs -1.38 (diff 1.44, 1.17..1.88); stamina -0.01 vs 3.40 (diff -3.41, -4.37..-2.91)
- DT_SS_IMMO vs DEMO_PACT_R1: intellect 0.27 vs -0.02 (diff 0.30, 0.26..0.35); spirit 0.03 vs 0.15 (diff -0.12, -0.18..-0.07); stamina 0.57 vs 0.03 (diff 0.53, 0.42..0.65); critPct 3.42 vs 0.55 (diff 2.87, 2.29..3.42); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- DT_SS_IMMO vs DEMO_PACT_VIDEO: intellect 0.27 vs -0.02 (diff 0.30, 0.26..0.35); spirit 0.03 vs 0.15 (diff -0.12, -0.18..-0.07); stamina 0.57 vs 0.03 (diff 0.53, 0.42..0.65); critPct 3.42 vs 0.55 (diff 2.87, 2.29..3.42); hitPct 0.00 vs 1.45 (diff -1.45, -1.59..-1.30)
- DT_SS_IMMO vs DEMO_PACT_R2: intellect 0.27 vs 0.11 (diff 0.16, 0.12..0.22); stamina 0.57 vs 0.08 (diff 0.48, 0.36..0.61); critPct 3.42 vs 1.04 (diff 2.38, 1.79..2.98); hitPct 0.00 vs 2.33 (diff -2.33, -2.69..-1.95)
- DT_SS_IMMO vs DEMO_PACT_MAXRANK: spirit 0.03 vs -3.52 (diff 3.56, 2.75..5.21); stamina 0.57 vs 5.61 (diff -5.04, -7.61..-3.73); critPct 3.42 vs -1.28 (diff 4.70, 2.62..6.91)
- DT_SS_IMMO vs DEMO_FIRE: spirit 0.03 vs -1.38 (diff 1.42, 1.14..1.88); stamina 0.57 vs 3.40 (diff -2.83, -3.81..-2.32); critPct 3.42 vs 0.28 (diff 3.14, 0.66..5.56)
- DEMO_PACT_R1 vs DEMO_PACT_VIDEO: none significant
- DEMO_PACT_R1 vs DEMO_PACT_R2: intellect -0.02 vs 0.11 (diff -0.13, -0.15..-0.12); spirit 0.15 vs 0.07 (diff 0.08, 0.06..0.10); stamina 0.03 vs 0.08 (diff -0.05, -0.10..-0.00); critPct 0.55 vs 1.04 (diff -0.49, -0.66..-0.35); hitPct 1.45 vs 2.33 (diff -0.88, -1.20..-0.52)
- DEMO_PACT_R1 vs DEMO_PACT_MAXRANK: intellect -0.02 vs 0.40 (diff -0.42, -0.70..-0.24); spirit 0.15 vs -3.52 (diff 3.67, 2.84..5.33); stamina 0.03 vs 5.61 (diff -5.58, -8.10..-4.33)
- DEMO_PACT_R1 vs DEMO_FIRE: intellect -0.02 vs 0.32 (diff -0.34, -0.57..-0.14); spirit 0.15 vs -1.38 (diff 1.53, 1.27..1.98); stamina 0.03 vs 3.40 (diff -3.36, -4.33..-2.86)
- DEMO_PACT_VIDEO vs DEMO_PACT_R2: intellect -0.02 vs 0.11 (diff -0.13, -0.15..-0.12); spirit 0.15 vs 0.07 (diff 0.08, 0.06..0.10); stamina 0.03 vs 0.08 (diff -0.05, -0.10..-0.00); critPct 0.55 vs 1.04 (diff -0.49, -0.66..-0.35); hitPct 1.45 vs 2.33 (diff -0.88, -1.20..-0.52)
- DEMO_PACT_VIDEO vs DEMO_PACT_MAXRANK: intellect -0.02 vs 0.40 (diff -0.42, -0.70..-0.24); spirit 0.15 vs -3.52 (diff 3.67, 2.84..5.33); stamina 0.03 vs 5.61 (diff -5.58, -8.10..-4.33)
- DEMO_PACT_VIDEO vs DEMO_FIRE: intellect -0.02 vs 0.32 (diff -0.34, -0.57..-0.14); spirit 0.15 vs -1.38 (diff 1.53, 1.27..1.98); stamina 0.03 vs 3.40 (diff -3.36, -4.33..-2.86)
- DEMO_PACT_R2 vs DEMO_PACT_MAXRANK: intellect 0.11 vs 0.40 (diff -0.29, -0.57..-0.10); spirit 0.07 vs -3.52 (diff 3.59, 2.77..5.23); stamina 0.08 vs 5.61 (diff -5.53, -8.07..-4.27); critPct 1.04 vs -1.28 (diff 2.32, 0.22..4.59)
- DEMO_PACT_R2 vs DEMO_FIRE: intellect 0.11 vs 0.32 (diff -0.21, -0.44..-0.00); spirit 0.07 vs -1.38 (diff 1.45, 1.19..1.90); stamina 0.08 vs 3.40 (diff -3.31, -4.29..-2.83)
- DEMO_PACT_MAXRANK vs DEMO_FIRE: spirit -3.52 vs -1.38 (diff -2.14, -3.72..-1.33); stamina 5.61 vs 3.40 (diff 2.21, 0.92..4.79)

## Level 45

| stat | AFF_WRACK | AFF_WRACK_IMMO | AFF_DRAINTANK | AFF_DRAINTANK_IMMO | DT_SS | DT_SS_IMMO | DEMO_PACT_R1 | DEMO_PACT_VIDEO | DEMO_PACT_R2 | DEMO_PACT_MAXRANK | DEMO_FIRE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| spellPower | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * |
| intellect | 0.16 (0.06..0.25) | 0.14 (0.02..0.26) | 0.00 (-0.00..0.01) | 0.05 (0.03..0.06) | 0.00 (-0.00..0.01) | 0.13 (0.10..0.18) | 0.10 (0.07..0.14) * | 0.11 (0.08..0.15) * | 0.31 (0.25..0.38) * | 0.09 (-0.00..0.18) * | 0.18 (0.08..0.30) |
| spirit | -0.25 (-0.35..-0.16) | -0.58 (-0.75..-0.45) * | 0.11 (0.10..0.12) | 0.23 (0.20..0.25) * | 0.19 (0.18..0.20) * | 0.10 (0.07..0.12) | -0.02 (-0.09..0.03) | -0.06 (-0.12..-0.00) * | 0.02 (-0.04..0.07) | -0.70 (-0.84..-0.55) * | -0.38 (-0.52..-0.22) * |
| stamina | 1.43 (1.23..1.64) * | 1.61 (1.40..1.89) * | 0.00 (-0.00..0.01) | 0.28 (0.20..0.37) * | 0.02 (0.01..0.02) * | 0.31 (0.24..0.40) * | 1.41 (1.30..1.51) * | 1.47 (1.37..1.57) * | 1.57 (1.42..1.68) * | 0.15 (0.05..0.27) * | 1.10 (0.89..1.34) * |
| critPct | 0.26 (-0.87..1.56) | 1.31 (-0.38..3.05) | 2.79 (2.68..2.90) | 2.32 (2.13..2.49) | 2.09 (1.98..2.20) | 3.77 (3.24..4.34) | 1.05 (0.93..1.18) | 1.04 (0.92..1.15) | 0.79 (0.32..1.24) | 0.78 (0.27..1.25) | 0.04 (-1.44..1.60) |
| hitPct | 6.72 (3.85..10.01) | 4.50 (1.74..7.78) | capped (0) | capped (0) | capped (0) | capped (0) | 2.21 (1.66..2.66) | 2.70 (2.18..3.48) | 4.36 (3.48..5.30) | 3.84 (2.99..4.56) | 3.03 (0.59..5.11) |
| kills/h at base | 110.4 | 106.6 | 112.5 | 115.7 | 116.5 | 115.1 | 125.5 | 121.9 | 122.2 | 114.9 | 121.6 |

Differences between builds (95% interval of the difference excludes 0):

- AFF_WRACK vs AFF_WRACK_IMMO: spirit -0.25 vs -0.58 (diff 0.33, 0.19..0.50)
- AFF_WRACK vs AFF_DRAINTANK: intellect 0.16 vs 0.00 (diff 0.16, 0.06..0.24); spirit -0.25 vs 0.11 (diff -0.36, -0.46..-0.26); stamina 1.43 vs 0.00 (diff 1.43, 1.23..1.64); critPct 0.26 vs 2.79 (diff -2.53, -3.71..-1.17); hitPct 6.72 vs 0.00 (diff 6.72, 3.85..10.01)
- AFF_WRACK vs AFF_DRAINTANK_IMMO: intellect 0.16 vs 0.05 (diff 0.11, 0.01..0.21); spirit -0.25 vs 0.23 (diff -0.47, -0.58..-0.37); stamina 1.43 vs 0.28 (diff 1.15, 0.93..1.37); critPct 0.26 vs 2.32 (diff -2.06, -3.22..-0.79); hitPct 6.72 vs 0.00 (diff 6.72, 3.85..10.01)
- AFF_WRACK vs DT_SS: intellect 0.16 vs 0.00 (diff 0.16, 0.06..0.25); spirit -0.25 vs 0.19 (diff -0.43, -0.54..-0.34); stamina 1.43 vs 0.02 (diff 1.41, 1.21..1.62); critPct 0.26 vs 2.09 (diff -1.83, -2.97..-0.46); hitPct 6.72 vs 0.00 (diff 6.72, 3.85..10.01)
- AFF_WRACK vs DT_SS_IMMO: spirit -0.25 vs 0.10 (diff -0.34, -0.44..-0.25); stamina 1.43 vs 0.31 (diff 1.11, 0.90..1.34); critPct 0.26 vs 3.77 (diff -3.51, -4.81..-2.01); hitPct 6.72 vs 0.00 (diff 6.72, 3.85..10.01)
- AFF_WRACK vs DEMO_PACT_R1: spirit -0.25 vs -0.02 (diff -0.23, -0.34..-0.13); hitPct 6.72 vs 2.21 (diff 4.51, 1.68..7.79)
- AFF_WRACK vs DEMO_PACT_VIDEO: spirit -0.25 vs -0.06 (diff -0.19, -0.31..-0.08); hitPct 6.72 vs 2.70 (diff 4.02, 1.08..7.46)
- AFF_WRACK vs DEMO_PACT_R2: intellect 0.16 vs 0.31 (diff -0.15, -0.26..-0.05); spirit -0.25 vs 0.02 (diff -0.27, -0.39..-0.16)
- AFF_WRACK vs DEMO_PACT_MAXRANK: spirit -0.25 vs -0.70 (diff 0.45, 0.28..0.65); stamina 1.43 vs 0.15 (diff 1.27, 1.05..1.51)
- AFF_WRACK vs DEMO_FIRE: hitPct 6.72 vs 3.03 (diff 3.69, 0.15..7.81)
- AFF_WRACK_IMMO vs AFF_DRAINTANK: intellect 0.14 vs 0.00 (diff 0.14, 0.01..0.25); spirit -0.58 vs 0.11 (diff -0.69, -0.87..-0.56); stamina 1.61 vs 0.00 (diff 1.61, 1.39..1.90); hitPct 4.50 vs 0.00 (diff 4.50, 1.74..7.78)
- AFF_WRACK_IMMO vs AFF_DRAINTANK_IMMO: spirit -0.58 vs 0.23 (diff -0.81, -0.98..-0.69); stamina 1.61 vs 0.28 (diff 1.34, 1.11..1.64); hitPct 4.50 vs 0.00 (diff 4.50, 1.74..7.78)
- AFF_WRACK_IMMO vs DT_SS: intellect 0.14 vs 0.00 (diff 0.14, 0.02..0.26); spirit -0.58 vs 0.19 (diff -0.77, -0.94..-0.64); stamina 1.61 vs 0.02 (diff 1.60, 1.38..1.88); hitPct 4.50 vs 0.00 (diff 4.50, 1.74..7.78)
- AFF_WRACK_IMMO vs DT_SS_IMMO: spirit -0.58 vs 0.10 (diff -0.68, -0.85..-0.54); stamina 1.61 vs 0.31 (diff 1.30, 1.08..1.60); critPct 1.31 vs 3.77 (diff -2.46, -4.37..-0.70); hitPct 4.50 vs 0.00 (diff 4.50, 1.74..7.78)
- AFF_WRACK_IMMO vs DEMO_PACT_R1: spirit -0.58 vs -0.02 (diff -0.56, -0.73..-0.42)
- AFF_WRACK_IMMO vs DEMO_PACT_VIDEO: spirit -0.58 vs -0.06 (diff -0.53, -0.71..-0.39)
- AFF_WRACK_IMMO vs DEMO_PACT_R2: intellect 0.14 vs 0.31 (diff -0.17, -0.31..-0.04); spirit -0.58 vs 0.02 (diff -0.60, -0.77..-0.47)
- AFF_WRACK_IMMO vs DEMO_PACT_MAXRANK: stamina 1.61 vs 0.15 (diff 1.46, 1.22..1.76)
- AFF_WRACK_IMMO vs DEMO_FIRE: spirit -0.58 vs -0.38 (diff -0.21, -0.44..-0.00); stamina 1.61 vs 1.10 (diff 0.52, 0.21..0.88)
- AFF_DRAINTANK vs AFF_DRAINTANK_IMMO: intellect 0.00 vs 0.05 (diff -0.04, -0.06..-0.03); spirit 0.11 vs 0.23 (diff -0.11, -0.14..-0.09); stamina 0.00 vs 0.28 (diff -0.28, -0.37..-0.20); critPct 2.79 vs 2.32 (diff 0.48, 0.30..0.66)
- AFF_DRAINTANK vs DT_SS: spirit 0.11 vs 0.19 (diff -0.07, -0.09..-0.06); stamina 0.00 vs 0.02 (diff -0.02, -0.02..-0.01); critPct 2.79 vs 2.09 (diff 0.70, 0.55..0.84)
- AFF_DRAINTANK vs DT_SS_IMMO: intellect 0.00 vs 0.13 (diff -0.13, -0.18..-0.09); stamina 0.00 vs 0.31 (diff -0.31, -0.40..-0.24); critPct 2.79 vs 3.77 (diff -0.98, -1.58..-0.40)
- AFF_DRAINTANK vs DEMO_PACT_R1: intellect 0.00 vs 0.10 (diff -0.10, -0.13..-0.07); spirit 0.11 vs -0.02 (diff 0.13, 0.08..0.20); stamina 0.00 vs 1.41 (diff -1.41, -1.51..-1.30); critPct 2.79 vs 1.05 (diff 1.74, 1.56..1.90); hitPct 0.00 vs 2.21 (diff -2.21, -2.66..-1.66)
- AFF_DRAINTANK vs DEMO_PACT_VIDEO: intellect 0.00 vs 0.11 (diff -0.11, -0.14..-0.08); spirit 0.11 vs -0.06 (diff 0.17, 0.11..0.23); stamina 0.00 vs 1.47 (diff -1.47, -1.57..-1.37); critPct 2.79 vs 1.04 (diff 1.75, 1.60..1.91); hitPct 0.00 vs 2.70 (diff -2.70, -3.48..-2.18)
- AFF_DRAINTANK vs DEMO_PACT_R2: intellect 0.00 vs 0.31 (diff -0.31, -0.38..-0.24); spirit 0.11 vs 0.02 (diff 0.09, 0.04..0.15); stamina 0.00 vs 1.57 (diff -1.56, -1.68..-1.42); critPct 2.79 vs 0.79 (diff 2.01, 1.55..2.43); hitPct 0.00 vs 4.36 (diff -4.36, -5.30..-3.48)
- AFF_DRAINTANK vs DEMO_PACT_MAXRANK: spirit 0.11 vs -0.70 (diff 0.81, 0.67..0.96); stamina 0.00 vs 0.15 (diff -0.15, -0.27..-0.04); critPct 2.79 vs 0.78 (diff 2.01, 1.51..2.49); hitPct 0.00 vs 3.84 (diff -3.84, -4.56..-2.99)
- AFF_DRAINTANK vs DEMO_FIRE: intellect 0.00 vs 0.18 (diff -0.18, -0.29..-0.08); spirit 0.11 vs -0.38 (diff 0.49, 0.33..0.63); stamina 0.00 vs 1.10 (diff -1.10, -1.34..-0.89); critPct 2.79 vs 0.04 (diff 2.75, 1.19..4.24); hitPct 0.00 vs 3.03 (diff -3.03, -5.11..-0.59)
- AFF_DRAINTANK_IMMO vs DT_SS: intellect 0.05 vs 0.00 (diff 0.04, 0.03..0.06); spirit 0.23 vs 0.19 (diff 0.04, 0.01..0.06); stamina 0.28 vs 0.02 (diff 0.26, 0.18..0.35); critPct 2.32 vs 2.09 (diff 0.23, 0.03..0.41)
- AFF_DRAINTANK_IMMO vs DT_SS_IMMO: intellect 0.05 vs 0.13 (diff -0.09, -0.14..-0.04); spirit 0.23 vs 0.10 (diff 0.13, 0.10..0.17); critPct 2.32 vs 3.77 (diff -1.45, -2.05..-0.92)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R1: intellect 0.05 vs 0.10 (diff -0.06, -0.09..-0.02); spirit 0.23 vs -0.02 (diff 0.25, 0.19..0.32); stamina 0.28 vs 1.41 (diff -1.13, -1.26..-1.00); critPct 2.32 vs 1.05 (diff 1.26, 1.04..1.49); hitPct 0.00 vs 2.21 (diff -2.21, -2.66..-1.66)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_VIDEO: intellect 0.05 vs 0.11 (diff -0.06, -0.11..-0.03); spirit 0.23 vs -0.06 (diff 0.28, 0.23..0.34); stamina 0.28 vs 1.47 (diff -1.19, -1.32..-1.05); critPct 2.32 vs 1.04 (diff 1.27, 1.10..1.47); hitPct 0.00 vs 2.70 (diff -2.70, -3.48..-2.18)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R2: intellect 0.05 vs 0.31 (diff -0.27, -0.33..-0.20); spirit 0.23 vs 0.02 (diff 0.20, 0.15..0.27); stamina 0.28 vs 1.57 (diff -1.29, -1.43..-1.15); critPct 2.32 vs 0.79 (diff 1.53, 1.02..2.01); hitPct 0.00 vs 4.36 (diff -4.36, -5.30..-3.48)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_MAXRANK: spirit 0.23 vs -0.70 (diff 0.92, 0.78..1.07); critPct 2.32 vs 0.78 (diff 1.54, 1.05..2.06); hitPct 0.00 vs 3.84 (diff -3.84, -4.56..-2.99)
- AFF_DRAINTANK_IMMO vs DEMO_FIRE: intellect 0.05 vs 0.18 (diff -0.14, -0.24..-0.03); spirit 0.23 vs -0.38 (diff 0.60, 0.45..0.74); stamina 0.28 vs 1.10 (diff -0.82, -1.08..-0.61); critPct 2.32 vs 0.04 (diff 2.27, 0.69..3.74); hitPct 0.00 vs 3.03 (diff -3.03, -5.11..-0.59)
- DT_SS vs DT_SS_IMMO: intellect 0.00 vs 0.13 (diff -0.13, -0.18..-0.09); spirit 0.19 vs 0.10 (diff 0.09, 0.07..0.12); stamina 0.02 vs 0.31 (diff -0.30, -0.38..-0.23); critPct 2.09 vs 3.77 (diff -1.68, -2.30..-1.12)
- DT_SS vs DEMO_PACT_R1: intellect 0.00 vs 0.10 (diff -0.10, -0.13..-0.07); spirit 0.19 vs -0.02 (diff 0.21, 0.15..0.28); stamina 0.02 vs 1.41 (diff -1.40, -1.49..-1.28); critPct 2.09 vs 1.05 (diff 1.03, 0.88..1.21); hitPct 0.00 vs 2.21 (diff -2.21, -2.66..-1.66)
- DT_SS vs DEMO_PACT_VIDEO: intellect 0.00 vs 0.11 (diff -0.11, -0.15..-0.08); spirit 0.19 vs -0.06 (diff 0.24, 0.19..0.30); stamina 0.02 vs 1.47 (diff -1.45, -1.55..-1.36); critPct 2.09 vs 1.04 (diff 1.04, 0.91..1.21); hitPct 0.00 vs 2.70 (diff -2.70, -3.48..-2.18)
- DT_SS vs DEMO_PACT_R2: intellect 0.00 vs 0.31 (diff -0.31, -0.38..-0.24); spirit 0.19 vs 0.02 (diff 0.16, 0.11..0.22); stamina 0.02 vs 1.57 (diff -1.55, -1.66..-1.40); critPct 2.09 vs 0.79 (diff 1.30, 0.85..1.79); hitPct 0.00 vs 4.36 (diff -4.36, -5.30..-3.48)
- DT_SS vs DEMO_PACT_MAXRANK: spirit 0.19 vs -0.70 (diff 0.89, 0.74..1.03); stamina 0.02 vs 0.15 (diff -0.14, -0.25..-0.03); critPct 2.09 vs 0.78 (diff 1.31, 0.78..1.80); hitPct 0.00 vs 3.84 (diff -3.84, -4.56..-2.99)
- DT_SS vs DEMO_FIRE: intellect 0.00 vs 0.18 (diff -0.18, -0.29..-0.08); spirit 0.19 vs -0.38 (diff 0.56, 0.41..0.70); stamina 0.02 vs 1.10 (diff -1.08, -1.33..-0.88); critPct 2.09 vs 0.04 (diff 2.04, 0.44..3.54); hitPct 0.00 vs 3.03 (diff -3.03, -5.11..-0.59)
- DT_SS_IMMO vs DEMO_PACT_R1: spirit 0.10 vs -0.02 (diff 0.12, 0.06..0.18); stamina 0.31 vs 1.41 (diff -1.10, -1.23..-0.96); critPct 3.77 vs 1.05 (diff 2.71, 2.17..3.35); hitPct 0.00 vs 2.21 (diff -2.21, -2.66..-1.66)
- DT_SS_IMMO vs DEMO_PACT_VIDEO: spirit 0.10 vs -0.06 (diff 0.15, 0.09..0.21); stamina 0.31 vs 1.47 (diff -1.16, -1.28..-1.02); critPct 3.77 vs 1.04 (diff 2.73, 2.16..3.29); hitPct 0.00 vs 2.70 (diff -2.70, -3.48..-2.18)
- DT_SS_IMMO vs DEMO_PACT_R2: intellect 0.13 vs 0.31 (diff -0.18, -0.26..-0.10); spirit 0.10 vs 0.02 (diff 0.07, 0.01..0.14); stamina 0.31 vs 1.57 (diff -1.25, -1.38..-1.09); critPct 3.77 vs 0.79 (diff 2.98, 2.29..3.63); hitPct 0.00 vs 4.36 (diff -4.36, -5.30..-3.48)
- DT_SS_IMMO vs DEMO_PACT_MAXRANK: spirit 0.10 vs -0.70 (diff 0.79, 0.64..0.94); stamina 0.31 vs 0.15 (diff 0.16, 0.03..0.30); critPct 3.77 vs 0.78 (diff 2.99, 2.16..3.73); hitPct 0.00 vs 3.84 (diff -3.84, -4.56..-2.99)
- DT_SS_IMMO vs DEMO_FIRE: spirit 0.10 vs -0.38 (diff 0.47, 0.31..0.61); stamina 0.31 vs 1.10 (diff -0.78, -1.02..-0.56); critPct 3.77 vs 0.04 (diff 3.73, 2.06..5.27); hitPct 0.00 vs 3.03 (diff -3.03, -5.11..-0.59)
- DEMO_PACT_R1 vs DEMO_PACT_VIDEO: none significant
- DEMO_PACT_R1 vs DEMO_PACT_R2: intellect 0.10 vs 0.31 (diff -0.21, -0.28..-0.14); hitPct 2.21 vs 4.36 (diff -2.15, -3.15..-1.12)
- DEMO_PACT_R1 vs DEMO_PACT_MAXRANK: spirit -0.02 vs -0.70 (diff 0.68, 0.54..0.83); stamina 1.41 vs 0.15 (diff 1.26, 1.11..1.40); hitPct 2.21 vs 3.84 (diff -1.63, -2.51..-0.64)
- DEMO_PACT_R1 vs DEMO_FIRE: spirit -0.02 vs -0.38 (diff 0.36, 0.21..0.51); stamina 1.41 vs 1.10 (diff 0.31, 0.00..0.56)
- DEMO_PACT_VIDEO vs DEMO_PACT_R2: intellect 0.11 vs 0.31 (diff -0.20, -0.28..-0.12); hitPct 2.70 vs 4.36 (diff -1.67, -2.80..-0.57)
- DEMO_PACT_VIDEO vs DEMO_PACT_MAXRANK: spirit -0.06 vs -0.70 (diff 0.64, 0.50..0.80); stamina 1.47 vs 0.15 (diff 1.32, 1.17..1.47); hitPct 2.70 vs 3.84 (diff -1.15, -1.99..-0.12)
- DEMO_PACT_VIDEO vs DEMO_FIRE: spirit -0.06 vs -0.38 (diff 0.32, 0.17..0.48); stamina 1.47 vs 1.10 (diff 0.37, 0.07..0.64)
- DEMO_PACT_R2 vs DEMO_PACT_MAXRANK: intellect 0.31 vs 0.09 (diff 0.22, 0.11..0.35); spirit 0.02 vs -0.70 (diff 0.72, 0.58..0.87); stamina 1.57 vs 0.15 (diff 1.41, 1.25..1.56)
- DEMO_PACT_R2 vs DEMO_FIRE: spirit 0.02 vs -0.38 (diff 0.40, 0.24..0.55); stamina 1.57 vs 1.10 (diff 0.47, 0.20..0.70)
- DEMO_PACT_MAXRANK vs DEMO_FIRE: spirit -0.70 vs -0.38 (diff -0.32, -0.54..-0.12); stamina 0.15 vs 1.10 (diff -0.95, -1.22..-0.71)

## Level 50

| stat | AFF_WRACK | AFF_WRACK_IMMO | AFF_DRAINTANK | AFF_DRAINTANK_IMMO | DT_SS | DT_SS_IMMO | DEMO_PACT_R1 | DEMO_PACT_VIDEO | DEMO_PACT_R2 | DEMO_PACT_MAXRANK | DEMO_FIRE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| spellPower | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | n/a |
| intellect | 0.23 (0.10..0.40) | 0.36 (0.08..0.69) | 0.01 (0.00..0.02) * | 0.12 (0.08..0.15) * | 0.02 (0.02..0.03) | 0.49 (0.31..0.81) | 0.24 (0.10..0.37) * | 0.10 (-0.01..0.22) * | 0.16 (0.06..0.28) | 0.08 (0.02..0.15) | n/a |
| spirit | -0.55 (-0.82..-0.33) * | -0.61 (-1.04..-0.33) * | 0.12 (0.11..0.13) * | 0.09 (-0.02..0.17) * | 0.13 (0.12..0.15) * | 0.51 (0.38..0.68) | 0.01 (-0.16..0.17) * | -0.19 (-0.32..-0.04) * | -0.25 (-0.38..-0.11) | -0.28 (-0.45..-0.15) * | n/a |
| stamina | 2.45 (1.98..3.06) * | 3.73 (2.91..5.21) * | -0.00 (-0.01..0.00) | 0.57 (0.38..0.75) * | 0.01 (-0.00..0.02) * | 1.26 (0.82..1.83) * | 1.08 (0.84..1.37) * | 0.93 (0.70..1.18) * | 1.34 (1.13..1.60) * | 1.82 (1.61..2.06) * | n/a |
| critPct | 1.55 (-0.15..3.73) | 2.11 (-2.23..6.08) | 3.25 (3.11..3.38) | 4.59 (3.75..5.63) | 3.72 (3.55..3.88) | 0.91 (-2.43..3.98) | 0.12 (-1.40..1.49) | 0.49 (-1.17..2.02) | 0.86 (-0.87..2.57) | 0.04 (-0.64..0.62) | n/a |
| hitPct | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | 3.14 (-0.42..6.50) * | 2.66 (-0.26..5.48) | 4.30 (1.27..7.76) | 3.36 (2.08..4.71) | n/a |
| kills/h at base | 110.7 | 101.6 | 122.9 | 122.4 | 123.4 | 123.3 | 117.1 | 121.3 | 117.2 | 109.1 | 116.6 |

Spell power does not gain kills per hour for DEMO_FIRE: weights not available.

Differences between builds (95% interval of the difference excludes 0):

- AFF_WRACK vs AFF_WRACK_IMMO: stamina 2.45 vs 3.73 (diff -1.28, -2.77..-0.20)
- AFF_WRACK vs AFF_DRAINTANK: intellect 0.23 vs 0.01 (diff 0.22, 0.09..0.39); spirit -0.55 vs 0.12 (diff -0.67, -0.94..-0.45); stamina 2.45 vs -0.00 (diff 2.45, 1.98..3.06)
- AFF_WRACK vs AFF_DRAINTANK_IMMO: spirit -0.55 vs 0.09 (diff -0.64, -0.90..-0.39); stamina 2.45 vs 0.57 (diff 1.88, 1.36..2.53); critPct 1.55 vs 4.59 (diff -3.04, -5.21..-0.49)
- AFF_WRACK vs DT_SS: intellect 0.23 vs 0.02 (diff 0.21, 0.08..0.38); spirit -0.55 vs 0.13 (diff -0.68, -0.95..-0.46); stamina 2.45 vs 0.01 (diff 2.43, 1.97..3.05)
- AFF_WRACK vs DT_SS_IMMO: intellect 0.23 vs 0.49 (diff -0.26, -0.58..-0.02); spirit -0.55 vs 0.51 (diff -1.05, -1.40..-0.79); stamina 2.45 vs 1.26 (diff 1.19, 0.45..2.01)
- AFF_WRACK vs DEMO_PACT_R1: spirit -0.55 vs 0.01 (diff -0.56, -0.85..-0.28); stamina 2.45 vs 1.08 (diff 1.37, 0.75..2.05)
- AFF_WRACK vs DEMO_PACT_VIDEO: spirit -0.55 vs -0.19 (diff -0.36, -0.67..-0.11); stamina 2.45 vs 0.93 (diff 1.52, 1.02..2.11)
- AFF_WRACK vs DEMO_PACT_R2: spirit -0.55 vs -0.25 (diff -0.30, -0.63..-0.04); stamina 2.45 vs 1.34 (diff 1.11, 0.58..1.74); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- AFF_WRACK vs DEMO_PACT_MAXRANK: stamina 2.45 vs 1.82 (diff 0.63, 0.15..1.22); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- AFF_WRACK vs DEMO_FIRE: none significant
- AFF_WRACK_IMMO vs AFF_DRAINTANK: intellect 0.36 vs 0.01 (diff 0.35, 0.06..0.68); spirit -0.61 vs 0.12 (diff -0.74, -1.17..-0.46); stamina 3.73 vs -0.00 (diff 3.73, 2.91..5.21)
- AFF_WRACK_IMMO vs AFF_DRAINTANK_IMMO: spirit -0.61 vs 0.09 (diff -0.71, -1.08..-0.43); stamina 3.73 vs 0.57 (diff 3.16, 2.36..4.62)
- AFF_WRACK_IMMO vs DT_SS: intellect 0.36 vs 0.02 (diff 0.33, 0.06..0.66); spirit -0.61 vs 0.13 (diff -0.75, -1.19..-0.47); stamina 3.73 vs 0.01 (diff 3.71, 2.89..5.20)
- AFF_WRACK_IMMO vs DT_SS_IMMO: spirit -0.61 vs 0.51 (diff -1.12, -1.55..-0.83); stamina 3.73 vs 1.26 (diff 2.47, 1.55..3.90)
- AFF_WRACK_IMMO vs DEMO_PACT_R1: spirit -0.61 vs 0.01 (diff -0.62, -1.13..-0.31); stamina 3.73 vs 1.08 (diff 2.65, 1.85..4.18)
- AFF_WRACK_IMMO vs DEMO_PACT_VIDEO: spirit -0.61 vs -0.19 (diff -0.42, -0.90..-0.10); stamina 3.73 vs 0.93 (diff 2.80, 2.01..4.19)
- AFF_WRACK_IMMO vs DEMO_PACT_R2: spirit -0.61 vs -0.25 (diff -0.37, -0.78..-0.07); stamina 3.73 vs 1.34 (diff 2.38, 1.52..3.77); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- AFF_WRACK_IMMO vs DEMO_PACT_MAXRANK: stamina 3.73 vs 1.82 (diff 1.91, 1.04..3.35); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- AFF_WRACK_IMMO vs DEMO_FIRE: none significant
- AFF_DRAINTANK vs AFF_DRAINTANK_IMMO: intellect 0.01 vs 0.12 (diff -0.11, -0.14..-0.07); stamina -0.00 vs 0.57 (diff -0.57, -0.75..-0.38); critPct 3.25 vs 4.59 (diff -1.34, -2.36..-0.52)
- AFF_DRAINTANK vs DT_SS: intellect 0.01 vs 0.02 (diff -0.01, -0.03..-0.00); critPct 3.25 vs 3.72 (diff -0.47, -0.68..-0.28)
- AFF_DRAINTANK vs DT_SS_IMMO: intellect 0.01 vs 0.49 (diff -0.48, -0.81..-0.30); spirit 0.12 vs 0.51 (diff -0.38, -0.57..-0.26); stamina -0.00 vs 1.26 (diff -1.26, -1.83..-0.83)
- AFF_DRAINTANK vs DEMO_PACT_R1: intellect 0.01 vs 0.24 (diff -0.23, -0.37..-0.10); stamina -0.00 vs 1.08 (diff -1.08, -1.37..-0.84); critPct 3.25 vs 0.12 (diff 3.13, 1.75..4.62)
- AFF_DRAINTANK vs DEMO_PACT_VIDEO: spirit 0.12 vs -0.19 (diff 0.32, 0.16..0.45); stamina -0.00 vs 0.93 (diff -0.93, -1.18..-0.70); critPct 3.25 vs 0.49 (diff 2.76, 1.29..4.30)
- AFF_DRAINTANK vs DEMO_PACT_R2: intellect 0.01 vs 0.16 (diff -0.15, -0.27..-0.04); spirit 0.12 vs -0.25 (diff 0.37, 0.24..0.51); stamina -0.00 vs 1.34 (diff -1.34, -1.60..-1.13); critPct 3.25 vs 0.86 (diff 2.39, 0.75..4.09); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- AFF_DRAINTANK vs DEMO_PACT_MAXRANK: intellect 0.01 vs 0.08 (diff -0.07, -0.14..-0.01); spirit 0.12 vs -0.28 (diff 0.41, 0.27..0.57); stamina -0.00 vs 1.82 (diff -1.82, -2.07..-1.61); critPct 3.25 vs 0.04 (diff 3.21, 2.64..3.91); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- AFF_DRAINTANK vs DEMO_FIRE: none significant
- AFF_DRAINTANK_IMMO vs DT_SS: intellect 0.12 vs 0.02 (diff 0.09, 0.06..0.13); stamina 0.57 vs 0.01 (diff 0.56, 0.37..0.75); critPct 4.59 vs 3.72 (diff 0.87, 0.05..1.93)
- AFF_DRAINTANK_IMMO vs DT_SS_IMMO: intellect 0.12 vs 0.49 (diff -0.38, -0.70..-0.19); spirit 0.09 vs 0.51 (diff -0.41, -0.61..-0.27); stamina 0.57 vs 1.26 (diff -0.69, -1.28..-0.24); critPct 4.59 vs 0.91 (diff 3.67, 0.25..7.39)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R1: stamina 0.57 vs 1.08 (diff -0.51, -0.89..-0.16); critPct 4.59 vs 0.12 (diff 4.47, 2.88..6.40)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_VIDEO: spirit 0.09 vs -0.19 (diff 0.29, 0.09..0.44); stamina 0.57 vs 0.93 (diff -0.36, -0.68..-0.09); critPct 4.59 vs 0.49 (diff 4.10, 2.10..6.04)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R2: spirit 0.09 vs -0.25 (diff 0.34, 0.17..0.50); stamina 0.57 vs 1.34 (diff -0.77, -1.16..-0.45); critPct 4.59 vs 0.86 (diff 3.73, 2.02..5.56); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_MAXRANK: spirit 0.09 vs -0.28 (diff 0.38, 0.21..0.56); stamina 0.57 vs 1.82 (diff -1.25, -1.56..-0.95); critPct 4.59 vs 0.04 (diff 4.55, 3.40..5.91); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- AFF_DRAINTANK_IMMO vs DEMO_FIRE: none significant
- DT_SS vs DT_SS_IMMO: intellect 0.02 vs 0.49 (diff -0.47, -0.79..-0.28); spirit 0.13 vs 0.51 (diff -0.37, -0.55..-0.24); stamina 0.01 vs 1.26 (diff -1.25, -1.82..-0.82)
- DT_SS vs DEMO_PACT_R1: intellect 0.02 vs 0.24 (diff -0.21, -0.35..-0.08); stamina 0.01 vs 1.08 (diff -1.07, -1.35..-0.82); critPct 3.72 vs 0.12 (diff 3.60, 2.19..5.06)
- DT_SS vs DEMO_PACT_VIDEO: spirit 0.13 vs -0.19 (diff 0.33, 0.16..0.46); stamina 0.01 vs 0.93 (diff -0.92, -1.16..-0.68); critPct 3.72 vs 0.49 (diff 3.23, 1.78..4.84)
- DT_SS vs DEMO_PACT_R2: intellect 0.02 vs 0.16 (diff -0.14, -0.26..-0.03); spirit 0.13 vs -0.25 (diff 0.38, 0.25..0.51); stamina 0.01 vs 1.34 (diff -1.33, -1.59..-1.12); critPct 3.72 vs 0.86 (diff 2.86, 1.16..4.61); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- DT_SS vs DEMO_PACT_MAXRANK: intellect 0.02 vs 0.08 (diff -0.06, -0.13..-0.00); spirit 0.13 vs -0.28 (diff 0.42, 0.28..0.59); stamina 0.01 vs 1.82 (diff -1.80, -2.05..-1.61); critPct 3.72 vs 0.04 (diff 3.68, 3.09..4.34); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- DT_SS vs DEMO_FIRE: none significant
- DT_SS_IMMO vs DEMO_PACT_R1: intellect 0.49 vs 0.24 (diff 0.26, 0.02..0.58); spirit 0.51 vs 0.01 (diff 0.50, 0.27..0.74)
- DT_SS_IMMO vs DEMO_PACT_VIDEO: intellect 0.49 vs 0.10 (diff 0.39, 0.16..0.71); spirit 0.51 vs -0.19 (diff 0.70, 0.49..0.95)
- DT_SS_IMMO vs DEMO_PACT_R2: intellect 0.49 vs 0.16 (diff 0.33, 0.13..0.64); spirit 0.51 vs -0.25 (diff 0.75, 0.56..0.98); hitPct 0.00 vs 4.30 (diff -4.30, -7.76..-1.27)
- DT_SS_IMMO vs DEMO_PACT_MAXRANK: intellect 0.49 vs 0.08 (diff 0.41, 0.22..0.74); spirit 0.51 vs -0.28 (diff 0.79, 0.61..1.02); hitPct 0.00 vs 3.36 (diff -3.36, -4.71..-2.08)
- DT_SS_IMMO vs DEMO_FIRE: none significant
- DEMO_PACT_R1 vs DEMO_PACT_VIDEO: spirit 0.01 vs -0.19 (diff 0.20, 0.01..0.38)
- DEMO_PACT_R1 vs DEMO_PACT_R2: spirit 0.01 vs -0.25 (diff 0.25, 0.04..0.48)
- DEMO_PACT_R1 vs DEMO_PACT_MAXRANK: intellect 0.24 vs 0.08 (diff 0.15, 0.01..0.30); spirit 0.01 vs -0.28 (diff 0.29, 0.06..0.52); stamina 1.08 vs 1.82 (diff -0.74, -1.09..-0.38)
- DEMO_PACT_R1 vs DEMO_FIRE: none significant
- DEMO_PACT_VIDEO vs DEMO_PACT_R2: stamina 0.93 vs 1.34 (diff -0.41, -0.77..-0.08)
- DEMO_PACT_VIDEO vs DEMO_PACT_MAXRANK: stamina 0.93 vs 1.82 (diff -0.89, -1.19..-0.61)
- DEMO_PACT_VIDEO vs DEMO_FIRE: none significant
- DEMO_PACT_R2 vs DEMO_PACT_MAXRANK: stamina 1.34 vs 1.82 (diff -0.48, -0.80..-0.13)
- DEMO_PACT_R2 vs DEMO_FIRE: none significant
- DEMO_PACT_MAXRANK vs DEMO_FIRE: none significant

## Level 55

| stat | AFF_WRACK | AFF_WRACK_IMMO | AFF_DRAINTANK | AFF_DRAINTANK_IMMO | DT_SS | DT_SS_IMMO | DEMO_PACT_R1 | DEMO_PACT_VIDEO | DEMO_PACT_R2 | DEMO_PACT_MAXRANK | DEMO_FIRE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| spellPower | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) |
| intellect | 0.28 (0.17..0.40) | 0.22 (0.12..0.33) | 0.04 (0.02..0.06) * | 0.22 (0.13..0.34) | 0.04 (0.02..0.06) * | 0.22 (0.13..0.34) | 0.24 (0.07..0.42) | 0.11 (-0.01..0.25) | 0.14 (0.01..0.28) | 0.08 (-0.03..0.21) | 0.17 (0.03..0.35) * |
| spirit | -0.16 (-0.33..0.01) | -0.13 (-0.26..0.00) | 0.24 (0.21..0.26) * | 0.59 (0.41..0.80) * | 0.24 (0.21..0.26) * | 0.59 (0.41..0.80) * | 0.35 (0.17..0.53) * | 0.15 (0.03..0.25) * | 0.26 (0.14..0.38) | 0.39 (0.26..0.54) | 0.13 (-0.08..0.35) |
| stamina | 1.74 (1.40..2.20) * | 1.36 (1.12..1.70) * | -0.05 (-0.09..-0.02) * | 0.91 (0.60..1.26) * | -0.05 (-0.09..-0.02) * | 0.91 (0.60..1.26) * | 0.79 (0.51..1.13) | 0.58 (0.40..0.76) | 0.95 (0.70..1.26) * | 0.78 (0.60..0.98) * | 1.08 (0.80..1.47) * |
| critPct | 2.87 (1.27..4.43) * | 3.42 (1.11..6.04) | 4.63 (4.37..4.89) | 4.60 (3.09..6.11) | 4.63 (4.37..4.89) | 4.60 (3.09..6.11) | 5.17 (2.72..8.13) | 2.44 (0.55..4.30) | 2.45 (0.75..4.49) | 1.84 (0.79..2.99) * | 5.56 (2.58..9.38) |
| hitPct | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | 3.71 (-1.34..8.72) | 2.72 (-0.90..6.30) | 5.34 (2.21..9.10) | 8.01 (5.28..10.69) | 9.45 (4.64..15.86) |
| kills/h at base | 113.3 | 105.8 | 126.2 | 122.0 | 126.2 | 122.0 | 109.2 | 109.0 | 110.5 | 104.3 | 107.9 |

Differences between builds (95% interval of the difference excludes 0):

- AFF_WRACK vs AFF_WRACK_IMMO: none significant
- AFF_WRACK vs AFF_DRAINTANK: intellect 0.28 vs 0.04 (diff 0.24, 0.12..0.36); spirit -0.16 vs 0.24 (diff -0.39, -0.57..-0.23); stamina 1.74 vs -0.05 (diff 1.80, 1.46..2.24); critPct 2.87 vs 4.63 (diff -1.77, -3.37..-0.22)
- AFF_WRACK vs AFF_DRAINTANK_IMMO: spirit -0.16 vs 0.59 (diff -0.75, -1.02..-0.50); stamina 1.74 vs 0.91 (diff 0.83, 0.40..1.36)
- AFF_WRACK vs DT_SS: intellect 0.28 vs 0.04 (diff 0.24, 0.12..0.36); spirit -0.16 vs 0.24 (diff -0.39, -0.57..-0.23); stamina 1.74 vs -0.05 (diff 1.80, 1.46..2.24); critPct 2.87 vs 4.63 (diff -1.77, -3.37..-0.22)
- AFF_WRACK vs DT_SS_IMMO: spirit -0.16 vs 0.59 (diff -0.75, -1.02..-0.50); stamina 1.74 vs 0.91 (diff 0.83, 0.40..1.36)
- AFF_WRACK vs DEMO_PACT_R1: spirit -0.16 vs 0.35 (diff -0.51, -0.74..-0.25); stamina 1.74 vs 0.79 (diff 0.95, 0.49..1.50)
- AFF_WRACK vs DEMO_PACT_VIDEO: intellect 0.28 vs 0.11 (diff 0.17, 0.00..0.34); spirit -0.16 vs 0.15 (diff -0.31, -0.51..-0.12); stamina 1.74 vs 0.58 (diff 1.16, 0.78..1.64)
- AFF_WRACK vs DEMO_PACT_R2: spirit -0.16 vs 0.26 (diff -0.41, -0.64..-0.21); stamina 1.74 vs 0.95 (diff 0.79, 0.30..1.29); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- AFF_WRACK vs DEMO_PACT_MAXRANK: intellect 0.28 vs 0.08 (diff 0.20, 0.02..0.36); spirit -0.16 vs 0.39 (diff -0.55, -0.77..-0.36); stamina 1.74 vs 0.78 (diff 0.96, 0.64..1.45); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- AFF_WRACK vs DEMO_FIRE: spirit -0.16 vs 0.13 (diff -0.29, -0.55..-0.07); stamina 1.74 vs 1.08 (diff 0.66, 0.12..1.23); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- AFF_WRACK_IMMO vs AFF_DRAINTANK: intellect 0.22 vs 0.04 (diff 0.18, 0.06..0.29); spirit -0.13 vs 0.24 (diff -0.36, -0.50..-0.23); stamina 1.36 vs -0.05 (diff 1.41, 1.16..1.73)
- AFF_WRACK_IMMO vs AFF_DRAINTANK_IMMO: spirit -0.13 vs 0.59 (diff -0.72, -0.96..-0.48); stamina 1.36 vs 0.91 (diff 0.45, 0.08..0.86)
- AFF_WRACK_IMMO vs DT_SS: intellect 0.22 vs 0.04 (diff 0.18, 0.06..0.29); spirit -0.13 vs 0.24 (diff -0.36, -0.50..-0.23); stamina 1.36 vs -0.05 (diff 1.41, 1.16..1.73)
- AFF_WRACK_IMMO vs DT_SS_IMMO: spirit -0.13 vs 0.59 (diff -0.72, -0.96..-0.48); stamina 1.36 vs 0.91 (diff 0.45, 0.08..0.86)
- AFF_WRACK_IMMO vs DEMO_PACT_R1: spirit -0.13 vs 0.35 (diff -0.48, -0.71..-0.25); stamina 1.36 vs 0.79 (diff 0.57, 0.18..0.97)
- AFF_WRACK_IMMO vs DEMO_PACT_VIDEO: spirit -0.13 vs 0.15 (diff -0.28, -0.43..-0.13); stamina 1.36 vs 0.58 (diff 0.78, 0.48..1.15)
- AFF_WRACK_IMMO vs DEMO_PACT_R2: spirit -0.13 vs 0.26 (diff -0.38, -0.58..-0.20); stamina 1.36 vs 0.95 (diff 0.40, 0.10..0.74); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- AFF_WRACK_IMMO vs DEMO_PACT_MAXRANK: spirit -0.13 vs 0.39 (diff -0.52, -0.75..-0.31); stamina 1.36 vs 0.78 (diff 0.58, 0.29..0.91); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- AFF_WRACK_IMMO vs DEMO_FIRE: spirit -0.13 vs 0.13 (diff -0.26, -0.51..-0.01); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- AFF_DRAINTANK vs AFF_DRAINTANK_IMMO: intellect 0.04 vs 0.22 (diff -0.18, -0.29..-0.08); spirit 0.24 vs 0.59 (diff -0.35, -0.55..-0.18); stamina -0.05 vs 0.91 (diff -0.96, -1.32..-0.64)
- AFF_DRAINTANK vs DT_SS: none significant
- AFF_DRAINTANK vs DT_SS_IMMO: intellect 0.04 vs 0.22 (diff -0.18, -0.29..-0.08); spirit 0.24 vs 0.59 (diff -0.35, -0.55..-0.18); stamina -0.05 vs 0.91 (diff -0.96, -1.32..-0.64)
- AFF_DRAINTANK vs DEMO_PACT_R1: intellect 0.04 vs 0.24 (diff -0.20, -0.39..-0.02); stamina -0.05 vs 0.79 (diff -0.85, -1.19..-0.57)
- AFF_DRAINTANK vs DEMO_PACT_VIDEO: stamina -0.05 vs 0.58 (diff -0.64, -0.81..-0.44); critPct 4.63 vs 2.44 (diff 2.19, 0.32..4.04)
- AFF_DRAINTANK vs DEMO_PACT_R2: stamina -0.05 vs 0.95 (diff -1.01, -1.30..-0.76); critPct 4.63 vs 2.45 (diff 2.18, 0.06..3.92); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- AFF_DRAINTANK vs DEMO_PACT_MAXRANK: spirit 0.24 vs 0.39 (diff -0.16, -0.31..-0.01); stamina -0.05 vs 0.78 (diff -0.83, -1.03..-0.66); critPct 4.63 vs 1.84 (diff 2.79, 1.62..3.92); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- AFF_DRAINTANK vs DEMO_FIRE: stamina -0.05 vs 1.08 (diff -1.13, -1.51..-0.83); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- AFF_DRAINTANK_IMMO vs DT_SS: intellect 0.22 vs 0.04 (diff 0.18, 0.08..0.29); spirit 0.59 vs 0.24 (diff 0.35, 0.18..0.55); stamina 0.91 vs -0.05 (diff 0.96, 0.64..1.32)
- AFF_DRAINTANK_IMMO vs DT_SS_IMMO: none significant
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R1: none significant
- AFF_DRAINTANK_IMMO vs DEMO_PACT_VIDEO: spirit 0.59 vs 0.15 (diff 0.44, 0.22..0.66)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R2: spirit 0.59 vs 0.26 (diff 0.34, 0.10..0.57); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_MAXRANK: critPct 4.60 vs 1.84 (diff 2.76, 0.88..4.83); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- AFF_DRAINTANK_IMMO vs DEMO_FIRE: spirit 0.59 vs 0.13 (diff 0.46, 0.16..0.74); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- DT_SS vs DT_SS_IMMO: intellect 0.04 vs 0.22 (diff -0.18, -0.29..-0.08); spirit 0.24 vs 0.59 (diff -0.35, -0.55..-0.18); stamina -0.05 vs 0.91 (diff -0.96, -1.32..-0.64)
- DT_SS vs DEMO_PACT_R1: intellect 0.04 vs 0.24 (diff -0.20, -0.39..-0.02); stamina -0.05 vs 0.79 (diff -0.85, -1.19..-0.57)
- DT_SS vs DEMO_PACT_VIDEO: stamina -0.05 vs 0.58 (diff -0.64, -0.81..-0.44); critPct 4.63 vs 2.44 (diff 2.19, 0.32..4.04)
- DT_SS vs DEMO_PACT_R2: stamina -0.05 vs 0.95 (diff -1.01, -1.30..-0.76); critPct 4.63 vs 2.45 (diff 2.18, 0.06..3.92); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- DT_SS vs DEMO_PACT_MAXRANK: spirit 0.24 vs 0.39 (diff -0.16, -0.31..-0.01); stamina -0.05 vs 0.78 (diff -0.83, -1.03..-0.66); critPct 4.63 vs 1.84 (diff 2.79, 1.62..3.92); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- DT_SS vs DEMO_FIRE: stamina -0.05 vs 1.08 (diff -1.13, -1.51..-0.83); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- DT_SS_IMMO vs DEMO_PACT_R1: none significant
- DT_SS_IMMO vs DEMO_PACT_VIDEO: spirit 0.59 vs 0.15 (diff 0.44, 0.22..0.66)
- DT_SS_IMMO vs DEMO_PACT_R2: spirit 0.59 vs 0.26 (diff 0.34, 0.10..0.57); hitPct 0.00 vs 5.34 (diff -5.34, -9.10..-2.21)
- DT_SS_IMMO vs DEMO_PACT_MAXRANK: critPct 4.60 vs 1.84 (diff 2.76, 0.88..4.83); hitPct 0.00 vs 8.01 (diff -8.01, -10.69..-5.28)
- DT_SS_IMMO vs DEMO_FIRE: spirit 0.59 vs 0.13 (diff 0.46, 0.16..0.74); hitPct 0.00 vs 9.45 (diff -9.45, -15.86..-4.64)
- DEMO_PACT_R1 vs DEMO_PACT_VIDEO: spirit 0.35 vs 0.15 (diff 0.20, 0.00..0.41); critPct 5.17 vs 2.44 (diff 2.72, 0.16..5.57)
- DEMO_PACT_R1 vs DEMO_PACT_R2: none significant
- DEMO_PACT_R1 vs DEMO_PACT_MAXRANK: critPct 5.17 vs 1.84 (diff 3.33, 0.29..6.68)
- DEMO_PACT_R1 vs DEMO_FIRE: none significant
- DEMO_PACT_VIDEO vs DEMO_PACT_R2: stamina 0.58 vs 0.95 (diff -0.37, -0.73..-0.08)
- DEMO_PACT_VIDEO vs DEMO_PACT_MAXRANK: spirit 0.15 vs 0.39 (diff -0.24, -0.46..-0.04); hitPct 2.72 vs 8.01 (diff -5.29, -9.84..-0.70)
- DEMO_PACT_VIDEO vs DEMO_FIRE: stamina 0.58 vs 1.08 (diff -0.50, -0.94..-0.12); hitPct 2.72 vs 9.45 (diff -6.73, -13.93..-0.60)
- DEMO_PACT_R2 vs DEMO_PACT_MAXRANK: none significant
- DEMO_PACT_R2 vs DEMO_FIRE: none significant
- DEMO_PACT_MAXRANK vs DEMO_FIRE: spirit 0.39 vs 0.13 (diff 0.26, 0.02..0.50); critPct 1.84 vs 5.56 (diff -3.72, -7.53..-0.76)

## Level 59

| stat | AFF_WRACK | AFF_WRACK_IMMO | AFF_DRAINTANK | AFF_DRAINTANK_IMMO | DT_SS | DT_SS_IMMO | DEMO_PACT_R1 | DEMO_PACT_VIDEO | DEMO_PACT_R2 | DEMO_PACT_MAXRANK | DEMO_FIRE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| spellPower | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) | 1.00 (1.00..1.00) * | 1.00 (1.00..1.00) * |
| intellect | 0.29 (0.12..0.58) | 0.53 (0.24..0.86) | 0.43 (0.18..0.71) * | 0.74 (0.51..1.03) * | 0.43 (0.18..0.71) * | 0.74 (0.51..1.03) * | 0.47 (0.13..0.90) | 0.51 (0.14..0.88) | 0.10 (-0.02..0.22) | 0.31 (0.12..0.55) | 0.19 (-0.06..0.47) |
| spirit | -0.26 (-0.55..-0.04) | -0.32 (-0.71..-0.08) | -0.29 (-0.61..-0.02) * | -0.15 (-0.39..0.08) * | -0.29 (-0.61..-0.02) * | -0.15 (-0.39..0.08) * | 0.65 (0.32..1.11) | 0.43 (0.19..0.79) | 0.19 (0.07..0.34) | -0.96 (-1.39..-0.69) * | -0.21 (-0.50..0.02) |
| stamina | 3.22 (2.30..4.85) * | 2.43 (1.80..3.65) * | 1.68 (1.29..2.16) * | 0.76 (0.58..1.01) | 1.68 (1.29..2.16) * | 0.76 (0.58..1.01) | 1.02 (0.66..1.62) | 0.86 (0.51..1.41) | 0.31 (0.18..0.46) | 1.48 (1.13..2.01) | 0.56 (0.34..0.82) * |
| critPct | 5.01 (1.83..8.41) | 4.96 (1.39..9.36) | 2.76 (0.07..5.73) | 3.43 (1.24..6.11) | 2.76 (0.07..5.73) | 3.43 (1.24..6.11) | 4.18 (0.72..8.42) | 6.15 (2.71..11.32) | 4.22 (2.59..6.01) | 0.77 (-2.40..3.53) | 6.92 (3.58..11.26) |
| hitPct | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | capped (0) | 13.28 (5.07..23.85) | 4.01 (1.06..7.35) | 1.90 (-3.13..7.30) | 11.18 (5.47..18.80) |
| kills/h at base | 113.4 | 103.8 | 115.7 | 105.9 | 115.7 | 105.9 | 104.2 | 104.3 | 104.8 | 95.8 | 110.4 |

Differences between builds (95% interval of the difference excludes 0):

- AFF_WRACK vs AFF_WRACK_IMMO: none significant
- AFF_WRACK vs AFF_DRAINTANK: stamina 3.22 vs 1.68 (diff 1.55, 0.39..3.15)
- AFF_WRACK vs AFF_DRAINTANK_IMMO: intellect 0.29 vs 0.74 (diff -0.45, -0.75..-0.15); stamina 3.22 vs 0.76 (diff 2.46, 1.46..4.05)
- AFF_WRACK vs DT_SS: stamina 3.22 vs 1.68 (diff 1.55, 0.39..3.15)
- AFF_WRACK vs DT_SS_IMMO: intellect 0.29 vs 0.74 (diff -0.45, -0.75..-0.15); stamina 3.22 vs 0.76 (diff 2.46, 1.46..4.05)
- AFF_WRACK vs DEMO_PACT_R1: spirit -0.26 vs 0.65 (diff -0.91, -1.48..-0.53); stamina 3.22 vs 1.02 (diff 2.20, 1.16..3.81)
- AFF_WRACK vs DEMO_PACT_VIDEO: spirit -0.26 vs 0.43 (diff -0.69, -1.11..-0.40); stamina 3.22 vs 0.86 (diff 2.36, 1.33..4.00); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- AFF_WRACK vs DEMO_PACT_R2: spirit -0.26 vs 0.19 (diff -0.45, -0.82..-0.22); stamina 3.22 vs 0.31 (diff 2.91, 1.94..4.47); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- AFF_WRACK vs DEMO_PACT_MAXRANK: spirit -0.26 vs -0.96 (diff 0.70, 0.24..1.24); stamina 3.22 vs 1.48 (diff 1.74, 0.69..3.49); critPct 5.01 vs 0.77 (diff 4.24, 0.13..9.21)
- AFF_WRACK vs DEMO_FIRE: stamina 3.22 vs 0.56 (diff 2.67, 1.67..4.24); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- AFF_WRACK_IMMO vs AFF_DRAINTANK: stamina 2.43 vs 1.68 (diff 0.76, 0.01..1.87)
- AFF_WRACK_IMMO vs AFF_DRAINTANK_IMMO: stamina 2.43 vs 0.76 (diff 1.67, 1.03..2.84)
- AFF_WRACK_IMMO vs DT_SS: stamina 2.43 vs 1.68 (diff 0.76, 0.01..1.87)
- AFF_WRACK_IMMO vs DT_SS_IMMO: stamina 2.43 vs 0.76 (diff 1.67, 1.03..2.84)
- AFF_WRACK_IMMO vs DEMO_PACT_R1: spirit -0.32 vs 0.65 (diff -0.98, -1.57..-0.56); stamina 2.43 vs 1.02 (diff 1.41, 0.53..2.62)
- AFF_WRACK_IMMO vs DEMO_PACT_VIDEO: spirit -0.32 vs 0.43 (diff -0.76, -1.25..-0.42); stamina 2.43 vs 0.86 (diff 1.57, 0.78..2.84); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- AFF_WRACK_IMMO vs DEMO_PACT_R2: intellect 0.53 vs 0.10 (diff 0.42, 0.13..0.77); spirit -0.32 vs 0.19 (diff -0.52, -0.95..-0.21); stamina 2.43 vs 0.31 (diff 2.13, 1.48..3.34); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- AFF_WRACK_IMMO vs DEMO_PACT_MAXRANK: spirit -0.32 vs -0.96 (diff 0.64, 0.17..1.13); stamina 2.43 vs 1.48 (diff 0.96, 0.14..2.25)
- AFF_WRACK_IMMO vs DEMO_FIRE: stamina 2.43 vs 0.56 (diff 1.88, 1.15..3.15); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- AFF_DRAINTANK vs AFF_DRAINTANK_IMMO: stamina 1.68 vs 0.76 (diff 0.92, 0.54..1.42)
- AFF_DRAINTANK vs DT_SS: none significant
- AFF_DRAINTANK vs DT_SS_IMMO: stamina 1.68 vs 0.76 (diff 0.92, 0.54..1.42)
- AFF_DRAINTANK vs DEMO_PACT_R1: spirit -0.29 vs 0.65 (diff -0.94, -1.53..-0.50)
- AFF_DRAINTANK vs DEMO_PACT_VIDEO: spirit -0.29 vs 0.43 (diff -0.72, -1.17..-0.32); stamina 1.68 vs 0.86 (diff 0.82, 0.09..1.48); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- AFF_DRAINTANK vs DEMO_PACT_R2: intellect 0.43 vs 0.10 (diff 0.32, 0.06..0.62); spirit -0.29 vs 0.19 (diff -0.48, -0.83..-0.18); stamina 1.68 vs 0.31 (diff 1.37, 0.95..1.85); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- AFF_DRAINTANK vs DEMO_PACT_MAXRANK: spirit -0.29 vs -0.96 (diff 0.67, 0.24..1.12)
- AFF_DRAINTANK vs DEMO_FIRE: stamina 1.68 vs 0.56 (diff 1.12, 0.68..1.67); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- AFF_DRAINTANK_IMMO vs DT_SS: stamina 0.76 vs 1.68 (diff -0.92, -1.42..-0.54)
- AFF_DRAINTANK_IMMO vs DT_SS_IMMO: none significant
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R1: spirit -0.15 vs 0.65 (diff -0.80, -1.35..-0.41)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_VIDEO: spirit -0.15 vs 0.43 (diff -0.58, -0.97..-0.24); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_R2: intellect 0.74 vs 0.10 (diff 0.64, 0.38..0.97); spirit -0.15 vs 0.19 (diff -0.34, -0.66..-0.10); stamina 0.76 vs 0.31 (diff 0.45, 0.23..0.74); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- AFF_DRAINTANK_IMMO vs DEMO_PACT_MAXRANK: intellect 0.74 vs 0.31 (diff 0.43, 0.06..0.81); spirit -0.15 vs -0.96 (diff 0.81, 0.42..1.33); stamina 0.76 vs 1.48 (diff -0.72, -1.27..-0.30)
- AFF_DRAINTANK_IMMO vs DEMO_FIRE: intellect 0.74 vs 0.19 (diff 0.55, 0.23..0.96); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- DT_SS vs DT_SS_IMMO: stamina 1.68 vs 0.76 (diff 0.92, 0.54..1.42)
- DT_SS vs DEMO_PACT_R1: spirit -0.29 vs 0.65 (diff -0.94, -1.53..-0.50)
- DT_SS vs DEMO_PACT_VIDEO: spirit -0.29 vs 0.43 (diff -0.72, -1.17..-0.32); stamina 1.68 vs 0.86 (diff 0.82, 0.09..1.48); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- DT_SS vs DEMO_PACT_R2: intellect 0.43 vs 0.10 (diff 0.32, 0.06..0.62); spirit -0.29 vs 0.19 (diff -0.48, -0.83..-0.18); stamina 1.68 vs 0.31 (diff 1.37, 0.95..1.85); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- DT_SS vs DEMO_PACT_MAXRANK: spirit -0.29 vs -0.96 (diff 0.67, 0.24..1.12)
- DT_SS vs DEMO_FIRE: stamina 1.68 vs 0.56 (diff 1.12, 0.68..1.67); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- DT_SS_IMMO vs DEMO_PACT_R1: spirit -0.15 vs 0.65 (diff -0.80, -1.35..-0.41)
- DT_SS_IMMO vs DEMO_PACT_VIDEO: spirit -0.15 vs 0.43 (diff -0.58, -0.97..-0.24); hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- DT_SS_IMMO vs DEMO_PACT_R2: intellect 0.74 vs 0.10 (diff 0.64, 0.38..0.97); spirit -0.15 vs 0.19 (diff -0.34, -0.66..-0.10); stamina 0.76 vs 0.31 (diff 0.45, 0.23..0.74); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- DT_SS_IMMO vs DEMO_PACT_MAXRANK: intellect 0.74 vs 0.31 (diff 0.43, 0.06..0.81); spirit -0.15 vs -0.96 (diff 0.81, 0.42..1.33); stamina 0.76 vs 1.48 (diff -0.72, -1.27..-0.30)
- DT_SS_IMMO vs DEMO_FIRE: intellect 0.74 vs 0.19 (diff 0.55, 0.23..0.96); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- DEMO_PACT_R1 vs DEMO_PACT_VIDEO: hitPct 0.00 vs 13.28 (diff -13.28, -23.85..-5.07)
- DEMO_PACT_R1 vs DEMO_PACT_R2: spirit 0.65 vs 0.19 (diff 0.46, 0.05..0.98); stamina 1.02 vs 0.31 (diff 0.71, 0.29..1.37); hitPct 0.00 vs 4.01 (diff -4.01, -7.35..-1.06)
- DEMO_PACT_R1 vs DEMO_PACT_MAXRANK: spirit 0.65 vs -0.96 (diff 1.62, 1.15..2.27)
- DEMO_PACT_R1 vs DEMO_FIRE: spirit 0.65 vs -0.21 (diff 0.87, 0.45..1.46); hitPct 0.00 vs 11.18 (diff -11.18, -18.80..-5.47)
- DEMO_PACT_VIDEO vs DEMO_PACT_R2: intellect 0.51 vs 0.10 (diff 0.40, 0.07..0.78); stamina 0.86 vs 0.31 (diff 0.55, 0.15..1.12); hitPct 13.28 vs 4.01 (diff 9.27, 1.03..20.66)
- DEMO_PACT_VIDEO vs DEMO_PACT_MAXRANK: spirit 0.43 vs -0.96 (diff 1.40, 0.98..2.06); stamina 0.86 vs 1.48 (diff -0.62, -1.19..-0.02); critPct 6.15 vs 0.77 (diff 5.38, 0.89..11.99); hitPct 13.28 vs 1.90 (diff 11.38, 1.27..23.02)
- DEMO_PACT_VIDEO vs DEMO_FIRE: spirit 0.43 vs -0.21 (diff 0.65, 0.32..1.06)
- DEMO_PACT_R2 vs DEMO_PACT_MAXRANK: intellect 0.10 vs 0.31 (diff -0.20, -0.46..-0.01); spirit 0.19 vs -0.96 (diff 1.16, 0.85..1.60); stamina 0.31 vs 1.48 (diff -1.17, -1.72..-0.80); critPct 4.22 vs 0.77 (diff 3.45, 0.60..7.25)
- DEMO_PACT_R2 vs DEMO_FIRE: spirit 0.19 vs -0.21 (diff 0.41, 0.12..0.75); hitPct 4.01 vs 11.18 (diff -7.17, -14.96..-0.74)
- DEMO_PACT_MAXRANK vs DEMO_FIRE: spirit -0.96 vs -0.21 (diff -0.75, -1.25..-0.32); stamina 1.48 vs 0.56 (diff 0.92, 0.50..1.51); critPct 0.77 vs 6.92 (diff -6.16, -11.06..-1.91); hitPct 1.90 vs 11.18 (diff -9.28, -18.84..-0.62)

Notes: the gear profiles are placeholders (`verify: true` in `levels.json`), so the weights are indicative. Hit counts only below the hit cap. `*` marks a weight whose downward and upward steps clearly disagree (not linear, so only approximate). Weights are kills per hour per point relative to spell power.
