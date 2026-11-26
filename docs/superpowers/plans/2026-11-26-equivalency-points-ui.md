# Widok EP w UI Forever Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zakładka „Wagi statów (EP)” w symulatorze Forever pokazuje wagi statów (EP) wybranych buildów na levelu z paska ustawień.

**Architecture:** `computeEp` dzieli się na `planEp` (kroki = pojedyncze `runCell`, `assemble` liczy wagi), a `computeEp` składa je po kolei, więc CLI się nie zmienia. W `api.ts` powstaje rodzaj zadania `ep` (kroki wszystkich buildów jeden za drugim), który dostaje worker, postęp i anulowanie jak pozostałe zadania. `EpView` jest widokiem prezentacyjnym tabeli, podpiętym w `ForeverApp`.

**Tech Stack:** TypeScript, React, vitest (projekty `node` i jsdom dla `tests/ui`), Playwright (tylko do oględzin w Task 3).

**Spec:** `docs/superpowers/specs/2026-11-26-equivalency-points-ui-design.md` (rozszerza `docs/superpowers/specs/2026-11-26-equivalency-points-design.md`; kod EP: `src/forever/ep.ts`, `src/forever/ep-report.ts`)

## Global Constraints

- Teksty UI po polsku, nazwy stat po angielsku jak w CLI (`spellPower`, `intellect`, `spirit`, `stamina`, `critPct`, `hitPct`).
- Oznaczenia komórek identyczne z raportem CLI: `capped (0)`, `n/a`, `*` (waga przybliżona); jedna funkcja `epCell` dla CLI i UI.
- Przycisk widoku: „Policz EP”. Tytuł zakładki: „Wagi statów (EP)”. Trasa: `#/forever/ep`.
- Level, profil, mobs, polityka Life Tapa, Spellstone, Eureka, sesje i ziarno wyłącznie ze wspólnego paska ustawień (parametry symulacji z `overridesOf(settings)`); widok nie ma własnego pola levelu.
- Domyślnie zaznaczony build to ten wybrany w zakładce Buildy (`buildId` w `ForeverApp`).
- Pod tabelą: legenda, ostrzeżenie o placeholderach profili sprzętu, informacja, że waga hit dotyczy tylko zakresu poniżej limitu, i notka, że 100+ sesji zawęża przedziały.
- Wyniki `computeEp`, komendy `forever:ep` i istniejących widoków bez zmian (cały `npx vitest run tests/forever tests/ui` zielony; znana porażka `tests/data/talent-tree.test.ts` jest niezwiązana).
- Bez kalkulatora itemów, wykresu po levelach i porównań par buildów w UI.

## Review Focus

- Żaden build niezaznaczony: „Policz EP” wyłączony i żadne zadanie nie startuje.
- Level w ustawieniach zmieniony po obliczeniu: tabela mówi, dla jakiego levelu jest liczona, i ostrzega, gdy różni się od ustawienia.
- Build, w którym SP nic nie daje (`valid: false`): kolumna z `n/a` i wyjaśnieniem, bez `NaN`/`Infinity`.
- Własny build (`★ nazwa`): jest do wyboru, a jego dane trafiają do zadania (`custom`), bo worker nie ma dostępu do localStorage.
- Wszystkie buildy zaznaczone naraz (11+ kolumn): tabela w kontenerze przewijanym `.fv-scroll`, bez rozpychania strony.

---

### Task 1: `planEp` i wspólna formatka komórki

**Files:**
- Modify: `src/forever/ep.ts` (`computeEp` → `planEp` + cienki `computeEp`)
- Modify: `src/forever/ep-report.ts` (eksport `epCell`)
- Test: `tests/forever/ep.test.ts` (nowy `describe('planEp')`), `tests/forever/ep-report.test.ts` (test `epCell`)

**Interfaces:**
- Consumes: istniejące `EpOptions`, `EpResult`, `StatWeight`, `EP_STATS`, `sessionKph`, `runCell` z `ep.ts`/`runner.ts`.
- Produces:
  - `interface EpPlan { total: number; run(i: number): number[]; assemble(outs: readonly number[][]): EpResult }` i `planEp(build: BuildRef, level: number, o: EpOptions): EpPlan` w `ep.ts`. Kroki: 0 = baza; potem dla każdej staty w kolejności `EP_STATS` krok „w górę”, a po nim krok „w dół” tylko gdy `down > 0`; staty `capped` (hit na limicie) nie mają kroków. `run(i)` zwraca kills/h na sesję (`number[]`). Walidacja (sessions, level, build) rzuca przy `planEp`, nie przy `run`.
  - `computeEp(build, level, o): EpResult` bez zmiany sygnatury: `planEp`, wszystkie kroki po kolei, `assemble`.
  - `epCell(r: EpResult, stat: StatKey): string` wyeksportowane z `ep-report.ts` (dotychczasowa prywatna funkcja `cell`, bez zmiany działania).

