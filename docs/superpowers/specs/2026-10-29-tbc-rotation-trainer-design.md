# TBC Rotation Trainer — projekt (spec)

Data: 2026-10-29
Status: do przeglądu przez autora

## 1. Cel

Osobista aplikacja webowa do ćwiczenia rotacji czarów w **WoW TBC Classic Anniversary**,
wzorowana na https://wow-forever-rotation.vercel.app/ (wersja dla WoW Forever).
Pierwszy spec: **Destruction Warlock**. Architektura od początku ma pozwalać na dokładanie
kolejnych klas i specjalizacji bez przepisywania silnika.

Kryterium sukcesu: użytkownik odpala 60-sekundową walkę z manekinem, gra rotację klawiszami
jak na action barze i dostaje wiarygodne wrażenie z gry (timing, GCD, DoT-y, cooldowny,
procki, mana) oraz wynik DPS. Aplikacja nie jest kalkulatorem DPS; liczby są przybliżone.

### Zakres (zdecydowany z autorem)

- Użytkownik: tylko autor. Bez kont, bez backendu, bez ruchu produkcyjnego.
- Zakres funkcjonalny: **pełna kopia** oryginału (patrz sekcja 5), realizowana etapami.
- **Bonusy setowe są wymaganiem od pierwszej wersji**, bo zmieniają DPS: symulacja uwzględnia
  bonusy 2/4-częściowe wynikające z liczby założonych itemów danego setu (modyfikatory obrażeń,
  staty, procki z szansą i wewnętrznym cooldownem, tymczasowe buffy).
- Dodatek spoza oryginału: porównanie wyniku z botem grającym idealną rotację oraz
  GCD uptime i uptime DoT-ów (możliwy do wycięcia, patrz sekcja 8).

### Czego oryginał dowodzi (obserwacje ze strony)

Obserwacje pochodzą z tekstowego pobrania strony, bez zrzutów ekranu; układ UI jest
interpretacją opisu.

- 60-sekundowa walka z manekinem, który nie atakuje; zakładki Game / Rotation / Damage / Log / Character.
- Zakładki specjalizacji: Raid buffs, Talents, Spellbook, Gear, Keybinds.
- Action bar z hotkeyami 1–=, Esc przerywa cast, Space lub pierwszy cast startuje walkę.
- Pasek many, tryb „Infinite mana", pasek buffów, debuffy na celu, armor celu.
- Lista priorytetów rotacji z podpowiedziami; DPS, suma obrażeń, licznik czasu.
- Spell queue, dispele, setup przed pullem (wg bannera zmian).

## 2. Architektura

Vite + React + TypeScript, czysty frontend (build statyczny). Silnik symulacji jest osobnym
modułem TS bez zależności od Reacta.

```
src/
  engine/            # czysty TS, zero Reacta
    sim.ts           # Simulation: stan walki, advanceTo(t), cast(spellId), cancelCast()
    events.ts        # kolejka zdarzeń (koniec castu, tick DoT, koniec CD, wygaśnięcie aury, regen)
    spell.ts         # wspólna logika: GCD, cast time, channel, koszt many, CD
    damage.ts        # tabela trafień (miss/hit/crit), współczynnik SP, mitygacja
    auras.ts         # buffy/debuffy: czas, stacki, odświeżanie, procki
    stats.ts         # ratingi -> %, staty wyliczone z CharacterSetup
    rng.ts           # RNG z seedem
    log.ts           # strumień zdarzeń walki
  data/
    common/          # konwersje ratingów lvl 70, raid buffy, debuffy celu, consumables, rasy
    classes/warlock/ # spells.ts, talents.ts, auras.ts, destruction.ts, rotation.ts
  ui/                # React: action bar, cast bar, panele, zakładki
  bot/               # automat grający wg listy priorytetów
tests/               # Vitest
```

Zasady podziału:

- Silnik zna tylko dane (obiekty deklaratywne) i hooki; nie zna UI ani zegara ściany.
- Nowa klasa = nowy katalog w `data/classes/<klasa>/`. Reguły specyficzne dla klasy
  (np. Backlash, Shadow Trance) są hookami dostarczanymi przez dane klasy.
- UI tylko czyta niemutowalny snapshot stanu i wysyła komendy `cast` / `cancelCast`.

## 3. Silnik

- **Czas wirtualny.** UI w pętli `requestAnimationFrame` wywołuje `sim.advanceTo(t)`.
  Testy i bot przeskakują całą walkę bez przeglądarki.
- **Zdarzenia.** Każda zmiana stanu to wpis w kolejce priorytetowej posortowanej po czasie
  (tie-break: kolejność wstawienia), co daje deterministyczne wyniki.
- **Pipeline spella:** warunki (mana, CD, GCD, trwa cast?) → cast time z hastem →
  rozstrzygnięcie trafienia (miss/hit/crit z seeda) → obrażenia = baza + SP × współczynnik,
  z modyfikatorami → aury, procki, DoT-y.
- **Spell queue.** Cast wciśnięty w oknie tuż przed końcem castu lub GCD trafia do kolejki.
  Szerokość okna to parametr (domyślną wartość trzeba zweryfikować dla Anniversary).
