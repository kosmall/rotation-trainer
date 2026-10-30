# Okno aktywnych buffów gracza — projekt (spec)

Data: 2026-10-30
Status: zatwierdzony przez autora ("zaplanuj plan/spec i implementuj"), bez osobnego przeglądu
Uzupełnia: `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md` (przedmioty i ustawienia
walki; ta funkcja jest realizowana **po** niej, bo dotyka tych samych plików UI).

## 1. Cel

Dziś pod postacią jest mała lista "Buffs" (chipy z nazwą i czasem). Autor chce **osobne okienko**, w którym
widać wszystkie aktywne buffy i aury na graczu i można śledzić, ile czasu zostało, np. Heroism/Bloodlust albo aura
z trinketa (Icon of the Silver Crescent), mikstury, Band of the Eternal Sage.

## 2. Zakres

- **W zakresie:** panel "Your buffs" z trzema częściami:
  1. **Aktywne** (z `snapshot.selfAuras`): ikona, nazwa, liczba stacków/ładunków, pozostały czas, pasek
     pozostałego czasu, wyraźne ostrzeżenie w ostatnich 5 s.
  2. **Nadchodzące**: aury zaplanowane w ustawieniach walki, które jeszcze nie weszły (Heroism/Bloodlust
     o ustawionej sekundzie): ikona, nazwa i odliczanie "za X s".
  3. **Stałe buffy z ustawień**: włączone buffy bez czasu trwania (raid/party/consumables, debuffy celu są poza
     panelem): zwarte ikony bez licznika, z nazwą w podpowiedzi, zwijane (domyślnie zwinięte).
- Po wygaśnięciu aura znika (bez animacji "po fakcie" w tej wersji); w ostatnich 5 s ikona pulsuje (wyłączane przy
  `prefers-reduced-motion`).
- Mała lista "Buffs" pod postacią jest zastąpiona nowym panelem (lista debuffów celu zostaje bez zmian).

**Poza zakresem:** kliknięcie w buff (anulowanie), konfiguracja układu, historia wygasłych buffów, dźwięki.

## 3. Dane

- Źródło aktywnych: `snapshot.selfAuras` (już bez aur `hidden`, np. ICD Banda). Definicje (nazwa, ikona,
  opis) z `spec.auras`; opis z wpisu katalogu, jeśli aura pochodzi z buffa (mapa `auraId → BuffDef`, ze
  `SETUP_CATALOG`: `effect.selfAura.id`), inaczej sama nazwa.
- **Całkowity czas aury** (do paska): interfejs zapamiętuje największy `remainingMs`, jaki widział dla danej
  aplikacji (przy odświeżeniu, gdy `remainingMs` rośnie, zaczyna od nowa). Bez zmian w silniku. Gdy aura
  wchodzi w połowie klatki, pasek może być na starcie nieco krótszy niż pełny: do 100 ms niedokładności jest
  akceptowane i opisane.
- **Nadchodzące**: `AppliedSetup.sim.scheduledAuras` aktualnej walki (wpisy `on: 'self'` z `atMs > nowMs`),
  nazwa i ikona z aury; odliczanie `atMs - nowMs`. Przed startem walki (`ready`) pokazują ustawioną sekundę
  ("o 6,4 s"), bo czas jeszcze nie płynie.
- **Stałe buffy**: włączone wpisy katalogu bez `timed`, bez `selfAura` i bez `targetAura` oraz bez `action`
  (czyli te, które zmieniają tylko statystyki lub modyfikatory), z ikoną z katalogu; liczba w tytule zwiniętej
  sekcji.
- Czas pokazywany jak w pozostałych miejscach (`remainingText`), ucięty do końca walki (aury z długim czasem).

## 4. Zachowanie i dostępność

- Panel jest listą (`role="list"`, `aria-label="Your buffs"`), każdy wpis czytelny dla czytnika ekranu
  ("Heroism / Bloodlust, 23 seconds left"). Aktualizacja `aria-live` **nie** jest używana (zbyt gadatliwa),
  zamiast tego tekst wpisu jest zawsze aktualny.
- Układ: panel obok paska postaci/many, na wąskim ekranie pod paskiem akcji; bez poziomego przewijania.
- Kolory i kontrast w obu motywach (jasny i ciemny) jak reszta aplikacji; ostrzeżenie nie jest wyłącznie kolorem
  (pulsuje i ma pogrubiony czas).

## 5. Ryzyka

- Ikony wszystkich aur muszą istnieć (są w repo od etapu 1.5; pierwsze użycie brakującej ikony pokazuje
  inicjały, jak dotąd).
- Pasek z "największym widzianym czasem" myli się dla aury odświeżonej zanim wygasła, jeśli nowy czas jest
  krótszy niż pozostały (nie zdarza się w danych: odświeżenia dają pełny czas); opisane w komentarzu.
- Dużo buffów naraz (np. preset z logiem): panel ma przewijany obszar o stałej wysokości, bez rozpychania
  layoutu.
