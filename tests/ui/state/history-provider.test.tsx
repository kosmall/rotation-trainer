// Fight history in the trainer (fight timeline and key fights Task K2b; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 E-F): every ended
// fight and every simulation's key fights are recorded with the setup snapshot taken at the
// fight's (simulation's) start and saved under rotation-trainer:history:v1; a history fight opens
// in the Report like any other (`actions.openHistoryFight`); "Use this setup" restores a snapshot
// through the normal setup path; a refused save is visible (`meta.history.saved`).

import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG } from '../../../src/setup/defaults';
import type { SetupStorage } from '../../../src/setup/storage';
import type { SetupConfig } from '../../../src/setup/types';
import { simulate } from '../../../src/sim-runner/run';
import type { SimResult } from '../../../src/sim-runner/types';
import { buildReportModel } from '../../../src/ui/report/reportModel';
import { HISTORY_STORAGE_KEY } from '../../../src/ui/state/history';
import type { PlayedEntry, SimEntry } from '../../../src/ui/state/history';
import { TrainerProvider, useTrainer } from '../../../src/ui/state/TrainerProvider';
import type { TrainerValue } from '../../../src/ui/state/TrainerProvider';

const FAKE_NOW = 1_800_000_000_000;
let trainer: TrainerValue;

function Probe() {
  trainer = useTrainer();
  const attach = trainer.actions.attachFightView;
  useEffect(() => attach(), [attach]);
  return null;
}

function mount(storage: SetupStorage | null) {
  return render(
    <TrainerProvider storage={storage}>
      <Probe />
    </TrainerProvider>,
  );
}

function memory(failWrites = false): SetupStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites && k === HISTORY_STORAGE_KEY) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

const fakeTimers = () =>
  vi.useFakeTimers({ now: FAKE_NOW, toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });

