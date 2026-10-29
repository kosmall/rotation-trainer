import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDestructionWarlock } from '../data/classes/warlock/destruction';
import type { WarlockOptions } from '../data/classes/warlock/destruction';
import type { SpecData } from '../data/types';
import { activeSetBonuses } from '../engine/sets';
import { computeStats } from '../engine/stats';
import type { RawStats, SimSnapshot, SpellDef, SpellModifier } from '../engine/types';
import { applySetup } from '../setup/applySetup';
import { normalizeSetup, SETUP_CATALOG } from '../setup/defaults';
import { SETUP_PRESETS } from '../setup/presets';
import { browserStorage, loadSetup, saveSetup } from '../setup/storage';
import type { SetupStorage } from '../setup/storage';
import type { AppliedSetup, SetupConfig } from '../setup/types';
import { ActionBar, REJECT_LABELS } from './ActionBar';
import type { SlotFlash } from './ActionBar';
import { CastBar } from './CastBar';
import { formatDps, formatInt, secondsText } from './format';
import { keyToSlot } from './keys';
import { ManaBar } from './ManaBar';
import { SetBonusList } from './SetBonusList';
import { activePresetName, SetupPanel } from './SetupPanel';
import { StartOverlay } from './StartOverlay';
import { AuraList, TargetPanel } from './TargetPanel';
import { useSimulation } from './useSimulation';

/** How long a rejected press shows its reason on the slot. */
const FLASH_MS = 700;

/** Fields that take typed text or arrow keys: every key typed into them is theirs, never a hotkey. */
const TEXT_TARGETS =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), select, textarea, [contenteditable]:not([contenteditable="false"])';
/** Toggles (a `<summary>`, checkboxes, radios): only Space and Enter belong to them, the other hotkeys still work after a click. */
const TOGGLE_TARGETS = 'summary, input[type="checkbox"], input[type="radio"]';

function isHotkeyBlocked(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof Element)) return false;
  if (target.matches(TEXT_TARGETS)) return true;
  return target.matches(TOGGLE_TARGETS) && (event.key === ' ' || event.key === 'Enter');
}

/** The next fight's setup: the config it comes from plus `applySetup`'s spec and fight settings. */
interface NextFight extends AppliedSetup {
  config: SetupConfig;
}

export interface GameViewProps {
  /** Builds the spec for the warlock options (default: the Destruction Warlock). */
  buildSpec?: (warlock: WarlockOptions) => SpecData;
  /**
   * Where the setup is loaded from and saved to (read once, at mount); default the browser's
   * localStorage. `null`: kept in memory only. A storage that throws behaves like `null`
   * (storage.ts never throws).
   */
  storage?: SetupStorage | null;
}

/**
 * The playable fight: target, cast bar, mana, action bar, live numbers and the end summary, plus
 * the Setup panel. The setup (`SetupConfig`) lives here: loaded once at mount, every edit
 * normalized, saved and turned into the next fight (`applySetup`); a fight that has not started
 * takes it at once, a running or ended one keeps its own until R (useSimulation). The Priority
 * list and the stats at the pull follow the setup at once.
 */
