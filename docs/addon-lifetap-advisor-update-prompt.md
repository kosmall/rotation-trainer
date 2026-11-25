# Prompt: aktualizacja istniejącego addonu „LifeTapAdvisor" do finalnych progów

Wklej całość poniżej asystentowi, który ma dostęp do repozytorium addonu. Addon już istnieje, więc to
zadanie **zmienia** istniejący kod; nie pisze go od zera. Źródło liczb: `reports/forever_lifetap_strategies.md`
(1 mob na pull) i `reports/forever_lifetap_strategies_2mobs.md` (2 moby), wygenerowane 25.11.2026 na modelu
many potwierdzonym pomiarami z gry (level 1 i 31). Pełny opis addonu od zera (UI, API, logowanie) jest w
`docs/addon-lifetap-advisor-prompt.md`; ten plik go uzupełnia i ma pierwszeństwo, gdy się różnią.

---

## Cel

Zaktualizuj addon **LifeTapAdvisor** (WoW Forever, klasa Warlock), który podpowiada na ekranie
`LIFE_TAP`, `EAT_DRINK` albo `NONE` na podstawie many i HP gracza, tak aby:

1. używał **finalnych progów** z tabeli poniżej (z profilami 1 mob, 2 moby i Demonology/Fire),
2. miał **dokładnie opisaną kolejność decyzji** (poza walką najpierw Life Tap, potem jedzenie),
3. miał **bezpiecznik HP** i przełącznik liczby mobów,
4. **zachował** dotychczasowe ustawienia i komendy użytkownika (migracja `SavedVariables`),
5. miał testy czystej logiki, README i wpis w changelogu.

Addon pozostaje **doradcą**: nie rzuca czarów, nie je ani nie pije za gracza, nie używa funkcji chronionych.

## Krok 0: rozpoznaj istniejący kod (zrób to przed jakąkolwiek zmianą)

Przeczytaj wszystkie pliki addonu (`.toc`, Lua, XML, README, testy, `SavedVariables`) i zapisz krótką
**tabelę rozbieżności**: dla każdego punktu z sekcji „Co ma być zaktualizowane" napisz, co jest teraz, co ma być,
oraz czy zmiana jest potrzebna. Nie zmieniaj tego, co już działa zgodnie ze specyfikacją. Pokaż tę tabelę w odpowiedzi,
a potem wprowadź zmiany bez dopytywania; pytaj tylko, jeśli zajdzie jedna z sytuacji z sekcji „Kiedy zapytać".

Sprawdź w szczególności:

- czy logika decyzji jest oddzielona od API gry (czysta funkcja `Advise`), czy trzeba ją wydzielić,
- jakie profile i jakie wartości domyślne są dziś zapisane i w jakim formacie (nazwy kluczy, skala 0–1 albo 0–100),
- czy istnieje przełącznik liczby mobów, bezpiecznik HP, odczyt kosztu Life Tapa z tooltipa, wykrywanie aury jedzenia/picia,
- jaka jest wersja `## Interface:`, `## Version:` i schemat `LifeTapAdvisorDB`.

## Co ma być zaktualizowane

### 1. Finalne profile (progi w ułamkach 0–1; jeśli addon trzyma procenty 0–100, zachowaj jego skalę)

| Profil | combatMana | combatHp | lowMana | lowHp | betweenMana | betweenHp | breakHp | Użycie |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `BEST_1MOB` (domyślny) | 0,60 | 0,80 | 0,20 | 0,30 | 0,90 | 0,65 | 0,40 | pull z 1 mobem, wszystkie buildy |
| `BEST_2MOB` | 0,50 | 0,50 | 0 (reguła wyłączona) | 0,30 | 0 (reguła wyłączona) | 0,65 | 0,50 | pulle z 2 mobami |
| `DEMO_1MOB` | 0,40 | 0,80 | 0,10 | 0,40 | 0,90 | 0,80 | 0,40 | opcjonalnie dla Demonology/Fire, 1 mob |
| `USER` | 0,60 | 0,80 | 0,20 | 0,30 | 0,90 | 0,995 | 0,30 | pierwotna reguła użytkownika (do porównań) |

Parametry wspólne: `safetyHp = 0,10` (bezpiecznik, patrz niżej). Wartość 0 w `combatMana`, `lowMana` albo
`betweenMana` **wyłącza** daną regułę (wtedy powiązany próg HP jest bez znaczenia).

**Co się zmieniło względem wcześniejszych wersji tych progów** (użyj do migracji, sekcja 5). Jeśli addon ma
któryś z poniższych zestawów jako domyślny, podmień go na wartość z tabeli powyżej:

