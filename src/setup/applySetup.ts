// Turns a SetupConfig into the spec and fight settings of the next fight (stage 1.5 Part C,
// design spec §5). Pure: the inputs (the spec returned by `buildSpec`, the catalog, the config)
// are never mutated; every container that changes is a new object. The engine never sees the
// catalog, only auras, modifiers, stats and hooks.

import { neutralizeOwnAuras } from '../data/classes/warlock/buffs';
import { rotationTalentsFor } from '../data/classes/warlock/destruction';
import { itemRuleOf, itemUseActionOf } from '../data/classes/warlock/itemRules';
import { compileItemUse, type ItemUseAction } from '../data/classes/warlock/itemUse';
import { buildPriority, dotExtraTicksForSpec, rotationScriptFacts } from '../data/classes/warlock/rotation';
import { ITEM_SLOT_COUNT, SPELL_SLOT_COUNT } from '../data/types';
import type {
  AuraDef,
  RawStats,
  ScheduledAura,
  SpecHooks,
  SpellDef,
  SpellModifier,
  StatMultipliers,
} from '../engine/types';
import { combineStatMultipliers } from '../engine/stats';
import { compileScript } from '../script/compile';
import { scriptIsActive } from '../script/normalize';
import { scriptContextOf } from '../script/vars';
import { enabledSetupEntries, gearItemRules } from './gearEffects';
import type { AppliedScript, AppliedSetup, ApplySetupInput } from './types';

/**
 * One `SpecHooks` that runs the given hooks' `onSpellResolved` in order (each called as a method
 * of its own object). Hooks without `onSpellResolved` are skipped; a single remaining hook is
 * returned as is, none gives `{}`.
 */
export function composeHooks(...hooks: readonly SpecHooks[]): SpecHooks {
  const active = hooks.filter((h) => h.onSpellResolved !== undefined);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0]!;
  return {
    onSpellResolved(e, api) {
      for (const h of active) h.onSpellResolved!(e, api);
    },
  };
}

/** The catalog id of Heroism / Bloodlust: the item rules wait for it when the fight has it. */
const HEROISM_BUFF_ID = 'heroism';

/**
 * The spec's keybinds as a new array of SPELL_SLOT_COUNT + ITEM_SLOT_COUNT slots: the spell row
 * as the spec has it ('' past its end), then the bound item actions' ids in order ('' for the rest).
 */
function withItemRow(specKeybinds: readonly string[], actionIds: readonly string[]): string[] {
  return Array.from({ length: SPELL_SLOT_COUNT + ITEM_SLOT_COUNT }, (_, i) =>
    i < SPELL_SLOT_COUNT ? (specKeybinds[i] ?? '') : (actionIds[i - SPELL_SLOT_COUNT] ?? ''),
  );
}

