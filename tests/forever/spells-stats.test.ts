import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { castMsOf, downrankFactor, getSpell, rankAt } from '../../src/forever/spells';
import { gcdMs, gcdWasteMs, hastedCastMs, lifeTapGain, mobAt, playerStatsFor, combatRegenPerSec } from '../../src/forever/stats';

const sb = getSpell('shadow_bolt');
const r1 = rankAt('shadow_bolt', 1, 40)!;
const r2 = rankAt('shadow_bolt', 2, 40)!;

describe('Shadow Bolt ranks and Bane', () => {
  it('rank 1 and 2 match the task', () => {
    expect([r1.castMs, r1.mana, r1.min, r1.max]).toEqual([1700, 25, 12, 16]);
    expect([r2.castMs, r2.mana, r2.min, r2.max]).toEqual([2200, 40, 22, 27]);
  });
  it('rank 1 cast is 1.7 s without Bane, 1.2 s with Bane 5/5 at 0.1 s per rank', () => {
    const p = loadParams();
    expect(castMsOf(sb, r1, 0, p)).toBe(1700);
    expect(castMsOf(sb, r1, 5, p)).toBe(1200);
    expect(castMsOf(sb, r1, 2, p)).toBe(1500);
  });
  it('Bane 5/5 at 0.2 s per rank gives 0.7 s and never drops below the 0.5 s floor', () => {
    const p = loadParams({ bane_per_rank: 0.2 });
    expect(castMsOf(sb, r1, 5, p)).toBe(700);
    expect(castMsOf(sb, r2, 5, p)).toBe(1200);
    expect(castMsOf(sb, r1, 5, loadParams({ bane_per_rank: 0.5 }))).toBe(500);
  });
  it('Bane 5/5 on rank 2 at 0.1 s per rank is 1.7 s', () => {
    expect(castMsOf(sb, r2, 5, loadParams())).toBe(1700);
  });
  it('Bane does not touch Wrack or Corruption', () => {
    const p = loadParams();
    expect(castMsOf(getSpell('corruption'), rankAt('corruption', 'max', 40)!, 5, p)).toBe(2000);
  });
  it('max rank follows the level', () => {
    expect(rankAt('shadow_bolt', 'max', 40)!.rank).toBe(6);
    expect(rankAt('shadow_bolt', 'max', 52)!.rank).toBe(8);
    expect(rankAt('shadow_bolt', 'max', 59)!.rank).toBe(8);
    expect(rankAt('corruption', 'max', 3)).toBeUndefined();
  });
});

describe('downrank penalty model', () => {
  it('none is 1, classic < 1 below level 20, partial strictly between', () => {
    expect(downrankFactor('none', 1)).toBe(1);
    expect(downrankFactor('classic', 1)).toBeCloseTo(1 - 19 * 0.0375, 6);
    const partial = downrankFactor('partial', 1);
    expect(partial).toBeGreaterThan(downrankFactor('classic', 1));
    expect(partial).toBeLessThan(1);
    expect(downrankFactor('classic', 20)).toBe(1);
  });
});

describe('GCD, haste and wasted cast time', () => {
  it('GCD ignores haste by default and follows it when enabled', () => {
    expect(gcdMs(20, loadParams())).toBe(1500);
    expect(gcdMs(20, loadParams({ haste_shortens_gcd: true }))).toBe(1250);
    expect(gcdMs(100, loadParams({ haste_shortens_gcd: true }))).toBe(1000);
  });
  it('a 1.2 s cast wastes 0.3 s of the GCD; casts at or above the GCD waste nothing', () => {
    expect(gcdWasteMs(1200, 1500)).toBe(300);
    expect(gcdWasteMs(1500, 1500)).toBe(0);
    expect(gcdWasteMs(3000, 1500)).toBe(0);
    expect(gcdWasteMs(0, 1500)).toBe(0);
  });
  it('haste shortens cast times', () => {
    expect(hastedCastMs(3000, 50)).toBe(2000);
  });
});

describe('stats and Life Tap', () => {
  it('Life Tap scales with Spirit and Improved Life Tap', () => {
    const p = loadParams();
    expect(lifeTapGain(220, 100, {}, p)).toBeGreaterThan(lifeTapGain(220, 50, {}, p));
    expect(lifeTapGain(220, 100, { improved_life_tap: 2 }, p)).toBeGreaterThan(lifeTapGain(220, 100, {}, p));
  });
  it('better gear profiles have more spell power and mana', () => {
    const q = playerStatsFor(50, 'quest', {});
    const g = playerStatsFor(50, 'good', {});
    expect(g.spellPower).toBeGreaterThan(q.spellPower);
    expect(g.maxMana).toBeGreaterThan(q.maxMana);
  });
  it('mobs get tougher with level and clamp outside the table', () => {
    expect(mobAt(50).hp).toBeGreaterThan(mobAt(40).hp);
    expect(mobAt(41).hp).toBeGreaterThan(mobAt(40).hp);
    expect(mobAt(10).hp).toBe(mobAt(38).hp);
  });
  it('Soul Harvest lifts regen to 100% of base while casting', () => {
    const p = loadParams();
    expect(combatRegenPerSec(100, p, 0)).toBe(0);
    expect(combatRegenPerSec(100, p, 1)).toBeCloseTo(100 * p.spirit_regen_per_spirit * 2, 6);
  });
});
