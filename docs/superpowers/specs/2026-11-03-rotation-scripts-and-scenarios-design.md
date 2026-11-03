# Skrypty rotacji z warunkami (if), scenariusze (zapis, import, eksport) i porównywanie — projekt (spec)

Data: 2026-11-03
Status: zatwierdzony przez autora ("rozpisz plan/specke i rozpocznij implementację", po zakończeniu bieżącego
etapu 2b); decyzje poniżej to rekomendacje domyślne do poprawienia w dowolnym momencie
Uzupełnia: `docs/superpowers/specs/2026-11-02-simulator-design.md` (symulator i reguły użycia consumables).

## 1. Cel

Dzisiejszy konfigurator rotacji to stałe pola (curse, DoT-y, finisher, próg Life Tap) i proste reguły użycia
przedmiotów. Autor chce **złożone narzędzie do budowania scenariuszy**, żeby szukać najlepszej rotacji, np.:

> "Użyj trinketa 1, gdy działa Heroism/Bloodlust ORAZ aura podatności na cień (Improved Shadow Bolt z Shadow
> Boltów); dopiero potem użyj trinketa 2."

Do tego scenariusze trzeba **zapisywać, importować i eksportować**, tak żeby można było poprosić agenta AI o
przygotowanie scenariusza do sprawdzenia, i **porównywać scenariusze** w symulatorze na tych samych ziarnach.

## 2. Zakres

### A. Skrypt rotacji (lista reguł z warunkami)

Skrypt to uporządkowana lista reguł (lista priorytetów w stylu APL; pierwsza reguła, której warunek jest
prawdziwy i której akcja da się wykonać, wygrywa; akcja odrzucona przez silnik, np. cooldown, przepuszcza do
następnej reguły, jak dziś w bocie):

- **Akcje:** `cast` (czar po id), `use` (akcja przedmiotu po id wpisu katalogu, np. `item:29370`,
  `destruction-potion`), `wait` (nic nie rób w tym kroku, gdy warunek prawdziwy: do wstrzymywania czarów),
  opcjonalnie `label`/`comment`, `enabled`.
- **Warunki** jako **wyrażenia tekstowe** w polu `if` (kanoniczna, zwięzła forma, przyjazna dla agenta AI i
  człowieka) z wewnętrznym AST (parser i drukarka, round-trip). Składnia: `&&`, `||`, `!`, nawiasy, porównania
  `== != < <= > >=`, liczby, napisy w apostrofach, stałe `true/false`. Wartości (zmienne), wszystkie jako czyste
  funkcje stanu walki:
  - czas: `time.elapsed` (s), `time.remaining` (s), `time.elapsedMs`;
  - zasoby: `mana`, `mana.pct`, `mana.missing`, `mana.max`;
  - gracz: `self.aura.<id>.active`, `.remaining` (s), `.stacks`, `.charges`;
  - cel: `target.aura.<id>.active`, `.remaining`, `.stacks` (np. `target.aura.shadow-vulnerability.active` =
    aura Improved Shadow Bolt; `target.aura.immolate.remaining < 2`);
  - cooldowny i czary: `cd.<id>.ready`, `cd.<id>.remaining` (s), `cast.<id>.count` (ile razy ukończono),
    `use.<id>.count` (ile razy użyto akcji przedmiotu), `casting` (id trwającego czaru lub pusty),
    `casting.<id>`, `inflight.<id>` (pocisk w locie), `gcd.remaining`;
  - stałe skrótowe: `heroism.active` (aura Heroism/Bloodlust gracza), `heroism.over` (Heroism skończył się albo
    nie jest zaplanowany), `fight.last(N)` (ostatnie N sekund; funkcja) oraz `has(<id>)` (czar/akcja dostępna w
    buildzie i gearze);
  - nazwane warunki: sekcja `defs` (`"defs": { "burst": "heroism.active && target.aura.shadow-vulnerability.active" }`,
    użycie `$burst`), bez rekurencji (cykle wykrywane).
  - Warunki nie mają pętli ani efektów ubocznych; głębokość ≤ 20, długość ≤ 500 znaków, ≤ 200 reguł, ≤ 50 defs.
- **Sekwencje** wyrażone warunkami na licznikach: "trinket 2 po trinkecie 1" to `use.item:29370.count >= 1` itd.
  Nic poza tym nie jest potrzebne (brak stanu ukrytego): jedyny stan bota to dane z silnika (liczniki ukończonych
  castów i użyć akcji dochodzą do snapshotu jako dodatek tylko do odczytu).
- **Tryb podstawowy** (obecne pola konfiguratora) zostaje. Przycisk **"Convert to script"** zamienia go w
  równoważny skrypt, który daje **dokładnie ten sam przebieg** (logi, średnie, losowania: test); odwrotnie nie (skrypt
  jest silniejszy). Gdy skrypt jest aktywny, zastępuje całą listę priorytetów; zawartość trybu podstawowego jest
  wtedy tylko podpowiedzią (nieaktywna, wyszarzona).
- Walidacja: błędy składni z pozycją (`rules[2].if: pozycja 14: oczekiwano ')'`), nieznane id czaru/aury/akcji jako
  **ostrzeżenia** z podpowiedzią najbliższego id (skrypt zostaje poprawny, reguła jest nieaktywna); nigdy cicho.

