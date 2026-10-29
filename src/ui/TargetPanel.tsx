import type { SpecData } from '../data/types';
import type { AuraView } from '../engine/types';
import { SCHOOL_COLORS, initials, remainingText } from './format';

interface AuraListProps {
  spec: SpecData;
  auras: Record<string, AuraView>;
  label: string;
}

/** Aura chips: initials, name, stacks or charges, and time left. Nothing when no aura is up. */
export function AuraList({ spec, auras, label }: AuraListProps) {
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
        return (
          <li key={view.auraId} className="aura" title={count === null ? name : `${name} (${count})`}>
            <span className="aura-icon" style={{ background: SCHOOL_COLORS[school] }}>
              {initials(name)}
              {count !== null && <span className="aura-count">{count}</span>}
            </span>
            <span className="aura-name">{name}</span>
            <span className="aura-time">{remainingText(view.remainingMs)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The target dummy: name, a health bar that never moves, and its debuffs. */
export function TargetPanel({ spec, targetAuras }: { spec: SpecData; targetAuras: Record<string, AuraView> }) {
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
      <AuraList spec={spec} auras={targetAuras} label="Target debuffs" />
    </div>
  );
}
