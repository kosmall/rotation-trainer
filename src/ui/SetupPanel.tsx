import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { SACRIFICE_SUCCUBUS_OPTION, WARLOCK_ARMOR_OPTIONS } from '../data/classes/warlock/buffs';
import type { WarlockOptions } from '../data/classes/warlock/destruction';
import { ROTATION_PRESETS } from '../data/classes/warlock/rotation';
import type { CurseChoice, RotationConfig, RotationPresetId } from '../data/classes/warlock/rotation';
import type { BuffDef } from '../data/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_LIMITS } from '../setup/defaults';
import type { SetupConfig, SetupPresetId, TimedSetting } from '../setup/types';
import { initials } from './format';
import { SpellIcon } from './SpellIcon';

/** The distance input's range in yards (the setup's limits; 28 yd is the default, target.ts). */
export const MIN_DISTANCE_YD = SETUP_LIMITS.distanceYd.min;
export const MAX_DISTANCE_YD = SETUP_LIMITS.distanceYd.max;
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

export type SetupPresets = Readonly<Record<SetupPresetId, { readonly name: string; readonly config: SetupConfig }>>;

/** The rotation preset whose values `rotation` has, or 'custom'. */
function rotationPresetOf(rotation: RotationConfig): RotationPresetId | 'custom' {
  const keys = Object.keys(ROTATION_PRESETS.dot.config) as (keyof RotationConfig)[];
  return ROTATION_PRESET_IDS.find((id) => keys.every((k) => ROTATION_PRESETS[id].config[k] === rotation[k])) ?? 'custom';
}

/**
 * What decides a fight, as a comparable string: the enabled buffs as a set, the start and length
 * of the ENABLED timed buffs only (a disabled buff's timing changes nothing), the rotation, the
 * distance and the warlock options.
 */
function fightKey(config: SetupConfig, catalog: readonly BuffDef[]): string {
  const c = normalizeSetup(config, catalog);
  const enabled = [...c.enabledBuffs].sort();
  const timed = enabled.flatMap((id) => {
    const t = c.timed[id];
    return t ? [[id, t.startSec, t.durationSec]] : [];
  });
  return JSON.stringify([enabled, timed, c.rotation, c.distanceYd, c.warlock]);
}

/**
 * The name of the first preset whose config gives the same fight as `config` ("None", "Raid as
 * in my log"), or "Custom".
 */
export function activePresetName(config: SetupConfig, presets: SetupPresets, catalog: readonly BuffDef[]): string {
  const key = fightKey(config, catalog);
  const match = Object.values(presets).find((p) => fightKey(p.config, catalog) === key);
  return match?.name ?? CUSTOM_PRESET_NAME;
}

type BuffGroupId = 'raid' | 'consumables' | 'debuffs' | 'items' | 'warlock';

/** The panel group a catalog buff is listed in: timed buffs and item effects together. */
function groupOf(buff: BuffDef): BuffGroupId {
  if (buff.timed || buff.group === 'item') return 'items';
  if (buff.group === 'debuff') return 'debuffs';
  if (buff.group === 'consumable') return 'consumables';
  if (buff.group === 'warlock') return 'warlock';
  return 'raid';
}

const BUFF_GROUPS: { id: Exclude<BuffGroupId, 'warlock'>; title: string; hint: string }[] = [
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
    hint: 'A timed buff starts at the given second of the fight and lasts the given time; you do not press it. Item effects are on top of the item stats already in the gear.',
  },
];

/**
 * A number typed into an input, clamped to [min, max], or null when there is none (empty or
 * not a number): the caller then keeps its last valid value. Never NaN.
 */
function parseClamped(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  return Math.min(Math.max(value, min), max);
}

interface NumberFieldProps {
  id?: string;
  label?: string;
  /** Shown text; '' for none (with a placeholder). */
  value: string;
  min: number;
  max: number;
  step?: number | 'any';
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onValue(value: number): void;
}

