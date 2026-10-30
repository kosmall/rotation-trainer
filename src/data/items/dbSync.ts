import data from './db.json';
import type { ItemDb } from './types';

// Synchronous access for tests and node scripts. Kept out of db.ts on purpose: a static import of
// db.json from a module the app imports would pull the whole database into the main chunk, while
// `loadItemDb` (db.ts) keeps it in a lazy chunk. App code uses `loadItemDb`.

const db = data as unknown as ItemDb;

/** The item database, loaded synchronously (tests, scripts). Shared data: do not mutate. */
export function itemDbSync(): ItemDb {
  return db;
}
