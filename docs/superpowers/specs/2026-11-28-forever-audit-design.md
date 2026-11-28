# Rewizja symulatora Forever: audyt, poprawki i weryfikacja (nocny przebieg)

Data: 2026-11-28. Gałąź robocza: `claude/youthful-hopper-op9tox`.

## 1. Cel i powód

Wersja 1.0 symulatora Forever (zakładka Forever: `src/forever/`, `src/ui/forever/`) jest gotowa.
Teraz szukamy błędów logicznych i niespójności (talenty, czary, pety, Life Tap, sprzęt, rotacje,
spójność trybów liczenia), które sprawiają, że wyniki symulacji odbiegają od prawdy.

Przebieg ma być **autonomiczny i nocny**: właściciel uruchamia plan i wraca rano. Agenci nie mogą
czekać na odpowiedzi, więc wszystkie reguły decyzyjne są zapisane tutaj.

## 2. Zakres

W zakresie: `src/forever/**` (silnik, dane JSON, discover, ep, web), `src/ui/forever/**`,
`scripts/forever-*.ts`, `tests/forever/**`, `tests/ui/forever/**`, `docs/forever-data-ledger.md`.

Poza zakresem: trener TBC (`src/engine`, `src/bot`, `src/scenarios`, UI trenera), zmiany wyglądu UI,
nowe funkcje. Błąd znaleziony poza zakresem trafia do raportu jako uwaga, bez poprawki.

## 3. Cele, nie-cele, anty-cele

**Cele**
- Znaleźć rozbieżności między tym, co mówią czary i talenty (ledger, Wowhead Forever), a tym, co liczy kod.
- Znaleźć niespójności między ścieżkami liczenia (duel, run, discover, EP, custom, import z addonu, UI).
- Naprawić potwierdzone błędy testem, który wcześniej padał.
- Dać poranny raport, z którego widać, jak zmieniły się wyniki i dlaczego.

**Nie-cele**
- Strojenie parametrów `verify: true` pod "ładniejsze" wyniki.
- Refaktoryzacja i porządki bez związku z poprawnością wyników.

**Anty-cele (porażka, nawet jeśli testy są zielone)**
- Zmiana liczb w danych bez jednoznacznego potwierdzenia w ledgerze lub źródle.
- Wyłączone, pominięte lub osłabione testy; przepisana historia gita.
- Poprawka bez testu regresyjnego, albo "poprawka" niepotwierdzona dowodem.

## 4. Źródło prawdy i reguły decyzyjne

1. Źródłem prawdy są `docs/forever-data-ledger.md` (część "Confirmed" i "Conflicts") oraz źródła w nim
   wskazane (Wowhead Forever, wiki, poradniki). Opisy talentów to `src/data/classes/warlock/talentDescriptions.json`
   i pole `source` w `talents.json`.
2. Gdy kod jest sprzeczny z potwierdzonym wpisem: to błąd, poprawiamy kod.
3. Gdy źródła się różnią, danych brak, albo wartość jest `verify: true`: **nie zmieniamy**. Wpis trafia do
   sekcji "Decyzje dla właściciela" raportu z opcjami i rekomendacją.
4. Zmiana wartości w danych jest dozwolona tylko wtedy, gdy ledger ją jednoznacznie potwierdza, a obecna
   wartość jest od niego różna (np. literówka, błędny rank). Wpis o zmianie dodajemy do ledgera.
5. Agenci nie mają dostępu do pomiarów z gry. Pomiary użytkownika (jeśli się pojawią) są poza tym przebiegiem.

## 5. Podejście (wybrane: fazy sekwencyjne, wewnątrz faz równolegle)

Rozważane: (B) jeden audytor na całość: wolny i ryzykuje pominięcia; (C) rewizja i poprawki naprzemiennie:
poprawki w jednym obszarze unieważniają wnioski w innym, trudny nadzór. Wybrane (A) daje pełną listę przed
pierwszą zmianą, a orchestrator widzi konflikty plików z góry.

### Faza 0: baza
Orchestrator: `npm ci` jeśli trzeba, `npm run typecheck`, `npm test`. Zapisuje stan wyjściowy (liczba
testów, wyniki). Jeśli baza jest czerwona, to jest to pierwsza pozycja raportu, a przebieg nie zmienia
niczego, co dotyka padających testów. Zapisuje **snapshot przed**: stałe polecenia z ziarnem 1
(`forever:duel`, `forever:run`, `forever:ep`, `forever:discover` w trybie szybkim) do
`docs/superpowers/reports/forever-audit/before/`.

