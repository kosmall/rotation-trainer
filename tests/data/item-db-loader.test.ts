import { afterEach, describe, expect, it, vi } from 'vitest';

// loadItemDb memoizes its promise; a failed chunk load (e.g. a network error while fetching the lazy
// chunk) must not stay cached, or the Gear panel could never load the database without a reload.
// The JSON module is mocked to fail once, then to succeed.

afterEach(() => {
  vi.doUnmock('../../src/data/items/db.json');
  vi.resetModules();
});

describe('loadItemDb', () => {
  it('a rejected load is not memoized: the next call imports again', async () => {
    let calls = 0;
    vi.resetModules();
    vi.doMock('../../src/data/items/db.json', () => {
      calls += 1;
      if (calls === 1) throw new Error('chunk load failed');
      return { default: { items: {}, gems: {}, enchants: {} } };
    });
    const { loadItemDb } = await import('../../src/data/items/db');

    // Vitest wraps a throwing mock factory's error in its own message.
    await expect(loadItemDb()).rejects.toThrow();
    const db = await loadItemDb();
    expect(db).toEqual({ items: {}, gems: {}, enchants: {} });
    expect(calls).toBe(2);
    expect(await loadItemDb()).toBe(db);
    expect(calls).toBe(2);
  });
});
