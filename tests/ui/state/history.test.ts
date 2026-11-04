// Fight history and the Highest DPS ranking (fight timeline and key fights Task K2b; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 E-F): entries,
// storage under `rotation-trainer:history:v1` (never throws: hostile, corrupt and huge input),
// caps (20 played fights with their logs within 1.5 MB, 10 simulations; pinned entries survive),
// key-fight references with the setup snapshot, the ranking with its filters.

import { describe, expect, it } from 'vitest';
import type { LogEvent } from '../../../src/engine/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import type { SimResult } from '../../../src/sim-runner/types';
import type { FightFinal } from '../../../src/ui/report/reportModel';
import {
  HISTORY_LIMITS,
  HISTORY_STORAGE_KEY,
  loadHistory,
  pruneHistory,
  rankTop,
  recordPlayed,
  recordSimulation,
  removeHistoryEntry,
  saveHistory,
  setupKeyOf,
  updateHistoryEntry,
} from '../../../src/ui/state/history';
import type { HistoryEntry, PlayedEntry } from '../../../src/ui/state/history';

const config = (p: Partial<SetupConfig> = {}): SetupConfig => ({ ...(structuredClone(DEFAULT_SETUP) as SetupConfig), ...p });

function memory(initial: Record<string, string> = {}): SetupStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const LOG: LogEvent[] = [
  { atMs: 0, type: 'cast-start', spellId: 'shadow-bolt' },
  { atMs: 2500, type: 'cast-complete', spellId: 'shadow-bolt' },
  { atMs: 2500, type: 'damage', spellId: 'shadow-bolt', amount: 2000, crit: true },
  { atMs: 3000, type: 'aura-apply', auraId: 'heroism' },
  { atMs: 3100, type: 'queue-drop', spellId: 'immolate', reason: 'replaced' },
];

function final(dps: number, durationMs = 60000): FightFinal {
  return { nowMs: durationMs, durationMs, gcdMs: 1500, dps, damageTotal: (dps * durationMs) / 1000, castCounts: { 'shadow-bolt': 1 }, useCounts: {} };
}

function played(entries: readonly HistoryEntry[], dps: number, now: number, p: { log?: LogEvent[]; cfg?: SetupConfig; durationMs?: number } = {}) {
  const durationMs = p.durationMs ?? 60000;
  return recordPlayed(entries, { log: p.log ?? LOG, final: final(dps, durationMs), config: p.cfg ?? config(), seed: 1234, durationMs }, now);
}

function simResult(seed = 99): SimResult {
  return {
    runs: 50,
    seed,
    spellQueueWindowMs: 400,
    meanDps: 1400,
    stdDev: 20,
    keyFights: { highest: { run: 7, seed: 111, dps: 1460 }, typical: { run: 3, seed: 222, dps: 1401 }, lowest: { run: 9, seed: 333, dps: 1350 } },
  } as unknown as SimResult;
}

describe('recording', () => {
  it('recordPlayed adds the fight first with its log, final numbers, snapshot and a new id', () => {
    const a = played([], 1500, 1000);
    expect(a.entry).toMatchObject({ kind: 'played', savedAt: 1000, dps: 1500, seed: 1234, durationMs: 60000 });
    expect(a.entries[0]).toBe(a.entry);
    const e = a.entry as PlayedEntry;
    expect(e.log).toEqual(LOG);
    expect(e.final.dps).toBe(1500);
    expect(e.config).toEqual(config());
    const b = played(a.entries, 1600, 2000);
    expect(b.entries.map((x) => x.dps)).toEqual([1600, 1500]);
    expect(b.entry.id).not.toBe(a.entry.id);
  });

  it('recordSimulation adds the three key fights as references (run, seeds, snapshot), none without key fights', () => {
    const cfg = config({ fightDurationSec: 90 });
    const entries = recordSimulation([], { result: simResult(), config: cfg }, 5000);
    expect(entries.map((e) => e.kind)).toEqual(['sim-highest', 'sim-typical', 'sim-lowest']);
    const [h] = entries;
    expect(h).toMatchObject({ dps: 1460, seed: 111, durationMs: 90000, savedAt: 5000, run: 7, runs: 50, baseSeed: 99, spellQueueWindowMs: 400, meanDps: 1400, stdDev: 20 });
    expect(h!.config).toEqual(cfg);
    expect(new Set(entries.map((e) => (e.kind === 'played' ? '' : e.simulation))).size).toBe(1);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
    expect(recordSimulation(entries, { result: { ...simResult(), keyFights: undefined }, config: cfg }, 6000)).toBe(entries);
  });
});

