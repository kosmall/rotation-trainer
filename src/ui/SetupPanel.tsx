import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { SACRIFICE_SUCCUBUS_OPTION, WARLOCK_ARMOR_OPTIONS } from '../data/classes/warlock/buffs';
import type { WarlockOptions } from '../data/classes/warlock/destruction';
import { ROTATION_PRESETS } from '../data/classes/warlock/rotation';
import type { CurseChoice, RotationConfig, RotationPresetId } from '../data/classes/warlock/rotation';
import type { BuffDef } from '../data/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_LIMITS } from '../setup/defaults';
import { isAlwaysBoundGearEntry, itemRowOf } from '../setup/gearEffects';
import { applySetupPreset, setupFightKey } from '../setup/presets';
import type { SetupConfig, SetupPresetId, TimedSetting } from '../setup/types';
import { initials } from './format';
import { ItemUseEditor } from './ItemUseEditor';
import { ITEM_SLOT_KEYS } from './keys';
import { NumberField } from './NumberField';
import { SpellIcon } from './SpellIcon';

/** The distance input's range in yards (the setup's limits; 28 yd is the default, target.ts). */
export const MIN_DISTANCE_YD = SETUP_LIMITS.distanceYd.min;
export const MAX_DISTANCE_YD = SETUP_LIMITS.distanceYd.max;
/** The fight length input's range in seconds (the setup's limits; 60 s is the default). */
export const MIN_FIGHT_SEC = SETUP_LIMITS.fightDurationSec.min;
export const MAX_FIGHT_SEC = SETUP_LIMITS.fightDurationSec.max;
/** UI bound for the Life Tap threshold, well above any level 70 mana pool. */
const MAX_LIFE_TAP_MANA = 20000;
/**
 * The threshold offered when "auto" is switched off and no number was set yet: about Shadow
 * Bolt's cost (399 with Cataclysm, rotation.ts), so switching changes little until it is edited.
 */
const FIRST_LIFE_TAP_MANA = 400;

/** The name shown when the config matches no preset. */
export const CUSTOM_PRESET_NAME = 'Custom';

const CURSES: { id: CurseChoice; name: string }[] = [
  { id: 'elements', name: 'Curse of the Elements' },
  { id: 'agony', name: 'Curse of Agony' },
  { id: 'doom', name: 'Curse of Doom' },
  { id: 'none', name: 'None' },
];

const ARMORS = Object.keys(WARLOCK_ARMOR_OPTIONS) as WarlockOptions['armor'][];
const ROTATION_PRESET_IDS = Object.keys(ROTATION_PRESETS) as RotationPresetId[];

export type SetupPresets = Readonly<
  Record<SetupPresetId, { readonly name: string; readonly description?: string; readonly config: SetupConfig }>
>;

/** The rotation's item-use fields, only those it has. */
function itemUseOf(rotation: RotationConfig): Pick<RotationConfig, 'itemUse' | 'itemUseOrder'> {
  const out: Pick<RotationConfig, 'itemUse' | 'itemUseOrder'> = {};
  if (rotation.itemUse !== undefined) out.itemUse = rotation.itemUse;
  if (rotation.itemUseOrder !== undefined) out.itemUseOrder = rotation.itemUseOrder;
  return out;
}

/** The config without its item-use rules and order (the default rules). */
function withoutItemUse(config: SetupConfig): SetupConfig {
  const { itemUse: _rules, itemUseOrder: _order, ...rotation } = config.rotation;
  return { ...config, rotation };
}

/** The rotation preset whose values `rotation` has, or 'custom'. */
function rotationPresetOf(rotation: RotationConfig): RotationPresetId | 'custom' {
  const keys = Object.keys(ROTATION_PRESETS.dot.config) as (keyof RotationConfig)[];
  return ROTATION_PRESET_IDS.find((id) => keys.every((k) => ROTATION_PRESETS[id].config[k] === rotation[k])) ?? 'custom';
}

