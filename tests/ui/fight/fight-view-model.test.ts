import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock, destructionWarlock } from '../../../src/data/classes/warlock/destruction';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { runBot } from '../../../src/bot/bot';
import { applySetup } from '../../../src/setup/applySetup';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../../src/setup/defaults';
import type { PriorityStep } from '../../../src/data/types';
import type { Simulation } from '../../../src/engine/sim';
import type { LogEvent } from '../../../src/engine/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { clockText, logTicker, meterRows, nextUp, nextUpRows, soFar, targetDebuffViews, topRows } from '../../../src/ui/fight/fightViewModel';

/** The default setup with a few buffs (Heroism, the potion, a raid debuff): items and auras in the fight. */
function appliedFight() {
  const config = normalizeSetup(
    { ...structuredClone(DEFAULT_SETUP), enabledBuffs: ['heroism', 'destruction-potion', 'misery', 'arcane-brilliance'] },
    SETUP_CATALOG,
  );
  return applySetup({ buildSpec: (w, g, t) => buildDestructionWarlock(w, g, undefined, t), catalog: SETUP_CATALOG, config });
}

/** The bot's walk at one snapshot (src/bot/bot.ts pressFirstCastable): the index it presses, or -1. */
function botPress(sim: Simulation, priority: readonly PriorityStep[]): number {
  const s = sim.snapshot();
  for (let i = 0; i < priority.length; i++) {
    const step = priority[i]!;
    if (step.when && !step.when(s)) continue;
    if (step.kind === 'wait') {
      if (s.phase === 'ready') continue;
      return -1;
    }
    if (step.spellId === s.queuedSpellId) return i;
    if (sim.cast(step.spellId).ok) return i;
  }
  return -1;
}

