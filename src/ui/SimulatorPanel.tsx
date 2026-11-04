// The Simulator (simulator Task 3; spec §2 B; docs/data-sources.md Part H): plays the next fight's
// setup N times with the bot, off the main thread (src/sim-runner/client.ts), and shows mean DPS
// with σ, the standard error, a 95% interval, percentiles and the per-spell, item, uptime and mana
// numbers. A run takes a snapshot of the setup at the click, and the result is labelled with the
// settings it came from. Running disables nothing in the game.
// UI redesign: the state is `useSimulatorRun`, the form `SimulatorForm` and the result
// `SimulationResult`; the Report's Simulator tab (src/ui/report/SimulatorTab.tsx) lays them out.
// The legacy collapsed panel was removed with the legacy layout (redesign Task 5).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../data/common/ratings';
import type { ItemDb } from '../data/items/types';
import { gearNeedsDb } from '../setup/gear';
import type { SetupConfig } from '../setup/types';
import type { SimRunner } from '../sim-runner/client';
import { SIM_LIMITS } from '../sim-runner/limits';
import type { SimRequest, SimResult } from '../sim-runner/types';
import { formatDps, formatInt } from './format';
import type { GearDbStatus } from './GearPanel';

/**
 * The default runner: `runSimulation` (a worker, or the main thread), loaded on the first Run so the
 * simulator client and core stay out of the main chunk (a chunk that fails to load rejects: the
 * panel shows the error and keeps the previous result).
 */
export const lazyRunSimulation: SimRunner = (request, options) =>
  import('../sim-runner/client').then((m) => m.runSimulation(request, options));

/** Runs offered at first (spec §2 B). */
export const DEFAULT_RUNS = 1000;
/** Measured cost of one default 60 s fight in the worker (docs Part H, after the bot's performance wave). */
const MS_PER_60S_FIGHT = 1.2;
/** The largest seed (unsigned 32-bit). */
const MAX_SEED = 0xffffffff;
/** The progress text (the live region) changes at most this often; the bar follows every update. */
const ANNOUNCE_EVERY_MS = 1000;

const CURSE_NAMES: Readonly<Record<string, string>> = {
  elements: 'Curse of the Elements',
  agony: 'Curse of Agony',
  doom: 'Curse of Doom',
  none: 'no curse',
};

/** What a result came from (taken at the click). */
export interface RunLabel {
  gear: string;
  /** The talent preset's name or "Custom". */
  talents: string;
  setup: string;
  rotation: string;
  itemRules: 'default' | 'customised';
  fightSec: number;
  windowMs: number;
  runs: number;
  seed: number;
}

/** The rotation in one line: curse, DoTs, finisher, Life Tap. */
export function rotationSummary(config: SetupConfig): string {
  const r = config.rotation;
  const dots = [r.immolate && 'Immolate', r.corruption && 'Corruption'].filter(Boolean).join(' + ') || 'no DoTs';
  const lifeTap = r.lifeTapBelowMana === 'auto' ? 'Life Tap auto' : `Life Tap below ${formatInt(r.lifeTapBelowMana)} mana`;
  return [CURSE_NAMES[r.curse] ?? r.curse, dots, r.shadowburnFinisher ? 'Shadowburn finisher' : 'no Shadowburn', lifeTap].join(', ');
}

function labelLines(l: RunLabel): string[] {
  return [
    `Gear: ${l.gear}`,
    `Talents: ${l.talents}`,
    `Setup: ${l.setup}`,
    `Rotation: ${l.rotation}`,
    `Item rules: ${l.itemRules}`,
    `Fight: ${l.fightSec} s`,
    `Spell queue window: ${l.windowMs} ms`,
    `Runs: ${formatInt(l.runs)}`,
    `Seed: ${l.seed}`,
  ];
}

/** "under a second", "12 s", "2 min". */
function durationText(ms: number): string {
  if (ms < 1000) return 'under a second';
  const s = ms / 1000;
  if (s < 90) return `${Math.round(s)} s`;
  return `${Math.round(s / 60)} min`;
}

/** "under a second", "about 12 s", "about 2 min". */
const aboutText = (ms: number) => (ms < 1000 ? durationText(ms) : `about ${durationText(ms)}`);

