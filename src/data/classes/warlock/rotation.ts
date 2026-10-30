import { activeSetBonuses } from '../../../engine/sets';
import { projectileTravelMs } from '../../../engine/travel';
import type { SimSnapshot, SpellModifier } from '../../../engine/types';
import type { PriorityStep, SpecData } from '../../types';
import { warlockAuras } from './auras';
import { warlockSpells } from './spells';
import { talentModifiers, talentRank } from './talents';

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
  const s = warlockSpells.find((x) => x.id === id);
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
function talentCastTimeMs(id: string): number {
  const s = spellDef(id);
  let ms = s.castTimeMs;
  for (const m of talentModifiers) {
    if ((m.spellIds === undefined || m.spellIds.includes(id)) && (m.schools === undefined || m.schools.includes(s.school))) {
      ms += m.castTimeMsDelta ?? 0;
    }
  }
  return ms;
}

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
const DOT_SPELLS = warlockSpells.filter((s) => s.applyAura?.on === 'target' && auraDef(s.applyAura.auraId).tick);

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

const SHADOW_BOLT_CAST_MS = talentCastTimeMs('shadow-bolt'); // 2500
/** Shadow Bolt's cost after Cataclysm: below it the filler cannot be cast. */
const SHADOW_BOLT_COST = spellDef('shadow-bolt').manaCost * (1 - 0.01 * talentRank('cataclysm')); // 399

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
function dotRefreshDue(spellId: string, auraId: string, durationMs: number) {
  const castMs = talentCastTimeMs(spellId);
  return (s: SimSnapshot) =>
    s.cast?.spellId !== spellId &&
    !s.inFlight.some((f) => f.spellId === spellId) &&
    targetAuraMs(s, auraId) <= castMs &&
    remainingFightMs(s) >= castMs + durationMs;
}

/**
 * APL "Should Cast Shadow Burn": remaining fight time <= spellCastTime(Shadow Bolt) +
 * spellTravelTime(Shadow Bolt): a bolt started later would land after the end. Unhasted cast
 * time 2500 (see talentCastTimeMs) + the flight at `distanceYd` (1400 ms at the default 28 yd,
 * 0 at 0 yd or for a negative or non-finite distance, see projectileTravelMs).
 */
export function shadowburnFinisherWindowMs(distanceYd: number): number {
  return SHADOW_BOLT_CAST_MS + projectileTravelMs(spellDef('shadow-bolt').missileSpeed, distanceYd);
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
 * before the main spell). Conflagrate is not listed: the author's build has no Conflagrate talent.
 * `dotExtraTicks` (per spell id, `dotExtraTicksForSpec` of the fight's spec): the Immolate and
 * Corruption refresh rules count the DoT's extended duration (the fight must outlast cast time +
 * DoT); absent or empty, the list is the one without it, rule for rule.
 */
export function buildPriority(config: RotationConfig, distanceYd: number, dotExtraTicks: DotExtraTicks = {}): PriorityStep[] {
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
    const windowMs = shadowburnFinisherWindowMs(distanceYd);
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
      when: dotRefreshDue('immolate', 'immolate', dotDurationMs('immolate', dotExtraTicks.immolate ?? 0)),
    });
  }

  if (config.corruption) {
    // UNVERIFIED: wowsims/tbc rotations.go option; tbc-new's Destruction APL does not cast it.
    const durationMs = dotDurationMs('corruption', dotExtraTicks.corruption ?? 0);
    steps.push({
      spellId: 'corruption',
      label: 'Corruption',
      hint: `Keep Corruption ticking while a full ${durationMs / 1000} s DoT still fits in the fight.`,
      when: dotRefreshDue('corruption', 'corruption', durationMs),
    });
  }

  // APL: Life Tap is the last action, cast when nothing else can be (out of mana). A number
  // replaces Shadow Bolt's cost as the threshold.
  if (lifeTapBelowMana === 'auto') {
    steps.push({
      spellId: 'life-tap',
      label: 'Life Tap',
      hint: 'Out of mana for Shadow Bolt: Life Tap converts health into mana.',
      when: (s) => s.mana < SHADOW_BOLT_COST,
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
