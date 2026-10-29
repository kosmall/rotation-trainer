import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepFreeze } from '../../src/data/common/buffs';
import type { BuffDef } from '../../src/data/types';
import { DEFAULT_SETUP, normalizeSetup, SETUP_CATALOG, SETUP_LIMITS } from '../../src/setup/defaults';
import {
  browserStorage,
  clearSetup,
  loadSetup,
  saveSetup,
  SETUP_STORAGE_KEY,
  SETUP_STORAGE_MAX_CHARS,
  type SetupStorage,
} from '../../src/setup/storage';
import type { SetupConfig } from '../../src/setup/types';

// Any write into the shared catalog or the default config throws (ES modules are strict mode).
deepFreeze(SETUP_CATALOG);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** An in-memory Storage that records every call (the node project has no DOM). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const calls: string[] = [];
  const storage: SetupStorage = {
    getItem: (k) => {
      calls.push(`get ${k}`);
      return data.has(k) ? data.get(k)! : null;
    },
    setItem: (k, v) => {
      calls.push(`set ${k}`);
      data.set(k, String(v));
    },
    removeItem: (k) => {
      calls.push(`remove ${k}`);
      data.delete(k);
    },
  };
  return { storage, data, calls };
}

/** A storage whose getItem returns `value` as is (a broken or hostile Storage implementation). */
function returning(value: unknown): SetupStorage {
  return { getItem: () => value as string | null, setItem: () => {}, removeItem: () => {} };
}

/** loadSetup with `text` stored under the key. */
function loadText(text: string, catalog: readonly BuffDef[] = SETUP_CATALOG): SetupConfig {
  return loadSetup(memoryStorage({ [SETUP_STORAGE_KEY]: text }).storage, catalog);
}

const defaults = (): SetupConfig => normalizeSetup(undefined, SETUP_CATALOG);

/** A valid config that differs from the defaults in every section. */
function customConfig(): SetupConfig {
  return {
    version: 1,
    enabledBuffs: ['misery', 'heroism', 'flask-of-pure-death'],
    timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec: 12, durationSec: 40 } },
    rotation: { curse: 'agony', immolate: false, corruption: true, shadowburnFinisher: false, lifeTapBelowMana: 1500 },
    distanceYd: 20,
    warlock: { armor: 'demon', sacrificeSuccubus: false },
  };
}

/** A timed buff with a long id, for catalogs whose normalized config is huge. */
function fakeTimedBuff(i: number): BuffDef {
  return {
    id: `fake-timed-buff-with-a-deliberately-long-identifier-${String(i).padStart(6, '0')}`,
    name: `Fake ${i}`,
    icon: 'fake',
    group: 'item',
    description: 'test only',
    source: 'UNVERIFIED',
    effect: {},
    timed: { defaultStartSec: 0, durationSec: 20 },
  };
}

describe('setup storage: key and size cap', () => {
  it('uses the versioned key rotation-trainer:setup:v1', () => {
    expect(SETUP_STORAGE_KEY).toBe('rotation-trainer:setup:v1');
  });

  it('a full legitimate config (every catalog buff tried) is far below the cap', () => {
    const full = normalizeSetup(
      { ...DEFAULT_SETUP, enabledBuffs: SETUP_CATALOG.map((b) => b.id), distanceYd: 99.5 },
      SETUP_CATALOG,
    );
    const text = JSON.stringify(full);
    expect(text.length).toBeLessThan(SETUP_STORAGE_MAX_CHARS / 10);
    expect(SETUP_STORAGE_MAX_CHARS).toBe(100_000);
  });
});

