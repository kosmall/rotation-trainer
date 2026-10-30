# Efekty założonych itemów (on-use i procki) wynikają z gearu — projekt (spec)

Data: 2026-10-30
Status: zatwierdzony przez autora (zgłoszenie błędu: "Items and cooldowns jest zhardcodowane, gdy podmieniam
trinkety, nowe nie pojawiają się tam"), bez osobnego przeglądu
Uzupełnia: `docs/superpowers/specs/2026-10-30-item-actions-and-fight-settings-design.md` (przedmioty na action
barze) i `docs/superpowers/specs/2026-10-30-gear-stage-2a-design.md` (gear).

## 1. Problem

Panel Setup, grupa "Items and cooldowns", zawiera wpisy wpisane na sztywno w katalogu buffów: Icon of the Silver
Crescent i Band of the Eternal Sage (oraz mikstury i runy w "Consumables"). Po podmianie trinketów w panelu Gear
nowe trinkety nie pojawiają się w ustawieniach, nie mają aktywacji na pasku przedmiotów i nie mają procków. Gear
(etap 2a) i efekty itemów (etap 1.5/F) są niezależne.

## 2. Cel i zakres

Efekty itemów mają wynikać z **założonego gearu**:

- **A. Dane:** generator bazy (`scripts/build-item-db.mjs`) zapisuje dla każdego itemu **ustrukturyzowane efekty**:
  - **on-use** ze zwykłym buffem na staty: staty buffa (Int, Spirit, Spell Power, Shadow/Fire Power, Crit, Hit,
    Haste, MP5), czas trwania, własny cooldown, grupa wspólnego cooldownu (kategoria wowsims) i jej czas;
  - **proc** ze zwykłym buffem na staty: staty, czas trwania, szansa, wewnętrzny cooldown (ICD) i **wyzwalacz**
    (każdy cast czaru gracza, trafienie, krytyk), odczytany z kodu wowsims (`stat_bonus_procs_auto_gen.go` i
    definicje itemów); efekt, którego wyzwalacza nie da się wyrazić, zostaje opisem tekstowym ("niezamodelowany");
  - pozostałe efekty (obrażenia, leczenie, mana, pet, zmiany czaru) zostają opisem tekstowym jak dziś.
- **B. Setup:** katalog efektów itemów jest **budowany z gearu** (`deriveGearEffects(gear, db)`), a nie wpisany na
  sztywno. Każdy efekt ma stabilne id (`item:<itemId>` + indeks, np. `item:29370`), nazwę itemu, ikonę itemu, opis i
  włączenie w `enabledBuffs` (domyślnie wyłączone: wyniki domyślnego setupu bez zmian). Efekt itemu, którego już nie
  ma w gearze, jest nieaktywny (id zostaje w zapisie, nie jest stosowany ani pokazywany); stare id
  `icon-of-the-silver-crescent` i `band-of-the-eternal-sage` są przy wczytaniu przenoszone na `item:29370` i
  `item:29305` (stare zapisy i preset "Raid as in my log" działają bez zmian).
- **C. Silnik/dane gry:** on-use daje akcję przedmiotu (istniejący mechanizm `item`, `sharedCooldown`) na pasku
  przedmiotów; proc daje hook (jak Band dziś: ukryta aura ICD + aura buffa, losowanie z `api.roll` tylko gdy ICD
  nie działa). Wyzwalacze: `cast` (po zakończeniu dowolnego czaru gracza), `hit` (trafienie), `crit` (krytyk).
  Bez zmian w silniku poza ewentualnym rozszerzeniem hooków, jeśli trzeba (uzasadnić).
- **D. UI:** grupa "Items and cooldowns" w Setup pokazuje efekty **założonych** itemów (ikona itemu, nazwa,
  opis: staty, czas, cooldown, szansa/ICD, wyzwalacz), tylko te, które da się zamodelować; pod nimi lista
  "niezamodelowane efekty założonych itemów" (tekst). Mikstury, Dark Rune i Super Mana Potion zostają w
  Consumables (to nie gear). Pasek przedmiotów ma **6 slotów (Z X C V B N)**, bo trinket, trinket, mikstura,
  Dark Rune i Super Mana Potion przekraczają 4; powyżej 6 aktywnych akcji ostrzeżenie i obcięcie.
  Zmiana gearu przelicza listę natychmiast; stan włączenia zachowany po `id`.

Poza zakresem: procki wymagające obrażeń DoT (tick), efekty z kodu per item (np. zmiany czaru), item sety
(osobno), nowe trinkety spoza bazy, edytor efektów.

## 3. Zachowanie i reguły

- Domyślny setup (gear autora, nic włączone) daje dokładnie dotychczasowe wyniki (1425,1766…/1428,335…).
- "Raid as in my log" po przeniesieniu id daje te same staty i ten sam przebieg co dziś (Icon i Band włączone);
  różnice (kolejność aur w katalogu, nazwy) udokumentowane.
- Wspólny cooldown trinketów (kategoria 1141, 20 s) i inne kategorie z wowsims: z danych, nie na sztywno.
- Item z dwoma efektami (on-use + proc) daje oba; efekt z własnym ICD, który nakłada się z innym, zachowuje się jak
  w grze (osobne ICD).
- Wyzwalacz `hit`/`crit` nie reaguje na pudła; `cast` reaguje na każdy ukończony czar gracza (nie na ticki DoT,
  hooki nie biegną dla ticków: zasada silnika).
- Unique-equipped i kategorie limitów działają jak w gearze (etap 2a).
- Niezamodelowane efekty są widoczne w UI i w `docs/data-sources.md`, nigdy cicho pomijane.

## 4. Ryzyka

- Poprawność wyzwalaczy procków (cast vs hit vs crit) i szans: źródło wowsims; niepewne oznaczone
  `UNVERIFIED` i traktowane jako niezamodelowane, jeśli nie da się ustalić.
- Rozmiar bazy rośnie (efekty strukturalne dla kilkuset itemów): cel poniżej ~100 KB przyrostu surowo.
- Zmiana id w katalogu wymaga migracji zapisów i presetu; testy złote pilnują wyników.
