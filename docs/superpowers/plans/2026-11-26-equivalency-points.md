# Equivalency Points (EP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Komenda `npm run forever:ep` liczy dla buildów Forever wagi statów (EP) względem spell power i pokazuje, czy wagi różnią się między buildami.

**Architecture:** `playerStatsFor` dostaje opcjonalną deltę statów, przepuszczoną przez `CellConfig`/`PullConfig`. Moduł `ep.ts` uruchamia `runCell` dla bazy oraz dla +delta i −delta każdej staty na tych samych ziarnach, liczy nachylenie kills/h na punkt staty i wagę jako iloraz względem SP z bootstrapem po sesjach. Moduł `ep-report.ts` porównuje buildy parami (wspólny bootstrap) i formatuje markdown. Skrypt CLI tylko parsuje argumenty.

**Tech Stack:** TypeScript, vitest (projekt `node`), tsx. Bez nowych zależności.

**Spec:** `docs/superpowers/specs/2026-11-26-equivalency-points-design.md`

## Global Constraints

- Staty: spell power, Intellect, Spirit, Stamina, crit %, hit %. SP = 1,00 jest punktem odniesienia.
- Metryka: zabicia na godzinę (kills/h), liczona na sesję jako `killsPerHour(s.kills, s.totalSec)` z `runner.ts` (tak samo jak `duel.ts`).
- Delty domyślne: +40 dla SP/Intellect/Spirit/Stamina, +3 punkty % dla crit i hit. Ziarna wspólne dla wszystkich komórek (`runCell(cfg, sessions, seed)` daje seedy `seed+1..seed+n`).
- Delta jest dodawana do statów z profilu sprzętu **przed** konwersjami (Stamina przed mnożnikiem Demonic Embrace, Intellect przed przeliczeniem na manę).
- Bez delty wyniki istniejących komend są identyczne jak dziś (cały `npx vitest run tests/forever` zielony bez zmian w istniejących testach).
- Każdy wynik EP niesie ostrzeżenie: profile sprzętu to placeholdery (`verify: true` w `levels.json`), wagi są orientacyjne. Waga hit obowiązuje tylko poniżej limitu trafienia.
- Levele 10-59 (jak `MIN_LEVEL`/`MAX_LEVEL` w `src/forever/web/api.ts`); domyślnie 40-59.
- Teksty w CLI i raportach po angielsku, jak reszta modułu `forever`.

## Review Focus

- SP daje zerowy lub ujemny zysk (mianownik wagi ≤ 0): wagi mają być `n/a`, nigdy `NaN`/`Infinity` w wyniku ani w tabeli.
- Hit powyżej limitu (`max(1, mob_miss_pct − suppression − hit)` już na 1%): waga hit = 0 z flagą `capped`, bez dzielenia przez zero.
- Niska staty w profilu (np. `quest`, level 40, SP = 20): delta w dół jest przycięta tak, by suma nie spadła poniżej 0.
- `--sessions` < 2, level poza 10-59 i nieznany id buildu: czytelny błąd (id buildu wypisuje listę dostępnych), nie ślad stosu.
- Ten sam build podany dwa razy w porównaniu: różnice 0, `significant: false`.

---

### Task 1: Delta statów w silniku

**Files:**
- Modify: `src/forever/types.ts` (typy `StatKey`, `StatDelta`)
- Modify: `src/forever/stats.ts` (`playerStatsFor`)
- Modify: `src/forever/runner.ts` (`CellConfig`, `runSession`)
- Modify: `src/forever/fight.ts` (`PullConfig`, `simulatePull`)
- Test: `tests/forever/stat-delta.test.ts`

**Interfaces:**
- Produces: `type StatKey = 'spellPower' | 'intellect' | 'spirit' | 'stamina' | 'critPct' | 'hitPct'`; `type StatDelta = Partial<Record<StatKey, number>>` (oba w `types.ts`); `playerStatsFor(level: number, profile: string, ranks: Ranks, delta?: StatDelta): PlayerStats`; pole `statDelta?: StatDelta` w `CellConfig` i `PullConfig`.

