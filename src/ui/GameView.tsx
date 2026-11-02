import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AUTHOR_GEAR_TABLES, buildDestructionWarlock } from '../data/classes/warlock/destruction';
import type { GearTables, WarlockOptions } from '../data/classes/warlock/destruction';
import { offeredGearPresets } from '../data/classes/warlock/gearPresets';
import { UNMODELLED_SETS } from '../data/classes/warlock/sets';
import { loadItemDb } from '../data/items/db';
import type { ItemDb } from '../data/items/types';
import type { BuffDef, SpecData } from '../data/types';
import { activeSetBonuses } from '../engine/sets';
import { computeStats } from '../engine/stats';
import type { EquippedItem, RawStats, SimSnapshot, SpellDef, SpellModifier } from '../engine/types';
import { applySetup } from '../setup/applySetup';
import { normalizeSetup, SETUP_CATALOG, setupCatalogFor, STATIC_SETUP_CATALOG } from '../setup/defaults';
import { gearNeedsDb, setupGear } from '../setup/gear';
import type { SimRunner } from '../sim-runner/client';
import { EMBEDDED_GEAR_EFFECT_SOURCE, isGearEffectId, unmodelledGearEffects } from '../setup/gearEffects';
import { SETUP_PRESETS } from '../setup/presets';
import { browserStorage, loadSetup, saveSetup } from '../setup/storage';
import type { SetupStorage } from '../setup/storage';
import type { AppliedSetup, SetupConfig } from '../setup/types';
import { ActionBar, REJECT_LABELS } from './ActionBar';
import type { SlotFlash } from './ActionBar';
import { CastBar } from './CastBar';
import { CombatTextLayer } from './CombatTextHud';
import { CombatTextSettings } from './CombatTextSettings';
import { buildHudContext } from './hudEvents';
import { loadHudSettings, normalizeHudSettings, saveHudSettings } from './hudSettings';
import type { HudSettings, HudStorage } from './hudSettings';
import { formatDps, formatInt, secondsText } from './format';
import { CUSTOM_GEAR_NAME, GearPanel, type GearDbStatus } from './GearPanel';
import { itemEffectHints, matchingPreset } from './gearView';
import { keyToSlot } from './keys';
import { ManaBar } from './ManaBar';
import { SetBonusList } from './SetBonusList';
import { auraSources, buildBuffViews } from './buffsView';
import { PlayerBuffsPanel, useAuraTotals } from './PlayerBuffsPanel';
import { activePresetName, SetupPanel } from './SetupPanel';
import { StartOverlay } from './StartOverlay';
import { TargetPanel } from './TargetPanel';
import { SimulatorPanel } from './SimulatorPanel';
import { useSimulation } from './useSimulation';

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

/** Fields that take typed text or arrow keys: every key typed into them is theirs, never a hotkey. */
const TEXT_TARGETS =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), select, textarea, [contenteditable]:not([contenteditable="false"])';
/** Toggles (a `<summary>`, checkboxes, radios, buttons): only Space and Enter belong to them, the other hotkeys still work after a click. */
const TOGGLE_TARGETS = 'summary, button, input[type="checkbox"], input[type="radio"]';
/** An open modal (the Gear panel's item picker): every key pressed inside it is its own. */
const MODAL = '[aria-modal="true"]';

function isHotkeyBlocked(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof Element)) return false;
  if (target.matches(TEXT_TARGETS) || target.closest(MODAL) !== null) return true;
  return target.matches(TOGGLE_TARGETS) && (event.key === ' ' || event.key === 'Enter');
}