/**
 * The name of the first preset whose config gives the same fight as `config` ("None", "Raid as
 * in my log"), or "Custom". A preset is compared as it would be chosen now (`applySetupPreset`:
 * it keeps the fight length, the gear and the talents, ruling F-2) but without the current
 * item-use rules, so custom item rules still show "Custom"; the keys are `setupFightKey`'s
 * (enabled buffs as a set, timings of the enabled timed buffs, rotation, distance, warlock
 * options, and the talents when they are not the author's).
 */
export function activePresetName(config: SetupConfig, presets: SetupPresets, catalog: readonly BuffDef[]): string {
  const key = setupFightKey(config, catalog);
  const current = withoutItemUse(config);
  const match = Object.values(presets).find((p) => setupFightKey(applySetupPreset(p.config, current), catalog) === key);
  return match?.name ?? CUSTOM_PRESET_NAME;
}

export type BuffGroupId = 'fight' | 'raid' | 'consumables' | 'debuffs' | 'items' | 'warlock';

/**
 * The panel group a catalog buff is listed in: timed buffs (Heroism) in "Fight"; item actions
 * (used from the item row: the potions, the rune and the gear's on-use effects) and the gear's
 * other effects (group 'item': procs, pre-pull) in "Items and cooldowns".
 */
export function groupOf(buff: BuffDef): BuffGroupId {
  if (buff.timed) return 'fight';
  if (buff.effect.action || buff.group === 'item') return 'items';
  if (buff.group === 'debuff') return 'debuffs';
  if (buff.group === 'consumable') return 'consumables';
  if (buff.group === 'warlock') return 'warlock';
  return 'raid';
}

/** The item row's keys as shown ("Z X C V B N"). */
const ITEM_KEYS_TEXT = ITEM_SLOT_KEYS.map((k) => k.toUpperCase()).join(' ');

/** The visible label of an on-use gear effect's checkbox (`enabledBuffs`: "use automatically"). */
export const AUTO_USE_LABEL = 'Use automatically (bot, simulator)';
/** The hint under it: the item is on the item row whether ticked or not. */
export const AUTO_USE_HINT = `Always available on the item bar (${ITEM_KEYS_TEXT}); tick to let the bot and the simulator use it, with the rule below.`;

export const BUFF_GROUPS: { id: Exclude<BuffGroupId, 'fight' | 'warlock'>; title: string; hint: string }[] = [
  {
    id: 'raid',
    title: 'Raid and party',
    hint: 'Active the whole fight.',
  },
  {
    id: 'consumables',
    title: 'Consumables',
    hint: 'One flask, or one battle and one guardian elixir; one food; one weapon oil. Enabling one replaces the one it conflicts with.',
  },
  {
    id: 'debuffs',
    title: 'Target debuffs',
    hint: 'Kept up by other raid members for the whole fight. The raid Curse of the Elements and Improved Shadow Bolt do not stack with your own: one effect counts.',
  },
  {
    id: 'items',
    title: 'Items and cooldowns',
    hint: `The modelled effects of the items you wear (Gear panel), the potions and the rune. The on-use effects of your gear are always on the item row (${ITEM_KEYS_TEXT}; trinket 1, trinket 2, then the other slots), the enabled potions and rune after them; tick an on-use effect to let the bot and the simulator use it too. One potion per 2 min (shared cooldown). Procs and pre-pull effects work by themselves once enabled. Item effects are on top of the item stats already in the gear.`,
  },
];

/** A small icon tile: the initials underneath, the icon file over them when it loads. */
function BuffIcon({ icon, name, kind = 'spell' }: { icon: string; name: string; kind?: 'spell' | 'item' }) {
  return (
    <span className="setup-icon" aria-hidden="true">
      {initials(name)}
      {icon !== '' && <SpellIcon icon={icon} kind={kind} className="setup-icon-image" />}
    </span>
  );
}