- [ ] **Step 1: Write the failing tests.**
  - W `ep.test.ts`, `describe('planEp')` (opcje `o` z istniejącego pliku, `sessions: 12`):
    - `planEp('AFF_WRACK', 50, o).total` = 11 (baza + 5 statów × 2; hit na limicie bez kroków), a `planEp('DEMO_PACT_R1', 50, o).total` = 13.
    - `plan.run(0)` równa się `runCell({ variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: loadParams(o.params), picks: undefined, mobs: undefined }, 12, 1).raw.map(sessionKph)` i ma długość 12.
    - `plan.assemble(wszystkie wyniki run(i))` ma `toEqual` wynik `computeEp('AFF_WRACK', 50, o)`.
    - `planEp('AFF_WRACK', 5, o)` rzuca `/level/` już przy planowaniu, a `planEp('NOPE', 50, o)` rzuca `/AFF_WRACK/`.
  - W `ep-report.test.ts`: `epCell(res, 'hitPct')` zwraca `capped (0)` dla `capped: true`, `n/a` dla `weight: null`, a dla `nonlinear: true` zaczyna się od wagi i kończy ` *` (np. `0.50 (0.40..0.60) *`).
- [ ] **Step 2: Run** `npx vitest run tests/forever/ep.test.ts tests/forever/ep-report.test.ts`. Expected: FAIL (brak `planEp`, brak eksportu `epCell`).
- [ ] **Step 3: Implement.** W `ep.ts` przenieść ciało `computeEp` do `planEp`: walidacja, `ranksAt`, `playerStatsFor`, `up`/`down` i `capped` liczone od razu, lista kroków `{ stat, side: 'up'|'down'|'base', delta }` zbudowana z góry; `run(i)` wykonuje `runCell` dla kroku i i zwraca `raw.map(sessionKph)`; `assemble` robi obecne obliczenia nachyleń, `isNonlinear`, wag i bootstrapu na podstawie wyników (bez ponownego uruchamiania symulacji). W `ep-report.ts` zmienić `function cell` na `export function epCell` i podmienić użycia.
- [ ] **Step 4: Run** `npx vitest run tests/forever` oraz `npm run typecheck`. Expected: PASS, w tym wszystkie dotychczasowe testy EP bez zmian (powtarzalność, SP = 1, przycięcia, błędy).
- [ ] **Step 5: Commit** — `git add src/forever/ep.ts src/forever/ep-report.ts tests/forever && git commit -m "refactor(forever): split computeEp into planEp steps, export epCell"`

---

### Task 2: Zadanie `ep` w API Forever

**Files:**
- Modify: `src/forever/web/api.ts` (`JobRequest`, `EpOutcome`, `JobResult`, `planJob`)
- Test: `tests/forever/web-api.test.ts` (nowy `describe('ep job')`)

**Interfaces:**
- Consumes: `planEp`, `EpPlan`, `EpResult` (Task 1); `overridesOf`, `normalizeSettings`, `checkBuild`, `customVariant` z `api.ts`.
- Produces: wariant `{ kind: 'ep'; settings: Settings; builds: readonly string[]; custom?: readonly CustomBuildData[] }` w `JobRequest`; `interface EpOutcome { kind: 'ep'; settings: Settings; results: EpResult[] }` (jeden wynik na build, w kolejności `builds`, level z `settings.level`); `EpOutcome` dołączone do `JobResult`. Zadanie ma `total` = suma `total` planów buildów, a `run(i)` deleguje do planu właściwego buildu.

- [ ] **Step 1: Write the failing tests** (ustawienia `{ ...DEFAULT_SETTINGS, sessions: 5, level: 50 }`):
  - `runJob({ kind: 'ep', settings, builds: ['AFF_WRACK','DEMO_PACT_R1'] })` ma `kind: 'ep'`, 2 wyniki o `build` `AFF_WRACK`, `DEMO_PACT_R1`, `level` 50 i `sessions` 5; `onProgress` kończy się na `done === total`, a `total` = 11 + 13.
  - Ustawienia sterują symulacją: ten sam request z `policy: 'NO_LIFE_TAP'` daje inne `baseKph` buildu niż z `BEST_1MOB`.
  - `builds: ['NOPE']` rzuca `/unknown build/`; `builds: []` rzuca `/at least one build/`.
  - Własny build: `customVariant`-owe dane (`{ name: 'moj', picks: [...], rotation, filler, rank, pet, sacrificed }` jak w istniejących testach `custom`) przekazane w `custom` i `builds: [customId('moj')]` dają wynik z `build` równym `customId('moj')`.
