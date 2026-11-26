import { describe, expect, it } from 'vitest';
import { VARIANT_IDS } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { loadVariant } from '../../src/forever/builds';
import { runCell } from '../../src/forever/runner';
import { DEFAULT_SETTINGS, normalizeSettings, overridesOf, POLICIES, runJob } from '../../src/forever/web/api';
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
  it('duel returns a level result, and a sweep covers 10-59', () => {
    const d = runJob({ kind: 'duel', settings: { ...S, sessions: 5 }, a: 'AFF_WRACK', b: 'DEMO_PACT_R1', sweep: false });
    if (d.kind !== 'duel') throw new Error('kind');
    expect(d.at.level).toBe(45);
    expect(d.sweep).toBeNull();
    const s = runJob({ kind: 'sweep', settings: { ...S, sessions: 5 }, builds: ['AFF_WRACK'] });
    if (s.kind !== 'sweep') throw new Error('kind');
    expect(s.levels).toHaveLength(50);
    expect(s.series[0]?.kph).toHaveLength(50);
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

describe('Major Spellstone option', () => {
  it('is off by default and normalizes to a boolean', () => {
    expect(DEFAULT_SETTINGS.spellstone).toBe(false);
    expect(normalizeSettings({ spellstone: true }).spellstone).toBe(true);
    expect(normalizeSettings({ spellstone: 'yes' as unknown as boolean }).spellstone).toBe(false);
  });
  it('adds haste and Shadow spell power, and changes the results', () => {
    expect(overridesOf({ ...DEFAULT_SETTINGS, spellstone: true })).toMatchObject({ haste_pct: 2, shadow_spell_power_bonus: 21 });
    expect(overridesOf(DEFAULT_SETTINGS)).not.toHaveProperty('haste_pct');
    const kph = (spellstone: boolean) => {
      const r = runJob({ kind: 'ranking', settings: { ...DEFAULT_SETTINGS, level: 50, sessions: 40, spellstone } });
      if (r.kind !== 'ranking') throw new Error('kind');
      return new Map(r.rows.map((x) => [x.metrics.variant, x.metrics]));
    };
    const off = kph(false);
    const on = kph(true);
    for (const [id, m] of off) {
      const w = on.get(id)!;
      // Every build kills faster. Kills per hour rise too, except for the mana-hungry Immolate builds: faster casts
      // spend mana faster, so they stop for food more often (DT_SS_IMMO at 50: about -0.5 kills per hour).
      expect(w.ttkMean, `${id} time to kill`).toBeLessThan(m.ttkMean);
      if (!id.endsWith('_IMMO')) expect(w.killsPerHour, `${id} kills per hour`).toBeGreaterThan(m.killsPerHour);
    }
  });
});
