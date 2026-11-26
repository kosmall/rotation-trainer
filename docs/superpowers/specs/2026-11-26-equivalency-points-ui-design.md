# Widok EP w UI Forever: design

Data: 2026-11-26. Rozmiar: mała zmiana (nowa zakładka + nowy rodzaj zadania). Rozszerza `2026-11-26-equivalency-points-design.md` (CLI jest gotowe).

## Po co (intencja)
Przy levelowaniu wybierasz itemy do swojego buildu. Widok pokazuje, ile punktów spell power warta jest jedna jednostka każdej staty dla wybranego buildu na wybranym levelu, bez wychodzenia do terminala.

## Cele
- Zakładka „Wagi statów (EP)” w symulatorze Forever, obok Porównania.
- Tabela: kolumna na build, wiersze: spellPower (=1,00), intellect, spirit, stamina, critPct, hitPct; komórka `waga (przedział 95%)`.
- Oznaczenia jak w raporcie CLI: `capped (0)` (hit na limicie), `n/a` (SP nie daje kills/h), `*` (waga przybliżona, krok w dół i w górę istotnie różne). Legenda pod tabelą.
- Ostrzeżenie o placeholderach profili sprzętu i o tym, że hit liczy się tylko poniżej limitu.
- Wyniki liczone przy tych samych warunkach co Ranking: level, profil, mobs, polityka Life Tapa, Spellstone, Eureka, sesje i ziarno ze wspólnego paska ustawień.

## Nie-cele i anty-cele
- Bez kalkulatora itemów (wybór A), bez wykresu po levelach, bez porównań par buildów (zostają w CLI).
- Bez ruszania wyników istniejących widoków i komend (`computeEp` zwraca to samo co dziś).
- Anty-cel: wagi bez ostrzeżenia, że są orientacyjne.

## Podejścia (wybrane: 1)
1. **Nowy rodzaj zadania `ep` w `planJob` (wybrane).** `computeEp` dzielimy na `planEp` (kroki: baza i po dwa kroki na statę, jeden `runCell` na krok, `assemble` liczy wagi i bootstrap); `computeEp` wywołuje `planEp` po kolei, więc CLI i wyniki się nie zmieniają. Worker, postęp i anulowanie działają jak dla innych zadań.
2. Jedno zadanie na build (`computeEp` bez zmian): pasek postępu stoi przy jednym buildzie.
3. Liczenie w głównym wątku: zamraża UI.

## Design
- **Silnik:** `planEp(build, level, o): { total: number; run(i: number): number[]; assemble(outs: number[][]): EpResult }` w `src/forever/ep.ts`. Każdy krok zwraca kills/h na sesję (`number[]`), więc wynik da się sklonować przez `postMessage`.
- **API:** `JobRequest` dostaje `{ kind: 'ep'; settings: Settings; builds: readonly string[]; custom?: readonly CustomBuildData[] }`; wynik `EpOutcome { kind: 'ep'; settings: Settings; results: EpResult[] }` (jeden na build, level z ustawień). Parametry symulacji z `overridesOf(settings)`, profil/mobs/sesje/ziarno z `settings`. Zadania buildów są złożone jedno za drugim; `checkBuild` jak w innych zadaniach.
- **UI:** `src/ui/forever/EpView.tsx`: wybór buildów (checkboxy jak w Rankingu, domyślnie build wybrany w zakładce Buildy), przycisk „Policz EP” (wyłączony przy braku wyboru lub w trakcie liczenia), tabela z `aria-label`, `scope` w nagłówkach, legenda, ostrzeżenia. `useForeverRun.results` dostaje klucz `ep`. Router: `'ep'` w `FOREVER_VIEWS`, tytuł „Wagi statów (EP)”, etykieta przycisku w pasku ustawień jak dla Porównania.
- **Pusty stan:** „Wybierz buildy i kliknij Policz EP”. Błąd zadania pokazuje się jak w innych widokach (`run.error`).
- **Testy:** `planEp` złożone po kolei daje `toEqual` wynik `computeEp`; `runJob({kind:'ep'})` zwraca jeden `EpResult` na build i zgłasza nieznany build; test UI z fałszywym runnerem (tabela, kolumny, oznaczenia `capped`/`n/a`/`*`, legenda, ostrzeżenie, pusty stan, przycisk wyłączony); test routera dla nowej zakładki; istniejące testy bez zmian.

## Decyzje moje (do sprawdzenia)
- Znacznik `*` zamiast `≈`, żeby zgadzał się z raportem CLI (w Porównaniu `≈` znaczy „różnica nieistotna”).
- Bez limitu liczby buildów w widoku; koszt rośnie liniowo (ok. 3 s na build przy 60 sesjach), postęp i anulowanie to łagodzą. Pod przyciskiem krótka notka, że więcej sesji zawęża przedziały (np. 100+).
- Level z paska ustawień, bez własnego pola w widoku.
- Teksty UI po polsku, nazwy stat po angielsku jak w CLI.

## Zostawione budowniczemu
- Dokładny układ CSS (klasy `fv-*`), nazwy plików testów, tekst notek.
