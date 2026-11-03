import { activeSetBonuses } from '../../../engine/sets';
import { projectileTravelMs } from '../../../engine/travel';
import type { SimSnapshot, SpellModifier } from '../../../engine/types';
import { formatNumber } from '../../../script/printer';
import type { ScriptRotationFacts, ScriptRule } from '../../../script/types';
import type { PriorityStep, SpecData } from '../../types';
import type { ItemUseRule } from './itemUse';
import { warlockAuras } from './auras';
import { TALENT_SPELL_IDS, warlockSpells as allSpells } from './spells';
import { authorTalentSpells, talentModifiers } from './talents';

// The shadow Destruction priority as a configurable rotation (stage 1.5 Part B): buildPriority is
// the only source of the priority list; the spec's `priority` is the DoT preset at the default
// distance, the UI's priority panel and the bot use whatever list it builds. Keybinds do not
// change with the configuration. Sources: wowsims tbc-new master @ 91f869a (APL
// ui/specs/warlock/dps/apls/destruction.apl.json) and old wowsims/tbc sim/warlock/rotations.go;
// see docs/data-sources.md, "Priority (shadow Destruction)" and "Part B: rotation configuration".

/** The warlock's own curse; one curse per target (auras.ts exclusiveGroup 'curse'). */
export type CurseChoice = 'elements' | 'agony' | 'doom' | 'none';

export interface RotationConfig {
  curse: CurseChoice;
  immolate: boolean;
  corruption: boolean;
  /** Shadowburn when a Shadow Bolt started now would land after the end. */
  shadowburnFinisher: boolean;
  /** Life Tap when mana is below this; 'auto' = Shadow Bolt's cost (399 with Cataclysm). */
  lifeTapBelowMana: number | 'auto';
  /**
   * When the bot uses each item action (simulator Task 1, itemUse.ts): rules keyed by the catalog
   * entry id (`destruction-potion`, `super-mana-potion`, `dark-rune`, `item:<id>`). Absent (every
   * config saved before, the presets), or an action without a rule: its default
   * (`DEFAULT_ITEM_USE`, the bot's behaviour before the rules existed). Not read by
   * `buildPriority`: `applySetup` compiles it (`compileItemUse`) into the item steps.
   */
  itemUse?: Record<string, ItemUseRule>;
  /** The item steps' order: these entry ids first, the other actions after in catalog order. */
  itemUseOrder?: string[];
}

export type RotationPresetId = 'dot' | 'sb-spam';

/** Frozen: build a new config from a preset with a spread, never write to it. */
export const ROTATION_PRESETS: Record<RotationPresetId, { name: string; config: RotationConfig }> = Object.freeze({
  // The stage 1 list (tbc-new APL plus Corruption from wowsims/tbc, curse UNVERIFIED (choice)).
  dot: Object.freeze({
    name: 'DoT rotation',
    config: Object.freeze({
      curse: 'elements',
      immolate: true,
      corruption: true,
      shadowburnFinisher: true,
      lifeTapBelowMana: 'auto',
    } satisfies RotationConfig),
  }),
  // The author's raid (spec Part B, the author's Naj'entus log): curse on the pull (Curse of Doom),
  // Shadow Bolt, Life Tap at low mana, Shadowburn at the end; no Immolate or Corruption.
  'sb-spam': Object.freeze({
    name: 'Shadow Bolt spam + curse',
    config: Object.freeze({
      curse: 'doom',
      immolate: false,
      corruption: false,
      shadowburnFinisher: true,
      lifeTapBelowMana: 'auto',
    } satisfies RotationConfig),
  }),
});

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function spellDef(id: string) {
  const s = allSpells.find((x) => x.id === id);
  if (!s) throw new Error(`unknown warlock spell ${id}`);
  return s;
}