- [ ] **Step 1: Write the failing tests** w `tests/forever/stat-delta.test.ts`:
  - `playerStatsFor(50,'average',{},{})` deep-equals `playerStatsFor(50,'average',{})`.
  - `{ spellPower: 40 }` podnosi `spellPower` dokładnie o 40, a pozostałe pola bez zmian.
  - `{ intellect: 40 }` podnosi `intellect` o 40, a `maxMana` o 40·15·1,05 (±1; 1,05 to `gnomeMaxManaMult`).
  - `{ stamina: 40 }` przy `ranks = { demonic_embrace: 5 }` podnosi `stamina` o 40·1,15.
  - `{ spirit: 40 }`, `{ critPct: 3 }`, `{ hitPct: 3 }` podnoszą odpowiednie pola o dokładnie tyle.
  - `runCell({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: loadParams({ session_pulls: 8 }), statDelta: { spellPower: 40 } }, 12, 1)` ma `metrics.ttkMean` mniejsze niż to samo bez `statDelta`; z `statDelta: {}` metryki są identyczne (`toEqual`) jak bez pola.
- [ ] **Step 2: Run** `npx vitest run tests/forever/stat-delta.test.ts`. Expected: FAIL (brak argumentu/pola).
- [ ] **Step 3: Implement.** W `playerStatsFor` dodać do wartości z profilu (`prof(...)`) odpowiednie pole delty (brak = 0): Stamina przed mnożnikiem Demonic Embrace, Intellect przed `maxManaOf`, reszta wprost. `runSession` przekazuje `cfg.statDelta` do `playerStatsFor` i do obiektu `pull`; `simulatePull` przekazuje `cfg.statDelta` do swojego `playerStatsFor` (`fight.ts`, ok. linii 126). Dwa miejsca muszą dostać tę samą deltę, inaczej mana/HP sesji i walka się rozjadą.
- [ ] **Step 4: Run** `npx vitest run tests/forever` oraz `npm run typecheck`. Expected: wszystko zielone, w tym istniejące testy bez zmian.
- [ ] **Step 5: Commit** — `git add src/forever tests/forever/stat-delta.test.ts && git commit -m "feat(forever): optional stat delta in player stats, cell and pull configs"`

---

### Task 2: Obliczenie wag EP dla jednego buildu i levelu

**Files:**
- Create: `src/forever/ep.ts`
- Test: `tests/forever/ep.test.ts`

**Interfaces:**
- Consumes: `runCell`, `killsPerHour`, `SessionResult` (`runner.ts`); `loadVariant`, `ranksAt`, `PicksOptions`, `BuildVariant` (`builds.ts`); `loadParams` (`data/load.ts`); `playerStatsFor` (`stats.ts`); `effectNum` (`effects.ts`); `createRng` (`../engine/rng`); `BuildRef` (`duel.ts`).
- Produces (wszystko z `ep.ts`):
  - `EP_STATS: readonly StatKey[]` (kolejność: spellPower, intellect, spirit, stamina, critPct, hitPct) i `DEFAULT_DELTAS: Record<StatKey, number>`.
  - `interface EpOptions { profile: string; sessions: number; seed: number; mobs?: 1|2|3; params?: Partial<Params>; picks?: PicksOptions; deltas?: Partial<Record<StatKey, number>>; bootstrap?: number }` (`bootstrap` domyślnie 400 losowań).
  - `interface StatWeight { stat: StatKey; up: number; down: number; weight: number | null; ci95: [number, number] | null; kphPerPoint: number; capped: boolean; linearity: number | null }` (`weight`/`ci95` = `null` gdy mianownik ≤ 0; `linearity` = nachylenie z dołu / nachylenie z góry, `null` gdy któraś strona ma delta 0 lub nachylenie z góry ≈ 0).
  - `interface EpResult { build: string; level: number; sessions: number; baseKph: number; valid: boolean; weights: Record<StatKey, StatWeight>; slopes: Record<StatKey, number[]> }` (`slopes[stat][i]` = nachylenie kills/h na punkt staty w sesji i; `valid` = średnie nachylenie SP > 0).
  - `sessionKph(s: SessionResult): number`.
  - `weightFrom(slopes: number[], spSlopes: number[], idx?: number[]): number | null` (średnia nachyleń staty / średnia nachyleń SP po indeksach `idx`, `null` gdy średnia SP ≤ 0).
  - `bootstrapIndices(n: number, draws: number, seed: number): number[][]` (deterministyczne, `createRng`).
  - `computeEp(build: BuildRef, level: number, o: EpOptions): EpResult`.

