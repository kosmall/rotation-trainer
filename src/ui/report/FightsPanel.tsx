// Report → "History…": the Fights panel (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 E): the Highest DPS
// ranking of the whole history (played fights and simulations' key fights; top 10; filters: kind,
// the same fight length (on by default: DPS depends on the length), the same gear and talents) and
// the history list, newest first: open (the same Report tabs), pin, rename, remove (asks first).
// A refused save is shown, never silent. Pure props: ReportView connects it to the trainer.

import { memo, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatDps } from '../format';
import { ConfirmDialog } from '../setup/Modal';
import { rankTop, setupKeyOf } from '../state/history';
import type { HistoryEntry, HistoryPatch, RankFilters } from '../state/history';
import { gearName, rotationName, talentsName } from '../state/selectors';
import type { FightHistory } from '../state/TrainerProvider';
import { dateText, historyTitle } from './FightSourceSelect';

export interface FightsPanelProps {
  history: FightHistory;
  /** The length the "Same fight length" filter keeps (the shown fight's, else the setup's); null: none. */
  currentDurationMs: number | null;
  /** `setupKeyOf` the current setup ("Same gear and talents"). */
  currentSetupKey: string;
  /** The history entry the Report shows, or null. */
  selectedId: string | null;
  onOpen(id: string): void;
  onUpdate(id: string, patch: HistoryPatch): void;
  onRemove(id: string): void;
}

const KIND_LABELS: Readonly<Record<HistoryEntry['kind'], string>> = {
  played: 'Played',
  'sim-highest': 'Sim, highest',
  'sim-typical': 'Sim, typical',
  'sim-lowest': 'Sim, lowest',
};

const KINDS: readonly { kind: RankFilters['kind']; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'played', label: 'Played' },
  { kind: 'sim', label: 'Simulations' },
];

const lengthText = (ms: number) => `${Math.round(ms / 100) / 10} s`;

/** "My gear / Destruction / DoT rotation" (the names of the snapshot's presets, or Custom). */
function setupText(entry: HistoryEntry, cache: Map<HistoryEntry, string>): string {
  let t = cache.get(entry);
  if (t === undefined) {
    try {
      t = `${gearName(entry.config)} / ${talentsName(entry.config)} / ${rotationName(entry.config)}`;
    } catch {
      t = 'Custom';
    }
    cache.set(entry, t);
  }
  return t;
}

