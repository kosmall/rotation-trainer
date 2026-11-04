// The second-by-second model of a fight (fight timeline and key fights Task K2; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 C, §3): buckets
// [N, N+1) s built from the log alone. On real bot fights the per-spell sums equal the engine's
// damageTotal and the Damage table, the aura time per second adds up to the uptimes, every event
// lands in exactly one second; pre-pull events, the fight's last ms, hostile and empty logs.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../../src/bot/bot';
import { SPELL_QUEUE_WINDOW_MS } from '../../../src/data/common/ratings';
import { itemDbSync } from '../../../src/data/items/dbSync';
import type { LogEvent } from '../../../src/engine/types';
import { createFightSimulation } from '../../../src/sim-runner/fight';
import { auraUptimes, makeNamer, spellTable, targetAuraIds } from '../../../src/ui/report/reportViewModel';
import {
  eventJumps,
  filterSeconds,
  jumpFrom,
  secondBuckets,
  secondText,
  secondsCsv,
  stateAt,
} from '../../../src/ui/report/secondsModel';
import { applyScenario, scenarios } from '../../fixtures/item-use-reference';

const db = itemDbSync();

function played(name: string, seed: number) {
  const fight = applyScenario(scenarios()[name]!, db);
  const sim = createFightSimulation(fight, seed, SPELL_QUEUE_WINDOW_MS);
  runBot(sim, fight.spec.priority);
  const spec = fight.spec;
  const opts = {
    items: new Set(spec.spells.filter((s) => s.item).map((s) => s.id)),
    hidden: new Set(spec.auras.filter((a) => a.hidden).map((a) => a.id)),
    targets: targetAuraIds(spec, fight.sim.scheduledAuras),
  };
  return { fight, log: sim.log(), snapshot: sim.snapshot(), opts, name: makeNamer(spec) };
}

describe('secondBuckets on real fights', () => {
  for (const [scenario, seed] of [
    ['default', 1],
    ['raidLog', 2],
    ['consumables', 3],
    ['long300', 4],
  ] as const) {
    it(`${scenario}: per-spell sums equal damageTotal and the Damage table; every event in one second; aura ms equal the uptimes`, () => {
      const { log, snapshot, opts } = played(scenario, seed);
      const durationMs = snapshot.durationMs;
      const buckets = secondBuckets(log, durationMs, opts);
      expect(buckets).toHaveLength(Math.ceil(durationMs / 1000));
      buckets.forEach((b, n) => {
        expect(b.second).toBe(n);
        expect(b.startMs).toBe(n * 1000);
        expect(b.endMs).toBe(Math.min((n + 1) * 1000, durationMs));
      });
      // Damage: the sum of every second is the engine's total, per spell the table's damage.
      expect(buckets.reduce((a, b) => a + b.damage, 0)).toBe(snapshot.damageTotal);
      expect(buckets.at(-1)!.cumulativeDamage).toBe(snapshot.damageTotal);
      expect(buckets.at(-1)!.cumulativeDps).toBe(snapshot.dps);
      const perSpell = new Map<string, number>();
      const hits = new Map<string, number>();
      for (const b of buckets) {
        expect(b.damage).toBe(b.spells.reduce((a, s) => a + s.damage, 0));
        for (const s of b.spells) {
          perSpell.set(s.spellId, (perSpell.get(s.spellId) ?? 0) + s.damage);
          hits.set(s.spellId, (hits.get(s.spellId) ?? 0) + s.hits);
        }
      }
      const table = spellTable(log, durationMs, opts.items);
      for (const row of table) {
        expect(perSpell.get(row.spellId) ?? 0).toBe(row.damage);
        expect(hits.get(row.spellId) ?? 0).toBe(row.hits);
      }
      // Each event in the second [N, N+1) its time falls in.
      expect(buckets.reduce((a, b) => a + b.events, 0)).toBe(log.length);
      for (const b of buckets) {
        for (const c of b.casts) expect(Math.min(buckets.length - 1, Math.floor(c.atMs / 1000))).toBe(b.second);
        for (const a of b.auras) expect(Math.min(buckets.length - 1, Math.floor(a.atMs / 1000))).toBe(b.second);
      }
      const casts = buckets.reduce((a, b) => a + b.casts.filter((c) => c.kind === 'complete' && !opts.items.has(c.spellId)).length, 0);
      expect(casts).toBe(Object.values(snapshot.castCounts).reduce((a, c) => a + c, 0));
      const uses = buckets.reduce((a, b) => a + b.items.length, 0);
      expect(uses).toBe(Object.values(snapshot.useCounts).reduce((a, c) => a + c, 0));
      // Aura time per second adds up to each aura's uptime.
      for (const u of auraUptimes(log, durationMs)) {
        const sum = buckets.reduce((a, b) => a + (b.auraUpMs[u.auraId] ?? 0), 0);
        expect(sum).toBe(u.upMs);
        for (const b of buckets) expect(b.auraUpMs[u.auraId] ?? 0).toBeLessThanOrEqual(b.endMs - b.startMs);
      }
      // Mana gains are the log's.
      const gained = log.filter((e) => e.type === 'mana').reduce((a, e) => a + (e.amount ?? 0), 0);
      expect(buckets.reduce((a, b) => a + b.manaGained, 0)).toBeCloseTo(gained, 6);
    });
  }

  it('the top spell of a second is its largest damage; crits counted; casts carry their cast time', () => {
    const { log, snapshot, opts } = played('default', 5);
    const buckets = secondBuckets(log, snapshot.durationMs, opts);
    for (const b of buckets) {
      if (b.damage === 0) expect(b.topSpellId).toBeNull();
      else expect(b.topSpellId).toBe(b.spells.reduce((x, y) => (y.damage > x.damage ? y : x)).spellId);
    }
    const crits = log.filter((e) => e.type === 'damage' && e.crit).length;
    expect(buckets.reduce((a, b) => a + b.crits, 0)).toBe(crits);
    const sb = buckets.flatMap((b) => b.casts).find((c) => c.spellId === 'shadow-bolt' && c.kind === 'complete')!;
    expect(sb.castMs).toBeGreaterThan(2000);
    expect(sb.castMs).toBeLessThanOrEqual(3000);
  });
});

