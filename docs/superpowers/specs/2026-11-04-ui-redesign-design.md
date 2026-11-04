# Przebudowa układu i warstwy wizualnej (Setup, Fight, Report) — projekt (spec)

Data: 2026-11-04
Status: do przeglądu przez autora (prototyp gotowy, implementacja nie zaczęta)
Prototyp: `docs/design/prototype/index.html` (otwórz plik w przeglądarce; bez sieci, bez builda)
Zrzuty: obecny UI `docs/design/current/*.png`, prototyp `docs/design/screens/*.png`
Plan: `docs/superpowers/plans/2026-11-04-ui-redesign.md`

## 1. Problem: audyt obecnego układu

Dziś aplikacja to jedna strona: kolumna walki (DPS, arena, paski) po lewej i **kolumna 8 zwijanych paneli**
po prawej (Setup z 8 podgrupami, Gear, Talents, Combat text, Simulator, Stats at the pull, Set bonuses,
Priority). Zrzuty: `docs/design/current/desktop-1440-initial.png`, `desktop-1440-fight.png`,
`desktop-1440-panels-open.png`, `desktop-1440-{setup,gear,simulator}-open.png`, `mobile-390-*.png`.

Co jest źle (mierzone na zrzutach):

1. **Wszystko w jednej kolumnie 300 px.** Po rozwinięciu paneli strona ma **9 658 px** wysokości na desktopie
   i **11 048 px** na telefonie. Gear (17 slotów), Talents (3 drzewa) i edytor reguł przedmiotów mieszczą się w
   300 px, więc nazwy przedmiotów się zawijają, a drzewka talentów są ściśnięte.
2. **Brak trybów pracy.** Konfiguracja, gra i analiza dzielą jeden ekran; nie da się podlinkować „Gear” ani
   wyniku symulatora; po odświeżeniu stan paneli znika.
3. **Arena nie wygląda jak gra.** Cel, debuffy, mana i pasek akcji są w zwykłych kartach; buffy gracza są pod
   paskiem akcji (w grze: prawy górny róg), nie ma okna damage metera ani logu w trakcie walki, combat text
   nie ma wyraźnych stref. Przed walką arena to pusta karta z przyciskiem.
4. **Hierarchia płaska.** 3 kafelki (DPS, damage, time) mają ten sam ciężar co notka „approximate (see docs)”;
   „Stats at the pull” i „Set bonuses” są zawsze rozwinięte i spychają panele.
5. **Wynik po walce jest ubogi.** Okno „Fight over” pokazuje 3 liczby; dane do tabeli czarów, wykresu i
   porównania z botem są w silniku, ale UI ich nie pokazuje (etap 3).
6. **Brak miejsca na nowe funkcje:** edytor skryptów rotacji, biblioteka scenariuszy, Compare (spec
   2026-11-03), zakładki raportu etapu 3, kolejne klasy (etap 5).
7. **Drobne:** jasny motyw z kremowym tłem i fioletem jest generyczny; monospace nigdzie nie służy kodowi;
   liczby nie zawsze mają cyfry tabelaryczne; brak skip linku i landmarków poza `main`/`aside`.

## 2. Użytkownicy i zadania

- **Autor ćwiczy rotację** (główne zadanie, 80% czasu): otwiera stronę, od razu jest w walce, gra 60 s,
  patrzy na wynik, `R`, znowu. Potrzebuje: czytelnego HUD-u jak w grze, buffów i debuffów z timerami,
  natychmiastowego feedbacku (combat text, meter), braku przewijania w trakcie walki.
- **Autor przegląda walkę**: co poszło źle (uptime Immolate, Life Tapy w Heroismie), porównanie z botem,
  tabela czarów, wykres DPS z oknami buffów, log.
- **Autor konfiguruje i porównuje setupy**: gear, talenty, buffy, rotacja (podstawowa i skrypt), scenariusze,
  symulator i Compare. Rzadziej, ale długo; potrzebuje miejsca i nawigacji.
- (Później) inni gracze TBC, którzy dostaną link: pierwsze wrażenie decyduje, czy zostaną (prośba autora:
  „warstwa wizualna najbardziej zachęca do używania”).

## 3. Architektura informacji

### 3.1 Trzy tryby i stały nagłówek

```
[sigil] Rotation Trainer | Setup  Fight  Report | [ikona] Destruction Warlock |  Setup: Raid as in my log
                                                                               Gear: My gear (export)  Talents 0/21/40
                                                                               Rotation: Script: …  Fight: 60 s, 28 yd  [☼]
```

- **Setup** (konfiguracja), **Fight** (symulator walki, domyślny po wejściu), **Report** (raport po walce i
  analizy). Linki `<a href="#/…">` z `aria-current="page"`.
- **Pasek statusu** w nagłówku: 5 „chipów” (Setup, Gear, Talents, Rotation, Fight) z nazwą aktualnego wyboru;
  każdy jest linkiem do swojej sekcji Setup. Chip, którego zmiana czeka na `R` (setup następnej walki różni
  się od trwającej), ma złoty znacznik z lewej i `title` z wyjaśnieniem (dziś: notka „pending” w panelu).
- Spec chip: ikona specjalizacji, nazwa speca w kolorze klasy (`--class`), nazwa klasy. Nic w nagłówku nie
  zakłada Warlocka: nazwa, ikona i kolor pochodzą z `SpecData`/tokenów klasy.
