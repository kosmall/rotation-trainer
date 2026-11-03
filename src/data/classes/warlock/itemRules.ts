import type { SimSnapshot } from '../../../engine/types';
import type { PriorityStep } from '../../types';
import { compileItemUse, compileItemUseRule, DEFAULT_ITEM_USE, defaultItemUseRule, type ItemUseAction } from './itemUse';

// The priority steps of the item actions (item actions and fight settings, Task 2): `applySetup`
// puts them at the START of the priority, before the rotation, since items are off the GCD. They
// are guidance for the bot and the "Priority" panel, reasonable rather than optimal (see
// docs/data-sources.md, "Part D: item actions"). Sources of the mana thresholds: old wowsims/tbc
// @ 3301fca sim/core/consumes.go ShouldActivate of Super Mana Potion ("MaxMana - (CurrentMana +
// 5 s of regen) < 3000: do not use") and Dark Rune ("< 1500"); the trainer leaves out the 5 s of
// regen (a simpler rule the player can follow).

/** Missing mana at which Super Mana Potion (1800-3000 mana) is wanted: its maximum gain. */
export const SUPER_MANA_POTION_MISSING_MANA = 3000;
/** Missing mana at which Dark Rune (900-1500 mana) is wanted: its maximum gain. */
export const DARK_RUNE_MISSING_MANA = 1500;

/**
 * When Heroism ends in the next fight (ms of fight time), or null when the setup has no Heroism
 * that comes up during the fight (disabled, or starting at or after the fight's end).
 */
type HeroismEndMs = number | null;

/** What an item action is, for the item-use rules (itemUse.ts `ItemUseAction` without its ids and label). */
export type ItemRuleUse = Omit<ItemUseAction, 'id' | 'spellId' | 'label'>;

/**
 * How the bot and the "Priority" panel use one item action by default. `use` describes the action
 * for the configurable rules (itemUse.ts); `hint` and `wanted` are its default rule
 * (`DEFAULT_ITEM_USE`), compiled by `compileItemUse` (the item queue gate excluded from `wanted`).
 */
export interface ItemRule {
  label: string;
  use: ItemRuleUse;
  hint(heroismEndMs: HeroismEndMs): string;
  wanted(heroismEndMs: HeroismEndMs): (s: SimSnapshot) => boolean;
}

function ruleOf(label: string, use: ItemRuleUse): ItemRule {
  const compiled = (heroismEndMs: HeroismEndMs) => {
    const action: ItemUseAction = { id: label, spellId: label, label, ...use };
    return compileItemUseRule(action, defaultItemUseRule(action, heroismEndMs), { heroismEndMs })!;
  };
  return {
    label,
    use,
    hint: (heroismEndMs) => compiled(heroismEndMs).hint,
    wanted: (heroismEndMs) => compiled(heroismEndMs).wanted,
  };
}

/**
 * A burst item: with Heroism when the fight has it (both stack), then again whenever it is ready
 * once Heroism is over (a long fight has room for more uses: 120 s cooldowns); without Heroism at
 * the pull and whenever it is ready (`DEFAULT_ITEM_USE`: `with-heroism`, or `ready`).
 */
export function burstRule(label: string, effect: string, cooldown: string, cooldownMs = 0): ItemRule {
  return ruleOf(label, { kind: 'burst', effect, cooldown, cooldownMs });
}

/** A mana item: wanted when its largest gain is missing (`DEFAULT_ITEM_USE`: `mana-missing`). */
function manaRule(label: string, effect: string, cooldown: string, cooldownMs: number, maxManaGain: number): ItemRule {
  return ruleOf(label, { kind: 'mana', effect, cooldown, cooldownMs, maxManaGain });
}

/**
 * The rule of every item action of the static catalog, by action id. The gear's on-use items are
 * derived with the gear (src/setup/gearEffects.ts `gearItemRules`: `burstRule` each) and passed to
 * `buildItemSteps` as `gearRules`. Cooldowns: src/data/common/buffs.ts (120 s each).
 */
export const ITEM_RULES: Readonly<Record<string, Readonly<ItemRule>>> = Object.freeze({
  'use-destruction-potion': burstRule(
    'Destruction Potion',
    '+120 spell power and +2% crit for 15 s',
    'Shares the 2 min potion cooldown with Super Mana Potion.',
    120000,
  ),
  'use-super-mana-potion': manaRule(
    'Super Mana Potion',
    'restores 1800 to 3000 mana',
    'Shares the 2 min potion cooldown with Destruction Potion.',
    120000,
    SUPER_MANA_POTION_MISSING_MANA,
  ),
  'use-dark-rune': manaRule('Dark Rune', 'restores 900 to 1500 mana', '2 min cooldown of its own.', 120000, DARK_RUNE_MISSING_MANA),
});

/** The rule of an action id: the static catalog's, else the gear's; undefined without one. */
export function itemRuleOf(spellId: string, gearRules: Readonly<Record<string, Readonly<ItemRule>>> = {}): Readonly<ItemRule> | undefined {
  return Object.hasOwn(ITEM_RULES, spellId) ? ITEM_RULES[spellId] : Object.hasOwn(gearRules, spellId) ? gearRules[spellId] : undefined;
}

/** The item-use action of an action id with its rule (`id`: the catalog entry id, the itemUse key). */
export function itemUseActionOf(id: string, spellId: string, rule: Readonly<ItemRule>): ItemUseAction {
  return { id, spellId, label: rule.label, ...rule.use };
}

/**
 * The priority steps for the enabled (auto-used) item actions under the DEFAULT rules, in the given order
 * (`applySetup` compiles the setup's own rules with `compileItemUse`); ids without a rule (in
 * `ITEM_RULES` or `gearRules`) are left out. A thin wrapper:
 * `compileItemUse(actions, { itemUse: DEFAULT_ITEM_USE(actions, heroismEndMs) }, { heroismEndMs })`.
 * Pure: new step objects on every call.
 * - Destruction Potion and the gear's on-use items (`gearRules`, the burst rule): with `heroismEndMs` (the fight has
 *   Heroism; `applySetup` passes null when it is disabled or starts at or after the fight's end),
 *   while Heroism is up (`selfAuras.heroism`) or once it is over (`nowMs >= heroismEndMs`): used
 *   with Heroism, then whenever the cooldown allows. Without it always (at the pull, then
 *   whenever the cooldown allows).
 * - Super Mana Potion: when max mana - mana >= 3000; Dark Rune: when >= 1500.
 * Every rule also waits until the press cannot replace a queued spell (itemUse.ts `itemPressFree`:
 * no cast, nothing queued, or itself queued). A press the engine rejects (cooldown, busy) falls
 * through to the rotation, as for any step.
 */
export function buildItemSteps(
  enabledActionIds: readonly string[],
  heroismEndMs: number | null,
  gearRules: Readonly<Record<string, Readonly<ItemRule>>> = {},
): PriorityStep[] {
  const actions: ItemUseAction[] = [];
  for (const spellId of enabledActionIds) {
    const rule = itemRuleOf(spellId, gearRules);
    if (rule !== undefined) actions.push(itemUseActionOf(spellId, spellId, rule));
  }
  return compileItemUse(actions, { itemUse: DEFAULT_ITEM_USE(actions, heroismEndMs) }, { heroismEndMs });
}