/**
 * Base cast time plus the talents' flat cast time deltas, unhasted on purpose. Snapshots carry
 * the effective (hasted) cast times since ruling R20, but reading them here was tried and
 * rejected: with the hasted values (e.g. Corruption 1945 ms) the refresh can become due just
 * after the bot started another 2431 ms Shadow Bolt, so the DoT drops for up to one bolt (bot
 * uptime from first to last application fell from >90% to 84% in one seed) and the DPS shifted
 * by ~4% (window 400). The unhasted values (Shadow Bolt 2500, Immolate 1500, Corruption 2000 ms)
 * fire slightly earlier and keep that margin. See docs/data-sources.md, Task 12b open question 3.
 */
function talentCastTimeMs(id: string, talents: RotationTalents): number {
  const s = spellDef(id);
  let ms = s.castTimeMs;
  for (const m of talents.modifiers) {
    if ((m.spellIds === undefined || m.spellIds.includes(id)) && (m.schools === undefined || m.schools.includes(s.school))) {
      ms += m.castTimeMsDelta ?? 0;
    }
  }
  return Math.max(0, ms);
}

/** The spell's mana cost after the talents' `manaCostMult` (Shadow Bolt with Cataclysm 5/5: 399). */
function talentManaCost(id: string, talents: RotationTalents): number {
  const s = spellDef(id);
  let mult = 1;
  for (const m of talents.modifiers) {
    if ((m.spellIds === undefined || m.spellIds.includes(id)) && (m.schools === undefined || m.schools.includes(s.school))) {
      mult *= m.manaCostMult ?? 1;
    }
  }
  return s.manaCost * mult;
}

/**
 * What the priority reads from the talents (talentEffects.ts `effectsForBuild` of the build):
 * their spell modifiers (cast time deltas for the refresh and finisher windows, the cost
 * multiplier for Life Tap 'auto') and the talent spells they make available. Absent: the author's
 * build (talents.ts), giving the stage 1 list rule for rule.
 */
export interface RotationTalents {
  modifiers: readonly SpellModifier[];
  spells: readonly string[];
}

const AUTHOR_TALENTS: RotationTalents = { modifiers: talentModifiers, spells: authorTalentSpells };

/** Whether the build has the spell: talent spells (`TALENT_SPELL_IDS`) only with their talent. */
const spellAvailable = (id: string, talents: RotationTalents) => !TALENT_SPELL_IDS.includes(id) || talents.spells.includes(id);

function auraDef(id: string) {
  const a = warlockAuras.find((x) => x.id === id);
  if (!a) throw new Error(`unknown warlock aura ${id}`);
  return a;
}

function auraDurationMs(id: string): number {
  return auraDef(id).durationMs;
}

/**
 * Extra DoT ticks per spell id (`SpellModifier.dotExtraTicks`, e.g. Voidheart Raiment 4pc:
 * `{ corruption: 1, immolate: 1 }`). A spell absent (or 0) keeps its DoT's base duration.
 */
export type DotExtraTicks = Readonly<Partial<Record<string, number>>>;

/** The warlock spells that apply a ticking target aura (Immolate, Corruption, the curses with ticks). */
const DOT_SPELLS = allSpells.filter((s) => s.applyAura?.on === 'target' && auraDef(s.applyAura.auraId).tick);

/**
 * The extra DoT ticks the engine will give each DoT spell of `spec` at application, from the
 * spec's modifiers, its gear's (`setup.modifiers`, meta gems) and its active set bonuses' (the
 * same list the Simulation folds before any self aura), with the engine's rule: matching
 * modifiers summed, kept when positive and finite, floored. Self auras carrying the modifier
 * (none in the data) are not seen: the priority is built before the fight. Only non-zero entries;
 * `{}` for every spec without such a modifier.
 */
