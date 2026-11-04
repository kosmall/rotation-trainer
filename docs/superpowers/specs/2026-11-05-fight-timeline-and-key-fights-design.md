# Podgląd walki sekunda po sekundzie (Timeline) i kluczowe walki z symulacji — projekt (spec)

Data: 2026-11-05
Status: zlecone przez autora ("podgląd walki w formie timeline … co w każdej sekundzie walki się działo (zadane dmg,
buff up/down, aury, consumesy itp.) … również podgląd dla kluczowych walk z symulacji (most/least dps, most avg)");
poniższe decyzje to rekomendacje domyślne.
Uzupełnia: `docs/superpowers/specs/2026-11-04-ui-redesign-design.md` (Report: zakładki Damage/Timeline/Log/Rotation) i
`docs/superpowers/specs/2026-11-02-simulator-design.md`.

## 1. Cel

Dziś Report → Timeline pokazuje tory (lanes) i wykres DPS, a Log listę zdarzeń. Brakuje widoku **"co działo się w
sekundzie N"**: zadane obrażenia (per czar, crit), czary rozpoczęte i ukończone, aury (zaaplikowane / zeszły, stacki),
użyte przedmioty i consumables, mana i Life Tap, odrzucone naciśnięcia kolejki, stan DoT-ów, a obok to samo dla
**kluczowych walk z symulacji**, żeby po logach wyciągać wnioski (dlaczego najgorsza walka jest o X DPS gorsza).

## 2. Zakres

### A. Wybór walki w Report ("Fight source")

- Selektor nad zakładkami Report: **Last played fight** (jak dziś) | **Simulation: Highest DPS** | **Simulation:
  Typical** | **Simulation: Lowest DPS** (aktywne, gdy w tej sesji jest wynik symulacji). **Typical** = walka o DPS
  najbliższy średniej (ties: mniejszy numer przebiegu). Każda opcja pokazuje DPS i ziarno ("seed 123456, run #412").
- Wybrana walka napędza **wszystkie** zakładki walki (Damage, Timeline, Log, Rotation) tym samym modelem raportu
  (`ReportModel`) co walka zagrana; "% of the bot" dla walki symulowanej = DPS tej walki / DPS bota z tym samym
  ziarnem (bot z tym samym setupem to ta sama walka, więc 100% bez sensu: dla walki symulowanej pokazujemy
  **odchylenie od średniej symulacji** w σ (np. "+2,1σ")).
- Zakładka Compare: dla każdego scenariusza te same trzy walki dostępne przez wiersz tabeli ("View fights"), jeśli
  tanio (kolejny krok; patrz §5, może być poza v1).

### B. Kluczowe walki w wyniku symulacji (bez trzymania logów)

- `SimResult.keyFights?: { highest: KeyFight; typical: KeyFight; lowest: KeyFight }`, `KeyFight = { run: number;
  seed: number; dps: number }` (numer przebiegu i ziarno `mixSeed(seed, run)` jak w `run.ts`). Wyznaczane w trakcie
  agregacji (O(1) pamięci: tylko max/min i lista DPS-ów jest już potrzebna do percentyli — typical po zakończeniu z
  istniejącej listy DPS-ów; bez zmiany liczb wyniku).
- **Powtórka (replay):** walka jest deterministyczna, więc log odtwarzamy na żądanie: `replayFight(request, run)`
  buduje tę samą `Simulation` (`createFightSimulation` + `runBot` z tym samym priorytetem, regułami użycia i
  skryptem) z ziarnem przebiegu i zwraca log + DPS; **test: DPS powtórki == zapisane `dps` bitowo** dla każdej z
  trzech walk (i dla skryptów). Powtórka w wątku głównym (jedna walka ≈ 1–3 ms), nie w workerze.
