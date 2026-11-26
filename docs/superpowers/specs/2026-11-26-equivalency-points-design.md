# Equivalency Points (EP) dla buildów Forever: design

Data: 2026-11-26. Rozmiar: mała zmiana (komenda CLI + niewielkie rozszerzenie silnika). UI w drugim kroku.

## Po co (intencja)
Narzędzie ma pomagać wybierać itemy w trakcie levelowania (40-59) zależnie od wybranego buildu.
Pytanie badawcze: czy wagi statów są takie same dla wszystkich buildów, czy dla niektórych się różnią.
Hipoteza: różnią się (pety nie skalują się ze spell power, DoT-y mają inne współczynniki niż Shadow Bolt,
buildy na Life Tapie mocniej zależą od Spirita i Stamina).

## Cele
- Dla wybranego buildu i levelu: waga każdej staty względem spell power (SP = 1,00), liczona w
  zabiciach na godzinę.
- Staty: spell power, Intellect, Spirit, Stamina, crit %, hit %.
- Porównanie buildów: dla każdej staty, czy waga różni się istotnie statystycznie między buildami.
- Wynik powtarzalny (ziarno), z przedziałem ufności 95% przy każdej wadze.

## Nie-cele i anty-cele
- Nie oceniamy konkretnych itemów i nie robimy UI (drugi krok).
- Nie uwzględniamy armor, MP5 ani interakcji między statami (regresja odpada).
- Anty-cel: wagi podane jako dokładne, choć profile sprzętu to placeholdery (`verify: true`). Wynik zawsze
  niesie ostrzeżenie o tym i o założeniach modelu.

## Podejścia (wybrane: 1)
1. **Różnice skończone na parach z tym samym ziarnem (wybrane).** Baza vs baza + duża delta jednej staty,
   te same ziarna jak w `duel`. Waga = zysk kills/h z +1 staty / zysk z +1 SP. Dodatkowo druga strona (-delta)
   do sprawdzenia liniowości.
2. Regresja na losowych zestawach statów. Widzi interakcje, ale wielokrotnie wolniejsza. Odłożona.
3. Pochodna analityczna. Odpada: progi (Life Tap, przerwy) i losowość.

## Design
- **Silnik:** opcjonalne `statDelta` (częściowy rekord: spellPower, intellect, spirit, stamina, critPct, hitPct)
  w `CellConfig`/`PullConfig`, dodawane do `PlayerStats` po `playerStatsFor`. Stamina i Intellect muszą
  przechodzić przez te same przeliczenia (HP, mana, Demonic Embrace itd.), więc delta wchodzi do
  statów bazowych przed konwersją, nie do wyniku. Bez delty zero zmian w wynikach istniejących komend.
- **Moduł `src/forever/ep.ts`:** uruchamia `runCell` dla bazy i dla każdej pary (stat, ±delta) na tych samych
  ziarnach; liczy zysk w kills/h na sesję i wagę jako stosunek względem SP. Przedział ufności z bootstrapu po
  sesjach (waga to iloraz, więc nie wystarczy zwykły przedział średniej).
- **Porównanie buildów:** dla każdej staty różnica wag między buildami jest „istotna”, gdy przedziały nie
  nakładają się; raport wskazuje, które staty różnią się między którymi buildami.
- **CLI:** `npm run forever:ep -- --build AFF_WRACK --levels 40-59 --profile average --mobs 1 --sessions 200
  --seed 1` (lub `--builds A,B,C` / `--all`). Wyjście: tabela wag per level i podsumowanie „czy buildy się
  różnią”; opcja zapisu markdown/JSON do `reports/`.
- **Testy (vitest):** delta 0 daje wyniki identyczne jak dziś; waga SP = 1 z definicji; powtarzalność przy
  tym samym ziarnie; build bez peta ma inną wagę SP niż build z petem na ustalonym ziarnie (regresja na hipotezie).

## Decyzje moje (do sprawdzenia)
- Delta: duża, żeby przebić szum, np. +40 SP/INT/SPI/STA i +3 punkty % dla crit/hit. Rozmiary doprecyzować
  empirycznie (test liniowości ±delta).
- **Hit:** wartość hit jest ograniczona przez `mob_miss_pct` (3-4%). Delta hit musi zmieścić się pod limitem,
  inaczej waga jest zaniżona. Raport zaznacza, że waga hit obowiązuje tylko poniżej limitu.
- Spell power traktowany jako jedna wartość dla wszystkich szkół (bez podziału Shadow/Fire).
- Wagi pokazywane na level i na profil sprzętu (`average` domyślnie); średnia po levelach to tylko dodatek.

## Zostawione budowniczemu
- Dokładne rozmiary delt i liczba sesji domyślnie; format tabeli i raportu; nazwy flag.
