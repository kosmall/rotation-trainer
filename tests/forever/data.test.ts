import { describe, expect, it } from 'vitest';
import { loadParams, walkVerify, RAW_PARAMS } from '../../src/forever/data/load';

describe('data loader', () => {
  it('bane_per_rank is 0.1 and confirmed (no verify flag); unconfirmed Life Tap numbers are flagged', () => {
    expect(loadParams().bane_per_rank).toBe(0.1);
    const paths = walkVerify(RAW_PARAMS, 'params', []).map((i) => i.path);
    expect(paths).not.toContain('params.bane_per_rank');
    expect(paths).toContain('params.life_tap_spirit_coeff');
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
