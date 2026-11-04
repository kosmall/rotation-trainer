// The "Combat text" panel (scrolling combat text Task 2): the HUD preferences. Fully controlled:
// it shows `settings` and passes every edit to `onChange` normalized (`normalizeHudSettings`);
// the caller saves it. Interface preferences only: never part of the fight setup, usable while a
// fight runs (the next texts follow the change).

import { memo, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_HUD_SETTINGS, HUD_SETTING_LIMITS, normalizeHudSettings } from './hudSettings';
import type { HudAnimation, HudSettings } from './hudSettings';

type BooleanKey = { [K in keyof HudSettings]: HudSettings[K] extends boolean ? K : never }[keyof HudSettings];
type NumberKey = keyof typeof HUD_SETTING_LIMITS;

/** The categories, each switching exactly its own texts. */
const CATEGORIES: readonly (readonly [BooleanKey, string])[] = [
  ['damage', 'Damage'],
  ['crits', 'Crits'],
  ['ticks', 'DoT ticks'],
  ['misses', 'Misses'],
  ['buffsOn', 'Buffs gained'],
  ['buffsOff', 'Buffs faded'],
  ['procs', 'Procs'],
  ['targetDebuffs', 'Debuffs on the target'],
  ['mana', 'Mana gains'],
  ['itemUse', 'Item use'],
  ['cooldownReady', 'Cooldown ready'],
  ['lowMana', 'Low mana'],
];

const LOOKS: readonly (readonly [BooleanKey, string])[] = [
  ['showIcons', 'Spell icons'],
  ['showSpellNames', 'Spell names'],
];

const NUMBERS: readonly (readonly [NumberKey, string])[] = [
  ['durationMs', 'Text duration (ms)'],
  ['fontPx', 'Font size (px)'],
  ['critScale', 'Crit size (x)'],
  ['minDamage', 'Minimum damage'],
  ['mergeTicks', 'Merge DoT ticks within (ms)'],
  ['mergeManaBelow', 'Merge mana gains below'],
  ['maxTexts', 'Most texts at once'],
  ['lowManaPct', 'Low mana below (%)'],
];

const ANIMATIONS: readonly (readonly [HudAnimation, string])[] = [
  ['straight', 'Straight up'],
  ['parabola', 'Parabola'],
];

/** A typed number, or null for an empty or invalid text. */
function parseNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * A number input controlled by `value`. While focused the typed text stays as typed; a number in
 * [min, max] is passed on at once (no jump to a clamp while typing "24" through "2"). On blur the
 * typed number is clamped and passed on; an empty or invalid text keeps the last value.
 */
function HudNumberField({ id, setting, value, onValue }: { id: string; setting: NumberKey; value: number; onValue(v: number): void }) {
  const { min, max, step } = HUD_SETTING_LIMITS[setting];
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      inputMode={step === 1 ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseNumber(e.target.value);
        if (n !== null && n >= min && n <= max) onValue(n);
      }}
      onBlur={() => {
        const n = draft === null ? null : parseNumber(draft);
        setDraft(null);
        if (n !== null) onValue(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

export interface CombatTextSettingsProps {
  settings: HudSettings;
  onChange(settings: HudSettings): void;
}

/**
 * The collapsed "Combat text" panel in the side column, after Setup and Gear: the whole HUD on or
 * off, a checkbox per category, the animation style, the numbers (clamped on blur), icons and
 * spell names, and "Reset to defaults". Hotkeys stay with the fight except in the number fields
 * and the select (ruling S5, GameView's guard).
 */
export const CombatTextSettings = memo(function CombatTextSettings({ settings, onChange }: CombatTextSettingsProps) {
  return (
    <LazyDetails className="panel setup hud-settings" summary="Combat text">
      <CombatTextForm settings={settings} onChange={onChange} />
    </LazyDetails>
  );
});

/**
 * The combat text settings without the panel's `<details>` (the Setup screen's Combat text section
 * and the legacy panel's body).
 */
export const CombatTextForm = memo(function CombatTextForm({ settings, onChange }: CombatTextSettingsProps) {
  const id = useId();
  const emit = (edit: Partial<HudSettings>) => onChange(normalizeHudSettings({ ...settings, ...edit }));
  const check = (key: BooleanKey, label: string) => (
    <label key={key}>
      <input type="checkbox" checked={settings[key]} onChange={(e) => emit({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <div className="setup-fields">
      <div className="setup-checks">{check('enabled', 'Show combat text')}</div>
      <fieldset className="hud-settings-group">
        <legend>Texts</legend>
        <div className="setup-checks">{CATEGORIES.map(([key, label]) => check(key, label))}</div>
      </fieldset>
      <div className="setup-row">
        <label htmlFor={`${id}-animation`}>Animation</label>
        <select
          id={`${id}-animation`}
          value={settings.animation}
          onChange={(e) => emit({ animation: e.target.value as HudAnimation })}
        >
          {ANIMATIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {NUMBERS.map(([key, label]) => (
        <div className="setup-row" key={key}>
          <label htmlFor={`${id}-${key}`}>{label}</label>
          <HudNumberField id={`${id}-${key}`} setting={key} value={settings[key]} onValue={(v) => emit({ [key]: v })} />
        </div>
      ))}
      <div className="setup-checks">{LOOKS.map(([key, label]) => check(key, label))}</div>
      <div className="setup-preset-buttons">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur(); // keep Space/R for the fight
            onChange(normalizeHudSettings(DEFAULT_HUD_SETTINGS));
          }}
        >
          Reset combat text to defaults
        </button>
      </div>
      <p className="hint">Floating combat text over the fight. It only shows what happens: the fight and its results are the same with it on or off. Saved in this browser.</p>
    </div>
  );
});

/**
 * A `<details>` whose body is rendered only while it is open: the collapsed panel adds no form
 * controls to the page (less work per frame for the browser, assistive tools and tests).
 */
function LazyDetails({ className, summary, children }: { className: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && children}
    </details>
  );
}
