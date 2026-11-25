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

**Panel buffów gracza:** okienko **Your buffs** (dziś w prawym górnym rogu areny) pokazuje aktywne buffy z
pozostałym czasem, nadchodzący Heroism i stałe buffy z setupu.

**Etap 2a (gear):** panel **Gear** z bazą przedmiotów, gemów i enchantów z wowsims, presetami BIS
na każdą fazę (Pre-Raid, T4, T5, T6, Zul'Aman, Sunwell Plateau) oraz importem z addonu
WowSimsExporter i eksportem do formatu wowsims. Domyślny ekwipunek to nadal Twój eksport, z tymi
samymi wynikami co w etapie 1.

**Etap 2b (talenty):** panel **Talents** z edytorem trzech drzewek Warlocka (dane z wowsims, opisy z
Wowhead), gotowymi buildami z wowsims, importem i eksportem ciągu talentów. Efekty talentów są
danymi (24 zamodelowane, 40 oznaczonych jako niezamodelowane z powodem); talenty zmieniają liczby
walki, bota i symulatora. Domyślny build to nadal Twój eksport (0/21/40), z tymi samymi wynikami.

**Przebudowa układu (UI redesign):** zamiast jednej kolumny z areną i ośmioma zwijanymi panelami
aplikacja ma trzy tryby: **Setup**, **Fight** i **Report** (opis niżej, „Układ: Setup, Fight,
Report”), jasny i ciemny motyw oraz pełną obsługę klawiatury i czytników ekranu. Silnik, bot,
symulator i wyniki się nie zmieniły.

## WoW Forever: symulator levelowania warlocka (40-59)

Osobny, bezgłowy moduł `src/forever/` (bez Reacta; TBC i trener zostają bez zmian). Porównuje buildy
talentów do levelowania: czas zabicia moba, mana i HP na zabicie, przerwy na picie, jedzenie i Life
Tap oraz **zabicia na godzinę**. Losowość jest z ziarnem (`--seed`), więc wyniki się powtarzają.

**Dane są w JSON** w `src/forever/data/` (`params`, `talents`, `spells`, `levels`, `builds`). Każda
wartość, której nie da się potwierdzić, ma `verify: true` i notatkę ze źródłem. Lista wszystkich:
`npm run forever:verify`. Rangi czarów i efekty talentów pochodzą ze stron spelli Wowheada Forever,
wiki i poradników (25.11.2026), a **co potwierdzone, skąd i czego nie znaleziono** jest w
`docs/forever-data-ledger.md`. Wciąż przybliżone: HP i obrażenia mobów, damage i HP petów, regeneracja
Spirit, picie i jedzenie, statystyki sprzętu, skalowanie Wracka z levelem.

```bash
# pojedynek dwóch buildów na levelach 40-59 (główne użycie)
npm run forever:duel -- --a DEMO_PACT_R1 --b AFF_WRACK --levels 40-59 --profile average --mobs 1 --sessions 200 --seed 1 --detail 50
# własny build z pliku JSON (51 punktów: [[talent, punkty], ...]) zamiast --a/--b
npm run forever:duel -- --a-file moj-build.json --b AFF_WRACK --levels 45-55
# parametry z flagą verify można nadpisać (np. HP mobów ×1,25 względem Classica, kara downranku, progi Life Tapa)
npm run forever:duel -- --a DEMO_PACT_R1 --b AFF_DRAINTANK --param mob_hp_mult=1.25 --param downrank_penalty_model=classic --param lt_combat_mana_pct=0.4
# wszystkie buildy w tabeli, podgląd buildu na levelu, rejestr założeń, analiza wrażliwości, optymalizator, raport
npm run forever:run -- --levels 40,50,59 --profile quest,average,good --sessions 100
npm run forever:build -- --build AFF_WRACK --level 47
npm run forever:verify
npm run forever:sensitivity
npm run forever:optimize -- --build DEMO_PACT_R1 --core 31 --to 59 --sessions 20
npm run forever:lifetap -- --mobs 1   # strategie Life Tapa (albo --mobs 2)
npm run forever:report
```

Jak to liczy: build to **kolejność 51 punktów** (level 10 = punkt 1); na levelu L ma pierwsze `L - 9`
punktów (opcjonalny perk `talented_legacy_perk` dodaje punkty, `respec_level` przełącza buildy DEMO z
`pre_respec_build`). **Level jest parametrem symulacji.** Sesja to kilka pulli pod rząd (mana i HP
przechodzą z pulla na pull). **Polityka Life Tapa** (jedna dla wszystkich buildów, parametry `lt_*` i
`break_hp_pct`): w walce Life Tap, gdy mana < 60% i HP > 80% albo mana < 20% i HP > 30%; między mobami także
gdy HP = 100% i mana < 90%. Jedyna przerwa to jedzenie i woda poniżej 30% HP (do pełnego HP, picie tylko
podczas jedzenia). Pojedynek daje obu buildom te same ziarna i liczy różnice parami z
przedziałem ufności 95%, a także **level przecięcia**, na którym zwycięzca się zmienia.

Domyślna polityka Life Tapa w symulatorze to Twoja reguła (parametry `lt_*` w `params.json`); najlepsze progi z wyszukiwania są w raportach `reports/forever_lifetap_strategies*.md` i w promptach do addonu (`docs/addon-lifetap-advisor-prompt.md`, `docs/addon-lifetap-advisor-update-prompt.md`).

Testy: `npx vitest run tests/forever`. Spis zamodelowanych i niezamodelowanych talentów jest w
`talents.json` (`status`, `reason`); raport: `reports/forever_leveling_40plus.md`.

## Układ: Setup, Fight, Report

Nagłówek jest zawsze widoczny: przełącznik trybów, kolor i nazwa speca, pięć „chipów” następnej
walki (Setup, Gear, Talents, Rotation, Fight; kliknięcie otwiera właściwą sekcję Setup; złoty
znacznik oznacza zmianę, która zadziała po `R`) i przycisk motywu. Na telefonie tryby są na dolnym
pasku.

- **Fight** (`#/fight`): arena jak w grze. HUD z zegarem (`0:09.2 / 1:00`), DPS i obrażeniami;
  ramka celu z debuffami i ich czasem; **Your buffs** w prawym górnym rogu (aktywne z czasem,
  nadchodzące „in 4.9 s”, małe ikony stałych buffów z setupu); ramka gracza z paskiem many i
  regułą pięciu sekund; pasek rzucania z oknem kolejki (400 ms); pasek **Items** (`Z`…`N`) i pasek
  akcji (`1`…`=`); combat text. Po prawej **dock**: mini-meter obrażeń, „Next by the script” (co
  zagrałby bot; podświetlenie slotu „Coach glow” można wyłączyć), „So far” (aktywny czas, uptime
  DoT-ów), skrót logu i przełączniki Combat text / Coach glow. Poniżej 1280 px dock otwiera
  przycisk „Meter”. Arena jest zawsze ciemna. Wyjście z Fight w trakcie walki **pauzuje** ją;
  po powrocie `Spacja`, klawisz czaru albo „Resume” wznawia od tej samej sekundy. Po walce karta
  „Fight Over” z DPS i „% of the bot” (bot z tym samym setupem i ziarnem); `Enter` otwiera raport.
- **Setup** (`#/setup/<sekcja>`): po lewej lista sekcji (Character: Gear, Talents; Fight: Buffs &
  consumables, Items & cooldowns, Rotation, Fight settings, opcje klasy; Library: Scenarios;
  Interface: Combat text), w środku jedna sekcja, po prawej podsumowanie następnej walki („Stats at
  the pull”, „Set bonuses”, „Simulate this setup” z ostatnim wynikiem symulatora). Zmiana w trakcie
  walki pokazuje notkę „Changed since the running fight started: it applies after you reset the
  fight (R)”. „Reset to Defaults…” i „Clear Script…” pytają o potwierdzenie.
- **Report** (`#/report/<zakładka>`): nagłówek z DPS, „% of the bot”, KPI (obrażenia, czas,
  aktywny czas GCD, uptime DoT-ów), „Played with …” z linkami do sekcji, „Fight Again” i „Copy
  Report”. Zakładki: **Damage** (tabela czarów, buffy i przedmioty, wykres DPS, „What to look at”),
  **Timeline**, **Log** (filtr, wirtualizowana lista), **Rotation** (Ty vs bot), **Simulator**,
  **Compare** (porównanie scenariuszy na tych samych ziarnach). Bez walki działają tylko Simulator i Compare. Opuszczenie
  raportu przerywa trwającą symulację. Nad zakładkami **Fight source** wybiera pokazywaną walkę
  (ostatnia zagrana, kluczowe walki symulacji albo walka z historii), a **Setup Used** pokazuje
  ustawienia tej walki (opis niżej, „Podgląd walki i kluczowe walki”).

| Trasa | Widok |
|---|---|
| `#/fight` | walka (domyślna; nieznany adres też tu prowadzi) |
| `#/setup/gear`, `talents`, `buffs`, `items`, `rotation`, `fight`, `class`, `scenarios`, `combat-text` | sekcje Setup (`#/setup` = Gear) |
| `#/report/damage`, `timeline`, `log`, `rotation`, `simulator`, `compare` | zakładki raportu (`#/report` = Damage) |

**Klawisze walki działają tylko w trybie Fight** (w Setup i Report nic nie rzucają). Wszędzie poza
polami tekstowymi i trwającą walką działają skróty: `g` potem `s` (Setup), `f` (Fight) albo `r`
(Report), a `?` pokazuje listę klawiszy. **Motyw:** ciemny „Nether” albo jasny „Moonstone” (przycisk
w nagłówku; bez wyboru według ustawień systemu; zapis w `rotation-trainer:ui:v1`, razem z
ustawieniami docka i Coach glow).

Gdzie trafiły dawne panele:

| Dawny panel | Nowe miejsce |
|---|---|
| Statystyki walki (DPS, Total damage, Time) i notka o DPS | Fight → HUD (notka pod „i” przy DPS), karta końca walki |
| Cel, pasek rzucania, mana, pasek akcji i Items | Fight → ramka celu, ramka gracza, paski na dole |
| Your buffs | Fight → prawy górny róg |
| Podsumowanie walki („Fight over”) | Fight → karta „Fight Over”, Report |
| Setup: presety, buffy, consumables, debuffy celu | Setup → Buffs & consumables |
| Setup: Items and cooldowns | Setup → Items & cooldowns (z podglądem paska Items) |
| Setup: Fight (długość, Heroism) i Distance | Setup → Fight settings |
| Setup: Warlock options | Setup → Warlock options |
| Setup: Rotation i Item use | Setup → Rotation (tryb Basic; tryb Script to edytor skryptu rotacji) |
| (nowe) Scenariusze, Compare | Setup → Scenarios (biblioteka, import, eksport, przykłady), Report → Compare |
| Priority | Setup → Rotation („Priority of the next fight”), Fight → dock „Next by the script”, Report → Rotation |
| Gear, Talents | Setup → Gear (import i eksport w okienkach), Setup → Talents |
| Combat text | Setup → Combat text; szybki przełącznik w docku |
| Simulator | Report → Simulator; ostatni wynik w Setup → „Simulate this setup” |
| Stats at the pull, Set bonuses | Setup → podsumowanie po prawej |

Zrzuty ekranu prawdziwej aplikacji (1440 ciemny i jasny, 1024 ciemny, 390 ciemny i jasny, każda
trasa) są w `docs/design/app/`; odtwarza je `npm run build && npm run screens` (Playwright z
globalnej instalacji, poza `npm test`). Projekt: `docs/superpowers/specs/2026-11-04-ui-redesign-design.md`,
prototyp `docs/design/prototype/`.

## Uruchomienie

Wymaga Node.js (z npm).

```sh
npm install        # zależności
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # wszystkie testy (Vitest)
npm run typecheck  # sprawdzenie typów (tsc)
npm run build      # typecheck + build produkcyjny do dist/
npm run preview    # podgląd builda z dist/: http://localhost:4173
npm run screens    # (po npm run build) zrzuty ekranu każdej trasy do docs/design/app/
npm run icons      # (tylko po dodaniu czarów, buffów, przedmiotów lub talentów) pobiera ikony do public/icons/spells/, public/icons/talents/ i public/icons/items/
npm run db:build -- <katalog klonu wowsims/tbc-new>  # odtwarza bazę przedmiotów src/data/items/db.json
npm run talents:build -- <katalog klonu wowsims/tbc-new>  # odtwarza drzewka talentów (talentTree.json, talentDescriptions.json)
```

Ikony czarów, aur, buffów, debuffów, przedmiotów i opcji warlocka są już w repo
(`public/icons/spells/`), więc aplikacja działa offline. `npm run icons` obejmuje czary i aury
postaci oraz cały katalog panelu Setup niezależny od ekwipunku (buffy, debuffy, consumables,
cooldowny i ich aury, mikstury i runa z paska Items); efekty przedmiotów mają ikony przedmiotów. Sprawdza też nazwy ikon w danych względem Wowheada.
Ikonę Super Mana Potion bierze z przedmiotu (22832), bo jej czar ma na Wowheadzie tylko ikonę
zastępczą. Pobiera też ikony wszystkich przedmiotów, gemów i enchantów z bazy (697 plików w
`public/icons/items/`). Potrzebuje sieci i trzeba go uruchomić tylko po dodaniu nowych czarów,
buffów lub przedmiotów.

`npm run db:build` czyta tylko pliki JSON z lokalnego klonu wowsims/tbc-new (licencja MIT) i nie
uruchamia jego kodu; wynik (`src/data/items/db.json`) jest w repo, więc zwykle nie trzeba go
uruchamiać.

## Klawisze

| Klawisz | Działanie |
|---|---|
| `1`-`9`, `0`, `-`, `=` | sloty paska akcji 1-12 (pierwszy czar startuje też walkę) |
| `8` | Conflagrate, tylko gdy build ma ten talent (domyślny build go nie ma: slot pusty) |
| `Z`, `X`, `C`, `V`, `B`, `N` | 6 slotów paska przedmiotów **Items** (zawsze trinkety on-use i inne efekty on-use z noszonego ekwipunku, potem włączone mikstury i runa; wielkość litery bez znaczenia, użycie przedmiotu też startuje walkę) |
| `Esc` | przerywa rzucanie (i czyści kolejkę, także zakolejkowany przedmiot; użycia przedmiotu nie cofa) |
| `Spacja` | start walki (i wznowienie zapauzowanej) |
| `R` | reset walki |
| `Enter` | po końcu walki: raport (`#/report/damage`) |
| `g` `s` / `g` `f` / `g` `r` | Setup / Fight / Report (poza polami i trwającą walką, w każdym trybie) |
| `?` | lista klawiszy |

Pasek: 1 Shadow Bolt, 2 Immolate, 3 Corruption, 4 Curse of the Elements, 5 Shadowburn,
6 Life Tap, 7 Incinerate, 8 Conflagrate, 9 Curse of Agony, 0 Curse of Doom. Shadowburn i
Conflagrate są tylko z talentem (bez niego slot jest pusty). Na celu może być tylko **jedna**
klątwa: rzucenie innej zastępuje obecną (wybierz jedną).

Klawisze walki działają tylko w trybie Fight; w Setup i Report (np. `Z` w polu „Fight length (s)”)
nic nie używają. W Fight przełączniki docka zatrzymują tylko `Spacja` i `Enter`.

## Pasek przedmiotów (Items)

Grupa „Items and cooldowns” panelu Setup **wynika z założonego ekwipunku**: pokazuje
zamodelowane efekty noszonych przedmiotów (on-use trinketów, procki, efekt przed walką) obok
mikstur i Dark Rune. Każdy wpis ma ikonę przedmiotu, nazwę i opis: staty, czas, cooldown, szansę i
wewnętrzny cooldown (ICD) oraz wyzwalacz („on spell cast”, „on spell hit”, „on spell crit”,
„before the pull, whole fight”). Po podmianie trinketu w panelu Gear lista zmienia się od razu;
włączenie jest pamiętane po id, więc przedmiot założony z powrotem wraca włączony. Efekt
przedmiotu, którego nie nosisz, nie działa i nie jest pokazywany. Pod listą jest „Not modelled
effects of your gear”: efekty noszonych przedmiotów, których trener nie liczy. Przed wczytaniem bazy
przedmiotów (ładuje się po otwarciu panelu Gear albo od razu, gdy zapisany ekwipunek jej
potrzebuje) „My gear” ma swoje efekty z kopii wbudowanej w aplikację.

Efekty on-use noszonych przedmiotów są na pasku **Items** pod paskiem czarów **zawsze**, także przed
startem walki i bez włączania: najpierw trinket 1, potem trinket 2, potem inne sloty w kolejności
slotów; za nimi włączone mikstury i runa (w kolejności z panelu). Pierwszy jest pod `Z`, następne pod
`X`, `C`, `V`, `B`, `N` (panel pokazuje przy nich „Item row: Z” itp.). Przy efekcie on-use pole
wyboru nazywa się „Use automatically (bot, simulator)” (podpowiedź: „Always available on the item
bar (Z X C V B N); tick to let the bot and the simulator use it, with the rule below”): zaznaczone
znaczy tylko tyle, że bot i Simulator używają go same według reguły z „Item use”; niezaznaczony
przedmiot nadal możesz użyć klawiszem. Domyślnie nic nie jest zaznaczone, więc bot nie używa Icon of
the Silver Crescent z „My gear” (wyniki domyślnego setupu bez zmian). Pasek ma 6 slotów; co się nie
mieści (najpierw odpadają mikstury i runa), nie trafia na pasek, nie działa, a panel ostrzega („not
on the item row”). Prawdziwy ekwipunek ma najwyżej 5 akcji (2 trinkety on-use, 2 mikstury, runa).
Procki i efekt przed walką trzeba włączyć; potem działają same. Przedmioty z paska używasz klawiszem
albo myszą, tak jak czarów.

| Przedmiot | Efekt | Cooldown |
|---|---|---|
| Destruction Potion | +120 spell power i +2% krytyka przez 15 s | 2 min, wspólny z Super Mana Potion |
| Super Mana Potion | 1800-3000 many | 2 min, wspólny z Destruction Potion |
| Dark Rune | 900-1500 many (koszt 600-1000 zdrowia nie jest liczony) | 2 min, własna grupa run |
| Icon of the Silver Crescent (gdy noszony; przykład trinketu on-use) | +155 spell power przez 20 s | 2 min; trinkety tej samej kategorii czekają 20 s |

- **Dzielone cooldowny:** mikstury mają jeden wspólny cooldown (jedna mikstura na 2 min: burst
  albo mana), runy jeden, a użycie trinketu blokuje trinkety tej samej kategorii (jak w wowsims:
  zwykle 20 s albo 15 s; 10 trinketów on-use nie ma kategorii i nie blokuje innych). Krótszy wspólny
  cooldown nigdy nie skraca dłuższego, który już biegnie. Slot pokazuje większy z cooldownów,
  od 100 s w minutach („2m”), poniżej w sekundach („99s”).
- **Bez GCD:** przedmiot działa od razu, nie uruchamia GCD ani zasady pięciu sekund i nie
  kosztuje many. Nie da się go użyć w trakcie rzucania czaru: poza oknem kolejki slot pokazuje
  „Busy”, w ostatnich 400 ms casta przedmiot trafia do kolejki i działa tuż po końcu casta. Używaj
  go między castami.
- Buffy z przedmiotów widać w panelu **Your buffs** (np. „Destruction Potion 15s”, „Icon of the
  Silver Crescent 20s”) z ikoną przedmiotu. Bot też używa przedmiotów (reguły w panelu Priority):
  trinkety on-use i Destruction Potion w trakcie Heroismu, a po nim przy każdym gotowym cooldownie (bez Heroismu: od początku
  walki i przy każdym gotowym cooldownie), Super Mana
  Potion przy braku co najmniej 3000 many, Dark Rune przy 1500. To wskazówki, nie optimum.

## „Your buffs”

W prawym górnym rogu areny (Fight) jest **Your buffs** z buffami Twojej postaci w trwającej
walce. Ma trzy części:

1. **Aktywne:** każda aura na postaci (Heroism/Bloodlust, Destruction Potion, Icon of the Silver
   Crescent, proc Band of the Eternal Sage) z ikoną (nazwa i opis w podpowiedzi), liczbą stacków
   lub ładunków i pozostałym czasem. Poniżej 10 s czas ma jedno miejsce po przecinku („4.3s”). W
   ostatnich 5 s czas jest pogrubiony i czerwony, a ikona pulsuje (bez pulsowania, gdy system ma
   włączone ograniczenie animacji). Czas nigdy nie wychodzi poza koniec walki. Ukryty
   wewnętrzny cooldown Banda nie jest pokazywany. Gdy nic nie działa: „No active buffs”.
2. **Upcoming:** aury zaplanowane w ustawieniach walki, które jeszcze nie weszły (Heroism o
   ustawionej sekundzie): przed startem „at 8.0 s”, w trakcie walki odliczanie „in 4.9 s”. W
   chwili wejścia aura przechodzi do aktywnych. Start po końcu walki nie jest pokazywany.
3. **Setup buffs:** drugi rząd małych ikon stałych buffów z setupu (buffy rajdowe i grupowe,
   flaski, eliksiry, jedzenie, olejki); nazwa i opis w podpowiedzi. Debuffy celu, Heroism,
   przedmioty i Band nie są tu liczone.

Pokazuje setup **trwającej** walki (jak notka w Setup): zmiany widać od razu tylko przed startem,
a w trwającej walce dopiero po `R`. Czytnik ekranu czyta każdy wpis jako „Nazwa, N seconds left”.
Nic w nim nie przejmuje klawiszy.

## Combat text (HUD)

Nad areną unoszą się teksty jak w addonie MikScrollingBattleText (własna implementacja inspirowana
jego funkcjami):

- **Outgoing** (po prawej, nad celem): Twoje obrażenia w kolorze szkoły, krytyki większe z „!” i
  krótkim „pop”, ticki DoT mniejsze i jaśniejsze, pudła „Miss”.
- **Notifications** (po lewej, w pasie u dołu areny, pod debuffami celu i nad paskami postaci): buff włączony „+Heroism / Bloodlust” (zielony)
  i wygasły „-Heroism / Bloodlust” (czerwony), proc „Band of the Eternal Sage!” (złoty), zysk many
  „+1,622 Mana” (niebieski; regeneracja nie, drobne zyski łączone), użycie przedmiotu „Destruction
  Potion”, gotowy cooldown „Curse of Doom ready” i „Low Mana” po zejściu poniżej progu. Debuffy
  na celu (opcjonalnie) pokazują „+Nazwa” tylko przy nałożeniu, nie przy każdym odświeżeniu.

Panel **Combat text** (pod panelem Gear, zwinięty) ustawia: cały HUD (`Show combat text`), każdą
kategorię osobno (debuffy na celu domyślnie wyłączone), animację (`Straight up` prosto w górę albo
`Parabola` po łuku), czas życia tekstu, rozmiar czcionki i krytyków, ikony i nazwy czarów, próg
obrażeń, scalanie ticków i drobnych zysków many, limit tekstów na ekranie (krytyki i proce nigdy nie
giną, poza zalewem powyżej 100 oczekujących) i próg „Low Mana”. Pola liczbowe przyjmują wartość z zakresu od razu, a poza zakresem jest
przycinana po wyjściu z pola; `Reset combat text to defaults` przywraca domyślne. Zmiany działają od
razu, także w trwającej walce, i są zapamiętane w przeglądarce (osobno od setupu). Klawisze wpisane w
pola liczbowe i listę wyboru nie rzucają czarów.

HUD tylko czyta walkę: wynik, log i DPS są identyczne z HUD i bez niego. Wyłączysz go
odznaczając `Show combat text`. Jest dekoracją (czytnik ekranu go pomija, nie łapie kliknięć); przy
systemowym ograniczeniu animacji teksty nie przesuwają się, tylko pojawiają się i gasną. Reset (`R`)
czyści ekran, a po końcu walki nie pojawiają się nowe teksty (te na ekranie dogasają; ostatnie
zdarzenia z chwili końca, np. tick Curse of Doom w 60. sekundzie, jeszcze się pokazują). Po powrocie
do karty, która była w tle, pojawia się tylko to, co jeszcze zmieściłoby się w czasie życia tekstu.

Ograniczenia: nie ma osobnego włączania obszarów (tylko kategorie) ani ustawienia szybkości (tekst
przebiega swoją drogę w ustawionym czasie życia).

## Setup: buffy, przedmioty, rotacja, walka

Sekcje **Buffs & consumables**, **Items & cooldowns**, **Rotation**, **Fight settings** i
**Warlock options** trybu Setup (dawniej jeden zwijany panel Setup) ustawiają następną walkę:

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
    Preset zachowuje Twój ekwipunek: Icon i Band działają tylko, gdy je nosisz.
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
  - Items and cooldowns: Destruction Potion, Super Mana Potion, Dark Rune oraz efekty
    noszonych przedmiotów (dla „My gear”: Icon of the Silver Crescent, zawsze na pasku Items,
    zaznaczony „Use automatically” także dla bota, i Band of the Eternal Sage, proc losowany w
    walce, nic nie wciskasz); patrz „Pasek przedmiotów” wyżej.
    Heroism jest w grupie Fight.
  - Warlock options: Fel Armor albo Demon Armor, poświęcony Succubus.
- **Rotacja:** presety rotacji „DoT rotation” (domyślna) i „Shadow Bolt spam + curse” (jak w
  logu). Do tego klątwa, Immolate, Corruption, Shadowburn na koniec walki i próg many dla Life
  Tapa („Auto” albo liczba). Karta „Priority of the next fight” pod spodem pokazuje listę priorytetów dla tych ustawień.
  Wybór presetu rotacji nie zmienia reguł użycia przedmiotów (poniżej).
- **Item use** (w grupie Rotation): kiedy bot (i Simulator) używa każdego włączonego przedmiotu z
  paska Items (Destruction Potion, Super Mana Potion, Dark Rune, trinkety on-use z gearu z
  zaznaczonym „Use automatically”; tylko te, choć niezaznaczone trinkety też są na pasku). Jeden wiersz na przedmiot: wyzwalacz („Whenever ready”, „At the pull only”, „From a
  second on”, „With Heroism”, „While a buff is up” z wyborem buffa: Heroism albo buff innego
  włączonego przedmiotu, „Mana below”, „Mana missing”, „In the last seconds”, „Never (bot)”) z
  parametrem, opcjonalne okno „Not before / Not after (s)”, strzałki kolejności (wyżej = ważniejszy)
  i „Reset” wiersza, a pod listą „Reset all item rules to default”. Domyślne reguły to dawne
  zachowanie bota (burst z Heroismem, a bez Heroismu gdy gotowy; mana-itemy, gdy brakuje ich
  największego zysku), z identycznymi logami. Własne reguły są częścią setupu: preset pokazuje
  wtedy „Custom” i dopisek, który preset pasuje poza regułami. Presety setupu i rotacji zachowują
  reguły. Minimalnego odstępu (`minGapSec`) nie ma w edytorze: w modelu bez pamięci działa tylko
  w obrębie cooldownu przedmiotu, więc prawie nic nie zmienia (`docs/data-sources.md`, Part H).
- **Odległość od celu** (yd, domyślnie 28 jak w logu): Shadow Bolt leci 20 yd/s, czyli 1,4 s przy
  28 yd. Odległość wpływa też na moment Shadowburna na koniec walki.
- **„Stats at the pull”**: statystyki następnej walki przed buffami czasowymi.

Zmiany działają od **następnej** walki. Trwająca walka zachowuje swój setup (panel to pokazuje),
nową zaczynasz klawiszem `R`. Ustawienia zapisują się w `localStorage` przeglądarki pod kluczem
`rotation-trainer:setup:v1`. Uszkodzone lub stare dane są poprawiane albo zastępowane domyślnymi.
Jeśli przeglądarka nie pozwala zapisać, ustawienia działają do zamknięcia karty.

## Gear

Sekcja **Setup → Gear** ustawia ekwipunek następnej walki: sloty jak w oknie postaci, wybrany slot
w karcie przedmiotu (gemy, enchant, set, „Change…” i „Clear”), import i eksport w okienkach. Baza
przedmiotów (1730 przedmiotów, 214 gemów, 128 enchantów z wowsims) ładuje się dopiero przy pierwszym
otwarciu sekcji albo od razu po starcie, jeśli zapisany ekwipunek jej potrzebuje. Do tego czasu walka używa
Twojego ekwipunku z eksportu („My gear”), nigdy niepełnego zestawu. Gdy ładowanie się nie uda,
panel pokazuje błąd i przycisk „Reload the page” (przeglądarka nie pobierze ponownie raz nieudanego
modułu, więc pomaga tylko przeładowanie strony; setup jest zapisany).

- **Presety:** „My gear (export)” (ekwipunek autora, domyślny), „Pre-Raid”, „T4”, „T5”, „T6”,
  „Zul'Aman” i „Sunwell Plateau” (zestawy BIS z wowsims). Wciśnięty jest preset, który dokładnie
  pasuje do ekwipunku; po każdej zmianie slotu widać „Custom”. Pod przyciskami jest notatka presetu
  (np. Stormcaller zamieniony na Blade of the Archmage, bo postać to Gnome). Presety zmieniają tylko
  ekwipunek. Presety panelu Setup („None”, „Raid as in my log”) **zachowują** ekwipunek, a
  „Reset to defaults” przywraca też „My gear”.
- **Sloty:** 17 slotów z ikoną, nazwą, statystykami, gniazdami (kolorowe kółka z ikoną gemu),
  bonusem za gniazda (aktywny albo nieaktywny, gdy kolory nie pasują) i enchantem. „Change”
  otwiera listę przedmiotów slotu: wyszukiwanie po nazwie, filtr fazy („Up to phase N”), sortowanie
  od najnowszej fazy, znaczniki „Horde only”, profesji, „Effect: Setup panel” i „Effect not
  modelled”. Przedmioty, które mają tylko niezamodelowany efekt, są ukryte za przełącznikiem. Drugi unikalny przedmiot (np. ten
  sam pierścień w obu slotach) jest odrzucany z komunikatem. Staff zajmuje obie ręce. „Clear”
  opróżnia slot.
- **Gemy i enchanty:** kliknięcie gniazda otwiera listę gemów (meta tylko w gnieździe meta; filtr
  koloru, „Matches the socket” dla bonusu), kliknięcie enchantu listę enchantów pasujących do slotu.
  Gemy i enchanty bez statystyk, które trener liczy, są ukryte. Linia „Meta gem” mówi, czy wymaganie
  meta gemu jest spełnione (nieaktywny meta gem nic nie daje).
- **Efekty przedmiotów:** linia „Item effects” pod presetami wymienia zamodelowane efekty
  noszonego ekwipunku (a podpowiedź każdego presetu jego efekty); włącza się je w Setup, „Items and
  cooldowns”. W liście przedmiotów znacznik „Effect: Setup panel” oznacza efekt zamodelowany,
  „Effect not modelled” niezamodelowany (przedmiot może mieć oba).
- **Uwagi:** efekty przedmiotów i bonusy setów, których trener nie modeluje, wymagane profesje,
  przedmioty hordy oraz podpowiedź przy każdym noszonym efekcie, który nie jest włączony w Setup
  (dla efektu on-use: jest na pasku Items, ale bot i Simulator go nie używają). Panel „Set bonuses”
  pokazuje też bonusy niezamodelowane (np. Corruptor Raiment 4-piece, oznaczony „Not modelled”).
- **Import z WowSimsExporter:**
  1. W grze wpisz `/wse export` (addon WowSimsExporter): okno pokaże zaznaczony tekst, skopiuj go `Ctrl+C`.
  2. W panelu Gear rozwiń „Import” i wklej tekst (albo plik `*.gear.json` z wowsims).
  3. Przeczytaj raport: ile slotów wypełniono, ostrzeżenia, nieznane ID przedmiotów, gemów i
     enchantów. Talenty z eksportu nie są tu stosowane: wklej ten sam eksport w panelu Talents.
  4. Kliknij „Apply import”. Przycisk działa tylko, gdy coś da się założyć.
- **Eksport:** „Export” pokazuje ekwipunek jako plik gear wowsims (ID przedmiotów); „Copy” kopiuje
  go do schowka (albo zaznacza tekst do skopiowania `Ctrl+C`).

Ekwipunek zapisuje się razem z setupem. Zmiana działa od następnej walki: walka, która się nie
zaczęła, bierze ją od razu, trwająca zachowuje swój ekwipunek do `R` (panel to pokazuje, a notka pod
DPS podaje „Gear: …” walki). „Stats at the pull” pokazuje statystyki z nowym ekwipunkiem od razu.
Pisanie w polach wyszukiwania, importu i eksportu nie uruchamia skrótów klawiszowych.

## Talents

Sekcja **Setup → Talents** ustawia talenty następnej walki (od 1280 px trzy drzewa obok siebie). Domyślnie to build
autora z eksportu („My build (export)”, 0/21/40).

- **Drzewka:** trzy drzewa (Affliction, Demonology, Destruction) jedno pod drugim, talenty w
  siatce wierszy i kolumn jak w grze, z ikoną i rangą „r/max”. Kliknięcie (albo `Enter`/`Spacja`
  na talencie) dodaje punkt, prawy klik albo `Shift+Enter` odejmuje; na telefonie służą do tego
  przyciski „−” i „+” w karcie talentu. Linie łączą talent z wymaganym talentem (prerequisite).
  Nad drzewami: punkty per drzewo i pozostałe (np. „0 / 21 / 40 · 0 left”).
- **Blokady:** nie da się wziąć talentu bez 5 punktów na każdy wiersz powyżej w tym drzewie, bez
  wymaganego talentu na pełnej randze ani ponad 61 punktów; nie da się też odjąć punktu, od którego
  zależy inny talent albo bez którego talent niżej straciłby wymagane punkty wiersza. Powód widać w linii stanu panelu (i w nazwie przycisku dla czytników ekranu).
- **Karta talentu:** po najechaniu (albo fokusie) pokazuje opis obecnej i następnej rangi (opisy
  ładują się osobno przy pierwszym otwarciu panelu) oraz czy talent jest zamodelowany.
  Niezamodelowane talenty mają znak „!” i przerywaną ramkę; podsumowanie mówi, ile punktów buildu
  trener modeluje, a lista „Not modelled talents” podaje powody. Gdy rotacja z Setup ma krok, którego
  build nie ma (np. Shadowburn finisher bez Shadowburn), panel to pokazuje, a krok jest pomijany.
- **Presety:** „My build (export)” oraz buildy z wowsims: „Destruction”, „Destro/Nightfall”,
  „Affliction”, „Demo/Ruin”, „Demonology Felguard” (wowsims ma jeden build na wszystkie fazy).
  Wciśnięty jest preset równy buildowi, inaczej „Custom”. „Reset to my build” przywraca build autora.
  Presety panelu Setup zachowują talenty, a „Reset to defaults” przywraca build autora.
- **Import:** wklej ciąg talentów (np. `-20500301332101-50500051220051053105` z wowsims) albo cały
  eksport WowSimsExporter (`/wse export`). „Apply talents” działa tylko dla poprawnego buildu;
  błędny ciąg pokazuje listę naruszeń i nic nie zmienia.
- **Eksport:** pełny ciąg talentów (format WowSimsExporter), „Copy talent string” kopiuje go do
  schowka (albo zaznacza tekst do `Ctrl+C`).

Talenty zapisują się razem z setupem. Zmiana działa od następnej walki: walka, która się nie
zaczęła, bierze ją od razu, trwająca zachowuje swoje talenty do `R` (notka pod DPS podaje
„Talents: …” walki). „Stats at the pull”, lista Priority i symulator używają nowego buildu od razu,
pasek akcji razem z walką, która go używa: z talentem Conflagrate slot `8` to Conflagrate (bot go nie używa,
rzucasz go sam, gdy Immolate jest na celu). Pisanie w polach importu i eksportu nie uruchamia
skrótów klawiszowych.

## Skrypty rotacji

Tryb **Script** w Setup → Rotation zastępuje stałe pola konfiguratora listą reguł z warunkami (jak
APL): bot, Simulator i podpowiedź „Next by the script” grają pierwszą regułę, której warunek jest
prawdziwy i której akcję gra przyjmie; akcja odrzucona (cooldown, brak many) przechodzi do
następnej reguły. Dopóki skrypt ma reguły, gra **zamiast** rotacji podstawowej (napis „Script
active”, ustawienia trybu Basic są wtedy wyszarzone i czekają).

- **Reguła**: włącznik, akcja (`Cast` czaru, `Use` przedmiotu, np. `item:29370` albo
  `destruction-potion`, `Wait`: nic nie rób, gdy warunek jest prawdziwy), id z listy czarów i
  przedmiotów buildu (albo „Other id…” i pole tekstowe), warunek, a pod „…” etykieta i komentarz.
  Strzałki zmieniają kolejność, są też „Duplicate” i „Delete”. Pusty warunek = zawsze. Liczba po
  prawej to średnia odpaleń reguły na walkę z ostatniej symulacji tego samego setupu.
- **Warunki** to tekst: `&&`, `||`, `!`, nawiasy, porównania, liczby, np.
  `heroism.active && target.aura.shadow-vulnerability.active` albo `use.item:281735.count >= 1`
  (sekwencja: trinket 2 po trinkecie 1). Pełna gramatyka i lista zmiennych:
  `docs/scenario-format.md` i `docs/data-sources.md`, „Part J”. Panel **Variables and Ids** obok
  szuka zmiennych, funkcji i id buildu; „Insert” wstawia tekst w miejsce kursora ostatniego warunku.
- **Walidacja na żywo**: błąd składni pod polem z pozycją („rules[0].if: column 7: …”), nieznane id
  jako ostrzeżenie z podpowiedzią („Did you mean “immolate”?”); reguła z błędem albo nieznanym id
  jest pomijana (lista „Priority of the next fight” pokazuje, co naprawdę gra). U góry licznik
  „N errors, M warnings”.
- **Named Conditions** (`defs`): warunek pisany raz i używany jako `$nazwa` (bez cykli).
- **Convert From Basic Rotation** zamienia rotację podstawową (z regułami przedmiotów) w równoważny
  skrypt: te same walki, krok w krok (gdy skrypt już jest, najpierw pyta). **Clear Script…** wraca
  do rotacji podstawowej (pyta). **Edit as JSON** pokazuje cały skrypt jako tekst; „Apply JSON”
  działa tylko dla poprawnego skryptu.
- Skrypt jest częścią setupu (zapis w `rotation-trainer:setup:v1`) i działa od następnej walki
  (walka, która jeszcze się nie zaczęła, bierze go od razu). Pisanie w polach nie uruchamia skrótów.

## Scenariusze (Setup → Scenarios)

Scenariusz to plik JSON (`rotation-trainer.scenario`, wersja 1): nazwa, opis, skrypt i opcjonalnie
setup (gear, talenty, buffy, ustawienia walki, opcje klasy). Biblioteka w przeglądarce (osobny klucz
`rotation-trainer:scenarios:v1`, do 100 scenariuszy):

- **Save Current as Scenario…**: nazwa, opis i „Include the setup”. Bez aktywnego skryptu zapisuje
  rotację podstawową przekonwertowaną na skrypt.
- **Apply…** pyta i mówi, co zastąpi (rotację, a z „Also apply its setup” także gear, talenty,
  buffy…); pokazuje też ostrzeżenia scenariusza wobec bieżącego setupu. Każde pole setupu
  scenariusza zastępuje całe pole bieżącego setupu: scenariusz z `"enabledBuffs": ["heroism"]`
  zostawia włączony tylko Heroism (bez raid buffów, które były włączone).
- **Export…**: „Copy JSON” albo „Download File”. **Import Scenario…**: wklej tekst albo wybierz plik
  (do 200 000 znaków); raport walidacji (błędy blokują zapis, ostrzeżenia nie) i podgląd przed
  „Save to Library”. Pliki są traktowane jako niezaufane (limity rozmiaru i głębokości, bez `eval`).
- **Duplicate**, **Rename…**, **Delete…** (pyta). **Examples**: przykłady z `docs/scenarios/`
  (m.in. „Pipe, then Icon”: trinket 1 w Heroismie z Improved Shadow Bolt, potem trinket 2).
- Gdy przeglądarka nie pozwala zapisać, panel mówi „Not saved…”; biblioteka działa wtedy do
  przeładowania strony (wyeksportuj, co chcesz zachować).

**Scenariusz od agenta AI:** daj agentowi `docs/scenario-format.md` (format, zmienne, id, przykłady,
gotowy szablon prośby) i `docs/scenario.schema.json`. Agent może sam sprawdzić plik bez przeglądarki:
`npm run scenario:validate -- plik.json`, `npm run scenario:run -- plik.json --runs 1000 --seed 1`
i `npm run scenario:compare -- a.json b.json`. Gotowy plik wklej w „Import Scenario…”.

## Porównanie scenariuszy (Report → Compare)

Zaznacz 2-5 pozycji: „Current setup” i scenariusze z biblioteki (każdy gra na bieżącym setupie z
własnymi częściami setupu, jak „Apply” z „Also apply its setup”). Pierwsza (pole **Baseline**) to
punkt odniesienia. Runs, Seed, „Compare N Scenarios”, Cancel i pasek postępu działają jak w
Simulatorze (Web Worker, migawka z chwili kliknięcia).

- **Te same ziarna**: walka nr i każdego scenariusza ma to samo ziarno, więc różnice są
  **sparowane** i dużo dokładniejsze niż porównanie dwóch osobnych symulacji.
- **Tabela**: ranking, średni DPS, σ, SEM, **Δ vs baseline**, błąd standardowy różnic
  sparowanych, 95% przedział Δ i werdykt („Better/Worse (significant)”, gdy przedział nie obejmuje
  0, inaczej „No clear difference”). Pod spodem histogramy obok siebie i średnie odpalenia każdej
  reguły na walkę.
- **Zastrzeżenie**: każdy scenariusz to osobny test wobec bazowego, bez poprawki na wielokrotne
  porównania: przy 4 testach szansa, że któryś „istotny” werdykt jest przypadkiem, to około 19%.
  Zaskakującego zwycięzcę sprawdź jeszcze raz innym ziarnem albo większą liczbą walk.
- Scenariusz z błędem wobec bieżącego setupu blokuje Run i ma link do Scenarios. Ostatni wynik
  zostaje po przejściu do innej zakładki lub trybu (do przeładowania strony).
- Porównanie odpowiada na pytanie „który **cały** scenariusz daje więcej DPS”: scenariusze z innym
  gearem, buffami albo długością walki różnią się też tym. Żeby zmierzyć jedną zmianę reguły, zostaw
  resztę bez zmian (np. dwa scenariusze bez części setupu albo z tym samym setupem).

## Podgląd walki i kluczowe walki (Report)

- **Fight source** (nad zakładkami): **Last Played Fight** (ostatnia zagrana walka), **Highest DPS**,
  **Typical** (DPS najbliższy średniej; remis: mniejszy numer przebiegu) i **Lowest DPS** ostatniej
  symulacji w tej sesji, oraz **History…**. Każda opcja pokazuje DPS i ziarno („seed 3100366287,
  run #107”). Walka z symulacji jest **odtwarzana** na żądanie z migawki ustawień symulacji (nie z
  bieżącego setupu), więc jej log i DPS są bit w bit takie jak w symulatorze; logów symulacji nie
  trzymamy. Wybrana walka napędza wszystkie zakładki walki (Damage, Timeline, Log, Rotation).
  Walka z symulacji to walka bota, więc zamiast „% of the bot” nagłówek pokazuje **odchylenie od
  średniej symulacji w σ** (np. „+3.1σ from the simulation’s mean”). Wynik bez kluczowych walk
  (sprzed tej funkcji) ma opcje nieaktywne z podpowiedzią „Run the simulation again”. Koniec nowej
  walki przełącza z powrotem na zagraną walkę.
- **Timeline → Moment by moment**: tory i wykres DPS na górze to przegląd z **kursorem** (klik
  wybiera sekundę, pasek pokazuje ją na obu). Suwak „Second”: ←/→ ±1 s, Shift ±5 s, Home/End; pole
  „Go to (s)” (12.4 s to sekunda 12); przyciski „Jump to” (następna/poprzednia zmiana aury, użycie
  przedmiotu, crit, odrzucenie z kolejki). Panel sekundy N (okno [N, N+1) s, wszystko z logu):
  obrażenia sumą i per czar (trafienia, crity, chybienia, tiki), rozpoczęte, ukończone i przerwane
  casty z czasem rzucania, kolejka (z powodem odrzucenia), użyte przedmioty, zyski many (Life Tap,
  mikstury, regeneracja), zmiany aur (↑ up, ↻ refresh, ↓ down) i aury aktywne na początku sekundy
  (Twoje i na celu, z pozostałym czasem). Log nie zapisuje many na koniec sekundy ani stacków, więc
  ich nie pokazujemy. Przy zagranej walce wiersz „Bot: …” mówi, co bot zrobił w tej samej sekundzie
  (to samo ziarno i setup). **All seconds**: wirtualizowana lista wszystkich sekund (DPS dotąd,
  obrażenia, najmocniejszy czar, ikony buffów), filtry Damage / Auras / Items / Drops i wyszukiwanie
  po nazwie; klik ustawia kursor. Zdarzenia przed pullem liczą się w sekundzie 0 (z oznaczeniem).
- **Eksport**: „Copy This Second” i „Copy Fight Log (CSV)” (kolumny: second, damage, casts, auras
  up, auras down, items, mana) kopiują do schowka, np. do wklejenia agentowi AI.
- **History… (panel Fights)**: każda zagrana walka (z logiem; 20 najnowszych w ≤ 1,5 MB) i kluczowe
  walki każdej symulacji (jako odnośniki: ziarno, numer przebiegu, migawka ustawień; 10 najnowszych
  symulacji) są zapisywane pod osobnym kluczem `rotation-trainer:history:v1` i przeżywają
  przeładowanie strony. **Highest DPS**: top 10 po DPS z filtrami (wszystkie / zagrane / symulacje,
  ta sama długość walki — domyślnie włączone, bo DPS zależy od długości — i ten sam gear z
  talentami). Klik „Open” otwiera walkę w tych samych zakładkach. Na liście: Pin (przypięta walka
  nigdy nie wypada z limitu), Rename, Remove (z potwierdzeniem). Gdy przeglądarka odmówi zapisu
  (pełny storage), Report pokazuje komunikat, a historia żyje do przeładowania.
- **Setup Used** (przycisk nad zakładkami): migawka ustawień pokazywanej walki z chwili jej startu:
  17 slotów (przedmiot, gemy, enchant, socket bonus), bonusy zestawów, efekty przedmiotów, „Stats at
  the pull” tej walki, talenty z rangami (niezamodelowane oznaczone), buffy i consumables, priorytet
  z regułami przedmiotów (przy walce z symulacji: średnie odpalenia reguł), długość, odległość,
  opcje klasy i ziarno. **Use This Setup…** (z potwierdzeniem) robi z migawki bieżący setup tą samą
  drogą co każda edycja (normalizacja, zapis), żeby odtworzyć i poprawiać walkę z historii. Gdy gear
  wymaga bazy przedmiotów, a ta się wczytuje, panel pokazuje stan ładowania.

## Symulator

Zakładka **Report → Simulator** gra setup **następnej walki** (gear, talenty, buffy, rotacja z
regułami przedmiotów, długość walki, odległość) wiele razy botem i pokazuje średni DPS.

- **Runs**: liczba walk, 1-100 000 (domyślnie 1000; poza zakresem poprawiane przy wyjściu z pola).
  Obok szacunek czasu: około 1,2 ms na 60-sekundową walkę w tle (dłuższa walka i więcej przedmiotów
  trwa dłużej; 100 000 walk to około 2 min).
- **Seed**: puste pole = losowe ziarno, pokazane przy wyniku („Reuse seed” wpisuje je do pola).
  Ten sam seed, liczba walk i setup dają zawsze ten sam wynik.
- **Run / Cancel**: liczy w Web Workerze, więc gra i panele działają normalnie w trakcie. Pasek
  postępu, tekst postępu najwyżej raz na sekundę. Cancel przerywa i zostawia poprzedni wynik. Run
  bierze **migawkę** setupu z chwili kliknięcia: zmiany w trakcie liczenia nie wpływają na wynik,
  a wynik ma opis ustawień, z których powstał (gear, preset setupu, rotacja, reguły przedmiotów,
  długość walki, okno kolejki, liczba walk, seed). Gdy przeglądarka nie uruchomi workera, liczy w
  głównym wątku małymi porcjami (ten sam wynik). Kod symulatora wczytuje się dopiero przy
  pierwszym Run (osobny plik), więc nie spowalnia startu strony.
- **Wynik**: średni DPS, σ, błąd standardowy średniej, 95% przedział ufności średniej, min, max,
  mediana, percentyle 5/25/75/95, histogram, tabela czarów (udział, obrażenia, rzuty, crit, miss),
  średnie użycia przedmiotów, uptime DoT-ów i buffów, zużyta mana i liczba Life Tapów. „Copy
  result” kopiuje wynik jako tekst (bez schowka: tekst zaznaczony do skopiowania). Wynik nie jest
  zapisywany (jego kluczowe walki trafiają do historii, „History…” w Report).
- **Co znaczy ±**: **σ** (odchylenie standardowe) to rozrzut pojedynczych walk: około 2/3 walk
  mieści się w średnia ± σ, 95% w ± 2σ; więcej walk go nie zmniejsza. **Błąd standardowy** średniej
  (σ/√runs) mówi, jak dokładnie znamy średnią: 4× więcej walk to 2× mniejszy błąd. Dwa setupy
  porównuj średnimi; różnica mniejsza niż około 2·√(SE₁² + SE₂²) to szum.
- **Ograniczenia**: bot gra listę priorytetów z idealnym refleksem (kroki 10 ms, okno kolejki
  400 ms), jeden cel, bez ruchu i zdrowia, bez efektów, których trener nie modeluje. Wynik służy do
  porównywania konfiguracji, nie jest bezwzględną prognozą DPS. Gear wymagający bazy przedmiotów
  czeka, aż baza się wczyta.

## Co jest modelowane

- GCD i czasy rzucania skrócone przez haste, kolejka czarów 400 ms (UNVERIFIED: wartość z
  wowsims, niepotwierdzona dla klienta Anniversary)
- DoT-y (Immolate, Corruption, klątwy) z odświeżaniem bez podwójnych ticków; jedna klątwa na cel
- Improved Shadow Bolt (debuff +20% shadow, 4 ładunki)
- mana, regeneracja co 2 s, zasada pięciu sekund, Life Tap
- Malefic Raiment 4pc (+6% Shadow Bolt i Incinerate), Voidheart Raiment 2pc i 4pc (proc +135
  shadow/fire, Corruption i Immolate o jeden tick dłużej), Mana-Etched Regalia, Spellstrike
  Infusion i inne bonusy setów z presetów (lista w `docs/data-sources.md`, „Part E: gear”)
- ekwipunek: przedmioty, klejnoty, bonusy za gniazda, enchanty, meta gem (z wymaganiem kolorów),
  bonusy setów z bazy wowsims (część niezamodelowana, oznaczona w panelu Gear)
- talenty z panelu Talents: 24 zamodelowane (m.in. Bane, Cataclysm, Devastation, Ruin, Emberstorm,
  Shadow and Flame, Demonic Sacrifice, Suppression, Improved Corruption, Shadow Mastery; tabela w
  `docs/data-sources.md`, „Part I: talents”)
- czas lotu Shadow Bolta i Incinerate (od odległości od celu); pocisk, który nie doleci przed
  końcem walki, się nie liczy
- buffy, debuffy celu, consumables, Heroism i efekty noszonych przedmiotów (procki na cast, hit
  albo crit z szansą i ICD, efekt przed walką), gdy są włączone w panelu Setup
- przedmioty używane z paska Items (mikstury, Dark Rune, trinkety on-use z ekwipunku, które są
  na pasku zawsze) z własnymi i dzielonymi cooldownami (kategorie jak w wowsims); bot i Simulator
  używają tylko włączonych
- długość walki 10-600 s

## Czego DPS nie uwzględnia

Wynik jest przybliżony. Buffy rajdowe, consumables i efekty noszonych przedmiotów (procki, np.
Band of the Eternal Sage) liczą się tylko wtedy, gdy włączysz je w panelu Setup (domyślnie
wyłączone); przedmioty z paska Items dopiero wtedy, gdy ich użyjesz. Nigdy nie są liczone: koszt zdrowia Life Tap i Dark Rune (trener nie
modeluje zdrowia), bonus Incinerate przy Immolate, redukcja odporności z Curse of the Elements,
efekty przedmiotów z listy „Not modelled effects of your gear” (obrażenia, leczenie, mana, stacki,
procki PPM i na tick DoT) oraz
część bonusów setów (np. Corruptor Raiment, Wrath of Spellfire; panel Gear wypisuje te, które nosisz). Nie ma też
sprawdzania zasięgu: Shadowburn działa z 28 yd. Talenty: 40 z 64 nie jest zamodelowanych (pet,
czary spoza modelu jak Unstable Affliction czy Shadowfury, Nightfall; panel Talents podaje powód),
a bot nie rzuca Conflagrate, więc buildy z takimi talentami (Affliction, Demonology) i z
Conflagrate wychodzą niżej niż w grze. Domyślne założenia, zmienialne w Warlock options:
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
- Panel buffów gracza: specyfikacja `docs/superpowers/specs/2026-10-30-player-buffs-panel-design.md`,
  plan `docs/superpowers/plans/2026-10-30-player-buffs-panel.md`
- Etap 2a (gear): specyfikacja `docs/superpowers/specs/2026-10-30-gear-stage-2a-design.md`, plan
  `docs/superpowers/plans/2026-10-30-gear-stage-2a.md`; źródła, filtry, presety, import i
  uproszczenia: `docs/data-sources.md`, „Part E: gear”
- Etap 2b (talenty): specyfikacja `docs/superpowers/specs/2026-11-03-talents-stage-2b-design.md`,
  plan `docs/superpowers/plans/2026-11-03-talents-stage-2b.md`; tabela efektów talentów, powody
  niezamodelowanych, presety i uproszczenia: `docs/data-sources.md`, „Part I: talents”
- Skrypty rotacji, scenariusze i porównania: specyfikacja
  `docs/superpowers/specs/2026-11-03-rotation-scripts-and-scenarios-design.md`, plan
  `docs/superpowers/plans/2026-11-03-rotation-scripts-and-scenarios.md`; format scenariusza dla ludzi
  i agentów AI: `docs/scenario-format.md`, schemat `docs/scenario.schema.json`, przykłady
  `docs/scenarios/`; gramatyka, zmienne i statystyka: `docs/data-sources.md`, „Part J”
- Podgląd walki sekunda po sekundzie, kluczowe walki, historia i ranking: specyfikacja
  `docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md`, plan
  `docs/superpowers/plans/2026-11-05-fight-timeline-and-key-fights.md`; powtórka walk: `docs/data-sources.md`, „Part K”
- Źródło każdej liczby (wowsims, Wowhead), założenia i otwarte pytania: `docs/data-sources.md`
- Decyzje projektowe (kolejka czarów): `docs/decisions/`

## Struktura projektu

| Katalog | Zawartość |
|---|---|
| `src/engine` | deterministyczna symulacja walki (bez Reacta): czas, zdarzenia, czary, aury, mana, statystyki, ekwipunek |
| `src/data` | dane gry: współczynniki, cel, katalog buffów, Destruction Warlock (czary, aury, talenty, przedmioty, zestawy, presety gearu, rotacja), baza przedmiotów (`src/data/items`) |
| `src/setup` | setup walki: domyślne ustawienia i ich walidacja, presety, zapis w `localStorage`, zamiana setupu na dane walki, walidacja gearu, import i eksport wowsims |
| `src/bot` | bot grający listę priorytetów (punkt odniesienia DPS) |
| `src/script` | język skryptów rotacji (bez Reacta): parser, walidacja, kompilator, konwerter z rotacji podstawowej |
| `src/scenarios` | format scenariusza, biblioteka i jej zapis, przykłady, CLI (`scenario:validate`, `scenario:run`, `scenario:compare`) |
| `src/sim-runner` | symulator wielu walk (bez Reacta): przebiegi, statystyki, odpalenia reguł, porównanie sparowane, Web Worker i jego klient |
| `src/ui` | interfejs React: `shell/` (nagłówek, router, skróty), `state/` (TrainerProvider, historia walk), `fight/` (arena, dock), `setup/` (sekcje, podsumowanie, ScriptEditor, ScenariosPanel), `report/` i `charts/` (raport, Moment by moment, Fights, Setup Used, ComparePanel, wykresy), `theme/` (tokeny, fonty, motyw) oraz edytory Setup (SetupPanel, GearPanel, TalentsPanel, ItemUseEditor, CombatTextSettings, SimulatorPanel) |
| `tests` | testy Vitest: `engine`, `data`, `bot`, `setup`, `script`, `scenarios`, `sim-runner`, `ui` oraz `smoke.test.ts` (`fixtures`: dane referencyjne, m.in. logi bota sprzed zmian) |


## WoW Forever: aplikacja web

Przeglądarkowy interfejs symulatora (domyślna trasa aplikacji, `#/forever/...`):

```bash
npm run dev      # tryb deweloperski
npm run build    # produkcyjny build (tsc + vite)
```

- **Symulacja**: ustaw level postaci (40-59) i uruchom; ranking 7 buildów (zabić/h, TTK, mana/HP na zabicie, picie, jedzenie, Life Tap, przerwy, zgony, GCD) z różnicą wobec najlepszego (sparowany przedział 95%) oraz krzywa kills/h po levelach 40-59.
- **Buildy**: talenty rozdane na wybranym levelu i kolejność punktów.
- **Rotacje**: listy priorytetów rotacji używanych przez symulator.
- **Porównanie**: dwa buildy head-to-head na wspólnych seedach, wykres 40-59.
- **Założenia**: lista parametrów oznaczonych `verify: true`.

Opcje zaawansowane: profil sprzętu, 1 lub 2 moby na pull, strategia Life Tapa i przerw, liczba sesji, seed. Obliczenia idą w Web Workerze (`src/forever/web/`), z fallbackiem na głównym wątku; widoki są w `src/ui/forever/`.