- [ ] **Step 1: Write the failing tests** w `tests/forever/ep.test.ts` (opcje: `{ profile: 'average', sessions: 12, seed: 1, params: { session_pulls: 8 }, bootstrap: 100 }`, level 50, `'AFF_WRACK'`):
  - waga `spellPower` = 1 i `ci95` = `[1, 1]`;
  - dwa wywołania z tymi samymi opcjami dają `toEqual` wynik;
  - `result.valid` jest `true`, a każda waga z `weights` ma `weight` skończone (`Number.isFinite`) albo `null`;
  - `computeEp('AFF_WRACK', 40, { ...o, profile: 'quest' }).weights.spellPower.down` = 20 (przycięcie: profil `quest` ma SP 20 na levelu 40), `up` = 40;
  - `params: { ..., mob_miss_pct: 1 }` daje `weights.hitPct.capped === true`, `weight === 0`, `up === 0`;
  - `weightFrom([1,2], [0,0])` zwraca `null`; `weightFrom([2,2],[1,1])` zwraca 2;
  - `sessions: 1` rzuca błąd zawierający `sessions`, level 5 lub 60 rzuca błąd zawierający `level`, nieznany build rzuca błąd z listą id (`AFF_WRACK` w komunikacie).
- [ ] **Step 2: Run** `npx vitest run tests/forever/ep.test.ts`. Expected: FAIL (brak modułu).
- [ ] **Step 3: Implement `computeEp`.** Algorytm:
  1. Walidacja: `sessions ≥ 2`, `level` w 10-59, build rozwiązany przez `loadVariant` (przy błędzie rzucić z listą `VARIANT_IDS`).
  2. Statystyki bazowe: `playerStatsFor(level, profile, ranksAt(variant, level, picks))`. Dla każdej staty `up = deltas[stat]` i `down = min(delta, wartość staty z PlayerStats)`.
  3. Hit: `headroom = max(0, params.mob_miss_pct − effectNum('suppression','hitPctPerRank') · (ranks.suppression ?? 0) − 1 − stats.hitPct)`; `up = min(delta, headroom)`; gdy `up === 0`, `capped = true`, `weight = 0`, nachylenia zerowe, bez uruchamiania komórek.
  4. Dla bazy i dla każdej (stat, ±delta) jedno `runCell({ variant, level, profile, params, mobs, picks, statDelta }, sessions, seed).raw`; baza raz.
  5. Nachylenie sesji `i`: `(kph_up[i] − kph_down[i]) / (up + down)` (gdy `down = 0`, użyć `(kph_up[i] − kph_base[i]) / up`).
  6. `weight = weightFrom(slopes[stat], slopes.spellPower)`, `ci95` = percentyle 2,5/97,5 z `weightFrom` po `bootstrapIndices(sessions, bootstrap, seed + 7919)`; losowania z `null` pomijamy, a gdy zostało ich mniej niż połowa, `ci95 = null`. SP: `weight = 1`, `ci95 = [1, 1]`.
  7. `linearity` z nachyleń: dół `(mean(base) − mean(down)) / down`, góra `(mean(up) − mean(base)) / up`.
- [ ] **Step 4: Run** `npx vitest run tests/forever/ep.test.ts` oraz `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/forever/ep.ts tests/forever/ep.test.ts && git commit -m "feat(forever): equivalency point weights via paired finite differences"`

---

### Task 3: Porównanie buildów i raport

**Files:**
- Create: `src/forever/ep-report.ts`
- Test: `tests/forever/ep-report.test.ts`

