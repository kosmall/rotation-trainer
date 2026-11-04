import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AUTHOR_GEAR_TABLES, buildDestructionWarlock, rotationTalentsFor } from '../../data/classes/warlock/destruction';
import type { GearTables, WarlockOptions } from '../../data/classes/warlock/destruction';
import { rotationWarnings } from '../../data/classes/warlock/rotation';
import { loadItemDb } from '../../data/items/db';
import type { ItemDb } from '../../data/items/types';
import type { BuffDef, SpecData } from '../../data/types';
import type { CastResult, EquippedItem, LogEvent, SimSnapshot } from '../../engine/types';
import { applySetup } from '../../setup/applySetup';
import { normalizeSetup, SETUP_CATALOG, setupCatalogFor, STATIC_SETUP_CATALOG } from '../../setup/defaults';
import { gearNeedsDb, setupGear } from '../../setup/gear';
import { EMBEDDED_GEAR_EFFECT_SOURCE, isGearEffectId, unmodelledGearEffects } from '../../setup/gearEffects';
import { setupTalents } from '../../setup/presets';
import { browserStorage, loadSetup, saveSetup } from '../../setup/storage';
import type { SetupStorage } from '../../setup/storage';
import type { AppliedSetup, SetupConfig } from '../../setup/types';
import type { ScenarioEntry } from '../../scenarios/library';
import type { SimRunner } from '../../sim-runner/client';
import type { CompareResult, SimRequest, SimResult } from '../../sim-runner/types';
import { fightFromInput, fightFromLast, replaySimFight, SIM_KIND } from '../report/reportFight';
import type { KeyFightWhich, ReportFight } from '../report/reportFight';
import { REJECT_LABELS } from '../fight/slotFlash';
import type { SlotFlash } from '../fight/slotFlash';
import { auraSources, buildBuffViews } from '../buffsView';
import type { BuffViews } from '../buffsView';
import type { GearDbStatus } from '../GearPanel';
import { itemEffectHints } from '../gearView';
import { buildHudContext } from '../hudEvents';
import type { HudContext } from '../hudEvents';
import { loadHudSettings, normalizeHudSettings, saveHudSettings } from '../hudSettings';
import type { HudSettings, HudStorage } from '../hudSettings';
import { useSimulation } from '../useSimulation';
import type { UiStorage } from '../theme/theme';
import { loadHistory, recordPlayed, recordSimulation as recordSimulationInHistory, removeHistoryEntry, saveHistory, updateHistoryEntry } from './history';
import type { HistoryEntry, HistoryPatch } from './history';
import {
  fightSettingsName,
  gearName,
  NO_PENDING,
  pendingSections,
  rotationName,
  setupPresetName,
  talentsName,
} from './selectors';
import type { ChipSection } from './selectors';

const SIMULATION_OPTIONS = { pauseOnLeave: true } as const;

const PLAYED_SOURCE: ReportSourceId = Object.freeze({ kind: 'played' });
const NO_REPORT_FIGHT: ReportFightState = Object.freeze({ status: 'none' });

/** How long a rejected press shows its reason on the slot. */
const FLASH_MS = 700;

/** The item row's tooltips: each item action's catalog description, by action id. */
function itemDescriptions(catalog: readonly BuffDef[]): Readonly<Record<string, string>> {
  return Object.fromEntries(catalog.flatMap((b) => (b.effect.action ? [[b.effect.action.id, b.description]] : [])));
}

/** The item actions whose icon is an item icon (the gear's on-use effects; potions use spell icons). */
function itemIconActions(catalog: readonly BuffDef[]): ReadonlySet<string> {
  return new Set(catalog.flatMap((b) => (b.iconKind === 'item' && b.effect.action ? [b.effect.action.id] : [])));
}

/** The next fight's setup: the config it comes from plus `applySetup`'s spec and fight settings. */
export interface NextFight extends AppliedSetup {
  /**
   * The config the fight is built from: the setup's, except that a gear the embedded author tables
   * cannot build (`gearNeedsDb`) is left out (the author's gear) until the item database has loaded.
   */
  config: SetupConfig;
  /**
   * The fight's catalog: the gear-independent entries and the item effects of the fight's gear
   * (`setupCatalogFor`, from the database, or from the embedded author records before it loads).
   * The Setup panel lists it; the item row, the buffs panel and preset matching read it.
   */
  catalog: readonly BuffDef[];
}

/** Reloads the page (never throws: a sandboxed frame may refuse it). */
function reloadPage(): void {
  try {
    window.location.reload();
  } catch {
    // Nothing else to do: the error message says to reload.
  }
}

/** The rotation steps the setup's build cannot play (never throws: none when the config cannot be read). */
function talentRotationWarnings(config: SetupConfig): string[] {
  try {
    return rotationWarnings(config.rotation, rotationTalentsFor(config.talents));
  } catch {
    return [];
  }
}