- Dla nowych wyników; stare wyniki bez `keyFights` nie mają selektora (opcja nieaktywna z podpowiedzią "run the
  simulation again").

### C. Widok sekunda po sekundzie (Timeline: "Moment by moment")

Pure view-model `secondBuckets(log, durationMs)` + komponent. Układ zakładki Timeline (istniejące tory i wykres DPS
zostają na górze jako przegląd i **kursor**):

- **Suwak / kursor czasu** (klik na torach i wykresie ustawia sekundę; strzałki ←/→ ±1 s, Shift ±5 s, Home/End; pole
  "Go to 12.4 s"), oś w sekundach walki (0 = pull; zdarzenia przed pullem jako "pre-pull" w sekundzie 0 z
  oznaczeniem, jeśli log je zawiera).
- **Panel sekundy N** (okno [N, N+1) s): zadane obrażenia sumą i per czar (z crit/miss), starty i ukończenia
  castów (z czasem rzucania), kolejka (`queue`, `queue-drop` z powodem), tiki DoT-ów, użyte przedmioty/consumables
  (z nazwą), mana na końcu sekundy i zmiany (Life Tap, regeneracja z logu `mana`), **aury w tej sekundzie**:
  zaaplikowane (↑), zeszły (↓), odświeżone, stacki; oraz **stan na początek sekundy**: aktywne buffy gracza z
  pozostałym czasem i debuffy na celu z pozostałym czasem (liczone z logu, nie z silnika).
- **Lista wszystkich sekund** (tabela, wirtualizowana lub z paginacją ≥ 600 wierszy): sekunda, DPS skumulowane,
  obrażenia w sekundzie, najważniejszy czar, ikony aktywnych buffów; klik ustawia kursor; filtry: tylko
  sekundy z (dmg | aury | przedmioty | odrzucenia), wyszukiwanie po nazwie czaru/aury.
- **Skok do zdarzenia:** klawisze/przyciski "next/previous: aura change | item use | crit | queue drop".
- **Porównanie z botem** (gdy dostępne): w panelu sekundy wiersz "Bot: …" (co bot zrobił w tej sekundzie).
- Dostępność: panel jako `role="region"` z `aria-live="polite"` dla zmiany sekundy, kursor sterowany klawiaturą,
  tabela z `scope`, nazwy dostępne stabilne; mobile 390 px: panel pod wykresem, lista jako kafelki.

### D. Eksport

- "Copy this second" / "Copy fight log (CSV)": sekunda po sekundzie (kolumny: second, damage, casts, auras up/down,
  items, mana) do schowka; ułatwia wklejenie do agenta AI. Bez żadnej zmiany silnika.

### E. Historia walk i ranking najwyższego DPS (uzupełnienie autora)

- **Historia walk** (`rotation-trainer:history:v1`, osobny klucz, wersjonowany, try/catch, limit rozmiaru): każda
  **zagrana** walka (log zapisany, bo człowiek nie jest powtarzalny; maks. 20 ostatnich, ≤ 1,5 MB łącznie, najstarsze
  wypadają) oraz **kluczowe walki symulacji** (highest/typical/lowest jako odnośniki: ziarno + numer przebiegu +
  pełny zrzut ustawień, log odtwarzany na żądanie; maks. 10 ostatnich symulacji). Wpis: `id`, `kind`
  ('played' | 'sim-highest' | 'sim-typical' | 'sim-lowest'), czas zapisu, DPS, ziarno, długość walki, zrzut
  ustawień (§F), opcjonalnie nazwa/notatka użytkownika i gwiazdka (przypięcie, nie wypada z limitu).
- **Ranking Highest DPS:** tabela top N (domyślnie 10) po DPS z całej historii (zagrane + kluczowe z symulacji),
  filtry: rodzaj (zagrane | symulacje | wszystkie), ta sama długość walki (domyślnie włączone, bo DPS zależy od
  długości), ten sam skrót ustawień (gear+talenty). Wiersz: miejsce, DPS, rodzaj, data, skrót gear/talenty/rotacja
  (nazwy presetów lub "custom"), długość. **Klik otwiera tę walkę w tym samym podglądzie** (Fight source →
  "History: #n"; te same zakładki Damage/Timeline/Log/Rotation i Moment by moment co dla każdej innej walki).
- Selektor "Fight source" dostaje pozycję **History…** (lista historii + ranking w jednym panelu "Fights").
- Błędy zapisu (pełny storage): komunikat widoczny, nigdy cicho; wpisy uszkodzone pomijane.

### F. Pełny obraz walki: użyte ustawienia (Setup used)

Każda przeglądana walka (zagrana, z symulacji, z historii) ma swój **zrzut ustawień** (`SetupConfig` znormalizowany
w chwili walki, nie bieżący) i panel **"Setup used"** w Report (zwijany, nad zakładkami albo zakładka obok Damage):
- **Ekwipunek:** 17 slotów (ikona, nazwa przedmiotu, gemy/enchant/socket bonus), aktywne bonusy zestawów, efekty
  przedmiotów (on-use/proc) i statystyki na pullu (te same liczby co "Stats at the pull" w Setup, liczone z zrzutu).
- **Talenty:** nazwa presetu lub "custom", punkty w drzewach, lista wykupionych talentów z rangami (ikony),
  niezamodelowane oznaczone.
- **Buffy i consumables:** włączone buffy/debuffy, timed cooldowns, reguły użycia przedmiotów i trinketów.
- **Rotacja:** tryb podstawowy (ustawienia) albo skrypt (lista reguł, odpalenia reguł z symulacji, gdy są),
  długość walki, dystans, opcje klasy, ziarno.
- Przycisk **"Use this setup"** (z potwierdzeniem, co zostanie zastąpione) przywraca zrzut jako bieżący setup, żeby
  odtworzyć i poprawiać walkę z historii.
- Gdy zrzut wymaga bazy przedmiotów, a ta jeszcze się ładuje, panel pokazuje stan ładowania, nie błąd.

## 3. Zasady

- Brak zmian w silniku i bocie; `sim-runner` dostaje tylko dodatek do wyniku (`keyFights`) i `replayFight`; **żadna liczba
  istniejącego wyniku się nie zmienia** (testy złote/bit-identyczne bez zmian).
- Model sekund liczony z logu (jedno źródło prawdy); sumy per czar zgadzają się z `damageTotal` i z tabelą Damage
  (test), uptime'y z oknami aur (test), aury pre-pull obsłużone.
- Wydajność: model sekund memoizowany per walka; render panelu sekundy nie przerysowuje listy; lista wirtualizowana.
- Zgodność z redesignem: tokeny, a11y, klasa-agnostyczne komponenty (nazwy z `SpecData`), brak plików różniących się
  tylko wielkością liter.

## 4. Ryzyka

- Replay musi być bitowo identyczny z przebiegiem w symulatorze: wspólna ścieżka budowy (`createFightSimulation`) i
  test dla trzech walk, także z regułami użycia i skryptem; setup w momencie powtórki musi być ten sam co przy
  symulacji (używamy `lastSimulation.config`, nie bieżącego setupu).
- Dużo danych w jednej sekundzie (burst): grupowanie i zwijanie, a nie ściana tekstu.

## 5. Poza zakresem (później)

Porównanie dwóch walk obok siebie (diff; ranking i historia już w zakresie), eksport/import historii, walki kluczowe w Compare, zapis/import logów, animacja odtwarzania w czasie
rzeczywistym.