### Faza 1: rewizja (agenci tylko do odczytu, równolegle)
Pięciu audytorów, każdy z własnym obszarem i checklistą:

| ID | Obszar | Pliki | Co sprawdza |
|---|---|---|---|
| A1 | Silnik walki | `fight.ts`, `runner.ts`, `ltpolicy.ts`, `rotations.ts`, `rotation-spec.ts`, `rotation-genes.ts` | kolejność zdarzeń, GCD, czas rzucania i Bane, kanałowanie (Drain, Wrack), tiki DoT i ich snapshoty, przerwy na jedzenie i picie, polityka Life Tapa, przenoszenie many i HP między pullami, Nightfall |
| A2 | Czary i staty | `spells.json`, `spells.ts`, `stats.ts`, `levels.json`, `classic_base.json`, `params.json` | rangi i levele dostępności, mana, SP mod, krytyki i hit (limity), regeneracja many i Spirit, skalowanie z levelem, flagi `verify` vs ledger |
| A3 | Talenty | `talents.json`, `talents.ts`, `effects.ts`, `builds.ts` | każdy zamodelowany talent: czy efekt działa na właściwe czary, ranga i stos, kolejność 51 punktów, perk legacy, respec; talenty oznaczone jako niezamodelowane: czy powód jest nadal prawdziwy |
| A4 | Pety i buildy | `builds.json`, pet w `fight.ts`, `demon-standin`, Demonic Sacrifice/Pact/Brand/Knowledge, Master Demonologist, Soul Link, zdrowie peta | obrażenia i mana peta, buffy od talentów i klątw, regeneracja i Health Funnel, warianty `_NOCOE`, spójność buildów z ich opisami |
| A5 | Spójność ścieżek | `duel.ts`, `compare.ts`, `ep.ts`, `sensitivity.ts`, `optimizer.ts`, `discover/**`, `web/**`, `gear.ts`, `src/ui/forever/**` | czy ten sam build, level i ziarno dają ten sam wynik w duel, run, EP, discover i UI; import sprzętu i talentów z addonu; zaokrąglenia i jednostki; statystyka (przedziały, parowanie ziaren) |

Reguły audytora:
- Czyta kod **i** źródło (ledger, opisy), nie tylko jedno z nich. Każdy finding ma dowód: `plik:linia` oraz
  cytat ze źródła lub odtworzenie (krótki skrypt w scratchpadzie z wynikiem).
- Nie zmienia kodu w repo. Skrypty tymczasowe tylko w scratchpadzie.
- Findings zapisuje do `docs/superpowers/reports/forever-audit/findings/<ID>.md` w formacie z sekcji 6.
- Pozycje niepewne oznacza `status: needs-owner` (nie próbuje ich "rozstrzygać").
- Kończy listą "sprawdzone i w porządku" (żeby było widać pokrycie).

### Faza 2: dedup i plan poprawek (orchestrator)
1. Łączy findings, usuwa duplikaty, odrzuca te bez dowodu (`status: rejected`, z powodem).
2. Odtwarza każdy `high` samodzielnie (uruchamia skrypt dowodowy), zanim trafi do poprawek.
3. Dla każdego potwierdzonego findingu wyznacza **listę plików, które poprawka dotknie**, i buduje graf:
   poprawki o rozłącznych plikach tworzą fale równoległe; poprawki o wspólnych plikach, albo takie, gdzie jedna
   zmienia wynik drugiej (np. zmiana Life Tapa i zmiana regeneracji many), idą sekwencyjnie w kolejności
   wagi, potem zależności.
4. Zapisuje `fix-plan.md`: fale, kolejność, agent per poprawka, kryterium zakończenia.

### Faza 3: poprawki (agenci wykonawczy)
- Jeden agent na jeden finding (lub spójną grupę o tych samych plikach), każdy w osobnym worktree
  rozgałęzionym od aktualnej gałęzi roboczej.
- Test-first: najpierw test regresyjny, który pada na obecnym kodzie, potem poprawka, potem pełne
  `npm run typecheck` i `npm test`.
- Commit per poprawka, komunikat `fix(forever): <co>`, odwołanie do ID findingu. Orchestrator scala falę
  po fali (merge do gałęzi roboczej) i po każdej fali uruchamia pełne testy.
