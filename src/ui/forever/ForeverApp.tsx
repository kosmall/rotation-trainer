import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, normalizeSettings, type DuelOutcome, type RankingResult, type Settings, type SweepResult } from '../../forever/web/api';
import type { JobRunner } from '../../forever/web/client';
import { VARIANT_IDS } from '../../forever/builds';
import { FOREVER_VIEWS, FOREVER_VIEW_TITLES, routeHref, type ForeverView } from '../shell/router';
import { AssumptionsPanel } from './AssumptionsPanel';
import { BuildsView } from './BuildsView';
import { CompareView } from './CompareView';
import { RotationsView } from './RotationsView';
import { SettingsBar } from './SettingsBar';
import { SimView } from './SimView';
import { useForeverRun } from './useForeverRun';
import './forever.css';

const KEY = 'wow-forever-sim:settings:v1';

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<Settings>) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The WoW Forever simulator: settings (character level), run, and the results/builds/rotations/compare views. */
export function ForeverApp({ view, runner }: { view: ForeverView; runner?: JobRunner }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [buildId, setBuildId] = useState(VARIANT_IDS[0] as string);
  const run = useForeverRun(runner);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* private mode: settings just are not remembered */
    }
  }, [settings]);

  const s = normalizeSettings(settings);
  const runRanking = useCallback(() => run.run({ kind: 'ranking', settings: s }), [run, s]);
  const ranking = run.results.ranking as RankingResult | undefined;
  const sweep = run.results.sweep as SweepResult | undefined;
  const duel = run.results.duel as DuelOutcome | undefined;

  return (
    <div className="forever-app">
      <h1>WoW Forever: symulator levelowania warlocka</h1>
      <nav className="fv-tabs" aria-label="Widoki symulatora">
        {FOREVER_VIEWS.map((v) => (
          <a key={v} href={routeHref({ mode: 'forever', view: v })} aria-current={v === view ? 'page' : undefined}>
            {FOREVER_VIEW_TITLES[v]}
          </a>
        ))}
      </nav>
      <SettingsBar settings={s} onChange={setSettings} run={run} onRun={view === 'compare' ? () => undefined : runRanking} runLabel={view === 'compare' ? 'Uruchom (użyj Porównaj)' : 'Uruchom symulację'} />
      {view === 'sim' && <SimView run={run} ranking={ranking} sweep={sweep} onSweep={() => run.run({ kind: 'sweep', settings: s, builds: VARIANT_IDS })} onOpenBuild={setBuildId} />}
      {view === 'builds' && <BuildsView level={s.level} id={buildId} onIdChange={setBuildId} />}
      {view === 'rotations' && <RotationsView />}
      {view === 'compare' && <CompareView settings={s} run={run} duel={duel} onRun={(a, b, sw) => run.run({ kind: 'duel', settings: s, a, b, sweep: sw })} />}
      {view === 'assumptions' && <AssumptionsPanel />}
    </div>
  );
}
