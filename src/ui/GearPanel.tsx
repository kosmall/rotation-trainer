import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GearPreset } from '../data/classes/warlock/gearPresets';
import { ITEM_SLOTS, itemsForSlot, logicalSlot } from '../data/items/db';
import type { ItemDb, ItemRecord } from '../data/items/types';
import { gemFitsSocket, socketMatches } from '../engine/gear';
import type { EquippedItem, GemColor } from '../engine/types';
import { describeGear, normalizeGear, RING_LIMIT_CATEGORIES, type Gear } from '../setup/gear';
import { exportWowSimsGear, parseWowSimsExport } from '../setup/wowsimsGear';
import { initials } from './format';
import {
  anyEnchantFits,
  enchantsForItem,
  gemsForSocket,
  hasUnmodelledEffect,
  isEffectOnly,
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

/** The name shown when the gear matches no preset. */
export const CUSTOM_GEAR_NAME = 'Custom';

/** Where the item database stands: not asked for yet, loading, loaded, failed (Retry). */
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
  /** Load the database again after a failure. */
  onRetry?(): void;
  /** The running fight was built with another setup: the new gear applies after R. */
  pending?: boolean;
  fightEnded?: boolean;
  /** Warnings from the rest of the setup (an item buff enabled while its item is not worn). */
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

/** A collapsible sub-section of the panel. */
function Section({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="setup-group" open={open}>
      <summary>{title}</summary>
      <div className="setup-group-body">{children}</div>
    </details>
  );
}

/**
 * The collapsed "Gear" panel: the gear presets (the pressed one matches the gear exactly, else
 * "Custom") with the active preset's note, the 17 slots (icon, item, stats, sockets with their gem,
 * the socket bonus, the enchant; Change and Clear), the meta gem status, notes about what is not
 * modelled (effects, set bonuses, faction, professions, the setup's item buffs), and Import and
 * Export in the wowsims formats. Fully controlled: every edit goes through `normalizeGear` and an
 * edit `normalizeGear` would undo (a second unique item or gem, an off hand next to a staff) is
 * refused with a message. Opening it asks for the item database (`onOpen`); until it has loaded
 * the panel shows a loading state (or the error and Retry).
 */
export function GearPanel({
  gear,
  presets,
  db,
  onChange,
  disabled = false,
  status = db ? 'ready' : 'idle',
  onOpen,
  onRetry,
  pending = false,
  fightEnded = false,
  warnings = [],
  hints = [],
}: GearPanelProps) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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
        {db === null ? (
          status === 'error' ? (
            <div className="gear-error" role="alert">
              <p>
                Could not load the item database. The fight uses the default gear (My gear) until it loads. Retry, or reload
                the page (the setup is saved).
              </p>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : status === 'loading' ? (
            <p className="hint" role="status">
              Loading the item database…
            </p>
          ) : (
            <p className="hint">The item database loads when the panel opens.</p>
          )
        ) : (
          <GearBody
            gear={gear}
            presets={presets}
            db={db}
            active={active}
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
        )}
      </fieldset>
      {db !== null && picker !== null && (
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
    </details>
  );
}

interface BodyProps {
  gear: readonly (EquippedItem | null)[];
  presets: readonly GearPreset[];
  db: ItemDb;
  active: GearPreset | undefined;
  onChange(gear: Gear, presetId?: string): void;
  note: string | null;
  setNote(note: string | null): void;
  pending: boolean;
  fightEnded: boolean;
  warnings: readonly string[];
  hints: readonly string[];
  openPicker(p: Picker, el: HTMLElement): void;
}

function GearBody({ gear, presets, db, active, onChange, note, setNote, pending, fightEnded, warnings, hints, openPicker }: BodyProps) {
  const description = useMemo(() => describeGear(gear, db), [gear, db]);
  const meta = useMemo(() => metaStatus(gear, db), [gear, db]);
  const professions = useMemo(() => professionNotes(gear, db), [gear, db]);
  const notes = [...warnings, ...description.warnings, ...description.unmodelledSets, ...description.unmodelledEffects];
  const edit = (change: (g: Gear) => void) => {
    const g = normalizeGear(gear, db);
    change(g);
    onChange(normalizeGear(g, db));
  };

  return (
    <>
      <div className="setup-presets">
        <p className="setup-active">
          Preset:{' '}
          <span role="note" aria-label="Active gear preset" className="setup-active-name">
            {active?.name ?? CUSTOM_GEAR_NAME}
          </span>
        </p>
        {active?.note && <p className="hint setup-preset-description">{active.note}</p>}
        <div className="setup-preset-buttons" role="group" aria-label="Gear presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={`Phase ${p.phase}. ${p.note ?? p.source}`}
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
        <p className="hint">Presets set only the gear. The Setup presets keep it; Reset to defaults there restores My gear.</p>
        {pending && (
          <p className="setup-pending">
            The {fightEnded ? 'finished' : 'running'} fight keeps its gear: the new one applies from the next fight (press R).
          </p>
        )}
        {note && <p className="gear-note" role="status">{note}</p>}
      </div>

      <ol className="gear-slots" aria-label="Equipped items">
        {ITEM_SLOTS.map((slot, i) => (
          <SlotRow
            key={slot}
            index={i}
            entry={gear[i] ?? null}
            db={db}
            bonus={description.socketBonuses.find((b) => b.slot === slot)}
            openPicker={openPicker}
            onClear={() => {
              setNote(null);
              edit((g) => {
                g[i] = null;
              });
            }}
          />
        ))}
      </ol>

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

      <ImportSection db={db} onApply={(g) => onChange(g)} />
      <ExportSection gear={gear} />
      <p className="hint">
        Saved with the setup. A gear change applies to a fight that has not started; a running fight keeps its gear until you
        press <kbd>R</kbd>.
      </p>
    </>
  );
}

interface SlotRowProps {
  index: number;
  entry: EquippedItem | null;
  db: ItemDb;
  bonus: { active: boolean; bonus: object } | undefined;
  openPicker(p: Picker, el: HTMLElement): void;
  onClear(): void;
}

function SlotRow({ index, entry, db, bonus, openPicker, onClear }: SlotRowProps) {
  const slot = ITEM_SLOTS[index]!;
  const label = slotLabel(index);
  const item = recordOf(db, entry);
  const enchant =
    entry?.enchant !== undefined && Object.hasOwn(db.enchants, entry.enchant) ? db.enchants[entry.enchant] : undefined;
  const markers = item ? itemMarkers(item) : [];
  return (
    <li className="gear-slot" data-slot={slot}>
      <span className="gear-slot-label">{label}</span>
      <GearIcon icon={item?.icon} name={item?.name ?? label} />
      <div className="gear-slot-body">
        <div className="gear-item-name" title={item?.effects?.join('\n')}>
          {item ? item.name : entry ? `Unknown item ${entry.id}` : 'Empty'}
          {markers.map((m) => (
            <span key={m} className="marker">
              {m}
            </span>
          ))}
        </div>
        {item && <div className="gear-item-stats">{statsText(item.stats) || 'No modelled stats'}</div>}
        {item && (item.sockets?.length ?? 0) > 0 && (
          <div className="gear-sockets">
            {item.sockets!.map((socket, s) => {
              const gemId = entry?.gems?.[s] ?? 0;
              const gem = gemId !== 0 && Object.hasOwn(db.gems, gemId) ? db.gems[gemId] : undefined;
              return (
                <button
                  key={s}
                  type="button"
                  className={`gem-pip socket-${socket}`}
                  aria-label={`${label} socket ${s + 1} (${socket}): ${gem ? `${gem.name}, ${statsText(gem.stats) || 'no modelled stats'}` : 'empty'}`}
                  title={gem ? `${gem.name} (${gem.color}) ${statsText(gem.stats)}` : `Empty ${socket} socket`}
                  onClick={(e) => openPicker({ kind: 'gem', slot: index, socket: s }, e.currentTarget)}
                >
                  {gem && <SpellIcon kind="item" icon={gem.icon} className="gem-pip-image" />}
                </button>
              );
            })}
            {bonus && (
              <span className={bonus.active ? 'gear-socket-bonus' : 'gear-socket-bonus gear-socket-bonus-off'} aria-label="Socket bonus">
                Bonus {statsText(item.socketBonus)}: {bonus.active ? 'active' : 'inactive (colours do not match)'}
              </span>
            )}
          </div>
        )}
        {item && anyEnchantFits(item, db) && (
          <button
            type="button"
            className="gear-enchant"
            aria-label={`${label} enchant: ${enchant ? enchant.name : 'none'}`}
            onClick={(e) => openPicker({ kind: 'enchant', slot: index }, e.currentTarget)}
          >
            {enchant ? `${enchant.name}${statsText(enchant.stats) ? ` (${statsText(enchant.stats)})` : ''}` : 'No enchant'}
          </button>
        )}
      </div>
      <div className="gear-slot-actions">
        <button type="button" aria-label={`Change ${label}`} onClick={(e) => openPicker({ kind: 'item', slot: index }, e.currentTarget)}>
          Change
        </button>
        {entry && (
          <button type="button" aria-label={`Clear ${label}`} onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </li>
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

/** Import: paste, read the report (warnings and unknown ids before anything changes), Apply. */
function ImportSection({ db, onApply }: { db: ItemDb; onApply(gear: Gear): void }) {
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
    <Section title="Import">
      <p className="hint">
        Paste a WowSimsExporter export (in game: /wse export, then Ctrl+C) or a wowsims gear file. Only the gear is applied; the
        trainer's character stays a level 70 Gnome.
      </p>
      <textarea
        className="gear-textarea"
        aria-label="Import text"
        rows={4}
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
          {result.talents && <p className="hint">The export's talents (applied in stage 2b) are not applied now.</p>}
        </section>
      )}
      <button
        type="button"
        disabled={!result?.ok}
        onClick={(e) => {
          e.currentTarget.blur();
          if (!result?.ok) return;
          onApply(normalizeGear(result.gear, db));
          setDone(`Imported: ${placed} of ${ITEM_SLOTS.length} slots filled.`);
          setText('');
        }}
      >
        Apply import
      </button>
      {done && <p role="status">{done}</p>}
    </Section>
  );
}

/** Export: the gear as a wowsims gear file, with Copy (clipboard, or the text selected). */
function ExportSection({ gear }: { gear: readonly (EquippedItem | null)[] }) {
  const text = useMemo(() => exportWowSimsGear(gear), [gear]);
  const [copied, setCopied] = useState<string | null>(null);
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
    <Section title="Export">
      <p className="hint">The gear as a wowsims gear file (items by id; WowSimsExporter and wowsims read it).</p>
      <textarea ref={area} className="gear-textarea" aria-label="Export text" rows={4} readOnly spellCheck={false} value={text} />
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
      >
        Copy
      </button>
      {copied && <p role="status">{copied}</p>}
    </Section>
  );
}