/**
 * A config applied as the game applies it (the next fight, a history fight): `applySetup` with the
 * static catalog and the spec built by `buildSpec` (with the database only for a gear and once it
 * has loaded), the catalog of the config's gear. Pass a config the database is not needed for, or
 * the database (the caller checks `gearNeedsDb`).
 */
export function fightOfConfig(
  config: SetupConfig,
  db: ItemDb | null,
  buildSpec: NonNullable<TrainerProviderProps['buildSpec']> = buildDestructionWarlock,
): NextFight {
  // The talents are forwarded: the game plays the build the priority (applySetup) is built for.
  const build = (warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string) =>
    gear === undefined || db === null ? buildSpec(warlock, gear, undefined, talents) : buildSpec(warlock, gear, db, talents);
  return {
    config,
    // "Items and cooldowns" follows the worn gear: its effects, derived (never a fixed list).
    catalog: setupCatalogFor(setupGear(config), db),
    ...applySetup({ buildSpec: build, catalog: STATIC_SETUP_CATALOG, config, db }),
  };
}

/** The config without its gear (the author's gear). */
function withoutGear(config: SetupConfig): SetupConfig {
  const { gear: _gear, gearPresetId: _id, ...rest } = config;
  return rest;
}

/** The spec's display identity for the header (class-agnostic: everything comes from `SpecData`). */
export interface SpecIdentity {
  /** The spec's own name without the class ("Destruction"). */
  specName: string;
  /** The class ("Warlock"). */
  className: string;
  /** The class token for `<html data-class>` ("warlock"). */
  classId: string;
  /** A spell icon name, or null when the spec has none. */
  icon: string | null;
}

export function specIdentity(spec: Pick<SpecData, 'name' | 'className' | 'icon'>): SpecIdentity {
  const words = spec.name.trim().split(/\s+/);
  const className = spec.className ?? words[words.length - 1] ?? spec.name;
  const specName = spec.name.endsWith(className) ? spec.name.slice(0, -className.length).trim() || spec.name : spec.name;
  return {
    specName,
    className,
    classId: className.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    icon: spec.icon ?? null,
  };
}

export interface TrainerProviderProps {
  /**
   * Builds the spec for the warlock options, gear and talents (default: the Destruction Warlock).
   * `db` is the item database once it has loaded, passed for a config that has a gear; `talents`
   * the setup's build (`SetupConfig.talents`; undefined: the author's).
   */
  buildSpec?: (warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[], db?: GearTables, talents?: string) => SpecData;
  /**
   * Loads the item database (default `loadItemDb`, a lazy chunk). Asked for when the Gear panel is
   * first opened or when the stored gear needs it; tests inject a resolved database here.
   */
  loadDb?: () => Promise<ItemDb>;
  /**
   * Reloads the page (default `window.location.reload()`): the only way back after the database
   * failed to load (a browser keeps a failed `import()`; after a redeploy the old chunk is gone).
   */
  onReload?: () => void;
  /**
   * Where the setup is loaded from and saved to (read once, at mount); default the browser's
   * localStorage. `null`: kept in memory only. A storage that throws behaves like `null`
   * (storage.ts never throws). The UI preferences (`rotation-trainer:ui:v1`) use it too.
   */
  storage?: SetupStorage | null;
  /**
   * Where the combat text settings are loaded from (once, at mount) and saved to, under their own
   * key. Default: `storage` when it is given (`null` included), else the browser's localStorage.
   */
  hudStorage?: HudStorage | null;
  /**
   * Runs the Simulator panel's simulations (default `runSimulation`: a module worker, or the main
   * thread in chunks where none can start). Tests inject their own.
   */
  simRunner?: SimRunner;
  /**
   * Runs the Compare tab's paired comparisons (default: `runComparison`, a module worker or the
   * main thread, loaded on the first run). Tests inject their own.
   */
  compareRunner?: CompareRunner;
}

/** Runs a paired comparison of 2-5 requests (`runComparison`'s shape, src/sim-runner/client.ts). */
export type CompareRunner = (
  requests: SimRequest[],
  options?: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal },
) => Promise<CompareResult>;

/**
 * The scenario library (src/scenarios/library.ts), loaded once from the setup's storage under its
 * own key (`rotation-trainer:scenarios:v1`). `saved`: whether the last change reached the storage
 * ('memory': no storage was given, so nothing is meant to be saved; 'failed': the storage refused
 * it, full or blocked, and the library lives until the page reloads).
 */
export interface ScenarioLibrary {
  entries: readonly ScenarioEntry[];
  saved: 'yes' | 'memory' | 'failed';
  /**
   * The library has been read. Its reader (src/scenarios/storage.ts and the scenario format) is a
   * chunk loaded right after mount, so it stays out of the first load; until then `entries` is
   * empty and the panels wait.
   */
  loaded: boolean;
}