- Przełącznik motywu (jasny/ciemny), `aria-label` mówi, na co przełącza.
- Mobile: tryby przechodzą do **dolnego paska zakładek** (w zasięgu kciuka, z `safe-area-inset-bottom`),
  chipy statusu są ukryte (ta sama informacja jest w szynie Setup).

### 3.2 Trasy (hash)

| Trasa | Widok |
|---|---|
| `#/fight` | arena (domyślna; puste lub nieznane trasy też tu prowadzą) |
| `#/setup` → `#/setup/gear` | Setup, sekcja Gear (domyślna) |
| `#/setup/{gear,talents,buffs,items,rotation,fight,class,scenarios,combat-text}` | sekcje Setup |
| `#/setup/rotation/script` | Rotation z otwartym trybem Script (opcjonalnie) |
| `#/report` → `#/report/damage` | Report, zakładka Damage |
| `#/report/{damage,timeline,log,rotation,simulator,compare}` | zakładki Report |

Hash, nie History API: statyczny hosting bez rewrite, prosty router (~60 linii, bez zależności). Zmiana
trybu przenosi fokus na `<main>` (bez przewijania); `document.title` = „Rotation Trainer: Setup, gear”.
Stan sekcji/zakładek jest w URL, więc odświeżenie i link działają (Vercel: „URL reflects state”).

### 3.3 Klawisze

- **Klawisze walki** (`1`–`0`, `-`, `=`, `Z X C V B N`, `Space`, `Esc`, `R`) działają **tylko w trybie Fight**
  (dziś działają globalnie; w Setup `1` w polu liczby jest blokowane regułą S5 — ta reguła zostaje także w
  Fight, bo arena ma pola, np. przełącznik combat text).
- Wejście do Fight nie startuje walki; `Space` lub pierwszy czar startuje (jak dziś).
- Opuszczenie Fight w trakcie walki (rekomendacja, pytanie Q1): **walka się wstrzymuje**. Pętla rAF działa
  tylko w Fight, a zegar walki w `useSimulation` nie liczy czasu spędzonego poza Fight (silnik ma czas
  wirtualny, więc to zmiana w hooku, nie w silniku). Po powrocie arena pokazuje „Paused, press Space to
  resume”; `R` resetuje jak zawsze. Setup zmieniony w międzyczasie działa od następnej walki (jak dziś).
- Globalne (poza polami tekstowymi i poza trwającą walką): `g` potem `s`/`f`/`r` = przejście do
  Setup/Fight/Report, `?` = arkusz skrótów (dialog). Żaden z nich nie koliduje z klawiszami walki.
- Po końcu walki: `R` resetuje (jak dziś), `Enter` na karcie „Fight over” otwiera Report.

### 3.4 Gdzie trafia każdy obecny panel

| Obecny panel / grupa | Nowe miejsce | Uwagi |
|---|---|---|
| Nagłówek (`h1` + spec) | Nagłówek aplikacji | spec chip z kolorem klasy |
| FightStats (DPS, Total damage, Time) + DpsNote | Fight → HUD (lewy górny róg) | DpsNote → tooltip „i” przy DPS i nagłówek Report |
| TargetPanel (cel, HP, debuffy) | Fight → ramka celu (dół, środek, po prawej) | debuffy z timerami pod paskiem HP |
| CastBar | Fight → nad paskami akcji | okno kolejki (400 ms) narysowane na pasku |
| ManaBar | Fight → ramka gracza (dół, środek, po lewej) | pasek zasobu z tokenem `--resource` |
| ActionBar + Item bar | Fight → dół, środek | 12 + 6 slotów, wygląd „bordered action bar” |
| PlayerBuffsPanel („Your buffs”) | Fight → nad ramką gracza (aktywne + upcoming), ikony buffów setupu w drugim rzędzie | dostępna nazwa „Your buffs” zostaje |
| CombatTextLayer | Fight → dwie strefy: outgoing (prawo od pierścienia celu), notifications (lewo) | bez zmian w logice `hudQueue` |
| StartOverlay | Fight → karta „Ready When You Are” na arenie (z linkami do setupu) | |
| EndSummary („Fight over”) | Fight → karta na arenie z DPS, % bota i przyciskiem „Open Report” | `role=region` „Fight summary” zostaje |
| Setup → presety setupu | Setup → Buffs & consumables (nagłówek sekcji) i chip „Setup” | „Reset to defaults” z potwierdzeniem |
| Setup → Fight (długość, Heroism) | Setup → Fight settings | razem z Distance |
| Setup → Raid and party, Consumables, Target debuffs | Setup → Buffs & consumables (3 kolumny) | |
| Setup → Items and cooldowns (+ Not modelled effects) | Setup → Items & cooldowns | z podglądem paska Items (Z…N) |
| Setup → Warlock options | Setup → `<Class> options` (np. „Warlock options”) | sekcja z danych klasy |
| Setup → Rotation (preset, curse, DoT-y, Life Tap) | Setup → Rotation, tryb Basic | |
| Setup → Rotation → Item use (ItemUseEditor) | Setup → Rotation, tryb Basic, podsekcja „Item use” | w trybie Script zastępują go reguły `use` |
| (nowy) ScriptEditor | Setup → Rotation, tryb Script | spec 2026-11-03, Task 5 |
| Setup → Distance | Setup → Fight settings | |
| Gear | Setup → Gear (układ „character pane”) | import/eksport w dialogach |
| Talents | Setup → Talents (3 drzewa obok siebie ≥ 1280 px) | |
| Combat text (ustawienia) | Setup → Interface → Combat text | szybki przełącznik „Combat text” w docku Fight |
| Simulator | Report → Simulator (pełny), Setup → podsumowanie (ostatni wynik + „Run 1,000 Fights”) | wynik nie jest zapisywany (jak dziś) |
| (nowy) Scenarios | Setup → Library → Scenarios | |
| (nowy) Compare | Report → Compare | |
| Stats at the pull | Setup → prawa kolumna podsumowania (zawsze widoczna) | z różnicą względem presetu |
| Set bonuses | Setup → podsumowanie (pod statystykami) i karta przedmiotu w Gear | |
| Priority | Fight → dock „Next by the script” (podpowiedź) i Setup → Rotation (lista skompilowana), Report → Rotation (Ty vs bot) | |

