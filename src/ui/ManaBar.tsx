import type { SimSnapshot } from '../engine/types';
import { formatInt } from './format';

export function ManaBar({ snapshot }: { snapshot: SimSnapshot }) {
  const { mana, maxMana } = snapshot;
  const fraction = maxMana > 0 ? Math.min(1, Math.max(0, mana / maxMana)) : 0;
  return (
    <div
      className="bar mana-bar"
      role="progressbar"
      aria-label="Mana"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxMana)}
      aria-valuenow={Math.round(mana)}
    >
      <div className="bar-fill" style={{ width: `${fraction * 100}%` }} />
      <span className="bar-text">
        {formatInt(Math.floor(mana))} / {formatInt(maxMana)}
      </span>
    </div>
  );
}
