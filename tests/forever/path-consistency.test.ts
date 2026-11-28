// Audit 2026-11-28 (A5): the same build, level, profile, mobs and seed must give the same kills per hour in every
// calculation path: run (`runCell`), duel, EP (base run), discover (baseline task), and the web job.
import { describe, expect, it } from 'vitest';
import { loadVariant, type BuildVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { duelBuilds } from '../../src/forever/duel';
import { computeEp, sessionKph } from '../../src/forever/ep';
import { runCell } from '../../src/forever/runner';
import { stageSeed, runTask, QUICK_BUDGET, type DiscoverOptions } from '../../src/forever/discover/engine';
import { DEFAULT_SETTINGS, paramsOf, runJob } from '../../src/forever/web/api';
import { DEFAULT_GENES } from '../../src/forever/web/custom';

const SESSIONS = 6;
const SEED = 1;
const extra = { session_pulls: 8 };
const params = loadParams(extra);

// A template build, a build with `coe: false`, and a build played from genes.
const genesBuild: BuildVariant = { ...loadVariant('AFF_WRACK'), id: 'GENES_TEST', genes: DEFAULT_GENES };
const builds: [string, BuildVariant][] = [
  ['AFF_WRACK', loadVariant('AFF_WRACK')],
  ['DT_SS_NOCOE', loadVariant('DT_SS_NOCOE')],
  ['genes build', genesBuild],
];

describe('the same build, level and seed agree across duel, EP, discover and the web job', () => {
  for (const level of [40, 59]) {
    for (const [name, v] of builds) {
      it(`${name} at level ${level}`, () => {
        const cell = runCell({ variant: v, level, profile: 'average', params, mobs: 1 }, SESSIONS, SEED);
        const direct = cell.metrics.killsPerHour;

        const d = duelBuilds(v, loadVariant('AFF_WRACK'), { levels: [level], profile: 'average', sessions: SESSIONS, seed: SEED, params: extra, mobs: 1 });
        expect(d.results[0]!.a.killsPerHour, 'duel').toBe(direct);

        const ep = computeEp(v, level, { profile: 'average', sessions: SESSIONS, seed: SEED, params: extra, mobs: 1, bootstrap: 20 });
        // EP reports the mean of the per-session kills per hour (not the pooled value of `runCell`, see audit A5-004).
        const meanOfSessions = cell.raw.map(sessionKph).reduce((a, b) => a + b, 0) / cell.raw.length;
        expect(ep.baseKph, 'EP base run').toBeCloseTo(meanOfSessions, 6);

        if (!v.genes) {
          // The web ranking job (all builds, the web settings) lists the same number as a direct run with those settings.
          const settings = { ...DEFAULT_SETTINGS, level, sessions: SESSIONS, seed: SEED, mobs: 1 as const };
          const r = runJob({ kind: 'ranking', settings });
          if (r.kind !== 'ranking') throw new Error('kind');
          const row = r.rows.find((x) => x.metrics.variant === v.id)!;
          const viaWeb = runCell({ variant: v, level, profile: settings.profile, params: paramsOf(settings), mobs: 1 }, SESSIONS, SEED).metrics.killsPerHour;
          expect(row.metrics.killsPerHour, 'web ranking').toBe(viaWeb);
        }
      });
    }
  }

  it('the discover baseline task equals a direct run with the stage seed', () => {
    const o: DiscoverOptions = { level: 40, profile: 'average', mobs: 1, seed: SEED, perk: 0, params, top: 5, budget: { ...QUICK_BUDGET, finalSessions: SESSIONS } };
    const t = runTask(o, { kind: 'baseline', id: 'AFF_WRACK' });
    if (t.kind !== 'baseline') throw new Error('kind');
    const direct = runCell({ variant: loadVariant('AFF_WRACK'), level: 40, profile: 'average', params, mobs: 1, picks: { legacyPerk: 0 } }, SESSIONS, stageSeed(o, 'final'));
    expect(t.metrics.killsPerHour).toBe(direct.metrics.killsPerHour);
  });
});
