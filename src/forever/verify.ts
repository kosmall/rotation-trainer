// Registry of every assumption flagged `verify: true` in the data files, for the report.

import levels from './data/levels.json';
import params from './data/params.json';
import spells from './data/spells.json';
import talents from './data/talents.json';
import { walkVerify } from './data/load';

export interface Assumption {
  file: string;
  name: string;
  source: string;
}

interface Named { id?: string; name?: string; verify?: boolean; source?: string }

/** Every `verify: true` entry across the data files; talents and spells are named by their id. */
export function collectVerify(): Assumption[] {
  const out: Assumption[] = [];
  for (const [key, raw] of Object.entries(params as Record<string, Named>)) {
    if (!key.startsWith('_') && raw.verify) out.push({ file: 'params.json', name: key, source: raw.source ?? '' });
  }
  for (const t of (talents as { talents: Named[] }).talents) if (t.verify) out.push({ file: 'talents.json', name: String(t.id), source: t.source ?? '' });
  for (const s of (spells as { spells: Named[] }).spells) if (s.verify) out.push({ file: 'spells.json', name: String(s.id), source: s.source ?? '' });
  for (const item of walkVerify(levels, 'levels', [])) out.push({ file: 'levels.json', name: item.path, source: item.source });
  return out;
}
