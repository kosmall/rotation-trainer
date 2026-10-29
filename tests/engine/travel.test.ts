import { describe, expect, it } from 'vitest';
import { projectileTravelMs } from '../../src/engine/travel';

describe('projectileTravelMs', () => {
  it('28 yd at 20 yd/s → 1400', () => {
    expect(projectileTravelMs(20, 28)).toBe(1400);
  });

  it('rounds to whole ms (25 yd at 24 yd/s → 1042)', () => {
    // 25 / 24 * 1000 = 1041.67
    expect(projectileTravelMs(24, 25)).toBe(1042);
  });

  it('0 for missing speed, speed 0, distance 0, negative, NaN, Infinity', () => {
    expect(projectileTravelMs(undefined, 28)).toBe(0);
    expect(projectileTravelMs(0, 28)).toBe(0);
    expect(projectileTravelMs(20, 0)).toBe(0);
    expect(projectileTravelMs(-20, 28)).toBe(0);
    expect(projectileTravelMs(20, -28)).toBe(0);
    expect(projectileTravelMs(Number.NaN, 28)).toBe(0);
    expect(projectileTravelMs(20, Number.NaN)).toBe(0);
    expect(projectileTravelMs(20, Number.POSITIVE_INFINITY)).toBe(0);
    expect(projectileTravelMs(Number.POSITIVE_INFINITY, 28)).toBe(0);
    // A denormal speed would overflow to an infinite travel time: also 0 (always a finite integer).
    expect(projectileTravelMs(Number.MIN_VALUE, 28)).toBe(0);
  });
});
