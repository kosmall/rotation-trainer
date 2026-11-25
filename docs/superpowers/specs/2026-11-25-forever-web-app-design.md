# WoW Forever: aplikacja web symulatora (spec do akceptacji)

Data: 2026-11-25. Status: **czeka na akceptację użytkownika**, nic nie jest zaimplementowane.

## Cel

Przeglądarkowa aplikacja, w której użytkownik ustawia **aktualny level postaci** (40–59), uruchamia symulację
i dostaje wyniki: ranking buildów, ich rotacje, rozdanie talentów oraz porównania buildów i rotacji.
Silnik to istniejący `src/forever/` (bez zmian w logice), UI jest nowym trybem w istniejącej aplikacji React.

## Decyzje projektowe

1. **Integracja:** nowa trasa w istniejącym routerze hash (`#/forever`, `#/forever/builds`, `#/forever/rotations`,
   `#/forever/compare`), ładowana leniwie. Trener TBC zostaje w aplikacji (zamrożony), ale domyślną trasą
   po wejściu staje się Forever. Ten sam motyw (dark/light), te same wykresy (`LineChart`, `Histogram`).
2. **Obliczenia w Web Workerze** (`src/forever/web/worker.ts`) z paskiem postępu i przyciskiem Anuluj,
   wzorem `src/sim-runner/worker.ts`; fallback na głównym wątku, gdy Worker niedostępny.
   Wyniki: seed stały (domyślnie 1), więc ten sam level daje te same liczby; pole „seed" w opcjach zaawansowanych.
3. **Jedno główne ustawienie: level postaci.** Opcje zaawansowane (zwinięte): profil sprzętu (quest/average/good),
   liczba mobów na pull (1/2), profil Life Tapa (USER/BEST_1MOB/BEST_2MOB/DEMO_1MOB), liczba sesji, seed.
4. **Zakres symulacji:** wszystkie 7 buildów (warianty z `builds.json`) na wybranym levelu, wspólne seedy
   (porównanie sparowane). Na żądanie: wykres „level 40–59" (krzywa kills/h po levelach) dla wybranych buildów.
5. **Dane statyczne:** buildy i rotacje czytane z tych samych JSON-ów co CLI; brak backendu, wszystko po stronie klienta.

## Ekrany

- **Symulacja (`#/forever`)**: pole level (suwak + liczba), przycisk „Uruchom", postęp. Po zakończeniu:
  tabela rankingowa buildów (kills/h, TTK, mana/HP na zabicie, picie/jedzenie/Life Tap s na zabicie,
  udział przestojów, przerwy/h, zgony/h, wykorzystanie GCD) z zaznaczonym najlepszym i różnicą wobec niego
  z przedziałem ufności; wykres słupkowy kills/h; ostrzeżenie o liczbie założeń `verify:true`.
- **Buildy (`#/forever/builds`)**: lista buildów; dla wybranego: rozdane punkty na wybranym levelu
  (drzewa Affliction/Demonology/Destruction, kolejność punktów), moment respeca, perk legacy.
- **Rotacje (`#/forever/rotations`)**: lista priorytetów danej rotacji (affliction/demonology/fire, fallback),
  z liczbą rzutów każdego czaru na zabicie (z symulacji) oraz oś czasu przykładowej walki (Lanes).
- **Porównanie (`#/forever/compare`)**: wybór dwóch buildów (i opcjonalnie rotacji) → pojedynek sparowany:
  różnica kills/h, TTK, mana/HP, picie, przedział 95%, werdykt słowny; wykres „level 40–59" obu buildów.
- **Założenia**: panel z listą parametrów `verify:true` (źródło, wartość), żeby wyniki nie sprawiały wrażenia
  pewniejszych, niż są.

## Architektura

- `src/forever/web/api.ts`: czyste funkcje bez DOM (`runLevel(level, opts, onProgress)`, `runDuel(a, b, level, opts)`,
  `runLevelSweep(builds, opts)`) opakowujące `compareBuilds`, `duelBuilds`, `runCell`; testowalne w vitest (node).
- `src/forever/web/worker.ts` + `client.ts`: protokół run/progress/result/error/cancel.
- `src/ui/forever/`: `ForeverApp.tsx`, `SimView.tsx`, `BuildsView.tsx`, `RotationsView.tsx`, `CompareView.tsx`,
  `AssumptionsPanel.tsx`, hook `useForeverRun`. Router: nowe tryby w `src/ui/shell/router.ts`, zakładki w `AppShell`.
- Brak nowych zależności.

## Testy i weryfikacja

- vitest (node): `api.ts` zwraca te same liczby co `compareBuilds` dla tego samego seeda; anulowanie; sweep.
- vitest (jsdom, `tests/ui/forever/`): renderowanie ustawień, uruchomienie na stubie klienta, tabela i ranking,
  przełączanie tras, dostępność (role, etykiety).
- Ręcznie: `npm run build`, podgląd w Playwright (screenshot 1440 i 390), brak błędów w konsoli.
- README: sekcja „Aplikacja web" z komendami `npm run dev` / `npm run build`.

## Poza zakresem (na razie)

Edytor własnych buildów, import z gry, zapis scenariuszy, kalibracja danych w UI, trener rotacji dla Forever.

## Ryzyka

- Czas obliczeń: pełny ranking na jednym levelu to kilka–kilkadziesiąt sekund w Workerze; sweep 40–59 dłużej,
  więc jest osobnym, jawnym przyciskiem z postępem.
- Wyniki zależą od niepewnych założeń (HP mobów, sprzęt); UI zawsze pokazuje ostrzeżenie i link do panelu założeń.
