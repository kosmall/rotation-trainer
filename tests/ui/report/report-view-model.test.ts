// The Report's view-models (UI redesign Task 4) on the golden fights: the default setup's and the
// raid-log setup's bot fights, seeds 1-10, played as the "played" fight. Per-spell sums equal the
// engine's damageTotal exactly; the cumulative DPS at the end is the fight's DPS, so its mean over
// the seeds is the golden mean; the bot replay (botRun) of a fight is that same fight.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { itemDbSync } from '../../../src/data/items/dbSync';
import type { LogEvent } from '../../../src/engine/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { botRun } from '../../../src/ui/report/botRun';
import {
  auraUptimes,
  buffWindows,
  castWindows,
  cumulativeDps,
  dpsSeries,
  filterLog,
  insights,
  logRows,
  makeNamer,
  ordinal,
  rotationRows,
  shareBelow,
  spellTable,
  spellTotals,
  targetAuraIds,
} from '../../../src/ui/report/reportView';
import { applyScenario, scenarios, SEEDS } from '../../fixtures/item-use-reference';

const db = itemDbSync();
const GOLDEN = { default: 1425.1766666666667, raidLog: 2294.108333333333 } as const;

function played(name: keyof typeof GOLDEN, seed: number) {
  const fight = applyScenario(scenarios()[name]!, db);
  const sim = createFightSimulation(fight, seed, SPELL_QUEUE_WINDOW_MS);
  runBot(sim, fight.spec.priority);
  return { fight, log: sim.log(), snapshot: sim.snapshot() };
}

const count = (log: readonly LogEvent[], type: LogEvent['type'], spellId: string) =>
  log.filter((e) => e.type === type && e.spellId === spellId).length;

