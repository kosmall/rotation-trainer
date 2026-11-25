import { describe, expect, it } from 'vitest';
import { loadOrder, loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { optimizeBuild, toRuns } from '../../src/forever/optimizer';
import { validatePicks } from '../../src/forever/talents';

const template = loadVariant('DEMO_PACT_R1');
const core = loadOrder('DEMO_PACT_BANE2').slice(0, 31);
const opts = { template, core, toLevel: 43, profile: 'average', sessions: 4, seed: 1, params: loadParams({ session_pulls: 6 }) };

describe('optimizer', () => {
  const res = optimizeBuild(opts);
  it('keeps the core, fills up to the level, and is legal', () => {
    expect(res.order.slice(0, 31)).toEqual(core);
    expect(res.order).toHaveLength(34);
    expect(validatePicks(res.order).ok).toBe(true);
    expect(res.steps.map((s) => s.level)).toEqual([41, 42, 43]);
  });
  it('is deterministic for a fixed seed', () => {
    expect(optimizeBuild(opts).order).toEqual(res.order);
  });
  it('only picks modelled talents', () => {
    for (const s of res.steps) expect(['bane_of_havoc', 'incinerate', 'conflagrate']).not.toContain(s.pick);
  });
  it('compresses runs', () => {
    expect(toRuns(['a', 'a', 'b', 'a'])).toEqual([['a', 2], ['b', 1], ['a', 1]]);
  });
});
