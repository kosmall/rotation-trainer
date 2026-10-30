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

**Przedmioty i ustawienia walki:** aktywowane przedmioty (Icon of the Silver Crescent,
Destruction Potion, Super Mana Potion, Dark Rune) na osobnym pasku **Items** pod klawiszami
`Z` `X` `C` `V`, z prawdziwymi i dzielonymi cooldownami. W panelu Setup grupa **Fight**: długość
walki (10-600 s, domyślnie 60) i sekunda startu Heroism/Bloodlust.

## Uruchomienie

Wymaga Node.js (z npm).

```sh
npm install        # zależności
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # wszystkie testy (Vitest)
npm run typecheck  # sprawdzenie typów (tsc)
npm run build      # typecheck + build produkcyjny do dist/
npm run preview    # podgląd builda z dist/: http://localhost:4173
npm run icons      # (tylko po dodaniu czarów, buffów lub przedmiotów) pobiera ikony z Wowheada do public/icons/spells/
```

Ikony czarów, aur, buffów, debuffów, przedmiotów i opcji warlocka są już w repo
(`public/icons/spells/`), więc aplikacja działa offline. `npm run icons` obejmuje czary i aury
postaci oraz cały katalog panelu Setup (buffy, debuffy, consumables, cooldowny, efekty przedmiotów
i ich aury, akcje przedmiotów z paska Items). Sprawdza też nazwy ikon w danych względem Wowheada.
Ikonę Super Mana Potion bierze z przedmiotu (22832), bo jej czar ma na Wowheadzie tylko ikonę
zastępczą. Potrzebuje sieci i trzeba go uruchomić tylko po dodaniu nowych czarów, buffów lub
przedmiotów.

## Klawisze

| Klawisz | Działanie |
|---|---|
| `1`-`9`, `0`, `-`, `=` | sloty paska akcji 1-12 (pierwszy czar startuje też walkę) |
| `8` | celowo pusty: postać nie ma talentu Conflagrate |
| `Z`, `X`, `C`, `V` | sloty paska przedmiotów **Items** (tylko włączone przedmioty; wielkość litery bez znaczenia, użycie przedmiotu też startuje walkę) |
| `Esc` | przerywa rzucanie (i czyści kolejkę, także zakolejkowany przedmiot; użycia przedmiotu nie cofa) |
| `Spacja` | start walki |
| `R` | reset walki |

Pasek: 1 Shadow Bolt, 2 Immolate, 3 Corruption, 4 Curse of the Elements, 5 Shadowburn,
6 Life Tap, 7 Incinerate, 9 Curse of Agony, 0 Curse of Doom. Na celu może być tylko **jedna**
klątwa: rzucenie innej zastępuje obecną (wybierz jedną).

Klawisze nie działają, gdy piszesz w polu tekstowym lub liczbowym panelu Setup (np. `Z` w polu
„Fight length (s)” nic nie używa).

## Pasek przedmiotów (Items)

Przedmioty włączone w grupie „Items and cooldowns” panelu Setup pojawiają się na pasku **Items**
pod paskiem czarów, w kolejności z panelu: pierwszy włączony pod `Z`, następny pod `X` itd. (przy
każdym włączonym przedmiocie panel pokazuje „Item bar: Z” itp.). Używasz ich klawiszem albo
myszą, tak jak czarów.

| Przedmiot | Efekt | Cooldown |
|---|---|---|
| Destruction Potion | +120 spell power i +2% krytyka przez 15 s | 2 min, wspólny z Super Mana Potion |
| Super Mana Potion | 1800-3000 many | 2 min, wspólny z Destruction Potion |
| Dark Rune | 900-1500 many (koszt 600-1000 zdrowia nie jest liczony) | 2 min, własna grupa run |
| Icon of the Silver Crescent | +155 spell power przez 20 s | 2 min; inne trinkety czekają 20 s |

- **Dzielone cooldowny:** mikstury mają jeden wspólny cooldown (jedna mikstura na 2 min: burst
  albo mana), runy jeden, a użycie trinketu blokuje inne trinkety na 20 s. Krótszy wspólny
  cooldown nigdy nie skraca dłuższego, który już biegnie. Slot pokazuje większy z cooldownów,
  od 100 s w minutach („2m”), poniżej w sekundach („99s”).
- **Bez GCD:** przedmiot działa od razu, nie uruchamia GCD ani zasady pięciu sekund i nie
  kosztuje many. Nie da się go użyć w trakcie rzucania czaru: poza oknem kolejki slot pokazuje
  „Busy”, w ostatnich 400 ms casta przedmiot trafia do kolejki i działa tuż po końcu casta. Używaj
  go między castami.
- Buffy z przedmiotów widać na liście buffów (np. „Destruction Potion 15s”, „Blessing of the
  Silver Crescent 20s”). Bot też używa przedmiotów (reguły w panelu Priority): Icon i Destruction
  Potion w trakcie Heroismu, a po nim przy każdym gotowym cooldownie (bez Heroismu: od początku
  walki i przy każdym gotowym cooldownie), Super Mana
  Potion przy braku co najmniej 3000 many, Dark Rune przy 1500. To wskazówki, nie optimum.

