# Realizm symulacji i konfiguracja ustawień — projekt (spec)

Data: 2026-10-29
Status: do przeglądu przez autora
Uzupełnia: `docs/superpowers/specs/2026-10-29-tbc-rotation-trainer-design.md` (etap 1 jest zrobiony).

## 1. Cel i kontekst

Etap 1 daje grywalną walkę, ale jej wyniki nie są porównywalne z prawdziwym raidem. Log z Naj'entusa
(Warcraft Logs, autor) pokazał trzy konkretne różnice:

1. **Czas lotu pocisku.** Shadow Bolt trafia około 1,39 s po końcu castu (25 z 25 pocisków: 1,33–1,41 s).
   W wowsims `MissileSpeed` Shadow Bolta to 20 yd/s, czyli około 28 yd od celu. W symulacji obrażenia
   wpadają w momencie końca castu.
2. **Buffy, debuffy i consumables.** W raidzie: Int 593 (symulacja: 433), Spirit 191 (145), krytyk 37,8%
   (symulacja: 22,6%), Life Tap 1856 many (symulacja: 1622), Heroism, mikstura Destruction, Moonkin Aura,
   Judgement of Wisdom (20 procków po 74 many), Mana Spring Totem (20 many co 2 s), Icon of the Silver
   Crescent, Band of the Eternal Sage. Symulacja liczy gołą postać.
3. **Rotacja.** W logu: Curse of Doom na pull, potem Shadow Bolt spam, 2 Life Tapy i Shadowburn na koniec.
   Bez Corruption, Immolate i Curse of the Elements. Apka uczy rotacji z DoT-ami.

Ten projekt dodaje trzy rzeczy: **A.** czas lotu pocisków, **B.** konfigurowalną rotację, **C.** konfigurowalne
buffy, debuffy, consumables i cooldowny z panelem ustawień zapisywanym lokalnie.

### Zakres (zdecydowany z autorem)

- W zakresie: A, B i C poniżej. Domyślne ustawienia zostają "gołe" (bez buffów, rotacja z DoT-ami, 28 yd),
  żeby wyniki z etapu 1 pozostały porównywalne.
- Poza zakresem (autor zdecydował): flaga "boss odporny na Curse of Doom" (w logu to była faza Tidal
  Shield, nie odporność bossa), kalibracja na logach i import z Warcraft Logs, edytor gearu i talentów
  (etapy 2a i 2b oryginalnego specu).
- Przeglądarka, bez backendu. Zapis ustawień tylko w `localStorage` (per przeglądarka).

## 2. Część A — czas lotu pocisków (silnik)

- `SpellDef.missileSpeed?: number` (yd/s). Brak pola = pocisk natychmiastowy (Corruption, klątwy,
  Shadowburn, Life Tap). Wartości z `spell_data_auto_gen.go` wowsims tbc-new (`MissileSpeed`); Shadow Bolt
  20 jest zweryfikowany, pozostałe (Immolate, Incinerate) do sprawdzenia w źródle, niepewne `// UNVERIFIED`.
- `SimConfig.distanceFromTarget` (yd, domyślnie **28**, z logu: 1,39 s × 20 yd/s ≈ 27,8). Czas lotu =
  `round(distance / missileSpeed × 1000)` ms.
- Przebieg: przy końcu castu schodzi mana, startuje cooldown i GCD, bez zmian. Dalej:
  - pocisk z `missileSpeed` jest w locie przez czas lotu;
  - **w momencie dotarcia** następuje rzut na trafienie/krytyka, obrażenia, nałożenie aury (DoT, debuff),
    zużycie ładunków oraz wywołanie hooków (Improved Shadow Bolt);
  - zdarzenia z `atMs <= durationMs` liczą się, późniejsze nie (reguła końca walki bez zmian).
