import type { SpecData } from '../data/types';
import type { AuraView } from '../engine/types';
import { SCHOOL_COLORS, initials, remainingText } from './format';
import { SpellIcon } from './SpellIcon';

interface AuraListProps {
  spec: SpecData;
  auras: Record<string, AuraView>;
  label: string;
  /**
   * Time left in the fight (`durationMs - nowMs`): the shown time left of an aura never exceeds
   * it. A whole-fight raid debuff has a one-hour own duration (ruling S3) that the end of the
   * fight cuts; it shows the time to the fight's end, not "60m".
   */
  fightRemainingMs?: number;
}

/**
 * Aura chips: icon (initials underneath), name, stacks or charges, and time left. Nothing when no
 * aura is up. An own aura neutralized by a raid debuff gets "(no extra effect)" after its name.
 */
export function AuraList({ spec, auras, label, fightRemainingMs = Infinity }: AuraListProps) {
  const views = Object.values(auras);
  if (views.length === 0) return null;
  return (
    <ul className="aura-list" aria-label={label}>
      {views.map((view) => {
        const def = spec.auras.find((a) => a.id === view.auraId);
        const name = def?.name ?? view.auraId;
        // Coloured like the spell that applies it (hook-applied auras: their DoT or shadow).
        const school =
          spec.spells.find((s) => s.applyAura?.auraId === view.auraId)?.school ?? def?.tick?.school ?? 'shadow';
        const count = view.stacks > 1 ? view.stacks : view.charges > 0 ? view.charges : null;
        // An own aura that a raid debuff replaces multiplies by 1 (neutralizeOwnAuras, rulings
        // S1 and S2): still shown (it keeps its slot and charges), but marked as adding nothing.
        const shown = def?.damageTakenMult?.mult === 1 ? `${name} (no extra effect)` : name;
        return (
          <li key={view.auraId} className="aura" title={count === null ? shown : `${shown} (${count})`}>
            <span className="aura-icon" style={{ background: SCHOOL_COLORS[school] }}>
              {initials(name)}
              {def && <SpellIcon icon={def.icon} className="aura-image" />}
              {count !== null && <span className="aura-count">{count}</span>}
            </span>
            <span className="aura-name">{shown}</span>
            <span className="aura-time">{remainingText(Math.max(0, Math.min(view.remainingMs, fightRemainingMs)))}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The target dummy: name, a health bar that never moves, and its debuffs. */
export function TargetPanel({
  spec,
  targetAuras,
  fightRemainingMs,
}: {
  spec: SpecData;
  targetAuras: Record<string, AuraView>;
  fightRemainingMs?: number;
}) {
  return (
    <div className="target-panel">
      <div className="target-name">Raid Target Dummy</div>
      <div className="target-level">Level 73 boss · dummy</div>
      <div
        className="bar health-bar"
        role="progressbar"
        aria-label="Target health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
      >
        <div className="bar-fill" style={{ width: '100%' }} />
        <span className="bar-text">100%</span>
      </div>
      <AuraList spec={spec} auras={targetAuras} label="Target debuffs" fightRemainingMs={fightRemainingMs} />
    </div>
  );
}
