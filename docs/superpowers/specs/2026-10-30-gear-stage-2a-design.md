# Etap 2a: gear (baza itemów, presety BIS na fazy, import/eksport) — projekt (spec)

Data: 2026-10-30
Status: zatwierdzony przez autora ("działaj", kolejka etapów pokazana na czacie), bez osobnego przeglądu
Uzupełnia: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` §7 (etap 2a) oraz decyzje autora z
początku projektu: "kilka wariantów do wyboru, na każdą fazę przygotuj zestaw BIS dla danej klasy/specki; dodaj
też możliwość importu szablonu itemów (eksport z gry addonem WowSimsExporter, użyte będą ID przedmiotów)".

## 1. Cel i zakres

Dziś gear to stała lista 17 itemów autora (`src/data/classes/warlock/items.ts`, hand-wpisane staty). Etap 2a daje:

- **A. Bazę itemów, gemów i enchantów** wygenerowaną z wowsims tbc-new (staty, sockety i bonusy, przynależność do
  setu, faza, ikona), ładowaną leniwie.
- **B. Presety BIS na fazy** (pre-raid, T4, T5, T6, Zul'Aman, Sunwell) z gotowych zestawów wowsims dla Destruction
  Warlocka, plus gear autora jako preset "Mój gear (eksport)".
- **C. Import i eksport** po ID itemów w formacie WowSimsExporter (wklejony JSON), z raportem nieznanych ID.
- **D. Zakładkę/panel "Gear"**: sloty, wybór itemu, gemy, enchanty, presety, import/eksport, staty "na pull".

Gear wchodzi do `SetupConfig` (zapis w `localStorage`), do `applySetup` i do silnika przez istniejące
`buildSetup` (gemy, enchanty, sockety, meta, bonusy setowe liczone z części na postaci).

**Poza zakresem:** talenty (etap 2b: import tylko zapamiętuje ciąg talentów z eksportu, nie stosuje go), wybór rasy
(zostaje Gnome), konfigurowalne keybindy (2c), warianty Fire (etap 5; zestawy Fire są w danych oznaczone i
nieoferowane), efekty on-use/proc itemów poza już zamodelowanymi (Icon, Band): są wymienione w UI jako
"niezamodelowane", edytor itemów z losowymi sufiksami/przekuwaniem (nie dotyczy TBC).

## 2. Dane

### 2.1 Generator bazy

- `scripts/build-item-db.mjs <ścieżka do klonu wowsims tbc-new>` czyta `assets/database/db.json` i zapisuje
  `src/data/items/db.json` (zatwierdzony do repo). Klon nie jest zależnością repo (nie ma go w CI): generator jest
  uruchamiany ręcznie, wynik jest danymi; test sprawdza spójność zatwierdzonego pliku.
- Filtry: item możliwy do założenia przez Warlocka (brak `classAllowlist` albo zawiera klasę 9; pancerz tylko
  Cloth lub brak pancerza; broń tylko typów dostępnych Warlockowi: kij, sztylet, miecz 1H, buława 1H nie (nie umie),
  oraz off-handy/held-in-off-hand i różdżki); faza ≤ 5; ma przynajmniej jeden istotny stat (Int, Spirit, Spell
  Power, Shadow/Fire Power, Crit, Hit, Haste, MP5) albo jest w presecie. Dokładne reguły i liczby odrzuceń w
  `docs/data-sources.md`.
- Pola itemu: `id, name, icon, slot, phase, stats (RawStats: intellect, spirit, spellPower, shadowPower, firePower,
  critRating, hitRating, hasteRating, mp5), sockets (kolory), socketBonus (stats), setId?, setName?, unique?,
  effects? (opis niezamodelowanych efektów on-use/proc: tylko tekst)`.
- Gemy: `id, name, icon, color, stats, metaRequires?, metaModifiers?`; enchanty: `effectId, name, icon, slot, stats`.
  Mapowanie indeksów statystyk wowsims (`proto/common.proto` `Stat`) → `RawStats` udokumentowane przy generatorze.
- Powierzchnia: leniwy `import()` (osobny chunk), `getItemDb()` zwraca `Promise<ItemDb>`; testy węzłowe ładują
  synchronicznie z pliku.

### 2.2 Spójność z etapem 1

Stage 1 ma ręcznie wpisane staty 17 itemów autora. Baza z generatora musi dać dla tych itemów **te same** statystyki
końcowe (test: złoty). Po tej zgodności `items.ts` zostaje listą domyślnego gearu autora (ID, gemy, enchanty) i
ręcznie modelowanych efektów (Icon, Band), a staty brane są z bazy. Wartości domyślnego setupu (1425,1766…/1428,335…)
pozostają dokładnie takie same. Jeśli którykolwiek item autora różni się w bazie wowsims od tego, co jest w repo
(np. inny gem), różnica jest opisana i rozstrzygana na korzyść eksportu autora.

### 2.3 Bonusy setowe

Dla setów występujących w presetach i w bazie (Voidheart/Corruptor/Malefic Raiment i ewentualne inne setów z
bonusami dla castera) dane bonusów (`SetBonusDef`) z wowsims `sim/warlock` i `sim/core` (T4 2pc/4pc, T5, T6, ZA,
SWP). Set bez zamodelowanego bonusu: ostrzeżenie w UI, nie błąd. Ten sam mechanizm co `src/engine/sets.ts`.

## 3. Setup, silnik i presety

- `SetupConfig.gear: (EquippedItem | null)[]` (17 pozycji w kolejności slotów WowSimsExporter: head, neck,
  shoulder, back, chest, wrist, hands, waist, legs, feet, finger1, finger2, trinket1, trinket2, mainhand, offhand,
  ranged), plus `gearPresetId?: string` do etykiety. Normalizacja: długość i typy, id musi istnieć w bazie i
  pasować do slotu (inaczej slot pusty), gemy i enchanty muszą istnieć i pasować (inaczej odrzucone), liczba
  gemów ≤ liczba socketów, brak duplikatów unikalnych itemów, stary zapis bez `gear` = domyślny gear autora.
  `version` zostaje 1 (pole opcjonalne przy wczytaniu).
- `buildDestructionWarlock(options, gear?)` buduje `setup` przez `buildSetup(gear, db)`; domyślnie gear autora.
  Efekty zamodelowane (Icon, Band) włączane są w katalogu buffów, bez zmian.
- Presety (`GEAR_PRESETS`): id, nazwa, faza, lista slotów; z wowsims `gear_sets/*.gear.json` (preraid, t4, t5, t6,
  za, swp), warianty Fire oznaczone `spec: 'fire'` (nieoferowane); "Mój gear (eksport)" = domyślny gear autora.
  Walidacja presetów: każdy item/gem/enchant jest w bazie (test).
- Import (`parseWowSimsExport(text)`): czysty parser; przyjmuje JSON z kluczem `items`/`gear.items` (format
  eksportu autora i format `*.gear.json` wowsims); zwraca `{ gear, talents?, race?, unknownItemIds,
  unknownGemIds, unknownEnchantIds, warnings }`; nigdy nie rzuca; limit rozmiaru; odporny na prototype
  pollution. Eksport (`exportWowSimsGear(gear)`): JSON zgodny z formatem `*.gear.json`.

## 4. UI

- Panel "Gear" jako osobna zakładka (obok gry; w tej wersji panel rozwijany na stronie, zakładki globalne w
  etapie 3). Sloty z ikoną, nazwą, gemami i enchantem; wybór itemu z listy z wyszukiwaniem i filtrem fazy;
  sockety z wyborem gemu (kolor socketu, bonus aktywny/nieaktywny), wymagania meta; presety (lista fazowa);
  "Import" (textarea, podgląd raportu nieznanych ID, przycisk "Zastosuj"), "Eksport" (kopiuj); suma statów "na
  pull" (istniejący panel), ostrzeżenia o niezamodelowanych efektach i setach; zmiana gearu obowiązuje od następnej
  walki (nierozpoczęta bierze od razu).
- Ikony itemów, gemów i enchantów: pliki zatwierdzone w repo (`npm run icons` rozszerzony), brak ikony = tile z
  inicjałami. Budżet rozmiaru: do ~6 MB; powyżej ograniczyć do presetów i najlepszych slotów.
- Hotkeys: zasady z rulings S5 (pola tekstowe i textarea połykają klawisze), Z X C V i reszta bez zmian.

## 5. Ryzyka

- Rozmiar bazy i ikon (mitigacja: filtry, leniwy chunk, budżet ikon).
- Poprawność mapowania statystyk i setów (mitigacja: test złoty na itemach autora i 17 itemów każdego presetu;
  sumy statów presetów porównane z wowsims, jeśli dostępne).
- Efekty itemów poza Icon i Band zaniżają DPS (jak dziś, jawnie oznaczone w UI i dokumentacji).
- Licencja danych wowsims (do potwierdzenia: sprawdzić LICENSE klonu i opisać w `docs/data-sources.md`).