- [ ] **Step 2: Run** `npx vitest run tests/forever/web-api.test.ts`. Expected: FAIL (brak rodzaju `ep`).
- [ ] **Step 3: Implement** nowy `case 'ep'` w `planJob`: plany `planEp(loadVariant(checkBuild(id, customIds)), s.level, { profile: s.profile, mobs: s.mobs, sessions: s.sessions, seed: s.seed, params: overridesOf(s) })` dla każdego buildu; `run(i)` znajduje plan po skumulowanych offsetach; `assemble` dzieli wyniki na odcinki i wywołuje `assemble` planów. Pusta lista buildów rzuca błąd `ep needs at least one build`.
- [ ] **Step 4: Run** `npx vitest run tests/forever` oraz `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/forever/web/api.ts tests/forever/web-api.test.ts && git commit -m "feat(forever): ep job kind in the web API"`

---

### Task 3: Zakładka EP w UI

**Files:**
- Create: `src/ui/forever/EpView.tsx`
- Modify: `src/ui/shell/router.ts` (`FOREVER_VIEWS` + `FOREVER_VIEW_TITLES`)
- Modify: `src/ui/forever/useForeverRun.ts` (klucz `ep` w `results`)
- Modify: `src/ui/forever/ForeverApp.tsx` (zakładka, wiązanie uruchomienia, etykieta przycisku paska)
- Modify: `src/ui/forever/forever.css` (tabela/legenda, jeśli istniejące klasy `fv-*` nie wystarczą)
- Modify: `README.md` (jedno zdanie o zakładce w opisie Forever)
- Test: `tests/ui/forever/ep-view.test.tsx` (nowy), `tests/ui/forever/forever-app.test.tsx` (trasa), `tests/ui/shell/router.test.ts` (jeśli sprawdza listę zakładek)

**Interfaces:**
- Consumes: `EpOutcome`, `Settings` (`api.ts`); `EP_STATS` (`ep.ts`); `epCell` (Task 1); `ForeverRun` z `useForeverRun`; `customId` (`api.ts`).
- Produces:
  - `FOREVER_VIEWS` zawiera `'ep'` zaraz po `'compare'`; `FOREVER_VIEW_TITLES.ep = 'Wagi statów (EP)'`; `parseRoute('#/forever/ep')` daje `{ mode: 'forever', view: 'ep' }`.
  - `ForeverRun['results']` ma `ep?: JobResult`.
  - `EpView({ settings, run, outcome, ids, initial, onRun })`: `settings: Settings`, `run: ForeverRun`, `outcome: EpOutcome | undefined`, `ids: readonly string[]` (buildy do wyboru), `initial: string` (domyślnie zaznaczony build), `onRun(builds: string[]): void`.
  - W `ForeverApp`: `onRun` widoku wywołuje `run.run({ kind: 'ep', settings: s, builds, custom: customData.filter((c) => builds.includes(customId(c.name))) })`; pasek ustawień dla widoku `ep` ma przycisk „Uruchom (użyj Policz EP)” z pustym `onRun`, jak dla Porównania.

