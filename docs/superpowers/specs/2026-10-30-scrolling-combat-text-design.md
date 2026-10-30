# HUD ze scrolling combat text (w stylu MikScrollingBattleText) — projekt (spec)

Data: 2026-10-30
Status: zatwierdzony przez autora ("chciałbym teraz dodać HUD ze scrolling battle text… zasugeruj się addonem
MikScrollingBattleText"), bez osobnego przeglądu
Kolejność realizacji: po poprawce efektów itemów (`2026-10-30-gear-item-effects-design.md`), bo dotyka tych samych
plików UI.

## 1. Cel

Walka jest dziś widoczna tylko jako liczniki, paski i lista buffów. Autor chce HUD jak w WoW z addonem MSBT:
unoszące się teksty z **obrażeniami** (krytyki wyróżnione, ticki DoT, pudła), **buffami (włączenie i
wygaśnięcie)**, **procami aur**, **zyskiem many** i innymi powiadomieniami, w konfigurowalnych obszarach.

Wzorzec funkcjonalny (README MSBT): osobne konfigurowalne scroll areas (incoming, outgoing, notifications),
kolor tekstu wg szkoły obrażeń, osobny wygląd krytyków, łączenie (merge) zdarzeń i filtry anty-spamowe, wyzwalacze
(triggers) i powiadomienia o buffach/debuffach, ikony czarów obok tekstu, style animacji (prosta, parabola),
konfiguracja per zdarzenie, możliwość wyłączenia kategorii. Nie kopiujemy kodu ani zasobów addonu: to własna
implementacja inspirowana jego funkcjami.

## 2. Zakres

**W zakresie** (przełączane osobno w ustawieniach "Combat text"):

1. **Outgoing (obrażenia gracza)**: obrażenia bezpośrednie (kolor szkoły, krytyk: większy tekst z "!" i
   wyróżnieniem, "sticky"), ticki DoT (mniejszy tekst, scalane), pudła ("Miss"), opcjonalnie nazwa czaru i ikona
   ("Shadow Bolt 3,141").
2. **Notifications**: buff/aura gracza **włączona** ("+Heroism / Bloodlust") i **wygasła** ("-Heroism / Bloodlust"),
   proce (aury z procków: Shadow Trance, Backlash, Band of the Eternal Sage i procki itemów) wyróżnione
   ("Backlash!"), debuffy celu nałożone/zdjęte (opcjonalnie, domyślnie wyłączone), zysk many ("+1,622 Mana":
   Life Tap, Judgement of Wisdom, runa, mikstura; małe wartości scalane), użycie przedmiotu ("Icon of the Silver
   Crescent"), gotowość cooldownu przedmiotów i czarów z cooldownem ("Destruction Potion ready"), niski poziom
   many (wyzwalacz "Low Mana" poniżej konfigurowalnego progu, raz na przekroczenie).
3. **Incoming** istnieje w modelu jako obszar, ale nic do niego nie trafia (manekin nie bije); zostawiony na
   przyszłe scenariusze (etap 4).
4. **Ustawienia**: włączenie całego HUD, kategorii, obszarów, styl animacji (prosta w górę, parabola),
   czas życia tekstu i szybkość, rozmiar czcionki, rozmiar krytyków, ikony czarów, nazwy czarów, minimalny próg
   obrażeń, scalanie DoT i drobnych zysków many, maksymalna liczba jednoczesnych tekstów; zapis w `localStorage`
   (osobny klucz `rotation-trainer:hud:v1`, to preferencje interfejsu, nie część setupu walki), przycisk
   "Reset to defaults"; dostępne bez przeładowania i bez zmiany setupu.

**Poza zakresem**: dźwięki, edytor kolorów per zdarzenie i własne czcionki, przeciąganie obszarów myszą,
leczenie i przychodzące obrażenia (brak w grze), dispele (etap 4), eksport ustawień HUD.

## 3. Źródło zdarzeń i zasady

- HUD jest **tylko czytelnikiem**: zdarzenia pochodzą z logu walki silnika (`sim.log()`: `damage`, `tick`, `miss`,
  `aura-apply`, `aura-fade`, `mana`, `cast-complete`, `impact` ze `spellId`, `auraId`, `amount`, `crit`) i ze
  snapshotu (cooldowny, mana). Nic z HUD nie wpływa na symulację; wynik walki jest identyczny z HUD i bez niego.
- Przyrostowe czytanie: HUD pamięta, ile wpisów logu już przetworzył (nie kopiuje całego logu co klatkę:
  dopuszczalne jest dodanie do silnika tylko-odczytowej `logSince(index)`; bez zmiany zachowania).
- Czas wirtualny vs ściany: zdarzenia powstają w czasie walki, animacja trwa w czasie rzeczywistym (CSS), więc
  przy normalnym tempie (1x) są zsynchronizowane; po końcu walki ani przy resecie nic nie zostaje na ekranie
  (reset czyści HUD).
- Aury `hidden` (ICD) nigdy nie dają tekstu; aury ze wspólnych stałych buffów ustawień (permanentne) nie dają
  "włączenia" w trakcie walki (aplikowane przy starcie: pokazujemy tylko aury, które silnik logował jako
  `aura-apply` po 0 ms, plus aury timed i procki; aury nakładane o 0 ms (np. Heroism ustawiony na 0) pokazują
  się na starcie).
- Scalanie: ticki tego samego czaru w oknie scalania (domyślnie 250 ms) łączą się w jeden tekst; drobne zyski
  many (< próg) scalane w oknie 2 s; anty-spam: limit jednoczesnych tekstów (domyślnie 24) usuwa najstarsze, nigdy
  nie blokuje krytyka ani powiadomienia o procu.
- Obszary: Outgoing po prawej od celu (tekst unosi się nad manekinem), Notifications nad paskiem postaci;
  elementy pozycjonowane absolutnie wewnątrz areny, animowane przez `transform` i `opacity` (bez layout thrash).

## 4. Wygląd, dostępność, wydajność

- Kolory szkół zgodne z resztą aplikacji (`SCHOOL_COLORS`), czytelne w ciemnym i jasnym motywie (obrys/cień);
  krytyk: większy, pogrubiony, krótki "pop" (skala); tekst notyfikacji: kolor zielony (buff on), czerwony (buff off),
  złoty (proc), niebieski (mana).
- HUD jest dekoracją: `aria-hidden="true"`, nie czyta się go czytnikiem; pełny przekaz tekstowy zapewnia log walki
  (etap 3). `prefers-reduced-motion`: bez przesuwania, teksty pojawiają się w miejscu i gasną; nadal można je
  wyłączyć w ustawieniach.
- Wydajność: pula elementów (limit z ustawień), brak timerów na element (animacja CSS + `animationend`/czyszczenie
  w istniejącej pętli rAF), brak dodatkowego renderowania całego `GameView` na tekst (HUD ma własny stan).
- Telefon 390 px: obszary mieszczą się w arenie, bez poziomego przewijania; domyślnie mniejsza czcionka.

## 5. Ryzyka

- Rozjazd czasu przy wolnym urządzeniu (animacja CSS nie czeka na symulację): akceptowalne, HUD jest
  dekoracją; kolejność zdarzeń zachowana.
- Zalew tekstów w długich walkach/z haste: limit i scalanie; test obciążeniowy 600 s.
- Każde zdarzenie logu musi mieć decyzję "pokaż/nie pokaż" (tabela w kodzie i w `docs/data-sources.md`), żeby nowe
  typy zdarzeń nie znikały po cichu.
