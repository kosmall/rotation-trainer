# Symulator (wiele przebiegów, średni DPS ± odchylenie) i reguły użycia consumables — projekt (spec)

Data: 2026-11-02
Status: do realizacji (autor: "zaplanujmy to a potem zabierzesz się za implementację"); decyzje projektowe poniżej
są rekomendacjami przyjętymi domyślnie, do poprawienia przez autora w dowolnym momencie.
Uzupełnia: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (nowy element, poza listą etapów).

## 1. Cel

Dziś jedna walka daje jedną wartość DPS, mocno zależną od losu (krytyki, pudła, procki). Autor chce **symulator**:
algorytm wykonuje **X symulacji** (X z argumentu), z **wybraną rotacją** i **wybranym gearem (EQ)**, i pokazuje
**średni DPS ± odchylenie od średniej**. Rotacja musi być w pełni konfigurowalna, w tym **kiedy użyć consumables i
cooldownów** (mikstury, runy, trinkety), bo to one decydują o wyniku.

## 2. Zakres

### A. Konfigurator użycia consumables i cooldownów (część rotacji)

Dziś reguły użycia przedmiotów są stałe (`itemRules.ts`: "przy Heroism albo na pullu, mana-itemy po progu"). Nowe:
`SetupConfig.rotation.itemUse`: mapa `id wpisu → reguła użycia` dla każdej akcji przedmiotu (Destruction Potion,
Super Mana Potion, Dark Rune, trinkety on-use z gearu), oraz dla Heroism/Bloodlust (już ma sekundę startu, bez
zmian). Reguła ma **wyzwalacz** i opcjonalne **okno czasu**:

- wyzwalacze: `ready` (jak tylko dostępny, domyślne dla większości), `pull` (tylko na starcie), `at` (od sekundy
  N walki), `with-heroism` (gdy działa Heroism), `with-buff` (gdy działa wskazany buff gracza, np. inny trinket),
  `mana-below` (gdy mana poniżej progu, w many lub procentach), `mana-missing` (gdy brakuje ≥ N many: runy i Super
  Mana Potion), `fight-end` (w ostatnich N sekundach), `never` (wyłączony);
- okno: `notBeforeSec` / `notAfterSec` (opcjonalne), `minGapSec` (minimalny odstęp od poprzedniego użycia);
- kolejność: kroki przedmiotów stoją przed czarami (są bez GCD), w kolejności listy katalogu; priorytet można zmienić
  strzałkami w liście (kolejność reguł zapisana w `itemUseOrder`).
- domyślne reguły odtwarzają dzisiejsze zachowanie bota **dokładnie** (te same logi i średnie przy domyślnym i
  zapisanym setupie); stare zapisy bez `itemUse` dostają domyślne.
- Rotacja (curse, Immolate, Corruption, Shadowburn, próg Life Tap) zostaje jak jest; `itemUse` dochodzi do niej.

### B. Symulator

- **Wejście:** liczba przebiegów `runs` (1–100 000, domyślnie 1000), ziarno bazowe `seed` (domyślnie losowe,
  można wpisać), okno kolejki czarów (z ustawień, domyślnie jak w grze), pełny `SetupConfig` (gear, buffy,
  consumables, rotacja z `itemUse`, długość walki, dystans, opcje warlocka). Bot gra rotację wg konfiguracji.
- **Wynik:** średnia DPS, **odchylenie standardowe σ** (próbkowe, n−1) i **błąd standardowy średniej** σ/√n z
  przedziałem ufności 95%, min/max, mediana i percentyle (5/25/75/95), histogram DPS, średnie obrażenia i
  udział per czar (bezpośrednie i ticki), średnia liczba użyć przedmiotów, uptime wybranych DoT-ów i buffów,
  średnia zużyta mana i liczba Life Tapów.
- **Determinizm:** przebieg `i` używa ziarna `seed + i` (deterministyczny miks), więc ten sam wynik przy tych samych
  danych niezależnie od liczby wątków i podziału na porcje; wynik zawiera użyte `seed` i `runs`.
- **Wykonanie:** w Web Workerze (UI nie zamarza), porcjami z postępem i anulowaniem; fallback bez workera (testy,
  stare przeglądarki): porcje w głównym wątku przerywane przez `setTimeout`. Liczenie statystyk przyrostowo
  (algorytm Welforda), bez trzymania tysięcy logów.
- **UI:** panel "Simulator" (zwijany, jak Setup/Gear): pole liczby przebiegów, seed, przycisk Run/Cancel, pasek
  postępu, wynik w tabeli i histogram; konfigurator reguł użycia consumables w sekcji Rotation panelu Setup;
  wynik opisany ustawieniami, z których powstał (nazwa presetu gearu i setupu); przycisk "Copy result".
- **Zakres wiarygodności:** model bez zdrowia, zasięgu i efektów niezamodelowanych (jak reszta aplikacji); wynik jest
  względny (porównywanie konfiguracji), nie bezwzględny; to ma być w opisie panelu.

**Poza zakresem:** optymalizator (automatyczny wybór najlepszej rotacji/gearu), porównanie dwóch konfiguracji obok
siebie (osobny krok, możliwy na tym samym rdzeniu), eksport CSV, wiele celów, ruch.

## 3. Reguły

- Silnik, dane i reguły gry nie zmieniają się; symulator to warstwa nad `Simulation` + bot + `applySetup`.
- Wynik pojedynczego przebiegu równa się wynikowi tej samej walki odtworzonej w grze z tym ziarnem (test).
- Brak zależności od zegara ściany w obliczeniach; `Math.random` tylko do wylosowania domyślnego ziarna w UI.
- Wejścia z UI i z `localStorage` są nieufne (normalizacja, limity: `runs` ≤ 100 000, czas jednego uruchomienia
  ograniczony anulowaniem), reguły `itemUse` normalizowane jak reszta setupu.

## 4. Ryzyka

- Wydajność: 100 000 walk po 60 s: cel < ~1 ms na przebieg po rozgrzaniu (zmierzyć); porcje i worker; limit `runs`.
- Zgodność botów: dziś jedna rotacja = jedna lista priorytetów; reguły `itemUse` muszą być czystymi funkcjami
  snapshotu (jak `when` w `PriorityStep`).
- Interpretacja ± : pokazywać jawnie, co oznacza (σ między walkami, a nie niepewność średniej) i dodać SEM.