/**
 * The spec, the `SimConfig` fields, the script context and the basic rotation for `config`:
 * - `spec` = `buildSpec(config.warlock, config.gear, config.talents)` (no gear: the author's; no
 *   talents: the author's build), then for each
 *   applied entry of `enabledSetupEntries(catalog, config, db)` (the enabled gear-independent
 *   catalog entries in catalog order, then the worn gear's derived item effects that are enabled,
 *   plus every worn on-use effect whether enabled or not; unknown enabled ids and ids of items not
 *   worn are ignored; item actions past the 6th of the item row are left out):
 *   - `statBonuses` summed into the spec's flat bonuses (added before any multiplier);
 *   - `statMultipliers` multiplied into a new `setup.statMultipliers` (the setup is a new shallow
 *     copy; the gear stats inside stay shared and untouched);
 *   - `modifiers` appended;
 *   - `targetAura`, `selfAura` and helper `auras` appended to a new `auras` array (a self or helper
 *     aura id already added is not added again: gear items sharing a buff);
 *   - an item `action` appended to a new `spells` array and bound to the item row (keybinds
 *     SPELL_SLOT_COUNT.., keys Z X C V B N) in item row order (`itemRowOf`: the worn on-use
 *     effects, trinket 1 and 2 first, then the enabled potions and rune); its `selfAura` is what
 *     it applies, never scheduled;
 *   - `hooks` run after the spec's own (`composeHooks`); with no buff hook the spec's hooks
 *     object is kept.
 * - The spec's own auras that a raid debuff replaces (`neutralizeOwnAuras`: own Curse of the
 *   Elements under the raid one, own Shadow Vulnerability under `isb-from-others`) multiply by 1,
 *   so one x1.1 / one x1.2 applies (rulings S1, S2); an own aura stronger than the raid one (the
 *   own curse with Malediction, stage 2b) keeps only its excess (own / raid), so the stronger applies.
 * - `scheduledAuras`: each `targetAura` on the target at 0 with no duration override (its own
 *   1 h duration; the end of the fight cuts it, ruling S3); each timed `selfAura` on the player at
 *   `startSec` for `durationSec` (from `config.timed`, else the catalog default), in ms; a
 *   `selfAura` without `timed` or `action` at 0 with its own duration. A start after the fight's
 *   end is kept: the engine ignores it.
 * - `spec.keybinds`: always a new array of SPELL_SLOT_COUNT + ITEM_SLOT_COUNT slots (`withItemRow`;
 *   the item row is '' when no item is bound: no on-use gear and no enabled potion or rune). The shared spec keeps its 12.
 * - `spec.priority = [...compileItemUse(the bound item actions of ENABLED entries (`enabledBuffs`
 *   on an on-use gear effect means "use it automatically"; unticked, it is only on the item row
 *   for the player) that have a bot rule (itemRules.ts
 *   `ITEM_RULES`, or `gearItemRules(the gear's entries)`), keyed by their entry ids,
 *   config.rotation (its `itemUse` / `itemUseOrder`; absent: the default rules, the same steps
 *   as `buildItemSteps`), { heroismEndMs: Heroism's end in ms or null, auraNames }),
 *   ...buildPriority(config.rotation, config.distanceYd, dotExtraTicks, rotationTalentsFor(config.talents))]`
 *   (no item: the rotation alone). The talents decide the rule numbers (cast times for the DoT
 *   refresh and the Shadowburn finisher windows, Shadow Bolt's cost for Life Tap 'auto') and drop
 *   the steps whose spell the build lacks; the author's build gives the stage 1 list. Rules of entries that are not bound actions are ignored (and kept in the config).
 *   `dotExtraTicks = dotExtraTicksForSpec(spec)` (the built spec, buffs included: e.g. Voidheart
 *   4pc gives `{ corruption: 1, immolate: 1 }`, so the DoT refresh rules count the longer DoTs;
 *   `{}` otherwise, the list unchanged). Heroism's end is its scheduled start + duration; null
 *   when Heroism is disabled or starts at or after the fight's end (it never comes up, so the
 *   item rules treat it as not enabled);
 *   `distanceFromTarget = config.distanceYd`; `durationMs = config.fightDurationSec x 1000`.
 * - Rotation scripts (Task 2): `script.context` is the fight's `ScriptContext` (the spec's spells
 *   and visible auras, every bound item action by entry id with its rule's cooldown, Heroism's end,
 *   `rotationScriptFacts(config.distanceYd, dotExtraTicks, talents)`, names). With a script of at
 *   least one rule (`config.script`, `scriptIsActive`), `spec.priority` is
 *   `compileScript(config.script, context).steps` instead of the basic list above, and `script`
 *   carries its keys, warnings and errors; the basic rotation is still built (`basic`: the
 *   automatic item actions and the basic steps, what `convertToScript` reads) but not played.
 * Expects a normalized config (`normalizeSetup`): buildPriority throws on an invalid Life Tap
 * threshold.
 */
