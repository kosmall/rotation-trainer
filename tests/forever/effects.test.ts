import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { brandAttacks, brandDamage, brandSchool, demonicKnowledgeSp, petSchoolMult, sacrificeDemon, schoolMults, soulHarvest, summonDemon } from '../../src/forever/effects';

describe('Demonic Brand damage', () => {
  it('fixed_60 at 3/3 and 0 SP is (60-26)*1.5 + 15.5 = 66.5; +0.078 per spell power', () => {
    const p = loadParams({ brand_scale: 'fixed_60' });
    expect(brandDamage(40, 0, 3, p)).toBeCloseTo(66.5, 6);
    expect(brandDamage(40, 100, 3, p)).toBeCloseTo(74.3, 6);
  });
  it('level_scaled uses the caster level; rank 0 is nothing', () => {
    const p = loadParams({ brand_scale: 'level_scaled' });
    expect(brandDamage(40, 0, 3, p)).toBeCloseTo(14 * 1.5 + 15.5, 6);
    expect(brandDamage(40, 0, 0, p)).toBe(0);
  });
  it('an attack deals the same at every rank: the rank only changes the number of attacks (Wowhead)', () => {
    const p = loadParams({ brand_scale: 'level_scaled' });
    for (const rank of [1, 2, 3]) {
      expect(brandDamage(60, 0, rank, p)).toBeCloseTo(34 * 1.5 + 15.5, 6);
      expect(brandDamage(40, 100, rank, p)).toBeCloseTo(14 * 1.5 + 15.5 + 7.8, 6);
    }
  });
  it('2 attacks per rank: 6 at 3/3', () => {
    expect(brandAttacks(1)).toBe(2);
    expect(brandAttacks(3)).toBe(6);
  });
  it('brand_mult scales the damage', () => {
    expect(brandDamage(60, 0, 3, loadParams({ brand_mult: 2 }))).toBeCloseTo(2 * brandDamage(60, 0, 3, loadParams()), 6);
  });
});

describe('Demonic Sacrifice and Demonic Pact', () => {
  const impOut = { out: 'imp' as const, sacrificed: null };
  it('sacrificing moves the demon into the effect slot', () => {
    expect(sacrificeDemon(impOut)).toEqual({ out: null, sacrificed: 'imp' });
  });
  it('with Pact: summoning a different demon keeps the sacrifice', () => {
    const s = sacrificeDemon(impOut);
    expect(summonDemon(s, 'succubus', true)).toEqual({ out: 'succubus', sacrificed: 'imp' });
  });
  it('with Pact: summoning the same demon still removes the sacrifice', () => {
    const s = sacrificeDemon(impOut);
    expect(summonDemon(s, 'imp', true)).toEqual({ out: 'imp', sacrificed: null });
  });
  it('without Pact: any summon removes the sacrifice', () => {
    const s = sacrificeDemon(impOut);
    expect(summonDemon(s, 'succubus', false)).toEqual({ out: 'succubus', sacrificed: null });
  });
});

describe('school multipliers', () => {
  const ranks = { shadow_mastery: 0, demonic_sacrifice: 1, master_demonologist: 5, soul_link: 1 };
  it('Imp sacrificed + Succubus out: +15% shadow, +10% shadow, +3% Soul Link', () => {
    const m = schoolMults(ranks, { out: 'succubus', sacrificed: 'imp' }, true);
    expect(m.shadow).toBeCloseTo(1.15 * 1.1 * 1.03, 6);
    expect(m.fire).toBeCloseTo(1.03, 6);
  });
  it('Succubus sacrificed + Imp out: +15% fire and +10% fire', () => {
    const m = schoolMults(ranks, { out: 'imp', sacrificed: 'succubus' }, true);
    expect(m.fire).toBeCloseTo(1.15 * 1.1 * 1.03, 6);
  });
  it('no pet alive: no Master Demonologist or Soul Link bonus, sacrifice stays', () => {
    const m = schoolMults(ranks, { out: 'succubus', sacrificed: 'imp' }, false);
    expect(m.shadow).toBeCloseTo(1.15, 6);
  });
  it('Demonic Knowledge adds up to your level in spell power while the demon is out', () => {
    expect(demonicKnowledgeSp(50, { demonic_knowledge: 3 }, true)).toBe(50);
    expect(demonicKnowledgeSp(50, { demonic_knowledge: 3 }, false)).toBe(0);
    expect(demonicKnowledgeSp(48, { demonic_knowledge: 1 }, true)).toBe(16);
  });
});

describe('multipliers of the demon', () => {
  const md = { master_demonologist: 5 };
  it('Master Demonologist raises the Imp\'s Fire damage and the Succubus\'s Shadow damage', () => {
    expect(petSchoolMult(md, 'imp', 'fire')).toBeCloseTo(1.1, 6);
    expect(petSchoolMult(md, 'succubus', 'shadow')).toBeCloseTo(1.1, 6);
    expect(petSchoolMult({ master_demonologist: 2 }, 'imp', 'fire')).toBeCloseTo(1.04, 6);
  });
  it('other schools and demons get nothing', () => {
    expect(petSchoolMult(md, 'imp', 'shadow')).toBe(1);
    expect(petSchoolMult(md, 'succubus', 'physical')).toBe(1);
    expect(petSchoolMult(md, 'voidwalker', 'shadow')).toBe(1);
    expect(petSchoolMult(md, 'felhunter', 'shadow')).toBe(1);
    expect(petSchoolMult({}, 'imp', 'fire')).toBe(1);
  });
  it('the brand is Fire with the Imp and Shadow with the other demons', () => {
    expect(brandSchool('imp')).toBe('fire');
    for (const pet of ['voidwalker', 'succubus', 'felhunter'] as const) expect(brandSchool(pet)).toBe('shadow');
  });
});

describe('Soul Harvest', () => {
  it('2/2: +100% regen and 100% kept while casting for 10 s; 1/2: +50% and 50%; 0: none', () => {
    expect(soulHarvest({ soul_harvest: 2 })).toEqual({ bonus: 1, castingShare: 1, durationMs: 10000 });
    expect(soulHarvest({ soul_harvest: 1 })).toEqual({ bonus: 0.5, castingShare: 0.5, durationMs: 10000 });
    expect(soulHarvest({})).toEqual({ bonus: 0, castingShare: 0, durationMs: 0 });
  });
});