/**
 * One option: checkbox or radio with icon and name, its description under it, optional extras.
 * `autoUse` (a worn on-use gear effect, always on the item row): the icon and name are a heading,
 * and the checkbox under the description reads "Use automatically (bot, simulator)" (accessible
 * name "<name>: use automatically (bot, simulator)") with its hint.
 */
function OptionRow({
  type = 'checkbox',
  autoUse = false,
  name,
  radioGroup,
  icon,
  iconKind,
  title,
  description,
  checked,
  onChange,
  children,
}: {
  type?: 'checkbox' | 'radio';
  autoUse?: boolean;
  name?: string;
  radioGroup?: string;
  icon: string;
  /** 'item' for an item icon (public/icons/items/: the gear's effects). */
  iconKind?: 'spell' | 'item';
  title: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
  children?: ReactNode;
}) {
  const descId = useId();
  const hintId = useId();
  if (autoUse) {
    return (
      <li className={checked ? 'setup-buff setup-buff-on' : 'setup-buff'}>
        <div className="setup-buff-label setup-buff-head">
          <span className="setup-buff-spacer" aria-hidden="true" />
          <BuffIcon icon={icon} kind={iconKind} name={name ?? title} />
          <span className="setup-buff-name">{title}</span>
        </div>
        <p id={descId} className="setup-buff-desc" title={description}>
          {description}
        </p>
        <label className="setup-auto">
          <input
            type="checkbox"
            checked={checked}
            aria-label={`${title}: ${AUTO_USE_LABEL.charAt(0).toLowerCase()}${AUTO_USE_LABEL.slice(1)}`}
            aria-describedby={`${hintId} ${descId}`}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span aria-hidden="true">{AUTO_USE_LABEL}</span>
        </label>
        <p id={hintId} className="setup-auto-hint">
          {AUTO_USE_HINT}
        </p>
        {children}
      </li>
    );
  }
  return (
    <li className={checked ? 'setup-buff setup-buff-on' : 'setup-buff'}>
      <label className="setup-buff-label">
        <input
          type={type}
          name={radioGroup}
          checked={checked}
          aria-describedby={descId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <BuffIcon icon={icon} kind={iconKind} name={name ?? title} />
        <span className="setup-buff-name">{title}</span>
      </label>
      <p id={descId} className="setup-buff-desc" title={description}>
        {description}
      </p>
      {children}
    </li>
  );
}

/** A collapsible group of the legacy panel, exposed as a named group. */
function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="setup-group">
      <summary>
        {title}
        {count !== undefined && count > 0 && <span className="setup-count">{count} on</span>}
      </summary>
      <div role="group" aria-label={title} className="setup-group-body">
        {children}
      </div>
    </details>
  );
}

/**
 * What every group of the setup gets: the catalog (the gear-independent entries and the worn
 * gear's item effects), the current setup (shown, never copied) and the sink of every edit, which
 * receives a config normalized for `catalog` (`normalizeSetup`).
 */
export interface SetupGroupProps {
  catalog: readonly BuffDef[];
  config: SetupConfig;
  onChange(config: SetupConfig): void;
}

/** Normalizes an edited config for the catalog and passes it on. */
const emitter = (catalog: readonly BuffDef[], onChange: (config: SetupConfig) => void) => (next: SetupConfig) =>
  onChange(normalizeSetup(next, catalog));

/**
 * The buffs of one group as option rows: checkbox, icon, name, description; a timed buff gets its
 * start and duration fields (warned when it starts at or after the fight's end); an item action
 * its item row key, or the warning that the row is full.
 */
