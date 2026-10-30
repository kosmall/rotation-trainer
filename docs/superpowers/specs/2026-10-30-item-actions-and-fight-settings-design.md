# Aktywowane przedmioty na action barze i ustawienia walki — projekt (spec)

Data: 2026-10-30
Status: zatwierdzony przez autora ("napisz specę i plan, a następnie zaimplementuj"), bez osobnego przeglądu
Uzupełnia: `docs/superpowers/specs/2026-10-29-realism-and-setup-design.md` (etap 1.5 jest zrobiony).

## 1. Cel i kontekst

W etapie 1.5 Icon of the Silver Crescent i Destruction Potion są **zaplanowane z góry** (aura startuje o
ustawionej sekundzie), a Dark Rune i Super Mana Potion zostały pominięte jako "akcje gracza". Autor chce,
żeby gracz **sam je aktywował na action barze**, tak jak czary, i żeby w ustawieniach walki dało się wybrać
**długość walki** oraz **sekundę, w której wchodzi Heroism/Bloodlust**.

Zakres:

- **A.** Przedmioty aktywowane (on-use) jako akcje na action barze: trinkety (Icon of the Silver Crescent),
  Destruction Potion, Dark Rune, Super Mana Potion. Dzielone cooldowny. Skróty klawiszowe.
- **B.** Ustawienia walki w panelu Setup: długość walki i sekunda startu Heroism/Bloodlust.

Poza zakresem: model zdrowia gracza (koszt zdrowia Life Tap i Dark Rune zostaje pominięty, jak dotąd),
pozostałe trinkety i mikstury spoza listy, aktywacja podczas castowania (patrz §2.4), edytor gearu (etap 2a).

## 2. Część A — przedmioty jako akcje

### 2.1 Które przedmioty

| Przedmiot | Efekt | Cooldown | Źródło |
|---|---|---|---|
| Icon of the Silver Crescent (29370) | +155 spell power na 20 s | 120 s własny, **20 s wspólny** z innymi trinketami (kategoria 1141) | wowsims tbc-new `db.json` (to już mamy: wartości z etapu 1.5, Task 8) |
| Destruction Potion (22839) | +120 spell power i +2% krytyka (44,15 rating) na 15 s | 120 s, **wspólny z Super Mana Potion** (kategoria 4) | wowsims `db.json`, Wowhead |
| Super Mana Potion (22832) | 1800–3000 many | 120 s, wspólny z Destruction Potion (kategoria 4) | wowsims `db.json` (kategoria), Wowhead TBC (zakres many) |
| Dark Rune (20520; wowsims zna tylko Demonic Rune 12662, te same liczby: do potwierdzenia we Wowhead) | 900–1500 many, koszt 600–1000 zdrowia | 120 s, wspólny z Demonic Rune (kategoria 1153) | wowsims `db.json` (kategoria), Wowhead TBC |

Super Mana Potion jest dodana, bo dzieli cooldown z Destruction Potion (bez niej nie da się pokazać wyboru
"mikstura na burst czy na mana"). Zamyka to odstępstwo od §4.2 pierwotnego specu (ruling z etapu 1.5).

Wartości (zakresy many, ID, kategorie) do zweryfikowania w wowsims i Wowhead; niepewne oznaczone `UNVERIFIED`.
Koszt zdrowia Dark Rune nie jest modelowany (silnik nie ma zdrowia), tak samo jak koszt zdrowia Life Tap:
udokumentowane w `docs/data-sources.md`.

### 2.2 Silnik: akcja przedmiotu

`SpellDef` dostaje opcjonalne pola (data-driven, bez specjalnych przypadków per przedmiot):

- `item?: true`. Akcja przedmiotu: **bez GCD**, bez rzutu na trafienie, bez pocisku, **nie uruchamia hooków**
  (`onSpellResolved`: użycie runy nie może dać procka Judgement of Wisdom ani Band), nie zaczyna zasady
  pięciu sekund i nie kosztuje many.
- `sharedCooldown?: { group: string; ms: number }`: po użyciu **wszystkie** akcje tej samej grupy dostają
  cooldown co najmniej `ms` (nie skracamy dłuższego, który już biegnie). Własny `cooldownMs` zostaje.
  Icon: `cooldownMs 120000`, grupa `trinket` 20000; Destruction Potion i Super Mana Potion: grupa `potion`
  120000; Dark Rune: grupa `rune` 120000.
- `gainManaRange?: { min: number; max: number }`: losowa ilość many, **jedno losowanie z `Rng`** w momencie
  użycia (równomiernie, całkowite, włącznie z końcami), logowane jako `mana` ze `spellId` akcji. Losowanie
  tylko przy użyciu akcji, więc runy z wyłączonymi przedmiotami nie zmieniają kolejności losowań.
- `applyAura` (już jest) daje buff, np. Icon i Destruction Potion nakładają swoją aurę własną na gracza.

Kolejność przy użyciu (instant): sprawdzenia jak w `castRejection` (cooldown, zajęty cast), potem
cooldown własny i wspólny, mana, aura. Brak `cast-start`; log `cast-complete` ze `spellId` akcji (spójnie z
instantami). Odrzucenia i kolejka: jak dla czarów (`busy`, `cooldown`), z oknem kolejki.

