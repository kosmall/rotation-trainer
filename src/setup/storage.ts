// Persistence of the player's setup in localStorage (stage 1.5 Part C, Review Focus 3).
// Framework-free; nothing here throws. Stored data is never trusted: every load goes through
// `normalizeSetup`, and so does every save (storage only ever holds a normalized config).

import type { BuffDef } from '../data/types';
import { normalizeSetup, SETUP_CATALOG } from './defaults';
import type { SetupConfig } from './types';

/** The localStorage key; the version suffix lets a later format move to a new key. */
export const SETUP_STORAGE_KEY = 'rotation-trainer:setup:v1';

/**
 * Longest stored text (UTF-16 code units) that is parsed or written. A full legitimate config is
 * under 1 kB today (383 characters for the default, 854 with every catalog buff tried: one entry
 * per timed catalog buff plus the enabled ids), so 100 000 leaves room for a catalog 100 times
 * larger while bounding the work on corrupt or hostile data: a longer value is ignored
 * before `JSON.parse` (no time or memory spent on a 1 MB string, no 100k-deep nesting reaches the
 * parser), and `saveSetup` refuses to write one.
 */
export const SETUP_STORAGE_MAX_CHARS = 100_000;

/** The part of the Web Storage API the setup uses (tests pass in-memory fakes). */
export type SetupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The stored setup, normalized for `catalog`. Never throws: no storage, nothing stored, a storage
 * that throws or returns a non-string, text over the size cap, invalid JSON (including a parser
 * stack overflow) or a value of the wrong shape all give the defaults; a partly valid config keeps
 * its valid parts (`normalizeSetup`). Reads only `SETUP_STORAGE_KEY` and writes nothing.
 */
export function loadSetup(storage: SetupStorage | null, catalog: readonly BuffDef[]): SetupConfig {
  let parsed: unknown;
  try {
    const text: unknown = storage?.getItem(SETUP_STORAGE_KEY);
    if (typeof text === 'string' && text.length <= SETUP_STORAGE_MAX_CHARS) parsed = JSON.parse(text);
  } catch {
    // SecurityError, SyntaxError, RangeError (deep nesting): nothing usable was stored.
    parsed = undefined;
  }
  return normalizeSetup(parsed, catalog);
}

/**
 * Saves `config`, normalized for `catalog` first, as JSON under `SETUP_STORAGE_KEY`. Returns false
 * (never throws) when there is no storage, the text would exceed `SETUP_STORAGE_MAX_CHARS`, or the
 * storage refuses it (quota, private mode, security policy).
 */
export function saveSetup(
  storage: SetupStorage | null,
  config: SetupConfig,
  catalog: readonly BuffDef[] = SETUP_CATALOG,
): boolean {
  if (!storage) return false;
  try {
    const text = JSON.stringify(normalizeSetup(config, catalog));
    if (text.length > SETUP_STORAGE_MAX_CHARS) return false;
    storage.setItem(SETUP_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** Removes the stored setup (only `SETUP_STORAGE_KEY`). False, never a throw, when it could not. */
export function clearSetup(storage: SetupStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SETUP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser's localStorage, or null where there is none: no `window` (Node, tests), or reading
 * `window.localStorage` throws (storage disabled, sandboxed iframe, file:// in some browsers).
 */
export function browserStorage(): SetupStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
