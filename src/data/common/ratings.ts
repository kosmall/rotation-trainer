// Level 70 rating conversions and character constants.
// Sources: github.com/wowsims/tbc-new (TBC Anniversary), master @ 91f869a, unless noted.
// See docs/data-sources.md, section "Task 3".

// Rating points needed for 1% at level 70.
// sim/core/base_stats_auto_gen.go: SpellCritRatingPerCritPercent = 22.076923
export const CRIT_RATING_PER_PCT = 22.076923;
// sim/core/base_stats_auto_gen.go: SpellHitRatingPerHitPercent = 12.615385
export const HIT_RATING_PER_PCT = 12.615385;
// sim/core/base_stats_auto_gen.go: SpellHasteRatingPerHastePercent = 15.76923
export const HASTE_RATING_PER_PCT = 15.76923;

// Base spell crit % of a level 70 Warlock, before intellect and gear.
// sim/core/base_stats_auto_gen.go: ExtraClassBaseStats[Warlock] SpellCritPercent = 1.7
export const BASE_CRIT_PCT = 1.7;
// Intellect per 1% spell crit for a Warlock at level 70.
// sim/core/base_stats_auto_gen.go: CritPerIntMaxLevel[Warlock] = 0.0122 crit % per intellect
export const INT_PER_CRIT_PCT = 1 / 0.0122;

// Mana: maxMana = baseMana + 20 + 15 * (intellect - 20), i.e. the first 20 intellect give
// 1 mana each and every further point gives 15.
// sim/core/mana.go EnableManaBarWithModifier: AddStat(Mana, 20-15*20); int->mana dependency 15
export const MANA_PER_INTELLECT = 15;
export const INT_MANA_FREE_THRESHOLD = 20;

// Spirit regen outside the five-second rule, per second:
//   SPIRIT_REGEN_BASE_PER_SEC + spirit * sqrt(intellect) * SPIRIT_REGEN_PER_SPIRIT_SQRT_INT
// sim/core/mana.go SpiritManaRegenPerSecond: 0.001 + spirit*sqrt(intellect)*0.009327
export const SPIRIT_REGEN_BASE_PER_SEC = 0.001;
export const SPIRIT_REGEN_PER_SPIRIT_SQRT_INT = 0.009327;
// mp5 is mana per 5 seconds. sim/core/mana.go MP5ManaRegenPerSecond: mp5 / 5.0
export const MP5_INTERVAL_SEC = 5;

// Spell crit damage multiplier for magic spells (crit = 150% damage).
// sim/core/spell.go CritDamageMultiplier: base = 1.5 for DefenseTypeMagic
export const BASE_CRIT_MULTIPLIER = 1.5;

// sim/core/constants.go: GCDMin = 1s, GCDDefault = 1500ms
export const MIN_GCD_MS = 1000;
export const BASE_GCD_MS = 1500;

// Spell queue window: a cast may be queued this long before the GCD/cast ends.
// sim/core/constants.go: MaxSpellQueueWindow = 400ms (a sim setting).
// UNVERIFIED: the TBC Anniversary client value must be confirmed.
export const SPELL_QUEUE_WINDOW_MS = 400;