### 2.3 Dane i setup

- `BuffEffect.action?: SpellDef`: wpis katalogu, który po włączeniu **dodaje akcję do paska**. Icon i
  Destruction Potion tracą `timed` (zostają wpisy katalogu z `effect.action` + `selfAura`); dochodzą wpisy
  Super Mana Potion i Dark Rune (grupa `consumable`). Heroism zostaje zaplanowany (to czar innego gracza).
- `applySetup`: dla każdego włączonego wpisu z `action`: akcja dodana do `spec.spells`, jej aura do
  `spec.auras`, id akcji do wolnego slotu **rzędu przedmiotów** w `spec.keybinds` (kolejność katalogu). Nic
  z tego nie jest planowane przez `scheduledAuras`.
- Zapisane ustawienia: wpisy `timed` Icon/Destruction Potion znikają przy normalizacji (nieznane klucze
  `timed` są odrzucane, jak dziś). Domyślnie wszystko wyłączone, wyniki bota przy domyślnym setupie bez zmian.
- Reguły priorytetu (bot i lista "Priority" w UI): dla każdej włączonej akcji krok **na początku listy**
  (są bez GCD): Icon i Destruction Potion "przy starcie, a jeśli Heroism jest włączony, gdy Heroism działa",
  Super Mana Potion "gdy brakuje many ≥ 3000", Dark Rune "gdy brakuje many ≥ 1500". Reguły są wskazówką, nie
  wyrocznią; jej rozsądny, nie optymalny charakter jest opisany w dokumentacji.
- Preset "Raid as in my log": Icon i Destruction Potion włączone **jako akcje** (nie planowane na 7,5 s i
  30,2 s), Heroism zaplanowany o 6,4 s. Kalibracja statystyk "na pull" bez zmian (timed buffy tam nie liczą).
  Test i opis presetu opisują, że czasy użycia przedmiotów z logu są teraz decyzją gracza.

### 2.4 Uproszczenie: przedmiot a cast w toku

W grze przedmiot nie jest użyteczny w trakcie casta czaru z czasem rzucania; używamy tej samej reguły co dla
instantów w silniku: użycie jest odrzucone `busy` albo (w oknie kolejki) trafia do kolejki i wchodzi tuż po
końcu casta, bez GCD. Gracz używa przedmiotu między castami. Udokumentowane.

### 2.5 UI: action bar

- Drugi rząd paska "Items" pod paskiem czarów: tylko sloty z przypisaną akcją przedmiotu, klawisze
  **Z X C V** (nie kolidują z 1–9,0,-,=, R, Spacją i Esc; wielkość litery bez znaczenia).
- Slot przedmiotu: ikona (z `npm run icons`), cooldown własny i wspólny (większy z pozostałych sekund),
  sweep czasu trwania aury (opcjonalnie), podpowiedź z opisem. Użycie z klawiatury i myszą jak czary.
- `Esc` anuluje cast, nie użycie przedmiotu (użycie jest natychmiastowe).

## 3. Część B — ustawienia walki

- `SetupConfig.fightDurationSec` (domyślnie **60**, zakres **10–600**, liczba całkowita), z normalizacją jak
  inne pola (stare zapisane `v1` bez pola dostają 60). `applySetup` zwraca `sim.durationMs`; `useSimulation`
  podaje go do `Simulation`.
- Sekunda startu Heroism/Bloodlust (`timed.heroism.startSec`, już jest; zakres 0–600) i jego czas trwania
  dostają własną sekcję **"Fight"** w panelu Setup razem z długością walki; usunięte z grupy "Items and
  cooldowns" (jedno miejsce konfiguracji). Włączenie Heroism przełącznikiem "Heroism / Bloodlust".
- Sekunda startu większa niż długość walki: ostrzeżenie w panelu (jak dziś), silnik ignoruje wpis.
- Wszystko, co dziś zakłada 60 s, czyta długość z walki: etykieta "Elapsed", pasek postępu, podsumowanie,
  limit pokazywanego czasu debuffów (ruling S3 przycina do końca walki), reguły priorytetu (już czytają
  `snapshot.durationMs`), testy bota przy domyślnych 60 s bez zmian.
- Zmiana długości walki wchodzi od następnej walki (jak reszta setupu); nierozpoczęta walka bierze ją od razu.

## 4. Ryzyka i decyzje

- Czas użycia przedmiotów zależy teraz od gracza i bota: wyniki presetu "raid-log" zmienią się (zostanie
  to zmierzone i opisane); porównywalność z etapem 1.5 jest zachowana tylko dla domyślnego setupu.
- Dark Rune nie ma kosztu zdrowia (brak modelu zdrowia); Life Tap analogicznie.
- Zakres many Super Mana Potion i Dark Rune oraz ID Dark Rune wymagają potwierdzenia we Wowhead (oznaczane
  `UNVERIFIED`, jeśli się nie da).
- Dodanie pól do `SpellDef` nie zmienia żadnego istniejącego czaru ani logu (pola opcjonalne, nowa gałąź
  tylko dla `item`).