- Snapshot dostaje `inFlight: { spellId: string; landsAtMs: number }[]`. Priorytet (`when`) i bot nie
  odpalają DoT-a, który właśnie leci (rozszerzenie istniejącej reguły "nie odświeżaj DoT-a w trakcie jego castu").
- `cancelCast` nie ma wpływu na pociski już wystrzelone. Reset walki czyści pociski.
- Determinizm: kolejność losowań RNG zależy od momentu dotarcia, więc seed daje inne wyniki niż w etapie 1
  (zamierzone). Test "jeden duży skok czasu = wiele małych kroków" musi dalej przechodzić.
- Testy: pocisk 28 yd przy prędkości 20 daje 1400 ms; obrażenia i hook pojawiają się w momencie dotarcia,
  nie wcześniej; pocisk dolatujący po `durationMs` nie liczy się, a dolatujący dokładnie w `durationMs` tak;
  DoT z pociskiem nakłada aurę w momencie dotarcia, a bot nie rzuca go drugi raz w locie; miss pocisku nie
  nakłada aury; kolejka spelli i cooldowny bez zmian.

## 3. Część B — konfiguracja rotacji

- `RotationConfig` (dane i UI): `curse: 'elements' | 'agony' | 'doom' | 'none'`, `immolate: boolean`,
  `corruption: boolean`, `shadowburnFinisher: boolean`, `lifeTapBelowMana: number | 'auto'`
  (`'auto'` = koszt Shadow Bolta).
- `buildPriority(config): PriorityStep[]` w `src/data/classes/warlock/rotation.ts`. To jedyne źródło listy
  priorytetów: używają jej panel "Priority" w UI i bot. Obecna lista jest wyrażana jako preset.
- Presety: **"Rotacja z DoT-ami"** (obecna: klątwa wg wyboru, Immolate, Corruption, Shadowburn na koniec,
  Life Tap, Shadow Bolt) i **"SB spam + klątwa"** (jak w logu autora: klątwa na pull, Shadow Bolt, Life Tap
  przy niskiej manie, Shadowburn na koniec).
- Klawisze (`keybinds`) zostają stałe. Konfiguracja nie usuwa spelli z paska, tylko zmienia podpowiedzi
  i zachowanie bota.
- Testy: każdy przełącznik wpływa na wynik `buildPriority`; preset "SB spam" nie zawiera Immolate ani
  Corruption; bot z presetem "SB spam" nie rzuca DoT-ów (z logu zdarzeń); `lifeTapBelowMana` działa;
  bot z domyślną konfiguracją daje te same wyniki co przed zmianą (pasmo DPS z etapu 1 dalej przechodzi).

## 4. Część C — buffy, debuffy, consumables i cooldowny

### 4.1 Model

Katalog `BuffDef` w danych (`src/data/common/buffs.ts`, wartości warlockowe w
`src/data/classes/warlock/buffs.ts`):

```
BuffDef { id; name; icon; wowheadId?; group: 'raid'|'party'|'individual'|'consumable'|'debuff'|'item'|'warlock';
          exclusiveGroup?: string;            // np. flask vs elixiry, jedzenie, klątwa cudza vs własna jest osobno
          effect: { statBonuses?, statMultipliers?, modifiers?,   // na gracza
                    targetDebuff?: AuraDef,                      // na cel (damageTakenMult)
                    onSpellHit?: { chance: number; manaGain: number } };   // proc many (JoW)
          timed?: { defaultStartSec: number; durationSec: number } }  // cooldowny
```

Efekty wyrażane istniejącymi prymitywami silnika: `statBonuses` (SP, Int, Spirit, crit, hit, haste, mp5),
`statMultipliers` (np. Blessing of Kings: Int i Spirit ×1,1), `modifiers` (np. mnożnik obrażeń),
debuffy celu jako aury celu z `damageTakenMult` (Curse of the Elements od innego gracza, Misery, Shadow Weaving).
Nowe w silniku (każde z testem):
- **Zaplanowane aury**: `SimConfig.scheduledAuras: { auraId; on: 'self'|'target'; atMs; durationMs }[]`.
  Nakładają aurę w danej sekundzie walki (cooldowny czasowe: Heroism, mikstury, trinkety; debuffy i buffy
  stałe jako aury od t=0 na całą walkę).