beforeEach(fakeTimers);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function playOut(seconds = 60) {
  act(() => trainer.actions.start());
  for (let i = 0; i < seconds + 2; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

async function simulated(config: SetupConfig): Promise<SimResult> {
  vi.useRealTimers();
  const result = await simulate({ setup: structuredClone(config), runs: 6, seed: 31337, spellQueueWindowMs: 400 });
  fakeTimers();
  return result;
}

describe('fight history in the trainer', () => {
  it('records an ended fight with the setup snapshot from its start, saves it, and reopens it after a reload', () => {
    const storage = memory();
    const view = mount(storage);
    expect(trainer.meta.history).toEqual({ entries: [], saved: 'yes' });
    act(() => trainer.actions.start());
    // An edit during the fight goes to the next fight; the history keeps this fight's setup.
    act(() => trainer.actions.changeConfig({ ...trainer.state.config, fightDurationSec: 30 }));
    playOut(60);
    const last = trainer.meta.lastFight!;
    expect(trainer.meta.history.entries).toHaveLength(1);
    const entry = trainer.meta.history.entries[0] as PlayedEntry;
    expect(entry).toMatchObject({ kind: 'played', seed: last.seed, durationMs: 60000, savedAt: expect.any(Number) });
    expect(entry.config).toEqual(last.config);
    expect(entry.config.fightDurationSec).toBe(60);
    expect(entry.log).toEqual(last.log);
    expect(entry.dps).toBe(last.snapshot.dps);
    expect(trainer.meta.history.saved).toBe('yes');
    expect(JSON.parse(storage.map.get(HISTORY_STORAGE_KEY)!).entries[0].id).toBe(entry.id);

    view.unmount();
    mount(storage);
    expect(trainer.meta.history.entries).toEqual([entry]);
    act(() => trainer.actions.openHistoryFight(entry.id));
    expect(trainer.meta.reportSource).toEqual({ kind: 'history', id: entry.id });
    const state = trainer.meta.reportFight;
    if (state.status !== 'ready') throw new Error(state.status);
    expect(state.fight).toMatchObject({ kind: 'played', key: `history:${entry.id}`, compareBot: true, seed: entry.seed });
    expect(state.fight.log).toEqual(entry.log);
    expect(state.fight.config).toEqual(entry.config);
    const model = buildReportModel(state.fight);
    expect(model.totals.damage).toBe(entry.final.damageTotal);
    expect(model.bot).not.toBeNull();
    // Memoized per source.
    act(() => trainer.actions.setReportSource({ kind: 'played' }));
    act(() => trainer.actions.openHistoryFight(entry.id));
    const again = trainer.meta.reportFight;
    expect(again.status === 'ready' && again.fight).toBe(state.fight);
  });

  it('records a simulation\'s key fights; a history key fight replays from its snapshot', async () => {
    mount(memory());
    const config = { ...(structuredClone(DEFAULT_SETUP) as SetupConfig), fightDurationSec: 45 };
    const result = await simulated(config);
    act(() => trainer.actions.recordSimulation(result, config));
    const sims = trainer.meta.history.entries as SimEntry[];
    expect(sims.map((e) => e.kind)).toEqual(['sim-highest', 'sim-typical', 'sim-lowest']);
    act(() => trainer.actions.changeConfig({ ...trainer.state.config, fightDurationSec: 20 }));
    // A newer simulation replaces lastSimulation; the history entry still replays the old one.
    const other = await simulated(DEFAULT_SETUP as SetupConfig);
    act(() => trainer.actions.recordSimulation(other, structuredClone(DEFAULT_SETUP) as SetupConfig));
    expect(trainer.meta.history.entries).toHaveLength(6);
    const lowest = sims[2]!;
    act(() => trainer.actions.openHistoryFight(lowest.id));
    const state = trainer.meta.reportFight;
    if (state.status !== 'ready') throw new Error(JSON.stringify(state));
    expect(Object.is(state.fight.snapshot.dps, result.keyFights!.lowest.dps)).toBe(true);
    expect(state.fight.seed).toBe(result.keyFights!.lowest.seed);
    expect(state.fight.snapshot.durationMs).toBe(45000);
    expect(state.fight.kind).toBe('sim-lowest');
    expect(state.fight.sim).toMatchObject({ run: result.keyFights!.lowest.run, meanDps: result.meanDps, stdDev: result.stdDev });
  });

  it('"Use this setup" restores a snapshot through the setup path; unknown ids change nothing', () => {
    const storage = memory();
    mount(storage);
    playOut(60);
    const entry = trainer.meta.history.entries[0]!;
    act(() => trainer.actions.changeConfig({ ...trainer.state.config, fightDurationSec: 120, distanceYd: 5 }));
    let ok = false;
    act(() => {
      ok = trainer.actions.useSnapshotAsSetup(entry.id);
    });
    expect(ok).toBe(true);
    expect(trainer.state.config).toEqual(normalizeSetup(entry.config, SETUP_CATALOG));
    expect(JSON.parse(storage.map.get('rotation-trainer:setup:v1')!).fightDurationSec).toBe(60);
    act(() => {
      ok = trainer.actions.useSnapshotAsSetup('h999');
    });
    expect(ok).toBe(false);
    act(() => trainer.actions.openHistoryFight('h999'));
    expect(trainer.meta.reportFight.status).toBe('unavailable');
  });

  it('name, note, pin and remove; a refused save is visible; no storage: memory', () => {
    mount(memory(true));
    playOut(60);
    expect(trainer.meta.history.entries).toHaveLength(1);
    expect(trainer.meta.history.saved).toBe('failed');
    const id = trainer.meta.history.entries[0]!.id;
    act(() => trainer.actions.updateHistoryEntry(id, { name: 'Pull 1', pinned: true }));
    expect(trainer.meta.history.entries[0]).toMatchObject({ name: 'Pull 1', pinned: true });
    act(() => trainer.actions.removeHistoryEntry(id));
    expect(trainer.meta.history.entries).toEqual([]);
    cleanup();
    mount(null);
    playOut(60);
    expect(trainer.meta.history.entries).toHaveLength(1);
    expect(trainer.meta.history.saved).toBe('memory');
  });
});
