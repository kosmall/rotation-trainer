# Prompt: addon „LifeTapAdvisor" dla WoW Forever (Warlock)

Wklej całość poniżej jako zadanie dla modelu piszącego addon. Plik zawiera strategię z symulatora,
jej progi, wymagania techniczne i przypadki testowe. Źródło liczb: `reports/forever_lifetap_strategies.md`
(1 mob na pull) i `reports/forever_lifetap_strategies_2mobs.md` (2 moby), wersja z 25.11.2026, po korekcie modelu many na podstawie pomiarów z gry (level 1).

---

## Zadanie

Napisz addon do **WoW Forever** (tryb Blizzarda oparty na Classicu, start 4.11.2026) dla klasy
**Warlock**, który **podpowiada na ekranie**, kiedy użyć **Life Tap** oraz kiedy przerwać walkę/zbieranie
mobów na **jedzenie i picie**, na podstawie aktualnej many i HP gracza. Cel: warlock pije jak
najmniej, nie umiera, a levelowanie (40–59) jest jak najszybsze.

Addon ma być **doradcą, nie botem**: pokazuje komunikat i ikonę, nie rzuca czarów, nie jada i nie pije
za gracza (Blizzard zabrania automatyzacji; używaj tylko niezabezpieczonych funkcji API).

## Strategia (z symulacji)

Symulator porównał 7 strategii Life Tapa na 7 buildach i levelach 40–59 i przeszukał progi. Wynik
(średnia liczba zabić na godzinę, 1 mob na pull): strategia użytkownika 113,6, znaleziona najlepsza
117,3, stary próg „pij poniżej 40% many" 108,8, bez Life Tapa 101,8. Najlepsza strategia jest lepsza od
użytkownika w 35 z 35 sprawdzanych komórek (build × level) i prawie nie powoduje zgonów (0,03 na
godzinę wobec 0,9). **Progi są parametrami: ustawienia domyślne to profil `BEST_1MOB`.**

### Stan wejściowy

`manaPct = UnitPower("player", Mana) / UnitPowerMax(...)`, `hpPct = UnitHealth("player") / UnitHealthMax("player")`,
`inCombat`, `lifeTapKnown`, `lifeTapHealthCost` (czytaj z tooltipa czaru; patrz niżej), `drinking`, `eating`.

### Reguły (każda wartość to parametr profilu)

1. **Life Tap w walce i poza walką**, gdy spełnione jest którekolwiek:
   - `manaPct < combatMana` **i** `hpPct > combatHp`
   - `manaPct < lowMana` **i** `hpPct > lowHp`
2. **Life Tap między mobami** (poza walką), dodatkowo do reguły 1: `hpPct >= betweenHp` **i** `manaPct < betweenMana`.
3. **Przerwa na jedzenie i wodę** (tylko poza walką): `hpPct < breakHp`. Jeść do pełnego HP; pić tylko
   w trakcie jedzenia (nie dłużej niż je się jedzenie); resztę many uzupełnić Life Tapem po jedzeniu.
4. **Bezpiecznik:** nie podpowiadaj Life Tapa, jeśli po jego użyciu HP spadłoby poniżej `safetyHp`
   (domyślnie 10% max HP), tzn. `hpPct - lifeTapHealthCost / maxHP < safetyHp`.
5. W walce **nigdy** nie podpowiadaj jedzenia (przerwa dopiero po walce).
6. Nie podpowiadaj nic, gdy gracz pije/je (aura Drink/Food) albo ma martwą postać; po zakończeniu
   jedzenia (HP pełne) przejdź do reguły 2.

### Profile (progi w ułamkach 0–1)

