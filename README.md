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

**Panel buffów gracza:** okienko **Your buffs** pod paskiem akcji pokazuje aktywne buffy z
pozostałym czasem, nadchodzący Heroism i stałe buffy z setupu.

**Etap 2a (gear):** panel **Gear** z bazą przedmiotów, gemów i enchantów z wowsims, presetami BIS
na każdą fazę (Pre-Raid, T4, T5, T6, Zul'Aman, Sunwell Plateau) oraz importem z addonu
WowSimsExporter i eksportem do formatu wowsims. Domyślny ekwipunek to nadal Twój eksport, z tymi
samymi wynikami co w etapie 1.

## Uruchomienie

Wymaga Node.js (z npm).

```sh
npm install        # zależności
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # wszystkie testy (Vitest)
npm run typecheck  # sprawdzenie typów (tsc)
npm run build      # typecheck + build produkcyjny do dist/
npm run preview    # podgląd builda z dist/: http://localhost:4173
npm run icons      # (tylko po dodaniu czarów, buffów lub przedmiotów) pobiera ikony do public/icons/spells/ i public/icons/items/
npm run db:build -- <katalog klonu wowsims/tbc-new>  # odtwarza bazę przedmiotów src/data/items/db.json
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
| `8` | celowo pusty: postać nie ma talentu Conflagrate |
| `Z`, `X`, `C`, `V`, `B`, `N` | 6 slotów paska przedmiotów **Items** (tylko włączone przedmioty; wielkość litery bez znaczenia, użycie przedmiotu też startuje walkę) |
| `Esc` | przerywa rzucanie (i czyści kolejkę, także zakolejkowany przedmiot; użycia przedmiotu nie cofa) |
| `Spacja` | start walki |
| `R` | reset walki |

Pasek: 1 Shadow Bolt, 2 Immolate, 3 Corruption, 4 Curse of the Elements, 5 Shadowburn,
6 Life Tap, 7 Incinerate, 9 Curse of Agony, 0 Curse of Doom. Na celu może być tylko **jedna**
klątwa: rzucenie innej zastępuje obecną (wybierz jedną).

Klawisze nie działają, gdy piszesz w polu tekstowym lub liczbowym panelu Setup (np. `Z` w polu
„Fight length (s)” nic nie używa).

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

Włączone efekty on-use, mikstury i runa pojawiają się na pasku **Items** pod paskiem czarów, w
kolejności z panelu: pierwszy włączony pod `Z`, następne pod `X`, `C`, `V`, `B`, `N` (przy każdym
włączonym panel pokazuje „Item row: Z” itp.). Pasek ma 6 slotów; siódmy włączony efekt nie trafia na
pasek, nie działa, a panel ostrzega („not on the item row”). Prawdziwy ekwipunek ma najwyżej 5
akcji (2 trinkety on-use, 2 mikstury, runa). Procki i efekt przed walką działają same. Używasz ich
klawiszem albo myszą, tak jak czarów.

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

## Panel „Your buffs”

Pod paskiem akcji (i paskiem Items) jest okienko **Your buffs** z buffami Twojej postaci w
trwającej walce. Ma trzy części:

1. **Aktywne:** każda aura na postaci (Heroism/Bloodlust, Destruction Potion, Icon of the Silver
   Crescent, proc Band of the Eternal Sage) z ikoną, nazwą, liczbą stacków lub ładunków,
   pozostałym czasem i paskiem. Poniżej 10 s czas ma jedno miejsce po przecinku („4.3s”). W
   ostatnich 5 s czas jest pogrubiony i czerwony, a ikona pulsuje (bez pulsowania, gdy system ma
   włączone ograniczenie animacji). Czas nigdy nie wychodzi poza koniec walki. Ukryty
   wewnętrzny cooldown Banda nie jest pokazywany. Gdy nic nie działa: „No active buffs”.
2. **Upcoming:** aury zaplanowane w ustawieniach walki, które jeszcze nie weszły (Heroism o
   ustawionej sekundzie): przed startem „at 8.0 s”, w trakcie walki odliczanie „in 4.9 s”. W
   chwili wejścia aura przechodzi do aktywnych. Start po końcu walki nie jest pokazywany.
3. **Setup buffs (N):** zwinięta lista ikon stałych buffów z setupu (buffy rajdowe i grupowe,
   flaski, eliksiry, jedzenie, olejki); nazwa i opis w podpowiedzi. Debuffy celu, Heroism,
   przedmioty i Band nie są tu liczone.

Panel pokazuje setup **trwającej** walki (jak notka w panelu Setup): zmiany widać od razu tylko
przed startem, a w trwającej walce dopiero po `R`. Kliknięcie „Setup buffs” nie blokuje klawiszy:
`Spacja` i `Enter` zwijają i rozwijają listę, pozostałe klawisze działają jak zwykle. Czytnik
ekranu czyta każdy wpis jako „Nazwa, N seconds left”.

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
    noszonych przedmiotów (dla „My gear”: Icon of the Silver Crescent na pasku Items i Band of the
    Eternal Sage, proc losowany w walce, nic nie wciskasz); patrz „Pasek przedmiotów” wyżej.
    Heroism jest w grupie Fight.
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

## Panel Gear

Zwijany panel **Gear** (pod panelem Setup) ustawia ekwipunek następnej walki. Baza przedmiotów
(1730 przedmiotów, 214 gemów, 128 enchantów z wowsims) ładuje się dopiero przy pierwszym otwarciu
panelu albo od razu po starcie, jeśli zapisany ekwipunek jej potrzebuje. Do tego czasu walka używa
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
  przedmioty hordy oraz podpowiedź przy każdym noszonym efekcie, który nie jest włączony w Setup. Panel „Set bonuses”
  pokazuje też bonusy niezamodelowane (np. Corruptor Raiment 4-piece, oznaczony „Not modelled”).
- **Import z WowSimsExporter:**
  1. W grze wpisz `/wse export` (addon WowSimsExporter): okno pokaże zaznaczony tekst, skopiuj go `Ctrl+C`.
  2. W panelu Gear rozwiń „Import” i wklej tekst (albo plik `*.gear.json` z wowsims).
  3. Przeczytaj raport: ile slotów wypełniono, ostrzeżenia, nieznane ID przedmiotów, gemów i
     enchantów. Talenty z eksportu nie są stosowane (etap 2b).
  4. Kliknij „Apply import”. Przycisk działa tylko, gdy coś da się założyć.
- **Eksport:** „Export” pokazuje ekwipunek jako plik gear wowsims (ID przedmiotów); „Copy” kopiuje
  go do schowka (albo zaznacza tekst do skopiowania `Ctrl+C`).

Ekwipunek zapisuje się razem z setupem. Zmiana działa od następnej walki: walka, która się nie
zaczęła, bierze ją od razu, trwająca zachowuje swój ekwipunek do `R` (panel to pokazuje, a notka pod
DPS podaje „Gear: …” walki). „Stats at the pull” pokazuje statystyki z nowym ekwipunkiem od razu.
Pisanie w polach wyszukiwania, importu i eksportu nie uruchamia skrótów klawiszowych.

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
- talenty (Bane, Cataclysm, Devastation, Ruin, Emberstorm, Shadow and Flame, Demonic Sacrifice,
  Backlash i inne; pełna lista w `docs/data-sources.md`)
- czas lotu Shadow Bolta i Incinerate (od odległości od celu); pocisk, który nie doleci przed
  końcem walki, się nie liczy
- buffy, debuffy celu, consumables, Heroism i efekty noszonych przedmiotów (procki na cast, hit
  albo crit z szansą i ICD, efekt przed walką), gdy są włączone w panelu Setup
- przedmioty używane z paska Items (mikstury, Dark Rune, trinkety on-use z ekwipunku) z
  własnymi i dzielonymi cooldownami (kategorie jak w wowsims)
- długość walki 10-600 s

## Czego DPS nie uwzględnia

Wynik jest przybliżony. Buffy rajdowe, consumables i efekty noszonych przedmiotów (procki, np.
Band of the Eternal Sage) liczą się tylko wtedy, gdy włączysz je w panelu Setup (domyślnie
wyłączone); przedmioty z paska Items dopiero wtedy, gdy ich użyjesz. Nigdy nie są liczone: koszt zdrowia Life Tap i Dark Rune (trener nie
modeluje zdrowia), bonus Incinerate przy Immolate, redukcja odporności z Curse of the Elements,
efekty przedmiotów z listy „Not modelled effects of your gear” (obrażenia, leczenie, mana, stacki,
procki PPM i na tick DoT) oraz
część bonusów setów (np. Corruptor Raiment, Wrath of Spellfire; panel Gear wypisuje te, które nosisz). Nie ma też
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
- Panel buffów gracza: specyfikacja `docs/superpowers/specs/2026-10-30-player-buffs-panel-design.md`,
  plan `docs/superpowers/plans/2026-10-30-player-buffs-panel.md`
- Etap 2a (gear): specyfikacja `docs/superpowers/specs/2026-10-30-gear-stage-2a-design.md`, plan
  `docs/superpowers/plans/2026-10-30-gear-stage-2a.md`; źródła, filtry, presety, import i
  uproszczenia: `docs/data-sources.md`, „Part E: gear”
- Źródło każdej liczby (wowsims, Wowhead), założenia i otwarte pytania: `docs/data-sources.md`
- Decyzje projektowe (kolejka czarów): `docs/decisions/`

## Struktura projektu

| Katalog | Zawartość |
|---|---|
| `src/engine` | deterministyczna symulacja walki (bez Reacta): czas, zdarzenia, czary, aury, mana, statystyki, ekwipunek |
| `src/data` | dane gry: współczynniki, cel, katalog buffów, Destruction Warlock (czary, aury, talenty, przedmioty, zestawy, presety gearu, rotacja), baza przedmiotów (`src/data/items`) |
| `src/setup` | setup walki: domyślne ustawienia i ich walidacja, presety, zapis w `localStorage`, zamiana setupu na dane walki, walidacja gearu, import i eksport wowsims |
| `src/bot` | bot grający listę priorytetów (punkt odniesienia DPS) |
| `src/ui` | interfejs React: pasek akcji, pasek rzucania, mana, cel, panel „Your buffs”, panel Setup, panel Gear, podsumowanie walki |
| `tests` | testy Vitest: `engine`, `data`, `bot`, `setup`, `ui` oraz `smoke.test.ts` |
