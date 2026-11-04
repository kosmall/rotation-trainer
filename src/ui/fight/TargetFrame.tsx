// The target's unit frame (spec §5.2, top centre): skull portrait with the level, name, a health
// bar that never moves (a training dummy) with the damage taken, and the debuffs with timers.

import { memo } from 'react';
import { formatInt } from '../format';
import type { AuraIconView } from './fightViewModel';
import { UnitFrame } from './UnitFrame';

/** The dummy's display name and level: a level 73 raid boss (src/data/common/target.ts, BOSS_TARGET). */
export const TARGET_NAME = 'Raid Target Dummy';
const TARGET_LEVEL = 73;

function Skull() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C7 2 4 5.4 4 9.6c0 2.6 1.2 4.4 2.8 5.5V18a1 1 0 0 0 1 1H9v2h2v-2h2v2h2v-2h1.2a1 1 0 0 0 1-1v-2.9C18.8 14 20 12.2 20 9.6 20 5.4 17 2 12 2zM8.6 13.2a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6.8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
      />
    </svg>
  );
}

export interface TargetFrameProps {
  damageTotal: number;
  /** `targetDebuffViews` of the snapshot (memoized per snapshot). */
  debuffs: readonly AuraIconView[];
  reduceMotion: boolean;
}

export const TargetFrame = memo(function TargetFrame({ damageTotal, debuffs, reduceMotion }: TargetFrameProps) {
  return (
    <UnitFrame label="Target" unit="target">
      <UnitFrame.Portrait level={TARGET_LEVEL}>
        <Skull />
      </UnitFrame.Portrait>
      <UnitFrame.Name name={TARGET_NAME} sub={`Boss, level ${TARGET_LEVEL}`} />
      <div className="fv-uf-bars">
        <UnitFrame.Bar variant="health" label="Target health" value={100} max={100} text={`${formatInt(damageTotal)} taken`} right="100%" />
      </div>
      <UnitFrame.Auras label="Debuffs on the target" views={debuffs} reduceMotion={reduceMotion} />
    </UnitFrame>
  );
});