## Panel Setup

Zwijany panel **Setup** (obok walki, nie zasłania paska akcji) ustawia następną walkę:

- **Presety:**
  - „None”: domyślny setup, bez buffów. Liczby są takie jak w etapie 1, z czasem lotu.
  - „Raid as in my log”: przybliżenie raidu autora z logu z Naj'entusa. Moonkin Aura, Mana
    Spring Totem, Judgement of Wisdom, Heroism od 6,4 s, Destruction Potion i Icon of the Silver
    Crescent, Band of the Eternal Sage, Improved Shadow Bolt od innych warlocków i rotacja z logu
    (Curse of Doom + Shadow Bolt). Część buffów jest **zgadnięta** tak, żeby zgadzały się Int,
    Spirit i Life Tap z logu. Szczegóły i różnice: sekcja „Part C: setup rules and calibration”
    w `docs/data-sources.md`. **Zmiana:** Destruction Potion i Icon są teraz przedmiotami na pasku
    Items (`Z` i `X`), a nie buffami startującymi same o 7,5 s i 30,2 s jak w logu: kiedy ich
    użyć, decydujesz Ty (bot używa ich w trakcie Heroismu, około 8,8 s). Wynik bota dla presetu
    zmienił się przez to z 2305 na 2294 DPS (w granicach szumu losowania).
  - „Reset to defaults” przywraca domyślny setup, także długość walki 60 s.

  Presety „None” i „Raid as in my log” **zachowują** wybraną długość walki. Nad przyciskami
  widać nazwę aktywnego presetu („Custom”, gdy coś zmienisz; sama długość walki tego nie zmienia).
- **Fight** (pierwsza grupa):
  - „Fight length (s)”: długość walki, 10-600 s (liczba całkowita), domyślnie 60. Licznik czasu,
    podsumowanie, czasy buffów i debuffów oraz reguły priorytetu (np. Shadowburn na koniec,
    odświeżanie DoT-ów) biorą ją z walki. W dłuższej walce Curse of Doom jest rzucana tylko
    wtedy, gdy zdąży zadać swój jedyny tick przed końcem (60 s).
  - „Heroism / Bloodlust”: włączenie, „Start (s)” (0-600) i „Duration (s)” (domyślnie 40).
    Heroism działa raz na walkę (cooldown 10 min). Start równy długości walki lub późniejszy
    daje ostrzeżenie „Starts after the fight ends (N s): no effect.” i Heroism się nie pojawia.
- **Grupy:**
  - Raid and party: buffy rajdowe i grupowe.
  - Consumables: flaski, eliksiry, jedzenie, olejki. Flask wyklucza eliksiry, a z jednej grupy
    działa tylko jeden.
  - Target debuffs: debuffy celu od innych graczy. Curse of the Elements i Improved Shadow Bolt
    od raidu nie sumują się z Twoimi.
  - Items and cooldowns: Destruction Potion, Super Mana Potion, Dark Rune i Icon of the Silver
    Crescent (przedmioty na pasku Items, patrz wyżej) oraz Band of the Eternal Sage (proc
    losowany w walce, nic nie wciskasz). Heroism jest w grupie Fight.
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
- buffy, debuffy celu, consumables, Heroism i proc Band of the Eternal Sage, gdy są włączone w
  panelu Setup
- przedmioty używane z paska Items (Destruction Potion, Super Mana Potion, Dark Rune, Icon of
  the Silver Crescent) z własnymi i dzielonymi cooldownami
- długość walki 10-600 s

## Czego DPS nie uwzględnia

Wynik jest przybliżony. Buffy rajdowe, consumables i proc Band of the Eternal Sage liczą się
tylko wtedy, gdy włączysz je w panelu Setup (domyślnie wyłączone); przedmioty z paska Items
dopiero wtedy, gdy ich użyjesz. Nigdy nie są liczone: koszt zdrowia Life Tap i Dark Rune (trener nie
modeluje zdrowia), bonus Incinerate przy Immolate, redukcja odporności z Curse of the Elements. Nie ma też
sprawdzania zasięgu: Shadowburn działa z 28 yd. Domyślne założenia, zmienialne w Warlock options:
poświęcony Succubus (+15% shadow) i Fel Armor (+130 spell power) przez całą walkę. Pełna lista:
sekcja „What the DPS excludes” w `docs/data-sources.md`.

## Dokumentacja

- Specyfikacja: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md`
- Plan etapu 1: `docs/superpowers/plans/2026-10-29-stage-1-engine-and-playable-fight.md`
- Etap 1.5 (czas lotu, rotacja, Setup): specyfikacja
  `docs/superpowers/specs/2026-10-29-realism-and-setup-design.md`, plan
  `docs/superpowers/plans/2026-10-29-realism-and-setup.md`
- Przedmioty i ustawienia walki: specyfikacja
  `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md`, plan
  `docs/superpowers/plans/2026-10-30-item-actions-and-fight-settings.md`
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
