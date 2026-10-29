import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { SpecData } from '../data/types';
import type { CastResult, SimSnapshot, SpellDef } from '../engine/types';
import { SCHOOL_COLORS, initials, remainingText, secondsText } from './format';
import { SLOT_KEYS } from './keys';

export type RejectReason = Extract<CastResult, { ok: false }>['reason'];

/** Rejections worth flashing on the slot, with their label. */
export const REJECT_LABELS: Partial<Record<RejectReason, string>> = {
  cooldown: 'Cooldown',
  gcd: 'GCD',
  busy: 'Busy',
  'no-mana': 'No mana',
  'missing-aura': 'Missing aura',
};

export interface SlotFlash {
  slot: number;
  label: string;
  /** Changes on every rejected press, so the same flash twice restarts the animation. */
  id: number;
}

interface ActionBarProps {
  spec: SpecData;
  snapshot: SimSnapshot;
  flash: SlotFlash | null;
  onPress(slot: number): void;
}

export function ActionBar({ spec, snapshot, flash, onPress }: ActionBarProps) {
  // The snapshot has the GCD end but not its length: remember the fight time at which a new GCD
  // end first appeared (the press itself, as casts are applied at the current fight time).
  const gcd = useRef({ endsAtMs: 0, lengthMs: 1 });
  if (snapshot.gcdEndsAtMs !== gcd.current.endsAtMs) {
    gcd.current = {
      endsAtMs: snapshot.gcdEndsAtMs,
      lengthMs: Math.max(1, snapshot.gcdEndsAtMs - snapshot.nowMs),
    };
  }
  const gcdLeftMs = snapshot.phase === 'running' ? Math.max(0, snapshot.gcdEndsAtMs - snapshot.nowMs) : 0;
  const gcdFraction = Math.min(1, gcdLeftMs / gcd.current.lengthMs);

  return (
    <div className="action-bar" role="toolbar" aria-label="Action bar">
      {SLOT_KEYS.map((key, slot) => {
        const spell = spec.spells.find((s) => s.id === spec.keybinds[slot]);
        if (!spell) {
          return (
            <div key={key} className="slot slot-empty" aria-label={`Empty slot (${key})`}>
              <span className="slot-key" aria-hidden="true">
                {key}
              </span>
            </div>
          );
        }
        return (
          <SpellSlot
            key={key}
            spell={spell}
            hotkey={key}
            snapshot={snapshot}
            gcdFraction={spell.onGcd ? gcdFraction : 0}
            flash={flash?.slot === slot ? flash : null}
            onPress={() => onPress(slot)}
          />
        );
      })}
    </div>
  );
}

interface SpellSlotProps {
  spell: SpellDef;
  hotkey: string;
  snapshot: SimSnapshot;
  gcdFraction: number;
  flash: SlotFlash | null;
  onPress(): void;
}

function SpellSlot({ spell, hotkey, snapshot, gcdFraction, flash, onPress }: SpellSlotProps) {
  const cooldownMs = snapshot.cooldownRemainingMs[spell.id] ?? 0;
  // Base cost from the spell data: talent cost reductions are not in the snapshot.
  const outOfMana = snapshot.mana < spell.manaCost;
  const queued = snapshot.queuedSpellId === spell.id;
  const castText = spell.castTimeMs > 0 ? `${secondsText(spell.castTimeMs)} s cast` : 'Instant';
  // Base values from the spell data (before talents such as Bane or Cataclysm).
  const tooltip = `${spell.name}\nBase: ${spell.manaCost > 0 ? `${spell.manaCost} mana` : 'no mana cost'} · ${castText}`;
  const classes = ['slot', outOfMana && 'slot-oom', queued && 'slot-queued'].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={{ background: SCHOOL_COLORS[spell.school] }}
      aria-label={`${spell.name} (${hotkey})`}
      title={tooltip}
      onMouseDown={(e) => e.preventDefault() /* keep focus off the slot: Space must not click it */}
      onClick={onPress}
    >
      <span className="slot-initials" aria-hidden="true">
        {initials(spell.name)}
      </span>
      {gcdFraction > 0 && (
        <span className="slot-gcd" aria-hidden="true" style={{ '--sweep': `${gcdFraction * 360}deg` } as CSSProperties} />
      )}
      {cooldownMs > 0 && (
        <span className="slot-cooldown" aria-hidden="true">
          {remainingText(cooldownMs)}
        </span>
      )}
      <span className="slot-key" aria-hidden="true">
        {hotkey}
      </span>
      {flash && (
        <span key={flash.id} className="slot-flash" role="status">
          {flash.label}
        </span>
      )}
    </button>
  );
}