/** Runs typed into the field: a finite number rounded and clamped to 1-100 000, or null. */
function parseRuns(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.min(SIM_LIMITS.runs.max, Math.max(SIM_LIMITS.runs.min, Math.round(n)));
}

/** A seed typed into the field: a finite number truncated and clamped to 0-4294967295, or null (blank: random). */
function parseSeed(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (Number.isNaN(n)) return null;
  return Math.min(MAX_SEED, Math.max(0, Math.trunc(n)));
}

/** A random seed for a blank field (the only use of Math.random: spec §3). */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const perFight = (x: number) => x.toFixed(2);

interface SpellRow {
  id: string;
  name: string;
  share: number;
  damage: number;
  casts: number;
  crit: number | null;
  miss: number | null;
}

function spellRows(result: SimResult): SpellRow[] {
  return Object.entries(result.perSpell)
    .map(([id, s]) => ({
      id,
      name: s.name,
      share: s.share,
      damage: s.meanDamage,
      casts: s.meanCasts,
      crit: s.meanHits > 0 ? s.meanCrits / s.meanHits : null,
      miss: s.meanCasts > 0 ? s.meanMisses / s.meanCasts : null,
    }))
    .sort((a, b) => b.damage - a.damage);
}

const nameOf = (labels: Record<string, string>, id: string) => (Object.hasOwn(labels, id) ? labels[id]! : id);

/** The result as plain text (Copy result). */
export function resultText(result: SimResult, label: RunLabel): string {
  const p = result.percentiles;
  const lines = [
    'Rotation Trainer: simulator result',
    labelLines(label).join('; '),
    `Mean DPS: ${formatDps(result.meanDps)} (σ ${formatDps(result.stdDev)} between fights; standard error of the mean ${formatDps(result.stdErr)}; 95% CI ${formatDps(result.ci95[0])} – ${formatDps(result.ci95[1])})`,
    `Min ${formatDps(result.min)}, p5 ${formatDps(p.p5)}, p25 ${formatDps(p.p25)}, median ${formatDps(result.median)}, p75 ${formatDps(p.p75)}, p95 ${formatDps(p.p95)}, max ${formatDps(result.max)}`,
    'Per spell (share, damage per fight, casts per fight, crit, miss):',
    ...spellRows(result).map(
      (s) =>
        `  ${s.name}: ${pct(s.share)}, ${formatInt(s.damage)}, ${perFight(s.casts)}, ${s.crit === null ? '-' : pct(s.crit)}, ${s.miss === null ? '-' : pct(s.miss)}`,
    ),
  ];
  const items = Object.entries(result.itemUses);
  if (items.length > 0) lines.push(`Item uses per fight: ${items.map(([id, n]) => `${nameOf(result.labels.items, id)} ${perFight(n)}`).join(', ')}`);
  lines.push(`Uptime: ${Object.entries(result.uptimes).map(([id, u]) => `${nameOf(result.labels.auras, id)} ${pct(u)}`).join(', ')}`);
  lines.push(`Mana spent per fight: ${formatInt(result.meanManaSpent)}; Life Taps per fight: ${perFight(result.meanLifeTaps)}`);
  return lines.join('\n');
}

export interface SimulatorPanelProps {
  /** The setup of the next fight (normalized): what a run plays. */
  config: SetupConfig;
  /** The item database once loaded (sent to the worker only when the gear needs it). */
  db: ItemDb | null;
  dbStatus: GearDbStatus;
  /** The gear preset's name or "Custom" (for the result's label). */
  gearName: string;
  /** The talent preset's name or "Custom" (the run plays `config.talents`). */
  talentsName: string;
  /** The setup preset's name or "Custom". */
  presetName: string;
  /** The spell queue window of the fights (default: the game's, 400 ms). */
  spellQueueWindowMs?: number;
  /** Runs the simulation (default `lazyRunSimulation`: a worker, or the main thread). Tests inject one. */
  runner?: SimRunner;
  /**
   * Called once per finished run with its result and the config it played (the Report passes the
   * trainer's `recordSimulation`, so the Setup summary's "Simulate this setup" shows it). Never for a
   * failed or cancelled run.
   */
  onResult?(result: SimResult, config: SetupConfig): void;
}

