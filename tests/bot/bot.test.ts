import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import type { PriorityStep } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import type { CastResult, LogEvent } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec } from '../fixtures/testSpec';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WINDOWS = [SPELL_QUEUE_WINDOW_MS, 0];

/** The Destruction Simulation exactly as the UI builds it (spell queue window from ratings.ts). */
function destructionSim(seed: number, opts: { infiniteMana?: boolean; spellQueueWindowMs?: number } = {}) {
  return new Simulation({
    spec: destructionWarlock,
    target: BOSS_TARGET,
    seed,
    spellQueueWindowMs: opts.spellQueueWindowMs ?? SPELL_QUEUE_WINDOW_MS,
    infiniteMana: opts.infiniteMana ?? false,
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const completed = (log: readonly LogEvent[], spellId?: string) =>
  log.filter((e) => e.type === 'cast-complete' && (spellId === undefined || e.spellId === spellId));

/** Records every `cast` the bot makes: spell, result and the snapshot mana at the press. */
function recordCasts(sim: Simulation) {
  const presses: { spellId: string; result: CastResult; mana: number; nowMs: number }[] = [];
  const cast = sim.cast.bind(sim);
  sim.cast = (spellId: string) => {
    const { mana, nowMs } = sim.snapshot();
    const result = cast(spellId);
    presses.push({ spellId, result, mana, nowMs });
    return result;
  };
  return presses;
}

/**
 * Time (ms) `auraId` was on the target, from the log's aura-apply / aura-fade entries (a refresh
 * logs a second apply without a fade). `from` is the first apply; `to` is when the last
 * application ended (its fade, or the fight end if it was still up).
 */
function auraUptime(log: readonly LogEvent[], auraId: string, durationMs: number) {
  let upMs = 0;
  let since: number | null = null;
  let from: number | null = null;
  let to = 0;
  let applies = 0;
  for (const e of log) {
    if (e.auraId !== auraId) continue;
    if (e.type === 'aura-apply') {
      applies++;
      from ??= e.atMs;
      since ??= e.atMs;
    } else if (e.type === 'aura-fade' && since !== null) {
      upMs += e.atMs - since;
      to = e.atMs;
      since = null;
    }
  }
  if (since !== null) {
    upMs += durationMs - since;
    to = durationMs;
  }
  return { upMs, from: from ?? durationMs, to, applies };
}

describe('runBot', () => {
  it('bot on the fixture spec casts zap every 8000 ms and fills with bolt', () => {
    // Zap when ready; else Bolt, but only while it ends before Zap is ready again (Bolt is a
    // 2000 ms cast), so Bolt never delays Zap.
    const priority: PriorityStep[] = [
      { spellId: 'zap', label: 'Zap', hint: 'on cooldown' },
      {
        spellId: 'bolt',
        label: 'Bolt',
        hint: 'filler',
        when: (s) => (s.cooldownRemainingMs.zap ?? 0) >= 2000,
      },
    ];
    for (const spellQueueWindowMs of WINDOWS) {
      const sim = new Simulation({
        spec: makeTestSpec({ priority }),
        target: TEST_TARGET,
        seed: 1,
        infiniteMana: true,
        spellQueueWindowMs,
      });
      const result = runBot(sim, priority);
      const log = sim.log();
      expect(sim.snapshot().phase).toBe('ended');

      // Zap (instant, GCD 1500, cooldown 8000) at 0, 8000, ..., 56000: 8 casts.
      expect(completed(log, 'zap').map((e) => e.atMs)).toEqual([0, 8000, 16000, 24000, 32000, 40000, 48000, 56000]);
      // Each 8000 ms period: Bolt starts at +1500, +3500, +5500 (GCD end, then back to back),
      // completing at +3500, +5500, +7500; Zap's remaining cooldown is then 500 < 2000, so the bot
      // waits until +8000. Last period (56000): the bolt started at 59500 is cut off at 60000.
      const boltEnds = completed(log, 'bolt').map((e) => e.atMs);
      const expectedBoltEnds = [0, 1, 2, 3, 4, 5, 6, 7]
        .flatMap((k) => [3500, 5500, 7500].map((t) => k * 8000 + t))
        .filter((t) => t <= 60000);
      expect(boltEnds).toEqual(expectedBoltEnds);
      expect(log.filter((e) => e.type === 'cast-start' && e.spellId === 'bolt').at(-1)?.atMs).toBe(59500);

      // TEST_TARGET never misses and the fixture has 0% crit, no set pieces (no set bonus) and no
      // damage modifiers: 8 zaps x 50 + (7 periods x 3 + 1) bolts x 100 = 400 + 22 x 100 = 2600.
      expect(boltEnds).toHaveLength(22);
      expect(result.damageTotal).toBe(2600);
      expect(result.dps).toBeCloseTo(2600 / 60, 9);
    }
  });

  it('a rejected first step falls through; a priority that cannot start the fight throws instead of looping', () => {
    // needy requires dotAura: rejected ('missing-aura') in ready, which must not start the fight.
    const stuck = new Simulation({ spec: makeTestSpec(), target: TEST_TARGET, seed: 1 });
    expect(() => runBot(stuck, [{ spellId: 'needy', label: 'Needy', hint: '' }])).toThrow(/start the fight/);
    expect(stuck.snapshot().phase).toBe('ready');
    expect(stuck.log()).toEqual([]);

    // needy rejected -> falls through to dot; afterwards needy is cast whenever dotAura is up.
    const sim = new Simulation({ spec: makeTestSpec(), target: TEST_TARGET, seed: 1, infiniteMana: true });
    runBot(sim, [
      { spellId: 'needy', label: 'Needy', hint: '' },
      { spellId: 'dot', label: 'Dot', hint: '' },
    ]);
    const casts = completed(sim.log()).map((e) => [e.atMs, e.spellId]);
    expect(casts.slice(0, 3)).toEqual([
      [0, 'dot'],
      [1500, 'needy'],
      [3000, 'dot'],
    ]);
  });

  it('Destruction priority beats a shadow-bolt-only bot in DPS (same seed, infiniteMana)', () => {
    const boltOnly: PriorityStep[] = [{ spellId: 'shadow-bolt', label: 'Shadow Bolt', hint: 'only' }];
    const seeds = SEEDS.slice(0, 5);
    const full = seeds.map((seed) => runBot(destructionSim(seed, { infiniteMana: true }), destructionWarlock.priority).dps);
    const sbOnly = seeds.map((seed) => runBot(destructionSim(seed, { infiniteMana: true }), boltOnly).dps);
    // CoE (+10% fire and shadow), Immolate, Corruption and the Shadowburn finisher: well above.
    expect(mean(full)).toBeGreaterThan(mean(sbOnly) * 1.1);
  });

  it('bot run is deterministic for a given seed', () => {
    for (const spellQueueWindowMs of WINDOWS) {
      const a = destructionSim(42, { spellQueueWindowMs });
      const b = destructionSim(42, { spellQueueWindowMs });
      const ra = runBot(a, destructionWarlock.priority);
      const rb = runBot(b, destructionWarlock.priority);
      expect(rb).toEqual(ra);
      expect(b.log()).toEqual(a.log());
      expect(b.snapshot()).toEqual(a.snapshot());
    }
    // A different seed gives a different fight.
    const c = destructionSim(43);
    runBot(c, destructionWarlock.priority);
    const a = destructionSim(42);
    runBot(a, destructionWarlock.priority);
    expect(c.log()).not.toEqual(a.log());
  });

  /*
   * Expected DPS of the priority with real mana, from the verified numbers (docs/data-sources.md,
   * sections "Task 3", "Task 12a" and "Task 12b"; gear totals from "Default gear totals"):
   *
   * Stats: shadow power 1117 + 53 + Fel Armor 130 = 1300, fire power 1247.
   *   crit 1.7 + 339 / 22.0769 + 454.65 x 0.0122 = 22.60%, +5 Devastation +3 Backlash = 30.60%
   *   (Destruction spells); hit 196 / 12.6154 = 15.54% -> miss 17 - 15.54 = 1.46%;
   *   crit multiplier 1.5 + 0.5 Ruin + 0.09 meta = 2.09; haste 45 / 15.769 = 2.85%: Shadow Bolt
   *   2431 ms, Immolate 1458 ms, Corruption 1945 ms, GCD 1458 ms; resist x0.955; CoE x1.10.
   *   Expected hit/crit factor of a direct Destruction spell: 0.9854 x (1 + 0.3060 x 1.09) = 1.3141.
   * Shadow Bolt: (575.5 + (0.857 + 0.2 S&F) x 1300) x 1.15 DS x 1.06 4pc x 1.10 x 0.955 = 2496.6,
   *   x 1.3141 = 3280.7; ISB (x1.2) is up for a bolt when one of the 4 previous bolts crit:
   *   1 - (1 - 0.9854 x 0.3060)^4 = 0.762 -> x1.152 -> 3780 per bolt.
   * Immolate: direct (331.5 + 0.2 x 1247) x 1.06 Emberstorm x 1.10 x 0.955 x 1.3141 = 850;
   *   DoT (615 + 0.65 x 1247) x 1.06 x 1.10 x 0.955 x 0.9854 hit = 1564 -> 2414 per cast.
   * Corruption: (900 + 0.936 x 1300) x 1.15 x 1.10 x 0.955 x 1.152 ISB x 0.9854 = 2903 per cast.
   * Shadowburn: (631 + 0.429 x 1300) x 1.15 x 1.10 x 0.955 x 1.3141 x 1.152 = 2170, once.
   * Timeline (60 s): CoE 1 GCD (1458); Immolate 3 casts (the APL rule needs cast + 15 s of fight
   *   left: refreshes near 17 s and 32 s, none near 47 s) = 4374; Corruption 2 or 3 casts (needs
   *   2 + 18 s left; the third is borderline near 40 s), take 2.5 = 4862; the finisher window
   *   (last Shadow Bolt decision point within 2500 ms of the end) about 1285 on average; mana:
   *   9429 max, no mp5 and spirit regen only outside the five-second rule (never while
   *   chain-casting); spend CoE 260 + 3 x 422.75 + 2.5 x 370 + 489 + N x 399 exceeds 9429 for
   *   N ~ 19.7, so 1 Life Tap (582 + 0.8 x 1300 = 1622 mana) = 1458.
   *   Shadow Bolts: (60000 - 1458 - 4374 - 4862 - 1285 - 1458) / 2431 = 19.15.
   * Total: 19.15 x 3780 + 3 x 2414 + 2.5 x 2903 + 2170 = 72387 + 7242 + 7258 + 2170 = 89057
   *   -> 1484 DPS. Band: +-12%, i.e. [1306, 1662]. The mean over 10 seeds must fall inside: crits,
   *   ISB and misses give a per-seed standard deviation of about 130 DPS (measured), so about 41
   *   (2.8%) for the mean. Measured (Task 13 report): 1483 (window 400), 1487 (window 0).
   */
  const EXPECTED_DPS = 1484;
  const DPS_LO = Math.round(EXPECTED_DPS * 0.88);
  const DPS_HI = Math.round(EXPECTED_DPS * 1.12);

  for (const spellQueueWindowMs of WINDOWS) {
    it(`bot DPS with real mana stays within [lo, hi] (spell queue window ${spellQueueWindowMs} ms)`, () => {
      const runs = SEEDS.map((seed) => {
        const sim = destructionSim(seed, { spellQueueWindowMs });
        const presses = recordCasts(sim);
        // Steps at which the bot pressed while free (no cast, GCD over, nothing queued) and
        // nothing was accepted: time lost to the bot itself.
        let idleSteps = 0;
        const step = sim.snapshot.bind(sim);
        let lastPressCount = 0;
        sim.advanceTo = ((advance) => (timeMs: number) => {
          const s = step();
          const fresh = presses.slice(lastPressCount);
          lastPressCount = presses.length;
          const free = s.cast === null && s.gcdEndsAtMs <= s.nowMs && s.queuedSpellId === null;
          if (s.phase === 'running' && free && !fresh.some((p) => p.result.ok)) idleSteps++;
          advance(timeMs);
        })(sim.advanceTo.bind(sim));
        const result = runBot(sim, destructionWarlock.priority);
        return { sim, result, presses, idleSteps, log: sim.log() };
      });

      const dps = mean(runs.map((r) => r.result.dps));
      expect(dps).toBeGreaterThanOrEqual(DPS_LO);
      expect(dps).toBeLessThanOrEqual(DPS_HI);

      for (const { sim, result, presses, idleSteps, log } of runs) {
        const end = sim.snapshot();
        expect(end.phase).toBe('ended');
        expect(result).toEqual({ dps: end.dps, damageTotal: end.damageTotal });

        // Life Tap only when Shadow Bolt is unaffordable (mana < 420 x 0.95 = 399), once or twice
        // a fight. (A tap pressed in the last GCD can still be queued past the end: not cast.)
        const tapPresses = presses.filter((p) => p.spellId === 'life-tap' && p.result.ok);
        for (const t of tapPresses) expect(t.mana).toBeLessThan(420 * 0.95);
        const taps = completed(log, 'life-tap');
        expect(taps.length).toBeGreaterThanOrEqual(1);
        expect(taps.length).toBeLessThanOrEqual(2);

        // No 'no-mana' loops: the bot never stands idle, and mana rejections are rare.
        expect(idleSteps).toBe(0);
        const noMana = presses.filter((p) => !p.result.ok && p.result.reason === 'no-mana').length;
        const noManaDrops = log.filter((e) => e.type === 'queue-drop' && e.reason === 'no-mana').length;
        expect(noManaDrops).toBeLessThanOrEqual(taps.length);
        expect(noMana / presses.length).toBeLessThan(0.01);
        // The queued spell is not pressed again every step: a replacement only happens when a
        // higher step (a DoT refresh) becomes due inside the window.
        const replaced = log.filter((e) => e.type === 'queue-drop' && e.reason === 'replaced').length;
        expect(replaced).toBeLessThanOrEqual(completed(log, 'immolate').length + completed(log, 'corruption').length);

        // Curse of the Elements is up the whole fight but for misses.
        const coe = auraUptime(log, 'curse-of-the-elements', end.durationMs);
        expect(coe.upMs / end.durationMs).toBeGreaterThan(0.95);
        // Immolate and Corruption: refreshed, and up > 90% of the time from their first
        // application to the end of their last one (the APL rule stops refreshing once a full DoT
        // no longer fits in the fight).
        for (const [auraId, minApplies] of [
          ['immolate', 3],
          ['corruption', 2],
        ] as const) {
          const u = auraUptime(log, auraId, end.durationMs);
          expect(u.applies).toBeGreaterThanOrEqual(minApplies);
          expect(u.upMs / (u.to - u.from)).toBeGreaterThan(0.9);
        }

        // Shadowburn: at most once, as the last completed spell, in the final 2500 ms.
        const casts = completed(log);
        const burns = completed(log, 'shadowburn');
        expect(burns.length).toBeLessThanOrEqual(1);
        if (burns.length === 1) {
          expect(casts.at(-1)?.spellId).toBe('shadowburn');
          expect(burns[0]?.atMs).toBeGreaterThanOrEqual(end.durationMs - 2500);
        }
      }
    });
  }
});