export const FightsPanel = memo(function FightsPanel(props: FightsPanelProps) {
  const { history, currentDurationMs, currentSetupKey, selectedId, onOpen, onUpdate, onRemove } = props;
  const [kind, setKind] = useState<RankFilters['kind']>('all');
  const [sameLength, setSameLength] = useState(true);
  const [sameSetup, setSameSetup] = useState(false);
  const [removing, setRemoving] = useState<HistoryEntry | null>(null);
  const names = useMemo(() => new Map<HistoryEntry, string>(), []);
  const lengthOn = sameLength && currentDurationMs !== null;
  const rows = useMemo(
    () => rankTop(history.entries, { kind, durationMs: lengthOn ? currentDurationMs : null, setupKey: sameSetup ? currentSetupKey : null }),
    [history.entries, kind, lengthOn, currentDurationMs, sameSetup, currentSetupKey],
  );
  return (
    <section id="fights-panel" className="card fights" role="region" aria-label="Fights">
      <h2>
        Fights <small>Your played fights and the simulations’ key fights</small>
      </h2>
      {history.saved === 'failed' && (
        <p className="note fights-warn" role="alert">
          The fight history could not be saved (the browser storage is full or blocked): it is kept until the page reloads.
        </p>
      )}
      {history.saved === 'memory' && <p className="note">The fight history is kept in memory only (no storage).</p>}
      {history.entries.length === 0 ? (
        <p className="note">Play a fight or run the simulator: every fight and each simulation’s key fights are kept here.</p>
      ) : (
        <div className="fights-grid">
          <div>
            <h3>Highest DPS</h3>
            <div className="filters">
              <div className="seg" role="group" aria-label="Fights to rank">
                {KINDS.map((k) => (
                  <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={lengthOn} disabled={currentDurationMs === null} onChange={(e) => setSameLength(e.target.checked)} />
                Same fight length{currentDurationMs !== null ? ` (${lengthText(currentDurationMs)})` : ''}
              </label>
              <label className="check">
                <input type="checkbox" checked={sameSetup} onChange={(e) => setSameSetup(e.target.checked)} />
                Same gear and talents
              </label>
            </div>
            {rows.length === 0 ? (
              <p className="note">No fight matches these filters.</p>
            ) : (
              <div className="tbl-wrap">
                <table className="dmg rank" aria-label="Highest DPS">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">DPS</th>
                      <th scope="col">Kind</th>
                      <th scope="col" className="opt">
                        Date
                      </th>
                      <th scope="col" className="opt">
                        Gear / talents / rotation
                      </th>
                      <th scope="col">Length</th>
                      <th scope="col">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ place, entry }) => (
                      <tr key={entry.id} className={entry.id === selectedId ? 'on' : undefined}>
                        <th scope="row" className="n">
                          {place}
                        </th>
                        <td className="n">{formatDps(entry.dps)}</td>
                        <td>{KIND_LABELS[entry.kind]}</td>
                        <td className="opt">{dateText(entry.savedAt)}</td>
                        <td className="opt wrap">{setupText(entry, names)}</td>
                        <td className="n">{lengthText(entry.durationMs)}</td>
                        <td>
                          <button type="button" className="btn small" aria-label={`Open ${historyTitle(entry)}, ${formatDps(entry.dps)} DPS`} onClick={() => onOpen(entry.id)}>
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h3>History</h3>
            <ul className="history" aria-label="Fight history">
              {history.entries.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  setup={setupText(entry, names)}
                  selected={entry.id === selectedId}
                  onOpen={onOpen}
                  onUpdate={onUpdate}
                  onRemove={() => setRemoving(entry)}
                />
              ))}
            </ul>
            <p className="note">The 20 newest played fights and 10 newest simulations are kept; a pinned fight is never dropped.</p>
          </div>
        </div>
      )}
      {removing !== null && (
        <ConfirmDialog
          title="Remove This Fight?"
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            onRemove(id);
          }}
        >
          <p>
            {historyTitle(removing)} ({formatDps(removing.dps)} DPS) leaves the history{removing.kind === 'played' ? ', with its log' : ''}. This cannot be
            undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
});

interface HistoryItemProps {
  entry: HistoryEntry;
  setup: string;
  selected: boolean;
  onOpen(id: string): void;
  onUpdate(id: string, patch: HistoryPatch): void;
  onRemove(): void;
}

function HistoryItem({ entry, setup, selected, onOpen, onUpdate, onRemove }: HistoryItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const title = historyTitle(entry);
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onUpdate(entry.id, { name });
    setEditing(false);
  };
  return (
    <li className={selected ? 'on' : undefined}>
      <div className="hist-main">
        <span className="hist-title">
          {entry.pinned && <span aria-hidden="true">★ </span>}
          {title}
        </span>
        <span className="hist-meta">
          <b className="tnum">{formatDps(entry.dps)} DPS</b> · {KIND_LABELS[entry.kind]} · {lengthText(entry.durationMs)} · {setup}
        </span>
      </div>
      {editing ? (
        <form className="hist-edit" onSubmit={save}>
          <label>
            <span className="sr-only">Name</span>
            <input type="text" maxLength={80} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <button type="submit" className="btn small">
            Save
          </button>
          <button type="button" className="btn small quiet" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="hist-actions">
          <button type="button" className="btn small" aria-label={`Open ${title}`} onClick={() => onOpen(entry.id)}>
            Open
          </button>
          <button
            type="button"
            className="btn small quiet"
            aria-pressed={entry.pinned === true}
            aria-label={`${entry.pinned ? 'Unpin' : 'Pin'} ${title}`}
            onClick={() => onUpdate(entry.id, { pinned: !entry.pinned })}
          >
            {entry.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            className="btn small quiet"
            aria-label={`Rename ${title}`}
            onClick={() => {
              setName(entry.name ?? '');
              setEditing(true);
            }}
          >
            Rename
          </button>
          <button type="button" className="btn small quiet" aria-label={`Remove ${title}`} onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
