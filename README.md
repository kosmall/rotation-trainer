# Rotation Trainer (WoW TBC Classic Anniversary)

Trener rotacji dla World of Warcraft: The Burning Crusade Classic Anniversary. Grasz walkę w
przeglądarce na prawdziwych klawiszach paska akcji, a symulacja liczy obrażenia tak jak gra
(na danych z wowsims).

**Etap 1:** Destruction Warlock, walka 60 s z manekinem (boss poziomu 73), Twoja postać:
ekwipunek, klejnoty, enchanty i talenty z
`docs/samples/wowsimsexporter-destruction-warlock.json` (Gnome, 0/21/40). Bot z listą
priorytetów (`src/bot`) gra tę samą walkę jako punkt odniesienia (około 1486 DPS).

## Uruchomienie

Wymaga Node.js (z npm).

```sh
npm install        # zależności
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # wszystkie testy (Vitest)
npm run typecheck  # sprawdzenie typów (tsc)
npm run build      # typecheck + build produkcyjny do dist/
npm run preview    # podgląd builda z dist/: http://localhost:4173
npm run icons      # (tylko po dodaniu czarów) pobiera ikony z Wowheada do public/icons/spells/
```

Ikony czarów i aur są już w repo (`public/icons/spells/`), więc aplikacja działa offline. `npm run icons`
sprawdza też nazwy ikon w danych względem Wowheada; potrzebuje sieci i działa tylko wtedy, gdy dodajesz nowe czary.

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

## Czego DPS nie uwzględnia

Wynik jest przybliżony: bez buffów rajdowych i consumables, bez efektów trinketów (Icon of the
Silver Crescent, Band of the Eternal Sage), bez czasu lotu pocisków, kosztu zdrowia Life Tap,
bonusu Incinerate przy Immolate i redukcji odporności z Curse of the Elements. Założenia:
poświęcony Succubus (+15% shadow) i Fel Armor (+130 spell power) przez całą walkę. Pełna lista:
sekcja „What the DPS excludes” w `docs/data-sources.md`.

## Dokumentacja

- Specyfikacja: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md`
- Plan etapu 1: `docs/superpowers/plans/2026-10-29-stage-1-engine-and-playable-fight.md`
- Źródło każdej liczby (wowsims, Wowhead), założenia i otwarte pytania: `docs/data-sources.md`
- Decyzje projektowe (kolejka czarów): `docs/decisions/`

## Struktura projektu

| Katalog | Zawartość |
|---|---|
| `src/engine` | deterministyczna symulacja walki (bez Reacta): czas, zdarzenia, czary, aury, mana, statystyki, ekwipunek |
| `src/data` | dane gry: współczynniki, cel, Destruction Warlock (czary, aury, talenty, przedmioty, zestawy, priorytety) |
| `src/bot` | bot grający listę priorytetów (punkt odniesienia DPS) |
| `src/ui` | interfejs React: pasek akcji, pasek rzucania, mana, cel, podsumowanie walki |
| `tests` | testy Vitest: `engine`, `data`, `bot`, `ui` oraz `smoke.test.ts` |