describe('fight view-models', () => {
  it('clockText formats m:ss.s and whole minutes', () => {
    expect(clockText(0)).toBe('0:00.0');
    expect(clockText(34_240)).toBe('0:34.2');
    expect(clockText(2992)).toBe('0:03.0'); // rounded like secondsText
    expect(clockText(60_000, true)).toBe('1:00');
    expect(clockText(125_900)).toBe('2:05.9');
  });

  it('meter rows sum to damageTotal (a whole bot fight), largest first, shares sum to 1', () => {
    const fight = appliedFight();
    const sim = createFightSimulation(fight, 4242, SPELL_QUEUE_WINDOW_MS);
    runBot(sim, fight.spec.priority);
    const s = sim.snapshot();
    const rows = meterRows(sim.log(), s.nowMs, fight.spec);
    expect(rows.length).toBeGreaterThan(2);
    const sum = rows.reduce((a, r) => a + r.total, 0);
    expect(sum).toBeCloseTo(s.damageTotal, 6);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.total).toBeGreaterThanOrEqual(rows[i]!.total);
    expect(rows.find((r) => r.id === 'shadow-bolt')?.name).toBe('Shadow Bolt');
    expect(rows[0]!.dps).toBeCloseTo(rows[0]!.total / (s.nowMs / 1000), 9);
    // Top 5 and "Other" keep the total.
    const top = topRows(rows, 2);
    expect(top).toHaveLength(3);
    expect(top.reduce((a, r) => a + r.total, 0)).toBeCloseTo(s.damageTotal, 6);
    // Icon kinds come from the fight's item-icon ids.
    expect(meterRows(sim.log(), s.nowMs, fight.spec, new Set(['shadow-bolt'])).find((r) => r.id === 'shadow-bolt')?.iconKind).toBe('item');
    expect(rows.find((r) => r.id === 'shadow-bolt')?.iconKind).toBe('spell');
    // Only entries up to `nowMs` count.
    expect(meterRows(sim.log(), 0, fight.spec)).toEqual([]);
  });

  it('nextUp matches the bot\'s first castable step at every idle moment of a fight', () => {
    const fight = appliedFight();
    const priority = fight.spec.priority;
    const sim = createFightSimulation(fight, 777, SPELL_QUEUE_WINDOW_MS);
    let checked = 0;
    while (sim.snapshot().phase !== 'ended') {
      const s = sim.snapshot();
      const idle = s.cast === null && (s.phase === 'ready' || s.nowMs >= s.gcdEndsAtMs);
      // A bot that presses only when idle (no cast, GCD over): every press is a checked decision.
      if (idle) {
        const expected = nextUp(priority, s, fight.spec.spells);
        expect(botPress(sim, priority), `at ${s.nowMs} ms`).toBe(expected);
        checked++;
      }
      if (sim.snapshot().phase === 'ended') break;
      sim.advanceTo(sim.snapshot().nowMs + 10);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('nextUpRows marks the pick "now" and gives the others a reason', () => {
    const sim = createFightSimulation({ spec: destructionWarlock, sim: { scheduledAuras: [], distanceFromTarget: 28, durationMs: 60_000 } }, 1, SPELL_QUEUE_WINDOW_MS);
    const s = sim.snapshot();
    const rows = nextUpRows(destructionWarlock.priority, s, destructionWarlock.spells, 4);
    expect(rows.length).toBeLessThanOrEqual(4);
    expect(rows.filter((r) => r.state === 'now')).toHaveLength(1);
    expect(rows.find((r) => r.state === 'now')?.index).toBe(nextUp(destructionWarlock.priority, s, destructionWarlock.spells));
  });

  it('soFar: active time and DoT uptimes in [0, 1]; null before any time', () => {
    const fight = appliedFight();
    const sim = createFightSimulation(fight, 99, SPELL_QUEUE_WINDOW_MS);
    expect(soFar(sim.snapshot(), sim.log(), fight.spec)[0]!.value).toBeNull();
    runBot(sim, fight.spec.priority);
    const rows = soFar(sim.snapshot(), sim.log(), fight.spec);
    expect(rows[0]!.label).toBe('Active time (GCD)');
    expect(rows[0]!.value).toBeGreaterThan(0.8);
    for (const r of rows) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(1);
    }
    expect(rows.some((r) => r.label === 'Immolate uptime' && (r.value ?? 0) > 0.5)).toBe(true);
  });

  it('logTicker gives the last n readable lines, newest first', () => {
    const log: LogEvent[] = [
      { atMs: 0, type: 'cast-start', spellId: 'shadow-bolt' },
      { atMs: 2400, type: 'cast-complete', spellId: 'shadow-bolt' },
      { atMs: 3800, type: 'impact', spellId: 'shadow-bolt' },
      { atMs: 3800, type: 'damage', spellId: 'shadow-bolt', amount: 4812, crit: true },
      { atMs: 4000, type: 'tick', spellId: 'corruption', auraId: 'corruption', amount: 612 },
      { atMs: 4100, type: 'miss', spellId: 'shadow-bolt' },
    ];
    const rows = logTicker(log, 3, destructionWarlock);
    expect(rows.map((r) => `${r.subject} ${r.text}`)).toEqual(['Shadow Bolt misses', 'Corruption ticks for 612', 'Shadow Bolt crits for 4,812']);
    expect(rows[0]!.tone).toBe('shadow');
  });

  it('targetDebuffViews: own first with time and charges, others after, labels in words', () => {
    const views = targetDebuffViews(
      {
        misery: { auraId: 'misery', stacks: 1, charges: 0, remainingMs: 3_600_000 },
        immolate: { auraId: 'immolate', stacks: 1, charges: 0, remainingMs: 4050 },
        'shadow-vulnerability': { auraId: 'shadow-vulnerability', stacks: 1, charges: 3, remainingMs: 8600 },
      },
      destructionWarlock,
      new Set(['misery']),
      30_000,
      'running',
    );
    expect(views.map((v) => v.label)).toEqual([
      'Immolate, 4.1s left',
      expect.stringMatching(/^Shadow Vulnerability, 8\.6s left, 3 charges$/),
      expect.stringMatching(/, 30s left$/),
    ]);
    expect(views.map((v) => v.variant)).toEqual(['mine', 'mine', 'other']);
    expect(views[0]!.expiring).toBe(true);
    expect(views[1]!.expiring).toBe(false);
  });
});