type ScenarioStore = typeof import('../../scenarios/storage');

/** What the trainer holds: the setup and everything derived from it (changes on edits only). */
export interface TrainerState {
  config: SetupConfig;
  hudSettings: HudSettings;
  itemDb: { status: GearDbStatus; db: ItemDb | null };
  nextFight: NextFight;
  /** The setup's talent string (`setupTalents`). */
  talents: string;
  talentWarnings: string[];
  gearHints: string[];
  unmodelledItemEffects: ReturnType<typeof unmodelledGearEffects>;
  /** The Items group's note while a stored gear waits for the database. */
  itemsNote: string | undefined;
  /** The saved scenarios (Setup → Scenarios, Report → Compare). */
  scenarios: ScenarioLibrary;
}

export interface TrainerActions {
  /** Normalizes, saves and applies an edited setup. */
  changeConfig(edited: SetupConfig): void;
  changeGear(gear: (EquippedItem | null)[], presetId?: string): void;
  changeTalents(talents: string): void;
  changeHudSettings(edited: HudSettings): void;
  /** Loads the item database once (the Gear panel asks when first opened). */
  requestDb(): void;
  reload(): void;
  start(): void;
  cast(spellId: string): CastResult;
  cancel(): void;
  /** Resets the fight (R): the next fight with the current setup. */
  reset(): void;
  /** Presses an action bar slot (0-based): casts its spell or flashes the reason it cannot. */
  pressSlot(slot: number): void;
  /**
   * A fight view is on screen: call on mount, call the returned function on unmount. Leaving the
   * last one pauses a running fight (spec §3.3, Q1; `useSimulation`'s `pauseOnLeave`).
   */
  attachFightView(): () => void;
  /**
   * Keeps a finished simulation as the last one (`meta.lastSimulation`, the Setup summary's
   * "Simulate this setup" card); `config` is the setup it ran. Not saved across reloads.
   */
  recordSimulation(result: SimResult, config: SetupConfig): void;
  /** Replaces the scenario library and saves it; false when the storage refused it (kept in memory). */
  changeScenarios(entries: readonly ScenarioEntry[]): boolean;
  /** Keeps a finished comparison as the last one (`meta.lastComparison`); not saved across reloads. */
  recordComparison(comparison: LastComparison): void;
  /** Picks the fight the Report shows (`meta.reportSource`, `meta.reportFight`). */
  setReportSource(source: ReportSourceId): void;
  /** Shows a history entry's fight in the Report (the source `{ kind: 'history', id }`). */
  openHistoryFight(id: string): void;
  /**
   * "Use this setup": the history entry's setup snapshot becomes the current setup (normalized and
   * saved like any edit, `changeConfig`). False for an unknown id.
   */
  useSnapshotAsSetup(id: string): boolean;
  /** Names, notes or pins a history entry (and saves the history). */
  updateHistoryEntry(id: string, patch: HistoryPatch): void;
  /** Removes a history entry (and saves the history). */
  removeHistoryEntry(id: string): void;
}

/**
 * The fight history (`rotation-trainer:history:v1`, src/ui/state/history.ts): loaded once at mount,
 * newest first; every ended fight and every simulation's key fights are added. `saved`: whether the
 * last change reached the storage ('memory': no storage was given; 'failed': the storage refused
 * it, full or blocked: shown to the user, the history lives until the page reloads).
 */
export interface FightHistory {
  entries: readonly HistoryEntry[];
  saved: 'yes' | 'memory' | 'failed';
}

/**
 * Which fight the Report shows (spec §2 A, E): the last played fight, one of the last simulation's
 * key fights (`SimResult.keyFights`: highest DPS, typical, lowest DPS), or a history entry. A
 * fight that ends switches back to the played fight.
 */
export type ReportSourceId = { kind: 'played' } | { kind: 'sim'; which: KeyFightWhich } | { kind: 'history'; id: string };

/**
 * The selected source's fight (`meta.reportFight`): 'ready' with the fight; 'none' before any
 * fight has ended (the played source); 'unavailable' when there is nothing to replay (no
 * simulation, or a result without key fights) with a reason to show; 'loading' while the item
 * database a replay needs loads; 'error' when a replay failed (its message).
 */
export type ReportFightState =
  | { status: 'ready'; fight: ReportFight }
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }
  | { status: 'loading'; reason: string }
  | { status: 'error'; message: string };

/** The last finished comparison: its result and the names of its rows, in request order. */
export interface LastComparison {
  result: CompareResult;
  names: string[];
  /** The configs it ran, in request order (taken at the click). */
  configs: SetupConfig[];
}

