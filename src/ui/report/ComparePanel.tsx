// Report → Compare (rotation scripts Task 5, spec §2 C; UI redesign spec §5.3, §6): pick 2-5 rows
// (the current setup and saved scenarios, each scenario applied to the current setup with its own
// setup parts, as Apply with "Also apply its setup" would), Runs and Seed, Run / Cancel / progress
// as on the Simulator tab, then the paired comparison (src/sim-runner/compare.ts: every row plays
// run i with the same seed, so the differences are paired): a table with mean ± σ, SEM, the
// difference against the baseline with its paired standard error, 95% CI and verdict, the rank;
// histograms side by side; the rule fires of each row; and what the numbers mean, the
// multiple-comparisons caveat included. Works without a fight. The run lives in ReportView.

import { memo, useEffect, useMemo, useState } from 'react';
import { applyScenario, parseScenarioValue } from '../../scenarios/format';
import { COMPARE_LIMITS } from '../../sim-runner/compare';
import { SPELL_QUEUE_WINDOW_MS } from '../../data/common/ratings';
import { gearNeedsDb } from '../../setup/gear';
import type { SetupConfig } from '../../setup/types';
import type { PairedDelta, SimRequest } from '../../sim-runner/types';
import { Histogram } from '../charts/Histogram';
import { formatDps, formatInt } from '../format';
import { routeHref } from '../shell/router';
import { histogramSummary, MAX_SEED } from '../SimulatorPanel';
import { SIM_LIMITS } from '../../sim-runner/limits';
import { useTrainer } from '../state/TrainerProvider';
import type { LastComparison } from '../state/TrainerProvider';
import type { CompareRequestSet, CompareRunState } from './compareRun';

/** The key of the current setup's row (library ids are `[a-z0-9-]`, so it never collides). */
export const CURRENT = '#current';

/** Measured cost of one default 60 s fight (the Simulator's estimate). */
const MS_PER_60S_FIGHT = 1.2;

