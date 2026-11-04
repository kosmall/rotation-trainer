// The Report screen (UI redesign Task 4, spec §3.5, §5.3, §6; fight timeline and key fights Task
// K3, docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A, E, F): the
// shown fight's summary (hero DPS; a played fight: the share of the bot's DPS with the same setup
// and seed; a simulation's fight: its deviation from the simulation's mean in σ; KPIs, what it was
// played with, Fight Again, Copy Report), the "Fight source" selector (the last played fight, the
// last simulation's highest / typical / lowest DPS fight, a history fight; History… opens the
// Fights panel), "Setup Used" (the fight's setup snapshot, loaded on demand), the tabs as links
// (`#/report/<tab>`, `aria-current`) and the current tab's panel, loaded lazily. Every fight tab
// shows the selected fight (`meta.reportFight`). Without a fight the fight tabs show the empty
// state; Simulator and Compare work without one. Reads only `useTrainer()` (never the per-frame
// snapshot). A refused history save is shown.

import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import { formatDps, formatInt, secondsText } from '../format';
import { navigate, routeHref, SETUP_SECTION_TITLES } from '../shell/router';
import type { ReportTab, SetupSection } from '../shell/router';
import { useSimulatorRun } from '../SimulatorPanel';
import type { SimulatorRun } from '../SimulatorPanel';
import { useCompareRun } from './compareRun';
import type { CompareRunState } from './compareRun';
import { setupKeyOf } from '../state/history';
import type { HistoryPatch } from '../state/history';
import { useTrainer } from '../state/TrainerProvider';
import type { ChipLabels, ReportFightState } from '../state/TrainerProvider';
import { FightsPanel } from './FightsPanel';
import { FightSourceSelect, historyTitle, sourceOptions } from './FightSourceSelect';
import type { SourceOption } from './FightSourceSelect';
import type { ReportFight } from './reportFight';
import { botShareText, buildReportModel, reportText, sigmaText } from './reportModel';
import type { ReportModel } from './reportModel';
import './report.css';
import { countRender } from '../renderCount';

const DamageTab = lazy(() => import('./DamageTab').then((m) => ({ default: m.DamageTab })));
const TimelineTab = lazy(() => import('./TimelineTab').then((m) => ({ default: m.TimelineTab })));
const LogTab = lazy(() => import('./LogTab').then((m) => ({ default: m.LogTab })));
const RotationTab = lazy(() => import('./RotationTab').then((m) => ({ default: m.RotationTab })));
const SimulatorTab = lazy(() => import('./SimulatorTab').then((m) => ({ default: m.SimulatorTab })));
const ComparePanel = lazy(() => import('./ComparePanel'));
const SetupUsed = lazy(() => import('./SetupUsed'));

/** The Report's model of each fight, built once per fight object (switching sources back is free). */
const models = new WeakMap<ReportFight, ReportModel>();
function modelOf(fight: ReportFight): ReportModel {
  let m = models.get(fight);
  if (m === undefined) {
    m = buildReportModel(fight);
    models.set(fight, m);
  }
  return m;
}

export const REPORT_TAB_TITLES: Readonly<Record<ReportTab, string>> = {
  damage: 'Damage',
  timeline: 'Timeline',
  log: 'Log',
  rotation: 'Rotation',
  simulator: 'Simulator',
  compare: 'Compare',
};

const FIGHT_TABS: readonly ReportTab[] = ['damage', 'timeline', 'log', 'rotation'];
const TOOL_TABS: readonly ReportTab[] = ['simulator', 'compare'];

const pct = (x: number | null) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);