interface Running {
  total: number;
  done: number;
}

export type CopyState = { text: string; message: string; manual: boolean } | null;

/** A finished run: its result, its label and the config it played (taken at the click). */
export interface SimOutcome {
  result: SimResult;
  label: RunLabel;
  config: SetupConfig;
}

/** What `useSimulatorRun` returns: the form's fields, the run's state and its actions. */
export interface SimulatorRun {
  id: string;
  runsText: string;
  runs: number;
  seedText: string;
  running: Running | null;
  status: string;
  outcome: SimOutcome | null;
  copy: CopyState;
  blockedByDb: boolean;
  dbStatus: GearDbStatus;
  estimateMs: number;
  changeRuns(text: string): void;
  commitRuns(): void;
  changeSeed(text: string): void;
  commitSeed(): void;
  run(): void;
  cancel(): void;
  setCopy(state: CopyState): void;
  reuseSeed(seed: number): void;
}

/**
 * The Simulator's state and actions, used by the Report's Simulator tab:
 * Runs (clamped to 1-100 000 on blur) and Seed (blank: random, shown with the result), Run /
 * Cancel, progress (the bar every update, a polite text at most once per second) and the result.
 * A failed or cancelled run keeps the previous result; unmounting the owner stops a run.
 */
export function useSimulatorRun({
  config,
  db,
  dbStatus,
  gearName,
  talentsName,
  presetName,
  spellQueueWindowMs = SPELL_QUEUE_WINDOW_MS,
  runner = lazyRunSimulation,
  onResult,
}: SimulatorPanelProps): SimulatorRun {
  const id = useId();
  const [runsText, setRunsText] = useState(String(DEFAULT_RUNS));
  const [runs, setRuns] = useState(DEFAULT_RUNS);
  const [seedText, setSeedText] = useState('');
  const [running, setRunning] = useState<Running | null>(null);
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState<SimOutcome | null>(null);
  const [copy, setCopy] = useState<CopyState>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const lastAnnounceRef = useRef(Number.NEGATIVE_INFINITY);

  // Leaving the page (or a remount) stops a run: nothing would show its result.
  useEffect(
    () => () => {
      runIdRef.current++;
      controllerRef.current?.abort();
    },
    [],
  );

  const needsDb = config.gear !== undefined && gearNeedsDb(config.gear);
  const blockedByDb = needsDb && db === null;

  const commitRuns = () => {
    const n = parseRuns(runsText) ?? runs;
    setRuns(n);
    setRunsText(String(n));
    return n;
  };
  const commitSeed = () => {
    const n = parseSeed(seedText);
    setSeedText(n === null ? '' : String(n));
    return n;
  };

  const run = () => {
    if (running !== null || blockedByDb) return;
    const n = commitRuns();
    const seed = commitSeed() ?? randomSeed();
    // The snapshot: the config object of this render (configs are never mutated; a later edit is a new object).
    const runConfig = config;
    const request: SimRequest = { setup: runConfig, runs: n, seed, spellQueueWindowMs, ...(needsDb && db !== null && { db }) };
    const label: RunLabel = {
      gear: gearName,
      talents: talentsName,
      setup: presetName,
      rotation: rotationSummary(runConfig),
      itemRules: runConfig.rotation.itemUse !== undefined || runConfig.rotation.itemUseOrder !== undefined ? 'customised' : 'default',
      fightSec: runConfig.fightDurationSec,
      windowMs: spellQueueWindowMs,
      runs: n,
      seed,
    };
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    const startedAt = performance.now();
    lastAnnounceRef.current = Number.NEGATIVE_INFINITY;
    setRunning({ total: n, done: 0 });
    setStatus(`Running ${formatInt(n)} fights…`);
    const onProgress = (done: number, total: number) => {
      if (runId !== runIdRef.current) return;
      setRunning({ total, done });
      const now = performance.now();
      if (now - lastAnnounceRef.current < ANNOUNCE_EVERY_MS) return;
      lastAnnounceRef.current = now;
      const elapsed = now - startedAt;
      const left = done > 0 && elapsed > 0 ? ((total - done) * elapsed) / done : null;
      setStatus(
        `Running: ${formatInt(done)} of ${formatInt(total)} fights (${Math.floor((done / total) * 100)}%)` +
          (left !== null && done < total ? `, ${aboutText(left)} left.` : '.'),
      );
    };
    let pending: Promise<SimResult>;
    try {
      pending = runner(request, { onProgress, signal: controller.signal });
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (result) => {
        if (runId !== runIdRef.current) return;
        controllerRef.current = null;
        setRunning(null);
        setOutcome({ result, label, config: runConfig });
        setCopy(null);
        setStatus(`Done: ${formatInt(result.runs)} fights in ${durationText(performance.now() - startedAt)}.`);
        onResult?.(result, runConfig);
      },
      (error: unknown) => {
        if (runId !== runIdRef.current) return;
        controllerRef.current = null;
        setRunning(null);
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        const message = error instanceof Error || error instanceof DOMException ? error.message : String(error);
        setStatus(aborted ? 'Cancelled: the previous result is kept.' : `The simulation failed (${message}). The previous result is kept.`);
      },
    );
  };

  const cancel = () => {
    runIdRef.current++; // the run's late messages are ignored
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(null);
    setStatus('Cancelled: the previous result is kept.');
  };

  return {
    id,
    runsText,
    runs,
    seedText,
    running,
    status,
    outcome,
    copy,
    blockedByDb,
    dbStatus,
    estimateMs: runs * MS_PER_60S_FIGHT * (config.fightDurationSec / 60),
    changeRuns: (text) => {
      setRunsText(text);
      const n = parseRuns(text);
      if (n !== null) setRuns(n);
    },
    commitRuns: () => void commitRuns(),
    changeSeed: setSeedText,
    commitSeed: () => void commitSeed(),
    run,
    cancel,
    setCopy,
    reuseSeed: (seed) => setSeedText(String(seed)),
  };
}

