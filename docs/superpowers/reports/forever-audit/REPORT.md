# Raport poranny: rewizja symulatora Forever (28.11.2026)

Gałąź: `claude/youthful-hopper-op9tox` (wypchnięta, bez PR-a). Spec: `docs/superpowers/specs/2026-11-28-forever-audit-design.md`, plan: `docs/superpowers/plans/2026-11-28-forever-audit.md`.

## 1. Podsumowanie

- Pięciu audytorów (silnik walki, czary i staty, talenty, pety i buildy, spójność ścieżek) zapisało **88 findings** (A1 18, A2 17, A3 19, A4 15, A5 19). Statusy: 51 potwierdzonych (część to duplikaty tej samej przyczyny), 37 do decyzji właściciela (`needs-owner`), 0 odrzuconych.
- Naprawiono **45 z 51 potwierdzonych findings** (patrz tabela). Celowo nie ruszono: A5-003, A5-013, A5-014, A5-019 (zmiany metodologiczne), A4-008, A4-009 (usuwanie lub zmiana nazw buildów) oraz wszystkiego z `needs-owner`.
- Dwa findings o wadze **high**: A1-001 (warunki "mana < 30/50%" i "walka > 20 s" w mieszanych rotacjach nigdy się nie spełniały) i A5-001 (kopia wbudowanego buildu w edytorze własnych buildów gubiła `coe`, `immolate`, `wrack_min_hp_pct` i `pet_rules`, więc kopia grała inaczej niż oryginał o 2-23%). Oba naprawione.
- Weryfikacja końcowa: `npm run typecheck` czysty, `npm run build` przechodzi, `npm test` **193 pliki, 2297 testów zielone** (start: 172 pliki, 2172 testy). Nic nie wycofano, żaden test nie został pominięty ani usunięty.
- Wyniki symulacji **zmieniły się** (snapshot przed i po, ziarno 1, patrz sekcja 3). Najważniejsze: buildy z Voidwalkerem na levelu 40 tracą ok. 7-8% (Torment kosztuje teraz 20 many, co potwierdza ledger), a `DEMO_FIRE` zyskuje 3-8% (Life Tap między pullami karmi teraz demona przez Demonic Energies).
- Do przemyślenia przez Ciebie: wielkość straty Voidwalkera zależy od niepotwierdzonej regeneracji many demona (stałe 0.5/s w kodzie). Patrz decyzja D1.
- Niezależny przegląd diffa (agent, który nie pisał poprawek) nie zgłosił żadnego `block`. Jego uwagi są w sekcji 6 i w `review.md`.

## 2. Findings i poprawki

| Poprawka | Findings | Efekt |
|---|---|---|
| F-fight | A1-001, A1-002, A1-005, A1-010, A1-012, A3-002=A4-003, A4-001, A4-006, A3-014=A4-007, A5-017 | warunki mieszanych rotacji działają; estymata DPS fillera dzieli przez długość kanału; kanał przerwany trafieniem nie daje dodatkowego ticka; Eureka! po sprawdzeniu kosztu; mana demona z Demonic Energies ograniczona do maksimum; Torment kosztuje 20 many; Lash of Pain rzuca na trafienie; estymaty peta z Improved Imp, pancerzem i trafieniem |
| F-runner | A3-001=A4-002, A1-003, A1-004, A1-008, A1-011, A1-014, A5-006, A4-014 | Life Tap między pullami daje manę demonowi; regeneracja Demonic Sacrifice także poza walką; Life Tap po przerwie; Soul Harvest przenosi właściwy czas; `BETWEEN_ONLY` i `OLD_THRESHOLD` nie robią awaryjnego Life Tapa w walce; brak przerw o długości 0; poprawne ziarna dla dużych seedów (dla seedów do 2^53 formuła bez zmian) |
| F-custom | A5-001, A5-002, A3-018=A4-011=A5-009, A5-008 | kopia wbudowanego buildu jest dokładna (test dla 22 buildów, levele 30/45/55, 1 i 2 moby); dwa buildy z plików bez `id` nie kolidują; błędne `rotation`, `rank`, `filler`, `pet` w JSON dają czytelny błąd; test przypinający geny = szablon |
| F-genes | A5-005 | buildy z klocków (własne, z discover) respektują nadpisania parametrów tak jak szablony; bez nadpisań wyniki bez zmian (przypięte testem) |
| F-data | A2-003, A2-008, A2-010, A1-013 | obrażenia moba na cios nie są ujemne ani malejące (levele 13, 27, 32, 33); flagi `verify` na Immolate i jedzeniu; ledger: przestarzałe zdania oznaczone jako zastąpione |
| F-stats | A2-007=A3-009=A4-015, A2-017, A3-019 | `stats.ts` czyta stałe talentów z danych (wartości bez zmian); martwy klucz Demonic Embrace poprawiony na potwierdzone +3% Stamina; jawna reguła dla leveli spoza tabeli; zmiana nazw mylących identyfikatorów |
| F-tools | A5-004, A5-010, A5-011, A5-012, A5-018, A3-017 | etykiety estymatorów w duelu i UI; nagłówki wyników (polityka, Spellstone, Eureka!, sprzęt); `SIM_VERSION` w kluczu stanu discover i zapisanego wyniku (stary wynik dostaje ostrzeżenie); `--param mobs_per_pull` działa w run/ep/duel; poprawki wyświetlania; tekst `--respec` |
| F-settings | A5-007 | pola "Level" i "Sesje" można wpisywać cyfra po cyfrze |
| Orchestrator | test Spellstone dla DEMO_FIRE, przypięte wartości genów, `tormentNote` | po zmianach F-runner test Spellstone przy 40 sesjach zależał od szumu: DEMO_FIRE sprawdzany teraz średnią z trzech seedów po 150 sesji; przypięte liczby genów przeliczone po zmianach runnera (sprawdzone: poprawka genów sama niczego nie zmienia) |
| Nowy test | `tests/forever/path-consistency.test.ts` | ta sama kombinacja build, level, ziarno daje te same kills/h w `runCell`, duel, EP (średnia po sesjach), rankingu webowym i zadaniu baseline discover (AFF_WRACK, DT_SS_NOCOE, build z genami; levele 40 i 59) |

