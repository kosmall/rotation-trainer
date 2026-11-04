// Report → "Setup Used" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 F): what the shown
// fight was played with, from its setup snapshot (the normalized config at the fight's start, and
// that config applied: never the current setup): the 17 gear slots (icon, item, gems, enchant,
// socket bonus), set bonuses, item effects, the stats at the pull (the Setup's numbers, from the
// snapshot), the talents with their ranks (not modelled ones marked), the buffs and consumables,
// the rotation (the priority as played, its item use rules, the simulation's rule fires when
// known), the fight settings and seed; "Use This Setup…" asks, then makes the snapshot the current
// setup (the caller: the normal setup path, normalized and saved). The item names need the item
// database: while it loads, a loading state. Loaded lazily with the Report's toggle.

import { memo, useEffect, useMemo, useState } from 'react';
import { ITEM_SLOTS } from '../../data/items/db';
import type { ItemDb } from '../../data/items/types';
import { UNMODELLED_SETS } from '../../data/classes/warlock/sets';
import { describeGear, setupGear } from '../../setup/gear';
import { isGearEffectId } from '../../setup/gearEffects';
import { setupTalents } from '../../setup/presets';
import type { SetupConfig } from '../../setup/types';
import { ruleKeysOf } from '../../sim-runner/run';
import { formatInt } from '../format';
import type { GearDbStatus } from '../GearPanel';
import { slotLabel, statsText } from '../gearView';
import { SetBonusList } from '../SetBonusList';
import { classOptionsOf } from '../setup/sections/classOptions';
import { ConfirmDialog } from '../setup/Modal';
import { CharacterStats } from '../setup/SummaryAside';
import { SpellIcon } from '../SpellIcon';
import { gearName, rotationName, setupPresetName, talentsName } from '../state/selectors';
import { specIdentity } from '../state/TrainerProvider';
import { boughtTalents, pointsText, ranksOf, treePoints } from '../talentView';
import type { ReportFight } from './reportFight';

export interface SetupUsedProps {
  fight: ReportFight;
  db: ItemDb | null;
  dbStatus: GearDbStatus;
  /** Asks for the item database (the gear's names need it). */
  requestDb(): void;
  /** The current setup ("Use This Setup" is off when it is the same). */
  currentConfig: SetupConfig;
  /** Mean fires per fight by rule key of the simulation the fight comes from, or null. */
  ruleFires: Readonly<Record<string, number>> | null;
  /** Makes the fight's setup snapshot the current setup (after the confirmation). */
  onUse(): void;
}

const timedText = (config: SetupConfig, id: string) => {
  const t = Object.hasOwn(config.timed, id) ? config.timed[id] : undefined;
  return t === undefined ? '' : `from ${t.startSec} s for ${t.durationSec} s`;
};

