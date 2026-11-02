import { useState } from 'react';

// The number input of the Setup panel (moved here from SetupPanel.tsx unchanged, simulator Task 3,
// so the item-use editor can use it too), with an optional `onClear` for fields that may be empty.

/**
 * A number typed into an input, clamped to [min, max], or null when there is none (empty or
 * not a number): the caller then keeps its last valid value. Never NaN.
 */
export function parseClamped(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  return Math.min(Math.max(value, min), max);
}

export interface NumberFieldProps {
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
  /**
   * An optional field: an emptied text is passed on as "none" at once (otherwise an empty text is
   * not passed on and the last value comes back on blur).
   */
  onClear?(): void;
}

/**
 * A number input controlled by `value`. While typing, the typed text stays as typed (a draft):
 * each valid number is clamped and passed on at once; an empty or invalid text is not passed on
 * (an empty one calls `onClear` when given). On blur, or when `value` changes from outside (a
 * preset, Reset), the field shows `value` again.
 */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 'any',
  integer = false,
  disabled,
  placeholder,
  onValue,
  onClear,
}: NumberFieldProps) {
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
        const text = e.target.value;
        if (onClear !== undefined && text.trim() === '') {
          setDraft({ text, shows: '' });
          onClear();
          return;
        }
        const parsed = parseClamped(text, min, max);
        const next = parsed === null ? null : integer ? Math.round(parsed) : parsed;
        setDraft({ text, shows: next === null ? value : String(next) });
        if (next !== null) onValue(next);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
