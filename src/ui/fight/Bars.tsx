// The bars at the bottom of the arena (spec §5.2): the cast bar (with the spell queue window drawn
// as a hatched end), the item bar (Z X C V B N: only the bound item slots) and the action bar
// (12 slots, keys 1-9, 0, -, =). `Bars` turns the snapshot into each slot's primitives once per
// frame; the memoized `ActionButton`s re-render only when theirs change.

import { memo } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../../data/common/ratings';
import type { SpecData } from '../../data/types';
import type { SimSnapshot, SpellDef } from '../../engine/types';
import type { SlotFlash } from './slotFlash';
import { formatInt, remainingText, secondsText } from '../format';
import { ITEM_SLOT_KEYS, SPELL_SLOT_KEYS } from '../keys';
import { SpellIcon } from '../SpellIcon';
import { ActionButton, EmptySlot } from './ActionButton';
import type { SlotState } from './ActionButton';

export interface CastBarProps {
  /** The spell being cast, or null when idle (the bar keeps its height). */
  spellId: string | null;
  name: string;
  icon: string | null;
  /** Elapsed and total cast time, ms. */
  elapsedMs: number;
  lengthMs: number;
}

/** The cast in progress: icon, fill, name, elapsed / total, and the spell queue window's start. */
export const CastBar = memo(function CastBar({ spellId, name, icon, elapsedMs, lengthMs }: CastBarProps) {
  if (spellId === null) return <div className="fv-castbar fv-idle" aria-hidden="true" />;
  const length = Math.max(1, lengthMs);
  const progress = Math.min(1, Math.max(0, elapsedMs / length));
  const queueShare = Math.min(1, SPELL_QUEUE_WINDOW_MS / length);
  const queueInMs = Math.max(0, length - SPELL_QUEUE_WINDOW_MS - elapsedMs);
  return (
    <div className="fv-castbar">
      {icon !== null ? <SpellIcon icon={icon} className="fv-castbar-img" /> : <span className="fv-castbar-img" />}
      <div
        className="fv-bar fv-bar-cast"
        role="progressbar"
        aria-label="Cast bar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <i style={{ transform: `scaleX(${progress})` }} />
        <span className="fv-queue" style={{ width: `${queueShare * 100}%` }} title="Spell queue window: a press now is queued" />
        <span>
          <b>{name}</b>
          <span>
            {secondsText(Math.min(elapsedMs, length))} / {secondsText(length)}
          </span>
        </span>
      </div>
      <div className="fv-castbar-cap">
        <span>{queueInMs >= 50 ? `Queue opens in ${secondsText(queueInMs)} s` : 'Queue open: a press now is queued'}</span>
      </div>
    </div>
  );
});

export interface BarsProps {
  spec: SpecData;
  snapshot: SimSnapshot;
  flash: SlotFlash | null;
  onPress(slot: number): void;
  /** Tooltip text per spell id (the item actions' catalog descriptions). */
  descriptions: Readonly<Record<string, string>>;
  /** Spell ids whose icon is an item icon. */
  itemIcons: ReadonlySet<string>;
  /** The coach's pick (a spell id), or null (coach off, or nothing to press). */
  nextSpellId: string | null;
}

function tooltip(spell: SpellDef, snapshot: SimSnapshot, description: string | undefined): string {
  const { manaCost, castTimeMs } = snapshot.spells[spell.id] ?? { manaCost: spell.manaCost, castTimeMs: spell.castTimeMs };
  const castText = castTimeMs > 0 ? `${secondsText(castTimeMs)} s cast` : 'Instant';
  return spell.item
    ? `${spell.name}\nItem · off the GCD${description ? `\n${description}` : ''}`
    : `${spell.name}\n${manaCost > 0 ? `${formatInt(manaCost)} mana` : 'No mana cost'} · ${castText}${description ? `\n${description}` : ''}`;
}

/** The cast bar, the item bar and the action bar. Renders per frame; its slots do not. */
export function Bars({ spec, snapshot, flash, onPress, descriptions, itemIcons, nextSpellId }: BarsProps) {
  const running = snapshot.phase === 'running';
  const gcdLeftMs = running ? Math.max(0, snapshot.gcdEndsAtMs - snapshot.nowMs) : 0;
  // Measured against the current GCD length (a haste change mid-GCD only shifts the sweep).
  const gcdFraction = Math.min(1, gcdLeftMs / Math.max(1, snapshot.gcdMs));
  const spellOf = (slot: number) => spec.spells.find((s) => s.id === spec.keybinds[slot]);
  const button = (spell: SpellDef, slot: number, hotkey: string) => {
    const cooldownMs = snapshot.cooldownRemainingMs[spell.id] ?? 0;
    const cost = snapshot.spells[spell.id]?.manaCost ?? spell.manaCost;
    const state: SlotState =
      cooldownMs > 0 ? 'cooldown' : snapshot.mana < cost ? 'nomana' : running && snapshot.cast !== null ? 'busy' : 'ready';
    const cdTotal = Math.max(spell.cooldownMs, spell.sharedCooldown?.ms ?? 0, cooldownMs);
    const cdFraction = cooldownMs > 0 ? cooldownMs / Math.max(1, cdTotal) : spell.onGcd && !spell.item ? gcdFraction : 0;
    return (
      <ActionButton
        key={hotkey}
        slot={slot}
        spellId={spell.id}
        name={spell.name}
        icon={spell.icon}
        iconKind={itemIcons.has(spell.id) ? 'item' : 'spell'}
        hotkey={hotkey}
        title={tooltip(spell, snapshot, descriptions[spell.id])}
        state={state}
        cdFraction={Math.round(cdFraction * 200) / 200}
        cdText={cooldownMs > 0 ? remainingText(cooldownMs) : null}
        queued={snapshot.queuedSpellId === spell.id}
        next={nextSpellId === spell.id}
        flash={flash?.slot === slot ? flash : null}
        onPress={onPress}
      />
    );
  };
  const items = ITEM_SLOT_KEYS.flatMap((key, i) => {
    const slot = SPELL_SLOT_KEYS.length + i;
    const spell = spellOf(slot);
    return spell ? [button(spell, slot, key.toUpperCase())] : [];
  });
  const cast = snapshot.cast;
  const castSpell = cast ? spec.spells.find((s) => s.id === cast.spellId) : undefined;
  return (
    <div className="fv-bars">
      <CastBar
        spellId={cast?.spellId ?? null}
        name={castSpell?.name ?? cast?.spellId ?? ''}
        icon={castSpell?.icon ?? null}
        // A cast can be scheduled to end after the fight does: it is cut there.
        elapsedMs={cast ? snapshot.nowMs - cast.startMs : 0}
        lengthMs={cast ? Math.min(cast.endMs, Math.max(snapshot.durationMs, cast.startMs + 1)) - cast.startMs : 0}
      />
      {items.length > 0 && (
        <div className="fv-itembar fv-frame fv-clean" role="group" aria-label="Item bar">
          <span className="fv-bar-label" aria-hidden="true">
            Items
          </span>
          {items}
        </div>
      )}
      <div className="fv-actionbar fv-frame fv-clean" role="toolbar" aria-label="Action bar">
        {SPELL_SLOT_KEYS.map((key, slot) => {
          const spell = spellOf(slot);
          return spell ? button(spell, slot, key) : <EmptySlot key={key} hotkey={key} />;
        })}
      </div>
    </div>
  );
}
