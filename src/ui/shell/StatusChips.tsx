import { memo } from 'react';
import type { ChipLabels } from '../state/TrainerProvider';
import type { ChipSection } from '../state/selectors';
import { CHIP_SECTIONS } from '../state/selectors';
import { routeHref } from './router';
import type { SetupSection } from './router';

/** Each chip's name, the label it shows and the Setup section it links to. */
const CHIPS: Readonly<Record<ChipSection, { name: string; label: keyof ChipLabels; section: SetupSection }>> = {
  setup: { name: 'Setup', label: 'setupPreset', section: 'buffs' },
  gear: { name: 'Gear', label: 'gear', section: 'gear' },
  talents: { name: 'Talents', label: 'talents', section: 'talents' },
  rotation: { name: 'Rotation', label: 'rotation', section: 'rotation' },
  fight: { name: 'Fight', label: 'fight', section: 'fight' },
};

export const PENDING_TITLE = 'Changed: applies after you reset the fight (R)';

/** A label longer than this is cut with an ellipsis by CSS; the full text is in `title`. */
const LONG_LABEL = 24;

export interface StatusChipsProps {
  labels: ChipLabels;
  pending: Readonly<Record<ChipSection, boolean>>;
}

/**
 * The header's "Next fight" summary: one link per Setup area with the name of the current choice.
 * A chip whose section changed since the running fight started carries the gold pending marker
 * (`.pending`), a `title` and a hidden note for screen readers.
 */
export const StatusChips = memo(function StatusChips({ labels, pending }: StatusChipsProps) {
  return (
    <ul className="status" aria-label="Next fight">
      {CHIP_SECTIONS.map((id) => {
        const chip = CHIPS[id];
        const label = labels[chip.label];
        const isPending = pending[id];
        return (
          <li key={id}>
            <a
              href={routeHref({ mode: 'setup', section: chip.section })}
              className={isPending ? 'pending' : undefined}
              title={isPending ? PENDING_TITLE : label.length > LONG_LABEL ? label : undefined}
            >
              <small>{chip.name}</small> <span className="status-value tnum">{label}</span>
              {isPending && <span className="sr-only">, changed: applies after reset</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
});
