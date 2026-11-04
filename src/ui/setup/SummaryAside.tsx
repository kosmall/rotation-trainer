// The Setup screen's right column (UI redesign spec §5.1): the next fight's stats at the pull, its
// set bonuses and the last simulation of the setup. Everything follows the setup at once (it reads
// the next fight's spec, never the running fight's).

import { memo, useMemo } from 'react';
import { UNMODELLED_SETS } from '../../data/classes/warlock/sets';
import type { SpecData } from '../../data/types';
import { activeSetBonuses } from '../../engine/sets';
import { computeStats } from '../../engine/stats';
import type { RawStats, SpellDef, SpellModifier } from '../../engine/types';
import type { SetupConfig } from '../../setup/types';
import { formatDps, formatInt } from '../format';
import { SetBonusList } from '../SetBonusList';
import { routeHref } from '../shell/router';
import { useTrainer } from '../state/TrainerProvider';
import type { LastSimulation } from '../state/TrainerProvider';
import { countRender } from '../renderCount';

/** Crit chance added by the modifiers that match `spell` (id and school), or that match every spell when it is undefined. */
function critDelta(modifiers: readonly SpellModifier[], spell?: SpellDef): number {
  let sum = 0;
  for (const m of modifiers) {
    const matches = spell
      ? (m.spellIds === undefined || m.spellIds.includes(spell.id)) && (m.schools === undefined || m.schools.includes(spell.school))
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
 * Bolt crit" those that match Shadow Bolt too (Devastation). Moved here from the legacy GameView.
 */
export function CharacterStats({ spec }: { spec: SpecData }) {
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

/** The last simulation of the setup (or the invitation to run one) and the link to the Simulator. */
function SimulateCard({ last, config }: { last: LastSimulation | null; config: SetupConfig }) {
  const changed = last !== null && JSON.stringify(last.config) !== JSON.stringify(config);
  return (
    <section className="sim-card" aria-labelledby="sv-sim-title">
      <h3 id="sv-sim-title">Simulate this setup</h3>
      <div className="sim-mini" aria-live="polite">
        {last === null ? (
          <p>Run the simulator to see the spread of DPS for this setup.</p>
        ) : (
          <>
            <p className="big tnum" aria-label="Last simulated DPS">
              {formatDps(last.result.meanDps)}
              <small> ± {formatDps(last.result.stdErr)} DPS</small>
            </p>
            <p>
              {formatInt(last.result.runs)} runs, seed {last.result.seed}.{changed ? ' The setup changed since.' : ''}
            </p>
          </>
        )}
        <a className="btn primary small" href={routeHref({ mode: 'report', tab: 'simulator' })}>
          Run 1,000 Fights
        </a>
      </div>
    </section>
  );
}

/**
 * The "Next fight summary" aside: stats at the pull, set bonuses (both of the next fight, so a
 * gear or buff change shows at once) and the "Simulate this setup" card. Memoized: it re-renders
 * on setup edits only.
 */
export const SummaryAside = memo(function SummaryAside() {
  countRender('SummaryAside');
  const { state, meta } = useTrainer();
  const spec = state.nextFight.spec;
  return (
    <aside className="sv-summary" aria-label="Next fight summary">
      <h2 className="sr-only">Next fight summary</h2>
      <div className="sv-summary-inner">
        <CharacterStats spec={spec} />
        <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} unmodelled={UNMODELLED_SETS} />
        <SimulateCard last={meta.lastSimulation} config={state.config} />
      </div>
    </aside>
  );
});
