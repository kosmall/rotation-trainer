import type { SimSnapshot } from '../../../engine/types';
import type { PriorityStep } from '../../types';

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
 * An item press never takes a spell's place in the spell queue: during a cast with a spell already
 * queued, a valid item press would replace it (one queue slot, Task 1 Decision 1) and the next
 * spell would start late. So an item is wanted only when no cast is in progress (it is used at
 * once, even during the GCD, and a spell queued for the GCD's end keeps its slot), when nothing is
 * queued yet (it takes the queue and fires at the cast's end), or when it is the queued spell
 * itself (the bot then stops at its step and keeps the queue as it is).
 */
function itemPressFree(s: SimSnapshot, spellId: string): boolean {
  return s.cast === null || s.queuedSpellId === null || s.queuedSpellId === spellId;
}

const missingMana = (s: SimSnapshot) => s.maxMana - s.mana;
const heroismUp = (s: SimSnapshot) => s.selfAuras['heroism'] !== undefined;

/**
 * When Heroism ends in the next fight (ms of fight time), or null when the setup has no Heroism
 * that comes up during the fight (disabled, or starting at or after the fight's end).
 */
type HeroismEndMs = number | null;

/** How the bot and the "Priority" panel use one item action. */
export interface ItemRule {
  label: string;
  hint(heroismEndMs: HeroismEndMs): string;
  wanted(heroismEndMs: HeroismEndMs): (s: SimSnapshot) => boolean;
}

const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`;

/**
 * A burst item: with Heroism when the fight has it (both stack), then again whenever it is ready
 * once Heroism is over (a long fight has room for more uses: 120 s cooldowns); without Heroism at
 * the pull and whenever it is ready.
 */
export function burstRule(label: string, effect: string, cooldown: string): ItemRule {
  return {
    label,
    hint: (heroismEndMs) =>
      heroismEndMs !== null
        ? `Use it while Heroism is up, then whenever it is ready once Heroism has ended at ${seconds(heroismEndMs)} (off the GCD): ${effect}. ${cooldown}`
        : `Use it at the pull and whenever it is ready (off the GCD): ${effect}. ${cooldown}`,
    wanted: (heroismEndMs) =>
      heroismEndMs !== null ? (s) => heroismUp(s) || s.nowMs >= heroismEndMs : () => true,
  };
}

/**
 * The rule of every item action of the static catalog, by action id. The gear's on-use items are
 * derived with the gear (src/setup/gearEffects.ts `gearItemRules`: `burstRule` each) and passed to
 * `buildItemSteps` as `gearRules`.
 */
export const ITEM_RULES: Readonly<Record<string, Readonly<ItemRule>>> = Object.freeze({
  'use-destruction-potion': burstRule(
    'Destruction Potion',
    '+120 spell power and +2% crit for 15 s',
    'Shares the 2 min potion cooldown with Super Mana Potion.',
  ),
  'use-super-mana-potion': {
    label: 'Super Mana Potion',
    hint: () =>
      `When at least ${SUPER_MANA_POTION_MISSING_MANA} mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.`,
    wanted: () => (s) => missingMana(s) >= SUPER_MANA_POTION_MISSING_MANA,
  },
  'use-dark-rune': {
    label: 'Dark Rune',
    hint: () =>
      `When at least ${DARK_RUNE_MISSING_MANA} mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.`,
    wanted: () => (s) => missingMana(s) >= DARK_RUNE_MISSING_MANA,
  },
});

/**
 * The priority steps for the enabled item actions, in the given order (`applySetup` passes the
 * catalog order, then the gear's); ids without a rule (in `ITEM_RULES` or `gearRules`) are left out. Pure: new step objects on every call.
 * - Destruction Potion and the gear's on-use items (`gearRules`, the burst rule): with `heroismEndMs` (the fight has
 *   Heroism; `applySetup` passes null when it is disabled or starts at or after the fight's end),
 *   while Heroism is up (`selfAuras.heroism`) or once it is over (`nowMs >= heroismEndMs`): used
 *   with Heroism, then whenever the cooldown allows. Without it always (at the pull, then
 *   whenever the cooldown allows).
 * - Super Mana Potion: when max mana - mana >= 3000; Dark Rune: when >= 1500.
 * Every rule also waits until the press cannot replace a queued spell (`itemPressFree`). A press
 * the engine rejects (cooldown, busy) falls through to the rotation, as for any step.
 */
export function buildItemSteps(
  enabledActionIds: readonly string[],
  heroismEndMs: number | null,
  gearRules: Readonly<Record<string, Readonly<ItemRule>>> = {},
): PriorityStep[] {
  const steps: PriorityStep[] = [];
  for (const spellId of enabledActionIds) {
    const rule = Object.hasOwn(ITEM_RULES, spellId) ? ITEM_RULES[spellId] : Object.hasOwn(gearRules, spellId) ? gearRules[spellId] : undefined;
    if (rule === undefined) continue;
    const wanted = rule.wanted(heroismEndMs);
    steps.push({
      spellId,
      label: rule.label,
      hint: rule.hint(heroismEndMs),
      when: (s) => itemPressFree(s, spellId) && wanted(s),
    });
  }
  return steps;
}