- **`api.addMana(amount)`** w hooku, dla Judgement of Wisdom (proc many przy trafieniu).
- Mana Spring Totem to `mp5` (20 many/2 s = 50 mp5, zgodne z logiem), więc używa istniejącego regenu.

### 4.2 Początkowy katalog (autor może skreślać i dopisywać)

- **Raid i party:** Arcane Brilliance, Gift of the Wild, Divine Spirit, Blessing of Kings, Blessing of
  Wisdom, Moonkin Aura, Mana Spring Totem, Wrath of Air Totem, Totem of Wrath, Heroic Presence,
  Bloodlust/Heroism (czasowy: 40 s, +30% haste, zgodnie z logiem).
- **Consumables:** flask (Supreme Power lub Distilled Wisdom), elixiry (battle/guardian wg wowsims),
  jedzenie, Destruction Potion (czasowa: 15 s, zgodnie z logiem), Super Mana Potion (czasowa), Dark Rune,
  olej na broń.
- **Debuffy celu:** Curse of the Elements od innego warlocka (niezależny od własnej klątwy, osobny aura id),
  Misery, Shadow Weaving, Judgement of Wisdom, Improved Shadow Bolt od innych graczy (patrz niżej).
- **Itemy:** Icon of the Silver Crescent (on-use, czasowy: +155 spell power przez 20 s, CD 2 min,
  zgodnie z danymi i logiem) i Band of the Eternal Sage (proc z ICD 60 s, 10 s, zgodnie z logiem; proc
  przez hook z `roll()`). Dziś są w "Not modeled" i ta lista się skraca.
- **Opcje warlocka:** Fel Armor / Demon Armor / brak, ofiara Succubusa (dziś założone na stałe).
- Wartości każdej pozycji z wowsims tbc-new (`sim/core/buffs.go`, `consumes.go`, proto) lub Wowhead TBC,
  ze źródłem w komentarzu i `// UNVERIFIED` tam, gdzie nie da się potwierdzić. Wartości mierzone w logu
  (czasy trwania, 74 many z JoW, 20 many co 2 s, +30% haste Heroism) są punktami kontrolnymi w testach.

### 4.3 Reguły

- Wykluczanie: flask vs elixiry (battle/guardian), jedna pozycja jedzenia, buff z tej samej `exclusiveGroup`
  zastępuje poprzedni (istniejący `AuraDef.exclusiveGroup`).
- **Improved Shadow Bolt od innych:** pozycja katalogu `isb-from-others`. Włączona: debuff ×1,2 na obrażenia
  shadow bezpośrednie jest aktywny przez całą walkę, nie sumuje się z własnym ISB od krytyków
  (obowiązuje jeden, nie dwa mnożniki). Uproszczenie względem wowsims (uptime procentowy), do przemyślenia
  w planie.
- **Curse of the Elements od innego gracza** nie jest wyłączany przez własną klątwę (inny rzucający), ale
  własne CoE i cudze CoE nie sumują się (jeden efekt 10%).
- Cooldowny czasowe: `startSec` i czas trwania edytowalne, domyślne wartości z presetu. Poza zakresem:
  automatyczne używanie przez gracza. To symulacja zdarzeń raidu, bez klawiszy.
- Preset **"Jak w moim raidzie"** (z logu): Heroism od ~6 s, Destruction Potion od ~7,5 s, Icon od ~30 s,
  Judgement of Wisdom, Mana Spring Totem, Moonkin Aura, buffy Int/Spirit zgodne z rozbieżnością z logu
  (Int 593, Spirit 191, spell power 1592 przy Life Tapie), Band of the Eternal Sage, `isb-from-others`.
  Preset **"Bez buffów"** to domyślny.

