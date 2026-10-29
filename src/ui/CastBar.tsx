import type { SpecData } from '../data/types';
import type { SimSnapshot } from '../engine/types';
import { secondsText } from './format';

/** The cast in progress: spell name, fill and time left. Keeps its height when idle. */
export function CastBar({ spec, snapshot }: { spec: SpecData; snapshot: SimSnapshot }) {
  const cast = snapshot.cast;
  if (!cast) return <div className="cast-bar cast-bar-idle" />;

  const name = spec.spells.find((s) => s.id === cast.spellId)?.name ?? cast.spellId;
  const lengthMs = Math.max(1, cast.endMs - cast.startMs);
  const progress = Math.min(1, Math.max(0, (snapshot.nowMs - cast.startMs) / lengthMs));
  // A cast can be scheduled to end after the fight does; count down to whichever comes first.
  const leftMs = Math.max(0, Math.min(cast.endMs, snapshot.durationMs) - snapshot.nowMs);

  return (
    <div
      className="cast-bar"
      role="progressbar"
      aria-label="Cast bar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="cast-bar-fill" style={{ width: `${progress * 100}%` }} />
      <span className="cast-bar-name">{name}</span>
      <span className="cast-bar-time">{secondsText(leftMs)}</span>
    </div>
  );
}