### B. Scenariusze (zapis, import, eksport)

- **Scenariusz** = plik JSON (`format: "rotation-trainer.scenario"`, `version: 1`): `name`, `description`,
  `author` (opcjonalnie), `script` (reguły + defs), opcjonalnie `setup` (gear, talenty, buffy, długość walki,
  dystans, opcje; ten sam kształt co zapis setupu, normalizowany), opcjonalnie `simulation` (`runs`, `seed`),
  `notes`. Wersjonowany, z `$schema` wskazującym dołączony **JSON Schema** (`docs/scenario.schema.json`).
- **Biblioteka scenariuszy** w przeglądarce (`localStorage`, osobny klucz `rotation-trainer:scenarios:v1`, limit
  rozmiaru i liczby: do 100 scenariuszy): nowy, duplikuj, zmień nazwę, usuń, zastosuj (rotacja i opcjonalnie
  setup, z potwierdzeniem co zostanie zastąpione), eksportuj (kopiuj JSON / pobierz plik), importuj (wklej tekst lub
  wybierz plik; raport walidacji: błędy blokują, ostrzeżenia nie; podgląd przed zapisem).
- **Dla agentów AI:** dokument formatu `docs/scenario-format.md` (składnia warunków, lista zmiennych i id, przykłady),
  JSON Schema, kilka przykładowych scenariuszy w `docs/scenarios/*.json`, oraz walidator wiersza poleceń
  `npm run scenario:validate -- plik.json` (czytelne błędy ze ścieżkami, kod wyjścia 1 przy błędach) i
  `npm run scenario:run -- plik.json --runs 1000 --seed 1` (uruchamia symulację i drukuje wynik: średnia, σ,
  SEM, przedział ufności), żeby agent mógł sam sprawdzić scenariusz bez przeglądarki.

### C. Porównywanie scenariuszy

- Panel "Compare": wybór 2–5 scenariuszy (z biblioteki lub bieżący), liczba przebiegów i ziarno; **te same ziarna
  na każdy numer przebiegu** (wspólne liczby losowe), więc różnice są sparowane; tabela: średni DPS ± σ, SEM,
  **Δ DPS względem pierwszego (bazowego) ± błąd standardowy różnic sparowanych**, 95% CI różnicy i prosty werdykt
  ("różnica istotna" gdy CI różnicy nie obejmuje 0, z zastrzeżeniem), ranking; histogramy obok siebie;
  liczba odpaleń każdej reguły (ile razy wygrała) w średniej na walkę, żeby widać było, co skrypt faktycznie robi.
- Rdzeń symulatora raportuje `ruleFires` per reguła (średnia liczba odpaleń na walkę) także dla pojedynczego
  uruchomienia.

**Poza zakresem (kolejne kroki):** automatyczny optymalizator/przeszukiwanie parametrów (np. sweep sekundy startu
trinketa), pętle i zmienne mutowalne w skryptach, własne funkcje, współdzielenie przez URL/serwer, ruch/zasięg,
wiele celów.

## 3. Zasady i bezpieczeństwo

- Skrypt to **dane**, nie kod: parser własny, bez `eval`/`Function`, bez dostępu do niczego poza wartościami z listy;
  wyrażenia kompilowane do zamknięć raz; koszt oceny ograniczony (brak pętli).
- Warunki są czystymi funkcjami snapshotu (z licznikami): wymóg optymalizacji kroków bota (bot pomija kroki, w
  których żadne naciśnięcie nie może zostać przyjęte) zostaje spełniony; test równoważności z pełnym stepowaniem
  dla losowych skryptów.
- Dodatki do silnika: tylko odczyt (liczniki ukończonych castów i użyć akcji w snapshocie); bez zmiany zachowania
  i logów.
- Wejścia (JSON z `localStorage`, import wklejony, plik) są nieufne: limity rozmiaru (plik ≤ 200 000 znaków),
  głębokości i liczby reguł; odporność na `__proto__`; nigdy nie rzucają; stare/obce wersje formatu dają czytelny
  błąd.
- Wynik pojedynczego przebiegu skryptu równa się wynikowi tej samej walki w grze z tym ziarnem (grywalna walka
  używa tego samego kompilatora skryptu dla bota/podpowiedzi; człowiek gra ręcznie).

## 4. Ryzyka

- Złożoność interfejsu (kreator warunków): wersja 1 = lista reguł + pole tekstowe warunku z podświetlaniem
  błędów i podpowiedziami (lista zmiennych z wyszukiwaniem), a nie w pełni wizualny edytor drzew; kreator
  wizualny jako dodatek tam, gdzie tani (wybór akcji, id czarów/aur z list).
- Równoważność "Convert to script" ze starą rotacją (kluczowa: testy złote).
- Interpretacja wyników porównań (istotność statystyczna, wielokrotne porównania): opisać w panelu.
- Wydajność: koszt oceny warunków na krok bota (kompilacja zamknięć; pomiar; cel nie gorszy niż ~1,5 ms na
  przebieg dla typowego skryptu).
