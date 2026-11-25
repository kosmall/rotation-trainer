import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { castMsOf, downrankFactor, getSpell, rankAt } from '../../src/forever/spells';
import { gcdMs, gcdWasteMs, hastedCastMs, lifeTapGain, mobAt, playerStatsFor, combatRegenPerSec, spiritManaRegenPerSec, healthRegenPerSec, healthFromStamina, manaFromIntellect, petBaseAt, demonArmorOf, maxHealthOf, maxManaOf, manaBaseOffset } from '../../src/forever/stats';

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
  it('GCD follows haste by default and ignores it when disabled', () => {
    expect(gcdMs(0, loadParams())).toBe(1500);
    expect(gcdMs(20, loadParams())).toBe(1250);
    expect(gcdMs(20, loadParams({ haste_shortens_gcd: false }))).toBe(1500);
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
    expect(mobAt(10).hp).toBe(mobAt(20).hp);
  });
  it('Soul Harvest lifts regen to 100% of base while casting', () => {
    const p = loadParams();
    expect(combatRegenPerSec(100, p, 0)).toBe(0);
    expect(combatRegenPerSec(100, p, 1)).toBeCloseTo(spiritManaRegenPerSec(100) * 2, 6);
  });
});

describe('Improved Corruption', () => {
  it('5/5 makes Corruption instant; 3/5 leaves 0.8 s', () => {
    const p = loadParams();
    const c = getSpell('corruption');
    const r = rankAt('corruption', 'max', 50)!;
    expect(castMsOf(c, r, 0, p, 2000)).toBe(0);
    expect(castMsOf(c, r, 0, p, 1200)).toBe(800);
  });
});

describe('Classic base data and formulas (cmangos)', () => {
  it('Classic Stamina and Intellect conversion: first 20 points give 1, then 10 health and 15 mana', () => {
    expect(healthFromStamina(20)).toBe(20);
    expect(healthFromStamina(45)).toBe(20 + 250);
    expect(manaFromIntellect(79)).toBe(20 + 59 * 15);
  });
  it('Classic warlock regeneration: mana (Spirit/5 + 15) per 2 s, health (Spirit x 0.12 + 1.5) per 2 s', () => {
    expect(spiritManaRegenPerSec(75)).toBeCloseTo(15, 6);
    expect(healthRegenPerSec(75)).toBeCloseTo(5.25, 6);
  });
  it('level 1 measured in game: gnome (Sta 20, Int 25) 43 health and 194 mana; human (Sta 21, Int 22) 53 health and 140 mana', () => {
    expect(maxHealthOf(1, 20)).toBe(43);
    expect(maxHealthOf(1, 21)).toBe(53);
    expect(maxManaOf(1, 25, 1.05)).toBe(194);
    expect(maxManaOf(1, 22)).toBe(140);
  });
  it('level 31 measured in game: gnome Stamina 72 gives 938 health, Intellect 89 gives 1815 mana (no base mana offset)', () => {
    expect(maxHealthOf(31, 72)).toBe(938);
    expect(maxManaOf(31, 89, 1.05)).toBe(1815);
    expect(manaBaseOffset(1)).toBe(31);
    expect(manaBaseOffset(31)).toBe(0);
    expect(manaBaseOffset(50)).toBe(0);
    expect(manaBaseOffset(16)).toBeCloseTo(15.5, 6);
  });
  it('gnome warlock at level 40: base stats from player_levelstats and warlock base health and mana', () => {
    const s = playerStatsFor(40, 'quest', {});
    // base HP 634 + stamina (45 + 20 gear); mana (923 + Intellect (79 + 20)) x 1.05 (no Forever offset above level 31)
    expect(s.maxHp).toBe(Math.round(634 + 20 + 10 * (65 - 20)));
    expect(s.maxMana).toBe(Math.round((923 + 20 + 15 * (99 - 20)) * 1.05));
    expect(s.spirit).toBe(75 + 10);
  });
  it('Demonic Embrace raises health through Stamina, Fel Vitality raises mana', () => {
    const a = playerStatsFor(50, 'average', {});
    expect(playerStatsFor(50, 'average', { demonic_embrace: 5 }).maxHp).toBeGreaterThan(a.maxHp);
    expect(playerStatsFor(50, 'average', { fel_vitality: 3 }).maxMana).toBeCloseTo(a.maxMana * 1.15, -1);
  });
  it('vendor drink and food rates follow the Forever tooltips by level', () => {
    expect(playerStatsFor(40, 'average', {}).drinkManaPerSec).toBeCloseTo(1915 / 30, 1);
    expect(playerStatsFor(50, 'average', {}).drinkManaPerSec).toBeCloseTo(2821 / 30, 1);
    expect(playerStatsFor(50, 'average', {}).foodHpPerSec).toBeCloseTo(2065 / 30, 1);
  });
  it('normal mobs: Classic health at level 40 and 50, armor from class level stats', () => {
    expect(mobAt(40).hp).toBe(1753);
    expect(mobAt(50).hp).toBe(2769);
    expect(mobAt(50).armor).toBe(2999);
  });
  it('pets: base health with the 10 Nov +15%, Voidwalker +40; demon armor ranks by level', () => {
    expect(petBaseAt('voidwalker', 40).hp).toBeCloseTo((2052 + 40) * 1.15, 6);
    expect(demonArmorOf(45, {})).toBe(390);
    expect(demonArmorOf(45, { demonic_aegis: 2 })).toBeCloseTo(390 * 1.3, 6);
  });
});