describe('report view-models on the golden fights', () => {
  for (const name of ['default', 'raidLog'] as const) {
    it(`${name}: per-spell sums equal damageTotal exactly; casts, crits and misses match the log; the end of the cumulative DPS averages to the golden ${GOLDEN[name]}`, { timeout: 30000 }, () => {
      let total = 0;
      for (const seed of SEEDS) {
        const { fight, log, snapshot } = played(name, seed);
        const items = new Set(fight.spec.spells.filter((s) => s.item).map((s) => s.id));
        const rows = spellTable(log, snapshot.durationMs, items);
        const totals = spellTotals(rows, snapshot.durationMs);
        expect(totals.damage).toBe(snapshot.damageTotal);
        expect(totals.dps).toBe(snapshot.dps);
        expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9);
        for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.damage).toBeGreaterThanOrEqual(rows[i]!.damage);
        const sb = rows.find((r) => r.spellId === 'shadow-bolt')!;
        expect(sb.casts).toBe(count(log, 'cast-complete', 'shadow-bolt'));
        expect(sb.casts).toBe(snapshot.castCounts['shadow-bolt']);
        expect(sb.hits).toBe(count(log, 'damage', 'shadow-bolt'));
        expect(sb.crits).toBe(log.filter((e) => e.type === 'damage' && e.spellId === 'shadow-bolt' && e.crit).length);
        expect(sb.misses).toBe(count(log, 'miss', 'shadow-bolt'));
        expect(sb.critPct).toBeCloseTo(sb.crits / sb.hits, 12);
        expect(sb.dps).toBeCloseTo(sb.damage / 60, 9);
        expect(rows.reduce((a, r) => a + r.misses, 0)).toBe(log.filter((e) => e.type === 'miss' && !items.has(e.spellId!)).length);
        // No item action in the table.
        for (const r of rows) expect(items.has(r.spellId)).toBe(false);

        const series = dpsSeries(log, snapshot.durationMs);
        const cumulative = cumulativeDps(log, snapshot.durationMs);
        expect(series).toHaveLength(60);
        expect(cumulative).toHaveLength(60);
        expect(cumulative[59]!.t).toBe(60);
        expect(cumulative[59]!.dps).toBe(snapshot.dps);
        // The rolling window: the last point is the damage of the last 5 s over 5.
        const last5 = log.filter((e) => (e.type === 'damage' || e.type === 'tick') && e.atMs > 55_000).reduce((a, e) => a + e.amount!, 0);
        expect(series[59]!.dps).toBeCloseTo(last5 / 5, 9);
        total += cumulative[59]!.dps;
      }
      expect(total / SEEDS.length).toBe(GOLDEN[name]);
    });
  }

  it('botRun replays a fight with its setup and seed: the same log as the bot fight (the golden means come back)', { timeout: 30000 }, () => {
    for (const name of ['default', 'raidLog'] as const) {
      let total = 0;
      for (const seed of SEEDS) {
        const { fight, log } = played(name, seed);
        const last = { fight, seed };
        const run = botRun(last)!;
        expect(run.log).toEqual(log);
        expect(botRun(last)).toBe(run); // memoized per fight
        total += run.dps;
      }
      expect(total / SEEDS.length).toBe(GOLDEN[name]);
    }
  });

  it('botRun gives null when the bot cannot replay the fight (never a guess)', () => {
    const { fight } = played('default', 1);
    const broken = { fight: { ...fight, spec: { ...fight.spec, priority: [] } }, seed: 1 };
    expect(botRun(broken)).toBeNull();
  });

  it('uptimes: Immolate and Corruption from apply to fade, cut at the end; windows never overlap', () => {
    const { fight, log, snapshot } = played('default', 3);
    const ups = auraUptimes(log, snapshot.durationMs);
    const windows = buffWindows(log, snapshot.durationMs);
    for (const u of ups) {
      expect(u.uptime).toBeGreaterThanOrEqual(0);
      expect(u.uptime).toBeLessThanOrEqual(1);
      const w = windows.get(u.auraId)!;
      expect(w).toHaveLength(u.applications);
      for (let i = 1; i < w.length; i++) expect(w[i]![0]).toBeGreaterThanOrEqual(w[i - 1]![1]);
    }
    const immolate = ups.find((u) => u.auraId === 'immolate')!;
    expect(immolate.uptime).toBeGreaterThan(0.5);
    // Independent count: walk the log once.
    let up: number | null = null;
    let ms = 0;
    for (const e of log) {
      if (e.auraId !== 'immolate') continue;
      if (e.type === 'aura-apply' && up === null) up = e.atMs;
      if (e.type === 'aura-fade' && up !== null) {
        ms += e.atMs - up;
        up = null;
      }
    }
    if (up !== null) ms += 60_000 - up;
    expect(immolate.upMs).toBe(ms);
    const targets = targetAuraIds(fight.spec, fight.sim.scheduledAuras);
    expect(targets.has('immolate')).toBe(true);
    expect(targets.has('corruption')).toBe(true);
    expect(targets.has('heroism')).toBe(false);
  });

  it('cast windows: one per completed cast; instants are zero-length', () => {
    const { log } = played('default', 2);
    const casts = castWindows(log);
    expect(casts.get('shadow-bolt')).toHaveLength(count(log, 'cast-complete', 'shadow-bolt'));
    for (const [a, b] of casts.get('shadow-bolt')!) expect(b - a).toBeGreaterThan(1000);
    const corr = casts.get('corruption');
    if (corr) for (const [a, b] of corr) expect(b - a).toBeLessThanOrEqual(2000);
  });

  it('rotation rows: your counts against the bot counts per pressed spell, in priority order', () => {
    const { fight, snapshot } = played('default', 1);
    const bot = botRun({ fight, seed: 1 })!;
    const rows = rotationRows(fight.spec.priority, snapshot, bot.snapshot);
    expect(rows.length).toBeGreaterThan(2);
    expect(new Set(rows.map((r) => r.spellId)).size).toBe(rows.length);
    const sb = rows.find((r) => r.spellId === 'shadow-bolt')!;
    expect(sb.you).toBe(snapshot.castCounts['shadow-bolt']);
    expect(sb.bot).toBe(bot.snapshot.castCounts['shadow-bolt']);
    expect(rotationRows(fight.spec.priority, snapshot, null)[0]!.bot).toBeNull();
    // A spell you cast that no rule presses: listed after the rules with rank null.
    const extra = rotationRows(fight.spec.priority, { castCounts: { ...snapshot.castCounts, 'curse-of-agony': 2 }, useCounts: {} }, bot.snapshot);
    expect(extra.filter((r) => r.rank !== null)).toHaveLength(rows.length);
    expect(extra.at(-1)).toEqual({ spellId: 'curse-of-agony', label: 'curse-of-agony', rank: null, you: 2, bot: 0 });
  });

  it('insights: 2-4 sentences, only from the numbers; none without the bot', () => {
    const name = (id: string) => ({ immolate: 'Immolate', corruption: 'Corruption', 'shadow-bolt': 'Shadow Bolt' })[id] ?? id;
    const bot = { dps: 2000, uptimes: { immolate: 0.99, corruption: 0.97 }, casts: { 'shadow-bolt': 34, immolate: 6 } };
    const you = { dps: 1800, uptimes: { immolate: 0.884, corruption: 0.965 }, casts: { 'shadow-bolt': 31, immolate: 6 } };
    const out = insights(you, bot, name);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out[0]).toEqual({ kind: 'warn', text: 'Your DPS was 90.0% of the bot\'s (1,800.0 against 2,000.0) with the same setup and seed.' });
    expect(out[1]!.text).toBe('Immolate was up 88.4% of the fight; the bot kept it up 99.0%.');
    expect(out[2]!.text).toBe('You cast Shadow Bolt 31 times; the bot cast it 34 times.');
    expect(out[3]!.text).toMatch(/^Corruption uptime matched/);
    expect(insights(you, null, name)).toEqual([]);
    const same = insights(bot, bot, name);
    expect(same[0]!.kind).toBe('good');
    expect(same.length).toBeGreaterThanOrEqual(2);
  });

  it('log rows read in words and filter by text and kind', () => {
    const { fight, log } = played('default', 1);
    const namer = makeNamer(fight.spec);
    const rows = logRows(log, (id) => namer(id).name);
    expect(rows).toHaveLength(log.length);
    expect(rows.some((r) => r.text === 'Shadow Bolt hit' || r.text === 'Shadow Bolt crit')).toBe(true);
    const immolate = filterLog(rows, '  immolate ', null);
    expect(immolate.length).toBeGreaterThan(0);
    expect(immolate.every((r) => r.text.toLowerCase().includes('immolate'))).toBe(true);
    const damage = filterLog(rows, '', 'damage');
    expect(damage.every((r) => r.kind === 'damage')).toBe(true);
    expect(filterLog(rows, 'immolate', 'aura').every((r) => r.kind === 'aura')).toBe(true);
  });

  it('shareBelow reads the histogram; ordinal words', () => {
    const h = { binStart: 0, binWidth: 10, counts: [10, 20, 30, 40] };
    expect(shareBelow(h, 0)).toBe(0);
    expect(shareBelow(h, 10)).toBe(0.1);
    expect(shareBelow(h, 15)).toBe(0.2);
    expect(shareBelow(h, 50)).toBe(1);
    expect(shareBelow({ binStart: 5, binWidth: 0, counts: [3] }, 6)).toBe(1);
    expect(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '6th'].join()).toBe(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 6].map(ordinal).join(),
    );
  });
});
