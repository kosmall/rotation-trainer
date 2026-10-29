/** Shown before the fight: the clock starts with Space, the first spell hotkey or this button. */
export function StartOverlay({ onStart }: { onStart(): void }) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>Ready when you are</h2>
        <button
          type="button"
          className="primary"
          onClick={(e) => {
            e.currentTarget.blur();
            onStart();
          }}
        >
          Start the fight
        </button>
        <p className="hint">
          or press <kbd>Space</kbd> or any spell hotkey. <kbd>Esc</kbd> cancels a cast, <kbd>R</kbd> resets.
        </p>
      </div>
    </div>
  );
}