export function ReportView({ tab }: { tab: ReportTab }) {
  const { state, actions, meta } = useTrainer();
  const shown = meta.reportFight;
  const fight = shown.status === 'ready' ? shown.fight : null;
  // Once per fight: the view-models and the bot's replay (a few ms on the main thread).
  const model = useMemo(() => (fight === null ? null : modelOf(fight)), [fight]);
  // The Simulator's run lives here, so it survives switching tabs within the Report.
  const sim = useSimulatorRun({
    config: state.config,
    db: state.itemDb.db,
    dbStatus: state.itemDb.status,
    gearName: meta.labels.gear,
    talentsName: meta.labels.talents,
    presetName: meta.labels.setupPreset,
    runner: meta.simRunner,
    onResult: actions.recordSimulation,
  });
  // The Compare tab's run: here too, so it survives switching tabs (the last result is the trainer's).
  const comparison = useCompareRun({ runner: meta.compareRunner, initial: meta.lastComparison, onResult: actions.recordComparison });
  const { reset } = actions;
  const ended = meta.phase === 'ended';
  const fightAgain = useCallback(() => {
    if (ended) reset();
    navigate({ mode: 'fight' });
  }, [ended, reset]);

  // The fight source and the Fights panel (History…).
  const { setReportSource, openHistoryFight, updateHistoryEntry, removeHistoryEntry, useSnapshotAsSetup, changeConfig, requestDb } = actions;
  const source = meta.reportSource;
  const history = meta.history;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const historyEntry = source.kind === 'history' ? (history.entries.find((e) => e.id === source.id) ?? null) : null;
  const options = useMemo(
    () => sourceOptions(source, meta.lastFight, meta.lastSimulation, historyEntry),
    [source, meta.lastFight, meta.lastSimulation, historyEntry],
  );
  const pickSource = useCallback(
    (id: SourceOption['id']) => {
      if (id === 'history') {
        setHistoryOpen((open) => !open);
        return;
      }
      setHistoryOpen(false);
      setReportSource(id === 'played' ? { kind: 'played' } : { kind: 'sim', which: id });
    },
    [setReportSource],
  );
  const openFight = useCallback(
    (id: string) => {
      openHistoryFight(id);
      setHistoryOpen(false);
    },
    [openHistoryFight],
  );
  const updateEntry = useCallback((id: string, patch: HistoryPatch) => updateHistoryEntry(id, patch), [updateHistoryEntry]);
  const setupKey = useMemo(() => setupKeyOf(state.config), [state.config]);
  // "Use This Setup": a history entry through its action, any other fight's snapshot the same way (changeConfig normalizes and saves).
  const useSetup = useCallback(() => {
    if (fight === null) return;
    if (source.kind === 'history') useSnapshotAsSetup(source.id);
    else changeConfig(fight.config);
  }, [fight, source, useSnapshotAsSetup, changeConfig]);
  // The rule fires of the last simulation, for its own key fights.
  const lastSim = meta.lastSimulation;
  const ruleFires = useMemo(() => {
    if (fight === null || lastSim === null || lastSim.result.ruleFires === undefined || !fight.key.startsWith(`sim:${lastSim.id}:`)) return null;
    return Object.fromEntries(Object.entries(lastSim.result.ruleFires).map(([k, v]) => [k, v.meanFires]));
  }, [fight, lastSim]);
  const lastFight = meta.lastFight;
  const you = useMemo(() => (lastFight === null ? null : { dps: lastFight.snapshot.dps, config: lastFight.config }), [lastFight]);

  const needsFight = FIGHT_TABS.includes(tab);
  return (
    <div className="view report">
      <h1 className="sr-only">Fight report</h1>
      {model !== null ? (
        <ReportHead model={model} onFightAgain={fightAgain} sourceText={historyEntry !== null ? `From the history: ${historyTitle(historyEntry)}` : null} />
      ) : needsFight || shown.status !== 'none' ? null : (
        <NoFightLine />
      )}
      <FightSourceSelect options={options} historyOpen={historyOpen} onPick={pickSource} />
      {history.saved === 'failed' && !historyOpen && (
        <p className="note rep-warn" role="alert">
          The fight history could not be saved (the browser storage is full or blocked): it is kept until the page reloads.
        </p>
      )}
      {historyOpen && (
        <FightsPanel
          history={history}
          currentDurationMs={model?.durationMs ?? state.config.fightDurationSec * 1000}
          currentSetupKey={setupKey}
          selectedId={source.kind === 'history' ? source.id : null}
          onOpen={openFight}
          onUpdate={updateEntry}
          onRemove={removeHistoryEntry}
        />
      )}
      {fight !== null && (
        <div className="su-toggle">
          <button type="button" className="btn quiet" aria-expanded={setupOpen} aria-controls="setup-used" onClick={() => setSetupOpen((o) => !o)}>
            {setupOpen ? 'Hide Setup Used' : 'Setup Used'}
          </button>
          {setupOpen && (
            <div id="setup-used">
              <Suspense fallback={<p className="note" aria-live="polite">Loading…</p>}>
                <SetupUsed
                  fight={fight}
                  db={state.itemDb.db}
                  dbStatus={state.itemDb.status}
                  requestDb={requestDb}
                  currentConfig={state.config}
                  ruleFires={ruleFires}
                  onUse={useSetup}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
      <ReportTabs tab={tab} />
      <section className="rep-panel" aria-label={REPORT_TAB_TITLES[tab]}>
        <Suspense fallback={<p className="note" aria-live="polite">Loading…</p>}>
          {needsFight && model === null ? <FightStatus shown={shown} /> : <TabPanel tab={tab} model={model} sim={sim} comparison={comparison} you={you} />}
        </Suspense>
      </section>
    </div>
  );
}

/** A fight tab without a fight to show: the empty state, or why the selected fight is not there (yet). */
function FightStatus({ shown }: { shown: ReportFightState }) {
  switch (shown.status) {
    case 'loading':
      return (
        <p className="note" aria-live="polite">
          {shown.reason}
        </p>
      );
    case 'unavailable':
      return (
        <div className="empty-state">
          <h2>Nothing to Show</h2>
          <p>{shown.reason}</p>
        </div>
      );
    case 'error':
      return (
        <div className="empty-state">
          <h2>This Fight Could Not Be Shown</h2>
          <p role="status">{shown.message}</p>
        </div>
      );
    default:
      return <EmptyReport />;
  }
}

interface TabPanelProps {
  tab: ReportTab;
  model: ReportModel | null;
  sim: SimulatorRun;
  comparison: CompareRunState;
  /** The last played fight (the Simulator's "You" marker), whatever fight the Report shows. */
  you: { dps: number; config: ReportFight['config'] } | null;
}

function TabPanel({ tab, model, sim, comparison, you }: TabPanelProps) {
  switch (tab) {
    case 'simulator':
      return <SimulatorTab sim={sim} you={you} />;
    case 'compare':
      return <ComparePanel run={comparison} />;
    case 'timeline':
      return <TimelineTab model={model!} />;
    case 'log':
      return <LogTab model={model!} />;
    case 'rotation':
      return <RotationTab model={model!} />;
    default:
      return <DamageTab model={model!} />;
  }
}

const ReportTabs = memo(function ReportTabs({ tab }: { tab: ReportTab }) {
  countRender('ReportTabs');
  const link = (t: ReportTab) => (
    <a key={t} href={routeHref({ mode: 'report', tab: t })} aria-current={t === tab ? 'page' : undefined}>
      {REPORT_TAB_TITLES[t]}
    </a>
  );
  return (
    <nav className="tabs" aria-label="Report sections">
      {FIGHT_TABS.map(link)}
      <span className="gap" aria-hidden="true" />
      {TOOL_TABS.map(link)}
    </nav>
  );
});

function EmptyReport() {
  return (
    <div className="empty-state">
      <h2>No Fight Yet</h2>
      <p>Play a fight to see its report.</p>
      <a className="btn primary" href={routeHref({ mode: 'fight' })}>
        Go to Fight
      </a>
    </div>
  );
}

function NoFightLine() {
  return (
    <p className="note rep-nofight">
      No fight yet: the Simulator and Compare work without one. <a href={routeHref({ mode: 'fight' })}>Play a fight</a> to see
      its report and to mark it on the histogram.
    </p>
  );
}

const PLAYED_WITH: readonly { key: keyof ChipLabels; section: SetupSection }[] = [
  { key: 'setupPreset', section: 'buffs' },
  { key: 'gear', section: 'gear' },
  { key: 'talents', section: 'talents' },
  { key: 'rotation', section: 'rotation' },
  { key: 'fight', section: 'fight' },
];

const KIND_TEXT: Readonly<Record<ReportFight['kind'], string>> = {
  played: 'Played fight',
  'sim-highest': 'Simulation, highest DPS',
  'sim-typical': 'Simulation, typical',
  'sim-lowest': 'Simulation, lowest DPS',
};

const ReportHead = memo(function ReportHead({ model, onFightAgain, sourceText }: { model: ReportModel; onFightAgain(): void; sourceText: string | null }) {
  countRender('ReportHead');
  const { last, bot, totals, durationMs, kpis } = model;
  const simCtx = last.sim;
  const share = botShareText(model);
  const [copied, setCopied] = useState<{ fightId: number; manual: boolean } | null>(null);
  const text = useMemo(() => reportText(model), [model]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ fightId: last.id, manual: false });
    } catch {
      // No clipboard (insecure origin) or permission refused: the text, selected, to copy by hand.
      setCopied({ fightId: last.id, manual: true });
    }
  };
  return (
    <section className="rep-head" role="region" aria-label="Fight summary">
      <div>
        <p className="hero-dps">
          <span aria-label="DPS" className="tnum">
            {formatDps(last.snapshot.dps)}
          </span>
          <small>DPS</small>
        </p>
        {share !== null && bot !== null && (
          <p className="vs-bot">
            {share} of the bot (<b className="tnum">{formatDps(bot.dps)}</b>) with the same setup
          </p>
        )}
        {simCtx !== null && (
          <p className="vs-bot">
            {simCtx.sigma === null ? 'At' : `${sigmaText(simCtx.sigma)} from`} the simulation’s mean (<b className="tnum">{formatDps(simCtx.meanDps)}</b>,{' '}
            {formatInt(simCtx.runs)} runs)
          </p>
        )}
        {(simCtx !== null || sourceText !== null) && (
          <p className="rep-source">
            {sourceText ?? KIND_TEXT[last.kind]}
            {simCtx !== null ? `; run #${simCtx.run + 1}, seed ${last.seed}` : ''}
          </p>
        )}
      </div>
      <div>
        <dl className="kpis">
          <div>
            <dt>Damage</dt>
            <dd aria-label="Total damage" className="tnum">
              {formatInt(totals.damage)}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd aria-label="Duration" className="tnum">
              {secondsText(durationMs)} s
            </dd>
          </div>
          {kpis.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd aria-label={k.label} className="tnum">
                {pct(k.value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="used">
          {last.kind === 'played' ? 'Played with' : 'Simulated with'}{' '}
          {PLAYED_WITH.map(({ key, section }, i) => (
            <span key={key}>
              <a href={routeHref({ mode: 'setup', section })} title={`${SETUP_SECTION_TITLES[section]} of this fight`}>
                {last.labels[key]}
              </a>
              {i < PLAYED_WITH.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
      </div>
      <div className="rep-actions">
        <button type="button" className="btn" onClick={onFightAgain}>
          Fight Again
        </button>
        <button
          type="button"
          className="btn quiet"
          onClick={() => {
            void copy();
          }}
        >
          Copy Report
        </button>
        {copied !== null && copied.fightId === last.id && (
          <p className="note" aria-live="polite">
            {copied.manual ? 'The report is selected below: press Ctrl+C (Cmd+C) to copy it.' : 'Copied.'}
          </p>
        )}
        {copied?.manual && copied.fightId === last.id && (
          <textarea
            className="rep-copy"
            aria-label="Report text"
            rows={6}
            readOnly
            value={text}
            ref={(el) => {
              el?.select();
            }}
          />
        )}
      </div>
    </section>
  );
});
