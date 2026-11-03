// The item-use rules editor (simulator Task 3; spec §2 A; docs/data-sources.md Part H): in the
// Setup panel's Rotation group, one row per enabled (auto-used) item action on the item row (the
// potions, the rune, the worn gear's on-use items ticked "Use automatically"; a worn on-use item
// is on the item row whether ticked or not, but only a ticked one is listed): when the bot uses it (trigger and its parameter), an
// optional time window, the order (up/down) and Reset. Fully controlled: it shows `config` and
// passes every edit to `onChange` (the Setup panel normalizes it with `normalizeSetup`). Like the
// rest of the setup, a rule applies from the next fight; the Priority list and the Simulator use
// it at once. Hotkeys stay with the fight except in the inputs and selects (ruling S5).

import { itemRuleOf, itemUseActionOf } from '../data/classes/warlock/itemRules';
import {
  compileItemUseRule,
  defaultItemUseRule,
  ITEM_USE_LIMITS,
  ITEM_USE_TRIGGER_KINDS,
  normalizeItemUseRule,
  PULL_WINDOW_MS,
  type ItemUseAction,
  type ItemUseRule,
  type ItemUseTrigger,
  type ItemUseTriggerKind,
} from '../data/classes/warlock/itemUse';
import type { RotationConfig } from '../data/classes/warlock/rotation';
import type { BuffDef } from '../data/types';
import { gearItemRules, isGearEffectId, itemRowOf } from '../setup/gearEffects';
import type { SetupConfig } from '../setup/types';
import { ITEM_SLOT_KEYS } from './keys';
import { NumberField } from './NumberField';

/** The catalog id of Heroism / Bloodlust (its end decides the default burst rule). */
const HEROISM_ID = 'heroism';

/** Each trigger's name in the select and its one-line explanation. */
export const TRIGGER_TEXT: Readonly<Record<ItemUseTriggerKind, { name: string; hint: string }>> = Object.freeze({
  ready: { name: 'Whenever ready', hint: 'At the pull, then every time its cooldown is over.' },
  pull: { name: 'At the pull only', hint: `Once, in the first ${PULL_WINDOW_MS / 1000} s of the fight; never again.` },
  at: { name: 'From a second on', hint: 'From that second of the fight on, whenever it is ready.' },
  'with-heroism': {
    name: 'With Heroism',
    hint: 'While Heroism is up, then whenever ready once it has ended. A fight without Heroism: whenever ready.',
  },
  'with-buff': { name: 'While a buff is up', hint: 'Only while the chosen buff of yours is up (Heroism, a potion, another item).' },
  'mana-below': { name: 'Mana below', hint: 'When your mana is below this amount.' },
  'mana-missing': { name: 'Mana missing', hint: 'When at least this much mana is missing from your maximum (no gain wasted).' },
  'fight-end': { name: 'In the last seconds', hint: 'Only in the last seconds of the fight.' },
  never: { name: 'Never (bot)', hint: 'The bot never uses it; it stays on the item row for you to press.' },
});

/** A buff the `with-buff` trigger can wait for: a self aura id and its catalog name. */
export interface BuffChoice {
  id: string;
  name: string;
}

/** One row of the editor. */
export interface ItemUseRow {
  /** The catalog entry id: the `itemUse` key. */
  id: string;
  action: ItemUseAction;
  /** The rule in force: the stored one (normalized), else the default. */
  rule: ItemUseRule;
  /** Whether `config.rotation.itemUse` has a rule for it. */
  stored: boolean;
  /** Its item row key (Z X C V B N). */
  key: string | undefined;
  /** Its own buff's aura id (not offered for its own `with-buff`). */
  ownAuraId: string | undefined;
}

export interface ItemUseModel {
  /** In the bot's order (the stored order first, then the default order). */
  rows: ItemUseRow[];
  /** The entry ids in the default order (catalog order, then the gear's: `applySetup`). */
  defaultOrder: string[];
  heroismEndMs: number | null;
  /** Heroism and the enabled items' visible self auras, each once. */
  buffs: BuffChoice[];
}