describe('caps', () => {
  it('keeps the 20 newest played fights; pinned ones survive and count', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) entries = played(entries, 1000 + i, i).entries;
    const kept = entries.filter((e) => e.kind === 'played');
    expect(kept).toHaveLength(HISTORY_LIMITS.played);
    expect(kept.map((e) => e.dps)).toEqual(Array.from({ length: 20 }, (_, i) => 1024 - i));
    // Pin the oldest kept; 5 more fights: it stays, 19 newest unpinned besides it.
    const oldest = kept.at(-1)!;
    entries = updateHistoryEntry(entries, oldest.id, { pinned: true });
    for (let i = 0; i < 5; i++) entries = played(entries, 2000 + i, 100 + i).entries;
    const after = entries.filter((e) => e.kind === 'played');
    expect(after).toHaveLength(20);
    expect(after.some((e) => e.id === oldest.id)).toBe(true);
  });

  it('played fights within 1.5 MB of text: the oldest unpinned go first', () => {
    const big: LogEvent[] = Array.from({ length: 6000 }, (_, i) => ({ atMs: i * 10, type: 'damage', spellId: 'shadow-bolt', amount: 1000 + i, crit: i % 3 === 0 }));
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < 20; i++) entries = played(entries, 1000 + i, i, { log: big }).entries;
    const size = entries.reduce((a, e) => a + JSON.stringify(e).length, 0);
    expect(size).toBeLessThanOrEqual(HISTORY_LIMITS.playedChars);
    expect(entries.length).toBeLessThan(20);
    expect(entries[0]!.dps).toBe(1019);
    // Ordered newest first, oldest dropped.
    expect(entries.map((e) => e.dps)).toEqual([...entries.map((e) => e.dps)].sort((a, b) => b - a));
  });

  it('keeps the 10 newest simulations (three entries each); pinned simulation entries survive', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < 12; i++) entries = recordSimulation(entries, { result: simResult(i), config: config() }, i);
    expect(entries).toHaveLength(30);
    expect(new Set(entries.map((e) => (e.kind === 'played' ? '' : e.baseSeed)))).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const pin = entries.at(-1)!;
    entries = updateHistoryEntry(entries, pin.id, { pinned: true, name: '  best pull  ', note: 'x'.repeat(5000) });
    const pinned = entries.find((e) => e.id === pin.id)!;
    expect(pinned.name).toBe('best pull');
    expect(pinned.note!.length).toBe(HISTORY_LIMITS.noteChars);
    entries = recordSimulation(entries, { result: simResult(50), config: config() }, 50);
    expect(entries.some((e) => e.id === pin.id)).toBe(true);
    // The pinned entry's simulation counts as one of the 10 (its other two entries stay with it).
    expect(new Set(entries.map((e) => (e.kind === 'played' ? '' : e.simulation))).size).toBe(10);
    expect(entries).toHaveLength(30);
    expect(pruneHistory(entries)).toEqual(entries);
  });

  it('updateHistoryEntry / removeHistoryEntry: unknown ids change nothing', () => {
    const { entries } = played([], 1500, 1);
    expect(updateHistoryEntry(entries, 'nope', { pinned: true })).toBe(entries);
    expect(removeHistoryEntry(entries, 'nope')).toBe(entries);
    expect(removeHistoryEntry(entries, entries[0]!.id)).toEqual([]);
    expect(updateHistoryEntry(entries, entries[0]!.id, { name: '' })[0]!.name).toBeUndefined();
  });
});