const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${formatDps(Math.abs(x))}`;

/** "Better (significant)", "Worse (significant)" or "No clear difference" (the CLI's verdict in words). */
export function verdictText(d: PairedDelta): string {
  if (!d.significant) return 'No clear difference';
  return d.meanDiff > 0 ? 'Better (significant)' : 'Worse (significant)';
}

/** The chance of at least one false "significant" among `tests` independent 95% tests: 1 − 0.95^tests. */
export function familyErrorRate(tests: number): number {
  return 1 - 0.95 ** Math.max(0, tests);
}

interface Row {
  key: string;
  name: string;
  detail: string;
  config: SetupConfig | null;
  errors: string[];
  warnings: number;
}

function ResultView({ outcome, onReuseSeed }: { outcome: LastComparison; onReuseSeed(seed: number): void }) {
  const { result, names } = outcome;
  const tests = result.results.length - 1;
  const fwer = familyErrorRate(tests);
  const ruleKeys = result.results.map((r) => Object.entries(r.ruleFires ?? {}));
  return (
    <section className="cmp-result" role="region" aria-label="Comparison result">
      <div className="card">
        <h2>
          Paired Comparison{' '}
          <small>
            {formatInt(result.runs)} runs per scenario, seed {result.seed}, the same seeds for every scenario
          </small>
        </h2>
        <div className="tbl-wrap">
          <table className="dmg cmp-table">
            <caption className="sr-only">Scenarios against the baseline ({names[0]})</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Scenario</th>
                <th scope="col">Mean DPS</th>
                <th scope="col">σ</th>
                <th scope="col">SEM</th>
                <th scope="col">Δ vs baseline</th>
                <th scope="col">SE of Δ</th>
                <th scope="col">95% CI of Δ</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => {
                const d = result.deltas[i] ?? null;
                return (
                  <tr key={i} className={i === 0 ? 'cmp-base' : undefined}>
                    <td className="tnum">{result.ranks[i]}</td>
                    <th scope="row">{names[i]}</th>
                    <td className="tnum">{formatDps(r.meanDps)}</td>
                    <td className="tnum">{formatDps(r.stdDev)}</td>
                    <td className="tnum">{formatDps(r.stdErr)}</td>
                    {d === null ? (
                      <>
                        <td colSpan={3}>Baseline</td>
                        <td>–</td>
                      </>
                    ) : (
                      <>
                        <td className="tnum">{signed(d.meanDiff)}</td>
                        <td className="tnum">{formatDps(d.sem)}</td>
                        <td className="tnum">
                          {signed(d.ci95[0])} to {signed(d.ci95[1])}
                        </td>
                        <td className={d.significant ? (d.meanDiff > 0 ? 'cmp-better' : 'cmp-worse') : undefined}>{verdictText(d)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn small" aria-label={`Reuse seed ${result.seed}`} onClick={() => onReuseSeed(result.seed)}>
          Reuse seed
        </button>
      </div>
      <div className="cmp-hists">
        {result.results.map((r, i) => (
          <div className="card" key={i}>
            <h2>
              {names[i]} <small>{formatDps(r.meanDps)} DPS</small>
            </h2>
            <Histogram
              counts={r.histogram.counts}
              binStart={r.histogram.binStart}
              binWidth={r.histogram.binWidth}
              mean={r.meanDps}
              you={null}
              height={200}
              name={`DPS histogram, ${names[i]}`}
              description={histogramSummary(r)}
            />
          </div>
        ))}
      </div>
      <div className="card">
        <h2>
          Rule Fires <small>mean per fight: how often each rule started its cast or use</small>
        </h2>
        <div className="cmp-fires">
          {result.results.map((_, i) => (
            <div key={i} role="group" aria-label={`Rule fires, ${names[i]}`}>
              <h3>{names[i]}</h3>
              <table className="dmg">
                <thead>
                  <tr>
                    <th scope="col">Rule</th>
                    <th scope="col">Per fight</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleKeys[i]!.map(([key, f]) => (
                    <tr key={key}>
                      <td>
                        {f.label} <small className="note">{key}</small>
                      </td>
                      <td className="tnum">{f.meanFires.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
      <div role="note" aria-label="How to read the comparison" className="sim-note">
        <p>
          <strong>Paired:</strong> run <i>i</i> of every scenario uses the same seed, so luck (crits, misses, procs) is shared and
          the difference of each pair is measured directly. <strong>SE of Δ</strong> is the standard error of those paired
          differences; it is usually much smaller than the scenarios’ own SEMs, which is why a small Δ can still be clear.
        </p>
        <p>
          <strong>Verdict:</strong> “significant” means the 95% interval of Δ leaves out 0. Each scenario is one test against the
          baseline, with no correction for <strong>multiple comparisons</strong>: with {tests} {tests === 1 ? 'test' : 'tests'}, the
          chance that at least one “significant” verdict is luck is about {(fwer * 100).toFixed(0)}% when no scenario truly differs.
          Re-run a surprising winner with another seed (or more runs) before you trust it.
        </p>
        <p>
          The bot plays each script with perfect reactions; a difference here is a difference between rotations, not a promise
          about your own play.
        </p>
      </div>
    </section>
  );
}

export const ComparePanel = memo(function ComparePanel({ run }: { run: CompareRunState }) {
  const { state, actions } = useTrainer();
  const { config, scenarios, itemDb, nextFight } = state;
  const entries = scenarios.entries;
  const db = itemDb.db;
  const [chosen, setChosen] = useState<readonly string[]>([CURRENT]);
  const [baseline, setBaseline] = useState(CURRENT);

  // Drop rows whose scenario was deleted meanwhile.
  const live = useMemo(() => chosen.filter((k) => k === CURRENT || entries.some((e) => e.id === k)), [chosen, entries]);

  const rows = useMemo<Row[]>(
    () => [
      {
        key: CURRENT,
        name: 'Current setup',
        detail: config.script !== undefined && config.script.rules.length > 0 ? `Script, ${config.script.rules.length} rules` : 'Basic rotation',
        config,
        errors: [],
        warnings: nextFight.script.warnings.length,
      },
      ...entries.map((e) => ({ key: e.id, name: e.scenario.name, detail: e.scenario.description ?? '', config: null, errors: [], warnings: 0 })),
    ],
    [config, entries, nextFight],
  );
  // The chosen scenarios applied to the current setup and checked against it.
  const checked = useMemo(() => {
    const out = new Map<string, Row>();
    for (const key of live) {
      const row = rows.find((r) => r.key === key);
      if (row === undefined) continue;
      if (key === CURRENT) {
        out.set(key, row);
        continue;
      }
      const scenario = entries.find((e) => e.id === key)!.scenario;
      const parse = parseScenarioValue(scenario, { base: config, db });
      out.set(key, {
        ...row,
        config: applyScenario(config, scenario, { includeSetup: true, db }),
        errors: parse.errors.map((e) => `${e.path}: ${e.message}`),
        warnings: parse.warnings.length,
      });
    }
    return out;
  }, [live, rows, entries, config, db]);

  const order = useMemo(() => {
    const base = live.includes(baseline) ? baseline : live[0];
    return base === undefined ? [] : [base, ...live.filter((k) => k !== base)];
  }, [live, baseline]);
  const needsDb = order.some((k) => {
    const c = checked.get(k)?.config;
    return c != null && c.gear !== undefined && gearNeedsDb(c.gear);
  });
  const blockedByDb = needsDb && db === null;
  const { requestDb } = actions;
  useEffect(() => {
    if (needsDb) requestDb();
  }, [needsDb, requestDb]);
  const invalid = order.filter((k) => (checked.get(k)?.errors.length ?? 0) > 0);
  const count = order.length;
  const canRun = count >= COMPARE_LIMITS.min && count <= COMPARE_LIMITS.max && invalid.length === 0 && !blockedByDb && run.running === null;

  const toggle = (key: string, on: boolean) =>
    setChosen((prev) => {
      const now = prev.filter((k) => k === CURRENT || entries.some((e) => e.id === k));
      if (on) return now.includes(key) || now.length >= COMPARE_LIMITS.max ? now : [...now, key];
      return now.filter((k) => k !== key);
    });

  const build = (runs: number, seed: number): CompareRequestSet | null => {
    if (!canRun) return null;
    const configs = order.map((k) => checked.get(k)!.config!);
    const requests: SimRequest[] = configs.map((c) => ({
      setup: c,
      runs,
      seed,
      spellQueueWindowMs: SPELL_QUEUE_WINDOW_MS,
      ...(c.gear !== undefined && gearNeedsDb(c.gear) && db !== null && { db }),
    }));
    return { requests, configs, names: order.map((k) => checked.get(k)!.name) };
  };

  const estimateMs = useMemo(
    () => order.reduce((sum, k) => sum + run.runs * MS_PER_60S_FIGHT * ((checked.get(k)?.config?.fightDurationSec ?? 60) / 60), 0),
    [order, checked, run.runs],
  );

  if (!scenarios.loaded) return <p className="note">Loading the scenario library…</p>;
  if (entries.length === 0 && run.outcome === null) {
    return (
      <div className="empty-state">
        <h2>Compare Two or More Scenarios</h2>
        <p>Save your current setup as a scenario, or import one, then run them on the same seeds to see which is really better.</p>
        <a className="btn primary" href={routeHref({ mode: 'setup', section: 'scenarios' })}>
          Open Scenarios
        </a>
      </div>
    );
  }

  return (
    <div className="cmp-tab">
      <fieldset className="cmp-pick">
        <legend>
          Scenarios to compare <small>(2 to 5; the first is the baseline)</small>
        </legend>
        <ul>
          {rows.map((r) => {
            const on = live.includes(r.key);
            const row = checked.get(r.key);
            return (
              <li key={r.key} className={on ? 'on' : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && live.length >= COMPARE_LIMITS.max}
                    onChange={(e) => toggle(r.key, e.target.checked)}
                  />
                  <span>
                    {r.name}
                    {r.detail !== '' && <small>{r.detail}</small>}
                  </span>
                </label>
                {on && row !== undefined && row.errors.length > 0 && (
                  <p className="setup-warn">
                    {row.errors[0]}
                    {row.errors.length > 1 && ` (and ${row.errors.length - 1} more)`}.{' '}
                    <a href={routeHref({ mode: 'setup', section: 'scenarios' })}>Fix it in Scenarios</a>
                  </p>
                )}
                {on && row !== undefined && row.errors.length === 0 && row.warnings > 0 && (
                  <p className="note">
                    {row.warnings} {row.warnings === 1 ? 'warning' : 'warnings'} with this setup (some rules may be left out).
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {live.length >= COMPARE_LIMITS.max && <p className="note">At most {COMPARE_LIMITS.max} scenarios at once.</p>}
        {entries.length === 0 && (
          <p className="note">
            Only the current setup is here: <a href={routeHref({ mode: 'setup', section: 'scenarios' })}>save or import a scenario</a> to
            compare it.
          </p>
        )}
      </fieldset>
      <div className="runbar">
        <div className="runbar-field">
          <label htmlFor={`${run.id}-base`}>Baseline</label>
          <select id={`${run.id}-base`} value={order[0] ?? ''} disabled={order.length === 0} onChange={(e) => setBaseline(e.target.value)}>
            {order.map((k) => (
              <option key={k} value={k}>
                {checked.get(k)?.name ?? k}
              </option>
            ))}
          </select>
        </div>
        <div className="runbar-field">
          <label htmlFor={`${run.id}-runs`}>Runs</label>
          <input
            id={`${run.id}-runs`}
            type="number"
            inputMode="numeric"
            min={SIM_LIMITS.runs.min}
            max={SIM_LIMITS.runs.max}
            step={1}
            value={run.runsText}
            onChange={(e) => run.changeRuns(e.target.value)}
            onBlur={run.commitRuns}
          />
        </div>
        <div className="runbar-field">
          <label htmlFor={`${run.id}-seed`}>Seed</label>
          <input
            id={`${run.id}-seed`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEED}
            step={1}
            placeholder="random…"
            value={run.seedText}
            onChange={(e) => run.changeSeed(e.target.value)}
            onBlur={run.commitSeed}
          />
        </div>
        <button type="button" className="btn primary sim-run" disabled={!canRun} onClick={() => run.run(build)}>
          Compare {count} {count === 1 ? 'Scenario' : 'Scenarios'}
        </button>
        {run.running !== null && (
          <button type="button" className="btn" onClick={run.cancel}>
            Cancel
          </button>
        )}
        <span className="note">
          {formatInt(run.runs)} runs each, about {formatInt(Math.round(estimateMs / 1000))} s in the background. Leaving the Report stops the
          run. A blank seed draws a random one.
        </span>
      </div>
      {count < COMPARE_LIMITS.min && <p className="note">Choose at least two scenarios.</p>}
      {blockedByDb && (
        <p className="setup-warn">
          {itemDb.status === 'error' ? 'The item database could not load: reload the page to compare this gear.' : 'Loading the item database for this gear…'}
        </p>
      )}
      {run.running !== null && (
        <div
          className="sim-progress"
          role="progressbar"
          aria-label="Comparison progress"
          aria-valuemin={0}
          aria-valuemax={run.running.total}
          aria-valuenow={run.running.done}
          aria-valuetext={`${formatInt(run.running.done)} of ${formatInt(run.running.total)} fights`}
        >
          <div className="sim-progress-fill" style={{ width: `${(run.running.done / run.running.total) * 100}%` }} />
        </div>
      )}
      <p role="status" className="sim-status">
        {run.status}
      </p>
      {run.outcome !== null && <ResultView outcome={run.outcome} onReuseSeed={run.reuseSeed} />}
    </div>
  );
});

export default ComparePanel;
