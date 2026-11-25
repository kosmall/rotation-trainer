import { describe, expect, it } from 'vitest';
import { loadVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { runCell } from '../../src/forever/runner';
import { normalizeSettings, overridesOf } from '../../src/forever/web/api';

const pull = (build: string, level: number, over: Record<string, unknown>, extra: Record<string, unknown> = {}, seed = 7) =>
  simulatePull({ variant: loadVariant(build), level, profile: 'average', params: loadParams(over as never), mobs: 1, trace: true, ...extra } as never, seed);

describe('Eureka! (gnome racial)', () => {
  it('is off by default: no use, no change', () => {
    const r = pull('AFF_DRAINTANK', 45, {});
    expect(r.eurekaUses).toBe(0);
    expect(r.trace.some((l) => l.includes('Eureka'))).toBe(false);
  });

  it('pull_start uses it with the first cast and starts the 2 min cooldown', () => {
    const r = pull('AFF_DRAINTANK', 45, { eureka_policy: 'pull_start' });
    expect(r.eurekaUses).toBe(1);
    expect(r.trace[0]).toContain('Eureka!');
    // 120 s minus the rest of the pull after the first cast.
    expect(r.eurekaCdLeftMs).toBeGreaterThan(120_000 - r.pullSec * 1000 - 1);
    expect(r.eurekaCdLeftMs).toBeLessThanOrEqual(120_000);
  });

  it('is not used while on cooldown', () => {
    const r = pull('AFF_DRAINTANK', 45, { eureka_policy: 'pull_start' }, { startEurekaCdMs: 60_000 });
    expect(r.eurekaUses).toBe(0);
  });

  it('raises Drain Life ticks by 10% and lowers its mana cost by 10%', () => {
    const tick = (trace: string[]) => Number(trace.find((l) => l.includes('tick drain_life'))?.match(/drain_life (\d+)/)?.[1]);
    const off = pull('AFF_DRAINTANK', 45, {});
    const on = pull('AFF_DRAINTANK', 45, { eureka_policy: 'filler' });
    expect(tick(on.trace) / tick(off.trace)).toBeCloseTo(1.1, 1);
    expect(on.manaSpent).toBeLessThan(off.manaSpent);
  });

  it('the filler policy waits for the filler (Corruption and Bane do not trigger it)', () => {
    const r = pull('AFF_DRAINTANK', 45, { eureka_policy: 'filler' });
    const i = r.trace.findIndex((l) => l.includes('Eureka!'));
    expect(i).toBeGreaterThan(0);
    expect(r.trace[i + 1]).toContain('cast drain_life');
  });

  it('does not change Corruption (not a modified spell)', () => {
    const dmg = (trace: string[]) => trace.filter((l) => l.includes('tick corruption')).map((l) => l.match(/corruption (\d+)/)?.[1]);
    const off = pull('AFF_DRAINTANK', 45, {});
    const on = pull('AFF_DRAINTANK', 45, { eureka_policy: 'pull_start' });
    expect(dmg(on.trace).slice(0, 3)).toEqual(dmg(off.trace).slice(0, 3));
  });

  it('raises kills per hour for a drain build when used with the filler', () => {
    const run = (p: Record<string, unknown>) => runCell({ variant: loadVariant('AFF_DRAINTANK'), level: 45, profile: 'average', params: loadParams(p as never), mobs: 1 } as never, 40, 1).metrics;
    const off = run({});
    const on = run({ eureka_policy: 'filler' });
    expect(on.killsPerHour).toBeGreaterThan(off.killsPerHour);
    expect(on.eurekaPerHour).toBeGreaterThan(0);
    // One use per 2 minutes at most, plus the first use of every session.
    expect(on.eurekaPerHour).toBeLessThan((3600 / 120) * 1.5);
  });

  it('is a setting of the web app: off by default, mapped to the parameter', () => {
    expect(normalizeSettings({}).eureka).toBe('off');
    expect(normalizeSettings({ eureka: 'nope' as never }).eureka).toBe('off');
    expect(overridesOf(normalizeSettings({ eureka: 'ttk' })).eureka_policy).toBe('ttk');
  });
});
