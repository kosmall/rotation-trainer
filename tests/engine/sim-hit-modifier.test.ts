// SpellModifier.hitPctDelta (stage 2b Task 3, for Suppression): a per-spell hit chance bonus, folded
// like critPctDelta and added to the caster's hit before the target's miss floor.

import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { SpellModifier, TargetData } from '../../src/engine/types';
import { makeTestSpec } from '../fixtures/testSpec';

/** Every spell misses (100% base miss) unless hit brings it down; floor 0 or `floor`. */
const target = (floor = 0): TargetData => ({ missPct: 100, minMissPct: floor, levelResistMult: 1, armor: 0 });

function outcome(modifiers: SpellModifier[], spellId: string, floor = 0) {
  const spec: SpecData = makeTestSpec({ modifiers });
  const sim = new Simulation({ spec, target: target(floor), seed: 1, infiniteMana: true });
  sim.cast(spellId);
  const e = sim.log().find((x) => (x.type === 'miss' || x.type === 'damage') && x.spellId === spellId);
  return e?.type;
}

describe('SpellModifier.hitPctDelta', () => {
  it('without it nothing changes: the spell misses', () => {
    expect(outcome([], 'zap')).toBe('miss');
  });

  it('adds to the hit chance of matching spells only', () => {
    expect(outcome([{ spellIds: ['zap'], hitPctDelta: 100 }], 'zap')).toBe('damage');
    expect(outcome([{ spellIds: ['bolt'], hitPctDelta: 100 }], 'zap')).toBe('miss');
    expect(outcome([{ schools: ['fire'], hitPctDelta: 100 }], 'zap')).toBe('miss');
    expect(outcome([{ schools: ['shadow'], hitPctDelta: 100 }], 'zap')).toBe('damage');
  });

  it('deltas of several modifiers are summed', () => {
    // 100 - 100 = 0 extra hit: still a certain miss; 50 + 50: a certain hit.
    expect(outcome([{ spellIds: ['zap'], hitPctDelta: 100 }, { schools: ['shadow'], hitPctDelta: -100 }], 'zap')).toBe('miss');
    expect(outcome([{ spellIds: ['zap'], hitPctDelta: 50 }, { schools: ['shadow'], hitPctDelta: 50 }], 'zap')).toBe('damage');
  });

  it("never goes below the target's minimum miss chance (the hit cap)", () => {
    expect(outcome([{ spellIds: ['zap'], hitPctDelta: 1000 }], 'zap', 100)).toBe('miss');
  });
});