/**
 * The last finished simulation and the setup it ran (in memory only, as the Simulator's result):
 * its result (with `keyFights`, the runs the Report replays) and the setup snapshot, the normalized
 * config at the simulation's start; the result carries the runs, seed and spell queue window.
 */
export interface LastSimulation {
  /** Counts the simulations recorded on this page (the key fights' source keys). */
  id: number;
  result: SimResult;
  config: SetupConfig;
}

export interface ChipLabels {
  setupPreset: string;
  gear: string;
  talents: string;
  rotation: string;
  fight: string;
}

/**
 * The last fight that ended (the Report's data): kept after R until the next fight ends; never
 * stored across reloads. `log` is the whole fight log, `snapshot` the final one, `seed` the fight's
 * seed and `fight` its setup (spec, fight settings, config, catalog), so the bot can replay the
 * same fight (src/ui/report/botRun.ts).
 */
export interface LastFight {
  id: number;
  log: readonly LogEvent[];
  snapshot: SimSnapshot;
  config: SetupConfig;
  /** The ended fight's own names (Setup, Gear, Talents, Rotation, Fight). */
  labels: ChipLabels;
  seed: number;
  fight: NextFight;
}

export interface TrainerMeta {
  /** The fight's phase (changes three times per fight, never per frame). */
  phase: SimSnapshot['phase'];
  /** A running fight is paused because the Fight screen was left (Space or a spell resumes it). */
  paused: boolean;
  /** The next fight's names, for the header chips and the Simulator. */
  labels: ChipLabels;
  /** The running (or ended) fight's own names (the fight stats and its summary). */
  fightLabels: Pick<ChipLabels, 'setupPreset' | 'gear' | 'talents'>;
  /** Per chip: the next fight's setup differs from the running (or ended) fight's in that section. */
  pending: Readonly<Record<ChipSection, boolean>>;
  /** Any difference at all (the legacy panels' pending note). */
  anyPending: boolean;
  /** The talents differ (the Talents panel's pending note). */
  talentsPending: boolean;
  spec: SpecIdentity;
  /** Where UI-only preferences are saved (the setup's storage; null: memory only). */
  uiStorage: UiStorage | null;
  simRunner: SimRunner | undefined;
  compareRunner: CompareRunner | undefined;
  /** The last ended fight, or null before any fight has ended (the Report). */
  lastFight: LastFight | null;
  /** The last finished simulation, or null (`actions.recordSimulation`). */
  lastSimulation: LastSimulation | null;
  /** The last finished comparison, or null (`actions.recordComparison`). */
  lastComparison: LastComparison | null;
  /** The Report's fight source (`actions.setReportSource`). */
  reportSource: ReportSourceId;
  /** The source's fight, replayed on demand and memoized per source. */
  reportFight: ReportFightState;
  /** The fight history (played fights and simulations' key fights). */
  history: FightHistory;
}

export interface TrainerValue {
  state: TrainerState;
  actions: TrainerActions;
  meta: TrainerMeta;
}

/** Per-frame data of the running fight: consumed by the Fight components only. */
export interface FightFrame {
  snapshot: SimSnapshot;
  /** The running (or ended) fight's setup. */
  fight: NextFight;
  fightId: number;
  logSince(index: number): readonly LogEvent[];
  flash: SlotFlash | null;
  buffViews: BuffViews;
  hudContext: HudContext;
  itemDescriptions: Readonly<Record<string, string>>;
  itemIcons: ReadonlySet<string>;
}

const TrainerContext = createContext<TrainerValue | null>(null);
const FightFrameContext = createContext<FightFrame | null>(null);

/** The trainer's setup, actions and labels (re-renders on edits and phase changes, never per frame). */
export function useTrainer(): TrainerValue {
  const value = useContext(TrainerContext);
  if (value === null) throw new Error('useTrainer outside <TrainerProvider>');
  return value;
}

/** The running fight's per-frame data (re-renders every animation frame of a running fight). */
export function useFightFrame(): FightFrame {
  const value = useContext(FightFrameContext);
  if (value === null) throw new Error('useFightFrame outside <TrainerProvider>');
  return value;
}

/**
 * Owns the trainer: the setup (`SetupConfig`: loaded once at mount, every edit normalized, saved
 * and turned into the next fight with `applySetup`), the combat text settings, the item database,
 * and the fight (`useSimulation`: a fight that has not started takes a new setup at once, a
 * running or ended one keeps its own until R). Routing is not its concern (the shell owns it).
 * Two contexts: `TrainerContext` (changes on edits) and `FightFrameContext` (changes per frame).
 */
