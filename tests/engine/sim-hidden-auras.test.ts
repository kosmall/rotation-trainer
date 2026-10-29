import { describe, expect, it } from 'vitest';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { AuraDef, SpecHooks } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec, pumpProcHooks } from '../fixtures/testSpec';

// Task 12b: `AuraDef.hidden` (set-proc internal cooldown markers). A hidden aura is left out of
// snapshot().selfAuras / targetAuras, but it is applied, tracked (hasSelfAura/hasTargetAura),
// keeps its effects and is logged like any other aura.

function newSim(spec: SpecData): Simulation {
  return new Simulation({ spec, target: TEST_TARGET, seed: 1, infiniteMana: true, spellQueueWindowMs: 0 });
}

/** The fixture with the given auras marked hidden. */
function withHidden(ids: string[], overrides: Partial<SpecData> = {}): SpecData {
  const base = makeTestSpec();
  const auras: AuraDef[] = base.auras.map((a) => (ids.includes(a.id) ? { ...a, hidden: true } : a));
  return makeTestSpec({ auras, ...overrides });
}

/** The fixture with the pumpProcHooks set bonus (procs `pumped` + `icd`) active. */
function procSetOverrides(): Partial<SpecData> {
  return {
    sets: [{ setId: 'proc-set', name: 'Proc Set 2', pieces: 2, description: 'Procs pumped.', hooks: pumpProcHooks() }],
    setup: { ...makeTestSpec().setup, setPieces: { 'proc-set': 2 } },
  };
}

describe('hidden auras', () => {
  it('a hidden self aura is omitted from snapshot().selfAuras while a visible one is listed', () => {
    const sim = newSim(withHidden(['icd'], procSetOverrides()));
    sim.cast('scaled');
    expect(Object.keys(sim.snapshot().selfAuras)).toEqual(['pumped']);
  });

  it('without the flag the same aura is listed (the flag is what hides it)', () => {
    const sim = newSim(makeTestSpec(procSetOverrides()));
    sim.cast('scaled');
    expect(Object.keys(sim.snapshot().selfAuras).sort()).toEqual(['icd', 'pumped']);
  });

  it('a hidden self aura still exists for hasSelfAura: the internal cooldown blocks procs', () => {
    const seen: boolean[] = [];
    const probe: SpecHooks = {
      onSpellResolved(_e, api) {
        seen.push(api.hasSelfAura('icd'));
      },
    };
    const spec = withHidden(['icd'], { ...procSetOverrides(), hooks: probe });
    const sim = newSim(spec);
    for (let t = 0; t <= 6000; t += 1000) {
      sim.advanceTo(t);
      sim.cast('scaled');
    }
    // The spec hook runs before the set hook: at 0 no icd yet; 1000-4000 icd up; at 5000 the
    // icd has expired (the set hook re-procs right after); 6000 icd up again.
    expect(seen).toEqual([false, true, true, true, true, false, true]);
    const applies = sim.log().filter((e) => e.type === 'aura-apply' && e.auraId === 'pumped').map((e) => e.atMs);
    expect(applies).toEqual([0, 5000]);
  });

  it('a hidden aura is still logged (aura-apply and aura-fade)', () => {
    const sim = newSim(withHidden(['icd'], procSetOverrides()));
    sim.cast('scaled');
    sim.advanceTo(6000);
    const icdLog = sim
      .log()
      .filter((e) => e.auraId === 'icd')
      .map((e) => [e.type, e.atMs]);
    expect(icdLog).toEqual([
      ['aura-apply', 0],
      ['aura-fade', 5000],
    ]);
  });

  it('a hidden self aura keeps its stat effect', () => {
    const sim = newSim(withHidden(['pumped']));
    sim.cast('pump');
    expect(sim.snapshot().selfAuras).toEqual({});
    sim.cast('scaled');
    const dmg = sim.log().filter((e) => e.type === 'damage' && e.spellId === 'scaled').map((e) => e.amount);
    expect(dmg).toEqual([100]);
  });

  it('a hidden target aura is omitted from snapshot().targetAuras but still ticks and satisfies requirements', () => {
    const sim = newSim(withHidden(['dotAura']));
    sim.cast('dot');
    expect(sim.snapshot().targetAuras).toEqual({});
    sim.advanceTo(2000);
    expect(sim.log().filter((e) => e.type === 'tick').map((e) => [e.atMs, e.amount])).toEqual([[2000, 100]]);
    expect(sim.cast('needy')).toEqual({ ok: true });
  });

  it('a visible target aura is still listed next to a hidden one', () => {
    const sim = newSim(withHidden(['dotAura']));
    sim.cast('dot');
    sim.advanceTo(1500);
    sim.cast('curse');
    expect(Object.keys(sim.snapshot().targetAuras)).toEqual(['weak']);
  });
});
