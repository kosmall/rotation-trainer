import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpecData } from '../data/types';
import type { SimSnapshot } from '../engine/types';
import { ActionBar, REJECT_LABELS } from './ActionBar';
import type { SlotFlash } from './ActionBar';
import { CastBar } from './CastBar';
import { formatInt, secondsText } from './format';
import { keyToSlot } from './keys';
import { ManaBar } from './ManaBar';
import { SetBonusList } from './SetBonusList';
import { StartOverlay } from './StartOverlay';
import { AuraList, TargetPanel } from './TargetPanel';
import { useSimulation } from './useSimulation';

/** How long a rejected press shows its reason on the slot. */
const FLASH_MS = 700;

/** The playable fight: target, cast bar, mana, action bar, live numbers and the end summary. */
export function GameView({ spec }: { spec: SpecData }) {
  const { snapshot, cast, cancel, reset, start } = useSimulation(spec);
  const [flash, setFlash] = useState<SlotFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((slot: number, label: string) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setFlash((prev) => ({ slot, label, id: (prev?.id ?? 0) + 1 }));
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setFlash(null);
    }, FLASH_MS);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    },
    [],
  );

  const pressSlot = useCallback(
    (slot: number) => {
      const spellId = spec.keybinds[slot];
      if (!spellId) return; // empty slot
      const result = cast(spellId);
      if (result.ok) setFlash((prev) => (prev?.slot === slot ? null : prev));
      else {
        const label = REJECT_LABELS[result.reason];
        if (label) showFlash(slot, label);
      }
    },
    [cast, showFlash, spec],
  );

  const doReset = useCallback(() => {
    setFlash(null);
    reset();
  }, [reset]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const slot = keyToSlot(event.key);
      const handled = slot !== undefined || event.key === 'Escape' || event.key === ' ' || event.key === 'r' || event.key === 'R';
      if (!handled) return;
      event.preventDefault();
      if (event.repeat) return; // a held key must not spam the queue
      if (slot !== undefined) pressSlot(slot);
      else if (event.key === 'Escape') cancel();
      else if (event.key === ' ') start(); // no-op once the fight runs
      else doReset();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancel, doReset, pressSlot, start]);

  return (
    <div className="game">
      <main className="game-main">
        <FightStats snapshot={snapshot} />
        <section className="arena">
          <TargetPanel spec={spec} targetAuras={snapshot.targetAuras} />
          {snapshot.phase === 'ready' && <StartOverlay onStart={start} />}
          {snapshot.phase === 'ended' && <EndSummary snapshot={snapshot} onReset={doReset} />}
        </section>
        <div className="player">
          <AuraList spec={spec} auras={snapshot.selfAuras} label="Buffs" />
          <CastBar spec={spec} snapshot={snapshot} />
          <ManaBar snapshot={snapshot} />
          <ActionBar spec={spec} snapshot={snapshot} flash={flash} onPress={pressSlot} />
        </div>
      </main>
      <aside className="game-side">
        <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} />
        <details className="panel priority">
          <summary>Priority</summary>
          <ol>
            {spec.priority.map((step) => (
              <li key={step.spellId}>
                <strong>{step.label}</strong>
                <span className="hint">{step.hint}</span>
              </li>
            ))}
          </ol>
        </details>
      </aside>
    </div>
  );
}

/** What the trainer's DPS leaves out (full list: docs/data-sources.md, "What the DPS excludes"). */
const DPS_NOTE = 'No raid buffs, consumables or trinket effects — approximate (see docs/data-sources.md)';

function FightStats({ snapshot }: { snapshot: SimSnapshot }) {
  return (
    <div>
      <dl className="fight-stats">
        <div>
          <dt>DPS</dt>
          <dd aria-label="DPS">{formatInt(snapshot.dps)}</dd>
        </div>
        <div>
          <dt>Total damage</dt>
          <dd aria-label="Total damage">{formatInt(snapshot.damageTotal)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd aria-label="Elapsed">
            {secondsText(snapshot.nowMs)} / {Math.round(snapshot.durationMs / 1000)}s
          </dd>
        </div>
      </dl>
      <p className="dps-note">{DPS_NOTE}</p>
    </div>
  );
}

function EndSummary({ snapshot, onReset }: { snapshot: SimSnapshot; onReset(): void }) {
  return (
    <div className="overlay">
      <section className="overlay-card" role="region" aria-label="Fight summary">
        <h2>Fight over</h2>
        <dl className="summary">
          <dt>Total damage</dt>
          <dd aria-label="Total damage">{formatInt(snapshot.damageTotal)}</dd>
          <dt>DPS</dt>
          <dd aria-label="DPS">{snapshot.dps.toFixed(1)}</dd>
          <dt>Duration</dt>
          <dd aria-label="Duration">{secondsText(snapshot.nowMs)} s</dd>
        </dl>
        <p className="dps-note">{DPS_NOTE}</p>
        <button
          type="button"
          className="primary"
          onClick={(e) => {
            e.currentTarget.blur();
            onReset();
          }}
        >
          Reset
        </button>
        <p className="hint">
          or press <kbd>R</kbd>
        </p>
      </section>
    </div>
  );
}
