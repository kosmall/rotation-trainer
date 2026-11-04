// The Report's fight source in the trainer (fight timeline and key fights Task K2; spec
// docs/superpowers/specs/2026-11-05-fight-timeline-and-key-fights-design.md §2 A-B, §4):
// `meta.reportSource` / `actions.setReportSource` pick the last played fight or one of the last
// simulation's key fights; `meta.reportFight` is that fight, replayed on demand from the
// simulation's setup snapshot (never the current setup), memoized per source.

import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemDbSync } from '../../../src/data/items/dbSync';
import type { ItemDb } from '../../../src/data/items/types';
import { DEFAULT_SETUP } from '../../../src/setup/defaults';
import { gearNeedsDb } from '../../../src/setup/gear';
import type { SetupConfig } from '../../../src/setup/types';
import { replayFight } from '../../../src/sim-runner/replay';
import { simulate } from '../../../src/sim-runner/run';
import type { SimRequest, SimResult } from '../../../src/sim-runner/types';
import { fightFromLast } from '../../../src/ui/report/reportModel';
import { TrainerProvider, useTrainer } from '../../../src/ui/state/TrainerProvider';
import type { TrainerProviderProps, TrainerValue } from '../../../src/ui/state/TrainerProvider';
import { scenarios } from '../../fixtures/item-use-reference';

const db = itemDbSync();
let trainer: TrainerValue;

function Probe() {
  trainer = useTrainer();
  const attach = trainer.actions.attachFightView;
  useEffect(() => attach(), [attach]);
  return null;
}