/** The next fight's setup: the config it comes from plus `applySetup`'s spec and fight settings. */
interface NextFight extends AppliedSetup {
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

/** The gear presets the Gear panel offers (the author's gear first, then by phase). */
const GEAR_PRESETS_OFFERED = offeredGearPresets();

/** The gear's preset name ("My gear (export)", "T6", ...) or "Custom". */
const gearName = (config: SetupConfig): string =>
  matchingPreset(setupGear(config), GEAR_PRESETS_OFFERED)?.name ?? CUSTOM_GEAR_NAME;

/** The config without its gear (the author's gear). */
function withoutGear(config: SetupConfig): SetupConfig {
  const { gear: _gear, gearPresetId: _id, ...rest } = config;
  return rest;
}

/** An item's name from the database, or the embedded author tables before it has loaded. */
function itemNameIn(db: ItemDb | null): (id: number) => string {
  return (id) => (db && Object.hasOwn(db.items, id) ? db.items[id]!.name : (AUTHOR_GEAR_TABLES.items[id]?.name ?? `item ${id}`));
}

export interface GameViewProps {
  /**
   * Builds the spec for the warlock options and gear (default: the Destruction Warlock). `db` is
   * the item database once it has loaded, passed for a config that has a gear.
   */
  buildSpec?: (warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[], db?: GearTables) => SpecData;
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
   * (storage.ts never throws).
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

/**
 * The playable fight: target, cast bar, mana, action bar, live numbers and the end summary, plus
 * the Setup panel. The setup (`SetupConfig`) lives here: loaded once at mount, every edit
 * normalized, saved and turned into the next fight (`applySetup`); a fight that has not started
 * takes it at once, a running or ended one keeps its own until R (useSimulation). The Priority
 * list and the stats at the pull follow the setup at once.
 */
export function GameView({
  buildSpec = buildDestructionWarlock,
  storage,
  hudStorage,
  loadDb = loadItemDb,
  onReload = reloadPage,
  simRunner,
}: GameViewProps) {
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
  const db = itemDb.db;
  const nextFight = useMemo<NextFight>(() => {
    // Never build a gear the author tables do not know without the database: buildSetup would skip
    // the unknown ids silently (a wrong DPS). Until it loads, the author's gear.
    const fightConfig = config.gear !== undefined && db === null && gearNeedsDb(config.gear) ? withoutGear(config) : config;
    const build = (warlock: WarlockOptions, gear?: readonly (EquippedItem | null)[]) =>
      gear === undefined || db === null ? buildSpec(warlock, gear) : buildSpec(warlock, gear, db);
    return {
      config: fightConfig,
      // "Items and cooldowns" follows the worn gear: its effects, derived (never a fixed list).
      catalog: setupCatalogFor(setupGear(fightConfig), db),
      ...applySetup({ buildSpec: build, catalog: STATIC_SETUP_CATALOG, config: fightConfig, db }),
    };
  }, [buildSpec, config, db]);
  const { snapshot, fight, cast, cancel, reset, start, logSince, fightId } = useSimulation(nextFight);
  // The running (or ended) fight's own spec: its auras, spells and keybinds.
  const spec = fight.spec;
  const priority = nextFight.spec.priority;
  // The Simulator's labels of the next fight's setup (memoized strings: the panel is memoized too).
  const nextGear = useMemo(() => gearName(config), [config]);
  const nextPreset = useMemo(() => activePresetName(config, SETUP_PRESETS, nextFight.catalog), [config, nextFight.catalog]);
  const fightPreset = useMemo(() => activePresetName(fight.config, SETUP_PRESETS, fight.catalog), [fight]);
  const fightGear = useMemo(() => gearName(fight.config), [fight.config]);
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
  const pending = snapshot.phase !== 'ready' && JSON.stringify(fight.config) !== JSON.stringify(config);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isHotkeyBlocked(event)) return; // e.g. digits or Z typed into a number field, Space on a focused <summary>
      const slot = keyToSlot(event.key); // 1-9, 0, -, = and the item row's keys (ITEM_SLOT_KEYS, either case)
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
        <FightStats snapshot={snapshot} config={fight.config} presetName={fightPreset} gearName={fightGear} />
        {/* With the HUD on, the arena keeps a band at its bottom for the notifications (clear of the target's debuffs). */}
        <section className={hudSettings.enabled ? 'arena arena-hud' : 'arena'}>
          <TargetPanel spec={spec} targetAuras={snapshot.targetAuras} fightRemainingMs={fightRemainingMs} />
          {/* Under the overlays: the start card and the end summary stay clean. */}
          <CombatTextLayer
            snapshot={snapshot}
            fightId={fightId}
            logSince={logSince}
            context={hudContext}
            settings={hudSettings}
          />
          {snapshot.phase === 'ready' && <StartOverlay onStart={start} />}
          {snapshot.phase === 'ended' && (
            <EndSummary
              snapshot={snapshot}
              config={fight.config}
              presetName={fightPreset}
              gearName={fightGear}
              onReset={doReset}
            />
          )}
        </section>
        <div className="player">
          <CastBar spec={spec} snapshot={snapshot} />
          <ManaBar snapshot={snapshot} />
          <ActionBar
            spec={spec}
            snapshot={snapshot}
            flash={flash}
            onPress={pressSlot}
            descriptions={itemDescriptionsOfFight}
            itemIcons={itemIconsOfFight}
          />
          {/* Below the bars, so they never move while buffs come and go. */}
          <PlayerBuffsPanel
            active={buffViews.active}
            upcoming={buffViews.upcoming}
            permanent={buffViews.permanent}
            totals={buffTotals}
            phase={snapshot.phase}
          />
        </div>
      </main>
      <aside className="game-side">
        <SetupPanel
          catalog={nextFight.catalog}
          config={config}
          presets={SETUP_PRESETS}
          onChange={changeConfig}
          pending={pending}
          fightEnded={snapshot.phase === 'ended'}
          unmodelledItemEffects={unmodelledItemEffects}
          itemsNote={itemsNote}
        />
        <GearPanel
          gear={setupGear(config)}
          presets={GEAR_PRESETS_OFFERED}
          db={db}
          status={itemDb.status}
          onChange={changeGear}
          onOpen={requestDb}
          onReload={onReload}
          pending={pending}
          fightEnded={snapshot.phase === 'ended'}
          hints={gearHints}
        />
        <CombatTextSettings settings={hudSettings} onChange={changeHudSettings} />
        <SimulatorPanel
          config={config}
          db={db}
          dbStatus={itemDb.status}
          gearName={nextGear}
          presetName={nextPreset}
          runner={simRunner}
        />
        <CharacterStats spec={nextFight.spec} />
        <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} unmodelled={UNMODELLED_SETS} />
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

/** The fight's setup and gear names and what its DPS leaves out (depends on whether any buff is enabled). */
function DpsNote({ config, presetName, gearName }: { config: SetupConfig; presetName: string; gearName: string }) {
  return (
    <p className="dps-note">
      <span className="setup-tag">Setup: {presetName}</span>
      <span className="setup-tag">Gear: {gearName}</span>
      <span>{config.enabledBuffs.length === 0 ? DPS_NOTE_NO_BUFFS : DPS_NOTE_WITH_BUFFS}</span>
    </p>
  );
}

interface FightInfoProps {
  snapshot: SimSnapshot;
  config: SetupConfig;
  presetName: string;
  gearName: string;
}

function FightStats({ snapshot, config, presetName, gearName }: FightInfoProps) {
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
      <DpsNote config={config} presetName={presetName} gearName={gearName} />
    </div>
  );
}

function EndSummary({ snapshot, config, presetName, gearName, onReset }: FightInfoProps & { onReset(): void }) {
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
        <DpsNote config={config} presetName={presetName} gearName={gearName} />
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
