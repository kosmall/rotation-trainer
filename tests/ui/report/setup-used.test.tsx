// Report → "Setup Used" (fight timeline and key fights Task K3; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 F): the fight's own
// setup snapshot, never the current setup: the 17 gear slots with gems and enchants, set bonuses,
// item effects, the stats at the pull, the talents with their ranks, the buffs and consumables, the
// rotation (with the item use rules and the simulation's rule fires when known), the fight
// settings and seed; "Use This Setup" asks first; while the item database loads, a loading state.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBot } from '../../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { itemDbSync } from '../../../src/data/items/dbSync';
import { DEFAULT_SETUP, setupCatalogFor } from '../../../src/setup/defaults';
import { setupGear } from '../../../src/setup/gear';
import { setupTalents } from '../../../src/setup/presets';
import type { SetupConfig } from '../../../src/setup/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { ruleKeysOf } from '../../../src/sim-runner/run';
import { chipLabelsOf, fightFromLast } from '../../../src/ui/report/reportModel';
import type { ReportFight } from '../../../src/ui/report/reportModel';
import { SetupUsed } from '../../../src/ui/report/SetupUsed';
import { ranksOf } from '../../../src/ui/talentView';
import type { LastFight, NextFight } from '../../../src/ui/state/TrainerProvider';
import { applyScenario, scenarios } from '../../fixtures/item-use-reference';

const db = itemDbSync();

afterEach(() => {
  cleanup();
});

function fightOf(config: SetupConfig, seed = 7): ReportFight {
  const fight: NextFight = { config, catalog: setupCatalogFor(setupGear(config), db), ...applyScenario(config, db) };
  const sim = createFightSimulation(fight, seed, SPELL_QUEUE_WINDOW_MS);
  runBot(sim, fight.spec.priority);
  const last: LastFight = { id: 1, log: sim.log(), snapshot: sim.snapshot(), config, labels: chipLabelsOf(config, fight.catalog), seed, fight };
  return fightFromLast(last);
}

function show(fight: ReportFight, p: Partial<{ db: typeof db | null; dbStatus: 'idle' | 'loading' | 'ready' | 'error'; current: SetupConfig; fires: Record<string, number> | null }> = {}) {
  const onUse = vi.fn();
  const requestDb = vi.fn();
  render(
    <SetupUsed
      fight={fight}
      db={p.db === undefined ? db : p.db}
      dbStatus={p.dbStatus ?? 'ready'}
      requestDb={requestDb}
      currentConfig={p.current ?? (structuredClone(DEFAULT_SETUP) as SetupConfig)}
      ruleFires={p.fires ?? null}
      onUse={onUse}
    />,
  );
  return { onUse, requestDb };
}

const region = () => screen.getByRole('region', { name: 'Setup used' });

describe('Setup Used', () => {
  it('the gear: 17 slots with the item names, gems and enchants of the snapshot', () => {
    const config = scenarios().quagBloodgem!;
    show(fightOf(config));
    const gear = within(region()).getByRole('list', { name: 'Gear of this fight' });
    const slots = within(gear).getAllByRole('listitem');
    expect(slots).toHaveLength(17);
    const worn = setupGear(config);
    worn.forEach((entry, i) => {
      if (entry === null) return;
      const item = db.items[entry.id]!;
      expect(slots[i]!.textContent).toContain(item.name);
      for (const g of entry.gems ?? []) if (g !== 0 && db.gems[g]) expect(slots[i]!.textContent).toContain(db.gems[g]!.name);
      if (entry.enchant !== undefined && db.enchants[entry.enchant]) expect(slots[i]!.textContent).toContain(db.enchants[entry.enchant]!.name);
    });
    expect(within(region()).getByRole('region', { name: 'Set bonuses' })).toBeTruthy();
    expect(within(region()).getByRole('region', { name: 'Stats at the pull' })).toBeTruthy();
    expect(within(region()).getByText(/This fight, before timed buffs/)).toBeTruthy();
  });

  it('the talents with their ranks, the buffs and consumables, the rotation and the fight settings', () => {
    const config = scenarios().raidLog!;
    const fight = fightOf(config, 4242);
    show(fight);
    const talents = within(region()).getByRole('list', { name: 'Talents of this fight' });
    const ranks = ranksOf(setupTalents(config));
    const bought = Object.values(ranks).filter((r) => r > 0).length;
    expect(bought).toBeGreaterThan(0);
    expect(within(talents).getAllByRole('listitem')).toHaveLength(bought);
    expect(talents.textContent).toMatch(/\d\/\d/);
    const buffs = within(region()).getByRole('list', { name: 'Buffs and consumables' });
    expect(within(buffs).getAllByRole('listitem')).toHaveLength(config.enabledBuffs.length);
    const priority = within(region()).getByRole('list', { name: 'Priority of this fight' });
    expect(within(priority).getAllByRole('listitem').length).toBe(fight.fight.spec.priority.filter((s) => !fight.fight.spec.spells.find((x) => x.id === s.spellId)?.item).length);
    const rules = within(region()).getByRole('list', { name: 'Item use rules' });
    expect(within(rules).getAllByRole('listitem').length).toBeGreaterThan(0);
    const settings = within(region()).getByRole('group', { name: 'Fight settings' });
    expect(settings.textContent).toContain(`${config.fightDurationSec} s`);
    expect(settings.textContent).toContain(`${config.distanceYd} yd`);
    expect(settings.textContent).toContain('4242');
  });

  it('the simulation’s rule fires, when known', () => {
    const fight = fightOf(scenarios().default!);
    const items = new Set(fight.fight.spec.spells.filter((s) => s.item).map((s) => s.id));
    const { rules } = ruleKeysOf(fight.fight.spec.priority, fight.fight.basic.itemActions);
    const rule = rules.find((r) => !items.has(fight.fight.spec.priority[r.step]!.spellId))!;
    show(fight, { fires: { [rule.key]: 12.34 } });
    expect(within(within(region()).getByRole('list', { name: 'Priority of this fight' })).getByText('12.3 per fight')).toBeTruthy();
  });

  it('while the item database loads: a loading state (asked for), not an error; the rest shows', () => {
    const { requestDb } = show(fightOf(scenarios().quagBloodgem!), { db: null, dbStatus: 'loading' });
    expect(within(region()).getByText('Loading the item database…')).toBeTruthy();
    expect(requestDb).toHaveBeenCalled();
    expect(within(region()).getByRole('list', { name: 'Talents of this fight' })).toBeTruthy();
    expect(within(region()).queryByRole('alert')).toBeNull();
  });

  it('"Use This Setup" asks first and says what is replaced; the current setup cannot be used again', () => {
    const fight = fightOf(scenarios().raidLog!);
    const { onUse } = show(fight);
    fireEvent.click(within(region()).getByRole('button', { name: 'Use This Setup…' }));
    const dialog = screen.getByRole('dialog', { name: 'Use This Fight’s Setup?' });
    expect(dialog.textContent).toMatch(/gear, talents, buffs, rotation and fight settings/);
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use This Setup' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    cleanup();
    show(fight, { current: fight.config });
    expect((within(region()).getByRole('button', { name: 'Use This Setup…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(region()).getByText('This is your current setup.')).toBeTruthy();
  });
});
