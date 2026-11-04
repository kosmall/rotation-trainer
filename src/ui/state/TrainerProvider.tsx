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
import type { SimRunner } from '../../sim-runner/client';
import { REJECT_LABELS } from '../ActionBar';
import type { SlotFlash } from '../ActionBar';
import { auraSources, buildBuffViews } from '../buffsView';
import type { BuffViews } from '../buffsView';
import type { GearDbStatus } from '../GearPanel';
import { itemEffectHints } from '../gearView';
import { buildHudContext } from '../hudEvents';
import type { HudContext } from '../hudEvents';
import { loadHudSettings, normalizeHudSettings, saveHudSettings } from '../hudSettings';
import type { HudSettings, HudStorage } from '../hudSettings';
import { useAuraTotals } from '../PlayerBuffsPanel';
import { useSimulation } from '../useSimulation';
import type { UiStorage } from '../theme/theme';
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
}

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
}

export interface ChipLabels {
  setupPreset: string;
  gear: string;
  talents: string;
  rotation: string;
  fight: string;
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
  buffTotals: ReturnType<typeof useAuraTotals>;
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
    // The talents are forwarded: the game plays the build the priority (applySetup) is built for.
    const build = (warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string) =>
      gear === undefined || db === null ? buildSpec(warlock, gear, undefined, talents) : buildSpec(warlock, gear, db, talents);
    return {
      config: fightConfig,
      // "Items and cooldowns" follows the worn gear: its effects, derived (never a fixed list).
      catalog: setupCatalogFor(setupGear(fightConfig), db),
      ...applySetup({ buildSpec: build, catalog: STATIC_SETUP_CATALOG, config: fightConfig, db }),
    };
  }, [buildSpec, config, db]);
  // Leaving the Fight screen pauses the fight (spec §3.3, author's answer to Q1).
  const { snapshot, fight, cast, cancel, reset, start, logSince, fightId, paused, attach } = useSimulation(nextFight, SIMULATION_OPTIONS);
  const phase = snapshot.phase;
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
  const buffTotals = useAuraTotals(buffViews.active);

  const specName = nextFight.spec.name;
  const specClass = nextFight.spec.className;
  const specIcon = nextFight.spec.icon;
  const identity = useMemo(() => specIdentity({ name: specName, className: specClass, icon: specIcon }), [specName, specClass, specIcon]);

  const state = useMemo<TrainerState>(
    () => ({ config, hudSettings, itemDb, nextFight, talents, talentWarnings, gearHints, unmodelledItemEffects, itemsNote }),
    [config, hudSettings, itemDb, nextFight, talents, talentWarnings, gearHints, unmodelledItemEffects, itemsNote],
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
    }),
    [changeConfig, changeGear, changeTalents, changeHudSettings, requestDb, onReload, start, cast, cancel, doReset, pressSlot, attach],
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
    }),
    [phase, paused, labels, fightLabels, pending, anyPending, talentsPending, identity, store, simRunner],
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
      buffTotals,
      hudContext,
      itemDescriptions: itemDescriptionsOfFight,
      itemIcons: itemIconsOfFight,
    }),
    [snapshot, fight, fightId, logSince, flash, buffViews, buffTotals, hudContext, itemDescriptionsOfFight, itemIconsOfFight],
  );

  return (
    <TrainerContext.Provider value={trainer}>
      <FightFrameContext.Provider value={frame}>{children}</FightFrameContext.Provider>
    </TrainerContext.Provider>
  );
}
