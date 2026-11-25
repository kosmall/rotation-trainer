import { describe, expect, it } from 'vitest';
import { VARIANT_IDS } from '../../src/forever/builds';
import { DEFAULT_AXES, renderSensitivity, sensitivity } from '../../src/forever/sensitivity';
import { collectVerify } from '../../src/forever/verify';

const small = { levels: [45, 55], profile: 'average', sessions: 4, seed: 1, baseParams: { session_pulls: 6 } };

describe('sensitivity', () => {
  it('the base value of an axis never changes the winner; the ranking lists all builds', () => {
    const rep = sensitivity({ ...small, axes: [{ param: 'bane_per_rank', values: [0.1], note: 'base' }] });
    expect(rep.rows[0]!.winnerChangedAt).toEqual([]);
    expect(rep.rows[0]!.ranking[45]).toHaveLength(VARIANT_IDS.length);
    expect(rep.winnerFlippers).toEqual([]);
  });
  it('an extreme value is reported when it flips the winner; the table renders', () => {
    const rep = sensitivity({ ...small, builds: ['AFF_WRACK', 'DEMO_PACT_R1'], axes: [{ param: 'mob_dmg_mult', values: [1, 40], note: 'x' }] });
    const text = renderSensitivity(rep);
    expect(text).toContain('| mob_dmg_mult | 40 |');
    expect(text).toContain('Base winners');
  });
  it('the default axes cover the verify list of the task', () => {
    const params = new Set(DEFAULT_AXES.map((a) => a.param));
    for (const p of ['downrank_penalty_model', 'bane_per_rank', 'sb_r1_coeff_mult', 'sb_r2_coeff_mult', 'mob_hp_mult', 'brand_scale', 'brand_mult']) expect(params.has(p as never)).toBe(true);
  });
  it('every default axis parameter is a registered verify assumption or a documented rule', () => {
    const names = new Set(collectVerify().map((a) => a.name));
    for (const a of DEFAULT_AXES) if (a.param !== 'mobs_per_pull') expect(names.has(a.param), a.param).toBe(true);
  });
});