/** When Heroism ends in the next fight (ms), or null when it is disabled or starts at or after the end (applySetup's rule). */
function heroismEndMsOf(catalog: readonly BuffDef[], config: SetupConfig): number | null {
  if (!config.enabledBuffs.includes(HEROISM_ID)) return null;
  const b = catalog.find((x) => x.id === HEROISM_ID);
  if (!b?.timed) return null;
  const t = config.timed[HEROISM_ID] ?? { startSec: b.timed.defaultStartSec, durationSec: b.timed.durationSec };
  const atMs = Math.round(t.startSec * 1000);
  if (atMs >= Math.round(config.fightDurationSec * 1000)) return null;
  return atMs + Math.round(t.durationSec * 1000);
}

/**
 * What the editor shows for `config`: the ENABLED (auto-used) item actions that get an item row
 * slot (`itemRowOf`, as `applySetup` binds them: a worn on-use effect is on the row whether
 * enabled or not, but only an enabled one is used by the bot and listed here) and have a bot rule,
 * with the rule in force and its row key, in the bot's order (catalog order: the potions and the
 * rune, then the gear); the default order; Heroism's end; the buffs `with-buff` offers.
 */
export function itemUseModel(catalog: readonly BuffDef[], config: SetupConfig): ItemUseModel {
  const enabled = new Set(config.enabledBuffs);
  const heroismEndMs = heroismEndMsOf(catalog, config);
  const gearRules = gearItemRules(catalog.filter((b) => isGearEffectId(b.id)));
  const row = itemRowOf(catalog, enabled).bound;
  const bound = catalog.filter((b) => b.effect.action && enabled.has(b.id) && row.includes(b));
  const stored = config.rotation.itemUse;
  const byId = new Map<string, ItemUseRow>();
  bound.forEach((b) => {
    const a = b.effect.action!;
    const botRule = itemRuleOf(a.id, gearRules);
    if (botRule === undefined || byId.has(b.id)) return;
    const action = itemUseActionOf(b.id, a.id, botRule);
    const own = stored !== undefined && Object.hasOwn(stored, b.id) ? normalizeItemUseRule(stored[b.id]) : null;
    byId.set(b.id, {
      id: b.id,
      action,
      rule: own ?? defaultItemUseRule(action, heroismEndMs),
      stored: own !== null,
      key: ITEM_SLOT_KEYS[row.indexOf(b)]?.toUpperCase(),
      ownAuraId: b.effect.selfAura?.id,
    });
  });
  const defaultOrder = [...byId.keys()];
  const order: string[] = [];
  for (const id of config.rotation.itemUseOrder ?? []) if (byId.has(id) && !order.includes(id)) order.push(id);
  for (const id of defaultOrder) if (!order.includes(id)) order.push(id);

  const buffs: BuffChoice[] = [];
  for (const b of catalog) {
    const aura = b.effect.selfAura;
    if (!enabled.has(b.id) || aura === undefined || aura.hidden) continue;
    const kind = b.id === HEROISM_ID || b.effect.action !== undefined || isGearEffectId(b.id);
    if (kind && !buffs.some((x) => x.id === aura.id)) buffs.push({ id: aura.id, name: b.name });
  }
  return { rows: order.map((id) => byId.get(id)!), defaultOrder, heroismEndMs, buffs };
}

/** The trigger a row gets when its kind is switched (a parameter carried over or a starting value), or null when it cannot be had. */
function triggerFor(kind: ItemUseTriggerKind, prev: ItemUseTrigger, action: ItemUseAction, buffs: readonly BuffChoice[]): ItemUseTrigger | null {
  switch (kind) {
    case 'ready':
    case 'pull':
    case 'with-heroism':
    case 'never':
      return { kind };
    case 'at':
      return { kind, sec: prev.kind === 'at' ? prev.sec : 30 };
    case 'fight-end':
      return { kind, lastSec: prev.kind === 'fight-end' ? prev.lastSec : 20 };
    case 'mana-below':
      return { kind, mana: prev.kind === 'mana-below' ? prev.mana : 2000 };
    case 'mana-missing':
      return { kind, amount: prev.kind === 'mana-missing' ? prev.amount : (action.maxManaGain ?? 1500) };
    case 'with-buff':
      return buffs[0] === undefined ? null : { kind, auraId: buffs[0].id };
  }
}

export interface ItemUseEditorProps {
  /** The Setup panel's catalog (the worn gear's entries included). */
  catalog: readonly BuffDef[];
  config: SetupConfig;
  /** Receives every edit (the Setup panel normalizes it). */
  onChange(config: SetupConfig): void;
}

