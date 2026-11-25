import { describe, expect, it } from 'vitest';
import { loadVariant, ranksAt, type BuildVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull, type PullConfig, type PullResult } from '../../src/forever/fight';
import type { Params } from '../../src/forever/types';

const cfg = (id: string, level = 50, over: Partial<PullConfig> = {}, params: Partial<Params> = {}): PullConfig => ({
  variant: loadVariant(id), level, profile: 'average', params: loadParams(params), trace: true, ...over,
});
const many = (c: PullConfig, n = 60): PullResult[] => Array.from({ length: n }, (_, i) => simulatePull(c, i + 1));
const castsOf = (r: PullResult, spell: string): number => r.trace.filter((l) => l.includes(`cast ${spell} `)).length;

describe('fight core', () => {
  it('same seed gives identical results, different seeds differ', () => {
    const a = simulatePull(cfg('AFF_WRACK'), 5);
    const b = simulatePull(cfg('AFF_WRACK'), 5);
    expect(a).toEqual(b);
    const times = new Set(Array.from({ length: 10 }, (_, i) => simulatePull(cfg('AFF_WRACK'), i + 1).pullSec));
    expect(times.size).toBeGreaterThan(1);
  });
  it('every build kills the mob without negative mana at every checked level', () => {
    for (const id of ['AFF_WRACK', 'AFF_DRAINTANK', 'DEMO_PACT_R1', 'DEMO_PACT_VIDEO', 'DEMO_PACT_R2', 'DEMO_PACT_MAXRANK', 'DEMO_FIRE']) {
      for (const level of [40, 45, 50, 55, 59]) {
        const r = simulatePull(cfg(id, level, { trace: false }), 3);
        expect(r.endMana, `${id}@${level}`).toBeGreaterThanOrEqual(0);
        expect(r.mobsKilled + (r.timedOut || r.playerDied ? 0 : 0), `${id}@${level}`).toBeGreaterThanOrEqual(1);
        expect(r.pullSec).toBeGreaterThan(0);
      }
    }
  });
  it('no DoT ticks are logged after the last mob died', () => {
    const r = simulatePull(cfg('AFF_WRACK'), 2);
    const dead = r.trace.findIndex((l) => l.includes('mob dies'));
    expect(dead).toBeGreaterThan(0);
    expect(r.trace.slice(dead + 1).filter((l) => l.includes('tick '))).toEqual([]);
  });
  it('out of mana with Life Tap impossible: the pull still ends within the time limit', () => {
    const r = simulatePull(cfg('AFF_WRACK', 50, { startMana: 0, startHp: 10 }, { pull_time_limit_sec: 30 }), 1);
    expect(r.pullSec).toBeLessThanOrEqual(30);
    expect(Number.isFinite(r.pullSec)).toBe(true);
  });
  it('more mobs take longer and cost more mana', () => {
    const one = many(cfg('AFF_WRACK', 50, { mobs: 1, trace: false }), 40);
    const three = many(cfg('AFF_WRACK', 50, { mobs: 3, trace: false }), 40);
    const avg = (rs: PullResult[], f: (r: PullResult) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    expect(avg(three, (r) => r.pullSec)).toBeGreaterThan(avg(one, (r) => r.pullSec));
    expect(avg(three, (r) => r.manaSpent)).toBeGreaterThan(avg(one, (r) => r.manaSpent));
  });
});

describe('GCD and Bane in the fight', () => {
  it('Shadow Bolt r1 with Bane 5/5 wastes 0.3 s of GCD per cast; with Bane 2/5 it fits the GCD exactly', () => {
    const video = simulatePull(cfg('DEMO_PACT_VIDEO', 50), 4);
    const sbCasts = castsOf(video, 'shadow_bolt');
    expect(sbCasts).toBeGreaterThan(2);
    expect(video.castWasteMs).toBe(300 * sbCasts);
    expect(simulatePull(cfg('DEMO_PACT_R1', 50), 4).castWasteMs).toBe(0);
  });
  it('spells never start sooner than 1.5 s apart when a cast is shorter than the GCD', () => {
    const r = simulatePull(cfg('DEMO_PACT_VIDEO', 50), 4);
    const starts = r.trace.filter((l) => l.includes(' cast ')).map((l) => parseFloat(l));
    for (let i = 1; i < starts.length; i++) expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(1.5 - 1e-9);
  });
  it('with haste on and haste_shortens_gcd off, GCD stays 1.5 s', () => {
    const r = simulatePull(cfg('DEMO_PACT_VIDEO', 50, {}, { haste_pct: 30 }), 4);
    const starts = r.trace.filter((l) => l.includes(' cast ')).map((l) => parseFloat(l));
    for (let i = 1; i < starts.length; i++) expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(1.5 - 1e-9);
  });
  it('bane_per_rank 0.2 changes Shadow Bolt r1 cast to 0.7 s', () => {
    const r = simulatePull(cfg('DEMO_PACT_VIDEO', 50, {}, { bane_per_rank: 0.2 }), 4);
    expect(r.trace.some((l) => l.includes('cast shadow_bolt r1 (700 ms'))).toBe(true);
  });
});

describe('affliction mechanics', () => {
  it('DoT and drain ticks can crit, and Pandemic raises their crit damage', () => {
    const ratio = (pandemic: number): number => {
      const ranks = { ...ranksAt(loadVariant('AFF_WRACK'), 50), pandemic };
      const ticks: { d: number; crit: boolean }[] = [];
      for (let s = 1; s <= 200; s++) {
        const r = simulatePull(cfg('AFF_WRACK', 50, { ranks }, { mob_hp_mult: 3 }), s);
        for (const l of r.trace) {
          const m = /tick corruption (\d+)( CRIT)?/.exec(l);
          if (m) ticks.push({ d: Number(m[1]), crit: m[2] !== undefined });
        }
      }
      const crit = ticks.filter((x) => x.crit);
      const norm = ticks.filter((x) => !x.crit);
      expect(crit.length).toBeGreaterThan(0);
      return crit.reduce((a, x) => a + x.d, 0) / crit.length / (norm.reduce((a, x) => a + x.d, 0) / norm.length);
    };
    expect(ratio(0)).toBeCloseTo(1.5, 1);
    expect(ratio(3)).toBeCloseTo(1.8, 1);
  });
  it('Bane of Agony and Curse of the Elements coexist on one target', () => {
    const r = simulatePull(cfg('AFF_WRACK', 50, {}, { use_curse_of_elements: true, mob_hp_mult: 2 }), 1);
    expect(castsOf(r, 'curse_of_elements')).toBe(1);
    expect(castsOf(r, 'bane_of_agony')).toBeGreaterThanOrEqual(1);
    const curse = r.trace.findIndex((l) => l.includes('curse_of_elements') && l.includes('lands'));
    expect(curse).toBeGreaterThan(-1);
    // Agony keeps ticking after the curse landed: the curse did not replace it.
    expect(r.trace.slice(curse).some((l) => l.includes('tick bane_of_agony'))).toBe(true);
  });
  it('skip_agony_if_ttk_below skips Agony and the curse on quick kills', () => {
    const skipped = simulatePull(cfg('AFF_WRACK', 50, {}, { skip_agony_if_ttk_below: 1000, use_curse_of_elements: true }), 1);
    expect(castsOf(skipped, 'bane_of_agony')).toBe(0);
    expect(castsOf(skipped, 'curse_of_elements')).toBe(0);
    expect(castsOf(simulatePull(cfg('AFF_WRACK', 50), 1), 'bane_of_agony')).toBe(1);
  });
  it('Soul Harvest: a kill under Drain Soul gives a regen buff; without the talent there is no Drain Soul finisher', () => {
    const withSh = many(cfg('AFF_WRACK', 50), 80);
    expect(withSh.some((r) => r.soulHarvestProcs > 0)).toBe(true);
    for (const r of withSh.filter((x) => x.soulHarvestProcs > 0)) {
      const i = r.trace.findIndex((l) => l.includes('Soul Harvest'));
      expect(r.trace.slice(0, i).some((l) => l.includes('cast drain_soul'))).toBe(true);
    }
    const ranks = { ...ranksAt(loadVariant('AFF_WRACK'), 50), soul_harvest: 0 };
    for (const r of many(cfg('AFF_WRACK', 50, { ranks }), 40)) {
      expect(r.soulHarvestProcs).toBe(0);
      expect(castsOf(r, 'drain_soul')).toBe(0);
    }
  });
  it('Soul Harvest raises mana at the end of the pull compared with no buff (regen while casting)', () => {
    const base = ranksAt(loadVariant('AFF_WRACK'), 50);
    const regen = (soul_harvest: number): number => {
      const rs = many(cfg('AFF_WRACK', 50, { ranks: { ...base, soul_harvest }, trace: false }), 80).filter((r) => r.soulHarvestProcs > 0 || soul_harvest === 0);
      return rs.reduce((a, r) => a + (r.endMana - r.startMana + r.manaSpent), 0) / Math.max(1, rs.length);
    };
    expect(regen(2)).toBeGreaterThan(regen(0));
  });
  it('Nightfall procs give a free instant Shadow Bolt', () => {
    const rs = many(cfg('AFF_WRACK', 50, { ranks: { ...ranksAt(loadVariant('AFF_WRACK'), 50), nightfall: 2 } }, { mob_hp_mult: 3 }), 40);
    const proc = rs.find((r) => r.nightfallProcs > 0);
    expect(proc).toBeDefined();
    expect(proc!.trace.some((l) => l.includes('shadow_bolt') && l.includes('0 ms, free'))).toBe(true);
  });
});

describe('demonology mechanics', () => {
  it('Brand hits only happen with the talent, and never exceed 3 per Searing Pain', () => {
    const demo = many(cfg('DEMO_PACT_R1', 50), 40);
    expect(demo.some((r) => r.brandHits > 0)).toBe(true);
    for (const r of demo) {
      const sp = r.trace.filter((l) => l.includes('searing_pain') && l.includes('lands')).length;
      expect(r.brandHits).toBeLessThanOrEqual(3 * sp);
    }
    expect(many(cfg('AFF_WRACK', 50), 10).every((r) => r.brandHits === 0)).toBe(true);
  });
  it('Brand keeps aggro on the pet: fewer mob switches to the player than without the talent', () => {
    const base = ranksAt(loadVariant('DEMO_PACT_R1'), 50);
    const switches = (ranks: typeof base) => many(cfg('DEMO_PACT_R1', 50, { ranks, trace: false }), 80).reduce((a, r) => a + r.threatSwitches, 0);
    expect(switches({ ...base, demonic_brand: 3 })).toBeLessThanOrEqual(switches({ ...base, demonic_brand: 0 }));
  });
  it('Soul Link moves part of the damage to the pet; without it the player takes all', () => {
    const base = ranksAt(loadVariant('DEMO_PACT_R1'), 50);
    const taken = (soul_link: number) => many(cfg('DEMO_PACT_R1', 50, { ranks: { ...base, soul_link }, trace: false }, { pet_opens: false }), 60).reduce((a, r) => a + r.damageTaken, 0);
    expect(taken(1)).toBeLessThan(taken(0));
  });
  it('a build without a demon runs and the pet deals nothing', () => {
    const v: BuildVariant = { ...loadVariant('DEMO_PACT_R1'), pet: null, sacrificed: null };
    const r = simulatePull(cfg('DEMO_PACT_R1', 50, { variant: v }), 1);
    expect(r.petDamage).toBe(0);
    expect(r.brandHits).toBe(0);
    expect(r.pullSec).toBeGreaterThan(0);
  });
  it('the Imp, sacrificed, shows up as a shadow multiplier: sacrificing raises player damage', () => {
    const base = ranksAt(loadVariant('DEMO_PACT_R1'), 50);
    const dmg = (sac: string | null) => {
      const v: BuildVariant = { ...loadVariant('DEMO_PACT_R1'), sacrificed: sac as BuildVariant['sacrificed'] };
      return many(cfg('DEMO_PACT_R1', 50, { variant: v, ranks: base, trace: false }), 60).reduce((a, r) => a + r.playerDamage / Math.max(1, r.pullSec), 0);
    };
    expect(dmg('imp')).toBeGreaterThan(dmg(null));
  });
});