export function dotExtraTicksForSpec(spec: Pick<SpecData, 'modifiers' | 'setup' | 'sets'>): Record<string, number> {
  const modifiers: SpellModifier[] = [
    ...spec.modifiers,
    ...spec.setup.modifiers,
    ...activeSetBonuses(spec.sets, spec.setup.setPieces).flatMap((b) => b.modifiers ?? []),
  ];
  const out: Record<string, number> = {};
  for (const spell of DOT_SPELLS) {
    let sum = 0;
    for (const m of modifiers) {
      if ((m.spellIds === undefined || m.spellIds.includes(spell.id)) && (m.schools === undefined || m.schools.includes(spell.school))) {
        sum += m.dotExtraTicks ?? 0;
      }
    }
    const ticks = Number.isFinite(sum) && sum > 0 ? Math.floor(sum) : 0;
    if (ticks > 0) out[spell.id] = ticks;
  }
  return out;
}

/**
 * The DoT's duration with `extraTicks` more ticks, by the engine's rule (+ extra x tick interval;
 * a non-positive or non-finite count adds nothing, a fraction is floored).
 */
function dotDurationMs(auraId: string, extraTicks: number): number {
  const a = auraDef(auraId);
  const n = Number.isFinite(extraTicks) && extraTicks > 0 ? Math.floor(extraTicks) : 0;
  return n > 0 && a.tick ? a.durationMs + n * a.tick.intervalMs : a.durationMs;
}


const remainingFightMs = (s: SimSnapshot) => s.durationMs - s.nowMs;
const targetAuraMs = (s: SimSnapshot, id: string) => s.targetAuras[id]?.remainingMs ?? 0;

/**
 * tbc-new ui/specs/warlock/dps/apls/destruction.apl.json "Should Cast Immolate": refresh when
 * the DoT's remaining time <= the spell's cast time and the fight lasts at least cast time +
 * DoT duration longer (`durationMs`: with Voidheart 4pc the extended one). Reused for Corruption (UNVERIFIED: the tbc-new APL does not cast it).
 * Not while that spell is already being cast, nor while it is in flight (Part A: a missile
 * spell applies its DoT at impact): the snapshot does not show the DoT until the spell lands,
 * and a press then (or during the cast, with the spell queue window) would start a second,
 * clipping cast. wowsims evaluates its APL only when the player is free, so it never meets the
 * cast case. The real Immolate and Corruption have no missile (spells.ts), so the in-flight
 * guard only matters for a DoT that flies (tested with a hypothetical missile Immolate).
 * Independent of the distance: the in-flight list already reflects it.
 */
function dotRefreshDue(spellId: string, auraId: string, durationMs: number, talents: RotationTalents) {
  const castMs = talentCastTimeMs(spellId, talents);
  return (s: SimSnapshot) =>
    s.cast?.spellId !== spellId &&
    !s.inFlight.some((f) => f.spellId === spellId) &&
    targetAuraMs(s, auraId) <= castMs &&
    remainingFightMs(s) >= castMs + durationMs;
}

/**
 * APL "Should Cast Shadow Burn": remaining fight time <= spellCastTime(Shadow Bolt) +
 * spellTravelTime(Shadow Bolt): a bolt started later would land after the end. Unhasted cast
 * time after the talents (the author's: 2500, see talentCastTimeMs; no Bane: 3000) + the flight at
 * `distanceYd` (1400 ms at the default 28 yd, 0 at 0 yd or for a negative or non-finite distance,
 * see projectileTravelMs).
 */
export function shadowburnFinisherWindowMs(distanceYd: number, talents: RotationTalents = AUTHOR_TALENTS): number {
  return talentCastTimeMs('shadow-bolt', talents) + projectileTravelMs(spellDef('shadow-bolt').missileSpeed, distanceYd);
}

/**
 * The basic rotation's setup-derived rules for the script functions (src/script, Part J):
 * `dotRefreshDue(id)` is `dotRefreshDue` above for every DoT spell of the build (Immolate,
 * Corruption, the ticking curses; the DoT's duration with `dotExtraTicks`), `finisherWindow()`
 * is `shadowburnFinisherWindowMs(distanceYd, talents)`, `manaCost(id)` the talents' cost
 * (`talentManaCost`). The same code and numbers as `buildPriority(config, distanceYd,
 * dotExtraTicks, talents)`, so a converted script (src/script/convert.ts) plays its rules exactly.
 * A spell the build lacks (a talent spell without its talent) has none.
 */