### 3.5 Raport (etap 3 + istniejące)

Nagłówek raportu: wielki DPS, „91.7% of the bot (2,294.1) with the same setup”, KPI (damage, duration,
active time GCD, uptime DoT-ów), linia „Played with …” z linkami do sekcji setupu użytego w walce, „Fight
Again”, „Copy Report”. Zakładki: **Damage** (tabela czarów + „Buffs and items” + wykres DPS + „What to look
at”), **Timeline** (pasy castów i aur), **Log** (filtrowany, wirtualizowany), **Rotation** (reguły: Ty vs bot),
separator, **Simulator**, **Compare**. Report bez walki: stan pusty („Play a fight to see its report” + link
do Fight); Simulator i Compare działają bez walki.

## 4. Plan projektu (frontend-design)

**Temat:** trener rotacji WoW TBC. **Odbiorca:** gracz raidowy (autor), zna UI gry na pamięć.
**Główne zadanie:** zagrać walkę tak, jak w grze, i zrozumieć wynik. **Słownictwo tematu:** ramki jednostek,
paski HP/many/castu, przycisk akcji z obwódką i klawiszem w rogu, sweep cooldownu, rząd buffów z timerami,
latający tekst obrażeń w kolorze szkoły, okno Details, kolory jakości przedmiotów, kolor klasy.

### 4.1 Paleta (nazwane kolory)

Ciemny motyw „Nether” (domyślny):

| Nazwa | Hex | Rola |
|---|---|---|
| Nether Ink | `#15121f` | tło strony (fiolet-indygo, nie neutralna czerń) |
| Voidstone | `#221c31` | ramki, panele; `#2c2540` stan podniesiony |
| Shattrath Bronze | `#c9a66b` | obwódki ramek, aktywny tryb, wybrany slot, okna buffów na wykresie |
| Parchment | `#efe6d2` | tekst główny (ciepły, jak tooltip) |
| Warlock Violet | `#8788ee` | `--class`: akcent (przycisk główny, aktywna sekcja, linia DPS) |
| Fel | `#74d14f` | zdrowie, „aktywne”, pozytywne zmiany |

Funkcyjne: Mana `#4a86ff` (`--resource`), Cast `#e8b13a`, Danger `#ff7366`, Gold/proc/fokus `#ffd36b`,
szkoły (tekst) Shadow `#b48cff`, Fire `#ff8f45`; szkoły (znaczniki wykresów) `#9a6ff0`, `#e0702a`;
jakość Epic `#c58af5`, Rare `#5aa2ff`; linie `#3d3454`; tekst drugorzędny `#b4aac6`.

Jasny motyw „Moonstone” (tylko Setup i Report): tło `#ecebf2`, panele `#fbfaff`, podniesione `#f0eef7`, tekst
`#1c1828`, drugorzędny `#575069`, brąz `#85652f`, klasa `#5557c8` (przycisk: biały tekst), fel `#276f1a`,
danger `#b3261e`, gold `#8a5d00`, shadow `#6c3fc9`, fire `#a2470c`, epic `#8a2fc9`, rare `#1d63c4`.
**Arena zawsze ciemna** (świat gry nie zmienia się z motywem; decyzja D3).

**Tokeny klasy** (podmieniane przez `data-class` na `<html>`, etap 5): `--class`, `--class-soft`,
`--resource`, `--resource-name` (Mana/Energy/Rage). Prototyp ma przykłady `mage` i `rogue`.

### 4.2 Kontrast (WCAG 2.x, policzony skryptem)

Ciemny (tło strony / panel / podniesiony / arena):

| Tekst | Strona | Panel | Podniesiony | Arena |
|---|---|---|---|---|
| Parchment `#efe6d2` | 14.87 | 13.23 | 11.70 | 15.06 |
| Dim `#b4aac6` | 8.35 | 7.44 | 6.58 | 8.46 |
| Bronze `#c9a66b` | 8.04 | 7.16 | 6.33 | 8.14 |
| Class `#8788ee` | 5.96 | 5.31 | 4.69 | 6.04 |
| Fel `#74d14f` | 9.64 | 8.59 | 7.59 | 9.77 |
| Danger `#ff7366` | 6.94 | 6.18 | 5.46 | 7.03 |
| Gold `#ffd36b` | 12.99 | 11.56 | 10.22 | 13.16 |
| Shadow `#b48cff` | 7.15 | 6.36 | 5.63 | 7.24 |
| Fire `#ff8f45` | 8.14 | 7.25 | 6.41 | 8.25 |
| Epic `#c58af5` | 7.32 | 6.51 | 5.76 | 7.41 |
| Mana `#4a86ff` | 5.40 | 4.81 | 4.25 (tylko pasek) | 5.47 |