**Interfaces:**
- Consumes: z Task 2 `EpResult`, `EpOptions`, `EP_STATS`, `StatKey`, `weightFrom`, `bootstrapIndices`, `computeEp`.
- Produces (z `ep-report.ts`):
  - `interface EpDifference { stat: StatKey; a: number | null; b: number | null; diff: number | null; ci95: [number, number] | null; significant: boolean }`.
  - `compareEp(a: EpResult, b: EpResult, o?: { bootstrap?: number; seed?: number }): EpDifference[]` (jedno losowanie indeksów dla obu buildów, więc różnica jest sparowana; `significant` gdy `ci95` nie zawiera 0; rzuca błąd, gdy level lub liczba sesji są różne). Dla SP zawsze `diff = 0`, `significant = false`.
  - `interface EpReport { options: EpOptions; results: EpResult[]; pairs: { level: number; a: string; b: string; diffs: EpDifference[] }[] }`.
  - `epReport(builds: BuildRef[], levels: number[], o: EpOptions): EpReport` (pary w obrębie levelu: każda para unikalna, a ≠ b).
  - `formatEp(report: EpReport): string` (markdown).

- [ ] **Step 1: Write the failing tests** w `tests/forever/ep-report.test.ts` (opcje jak w Task 2, `sessions: 12`):
  - `compareEp(r, r)` ma wszędzie `diff === 0` i `significant === false`;
  - `compareEp(a, b)` i `compareEp(b, a)` mają przeciwne `diff` (`toBeCloseTo`) dla każdej staty z niezerową różnicą;
  - różne levele rzucają błąd;
  - `epReport(['AFF_WRACK','DEMO_PACT_R1'], [50], o)` ma 2 wyniki i 1 parę;
  - `formatEp(...)` zawiera `Level 50`, nazwę każdej z 6 staty, id obu buildów, ostrzeżenie `placeholder` oraz nie zawiera `NaN` ani `Infinity`; wag `n/a` (SP ≤ 0) i `capped` renderuje jako `n/a`/`capped` (test ręcznie zbudowanego `EpResult` z `weight: null`).
- [ ] **Step 2: Run** `npx vitest run tests/forever/ep-report.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `formatEp`: jeden blok na level z tabelą `| stat | <build1> | <build2> | ... |` (waga i przedział `1.25 (1.02..1.48)`), pod nią lista „Differences between builds” z parami i statami istotnie różnymi (albo „none significant”), na końcu ostrzeżenie o placeholderach i o tym, że waga hit dotyczy tylko zakresu poniżej limitu; znacznik `*` przy wadze, gdy `linearity` poza 0,5-2.
- [ ] **Step 4: Run** `npx vitest run tests/forever` oraz `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/forever/ep-report.ts tests/forever/ep-report.test.ts && git commit -m "feat(forever): compare EP between builds and format the report"`

---

### Task 4: Komenda CLI

**Files:**
- Create: `scripts/forever-ep.ts`
- Modify: `package.json` (skrypt `"forever:ep": "tsx scripts/forever-ep.ts"`)
- Modify: `README.md` (sekcja o `forever:ep` obok `forever:duel`)
- Test: `tests/forever/ep-cli.test.ts`

**Interfaces:**
- Consumes: `epReport`, `formatEp` (Task 3), `VARIANT_IDS` (`builds.ts`).
- Produces: komenda `npm run forever:ep -- [--build ID | --builds A,B | --all] --levels 40-59|45,50 --profile average --mobs 1 --sessions 100 --seed 1 [--param k=v ...] [--delta stat=value ...] [--out reports/forever_ep.md]`.

- [ ] **Step 1: Write the failing test** w `tests/forever/ep-cli.test.ts`: `execFileSync('npx', ['tsx','scripts/forever-ep.ts','--build','AFF_WRACK','--levels','50','--sessions','6','--param','session_pulls=6'])` kończy się kodem 0 i wypisuje `Level 50` oraz `spellPower`; `--build NOPE` kończy się niezerowym kodem, a stderr zawiera `AFF_WRACK`; `--sessions 1` kończy się niezerowym kodem z komunikatem zawierającym `sessions`. Limit testu 60 s.
- [ ] **Step 2: Run** `npx vitest run tests/forever/ep-cli.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** skrypt wzorem `scripts/forever-duel.ts` (te same helpery `all`/`arg`, `parseLevels`, parser `--param`). `--delta stat=value` nadpisuje domyślne delty. `--out` zapisuje markdown do pliku i dodatkowo wypisuje na stdout. Błędy walidacji łapane i wypisywane jako `error: <message>` na stderr z kodem 1. Dopisać do README krótką sekcję (przykład komendy i jak czytać wynik) obok opisu `forever:duel`.
- [ ] **Step 4: Run** `npx vitest run tests/forever/ep-cli.test.ts` i `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add scripts/forever-ep.ts package.json README.md tests/forever/ep-cli.test.ts && git commit -m "feat(forever): forever:ep command"`

