import { describe, expect, it, vi } from 'vitest';
import type { DiscoverOptions } from '../../src/forever/discover/engine';
import { SIM_VERSION } from '../../src/forever/version';

const o = { level: 40, profile: 'average', mobs: 1, seed: 1, perk: 0, params: {}, budget: { screen: { starts: 1, evals: 3, sessions: 1 }, search: { starts: 1, evals: 5, sessions: 1 }, final: 6, finalSessions: 4, keep: 4, perFamilyMin: 1 } } as unknown as DiscoverOptions;

describe('A5-011: simulator version in the discover state key', () => {
  it('has a non-empty version string', () => {
    expect(typeof SIM_VERSION).toBe('string');
    expect(SIM_VERSION.length).toBeGreaterThan(0);
  });
  it('a state hash made by another simulator version differs', async () => {
    const { stateHash } = await import('../../src/forever/discover/engine');
    const now = stateHash(o);
    vi.resetModules();
    vi.doMock('../../src/forever/version', () => ({ SIM_VERSION: 'an-older-version' }));
    const older = await import('../../src/forever/discover/engine');
    expect(older.stateHash(o)).not.toBe(now);
    vi.doUnmock('../../src/forever/version');
    vi.resetModules();
  });
});