/** "Run 1,000 Fights", "Run 1 Fight" (the button says how many). */
export function runButtonLabel(runs: number): string {
  return `Run ${formatInt(runs)} ${runs === 1 ? 'Fight' : 'Fights'}`;
}

/**
 * The Simulator's form as the Report's run bar (UI redesign spec §5.3): Runs, Seed, "Run 1,000
 * Fights" / Cancel, the estimate, the database warning, the progress bar and the status line.
 */
export function SimulatorForm({ sim }: { sim: SimulatorRun }) {
  const { id, running } = sim;
  const runsField = (
    <input
      id={`${id}-runs`}
      type="number"
      inputMode="numeric"
      min={SIM_LIMITS.runs.min}
      max={SIM_LIMITS.runs.max}
      step={1}
      value={sim.runsText}
      onChange={(e) => sim.changeRuns(e.target.value)}
      onBlur={sim.commitRuns}
    />
  );
  const seedField = (
    <input
      id={`${id}-seed`}
      type="number"
      inputMode="numeric"
      min={0}
      max={MAX_SEED}
      step={1}
      placeholder="random…"
      value={sim.seedText}
      onChange={(e) => sim.changeSeed(e.target.value)}
      onBlur={sim.commitSeed}
    />
  );
  const runButton = (
    <button
      type="button"
      className="btn primary sim-run"
      disabled={running !== null || sim.blockedByDb}
      onClick={sim.run}
    >
      {runButtonLabel(sim.runs)}
    </button>
  );
  const cancelButton = running !== null && (
    <button type="button" className="btn" onClick={sim.cancel}>
      Cancel
    </button>
  );
  const after = (
    <>
      {sim.blockedByDb && (
        <p className="setup-warn">
          {sim.dbStatus === 'error'
            ? 'The item database could not load: reload the page to simulate this gear.'
            : 'Loading the item database for this gear…'}
        </p>
      )}
      {running !== null && (
        <div
          className="sim-progress"
          role="progressbar"
          aria-label="Simulation progress"
          aria-valuemin={0}
          aria-valuemax={running.total}
          aria-valuenow={running.done}
          aria-valuetext={`${formatInt(running.done)} of ${formatInt(running.total)} fights`}
        >
          <div className="sim-progress-fill" style={{ width: `${(running.done / running.total) * 100}%` }} />
        </div>
      )}
      <p role="status" className="sim-status">
        {sim.status}
      </p>
    </>
  );

  return (
    <>
      <div className="runbar">
        <div className="runbar-field">
          <label htmlFor={`${id}-runs`}>Runs</label>
          {runsField}
        </div>
        <div className="runbar-field">
          <label htmlFor={`${id}-seed`}>Seed</label>
          {seedField}
        </div>
        {runButton}
        {cancelButton}
        <span className="note">
          Estimate: {aboutText(sim.estimateMs)} in the background. Leaving the Report stops the run. A blank seed draws a random one.
        </span>
      </div>
      {after}
    </>
  );
}

