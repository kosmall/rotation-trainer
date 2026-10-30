import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GemColor } from '../engine/types';
import { initials } from './format';
import { SpellIcon } from './SpellIcon';

/** One candidate of a picker: an item, a gem or an enchant. */
export interface PickerOption {
  id: number;
  name: string;
  icon: string;
  /** Content phase (items, gems): shown and used by the phase filter. */
  phase?: number;
  /** Short stat text ("+40 SP, +12 crit"). */
  stats: string;
  /** Short markers ("Horde only", "Tailoring", "Effect not modelled"). */
  markers: readonly string[];
  /** Full text of the effects, as a tooltip. */
  title?: string;
  /** A gem's colour (shown as a pip; the colour filter uses it). */
  color?: GemColor;
  /** A gem matches the socket's colour (for the socket bonus). */
  matches?: boolean;
  /** Listed only when "show hidden" is ticked (effect-only items), unless it is the current one. */
  hidden?: boolean;
  /** What the slot or socket holds now. */
  current?: boolean;
}

export interface ItemPickerProps {
  /** The dialog's name ("Choose Head item"). */
  title: string;
  /** The candidates, already sorted. */
  options: readonly PickerOption[];
  onPick(id: number): void;
  onClose(): void;
  /** The "nothing" choice ("No gem", "No enchant"): shown when given. */
  none?: { label: string; onPick(): void };
  /** Offer the "Up to phase N" filter. */
  phaseFilter?: boolean;
  /** Offer the colour filter (gem pickers). */
  colourFilter?: boolean;
  /** The label of the "show hidden options" checkbox (when some options are `hidden`). */
  hiddenLabel?: string;
  /** Why the last pick was refused (shown as an alert; the dialog stays open). */
  message?: string | null;
}

const PHASES = [1, 2, 3, 4, 5];
const COLOURS: readonly GemColor[] = ['red', 'yellow', 'blue', 'orange', 'purple', 'green', 'prismatic', 'meta'];

/**
 * A modal list to choose an item, gem or enchant: a search box (it takes the focus), optional
 * phase and colour filters, a "show hidden" toggle, the candidates as buttons (name, stats, phase,
 * markers; the current one marked), and Close. Escape closes it; the search box and the selects
 * are text-like fields, so typing in them never reaches the fight's hotkeys (ruling S5).
 */
export function ItemPicker({
  title,
  options,
  onPick,
  onClose,
  none,
  phaseFilter = false,
  colourFilter = false,
  hiddenLabel,
  message,
}: ItemPickerProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [maxPhase, setMaxPhase] = useState<number | null>(null);
  const [colour, setColour] = useState<'all' | 'match' | GemColor>('all');
  const [showHidden, setShowHidden] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const hiddenCount = options.filter((o) => o.hidden && !o.current).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        (o.current || !o.hidden || showHidden) &&
        (q === '' || o.name.toLowerCase().includes(q)) &&
        (maxPhase === null || o.phase === undefined || o.phase <= maxPhase) &&
        (colour === 'all' || (colour === 'match' ? o.matches === true : o.color === colour)),
    );
  }, [options, query, maxPhase, colour, showHidden]);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation(); // Escape closes the list, it does not cancel a cast
          onClose();
        }}
      >
        <div className="picker-head">
          <h3>{title}</h3>
          <button type="button" className="picker-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="picker-filters">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {phaseFilter && (
            <label>
              <span>Phase</span>
              <select
                aria-label="Phase"
                value={maxPhase === null ? '' : String(maxPhase)}
                onChange={(e) => setMaxPhase(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">All</option>
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    Up to phase {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          {colourFilter && (
            <label>
              <span>Colour</span>
              <select aria-label="Colour" value={colour} onChange={(e) => setColour(e.target.value as typeof colour)}>
                <option value="all">All</option>
                <option value="match">Matches the socket</option>
                {COLOURS.filter((c) => options.some((o) => o.color === c)).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hiddenLabel && hiddenCount > 0 && (
            <label className="picker-toggle">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
              {hiddenLabel} ({hiddenCount})
            </label>
          )}
        </div>
        {message && (
          <p className="picker-message" role="alert">
            {message}
          </p>
        )}
        <p className="hint picker-count" id={`${id}-count`}>
          {shown.length} of {options.length}
        </p>
        <ul className="picker-list" aria-describedby={`${id}-count`}>
          {none && (
            <li>
              <button type="button" className="picker-option picker-none" onClick={none.onPick}>
                {none.label}
              </button>
            </li>
          )}
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={o.current ? 'picker-option picker-current' : 'picker-option'}
                aria-current={o.current ? 'true' : undefined}
                title={o.title}
                onClick={() => onPick(o.id)}
              >
                <span className="gear-icon" aria-hidden="true">
                  {initials(o.name)}
                  {o.icon !== '' && <SpellIcon kind="item" icon={o.icon} className="gear-icon-image" />}
                </span>
                <span className="picker-text">
                  <span className="picker-name">{o.name}</span>
                  <span className="picker-stats">{o.stats === '' ? 'No modelled stats' : o.stats}</span>
                </span>
                <span className="picker-markers">
                  {o.color && <span className={`gem-dot socket-${o.color}`} title={o.color} />}
                  {o.matches && <span className="marker">Matches</span>}
                  {o.phase !== undefined && <span className="marker">P{o.phase}</span>}
                  {o.markers.map((m) => (
                    <span key={m} className="marker">
                      {m}
                    </span>
                  ))}
                  {o.current && <span className="marker marker-current">Worn</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
