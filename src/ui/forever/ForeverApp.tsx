import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, MY_GEAR, normalizeSettings, paramsOf, type DuelOutcome, type EpOutcome, type RankingResult, type Settings, type SweepResult } from '../../forever/web/api';
import type { JobRequest } from '../../forever/web/api';
import type { JobRunner } from '../../forever/web/client';
import { customVariant, VARIANT_IDS } from '../../forever/builds';
import { loadGear, saveGear, totalsOf, wowheadFetcher, type MyGear } from '../../forever/web/gear';
import { customId, loadCustom, saveCustom, type CustomState } from '../../forever/web/custom';
import { CustomView } from './CustomView';
import { FOREVER_VIEWS, FOREVER_VIEW_TITLES, routeHref, type ForeverView } from '../shell/router';
import { AssumptionsPanel } from './AssumptionsPanel';
import { BuildsView } from './BuildsView';
import { CompareView } from './CompareView';
import { DiscoverView } from './DiscoverView';
import { EpView } from './EpView';
import { useDiscover, type DiscoverTuning, type PoolFactory } from './useDiscover';
import { RotationsView } from './RotationsView';
import { SettingsBar } from './SettingsBar';
import { SimView } from './SimView';
import { useForeverRun } from './useForeverRun';
import './forever.css';

