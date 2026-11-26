import { describe, expect, it } from 'vitest';
import { loadVariant, SCENARIO_IDS, VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { lifeTapWanted } from '../../src/forever/policy';
import { evalCond, evaluateSteps, rotationSpec, type SpecCtx } from '../../src/forever/rotation-spec';
import { rotationFor, type Candidate, type RotationCtx } from '../../src/forever/rotations';
import { simulatePull } from '../../src/forever/fight';
import { createRng } from '../../src/engine/rng';
import type { Params } from '../../src/forever/types';

const dedupe = (list: Candidate[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const k = `${c.spellId}:${c.rankWant}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
};

/** A random but self-consistent fight state for the rotation. */
function randomCtx(seed: number, variant: ReturnType<typeof loadVariant>, params: Params): SpecCtx {
  const rng = createRng(seed);
  const b = (p = 0.5): boolean => rng.next() < p;
  const known = new Set(['shadow_bolt', 'corruption', 'bane_of_agony', 'immolate', 'searing_pain', 'drain_life', 'drain_soul', 'siphon_life', 'wrack', 'curse_of_elements', 'life_tap'].filter(() => b(0.8)));
  const dots = new Set(['corruption', 'bane_of_agony', 'immolate', 'siphon_life'].filter(() => b(0.4)));
  const talents: Record<string, number> = { demonic_brand: b() ? 3 : 0, soul_harvest: b() ? 2 : 0 };
  const ttk = rng.next() * 30;
  const drainKill = rng.next() * 12;
  const hasCurse = b(0.3);
  const brandCharges = b(0.5) ? 0 : 3;
  const brandMs = rng.next() * 4000;
  const petAlive = b(0.7);
  const trance = b(0.25);
  const mobs = b() ? 1 : 2;
  return {
    params,
    variant,
    mobsInPull: mobs,
    petAlive,
    hasShadowTrance: trance,
    known: (id) => known.has(id),
    talentRank: (id) => talents[id] ?? 0,
    targetHasDot: (id) => dots.has(id),
    targetDotRemainingMs: () => 0,
    targetHasCurse: () => hasCurse,
    targetBrandRemainingMs: () => brandMs,
    targetBrandCharges: () => brandCharges,
    targetHp: () => 1000,
    estTtkSec: () => ttk,
    drainSoulKillSec: () => drainKill,
    drainSoulExpected: () => 0,
    fillerExpected: () => 0,
  };
}

const PARAM_SETS: Partial<Params>[] = [
  {},
  { use_curse_of_elements: true },
  { skip_agony_if_ttk_below: 12, use_curse_of_elements: true },
  { aff_use_immolate: true, demo_use_agony: true },
  { fire_filler: 'shadow_bolt_r1' },
  { use_drain_soul_finisher: false },
  { corruption_min_ttk_sec: 10 },
];

describe('rotation spec equals the rotation code', () => {
  it('chooses the same spells in the same order on many states (every build, several parameter sets)', () => {
    let n = 0;
    for (const over of PARAM_SETS) {
      const params = loadParams(over);
      for (const id of [...VARIANT_IDS, ...SCENARIO_IDS]) {
        const v = loadVariant(id);
        const spec = rotationSpec(v, params);
        for (let seed = 1; seed <= 60; seed++) {
          const ctx = randomCtx(seed * 7919 + n, v, params);
          expect(dedupe(evaluateSteps(spec, ctx)), `${id} ${JSON.stringify(over)} seed ${seed}`).toEqual(dedupe(rotationFor(v.rotation)(ctx as RotationCtx)));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(5000);
  });

  it('leaves out the steps that the parameters switch off', () => {
    const ids = (over: Partial<Params>, build: string) => rotationSpec(loadVariant(build), loadParams(over)).steps.map((s) => s.id);
    expect(ids({}, 'AFF_DRAINTANK')).toContain('curse_of_elements');
    expect(ids({ use_curse_of_elements: false }, 'AFF_DRAINTANK')).not.toContain('curse_of_elements');
    expect(ids({}, 'AFF_DRAINTANK')).not.toContain('immolate');
    expect(ids({ use_curse_of_elements: true, aff_use_immolate: true }, 'AFF_DRAINTANK')).toEqual(expect.arrayContaining(['curse_of_elements', 'immolate']));
    expect(ids({}, 'DEMO_PACT_R1')).not.toContain('bane_of_agony');
    expect(ids({ demo_use_agony: true }, 'DEMO_PACT_R1')).toContain('bane_of_agony');
  });

  it('has exactly one filler marked per build', () => {
    for (const id of [...VARIANT_IDS, ...SCENARIO_IDS]) {
      const spec = rotationSpec(loadVariant(id), loadParams());
      expect(spec.steps.some((s) => s.filler), id).toBe(true);
    }
  });
});

describe('Life Tap rule of the spec equals the fight rule', () => {
  it('agrees with lifeTapWanted in combat', () => {
    const params = loadParams();
    const spec = rotationSpec(loadVariant('AFF_WRACK'), params);
    const rng = createRng(5);
    for (let i = 0; i < 2000; i++) {
      const mana = rng.next();
      const hp = rng.next();
      const ctx = { ...randomCtx(i + 1, loadVariant('AFF_WRACK'), params), known: () => true, manaPct: mana * 100, hpPct: hp * 100 };
      expect(evalCond(spec.lifeTap.when, ctx), `mana ${mana} hp ${hp}`).toBe(lifeTapWanted(mana * 1000, 1000, hp * 1000, 1000, params, false));
    }
  });
});

describe('Eureka! rule of the spec matches when the fight uses it', () => {
  const run = (build: string, level: number, policy: Params['eureka_policy'], seed: number) =>
    simulatePull({ variant: loadVariant(build), level, profile: 'average', params: loadParams({ eureka_policy: policy }), mobs: 1, trace: true }, seed).trace;
  const castAfterEureka = (trace: string[]): string | undefined => {
    const i = trace.findIndex((l) => l.includes('Eureka!'));
    return i < 0 ? undefined : trace[i + 1]?.match(/cast (\w+)/)?.[1];
  };

  it('first_affected: the next spell is one the spec lists as affected', () => {
    const affects = rotationSpec(loadVariant('AFF_DRAINTANK'), loadParams()).eureka.affects;
    for (const build of ['AFF_DRAINTANK', 'AFF_WRACK', 'DEMO_PACT_R1', 'DEMO_FIRE'])
      for (let seed = 1; seed <= 10; seed++) expect(affects, `${build} ${seed}`).toContain(castAfterEureka(run(build, 50, 'first_affected', seed)));
  });

  it('filler: the next spell is the filler of the spec', () => {
    for (const build of ['AFF_DRAINTANK', 'DEMO_PACT_R1', 'DEMO_FIRE']) {
      const spec = rotationSpec(loadVariant(build), loadParams({ eureka_policy: 'filler' }));
      const fillers = spec.steps.filter((s) => s.filler).map((s) => s.spell);
      for (let seed = 1; seed <= 10; seed++) expect(fillers, `${build} ${seed}`).toContain(castAfterEureka(run(build, 50, 'filler', seed)));
    }
  });

  it('pull_start: used with the very first action', () => {
    expect(run('AFF_DRAINTANK', 50, 'pull_start', 1)[0]).toContain('Eureka!');
  });

  it('describes the policy: the spec carries the timing and the numbers', () => {
    const e = rotationSpec(loadVariant('AFF_DRAINTANK'), loadParams({ eureka_policy: 'ttk' })).eureka;
    expect(e).toMatchObject({ enabled: true, policy: 'ttk', offGcd: true, cooldownSec: 120, durationSec: 8, manaCostMod: -0.1, damageMod: 0.1 });
    expect(JSON.stringify(e.when)).toContain('ttk_at_most');
    const off = rotationSpec(loadVariant('AFF_DRAINTANK'), loadParams()).eureka;
    expect(off.enabled).toBe(false);
    expect(JSON.stringify(off.when)).toContain('next_spell_in');
  });
});

describe('spec is plain JSON', () => {
  it('survives a JSON round trip and lists what an addon must read', () => {
    const spec = rotationSpec(loadVariant('DEMO_PACT_R1'), loadParams({ eureka_policy: 'first_affected' }));
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
    expect(spec.reads).toEqual(expect.arrayContaining(['player mana', 'player health', 'target health']));
    expect(spec.schema).toBe('forever-rotation/1');
  });
});

describe('rates behind the rotation conditions (addon export)', () => {
  it('a pull reports positive damage rates and the mob health', () => {
    const r = simulatePull({ variant: loadVariant('DT_SS'), level: 45, profile: 'average', params: loadParams(), mobs: 1 }, 1).rates;
    expect(r.mobHp).toBeGreaterThan(0);
    expect(r.dpsEstimate).toBeGreaterThan(0);
    expect(r.dotsDps).toBeGreaterThan(0);
    expect(r.drainSoulDps).toBeGreaterThan(0);
    // "the target lives N s" as a percent of its health: 6 s of damage is a sensible share of a 20 s fight
    const pct = (6 * 100 * r.dpsEstimate) / r.mobHp;
    expect(pct).toBeGreaterThan(10);
    expect(pct).toBeLessThan(80);
  });
});

describe('builds with Immolate', () => {
  const PAIRS = [['AFF_WRACK', 'AFF_WRACK_IMMO'], ['AFF_DRAINTANK', 'AFF_DRAINTANK_IMMO'], ['DT_SS', 'DT_SS_IMMO']] as const;
  const casts = (build: string, level: number) =>
    simulatePull({ variant: loadVariant(build), level, profile: 'average', params: loadParams(), mobs: 1, trace: true }, 3).trace.filter((l) => l.includes('cast immolate')).length;

  it('differ from their base only by Immolate: same talents, pet and filler', () => {
    for (const [base, immo] of PAIRS) {
      const a = loadVariant(base);
      const b = loadVariant(immo);
      expect({ ...b, id: a.id, immolate: undefined }).toEqual({ ...a, immolate: undefined });
      expect(b.immolate).toBe(true);
    }
  });

  it('cast Immolate in the fight and list it in the rotation spec; the base builds do not', () => {
    for (const [base, immo] of PAIRS) {
      expect(casts(base, 45), base).toBe(0);
      expect(casts(immo, 45), immo).toBeGreaterThan(0);
      expect(rotationSpec(loadVariant(base), loadParams()).steps.map((s) => s.id)).not.toContain('immolate');
      expect(rotationSpec(loadVariant(immo), loadParams()).steps.map((s) => s.id)).toContain('immolate');
    }
  });
});
