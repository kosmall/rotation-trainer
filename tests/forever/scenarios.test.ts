import { describe, expect, it } from 'vitest';
import { loadOrder, loadVariant, SCENARIOS, SCENARIO_IDS, VARIANT_IDS } from '../../src/forever/builds';
import { validatePicks } from '../../src/forever/talents';
import { DEFAULT_SETTINGS, runJob } from '../../src/forever/web/api';

describe('guide scenarios', () => {
  it('every scenario is a legal 51-point order with a known pet and sources', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(15);
    for (const s of SCENARIOS) {
      const picks = loadOrder(s.order);
      expect(picks, s.id).toHaveLength(51);
      expect(validatePicks(picks).ok, `${s.id}: ${validatePicks(picks).errors.join('; ')}`).toBe(true);
      expect(s.source).toMatch(/^https:\/\//);
      expect(loadVariant(s.id).pet).toBe(s.pet);
    }
    expect(new Set(SCENARIO_IDS).size).toBe(SCENARIO_IDS.length);
    expect(SCENARIO_IDS.some((id) => VARIANT_IDS.includes(id))).toBe(false);
  });
  it('includes Felhunter variants', () => {
    expect(SCENARIOS.filter((s) => s.pet === 'felhunter').length).toBeGreaterThanOrEqual(4);
  });
  it('the Handbook drain tank order equals the built-in AFF_DRAINTANK and scores the same', () => {
    expect(loadOrder('HB_AFF')).toEqual(loadOrder('AFF_DRAINTANK'));
    const r = runJob({ kind: 'ranking', settings: { ...DEFAULT_SETTINGS, level: 50, sessions: 8 }, scenarios: true });
    if (r.kind !== 'ranking') throw new Error('kind');
    expect(r.rows).toHaveLength(VARIANT_IDS.length + SCENARIO_IDS.length);
    const k = (id: string) => r.rows.find((x) => x.metrics.variant === id)?.metrics.killsPerHour;
    expect(k('HB_AFF_VW')).toBe(k('AFF_DRAINTANK'));
  });
});