const KEY = 'wow-forever-sim:settings:v1';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<Settings>) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The WoW Forever simulator: settings (character level), run, and the results/builds/rotations/compare views. */
export function ForeverApp({ view, runner, discoverPool, discoverTuning, itemFetcher = wowheadFetcher }: { view: ForeverView; runner?: JobRunner; discoverPool?: PoolFactory; discoverTuning?: DiscoverTuning; itemFetcher?: (id: number) => Promise<unknown> }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [buildId, setBuildId] = useState(VARIANT_IDS[0] as string);
  // the Rotations tab keeps its own choice; the button in the Builds tab sets it
  const [rotationId, setRotationId] = useState(VARIANT_IDS[0] as string);
  const [curveIds, setCurveIds] = useState<readonly string[]>([]);
  const curveSet = useMemo(() => new Set(curveIds), [curveIds]);
  const run = useForeverRun(runner);
  const discovery = useDiscover(discoverPool, discoverTuning);
  const [custom, setCustom] = useState<CustomState>(() => loadCustom(storage()));
  useEffect(() => saveCustom(storage(), custom), [custom]);
  const [gear, setGear] = useState<MyGear | null>(() => loadGear(storage()));
  useEffect(() => saveGear(storage(), gear), [gear]);
  useEffect(() => {
    if (gear === null) setSettings((st) => (st.profile === MY_GEAR ? { ...st, profile: 'average' } : st));
  }, [gear]);
  const gearTotals = useMemo(() => (gear ? totalsOf(gear) : undefined), [gear]);
  // Builds the views can show by id (the registry makes `loadVariant` know them); an illegal build is left out.
  const customData = useMemo(
    () =>
      custom.builds.filter((b) => {
        try {
          customVariant(b);
          return true;
        } catch {
          return false;
        }
      }),
    [custom.builds],
  );
  const allIds = useMemo(() => [...VARIANT_IDS, ...customData.map((b) => customId(b.name))], [customData]);
  const includedData = customData.filter((b) => custom.included.includes(b.name));
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* private mode: settings just are not remembered */
    }
  }, [settings]);

  // "mój sprzęt" without items (removed) falls back to the average profile
  const normalized = normalizeSettings(settings);
  const s = normalized.profile === MY_GEAR && !gear ? { ...normalized, profile: 'average' } : normalized;
  const go = useCallback((req: JobRequest) => run.run(s.profile === MY_GEAR && gearTotals ? { ...req, gear: gearTotals } : req), [run, s.profile, gearTotals]);
  const simParams = useMemo(() => paramsOf(normalizeSettings(settings), gearTotals), [settings, gearTotals]);
  const runRanking = useCallback(() => go({ kind: 'ranking', settings: s, custom: includedData }), [go, s, includedData]);
  const ranking = run.results.ranking as RankingResult | undefined;
  const sweep = run.results.sweep as SweepResult | undefined;
  const duel = run.results.duel as DuelOutcome | undefined;
  const ep = run.results.ep as EpOutcome | undefined;

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
      <SettingsBar settings={s} hasGear={gear !== null} onChange={setSettings} run={run} onRun={view === 'compare' || view === 'custom' || view === 'ep' || view === 'discover' ? () => undefined : runRanking} runLabel={view === 'compare' ? 'Uruchom (użyj Porównaj)' : view === 'custom' ? 'Uruchom (użyj Sprawdź)' : view === 'ep' ? 'Uruchom (użyj Policz EP)' : view === 'discover' ? 'Uruchom (użyj Szukaj)' : 'Uruchom symulację'} />
      {view === 'sim' && customData.length > 0 && (
        <details className="fv-panel fv-own">
          <summary>
            Własne buildy w rankingu ({includedData.length} z {customData.length})
          </summary>
          {customData.map((b) => (
            <label key={b.name} className="fv-inline">
              <input
                type="checkbox"
                checked={custom.included.includes(b.name)}
                onChange={(e) => setCustom({ ...custom, included: e.target.checked ? [...custom.included, b.name] : custom.included.filter((n) => n !== b.name) })}
              />{' '}
              {b.name} ({b.picks.length}/51)
            </label>
          ))}
        </details>
      )}
      {view === 'sim' && <SimView run={run} ranking={ranking} sweep={sweep} selected={curveSet} onSelect={setCurveIds} onSweep={(builds) => go({ kind: 'sweep', settings: s, builds: [...builds], custom: includedData })} onOpenBuild={setBuildId} />}
      {view === 'builds' && <BuildsView level={s.level} mobs={s.mobs} ids={allIds} id={buildId} onIdChange={setBuildId} onOpenRotation={setRotationId} />}
      {view === 'rotations' && <RotationsView ids={allIds} params={simParams} id={rotationId} onIdChange={setRotationId} />}
      {view === 'compare' && <CompareView settings={s} run={run} duel={duel} ids={allIds} onRun={(a, b, sw) => go({ kind: 'duel', settings: s, a, b, sweep: sw, custom: customData.filter((c) => [a, b].includes(customId(c.name))) })} />}
      {view === 'discover' && s.profile === MY_GEAR && <p className="fv-note">Szukaj nie używa mojego sprzętu (liczy na profilu „przeciętny”): wyszukiwanie działa w osobnych workerach bez Twoich itemów.</p>}
      {view === 'discover' && (
        <DiscoverView settings={s.profile === MY_GEAR ? { ...s, profile: 'average' } : s} discovery={discovery} existingNames={custom.builds.map((b) => b.name)} onSave={(b) => setCustom({ ...custom, builds: [...custom.builds, b], active: b.name })} />
      )}
      {view === 'ep' && <EpView settings={s} run={run} outcome={ep} ids={allIds} initial={buildId} onRun={(builds) => go({ kind: 'ep', settings: s, builds, custom: customData.filter((c) => builds.includes(customId(c.name))) })} />}
      {view === 'custom' && (
        <CustomView
          state={custom}
          onChange={setCustom}
          settings={s}
          run={run}
          gear={gear}
          onGear={setGear}
          itemFetcher={itemFetcher}
          ranking={ranking}
          onRun={() => {
            const active = customData.find((b) => b.name === custom.active);
            const list = [...includedData, ...(active && !includedData.includes(active) ? [active] : [])];
            go({ kind: 'ranking', settings: s, custom: list });
          }}
        />
      )}
      {view === 'assumptions' && <AssumptionsPanel />}
    </div>
  );
}
