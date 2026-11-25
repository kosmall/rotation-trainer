import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { brandDamage, demonicKnowledgeSp, sacrificeDemon, schoolMults, soulHarvest, summonDemon } from '../../src/forever/effects';

describe('Demonic Brand damage', () => {
  it('fixed_60 at 3/3 and 0 SP is (60-26)*1.5 + 15.5 = 66.5; +0.078 per spell power', () => {
    const p = loadParams({ brand_scale: 'fixed_60' });
    expect(brandDamage(40, 0, 3, p)).toBeCloseTo(66.5, 6);
    expect(brandDamage(40, 100, 3, p)).toBeCloseTo(74.3, 6);
  });
  it('level_scaled uses the caster level; lower ranks scale by rank/3; rank 0 is nothing', () => {
    const p = loadParams({ brand_scale: 'level_scaled' });
    expect(brandDamage(40, 0, 3, p)).toBeCloseTo(14 * 1.5 + 15.5, 6);
    expect(brandDamage(40, 0, 1, p)).toBeCloseTo((14 * 1.5 + 15.5) / 3, 6);
    expect(brandDamage(40, 0, 0, p)).toBe(0);
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

describe('Soul Harvest', () => {
  it('2/2: +100% regen for 10 s; 1/2: half the bonus; 0: none', () => {
    expect(soulHarvest({ soul_harvest: 2 })).toEqual({ bonus: 1, durationMs: 10000 });
    expect(soulHarvest({ soul_harvest: 1 }).bonus).toBe(0.5);
    expect(soulHarvest({}).bonus).toBe(0);
  });
});
