// Aura icons with timers (spec §5.2): target debuffs (own: red edge, time and charges; others':
// smaller, after a separator) and player buffs (active with time, upcoming dimmed with "in 4.9 s",
// setup buffs small). The last 5 s: red bold time and a pulse (`pulse` class), or a red outline
// without the pulse under reduced motion.

import { memo } from 'react';
import { initials } from '../format';
import { SpellIcon } from '../SpellIcon';
import type { AuraIconView } from './fightViewModel';

interface AuraIconProps {
  view: AuraIconView;
  reduceMotion: boolean;
}

/** Same text, icon and state (the views are rebuilt every frame; most frames change nothing shown). */
function sameView(a: AuraIconView, b: AuraIconView): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.name === b.name &&
      a.icon === b.icon &&
      a.iconKind === b.iconKind &&
      a.time === b.time &&
      a.count === b.count &&
      a.label === b.label &&
      a.title === b.title &&
      a.variant === b.variant &&
      a.expiring === b.expiring)
  );
}

/** One aura: icon over an initials tile, count in the corner, time under it. */
export const AuraIcon = memo(function AuraIcon({ view, reduceMotion }: AuraIconProps) {
  const classes = [
    'fv-aura',
    `fv-aura-${view.variant}`,
    view.expiring && 'expiring',
    view.expiring && !reduceMotion && 'pulse',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes} aria-label={view.label} title={view.title}>
      <span className="fv-aura-icon" aria-hidden="true">
        <span className="fv-aura-initials">{initials(view.name)}</span>
        {view.icon !== null && <SpellIcon icon={view.icon} kind={view.iconKind === 'item' ? 'item' : 'spell'} className="fv-aura-img" />}
        {view.count !== null && <span className="fv-aura-count">{view.count}</span>}
      </span>
      {view.time !== null && (
        <span className="fv-aura-time" aria-hidden="true">
          {view.time}
        </span>
      )}
    </li>
  );
}, (a, b) => a.reduceMotion === b.reduceMotion && sameView(a.view, b.view));

export interface AuraRowProps {
  /** The list's accessible name ("Debuffs on the target", "Active buffs"). */
  label: string;
  /** Rebuilt once per snapshot by the caller (memoized). */
  views: readonly AuraIconView[];
  reduceMotion: boolean;
  className?: string;
}

/** A row of aura icons; others' auras (variant 'other') follow the own ones after a separator. */
export const AuraRow = memo(function AuraRow({ label, views, reduceMotion, className }: AuraRowProps) {
  const firstOther = views.findIndex((v) => v.variant === 'other');
  return (
    <ul className={className ? `fv-auras ${className}` : 'fv-auras'} aria-label={label}>
      {views.map((v, i) => (
        <AuraSlot key={v.id} view={v} reduceMotion={reduceMotion} separator={i === firstOther && i > 0} />
      ))}
    </ul>
  );
});

function AuraSlot({ view, reduceMotion, separator }: AuraIconProps & { separator: boolean }) {
  if (!separator) return <AuraIcon view={view} reduceMotion={reduceMotion} />;
  return (
    <>
      <li className="fv-aura-sep" aria-hidden="true" />
      <AuraIcon view={view} reduceMotion={reduceMotion} />
    </>
  );
}