function BuffList({ buffs, catalog, config, onChange }: SetupGroupProps & { buffs: readonly BuffDef[] }) {
  const emit = emitter(catalog, onChange);
  const enabled = new Set(config.enabledBuffs);
  // The item row key of each bound item action, as applySetup binds them (`itemRowOf`: every worn
  // on-use effect, enabled or not, then the enabled potions and rune); the rest are left out.
  const itemRow = itemRowOf(catalog, enabled);
  const itemKeys = new Map(itemRow.bound.map((b, i) => [b.id, ITEM_SLOT_KEYS[i]!.toUpperCase()] as const));
  const unboundIds = new Set(itemRow.unbound.map((b) => b.id));
  const fightLengthSec = config.fightDurationSec;
  const toggleBuff = (buffId: string, on: boolean) => {
    const rest = config.enabledBuffs.filter((b) => b !== buffId);
    emit({ ...config, enabledBuffs: on ? [...rest, buffId] : rest });
  };
  const timedOf = (b: BuffDef): TimedSetting =>
    config.timed[b.id] ?? { startSec: b.timed?.defaultStartSec ?? 0, durationSec: b.timed?.durationSec ?? 1 };
  const setTimed = (b: BuffDef, patch: Partial<TimedSetting>) =>
    emit({ ...config, timed: { ...config.timed, [b.id]: { ...timedOf(b), ...patch } } });

  return (
    <ul className="setup-buffs">
      {buffs.map((b) => {
        const t = b.timed ? timedOf(b) : null;
        const key = itemKeys.get(b.id);
        return (
          <OptionRow
            key={b.id}
            autoUse={isAlwaysBoundGearEntry(b)}
            icon={b.icon}
            iconKind={b.iconKind === 'item' ? 'item' : 'spell'}
            title={b.name}
            description={b.description}
            checked={enabled.has(b.id)}
            onChange={(on) => toggleBuff(b.id, on)}
          >
            {t && (
              <div className="setup-timed">
                <label>
                  <span aria-hidden="true">Start (s)</span>
                  <NumberField
                    label={`${b.name} start (s)`}
                    value={String(t.startSec)}
                    min={SETUP_LIMITS.startSec.min}
                    max={SETUP_LIMITS.startSec.max}
                    onValue={(startSec) => setTimed(b, { startSec })}
                  />
                </label>
                <label>
                  <span aria-hidden="true">Duration (s)</span>
                  <NumberField
                    label={`${b.name} duration (s)`}
                    value={String(t.durationSec)}
                    min={SETUP_LIMITS.durationSec.min}
                    max={SETUP_LIMITS.durationSec.max}
                    onValue={(durationSec) => setTimed(b, { durationSec })}
                  />
                </label>
                {t.startSec >= fightLengthSec && (
                  <p className="setup-warn">Starts after the fight ends ({fightLengthSec} s): no effect.</p>
                )}
              </div>
            )}
            {key && <p className="setup-item-key">Item row: {key}</p>}
            {unboundIds.has(b.id) && (
              <p className="setup-item-key setup-warn">Not on the item row ({ITEM_SLOT_KEYS.length} slots, all taken): no effect.</p>
            )}
          </OptionRow>
        );
      })}
    </ul>
  );
}

/** How many buffs of a group are enabled (the group's "N on"). */
export function enabledCount(catalog: readonly BuffDef[], config: SetupConfig, group: BuffGroupId): number {
  const enabled = new Set(config.enabledBuffs);
  return catalog.filter((b) => groupOf(b) === group && enabled.has(b.id)).length;
}

/**
 * The setup presets: the active preset's name (or "Custom", with the preset the rest matches when
 * only the item-use rules differ), its description, and a button per preset. A preset keeps the
 * chosen fight length, the gear, the item-use rules and the talents (ruling F-2). `children` are
 * added after the preset buttons (the legacy panel's "Reset to defaults").
 */
