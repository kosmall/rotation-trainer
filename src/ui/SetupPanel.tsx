import { useId, useState } from 'react';
import { ROTATION_PRESETS } from '../data/classes/warlock/rotation';
import type { CurseChoice, RotationConfig, RotationPresetId } from '../data/classes/warlock/rotation';

/** The distance input's range in yards (UI bounds; 28 yd is the default, target.ts). */
export const MIN_DISTANCE_YD = 0;
export const MAX_DISTANCE_YD = 100;
/** UI bound for the Life Tap threshold, well above any level 70 mana pool. */
const MAX_LIFE_TAP_MANA = 20000;
/**
 * The threshold offered when "auto" is switched off and no number was typed yet: about Shadow
 * Bolt's cost (399 with Cataclysm, rotation.ts), so switching changes little until it is edited.
 */
const FIRST_LIFE_TAP_MANA = 400;

const CURSES: { id: CurseChoice; name: string }[] = [
  { id: 'elements', name: 'Curse of the Elements' },
  { id: 'agony', name: 'Curse of Agony' },
  { id: 'doom', name: 'Curse of Doom' },
  { id: 'none', name: 'None' },
];

const PRESET_IDS = Object.keys(ROTATION_PRESETS) as RotationPresetId[];

/** The preset whose values `rotation` has, or 'custom'. */
function presetOf(rotation: RotationConfig): RotationPresetId | 'custom' {
  const keys = Object.keys(ROTATION_PRESETS.dot.config) as (keyof RotationConfig)[];
  return PRESET_IDS.find((id) => keys.every((k) => ROTATION_PRESETS[id].config[k] === rotation[k])) ?? 'custom';
}

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

export interface SetupPanelProps {
  rotation: RotationConfig;
  distanceYd: number;
  onRotation(rotation: RotationConfig): void;
  onDistance(distanceYd: number): void;
  disabled?: boolean;
}

/**
 * The collapsed "Setup" panel: rotation preset, curse, DoT and finisher flags, the Life Tap
 * threshold and the distance from the target. It only ever passes on valid values (a curse from
 * the list, a threshold >= 0 or 'auto', a distance in 0..100), so `buildPriority` never throws.
 * The rotation changes the Priority list at once; the distance applies from the next fight
 * (useSimulation reads it when it builds a Simulation).
 */
export function SetupPanel({ rotation, distanceYd, onRotation, onDistance, disabled = false }: SetupPanelProps) {
  const id = useId();
  // Text being typed into a number input; null shows the current value. A typed value that is
  // not a number stays visible while typing and is replaced by the last valid one on blur.
  const [distanceDraft, setDistanceDraft] = useState<string | null>(null);
  const [lifeTapDraft, setLifeTapDraft] = useState<string | null>(null);
  // The last number threshold, offered again when "auto" is switched off.
  const [lastLifeTap, setLastLifeTap] = useState<number>(
    typeof rotation.lifeTapBelowMana === 'number' ? rotation.lifeTapBelowMana : FIRST_LIFE_TAP_MANA,
  );

  const preset = presetOf(rotation);
  const autoLifeTap = rotation.lifeTapBelowMana === 'auto';
  const update = (patch: Partial<RotationConfig>) => onRotation({ ...rotation, ...patch });

  return (
    <details className="panel setup">
      <summary>Setup</summary>
      <fieldset className="setup-fields" disabled={disabled}>
        <div className="setup-row setup-stack">
          <label htmlFor={`${id}-preset`}>Rotation preset</label>
          <select
            id={`${id}-preset`}
            value={preset}
            onChange={(e) => {
              const next = e.target.value;
              if (!Object.hasOwn(ROTATION_PRESETS, next)) return;
              onRotation({ ...ROTATION_PRESETS[next as RotationPresetId].config });
            }}
          >
            {PRESET_IDS.map((p) => (
              <option key={p} value={p}>
                {ROTATION_PRESETS[p].name}
              </option>
            ))}
            {preset === 'custom' && (
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
            value={rotation.curse}
            onChange={(e) => {
              const curse = CURSES.find((c) => c.id === e.target.value);
              if (curse) update({ curse: curse.id });
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
            <input type="checkbox" checked={rotation.immolate} onChange={(e) => update({ immolate: e.target.checked })} />
            Immolate
          </label>
          <label>
            <input
              type="checkbox"
              checked={rotation.corruption}
              onChange={(e) => update({ corruption: e.target.checked })}
            />
            Corruption
          </label>
          <label>
            <input
              type="checkbox"
              checked={rotation.shadowburnFinisher}
              onChange={(e) => update({ shadowburnFinisher: e.target.checked })}
            />
            Shadowburn finisher
          </label>
        </div>

        <div className="setup-row">
          <label htmlFor={`${id}-lifetap`}>Life Tap below mana</label>
          <input
            id={`${id}-lifetap`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_LIFE_TAP_MANA}
            step={1}
            disabled={autoLifeTap}
            placeholder="auto"
            value={autoLifeTap ? '' : (lifeTapDraft ?? String(rotation.lifeTapBelowMana))}
            onChange={(e) => {
              setLifeTapDraft(e.target.value);
              const value = parseClamped(e.target.value, 0, MAX_LIFE_TAP_MANA);
              if (value === null) return;
              const mana = Math.round(value);
              setLastLifeTap(mana);
              update({ lifeTapBelowMana: mana });
            }}
            onBlur={() => setLifeTapDraft(null)}
          />
        </div>
        <label className="setup-sub">
          <input
            type="checkbox"
            checked={autoLifeTap}
            aria-label="Auto Life Tap threshold (Shadow Bolt cost)"
            onChange={(e) => {
              setLifeTapDraft(null);
              update({ lifeTapBelowMana: e.target.checked ? 'auto' : lastLifeTap });
            }}
          />
          Auto (Shadow Bolt cost)
        </label>

        <div className="setup-row">
          <label htmlFor={`${id}-distance`}>Distance from target (yd)</label>
          <input
            id={`${id}-distance`}
            type="number"
            inputMode="decimal"
            min={MIN_DISTANCE_YD}
            max={MAX_DISTANCE_YD}
            step="any"
            value={distanceDraft ?? String(distanceYd)}
            onChange={(e) => {
              setDistanceDraft(e.target.value);
              const value = parseClamped(e.target.value, MIN_DISTANCE_YD, MAX_DISTANCE_YD);
              if (value !== null) onDistance(value);
            }}
            onBlur={() => setDistanceDraft(null)}
          />
        </div>
        <p className="hint">
          The rotation changes the Priority list at once. A new distance applies from the next fight (press{' '}
          <kbd>R</kbd>); a fight already running keeps its distance.
        </p>
      </fieldset>
    </details>
  );
}