| Profil | stare wartości (combatMana, combatHp, lowMana, lowHp, betweenMana, betweenHp, breakHp) | nowe |
|---|---|---|
| `BEST_1MOB` | 0,40 / 0,80 / 0,20 / 0,40 / 0,90 / 0,80 / 0,40 | 0,60 / 0,80 / 0,20 / 0,30 / 0,90 / 0,65 / 0,40 |
| `BEST_2MOB` | 0,50 / 0,50 / 0 / 0,30 / 0,90 / 0,80 / 0,50 | 0,50 / 0,50 / 0 / 0,30 / **0 (wyłączona)** / 0,65 / 0,50 |
| `DEMO_1MOB` | 0,40 / 0,80 / 0,10 / 0,30 / 0,90 / 0,995 / 0,50 | 0,40 / 0,80 / 0,10 / **0,40** / 0,90 / **0,80** / **0,40** |
| `AFFLICTION_1MOB` | 0,60 / 0,80 / 0,20 / 0,30 / 0,90 / 0,65 / 0,40 | **usunięty** (identyczny z nowym `BEST_1MOB`) |

### 2. Reguły i kolejność decyzji

Wejście: `manaPct`, `hpPct` (0–1), `inCombat`, `lifeTapKnown`, `lifeTapHealthCostPct` (koszt Life Tapa jako ułamek
max HP), `drinkingOrEating`, `dead`. Wyjście: `advice` (`LIFE_TAP`, `EAT_DRINK`, `NONE`), `reason`, `urgency`.

```lua
local function lifeTapWanted(s, p)
  local combatRule = p.combatMana > 0 and s.manaPct < p.combatMana and s.hpPct > p.combatHp
  local lowRule    = p.lowMana    > 0 and s.manaPct < p.lowMana    and s.hpPct > p.lowHp
  local betweenRule = (not s.inCombat) and p.betweenMana > 0
                      and s.hpPct >= p.betweenHp and s.manaPct < p.betweenMana
  return combatRule or lowRule or betweenRule
end

function Advise(s, p)
  if s.dead or s.drinkingOrEating then return { advice = "NONE" } end
  -- 1. Life Tap (kolejność ma znaczenie: najpierw Life Tap, potem jedzenie)
  if s.lifeTapKnown and lifeTapWanted(s, p)
     and (s.hpPct - s.lifeTapHealthCostPct) >= p.safetyHp then
    return { advice = "LIFE_TAP", urgency = (s.manaPct < 0.15) and "high" or "low" }
  end
  -- 2. Jedzenie i picie: tylko poza walką
  if (not s.inCombat) and s.hpPct < p.breakHp then
    return { advice = "EAT_DRINK", urgency = "high" }
  end
  return { advice = "NONE" }
end
```

Zasady uzupełniające:

