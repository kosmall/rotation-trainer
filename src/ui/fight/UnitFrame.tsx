// A game unit frame (spec §5.2): a cut-stone frame with a round portrait, the unit's name, its
// bars and an aura row. Compound: `UnitFrame` is the frame, `UnitFrame.Portrait`, `.Name`, `.Bar`
// and `.Auras` its parts. Every part is memoized and takes primitives (or a memoized array).

import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AuraRow } from './AuraRow';
import type { AuraIconView } from './fightViewModel';

interface FrameProps {
  /** The frame's accessible name ("Target", "You"). */
  label: string;
  /** 'target' (bottom centre, right) or 'player' (bottom centre, left). */
  unit: 'target' | 'player';
  children: ReactNode;
}

function Frame({ label, unit, children }: FrameProps) {
  return (
    <section className={`fv-frame fv-uf fv-uf-${unit}`} aria-label={label}>
      {children}
    </section>
  );
}

/** The round portrait: an icon (`img`) or a glyph, with an optional level badge. Decorative. */
const Portrait = memo(function Portrait({ children, level }: { children: ReactNode; level?: number }) {
  return (
    <div className="fv-portrait" aria-hidden="true">
      {children}
      {level !== undefined && <span className="fv-lvl">{level}</span>}
    </div>
  );
});

/** The unit's name (a heading) and a line under it ("Boss, level 73"). */
const Name = memo(function Name({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="fv-uf-name">
      <h2>{name}</h2>
      <span>{sub}</span>
    </div>
  );
});

interface BarProps {
  variant: 'health' | 'resource';
  /** The bar's accessible name ("Target health", "Mana"). */
  label: string;
  value: number;
  max: number;
  /** Left text ("6,284 / 10,679"). */
  text: string;
  /** Right text ("59%"). */
  right: string;
}

/** A health or resource bar (role progressbar: its value is read out, its fill is decoration). */
const Bar = memo(function Bar({ variant, label, value, max, text, right }: BarProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className={`fv-bar fv-bar-${variant}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
    >
      <i style={{ transform: `scaleX(${fraction})` } as CSSProperties} />
      <span>
        <span>{text}</span>
        <span>{right}</span>
      </span>
    </div>
  );
});

/** The frame's aura row (a list named `label`). */
const Auras = memo(function Auras({ label, views, reduceMotion }: { label: string; views: readonly AuraIconView[]; reduceMotion: boolean }) {
  return <AuraRow label={label} views={views} reduceMotion={reduceMotion} className="fv-uf-auras" />;
});

export const UnitFrame = Object.assign(Frame, { Portrait, Name, Bar, Auras });