export function SetupPresetBar({
  catalog,
  config,
  presets,
  onChange,
  children,
}: SetupGroupProps & { presets: SetupPresets; children?: ReactNode }) {
  const emit = emitter(catalog, onChange);
  const presetName = activePresetName(config, presets, catalog);
  const presetDescription = Object.values(presets).find((p) => p.name === presetName)?.description;
  // "Custom" only because of the item-use rules: say which preset the rest matches.
  const presetBesidesItemUse =
    presetName === CUSTOM_PRESET_NAME && (config.rotation.itemUse !== undefined || config.rotation.itemUseOrder !== undefined)
      ? activePresetName(withoutItemUse(config), presets, catalog)
      : CUSTOM_PRESET_NAME;
  return (
    <>
      <p className="setup-active">
        Preset:{' '}
        <span role="note" aria-label="Active preset" className="setup-active-name">
          {presetName}
        </span>
      </p>
      {presetDescription && <p className="hint setup-preset-description">{presetDescription}</p>}
      {presetBesidesItemUse !== CUSTOM_PRESET_NAME && (
        <p className="hint">{presetBesidesItemUse}, except the item-use rules (Rotation: Reset all item rules to default).</p>
      )}
      <div className="setup-preset-buttons" role="group" aria-label="Setup presets">
        {Object.entries(presets).map(([presetId, p]) => (
          <button
            key={presetId}
            type="button"
            title={p.description}
            aria-pressed={presetName === p.name}
            onClick={(e) => {
              e.currentTarget.blur(); // keep Space/R for the fight
              // Ruling F-2: a preset keeps the chosen fight length, the gear (Gear panel), the item-use
              // rules (no preset has any; Reset all in Rotation clears them) and the talents (Talents panel).
              emit(applySetupPreset(p.config, config));
            }}
          >
            {p.name}
          </button>
        ))}
        {children}
      </div>
    </>
  );
}

/** The fight: its length (presets keep it) and the timed buffs (Heroism / Bloodlust with its start and duration). */
export function FightGroup({ catalog, config, onChange }: SetupGroupProps) {
  const id = useId();
  const emit = emitter(catalog, onChange);
  return (
    <>
      <div className="setup-row">
        <label htmlFor={`${id}-fight-length`}>Fight length (s)</label>
        <NumberField
          id={`${id}-fight-length`}
          value={String(config.fightDurationSec)}
          min={MIN_FIGHT_SEC}
          max={MAX_FIGHT_SEC}
          step={1}
          integer
          onValue={(fightDurationSec) => emit({ ...config, fightDurationSec })}
        />
      </div>
      <p className="hint">
        {MIN_FIGHT_SEC} to {MAX_FIGHT_SEC} s. Presets keep it; Reset to defaults sets {DEFAULT_SETUP.fightDurationSec} s.
      </p>
      <BuffList buffs={catalog.filter((b) => groupOf(b) === 'fight')} catalog={catalog} config={config} onChange={onChange} />
    </>
  );
}

/** One kind of buff (raid and party, consumables, target debuffs): its hint and options. */
export function BuffGroup({ group, catalog, config, onChange }: SetupGroupProps & { group: 'raid' | 'consumables' | 'debuffs' }) {
  const def = BUFF_GROUPS.find((g) => g.id === group)!;
  return (
    <>
      <p className="hint">{def.hint}</p>
      <BuffList buffs={catalog.filter((b) => groupOf(b) === group)} catalog={catalog} config={config} onChange={onChange} />
    </>
  );
}

export interface ItemsGroupProps extends SetupGroupProps {
  /** The running (or ended) fight keeps its own gear and item effects: say this list is for the next fight. */
  pending?: boolean;
  fightEnded?: boolean;
  /** "<item>: <effect>" for every effect of the worn items the trainer does not model. */
  unmodelledItemEffects?: readonly string[];
  /** A note over the list (e.g. the item database is still loading). */
  itemsNote?: string;
}

/**
 * Items and cooldowns: the worn gear's modelled effects, the potions and the rune, each with its
 * item row key; the item row overflow and the not-modelled effects of the gear.
 */