function mount(props: TrainerProviderProps = {}) {
  render(
    <TrainerProvider storage={null} {...props}>
      <Probe />
    </TrainerProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Starts the next fight and lets it run out (no presses). */
function playOut(seconds: number) {
  act(() => trainer.actions.start());
  for (let i = 0; i < seconds + 2; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

async function simulated(config: SetupConfig, p: Partial<SimRequest> = {}): Promise<{ request: SimRequest; result: SimResult }> {
  vi.useRealTimers();
  const request: SimRequest = { setup: structuredClone(config), runs: 10, seed: 5150, spellQueueWindowMs: 400, ...p };
  const result = await simulate(request);
  vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
  return { request, result };
}

describe('report fight source', () => {
  it('starts on the played fight with nothing to show; a simulation source without a simulation is unavailable', () => {
    mount();
    expect(trainer.meta.reportSource).toEqual({ kind: 'played' });
    expect(trainer.meta.reportFight).toEqual({ status: 'none' });
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'highest' }));
    expect(trainer.meta.reportSource).toEqual({ kind: 'sim', which: 'highest' });
    expect(trainer.meta.reportFight.status).toBe('unavailable');
  });

  it('the key fights replay from the simulation snapshot: DPS, seed and log equal the simulator; memoized per source', async () => {
    mount();
    const config = structuredClone(DEFAULT_SETUP) as SetupConfig;
    const { request, result } = await simulated(config);
    act(() => trainer.actions.recordSimulation(result, config));
    expect(trainer.meta.lastSimulation!.result).toBe(result);
    expect(trainer.meta.lastSimulation!.config).toBe(config);
    expect(trainer.meta.lastSimulation!.result.keyFights).toBe(result.keyFights);
    // The current setup changes after the simulation: the replay keeps the snapshot.
    act(() => trainer.actions.changeConfig({ ...trainer.state.config, fightDurationSec: 20, distanceYd: 5 }));
    const seen = new Map<string, unknown>();
    for (const which of ['highest', 'typical', 'lowest'] as const) {
      act(() => trainer.actions.setReportSource({ kind: 'sim', which }));
      const state = trainer.meta.reportFight;
      if (state.status !== 'ready') throw new Error(`not ready: ${JSON.stringify(state)}`);
      const key = result.keyFights![which];
      const direct = replayFight(request, key.run);
      expect(Object.is(state.fight.snapshot.dps, key.dps)).toBe(true);
      expect(state.fight.seed).toBe(key.seed);
      expect(JSON.stringify(state.fight.log)).toBe(JSON.stringify(direct.log));
      expect(state.fight.config).toEqual(config);
      expect(state.fight.snapshot.durationMs).toBe(60000);
      expect(state.fight.kind).toBe(`sim-${which}`);
      expect(state.fight.sim!.run).toBe(key.run);
      seen.set(which, state.fight);
    }
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'highest' }));
    const again = trainer.meta.reportFight;
    expect(again.status === 'ready' && again.fight).toBe(seen.get('highest'));
  });

  it('an older result without key fights: unavailable, asking to run the simulation again', () => {
    mount();
    const result = { runs: 1000, seed: 1, meanDps: 1400, stdErr: 3 } as unknown as SimResult;
    act(() => trainer.actions.recordSimulation(result, structuredClone(DEFAULT_SETUP) as SetupConfig));
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'typical' }));
    const state = trainer.meta.reportFight;
    expect(state.status).toBe('unavailable');
    expect(state.status === 'unavailable' && state.reason).toMatch(/run the simulation again/i);
  });

  it('a replay that fails is an error state, never a throw', () => {
    mount();
    const result = { runs: 4, seed: 1, spellQueueWindowMs: 400, meanDps: 1400, stdDev: 10, keyFights: { highest: { run: 9, seed: 1, dps: 1 }, typical: { run: 0, seed: 1, dps: 1 }, lowest: { run: 0, seed: 1, dps: 1 } } } as unknown as SimResult;
    act(() => trainer.actions.recordSimulation(result, structuredClone(DEFAULT_SETUP) as SetupConfig));
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'highest' }));
    expect(trainer.meta.reportFight.status).toBe('error');
  });

  it('a snapshot gear that needs the item database waits for it (loading), then replays', async () => {
    let resolve: (db: ItemDb) => void = () => {};
    const loadDb = vi.fn(() => new Promise<ItemDb>((r) => (resolve = r)));
    mount({ loadDb });
    const config = scenarios().quagBloodgem!;
    expect(gearNeedsDb(config.gear!)).toBe(true);
    const { result } = await simulated(config, { db });
    act(() => trainer.actions.recordSimulation(result, config));
    expect(loadDb).not.toHaveBeenCalled();
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'lowest' }));
    expect(trainer.meta.reportFight.status).toBe('loading');
    expect(loadDb).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(db);
      await Promise.resolve();
    });
    const state = trainer.meta.reportFight;
    if (state.status !== 'ready') throw new Error(`not ready: ${state.status}`);
    expect(Object.is(state.fight.snapshot.dps, result.keyFights!.lowest.dps)).toBe(true);
  });

  it('the played fight: the last ended fight; a fight that ends switches the source back to it', async () => {
    mount();
    playOut(60);
    expect(trainer.meta.phase).toBe('ended');
    const last = trainer.meta.lastFight!;
    let state = trainer.meta.reportFight;
    expect(state.status === 'ready' && state.fight).toBe(fightFromLast(last));
    const config = structuredClone(DEFAULT_SETUP) as SetupConfig;
    const { result } = await simulated(config, { runs: 3 });
    act(() => trainer.actions.recordSimulation(result, config));
    act(() => trainer.actions.setReportSource({ kind: 'sim', which: 'lowest' }));
    expect(trainer.meta.reportFight.status).toBe('ready');
    act(() => trainer.actions.reset());
    playOut(60);
    expect(trainer.meta.lastFight).not.toBe(last);
    expect(trainer.meta.reportSource).toEqual({ kind: 'played' });
    state = trainer.meta.reportFight;
    expect(state.status === 'ready' && state.fight.kind).toBe('played');
    expect(state.status === 'ready' && state.fight.log).toBe(trainer.meta.lastFight!.log);
  });
});
