// Import of the wowsims addon export (talents): the JSON the exporter addon writes becomes a custom build.
// Framework-free. Items, race, level and professions of the export are ignored here.

import type { CustomBuildData } from '../builds';
import { MAX_TALENT_POINTS, TALENTS, validatePicks } from '../talents';

/** True for the addon's JSON (it has `class` and `talents`), false for the app's own build format. */
export function isAddonExport(raw: unknown): boolean {
  return raw !== null && typeof raw === 'object' && 'class' in raw && 'talents' in raw;
}

const BY_SPEC: Readonly<Record<string, Omit<CustomBuildData, 'name' | 'picks'>>> = {
  affliction: { rotation: 'affliction', filler: 'wrack', rank: 'max', pet: 'voidwalker', sacrificed: null },
  demonology: { rotation: 'demonology', filler: 'shadow_bolt', rank: 1, pet: 'succubus', sacrificed: null },
  destruction: { rotation: 'fire', filler: 'searing_pain', rank: 'max', pet: 'imp', sacrificed: null },
};

/** Ranks of the digit string -> a legal order: talents top to bottom, left to right, `rank` copies each. Throws a readable error. */
export function parseAddonExport(raw: unknown): { build: CustomBuildData; points: number; gameLevel: number | null } {
  if (raw === null || typeof raw !== 'object') throw new Error('the export must be an object');
  const o = raw as Record<string, unknown>;
  if (o.class !== 'warlock') throw new Error(`only warlock exports are supported, got "${String(o.class)}"`);
  const digits = o.talents === undefined || o.talents === null ? '' : o.talents;
  if (typeof digits !== 'string') throw new Error('talents must be a digit string');
  if (!/^\d*$/.test(digits)) throw new Error(`talents has a character that is not a digit: "${digits.replace(/\d/g, '')[0]}"`);
  if (digits.length > TALENTS.length) throw new Error(`talents has ${digits.length} digits, at most ${TALENTS.length}`);
  const picks: string[] = [];
  for (let i = 0; i < digits.length; i++) {
    const t = TALENTS[i]!;
    const rank = Number(digits[i]);
    if (rank > t.maxRank) throw new Error(`${t.name}: rank ${rank} is above its maximum ${t.maxRank}`);
    for (let k = 0; k < rank; k++) picks.push(t.id);
  }
  if (picks.length > MAX_TALENT_POINTS) throw new Error(`talents spend ${picks.length} points, at most ${MAX_TALENT_POINTS}`);
  const check = validatePicks(picks);
  if (!check.ok) throw new Error(`illegal talents: ${check.errors[0]}`);
  const spec = typeof o.spec === 'string' && Object.hasOwn(BY_SPEC, o.spec) ? o.spec : 'affliction';
  const who = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Import z addonu';
  const name = `${who} (${typeof o.spec === 'string' && o.spec ? o.spec : spec})`.slice(0, 40);
  return {
    build: { name, picks, ...(BY_SPEC[spec] as Omit<CustomBuildData, 'name' | 'picks'>) },
    points: picks.length,
    gameLevel: typeof o.level === 'number' && Number.isFinite(o.level) ? o.level : null,
  };
}
