// Scenarios whose bot fights must stay byte-identical when the bot or the engine gets faster
// (simulator Task 2 performance wave). The reference (bot-perf-reference-data.ts) was captured with
// the 10 ms stepping bot at 90040d6, before any performance change, with `botReference`
// (item-use-reference.ts): per scenario and spell queue window (400, 0) the mean DPS over seeds
// 1-10 and per seed [hash of the JSON log, log length, RNG draws].

import { ROTATION_PRESETS } from '../../src/data/classes/warlock/rotation';
import { GEAR_PRESETS } from '../../src/data/classes/warlock/gearPresets';
import type { ItemDb } from '../../src/data/items/types';
import { DEFAULT_SETUP, setupCatalogFor } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { scenarios } from './item-use-reference';

const base = (): SetupConfig => structuredClone(DEFAULT_SETUP) as SetupConfig;
const heroismAt = (startSec: number) => ({ ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec, durationSec: 40 } });

/** Every scenario: Task 1's seven, every gear preset with its item effects, rotations and item rules. */
export function perfScenarios(db: ItemDb): Record<string, SetupConfig> {
  const out: Record<string, SetupConfig> = { ...scenarios() };
  for (const p of GEAR_PRESETS) {
    const gear = structuredClone(p.gear) as SetupConfig['gear'];
    const itemIds = setupCatalogFor(gear!, db)
      .filter((b) => b.group === 'item')
      .map((b) => b.id);
    out[`gear-${p.id}`] = {
      ...base(),
      gear,
      gearPresetId: p.id,
      enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune', ...itemIds],
      timed: heroismAt(10),
    };
  }
  out.sbSpam = { ...base(), rotation: { ...ROTATION_PRESETS['sb-spam'].config } };
  out.sbSpam300 = { ...base(), rotation: { ...ROTATION_PRESETS['sb-spam'].config }, fightDurationSec: 300, distanceYd: 0 };
  out.noLifeTapAuto = { ...base(), rotation: { ...ROTATION_PRESETS.dot.config, lifeTapBelowMana: 2000 }, distanceYd: 40 };
  out.rules = {
    ...base(),
    enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370', 'item:29305'],
    timed: heroismAt(20),
    fightDurationSec: 300,
    rotation: {
      ...ROTATION_PRESETS.dot.config,
      itemUse: {
        'destruction-potion': { trigger: { kind: 'at', sec: 30 } },
        'super-mana-potion': { trigger: { kind: 'mana-below', mana: 4000 }, notBeforeSec: 150 },
        'dark-rune': { trigger: { kind: 'fight-end', lastSec: 200 } },
        'item:29370': { trigger: { kind: 'with-buff', auraId: 'destruction-potion' } },
      },
      itemUseOrder: ['dark-rune', 'item:29370'],
    },
  };
  out.rulesPull = {
    ...base(),
    enabledBuffs: ['destruction-potion', 'dark-rune', 'item:29370'],
    rotation: {
      ...ROTATION_PRESETS.dot.config,
      itemUse: {
        'destruction-potion': { trigger: { kind: 'pull' } },
        'item:29370': { trigger: { kind: 'ready' }, notBeforeSec: 5, notAfterSec: 50, minGapSec: 30 },
        'dark-rune': { trigger: { kind: 'never' } },
      },
    },
  };
  out.short10 = { ...base(), fightDurationSec: 10 };
  out.quag300 = { ...scenarios().quagBloodgem!, fightDurationSec: 300 };
  return out;
}

/**
 * The bot before the performance wave (src/bot/bot.ts at 90040d6), copied literally: one snapshot
 * and one walk of the priority every `stepMs` of fight time. The reference the fast bot must equal.
 */
export function steppingRunBot(
  sim: import('../../src/engine/sim').Simulation,
  priority: readonly import('../../src/data/types').PriorityStep[],
  stepMs = 10,
): { dps: number; damageTotal: number } {
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new RangeError(`runBot needs a positive stepMs, got ${stepMs}`);
  for (let s = sim.snapshot(); s.phase !== 'ended'; s = sim.snapshot()) {
    for (const step of priority) {
      if (step.when && !step.when(s)) continue;
      if (step.spellId === s.queuedSpellId) break;
      if (sim.cast(step.spellId).ok) break;
    }
    if (sim.snapshot().phase === 'ready') {
      throw new Error('runBot: no priority step can start the fight (every cast was rejected in ready)');
    }
    sim.advanceTo(s.nowMs + stepMs);
  }
  const { dps, damageTotal } = sim.snapshot();
  return { dps, damageTotal };
}
