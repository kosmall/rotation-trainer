import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { SHORTCUT_ROWS } from './shortcuts';

/** The keys of one row ("G", "S" read as a sequence; the fight's keys as alternatives). */
function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="keys">
      {keys.map((k, i) => (k === '…' ? <span key={i}>…</span> : <kbd key={i}>{k}</kbd>))}
    </span>
  );
}

/**
 * The shortcuts sheet ("?"): a modal dialog. Focus moves to Close when it opens; Esc, Close or a
 * click on the backdrop closes it (the caller gives focus back). `aria-modal` makes every hotkey
 * guard ignore the keys pressed inside it (rule S5).
 */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      // One control inside: focus stays on it.
      event.preventDefault();
      closeRef.current?.focus();
    }
  }

  const global = SHORTCUT_ROWS.filter((r) => r.scope === 'global');
  const fight = SHORTCUT_ROWS.filter((r) => r.scope === 'fight');
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog shortcuts" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <h2 id={titleId}>Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <h3>Anywhere, outside fields and a running fight</h3>
        <dl className="shortcut-list">
          {global.map((r) => (
            <div key={r.label}>
              <dt>
                <Keys keys={r.keys} />
              </dt>
              <dd>{r.label}</dd>
            </div>
          ))}
        </dl>
        <h3>In the Fight</h3>
        <dl className="shortcut-list">
          {fight.map((r) => (
            <div key={r.label}>
              <dt>
                <Keys keys={r.keys} />
              </dt>
              <dd>{r.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