- Limit: 3 próby naprawy. Po trzeciej nieudanej poprawka jest wycofana (worktree porzucony), finding dostaje
  `status: failed` z opisem w raporcie. Nie blokuje to kolejnych fal, chyba że od niej zależą (wtedy też `skipped`).
- Poprawka, która zmienia wyniki symulacji, musi w opisie commita podać oczekiwany kierunek zmiany.
  Dane (JSON) wolno zmieniać tylko zgodnie z regułą 4 z sekcji 4.

### Faza 4: weryfikacja końcowa
1. `npm run typecheck`, `npm test`, `npm run build`: wszystko zielone (inaczej raport to mówi wprost).
2. Snapshot **po** na tych samych poleceniach i ziarnach co przed; tabela różnic przed/po.
   Każda istotna różnica musi być wyjaśniona przez któryś z naprawionych findingów; niewyjaśniona różnica
   to alarm w raporcie i kandydat do wycofania odpowiedniej poprawki.
3. Niezależny przegląd diffa całej nocy (agent przeglądający, który nie pisał poprawek) pod kątem:
   poprawki bez testu, zmiany danych bez ledgera, osłabione testy, zmiany poza zakresem.
4. Spójność ścieżek (A5 ponownie, wąsko): ten sam build/level/ziarno daje ten sam wynik w duel, run, EP,
   discover (test lub skrypt dołączony do repo).
5. Aktualizacja `docs/forever-data-ledger.md` o wszystkie zmiany danych i nowe konflikty.

## 6. Format findingu

```
id: A3-007
obszar: A3
waga: high | medium | low
status: confirmed | rejected | needs-owner | fixed | failed | skipped
tytuł: <jedno zdanie>
dowód: <plik:linia, cytat ze źródła, wynik odtworzenia>
oczekiwane vs rzeczywiste: <liczby lub zachowanie>
wpływ na wyniki: <które buildy/levele, kierunek, szacunkowa skala>
proponowana poprawka: <opis>
pliki do zmiany: <lista>
zależy od / koliduje z: <ID>
```

Waga: **high** = zmienia ranking buildów lub wyniki o więcej niż szum (>1% zabić/h) na wielu levelach;
**medium** = zmienia wynik w węższym przypadku; **low** = kosmetyka, jednostki, etykiety UI.

## 7. Raport poranny (`docs/superpowers/reports/forever-audit/REPORT.md`)

1. Podsumowanie w 10 zdaniach: co znaleziono, naprawiono, wycofano, czeka na decyzję.
2. Tabela findingów (ID, waga, status, commit).
3. Tabela przed/po (zabicia/h, DPS-owe odpowiedniki, ranking buildów na levelach 40, 50, 59) z wyjaśnieniem.
4. **Decyzje dla właściciela** (rozbieżne źródła, `verify: true`, `needs-owner`): opcje i rekomendacja.
5. Poprawki wycofane i dlaczego.
6. Uwagi spoza zakresu.
7. Pokrycie: co audytorzy sprawdzili i uznali za poprawne.

## 8. Ograniczenia operacyjne (całonocne)

- Praca na gałęzi `claude/youthful-hopper-op9tox`; push tylko tam; **bez PR-a**.
- Brak pytań do użytkownika: wątpliwość = wpis do raportu.
- Brak narzędzi sieciowych poza tym, co już jest w repo; źródła czytane z ledgera i dokumentów w repo.
  Agent może próbować odświeżyć źródło z sieci, ale wynik bez potwierdzenia dwoma źródłami nie zmienia danych.
- Długie polecenia (discover) uruchamiane w trybie szybkim lub z ograniczoną liczbą sesji; ta sama konfiguracja przed i po.
- Orchestrator co fazę zapisuje stan w `docs/superpowers/reports/forever-audit/STATE.md`
  (żeby przerwany przebieg dało się wznowić).
- Żadnych zmian poza zakresem z sekcji 2.

## 9. Co zostaje wykonawcom (moje wybory do sprawdzenia)

- Dokładne polecenia i ziarna do snapshotów przed/po (propozycja: ziarno 1, levele 40, 50, 59,
  profile `average`, 100 sesji; discover z `--level 40` w trybie szybkim).
- Podział pracy w fazie 3 na agentów, zależnie od grafu zależności.
- Próg "istotnej różnicy" przed/po: domyślnie przedział ufności 95% z parowania ziaren.
- Nazwy plików testów regresyjnych: obok istniejących w `tests/forever/`.
