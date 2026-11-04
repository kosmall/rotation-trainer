import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GearPreset } from '../data/classes/warlock/gearPresets';
import { ITEM_SLOTS, itemsForSlot, logicalSlot } from '../data/items/db';
import type { ItemDb, ItemRecord } from '../data/items/types';
import { gemFitsSocket, socketMatches } from '../engine/gear';
import type { EquippedItem, GemColor } from '../engine/types';
import { describeGear, normalizeGear, RING_LIMIT_CATEGORIES, type Gear } from '../setup/gear';
import { deriveGearEffects } from '../setup/gearEffects';
import { exportWowSimsGear, parseWowSimsExport } from '../setup/wowsimsGear';
import { initials } from './format';
import {
  anyEnchantFits,
  enchantsForItem,
  gemsForSocket,
  hasUnmodelledEffect,
  isEffectOnly,
  itemEffectsText,
  itemMarkers,
  matchingPreset,
  metaStatus,
  professionName,
  professionNotes,
  sameEntry,
  slotLabel,
  statsText,
} from './gearView';
import { ItemPicker, type PickerOption } from './ItemPicker';
import { SpellIcon } from './SpellIcon';
import { Modal } from './setup/Modal';

/** The name shown when the gear matches no preset. */
export const CUSTOM_GEAR_NAME = 'Custom';

/** Where the item database stands: not asked for yet, loading, loaded, failed (Reload the page). */
export type GearDbStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GearPanelProps {
  /** The setup's gear (17 entries, `ITEM_SLOTS` order). The panel keeps no copy of it. */
  gear: readonly (EquippedItem | null)[];
  /** The preset buttons, in order (`offeredGearPresets()`). */
  presets: readonly GearPreset[];
  /** The item database, or null until it has loaded. */
  db: ItemDb | null;
  /**
   * Receives every edit as a new gear through `normalizeGear` (and the preset's id when a preset
   * was chosen); the caller runs `normalizeSetup` on the config.
   */
  onChange(gear: Gear, presetId?: string): void;
  disabled?: boolean;
  status?: GearDbStatus;
  /** The panel was opened (the caller loads the database). */
  onOpen?(): void;
  /** Reload the page after the database failed to load (the setup is saved). */
  onReload?(): void;
  /** The running fight was built with another setup: the new gear applies after R. */
  pending?: boolean;
  fightEnded?: boolean;
  /** Warnings from the rest of the setup (none today: an enabled effect of an item not worn is simply inactive). */
  warnings?: readonly string[];
  /** Hints from the rest of the setup (a worn item whose effect is not enabled). */
  hints?: readonly string[];
}

type Picker = { kind: 'item'; slot: number } | { kind: 'gem'; slot: number; socket: number } | { kind: 'enchant'; slot: number };

/** The item record of an entry, or undefined (empty slot, unknown id). */
const recordOf = (db: ItemDb, e: EquippedItem | null | undefined): ItemRecord | undefined =>
  e && Object.hasOwn(db.items, e.id) ? db.items[e.id] : undefined;

const LIMIT_CATEGORY_OF = new Map(
  Object.entries(RING_LIMIT_CATEGORIES).flatMap(([c, ids]) => ids.map((id) => [id, Number(c)] as const)),
);