export function GameView({ buildSpec = buildDestructionWarlock, storage }: GameViewProps) {
  const [store] = useState<SetupStorage | null>(() => (storage === undefined ? browserStorage() : storage));
  const [config, setConfig] = useState<SetupConfig>(() => loadSetup(store, SETUP_CATALOG));
  const changeConfig = useCallback(
    (edited: SetupConfig) => {
      const next = normalizeSetup(edited, SETUP_CATALOG);
      setConfig(next);
      saveSetup(store, next, SETUP_CATALOG); // false (full, private mode): kept in memory only
    },
    [store],
  );
  const nextFight = useMemo<NextFight>(
    () => ({ config, ...applySetup({ buildSpec, catalog: SETUP_CATALOG, config }) }),
    [buildSpec, config],
  );
  const { snapshot, fight, cast, cancel, reset, start } = useSimulation(nextFight);
  // The running (or ended) fight's own spec: its auras, spells and keybinds.
  const spec = fight.spec;
  const priority = nextFight.spec.priority;
  const fightPreset = useMemo(() => activePresetName(fight.config, SETUP_PRESETS, SETUP_CATALOG), [fight.config]);
  const pending = fight !== nextFight && snapshot.phase !== 'ready';
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

  const fightRemainingMs = Math.max(0, snapshot.durationMs - snapshot.nowMs);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isHotkeyBlocked(event)) return; // e.g. digits typed into the distance field, Space on a focused <summary>
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
        <FightStats snapshot={snapshot} config={fight.config} presetName={fightPreset} />
        <section className="arena">
          <TargetPanel spec={spec} targetAuras={snapshot.targetAuras} fightRemainingMs={fightRemainingMs} />
          {snapshot.phase === 'ready' && <StartOverlay onStart={start} />}
          {snapshot.phase === 'ended' && (
            <EndSummary snapshot={snapshot} config={fight.config} presetName={fightPreset} onReset={doReset} />
          )}
        </section>
        <div className="player">
          <AuraList spec={spec} auras={snapshot.selfAuras} label="Buffs" fightRemainingMs={fightRemainingMs} />
          <CastBar spec={spec} snapshot={snapshot} />
          <ManaBar snapshot={snapshot} />
          <ActionBar spec={spec} snapshot={snapshot} flash={flash} onPress={pressSlot} />
        </div>
      </main>
      <aside className="game-side">
        <SetupPanel
          catalog={SETUP_CATALOG}
          config={config}
          presets={SETUP_PRESETS}
          onChange={changeConfig}
          fightLengthSec={snapshot.durationMs / 1000}
          pending={pending}
        />
        <CharacterStats spec={nextFight.spec} />
        <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} />
        <details className="panel priority">
          <summary>Priority</summary>
          <ol>
            {priority.map((step) => (
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
const DPS_NOTE_NO_BUFFS = 'No raid buffs, consumables or trinket effects — approximate (see docs/data-sources.md)';
const DPS_NOTE_WITH_BUFFS =
  'Includes the enabled buffs; trinket/proc effects not selected are excluded — approximate (see docs/data-sources.md)';

/** The fight's setup name and what its DPS leaves out (depends on whether any buff is enabled). */
function DpsNote({ config, presetName }: { config: SetupConfig; presetName: string }) {
  return (
    <p className="dps-note">
      <span className="setup-tag">Setup: {presetName}</span>
      <span>{config.enabledBuffs.length === 0 ? DPS_NOTE_NO_BUFFS : DPS_NOTE_WITH_BUFFS}</span>
    </p>
  );
}

interface FightInfoProps {
  snapshot: SimSnapshot;
  config: SetupConfig;
  presetName: string;
}

function FightStats({ snapshot, config, presetName }: FightInfoProps) {
  return (
    <div>
      <dl className="fight-stats">
        <div>
          <dt>DPS</dt>
          <dd aria-label="DPS">{formatDps(snapshot.dps)}</dd>
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
      <DpsNote config={config} presetName={presetName} />
    </div>
  );
}

function EndSummary({ snapshot, config, presetName, onReset }: FightInfoProps & { onReset(): void }) {
  return (
    <div className="overlay">
      <section className="overlay-card" role="region" aria-label="Fight summary">
        <h2>Fight over</h2>
        <dl className="summary">
          <dt>Total damage</dt>
          <dd aria-label="Total damage">{formatInt(snapshot.damageTotal)}</dd>
          <dt>DPS</dt>
          <dd aria-label="DPS">{formatDps(snapshot.dps)}</dd>
          <dt>Duration</dt>
          <dd aria-label="Duration">{secondsText(snapshot.nowMs)} s</dd>
        </dl>
        <DpsNote config={config} presetName={presetName} />
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

/** Crit chance added by the modifiers that match `spell` (id and school), or that match every spell when it is undefined. */
function critDelta(modifiers: readonly SpellModifier[], spell?: SpellDef): number {
  let sum = 0;
  for (const m of modifiers) {
    const matches = spell
      ? (m.spellIds === undefined || m.spellIds.includes(spell.id)) &&
        (m.schools === undefined || m.schools.includes(spell.school))
      : m.spellIds === undefined && m.schools === undefined;
    if (matches) sum += m.critPctDelta ?? 0;
  }
  return sum;
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/**
 * The character at the pull of the next fight, as the Simulation builds it (spec stat bonuses,
 * active set bonuses, multipliers; timed buffs not counted). Crit includes the crit modifiers
 * (Moonkin Aura, Totem of Wrath, talents), which `computeStats` leaves out but the Simulation
 * adds to every roll: "Spell crit" those for every spell (a character sheet's value), "Shadow
 * Bolt crit" those that match Shadow Bolt too (Devastation).
 */
function CharacterStats({ spec }: { spec: SpecData }) {
  const view = useMemo(() => {
    const sets = activeSetBonuses(spec.sets, spec.setup.setPieces);
    const bonuses: Partial<RawStats> = {};
    for (const b of [spec.statBonuses, ...sets.map((s) => s.statBonuses ?? {})]) {
      for (const key of Object.keys(b) as (keyof RawStats)[]) bonuses[key] = (bonuses[key] ?? 0) + (b[key] ?? 0);
    }
    const stats = computeStats(spec.setup, bonuses);
    const modifiers = [...spec.modifiers, ...spec.setup.modifiers, ...sets.flatMap((s) => s.modifiers ?? [])];
    const bolt = spec.spells.find((s) => s.id === 'shadow-bolt');
    return {
      stats,
      spellCrit: stats.critPct + critDelta(modifiers),
      boltCrit: bolt ? stats.critPct + critDelta(modifiers, bolt) : null,
    };
  }, [spec]);
  const { stats } = view;
  const rows: [string, string][] = [
    ['Shadow power', formatInt(stats.power.shadow)],
    ['Fire power', formatInt(stats.power.fire)],
    ['Spell crit', pct(view.spellCrit)],
    ...(view.boltCrit === null ? [] : ([['Shadow Bolt crit', pct(view.boltCrit)]] as [string, string][])),
    ['Spell hit', pct(stats.hitPct)],
    ['Spell haste', pct(stats.hastePct)],
    ['Max mana', formatInt(stats.maxMana)],
    ['Mana regen (mp5)', formatInt(stats.mp5RegenPerSec * 5)],
  ];
  return (
    <section className="panel char-stats" aria-label="Stats at the pull">
      <h3>Stats at the pull</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd aria-label={label}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">Next fight, before timed buffs. Crit includes the crit modifiers the fight rolls with.</p>
    </section>
  );
}