export function TrainerProvider({
  buildSpec = buildDestructionWarlock,
  storage,
  hudStorage,
  loadDb = loadItemDb,
  onReload = reloadPage,
  simRunner,
  compareRunner,
  children,
}: TrainerProviderProps & { children?: ReactNode }) {
  const [store] = useState<SetupStorage | null>(() => (storage === undefined ? browserStorage() : storage));
  const [hudStore] = useState<HudStorage | null>(() => (hudStorage !== undefined ? hudStorage : store));
  // Combat text preferences: loaded once, every edit normalized and saved (the HUD's own key).
  const [hudSettings, setHudSettings] = useState<HudSettings>(() => loadHudSettings(hudStore));
  const changeHudSettings = useCallback(
    (edited: HudSettings) => {
      const next = normalizeHudSettings(edited);
      setHudSettings(next);
      saveHudSettings(hudStore, next); // false (full, private mode): kept in memory only
    },
    [hudStore],
  );
  const [config, setConfig] = useState<SetupConfig>(() => loadSetup(store, SETUP_CATALOG));
  // The scenario library: read once, right after mount, from its own lazily loaded chunk (never
  // trusted: storage.ts reads every entry again).
  const [scenarios, setScenarios] = useState<ScenarioLibrary>(() => ({ entries: [], saved: store === null ? 'memory' : 'yes', loaded: false }));
  const scenarioStore = useRef<ScenarioStore | null>(null);
  useEffect(() => {
    let live = true;
    import('../../scenarios/storage').then(
      (m) => {
        if (!live) return;
        scenarioStore.current = m;
        setScenarios((s) => (s.loaded ? s : { ...s, entries: m.loadScenarios(store), loaded: true }));
      },
      () => {
        if (live) setScenarios((s) => ({ ...s, loaded: true, saved: store === null ? 'memory' : 'failed' }));
      },
    );
    return () => {
      live = false;
    };
  }, [store]);
  const changeScenarios = useCallback(
    (entries: readonly ScenarioEntry[]) => {
      const ok = store !== null && scenarioStore.current !== null && scenarioStore.current.saveScenarios(store, entries);
      setScenarios({ entries, saved: store === null ? 'memory' : ok ? 'yes' : 'failed', loaded: true });
      return ok || store === null;
    },
    [store],
  );
  const [itemDb, setItemDb] = useState<{ status: GearDbStatus; db: ItemDb | null }>({ status: 'idle', db: null });
  const dbRef = useRef<ItemDb | null>(null);
  const dbStatusRef = useRef<GearDbStatus>('idle');

  /**
   * Loads the item database once, then checks the setup's gear against it. A failure is final for
   * this page: a browser keeps a failed `import()` in its module map (and after a redeploy the old
   * chunk is gone), so the panel offers a page reload instead of a retry; the setup is saved.
   */
  const requestDb = useCallback(() => {
    if (dbStatusRef.current !== 'idle') return;
    dbStatusRef.current = 'loading';
    setItemDb({ status: 'loading', db: null });
    let pending: Promise<ItemDb>;
    try {
      pending = loadDb();
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (db) => {
        dbStatusRef.current = 'ready';
        dbRef.current = db;
        setItemDb({ status: 'ready', db });
        // The stored gear was checked for its shape only: now its ids (unknown or misfit entries dropped).
        // Not saved: loading never writes; the next edit saves the checked config.
        setConfig((c) => {
          const checked = normalizeSetup(c, SETUP_CATALOG, db);
          return JSON.stringify(checked) === JSON.stringify(c) ? c : checked;
        });
      },
      () => {
        dbStatusRef.current = 'error';
        setItemDb({ status: 'error', db: null });
      },
    );
  }, [loadDb]);

  // A stored gear the embedded author tables cannot build: load the database at once.
  const storedNeedsDb = config.gear !== undefined && gearNeedsDb(config.gear);
  useEffect(() => {
    if (storedNeedsDb) requestDb();
  }, [storedNeedsDb, requestDb]);

  const changeConfig = useCallback(
    (edited: SetupConfig) => {
      const next = normalizeSetup(edited, SETUP_CATALOG, dbRef.current ?? undefined);
      setConfig(next);
      saveSetup(store, next, SETUP_CATALOG); // false (full, private mode): kept in memory only
    },
    [store],
  );
  const changeGear = useCallback(
    (gear: (EquippedItem | null)[], presetId?: string) => {
      const { gearPresetId: _old, ...rest } = config;
      changeConfig(presetId === undefined ? { ...rest, gear } : { ...rest, gear, gearPresetId: presetId });
    },
    [changeConfig, config],
  );
  const changeTalents = useCallback(
    (talents: string) => {
      // The panel's string is already validated; normalizeSetup stores it (none for the author's build).
      changeConfig({ ...config, talents });
    },
    [changeConfig, config],
  );
  const db = itemDb.db;
  const nextFight = useMemo<NextFight>(() => {
    // Never build a gear the author tables do not know without the database: buildSetup would skip
    // the unknown ids silently (a wrong DPS). Until it loads, the author's gear.
    const fightConfig = config.gear !== undefined && db === null && gearNeedsDb(config.gear) ? withoutGear(config) : config;
    return fightOfConfig(fightConfig, db, buildSpec);
  }, [buildSpec, config, db]);
  // Leaving the Fight screen pauses the fight (spec §3.3, author's answer to Q1).
  const { snapshot, fight, cast, cancel, reset, start, logSince, fightId, seed, paused, attach } = useSimulation(nextFight, SIMULATION_OPTIONS);
  const phase = snapshot.phase;
  // The last ended fight (the Report): taken once when a fight ends, kept after R (state set during
  // render, React's "information from previous renders" pattern: no effect, no extra commit).
  const [lastFight, setLastFight] = useState<LastFight | null>(null);
  const [reportSource, setReportSource] = useState<ReportSourceId>(PLAYED_SOURCE);
  if (phase === 'ended' && lastFight?.id !== fightId) {
    // A fight that ends is what the Report shows next.
    setReportSource(PLAYED_SOURCE);
    setLastFight({
      id: fightId,
      log: logSince(0),
      snapshot,
      config: fight.config,
      labels: {
        setupPreset: setupPresetName(fight.config, fight.catalog),
        gear: gearName(fight.config),
        talents: talentsName(fight.config),
        rotation: rotationName(fight.config),
        fight: fightSettingsName(fight.config),
      },
      seed,
      fight,
    });
  }
  // The running (or ended) fight's own spec: its auras, spells and keybinds.
  const spec = fight.spec;
  // The next fight's labels (memoized strings: the header and the Simulator panel are memoized too).
  const labels = useMemo<ChipLabels>(
    () => ({
      setupPreset: setupPresetName(config, nextFight.catalog),
      gear: gearName(config),
      talents: talentsName(config),
      rotation: rotationName(config),
      fight: fightSettingsName(config),
    }),
    [config, nextFight.catalog],
  );
  const fightLabels = useMemo(
    () => ({ setupPreset: setupPresetName(fight.config, fight.catalog), gear: gearName(fight.config), talents: talentsName(fight.config) }),
    [fight],
  );
  const talents = setupTalents(config);
  const talentWarnings = useMemo(() => talentRotationWarnings(config), [config]);
  const itemDescriptionsOfFight = useMemo(() => itemDescriptions(fight.catalog), [fight]);
  const itemIconsOfFight = useMemo(() => itemIconActions(fight.catalog), [fight]);
  // The combat text of the running (or ended) fight: names, icons (item icons from its catalog),
  // school colours, hidden and proc auras, item actions and cooldowns, its scheduled auras. An
  // aura from a catalog entry is named like in "Your buffs" ("Heroism / Bloodlust").
  const hudContext = useMemo(() => {
    const sources = auraSources(fight.catalog);
    return buildHudContext({
      spells: fight.spec.spells,
      auras: fight.spec.auras.map((a) => {
        const name = sources.get(a.id)?.name;
        return name === undefined || name === a.name ? a : { ...a, name };
      }),
      scheduledAuras: fight.sim.scheduledAuras,
      catalog: fight.catalog,
    });
  }, [fight]);
  // The Gear panel's hints (shown once the database has loaded: then the next fight wears `config`'s gear).
  const gearHints = useMemo(
    () => itemEffectHints(nextFight.catalog.filter((b) => isGearEffectId(b.id)), config.enabledBuffs),
    [nextFight, config.enabledBuffs],
  );
  const unmodelledItemEffects = useMemo(
    () => unmodelledGearEffects(setupGear(nextFight.config), db ?? EMBEDDED_GEAR_EFFECT_SOURCE),
    [nextFight, db],
  );
  // A stored gear the database must build: until it has loaded the next fight wears My gear.
  const itemsNote =
    db === null && config.gear !== undefined && gearNeedsDb(config.gear)
      ? itemDb.status === 'error'
        ? 'The item database could not load: the next fight uses My gear, and these are its effects.'
        : 'Loading the item database: until then the next fight uses My gear, and these are its effects.'
      : undefined;
  // The edit differs from what the running (or ended) fight uses; toggling a buff on and off again does not count.
  const started = phase !== 'ready';
  const anyPending = started && JSON.stringify(fight.config) !== JSON.stringify(config);
  const talentsPending = started && setupTalents(fight.config) !== talents;
  const pending = useMemo(() => (anyPending ? pendingSections(fight.config, config) : NO_PENDING), [anyPending, fight.config, config]);
  // The fight history: loaded once, every change saved (a refusal is shown, never silent).
  const [history, setHistory] = useState<FightHistory>(() => ({ entries: loadHistory(store), saved: store === null ? 'memory' : 'yes' }));
  const historyRef = useRef<readonly HistoryEntry[]>(history.entries);
  const commitHistory = useCallback(
    (entries: readonly HistoryEntry[]) => {
      if (entries === historyRef.current) return;
      historyRef.current = entries;
      setHistory({ entries, saved: store === null ? 'memory' : saveHistory(store, entries) ? 'yes' : 'failed' });
    },
    [store],
  );
  // Every ended fight goes into the history once, with the setup it was played with (its snapshot).
  const recordedFight = useRef<LastFight | null>(null);
  useEffect(() => {
    if (lastFight === null || recordedFight.current === lastFight) return;
    recordedFight.current = lastFight;
    const { log, snapshot, config: played, seed: fightSeed } = lastFight;
    commitHistory(recordPlayed(historyRef.current, { log, final: snapshot, config: played, seed: fightSeed, durationMs: snapshot.durationMs }, Date.now()).entries);
  }, [lastFight, commitHistory]);
  const updateEntry = useCallback((id: string, patch: HistoryPatch) => commitHistory(updateHistoryEntry(historyRef.current, id, patch)), [commitHistory]);
  const removeEntry = useCallback((id: string) => commitHistory(removeHistoryEntry(historyRef.current, id)), [commitHistory]);
  const openHistoryFight = useCallback((id: string) => setReportSource({ kind: 'history', id }), []);
  const useSnapshotAsSetup = useCallback(
    (id: string) => {
      const entry = historyRef.current.find((e) => e.id === id);
      if (entry === undefined) return false;
      changeConfig(entry.config);
      return true;
    },
    [changeConfig],
  );

  const [lastSimulation, setLastSimulation] = useState<LastSimulation | null>(null);
  const simulationCount = useRef(0);
  /** Replayed fights by source key (the current simulation's key fights). */
  const replays = useRef(new Map<string, ReportFight>());
  /** History fights by entry (a renamed or pinned entry is a new object: built again). */
  const historyFights = useRef(new WeakMap<HistoryEntry, ReportFight>());
  const recordSimulation = useCallback(
    (result: SimResult, simConfig: SetupConfig) => {
      replays.current.clear();
      simulationCount.current += 1;
      setLastSimulation({ id: simulationCount.current, result, config: simConfig });
      commitHistory(recordSimulationInHistory(historyRef.current, { result, config: simConfig }, Date.now()));
    },
    [commitHistory],
  );
  const dbStatus = itemDb.status;
  // The Report's fight: the played one as is, a key fight replayed once from the simulation's
  // setup snapshot (a few ms on the main thread) and kept per source key.
  const reportFight = useMemo<ReportFightState>(() => {
    if (reportSource.kind === 'played') return lastFight === null ? NO_REPORT_FIGHT : { status: 'ready', fight: fightFromLast(lastFight) };
    if (reportSource.kind === 'history') {
      const entry = history.entries.find((e) => e.id === reportSource.id);
      if (entry === undefined) return { status: 'unavailable', reason: 'This fight is no longer in the history.' };
      const hit = historyFights.current.get(entry);
      if (hit !== undefined) return { status: 'ready', fight: hit };
      const needsDb = entry.config.gear !== undefined && gearNeedsDb(entry.config.gear);
      if (needsDb && db === null) {
        return dbStatus === 'error'
          ? { status: 'error', message: 'The item database could not load, and this fight’s gear needs it.' }
          : { status: 'loading', reason: 'Loading the item database for this fight’s gear…' };
      }
      const key = `history:${entry.id}`;
      try {
        const fight =
          entry.kind === 'played'
            ? fightFromInput(
                { key, kind: 'played', log: entry.log, config: entry.config, seed: entry.seed, durationMs: entry.durationMs, final: entry.final },
                fightOfConfig(entry.config, needsDb ? db : null, buildSpec),
              )
            : replaySimFight(
                {
                  result: { runs: entry.runs, seed: entry.baseSeed, spellQueueWindowMs: entry.spellQueueWindowMs, meanDps: entry.meanDps, stdDev: entry.stdDev },
                  config: entry.config,
                },
                entry.run,
                entry.kind,
                key,
                needsDb ? db : null,
              );
        historyFights.current.set(entry, fight);
        return { status: 'ready', fight };
      } catch (error) {
        return { status: 'error', message: `This fight could not be replayed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    if (lastSimulation === null) return { status: 'unavailable', reason: 'No simulation yet: run the simulator to see its key fights.' };
    const which = reportSource.which;
    const keyFight = lastSimulation.result.keyFights?.[which];
    if (keyFight === undefined) return { status: 'unavailable', reason: 'This result has no key fights: run the simulation again.' };
    const key = `sim:${lastSimulation.id}:${which}`;
    const hit = replays.current.get(key);
    if (hit !== undefined) return { status: 'ready', fight: hit };
    const simConfig = lastSimulation.config;
    const needsDb = simConfig.gear !== undefined && gearNeedsDb(simConfig.gear);
    if (needsDb && db === null) {
      return dbStatus === 'error'
        ? { status: 'error', message: 'The item database could not load, and this fight’s gear needs it.' }
        : { status: 'loading', reason: 'Loading the item database for this fight’s gear…' };
    }
    try {
      const fight = replaySimFight(lastSimulation, keyFight.run, SIM_KIND[which], key, needsDb ? db : null);
      replays.current.set(key, fight);
      return { status: 'ready', fight };
    } catch (error) {
      return { status: 'error', message: `This fight could not be replayed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }, [reportSource, lastFight, lastSimulation, history.entries, db, dbStatus, buildSpec]);
  // A replay waiting for the item database asks for it.
  const replayWantsDb = reportFight.status === 'loading';
  useEffect(() => {
    if (replayWantsDb) requestDb();
  }, [replayWantsDb, requestDb]);
  const [lastComparison, setLastComparison] = useState<LastComparison | null>(null);
  const recordComparison = useCallback((comparison: LastComparison) => setLastComparison(comparison), []);
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

  // "Your buffs": the running (or ended) fight's own auras, scheduled auras and enabled buffs,
  // never the pending setup. Rebuilt once per snapshot (one per animation frame), no timer of its own.
  const buffViews = useMemo(
    () =>
      buildBuffViews({
        selfAuras: snapshot.selfAuras,
        spec: fight.spec,
        catalog: fight.catalog,
        scheduled: fight.sim.scheduledAuras,
        enabledBuffIds: fight.config.enabledBuffs,
        nowMs: snapshot.nowMs,
        phase: snapshot.phase,
        fightDurationMs: snapshot.durationMs,
      }),
    [snapshot, fight],
  );

  const specName = nextFight.spec.name;
  const specClass = nextFight.spec.className;
  const specIcon = nextFight.spec.icon;
  const identity = useMemo(() => specIdentity({ name: specName, className: specClass, icon: specIcon }), [specName, specClass, specIcon]);

  const state = useMemo<TrainerState>(
    () => ({ config, hudSettings, itemDb, nextFight, talents, talentWarnings, gearHints, unmodelledItemEffects, itemsNote, scenarios }),
    [config, hudSettings, itemDb, nextFight, talents, talentWarnings, gearHints, unmodelledItemEffects, itemsNote, scenarios],
  );
  const actions = useMemo<TrainerActions>(
    () => ({
      changeConfig,
      changeGear,
      changeTalents,
      changeHudSettings,
      requestDb,
      reload: onReload,
      start,
      cast,
      cancel,
      reset: doReset,
      pressSlot,
      attachFightView: attach,
      recordSimulation,
      changeScenarios,
      recordComparison,
      setReportSource,
      openHistoryFight,
      useSnapshotAsSetup,
      updateHistoryEntry: updateEntry,
      removeHistoryEntry: removeEntry,
    }),
    [
      changeConfig,
      changeGear,
      changeTalents,
      changeHudSettings,
      requestDb,
      onReload,
      start,
      cast,
      cancel,
      doReset,
      pressSlot,
      attach,
      recordSimulation,
      changeScenarios,
      recordComparison,
      openHistoryFight,
      useSnapshotAsSetup,
      updateEntry,
      removeEntry,
    ],
  );
  const meta = useMemo<TrainerMeta>(
    () => ({
      phase,
      paused,
      labels,
      fightLabels,
      pending,
      anyPending,
      talentsPending,
      spec: identity,
      uiStorage: store,
      simRunner,
      compareRunner,
      lastFight,
      lastSimulation,
      lastComparison,
      reportSource,
      reportFight,
      history,
    }),
    [
      phase,
      paused,
      labels,
      fightLabels,
      pending,
      anyPending,
      talentsPending,
      identity,
      store,
      simRunner,
      compareRunner,
      lastFight,
      lastSimulation,
      lastComparison,
      reportSource,
      reportFight,
      history,
    ],
  );
  const trainer = useMemo<TrainerValue>(() => ({ state, actions, meta }), [state, actions, meta]);
  const frame = useMemo<FightFrame>(
    () => ({
      snapshot,
      fight,
      fightId,
      logSince,
      flash,
      buffViews,
      hudContext,
      itemDescriptions: itemDescriptionsOfFight,
      itemIcons: itemIconsOfFight,
    }),
    [snapshot, fight, fightId, logSince, flash, buffViews, hudContext, itemDescriptionsOfFight, itemIconsOfFight],
  );

  return (
    <TrainerContext.Provider value={trainer}>
      <FightFrameContext.Provider value={frame}>{children}</FightFrameContext.Provider>
    </TrainerContext.Provider>
  );
}