Jasny (strona / panel / podniesiony): tekst 14.65/16.70/15.10, dim 6.43/7.33/6.63, brąz 4.55/5.18/4.69, klasa
4.95/5.64/5.10, fel 5.25 (strona), danger 5.52/6.29/5.69, gold 4.86/5.55/5.01, shadow 5.56/6.33/5.73,
fire 5.15 (strona), epic 5.32/6.07/5.49, rare 4.88/5.56/5.03.

Na przyciskach i paskach: `#14101f` na klasie (ciemny) 6.04; biały na klasie (jasny) 5.86; tekst castu
`#1a1306` na `#e8b13a` 9.46; tekst paska HP `#0f1a08` na `#74d14f` 9.37; biały na pasku many 3.42 → etykieta
paska many ma czarny obrys `text-shadow` i jest pogrubiona (13 px bold: wymóg 4.5 nie spełniony samym
kolorem, dlatego wartość jest też w `aria-valuenow` i obok w docku; do decyzji: ciemniejszy środek
gradientu many `#3466d6` daje 4.9). Fokus: `#ffd36b` na tle 12.99, `#5557c8` na jasnym 4.95 (≥ 3:1).
Para szkół na wykresach przechodzi walidator dataviz (pasmo jasności, CVD ΔE 29, normal ΔE 28.9) w obu
motywach; tożsamość nigdy nie jest tylko kolorem (ikona + nazwa w każdym wierszu).

### 4.3 Typografia

- **Marcellus** (SIL OFL 1.1, `@fontsource/marcellus`): nagłówki sekcji, nazwy jednostek, nazwa przedmiotu,
  wielki DPS raportu. Rzymska antykwa z rozszerzonymi szeryfami: przywołuje napisy UI gry, ale nie jest
  fontem Blizzarda.
- **Barlow** (OFL, `@fontsource/barlow`, 400/500/600/700): tekst UI. **Barlow Semi Condensed** (OFL,
  `@fontsource/barlow-semi-condensed`, 500–800 + 800 italic): liczby (zawsze `tabular-nums`), klawisze na
  slotach, timery, combat text (800 italic). Jedna rodzina w dwóch szerokościach + jeden krój display.
- Kod skryptów rotacji: systemowy stos monospace (`ui-monospace, Cascadia Code, SF Mono, Menlo, Consolas`) —
  jedyne miejsce z monospace, bo to kod.
- Skala (rem przy 16 px): 12, 13, 15 (tekst), 18, 22, 28 (h1 sekcji), 36 (timer, hero mobile), 56 (hero DPS).
  Linie ≤ 75 znaków (`max-width: 62–75ch`), `text-wrap: balance` w nagłówkach, `pretty` w akapitach.
- Bez wersalików w etykietach, bez eyebrow nad nagłówkami, bez kropek środkowych w metadanych.
- Fonty samohostowane (woff2 latin, ~250 KB łącznie), `font-display: swap`, w aplikacji `preload` dla
  Barlow 400 i Semi Condensed 700 (Vite emituje pliki z importu `@fontsource/*`).

### 4.4 Siatka, odstępy, promienie, głębia

- Odstępy 4/8/12/16/24/32/48 px. Setup: szyna 248 px + treść + podsumowanie 300 px. Fight: arena + dock
  320 px. Report: maks. 1440 px, siatka 2 kolumn.
- Promienie: ramki gry 2 px ze ściętymi rogami 8 px (`clip-path`, nasz własny motyw „ciętego kamienia”),
  kontrolki 4 px, nigdy jeden promień na wszystkim.
- Głębia przez obwódki i wewnętrzny bevel (`inset 0 1px 0` jasny, `inset 0 -1px 0` ciemny), cień
  `0 10px 30px` tylko dla elementów pływających na arenie i tooltipów. Bez szarych miękkich cieni pod kartami.
- Wyrównanie: tekst do lewej; liczby w tabelach do prawej; arena symetryczna względem osi celu.

### 4.5 Ikonografia

- Ikony gry z `public/icons` (czary, aury, przedmioty, talenty): sloty, buffy, debuffy, wiersze tabel, szyna
  Setup (ikona aktualnego hełmu dla Gear, ikona drzewa dla Talents, itd.: szyna pokazuje stan).
- Ikony UI: własny zestaw SVG 24×24, kreska 1.7 (Setup, Fight, Report, motyw, strzałki, ostrzeżenie, check,
  czaszka w portrecie celu, sigil marki). Dekoracyjne mają `aria-hidden`.
- Obwódka jakości przedmiotu (epic/rare) i nazwa w kolorze jakości; debuff gracza z czerwoną obwódką, buffy
  z brązową, cudze aury mniejsze i przygaszone.

### 4.6 Zasady

1. **Arena to jedno odważne miejsce**: ramki, pierścień celu, latający tekst, paski jak w grze. Setup i Report
   są spokojne i gęste.
2. **Struktura niesie informację:** numeracja tylko w liście reguł (kolejność priorytetu), złoty pasek z lewej
   = zmiana czeka na `R`, obwódka slotu = jakość, obwódka aury = czyja.
3. **Liczby są tabelaryczne i zawsze w tym samym miejscu** (bez skakania podczas walki).
4. **Zero obrazów spoza `public/icons`**: żadnych assetów ani fontów Blizzarda.

### 4.7 Przegląd planu względem briefu (co zmieniłem)

