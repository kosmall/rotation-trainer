// The "Simulator" panel (simulator Task 3; spec §2 B; docs/data-sources.md Part H): plays the
// next fight's setup N times with the bot, off the main thread (src/sim-runner/client.ts), and
// shows mean DPS with σ, the standard error, a 95% interval, percentiles, a histogram and the
// per-spell, item, uptime and mana numbers. A run takes a snapshot of the setup at the click: a
// setup changed while it runs does not change it, and the result is labelled with the settings it
// came from. Running disables nothing in the game. Collapsed by default; its body is rendered only
// while it is open (the run and its result live in the panel and survive closing it).

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SPELL_QUEUE_WINDOW_MS } from '../data/common/ratings';
import type { ItemDb } from '../data/items/types';
import { gearNeedsDb } from '../setup/gear';
import type { SetupConfig } from '../setup/types';
import { runSimulation, type SimRunner } from '../sim-runner/client';
import { SIM_LIMITS } from '../sim-runner/run';
import type { SimRequest, SimResult } from '../sim-runner/types';
import { formatDps, formatInt } from './format';
import type { GearDbStatus } from './GearPanel';

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
  /** The setup preset's name or "Custom". */
  presetName: string;
  /** The spell queue window of the fights (default: the game's, 400 ms). */
  spellQueueWindowMs?: number;
  /** Runs the simulation (default `runSimulation`: a worker, or the main thread). Tests inject one. */
  runner?: SimRunner;
}

interface Running {
  total: number;
  done: number;
}

type CopyState = { text: string; message: string; manual: boolean } | null;

/**
 * The collapsed "Simulator" panel after Combat text: Runs (clamped to 1-100 000 on blur) and Seed
 * (blank: random, shown with the result), Run / Cancel, a progress bar (every update) with a
 * polite text at most once per second, and the result (see the file comment). A failed or
 * cancelled run keeps the previous result. Memoized: GameView renders every animation frame.
 */
