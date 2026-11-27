# Import of the wowsims addon export: items and "mój sprzęt" (stage 2) — design

Approved in conversation 2026-11-27 (stage 1, talents: `2026-11-27-addon-import-talents-design.md`).

## Intent
The items of the export become "moje itemy"; their summed stats are a fourth gear option ("mój sprzęt") next to quest / average / good in the "Sprzęt" dropdown, and simulations use it.

## Goals
- Pasting the export in the "Własny build" import box also fetches the stats of its items from Wowhead and lists them in a "Moje itemy" section (slot, name, stats, totals, effects that are not modelled).
- The dropdown "Sprzęt" gets "mój sprzęt" once items are imported; simulations (ranking, sweep, duel, EP) use the totals.

## Non-goals
Enchants, gems, random suffixes (the export has only item ids), on-use and proc effects, set bonuses, editing stats by hand, weapons' damage.

## Facts (verified 2026-11-27)
- `https://nether.wowhead.com/forever/tooltip/item/<id>` returns `{name, icon, tooltip(html)}` for Forever and Classic ids, with `access-control-allow-origin: *` (the browser can fetch it).
- Stat lines: `+N Stamina|Intellect|Spirit|Strength|Agility|Armor`, base `N Armor`, `Equip: Increases damage and healing done by magical spells and effects by up to N.`, `Equip: Increases damage done by Shadow spells and effects by up to N.`; other `Equip:`/`Use:` lines are effects.
- The export's `gear.items` has 17 entries (null = empty) in the order head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet, finger1, finger2, trinket1, trinket2, mainhand, offhand, ranged.

## Approaches
One sensible way: a framework-free `src/forever/web/gear.ts` (tooltip parser, totals, storage), a runtime gear profile registered in `stats.ts` (like custom talent orders), the totals carried in the job request to the worker (like custom builds). A build-time item database was rejected: the user's items are arbitrary.

## Design
- `ItemStats`: stamina, intellect, spirit, armor, spellPower (generic), shadowSpellPower, critPct, hitPct. `GearItem`: `{ id, slot, name, stats, unmodelled: string[] }`; a failed fetch gives `{ id, slot, name: null, error }` and counts as zero.
- Totals (`GearTotals`): the sums; `critPct` = 5 (the `average` profile's crit; no base-crit source) + items; `hitPct` from items. Constant, not scaled by level.
- Stats: profile id `mine` (`MY_GEAR`) is valid in settings; `registerGearProfile(totals)` in `stats.ts` makes `playerStatsFor` read it. Shadow spell power is added to the `shadow_spell_power_bonus` parameter (with the Spellstone's 21 if on).
- `JobRequest.gear?: GearTotals` on every kind; `planJob` registers it when `settings.profile === 'mine'` (error if missing).
- UI: `ForeverApp` holds `gear: MyGear | null` (localStorage `wow-forever-sim:gear:v1`), the fetch function is injectable (`itemFetcher` prop, default `fetch`); all runs get `gear` when the profile is `mine`; without gear a `mine` setting falls back to `average`. `SettingsBar` shows "mój sprzęt" only with gear. `CustomView` imports items with the build (status text while fetching) and lists them, with a "Usuń mój sprzęt" button.

## Tests
Parser on saved real tooltips (fixtures), totals, gear job differs from average and uses the shadow bonus, UI import with a fake fetcher, dropdown option, fallback without gear.