---

### Task 5: Pomiar, dobór domyślnych i odpowiedź na pytanie badawcze

**Files:**
- Modify: `src/forever/ep.ts` / `scripts/forever-ep.ts` (tylko domyślne `sessions`, jeśli pomiar tego wymaga)
- Create: `reports/forever_ep.md`

- [ ] **Step 1: Pomiar czasu.** `time npm run forever:ep -- --build AFF_WRACK --levels 50 --sessions 100 --seed 1`. Jeśli jeden build na jednym levelu trwa dłużej niż ok. 60 s, obniżyć domyślne `sessions` w skrypcie tak, by się mieściło, i zapisać wybór w README.
- [ ] **Step 2: Test liniowości delt.** Dla `AFF_WRACK` i `DEMO_PACT_R1` na levelach 45 i 55 sprawdzić `linearity` każdej staty. Gdy któraś jest poza 0,5-2, zmniejszyć odpowiednią delta w `DEFAULT_DELTAS` (np. do 20) i powtórzyć. Zapisać ostateczne wartości w README.
- [ ] **Step 3: Pełny przebieg.** `npm run forever:ep -- --all --levels 40,45,50,55,59 --profile average --mobs 1 --sessions <z kroku 1> --seed 1 --out reports/forever_ep.md`.
- [ ] **Step 4: Wnioski.** Dopisać na górze `reports/forever_ep.md` krótkie podsumowanie po polsku: czy wagi są takie same dla wszystkich buildów, które staty i które buildy różnią się istotnie, jak wagi zmieniają się z levelem, czy hipoteza (pety i Life Tap vs DoT-y) się potwierdza. Wnioski tylko z liczb z raportu, z zastrzeżeniem o placeholderach.
- [ ] **Step 5: Weryfikacja i commit.** `npx vitest run tests/forever` i `npm run typecheck` zielone; `git add -A reports/forever_ep.md README.md src scripts && git commit -m "docs(forever): EP report across builds"`.

---

## Self-review

- **Pokrycie spec:** delta w silniku (Task 1), różnice skończone ±delta na wspólnych ziarnach, SP = 1, bootstrap (Task 2), porównanie buildów z istotnością (Task 3), CLI z `--build/--builds/--all`, `--out` (Task 4), delty i test liniowości, raport (Task 5). UI poza zakresem.
- **Odstępstwa od spec (do wiadomości):** (1) test hipotezy „build bez peta ma inną wagę SP” nie ma sensu, bo waga SP jest 1 z definicji; hipotezę sprawdza raport z Task 5 na innych statach, a testy sprawdzają własności (powtarzalność, SP = 1, symetria różnic). (2) Różnica między buildami jest oceniana przedziałem **różnicy** ze wspólnym bootstrapem (ścisła wersja „przedziały nie nakładają się”). (3) Delta w dół jest przycięta do wartości staty w profilu, a hit w górę do limitu trafienia.
- **Spójność nazw:** `StatKey`, `StatDelta`, `statDelta`, `EpResult.slopes`, `weightFrom`, `bootstrapIndices` użyte tak samo w Task 2 i 3.
