# Rotation Trainer (WoW TBC Classic Anniversary)

Trener rotacji dla World of Warcraft: The Burning Crusade Classic Anniversary. Grasz walkę w
przeglądarce na prawdziwych klawiszach paska akcji, a symulacja liczy obrażenia tak jak gra
(na danych z wowsims).

**Etap 1:** Destruction Warlock, walka 60 s z manekinem (boss poziomu 73), Twoja postać:
ekwipunek, klejnoty, enchanty i talenty z
`docs/samples/wowsimsexporter-destruction-warlock.json` (Gnome, 0/21/40). Bot z listą
priorytetów (`src/bot`) gra tę samą walkę jako punkt odniesienia (około 1425 DPS przy domyślnym
setupie).

**Etap 1.5:** czas lotu pocisków (odległość od celu), konfigurowalna rotacja i panel **Setup** z
buffami, debuffami, consumables i cooldownami. Ustawienia zapisują się w przeglądarce.

## Uruchomienie

Wymaga Node.js (z npm).

```sh
npm install        # zależności
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # wszystkie testy (Vitest)
npm run typecheck  # sprawdzenie typów (tsc)
npm run build      # typecheck + build produkcyjny do dist/
npm run preview    # podgląd builda z dist/: http://localhost:4173
npm run icons      # (tylko po dodaniu czarów lub buffów) pobiera ikony z Wowheada do public/icons/spells/
```

Ikony czarów, aur, buffów, debuffów i opcji warlocka są już w repo (`public/icons/spells/`), więc
aplikacja działa offline. `npm run icons` obejmuje czary i aury postaci oraz cały katalog panelu
Setup (buffy, debuffy, consumables, cooldowny, efekty przedmiotów i ich aury). Sprawdza też nazwy
ikon w danych względem Wowheada. Potrzebuje sieci i trzeba go uruchomić tylko po dodaniu nowych
czarów lub buffów.

## Klawisze

| Klawisz | Działanie |
|---|---|
| `1`-`9`, `0`, `-`, `=` | sloty paska akcji 1-12 (pierwszy czar startuje też walkę) |
| `8` | celowo pusty: postać nie ma talentu Conflagrate |
| `Esc` | przerywa rzucanie (i czyści kolejkę czarów) |
| `Spacja` | start walki |
| `R` | reset walki |

Pasek: 1 Shadow Bolt, 2 Immolate, 3 Corruption, 4 Curse of the Elements, 5 Shadowburn,
6 Life Tap, 7 Incinerate, 9 Curse of Agony, 0 Curse of Doom. Na celu może być tylko **jedna**
klątwa: rzucenie innej zastępuje obecną (wybierz jedną).

## Panel Setup

Zwijany panel **Setup** (obok walki, nie zasłania paska akcji) ustawia następną walkę:

- **Presety:**
  - „None”: domyślny setup, bez buffów. Liczby są takie jak w etapie 1, z czasem lotu.
  - „Raid as in my log”: przybliżenie raidu autora z logu z Naj'entusa. Moonkin Aura, Mana
    Spring Totem, Judgement of Wisdom, Heroism od 6,4 s, Destruction Potion od 7,5 s, Icon of the
    Silver Crescent od 30,2 s, Band of the Eternal Sage, Improved Shadow Bolt od innych warlocków
    i rotacja z logu (Curse of Doom + Shadow Bolt). Część buffów jest **zgadnięta** tak, żeby
    zgadzały się Int, Spirit i Life Tap z logu. Szczegóły i różnice: sekcja „Part C: setup rules
    and calibration” w `docs/data-sources.md`.
  - „Reset to defaults” przywraca domyślny setup.

  Nad przyciskami widać nazwę aktywnego presetu („Custom”, gdy coś zmienisz).
- **Grupy:**
  - Raid and party: buffy rajdowe i grupowe.
  - Consumables: flaski, eliksiry, jedzenie, olejki. Flask wyklucza eliksiry, a z jednej grupy
    działa tylko jeden.
  - Target debuffs: debuffy celu od innych graczy. Curse of the Elements i Improved Shadow Bolt
    od raidu nie sumują się z Twoimi.
  - Items and cooldowns: Heroism, Destruction Potion, Icon, Band. Dla Heroism, Destruction Potion
    i Icon ustawiasz sekundę startu i czas trwania; Band to proc (losowany w walce), bez startu.
  - Warlock options: Fel Armor albo Demon Armor, poświęcony Succubus.
