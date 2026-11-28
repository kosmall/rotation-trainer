// Regression tests for the forever audit (F-fight). Each describe is named after the finding it covers
// (docs/superpowers/reports/forever-audit/findings/).
import { describe, expect, it } from 'vitest';
import { loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull, type PullConfig, type PullResult } from '../../src/forever/fight';
import { estimateOf, type DataRotation, type SpecStep } from '../../src/forever/rotation-spec';
import type { Params } from '../../src/forever/types';

const cfg = (id: string, level = 50, over: Partial<PullConfig> = {}, params: Partial<Params> = {}): PullConfig => ({
  variant: loadVariant(id), level, profile: 'average', params: loadParams(params), trace: true, ...over,
});
const many = (c: PullConfig, n = 40): PullResult[] => Array.from({ length: n }, (_, i) => simulatePull(c, i + 1));
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const T = { op: 'true' } as const;
const step = (spell: string, when: SpecStep['when'], rank: number | 'max' = 'max', filler = false): SpecStep => ({ id: `${spell}_${JSON.stringify(when).length}`, spell, rank, when, filler });
const rotationOf = (steps: SpecStep[], filler = 'shadow_bolt'): DataRotation => ({ steps, estimate: { filler, fillerRank: 'max', dotSpells: [] } });

describe('A1-002: a channelled filler is estimated per second of channel, not per GCD', () => {
  it('the estimated Wrack filler dps is close to what Wrack measurably deals', () => {
    const base = cfg('AFF_WRACK', 50, { trace: false });
    const rot = rotationOf([step('wrack', T, 'max', true)], 'wrack');
    const rs = many({ ...base, rotation: rot }, 30);
    const measured = avg(rs.map((r) => r.playerDamage / r.pullSec));
    const est = (rs[0] as PullResult).rates.fillerDps;
    expect(est / measured).toBeGreaterThan(0.6);
    expect(est / measured).toBeLessThan(1.6);
  });
});

describe('A1-010: the filler estimate is for the spell that is actually played', () => {
  it('Drain Life not yet learned: the estimate is for Shadow Bolt, not zero', () => {
    const r = simulatePull(cfg('AFF_DRAINTANK', 12), 1);
    expect(r.rates.fillerDps).toBeGreaterThan(0);
  });
  it('Wrack not yet learned: the estimate is for Drain Life when that is learned', () => {
    const v = loadVariant('AFF_WRACK');
    const ranks = ranksAt(v, 30);
    const run = (filler: string) => simulatePull({ variant: v, level: 30, profile: 'average', params: loadParams(), ranks, trace: false, rotation: { steps: [step('shadow_bolt', T, 'max', true)], estimate: { filler, fillerRank: 'max', dotSpells: [] } } }, 1).rates.fillerDps;
    expect(run('wrack')).toBeCloseTo(run('drain_life'), 6);
  });
});

describe('A3-014 / A4-007: the demon dps estimate matches what the demon deals', () => {
  it('Improved Imp raises the Imp estimate', () => {
    const v = loadVariant('DEMO_FIRE');
    const ranks = ranksAt(v, 50);
    const run = (n: number) => simulatePull({ variant: v, level: 50, profile: 'average', params: loadParams(), ranks: { ...ranks, improved_imp: n }, trace: false }, 1).rates.petDps;
    expect(ranks.improved_imp).toBe(3);
    // Firebolt 3/3 is +30%; the hit chance is in both
    expect(run(3) / run(0)).toBeCloseTo(1.3, 2);
  });
  it('the Voidwalker melee estimate counts the mob armor', () => {
    const rs = many(cfg('AFF_WRACK', 50, { trace: false }), 40).filter((r) => r.petKind === 'voidwalker');
    const measured = avg(rs.map((r) => r.petDamage / Math.max(1, r.pullSec - 1)));
    const est = (rs[0] as PullResult).rates.petDps;
    expect(est / measured).toBeGreaterThan(0.85);
    expect(est / measured).toBeLessThan(1.15);
  });
  it('the Succubus estimate includes Lash of Pain', () => {
    // melee and Lash only (the estimate leaves out Demonic Brand and Curse of the Elements)
    // long pulls (a mob with 6 times the health): the first action at the start of a pull weighs little
    const rs = many(cfg('DEMO_PACT_R1', 50, { mobs: 1 }, { mob_hp_mult: 6 }), 12).filter((r) => r.petKind === 'succubus');
    const direct = (r: PullResult): number => r.trace.filter((l) => /pet (melee|lash) /.test(l)).reduce((a, l) => a + parseFloat(l.split(' ').pop() as string), 0);
    const measured = rs.reduce((a, r) => a + direct(r), 0) / rs.reduce((a, r) => a + Math.max(1, r.pullSec - 1), 0);
    const est = (rs[0] as PullResult).rates.petDps;
    expect(est / measured).toBeGreaterThan(0.88);
    expect(est / measured).toBeLessThan(1.08);
  });
});

describe('A5-017: estimateOf lists only the periodic effects the build casts', () => {
  it('Demonology and Fire do not list Siphon Life or Corruption they never cast', () => {
    const p = loadParams();
    expect(estimateOf(loadVariant('DEMO_FIRE'), p).dotSpells).toEqual(['immolate']);
    expect(estimateOf(loadVariant('DEMO_PACT_R1'), p).dotSpells).not.toContain('siphon_life');
    expect(estimateOf(loadVariant('AFF_WRACK'), p).dotSpells).toEqual(['corruption', 'bane_of_agony', 'siphon_life']);
  });
});