## 3. Zmiana wyników: przed i po

Pełna tabela 66 wierszy z rozbiciem na fazy: `before-after.md`. Surowe snapshoty: `before/` i `after/` (skrypt `scripts/forever-audit-snapshot.sh`, ziarno 1, 100 sesji, profil `average`, 1 mob).

- Poprawki z fali 3 (F-stats, F-tools) **nie zmieniły żadnej liczby** (kolumna "+F-runner" równa "final" we wszystkich 66 wierszach).
- Ruchy powyżej 1,5% i ich przyczyna (podział według faz mierzony na commitach pośrednich):
  - **Levels 40: DT_SS_WRACK_50 / _70 (także NOCOE i _PET): od -7,4% do -8,4%.** Przyczyna: F-fight, A4-001 (Torment Voidwalkera kosztuje 20 many; ledger to potwierdza). Skala zależy od niepotwierdzonej regeneracji many demona, patrz D1.
  - **DEMO_FIRE: +6,9% (L40), +7,7% (L50), +3,4% (L59).** Przyczyna: F-runner, A3-001 (Life Tap między pullami i po przerwach daje manę Impowi przez Demonic Energies). Efekt większy niż +1-2% z audytu, bo dochodzi A1-004 (dodatkowe Life Tapy po przerwie, które też karmią Impa).
  - **AFF_WRACK L40 +3,5%, L50 +2,2%:** F-fight (+2,4% na L40: poprawione estymaty fillera Wrack zmieniają decyzje o DoT-ach zależne od TTK) i F-runner (Life Tap po przerwie).
  - **DEMO_PACT_MAXRANK L50 -3,7%:** F-runner, A1-004 (po każdej z ok. 40 przerw na godzinę płaci pełny czas Life Tapa; audyt A1 nazywał to wcześniej zbyt optymistycznym).
  - **AFF_DRAINTANK / DT_SS L59 +2,4%, DT_SS_IMMO i AFF_DRAINTANK_IMMO L50 -2,1% i -2,6%, pozostałe poniżej 2%:** mieszane skutki A1-004, A1-008 oraz F-fight; znak zgodny z przewidywaniami audytu (mieszany).
  - Po zmianie estymatorów część różnic poniżej ok. 1,5% to chaotyczne rozjechanie się sesji z tego samego ziarna po małej zmianie, nie efekt jednej poprawki.
- Duel: kolumny i różnice po zmianie tylko w etykietach i nagłówku; różnice sparowane zmieniły się o setne części (np. DT_SS vs AFF_DRAINTANK L40: 4,3 na 4,2).
- Discover (quick, L40, ziarno 1): rankingi top 5 zmieniły się. Wcześniej 1. miejsce miał rotację z filtrem "Shadow Bolt r2 gdy pet martwy", teraz 1. to wariant "SB r1 gdy TTK ≤ 5 s". Warianty z warunkami mana/czas walki wcześniej grały jak rotacja bazowa (A1-001), więc ich dawne wyniki były nieprawdziwe. Liczba wariantów mieszanych 200 na 193.
- **Nie ma różnic niewyjaśnionych**: każda zmiana ma przypisaną poprawkę. Nie było potrzeby bisekcji.