- Pierwsza wersja miała **zielony „fel” jako jedyny akcent na prawie czarnym tle** — to klisza nr 2. Akcentem
  została barwa klasy (dane z gry, wymienna), fel służy tylko stanowi „aktywne/zdrowie”.
- Jasny motyw w pierwszym szkicu był **pergaminowy (kremowy) z serifem** — klisza nr 1. Zmieniony na chłodny
  „Moonstone” z ciemnym, stałym światem areny.
- Karty raportu początkowo miały identyczne cienie i promienie (klisza nr 4); zostały płaskie panele z
  obwódką, a jedyne „pływające” elementy są na arenie.
- Odrzuciłem etykiety wersalikami nad grupami szyny i monospace w danych.

## 5. Wireframe’y

### 5.1 Setup

Desktop 1440:
```
┌ header: brand | Setup* Fight Report | spec | chips (5) | theme ┐
├──────────┬───────────────────────────────────────┬────────────┤
│ Character│ Gear                     [Import][Export]│ Stats at   │
│ [hełm]Gear│ Preset [My gear|Pre-Raid|T4|T5|T6|ZA|SWP]│ the pull   │
│ [ikon]Tal.│ ┌slot L┐  ┌ karta przedmiotu ┐  ┌slot R┐│ 1,451 +151 │
│ Fight     │ │Head  │  │ Hood of the Malefic│ │Waist ││ …          │
│ Buffs     │ │Neck  │  │ staty, gemy, ench. │ │Legs  ││ Set bonuses│
│ Items     │ │…  x7 │  │ [Change][Gems][Clr]│ │…  x7 ││ Simulate   │
│ Rotation  │ └──────┘  └────────────────────┘ └──────┘│ 2,294 ±3.8 │
│ Fight set.│        [Main hand] [Off hand] [Ranged]   │ [Run 1,000]│
│ Class opt.│                                          │            │
│ Library   │                                          │            │
│ Interface │                                          │            │
└──────────┴──────────────────────────────────────────┴────────────┘
```
Rotation (Script): pasek trybu Basic/Script, notka „pending”, narzędzia (Add Rule, Convert From Basic,
Edit as JSON, licznik błędów), lista reguł `# | ☑ | [ikona] Cast X | warunek (kod) | odpalenia/walkę | ↑ ↓ …`,
błąd pod polem z pozycją, niżej „Named conditions” i wyszukiwarka zmiennych.

Tablet 1024: szyna 220 px + treść; podsumowanie przechodzi pod treść (siatka kafli); karta przedmiotu nad
dwiema kolumnami slotów; chipy statusu: 3 pierwsze.

Mobile 390:
```
┌ brand            [spec][☼] ┐
│ [Gear][Talents][Buffs]… →  │  szyna jako poziomy pasek (przewijany)
│ Gear                       │
│ [Import Gear…][Export Gear]│
│ Preset (segment, zawija)   │
│ ┌ karta przedmiotu ┐       │
│ slot, slot, slot … (1 kol.)│
│ Stats at the pull …        │
├────────────────────────────┤
│  Setup     Fight   Report  │  dolny pasek trybów
└────────────────────────────┘
```

### 5.2 Fight

Desktop 1440 (arena 1120 + dock 320):
```
┌ header ─────────────────────────────────────────────────────────┬──────────────┐
│ 0:34.2 / 1:00                                                   │ Damage done  │
│ ▬▬▬▬▬▬╍╍╍                                        2,231          │ ▇▇ Shadow B. │
│ 2,321.2  79,384                                  741  612       │ ▇ Immolate   │
│ Esc R ?   +Heroism  ╭──── pierścień celu ────╮   [ikona] 4,812! │ ▆ Corruption │
│      +1,622 Mana   (    Raid Target Dummy    )                  │ Next by the  │
│  Band of the …!     ╰────────────────────────╯                  │ script       │
│    [buffy z timerami]                                           │ ▸Shadow Bolt │
│    [buffy setupu]          ┌[☠73] Raid Target Dummy  Boss 73┐   │ So far       │
│    ┌[ikona] You  Destr. W.┐│ ████████ 79,384 taken   100%   │   │ uptime       │
│    │ ████ 6,284/10,679 59%││ [ISB 3 8.6s][Imm 4.1s][Cor][CoD]│   │ Combat log   │
│    └──────────────────────┘└────────────────────────────────┘   │ 34.1 SB 4,812│
│            [ikona][ Shadow Bolt ███████░░▨▨ 1.12 / 1.87 ]        │ …            │
│                 Items [Z][X][C][V][B][N]                        │ ☑ Combat text│
│        [1][2][3][4][5][6][7][8][9][0][-][=]                     │   Settings   │
└─────────────────────────────────────────────────────────────────┴──────────────┘
```
- Ramki jednostek w rzędzie u dołu na środku, nad cast barem, z odstępem między nimi (jak w grze; zmiana
  2026-11-05 na prośbę autora): po lewej ramka gracza z buffami nad nią, po prawej ramka celu z debuffami.
- Ramka celu (dół, środek, po prawej): portret (czaszka + poziom 73), nazwa w kolorze wrogości, „Boss, level 73”,
  pasek HP (manekin: zawsze 100%, z sumą obrażeń), rząd debuffów z timerami (moje: czerwona obwódka, ładunki
  w rogu; cudze: mniejsze, za separatorem). Miejsce na cast bar celu jest zarezerwowane dla przyszłych bossów
  (etap 4), dziś ukryte.
