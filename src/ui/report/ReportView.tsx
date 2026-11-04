// The Report screen (UI redesign Task 4, spec §3.5, §5.3, §6): the last ended fight's summary
// (hero DPS, the share of the bot's DPS with the same setup and seed, KPIs, what it was played
// with, Fight Again, Copy Report), the tabs as links (`#/report/<tab>`, `aria-current`) and the
// current tab's panel, loaded lazily. Without a fight the fight tabs show the empty state;
// Simulator and Compare work without one. Reads only `useTrainer()` (never the per-frame
// snapshot); the ended fight comes from `meta.lastFight` and is not stored across reloads.

import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import { formatDps, formatInt, secondsText } from '../format';
import { navigate, routeHref, SETUP_SECTION_TITLES } from '../shell/router';
import type { ReportTab, SetupSection } from '../shell/router';
import { useSimulatorRun } from '../SimulatorPanel';
import type { SimulatorRun } from '../SimulatorPanel';
import { useTrainer } from '../state/TrainerProvider';
import type { ChipLabels } from '../state/TrainerProvider';
import { botShareText, reportModel, reportText } from './reportModel';
import type { ReportModel } from './reportModel';
import './report.css';
import { countRender } from '../renderCount';

const DamageTab = lazy(() => import('./DamageTab').then((m) => ({ default: m.DamageTab })));
const TimelineTab = lazy(() => import('./TimelineTab').then((m) => ({ default: m.TimelineTab })));
const LogTab = lazy(() => import('./LogTab').then((m) => ({ default: m.LogTab })));
const RotationTab = lazy(() => import('./RotationTab').then((m) => ({ default: m.RotationTab })));
const SimulatorTab = lazy(() => import('./SimulatorTab').then((m) => ({ default: m.SimulatorTab })));
const CompareTab = lazy(() => import('./CompareTab').then((m) => ({ default: m.CompareTab })));

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
  const last = meta.lastFight;
  // Once per ended fight: the view-models and the bot's replay (a few ms on the main thread).
  const model = useMemo(() => (last === null ? null : reportModel(last)), [last]);
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
  const { reset } = actions;
  const ended = meta.phase === 'ended';
  const fightAgain = useCallback(() => {
    if (ended) reset();
    navigate({ mode: 'fight' });
  }, [ended, reset]);

  const needsFight = FIGHT_TABS.includes(tab);
  return (
    <div className="view report">
      <h1 className="sr-only">Fight report</h1>
      {model !== null ? <ReportHead model={model} onFightAgain={fightAgain} /> : needsFight ? null : <NoFightLine />}
      <ReportTabs tab={tab} />
      <section className="rep-panel" aria-label={REPORT_TAB_TITLES[tab]}>
        <Suspense fallback={<p className="note" aria-live="polite">Loading…</p>}>
          {needsFight && model === null ? <EmptyReport /> : <TabPanel tab={tab} model={model} sim={sim} />}
        </Suspense>
      </section>
    </div>
  );
}

function TabPanel({ tab, model, sim }: { tab: ReportTab; model: ReportModel | null; sim: SimulatorRun }) {
  switch (tab) {
    case 'simulator':
      return <SimulatorTab sim={sim} you={model === null ? null : { dps: model.last.snapshot.dps, config: model.last.config }} />;
    case 'compare':
      return <CompareTab />;
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

const ReportHead = memo(function ReportHead({ model, onFightAgain }: { model: ReportModel; onFightAgain(): void }) {
  countRender('ReportHead');
  const { last, bot, totals, durationMs, kpis } = model;
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
          Played with{' '}
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
