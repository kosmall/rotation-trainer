import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { runCell } from '../../src/forever/runner';
import { playerStatsFor } from '../../src/forever/stats';

describe('stat delta in player stats', () => {
  const base = playerStatsFor(50, 'average', {});
  it('an empty delta changes nothing', () => {
    expect(playerStatsFor(50, 'average', {}, {})).toEqual(base);
  });
  it('spell power is added exactly', () => {
    const s = playerStatsFor(50, 'average', {}, { spellPower: 40 });
    expect(s.spellPower).toBe(base.spellPower + 40);
    expect({ ...s, spellPower: 0 }).toEqual({ ...base, spellPower: 0 });
  });
  it('intellect is added before the mana conversion', () => {
    const s = playerStatsFor(50, 'average', {}, { intellect: 40 });
    expect(s.intellect).toBe(base.intellect + 40);
    expect(Math.abs(s.maxMana - base.maxMana - 40 * 15 * 1.05)).toBeLessThanOrEqual(1);
  });
  it('stamina is added before Demonic Embrace', () => {
    const ranks = { demonic_embrace: 5 };
    const b = playerStatsFor(50, 'average', ranks);
    const s = playerStatsFor(50, 'average', ranks, { stamina: 40 });
    expect(s.stamina).toBeCloseTo(b.stamina + 40 * 1.15, 9);
  });
  it('spirit, crit and hit are added exactly', () => {
    expect(playerStatsFor(50, 'average', {}, { spirit: 40 }).spirit).toBe(base.spirit + 40);
    expect(playerStatsFor(50, 'average', {}, { critPct: 3 }).critPct).toBe(base.critPct + 3);
    expect(playerStatsFor(50, 'average', {}, { hitPct: 3 }).hitPct).toBe(base.hitPct + 3);
  });
});

describe('stat delta in a cell', () => {
  // Curse of the Elements off: its mana makes AFF_WRACK die now and then, and one death outweighs 40 spell power in a sample this small.
  const cfg = { variant: loadVariant('AFF_WRACK'), level: 50, profile: 'average', params: loadParams({ session_pulls: 8, use_curse_of_elements: false }) };
  it('an empty delta gives identical metrics, spell power shortens the kill', () => {
    const none = runCell(cfg, 12, 1).metrics;
    expect(runCell({ ...cfg, statDelta: {} }, 12, 1).metrics).toEqual(none);
    expect(runCell({ ...cfg, statDelta: { spellPower: 40 } }, 12, 1).metrics.ttkMean).toBeLessThan(none.ttkMean);
  });
});