- Nad ramką gracza: buffy gracza z timerami, poniżej mniejsze ikony stałych buffów
  setupu. Upcoming (Heroism przed startem): ikona przygaszona z „in 4.9 s”. Ostatnie 5 s: czerwony,
  pogrubiony czas i puls ikony (bez pulsu przy reduced motion: czerwony obrys).
- Ramka gracza (dół, środek, po lewej): portret = ikona speca, nazwa w kolorze klasy, pasek zasobu, linia „Regen in 1.8 s”
  dla zasady pięciu sekund).
- Dół, środek: cast bar (z oknem kolejki 400 ms jako kreskowanym końcem), pasek Items, pasek akcji 12 slotów
  50 px. Na slotach: klawisz w prawym górnym rogu, sweep GCD/cooldownu (`conic-gradient`), czas cooldownu,
  błysk powodu odrzucenia (dzisiejsze `REJECT_LABELS`), złota poświata slotu „następny wg skryptu” (tryb
  coach, można wyłączyć).
- Pierścień celu na środku areny; strefy combat textu tuż obok niego (nie przy krawędziach): outgoing po prawej,
  notifications po lewej, teksty startują na wysokości pierścienia; teksty mają `aria-hidden`.
- Dock (prawy): mini meter (Details: pasek w kolorze szkoły, ikona, nazwa, suma, (DPS, %)), „Next by the
  script” (top 4 reguły i powód), „So far” (active time, uptime DoT-ów, bot w tej sekundzie), ticker logu
  (ostatnie 7 zdarzeń, `aria-live="off"`), przełącznik Combat text i link do ustawień.

Tablet 1024: arena na całą szerokość (ten sam układ co desktop), dock jako okno nakładane przyciskiem „Meter”
(stan pamiętany w `localStorage`).

Mobile 390 (bez przewijania w 844 px):
```
┌ brand            [spec][☼] ┐
│ 0:34.2 / 1:00   2,321 79,384 [Meter] │
│ ┌[☠] Raid Target Dummy ───┐│
│ │ ███████████ 100%        ││
│ │ [debuffy z timerami]    ││
│ └─────────────────────────┘│
│ [buffy z timerami]         │
│ [buffy setupu, 22 px]      │
│   +Mana  ( pierścień ) 4,812!│
│ ┌[ik] You ███████ 59% ────┐│
│ [ik][ Shadow Bolt ████░▨ ] │
│  [Z][X][C][V][B][N]        │
│ [1][2][3][4][5][6]         │
│ [7][8][9][0][-][=]         │
├────────────────────────────┤
│  Setup     Fight   Report  │
└────────────────────────────┘
```
Na dotyk sloty mają 50×50 px (≥ 44), item slots 44 px.

### 5.3 Report

Desktop 1440:
```
┌ header ─────────────────────────────────────────────────────────────────┐
│ 2,104.5 DPS            Damage  Duration  Active time  Imm.   Corr.  [Fight Again]
│ 91.7% of the bot …     126,272 60.0 s    96.8%        88.4%  97.1%  [Copy Report]
│                        Played with Raid as in my log, My gear (export), …         │
│ Damage  Timeline  Log  Rotation │ Simulator  Compare                             │
│ ┌ Damage by spell ─────────────────┐ ┌ DPS over time ───────────────────────┐ │
│ │ [ik] Shadow Bolt 69.4% ▬▬▬▬ 87,640 …│ │ Heroism ▬▬▬▬▬▬▬                      │ │
│ │ [ik] Immolate 15.6% ▬ 19,720 …    │ │ Potion  ▬▬▬                          │ │
│ │ …  Total 126,272 2,104.5 42      │ │ 4,000 ┤      ╱╲__ ─ ─ ─              │ │
│ └──────────────────────────────────┘ │       └ 0 s … 60 s                    │ │
│ ┌ Buffs and items ─────────────────┐ │ What to look at: ⚠ Immolate fell off… │ │
└──────────────────────────────────────┴───────────────────────────────────────┘
```
- Tabela czarów: ikona + nazwa + udział (pasek w kolorze szkoły) | Damage | DPS | Casts | Crit | Avg hit |
  Avg crit | Miss; stopka z sumą. Na telefonie kolumny „opt” są ukryte (Avg hit, Avg crit, Miss).
- Wykres DPS w czasie: jedna oś (DPS); linia 5 s rolling (kolor klasy), linia „Fight DPS so far” (kreska),
  linia bota z tym samym ziarnem (przygaszona); **okna buffów jako pasy nad wykresem** (osobne tory, bez
  mieszania kolorów z linią); crosshair + tooltip; legenda zawsze widoczna.
- „What to look at”: 2–4 wnioski z porównania z botem (ikona + zdanie z liczbami).
- Simulator: pasek Runs/Seed/„Run 1,000 Fights” (etykieta mówi ile), karta średniej (± SEM, 95% CI, σ,
  mediana, percentyle, min–max, mana, Life Tapy), **histogram** (słupki 25 DPS, linia średniej, złota
  przerywana linia „You 2,104.5”, zdanie o percentylu Twojej walki). Tabela czarów, przedmioty i uptime z
  wyniku jak dziś, pod histogramem.
- Compare: stan pusty z kierunkiem („Save your current setup as a scenario… Open Scenarios”), potem tabela
  scenariuszy (mean ± σ, SEM, Δ vs baseline ± SE, 95% CI, werdykt), histogramy obok siebie.