/** Why `normalizeGear` changed the edited gear `intended` into `next` (the edit is then refused), or null. */
function refusal(intended: Gear, next: Gear, pick: Picker, db: ItemDb): string | null {
  const i = pick.slot;
  const wanted = intended[i];
  const item = recordOf(db, wanted);
  if (pick.kind === 'gem') {
    const gemId = wanted?.gems?.[pick.socket] ?? 0;
    const gem = gemId !== 0 && Object.hasOwn(db.gems, gemId) ? db.gems[gemId]! : undefined;
    const kept = (next[i]?.gems?.[pick.socket] ?? 0) === gemId;
    const othersKept = intended.every((e, j) => j === i || sameEntry(e, next[j]));
    if (kept && othersKept) return null;
    const other = intended.findIndex((e, j) => j !== i && (e?.gems ?? []).includes(gemId));
    return `${gem?.name ?? 'That gem'} is unique-equipped: it is already socketed in ${other >= 0 ? slotLabel(other) : 'another item'}.`;
  }
  if (next[i]?.id === wanted?.id && intended.every((e, j) => j === i || sameEntry(e, next[j]) || isStaffOffHand(j, next, db))) {
    return null;
  }
  if (!item) return 'That item cannot be equipped there.';
  if (ITEM_SLOTS[i] === 'offHand') {
    const main = recordOf(db, next[ITEM_SLOTS.indexOf('mainHand')]);
    if (main?.twoHand) return `${main.name} is a staff and takes both hands: the off hand stays empty.`;
  }
  const same = intended.findIndex((e, j) => j !== i && e?.id === item.id);
  if (same >= 0) return `${item.name} is unique: it is already worn in ${slotLabel(same)}.`;
  const category = LIMIT_CATEGORY_OF.get(item.id);
  const kin = intended.findIndex((e, j) => j !== i && e !== null && category !== undefined && LIMIT_CATEGORY_OF.get(e.id) === category);
  if (kin >= 0) {
    return `${item.name}: only one ring of its kind can be worn (Unique-Equipped); ${recordOf(db, intended[kin])?.name ?? 'another'} is in ${slotLabel(kin)}.`;
  }
  return `${item.name} cannot be equipped in ${slotLabel(i)}.`;
}

/** Slot `j` is the off hand, emptied because the main hand holds a staff (an accepted side effect). */
function isStaffOffHand(j: number, next: Gear, db: ItemDb): boolean {
  return ITEM_SLOTS[j] === 'offHand' && next[j] === null && recordOf(db, next[ITEM_SLOTS.indexOf('mainHand')])?.twoHand === true;
}

/** A small icon tile: the initials underneath, the item icon over them when it loads. */
function GearIcon({ icon, name }: { icon?: string; name: string }) {
  return (
    <span className="gear-icon" aria-hidden="true">
      {initials(name)}
      {icon && <SpellIcon kind="item" icon={icon} className="gear-icon-image" />}
    </span>
  );
}

/**
 * The collapsed "Gear" panel of the legacy layout (until the redesign's Task 5): the Gear editor
 * (`GearEditor`) and its Import and Export (`GearIoActions`) in a `<details>`. Opening it asks for
 * the item database (`onOpen`).
 */
export function GearPanel({ disabled = false, onOpen, ...props }: GearPanelProps) {
  const active = useMemo(() => matchingPreset(props.gear, props.presets), [props.gear, props.presets]);
  return (
    <details
      className="panel gear setup"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) onOpen?.();
      }}
    >
      <summary>
        Gear <span className="gear-summary-name">{active?.name ?? CUSTOM_GEAR_NAME}</span>
      </summary>
      <fieldset className="setup-fields" disabled={disabled}>
        <GearEditor {...props} />
        {props.db !== null && <GearIoActions gear={props.gear} db={props.db} onApply={(g) => props.onChange(g)} />}
      </fieldset>
    </details>
  );
}

export type GearEditorProps = Omit<GearPanelProps, 'disabled' | 'onOpen'>;

/**
 * The Gear editor (the Setup screen's Gear section and the legacy panel's body): the gear presets
 * (the pressed one matches the gear exactly, else "Custom") with the active preset's note, the 17
 * slots as a character pane (left and right columns, the weapons under them) around the selected
 * slot's item card (stats, sockets with their gem, the socket bonus, the enchant, the set; Change
 * and Clear), the meta gem status and notes about what is not modelled. Fully controlled: every
 * edit goes through `normalizeGear` and an edit `normalizeGear` would undo (a second unique item or
 * gem, an off hand next to a staff) is refused with a message. Until the item database has loaded
 * it shows a loading state (or the error and "Reload the page").
 */