describe('secondBuckets on hand-made logs', () => {
  const log: LogEvent[] = [
    { atMs: -1500, type: 'aura-apply', auraId: 'pre' },
    { atMs: 0, type: 'cast-start', spellId: 'sb' },
    { atMs: 999, type: 'damage', spellId: 'x', amount: 10 },
    { atMs: 1000, type: 'damage', spellId: 'x', amount: 20, crit: true },
    { atMs: 1200, type: 'aura-apply', auraId: 'buff', spellId: 'pot' },
    { atMs: 1500, type: 'aura-apply', auraId: 'buff', spellId: 'pot' },
    { atMs: 1999, type: 'tick', spellId: 'imm', auraId: 'dot', amount: 5 },
    { atMs: 2500, type: 'cast-complete', spellId: 'sb' },
    { atMs: 2500, type: 'queue', spellId: 'sb' },
    { atMs: 2600, type: 'queue-drop', spellId: 'sb', reason: 'no-mana' },
    { atMs: 2700, type: 'miss', spellId: 'sb' },
    { atMs: 2800, type: 'cast-complete', spellId: 'pot' },
    { atMs: 2900, type: 'mana', spellId: 'tap', amount: 400 },
    { atMs: 3000, type: 'aura-fade', auraId: 'buff' },
    { atMs: 3500, type: 'tick', auraId: 'dot', amount: 7 },
  ];
  const opts = { items: new Set(['pot']), targets: new Set(['dot']) };

  it('second boundaries are [N, N+1): 999 ms is second 0, 1000 ms second 1; the end ms is the last second', () => {
    const b = secondBuckets(log, 3500, opts);
    expect(b).toHaveLength(4);
    expect(b[0]!.damage).toBe(10);
    expect(b[1]!.damage).toBe(25);
    expect(b[1]!.crits).toBe(1);
    expect(b[3]!.endMs).toBe(3500);
    // 3500 = the fight's end: in the last second.
    expect(b[3]!.ticks).toEqual([{ auraId: 'dot', spellId: null, atMs: 3500, amount: 7 }]);
    expect(b[3]!.damage).toBe(7);
    expect(b.map((x) => x.cumulativeDamage)).toEqual([10, 35, 35, 42]);
    expect(b[3]!.cumulativeDps).toBe(42 / 3.5);
  });

  it('pre-pull events count in second 0 and are marked', () => {
    const b = secondBuckets(log, 3500, opts);
    expect(b[0]!.prePull).toBe(1);
    expect(b[1]!.prePull).toBe(0);
    expect(b[0]!.auras[0]).toEqual({ auraId: 'pre', atMs: -1500, change: 'up', side: 'self' });
    // Pre-pull aura time is kept in second 0, so the sum is the uptime (auraUptimes counts it too).
    const total = b.reduce((a, x) => a + (x.auraUpMs['pre'] ?? 0), 0);
    expect(total).toBe(auraUptimes(log, 3500).find((u) => u.auraId === 'pre')!.upMs);
  });

  it('aura changes: up, refresh, down; queue, drops, items and mana', () => {
    const b = secondBuckets(log, 3500, opts);
    expect(b[1]!.auras.map((a) => a.change)).toEqual(['up', 'refresh']);
    expect(b[3]!.auras).toEqual([{ auraId: 'buff', atMs: 3000, change: 'down', side: 'self' }]);
    expect(b[2]!.queue).toEqual([
      { spellId: 'sb', atMs: 2500, dropped: false, reason: null },
      { spellId: 'sb', atMs: 2600, dropped: true, reason: 'no-mana' },
    ]);
    expect(b[2]!.items).toEqual([{ spellId: 'pot', atMs: 2800 }]);
    expect(b[2]!.mana).toEqual([{ spellId: 'tap', atMs: 2900, amount: 400 }]);
    expect(b[2]!.manaGained).toBe(400);
    expect(b[2]!.spells).toEqual([{ spellId: 'sb', damage: 0, hits: 0, crits: 0, misses: 1, ticks: 0 }]);
    const sbDone = b[2]!.casts.find((c) => c.kind === 'complete')!;
    expect(sbDone.castMs).toBe(2500);
    expect(b[0]!.casts[0]).toEqual({ spellId: 'sb', atMs: 0, kind: 'start', castMs: 2500 });
    expect(b[1]!.auraUpMs['buff']).toBe(800);
    expect(b[2]!.auraUpMs['buff']).toBe(1000);
    expect(b[3]!.auraUpMs['buff']).toBeUndefined();
  });

  it('hostile and empty logs never throw', () => {
    expect(secondBuckets([], 60000)).toHaveLength(60);
    expect(secondBuckets([], 60000).every((b) => b.damage === 0 && b.events === 0)).toBe(true);
    expect(secondBuckets(log, Number.NaN)).toEqual([]);
    expect(secondBuckets(log, 0)).toEqual([]);
    expect(secondBuckets(log, -5)).toEqual([]);
    // Absurd lengths are capped (one hour of seconds).
    expect(secondBuckets([], 1e15).length).toBe(3600);
    const junk = [
      null,
      42,
      { atMs: Number.NaN, type: 'damage', amount: 5 },
      { atMs: 100, type: 'nonsense' },
      { atMs: 200, type: 'damage' },
      { atMs: 300, type: 'damage', spellId: 7, amount: 'x' },
      { atMs: 1e12, type: 'tick', auraId: 'dot', amount: 3 },
      { atMs: 400, type: 'aura-fade', auraId: 'never-up' },
    ] as unknown as LogEvent[];
    const b = secondBuckets(junk, 5000);
    expect(b).toHaveLength(5);
    expect(b.reduce((a, x) => a + x.damage, 0)).toBe(3);
    expect(() => stateAt(junk, 1000, 5000)).not.toThrow();
    expect(() => secondsCsv(b, (id) => id)).not.toThrow();
  });
});