- **Mana:** reguła 5 sekund, regeneracja ze Spirit, Life Tap, flaga „Infinite mana".
- **Cel:** manekin z armorem i debuffami (np. Curse of the Elements, Improved Shadow Bolt),
  dispele w etapie 4.
- **Bonusy setowe i aury statystyk.** Bonus setowy jest daną (`SetBonusDef`): próg liczby itemów,
  modyfikatory spelli, bonusy do statystyk i opcjonalny hook (proc z `roll()` i wewnętrznym
  cooldownem wyrażonym jako ukryta aura). Aury gracza mogą dodawać staty i modyfikatory na czas
  trwania; staty pochodne są przeliczane przy nałożeniu, odświeżeniu i wygaśnięciu aury.
  Cast w toku zachowuje swój cast time, a DoT zapamiętuje spell power z chwili nałożenia
  (do potwierdzenia w źródłach TBC).
- **Interfejs:** wejście `cast(spellId)` / `cancelCast()`; wyjście: niemutowalny snapshot
  oraz strumień zdarzeń do logu. RNG zawsze z seedem.

## 4. Model danych

- Spell: `{id, nazwa, ikona, koszt, castTime, cd, school, współczynnik, baza, efekty[], hooks?}`.
- Talent, aura i buff opisane analogicznie, jako dane.
- `CharacterSetup` (rasa, staty z gearu, talenty, raid buffy, keybindy) zapisywany w
  `localStorage`; `stats.ts` liczy z niego staty końcowe (SP, crit, hit, haste, mana, regen).
- **Źródła i weryfikacja.** Przy każdej wartości liczbowej komentarz ze źródłem
  (wowsims/tbc-new dla Anniversary, wowsims/tbc lub Wowhead TBC). Wartości niezweryfikowane
  oznaczone `// UNVERIFIED`.
  Testy pinują kluczowe liczby (np. cast time Shadow Bolta po konkretnym haste).
  Specyficzne dla Anniversary rzeczy (spell queue, wersja patcha) wymagają potwierdzenia
  przed uznaniem za gotowe.
- Poziom postaci 70, cel: boss poziomu 73 (do potwierdzenia w danych: cap hit, mitygacja armoru).
- **Sety.** `CharacterSetup` zawiera `setPieces` (id setu → liczba założonych itemów); aktywne są
  bonusy, których próg jest nie większy od tej liczby (4 części zawiera też bonus 2-częściowy).
  Bonusy setów są w `data/classes/<klasa>/sets.ts`. `setPieces` jest zawsze **wyliczane z listy
  ID założonych itemów** (`ItemDef {id, name, slot, stats, setId?}`), także w etapie 1, żeby
  edytor i import gearu z etapu 2a nie wymagały zmian w silniku. Wartości bonusów
  weryfikowane jak reszta danych.
- **Gear i talenty jako dane użytkownika.** Gear = lista ID itemów (jeden na slot); staty to
  baza postaci + suma statów itemów. Zestawy BIS na każdą fazę są presetami (listy ID),
  import z WowSimsExporter wypełnia tę samą listę; talenty to preset „najlepsze talenty" na
  fazę, edytowalny w edytorze drzewka (etap 2b).

## 5. UI

- **Zakładki specjalizacji:** Raid buffs, Talents, Spellbook, Gear, Keybinds.
- **Zakładki walki:** Game, Rotation, Damage, Log, Character.
- **Game:** manekin z paskiem HP, debuffy na celu, pasek buffów, pasek many, cast bar,
  action bar z konfigurowalnymi hotkeyami, ekran „Start the fight" (Space lub pierwszy cast),
  DPS i licznik czasu na żywo, reset walki jednym klawiszem.
- **Rotation:** lista priorytetów z podświetleniem aktualnie wskazanego spella.
- **Damage:** podział obrażeń na spelle. **Log:** log zdarzeń.
- Desktop jest priorytetem; układ ma być używalny także na telefonie.
- Lista bonusów setowych spec z zaznaczeniem, które są aktywne przy bieżącym gearze.
- **Dodatek:** po walce wynik % idealnego bota, GCD uptime, uptime DoT-ów.

## 6. Testy

Vitest, deterministyczne seedy:

- czasy castów po hastcie, tickowanie DoT-ów, CD Conflagrate/Shadowburn, reguła 5 sekund,
  spell queue, procki;
- bot z listą priorytetów jako test integracyjny: idealna rotacja daje DPS w oczekiwanym
  przedziale (przedział ustalony po weryfikacji danych);
- brak testów wizualnych w etapie 1; UI sprawdzane ręcznie.

## 7. Etapy

Jeden spec, osobny plan implementacji i commit na etap:

1. Silnik + dane Destruction Warlocka + minimalne UI (walka grywalna), z bonusami setowymi.
   Gear to stała lista ID itemów z małej tabeli (staty, przynależność do setu); liczba części
   setu jest wyliczana z itemów, nie wpisywana ręcznie. Talenty: stały build.
   2a. Pełna baza itemów, zestawy BIS na każdą fazę i import gearu z addonu WowSimsExporter
   po ID itemów (zakładka Gear). **Zrobione** (panel Gear): specyfikacja
   `2026-10-30-gear-stage-2a-design.md`, plan `../plans/2026-10-30-gear-stage-2a.md`; dane,
   reguły i uproszczenia w `docs/data-sources.md`, „Part E: gear”.
   2b. Gotowe „najlepsze talenty" na fazę i edytor drzewka talentów (zakładka Talents).
   **Zrobione** (panel Talents): specyfikacja `2026-11-03-talents-stage-2b-design.md`, plan
   `../plans/2026-11-03-talents-stage-2b.md`; efekty talentów (24 zamodelowane, 40 z powodem),
   presety, import/eksport i uproszczenia w `docs/data-sources.md`, „Part I: talents”.
   2c. Keybindy konfigurowalne. (Raid buffy, consumables, zapis w `localStorage` i konfigurowalna
   rotacja zostały przeniesione do etapu 1.5: `2026-10-29-realism-and-setup-design.md`,
   razem z czasem lotu pocisków; wykonywane przed 2a/2b. Po etapie 1.5, też przed 2a/2b:
   aktywowane przedmioty na action barze (trinket, mikstury, runa; dzielone cooldowny) oraz
   długość walki i sekunda startu Heroism/Bloodlust w Setup:
   `2026-10-30-item-actions-and-fight-settings-design.md`.)
   2d. HUD ze scrolling combat text (w stylu MikScrollingBattleText): obrażenia, buffy, proce,
   mana i powiadomienia nad areną, z panelem „Combat text”. **Zrobione**: specyfikacja
   `2026-10-30-scrolling-combat-text-design.md`, plan `../plans/2026-10-30-scrolling-combat-text.md`;
   reguły i ustawienia w `docs/data-sources.md`, „Part G: combat text HUD”.
   2e. Symulator wielu walk (średni DPS ± σ, błąd standardowy, percentyle, histogram; Web Worker)
   i konfigurowalne reguły użycia przedmiotów i consumables przez bota (nowy element, poza
   pierwotną listą). **Zrobione** (panel Simulator, edytor „Item use” w Setup → Rotation):
   specyfikacja `2026-11-02-simulator-design.md`, plan `../plans/2026-11-02-simulator.md`;
   reguły, statystyki i koszty w `docs/data-sources.md`, „Part H: simulator and item-use rules”.
3. Zakładki Rotation, Damage, Log, scoring i bot.
4. Dispele, setup przed pullem, scenariusze (np. limitowana mana).
5. Kolejne klasy i speki, po jednym na raz (w tym wariant Fire dla Destruction Warlocka); dla
   każdej dochodzą jej zestawy BIS na fazy, gotowe talenty i bonusy setowe.

## 8. Ryzyka i pytania otwarte

- **Poprawność danych TBC** jest największym ryzykiem (współczynniki, ticki, talenty,
  konwersje ratingów, reguła 5 sekund). Mitigacja: sekcja 4, oznaczenia `UNVERIFIED`.
- Konkretna lista priorytetów rotacji (build Shadow vs Fire, dobór klątwy) zostanie ustalona
  w etapie 1 na podstawie zweryfikowanych źródeł, nie z oryginału (oryginał jest pod inną wersją gry).
- Domyślny gear etapu 1 (lista ID itemów) proponuję z presetów BIS najwcześniejszej fazy
  Anniversary i pokazuję autorowi do akceptacji przed zakodowaniem.
- **Format eksportu WowSimsExporter** (pola, gemy, enchanty) nie jest mi znany; potrzebna jest
  próbka eksportu autora na początku etapu 2a. Jeśli gemy/enchanty nie wchodzą do eksportu,
  staty liczone są z samych itemów.
- **Gemy, enchanty i efekty itemów.** Eksport zawiera ID gemów i enchantów, więc staty liczone
  są z itemów, gemów (z bonusami socketów i wymaganiami meta gema) i enchantów. Efekty
  on-use/proc itemów (trinkety, bronie) **nie są modelowane w etapie 1** (lista w
  `docs/data-sources.md`, „Not modeled"); zaniżają DPS względem gry i są kandydatem na
  późniejszy etap.
- **Źródło danych o itemach i presetach.** wowsims/tbc jest porzucone; dla Anniversary
  sprawdzam wowsims/tbc-new (licencja do potwierdzenia przy użyciu danych) oraz Wowhead TBC.
  Struktura i format ich presetów/bazy itemów jeszcze niezweryfikowane.
- Dodatek ze scoringiem względem bota można wyciąć bez wpływu na resztę.
- Bonusy setowe: nie znam z pamięci ich wartości ani zasad (procenty, procki, wewnętrzne
  cooldowny), więc każdy trafia do `docs/data-sources.md` ze źródłem.
- Oryginał analizowany bez zrzutów ekranu; szczegóły wyglądu mogą się różnić od intencji autora
  i będą korygowane po pierwszym uruchomieniu.
- Wartość `localStorage` jest per przeglądarka; brak synchronizacji między urządzeniami (świadomie).
