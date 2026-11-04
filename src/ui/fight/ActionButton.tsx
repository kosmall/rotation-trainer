// One action bar slot (spec §5.2): the icon over its initials, the key in the top right corner,
// the GCD or cooldown sweep (a conic gradient driven by the CSS variable `--p`, written on the
// element in a layout effect), the cooldown time, the reject flash and the coach glow.

import { memo, useLayoutEffect, useRef } from 'react';
import type { SlotFlash } from '../ActionBar';
import { initials } from '../format';
import { SpellIcon } from '../SpellIcon';

export type SlotState = 'ready' | 'cooldown' | 'nomana' | 'busy';

export interface ActionButtonProps {
  /** The slot (0-based: 0-11 the spell row, 12-17 the item row). */
  slot: number;
  spellId: string;
  name: string;
  icon: string;
  iconKind: 'spell' | 'item';
  hotkey: string;
  /** The tooltip (name, cost, cast time, the item's description). */
  title: string;
  state: SlotState;
  /** The sweep's covered part, 0..1 (the GCD or the cooldown left). */
  cdFraction: number;
  /** The cooldown time left ("12s", "2m"), or null. */
  cdText: string | null;
  /** The spell sits in the spell queue. */
  queued: boolean;
  /** The coach's pick ("Next by the script"). */
  next: boolean;
  flash: SlotFlash | null;
  onPress(slot: number): void;
}

export const ActionButton = memo(function ActionButton(props: ActionButtonProps) {
  const { slot, name, icon, iconKind, hotkey, title, state, cdFraction, cdText, queued, next, flash, onPress } = props;
  const sweepRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    sweepRef.current?.style.setProperty('--p', `${Math.round(cdFraction * 3600) / 10}deg`);
  }, [cdFraction]);
  const classes = ['fv-slot', `fv-slot-${state}`, queued && 'fv-slot-queued', next && 'fv-slot-next'].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-label={`${name} (${hotkey})`}
      title={title}
      onMouseDown={(e) => e.preventDefault() /* keep focus off the slot: Space must not click it */}
      onClick={() => onPress(slot)}
    >
      <span className="fv-slot-initials" aria-hidden="true">
        {initials(name)}
      </span>
      <SpellIcon icon={icon} kind={iconKind} className="fv-slot-img" />
      <span ref={sweepRef} className={cdFraction > 0 ? 'fv-slot-sweep' : 'fv-slot-sweep fv-off'} aria-hidden="true" />
      {cdText !== null && (
        <span className="fv-slot-cd" aria-hidden="true">
          {cdText}
        </span>
      )}
      <span className="fv-slot-key" aria-hidden="true">
        {hotkey}
      </span>
      {flash && (
        <span key={flash.id} className="fv-slot-flash" role="status">
          {flash.label}
        </span>
      )}
    </button>
  );
});

/** An unbound slot: its key only. */
export const EmptySlot = memo(function EmptySlot({ hotkey }: { hotkey: string }) {
  return (
    <div className="fv-slot fv-slot-empty" aria-label={`Empty slot (${hotkey})`}>
      <span className="fv-slot-key" aria-hidden="true">
        {hotkey}
      </span>
    </div>
  );
});