describe('stateAt: auras active at the start of a second, from the log', () => {
  const log: LogEvent[] = [
    { atMs: 0, type: 'aura-apply', auraId: 'heroism' },
    { atMs: 500, type: 'aura-apply', auraId: 'dot', spellId: 'imm' },
    { atMs: 2000, type: 'aura-apply', auraId: 'dot', spellId: 'imm' },
    { atMs: 4000, type: 'aura-fade', auraId: 'heroism' },
    { atMs: 6000, type: 'aura-apply', auraId: 'secret' },
  ];
  const opts = { targets: new Set(['dot']), hidden: new Set(['secret']) };

  it('remaining time is until the logged fade, or until the end; refreshes keep the window', () => {
    const s = stateAt(log, 3000, 10000, opts);
    expect(s.self).toEqual([{ auraId: 'heroism', sinceMs: 0, lastAppliedMs: 0, endsAtMs: 4000, remainingMs: 1000, untilEnd: false }]);
    expect(s.target).toEqual([{ auraId: 'dot', sinceMs: 500, lastAppliedMs: 2000, endsAtMs: 10000, remainingMs: 7000, untilEnd: true }]);
    // A fade exactly at ms: no longer active; an apply exactly at ms: active.
    expect(stateAt(log, 4000, 10000, opts).self).toEqual([]);
    expect(stateAt(log, 500, 10000, opts).target.map((a) => a.auraId)).toEqual(['dot']);
    expect(stateAt(log, 499, 10000, opts).target).toEqual([]);
    // Hidden auras are left out.
    expect(stateAt(log, 7000, 10000, opts).self).toEqual([]);
    expect(stateAt(log, 7000, 10000).self.map((a) => a.auraId)).toEqual(['dot', 'secret']);
  });

  it('matches the buckets: an aura active at the start of second N was up in second N', () => {
    const { log: real, snapshot, opts: o } = played('consumables', 7);
    const buckets = secondBuckets(real, snapshot.durationMs, o);
    for (const b of buckets) {
      const s = stateAt(real, b.startMs, snapshot.durationMs, o);
      for (const a of [...s.self, ...s.target]) {
        expect(b.auraUpMs[a.auraId]).toBeGreaterThan(0);
        expect(a.remainingMs).toBe(a.endsAtMs - b.startMs);
      }
    }
  });
});