export function applySetup({ buildSpec, catalog, config, db }: ApplySetupInput): AppliedSetup {
  const base = buildSpec(config.warlock, config.gear, config.talents);
  const { enabled, gearEntries, itemRow, autoIds } = enabledSetupEntries(catalog, config, db);

  const statBonuses: Partial<RawStats> = { ...base.statBonuses };
  const multipliers: StatMultipliers[] = [];
  const modifiers: SpellModifier[] = [...base.modifiers];
  const extraAuras: AuraDef[] = [];
  const buffHooks: SpecHooks[] = [];
  const scheduledAuras: ScheduledAura[] = [];
  const actions: SpellDef[] = [];
  /** The catalog entry id of each action (the `itemUse` key), in `actions` order. */
  const actionEntryIds: string[] = [];
  const durationMs = Math.round(config.fightDurationSec * 1000);
  /**
   * Adds a self or helper aura once per id: two gear items with the same buff share one aura
   * (`deriveGearEffects`), so the second def is the same aura and is not added again.
   */
  const addAura = (a: AuraDef) => {
    if (!extraAuras.some((x) => x.id === a.id)) extraAuras.push(a);
  };
  /** When Heroism is scheduled (start and end, ms), if enabled. */
  let heroism: { atMs: number; endMs: number } | undefined;

  for (const b of enabled) {
    const e = b.effect;
    for (const [key, value] of Object.entries(e.statBonuses ?? {}) as [keyof RawStats, number][]) {
      statBonuses[key] = (statBonuses[key] ?? 0) + value;
    }
    if (e.statMultipliers) multipliers.push(e.statMultipliers);
    if (e.modifiers) modifiers.push(...e.modifiers);
    if (e.targetAura) {
      extraAuras.push(e.targetAura);
      scheduledAuras.push({ auraId: e.targetAura.id, on: 'target', atMs: 0 });
    }
    if (e.action) {
      actions.push(e.action);
      actionEntryIds.push(b.id);
    }
    if (e.selfAura) {
      addAura(e.selfAura);
      if (e.action) {
        // An item's aura is applied when the item is used (its action), never scheduled.
      } else if (b.timed) {
        const t = config.timed[b.id] ?? { startSec: b.timed.defaultStartSec, durationSec: b.timed.durationSec };
        const atMs = Math.round(t.startSec * 1000);
        const lastsMs = Math.round(t.durationSec * 1000);
        scheduledAuras.push({ auraId: e.selfAura.id, on: 'self', atMs, durationMs: lastsMs });
        if (b.id === HEROISM_BUFF_ID) heroism = { atMs, endMs: atMs + lastsMs };
      } else if (!scheduledAuras.some((x) => x.on === 'self' && x.auraId === e.selfAura!.id)) {
        scheduledAuras.push({ auraId: e.selfAura.id, on: 'self', atMs: 0 });
      }
    }
    if (e.auras) for (const a of e.auras) addAura(a);
    if (e.hooks) buffHooks.push(e.hooks);
  }

  // Always a new object: the spec's multipliers are shared by every build.
  const statMultipliers =
    base.setup.statMultipliers !== undefined || multipliers.length > 0
      ? combineStatMultipliers(base.setup.statMultipliers, ...multipliers)
      : undefined;

  // The item row: the worn on-use effects first (always bound), then the enabled potions and rune.
  const actionIds = itemRow.map((b) => b.effect.action!.id);
  // Heroism that never comes up in this fight (starts at or after its end: the engine ignores it)
  // counts as not enabled for the item rules, so the Icon and the potion do not wait forever.
  const heroismEndMs = heroism !== undefined && heroism.atMs < durationMs ? heroism.endMs : null;
  // The DoT refresh rules must know a DoT the gear extends (Voidheart 4pc): the extra ticks of the
  // spec as the Simulation will fold them (its modifiers, the buffs', the gear's, the active sets').
  const dotExtraTicks = dotExtraTicksForSpec({ modifiers, setup: base.setup, sets: base.sets });
  // The item steps: each bound action of an ENABLED entry ("use automatically": a worn on-use
  // effect is bound whether enabled or not, the bot uses it only when enabled) with a bot rule (the
  // static catalog's or the gear's burst rule), in fold order, under the config's item-use rules
  // (absent: the defaults, the steps of before).
  const gearRules = gearItemRules(gearEntries);
  const itemActions: ItemUseAction[] = actions.flatMap((a, i) => {
    if (!autoIds.has(actionEntryIds[i]!)) return [];
    const rule = itemRuleOf(a.id, gearRules);
    return rule === undefined ? [] : [itemUseActionOf(actionEntryIds[i]!, a.id, rule)];
  });
  // The raid debuffs' multipliers: an own aura stronger than the raid one (Malediction) keeps the excess.
  const raidMults: Record<string, number> = {};
  for (const b of enabled) {
    const m = b.effect.targetAura?.damageTakenMult?.mult;
    if (m !== undefined) raidMults[b.id] = m;
  }
  const auras = [...neutralizeOwnAuras(base.auras, enabled.map((b) => b.id), raidMults), ...extraAuras];
  const auraNames: Record<string, string> = {};
  for (const a of auras) if (!Object.hasOwn(auraNames, a.id)) auraNames[a.id] = a.name;
  const itemSteps = compileItemUse(itemActions, config.rotation, { heroismEndMs, auraNames });
  const talents = rotationTalentsFor(config.talents);
  const basicSteps = [...itemSteps, ...buildPriority(config.rotation, config.distanceYd, dotExtraTicks, talents)];

  // The script context: every bound item action (ruling T-1: a script may use a worn on-use item
  // that is not enabled) by its catalog entry id, with the cooldown its item-use rule counts.
  const spells = [...base.spells, ...actions];
  const names: Record<string, string> = {};
  const scriptItems = actions.map((a, i) => {
    const entryId = actionEntryIds[i]!;
    const entry = enabled.find((b) => b.id === entryId);
    if (entry !== undefined && !Object.hasOwn(names, entryId)) names[entryId] = entry.name;
    const rule = itemRuleOf(a.id, gearRules);
    return { id: entryId, spellId: a.id, cooldownMs: rule !== undefined ? rule.use.cooldownMs : a.cooldownMs };
  });
  const context = scriptContextOf(
    { spells, auras },
    { heroismEndMs, itemActions: scriptItems, rotation: rotationScriptFacts(config.distanceYd, dotExtraTicks, talents), names },
  );
  const script: AppliedScript = { context, active: false, keys: [], warnings: [], errors: [] };
  let priority = basicSteps;
  if (scriptIsActive(config.script)) {
    const compiled = compileScript(config.script, context);
    priority = compiled.steps;
    Object.assign(script, { active: true, keys: compiled.keys, warnings: compiled.warnings, errors: compiled.errors });
  }

  return {
    spec: {
      ...base,
      spells,
      auras,
      modifiers,
      statBonuses,
      setup: { ...base.setup, ...(statMultipliers !== undefined && { statMultipliers }) },
      keybinds: withItemRow(base.keybinds, actionIds),
      priority,
      hooks: buffHooks.length > 0 ? composeHooks(base.hooks, ...buffHooks) : base.hooks,
    },
    sim: { scheduledAuras, distanceFromTarget: config.distanceYd, durationMs },
    script,
    basic: { itemActions, steps: basicSteps },
  };
}