## 5. Panel "Setup" i zapis

- Panel (zwijany, nie zasłania paska akcji) z grupami: Buffy raid/party, Consumables, Debuffy celu,
  Cooldowny (checkbox + sekunda startu), Opcje warlocka, Rotacja (część B), Odległość od celu (A), Presety.
- Model: `SetupConfig` (czysty obiekt, wersjonowany): `{ version: 1; enabledBuffs: string[];
  timed: Record<buffId, { startSec: number; durationSec: number }>; rotation: RotationConfig;
  distanceYd: number; warlock: { armor: 'fel' | 'demon' | 'none'; sacrificeSuccubus: boolean } }`
  (Improved Shadow Bolt od innych (`isb-from-others`) to zwykła pozycja katalogu, nie osobne pole).
- `applySetup(spec, config): { spec: SpecData; simConfig: Partial<SimConfig> }` w `src/setup/`. Funkcja
  czysta: scala efekty włączonych buffów ze statami gearu i talentów, buduje aury zaplanowane, listę
  priorytetów i `distanceFromTarget`. Silnik nie zna katalogu buffów, tylko aury i ich efekty.
- Zapis w `localStorage` pod kluczem `rotation-trainer:setup:v1`; odczyt i zapis w `try/catch`; odczyt
  waliduje schemat i odrzuca nieznane id (zgodność wstecz); brak `localStorage` nie psuje aplikacji.
- Zmiana ustawień obowiązuje od następnej walki (reset). Przycisk "Przywróć domyślne".
- Wyniki walki pokazują aktywny preset ("Bez buffów" / "Jak w moim raidzie" / "Własne"), żeby wynik
  nie był mylący. Notka "bez raid buffów…" pod statystykami zależy od presetu.

## 6. Architektura i pliki

```
src/engine/            + missileSpeed i pociski w locie, scheduledAuras, api.addMana
src/data/common/buffs.ts, src/data/classes/warlock/{buffs,rotation}.ts
src/setup/             SetupConfig, defaults, presets, applySetup, persistence (localStorage)
src/ui/SetupPanel.tsx  panel ustawień
tests/...              po jednym zestawie na część, z testem zgodności z wartościami z logu
```

## 7. Kolejność prac i etapy

Trzy części, każda przez ten sam proces (plan, zadania, recenzje, commit):

1. **A. Czas lotu pocisków** (silnik + dane + bot/priorytet).
2. **B. Konfiguracja rotacji** (`RotationConfig`, `buildPriority`, UI rotacji bez zapisu).
3. **C. Buffy i panel** (katalog, zaplanowane aury, `addMana`, `applySetup`, panel, zapis, presety).

Etapy 2a (import gearu z WowSimsExporter, presety BIS) i 2b (edytor talentów) zostają po tych trzech.
Plan implementacji obejmuje A, B i C jako sekwencję zadań, z możliwością zatrzymania po każdej części.

## 8. Ryzyka i pytania otwarte

- Wartości buffów i consumables: wiele z wowsims, część do weryfikacji. Zbyt duży katalog to dużo pracy
  badawczej, stąd sekcja 4.2 jako lista do skreślania.
- Improved Shadow Bolt od innych jako stały mnożnik to uproszczenie względem uptime w wowsims.
- Wpływ czasu lotu na wynik: około −2% DPS w 60-sekundowym oknie (ostatni bolt często nie zdąży trafić);
  pasmo DPS bota z etapu 1 trzeba będzie przeliczyć i zaktualizować z uzasadnieniem w komentarzu.
- Odległość 28 yd to wartość z jednego logu (Naj'entus); na innych bossach inna. Stąd pole w ustawieniach.
- Przepisanie testów bota po zmianie kolejności losowań RNG (A) może przesunąć wyniki jednostkowe.
- Panel ustawień może rosnąć. Zaczynamy od układu zwiniętych grup, bez edytora talentów ani gearu.
