import type { CSSProperties } from 'react';
import type { SpecData } from '../data/types';
import type { CastResult, SimSnapshot, SpellDef } from '../engine/types';
import { SCHOOL_COLORS, formatInt, initials, remainingText, secondsText } from './format';
import { SpellIcon } from './SpellIcon';
import { ITEM_SLOT_KEYS, SPELL_SLOT_KEYS } from './keys';

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
  /** Tooltip text per spell id (the item actions' catalog descriptions). */
  descriptions?: Readonly<Record<string, string>>;
  /** Spell ids whose icon is an item icon (public/icons/items/: the gear's on-use effects); the rest use spell icons. */
  itemIcons?: ReadonlySet<string>;
}

/**
 * The spell row (slots 0-11, keys 1-9, 0, -, =; an unbound slot shows as empty) and, under it, the
 * item row "Items" (slots 12-17, keys `ITEM_SLOT_KEYS`: Z X C V B N) with only the bound item
 * slots (the worn on-use effects, always, then the enabled potions and rune), nothing when none is bound.
 */
export function ActionBar({ spec, snapshot, flash, onPress, descriptions, itemIcons }: ActionBarProps) {
  const gcdLeftMs = snapshot.phase === 'running' ? Math.max(0, snapshot.gcdEndsAtMs - snapshot.nowMs) : 0;
  // Measured against the current GCD length (a haste change mid-GCD only shifts the sweep).
  const gcdFraction = Math.min(1, gcdLeftMs / Math.max(1, snapshot.gcdMs));
  const spellOf = (slot: number) => spec.spells.find((s) => s.id === spec.keybinds[slot]);
  const slotOf = (spell: SpellDef, slot: number, hotkey: string) => (
    <SpellSlot
      key={hotkey}
      spell={spell}
      hotkey={hotkey}
      description={descriptions?.[spell.id]}
      iconKind={itemIcons?.has(spell.id) ? 'item' : 'spell'}
      snapshot={snapshot}
      gcdFraction={spell.onGcd ? gcdFraction : 0}
      flash={flash?.slot === slot ? flash : null}
      onPress={() => onPress(slot)}
    />
  );
  const items = ITEM_SLOT_KEYS.flatMap((key, i) => {
    const slot = SPELL_SLOT_KEYS.length + i;
    const spell = spellOf(slot);
    return spell ? [slotOf(spell, slot, key.toUpperCase())] : [];
  });

  return (
    <>
      <div className="action-bar" role="toolbar" aria-label="Action bar">
        {SPELL_SLOT_KEYS.map((key, slot) => {
          const spell = spellOf(slot);
          if (spell) return slotOf(spell, slot, key);
          return (
            <div key={key} className="slot slot-empty" aria-label={`Empty slot (${key})`}>
              <span className="slot-key" aria-hidden="true">
                {key}
              </span>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="item-bar" role="group" aria-label="Item bar">
          <span className="item-bar-label" aria-hidden="true">
            Items
          </span>
          {items}
        </div>
      )}
    </>
  );
}

interface SpellSlotProps {
  spell: SpellDef;
  hotkey: string;
  /** Tooltip text under the name (an item's effect). */
  description?: string;
  /** Where the icon file lives (`SpellIcon` `kind`). */
  iconKind: 'spell' | 'item';
  snapshot: SimSnapshot;
  gcdFraction: number;
  flash: SlotFlash | null;
  onPress(): void;
}

function SpellSlot({ spell, hotkey, description, iconKind, snapshot, gcdFraction, flash, onPress }: SpellSlotProps) {
  const cooldownMs = snapshot.cooldownRemainingMs[spell.id] ?? 0;
  // Effective values (talents, gear, auras, haste) from the snapshot.
  const { manaCost, castTimeMs } = snapshot.spells[spell.id] ?? { manaCost: spell.manaCost, castTimeMs: spell.castTimeMs };
  const outOfMana = snapshot.mana < manaCost;
  const queued = snapshot.queuedSpellId === spell.id;
  const castText = castTimeMs > 0 ? `${secondsText(castTimeMs)} s cast` : 'Instant';
  const tooltip = spell.item
    ? `${spell.name}\nItem · off the GCD${description ? `\n${description}` : ''}`
    : `${spell.name}\n${manaCost > 0 ? `${formatInt(manaCost)} mana` : 'No mana cost'} · ${castText}${description ? `\n${description}` : ''}`;
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
      <SpellIcon icon={spell.icon} kind={iconKind} className="slot-icon" />
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