describe('loadSetup / saveSetup', () => {
  it('round trip: save then load returns the same normalized config', () => {
    const { storage, data } = memoryStorage();
    const config = customConfig();
    expect(normalizeSetup(config, SETUP_CATALOG)).toEqual(config); // the fixture is already valid
    expect(saveSetup(storage, config)).toBe(true);
    expect(data.get(SETUP_STORAGE_KEY)).toBe(JSON.stringify(config));
    const loaded = loadSetup(storage, SETUP_CATALOG);
    expect(loaded).toEqual(config);
    expect(loaded).not.toBe(config);
    // The default setup round-trips as well.
    expect(saveSetup(storage, DEFAULT_SETUP)).toBe(true);
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it('saveSetup writes the normalized config, never the raw input', () => {
    const { storage, data } = memoryStorage();
    const raw = {
      ...customConfig(),
      enabledBuffs: ['misery', 'no-such-buff', 'misery'],
      distanceYd: 1e9,
      extra: 'dropped',
    } as unknown as SetupConfig;
    expect(saveSetup(storage, raw)).toBe(true);
    const stored = JSON.parse(data.get(SETUP_STORAGE_KEY)!);
    expect(stored).toEqual(normalizeSetup(raw, SETUP_CATALOG));
    expect(stored.enabledBuffs).toEqual(['misery']);
    expect(stored.distanceYd).toBe(SETUP_LIMITS.distanceYd.max);
    expect(Object.hasOwn(stored, 'extra')).toBe(false);
  });

  it('saveSetup does not mutate its (frozen) input', () => {
    const { storage } = memoryStorage();
    const config = deepFreeze(customConfig());
    expect(saveSetup(storage, config)).toBe(true);
    expect(config).toEqual(customConfig());
  });

  it('loadSetup reads only its key and writes nothing', () => {
    const { storage, calls } = memoryStorage({ other: 'x' });
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(defaults());
    expect(calls).toEqual([`get ${SETUP_STORAGE_KEY}`]);
  });

  it('nothing stored (getItem returns null) → defaults', () => {
    expect(loadSetup(memoryStorage().storage, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it('null storage → defaults, save returns false', () => {
    expect(loadSetup(null, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
    expect(saveSetup(null, customConfig())).toBe(false);
  });

  it('defaults are built for the given catalog', () => {
    const tiny = [fakeTimedBuff(1)];
    expect(loadSetup(null, tiny)).toEqual(normalizeSetup(undefined, tiny));
    expect(Object.keys(loadSetup(null, tiny).timed)).toEqual([tiny[0]!.id]);
  });

  it('getItem throws → defaults', () => {
    const storage: SetupStorage = {
      getItem: () => {
        throw new Error('SecurityError: access denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it('getItem returning a non-string (null, number, object) → defaults', () => {
    for (const value of [null, undefined, 42, true, customConfig(), [JSON.stringify(customConfig())]]) {
      expect(loadSetup(returning(value), SETUP_CATALOG), String(value)).toEqual(DEFAULT_SETUP);
    }
  });

  it('a storage whose getItem property itself throws → defaults', () => {
    const storage = Object.defineProperty({ setItem() {}, removeItem() {} }, 'getItem', {
      get() {
        throw new Error('hostile getter');
      },
    }) as unknown as SetupStorage;
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it('setItem throws (quota) → save returns false, no throw', () => {
    const storage: SetupStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError: the quota has been exceeded');
      },
      removeItem: () => {},
    };
    expect(() => saveSetup(storage, customConfig())).not.toThrow();
    expect(saveSetup(storage, customConfig())).toBe(false);
  });

  it('stored text is not JSON → defaults', () => {
    for (const text of ['', '{', 'not json', '{"version":1,', 'undefined', 'NaN', '\u0000']) {
      expect(loadText(text), JSON.stringify(text)).toEqual(DEFAULT_SETUP);
    }
  });

  it('stored JSON of a wrong type → defaults', () => {
    for (const text of ['null', '42', 'true', '"a string"', '[]', '[1,2,3]', JSON.stringify([customConfig()])]) {
      expect(loadText(text), text).toEqual(DEFAULT_SETUP);
    }
  });

  it('stored JSON with an old or future version → defaults', () => {
    for (const version of [0, 2, '1', null, undefined]) {
      const text = JSON.stringify({ ...customConfig(), version });
      expect(loadText(text), String(version)).toEqual(DEFAULT_SETUP);
    }
  });

  it('stored JSON with an old version, a wrong type, unknown ids, out-of-range numbers → normalized, not trusted', () => {
    const stored = {
      version: 1,
      enabledBuffs: ['misery', 'no-such-buff', 7, null, 'misery', 'constructor', '__proto__', 'heroism'],
      timed: {
        heroism: { startSec: -5, durationSec: 99999 },
        'no-such-buff': { startSec: 3, durationSec: 3 },
        'icon-of-the-silver-crescent': 'twenty',
      },
      rotation: { curse: 'banana', immolate: 'yes', corruption: false, shadowburnFinisher: 1, lifeTapBelowMana: -1 },
      distanceYd: 'far',
      warlock: { armor: 'plate', sacrificeSuccubus: 'no' },
    };
    const loaded = loadText(JSON.stringify(stored));
    expect(loaded).toEqual(normalizeSetup(stored, SETUP_CATALOG));
    expect(loaded.enabledBuffs).toEqual(['misery', 'heroism']);
    expect(loaded.timed.heroism).toEqual({ startSec: SETUP_LIMITS.startSec.min, durationSec: SETUP_LIMITS.durationSec.max });
    expect(loaded.timed['icon-of-the-silver-crescent']).toEqual(DEFAULT_SETUP.timed['icon-of-the-silver-crescent']);
    expect(Object.hasOwn(loaded.timed, 'no-such-buff')).toBe(false);
    expect(loaded.rotation).toEqual({ ...DEFAULT_SETUP.rotation, corruption: false });
    expect(loaded.distanceYd).toBe(DEFAULT_SETUP.distanceYd);
    expect(loaded.warlock).toEqual(DEFAULT_SETUP.warlock);

    // Huge and negative numbers clamp (JSON has no NaN/Infinity: 1e999 parses as Infinity).
    const far = loadText('{"version":1,"distanceYd":1e999,"rotation":{"lifeTapBelowMana":1e999}}');
    expect(far.distanceYd).toBe(SETUP_LIMITS.distanceYd.max);
    expect(far.rotation.lifeTapBelowMana).toBe('auto');
    expect(loadText('{"version":1,"distanceYd":-3}').distanceYd).toBe(SETUP_LIMITS.distanceYd.min);
  });

  it('stored value is huge (1 MB string) → defaults without hanging', () => {
    const parse = vi.spyOn(JSON, 'parse');
    // A valid config padded to 1 MB: the cap rejects it before parsing, so it is not loaded.
    const padded = JSON.stringify({ ...customConfig(), padding: 'x'.repeat(1_000_000) });
    expect(padded.length).toBeGreaterThan(1_000_000);
    expect(loadText(padded)).toEqual(DEFAULT_SETUP);
    expect(loadText('x'.repeat(1_000_000))).toEqual(DEFAULT_SETUP);
    expect(parse).not.toHaveBeenCalled();
  });

  it('a value of exactly the cap is still parsed; one character more is not', () => {
    const base = JSON.stringify({ ...customConfig(), padding: '' });
    const atCap = base.replace('"padding":""', `"padding":"${'x'.repeat(SETUP_STORAGE_MAX_CHARS - base.length)}"`);
    expect(atCap.length).toBe(SETUP_STORAGE_MAX_CHARS);
    expect(loadText(atCap)).toEqual(customConfig());
    const overCap = atCap.replace('"padding":"', '"padding":"x');
    expect(overCap.length).toBe(SETUP_STORAGE_MAX_CHARS + 1);
    expect(loadText(overCap)).toEqual(DEFAULT_SETUP);
  });

  it('deeply nested JSON does not crash the process → defaults', () => {
    // Just under the cap: parsed (or rejected by the engine), never trusted.
    const depth = Math.floor(SETUP_STORAGE_MAX_CHARS / 2) - 1;
    expect(() => loadText('['.repeat(depth) + ']'.repeat(depth))).not.toThrow();
    expect(loadText('['.repeat(depth) + ']'.repeat(depth))).toEqual(DEFAULT_SETUP);
    expect(loadText('{"a":'.repeat(Math.floor(depth / 6)) + '1' + '}'.repeat(Math.floor(depth / 6)))).toEqual(DEFAULT_SETUP);
    // 100k nested arrays (200k characters): rejected by the cap before JSON.parse.
    expect(loadText('['.repeat(100_000) + ']'.repeat(100_000))).toEqual(DEFAULT_SETUP);
  });

  it('JSON.parse throwing a stack overflow (RangeError) → defaults', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('Maximum call stack size exceeded');
    });
    expect(loadText(JSON.stringify(customConfig()))).toEqual(DEFAULT_SETUP);
  });

  it('prototype pollution payload ({"__proto__": ...}) does not change Object.prototype', () => {
    const text =
      '{"__proto__":{"polluted":true,"version":1},"constructor":{"prototype":{"polluted2":true}},' +
      '"version":1,"rotation":{"__proto__":{"curse":"doom","immolate":false}},' +
      '"timed":{"__proto__":{"heroism":{"startSec":99,"durationSec":99}}},"warlock":{"__proto__":{"armor":"demon"}}}';
    const loaded = loadText(text);
    const probe: Record<string, unknown> = {};
    expect(probe.polluted).toBeUndefined();
    expect(probe.polluted2).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(Object.hasOwn(loaded, '__proto__')).toBe(false);
    // Inherited (non-own) values are never read.
    expect(loaded).toEqual(DEFAULT_SETUP);
    // A payload that is only a __proto__ wrapper is not a version 1 config.
    expect(loadText('{"__proto__":{"version":1,"distanceYd":5}}')).toEqual(DEFAULT_SETUP);
  });

  it('saveSetup refuses to write above the cap', () => {
    const big = Array.from({ length: 2000 }, (_, i) => fakeTimedBuff(i));
    const config = normalizeSetup(undefined, big);
    expect(JSON.stringify(config).length).toBeGreaterThan(SETUP_STORAGE_MAX_CHARS);
    const { storage, data, calls } = memoryStorage({ [SETUP_STORAGE_KEY]: 'previous' });
    expect(saveSetup(storage, config, big)).toBe(false);
    expect(calls).toEqual([]);
    expect(data.get(SETUP_STORAGE_KEY)).toBe('previous');
  });
});

describe('clearSetup', () => {
  it('removes only the setup key and returns true; the next load gives defaults', () => {
    const { storage, data, calls } = memoryStorage({ other: 'kept' });
    expect(saveSetup(storage, customConfig())).toBe(true);
    expect(clearSetup(storage)).toBe(true);
    expect(calls).toContain(`remove ${SETUP_STORAGE_KEY}`);
    expect(data.has(SETUP_STORAGE_KEY)).toBe(false);
    expect(data.get('other')).toBe('kept');
    expect(loadSetup(storage, SETUP_CATALOG)).toEqual(DEFAULT_SETUP);
  });

  it('null storage → false; removeItem throws → false, no throw', () => {
    expect(clearSetup(null)).toBe(false);
    const storage: SetupStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => clearSetup(storage)).not.toThrow();
    expect(clearSetup(storage)).toBe(false);
  });
});

describe('browserStorage', () => {
  it('returns null when window is undefined (plain Node)', () => {
    expect(typeof window).toBe('undefined');
    expect(browserStorage()).toBeNull();
  });

  it('returns null when accessing window.localStorage throws', () => {
    const win = Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('SecurityError: The operation is insecure.');
      },
    });
    vi.stubGlobal('window', win);
    expect(() => browserStorage()).not.toThrow();
    expect(browserStorage()).toBeNull();
  });

  it('returns null when window.localStorage is null; the Storage itself otherwise', () => {
    vi.stubGlobal('window', { localStorage: null });
    expect(browserStorage()).toBeNull();
    const { storage } = memoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    expect(browserStorage()).toBe(storage);
  });
});