| Profil | combatMana | combatHp | lowMana | lowHp | betweenMana | betweenHp | breakHp | Kiedy |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `BEST_1MOB` (domyślny) | 0,40 | 0,80 | 0,20 | 0,40 | 0,90 | 0,80 | 0,40 | pull z 1 mobem, wszystkie buildy |
| `BEST_2MOB` | 0,50 | 0,50 | 0 (wyłączona) | 0,30 | 0 (wyłączona) | 0,65 | 0,50 | pulle z 2 mobami; około +18% względem reguły użytkownika |
| `AFFLICTION_1MOB` | 0,60 | 0,80 | 0,20 | 0,30 | 0,90 | 0,65 | 0,40 | opcjonalnie dla Affliction |
| `DEMO_1MOB` | 0,40 | 0,80 | 0,10 | 0,30 | 0,90 | 0,995 | 0,50 | opcjonalnie dla Demonology/Fire |
| `USER` | 0,60 | 0,80 | 0,20 | 0,30 | 0,90 | 0,995 | 0,30 | pierwotna reguła użytkownika |

Wartość 0 w `lowMana`/`combatMana` wyłącza daną regułę. Addon nie wie, ilu mobów dotyczy pull, więc dodaj
**przełącznik** (`/lta mobs 1|2`) oraz opcję „auto": liczba wrogich jednostek w walce z graczem
(tablice nazw `nameplate1..40` z `UnitAffectingCombat` i `UnitCanAttack`), z histerezą 3 s, żeby profil nie migał.
Przy 3 i więcej mobach użyj `BEST_2MOB` (i pokaż ostrzeżenie, że 3 moby przy tej klasie zwykle spowalniają).

### Wynik

Funkcja czysta `Advise(state, profile) -> advice` zwraca jedno z:
`LIFE_TAP`, `EAT_DRINK`, `NONE` plus `reason` (np. `"mana 33%, HP 91%"`) i `urgency` (`low`/`high`:
`high`, gdy mana < 15% albo HP < breakHp).

## Wymagania techniczne

- **Najpierw ustal klienta**: `GetBuildInfo()` i numer `## Interface:` z innych działających addonów Forever;
  jeśli klient udostępnia `C_Spell`/`C_UnitAuras`, użyj ich, w przeciwnym razie `GetSpellInfo`/`UnitBuff`.
  Napisz cienką warstwę `Compat.lua`, żeby reszta kodu nie zależała od wersji API.
- Pliki: `LifeTapAdvisor.toc`, `Core.lua` (logika, bez UI i bez API Blizzarda), `Compat.lua`, `UI.lua`, `Options.lua`, `README.md`.
- Zdarzenia: `PLAYER_LOGIN`, `PLAYER_REGEN_DISABLED/ENABLED`, `UNIT_HEALTH`, `UNIT_POWER_UPDATE` (lub odpowiednik
  dla many), `UNIT_AURA` (player), `SPELLS_CHANGED`, `PLAYER_DEAD/ALIVE/UNGHOST`. Odświeżanie przez zdarzenia plus
  `OnUpdate` ograniczony do 0,1 s. Brak tainta, brak chronionych funkcji.
