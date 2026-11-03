# Rotation trainer scenario format (version 1)

This document is everything you need to write a **scenario** for the rotation trainer (a TBC Classic
Destruction Warlock rotation simulator) without reading its code. It is written for people and for AI
agents. A scenario is one JSON file: a rotation script (an ordered list of rules with conditions),
optionally the setup it is meant for (gear, talents, buffs, fight length) and simulation settings.

You can check a scenario without a browser:

```
npm run scenario:validate -- my-scenario.json          # errors and warnings with paths; exit 1 on errors
npm run scenario:run -- my-scenario.json --runs 1000 --seed 1   # mean DPS, sigma, SEM, 95% CI, per-spell share
npm run scenario:ids                                     # prints the id tables at the end of this document
```

Working examples: [`docs/scenarios/`](scenarios/). JSON Schema: [`docs/scenario.schema.json`](scenario.schema.json)
(it checks the file's structure; the condition strings are checked by the validator, not the schema).

Contents: 1 File structure · 2 Rules and how the bot uses them · 3 Conditions (grammar) · 4 Variables and
functions · 5 Ids · 6 The setup part · 7 Worked examples · 8 Common mistakes · 9 Validator and runner ·
10 Prompt template · 11 Id reference (generated).

## 1. File structure

```json
{
  "$schema": "https://raw.githubusercontent.com/kosmall/rotation-trainer/main/docs/scenario.schema.json",
  "format": "rotation-trainer.scenario",
  "version": 1,
  "name": "Pipe, then Icon",
  "description": "What the scenario tries and why (optional).",
  "author": "who wrote it (optional)",
  "createdAt": "2026-11-03T00:00:00.000Z",
  "updatedAt": "2026-11-03T00:00:00.000Z",
  "simulation": { "runs": 1000, "seed": 1 },
  "setup": { "enabledBuffs": ["heroism"], "fightDurationSec": 90 },
  "script": {
    "defs": { "burst": "heroism.active" },
    "rules": [
      { "action": "use", "id": "item:29370", "if": "$burst", "label": "Icon in the burst" },
      { "action": "cast", "id": "shadow-bolt" }
    ]
  },
  "notes": "Free text (optional)."
}
```

| Field | Required | Type and limits | Meaning |
|---|---|---|---|
| `format` | yes | exactly `"rotation-trainer.scenario"` | anything else: "not a scenario" error |
| `version` | yes | exactly `1` | a higher number: "newer than this app" error |
| `name` | yes | string, 1-100 characters, not blank | shown in the library |
| `script` | yes | object `{ rules, defs? }`, at least 1 rule, at most 200 rules and 50 defs | the rotation (section 2) |
| `$schema` | no | string, up to 500 characters | editor hint; kept as written |
| `description` | no | string, up to 2000 characters | |
| `author` | no | string, up to 100 characters | |
| `createdAt`, `updatedAt` | no | ISO 8601 date string, up to 64 characters | |
| `simulation` | no | `{ runs?: 1-100000 (integer), seed?: 0-4294967295 (integer) }` | defaults for the runner (1000 runs, seed 1) |
| `setup` | no | object, any subset of the setup fields (section 6) | absent: the scenario plays on the setup it is applied to (the CLI: the default setup) |
| `notes` | no | string, up to 10 000 characters | |

Whole file: at most 200 000 characters, nesting at most 20 levels, at most 50 000 JSON values, 1000
elements per array, 500 keys per object. Unknown fields are ignored with a warning (with the closest
known name as a suggestion). `__proto__`/`constructor` keys are ordinary unknown fields.

When the app exports a scenario it writes the keys in the order of the table above (`$schema`,
`format`, `version`, `name`, `description`, `author`, `createdAt`, `updatedAt`, `simulation`, `setup`,
`script`, `notes`; rule keys `action`, `id`, `if`, `label`, `comment`, `enabled`), pretty-printed with
two spaces. Reading an exported file gives the same scenario back.

## 2. Rules and how the bot uses them

```json
{ "action": "cast", "id": "immolate", "if": "dotRefreshDue(immolate)", "label": "Immolate", "comment": "why", "enabled": true }
```

| Field | Meaning |
|---|---|
| `action` | `"cast"` a spell, `"use"` an item action (trinket, potion, rune), or `"wait"` (press nothing) |
| `id` | `cast`: a spell id (`shadow-bolt`). `use`: an item id (`item:29370`, `destruction-potion`). `wait`: none |
| `if` | the condition (section 3). Absent or blank: always. A `wait` rule must have one |
| `label` | display name, up to 100 characters (default: the spell or item name) |
| `comment` | explanation shown as the rule's hint, up to 1000 characters |
| `enabled` | `false` keeps the rule but skips it |

`defs` are named conditions, `{ "name": "expression" }`, used as `$name` in any `if` or other def (names:
letters, digits, `_`, `-`, starting with a letter or `_`, up to 64 characters; no cycles).

**How it plays.** At every moment the bot can press something, it walks the rules **top to bottom**
and takes the **first** rule whose `if` is true and whose action the game accepts right now:

- A `cast` of a spell on cooldown, without mana, or during another cast/the global cooldown is
  rejected, and the bot falls through to the next rule. So a filler (`cast shadow-bolt` with no `if`)
  belongs at the bottom, and the order of the rules is the priority.
- A `use` presses an item (off the global cooldown). It never replaces a spell that is already queued.
- A `wait` whose `if` holds stops the walk: nothing is pressed until a later moment (the bot looks
  again whenever something could change). Rules above it still fire; rules below it are held. A wait
  never holds the very first press of the fight (the fight starts with it).
- A rule whose `id` or condition names an id this build or gear does not have is **left out** with a
  warning (the rest of the script still plays). Example: `cast conflagrate` without the Conflagrate
  talent, or `use item:281735` when the Pipe is not worn.
- A scenario's script **replaces** the basic rotation completely: curses, DoTs, Life Tap and the filler
  must all be rules. Items are only used by `use` rules.

The game's spell queue (400 ms) and the engine's timing are the same as in the playable fight; one
simulated fight with seed s is the fight you would get in the game with seed s.

## 3. Conditions (grammar)

A condition is a small boolean expression. There are no loops, no assignments, no arithmetic, no
function definitions: only variables, comparisons, `&&`, `||`, `!`, parentheses and a few built-in
functions.

```
expr       = or ;
or         = and { "||" and } ;
and        = cmp { "&&" cmp } ;
cmp        = unary [ cmpop unary ] ;            (* not chainable: a < b < c is an error *)
cmpop      = "==" | "!=" | "<" | "<=" | ">" | ">=" ;
unary      = "!" unary | primary ;
primary    = number | string | "true" | "false" | defref | call | path | "(" expr ")" ;
call       = path "(" [ arg { "," arg } ] ")" ;
arg        = expr ;                             (* the FIRST argument of has, dotRefreshDue, manaCost, minGap may be a bare id *)
defref     = "$" defname ;
defname    = ( letter | "_" ) { letter | digit | "_" | "-" } ;
path       = letter { segchar } { "." segchar { segchar } } ;
segchar    = letter | digit | "_" | "-" | ":" ;
number     = [ "-" ] digit { digit } [ "." digit { digit } ] ;
string     = "'" { any char but "'" or "\" | "\'" | "\\" } "'" ;
```

- Precedence, tightest first: `!`, comparisons, `&&`, `||`. `!a == b` means `(!a) == b`: write
  `!(a == b)`.
- Types: true/false, number, string. Nothing is converted: `&&`, `||`, `!` need true/false; `<`, `<=`,
  `>`, `>=` need numbers; `==`/`!=` need two values of the same type. The whole `if` must be true/false.
- Ids contain letters, digits, `-`, `:` and `_`, never `.`; dots separate the parts of a variable:
  `target.aura.shadow-vulnerability.active`, `use.item:281735.count`.
- `-` is part of ids (`curse-of-doom`). It is a minus only directly before a digit at the start of a
  token: `x > -5`. There is no subtraction: `time.remaining - 5` is an error (compare with a number
  instead: `time.remaining <= 5`).
- Limits: 500 characters per expression, nesting depth 20.
- Whitespace is free; any other character (including non-ASCII) is an error.

## 4. Variables and functions

All times are **seconds** (decimals allowed) except `time.elapsedMs`. A missing aura reads as not
active with 0 remaining/stacks/charges; an unknown id at run time reads false/0 (but the validator
warns and the rule is left out).

| Variable | Type | Meaning | Example |
|---|---|---|---|
| `time.elapsed` | number (s) | fight time elapsed | `time.elapsed >= 10` |
| `time.remaining` | number (s) | fight time left | `time.remaining <= 5` |
| `time.elapsedMs` | number (ms) | fight time elapsed in ms (the only ms value) | `time.elapsedMs < 1500` |
| `mana` | number | current mana | `mana < 1000` |
| `mana.pct` | number (0-100) | mana in percent of max mana | `mana.pct < 15` |
| `mana.missing` | number | max mana - mana | `mana.missing >= 3000` |
| `mana.max` | number | max mana (with active buffs) | `mana.max > 9000` |
| `self.aura.<id>.active` | true/false | the buff `<id>` is on the player | `self.aura.destruction-potion.active` |
| `self.aura.<id>.remaining` | number (s) | seconds left on it; 0 when not up | `self.aura.item-buff:35163.remaining > 5` |
| `self.aura.<id>.stacks` | number | its stacks; 0 when not up | |
| `self.aura.<id>.charges` | number | its charges; 0 when not up | |
| `target.aura.<id>.active` | true/false | the debuff `<id>` is on the target | `target.aura.shadow-vulnerability.active` |
| `target.aura.<id>.remaining` | number (s) | seconds left; 0 when not up | `target.aura.immolate.remaining <= 3` |
| `target.aura.<id>.stacks` | number | its stacks; 0 when not up | |
| `target.aura.<id>.charges` | number | its charges; 0 when not up | `target.aura.shadow-vulnerability.charges >= 2` |
| `cd.<id>.ready` | true/false | spell or item `<id>` is off cooldown (own and shared cooldown, NOT the global cooldown) | `cd.shadowburn.ready` |
| `cd.<id>.remaining` | number (s) | cooldown left; 0 when ready | `cd.item:29370.remaining < 1` |
| `cast.<id>.count` | number | completed casts of spell `<id>` so far this fight | `cast.immolate.count >= 1` |
| `use.<id>.count` | number | uses of item `<id>` so far this fight | `use.item:281735.count >= 1` |
| `casting` | string | id of the spell being cast, `''` when none | `casting == 'shadow-bolt'` |
| `casting.<id>` | true/false | spell `<id>` is being cast now | `!casting.immolate` |
| `inflight.<id>` | true/false | a Shadow Bolt (missile) of `<id>` is flying | `!inflight.shadow-bolt` |
| `gcd.remaining` | number (s) | global cooldown left; 0 when over | `gcd.remaining == 0` |
| `heroism.active` | true/false | Heroism/Bloodlust is on the player | `heroism.active` |
| `heroism.over` | true/false | Heroism has ended this fight, or the fight has no Heroism | `heroism.active \|\| heroism.over` |
| `true`, `false` | true/false | constants | |

| Function | Type | Meaning | Example |
|---|---|---|---|
| `fight.last(N)` | true/false | in the last N seconds (`time.remaining <= N`) | `fight.last(5)` |
| `has(id)` | true/false | this build/gear has spell or item `id` (constant for the fight; the only function that may name an absent id without the rule being left out) | `has(conflagrate)` |
| `dotRefreshDue(id)` | true/false | the basic rotation's DoT refresh rule for `immolate`, `corruption`, `curse-of-agony`, ...: not being cast, not in flight, at most its cast time left, and a full new DoT still fits in the fight | `dotRefreshDue(immolate)` |
| `finisherWindow()` | number (s) | Shadow Bolt cast time (after talents) + flight time at the fight's distance: when `time.remaining <=` this, a new Shadow Bolt would land after the end | `time.remaining <= finisherWindow()` |
| `manaCost(id)` | number | the spell's mana cost after talents | `mana < manaCost(shadow-bolt)` |
| `minGap(id, N)` | true/false | at least N seconds since item `id` was last used (estimated from its cooldown) | `minGap(item:29370, 30)` |

Notes:
- Sequences use the counters: "trinket 2 after trinket 1" is `use.item:<trinket 1>.count >= 1`.
  There is no other memory.
- `cd.<id>` takes a spell id or an item id (`cd.item:29370.ready`, `cd.destruction-potion.ready`).
  Potions share one cooldown (`potion`), so `cd.super-mana-potion.ready` is false after a Destruction Potion.
- `fight.last(N)` takes a number expression; for "the last N seconds before the finisher window"
  write two conditions (`time.remaining <= 5`), there is no `+`.
- The first argument of `has`, `dotRefreshDue`, `manaCost` and `minGap` can be written bare
  (`has(conflagrate)`) or quoted (`has('item:29370')`).

## 5. Ids

Every id comes from the data; the tables in section 11 list them all (generated from the code, so they
are exact). In short:

- **Spells** (`cast` rules, `cast.<id>.count`, `cd.<id>`, `casting.<id>`, `inflight.<id>`): lower-case
  with dashes: `shadow-bolt`, `immolate`, `corruption`, `curse-of-the-elements`, `curse-of-agony`,
  `curse-of-doom`, `incinerate`, `life-tap`, `shadowburn` (talent), `conflagrate` (talent). A talent
  spell exists only in a build with its talent (see the talent preset table).
- **Auras** (`self.aura.<id>`, `target.aura.<id>`): the DoTs and curses use the spell id (`immolate`,
  `curse-of-doom`); Improved Shadow Bolt's debuff is `shadow-vulnerability`; buffs from the setup use
  their buff id (`heroism`, `destruction-potion`, `misery`, ...); an on-use item's buff is
  `item-buff:<buff id>` (the Icon's: `item-buff:35163`; the Pipe's: `item-buff:1312270`).
- **Items** (`use` rules, `use.<id>.count`, `cd.<id>`): a worn item with an on-use effect is
  `item:<item id>` (`item:29370` Icon of the Silver Crescent, `item:281735` Dark Iron Smoking Pipe).
  It is usable by a script whenever it is **worn** (in `setup.gear` or the gear of the setup the
  scenario is applied to); it does not need to be in `enabledBuffs` (that only makes the *basic*
  rotation use it automatically). Consumables are `destruction-potion`, `super-mana-potion`,
  `dark-rune` and must be **enabled** in `setup.enabledBuffs` to be on the item bar. The action id
  (`use-item-29370`, `use-destruction-potion`) is accepted wherever the item id is.
- **Buffs** (`setup.enabledBuffs`): the setup buff table in section 11 (`heroism`, `arcane-brilliance`, ...).
- **Talents** (`setup.talents`): a talent preset id from the table (`destro-nightfall`) or a talent string
  `affliction-demonology-destruction` (digits per talent, as wowsims writes them).

## 6. The setup part

`setup` is any subset of these fields; the scenario's fields replace those of the setup it is applied
to (in the app the player chooses whether to apply the setup part; the CLI always applies it on top of
the default setup). Values are normalized: an invalid value becomes the default and an unknown id is
dropped, **each with a warning** saying what was used instead.

| Field | Type | Meaning |
|---|---|---|
| `talents` | string | a talent preset id (`destro-nightfall`) or talent string; the author's build if absent |
| `gear` | array of exactly 17 entries | gear in slot order (section 11 "Gear slots"); each `null` or `{ "id": <item id>, "enchant"?: <id>, "gems"?: [<gem ids>] }`; unknown items or items that do not fit the slot become `null` (warning). Absent: the author's gear |
| `gearPresetId` | string `[a-z0-9-]` | label only (with `gear`) |
| `enabledBuffs` | array of buff ids (up to 100) | buffs, debuffs, consumables and Heroism that are on (section 11); one per exclusive group (flask, food, ...): a later one replaces an earlier one |
| `timed` | `{ "<buff id>": { "startSec": 0-600, "durationSec": 1-600 } }` | when a timed buff (Heroism) comes up; only the given buffs change |
| `distanceYd` | number 0-100 | distance to the target (Shadow Bolt flight time); default 28 |
| `fightDurationSec` | integer 10-600 | fight length; default 60 |
| `warlock` | `{ "armor"?: "fel" \| "demon" \| "none", "sacrificeSuccubus"?: true \| false }` | default Fel Armor, Succubus sacrificed |
| `rotation` | the basic rotation's fields | ignored while the script plays (kept for completeness) |

`version` inside `setup` is ignored silently; `setup.script` is ignored with a warning (the rotation is
the top-level `script`).

## 7. Worked examples

### 7.1 Trinket sequencing (the author's question)

"Use trinket 1 only when Heroism is up **and** Improved Shadow Bolt is on the target; use trinket 2
only after trinket 1 has been used." Trinket 1 is the Dark Iron Smoking Pipe (item 281735), trinket 2 the
Icon of the Silver Crescent (29370); both are put in `setup.gear` so the file is self-contained
(full file: [`scenarios/trinket-sequencing.json`](scenarios/trinket-sequencing.json)).

```json
"rules": [
  { "action": "use", "id": "item:281735", "if": "heroism.active && target.aura.shadow-vulnerability.active" },
  { "action": "use", "id": "item:29370", "if": "use.item:281735.count >= 1" },
  { "action": "cast", "id": "curse-of-the-elements", "if": "!target.aura.curse-of-the-elements.active" },
  { "action": "cast", "id": "shadowburn", "if": "time.remaining <= finisherWindow()" },
  { "action": "cast", "id": "immolate", "if": "dotRefreshDue(immolate)" },
  { "action": "cast", "id": "corruption", "if": "dotRefreshDue(corruption)" },
  { "action": "cast", "id": "life-tap", "if": "mana < manaCost(shadow-bolt)" },
  { "action": "cast", "id": "shadow-bolt" }
]
```

The two trinkets share a 20 s trinket cooldown, so the Icon comes 20 s after the Pipe at the earliest.
The bottom six rules are the basic DoT rotation (exactly what "Convert to script" in the app produces).

### 7.2 More examples in `docs/scenarios/`

| File | Shows |
|---|---|
| `burst-potion.json` | a `def`; Destruction Potion during Heroism; the Icon only while the potion buff is up |
| `potion-heroism-shadowburn.json` | potion only during Heroism; Shadowburn kept for the last 5 seconds (written from this document as a self-check) |
| `conflagrate-destruction.json` | a talent preset in `setup.talents`; Conflagrate consuming the last seconds of Immolate |
| `life-tap-mana.json` | consumables enabled in the setup; mana thresholds; the shared potion cooldown |
| `shadowburn-hold.json` | a `wait` rule; a rule that is a DPS loss on purpose (compare with the runner) |

### 7.3 Small recipes

| Want | Rule |
|---|---|
| keep a curse up | `cast curse-of-the-elements` if `!target.aura.curse-of-the-elements.active` |
| Curse of Doom only when it can finish | `cast curse-of-doom` if `!target.aura.curse-of-doom.active && time.remaining >= 60` |
| refresh a DoT like the basic rotation | `cast immolate` if `dotRefreshDue(immolate)` |
| finisher | `cast shadowburn` if `time.remaining <= finisherWindow()` |
| trinket on cooldown but not in the last 10 s | `use item:29370` if `time.remaining > 10` |
| trinket 30 s into the fight | `use item:29370` if `time.elapsed >= 30` |
| potion with Heroism, else after it | `use destruction-potion` if `heroism.active \|\| heroism.over` |
| hold the GCD for Shadowburn | `wait` if `time.remaining <= 4 && cd.shadowburn.remaining <= 1 && !cd.shadowburn.ready` |
| only in a build that has the spell | `cast conflagrate` if `has(conflagrate) && ...` |

## 8. Common mistakes

- **Missing filler**: with no unconditional `cast shadow-bolt` at the bottom, the bot does nothing when
  no rule fits.
- **Filler on top**: rules below an always-true `cast` only fire while that cast is rejected.
- **Item not worn / not enabled**: `use item:<id>` needs the item in the gear; a potion or rune needs
  its id in `setup.enabledBuffs`. Otherwise the validator warns `item '...' is not in this setup` and
  the rule is left out.
- **Worn but never used**: the default gear wears the Icon of the Silver Crescent (`item:29370`), but
  a script uses an item only through a `use` rule: without one, the Icon stays unused (the basic
  rotation's automatic item use does not apply while a script plays).
- **`item:` prefix**: worn gear is `item:29370`, not `29370` or `icon-of-the-silver-crescent`;
  consumables have no prefix (`destruction-potion`).
- **Talent spells**: `shadowburn` and `conflagrate` exist only with their talent; Conflagrate is not in
  the default build (use `"talents": "destruction"` or `"destro-nightfall"`).
- **Milliseconds**: everything is in seconds except `time.elapsedMs`. `time.elapsed >= 30000` means
  30000 seconds.
- **Arithmetic**: there is no `+`, `-`, `*`: `time.remaining <= finisherWindow() + 1` is an error.
- **Type mix-ups**: `mana && heroism.active` (a number is not true/false), `heroism.active == 1`.
- **Chained comparisons**: `5 < time.elapsed < 10` is an error: write `time.elapsed > 5 && time.elapsed < 10`.
- **`!` precedence**: `!cd.shadowburn.remaining > 0` is `(!number) > 0`, a type error: write
  `!(cd.shadowburn.remaining > 0)` or `cd.shadowburn.remaining == 0`.
- **Improved Shadow Bolt id**: your own ISB debuff is `shadow-vulnerability`; with the setup buff
  `isb-from-others` the raid's is `isb-from-others` (both can be checked).
- **The global cooldown**: `cd.<id>.ready` ignores the global cooldown; it does not need to check it
  (a press during the global cooldown is rejected and the bot moves on).
- **Wait without a way out**: a `wait` with an `if` that stays true holds every rule below it.
- **Strings for numbers**: `"fightDurationSec": "90"` becomes 60 with a warning; write `90`.

## 9. Validator and runner

`npm run scenario:validate -- file.json [more files]` prints one summary line per file, then one line per
issue with its path and, when one is near, a suggestion; exit code 0 when no file has an error (warnings
are fine), 1 otherwise, 2 for no file:

```
bad.json: 2 errors, 1 warning - "My scenario"
  error   simulation.runs: runs must be an integer from 1 to 100000 (got 0)
  error   script.rules[2].if: column 12: expected ')' but found end of input
  warning setup.enabledBuffs[0]: unknown buff 'heroizm' (ignored) (did you mean 'heroism'?)
```

While a file has errors, only the structural warnings are listed; the script's id warnings (unknown
spells, auras, items: "rule left out") follow once the errors are fixed.

Paths: `name`, `simulation.runs`, `setup.enabledBuffs[3]`, `setup.gear[12]`, `setup.rotation.curse`,
`script.rules[2].if`, `script.rules[2].id`, `script.rules[2]` (the rule as a whole: "rule left out"),
`script.defs.burst`. Expression errors start with `column N:` (1-based position in that `if`).
**Errors** (the file cannot be imported or run): wrong format/version, wrong types, limits, syntax and
type errors, unknown variables or functions, an unknown action. **Warnings** (the file still runs):
unknown fields, unknown ids (the rule is left out), setup values replaced by defaults.

`npm run scenario:run -- file.json [--runs N] [--seed S] [--json]` validates (errors: printed, exit 1;
warnings: printed to standard error, the run goes on), then simulates N fights (default: the file's
`simulation`, else 1000 runs, seed 1) on the default setup with the scenario's `setup` and script, and
prints:

```
Scenario: Pipe, then Icon (trinket sequencing) (docs/scenarios/trinket-sequencing.json)
Setup: the default setup with the scenario setup; fight 90 s; 0 warnings
Runs: 1000, seed 1, spell queue window 400 ms
Mean DPS: 1691.33
Sigma: 133.02   SEM: 4.21   95% CI: 1683.08 - 1699.57
Min / median / max: 1254.51 / 1693.01 / 2102.33
Damage share per spell (mean casts per fight):
  Shadow Bolt               82.6%  (30.87 casts)
  Immolate                   8.4%  (5.07 casts)
  Corruption                 7.6%  (4.06 casts)
  Shadowburn                 1.5%  (1.00 casts)
  Curse of the Elements      0.0%  (1.02 casts)
  Life Tap                   0.0%  (5.00 casts)
Item uses per fight:
  Dark Iron Smoking Pipe           1.00
  Icon of the Silver Crescent      1.00
Life Taps per fight: 5.00
Rule fires per fight:
     1.00  rules[0] Pipe in the burst
     1.00  rules[1] Icon after the Pipe
     1.02  rules[2] Curse of the Elements
     1.00  rules[3] Shadowburn (finisher)
     5.07  rules[4] Immolate
     4.06  rules[5] Corruption
     5.00  rules[6] Life Tap
    31.85  rules[7] Shadow Bolt
```

(Curse of the Elements and Life Tap deal no damage themselves. "Rule fires per fight" lists, per rule
`rules[i]`, the mean number of casts or item uses per fight that rule started: a press counts when its
cast or use actually starts, so a press that waited in the spell queue and was then replaced or
dropped counts nothing. A rule that never fired shows 0.00; wait rules press nothing and are not
listed, and rules left out by the compiler are not listed either. Without a script the keys are the
basic rotation's spell ids and item ids, e.g. `shadow-bolt`, `destruction-potion`, `item:29370`.)

Sigma is the standard deviation of one fight's DPS, SEM = sigma / sqrt(runs) the standard error of the
mean, and the 95% CI is mean ± 1.96 SEM. Two scenarios run with the same `--runs` and `--seed` use the
same random seeds per fight; a difference smaller than about 2-3 SEM is noise. The same file, runs and
seed always print the same numbers. `--json` prints one JSON object with the same numbers (`meanDps`,
`stdDev`, `stdErr`, `ci95`, `min`, `median`, `max`, `perSpell`, `itemUses`, `ruleFires` as
`{ "rules[0]": { "label": ..., "meanFires": ... } }`, `warnings`).

### Comparing scenarios

`npm run scenario:compare -- baseline.json other.json [up to 5 files] [--runs N] [--seed S] [--json]`
validates every file (any file with errors: printed, exit 1, nothing runs), then plays every scenario
with the SAME runs and seed (the options, else the first file's `simulation`, else 1000 and 1): fight
i of every scenario uses the same random seed, so the per-fight differences are paired and most of the
fight-to-fight luck cancels out. The first file is the baseline:

```
Comparison: 2 scenarios, 1000 paired runs (run i of every scenario uses the same seed), seed 1, spell queue window 400 ms
Baseline: 1. Pipe, then Icon (trinket sequencing)
#  Rank    Mean DPS    Sigma    SEM     Delta  SEM(d)  95% CI of delta       Verdict
1. 1        1691.33   133.02   4.21  baseline
2. 2        1547.62   108.18   3.42   -143.71    3.51  -150.59 .. -136.83    worse (significant)
1. Pipe, then Icon (trinket sequencing) (docs/scenarios/trinket-sequencing.json)
2. Potion and Icon in the Heroism window (docs/scenarios/burst-potion.json)
Rule fires per fight:
  1. Pipe, then Icon (trinket sequencing)
       1.00  rules[0] Pipe in the burst
       1.00  rules[1] Icon after the Pipe
       1.02  rules[2] Curse of the Elements
       1.00  rules[3] Shadowburn (finisher)
       5.07  rules[4] Immolate
       4.06  rules[5] Corruption
       5.00  rules[6] Life Tap
      31.85  rules[7] Shadow Bolt
  2. Potion and Icon in the Heroism window
       1.00  rules[0] Destruction Potion
       1.00  rules[1] Icon with the potion
       1.02  rules[2] Curse of the Elements
       1.00  rules[3] Shadowburn (finisher)
       7.03  rules[4] Immolate
       6.01  rules[5] Corruption
       8.00  rules[6] Life Tap
      39.94  rules[7] Shadow Bolt
Verdict: "significant" means the 95% CI of the paired difference excludes 0. Each of the 1 comparison(s) against the baseline is its own test with no correction: with no real difference about 1 in 20 still reads "significant"; with several scenarios, rerun with another --seed (or more --runs) before trusting a small difference.
```

(These two examples differ in setup too, a 90 s against a 120 s fight among others: a comparison
answers "which whole scenario gives more DPS", so to measure one rule change keep everything else
equal.)

Columns: Rank by mean DPS; Mean DPS, Sigma and SEM of each scenario as in `scenario:run`; Delta = mean
DPS minus the baseline's; SEM(d) = the standard error of the paired differences (sample standard
deviation of the per-fight differences / sqrt(runs)), usually much smaller than either SEM; the 95% CI
of the delta (Delta ± 1.96 SEM(d)); Verdict: "better (significant)" / "worse (significant)" when that
CI excludes 0, else "no clear difference". Each scenario is one test against the baseline with no
correction for several comparisons: with no real difference about 1 in 20 comparisons still reads
"significant", so with 4-5 scenarios rerun a close call with another `--seed` or more `--runs`.
`--json` prints `{ runs, seed, spellQueueWindowMs, ranking, scenarios: [{ file, name, rank, meanDps,
stdDev, stdErr, ci95, delta (null for the baseline: meanDiff, sem, ci95, zscore, significant, rank,
verdict), ruleFires }] }`.

## 10. Prompt template

Copy this to ask an AI agent for a scenario:

```
You are writing a rotation-trainer scenario (a JSON file) for a TBC Classic Destruction Warlock.
Read docs/scenario-format.md completely; use only ids from its section 11 tables.
Goal: <describe the rotation idea, e.g. "use the Destruction Potion only during Heroism and keep
Shadowburn for the last 5 seconds">.
Setup: <the gear/talents/buffs/fight length it needs, or "the default setup">.
Requirements:
- format "rotation-trainer.scenario", version 1, a name and a description of the idea;
- the script replaces the whole rotation: include curse, DoTs, Life Tap and a Shadow Bolt filler last;
- put every worn item the script uses in setup.gear and every consumable in setup.enabledBuffs;
- save it as docs/scenarios/<name>.json, run `npm run scenario:validate -- <file>` and fix every error
  and warning, then run `npm run scenario:run -- <file> --runs 1000 --seed 1` and compare with
  docs/scenarios/trinket-sequencing.json or the basic rotation; report the mean DPS ± SEM.
```

## 11. Id reference (generated)

Generated from the trainer's data by `npm run scenario:ids` (a test fails when this section and the
data disagree). Spells and auras are those of the talent presets with every setup buff enabled.

<!-- scenario-ids:start (generated by `npm run scenario:ids -- --write`; do not edit by hand) -->

### Gear slots (`setup.gear` index order)

| index | slot | author's item |
| --- | --- | --- |
| 0 | head | 31051 Hood of the Malefic |
| 1 | neck | 32349 Translucent Spellthread Necklace |
| 2 | shoulder | 31054 Mantle of the Malefic |
| 3 | back | 32590 Nethervoid Cloak |
| 4 | chest | 30913 Robes of Rhonin |
| 5 | wrist | 32586 Bracers of Nimble Thought |
| 6 | hands | 31050 Gloves of the Malefic |
| 7 | waist | 30038 Belt of Blasting |
| 8 | legs | 31053 Leggings of the Malefic |
| 9 | feet | 28517 Boots of Foretelling |
| 10 | finger1 | 29305 Band of the Eternal Sage |
| 11 | finger2 | 32247 Ring of Captured Storms |
| 12 | trinket1 | 25653 Riding Crop |
| 13 | trinket2 | 29370 Icon of the Silver Crescent |
| 14 | mainHand | 32237 The Maelstrom's Fury |
| 15 | offHand | 33334 Fetish of the Primal Gods |
| 16 | ranged | 29982 Wand of the Forgotten Star |

### Talent presets (`setup.talents`: the preset id or its string)

| preset id | name | talent string | talent spells |
| --- | --- | --- | --- |
| `my-build` | My build (export) | `000000000000000000000-2050130133200100000000-555000512200013330050` | shadowburn |
| `destruction` | Destruction | `000000000000000000000-2050030133210100000000-505000512200510531050` | shadowburn, conflagrate |
| `destro-nightfall` | Destro/Nightfall | `150222201023000000000-0000000000000000000000-505020510200510531051` | shadowburn, conflagrate |
| `affliction` | Affliction | `050222211123510550030-0000000000000000000000-505000512200010000000` | shadowburn |
| `demo-ruin` | Demo/Ruin | `010000000000000000000-2050032133050101501340-505002510200010000000` | shadowburn |
| `demo-felguard` | Demonology Felguard | `010000000000000000000-2050030133250101501351-505000511200000000000` | shadowburn |

### Spells (`cast` rules, `cast.<id>.count`, `cd.<id>.*`, `casting.<id>`, `inflight.<id>`)

| spell id | name | base cast (s) | cooldown (s) | in the talent presets |
| --- | --- | --- | --- | --- |
| `shadow-bolt` | Shadow Bolt | 3 | 0 | all |
| `immolate` | Immolate | 2 | 0 | all |
| `corruption` | Corruption | 2 | 0 | all |
| `curse-of-agony` | Curse of Agony | 0 | 0 | all |
| `curse-of-doom` | Curse of Doom | 0 | 60 | all |
| `curse-of-the-elements` | Curse of the Elements | 0 | 0 | all |
| `shadowburn` | Shadowburn | 0 | 15 | all |
| `incinerate` | Incinerate | 2.5 | 0 | all |
| `life-tap` | Life Tap | 0 | 0 | all |
| `conflagrate` | Conflagrate | 0 | 10 | destruction, destro-nightfall |

### Auras (`self.aura.<id>.*`, `target.aura.<id>.*`)

| aura id | name | on | present when |
| --- | --- | --- | --- |
| `immolate` | Immolate | target | the build |
| `corruption` | Corruption | target | the build |
| `curse-of-agony` | Curse of Agony | target | the build |
| `curse-of-doom` | Curse of Doom | target | the build |
| `curse-of-the-elements` | Curse of the Elements | target | the build |
| `shadow-vulnerability` | Shadow Vulnerability | target | the build |
| `raid-curse-of-the-elements` | Curse of the Elements (raid) | target | setup buff `raid-curse-of-the-elements` |
| `misery` | Misery | target | setup buff `misery` |
| `shadow-weaving` | Shadow Weaving | target | setup buff `shadow-weaving` |
| `judgement-of-wisdom` | Judgement of Wisdom | target | setup buff `judgement-of-wisdom` |
| `isb-from-others` | Shadow Vulnerability (raid) | target | setup buff `isb-from-others` |
| `heroism` | Heroism | self | setup buff `heroism` |
| `destruction-potion` | Destruction Potion | self | setup buff `destruction-potion` |

On-use item buffs are `item-buff:<buff id>` (self): see the item tables below.

### Setup buff ids (`setup.enabledBuffs`)

| buff id | name | group | notes |
| --- | --- | --- | --- |
| `arcane-brilliance` | Arcane Brilliance | raid |  |
| `gift-of-the-wild` | Gift of the Wild | raid |  |
| `prayer-of-spirit` | Divine Spirit (Prayer of Spirit) | raid |  |
| `moonkin-aura` | Moonkin Aura | party |  |
| `mana-spring-totem` | Mana Spring Totem | party |  |
| `wrath-of-air-totem` | Wrath of Air Totem | party |  |
| `totem-of-wrath` | Totem of Wrath | party |  |
| `inspiring-presence` | Inspiring Presence (Draenei) | party |  |
| `blessing-of-kings` | Blessing of Kings | individual |  |
| `blessing-of-wisdom` | Blessing of Wisdom | individual |  |
| `flask-of-supreme-power` | Flask of Supreme Power | consumable | one of group `flask` |
| `flask-of-distilled-wisdom` | Flask of Distilled Wisdom | consumable | one of group `flask` |
| `flask-of-pure-death` | Flask of Pure Death | consumable | one of group `flask` |
| `elixir-of-major-shadow-power` | Elixir of Major Shadow Power | consumable | one of group `elixir-battle` |
| `elixir-of-major-firepower` | Elixir of Major Firepower | consumable | one of group `elixir-battle` |
| `adepts-elixir` | Adept's Elixir | consumable | one of group `elixir-battle` |
| `greater-arcane-elixir` | Greater Arcane Elixir | consumable | one of group `elixir-battle` |
| `elixir-of-draenic-wisdom` | Elixir of Draenic Wisdom | consumable | one of group `elixir-guardian` |
| `elixir-of-major-mageblood` | Elixir of Major Mageblood | consumable | one of group `elixir-guardian` |
| `blackened-basilisk` | Blackened Basilisk | consumable | one of group `food` |
| `skullfish-soup` | Skullfish Soup | consumable | one of group `food` |
| `blackened-sporefish` | Blackened Sporefish | consumable | one of group `food` |
| `brilliant-wizard-oil` | Brilliant Wizard Oil | consumable | one of group `weapon-oil` |
| `superior-wizard-oil` | Superior Wizard Oil | consumable | one of group `weapon-oil` |
| `raid-curse-of-the-elements` | Curse of the Elements (another warlock) | debuff |  |
| `misery` | Misery | debuff |  |
| `shadow-weaving` | Shadow Weaving | debuff |  |
| `judgement-of-wisdom` | Judgement of Wisdom | debuff |  |
| `isb-from-others` | Improved Shadow Bolt (other warlocks) | debuff |  |
| `heroism` | Heroism / Bloodlust | raid | timed: default start 0 s for 40 s (`setup.timed.heroism`) |
| `destruction-potion` | Destruction Potion | consumable | item action `destruction-potion` (bound only when enabled) |
| `super-mana-potion` | Super Mana Potion | consumable | item action `super-mana-potion` (bound only when enabled) |
| `dark-rune` | Dark Rune | consumable | item action `dark-rune` (bound only when enabled) |

### Consumable item actions (`use` rules, `use.<id>.count`, `cd.<id>.*`; enable them in `setup.enabledBuffs`)

| item id | action id | name | cooldown (s) | shared cooldown | aura it applies |
| --- | --- | --- | --- | --- | --- |
| `destruction-potion` | `use-destruction-potion` | Destruction Potion | 120 | `potion` 120 s | `destruction-potion` |
| `super-mana-potion` | `use-super-mana-potion` | Super Mana Potion | 120 | `potion` 120 s | (mana) |
| `dark-rune` | `use-dark-rune` | Dark Rune | 120 | `rune` 120 s | (mana) |

### On-use items of the item database (`use item:<item id>` when worn: put the item in `setup.gear`)

| item | name | slot | item id (use rules) | action id | buff aura | cooldown (s) | shared cooldown |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 18820 | Talisman of Ephemeral Power | trinket | `item:18820` | `use-item-18820` | `item-buff:23271` Ephemeral Power: +175 spellPower for 15 s | 90 | `category-1141` 15 s |
| 19947 | Nat Pagle's Broken Reel | trinket | `item:19947` | `use-item-19947` | `item-buff:24610` Pagle's Broken Reel: +80 hitRating for 15 s | 75 | - |
| 19957 | Hazza'rah's Charm of Destruction | trinket | `item:19957` | `use-item-19957` | `item-buff:24543` Massive Destruction: +140 critRating for 20 s | 180 | `category-1141` 20 s |
| 20636 | Hibernation Crystal | trinket | `item:20636` | `use-item-20636` | `item-buff:24998` Healing of the Ages: +117 spellPower for 15 s | 90 | - |
| 22268 | Draconic Infused Emblem | trinket | `item:22268` | `use-item-22268` | `item-buff:27675` Chromatic Infusion: +100 spellPower for 15 s | 75 | `category-1141` 15 s |
| 23046 | The Restrained Essence of Sapphiron | trinket | `item:23046` | `use-item-23046` | `item-buff:28779` Essence of Sapphiron: +130 spellPower for 20 s | 120 | `category-1141` 20 s |
| 23047 | Eye of the Dead | trinket | `item:23047` | `use-item-23047` | `item-buff:28780` The Eye of the Dead: +150 spellPower for 30 s | 120 | - |
| 24121 | Chain of the Twilight Owl | neck | (pre-pull, no action) | - | `item-buff:31035` Chain of the Twilight Owl: +44 critRating for 1800 s | - | - |
| 24126 | Figurine - Living Ruby Serpent | trinket | `item:24126` | `use-item-24126` | `item-buff:31040` Living Ruby Serpent: +150 spellPower for 20 s | 300 | `category-1141` 20 s |
| 25619 | Glowing Crystal Insignia | trinket | `item:25619` | `use-item-25619` | `item-buff:32355` Focused Power: +104 spellPower for 20 s | 120 | `category-1141` 20 s |
| 25620 | Ancient Crystal Talisman | trinket | `item:25620` | `use-item-25620` | `item-buff:32355` Focused Power: +104 spellPower for 20 s | 120 | `category-1141` 20 s |
| 25634 | Oshu'gun Relic | trinket | `item:25634` | `use-item-25634` | `item-buff:32367` Power of Prayer: +71 spellPower for 20 s | 120 | - |
| 25936 | Terokkar Tablet of Vim | trinket | `item:25936` | `use-item-25936` | `item-buff:39201` Spell Power: +84 spellPower for 15 s | 90 | `category-1141` 15 s |
| 25995 | Star of Sha'naar | trinket | `item:25995` | `use-item-25995` | `item-buff:32956` Spell Power: +70 spellPower for 15 s | 120 | `category-1141` 20 s |
| 27828 | Warp-Scarab Brooch | trinket | `item:27828` | `use-item-27828` | `item-buff:33400` Accelerated Mending: +94 spellPower for 20 s | 120 | - |
| 28040 | Vengeance of the Illidari | trinket | `item:28040` | `use-item-28040` | `item-buff:33662` Arcane Energy: +120 spellPower for 15 s | 90 | `category-1141` 15 s |
| 28223 | Arcanist's Stone | trinket | `item:28223` | `use-item-28223` | `item-buff:34000` The Arcanist's Stone: +167 spellPower for 20 s | 120 | `category-1141` 20 s |
| 28370 | Bangle of Endless Blessings | trinket | `item:28370` | `use-item-28370` | `item-buff:34210` Endless Blessings: +130 spirit for 20 s | 120 | - |
| 29132 | Scryer's Bloodgem | trinket | `item:29132` | `use-item-29132` | `item-buff:35337` Spell Power: +150 spellPower for 15 s | 90 | `category-1141` 15 s |
| 29179 | Xi'ri's Gift | trinket | `item:29179` | `use-item-29179` | `item-buff:35337` Spell Power: +150 spellPower for 15 s | 90 | `category-1141` 15 s |
| 29370 | Icon of the Silver Crescent | trinket | `item:29370` | `use-item-29370` | `item-buff:35163` Blessing of the Silver Crescent: +155 spellPower for 20 s | 120 | `category-1141` 20 s |
| 29376 | Essence of the Martyr | trinket | `item:29376` | `use-item-29376` | `item-buff:35165` Essence of the Martyr: +99 spellPower for 20 s | 120 | - |
| 30293 | Heavenly Inspiration | trinket | `item:30293` | `use-item-30293` | `item-buff:36347` Healing Power: +79 spellPower for 15 s | 90 | - |
| 30340 | Starkiller's Bauble | trinket | `item:30340` | `use-item-30340` | `item-buff:36432` Spell Power: +125 spellPower for 15 s | 90 | `category-1141` 15 s |
| 31615 | Ancient Draenei Arcane Relic | trinket | `item:31615` | `use-item-31615` | `item-buff:33662` Arcane Energy: +120 spellPower for 15 s | 90 | `category-1141` 15 s |
| 32483 | The Skull of Gul'dan | trinket | `item:32483` | `use-item-32483` | `item-buff:40396` Fel Infusion: +175 hasteRating for 20 s | 120 | `category-1141` 20 s |
| 33828 | Tome of Diabolic Remedy | trinket | `item:33828` | `use-item-33828` | `item-buff:43710` Diabolic Remedy: +132 spellPower for 20 s | 120 | - |
| 33829 | Hex Shrunken Head | trinket | `item:33829` | `use-item-33829` | `item-buff:43712` Mojo Madness: +211 spellPower for 20 s | 120 | `category-1141` 20 s |
| 35700 | Figurine - Crimson Serpent | trinket | `item:35700` | `use-item-35700` | `item-buff:46783` Crimson Serpent: +150 spellPower for 20 s | 120 | `category-1141` 20 s |
| 281735 | Dark Iron Smoking Pipe | trinket | `item:281735` | `use-item-281735` | `item-buff:1312270` Dark Iron Pipeweed: +209 spellPower for 20 s | 120 | `category-1141` 20 s |
| 281748 | Direbrew Hops | trinket | `item:281748` | `use-item-281748` | `item-buff:1312306` Hopped Up: +135 spellPower for 20 s | 120 | - |

<!-- scenario-ids:end -->
