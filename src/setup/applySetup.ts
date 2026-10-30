// Turns a SetupConfig into the spec and fight settings of the next fight (stage 1.5 Part C,
// design spec §5). Pure: the inputs (the spec returned by `buildSpec`, the catalog, the config)
// are never mutated; every container that changes is a new object. The engine never sees the
// catalog, only auras, modifiers, stats and hooks.

import { neutralizeOwnAuras } from '../data/classes/warlock/buffs';
import { buildItemSteps } from '../data/classes/warlock/itemRules';
import { buildPriority } from '../data/classes/warlock/rotation';
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
import type { AppliedSetup, ApplySetupInput } from './types';

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

/** The catalog id of Heroism / Bloodlust: the item rules wait for it when it is enabled. */
const HEROISM_BUFF_ID = 'heroism';

/**
 * The spec's keybinds as a new array of SPELL_SLOT_COUNT + ITEM_SLOT_COUNT slots: the spell row
 * as the spec has it ('' past its end), then the item actions' ids in order ('' for the rest).
 * More actions than item slots is a catalog error (the catalog has 4: tests/data/item-actions).
 */
function withItemRow(specKeybinds: readonly string[], actionIds: readonly string[]): string[] {
  if (actionIds.length > ITEM_SLOT_COUNT) {
    throw new RangeError(`${actionIds.length} item actions enabled, the item row has ${ITEM_SLOT_COUNT} slots`);
  }
  return Array.from({ length: SPELL_SLOT_COUNT + ITEM_SLOT_COUNT }, (_, i) =>
    i < SPELL_SLOT_COUNT ? (specKeybinds[i] ?? '') : (actionIds[i - SPELL_SLOT_COUNT] ?? ''),
  );
}

/**
 * The spec and the `SimConfig` fields for `config`:
 * - `spec` = `buildSpec(config.warlock)`, then for each enabled buff in CATALOG order (unknown
 *   enabled ids are ignored):
 *   - `statBonuses` summed into the spec's flat bonuses (added before any multiplier);
 *   - `statMultipliers` multiplied into a new `setup.statMultipliers` (the setup is a new shallow
 *     copy; the gear stats inside stay shared and untouched);
 *   - `modifiers` appended;
 *   - `targetAura`, `selfAura` and helper `auras` appended to a new `auras` array;
 *   - an item `action` appended to a new `spells` array and bound to the next free slot of the
 *     item row (keybinds SPELL_SLOT_COUNT.., keys Z X C V); its `selfAura` is what it applies,
 *     never scheduled;
 *   - `hooks` run after the spec's own (`composeHooks`); with no buff hook the spec's hooks
 *     object is kept.
 * - The spec's own auras that a raid debuff replaces (`neutralizeOwnAuras`: own Curse of the
 *   Elements under the raid one, own Shadow Vulnerability under `isb-from-others`) multiply by 1,
 *   so one x1.1 / one x1.2 applies (rulings S1, S2).
 * - `scheduledAuras`: each `targetAura` on the target at 0 with no duration override (its own
 *   1 h duration; the end of the fight cuts it, ruling S3); each timed `selfAura` on the player at
 *   `startSec` for `durationSec` (from `config.timed`, else the catalog default), in ms; a
 *   `selfAura` without `timed` or `action` at 0 with its own duration. A start after the fight's
 *   end is kept: the engine ignores it.
 * - `spec.keybinds`: always a new array of SPELL_SLOT_COUNT + ITEM_SLOT_COUNT slots (`withItemRow`;
 *   the item row is '' when no item is enabled). The shared spec keeps its 12.
 * - `spec.priority = [...buildItemSteps(enabled action ids, Heroism enabled),
 *   ...buildPriority(config.rotation, config.distanceYd)]` (no item: the rotation alone);
 *   `distanceFromTarget = config.distanceYd`.
 * Expects a normalized config (`normalizeSetup`): buildPriority throws on an invalid Life Tap
 * threshold.
 */
export function applySetup({ buildSpec, catalog, config }: ApplySetupInput): AppliedSetup {
  const base = buildSpec(config.warlock);
  const enabledIds = new Set(config.enabledBuffs);
  const enabled = catalog.filter((b) => enabledIds.has(b.id));

  const statBonuses: Partial<RawStats> = { ...base.statBonuses };
  const multipliers: StatMultipliers[] = [];
  const modifiers: SpellModifier[] = [...base.modifiers];
  const extraAuras: AuraDef[] = [];
  const buffHooks: SpecHooks[] = [];
  const scheduledAuras: ScheduledAura[] = [];
  const actions: SpellDef[] = [];

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
    if (e.action) actions.push(e.action);
    if (e.selfAura) {
      extraAuras.push(e.selfAura);
      if (e.action) {
        // An item's aura is applied when the item is used (its action), never scheduled.
      } else if (b.timed) {
        const t = config.timed[b.id] ?? { startSec: b.timed.defaultStartSec, durationSec: b.timed.durationSec };
        scheduledAuras.push({
          auraId: e.selfAura.id,
          on: 'self',
          atMs: Math.round(t.startSec * 1000),
          durationMs: Math.round(t.durationSec * 1000),
        });
      } else {
        scheduledAuras.push({ auraId: e.selfAura.id, on: 'self', atMs: 0 });
      }
    }
    if (e.auras) extraAuras.push(...e.auras);
    if (e.hooks) buffHooks.push(e.hooks);
  }

  // Always a new object: the spec's multipliers are shared by every build.
  const statMultipliers =
    base.setup.statMultipliers !== undefined || multipliers.length > 0
      ? combineStatMultipliers(base.setup.statMultipliers, ...multipliers)
      : undefined;

  const actionIds = actions.map((a) => a.id);
  const heroismEnabled = enabled.some((b) => b.id === HEROISM_BUFF_ID);

  return {
    spec: {
      ...base,
      spells: [...base.spells, ...actions],
      auras: [...neutralizeOwnAuras(base.auras, enabled.map((b) => b.id)), ...extraAuras],
      modifiers,
      statBonuses,
      setup: { ...base.setup, ...(statMultipliers !== undefined && { statMultipliers }) },
      keybinds: withItemRow(base.keybinds, actionIds),
      priority: [...buildItemSteps(actionIds, heroismEnabled), ...buildPriority(config.rotation, config.distanceYd)],
      hooks: buffHooks.length > 0 ? composeHooks(base.hooks, ...buffHooks) : base.hooks,
    },
    sim: { scheduledAuras, distanceFromTarget: config.distanceYd },
  };
}
