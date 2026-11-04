// The Fight screen (UI redesign spec §5.2): a game-like arena (HUD, target frame with debuffs,
// player buffs, the world ring, combat text zones, player frame, cast/item/action bars and the
// start, paused and end cards) and the dock. Always the dark world (`.world-dark`), whatever the
// app's theme. While mounted it owns the fight's keys and keeps the fight's clock running;
// leaving the screen pauses a running fight (spec §3.3, Q1).
//
// Per-frame data comes only from `useFightFrame()`; every frame part is memoized and gets
// primitives or arrays rebuilt once per snapshot.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { buffTimeText, isExpiring, timeLeftWords } from '../buffsView';
import type { BuffViews } from '../buffsView';
import { CombatTextLayer } from '../CombatTextHud';
import { secondsText } from '../format';
import { navigate, routeHref } from '../shell/router';
import { useFightFrame, useTrainer } from '../state/TrainerProvider';
import { StartOverlay } from '../StartOverlay';
import { AuraRow } from './AuraRow';
import { Bars } from './Bars';
import { Dock } from './Dock';
import { botRun } from '../report/botRun';
import { EndCard } from './EndCard';
import { dpsNoteText, nextUp, playedWithTags, targetDebuffViews } from './fightView';
import type { AuraIconView } from './fightView';
import { usePrefersReducedMotion, useUiFlag } from './hooks';
import { Hud } from './Hud';
import type { HudMark } from './Hud';
import { FIVE_SECOND_RULE_MS, PlayerFrame } from './PlayerFrame';
import { TARGET_NAME, TargetFrame } from './TargetFrame';
import { useFightHotkeys } from './useFightHotkeys';
import { World } from './World';
import './fight.css';

/** The player's buffs as icon views: active (with time), upcoming (dimmed, "in 4.9s"), setup (small). */
function playerBuffIcons(views: BuffViews, phase: 'ready' | 'running' | 'ended') {
  const active: AuraIconView[] = views.active.map((b) => ({
    id: b.auraId,
    name: b.name,
    icon: b.icon,
    iconKind: b.iconKind ?? 'spell',
    time: buffTimeText(b.remainingMs),
    count: b.count,
    label: `${b.name}, ${timeLeftWords(b.remainingMs)}`,
    title: `${b.name}: ${b.description}`,
    variant: 'mine',
    expiring: phase !== 'ended' && isExpiring(b.remainingMs),
  }));
  const upcoming: AuraIconView[] = views.upcoming.map((u, i) => {
    const when = phase === 'ready' ? `at ${secondsText(u.startsAtMs)} s` : `in ${secondsText(u.inMs)} s`;
    return {
      id: `${u.auraId}-${u.startsAtMs}-${i}`,
      name: u.name,
      icon: u.icon,
      iconKind: u.iconKind ?? 'spell',
      time: phase === 'ready' ? `${secondsText(u.startsAtMs)}s` : `in ${secondsText(u.inMs)}`,
      count: null,
      label: `${u.name} ${when}`,
      title: `${u.name} ${when}`,
      variant: 'upcoming',
      expiring: false,
    };
  });
  const setup: AuraIconView[] = views.permanent.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    iconKind: p.iconKind ?? 'spell',
    time: null,
    count: null,
    label: p.name,
    title: `${p.name}: ${p.description}`,
    variant: 'passive',
    expiring: false,
  }));
  return { active, upcoming, setup };
}

interface PlayerBuffsProps {
  active: readonly AuraIconView[];
  upcoming: readonly AuraIconView[];
  setup: readonly AuraIconView[];
  reduceMotion: boolean;
}

/** "Your buffs" (top right, as the game's buff frame): timed buffs, upcoming ones, the setup's. */
const PlayerBuffs = memo(function PlayerBuffs({ active, upcoming, setup, reduceMotion }: PlayerBuffsProps) {
  return (
    <section className="fv-player-buffs" aria-label="Your buffs">
      <h2 className="sr-only">Your buffs</h2>
      {active.length === 0 ? (
        <p className="sr-only">No active buffs</p>
      ) : (
        <AuraRow label="Active buffs" views={active} reduceMotion={reduceMotion} />
      )}
      {upcoming.length > 0 && <AuraRow label="Upcoming buffs" views={upcoming} reduceMotion={reduceMotion} />}
      {setup.length > 0 && (
        <>
          <AuraRow label="Setup buffs" views={setup} reduceMotion={reduceMotion} className="fv-auras-setup" />
          <span className="fv-lab">Setup buffs last the whole fight</span>
        </>
      )}
    </section>
  );
});