export function GearEditor({
  gear,
  presets,
  db,
  onChange,
  status = db ? 'ready' : 'idle',
  onReload,
  pending = false,
  fightEnded = false,
  warnings = [],
  hints = [],
}: GearEditorProps) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const active = useMemo(() => matchingPreset(gear, presets), [gear, presets]);

  const openPicker = (p: Picker, el: HTMLElement) => {
    opener.current = el;
    setMessage(null);
    setPicker(p);
  };
  const closePicker = () => {
    setPicker(null);
    setMessage(null);
    opener.current?.focus();
  };

  if (db === null) {
    if (status === 'error') {
      return (
        <div className="gear-error" role="alert">
          <p>
            Could not load the item database. The fight uses the default gear (My gear). Reload the page to try again: the setup is
            saved.
          </p>
          <button type="button" className="btn" onClick={onReload}>
            Reload the page
          </button>
        </div>
      );
    }
    return status === 'loading' ? (
      <p className="hint" role="status">
        Loading the item database…
      </p>
    ) : (
      <p className="hint">The item database loads when the panel opens.</p>
    );
  }

  return (
    <>
      <GearBody
        gear={gear}
        presets={presets}
        db={db}
        active={active}
        selected={selected}
        onSelect={setSelected}
        onChange={(g, presetId) => {
          setNote(null);
          onChange(g, presetId);
        }}
        note={note}
        setNote={setNote}
        pending={pending}
        fightEnded={fightEnded}
        warnings={warnings}
        hints={hints}
        openPicker={openPicker}
      />
      {picker !== null && (
        <PickerFor
          picker={picker}
          gear={gear}
          db={db}
          message={message}
          onClose={closePicker}
          commit={(intended, info) => {
            const wanted = intended(normalizeGear(gear, db));
            const next = normalizeGear(wanted, db);
            const why = refusal(wanted, next, picker, db);
            if (why !== null) {
              setMessage(why);
              return;
            }
            onChange(next);
            setNote(info?.(next) ?? null);
            closePicker();
          }}
        />
      )}
    </>
  );
}

interface BodyProps {
  gear: readonly (EquippedItem | null)[];
  presets: readonly GearPreset[];
  db: ItemDb;
  active: GearPreset | undefined;
  selected: number;
  onSelect(slot: number): void;
  onChange(gear: Gear, presetId?: string): void;
  note: string | null;
  setNote(note: string | null): void;
  pending: boolean;
  fightEnded: boolean;
  warnings: readonly string[];
  hints: readonly string[];
  openPicker(p: Picker, el: HTMLElement): void;
}

/** Where a slot sits in the character pane: the left column (head to hands), the right one (waist to trinkets), the weapons row. */
function paneOf(index: number): { col: 'left' | 'right' | 'weapon'; row: number } {
  if (index < 7) return { col: 'left', row: index + 1 };
  if (index < 14) return { col: 'right', row: index - 6 };
  return { col: 'weapon', row: 8 };
}