describe('storage', () => {
  it('saves under rotation-trainer:history:v1 and loads the same entries back', () => {
    const s = memory();
    let entries = played([], 1500, 1).entries;
    entries = recordSimulation(entries, { result: simResult(), config: config({ fightDurationSec: 30 }) }, 2);
    entries = updateHistoryEntry(entries, entries[0]!.id, { pinned: true, name: 'n', note: 'm' });
    expect(saveHistory(s, entries)).toBe(true);
    expect([...s.map.keys()]).toEqual([HISTORY_STORAGE_KEY]);
    expect(loadHistory(s)).toEqual(entries);
  });

  it('never throws: no storage, throwing storage, quota, junk, corrupt and huge input', () => {
    expect(loadHistory(null)).toEqual([]);
    expect(saveHistory(null, [])).toBe(false);
    const throwing: SetupStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(loadHistory(throwing)).toEqual([]);
    expect(saveHistory(throwing, played([], 1, 1).entries)).toBe(false);
    for (const text of ['', 'nope', '[]', '{"version":2,"entries":[]}', '{"version":1,"entries":{}}', '{"version":1}', '['.repeat(100000), 'x'.repeat(HISTORY_LIMITS.storageChars + 1)]) {
      expect(loadHistory(memory({ [HISTORY_STORAGE_KEY]: text }))).toEqual([]);
    }
    const good = played([], 1500, 1).entry;
    const sim = recordSimulation([good], { result: simResult(), config: config() }, 2)[0]!;
    const bad: unknown[] = [
      null,
      7,
      { ...good, id: 'BAD ID' },
      { ...good, kind: 'other' },
      { ...good, dps: Number.NaN },
      { ...good, dps: 'x' },
      { ...good, log: 'x' },
      { ...good, log: [{ atMs: 'x', type: 'damage' }] },
      { ...good, log: [{ atMs: 1, type: 'boom' }] },
      { ...good, final: null },
      { ...good, final: { ...good.kind === 'played' && (good as PlayedEntry).final, castCounts: { a: -1 } } },
      { ...sim, run: 50 },
      { ...sim, runs: 0 },
      { ...sim, baseSeed: -1 },
      { ...good, durationMs: 0 },
      { ...good, savedAt: -5 },
    ];
    const text = JSON.stringify({ version: 1, entries: [...bad, good, { ...good }, sim] });
    const loaded = loadHistory(memory({ [HISTORY_STORAGE_KEY]: text }));
    // The corrupt entries are skipped, the repeated id once; the good ones kept.
    expect(loaded.map((e) => e.id)).toEqual([good.id, sim.id]);
    // A config that is junk is the default setup (normalizeSetup), never an error.
    const junkCfg = JSON.stringify({ version: 1, entries: [{ ...good, config: { version: 1, enabledBuffs: 'x', fightDurationSec: 1e9 } }] });
    const [e] = loadHistory(memory({ [HISTORY_STORAGE_KEY]: junkCfg }));
    expect(e!.config.fightDurationSec).toBe(600);
    // __proto__ keys never pollute.
    const proto = `{"version":1,"entries":[${JSON.stringify({ ...good, final: { ...(good as PlayedEntry).final, castCounts: {} } }).replace('"castCounts":{}', '"castCounts":{"__proto__":{"polluted":1}}')}]}`;
    const [p] = loadHistory(memory({ [HISTORY_STORAGE_KEY]: proto }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(p === undefined || Object.getPrototypeOf((p as PlayedEntry).final.castCounts) === null || !('polluted' in (p as PlayedEntry).final.castCounts)).toBe(true);
  });

  it('a history over the caps is pruned on load; a save over the storage cap is refused', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) entries = played(entries, 1000 + i, i).entries;
    const raw = [...entries, ...Array.from({ length: 5 }, (_, i) => ({ ...entries[0]!, id: `h${900 + i}`, savedAt: i }))];
    const loaded = loadHistory(memory({ [HISTORY_STORAGE_KEY]: JSON.stringify({ version: 1, entries: raw }) }));
    expect(loaded.filter((e) => e.kind === 'played')).toHaveLength(20);
    const huge = { ...(entries[0] as PlayedEntry), pinned: true, log: Array.from({ length: 80000 }, (_, i) => ({ atMs: i, type: 'damage' as const, spellId: 'shadow-bolt', amount: 123456 })) };
    expect(saveHistory(memory(), [huge])).toBe(false);
  });
});

describe('rankTop', () => {
  const t6 = config({ talents: undefined, gearPresetId: undefined });
  let entries: HistoryEntry[] = [];
  entries = played(entries, 1500, 1).entries;
  entries = played(entries, 1700, 2, { durationMs: 120000, cfg: config({ fightDurationSec: 120 }) }).entries;
  entries = played(entries, 1550, 3, { cfg: config({ distanceYd: 10 }) }).entries;
  entries = recordSimulation(entries, { result: simResult(), config: t6 }, 4);

  it('top N by DPS from the whole history (ties: the earlier first)', () => {
    const rows = rankTop(entries, { kind: 'all', durationMs: null, setupKey: null });
    expect(rows.map((r) => r.entry.dps)).toEqual([1700, 1550, 1500, 1460, 1401, 1350]);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rankTop(entries, { kind: 'all', durationMs: null, setupKey: null, limit: 2 })).toHaveLength(2);
    const tied = played(played([], 1500, 10).entries, 1500, 20).entries;
    expect(rankTop(tied, { kind: 'all', durationMs: null, setupKey: null }).map((r) => r.entry.savedAt)).toEqual([10, 20]);
  });

  it('filters: kind, the same fight length, the same gear and talents', () => {
    expect(rankTop(entries, { kind: 'played', durationMs: null, setupKey: null }).map((r) => r.entry.dps)).toEqual([1700, 1550, 1500]);
    expect(rankTop(entries, { kind: 'sim', durationMs: null, setupKey: null }).map((r) => r.entry.dps)).toEqual([1460, 1401, 1350]);
    expect(rankTop(entries, { kind: 'all', durationMs: 60000, setupKey: null }).map((r) => r.entry.dps)).toEqual([1550, 1500, 1460, 1401, 1350]);
    // Distance is not part of the setup key (gear + talents): every default-gear fight matches.
    expect(rankTop(entries, { kind: 'all', durationMs: null, setupKey: setupKeyOf(config()) })).toHaveLength(6);
    const otherGear = config({ talents: '5502200000000000000000505000500000000000000005052201521102050010015000000' });
    expect(setupKeyOf(otherGear)).not.toBe(setupKeyOf(config()));
    expect(setupKeyOf(config({ distanceYd: 3, fightDurationSec: 99 }))).toBe(setupKeyOf(config()));
  });
});
