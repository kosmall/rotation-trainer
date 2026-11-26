import { describe, expect, it } from 'vitest';
import { customVariant, loadVariant, ranksAt } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { inlineRunner, QUICK_BUDGET, runTask, type DiscoverOptions, type Task, type TaskResult, type TopRow } from '../../src/forever/discover/engine';
import { enumerateCombos } from '../../src/forever/discover/space';
import { canonicalPicks, isLegal } from '../../src/forever/discover/talent-search';
import { runCell } from '../../src/forever/runner';
import { pointsAtLevel, validatePicks } from '../../src/forever/talents';
import { discoveredBuild, discoverOptions, workerCount } from '../../src/forever/web/discover';
import { discoverPool, type WorkerLike } from '../../src/forever/web/discover-client';
import { DEFAULT_SETTINGS } from '../../src/forever/web/api';

const ranks = ranksAt(loadVariant('DEMO_PACT_R1'), 40);
const [combo] = enumerateCombos(40, { fillers: ['drain_life'], minTtk: [6], pets: ['imp'], maxDots: 1 }).filter((c) => c.pets.sacrificed === 'voidwalker' && c.genes.agony && !c.genes.drainSoulFinisher);
const row = (r = ranks): TopRow => ({ rank: 1, combo: combo!, ranks: r, label: 'Agony → Drain Life; DoTs if TTK ≥ 6 s' }) as TopRow;

describe('saving a discovered build', () => {
  it('keeps the talents, the rotation and the pets', () => {
    expect(ranks.demonic_pact).toBe(1);
    expect(ranks.demonic_sacrifice).toBe(1);
    const b = discoveredBuild(row(), 40, []);
    expect(b.picks).toEqual(canonicalPicks(ranks));
    expect(validatePicks(b.picks).ok).toBe(true);
    expect(b.picks).toHaveLength(pointsAtLevel(40));
    expect(b.genes).toEqual(combo!.genes);
    expect(b.pet).toBe('imp');
    expect(b.sacrificed).toBe('voidwalker');
    expect(b.name.startsWith('L40 #1 ')).toBe(true);
    expect(b.name.length).toBeLessThanOrEqual(40);
    expect(discoveredBuild(row(), 40, [b.name]).name).not.toBe(b.name);
  });
  it('does not keep a sacrifice that a summoned pet ends', () => {
    const { demonic_pact: _p, soul_link: _s, ...noPact } = ranks;
    const r = { ...noPact, unholy_power: (noPact.unholy_power ?? 0) } as Record<string, number>;
    expect(discoveredBuild(row(r), 40, []).sacrificed).toBeNull();
  });
  it('plays at every level', () => {
    const v = customVariant(discoveredBuild(row(), 40, []));
    const p = loadParams({ session_pulls: 3 });
    for (const level of [10, 25, 40, 59]) expect(() => runCell({ variant: v, level, profile: 'average', params: p }, 1, 1)).not.toThrow();
  });
});

describe('discovery settings', () => {
  it('maps the app settings to search options', () => {
    const o = discoverOptions({ ...DEFAULT_SETTINGS, level: 40, mobs: 2 }, 'quick');
    expect(o).toMatchObject({ level: 40, mobs: 2, perk: 0, top: 20, budget: QUICK_BUDGET });
  });
  it('uses at most 8 workers', () => {
    expect(workerCount(16)).toBe(8);
    expect(workerCount(undefined)).toBe(4);
    expect(workerCount(2)).toBe(2);
  });
});

const opts: DiscoverOptions = { ...discoverOptions({ ...DEFAULT_SETTINGS, level: 40 }, 'quick'), params: loadParams({ session_pulls: 3 }), budget: { ...QUICK_BUDGET, screen: { starts: 1, evals: 3, sessions: 1 } } };
const tasks: Task[] = enumerateCombos(40, { fillers: ['sb_r1'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 1 }).slice(0, 6).map((c) => ({ kind: 'search', stage: 'screen', combo: c }));

class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  terminated = false;
  options: DiscoverOptions | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  constructor(private delay: (i: number) => number) {
    FakeWorker.all.push(this);
  }
  postMessage(m: { type?: string; options?: DiscoverOptions; i?: number; task?: Task }): void {
    if (m.type === 'init') {
      this.options = m.options ?? null;
      return;
    }
    const { i, task } = m as { i: number; task: Task };
    setTimeout(() => !this.terminated && this.onmessage?.({ data: { i, result: runTask(this.options as DiscoverOptions, task) } }), this.delay(i));
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('browser worker pool', () => {
  it('returns the results in task order', async () => {
    FakeWorker.all = [];
    const ctl = new AbortController();
    const pool = discoverPool(opts, 3, ctl.signal, () => new FakeWorker((i) => 30 - 5 * i));
    const seen: TaskResult[] = [];
    const out = await pool.runner(tasks, (r) => seen.push(r));
    expect(out).toEqual(await inlineRunner(opts)(tasks, () => undefined));
    expect(seen).toHaveLength(tasks.length);
    expect(FakeWorker.all).toHaveLength(3);
    pool.close();
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
  });
  it('stops every worker on abort', async () => {
    FakeWorker.all = [];
    const ctl = new AbortController();
    const pool = discoverPool(opts, 2, ctl.signal, () => new FakeWorker(() => 50));
    const p = pool.runner(tasks, () => undefined);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
  });
  it('runs inline without workers', async () => {
    const pool = discoverPool(opts, 4, new AbortController().signal, () => null);
    expect(await pool.runner(tasks.slice(0, 2), () => undefined)).toEqual(await inlineRunner(opts)(tasks.slice(0, 2), () => undefined));
  });
});
