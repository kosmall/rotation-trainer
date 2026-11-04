import type { ReactNode } from 'react';

/**
 * Shown before the fight (spec §3.4): the clock starts with Space, the first spell hotkey or this
 * button (visible "Start the Fight", accessible name "Start the fight" in any case). `setupLine`:
 * what the fight is played with, with links to the setup sections.
 */
export function StartOverlay({ onStart, setupLine }: { onStart(): void; setupLine?: ReactNode }) {
  return (
    <div className="fv-overlay">
      <div className="fv-card fv-start-card">
        <h2>Ready When You Are</h2>
        <p>
          Press <kbd>Space</kbd> or any spell key to pull. <kbd>Esc</kbd> cancels a cast, <kbd>R</kbd> resets.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={(e) => {
            e.currentTarget.blur();
            onStart();
          }}
        >
          Start the Fight
        </button>
        {setupLine !== undefined && <p className="fv-setup-line">{setupLine}</p>}
      </div>
    </div>
  );
}