- [ ] **Step 1: Write the failing tests.**
  - `ep-view.test.tsx`, render `EpView` ze sztucznym `EpOutcome` zbudowanym z `computeEp` (opcje `sessions: 6`, `session_pulls: 6`, buildy `AFF_WRACK`, `DEMO_PACT_R1`, level 50) i prostym `run` (`status: 'idle'`):
    - tabela `role=table` o nazwie „Wagi statów (EP)”, nagłówki kolumn = id buildów, wiersze = 6 statów w kolejności `EP_STATS`; komórka `spellPower` każdego buildu to `1.00 (1.00..1.00)` (lub z `*`), komórka `hitPct` AFF_WRACK to `capped (0)`;
    - legenda zawiera `capped`, `n/a` i `*`; widoczne ostrzeżenie o placeholderach (`/placeholder/i`) i notka o limicie hit;
    - tabela jest w kontenerze `.fv-scroll`;
    - bez `outcome` widać pusty stan „Wybierz buildy i kliknij Policz EP”, bez tabeli.
  - Review Focus (te same pliki):
    - odznaczenie wszystkich buildów wyłącza „Policz EP” (`disabled`), a kliknięcie nie wywołuje `onRun`;
    - przy `outcome.settings.level` ≠ `settings.level` widać notkę z levelem obliczeń (`/Level 50/`) i ostrzeżeniem o innym ustawieniu; przy równych nie ma ostrzeżenia;
    - wynik z `valid: false` (ręcznie ustawione `valid=false`, `weight=null`, `ci95=null` dla wszystkich statów jednego buildu) pokazuje `n/a` w całej kolumnie, wyjaśnienie „spell power nie zwiększa zabić/h” i brak `NaN`/`Infinity` w tekście tabeli;
    - kliknięcie „Policz EP” wywołuje `onRun` z zaznaczonymi buildami (`initial` zaznaczony domyślnie; po dodaniu drugiego checkboxem `['AFF_WRACK','DEMO_PACT_R1']`).
  - `forever-app.test.tsx`: `parseRoute('#/forever/ep')` → `{ mode: 'forever', view: 'ep' }`, `routeHref({ mode:'forever', view:'ep' })` = `#/forever/ep`; render `<ForeverApp view="ep" runner={runner} />` z istniejącym `runner`: kliknięcie „Policz EP” → po chwili tabela „Wagi statów (EP)” z 1 kolumną buildu (domyślny `AFF_WRACK`); z własnym buildem zapisanym w localStorage (`loadCustom`/`saveCustom` jak w `custom-view.test.tsx`) i zaznaczonym w widoku `req.custom` wysłane do `runner` zawiera ten build (podsłuch w opakowaniu runnera).
- [ ] **Step 2: Run** `npx vitest run tests/ui/forever tests/ui/shell/router.test.ts`. Expected: FAIL (brak `EpView`, trasy `ep`).
- [ ] **Step 3: Implement** zgodnie z Interfaces. `EpView`: lista checkboxów buildów (jak w Rankingu), przycisk „Policz EP” (`disabled` przy braku zaznaczenia lub `run.status === 'running'`), notka o 100+ sesjach, tabela (`aria-label="Wagi statów (EP)"`, `scope` w nagłówkach, komórki z `epCell`), legenda i ostrzeżenia pod tabelą, notka „Level {outcome.settings.level}, {sessions} sesji, seed {seed}” oraz ostrzeżenie przy innym levelu niż w `settings`; kolumna z `valid: false` pokazuje wyjaśnienie nad tabelą. W `README.md` dopisać jedno zdanie o zakładce w opisie symulatora Forever.
- [ ] **Step 4: Run** `npx vitest run tests/ui tests/forever` oraz `npm run typecheck`. Expected: PASS (poza znaną niezwiązaną porażką `tests/data/talent-tree.test.ts` w pełnym `npx vitest run`).
- [ ] **Step 5: Oględziny w przeglądarce.** `npx vite --port 5199 &`, następnie skrypt Playwright w katalogu scratchpad (`require('playwright')`, `chromium.launch()`, `deviceScaleFactor: 1`): otwórz `http://localhost:5199/#/forever/ep`, zaznacz drugi build, kliknij „Policz EP”, poczekaj na tabelę, zrób zrzut `ep-view.png` i zapisz błędy konsoli. Expected: tabela z kolumnami buildów, legenda i ostrzeżenia czytelne, brak błędów konsoli, brak poziomego przewijania całej strony przy 11 zaznaczonych buildach (przewija się kontener tabeli). Zrzut obejrzeć (Read) i poprawić CSS, jeśli coś się rozjeżdża; zatrzymać serwer.
- [ ] **Step 6: Commit** — `git add src/ui src/forever tests/ui README.md && git commit -m "feat(ui): EP view in the Forever simulator"`

---

## Self-review

- **Pokrycie spec:** `planEp` i `computeEp` bez zmian wyników (Task 1), zadanie `ep` z ustawieniami, postępem i własnymi buildami (Task 2), zakładka z tabelą, oznaczeniami, legendą, ostrzeżeniami, pustym stanem, domyślnym buildem, trasą i etykietą przycisku (Task 3). Decyzje „`*` zamiast `≈`”, brak limitu buildów, level z paska ustawień uwzględnione.
- **Spójność nazw:** `planEp`, `EpPlan`, `epCell`, `EpOutcome`, `EpView` użyte tak samo w trzech zadaniach.
- **Ryzyko:** liczba kroków w testach (11 i 13) wynika z limitu hit przy profilu `average` na levelu 50 (AFF_WRACK `capped`, DEMO_PACT_R1 nie); jeśli dane profilu się zmienią, test trzeba przeliczyć, a nie osłabiać.