export function ItemsGroup({
  catalog,
  config,
  onChange,
  pending = false,
  fightEnded = false,
  unmodelledItemEffects = [],
  itemsNote,
}: ItemsGroupProps) {
  const def = BUFF_GROUPS.find((g) => g.id === 'items')!;
  const unbound = itemRowOf(catalog, new Set(config.enabledBuffs)).unbound;
  const rowFull = `not on the item row (${ITEM_SLOT_KEYS.length} slots, all taken)`;
  return (
    <>
      <p className="hint">{def.hint}</p>
      {pending && (
        <p className="setup-pending">
          The {fightEnded ? 'finished' : 'running'} fight keeps its gear and item effects: this list is for the next fight (press R).
        </p>
      )}
      {itemsNote && <p className="hint">{itemsNote}</p>}
      <BuffList buffs={catalog.filter((b) => groupOf(b) === 'items')} catalog={catalog} config={config} onChange={onChange} />
      {unbound.length > 0 && (
        <ul className="setup-warnings" aria-label="Item row overflow">
          {unbound.map((b) => (
            <li key={b.id} className="setup-warn">
              {b.name}: {rowFull}
            </li>
          ))}
        </ul>
      )}
      {unmodelledItemEffects.length > 0 && (
        <>
          <p className="hint setup-unmodelled-title">Not modelled effects of your gear:</p>
          <ul className="setup-unmodelled" aria-label="Not modelled effects of your gear">
            {unmodelledItemEffects.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** The warlock's own options: the armor (radio), the sacrificed Succubus and the warlock buffs. */
export function WarlockOptionsGroup({ catalog, config, onChange }: SetupGroupProps) {
  const id = useId();
  const emit = emitter(catalog, onChange);
  const updateWarlock = (patch: Partial<WarlockOptions>) => emit({ ...config, warlock: { ...config.warlock, ...patch } });
  return (
    <>
      <ul className="setup-buffs" role="radiogroup" aria-label="Armor">
        {ARMORS.map((armor) => {
          const o = WARLOCK_ARMOR_OPTIONS[armor];
          return (
            <OptionRow
              key={armor}
              type="radio"
              radioGroup={`${id}-armor`}
              icon={o.icon}
              title={o.name}
              description={o.description}
              checked={config.warlock.armor === armor}
              onChange={(on) => on && updateWarlock({ armor })}
            />
          );
        })}
      </ul>
      <ul className="setup-buffs">
        <OptionRow
          icon={SACRIFICE_SUCCUBUS_OPTION.icon}
          title={SACRIFICE_SUCCUBUS_OPTION.name}
          description={SACRIFICE_SUCCUBUS_OPTION.description}
          checked={config.warlock.sacrificeSuccubus}
          onChange={(sacrificeSuccubus) => updateWarlock({ sacrificeSuccubus })}
        />
      </ul>
      <BuffList buffs={catalog.filter((b) => groupOf(b) === 'warlock')} catalog={catalog} config={config} onChange={onChange} />
    </>
  );
}

/** The warlock options in short ("Fel Armor, Succubus sacrificed"): the Setup rail's value. */
export function warlockOptionsText(warlock: WarlockOptions): string {
  const armor = WARLOCK_ARMOR_OPTIONS[warlock.armor].name;
  return warlock.sacrificeSuccubus ? `${armor}, Succubus sacrificed` : armor;
}

/** The icon of the chosen armor (the Setup rail's icon of the class options). */
export function warlockOptionsIcon(warlock: WarlockOptions): string {
  return WARLOCK_ARMOR_OPTIONS[warlock.armor].icon;
}

/**
 * The basic rotation: preset, curse, Immolate / Corruption / Shadowburn finisher, Life Tap
 * threshold (a number, or auto), and the item-use rules (`ItemUseEditor`).
 */
export function RotationGroup({ catalog, config, onChange }: SetupGroupProps) {
  const id = useId();
  const emit = emitter(catalog, onChange);
  const lifeTap = config.rotation.lifeTapBelowMana;
  // The last number threshold, offered again when "auto" is switched off. It follows the config
  // (a number set by a preset or loaded from storage counts too).
  const [lastLifeTap, setLastLifeTap] = useState<number>(typeof lifeTap === 'number' ? lifeTap : FIRST_LIFE_TAP_MANA);
  if (typeof lifeTap === 'number' && lifeTap !== lastLifeTap) setLastLifeTap(lifeTap);
  const updateRotation = (patch: Partial<RotationConfig>) => emit({ ...config, rotation: { ...config.rotation, ...patch } });
  const rotationPreset = rotationPresetOf(config.rotation);
  const autoLifeTap = lifeTap === 'auto';

  return (
    <>
      <div className="setup-row setup-stack">
        <label htmlFor={`${id}-preset`}>Rotation preset</label>
        <select
          id={`${id}-preset`}
          value={rotationPreset}
          onChange={(e) => {
            const next = e.target.value;
            if (!Object.hasOwn(ROTATION_PRESETS, next)) return;
            // The preset sets the spell rotation; the item-use rules are kept (the preset has none).
            emit({ ...config, rotation: { ...ROTATION_PRESETS[next as RotationPresetId].config, ...itemUseOf(config.rotation) } });
          }}
        >
          {ROTATION_PRESET_IDS.map((p) => (
            <option key={p} value={p}>
              {ROTATION_PRESETS[p].name}
            </option>
          ))}
          {rotationPreset === 'custom' && (
            <option value="custom" disabled>
              Custom
            </option>
          )}
        </select>
      </div>

      <div className="setup-row setup-stack">
        <label htmlFor={`${id}-curse`}>Curse</label>
        <select
          id={`${id}-curse`}
          value={config.rotation.curse}
          onChange={(e) => {
            const curse = CURSES.find((c) => c.id === e.target.value);
            if (curse) updateRotation({ curse: curse.id });
          }}
        >
          {CURSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="setup-checks">
        <label>
          <input type="checkbox" checked={config.rotation.immolate} onChange={(e) => updateRotation({ immolate: e.target.checked })} />
          Immolate
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.rotation.corruption}
            onChange={(e) => updateRotation({ corruption: e.target.checked })}
          />
          Corruption
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.rotation.shadowburnFinisher}
            onChange={(e) => updateRotation({ shadowburnFinisher: e.target.checked })}
          />
          Shadowburn finisher
        </label>
      </div>

      <div className="setup-row">
        <label htmlFor={`${id}-lifetap`}>Life Tap below mana</label>
        <NumberField
          id={`${id}-lifetap`}
          value={autoLifeTap ? '' : String(lifeTap)}
          min={0}
          max={MAX_LIFE_TAP_MANA}
          step={1}
          integer
          disabled={autoLifeTap}
          placeholder="auto"
          onValue={(mana) => updateRotation({ lifeTapBelowMana: mana })}
        />
      </div>
      <label className="setup-sub">
        <input
          type="checkbox"
          checked={autoLifeTap}
          onChange={(e) => updateRotation({ lifeTapBelowMana: e.target.checked ? 'auto' : lastLifeTap })}
        />
        Auto (Shadow Bolt cost)
      </label>

      <ItemUseEditor catalog={catalog} config={config} onChange={emit} />
    </>
  );
}

/** The distance from the target (the travel time of missile spells). */
export function DistanceField({ catalog, config, onChange }: SetupGroupProps) {
  const id = useId();
  const emit = emitter(catalog, onChange);
  return (
    <>
      <div className="setup-row">
        <label htmlFor={`${id}-distance`}>Distance from target (yd)</label>
        <NumberField
          id={`${id}-distance`}
          value={String(config.distanceYd)}
          min={MIN_DISTANCE_YD}
          max={MAX_DISTANCE_YD}
          onValue={(distanceYd) => emit({ ...config, distanceYd })}
        />
      </div>
      <p className="hint">Sets the travel time of missile spells: Shadow Bolt flies 20 yd/s, so 28 yd is 1.4 s.</p>
    </>
  );
}

export interface SetupPanelProps {
  /**
   * Every buff the setup can enable: the gear-independent entries and the worn gear's item effects
   * (`setupCatalogFor(gear, db)`), so "Items and cooldowns" follows the gear.
   */
  catalog: readonly BuffDef[];
  /** The current setup (normalized). The panel shows it and keeps no copy of it. */
  config: SetupConfig;
  presets: SetupPresets;
  /** Receives every edit as a new, normalized config (`normalizeSetup`). */
  onChange(config: SetupConfig): void;
  disabled?: boolean;
  /** The running fight was built with another setup: say that the new one applies after R. */
  pending?: boolean;
  /** The fight is over: the pending note then says "finished" instead of "in progress". */
  fightEnded?: boolean;
  /** "<item>: <effect>" for every effect of the worn items the trainer does not model (`unmodelledGearEffects`). */
  unmodelledItemEffects?: readonly string[];
  /** A note under "Items and cooldowns" (e.g. the item database is still loading). */
  itemsNote?: string;
}

/**
 * The collapsed "Setup" panel of the legacy layout (until the redesign's Task 5): presets and
 * "Reset to defaults", the active preset's name, then the groups the Setup screen shows in its
 * own sections (`FightGroup`, `BuffGroup`, `ItemsGroup`, `WarlockOptionsGroup`, `RotationGroup`,
 * `DistanceField`), each in a collapsible group. Presets keep the chosen fight length, the gear
 * and the talents; "Reset to defaults" resets them too (the author's gear and build). Fully
 * controlled: it shows `config` and passes every edit to `onChange` as a new config normalized
 * for `catalog` (exclusive buffs resolved, the later one wins; numbers clamped). Number inputs
 * keep a typed text only while focused.
 */
export function SetupPanel({
  catalog,
  config,
  presets,
  onChange,
  disabled = false,
  pending = false,
  fightEnded = false,
  unmodelledItemEffects = [],
  itemsNote,
}: SetupPanelProps) {
  const group = { catalog, config, onChange };
  return (
    <details className="panel setup">
      <summary>Setup</summary>
      <fieldset className="setup-fields" disabled={disabled}>
        <div className="setup-presets">
          <SetupPresetBar {...group} presets={presets}>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onChange(normalizeSetup(DEFAULT_SETUP, catalog));
              }}
            >
              Reset to defaults
            </button>
          </SetupPresetBar>
          {pending && (
            <p className="setup-pending">
              The {fightEnded ? 'finished' : 'running'} fight keeps its setup: the new one applies from the next fight (press R).
            </p>
          )}
        </div>

        <Group title="Fight">
          <FightGroup {...group} />
        </Group>

        {BUFF_GROUPS.map((g) => (
          <Group key={g.id} title={g.title} count={enabledCount(catalog, config, g.id)}>
            {g.id === 'items' ? (
              <ItemsGroup
                {...group}
                pending={pending}
                fightEnded={fightEnded}
                unmodelledItemEffects={unmodelledItemEffects}
                itemsNote={itemsNote}
              />
            ) : (
              <BuffGroup {...group} group={g.id} />
            )}
          </Group>
        ))}

        <Group title="Warlock options">
          <WarlockOptionsGroup {...group} />
        </Group>

        <Group title="Rotation">
          <RotationGroup {...group} />
        </Group>

        <Group title="Distance">
          <DistanceField {...group} />
        </Group>

        <p className="hint">
          Saved in this browser. The rotation changes the Priority list at once. Other changes apply to a fight that has not
          started; a running fight keeps its setup until you press <kbd>R</kbd>.
        </p>
      </fieldset>
    </details>
  );
}