## 4. Decyzje dla właściciela

Wszystkie poniższe to findings `needs-owner` (źródła się różnią, brak danych, albo wartość `verify: true`). **Nie zmieniono nic.** Pełne dowody i rekomendacje w `findings/A1-A5.md`.

**D1 (ważne): regeneracja many demona.** Kod zakłada 0,5 many/s w walce dla demona, który nie jest Impem, i 0 dla Impa (`fight.ts:789`, `runner.ts:146`; A1, A4-004, parametr `pet_ooc_mana_per_sec`). Żadnego źródła w ledgerze. Skutek: po wprowadzeniu kosztu Tormenta (potwierdzone) buildy z Voidwalkerem tracą ok. 8% na L40 (1 mob) i więcej przy kilku mobach; Imp bez regeneracji w ogóle zależy od Life Tapa. Rekomendacja: sprawdzić w grze, ile many ma Voidwalker po kilku Tormentach i czy Imp regeneruje manę, i dopiero wtedy wpisać do `params.json`.

**D2: Master Demonologist daje Voidwalkerowi -10% obrażeń fizycznych (A4-005, A3-007).** Ani ledger, ani opis talentu tego nie mówi; usunięcie przesuwa DEMO_PACT_R1_PET (L55, 3 moby) z 115,4 na 100,7 kills/h. Rekomendacja: potwierdzić źródło albo usunąć.

**D3: Talenty "niezamodelowane" (A3-004 Master Summoner, A3-005 Suppression, A3-011).** Master Summoner kosztuje 7-8% czasu sesji w pullach po 3 moby (demon ginie w prawie 100% pulli). Suppression ma dane i jest oznaczony jako zamodelowany, ale `threatReducePerRank` nie jest czytany. Rekomendacja: zamodelować Master Summonera, jeśli symulacja ma obejmować pulle po kilka mobów.

**D4: Immolate: tiki DoT krytykują pełnym bonusem Pandemic (A3-003).** Immolate nie ma go na liście czarów Pandemic. Rekomendacja: sprawdzić tekst talentu Forever.

**D5: dane i parametry Classic bez źródła Forever (A2-001, A2-002, A2-004, A2-009, A2-013, A2-014, A2-015, A1-018).** Regeneracja Spirit, HP moba (formuła daje 10-35% więcej niż mediany Classic na levelach 57-60), brak crita z Intellectu, baza Life Tapa rangi 2-6, Demon Armor, naked stats z gry (poziom 31) celowo nieużywane. Rekomendacja: pomiary w grze, najpierw HP moba i regeneracja.

**D6: reguły mechaniki do potwierdzenia.** Pushback kanału (A1-006), mana przy przerwanym rzucie (A1-007, średnia waga), `corruption_min_ttk_sec` bramkuje też CoE i Agony (A1-009), haste nie skraca kanałów i tików (A1-016), snapshot kontra żywe mnożniki DoT (A1-017), mnożenie kontra dodawanie modyfikatorów obrażeń (A3-008), Soul Harvest (A2-006, A3-015), limit 500 ms rzucania a Improved Corruption (A2-012), Fel Vitality i rasowy bonus gnoma (A2-016), Shadow Trance bez wygasania w pullu (A3-013), Amplify Curse (A3-012), legacy perk (A3-016), Imp: Master Summoner i HP Impa i Felhuntera na 60 (A4-012, A4-013), przełączenie Drain Life na Wrack od levelu 57 (A4-010).

**D7: polityki `BEST_1MOB`/`BEST_2MOB` nie równają się wartościom z raportów (A5-015) i import z addonu ma przypadki brzegowe (A5-016).**

**Celowo odroczone (potwierdzone, ale zmieniają metodologię albo produkt):**
- **A5-003:** "wspólne losowe liczby" nie parują sesji (jeden strumień RNG na pull, zużywany w kolejności zdarzeń), więc wąskie przedziały ufności w duelu i EP są zbyt optymistyczne. Naprawa wymaga przebudowy RNG i przesunęłaby każdą liczbę ziarna. Rekomendacja: osobny przebieg.
- **A5-013, A5-014, A5-019:** kwantyl 1,96 bez poprawki na mały próg sesji, `valid` w EP i istotność w `sensitivity`. Zmieniają przedziały i werdykty.
- **A4-008, A4-009:** `DT_SS_WRACK_50_PET` jest dokładnym duplikatem `DT_SS_WRACK_50`, `AFF_WRACK_SH_PET` różni się tylko kolejnością Soul Harvest; `DEMO_PACT_R1_PET` ma dwie reguły równoważne `minMobs: 2`. Usunięcie lub zmiana nazw dotyka README i skryptów.