/** What ± means and what the model leaves out. */
export function PlusMinusNote() {
  return (
    <div role="note" aria-label="What ± means" className="sim-note">
      <p>
        <strong>σ</strong> (standard deviation) is the spread between single fights: about two thirds of fights land within
        the mean ± σ, 95% within ± 2σ. More runs do not make it smaller.
      </p>
      <p>
        The <strong>standard error</strong> of the mean (σ / √runs) is how precisely the mean is known: 4× the runs halve it.
        To compare two setups, compare their means; a difference smaller than about 2 × √(SE₁² + SE₂²) is noise.
      </p>
      <p>
        Limits: the bot plays the priority with perfect reactions (10 ms steps, the 400 ms spell queue window), one target,
        no movement and no health; effects the trainer does not model are left out (docs/data-sources.md). Use it to compare
        setups, not as an absolute DPS.
      </p>
    </div>
  );
}

function Stat({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd aria-label={name}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sim-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

export interface SimulationResultProps {
  result: SimResult;
  label: RunLabel;
  copy: CopyState;
  setCopy(state: CopyState): void;
  onReuseSeed(seed: number): void;
  /** The histogram (a chart the Report draws: the mean and "You" lines). */
  histogram?: ReactNode;
  /** The Report's sentence under the histogram (where your fight sits), or null. */
  histogramNote?: string | null;
  /** The Report's histogram card caption ("Your last fight marked"). */
  histogramCaption?: string;
}

/** The result region ("Simulation result"): mean, σ, SEM, CI, percentiles, histogram, per spell, items, uptime, mana, copy. */
export function SimulationResult({ result, label, copy, setCopy, onReuseSeed, histogram, histogramNote, histogramCaption }: SimulationResultProps) {
  const p = result.percentiles;
  const spells = useMemo(() => spellRows(result), [result]);
  const text = useMemo(() => resultText(result, label), [result, label]);
  const area = useRef<HTMLTextAreaElement>(null);
  const manual = copy !== null && copy.text === text && copy.manual;
  useEffect(() => {
    if (manual) area.current?.select();
  }, [manual]);

  const doCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopy({ text, message: 'Copied.', manual: false });
    } catch {
      // No clipboard (insecure origin, old browser) or permission refused: show the text selected.
      setCopy({ text, message: 'The text is selected below: press Ctrl+C (Cmd+C) to copy it.', manual: true });
    }
  }, [text, setCopy]);

  const settings = (
    <ul className="sim-settings" aria-label="Result settings">
      {labelLines(label).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
  const reuse = (
    <button
      type="button"
      className="btn small"
      aria-label={`Reuse seed ${label.seed}`}
      onClick={() => onReuseSeed(label.seed)}
    >
      Reuse seed
    </button>
  );
  const stats = (
    <dl className="statgrid">
      <Stat name="Mean DPS" value={formatDps(result.meanDps)} />
      <Stat name="Standard deviation (σ)" value={formatDps(result.stdDev)} />
      <Stat name="Standard error of the mean" value={formatDps(result.stdErr)} />
      <Stat name="95% confidence interval of the mean" value={`${formatDps(result.ci95[0])} – ${formatDps(result.ci95[1])}`} />
      <Stat name="Min" value={formatDps(result.min)} />
      <Stat name="5th percentile" value={formatDps(p.p5)} />
      <Stat name="25th percentile" value={formatDps(p.p25)} />
      <Stat name="Median" value={formatDps(result.median)} />
      <Stat name="75th percentile" value={formatDps(p.p75)} />
      <Stat name="95th percentile" value={formatDps(p.p95)} />
      <Stat name="Max" value={formatDps(result.max)} />
    </dl>
  );
  const details = (
    <>
      <Section title="Per spell">
        <div className="sim-table-wrap tbl-wrap">
          <table className="dmg sim-table">
            <caption className="visually-hidden sr-only">Per spell</caption>
            <thead>
              <tr>
                <th scope="col">Spell</th>
                <th scope="col">Share</th>
                <th scope="col">Dmg</th>
                <th scope="col">Casts</th>
                <th scope="col">Crit</th>
                <th scope="col">Miss</th>
              </tr>
            </thead>
            <tbody>
              {spells.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{pct(s.share)}</td>
                  <td>{formatInt(s.damage)}</td>
                  <td>{perFight(s.casts)}</td>
                  <td>{s.crit === null ? '–' : pct(s.crit)}</td>
                  <td>{s.miss === null ? '–' : pct(s.miss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint note">Per fight: share of the damage, damage (Dmg: direct and ticks), casts. Crit: of the hits; miss: of the casts.</p>
      </Section>
      {Object.keys(result.itemUses).length > 0 && (
        <Section title="Item uses per fight">
          <ul className="sim-list">
            {Object.entries(result.itemUses).map(([itemId, n]) => (
              <li key={itemId}>
                {nameOf(result.labels.items, itemId)}: {perFight(n)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Uptime">
        <ul className="sim-list">
          {Object.entries(result.uptimes).map(([auraId, u]) => (
            <li key={auraId}>
              {nameOf(result.labels.auras, auraId)}: {pct(u)}
            </li>
          ))}
        </ul>
      </Section>
      <dl className="statgrid">
        <Stat name="Mana spent per fight" value={formatInt(result.meanManaSpent)} />
        <Stat name="Life Taps per fight" value={perFight(result.meanLifeTaps)} />
      </dl>
      <div className="setup-preset-buttons sim-copy">
        <button
          type="button"
          className="btn"
          onClick={() => {
            void doCopy();
          }}
        >
          Copy result
        </button>
      </div>
      {copy !== null && copy.text === text && <p aria-live="polite">{copy.message}</p>}
      {manual && <textarea ref={area} className="gear-textarea" aria-label="Result text" rows={6} readOnly value={text} />}
    </>
  );

  return (
    <section className="sim-result sim-result-report" role="region" aria-label="Simulation result">
      <div className="sim-grid">
        <div className="card">
          <h2>
            Mean DPS{' '}
            <small>
              {formatInt(result.runs)} runs, seed {label.seed}
            </small>
          </h2>
          <p className="sim-big tnum">
            {formatDps(result.meanDps)}
            <small> ± {formatDps(result.stdErr)} SEM</small>
          </p>
          <p className="note">
            95% of the time the true mean lies between {formatDps(result.ci95[0])} and {formatDps(result.ci95[1])}.
          </p>
          {stats}
          {settings}
          {reuse}
        </div>
        <div className="card">
          <h2>
            DPS of {formatInt(result.runs)} {result.runs === 1 ? 'fight' : 'fights'}{' '}
            <small>{histogramCaption ?? 'The bot with this setup'}</small>
          </h2>
          {histogram}
          {histogramNote && <p className="note">{histogramNote}</p>}
        </div>
      </div>
      <div className="card sim-details">{details}</div>
    </section>
  );
}

/** The histogram in one sentence (the Report chart's description). */
export function histogramSummary(result: SimResult, peakIndex?: number, peak?: number, binStart = result.histogram.binStart, binWidth = result.histogram.binWidth): string {
  const counts = result.histogram.counts;
  const top = peak ?? Math.max(...counts);
  const at = peakIndex ?? counts.indexOf(top);
  return binWidth === 0
    ? `All ${formatInt(result.runs)} fights gave ${formatDps(binStart)} DPS.`
    : `${formatInt(result.runs)} fights from ${formatDps(result.min)} to ${formatDps(result.max)} DPS in ${counts.length} bins of ${formatDps(binWidth)}; the most common is ${formatDps(binStart + at * binWidth)} – ${formatDps(binStart + (at + 1) * binWidth)} (${formatInt(top)} fights).`;
}
