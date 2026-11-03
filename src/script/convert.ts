// "Convert to script" (rotation scripts Task 2, spec §2 A): the basic configurator (rotation fields
// and item-use rules) as an equivalent script. Compiled by `compileScript` against the same setup,
// the script gives the very fights of the basic rotation: the same steps in the same order, each
// `when` true exactly when the basic one is (tests/script/convert-equivalence.test.ts: logs, RNG
// draws and means byte-identical). Pure; the translation of each rule: docs/data-sources.md,
// Part J, "Converter".

import type { ItemUseAction, ItemUseConfig, ItemUseRule } from '../data/classes/warlock/itemUse';
import { defaultItemUseRule, itemUseRuleCondition, itemUseRulesInOrder } from '../data/classes/warlock/itemUse';
import { rotationScriptRules, type RotationConfig } from '../data/classes/warlock/rotation';
import type { PriorityStep } from '../data/types';
import { parseExpr } from './parser';
import { printExpr } from './printer';
import type { Script, ScriptRule } from './types';

/** What the converter reads from the applied setup (`AppliedSetup.basic`, src/setup/applySetup.ts). */
export interface ConvertContext {
  /**
   * The item actions the basic rotation uses automatically (the enabled bound actions with a bot
   * rule, by catalog entry id), in the order `applySetup` passes them to `compileItemUse`.
   */
  readonly itemActions: readonly ItemUseAction[];
  /** The basic priority (`applySetup`'s, whether or not a script is active): labels and hints of the rules. */
  readonly steps: readonly PriorityStep[];
}

/** The canonical form of a condition (`printExpr(parseExpr(text))`). */
function canonical(text: string): string {
  const p = parseExpr(text);
  return p.ok ? printExpr(p.ast) : text;
}

/**
 * The default rule of an action as the script writes it: a burst item's default is `with-heroism`
 * whether or not the fight has Heroism (without one `heroism.over` is always true, so it is the
 * `ready` rule the basic rotation then uses, and the script stays right if Heroism is enabled
 * later); a mana item's is `mana-missing` its largest gain.
 */
const scriptDefaultRule = (a: ItemUseAction): ItemUseRule => defaultItemUseRule(a, 0);

/**
 * The script of the basic configuration: first one `use` rule per automatic item action in step
 * order with its item-use rule as the condition (`itemUseRuleCondition`; `never`: no rule), then
 * the rotation (`rotationScriptRules`: curse, Shadowburn finisher, Immolate, Corruption, Life Tap,
 * Shadow Bolt). Each rule carries the basic step's label and hint (as `comment`), conditions in
 * canonical form. `config.script` itself is ignored: this converts the basic rotation.
 */
export function convertToScript(config: { rotation: RotationConfig & ItemUseConfig }, ctx: ConvertContext): Script {
  const stepOf = (spellId: string) => ctx.steps.find((s) => s.spellId === spellId);
  const withText = (rule: ScriptRule, spellId: string): ScriptRule => {
    const step = stepOf(spellId);
    const out: ScriptRule = { action: rule.action };
    if (rule.id !== undefined) out.id = rule.id;
    if (rule.if !== undefined && rule.if !== '') out.if = canonical(rule.if);
    if (step !== undefined) {
      out.label = step.label;
      out.comment = step.hint;
    }
    return out;
  };
  const rules: ScriptRule[] = [];
  for (const { action, rule } of itemUseRulesInOrder(ctx.itemActions, config.rotation, scriptDefaultRule)) {
    const cond = itemUseRuleCondition(action.id, rule);
    if (cond === null) continue;
    rules.push(withText({ action: 'use', id: action.id, if: cond }, action.spellId));
  }
  for (const r of rotationScriptRules(config.rotation)) rules.push(withText(r, r.id!));
  return { rules };
}