Tablet 1024: siatka raportu w 1 kolumnę. Mobile 390: hero 36 px, KPI w 2–3 kolumnach, zakładki przewijane
poziomo (aktywna przewinięta do widoku, cieniowanie krawędzi), wykresy liczone z szerokości kontenera
(etykiety osi zawsze 11 px; mniej znaczników).

## 6. Macierz stanów

| Komponent | Pusty | Ładowanie | Błąd | Długa treść |
|---|---|---|---|---|
| Header chips | — (zawsze jest setup) | — | zapis do localStorage nieudany: chip Setup z ikoną ⚠ i `title` „Not saved: storage is full or blocked” | nazwa > 24 znaki: ellipsis + `title` |
| Szyna Setup | — | Gear: „Loading the item database…” w wartości | Gear: „Database failed: reload” | wartość 1 linia, ellipsis |
| Gear | slot pusty: ikona konturu slotu + „Empty, choose an item” | lista przedmiotów: szkielet 6 wierszy | baza się nie wczytała: komunikat + „Reload the Page” (jak dziś) | nazwa przedmiotu 2 linie (`line-clamp`) |
| Talents | 0 punktów: „Pick a preset or click a talent” | opisy: „Loading descriptions…” w karcie | niepoprawny import: lista naruszeń | — |
| Rotation script | brak reguł: „No rules yet. Add a rule or convert the basic rotation.” + 2 przyciski | — | błąd składni pod polem z pozycją; licznik błędów u góry; reguła nieaktywna | warunek zawija się w polu (`overflow-wrap: anywhere`) |
| Scenarios | „No scenarios saved. Save the current setup or import a file.” | import pliku: „Reading file…” | raport walidacji (błędy blokują, ostrzeżenia nie) | lista > 50: wirtualizacja |
| Fight arena | przed walką: karta Start | — | — | > 12 buffów: zawijanie w 2 rzędy, potem „+N” |
| Debuffy celu | brak: rząd ukryty (pasek HP się nie przesuwa: rezerwa wysokości) | — | — | > 8: mniejsze ikony cudzych |
| Meter (dock) | „No damage yet” | — | — | > 5 czarów: top 5 + „Other” |
| Report | brak walki: „Play a fight to see its report.” + „Go to Fight” | — | — | log > 50 wierszy: wirtualizacja |
| Simulator | „Run the simulator to see the spread of DPS for this setup.” | pasek postępu + „Simulating… 412 of 1,000” (`aria-live=polite`, max 1/s) | worker nie wystartował: liczy w wątku głównym (komunikat informacyjny) | — |
| Compare | jak wyżej (stan pusty z linkiem) | jak Simulator | scenariusz nieważny: wiersz z błędem i linkiem do edycji | 5 scenariuszy: tabela przewijana poziomo |

## 7. Ruch

- **Jeden zaplanowany moment:** wejście na arenę (przejście do Fight lub `R`): ramka celu i buffy zjeżdżają
  14 px z góry, ramka gracza i paski wjeżdżają z dołu (360 ms, `cubic-bezier(.2,.8,.2,1)`, opóźnienie 80 ms),
  pierścień celu skaluje się z 0.85 (520 ms). Tylko `transform` i `opacity`.
- Ruch w odpowiedzi na akcję: wciśnięcie slotu (scale 0.94, 80 ms), sweep GCD/cooldownu (to dane, nie
  dekoracja), wypełnienie cast bara, combat text (logika istniejąca), puls wygasającej aury.
- Pierścień celu obraca wewnętrzną przerywaną elipsę bardzo wolno (40 s/obrót): jedyna pętla, wyłączona przy
  reduced motion i gdy walka nie trwa (do decyzji: można ją usunąć całkiem).
- `prefers-reduced-motion: reduce`: wejście areny jako 1 ms (natychmiast), bez pulsu (czerwony obrys zamiast),
  combat text tylko pojawia się i gaśnie (jak dziś), sweep cooldownu zostaje (to informacja).
- Nigdy `transition: all`; przejścia list (kolor tła, obwódka) 120 ms.

## 8. Dostępność

- Landmarki: `header` (banner), `nav[aria-label=Mode]`, `main#main` (skip link „Skip to content” pierwszy w
  DOM), w Setup `nav[aria-label="Setup sections"]` i `aside[aria-label="Next fight summary"]`, w Fight
  `section[aria-label=Fight]` i `aside[aria-label="Fight details"]`, w Report `nav[aria-label="Report sections"]`.
- Nagłówki: jeden `h1` na widok (nazwa sekcji Setup; w Fight ukryty „Fight”; w Report ukryty „Fight report”),
  `h2` dla kart. `scroll-margin-top` = wysokość nagłówka.
- Kolejność fokusu: skip link → tryby → chipy → motyw → szyna → treść → podsumowanie. W Fight: HUD →
  Start → pasek Items → pasek akcji → dock. Fokus po zmianie trybu na `main`.
- `:focus-visible` 2 px złoty (`#ffd36b`) / indygo w jasnym, offset 2 px; nigdy `outline: none`. Sticky
  nagłówek nie zakrywa fokusu (`scroll-padding-top`).
- Klawisze: walka tylko w Fight (3.3); pola tekstowe, select, `contenteditable` i dialogi połykają klawisze
  (reguła S5 bez zmian); `?` pokazuje listę. Konflikty: `R`/`Space` w Setup nic nie robią; `Esc` zamyka dialog
  zanim przerwie cast.