/** The paused card: a running fight whose screen was left (Space, a spell or this button resumes). */
const PausedCard = memo(function PausedCard({ atMs, onResume }: { atMs: number; onResume(): void }) {
  return (
    <div className="fv-overlay">
      <section className="fv-card" aria-label="Paused">
        <h2>Paused</h2>
        <p>
          The fight stopped at {secondsText(atMs)} s when you left the Fight screen. Press <kbd>Space</kbd> or a spell key to resume;{' '}
          <kbd>R</kbd> resets.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={(e) => {
            e.currentTarget.blur();
            onResume();
          }}
        >
          Resume
        </button>
      </section>
    </div>
  );
});

/**
 * Time left of the five-second rule: the last snapshot whose mana dropped (a spend at cast
 * completion) starts it; a new fight forgets it. Derived during render (no effect, no timer).
 */
function useRegenIn(mana: number, nowMs: number, fightId: number, phase: string): number | null {
  const [state, setState] = useState({ fightId, mana, spentAt: null as number | null });
  let current = state;
  if (state.fightId !== fightId || mana !== state.mana) {
    const spent = state.fightId === fightId && mana < state.mana ? nowMs : state.fightId === fightId ? state.spentAt : null;
    current = { fightId, mana, spentAt: spent };
    setState(current);
  }
  if (phase === 'ready') return null;
  return current.spentAt === null ? 0 : Math.max(0, FIVE_SECOND_RULE_MS - (nowMs - current.spentAt));
}

const REPORT = { mode: 'report', tab: 'damage' } as const;