function GearBody({
  gear,
  presets,
  db,
  active,
  selected,
  onSelect,
  onChange,
  note,
  setNote,
  pending,
  fightEnded,
  warnings,
  hints,
  openPicker,
}: BodyProps) {
  const description = useMemo(() => describeGear(gear, db), [gear, db]);
  const meta = useMemo(() => metaStatus(gear, db), [gear, db]);
  const professions = useMemo(() => professionNotes(gear, db), [gear, db]);
  const notes = [...warnings, ...description.warnings, ...description.unmodelledSets, ...description.unmodelledEffects];
  // The modelled item effects of each preset and of the worn gear (the Setup panel lists the worn ones).
  const presetEffects = useMemo(() => new Map(presets.map((p) => [p.id, itemEffectsText(deriveGearEffects(p.gear, db))])), [presets, db]);
  const wornEffects = useMemo(() => itemEffectsText(deriveGearEffects(gear, db)), [gear, db]);
  const edit = (change: (g: Gear) => void) => {
    const g = normalizeGear(gear, db);
    change(g);
    onChange(normalizeGear(g, db));
  };
  const selectedSlot = ITEM_SLOTS[selected]!;

  return (
    <>
      <div className="setup-presets gear-presets">
        <div className="field-row">
          <span className="lab" aria-hidden="true">
            Preset
          </span>
          <div className="setup-preset-buttons seg" role="group" aria-label="Gear presets">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                title={`Phase ${p.phase}. ${p.note ?? p.source} Item effects: ${presetEffects.get(p.id) ?? 'none'}.`}
                aria-pressed={active?.id === p.id}
                onClick={(e) => {
                  e.currentTarget.blur(); // keep Space/R for the fight
                  onChange(normalizeGear(p.gear, db), p.id); // a fresh copy: presets are frozen
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <p className="setup-active">
          Preset:{' '}
          <span role="note" aria-label="Active gear preset" className="setup-active-name">
            {active?.name ?? CUSTOM_GEAR_NAME}
          </span>
          {active?.note && <span className="hint setup-preset-description"> {active.note}</span>}
        </p>
        <p className="hint gear-effects-line">
          Item effects: {wornEffects}
          {wornEffects !== 'none' && ' (Setup, Items and cooldowns)'}. Presets set only the gear; the Setup presets keep it.
        </p>
        {pending && (
          <p className="setup-pending">
            The {fightEnded ? 'finished' : 'running'} fight keeps its gear and item effects: the new gear applies from the next fight (press
            R).
          </p>
        )}
        {note && (
          <p className="gear-note" role="status">
            {note}
          </p>
        )}
      </div>

      <div className="paperdoll">
        <ol className="paperdoll-slots" aria-label="Equipped items">
          {ITEM_SLOTS.map((slot, i) => (
            <SlotButton
              key={slot}
              index={i}
              entry={gear[i] ?? null}
              db={db}
              selected={i === selected}
              onSelect={() => onSelect(i)}
            />
          ))}
        </ol>
        <ItemCard
          index={selected}
          entry={gear[selected] ?? null}
          db={db}
          bonus={description.socketBonuses.find((b) => b.slot === selectedSlot)}
          openPicker={openPicker}
          onClear={() => {
            setNote(null);
            edit((g) => {
              g[selected] = null;
            });
          }}
        />
      </div>

      {meta && (
        <p className={meta.active ? 'gear-meta' : 'gear-meta gear-meta-off'} aria-label="Meta gem status">
          <strong>Meta gem:</strong> {meta.text}
        </p>
      )}

      {(notes.length > 0 || professions.length > 0 || hints.length > 0) && (
        <div className="gear-notes" aria-label="Gear notes">
          {notes.length > 0 && (
            <ul className="gear-warnings">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {[...professions, ...hints].map((n) => (
            <p key={n} className="hint">
              {n}
            </p>
          ))}
        </div>
      )}
      <p className="hint">
        Saved with the setup. A gear change applies to a fight that has not started; a running fight keeps its gear until you press{' '}
        <kbd>R</kbd>.
      </p>
    </>
  );
}

/** The gem colours of an entry's sockets, as small dots (decoration; the item card names them). */
function GemDots({ item, entry, db }: { item: ItemRecord; entry: EquippedItem | null; db: ItemDb }) {
  if (!item.sockets?.length) return null;
  return (
    <span className="gems" aria-hidden="true">
      {item.sockets.map((socket, s) => {
        const gemId = entry?.gems?.[s] ?? 0;
        const gem = gemId !== 0 && Object.hasOwn(db.gems, gemId) ? db.gems[gemId] : undefined;
        return <span key={s} className={gem ? `gem gem-${gem.color}` : `gem gem-empty socket-${socket}`} />;
      })}
    </span>
  );
}

interface SlotButtonProps {
  index: number;
  entry: EquippedItem | null;
  db: ItemDb;
  selected: boolean;
  onSelect(): void;
}

/** One slot of the character pane: icon, slot name, item name (2 lines at most), stats and gem dots; selects the slot. */
function SlotButton({ index, entry, db, selected, onSelect }: SlotButtonProps) {
  const slot = ITEM_SLOTS[index]!;
  const label = slotLabel(index);
  const item = recordOf(db, entry);
  const pane = paneOf(index);
  const name = item ? item.name : entry ? `Unknown item ${entry.id}` : 'Empty, choose an item';
  return (
    <li className={`pd-slot pd-${pane.col}`} data-slot={slot} style={{ '--row': pane.row } as CSSProperties}>
      <button type="button" className={entry ? 'pd-button' : 'pd-button pd-empty'} aria-current={selected ? true : undefined} onClick={onSelect}>
        <GearIcon icon={item?.icon} name={item?.name ?? label} />
        <span className="pd-text">
          <span className="sl">{label}</span>
          <span className="nm" title={item?.effects?.join('\n')}>
            {name}
          </span>
          {item && <span className="st">{statsText(item.stats) || 'No modelled stats'}</span>}
          {item && <GemDots item={item} entry={entry} db={db} />}
        </span>
      </button>
    </li>
  );
}

interface ItemCardProps {
  index: number;
  entry: EquippedItem | null;
  db: ItemDb;
  bonus: { active: boolean; bonus: object } | undefined;
  openPicker(p: Picker, el: HTMLElement): void;
  onClear(): void;
}

/** The selected slot's item: name, stats, markers, sockets (each opens its gem list), socket bonus, enchant, set, effects; Change and Clear. */
function ItemCard({ index, entry, db, bonus, openPicker, onClear }: ItemCardProps) {
  const label = slotLabel(index);
  const item = recordOf(db, entry);
  const enchant =
    entry?.enchant !== undefined && Object.hasOwn(db.enchants, entry.enchant) ? db.enchants[entry.enchant] : undefined;
  const markers = item ? itemMarkers(item) : [];
  const stats = item ? statsText(item.stats) : '';
  return (
    <section className="item-card" aria-label="Selected item" data-card-slot={ITEM_SLOTS[index]}>
      <p className="slot-name">
        {label}
        {item ? `, phase ${item.phase}` : ''}
      </p>
      <div className="item-card-title">
        <GearIcon icon={item?.icon} name={item?.name ?? label} />
        <h2>{item ? item.name : entry ? `Unknown item ${entry.id}` : 'Empty'}</h2>
      </div>
      {!entry && <p className="hint">Empty, choose an item.</p>}
      {markers.length > 0 && (
        <p className="item-card-markers">
          {markers.map((m) => (
            <span key={m} className="marker">
              {m}
            </span>
          ))}
        </p>
      )}
      {item && (
        <ul className="item-card-stats">
          {stats === '' ? <li>No modelled stats</li> : stats.split(', ').map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      {item && (item.sockets?.length ?? 0) > 0 && (
        <ul className="item-card-sockets">
          {item.sockets!.map((socket, s) => {
            const gemId = entry?.gems?.[s] ?? 0;
            const gem = gemId !== 0 && Object.hasOwn(db.gems, gemId) ? db.gems[gemId] : undefined;
            return (
              <li key={s}>
                <button
                  type="button"
                  className={`socket socket-${socket}`}
                  aria-label={`${label} socket ${s + 1} (${socket}): ${gem ? `${gem.name}, ${statsText(gem.stats) || 'no modelled stats'}` : 'empty'}`}
                  title={gem ? `${gem.name} (${gem.color}) ${statsText(gem.stats)}` : `Empty ${socket} socket`}
                  onClick={(e) => openPicker({ kind: 'gem', slot: index, socket: s }, e.currentTarget)}
                >
                  <span className={`gem-pip socket-${socket}`} aria-hidden="true">
                    {gem && <SpellIcon kind="item" icon={gem.icon} className="gem-pip-image" />}
                  </span>
                  <span>{gem ? gem.name : `Empty ${socket} socket`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {item && bonus && (
        <p className={bonus.active ? 'gear-socket-bonus' : 'gear-socket-bonus gear-socket-bonus-off'} aria-label="Socket bonus">
          Socket bonus {statsText(item.socketBonus)}: {bonus.active ? 'active' : 'inactive (colours do not match)'}
        </p>
      )}
      {item && anyEnchantFits(item, db) && (
        <button
          type="button"
          className="gear-enchant"
          aria-label={`${label} enchant: ${enchant ? enchant.name : 'none'}`}
          onClick={(e) => openPicker({ kind: 'enchant', slot: index }, e.currentTarget)}
        >
          Enchant: {enchant ? `${enchant.name}${statsText(enchant.stats) ? ` (${statsText(enchant.stats)})` : ''}` : 'none'}
        </button>
      )}
      {item?.setName && <p className="set">{item.setName}</p>}
      {item?.effects && item.effects.length > 0 && (
        <ul className="item-card-effects">
          {item.effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn small"
          aria-label={`Change ${label}`}
          onClick={(e) => openPicker({ kind: 'item', slot: index }, e.currentTarget)}
        >
          Change {label}…
        </button>
        {entry && (
          <button type="button" className="btn small" aria-label={`Clear ${label}`} onClick={onClear}>
            Clear {label}
          </button>
        )}
      </div>
    </section>
  );
}

interface PickerForProps {
  picker: Picker;
  gear: readonly (EquippedItem | null)[];
  db: ItemDb;
  message: string | null;
  onClose(): void;
  /** Applies an edit of the (normalized) gear; `info` gives a note about an accepted side effect. */
  commit(intended: (base: Gear) => Gear, info?: (next: Gear) => string | null): void;
}

/** The picker of an item slot, a socket or an enchant, with its candidates. */
function PickerFor({ picker, gear, db, message, onClose, commit }: PickerForProps) {
  const i = picker.slot;
  const label = slotLabel(i);
  const entry = gear[i] ?? null;
  const item = recordOf(db, entry);
  const replace = (base: Gear, next: EquippedItem | null): Gear => base.map((e, j) => (j === i ? next : e));

  if (picker.kind === 'item') {
    const options: PickerOption[] = itemsForSlot(db, ITEM_SLOTS[i]!)
      .sort((a, b) => b.phase - a.phase || a.name.localeCompare(b.name) || a.id - b.id)
      .map((it) => ({
        id: it.id,
        name: it.name,
        icon: it.icon,
        phase: it.phase,
        stats: statsText(it.stats),
        markers: [...(it.sockets?.length ? [`${it.sockets.length} ${it.sockets.length === 1 ? 'socket' : 'sockets'}`] : []), ...itemMarkers(it)],
        title: hasUnmodelledEffect(it) ? it.effects!.join('\n') : undefined,
        hidden: isEffectOnly(it),
        current: it.id === entry?.id,
      }));
    return (
      <ItemPicker
        title={`Choose ${label} item`}
        options={options}
        phaseFilter
        hiddenLabel="Show items with only an unmodelled effect"
        message={message}
        onClose={onClose}
        onPick={(id) =>
          commit(
            // The enchant and the gems stay where they still fit the new item (normalizeGear drops the rest).
            (base) => replace(base, { id, ...(entry?.enchant !== undefined ? { enchant: entry.enchant } : {}), gems: [...(entry?.gems ?? [])] }),
            (next) => {
              const off = ITEM_SLOTS.indexOf('offHand');
              return logicalSlot(ITEM_SLOTS[i]!) === 'mainHand' && gear[off] && next[off] === null
                ? `${db.items[id]!.name} is a staff and takes both hands: the off hand was emptied.`
                : null;
            },
          )
        }
      />
    );
  }

  if (!item) return null;

  if (picker.kind === 'gem') {
    const socket: GemColor = item.sockets?.[picker.socket] ?? 'prismatic';
    const currentGem = entry?.gems?.[picker.socket] ?? 0;
    const gems = gemsForSocket(socket, db);
    if (currentGem !== 0 && Object.hasOwn(db.gems, currentGem) && !gems.some((g) => g.id === currentGem)) {
      gems.push(db.gems[currentGem]!); // the gem in place stays listed even if it has no modelled stat
    }
    const options: PickerOption[] = gems
      .filter((g) => gemFitsSocket(g.color, socket))
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        phase: g.phase,
        stats: statsText(g.stats),
        color: g.color,
        matches: socket !== 'meta' && socketMatches(socket, g.color),
        markers: [...(g.unique ? ['Unique'] : []), ...(g.requiredProfession !== undefined ? [professionName(g.requiredProfession)] : [])],
        current: g.id === currentGem,
      }))
      .sort((a, b) => Number(b.matches) - Number(a.matches) || b.phase! - a.phase! || a.name.localeCompare(b.name) || a.id - b.id);
    const setGem = (gemId: number) => (base: Gear) => {
      const e = base[i];
      if (!e) return base;
      const gems = [...(e.gems ?? [])];
      while (gems.length <= picker.socket) gems.push(0);
      gems[picker.socket] = gemId;
      return replace(base, { ...e, gems });
    };
    return (
      <ItemPicker
        title={`Choose ${label} socket ${picker.socket + 1} gem`}
        options={options}
        phaseFilter
        colourFilter={socket !== 'meta'}
        message={message}
        onClose={onClose}
        none={{ label: 'No gem (empty socket)', onPick: () => commit(setGem(0)) }}
        onPick={(id) => commit(setGem(id))}
      />
    );
  }

  const enchants = enchantsForItem(item, db);
  if (entry?.enchant !== undefined && Object.hasOwn(db.enchants, entry.enchant) && !enchants.some((e) => e.id === entry.enchant)) {
    enchants.unshift(db.enchants[entry.enchant]!);
  }
  const options: PickerOption[] = enchants.map((en) => ({
    id: en.id,
    name: en.name,
    icon: en.icon,
    stats: statsText(en.stats),
    markers: en.requiredProfession !== undefined ? [professionName(en.requiredProfession)] : [],
    current: en.id === entry?.enchant,
  }));
  const setEnchant = (enchantId: number | undefined) => (base: Gear) => {
    const e = base[i];
    if (!e) return base;
    const { enchant: _old, ...rest } = e;
    return replace(base, enchantId === undefined ? rest : { ...rest, enchant: enchantId });
  };
  return (
    <ItemPicker
      title={`Choose ${label} enchant`}
      options={options}
      message={message}
      onClose={onClose}
      none={{ label: 'No enchant', onPick: () => commit(setEnchant(undefined)) }}
      onPick={(id) => commit(setEnchant(id))}
    />
  );
}

/**
 * The gear's "Import Gear…" and "Export Gear" buttons, each opening its dialog (the Gear section's
 * header; the legacy panel's foot).
 */
export function GearIoActions({ gear, db, onApply }: { gear: readonly (EquippedItem | null)[]; db: ItemDb; onApply(gear: Gear): void }) {
  const [open, setOpen] = useState<'import' | 'export' | null>(null);
  const close = () => setOpen(null);
  return (
    <div className="gear-io">
      <button type="button" className="btn" onClick={() => setOpen('import')}>
        Import Gear…
      </button>
      <button type="button" className="btn" onClick={() => setOpen('export')}>
        Export Gear
      </button>
      {open === 'import' && (
        <Modal title="Import Gear" onClose={close} className="gear-io-dialog">
          <ImportBody db={db} onApply={onApply} />
        </Modal>
      )}
      {open === 'export' && (
        <Modal title="Export Gear" onClose={close} className="gear-io-dialog">
          <ExportBody gear={gear} />
        </Modal>
      )}
    </div>
  );
}

/** Import: paste, read the report (warnings and unknown ids before anything changes), Apply. */
function ImportBody({ db, onApply }: { db: ItemDb; onApply(gear: Gear): void }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const result = useMemo(() => (text.trim() === '' ? null : parseWowSimsExport(text, db)), [text, db]);
  const placed = result ? result.gear.filter((e) => e !== null).length : 0;
  const unknown = result
    ? ([
        ['Unknown items', result.unknown.items],
        ['Unknown gems', result.unknown.gems],
        ['Unknown enchants', result.unknown.enchants],
      ] as const).filter(([, ids]) => ids.length > 0)
    : [];
  return (
    <div className="gear-io-body">
      <p className="hint">
        Paste a WowSimsExporter export (in game: /wse export, then Ctrl+C) or a wowsims gear file. Only the gear is applied; the
        trainer's character stays a level 70 Gnome.
      </p>
      <textarea
        className="gear-textarea"
        aria-label="Import text"
        rows={6}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setDone(null);
          setText(e.target.value);
        }}
      />
      {result && (
        <section className="gear-report" role="region" aria-label="Import report">
          {result.ok ? (
            <p>
              {result.character ? `${result.character}${result.race ? ` (${result.race})` : ''}: ` : ''}
              {placed} of {ITEM_SLOTS.length} slots filled.
            </p>
          ) : (
            <p role="alert" className="gear-report-error">
              {result.warnings[0] ?? 'Nothing to import.'}
            </p>
          )}
          {unknown.map(([title, ids]) => (
            <p key={title}>
              {title}: {ids.join(', ')}
            </p>
          ))}
          {result.ok && result.warnings.length > 0 && (
            <ul className="gear-warnings">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.talents && <p className="hint">The export's talents are not applied here: paste the export into the Talents panel's Import.</p>}
        </section>
      )}
      <button
        type="button"
        className="btn primary"
        disabled={!result?.ok}
        onClick={() => {
          if (!result?.ok) return;
          onApply(normalizeGear(result.gear, db));
          setDone(`Imported: ${placed} of ${ITEM_SLOTS.length} slots filled.`);
          setText('');
        }}
      >
        Apply import
      </button>
      {done && <p role="status">{done}</p>}
    </div>
  );
}

/** Export: the gear as a wowsims gear file, with Copy (clipboard, or the text selected). */
function ExportBody({ gear }: { gear: readonly (EquippedItem | null)[] }) {
  const text = useMemo(() => exportWowSimsGear(gear), [gear]);
  // The status goes with the text it was about: a changed gear (a new text) clears it.
  const [copied, setCopiedFor] = useState<{ text: string; message: string } | null>(null);
  const setCopied = (message: string) => setCopiedFor({ text, message });
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied.');
      return;
    } catch {
      // No clipboard API (insecure origin, old browser) or permission refused: select the text.
    }
    let ok = false;
    try {
      area.current?.focus();
      area.current?.select();
      ok = document.execCommand?.('copy') ?? false;
    } catch {
      ok = false;
    }
    setCopied(ok ? 'Copied.' : 'The text is selected: press Ctrl+C (Cmd+C) to copy it.');
  };
  return (
    <div className="gear-io-body">
      <p className="hint">The gear as a wowsims gear file (items by id; WowSimsExporter and wowsims read it).</p>
      <textarea ref={area} className="gear-textarea" aria-label="Export text" rows={6} readOnly spellCheck={false} value={text} />
      <button
        type="button"
        className="btn"
        onClick={() => {
          void copy();
        }}
      >
        Copy
      </button>
      {copied && copied.text === text && <p role="status">{copied.message}</p>}
    </div>
  );
}
