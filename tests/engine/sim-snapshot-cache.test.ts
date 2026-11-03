// The per-spell snapshot cache (simulator Task 2 performance wave, sim.ts `spellViews`) must never
// serve stale values: at every ms of a fight whose stats and modifiers change all the time
// (Heroism, a haste proc trinket, a Backlash-style instant-cast aura, Destruction Potion), each
// snapshot's `spells` equals an uncached recomputation from the live stats and modifiers.

import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock } from '../../src/data/classes/warlock/destruction';
import type { SpecData } from '../../src/data/types';
import { itemDbSync } from '../../src/data/items/dbSync';
import { BOSS_TARGET } from '../../src/data/common/target';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, SpellDef } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { quagBloodgemGear } from '../fixtures/item-use-reference';
import { steppingRunBot } from '../fixtures/bot-perf-scenarios';

const db = itemDbSync();

/** A Backlash-style self aura: Shadow Bolt and Incinerate instant, Shadow Bolt 20% cheaper. */
const BACKLASH: AuraDef = {
  id: 'test-backlash',
  name: 'Backlash (test)',
  icon: 'spell_fire_playingwithfire',
  durationMs: 3000,
  selfModifiers: [
    { spellIds: ['shadow-bolt', 'incinerate'], castTimeMsDelta: -3000 },
    { spellIds: ['shadow-bolt'], manaCostMult: 0.8 },
  ],
};

describe('snapshot spell cache', () => {
  it('equals an uncached recomputation at every ms of a fight with Heroism, a haste proc and a Backlash-style aura', () => {
    const config: SetupConfig = {
      ...structuredClone(DEFAULT_SETUP),
      gear: quagBloodgemGear(),
      enabledBuffs: ['heroism', 'destruction-potion', 'item:27683', 'item:29132'],
      timed: { heroism: { startSec: 7, durationSec: 15 } },
      fightDurationSec: 45,
    };
    const applied = applySetup({
      buildSpec: (w, g) => (g === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, g, db)),
      catalog: SETUP_CATALOG,
      config,
      db,
    });
    const spec: SpecData = { ...applied.spec, auras: [...applied.spec.auras, BACKLASH] };
    const backlashAt = [3000, 3001, 11500, 19000, 26000, 33333];
    const sim = new Simulation({
      spec,
      target: BOSS_TARGET,
      seed: 5,
      spellQueueWindowMs: 400,
      distanceFromTarget: applied.sim.distanceFromTarget,
      scheduledAuras: [...applied.sim.scheduledAuras, ...backlashAt.map((atMs) => ({ auraId: BACKLASH.id, on: 'self' as const, atMs }))],
      durationMs: applied.sim.durationMs,
    });
    const priv = sim as unknown as { manaCost(s: SpellDef): number; castTimeMs(s: SpellDef): number };
    const seenBolt = new Set<string>();
    let checks = 0;
    const realSnapshot = sim.snapshot.bind(sim);
    sim.snapshot = () => {
      const s = realSnapshot();
      for (const spell of spec.spells) {
        const fresh = { manaCost: priv.manaCost(spell), castTimeMs: priv.castTimeMs(spell) };
        if (s.spells[spell.id]?.manaCost !== fresh.manaCost || s.spells[spell.id]?.castTimeMs !== fresh.castTimeMs) {
          throw new Error(`stale ${spell.id} at ${s.nowMs}: ${JSON.stringify(s.spells[spell.id])} vs ${JSON.stringify(fresh)}`);
        }
      }
      seenBolt.add(JSON.stringify(s.spells['shadow-bolt']));
      checks++;
      return s;
    };
    steppingRunBot(sim, spec.priority, 1);
    expect(checks).toBeGreaterThan(45000);
    // The scenario really moves the values: base, Heroism, the proc, Backlash and combinations.
    expect(seenBolt.size).toBeGreaterThanOrEqual(5);
    const log = sim.log();
    expect(log.some((e) => e.type === 'aura-apply' && e.auraId === BACKLASH.id)).toBe(true);
    expect(log.some((e) => e.type === 'aura-apply' && e.auraId === 'heroism')).toBe(true);
    expect(log.some((e) => e.type === 'aura-apply' && String(e.auraId).startsWith('item-buff:'))).toBe(true);
  }, 60000);
});
