import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { lifeTapWanted, needsBreak } from '../../src/forever/policy';

const p = loadParams();
const want = (mana: number, hp: number, between = false): boolean => lifeTapWanted(mana * 1000, 1000, hp * 1000, 1000, p, between);

describe("the user's Life Tap and break rules", () => {
  it('mana below 60% and HP above 80%: Life Tap', () => {
    expect(want(0.59, 0.81)).toBe(true);
    expect(want(0.59, 0.8)).toBe(false);
    expect(want(0.6, 0.9)).toBe(false);
  });
  it('mana below 20% and HP above 30%: Life Tap again', () => {
    expect(want(0.19, 0.31)).toBe(true);
    expect(want(0.19, 0.3)).toBe(false);
    expect(want(0.2, 0.5)).toBe(false);
  });
  it('mana 40% with HP 50%: no Life Tap, keep fighting', () => {
    expect(want(0.4, 0.5)).toBe(false);
  });
  it('between mobs, HP at 100% and mana below 90%: Life Tap; not in combat', () => {
    expect(want(0.8, 1, true)).toBe(true);
    expect(want(0.8, 1, false)).toBe(false);
    expect(want(0.9, 1, true)).toBe(false);
    expect(want(0.8, 0.9, true)).toBe(false);
  });
  it('the only break is food and water below 30% HP', () => {
    expect(needsBreak(299, 1000, p)).toBe(true);
    expect(needsBreak(300, 1000, p)).toBe(false);
    expect(needsBreak(900, 1000, p)).toBe(false);
  });
});
