// Completion may switch the filler: a Drain Life build can play Wrack once its path reaches the talent.
import { describe, expect, it } from 'vitest';
import { customVariant, loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { completeBuilds, completeEtaSec, COMPLETE_FULL, greedyPath, rotationChoices, runCompleteTask, type CompleteCtx, type CompleteResult, type CompleteTask } from '../../src/forever/discover/complete';
import { enumerateCombos } from '../../src/forever/discover/space';
import { canonicalPicks } from '../../src/forever/discover/talent-search';
import { simulatePull } from '../../src/forever/fight';
import { validatePicks, type Ranks } from '../../src/forever/talents';
import { completedBuild } from '../../src/forever/web/discover';

const all = enumerateCombos(40, { fillers: ['drain_life', 'sb_r1'], minTtk: [0], pets: ['voidwalker'], sacrifice: false });
const find = (filler: string) => all.find((c) => c.genes.filler === filler && c.genes.agony && c.genes.corruption && c.genes.siphon && !c.genes.coe && !c.genes.immolate && !c.genes.drainSoulFinisher)!;
const drain = find('drain_life');
/** 30 points, all in Affliction: Wrack is the next legal pick. */
const ready = ranksAt(loadVariant('DT_SS_WRACK_70'), 39);
/** 27 points in Affliction without Siphon Life, which Wrack needs. */
const early: Ranks = { ...ready, malevolence: (ready.malevolence ?? 0) - 2 };
delete early.siphon_life;
const demo = ranksAt(loadVariant('DEMO_PACT_R1'), 40);
const params = loadParams({ session_pulls: 3 });
const base = { fromLevel: 39, toLevel: 42, profile: 'average', mobs: 1 as const, params, seed: 2 };
const cursed = { ...drain, genes: { ...drain.genes, coe: true }, id: `coe+${drain.id}` };
const budget = { restarts: 1, sessions: 2, maxSims: 10, finalSessions: 3 };
const row = { rank: 1, label: 'row', combo: drain, ranks: ready };
const inline = async (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) =>
  tasks.map((t) => {
    const r = runCompleteTask(t);
    onDone(r);
    return r;
  });
/** Runs the tasks, then lets a test change the results. */
const rigged = (change: (r: CompleteResult) => CompleteResult) => async (tasks: CompleteTask[], onDone: (r: CompleteResult) => void) => (await inline(tasks, onDone)).map(change);
/** The first switch (Wrack above 70%) takes its way to Wrack and its final runs are scaled. */
const wrackFinals = (factor: number) =>
  rigged((r) => {
    if (r.kind === 'complete-path' && r.choice === 1 && r.from === 'goal') return { ...r, cost: 1e-9 };
    if (r.kind === 'complete-final' && r.choice === 1) return { ...r, kph: r.kph.map((k) => k * factor) };
    return r;
  });

describe('rotations a completion may switch to', () => {
  const ids = (combo = drain, ranks = ready, from = 39, to = 59) => rotationChoices(combo, ranks, from, to).map((c) => c.genes.filler);
  it('a Drain Life build that can reach Wrack also tries Wrack above 70% and 50% health', () => {
    expect(ids()).toEqual(['drain_life', 'wrack_hp70', 'wrack_hp50']);
    const [, w] = rotationChoices(drain, ready, 39, 59);
    expect(w!.pets).toEqual(drain.pets);
    expect({ ...w!.genes, filler: 'drain_life' }).toEqual(drain.genes);
    expect(w!.id).not.toBe(drain.id);
  });
  it('keeps its own rotation when Wrack is out of reach or the filler is another', () => {
    expect(ids(drain, ready, 39, 39)).toEqual(['drain_life']);
    expect(ids(find('sb_r1'))).toEqual(['sb_r1']);
    // 31 points in Demonology: not enough are left for 31 in Affliction
    expect(ids(drain, demo, 40, 59)).toEqual(['drain_life']);
  });
});

describe('rotations without Curse of the Elements', () => {
  const shown = (combo = cursed, ranks = ready, from = 39, to = 59) => rotationChoices(combo, ranks, from, to).map((c) => `${c.genes.filler}${c.genes.coe ? '+coe' : ''}`);
  it('a build with the curse also tries every rotation without it', () => {
    expect(shown()).toEqual(['drain_life+coe', 'wrack_hp70+coe', 'wrack_hp50+coe', 'drain_life', 'wrack_hp70', 'wrack_hp50']);
    expect(shown({ ...find('sb_r1'), genes: { ...find('sb_r1').genes, coe: true } })).toEqual(['sb_r1+coe', 'sb_r1']);
    expect(shown(cursed, demo, 40, 59)).toEqual(['drain_life+coe', 'drain_life']);
    const list = rotationChoices(cursed, ready, 39, 59);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });
  it('a build without the curse never gets it added', () => {
    expect(shown(drain)).toEqual(['drain_life', 'wrack_hp70', 'wrack_hp50']);
  });
});

describe('the way to Wrack', () => {
  it('takes Wrack as soon as it is legal, Siphon Life first when missing', () => {
    const ctx: CompleteCtx = { ...base, combo: rotationChoices(drain, early, 36, 41)[1]!, baseRanks: early, fromLevel: 36, toLevel: 41, sessions: 1 };
    const path = greedyPath(ctx, new Map(), 'wrack');
    expect(validatePicks([...canonicalPicks(early), ...path]).ok).toBe(true);
    expect(path.slice(0, 4)).toContain('siphon_life');
    // 27 points at level 36: the 31st point is Wrack, at level 40
    expect(path[3]).toBe('wrack');
  });
});

describe('completing with a rotation switch', () => {
  it('switches when that is faster, from the level Wrack is taken', async () => {
    const [c] = await completeBuilds([row], base, budget, wrackFinals(3));
    expect(c!.switched).toEqual({ filler: 'wrack_hp70', level: 40 });
    expect(c!.combo.genes.filler).toBe('wrack_hp70');
    expect(c!.path[0]).toBe('wrack');
    expect(c!.perLevel.map((x) => x.pick)).toEqual(c!.path);
    expect(c!.fixedAvgKph).toBeGreaterThan(0);
    expect(c!.avgKph).toBeGreaterThan(c!.fixedAvgKph!);
    expect(c!.searchCost).toBeLessThanOrEqual(c!.greedySearchCost + 1e-12);
  }, 60000);
  it('keeps the rotation when switching is not faster', async () => {
    const [c] = await completeBuilds([row], base, budget, wrackFinals(0.1));
    expect(c!.combo.genes.filler).not.toBe('wrack_hp70');
    if (!c!.switched) expect(c!.avgKph).toBeCloseTo(c!.fixedAvgKph!, 9);
  }, 60000);
  it('is no switch when the path never takes Wrack', async () => {
    let fixed: string[] = [];
    const noWrack = rigged((r) => {
      if (r.kind === 'complete-path' && r.choice === 0 && r.from === 'greedy') fixed = r.path.filter((p) => p !== 'wrack');
      if (r.kind === 'complete-path' && r.choice > 0) return { ...r, path: ['suppression', 'suppression', 'suppression'], cost: 1e-9 };
      if (r.kind === 'complete-final' && r.choice > 0) return { ...r, kph: r.kph.map(() => 10000) };
      return r;
    });
    const [c] = await completeBuilds([row], base, budget, noWrack);
    expect(c!.switched).toBeUndefined();
    expect(c!.combo).toEqual(drain);
    expect(fixed).toBeDefined();
  }, 60000);
  it('a build that cannot switch carries no switch fields', async () => {
    const [c] = await completeBuilds([{ ...row, ranks: demo }], { ...base, fromLevel: 40, toLevel: 42 }, budget, inline);
    expect(c!.switched).toBeUndefined();
    expect(c!.fixedAvgKph).toBeUndefined();
  }, 60000);
  it('the saved build drains as before until Wrack, then channels it', async () => {
    const [c] = await completeBuilds([row], base, budget, wrackFinals(3));
    const variant = customVariant(completedBuild(c!, []));
    const casts = (level: number, spell: string) =>
      simulatePull({ variant, level, profile: 'average', params: loadParams({ mob_hp_mult: 2 }), trace: true }, 1).trace.filter((l) => l.includes(`cast ${spell} `)).length;
    expect(casts(39, 'wrack')).toBe(0);
    expect(casts(39, 'drain_life')).toBeGreaterThan(0);
    expect(casts(40, 'wrack')).toBeGreaterThan(0);
  }, 60000);
  /** Scales the final runs of the chosen rotation variants; `path` is rigged cheap for the way to Wrack. */
  const finals = (factor: (choice: number) => number) =>
    rigged((r) => {
      if (r.kind === 'complete-path' && r.from === 'goal') return { ...r, cost: 1e-9 };
      if (r.kind === 'complete-final' && r.choice > 0) return { ...r, kph: r.kph.map((k) => k * factor(r.choice)) };
      return r;
    });
  const cursedRow = { ...row, combo: cursed };

  it('drops the curse when that is faster, with the filler kept', async () => {
    // choice 3: the found filler without the curse
    const [c] = await completeBuilds([cursedRow], base, budget, finals((i) => (i === 3 ? 3 : 0.1)));
    expect(c!.noCurse).toBe(true);
    expect(c!.switched).toBeUndefined();
    expect(c!.combo.genes).toMatchObject({ coe: false, filler: 'drain_life' });
    expect(c!.avgKph).toBeGreaterThan(c!.fixedAvgKph!);
  }, 60000);
  it('drops the curse and switches to Wrack together', async () => {
    // choice 4: Wrack above 70% without the curse
    const [c] = await completeBuilds([cursedRow], base, budget, finals((i) => (i === 4 ? 3 : 0.1)));
    expect(c!.noCurse).toBe(true);
    expect(c!.switched).toEqual({ filler: 'wrack_hp70', level: 40 });
    expect(c!.combo.genes).toMatchObject({ coe: false, filler: 'wrack_hp70' });
    expect(c!.path[0]).toBe('wrack');
  }, 60000);
  it('keeps the curse when nothing is faster', async () => {
    const [c] = await completeBuilds([cursedRow], base, budget, finals(() => 0.1));
    expect(c!.noCurse).toBeUndefined();
    expect(c!.switched).toBeUndefined();
    expect(c!.combo).toEqual(cursed);
  }, 60000);
  it('a Wrack variant whose path never takes Wrack is not chosen, with or without the curse', async () => {
    const noWrack = rigged((r) => {
      if (r.kind === 'complete-path' && (r.choice === 4 || r.choice === 5)) return { ...r, path: ['suppression', 'suppression', 'suppression'], cost: 1e-9 };
      if (r.kind === 'complete-final' && r.choice > 0) return { ...r, kph: r.kph.map((k) => (r.choice >= 4 ? 10000 : k * 0.1)) };
      return r;
    });
    const [c] = await completeBuilds([cursedRow], base, budget, noWrack);
    expect(c!.combo).toEqual(cursed);
  }, 60000);
  it('counts the extra rotations in the time estimate', () => {
    const i = { stage: 'greedy', done: 1, total: 5, stageElapsedSec: 10, budget: COMPLETE_FULL, rows: 1, pathLength: 20 };
    expect(completeEtaSec({ ...i, choices: 3 })).toBeGreaterThan(completeEtaSec(i)!);
    expect(completeEtaSec({ ...i, choices: 6 })).toBeGreaterThan(completeEtaSec({ ...i, choices: 3 })!);
  });
});