- Cele dotyku ≥ 32 px (desktop), ≥ 44 px na `pointer: coarse` (sloty 50, item 44, zakładki 52 wys.).
- Dostępne nazwy: „Action bar”, „Item bar”, „Cast bar”, „Mana”, „Target health”, „Your buffs”, „Fight
  summary”, „Stats at the pull”, „Set bonuses”, nazwy pól — **bez zmian** (testy). Sloty: „Shadow Bolt (1)”,
  aury: „Immolate, 4.1s left”, „…, 3 charges”.
- Kolor nigdy sam: ikona + nazwa w meterze i tabeli, „!” przy krytach, pogrubienie + czerwień przy wygasaniu,
  tekst „Not modelled”, linie wykresu różnią się też kreską.
- Wykresy: `role="img"` + `<title>`, tabela danych obok (Damage) lub w „Show data” (DPS over time), tooltip
  na hover i fokus.
- `forced-colors`: paski i sloty dostają obwódki `CanvasText`.

## 9. Responsywność

Breakpointy: ≥ 1280 (pełny), 900–1279 (tablet: podsumowanie Setup pod treścią, dock jako okno, Report 1 kol.),
< 900 (mobile: dolny pasek trybów, szyna pozioma, arena w pionie bez przewijania do 390×700). Safe areas:
`env(safe-area-inset-*)` w nagłówku i dolnym pasku, `viewport-fit=cover`. `overscroll-behavior: none` tylko
na `pointer: fine`; dialogi `overscroll-behavior: contain`. `touch-action: manipulation` na kontrolkach.
Bez poziomego przewijania strony (sprawdzane w zrzutach Playwright: 0 px nadmiaru we wszystkich widokach).

## 10. Wydajność

- Leniwe trasy: `React.lazy` dla Setup (Gear, Talents, Script editor osobno), Report (wykresy, Log); Fight w
  głównym bundlu (pierwszy ekran). Baza przedmiotów nadal ładuje się przy pierwszym wejściu w Gear.
- Pętla rAF tylko w Fight. Komponenty areny subskrybują tylko potrzebne kawałki snapshotu (selektory,
  `useSyncExternalStore` albo props z `memo` i porównaniem prymitywów); nagłówek, dock i Setup **nie
  renderują się co klatkę** (dock: aktualizacja meter/logu 4×/s z `useDeferredValue`/throttle).
- Combat text zostaje warstwą imperatywną (dziś `CombatTextHud`), sweepy przez zmienną CSS `--p` ustawianą
  na elemencie (bez rerenderu Reacta), timery aur formatowane raz na klatkę w jednym komponencie.
- Listy > 50 (log, wybór przedmiotów, scenariusze): wirtualizacja (`content-visibility: auto` albo własny
  okno-list; bez nowych zależności, jeśli wystarczy).
- Wykresy: SVG liczony z danych raz na wynik (memo), szerokość z `ResizeObserver`.
- Fonty: 4 pliki ładowane od razu (~90 KB), reszta na żądanie (italic tylko z combat textem).

## 11. Teksty

- Przyciski mówią, co robią, Title Case: „Start the Fight”, „Run 1,000 Fights”, „Import Gear…”, „Copy
  Report”, „Fight Again”, „Reset to Defaults…” (wielokropek = otwiera potwierdzenie).
- Strona czynna, druga osoba, bez przeprosin; błąd mówi co i jak naprawić („rules[3].if: position 46:
  expected “.” or “(” after “inflight”. Use inflight.immolate.”).
- Liczby przez `Intl.NumberFormat` („1,451”, „2,104.5”), jednostki z twardą spacją („60&nbsp;s”), wielokropek
  `…`, cudzysłowy drukarskie.
- Stany puste zapraszają do działania (6). Nazwy z gry pisane jak w grze (Shadow Bolt, Curse of Doom).
- Język UI: angielski (jak dziś); dokumentacja po polsku.

## 12. Ryzyka i pytania do autora

Ryzyka:
- **Migracja testów:** testy szukają paneli po rolach i nazwach; przeniesienie paneli do tras ukrywa je (React
  nie renderuje ukrytej trasy). Mitigacja w planie: zachowane nazwy, helper `renderAt('#/setup/gear')`.
- **Wydajność areny** po dodaniu docka i rzędów aur: pomiar w Task 2 (cel: 60 fps, < 4 ms na klatkę skryptu
  na laptopie, brak rerenderu nagłówka/Setup w trakcie walki).
- **Zachowanie klawiszy** zmienia się (tylko w Fight) — świadoma zmiana, opisana w README.
- **Fonty** zwiększają pierwsze ładowanie o ~90 KB.

Pytania (Q):
1. Co się dzieje z trwającą walką po wyjściu z Fight: pauza (rekomendacja), dalszy bieg czy reset?
2. Arena zawsze ciemna także w jasnym motywie (rekomendacja: tak)?
3. Podpowiedź „Next by the script” (złota poświata slotu): domyślnie włączona, wyłączona, czy tylko w
   trybie treningu?
4. Po końcu walki: zostać na arenie z kartą „Fight over” (rekomendacja, `Enter` = Report) czy od razu Report?
5. Fonty Marcellus + Barlow akceptowalne? Alternatywa bez pobierania: systemowe szeryfy + system-ui.
6. Panel Simulator: pełny w Report (rekomendacja) czy jako osobny tryb „Analyse”?
7. Wolno obracający się pierścień celu: zostawić czy usunąć?
