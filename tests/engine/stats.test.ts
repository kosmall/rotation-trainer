import { describe, expect, it } from 'vitest';
import { combineStatMultipliers, computeStats } from '../../src/engine/stats';
import type { CharacterSetup, RawStats } from '../../src/engine/types';
import {
  BASE_CRIT_PCT,
  CRIT_RATING_PER_PCT,
  HASTE_RATING_PER_PCT,
  HIT_RATING_PER_PCT,
  INT_MANA_FREE_THRESHOLD,
  INT_PER_CRIT_PCT,
  MANA_PER_INTELLECT,
  MP5_INTERVAL_SEC,
  SPIRIT_REGEN_BASE_PER_SEC,
  SPIRIT_REGEN_PER_SPIRIT_SQRT_INT,
} from '../../src/data/common/ratings';

const zeroStats: RawStats = {
  intellect: 0,
  spirit: 0,
  spellPower: 0,
  shadowPower: 0,
  firePower: 0,
  critRating: 0,
  hitRating: 0,
  hasteRating: 0,
  baseMana: 0,
  mp5: 0,
};

function setupWith(stats: Partial<RawStats>): CharacterSetup {
  return { stats: { ...zeroStats, ...stats }, setPieces: {}, modifiers: [] };
}

describe('computeStats', () => {
  it('hasteRating = HASTE_RATING_PER_PCT * 10 gives hastePct 10', () => {
    const d = computeStats(setupWith({ hasteRating: HASTE_RATING_PER_PCT * 10 }));
    expect(d.hastePct).toBeCloseTo(10, 9);
  });

  it('hitRating = HIT_RATING_PER_PCT * 10 gives hitPct 10', () => {
    const d = computeStats(setupWith({ hitRating: HIT_RATING_PER_PCT * 10 }));
    expect(d.hitPct).toBeCloseTo(10, 9);
  });

  it('critRating = CRIT_RATING_PER_PCT * 10 gives critPct BASE_CRIT_PCT + 10', () => {
    const d = computeStats(setupWith({ critRating: CRIT_RATING_PER_PCT * 10 }));
    expect(d.critPct).toBeCloseTo(BASE_CRIT_PCT + 10, 9);
  });

  it('shadow power adds shadowPower to spellPower, fire power adds firePower, arcane gets spellPower only', () => {
    const d = computeStats(setupWith({ spellPower: 100, shadowPower: 30, firePower: 20 }));
    expect(d.power.shadow).toBe(130);
    expect(d.power.fire).toBe(120);
    expect(d.power.arcane).toBe(100);
    expect(d.power.frost).toBe(100);
    expect(d.power.nature).toBe(100);
    expect(d.power.holy).toBe(100);
    expect(d.power.physical).toBe(100);
  });

  it('extra stats are added before conversion', () => {
    const d = computeStats(setupWith({}), { hitRating: HIT_RATING_PER_PCT * 3 });
    expect(d.hitPct).toBeCloseTo(3, 9);
    const both = computeStats(setupWith({ hitRating: HIT_RATING_PER_PCT * 2 }), {
      hitRating: HIT_RATING_PER_PCT,
    });
    expect(both.hitPct).toBeCloseTo(3, 9);
  });

  it('crit includes intellect/INT_PER_CRIT_PCT plus BASE_CRIT_PCT', () => {
    const d = computeStats(setupWith({ intellect: 400 }));
    expect(d.critPct).toBeCloseTo(BASE_CRIT_PCT + 400 / INT_PER_CRIT_PCT, 9);
  });

  it('maxMana = baseMana + MANA_PER_INTELLECT per intellect, with the first 20 intellect worth 1 mana each', () => {
    const intellect = 400;
    const d = computeStats(setupWith({ baseMana: 2000, intellect }));
    expect(d.maxMana).toBe(
      2000 + INT_MANA_FREE_THRESHOLD + MANA_PER_INTELLECT * (intellect - INT_MANA_FREE_THRESHOLD),
    );
  });

  it('spiritRegenPerSec follows the sqrt(intellect) formula and mp5RegenPerSec = mp5 / MP5_INTERVAL_SEC', () => {
    const d = computeStats(setupWith({ spirit: 200, intellect: 400, mp5: 25 }));
    expect(d.spiritRegenPerSec).toBeCloseTo(
      SPIRIT_REGEN_BASE_PER_SEC + 200 * Math.sqrt(400) * SPIRIT_REGEN_PER_SPIRIT_SQRT_INT,
      9,
    );
    expect(d.mp5RegenPerSec).toBeCloseTo(25 / MP5_INTERVAL_SEC, 9);
  });

  it('extra intellect and spirit feed crit, mana and regen', () => {
    const a = computeStats(setupWith({ intellect: 300, spirit: 100 }), { intellect: 100, spirit: 50 });
    const b = computeStats(setupWith({ intellect: 400, spirit: 150 }));
    expect(a).toEqual(b);
  });

  it('ignores setPieces and modifiers', () => {
    const base = computeStats(setupWith({ spellPower: 10 }));
    const withExtras = computeStats({
      ...setupWith({ spellPower: 10 }),
      setPieces: { 'some-set': 4 },
      modifiers: [{ damageMult: 2 }],
    });
    expect(withExtras).toEqual(base);
  });
});

