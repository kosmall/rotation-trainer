import { describe, expect, it } from 'vitest';
import { VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { loadVariant } from '../../src/forever/builds';
import { runCell } from '../../src/forever/runner';
import { DEFAULT_SETTINGS, normalizeSettings, POLICIES, runJob } from '../../src/forever/web/api';
import { runOnMainThread } from '../../src/forever/web/client';

const S = { ...DEFAULT_SETTINGS, level: 45, sessions: 8 };

describe('forever web api', () => {
  it('normalizes settings', () => {
    expect(normalizeSettings({ level: 99, sessions: 1, profile: 'x', mobs: 2 })).toMatchObject({ level: 59, sessions: 5, profile: 'average', mobs: 2 });
    expect(normalizeSettings({ level: Number.NaN }).level).toBe(DEFAULT_SETTINGS.level);
  });
  it('ranking matches runCell and is sorted by kills per hour', () => {
    const r = runJob({ kind: 'ranking', settings: S });
    if (r.kind !== 'ranking') throw new Error('kind');
    expect(r.rows).toHaveLength(VARIANT_IDS.length);
    const kph = r.rows.map((x) => x.metrics.killsPerHour);
    expect([...kph].sort((a, b) => b - a)).toEqual(kph);
    expect(r.rows[0]?.vsBest).toBeNull();
    const row = r.rows[0]!;
    const direct = runCell({ variant: loadVariant(row.metrics.variant), level: 45, profile: 'average', params: loadParams(POLICIES.BEST_1MOB!.params), mobs: 1 }, 8, 1);
    expect(row.metrics.killsPerHour).toBe(direct.metrics.killsPerHour);
  });
  it('duel returns a level result, and a sweep covers 40-59', () => {
    const d = runJob({ kind: 'duel', settings: { ...S, sessions: 5 }, a: 'AFF_WRACK', b: 'DEMO_PACT_R1', sweep: false });
    if (d.kind !== 'duel') throw new Error('kind');
    expect(d.at.level).toBe(45);
    expect(d.sweep).toBeNull();
    const s = runJob({ kind: 'sweep', settings: { ...S, sessions: 5 }, builds: ['AFF_WRACK'] });
    if (s.kind !== 'sweep') throw new Error('kind');
    expect(s.levels).toHaveLength(20);
    expect(s.series[0]?.kph).toHaveLength(20);
  });
  it('rejects an unknown build', () => {
    expect(() => runJob({ kind: 'duel', settings: S, a: 'NOPE', b: 'AFF_WRACK', sweep: false })).toThrow(/unknown build/);
  });
  it('main-thread runner reports progress, matches runJob and can be aborted', async () => {
    const seen: number[] = [];
    const req = { kind: 'ranking', settings: { ...S, sessions: 5 } } as const;
    const res = await runOnMainThread(req, { onProgress: (d) => seen.push(d) });
    expect(seen.at(-1)).toBe(VARIANT_IDS.length);
    expect(res).toEqual(runJob(req));
    const c = new AbortController();
    c.abort();
    await expect(runOnMainThread(req, { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
