// "Your buffs" on the Fight screen (spec §5.2, top right, as the game's buff frame): the timed
// buffs with their time left, the upcoming ones (dimmed, "in 4.9 s"), and the setup's buffs in a
// small second row. It replaced the legacy layout's PlayerBuffsPanel (redesign Tasks 2 and 5).

import { memo } from 'react';
import { buffTimeText, isExpiring, timeLeftWords } from '../buffsView';
import type { BuffViews } from '../buffsView';
import { secondsText } from '../format';
import { AuraRow } from './AuraRow';
import type { AuraIconView } from './fightViewModel';

/** The player's buffs as icon views: active (with time), upcoming (dimmed, "in 4.9s"), setup (small). */
export function playerBuffIcons(views: BuffViews, phase: 'ready' | 'running' | 'ended') {
  const active: AuraIconView[] = views.active.map((b) => ({
    id: b.auraId,
    name: b.name,
    icon: b.icon,
    iconKind: b.iconKind ?? 'spell',
    time: buffTimeText(b.remainingMs),
    count: b.count,
    label: `${b.name}, ${timeLeftWords(b.remainingMs)}`,
    title: `${b.name}: ${b.description}`,
    variant: 'mine',
    expiring: phase !== 'ended' && isExpiring(b.remainingMs),
  }));
  const upcoming: AuraIconView[] = views.upcoming.map((u, i) => {
    const when = phase === 'ready' ? `at ${secondsText(u.startsAtMs)} s` : `in ${secondsText(u.inMs)} s`;
    return {
      id: `${u.auraId}-${u.startsAtMs}-${i}`,
      name: u.name,
      icon: u.icon,
      iconKind: u.iconKind ?? 'spell',
      time: phase === 'ready' ? `${secondsText(u.startsAtMs)}s` : `in ${secondsText(u.inMs)}`,
      count: null,
      label: `${u.name} ${when}`,
      title: `${u.name} ${when}`,
      variant: 'upcoming',
      expiring: false,
    };
  });
  const setup: AuraIconView[] = views.permanent.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    iconKind: p.iconKind ?? 'spell',
    time: null,
    count: null,
    label: p.name,
    title: `${p.name}: ${p.description}`,
    variant: 'passive',
    expiring: false,
  }));
  return { active, upcoming, setup };
}

export interface PlayerBuffsProps {
  active: readonly AuraIconView[];
  upcoming: readonly AuraIconView[];
  setup: readonly AuraIconView[];
  reduceMotion: boolean;
}

/** "Your buffs" (top right, as the game's buff frame): timed buffs, upcoming ones, the setup's. */
export const PlayerBuffs = memo(function PlayerBuffs({ active, upcoming, setup, reduceMotion }: PlayerBuffsProps) {
  return (
    <section className="fv-player-buffs" aria-label="Your buffs">
      <h2 className="sr-only">Your buffs</h2>
      {active.length === 0 ? (
        <p className="sr-only">No active buffs</p>
      ) : (
        <AuraRow label="Active buffs" views={active} reduceMotion={reduceMotion} />
      )}
      {upcoming.length > 0 && <AuraRow label="Upcoming buffs" views={upcoming} reduceMotion={reduceMotion} />}
      {setup.length > 0 && (
        <>
          <AuraRow label="Setup buffs" views={setup} reduceMotion={reduceMotion} className="fv-auras-setup" />
          <span className="fv-lab">Setup buffs last the whole fight</span>
        </>
      )}
    </section>
  );
});