export function rotationScriptFacts(
  distanceYd: number,
  dotExtraTicks: DotExtraTicks = {},
  talents: RotationTalents = AUTHOR_TALENTS,
): ScriptRotationFacts {
  const dots = new Map<string, (s: SimSnapshot) => boolean>();
  for (const spell of DOT_SPELLS) {
    if (!spellAvailable(spell.id, talents)) continue;
    const auraId = spell.applyAura!.auraId;
    const extra = Object.hasOwn(dotExtraTicks, spell.id) ? (dotExtraTicks[spell.id] ?? 0) : 0;
    dots.set(spell.id, dotRefreshDue(spell.id, auraId, dotDurationMs(auraId, extra), talents));
  }
  const costs = new Map<string, number>();
  for (const spell of allSpells) if (spellAvailable(spell.id, talents)) costs.set(spell.id, talentManaCost(spell.id, talents));
  return {
    dotRefreshDue: (spellId) => dots.get(spellId),
    finisherWindowMs: shadowburnFinisherWindowMs(distanceYd, talents),
    manaCost: (spellId) => costs.get(spellId),
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const CURSE_STEPS: Record<Exclude<CurseChoice, 'none'>, { spellId: string; auraId: string; label: string; hint: string }> = {
  // APL group "Cast Curse": castWarlockAssignedCurse when the assigned curse is not active.
  // UNVERIFIED (choice): Curse of the Elements as the DoT preset's curse (tbc-new defaults to
  // Recklessness for raids).
  elements: {
    spellId: 'curse-of-the-elements',
    auraId: 'curse-of-the-elements',
    label: 'Curse of the Elements',
    hint: 'Keep Curse of the Elements on the target: +10% fire and shadow damage taken. One curse per target: another curse replaces it.',
  },
  // Same rule: recast when it has run out (24 s, auras.ts).
  agony: {
    spellId: 'curse-of-agony',
    auraId: 'curse-of-agony',
    label: 'Curse of Agony',
    hint: 'Keep Curse of Agony on the target: shadow damage every 2 s for 24 s. One curse per target: another curse replaces it.',
  },
  // Same rule; its 60 s cooldown (spells.ts) rejects a second cast, so no extra condition. Cast at
  // the pull, its one tick lands at exactly 60 s and counts (ruling R6).
  doom: {
    spellId: 'curse-of-doom',
    auraId: 'curse-of-doom',
    label: 'Curse of Doom',
    hint: 'Cast Curse of Doom at the pull: one large shadow hit when it ends after 60 s. One curse per target: another curse replaces it, and a replaced Doom never hits.',
  },
};

/**
 * The priority list for `config` at `distanceYd` from the target. Order: curse, Shadowburn
 * (finisher), Immolate, Corruption, Life Tap, Shadow Bolt; disabled steps are left out. Pure:
 * every call returns new step objects and reads nothing but its arguments and the static data.
 * The order and rules come from tbc-new destruction.apl.json (assigned curse, Shadowburn as a
 * finisher, Immolate, Shadow Bolt, Life Tap when nothing else can be cast) plus Corruption from
 * old wowsims/tbc sim/warlock/rotations.go (`Rotation.Corruption && !CorruptionDot.IsActive()`,
 * before the main spell). Conflagrate is not listed (the bot never casts it): the author's build has
 * no Conflagrate talent; a build with it gets the spell on bar slot 8 for the player (stage 2b).
 * `dotExtraTicks` (per spell id, `dotExtraTicksForSpec` of the fight's spec): the Immolate and
 * Corruption refresh rules count the DoT's extended duration (the fight must outlast cast time +
 * DoT); absent or empty, the list is the one without it, rule for rule.
 * `talents` (stage 2b, `RotationTalents`): the build's cast times, Shadow Bolt cost and talent
 * spells; a step whose spell the build lacks is left out (`rotationWarnings` says which). Absent:
 * the author's build, the stage 1 list rule for rule.
 */
export function buildPriority(
  config: RotationConfig,
  distanceYd: number,
  dotExtraTicks: DotExtraTicks = {},
  talents: RotationTalents = AUTHOR_TALENTS,
): PriorityStep[] {
  return buildSteps(config, distanceYd, dotExtraTicks, talents).filter((s) => spellAvailable(s.spellId, talents));
}

/**
 * Why `buildPriority(config, ..., talents)` leaves steps out: one message per step whose spell the
 * build does not have (e.g. the Shadowburn finisher without the Shadowburn talent), for the UI.
 * Empty when every enabled step can be played. Throws like `buildPriority` on an invalid config.
 */
export function rotationWarnings(config: RotationConfig, talents: RotationTalents = AUTHOR_TALENTS): string[] {
  return buildSteps(config, 0, {}, talents)
    .filter((s) => !spellAvailable(s.spellId, talents))
    .map((s) => `${s.label}: ${spellDef(s.spellId).name} is not available with these talents; the step is skipped.`);
}

/**
 * `buildPriority`'s steps as rotation script rules (src/script, Part J; `convertToScript`), in the
 * same order, each `if` true exactly when the step's `when` is (labels and comments are added by
 * the converter). A step whose spell the build lacks is kept (the script compiler leaves the rule
 * out for that build, as `buildPriority` does, with a warning), so the script follows a later
 * talent change like the basic rotation. Translations:
 * - curse: `!target.aura.<curse>.active`; Curse of Doom also `&& time.remaining >= 60` (its
 *   duration: the long-fight rule);
 * - Shadowburn finisher: `time.remaining <= finisherWindow()` (cast time after the talents +
 *   flight at the fight's distance, in seconds; exact, see Part J);
 * - Immolate / Corruption: `dotRefreshDue(<spell>)` (the refresh rule with the in-cast and in-flight
 *   guards, the talents' cast time and the gear's extra ticks: the same closure);
 * - Life Tap: 'auto' -> `mana < manaCost(shadow-bolt)`, a number -> `mana < <number>`;
 * - Shadow Bolt: no condition.
 * Throws like `buildPriority` on an invalid config.
 */
export function rotationScriptRules(config: RotationConfig): ScriptRule[] {
  const { lifeTapBelowMana } = config;
  if (typeof lifeTapBelowMana === 'number' && !(lifeTapBelowMana >= 0)) {
    throw new RangeError(`lifeTapBelowMana must be 'auto' or a number >= 0, got ${lifeTapBelowMana}`);
  }
  if (config.curse !== 'none' && !Object.hasOwn(CURSE_STEPS, config.curse)) {
    throw new RangeError(`unknown curse '${String(config.curse)}'`);
  }
  const rules: ScriptRule[] = [];
  if (config.curse !== 'none') {
    const { spellId, auraId } = CURSE_STEPS[config.curse];
    const notUp = `!target.aura.${auraId}.active`;
    rules.push({
      action: 'cast',
      id: spellId,
      if: config.curse === 'doom' ? `${notUp} && time.remaining >= ${formatNumber(auraDurationMs(auraId) / 1000)}` : notUp,
    });
  }
  if (config.shadowburnFinisher) rules.push({ action: 'cast', id: 'shadowburn', if: 'time.remaining <= finisherWindow()' });
  if (config.immolate) rules.push({ action: 'cast', id: 'immolate', if: 'dotRefreshDue(immolate)' });
  if (config.corruption) rules.push({ action: 'cast', id: 'corruption', if: 'dotRefreshDue(corruption)' });
  rules.push({
    action: 'cast',
    id: 'life-tap',
    if: lifeTapBelowMana === 'auto' ? 'mana < manaCost(shadow-bolt)' : `mana < ${formatNumber(lifeTapBelowMana)}`,
  });
  rules.push({ action: 'cast', id: 'shadow-bolt' });
  return rules;
}

function buildSteps(config: RotationConfig, distanceYd: number, dotExtraTicks: DotExtraTicks, talents: RotationTalents): PriorityStep[] {
  const { lifeTapBelowMana } = config;
  if (typeof lifeTapBelowMana === 'number' && !(lifeTapBelowMana >= 0)) {
    throw new RangeError(`lifeTapBelowMana must be 'auto' or a number >= 0, got ${lifeTapBelowMana}`);
  }
  if (config.curse !== 'none' && !Object.hasOwn(CURSE_STEPS, config.curse)) {
    throw new RangeError(`unknown curse '${String(config.curse)}'`);
  }
  const steps: PriorityStep[] = [];

  if (config.curse !== 'none') {
    const { spellId, auraId, label, hint } = CURSE_STEPS[config.curse];
    // Curse of Doom deals its one tick when it runs out: a cast that cannot run its full duration
    // before the end of the fight (fights longer than 60 s) would be wasted, so it is only wanted
    // while the fight still lasts as long as the curse (>=: the tick at exactly the end counts, R6).
    const lastsToTheEnd = config.curse === 'doom' ? (s: SimSnapshot) => remainingFightMs(s) >= auraDurationMs(auraId) : () => true;
    steps.push({ spellId, label, hint, when: (s) => s.targetAuras[auraId] === undefined && lastsToTheEnd(s) });
  }

  if (config.shadowburnFinisher) {
    const windowMs = shadowburnFinisherWindowMs(distanceYd, talents);
    steps.push({
      spellId: 'shadowburn',
      label: 'Shadowburn (finisher)',
      hint: 'When a Shadow Bolt started now would land after the end (cast + flight time), finish with instant Shadowburn.',
      when: (s) => remainingFightMs(s) <= windowMs,
    });
  }

  if (config.immolate) {
    steps.push({
      spellId: 'immolate',
      label: 'Immolate',
      hint: 'Refresh Immolate when it has less than its cast time left and the fight outlasts the new DoT.',
      when: dotRefreshDue('immolate', 'immolate', dotDurationMs('immolate', dotExtraTicks.immolate ?? 0), talents),
    });
  }

  if (config.corruption) {
    // UNVERIFIED: wowsims/tbc rotations.go option; tbc-new's Destruction APL does not cast it.
    const durationMs = dotDurationMs('corruption', dotExtraTicks.corruption ?? 0);
    steps.push({
      spellId: 'corruption',
      label: 'Corruption',
      hint: `Keep Corruption ticking while a full ${durationMs / 1000} s DoT still fits in the fight.`,
      when: dotRefreshDue('corruption', 'corruption', durationMs, talents),
    });
  }

  // APL: Life Tap is the last action, cast when nothing else can be (out of mana). A number
  // replaces Shadow Bolt's cost as the threshold.
  if (lifeTapBelowMana === 'auto') {
    const shadowBoltCost = talentManaCost('shadow-bolt', talents);
    steps.push({
      spellId: 'life-tap',
      label: 'Life Tap',
      hint: 'Out of mana for Shadow Bolt: Life Tap converts health into mana.',
      when: (s) => s.mana < shadowBoltCost,
    });
  } else {
    steps.push({
      spellId: 'life-tap',
      label: 'Life Tap',
      hint: `Below ${lifeTapBelowMana} mana: Life Tap converts health into mana.`,
      when: (s) => s.mana < lifeTapBelowMana,
    });
  }

  steps.push({
    spellId: 'shadow-bolt',
    label: 'Shadow Bolt',
    hint: 'Filler: cast Shadow Bolt; its crits apply Improved Shadow Bolt (+20% shadow damage).',
  });
  return steps;
}