- **Rotacja:** presety rotacji „DoT rotation” (domyślna) i „Shadow Bolt spam + curse” (jak w
  logu). Do tego klątwa, Immolate, Corruption, Shadowburn na koniec walki i próg many dla Life
  Tapa („Auto” albo liczba). Panel Priority pokazuje listę priorytetów dla tych ustawień.
- **Odległość od celu** (yd, domyślnie 28 jak w logu): Shadow Bolt leci 20 yd/s, czyli 1,4 s przy
  28 yd. Odległość wpływa też na moment Shadowburna na koniec walki.
- **„Stats at the pull”**: statystyki następnej walki przed buffami czasowymi.

Zmiany działają od **następnej** walki. Trwająca walka zachowuje swój setup (panel to pokazuje),
nową zaczynasz klawiszem `R`. Ustawienia zapisują się w `localStorage` przeglądarki pod kluczem
`rotation-trainer:setup:v1`. Uszkodzone lub stare dane są poprawiane albo zastępowane domyślnymi.
Jeśli przeglądarka nie pozwala zapisać, ustawienia działają do zamknięcia karty.

## Co jest modelowane

- GCD i czasy rzucania skrócone przez haste, kolejka czarów 400 ms (UNVERIFIED: wartość z
  wowsims, niepotwierdzona dla klienta Anniversary)
- DoT-y (Immolate, Corruption, klątwy) z odświeżaniem bez podwójnych ticków; jedna klątwa na cel
- Improved Shadow Bolt (debuff +20% shadow, 4 ładunki)
- mana, regeneracja co 2 s, zasada pięciu sekund, Life Tap
- Malefic Raiment 4pc (+6% Shadow Bolt i Incinerate)
- ekwipunek: przedmioty, klejnoty, bonusy za gniazda, enchanty, meta gem
- talenty (Bane, Cataclysm, Devastation, Ruin, Emberstorm, Shadow and Flame, Demonic Sacrifice,
  Backlash i inne; pełna lista w `docs/data-sources.md`)
- czas lotu Shadow Bolta i Incinerate (od odległości od celu); pocisk, który nie doleci przed
  końcem walki, się nie liczy
- buffy, debuffy celu, consumables, Heroism, Destruction Potion, Icon of the Silver Crescent i
  proc Band of the Eternal Sage, gdy są włączone w panelu Setup

## Czego DPS nie uwzględnia

Wynik jest przybliżony. Buffy rajdowe, consumables i efekty trinketów (Icon of the Silver
Crescent, Band of the Eternal Sage) liczą się tylko wtedy, gdy włączysz je w panelu Setup
(domyślnie wyłączone). Nigdy nie są liczone: koszt zdrowia Life Tap, bonus Incinerate przy
Immolate, redukcja odporności z Curse of the Elements, Super Mana Potion i Dark Rune. Nie ma też
sprawdzania zasięgu: Shadowburn działa z 28 yd. Domyślne założenia, zmienialne w Warlock options:
poświęcony Succubus (+15% shadow) i Fel Armor (+130 spell power) przez całą walkę. Pełna lista:
sekcja „What the DPS excludes” w `docs/data-sources.md`.

## Dokumentacja

- Specyfikacja: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md`
- Plan etapu 1: `docs/superpowers/plans/2026-10-29-stage-1-engine-and-playable-fight.md`
- Etap 1.5 (czas lotu, rotacja, Setup): specyfikacja
  `docs/superpowers/specs/2026-10-29-realism-and-setup-design.md`, plan
  `docs/superpowers/plans/2026-10-29-realism-and-setup.md`
- Źródło każdej liczby (wowsims, Wowhead), założenia i otwarte pytania: `docs/data-sources.md`
- Decyzje projektowe (kolejka czarów): `docs/decisions/`

## Struktura projektu

| Katalog | Zawartość |
|---|---|
| `src/engine` | deterministyczna symulacja walki (bez Reacta): czas, zdarzenia, czary, aury, mana, statystyki, ekwipunek |
| `src/data` | dane gry: współczynniki, cel, katalog buffów, Destruction Warlock (czary, aury, talenty, przedmioty, zestawy, rotacja) |
| `src/setup` | setup walki: domyślne ustawienia i ich walidacja, presety, zapis w `localStorage`, zamiana setupu na dane walki |
| `src/bot` | bot grający listę priorytetów (punkt odniesienia DPS) |
| `src/ui` | interfejs React: pasek akcji, pasek rzucania, mana, cel, panel Setup, podsumowanie walki |
| `tests` | testy Vitest: `engine`, `data`, `bot`, `setup`, `ui` oraz `smoke.test.ts` |
