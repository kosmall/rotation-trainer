// The player's unit frame (spec §5.2, bottom left): the spec's icon as portrait, "You" in the
// class colour, the resource bar, and the five-second rule line ("Regen in 1.8 s").

import { memo } from 'react';
import { formatInt, secondsText } from '../format';
import { SpellIcon } from '../SpellIcon';
import { UnitFrame } from './UnitFrame';

/**
 * The five-second rule: no spirit regen for 5 s after a mana-costing cast completes (a copy of the
 * engine's private FIVE_SECOND_RULE_MS, src/engine/sim.ts; wowsims `ManaCost.SpendCost` sets
 * `FiveSecondRuleRefreshTime` to completion + 5 s). Display only.
 */
export const FIVE_SECOND_RULE_MS = 5000;

export interface PlayerFrameProps {
  /** The spec's icon (a spell icon name), or null. */
  icon: string | null;
  /** "Destruction Warlock". */
  specLine: string;
  mana: number;
  maxMana: number;
  /** Time left of the five-second rule (0: regenerating), or null before the fight. */
  regenInMs: number | null;
}

export const PlayerFrame = memo(function PlayerFrame({ icon, specLine, mana, maxMana, regenInMs }: PlayerFrameProps) {
  const pct = maxMana > 0 ? Math.round((Math.min(mana, maxMana) / maxMana) * 100) : 0;
  const fsr = regenInMs === null ? 0 : Math.min(1, regenInMs / FIVE_SECOND_RULE_MS);
  return (
    <UnitFrame label="You" unit="player">
      <UnitFrame.Portrait>{icon !== null && <SpellIcon icon={icon} className="fv-portrait-img" />}</UnitFrame.Portrait>
      <UnitFrame.Name name="You" sub={specLine} />
      <div className="fv-uf-bars">
        <UnitFrame.Bar
          variant="resource"
          label="Mana"
          value={mana}
          max={maxMana}
          text={`${formatInt(Math.floor(mana))} / ${formatInt(maxMana)}`}
          right={`${pct}%`}
        />
      </div>
      <div className="fv-fsr">
        <span className="fv-fsr-pip" aria-hidden="true">
          <i style={{ transform: `scaleX(${fsr})` }} />
        </span>
        <span title="Five-second rule: no spirit regen for 5 s after spending mana">
          {regenInMs !== null && regenInMs > 0 ? `Regen in ${secondsText(regenInMs)} s` : 'Regenerating'}
        </span>
      </div>
    </UnitFrame>
  );
});