- **Koszt Life Tapa** (HP): odczytaj z tooltipa najwyższej znanej rangi (skan `GameTooltip`, wzorzec
  „Converts N health into N mana"), bo w Forever Life Tap skaluje się ze Spirit i wzór nie jest opublikowany.
  Odśwież po `SPELLS_CHANGED` i po zmianie Spirit (`UNIT_STATS`). Jeśli tooltip się nie sparsuje,
  użyj oszacowania `base + Spirit` i oznacz je w debugu jako „estimated".
- **Wykrywanie jedzenia/picia** po aurach: nazwy „Drink"/„Food" lub ich `spellId` (zbierz w tablicy konfiguracyjnej,
  bo tekst zależy od języka klienta).
- Dane w `SavedVariables` (`LifeTapAdvisorDB`): wybrany profil, własne progi, pozycja ramki, głośność dźwięku, tryb logowania.
- Komendy: `/lta` (opcje), `/lta profile <nazwa>`, `/lta set <parametr> <0-1>`, `/lta mobs <1|2|auto>`,
  `/lta lock|unlock`, `/lta test`, `/lta debug`.

## Interfejs

- Mała, przesuwana ramka (domyślnie nad paskiem akcji): ikona + tekst. `LIFE_TAP`: ikona Life Tapa, zielony;
  `EAT_DRINK`: ikona jedzenia, żółty, a przy `high` czerwony; `NONE`: ramka ukryta (opcja „zawsze pokazuj stan").
- Opcjonalny dźwięk (jednorazowo, przy zmianie z `NONE` na poradę, z odstępem min. 3 s).
- Pasek HP/many z zaznaczonymi progami aktywnego profilu (do strojenia).
- Panel opcji z suwakami wszystkich progów i listą profili (reset do profilu).

## Testy (Lua, `busted` albo prosty runner; `Core.lua` bez zależności od klienta)

Tabela przypadków dla profilu `BEST_1MOB` (mana%, HP%, w walce → wynik):

| mana | HP | w walce | oczekiwany wynik |
|---:|---:|:---:|---|
| 35 | 90 | tak | LIFE_TAP (mana < 40, HP > 80) |
| 35 | 70 | tak | NONE (HP nie > 80, mana nie < 20) |
| 15 | 45 | tak | LIFE_TAP (mana < 20, HP > 40) |
| 15 | 35 | tak | NONE (w walce nie ma przerwy) |
| 15 | 35 | nie | EAT_DRINK (HP < 40) |
| 80 | 85 | nie | LIFE_TAP (między mobami: HP ≥ 80, mana < 90) |
| 80 | 70 | nie | NONE |
| 95 | 100 | nie | NONE |
| 10 | 100 | nie | LIFE_TAP, o ile koszt nie zejdzie poniżej `safetyHp` |
| 10 | 25 | nie | EAT_DRINK |
| dowolne | dowolne | dowolne, ale pije/je | NONE |

Dla profilu `USER` i `BEST_2MOB` przygotuj analogiczne tabele z progami z tabeli powyżej. Dodaj testy
bezpiecznika (HP 50%, koszt Life Tapa 45% max HP → NONE), przejścia profili i zapisu ustawień.

## Logowanie do strojenia (opcjonalne, domyślnie wyłączone)

`/lta log on` zapisuje do `SavedVariables` jedną linię na pull: czas, level, mana i HP na początku i końcu,
liczba Life Tapów, czas picia i jedzenia, czy gracz zginął. Eksport do CSV poleceniem `/lta export`
(tekst w oknie do skopiowania). Dzięki temu można porównać wyniki z symulatorem i skorygować progi.

## Zastrzeżenia (przekaż użytkownikowi w README addonu)

- Progi pochodzą z **symulacji**, w której część danych to szacunki: HP i obrażenia mobów (dane Classic, a Blizzard
  podniósł HP wyższych leveli przed startem o nieznany współczynnik), statystyki sprzętu, regeneracja Spirit i
  koszt Life Tapa w Forever. Różnica między strategiami to około 3% kills/h dla 1 moba i około 18% dla 2 mobów.
- Przy większym HP mobów (×1,25 lub ×1,5) wszystkie strategie tracą (około −20% i −38%); najlepsza pozostaje najlepsza, ale stary próg „pij poniżej 40% many" wyprzedza wtedy regułę użytkownika, więc przy długich walkach więcej picia się opłaca.
- Trzymaj progi konfigurowalne i zbierz własne dane z gry (logowanie powyżej), zanim uznasz je za ostateczne.

## Kryteria akceptacji

1. `Core.lua` przechodzi wszystkie testy bez klienta gry.
2. Po wczytaniu na postaci Warlock addon pokazuje porady zgodne z tabelą przypadków; zmiana profilu i progów działa bez `/reload`.
3. Brak błędów Lua i tainta przy walce, jeździe, śmierci i wejściu do instancji.
4. README opisuje komendy, profile, ograniczenia danych i sposób dopisania nowego języka nazw aur.
