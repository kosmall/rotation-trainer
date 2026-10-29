// Engine fields added for Task 12a talent data: SpellModifier.coeffDelta (Shadow and Flame) and
// damageTakenMult.directOnly (Improved Shadow Bolt charges are spent by non-periodic damage only).

import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, SpellDef, SpellModifier } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

function newSim(spec: SpecData): Simulation {
  return new Simulation({ spec, target: TEST_TARGET, seed: 1, infiniteMana: true });
}

/** The fixture with 100 shadow power and the given modifiers. */
function powered(modifiers: SpellModifier[]): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    modifiers,
    setup: { ...base.setup, stats: { ...base.setup.stats, shadowPower: 100 } },
  });
}

describe('SpellModifier.coeffDelta', () => {
  it('adds to the direct spell power coefficient of matching spells only', () => {
    // scaled: direct 0..0, coeff 1, shadow -> deals exactly 1.0 x power without modifiers.
    const plain = newSim(powered([]));
    plain.cast('scaled');
    const boosted = newSim(powered([{ spellIds: ['scaled'], coeffDelta: 0.5 }, { spellIds: ['bolt'], coeffDelta: 9 }]));
    boosted.cast('scaled');
    const damage = (s: Simulation) => s.log().find((e) => e.type === 'damage')?.amount;
    expect(damage(plain)).toBe(100);
    expect(damage(boosted)).toBe(150);
  });

  it('deltas from several modifiers are summed', () => {
    const sim = newSim(powered([{ spellIds: ['scaled'], coeffDelta: 0.25 }, { schools: ['shadow'], coeffDelta: 0.25 }]));
    sim.cast('scaled');
    expect(sim.log().find((e) => e.type === 'damage')?.amount).toBe(150);
  });

  it('does not change DoT ticks (their coefficient is AuraDef.tick.coeffTotal)', () => {
    const base = makeTestSpec();
    const spec = makeTestSpec({
      modifiers: [{ spellIds: ['dot'], coeffDelta: 1 }],
      auras: base.auras.map((a) =>
        a.id === 'dotAura' && a.tick ? { ...a, tick: { ...a.tick, coeffTotal: 0.3 } } : a,
      ),
      setup: { ...base.setup, stats: { ...base.setup.stats, shadowPower: 100 } },
    });
    const sim = newSim(spec);
    sim.cast('dot');
    sim.advanceTo(10000);
    // (300 + 0.3 * 100) / 3 = 110 per tick, unaffected by coeffDelta.
    expect(sim.log().filter((e) => e.type === 'tick').map((e) => e.amount)).toEqual([110, 110, 110]);
  });
});

describe('damageTakenMult.directOnly', () => {
  /** curse applies procAura (2 charges, shadow x1.2); with directOnly ticks do not spend charges. */
  function procCurseSpec(directOnly: boolean): SpecData {
    const base = makeTestSpec();
    const spells: SpellDef[] = base.spells.map((s) =>
      s.id === 'curse' ? { ...s, applyAura: { auraId: 'procAura', on: 'target' } } : s,
    );
    const auras: AuraDef[] = base.auras.map((a) =>
      a.id === 'procAura' && a.damageTakenMult
        ? { ...a, damageTakenMult: { ...a.damageTakenMult, directOnly } }
        : a,
    );
    return makeTestSpec({ spells, auras });
  }

  function play(directOnly: boolean) {
    const sim = newSim(procCurseSpec(directOnly));
    sim.cast('curse'); // 0: procAura, 2 charges
    sim.advanceTo(1500);
    sim.cast('dot'); // 1500: ticks at 3500, 5500, 7500
    sim.advanceTo(4000);
    const chargesAfterFirstTick = sim.snapshot().targetAuras.procAura?.charges;
    sim.cast('zap'); // 4000: direct hit
    sim.advanceTo(13000);
    return {
      chargesAfterFirstTick,
      ticks: sim.log().filter((e) => e.type === 'tick').map((e) => [e.atMs, e.amount]),
      zap: sim.log().find((e) => e.type === 'damage' && e.spellId === 'zap')?.amount,
      fades: sim.log().filter((e) => e.type === 'aura-fade' && e.auraId === 'procAura').map((e) => e.atMs),
    };
  }

  it('ticks are multiplied but spend no charge; direct hits spend charges', () => {
    expect(play(true)).toEqual({
      chargesAfterFirstTick: 2,
      ticks: [
        [3500, 120],
        [5500, 120],
        [7500, 120],
      ],
      zap: 60,
      fades: [12000],
    });
  });

  it('without directOnly the ticks spend the charges (unchanged default)', () => {
    expect(play(false)).toEqual({
      chargesAfterFirstTick: 1,
      ticks: [
        [3500, 120],
        [5500, 100],
        [7500, 100],
      ],
      zap: 60,
      fades: [4000],
    });
  });
});