- W walce **nigdy** nie podpowiadaj jedzenia (przerwa dopiero po walce).
- Jedzenie trwa do pełnego HP; **pić tylko w trakcie jedzenia**, a resztę many uzupełnić Life Tapem po jedzeniu
  (po zakończeniu jedzenia znów działa reguła 1 i reguła „między mobami").
- Bezpiecznik: jeśli koszt Life Tapa zostawiłby mniej niż `safetyHp` HP, nie podpowiadaj Life Tapa.
- Gdy gracz pije lub je (aura Drink/Food), nie podpowiadaj nic.

### 3. Liczba mobów (przełącznik profilu)

Symulator pokazał, że optimum zależy od wielkości pulla (dla 2 mobów wyższy próg przerwy i Life Tap przy niższym HP).
Upewnij się, że addon ma:

- komendę `/lta mobs 1|2|auto` i zapamiętuje wybór; `1` używa `BEST_1MOB`, `2` używa `BEST_2MOB`,
- tryb `auto`: liczba wrogich jednostek w walce z graczem (np. `nameplate1..40` z `UnitCanAttack` i `UnitAffectingCombat`)
  z histerezą 3 s, żeby profil nie migał; 3 i więcej mobów używa `BEST_2MOB` i pokazuje ostrzeżenie
  „3+ moby: wynik symulacji spada o połowę, rozważ pojedyncze pulle",
- `DEMO_1MOB` jest tylko ręcznym wyborem (`/lta profile DEMO_1MOB`), a nie automatycznym.

### 4. Opcjonalny profil dla długich walk (zaimplementuj tylko jeśli zmiana jest mała)

Jeśli prawdziwe moby w Forever mają więcej HP niż w Classicu (Blizzard podniósł HP wyższych leveli o nieznany
współczynnik), symulacja pokazuje, że **więcej picia się opłaca**: przy HP mobów ×1,25 stary próg „pij, gdy mana < 40%
albo HP < 50%, do 90%" wyprzedza `BEST_2MOB` (97,1 wobec 94,7 zabić na godzinę), a przy ×1,5 (74,8 wobec 72,0). Dodaj profil
`LONG_FIGHTS`: `combatMana` 0,35, `combatHp` 0,60, `lowMana` 0, `betweenMana` 0, `breakHp` 0,50 oraz dwa
nowe parametry `breakMana` = 0,40 (przerwa także, gdy mana < 40% poza walką) i `drinkTo` = 0,90 (pić do 90% many,
nie tylko w trakcie jedzenia). Wyłącz go z `auto`; użytkownik wybiera go ręcznie, gdy walki są długie
(zwykle gdy zabicie moba trwa > 25 s). Jeśli dodanie `breakMana`/`drinkTo` wymaga większej przebudowy, pomiń ten punkt
i opisz go w README jako pomysł.

### 5. Migracja `SavedVariables` (nie psuj ustawień użytkownika)

1. Dodaj `LifeTapAdvisorDB.dbVersion` (zwiększ o 1 względem obecnej; brak = 0).
2. Przy `PLAYER_LOGIN`, jeśli `dbVersion` jest starsza: dla każdego zapisanego profilu porównaj progi z listą **starych
   domyślnych** z tabeli w sekcji 1. Jeśli wszystkie wartości są równe starym domyślnym, podmień je na nowe;
   jeśli użytkownik je zmienił, **zachowaj jego wartości**, oznacz profil jako `custom` i raz wypisz w czacie, które domyślne
   wartości się zmieniły (po jednej linii na profil).
3. Użytkownik, który miał wybrany `AFFLICTION_1MOB`, dostaje `BEST_1MOB`.
4. Nie zmieniaj nazw kluczy ani położenia ramki, głośności, trybu logowania i innych ustawień.
5. Dodaj komendę `/lta reset <profil>`, która przywraca finalne wartości danego profilu.

### 6. Co ma zostać bez zmian

Wygląd i położenie ramki, dźwięk, panel opcji, odczyt kosztu Life Tapa z tooltipa (z oszacowaniem `base + Spirit`
w razie niepowodzenia, oznaczonym w debugu jako „estimated"), wykrywanie aur jedzenia/picia, komendy `/lta`,
`/lta lock|unlock`, `/lta test`, `/lta debug`, `/lta log`, `/lta export`. Jeśli któraś z nich nie istnieje, dodaj ją
według `docs/addon-lifetap-advisor-prompt.md`.

## Testy (czysta logika, bez klienta gry)

Zaktualizuj istniejące testy `Advise` do poniższych tabel i dodaj testy migracji. Wynik w kolumnie `wynik` obejmuje
bezpiecznik zakładający, że koszt Life Tapa to 15% max HP, o ile nie napisano inaczej.

**Profil `BEST_1MOB`** (mana %, HP %, w walce):

| mana | HP | w walce | wynik |
|---:|---:|:---:|---|
| 55 | 90 | tak | LIFE_TAP (mana < 60, HP > 80) |
| 55 | 70 | tak | NONE |
| 15 | 35 | tak | LIFE_TAP (mana < 20, HP > 30; 35 − 15 = 20 ≥ 10) |
| 15 | 25 | tak | NONE (w walce nie ma przerwy) |
| 15 | 25 | nie | EAT_DRINK (HP < 40, Life Tap niewskazany) |
| 15 | 35 | nie | LIFE_TAP (najpierw Life Tap) |
| 80 | 70 | nie | LIFE_TAP (między mobami: HP ≥ 65, mana < 90) |
| 80 | 60 | nie | NONE |
| 95 | 100 | nie | NONE |
| 10 | 100 | nie | LIFE_TAP |
| 50 | 30 | nie | EAT_DRINK |
| 15 | 20 | tak | NONE (HP nie > 30) |
| dowolne | dowolne | pije/je | NONE |
| 55 | 90, koszt 85% HP | tak | NONE (bezpiecznik: 90 − 85 = 5 < 10) |

**Profil `BEST_2MOB`:**

| mana | HP | w walce | wynik |
|---:|---:|:---:|---|
| 45 | 60 | tak | LIFE_TAP (mana < 50, HP > 50) |
| 45 | 45 | tak | NONE |
| 15 | 40 | tak | NONE (reguła niskiej many wyłączona, HP nie > 50) |
| 80 | 70 | nie | NONE (reguła „między mobami" wyłączona) |
| 60 | 45 | nie | EAT_DRINK (HP < 50, Life Tap niewskazany) |
| 40 | 45 | nie | EAT_DRINK (HP nie > 50) |

**Profil `DEMO_1MOB`:**

| mana | HP | w walce | wynik |
|---:|---:|:---:|---|
| 35 | 85 | tak | LIFE_TAP (mana < 40, HP > 80) |
| 35 | 70 | tak | NONE |
| 8 | 50 | tak | LIFE_TAP (mana < 10, HP > 40) |
| 8 | 35 | tak | NONE |
| 85 | 82 | nie | LIFE_TAP (HP ≥ 80, mana < 90) |
| 85 | 70 | nie | NONE |
| 50 | 35 | nie | EAT_DRINK |

**Profil `USER`:** (55, 90, w walce) → LIFE_TAP; (85, 100, poza walką) → LIFE_TAP; (85, 99, poza walką) → NONE;
(50, 28, poza walką) → EAT_DRINK.

**Migracja:** (a) `dbVersion` 0 z domyślnym starym `BEST_1MOB` → nowe wartości; (b) ten sam profil z jedną zmienioną
wartością → wartości użytkownika zachowane, profil `custom`; (c) wybrany `AFFLICTION_1MOB` → `BEST_1MOB`; (d) ponowne
uruchomienie migracji nie zmienia niczego (idempotentność); (e) brak `LifeTapAdvisorDB` → świeże domyślne.

## Dane i zastrzeżenia (do README addonu i changelogu)

Progi pochodzą z symulatora (kod: `src/forever/ltpolicy.ts`, raporty w `reports/`), liczącego średnią liczbę zabić
na godzinę dla 7 buildów na levelach 40–59 (gear „average", dane: Classic dla mobów i regeneracji, tooltipy Forever dla picia i
jedzenia, pomiary z gry dla HP i many gnoma-warlocka). Zysk względem reguły użytkownika:

| Pull | reguła użytkownika | finalny profil | zysk | komórki lepsze / gorsze (z 35) | zgony na godzinę |
|---|---:|---:|---:|---|---|
| 1 mob | 114,0 | 117,0 | +2,6% | 29 / 1 | 0,84 → 0,08 |
| 2 moby | 110,3 | 130,5 | +18% | 30 / 4 | 5,8 → 0,25 |

Dla 1 moba reguła użytkownika jest więc już blisko optimum (różnica około 3%); większy zysk jest przy 2 mobach.
Przy 3 mobach wszystkie strategie dają około 48–63 zabić na godzinę wobec około 110–130 przy 1–2 mobach.

Ograniczenia, które README ma wymienić: HP i obrażenia mobów to dane Classic (Blizzard podniósł HP wyższych leveli przed startem
o nieznany współczynnik; przy ×1,25 wszystkie strategie tracą około 18–30%, a przy ×1,5 około 34–45%), statystyki sprzętu to
założenia, koszt i skalowanie Life Tapa ze Spirit w Forever nie są opublikowane, a symulator zakłada sprawnego gracza. **Progi
mają pozostać konfigurowalne**; zachęć użytkownika do włączenia logowania (`/lta log on`) i porównania z symulatorem.

## Wersja i changelog

Zwiększ `## Version:` w `.toc` (zmiana domyślnych progów i migracja to wersja minor). Dopisz do `CHANGELOG`/README
sekcję „Aktualizacja progów": nowa tabela profili, kolejność decyzji, bezpiecznik, `/lta mobs`, migracja ustawień,
komenda `/lta reset`, usunięty profil `AFFLICTION_1MOB`.

## Kiedy zapytać użytkownika (tylko wtedy)

- gdy schemat `SavedVariables` jest niejasny i migracja mogłaby skasować ustawienia,
- gdy klient nie udostępnia sposobu odczytu kosztu Life Tapa ani tooltipa,
- gdy dodanie `LONG_FIGHTS` wymagałoby przepisania istniejącej logiki (wtedy domyślnie pomiń i opisz w README).

## Format odpowiedzi

1. Tabela rozbieżności (krok 0).
2. Lista zmienionych plików z jednozdaniowym opisem każdej zmiany.
3. Wynik testów (`busted` lub użyty runner).
4. Opis migracji (co się dzieje ze starymi i własnymi progami).
5. Co zostało pominięte lub wymaga decyzji użytkownika.

## Kryteria akceptacji

1. Wszystkie testy `Advise` i migracji przechodzą bez klienta gry.
2. Po wczytaniu na Warlocku domyślnie działa `BEST_1MOB`, a `/lta mobs 2` przełącza na `BEST_2MOB` bez `/reload`.
3. Istniejące ustawienia użytkownika (własne progi, położenie ramki, dźwięk) przetrwają aktualizację.
4. Brak błędów Lua i tainta w walce, na mountcie, po śmierci i przy wejściu do instancji.
5. README i changelog opisują nowe progi, migrację i ograniczenia danych.