export function FightView() {
  const { state, actions, meta } = useTrainer();
  const { snapshot, fight, fightId, logSince, flash, buffViews, hudContext, itemDescriptions, itemIcons } = useFightFrame();
  const { hudSettings } = state;
  const { pressSlot, start, cancel, reset, attachFightView, changeHudSettings } = actions;
  const reduceMotion = usePrefersReducedMotion();
  const [dockOpen, setDockOpen] = useUiFlag(meta.uiStorage, 'dockOpen', false);
  const [coach, setCoach] = useUiFlag(meta.uiStorage, 'coach', true);
  const phase = snapshot.phase;
  const spec = fight.spec;

  // The fight's clock runs while this screen is on (leaving it pauses a running fight).
  useEffect(() => attachFightView(), [attachFightView]);
  const openReport = useCallback(() => navigate(REPORT), []);
  useFightHotkeys({ pressSlot, cancel, start, reset, openReport, ended: phase === 'ended' });

  const others = useMemo(
    () => new Set(fight.sim.scheduledAuras.filter((a) => a.on === 'target').map((a) => a.auraId)),
    [fight],
  );
  const fightRemainingMs = Math.max(0, snapshot.durationMs - snapshot.nowMs);
  const debuffs = useMemo(
    () => targetDebuffViews(snapshot.targetAuras, spec, others, fightRemainingMs, phase),
    [snapshot.targetAuras, spec, others, fightRemainingMs, phase],
  );
  const buffs = useMemo(() => playerBuffIcons(buffViews, phase), [buffViews, phase]);
  const marks = useMemo<HudMark[]>(
    () =>
      fight.sim.scheduledAuras
        .filter((a) => a.on === 'self' && a.atMs > 0 && a.atMs < fight.sim.durationMs)
        .map((a) => ({ atMs: a.atMs, label: `${hudContext.auras.get(a.auraId)?.name ?? a.auraId} at ${secondsText(a.atMs)} s` })),
    [fight, hudContext],
  );
  const regenInMs = useRegenIn(snapshot.mana, snapshot.nowMs, fightId, phase);
  // The coach: the slot the bot would press next (the running fight's priority).
  const nextIndex = coach && phase !== 'ended' ? nextUp(fight.spec.priority, snapshot, spec.spells) : -1;
  const nextSpellId = nextIndex >= 0 ? (fight.spec.priority[nextIndex]?.spellId ?? null) : null;
  const dpsNote = dpsNoteText(fight.config.enabledBuffs);
  const toggleDock = useCallback(() => setDockOpen(!dockOpen), [dockOpen, setDockOpen]);
  const onCombatText = useCallback((on: boolean) => changeHudSettings({ ...hudSettings, enabled: on }), [changeHudSettings, hudSettings]);
  const specLine = `${meta.spec.specName} ${meta.spec.className}`;
  const labels = meta.labels;
  const playedWith = useMemo(() => playedWithTags(meta.fightLabels), [meta.fightLabels]);
  // The bot's DPS in this same fight (same setup and seed; Report Task 4), once the fight has ended.
  const lastFight = meta.lastFight;
  const botDps = useMemo(() => (lastFight !== null && lastFight.id === fightId ? (botRun(lastFight)?.dps ?? null) : null), [lastFight, fightId]);

  const rootClass = [
    'fv',
    'world-dark',
    `fv-${phase}`,
    reduceMotion ? 'fv-still' : `fv-enter-${fightId % 2}`,
  ].join(' ');

  return (
    <div className={rootClass}>
      <h1 className="sr-only">Fight</h1>
      <section className="fv-arena" aria-label="Fight">
        <Hud
          nowMs={snapshot.nowMs}
          durationMs={snapshot.durationMs}
          dps={snapshot.dps}
          damageTotal={snapshot.damageTotal}
          marks={marks}
          dpsNote={dpsNote}
          dockOpen={dockOpen}
          onToggleDock={toggleDock}
        />
        <TargetFrame damageTotal={snapshot.damageTotal} debuffs={debuffs} reduceMotion={reduceMotion} />
        <PlayerBuffs active={buffs.active} upcoming={buffs.upcoming} setup={buffs.setup} reduceMotion={reduceMotion} />
        <World />
        <CombatTextLayer snapshot={snapshot} fightId={fightId} logSince={logSince} context={hudContext} settings={hudSettings} />
        <PlayerFrame
          icon={meta.spec.icon}
          specLine={specLine}
          mana={snapshot.mana}
          maxMana={snapshot.maxMana}
          regenInMs={regenInMs}
        />
        <Bars
          spec={spec}
          snapshot={snapshot}
          flash={flash}
          onPress={pressSlot}
          descriptions={itemDescriptions}
          itemIcons={itemIcons}
          nextSpellId={nextSpellId}
        />
        {phase === 'ready' && (
          <StartOverlay
            onStart={start}
            setupLine={
              <>
                {Math.round(snapshot.durationMs / 1000)}&nbsp;s against the {TARGET_NAME}. Setup:{' '}
                <a href={routeHref({ mode: 'setup', section: 'buffs' })}>{labels.setupPreset}</a>, gear:{' '}
                <a href={routeHref({ mode: 'setup', section: 'gear' })}>{labels.gear}</a>, rotation:{' '}
                <a href={routeHref({ mode: 'setup', section: 'rotation' })}>{labels.rotation}</a>.
              </>
            }
          />
        )}
        {phase === 'running' && meta.paused && <PausedCard atMs={snapshot.nowMs} onResume={start} />}
        {phase === 'ended' && (
          <EndCard
            dps={snapshot.dps}
            damageTotal={snapshot.damageTotal}
            durationMs={snapshot.nowMs}
            botDps={botDps}
            dpsNote={dpsNote}
            playedWith={playedWith}
            onReset={reset}
          />
        )}
      </section>
      <Dock
        snapshot={snapshot}
        spec={spec}
        priority={fight.spec.priority}
        fightId={fightId}
        logSince={logSince}
        itemIcons={itemIcons}
        open={dockOpen}
        combatText={hudSettings.enabled}
        onCombatText={onCombatText}
        coach={coach}
        onCoach={setCoach}
        onClose={toggleDock}
      />
    </div>
  );
}