const SetupUsed = memo(function SetupUsed({ fight, db, dbStatus, requestDb, currentConfig, ruleFires, onUse }: SetupUsedProps) {
  const { config } = fight;
  const applied = fight.fight;
  const spec = applied.spec;
  const [confirming, setConfirming] = useState(false);
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (db === null) requestDb();
  }, [db, requestDb]);
  const same = JSON.stringify(config) === JSON.stringify(currentConfig);
  const talents = useMemo(() => setupTalents(config), [config]);
  const bought = useMemo(() => boughtTalents(talents), [talents]);
  const points = useMemo(() => pointsText(treePoints(ranksOf(talents))), [talents]);
  const itemEffects = applied.catalog.filter((b) => isGearEffectId(b.id));
  const items = useMemo(() => new Set(spec.spells.filter((s) => s.item).map((s) => s.id)), [spec]);
  const keys = useMemo(() => {
    const { rules } = ruleKeysOf(spec.priority, applied.basic.itemActions);
    return new Map(rules.map((r) => [r.step, r.key]));
  }, [spec, applied.basic.itemActions]);
  const steps = spec.priority.map((step, i) => ({ step, i, fires: ruleFires?.[keys.get(i) ?? ''] }));
  const classOptions = classOptionsOf(specIdentity(spec).classId);
  const scriptRules = config.script?.rules.length ?? 0;
  const firesText = (n: number | undefined) => (n === undefined ? null : `${n.toFixed(1)} per fight`);
  return (
    <section className="card setup-used" role="region" aria-label="Setup used">
      <div className="su-head">
        <h2>
          Setup used <small>{setupPresetName(config, applied.catalog)}: the snapshot taken at the fight’s start</small>
        </h2>
        <div className="su-use">
          <button type="button" className="btn" disabled={same} onClick={() => setConfirming(true)}>
            Use This Setup…
          </button>
          <p className="note" aria-live="polite">
            {used ? 'Done: this fight’s setup is now your setup.' : same ? 'This is your current setup.' : ''}
          </p>
        </div>
      </div>
      <div className="su-grid">
        <div className="su-col">
          <h3>
            Gear <small>{gearName(config)}</small>
          </h3>
          <GearList config={config} db={db} dbStatus={dbStatus} />
          {itemEffects.length > 0 && (
            <>
              <h3>Item effects</h3>
              <ul className="su-list" aria-label="Item effects">
                {itemEffects.map((b) => (
                  <li key={b.id}>
                    <span className="su-icon" aria-hidden="true">
                      <SpellIcon icon={b.icon} kind={b.iconKind === 'item' ? 'item' : 'spell'} className="su-icon-img" />
                    </span>
                    {b.name} <span className="dim">({b.effect.action ? 'on use' : b.effect.hooks ? 'proc' : 'before the pull'})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="su-col">
          <SetBonusList sets={spec.sets} setPieces={spec.setup.setPieces} unmodelled={UNMODELLED_SETS} />
          <CharacterStats spec={spec} hint="This fight, before timed buffs, from its setup snapshot. Crit includes the crit modifiers the fight rolled with." />
          <h3>
            Talents <small>{talentsName(config)}</small>
          </h3>
          <p className="note tnum">{points}</p>
          <ul className="su-list su-talents" aria-label="Talents of this fight">
            {bought.map((t) => (
              <li key={t.id} title={t.unmodelled}>
                <span className="su-icon" aria-hidden="true">
                  <SpellIcon icon={t.icon} kind="talent" className="su-icon-img" />
                </span>
                {t.name}{' '}
                <span className="tnum dim">
                  {t.rank}/{t.maxRank}
                </span>
                {t.unmodelled !== undefined && <span className="marker">Not modelled</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="su-col">
          <h3>Buffs and consumables</h3>
          <ul className="su-list" aria-label="Buffs and consumables">
            {config.enabledBuffs.map((id) => {
              const b = applied.catalog.find((x) => x.id === id);
              return (
                <li key={id}>
                  <span className="su-icon" aria-hidden="true">
                    {b && <SpellIcon icon={b.icon} kind={b.iconKind === 'item' ? 'item' : 'spell'} className="su-icon-img" />}
                  </span>
                  {b?.name ?? id} {b?.timed && <span className="dim">{timedText(config, id)}</span>}
                </li>
              );
            })}
          </ul>
          {config.enabledBuffs.length === 0 && <p className="note">None.</p>}
          <h3>
            Rotation <small>{scriptRules > 0 ? `Script, ${scriptRules} ${scriptRules === 1 ? 'rule' : 'rules'}` : rotationName(config)}</small>
          </h3>
          <ol className="su-list su-prio" aria-label="Priority of this fight">
            {steps
              .filter(({ step }) => !items.has(step.spellId))
              .map(({ step, i, fires }) => (
                <li key={i}>
                  <b>{step.label}</b> <span className="dim">{step.hint}</span>
                  {fires !== undefined && <span className="su-fires tnum">{firesText(fires)}</span>}
                </li>
              ))}
          </ol>
          <h4>Item use rules</h4>
          <ul className="su-list" aria-label="Item use rules">
            {steps
              .filter(({ step }) => items.has(step.spellId))
              .map(({ step, i, fires }) => (
                <li key={i}>
                  <b>{step.label}</b> <span className="dim">{step.hint}</span>
                  {fires !== undefined && <span className="su-fires tnum">{firesText(fires)}</span>}
                </li>
              ))}
          </ul>
          {!steps.some(({ step }) => items.has(step.spellId)) && <p className="note">No item is used.</p>}
          {ruleFires !== null && <p className="note">Rule fires: the simulation’s mean per fight.</p>}
          <h3>Fight</h3>
          <dl className="su-settings" role="group" aria-label="Fight settings">
            <div>
              <dt>Length</dt>
              <dd className="tnum">{config.fightDurationSec} s</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd className="tnum">{config.distanceYd} yd</dd>
            </div>
            {classOptions !== undefined && (
              <div>
                <dt>Class options</dt>
                <dd>{classOptions.value(config)}</dd>
              </div>
            )}
            <div>
              <dt>Seed</dt>
              <dd className="tnum">{fight.seed}</dd>
            </div>
            {fight.sim !== null && (
              <div>
                <dt>Simulation</dt>
                <dd className="tnum">
                  run #{fight.sim.run + 1} of {formatInt(fight.sim.runs)}, seed {fight.sim.baseSeed}, queue window {fight.sim.spellQueueWindowMs} ms
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Use This Fight’s Setup?"
          confirmLabel="Use This Setup"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setUsed(true);
            onUse();
          }}
        >
          <p>
            Your current setup (gear, talents, buffs, rotation and fight settings) is replaced by the setup this fight was played with, and
            saved like any edit. The next fight uses it.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
});

function GearList({ config, db, dbStatus }: { config: SetupConfig; db: ItemDb | null; dbStatus: GearDbStatus }) {
  const gear = useMemo(() => setupGear(config), [config]);
  const description = useMemo(() => (db === null ? null : describeGear(gear, db)), [gear, db]);
  if (db === null) {
    return (
      <p className="note" aria-live="polite">
        {dbStatus === 'error' ? 'The item database could not load, so the item names are not shown.' : 'Loading the item database…'}
      </p>
    );
  }
  return (
    <ol className="su-list su-gear" aria-label="Gear of this fight">
      {ITEM_SLOTS.map((slot, i) => {
        const entry = gear[i] ?? null;
        const item = entry !== null && Object.hasOwn(db.items, entry.id) ? db.items[entry.id] : undefined;
        const gems = (entry?.gems ?? []).flatMap((g) => (g !== 0 && Object.hasOwn(db.gems, g) ? [db.gems[g]!.name] : []));
        const enchant = entry?.enchant !== undefined && Object.hasOwn(db.enchants, entry.enchant) ? db.enchants[entry.enchant] : undefined;
        const bonus = description?.socketBonuses.find((b) => b.slot === slot);
        return (
          <li key={slot}>
            <span className="su-icon" aria-hidden="true">
              {item && <SpellIcon icon={item.icon} kind="item" className="su-icon-img" />}
            </span>
            <span className="su-slot">
              <span className="dim">{slotLabel(i)}</span> {item ? item.name : entry ? `Unknown item ${entry.id}` : 'Empty'}
              {(gems.length > 0 || enchant || bonus) && (
                <span className="su-sub dim">
                  {gems.length > 0 && `Gems: ${gems.join(', ')}. `}
                  {enchant && `Enchant: ${enchant.name}. `}
                  {bonus && `Socket bonus ${statsText(bonus.bonus)}: ${bonus.active ? 'active' : 'inactive'}.`}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default SetupUsed;
export { SetupUsed };