## 5. Poprawki wycofane

Brak. Każda poprawka przeszła z pierwszej próby lub po jednej korekcie testu.

## 6. Uwagi z przeglądu diffa (wszystkie `note`)

- Brak testów dla fragmentów: przenoszenie czasu Soul Harvest (`runner.ts` A1-008, tylko górne ograniczenie), wspólny czas chodzenia i Life Tapa (A1-004), regeneracja Demonic Sacrifice w trakcie płatnego Life Tapa i Health Funnel (A1-003), podłączenie CLI w `forever-run.ts` i `forever-duel.ts`.
- Dane moba (levele 13, 27, 32, 33) poprawione regułą z własnego generatora, bez zewnętrznego potwierdzenia. Level 32 podniesiony tylko dla monotoniczności (mediana 50,5 na 51), level 33 ustawiony na 51,5 przy próbkowej medianie 52. Do zatwierdzenia.
- Torment 20 many jest wpisany na stałe w `fight.ts` (`TORMENT_MANA`), nie w `levels.json`.
- Komunikat commita A5-006 mówi o 9e9, ale gałąź z hashem w `pullSeed` zaczyna się od ok. 9e4 w discover. To zamierzone, ale seedy powyżej tej wartości dają teraz inne wyniki niż przed poprawką. Seedy domyślne (1) bez zmian.
- Wpis w ledgerze o kluczu Demonic Embrace mówi "wartości z sekcji 1", a Demonic Embrace nie ma w sekcji 1.
- Parametry `aff_use_immolate=true` i `demo_use_agony=true` dodają efekt do wszystkich buildów z klocków (jak w szablonach), więc przestrzeń discover się kurczy; nadpisanie równe domyślnej `corruption_min_ttk_sec` (6) jest nierozróżnialne od braku nadpisania.
- Jeden pomiar obciążenia: pierwszy pełny przebieg testów F-genes zgłosił timeout testu UI (`waitFor` 120 s) pod dużym obciążeniem; powtórka zielona. Nie wystąpił w żadnym z końcowych przebiegów.

## 7. Pokrycie

- Audytorzy sprawdzili: rangi, mana, czasy, współczynniki i poziomy dostępności wszystkich czarów gracza i peta względem ledgera (zgodne); 35 zamodelowanych talentów (wartości na rangę zgodne z ledgerem, poza wymienionymi); zasady 51 punktów i prefiksy kolejności wszystkich 22 buildów (poprawne na każdym levelu 10-60); wybór demona po levelu i liczbie mobów; zdrowie demona między pullami; zgodność ścieżek liczenia (po poprawkach: test `path-consistency`); import sprzętu i talentów. Pełne listy "Sprawdzone i w porządku" są na końcu każdego pliku findings.
- Nie sprawdzano pomiarów z gry (agenci ich nie mieli), poza tym, co jest w ledgerze.
- W prompcie audytorów A1 i A5 limit API przerwał agentów zaraz po zapisaniu raportów; pliki są kompletne (sekcje "sprawdzone" i "uwagi spoza zakresu" obecne).

## 8. Uwagi spoza zakresu (zebrane z findings)

- `docs/forever-data-ledger.md` zawierał kilka zdań sprzecznych z późniejszymi sekcjami (Wrack 60 do 124, brak rang CoE, HP poza walką = 0); oznaczono je jako zastąpione.
- `talentDescriptions.json` to teksty Wowhead TBC, nie Forever; `talents.json` ma w `source` źródła Forever.
- Cykl importów `ep.ts` i `web/api.ts` (działa, bo stałe są czytane wewnątrz funkcji); limity leveli 10-59 zduplikowane (discover dopuszcza 60).
- `parseBuild` (`web/custom.ts`) ciche mapowanie brakującego `pet` na `succubus`, nieznanego `rotation` na `demonology`.
- Bazowe buildy `DEMO_PACT_*` przy 3 mobach dają 20-32 kills/h (0 na levelach 20-28), więc obok wariantów `_PET` wyglądają na dużo gorsze w rankingach.