describe('computeStats statMultipliers (racial and talent % stat effects)', () => {
  it('intellect and spirit multipliers scale setup + extra before conversion', () => {
    const multiplied = computeStats(
      {
        ...setupWith({ intellect: 300, spirit: 100, baseMana: 2000 }),
        statMultipliers: { intellect: 1.05, spirit: 0.95 },
      },
      { intellect: 100, spirit: 100 },
    );
    // Same as 420 intellect and 190 spirit without multipliers.
    const plain = computeStats(setupWith({ intellect: 420, spirit: 190, baseMana: 2000 }));
    expect(multiplied.maxMana).toBeCloseTo(plain.maxMana, 9);
    expect(multiplied.critPct).toBeCloseTo(plain.critPct, 9);
    expect(multiplied.spiritRegenPerSec).toBeCloseTo(plain.spiritRegenPerSec, 9);
  });

  it('the maxMana multiplier scales the whole pool (base mana and intellect mana)', () => {
    const plain = computeStats(setupWith({ intellect: 400, baseMana: 2000 }));
    const multiplied = computeStats({
      ...setupWith({ intellect: 400, baseMana: 2000 }),
      statMultipliers: { maxMana: 1.03 },
    });
    expect(multiplied.maxMana).toBeCloseTo(plain.maxMana * 1.03, 9);
    expect(multiplied.critPct).toBe(plain.critPct);
  });

  it('absent multipliers change nothing', () => {
    const base = computeStats(setupWith({ intellect: 400, spirit: 100, baseMana: 2000 }));
    expect(computeStats({ ...setupWith({ intellect: 400, spirit: 100, baseMana: 2000 }), statMultipliers: {} })).toEqual(
      base,
    );
  });
});

describe('computeStats haste multiplier (StatMultipliers.haste)', () => {
  it('haste factor 1.3 with 45 haste rating gives hastePct ≈ 33.7 (multiplicative, from the log: Shadow Bolt 2500 ms → 1870 ms)', () => {
    const d = computeStats({ ...setupWith({ hasteRating: 45 }), statMultipliers: { haste: 1.3 } });
    const ratingPct = 45 / HASTE_RATING_PER_PCT;
    expect(d.hastePct).toBeCloseTo(((1 + ratingPct / 100) * 1.3 - 1) * 100, 9);
    expect(d.hastePct).toBeCloseTo(33.71, 2);
    expect(Math.round(2500 / (1 + d.hastePct / 100))).toBe(1870);
  });

  it('a haste factor of 1 (or none) leaves hastePct exactly the rating percentage', () => {
    const plain = computeStats(setupWith({ hasteRating: 45 }));
    expect(plain.hastePct).toBe(45 / HASTE_RATING_PER_PCT);
    expect(computeStats({ ...setupWith({ hasteRating: 45 }), statMultipliers: { haste: 1 } })).toEqual(plain);
  });

  it('a haste factor works without haste rating', () => {
    const d = computeStats({ ...setupWith({}), statMultipliers: { haste: 1.3 } });
    expect(d.hastePct).toBeCloseTo(30, 9);
  });

  it('extra multipliers (self auras) combine multiplicatively with the setup multipliers', () => {
    const setup: CharacterSetup = {
      ...setupWith({ intellect: 400, spirit: 100, baseMana: 2000, hasteRating: 45 }),
      statMultipliers: { intellect: 1.1, haste: 1.2 },
    };
    const d = computeStats(setup, {}, [{ intellect: 1.1, spirit: 1.5 }, { haste: 1.3, maxMana: 1.02 }]);
    const same = computeStats({
      ...setupWith({ intellect: 400, spirit: 100, baseMana: 2000, hasteRating: 45 }),
      statMultipliers: { intellect: 1.1 * 1.1, spirit: 1.5, maxMana: 1.02, haste: 1.2 * 1.3 },
    });
    expect(d.maxMana).toBeCloseTo(same.maxMana, 9);
    expect(d.critPct).toBeCloseTo(same.critPct, 9);
    expect(d.spiritRegenPerSec).toBeCloseTo(same.spiritRegenPerSec, 9);
    expect(d.hastePct).toBeCloseTo(same.hastePct, 9);
    expect(d.hastePct).toBeCloseTo(((1 + 45 / HASTE_RATING_PER_PCT / 100) * 1.56 - 1) * 100, 9);
  });

  it('an empty list of extra multipliers changes nothing', () => {
    const setup: CharacterSetup = { ...setupWith({ intellect: 400, hasteRating: 45 }), statMultipliers: { intellect: 1.1 } };
    expect(computeStats(setup, {}, [])).toEqual(computeStats(setup));
  });
});

describe('combineStatMultipliers', () => {
  it('multiplies factor by factor, skips undefined sets and keeps only present factors', () => {
    expect(combineStatMultipliers({ intellect: 1.1, haste: 1.3 }, undefined, { intellect: 1.1, maxMana: 1.02 })).toEqual({
      intellect: 1.1 * 1.1,
      haste: 1.3,
      maxMana: 1.02,
    });
    expect(combineStatMultipliers()).toEqual({});
  });

  it('does not mutate its inputs', () => {
    const a = Object.freeze({ haste: 1.3 });
    const b = Object.freeze({ haste: 1.2 });
    expect(combineStatMultipliers(a, b).haste).toBeCloseTo(1.56, 12);
  });
});