/**
 * A number input controlled by `value`. While typing, the typed text stays as typed (a draft):
 * each valid number is clamped and passed on at once; an empty or invalid text is not passed on.
 * On blur, or when `value` changes from outside (a preset, Reset), the field shows `value` again.
 */
function NumberField({ id, label, value, min, max, step = 'any', integer = false, disabled, placeholder, onValue }: NumberFieldProps) {
  // `shows`: the value the draft goes with (what this field passed on, or `value` when nothing was).
  const [draft, setDraft] = useState<{ text: string; shows: string } | null>(null);
  if (draft !== null && draft.shows !== value) setDraft(null); // changed from outside
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      value={draft !== null && draft.shows === value ? draft.text : value}
      onChange={(e) => {
        const parsed = parseClamped(e.target.value, min, max);
        const next = parsed === null ? null : integer ? Math.round(parsed) : parsed;
        setDraft({ text: e.target.value, shows: next === null ? value : String(next) });
        if (next !== null) onValue(next);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** A small icon tile: the initials underneath, the icon file over them when it loads. */
function BuffIcon({ icon, name }: { icon: string; name: string }) {
  return (
    <span className="setup-icon" aria-hidden="true">
      {initials(name)}
      {icon !== '' && <SpellIcon icon={icon} className="setup-icon-image" />}
    </span>
  );
}

/** One option: checkbox or radio with icon and name, its description under it, optional extras. */
function OptionRow({
  type = 'checkbox',
  name,
  radioGroup,
  icon,
  title,
  description,
  checked,
  onChange,
  children,
}: {
  type?: 'checkbox' | 'radio';
  name?: string;
  radioGroup?: string;
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
  children?: ReactNode;
}) {
  const descId = useId();
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
        <BuffIcon icon={icon} name={name ?? title} />
        <span className="setup-buff-name">{title}</span>
      </label>
      <p id={descId} className="setup-buff-desc" title={description}>
        {description}
      </p>
      {children}
    </li>
  );
}

/** A collapsible group of the panel, exposed as a named group. */
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

export interface SetupPanelProps {
  /** Every buff the setup can enable (`SETUP_CATALOG`). */
  catalog: readonly BuffDef[];
  /** The current setup (normalized). The panel shows it and keeps no copy of it. */
  config: SetupConfig;
  presets: SetupPresets;
  /** Receives every edit as a new, normalized config (`normalizeSetup`). */
  onChange(config: SetupConfig): void;
  disabled?: boolean;
  /** The fight length, for the "starts after the fight ends" warning of timed buffs. */
  fightLengthSec?: number;
  /** The running fight was built with another setup: say that the new one applies after R. */
  pending?: boolean;
}

/**
 * The collapsed "Setup" panel: presets and "Reset to defaults", the active preset's name, then
 * one collapsible group per kind of buff (raid and party, consumables, target debuffs, items and
 * cooldowns with a start second and a duration per timed buff), the warlock options, the rotation
 * and the distance from the target. Fully controlled: it shows `config` and passes every edit to
 * `onChange` as a new config normalized for `catalog` (exclusive buffs resolved, the later one
 * wins; numbers clamped), so `applySetup` and `buildPriority` always get a valid config. Number
 * inputs keep a typed text only while focused.
 */
export function SetupPanel({
  catalog,
  config,
  presets,
  onChange,
  disabled = false,
  fightLengthSec,
  pending = false,
}: SetupPanelProps) {
  const id = useId();
  const lifeTap = config.rotation.lifeTapBelowMana;
  // The last number threshold, offered again when "auto" is switched off. It follows the config
  // (a number set by a preset or loaded from storage counts too).
  const [lastLifeTap, setLastLifeTap] = useState<number>(typeof lifeTap === 'number' ? lifeTap : FIRST_LIFE_TAP_MANA);
  if (typeof lifeTap === 'number' && lifeTap !== lastLifeTap) setLastLifeTap(lifeTap);

  const emit = (next: SetupConfig) => onChange(normalizeSetup(next, catalog));
  const enabled = new Set(config.enabledBuffs);
  const toggleBuff = (buffId: string, on: boolean) => {
    const rest = config.enabledBuffs.filter((b) => b !== buffId);
    emit({ ...config, enabledBuffs: on ? [...rest, buffId] : rest });
  };
  const timedOf = (b: BuffDef): TimedSetting =>
    config.timed[b.id] ?? { startSec: b.timed?.defaultStartSec ?? 0, durationSec: b.timed?.durationSec ?? 1 };
  const setTimed = (b: BuffDef, patch: Partial<TimedSetting>) =>
    emit({ ...config, timed: { ...config.timed, [b.id]: { ...timedOf(b), ...patch } } });
  const updateRotation = (patch: Partial<RotationConfig>) => emit({ ...config, rotation: { ...config.rotation, ...patch } });
  const updateWarlock = (patch: Partial<WarlockOptions>) => emit({ ...config, warlock: { ...config.warlock, ...patch } });

  const presetName = activePresetName(config, presets, catalog);
  const rotationPreset = rotationPresetOf(config.rotation);
  const autoLifeTap = lifeTap === 'auto';
  const warlockBuffs = catalog.filter((b) => groupOf(b) === 'warlock');

  const buffRow = (b: BuffDef) => {
    const t = b.timed ? timedOf(b) : null;
    return (
      <OptionRow
        key={b.id}
        icon={b.icon}
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
            {fightLengthSec !== undefined && t.startSec >= fightLengthSec && (
              <p className="setup-warn">Starts after the fight ends ({fightLengthSec} s): no effect.</p>
            )}
          </div>
        )}
      </OptionRow>
    );
  };

  return (
    <details className="panel setup">
      <summary>Setup</summary>
      <fieldset className="setup-fields" disabled={disabled}>
        <div className="setup-presets">
          <p className="setup-active">
            Preset:{' '}
            <span role="note" aria-label="Active preset" className="setup-active-name">
              {presetName}
            </span>
          </p>
          <div className="setup-preset-buttons">
            {Object.entries(presets).map(([presetId, p]) => (
              <button
                key={presetId}
                type="button"
                aria-pressed={presetName === p.name}
                onClick={(e) => {
                  e.currentTarget.blur(); // keep Space/R for the fight
                  emit(p.config);
                }}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                emit(DEFAULT_SETUP);
              }}
            >
              Reset to defaults
            </button>
          </div>
          {pending && (
            <p className="setup-pending">The fight in progress keeps its setup: the new one applies from the next fight (press R).</p>
          )}
        </div>

        {BUFF_GROUPS.map((g) => {
          const buffs = catalog.filter((b) => groupOf(b) === g.id);
          return (
            <Group key={g.id} title={g.title} count={buffs.filter((b) => enabled.has(b.id)).length}>
              <p className="hint">{g.hint}</p>
              <ul className="setup-buffs">{buffs.map(buffRow)}</ul>
            </Group>
          );
        })}

        <Group title="Warlock options">
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
            {warlockBuffs.map(buffRow)}
          </ul>
        </Group>

        <Group title="Rotation">
          <div className="setup-row setup-stack">
            <label htmlFor={`${id}-preset`}>Rotation preset</label>
            <select
              id={`${id}-preset`}
              value={rotationPreset}
              onChange={(e) => {
                const next = e.target.value;
                if (!Object.hasOwn(ROTATION_PRESETS, next)) return;
                emit({ ...config, rotation: { ...ROTATION_PRESETS[next as RotationPresetId].config } });
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
              <input
                type="checkbox"
                checked={config.rotation.immolate}
                onChange={(e) => updateRotation({ immolate: e.target.checked })}
              />
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
        </Group>

        <Group title="Distance">
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
        </Group>

        <p className="hint">
          Saved in this browser. The rotation changes the Priority list at once. Other changes apply to a fight that has not
          started; a running fight keeps its setup until you press <kbd>R</kbd>.
        </p>
      </fieldset>
    </details>
  );
}
