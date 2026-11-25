import { describe, expect, it } from 'vitest';
import { loadParams, walkVerify, RAW_PARAMS } from '../../src/forever/data/load';

describe('data loader', () => {
  it('bane_per_rank defaults to 0.1 and is flagged verify', () => {
    expect(loadParams().bane_per_rank).toBe(0.1);
    const items = walkVerify(RAW_PARAMS, 'params', []);
    expect(items.map((i) => i.path)).toContain('params.bane_per_rank');
  });
  it('overrides win', () => {
    expect(loadParams({ bane_per_rank: 0.2 }).bane_per_rank).toBe(0.2);
  });
  it('every verify node carries a non-empty source', () => {
    for (const i of walkVerify(RAW_PARAMS, 'params', [])) expect(i.source.length, i.path).toBeGreaterThan(5);
  });
  it('GCD is 1500 ms and haste does not shorten it by default', () => {
    const p = loadParams();
    expect(p.gcd_ms).toBe(1500);
    expect(p.haste_shortens_gcd).toBe(false);
  });
});