export const SimulatorPanel = memo(function SimulatorPanel({
  config,
  db,
  dbStatus,
  gearName,
  presetName,
  spellQueueWindowMs = SPELL_QUEUE_WINDOW_MS,
  runner = runSimulation,
}: SimulatorPanelProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [runsText, setRunsText] = useState(String(DEFAULT_RUNS));
  const [runs, setRuns] = useState(DEFAULT_RUNS);
  const [seedText, setSeedText] = useState('');
  const [running, setRunning] = useState<Running | null>(null);
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState<{ result: SimResult; label: RunLabel } | null>(null);
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
    const request: SimRequest = { setup: config, runs: n, seed, spellQueueWindowMs, ...(needsDb && db !== null && { db }) };
    const label: RunLabel = {
      gear: gearName,
      setup: presetName,
      rotation: rotationSummary(config),
      itemRules: config.rotation.itemUse !== undefined || config.rotation.itemUseOrder !== undefined ? 'customised' : 'default',
      fightSec: config.fightDurationSec,
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
        setOutcome({ result, label });
        setCopy(null);
        setStatus(`Done: ${formatInt(result.runs)} fights in ${durationText(performance.now() - startedAt)}.`);
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

  const estimateMs = runs * MS_PER_60S_FIGHT * (config.fightDurationSec / 60);

  return (
    <details className="panel setup sim-panel" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Simulator</summary>
      {open && (
        <div className="setup-fields">
          <p className="hint">
            Plays the next fight&apos;s setup (gear, buffs, rotation and item rules, fight length) many times with the bot and
            shows the average. The game keeps running meanwhile.
          </p>
          <div className="setup-row">
            <label htmlFor={`${id}-runs`}>Runs</label>
            <input
              id={`${id}-runs`}
              type="number"
              inputMode="numeric"
              min={SIM_LIMITS.runs.min}
              max={SIM_LIMITS.runs.max}
              step={1}
              value={runsText}
              onChange={(e) => {
                setRunsText(e.target.value);
                const n = parseRuns(e.target.value);
                if (n !== null) setRuns(n);
              }}
              onBlur={commitRuns}
            />
          </div>
          <p className="hint">
            1 to 100 000. Estimate: {aboutText(estimateMs)} (≈{MS_PER_60S_FIGHT} ms per 60 s fight measured in a
            background worker; longer fights and more items take longer).
          </p>
          <div className="setup-row">
            <label htmlFor={`${id}-seed`}>Seed</label>
            <input
              id={`${id}-seed`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SEED}
              step={1}
              placeholder="random"
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
              onBlur={commitSeed}
            />
          </div>
          <p className="hint">Blank: a random seed (shown with the result). The same seed, runs and setup give the same result.</p>
          <div className="setup-preset-buttons sim-buttons">
            <button type="button" className="sim-run" disabled={running !== null || blockedByDb} onClick={run}>
              Run
            </button>
            {running !== null && (
              <button type="button" onClick={cancel}>
                Cancel
              </button>
            )}
          </div>
          {blockedByDb && (
            <p className="setup-warn">
              {dbStatus === 'error'
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
            {status}
          </p>
          {outcome !== null && (
            <ResultView
              result={outcome.result}
              label={outcome.label}
              copy={copy}
              setCopy={setCopy}
              onReuseSeed={(seed) => setSeedText(String(seed))}
            />
          )}
          <PlusMinusNote />
        </div>
      )}
    </details>
  );
});

/** What ± means and what the model leaves out. */
function PlusMinusNote() {
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

interface ResultViewProps {
  result: SimResult;
  label: RunLabel;
  copy: CopyState;
  setCopy(state: CopyState): void;
  onReuseSeed(seed: number): void;
}

function ResultView({ result, label, copy, setCopy, onReuseSeed }: ResultViewProps) {
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

  return (
    <section className="sim-result" role="region" aria-label="Simulation result">
      <p className="sim-headline">
        Mean <strong>{formatDps(result.meanDps)}</strong> DPS ± {formatDps(result.stdErr)} (standard error), σ{' '}
        {formatDps(result.stdDev)}
      </p>
      <ul className="sim-settings" aria-label="Result settings">
        {labelLines(label).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className="sim-link" aria-label={`Reuse seed ${label.seed}`} onClick={() => onReuseSeed(label.seed)}>
        Reuse seed
      </button>
      <dl className="sim-stats">
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
      <Histogram result={result} />
      <Section title="Per spell">
        <div className="sim-table-wrap">
          <table className="sim-table">
            <caption className="visually-hidden">Per spell</caption>
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
        <p className="hint">Per fight: share of the damage, damage (Dmg: direct and ticks), casts. Crit: of the hits; miss: of the casts.</p>
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
      <dl className="sim-stats">
        <Stat name="Mana spent per fight" value={formatInt(result.meanManaSpent)} />
        <Stat name="Life Taps per fight" value={perFight(result.meanLifeTaps)} />
      </dl>
      <div className="setup-preset-buttons">
        <button
          type="button"
          onClick={() => {
            void doCopy();
          }}
        >
          Copy result
        </button>
      </div>
      {copy !== null && copy.text === text && <p aria-live="polite">{copy.message}</p>}
      {manual && <textarea ref={area} className="gear-textarea" aria-label="Result text" rows={6} readOnly value={text} />}
    </section>
  );
}

/** The DPS histogram: one image with a text summary (no per-bar focus stops). */
function Histogram({ result }: { result: SimResult }) {
  const summaryId = useId();
  const { counts, binStart, binWidth } = result.histogram;
  const peak = Math.max(...counts);
  const peakIndex = counts.indexOf(peak);
  const width = 400;
  const height = 100;
  const barW = width / counts.length;
  const summary =
    binWidth === 0
      ? `All ${formatInt(result.runs)} fights gave ${formatDps(binStart)} DPS.`
      : `${formatInt(result.runs)} fights from ${formatDps(result.min)} to ${formatDps(result.max)} DPS in ${counts.length} bins of ${formatDps(binWidth)}; the most common is ${formatDps(binStart + peakIndex * binWidth)} – ${formatDps(binStart + (peakIndex + 1) * binWidth)} (${formatInt(peak)} fights).`;
  return (
    <figure className="sim-histogram">
      <svg
        role="img"
        aria-label="DPS histogram"
        aria-describedby={summaryId}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {counts.map((c, i) =>
          c === 0 ? null : (
            <rect key={i} x={i * barW + 0.5} width={Math.max(barW - 1, 1)} y={height - (c / peak) * height} height={(c / peak) * height} />
          ),
        )}
      </svg>
      <div className="sim-axis" aria-hidden="true">
        <span>{formatDps(result.min)}</span>
        <span>median {formatDps(result.median)}</span>
        <span>{formatDps(result.max)}</span>
      </div>
      <figcaption id={summaryId} className="hint">
        {summary}
      </figcaption>
    </figure>
  );
}
