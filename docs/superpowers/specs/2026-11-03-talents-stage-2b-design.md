# Etap 2b: talenty (gotowe buildy i edytor drzewka) — projekt (spec)

Data: 2026-11-03
Status: zatwierdzony przez autora ("jak skończysz symulator odpal 2b"), bez osobnego przeglądu; decyzje poniżej to
domyślne rekomendacje, do poprawienia w dowolnym momencie
Uzupełnia: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` §7 (etap 2b) i decyzję autora:
"najlepsze talenty dla danej specki, z możliwością modyfikowania przed talent tree editor".

## 1. Cel i kontekst

Talenty to dziś jeden stały build autora (`destructionTalentString` w `src/data/classes/warlock/talents.ts`, 0/21/40),
a ich efekty są wpisane na sztywno jako modyfikatory. Etap 2b daje:

- **A. Dane drzewek Warlocka** (3 drzewa, 64 talenty: nazwy, ikony, ranki, pozycje, wymagania, opisy per rank)
  wygenerowane z wowsims tbc-new i zatwierdzone w repo.
- **B. Efekty talentów jako dane**: tabela `talent → efekt(rank)` zastępuje wpisane na sztywno modyfikatory;
  silnik i reguły bota liczą z talentów z ustawień.
- **C. Gotowe buildy** (presety) z wowsims i build autora; **import** ciągu talentów z eksportu (etap 2a go
  zapamiętuje, 2b go stosuje) oraz eksport ciągu.
- **D. Edytor drzewka** (zakładka/panel Talents): trzy drzewa, +/− rank, licznik punktów, wymagania wierszy i
  zależności, presety, import/eksport, oznaczenia talentów niezamodelowanych.

**Poza zakresem:** pet (statystyki i zachowanie peta, Demonic Knowledge, Master Demonologist inaczej niż jako
mnożnik już wpisany w model sacrifice), pasywy bez wpływu na DPS bota w tym modelu (np. Improved Healthstone,
Fel Domination), nowe czary z talentów poza już zdefiniowanymi (Unstable Affliction, Siphon Life, Death Coil,
Seed of Corruption nie są w modelu; talent jest pokazany jako niezamodelowany), Fire jako osobny spec (etap 5).

## 2. Dane drzewek

- Generator `scripts/build-talent-tree.mjs <klon wowsims tbc-new>` czyta `ui/sim/talents/trees/warlock.json`
  (nazwy pól, ranki, `location` (wiersz, kolumna), `prereqLocation`, `spellIds` per rank, ikony) i zapisuje
  `src/data/classes/warlock/talentTree.json` (zatwierdzony, test spójności z kolejnością `TALENT_ORDER` i długością
  ciągu). Opisy per rank z Wowhead TBC tooltip lub z `spellIds` (zbierane przez generator z tooltip API
  `https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5&locale=0`; offline reguły: opis brany z jednego
  przebiegu generatora i zatwierdzony). Ikony talentów: pliki w `public/icons/talents/` przez rozszerzony
  `npm run icons` (budżet ~150 KB).
- Format ciągu: `drzewo1-drzewo2-drzewo3`, cyfra per talent w kolejności `TALENT_ORDER`, brakujące końcowe cyfry =
  0 (jak dziś `parseTalentString`); kodowanie/dekodowanie z walidacją (ranki ≤ max, suma ≤ 61, wymagane punkty
  wiersza: 5 punktów w drzewie na wiersz, zależności `prereq` z pełnym rankiem); `validateTalents(string)` zwraca
  listę naruszeń, nigdy nie rzuca.

## 3. Efekty talentów

- `TALENT_EFFECTS: Record<string, (rank: number) => TalentEffect>` gdzie `TalentEffect` = `{ modifiers?,
  statMultipliers?, statBonuses?, auras?, hooks?, spellFlags? }` w prymitywach silnika; każdy wpis cytuje źródło
  (wowsims `sim/warlock/talents.go`, `spell_data_auto_gen.go` i Wowhead). Zamodelowane: wszystko, co da się wyrazić
  istniejącymi prymitywami (modyfikatory czarów, mnożniki statystyk, aury, hooki), w tym obecne talenty autora
  (wyniki dla jego buildu **dokładnie** takie same jak dziś) oraz te z Destruction/Affliction/Demonology, które
  wpływają na DPS bota (np. Improved Corruption, Improved Curse of Agony, Suppression, Empowered Corruption,
  Contagion, Shadow Mastery, Improved Shadow Bolt, Aftermath, Improved Immolate, Intensity/Destructive Reach
  gdzie mają sens, Pyroclasm, Soul Leech, Fel Intellect, Demonic Aegis, Master Demonologist w wersji
  zaimplementowanej dziś). Talent, którego efekt nie jest wyrażalny (np. wymaga hooka na tick DoT, Nightfall;
  petów; zdrowia), jest oznaczony **niezamodelowany** z powodem w `UNMODELLED_TALENTS`, widoczny w edytorze i w
  `docs/data-sources.md`; nigdy cicho pomijany.
- `SetupConfig.talents?: string` (opcjonalne; brak = build autora), `buildDestructionWarlock(options, gear, db,
  talents)`; reguły priorytetu (`rotation.ts`: czas rzucania i koszt Shadow Bolta, Immolate, Corruption, okna
  Shadowburn) czytają talenty z setupu, nie ze stałej; talent dający czar (Shadowburn, Conflagrate, Shadowfury,
  Unstable Affliction...) włącza go w speku i **przypisuje do paska** gdy slot jest wolny (to zamyka decyzję R17:
  slot 8 na Conflagrate), bez nich czar jest niedostępny (`cast` odrzuca: 'unknown-spell' lub 'not-talented').
  Presety setupu i "Reset to defaults" przywracają build autora; domyślny setup daje identyczne wyniki
  (1425,1766…/1428,335…).

## 4. Presety i import

- `TALENT_PRESETS`: z wowsims `ui/specs/warlock/dps/presets.ts` (Destruction `-20500301332101-50500051220051053105`,
  Destro/Nightfall `150222201023--505020510200510531051`, Affliction, Demo/Ruin, Demonology Felguard; warianty
  Fire nieoferowane, jeśli takie są) oraz "Mój build (eksport)" = build autora. Dla każdej fazy "najlepszy build"
  pokazujemy tam, gdzie wowsims ma osobny build, inaczej ten sam build przy wszystkich fazach (bez wymyślania
  danych); notatka z pochodzeniem; walidacja każdego presetu testem.
- Import eksportu WowSimsExporter (`talents`) stosuje build przez ten sam walidator; ciąg nieprawidłowy daje raport
  z naruszeniami i nie zmienia buildu; eksport kopiuje ciąg.

## 5. UI (panel Talents)

- Sekcja zwijana "Talents" obok Setup/Gear/Simulator: trzy drzewa (siatka wierszy i kolumn, ikony, ranki "r/max"),
  lewy klik + / prawy klik − (plus przyciski dla klawiatury i dotyku), liczniki punktów per drzewo i suma
  (np. 0/21/40, pozostałe 0), blokady wierszy i zależności (nie da się wziąć talentu bez wymaganych punktów i
  prereq; cofnięcie punktu psujące wymagania innych talentów jest zablokowane z komunikatem), tooltip z opisem rank
  i oznaczeniem "niezamodelowany", presety (aria-pressed po głębokim porównaniu), "Custom", import/eksport ciągu,
  Reset do buildu autora, podsumowanie "zamodelowane/niezamodelowane" i ostrzeżenie o niewykorzystanych punktach.
- Zmiana talentów obowiązuje od następnej walki (nierozpoczęta bierze od razu), jak reszta setupu; zapis w
  `localStorage` w setupie; reguły S5 (pola tekstowe połykają klawisze) i klawisze paska zachowane; ikony z
  repo, brak = kafelek z inicjałami; layout bez poziomego przewijania przy 390 px (drzewa przewijane w pionie
  jedno pod drugim).

## 6. Ryzyka

- Poprawność efektów talentów (największe ryzyko; źródła wowsims i Wowhead, `UNVERIFIED` oznaczone).
- Zmiana dostępnych czarów i paska (Conflagrate na slot 8) musi nie zmieniać domyślnego buildu autora.
- Rozmiar danych drzewek i ikon (budżet), wydajność edytora (64 talenty, brak problemu).
- Bot i priorytet muszą radzić sobie z buildami bez Shadow Bolta jako głównego czaru (np. Affliction/Fire): w tym
  etapie bot gra rotację z ustawień (curse, DoT-y, Shadow Bolt filler), a talenty tylko zmieniają liczby i dostępność
  czarów; build, w którym wybrana rotacja ma niedostępny czar, daje ostrzeżenie (nie awarię).
