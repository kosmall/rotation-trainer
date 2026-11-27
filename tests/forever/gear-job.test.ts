import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MY_GEAR, normalizeSettings, runJob, type RankingResult } from '../../src/forever/web/api';
import type { GearTotals } from '../../src/forever/web/gear';
import { playerStatsFor, registerGearProfile } from '../../src/forever/stats';

const TOTALS: GearTotals = { stamina: 39, intellect: 37, spirit: 15, armor: 200, spellPower: 55, shadowSpellPower: 0, critPct: 5, hitPct: 0 };
const settings = { ...DEFAULT_SETTINGS, level: 40, sessions: 5, profile: MY_GEAR };
const best = (gear: GearTotals | undefined): number => (runJob({ kind: 'ranking', settings, ...(gear ? { gear } : {}) }) as RankingResult).rows[0]!.metrics.killsPerHour;

describe('my gear in the simulation', () => {
  it('is a valid profile and the stats read the totals', () => {
    expect(normalizeSettings({ profile: MY_GEAR }).profile).toBe(MY_GEAR);
    registerGearProfile(TOTALS);
    const s = playerStatsFor(40, MY_GEAR, {});
    expect(s.spellPower).toBe(55);
    expect(s.critPct).toBe(5);
    expect(s.spirit).toBeGreaterThan(15);
  });
  it('a ranking with my gear differs from the average profile', () => {
    const mine = runJob({ kind: 'ranking', settings, gear: TOTALS }) as RankingResult;
    const avg = runJob({ kind: 'ranking', settings: { ...settings, profile: 'average' } }) as RankingResult;
    expect(mine.rows[0]!.metrics.profile).toBe(MY_GEAR);
    expect(mine.rows[0]!.metrics.killsPerHour).not.toBe(avg.rows[0]!.metrics.killsPerHour);
  });
  it('Shadow spell power from items helps shadow spells', () => {
    expect(best({ ...TOTALS, shadowSpellPower: 400 })).toBeGreaterThan(best(TOTALS));
  });
  it('my gear without totals is an error', () => {
    expect(() => runJob({ kind: 'ranking', settings })).toThrow(/gear/i);
  });
});
