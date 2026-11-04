import { useEffect, useMemo } from 'react';
import { UNMODELLED_SETS } from '../data/classes/warlock/sets';
import type { SpecData } from '../data/types';
import { activeSetBonuses } from '../engine/sets';
import { computeStats } from '../engine/stats';
import type { RawStats, SimSnapshot, SpellDef, SpellModifier } from '../engine/types';
import { setupGear } from '../setup/gear';
import { SETUP_PRESETS } from '../setup/presets';
import type { SetupConfig } from '../setup/types';
import { ActionBar } from './ActionBar';
import { CastBar } from './CastBar';
import { CombatTextLayer } from './CombatTextHud';
import { CombatTextSettings } from './CombatTextSettings';
import { formatDps, formatInt, secondsText } from './format';
import { GearPanel } from './GearPanel';
import { ManaBar } from './ManaBar';
import { SetBonusList } from './SetBonusList';
import { PlayerBuffsPanel } from './PlayerBuffsPanel';
import { SetupPanel } from './SetupPanel';
import { TalentsPanel } from './TalentsPanel';
import { StartOverlay } from './StartOverlay';
import { TargetPanel } from './TargetPanel';
import { SimulatorPanel } from './SimulatorPanel';
import { EndCard } from './fight/EndCard';
import { DPS_NOTE_NO_BUFFS, DPS_NOTE_WITH_BUFFS, dpsNoteText, playedWithTags } from './fight/fightView';
import { useFightHotkeys } from './fight/useFightHotkeys';
import { GEAR_PRESETS_OFFERED, TALENT_PRESETS_OFFERED } from './state/selectors';
import { TrainerProvider, useFightFrame, useTrainer } from './state/TrainerProvider';
import type { TrainerProviderProps } from './state/TrainerProvider';

/** The legacy all-in-one view's props: the trainer's (`TrainerProviderProps`). */
export type GameViewProps = TrainerProviderProps;

/**
 * The legacy all-in-one layout (kept until the redesign's Task 5 so every existing test keeps
 * rendering it): the trainer provider around `LegacyLayout`. Same props and output as before the
 * state moved into `TrainerProvider`.
 */
export function GameView(props: GameViewProps) {
  return (
    <TrainerProvider {...props}>
      <LegacyLayout />
    </TrainerProvider>
  );
}

/**
 * The playable fight: target, cast bar, mana, action bar, live numbers and the end summary, plus
 * the Setup panels, all on one page; it reads the trainer's contexts (`useTrainer`,
 * `useFightFrame`) and owns the fight hotkeys while it is mounted. The Priority list and the
 * stats at the pull follow the setup at once.
 */
export function LegacyLayout() {
  const { state, actions, meta } = useTrainer();
  const { snapshot, fight, fightId, logSince, flash, buffViews, buffTotals, hudContext, itemDescriptions, itemIcons } = useFightFrame();
  const { hudSettings } = state;
  const { start, cancel, reset, pressSlot, attachFightView } = actions;
  const { fightLabels } = meta;
  // The running (or ended) fight's own spec: its auras, spells and keybinds.
  const spec = fight.spec;

  const fightRemainingMs = Math.max(0, snapshot.durationMs - snapshot.nowMs);

  // The fight's keys and clock belong to this view while it is mounted (the shared hook).
  useEffect(() => attachFightView(), [attachFightView]);
  useFightHotkeys({ pressSlot, cancel, start, reset });

  return (
    <div className="game">
      <main className="game-main">
        <FightStats
          snapshot={snapshot}
          config={fight.config}
          presetName={fightLabels.setupPreset}
          gearName={fightLabels.gear}
          talentsName={fightLabels.talents}
        />
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
            <EndCard
              dps={snapshot.dps}
              damageTotal={snapshot.damageTotal}
              durationMs={snapshot.nowMs}
              botDps={null}
              dpsNote={dpsNoteText(fight.config.enabledBuffs)}
              playedWith={playedWithTags(fightLabels)}
              onReset={reset}
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
            descriptions={itemDescriptions}
            itemIcons={itemIcons}
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
        <LegacySetupPanels />
      </aside>
    </div>
  );
}

/**
 * The legacy side column: the Setup, Gear, Talents, Combat text and Simulator panels, the stats at
 * the pull, the set bonuses and the priority. Until the Setup screen (redesign Task 3) replaces
 * them, the interim Setup view shows them too.
 */
export function LegacySetupPanels() {
  const { state, actions, meta } = useTrainer();
  const { fight } = useFightFrame();
  const { config, hudSettings, itemDb, nextFight, talents, talentWarnings, gearHints, unmodelledItemEffects, itemsNote } = state;
  const { changeConfig, changeGear, changeTalents, changeHudSettings, requestDb, reload } = actions;
  const { labels, anyPending: pending, talentsPending, simRunner, phase } = meta;
  const db = itemDb.db;
  const spec = fight.spec;
  const priority = nextFight.spec.priority;
  return (
    <>
      <SetupPanel
        catalog={nextFight.catalog}
        config={config}
        presets={SETUP_PRESETS}
        onChange={changeConfig}
        pending={pending}
        fightEnded={phase === 'ended'}
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
        onReload={reload}
        pending={pending}
        fightEnded={phase === 'ended'}
        hints={gearHints}
      />
      <TalentsPanel
        talents={talents}
        presets={TALENT_PRESETS_OFFERED}
        onChange={changeTalents}
        pending={talentsPending}
        fightEnded={phase === 'ended'}
        warnings={talentWarnings}
      />
      <CombatTextSettings settings={hudSettings} onChange={changeHudSettings} />
      <SimulatorPanel
        config={config}
        db={db}
        dbStatus={itemDb.status}
        gearName={labels.gear}
        talentsName={labels.talents}
        presetName={labels.setupPreset}
        runner={simRunner}
      />
      <CharacterStats spec={nextFight.spec} />
      <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} unmodelled={UNMODELLED_SETS} />
      <details className="panel priority">
        <summary>Priority</summary>
        <ol>
          {priority.map((step) => (
            <li key={step.key ?? step.spellId}>
              <strong>{step.label}</strong>
              <span className="hint">{step.hint}</span>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

/** The fight's setup and gear names and what its DPS leaves out (depends on whether any buff is enabled). */
function DpsNote({
  config,
  presetName,
  gearName,
  talentsName,
}: {
  config: SetupConfig;
  presetName: string;
  gearName: string;
  talentsName: string;
}) {
  return (
    <p className="dps-note">
      <span className="setup-tag">Setup: {presetName}</span>
      <span className="setup-tag">Gear: {gearName}</span>
      <span className="setup-tag">Talents: {talentsName}</span>
      <span>{config.enabledBuffs.length === 0 ? DPS_NOTE_NO_BUFFS : DPS_NOTE_WITH_BUFFS}</span>
    </p>
  );
}

interface FightInfoProps {
  snapshot: SimSnapshot;
  config: SetupConfig;
  presetName: string;
  gearName: string;
  talentsName: string;
}

function FightStats({ snapshot, config, presetName, gearName, talentsName }: FightInfoProps) {
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
      <DpsNote config={config} presetName={presetName} gearName={gearName} talentsName={talentsName} />
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