/**
 * The item-use rules of the enabled item actions (see the file comment). A rule equal to the
 * default is dropped by `normalizeSetup`; the order is removed when it equals the default order,
 * and "Reset all" removes the rules and the order, so the setup keeps matching its preset.
 * `minGapSec` is not offered (it can only act inside the item's own cooldown: docs Part H); a
 * stored one is kept and shown in the row's summary.
 */
export function ItemUseEditor({ catalog, config, onChange }: ItemUseEditorProps) {
  const model = itemUseModel(catalog, config);
  const { rows, buffs } = model;
  const auraNames: Record<string, string> = Object.fromEntries(buffs.map((b) => [b.id, b.name]));
  const stored = config.rotation.itemUse;
  const anythingStored = stored !== undefined || config.rotation.itemUseOrder !== undefined;

  const emit = (itemUse: RotationConfig['itemUse'], itemUseOrder: RotationConfig['itemUseOrder']) => {
    const { itemUse: _rules, itemUseOrder: _order, ...rest } = config.rotation;
    const rotation: RotationConfig = { ...rest };
    if (itemUse !== undefined && Object.keys(itemUse).length > 0) rotation.itemUse = itemUse;
    if (itemUseOrder !== undefined) rotation.itemUseOrder = itemUseOrder;
    onChange({ ...config, rotation });
  };
  const setRule = (id: string, rule: ItemUseRule) => emit({ ...stored, [id]: rule }, config.rotation.itemUseOrder);
  const resetRule = (id: string) => {
    const next = { ...stored };
    delete next[id];
    emit(next, config.rotation.itemUseOrder);
  };
  const move = (index: number, by: -1 | 1) => {
    const order = rows.map((r) => r.id);
    const j = index + by;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j]!, order[index]!];
    const isDefault = order.every((id, i) => id === model.defaultOrder[i]);
    emit(stored, isDefault ? undefined : order);
  };

  if (rows.length === 0) {
    return (
      <div className="item-use">
        <p className="setup-label">Item use</p>
        <p className="hint">Enable a potion, the rune or an on-use item (Items and cooldowns) to set when the bot uses it.</p>
      </div>
    );
  }

  return (
    <div className="item-use">
      <p className="setup-label">Item use</p>
      <p className="hint">
        When the bot uses each enabled item (top first; items come before the spells, off the GCD). For the bot and the
        Simulator; you press them yourself in the fight.
      </p>
      <ol className="item-use-rows" aria-label="Item use rules">
        {rows.map((row, index) => {
          const { action, rule } = row;
          const name = action.label;
          const t = rule.trigger;
          const compiled = compileItemUseRule(action, rule, { heroismEndMs: model.heroismEndMs, auraNames });
          const summary = compiled?.hint ?? `${TRIGGER_TEXT.never.hint} ${action.cooldown}`;
          const choices = buffs.filter((b) => b.id !== row.ownAuraId);
          const setTrigger = (trigger: ItemUseTrigger) => setRule(row.id, { ...rule, trigger });
          const setWindow = (key: 'notBeforeSec' | 'notAfterSec', sec: number | undefined) => {
            const next: ItemUseRule = { ...rule };
            if (sec === undefined) delete next[key];
            else next[key] = sec;
            setRule(row.id, next);
          };
          const secField = (label: string, value: number, onValue: (v: number) => void) => (
            <NumberField
              label={`${name}: ${label}`}
              value={String(value)}
              min={ITEM_USE_LIMITS.sec.min}
              max={ITEM_USE_LIMITS.sec.max}
              onValue={onValue}
            />
          );
          const manaField = (label: string, value: number, onValue: (v: number) => void) => (
            <NumberField
              label={`${name}: ${label}`}
              value={String(value)}
              min={ITEM_USE_LIMITS.mana.min}
              max={ITEM_USE_LIMITS.mana.max}
              step={1}
              integer
              onValue={onValue}
            />
          );
          return (
            <li key={row.id} className="item-use-row">
              <div className="item-use-head">
                <span className="item-use-name">{name}</span>
                {row.key && <kbd className="item-use-key" aria-label={`Item row key ${row.key}`}>{row.key}</kbd>}
                <span className={row.stored ? 'item-use-state item-use-custom' : 'item-use-state'}>{row.stored ? 'custom' : 'default'}</span>
                <span className="item-use-moves">
                  <button
                    type="button"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.currentTarget.blur(); // keep Space/R for the fight
                      move(index, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} down`}
                    disabled={index === rows.length - 1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      move(index, 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Reset ${name}`}
                    disabled={!row.stored}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      resetRule(row.id);
                    }}
                  >
                    Reset
                  </button>
                </span>
              </div>
              <div className="item-use-fields">
                <span aria-hidden="true">When</span>
                <select
                  aria-label={`${name}: when`}
                  value={t.kind}
                  onChange={(e) => {
                    const kind = ITEM_USE_TRIGGER_KINDS.find((k) => k === e.target.value);
                    const next = kind === undefined ? null : triggerFor(kind, t, action, choices);
                    if (next !== null) setTrigger(next);
                  }}
                >
                  {ITEM_USE_TRIGGER_KINDS.map((k) => (
                    <option key={k} value={k} disabled={k === 'with-buff' && choices.length === 0 && t.kind !== 'with-buff'}>
                      {TRIGGER_TEXT[k].name}
                    </option>
                  ))}
                </select>
                {t.kind === 'at' && (
                  <>
                    <span aria-hidden="true">Second</span>
                    {secField('from second', t.sec, (sec) => setTrigger({ kind: 'at', sec }))}
                  </>
                )}
                {t.kind === 'fight-end' && (
                  <>
                    <span aria-hidden="true">Last (s)</span>
                    {secField('last seconds', t.lastSec, (lastSec) => setTrigger({ kind: 'fight-end', lastSec }))}
                  </>
                )}
                {t.kind === 'mana-below' && (
                  <>
                    <span aria-hidden="true">Mana</span>
                    {manaField('mana below', t.mana, (mana) => setTrigger({ kind: 'mana-below', mana }))}
                  </>
                )}
                {t.kind === 'mana-missing' && (
                  <>
                    <span aria-hidden="true">Missing</span>
                    {manaField('missing mana', t.amount, (amount) => setTrigger({ kind: 'mana-missing', amount }))}
                  </>
                )}
                {t.kind === 'with-buff' && (
                  <>
                    <span aria-hidden="true">Buff</span>
                    <select
                      aria-label={`${name}: buff`}
                      value={t.auraId}
                      onChange={(e) => {
                        const choice = choices.find((b) => b.id === e.target.value);
                        if (choice) setTrigger({ kind: 'with-buff', auraId: choice.id });
                      }}
                    >
                      {choices.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                      {!choices.some((b) => b.id === t.auraId) && (
                        <option value={t.auraId} disabled>
                          {auraNames[t.auraId] ?? t.auraId} (not enabled)
                        </option>
                      )}
                    </select>
                  </>
                )}
                {t.kind !== 'never' && (
                  <>
                    <span aria-hidden="true">Not before (s)</span>
                    <NumberField
                      label={`${name}: not before (s)`}
                      value={rule.notBeforeSec === undefined ? '' : String(rule.notBeforeSec)}
                      placeholder="–"
                      min={ITEM_USE_LIMITS.sec.min}
                      max={ITEM_USE_LIMITS.sec.max}
                      onValue={(sec) => setWindow('notBeforeSec', sec)}
                      onClear={() => setWindow('notBeforeSec', undefined)}
                    />
                    <span aria-hidden="true">Not after (s)</span>
                    <NumberField
                      label={`${name}: not after (s)`}
                      value={rule.notAfterSec === undefined ? '' : String(rule.notAfterSec)}
                      placeholder="–"
                      min={ITEM_USE_LIMITS.sec.min}
                      max={ITEM_USE_LIMITS.sec.max}
                      onValue={(sec) => setWindow('notAfterSec', sec)}
                      onClear={() => setWindow('notAfterSec', undefined)}
                    />
                  </>
                )}
              </div>
              <p className="hint item-use-kind-hint">{TRIGGER_TEXT[t.kind].hint}</p>
              <p className="item-use-summary">{summary}</p>
            </li>
          );
        })}
      </ol>
      <div className="setup-preset-buttons">
        <button
          type="button"
          disabled={!anythingStored}
          onClick={(e) => {
            e.currentTarget.blur();
            emit(undefined, undefined);
          }}
        >
          Reset all item rules to default
        </button>
      </div>
    </div>
  );
}