describe('jumps, filters and export', () => {
  const log: LogEvent[] = [
    { atMs: 100, type: 'damage', spellId: 'sb', amount: 10 },
    { atMs: 1100, type: 'aura-apply', auraId: 'buff' },
    { atMs: 2100, type: 'damage', spellId: 'sb', amount: 30, crit: true },
    { atMs: 3100, type: 'cast-complete', spellId: 'pot' },
    { atMs: 4100, type: 'queue-drop', spellId: 'sb', reason: 'replaced' },
    { atMs: 5100, type: 'aura-fade', auraId: 'buff' },
    { atMs: 5200, type: 'cast-complete', spellId: 'sb' },
  ];
  const buckets = secondBuckets(log, 7000, { items: new Set(['pot']) });
  const names: Record<string, string> = { sb: 'Shadow Bolt', buff: 'Power, "Big"', pot: 'Destruction Potion' };
  const name = (id: string) => names[id] ?? id;

  it('eventJumps lists the seconds with each kind of event; jumpFrom finds the next and previous', () => {
    const j = eventJumps(buckets);
    expect(j).toEqual({ aura: [1, 5], item: [3], crit: [2], queueDrop: [4] });
    expect(jumpFrom(j.aura, 0, 1)).toBe(1);
    expect(jumpFrom(j.aura, 1, 1)).toBe(5);
    expect(jumpFrom(j.aura, 5, 1)).toBeNull();
    expect(jumpFrom(j.aura, 5, -1)).toBe(1);
    expect(jumpFrom(j.aura, 1, -1)).toBeNull();
    expect(jumpFrom([], 3, 1)).toBeNull();
  });

  it('filterSeconds: by kind (any of) and by spell or aura name', () => {
    expect(filterSeconds(buckets, { kinds: [], query: '' }, name).map((b) => b.second)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(filterSeconds(buckets, { kinds: ['damage'], query: '' }, name).map((b) => b.second)).toEqual([0, 2]);
    expect(filterSeconds(buckets, { kinds: ['auras', 'items'], query: '' }, name).map((b) => b.second)).toEqual([1, 3, 5]);
    expect(filterSeconds(buckets, { kinds: ['drops'], query: '' }, name).map((b) => b.second)).toEqual([4]);
    expect(filterSeconds(buckets, { kinds: [], query: ' shadow ' }, name).map((b) => b.second)).toEqual([0, 2, 4, 5]);
    expect(filterSeconds(buckets, { kinds: ['damage'], query: 'big' }, name).map((b) => b.second)).toEqual([]);
  });

  it('secondsCsv: one row per second, quoted where needed; secondText describes one second', () => {
    const csv = secondsCsv(buckets, name).split('\n');
    expect(csv[0]).toBe('second,damage,casts,auras up,auras down,items,mana');
    expect(csv).toHaveLength(8);
    expect(csv[1]).toBe('0,10,,,,,0');
    expect(csv[2]).toBe('1,0,,"Power, ""Big""",,,0');
    expect(csv[4]).toBe('3,0,,,,Destruction Potion,0');
    expect(csv[6]).toBe('5,0,Shadow Bolt,,"Power, ""Big""",,0');
    const text = secondText(buckets[2]!, name);
    expect(text).toContain('Second 2');
    expect(text).toContain('Shadow Bolt 30 (1 crit)');
  });
});
