import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  /** The dialog's heading (its accessible name). */
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Extra class of the dialog box ("confirm", "gear-io"). */
  className?: string;
}

/**
 * A modal dialog (the shell's `.dialog` look): focus moves to its first control when it opens and
 * back to what had it when it closes; Tab stays inside; Esc, Close or a click on the backdrop
 * closes it. `aria-modal` makes every hotkey guard ignore the keys pressed inside (rule S5).
 */
export function Modal({ title, onClose, children, className }: ModalProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = boxRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      if (back?.isConnected) back.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // Esc closes the dialog before it would cancel a cast
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={className ? `dialog ${className}` : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  title: string;
  /** What the action replaces, in a sentence or two. */
  children: ReactNode;
  /** The confirming button's label ("Reset to Defaults"). */
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/** A destructive action's confirmation: says what is replaced, then Cancel or the action (Close takes the focus). */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} className="confirm">
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
