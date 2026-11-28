// Custom builds of the web app: validation, import/export and the storage format. Framework-free.

import { PET_KINDS, ROTATION_FILLERS, ROTATION_NAMES, checkFlags, customId, customVariant, loadVariant, picksAt, type BuildVariant, type CustomBuildData } from '../builds';
import { parseGenes, type RotationGenes } from '../rotation-genes';

export { parseGenes };
import { TALENT_BY_ID } from '../talents';
import type { PetKind } from '../types';

export const CUSTOM_STORAGE_KEY = 'wow-forever-sim:custom:v1';

export type { CustomBuildData };

export const PETS: readonly PetKind[] = PET_KINDS;
export const ROTATIONS: readonly BuildVariant['rotation'][] = ROTATION_NAMES;

/** Fillers a rotation template offers (the first is the default). */
export const FILLERS: Readonly<Record<BuildVariant['rotation'], readonly string[]>> = ROTATION_FILLERS;

/** The rotation a build starts with when switched to a rotation composed from spells. */
export const DEFAULT_GENES: RotationGenes = { coe: true, agony: true, corruption: true, siphon: false, immolate: false, minTtkSec: 6, drainSoulFinisher: true, filler: 'drain_life' };

/** A new empty build. */
export function emptyBuild(name: string): CustomBuildData {
  return { name, picks: [], rotation: 'demonology', filler: 'shadow_bolt', rank: 1, pet: 'succubus', sacrificed: null };
}

/** Coerces unknown data (storage, an import) to a valid build, or throws with the reason. */
export function parseBuild(raw: unknown): CustomBuildData {
  if (raw === null || typeof raw !== 'object') throw new Error('a build must be an object');
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : '';
  if (!name) throw new Error('a build needs a name');
  if (!Array.isArray(o.picks) || o.picks.some((p) => typeof p !== 'string' || !TALENT_BY_ID.has(p))) throw new Error('picks must be a list of known talent ids');
  const rotation = ROTATIONS.includes(o.rotation as never) ? (o.rotation as BuildVariant['rotation']) : 'demonology';
  const filler = FILLERS[rotation].includes(o.filler as string) ? (o.filler as string) : (FILLERS[rotation][0] as string);
  const rank = o.rank === 1 || o.rank === 2 || o.rank === 'max' ? o.rank : rotation === 'demonology' ? 1 : 'max';
  const pet = o.pet === null ? null : PETS.includes(o.pet as never) ? (o.pet as PetKind) : 'succubus';
  const sacrificed = PETS.includes(o.sacrificed as never) ? (o.sacrificed as PetKind) : null;
  const genes = parseGenes(o.genes);
  const flags = checkFlags(o); // immolate, coe, wrack_min_hp_pct, pet_rules: absent in older stored builds
  const data: CustomBuildData = { name, picks: o.picks as string[], rotation, filler, rank, pet, sacrificed, ...flags, ...(genes ? { genes } : {}) };
  customVariant(data); // validates the order
  return data;
}

/** A custom build that plays exactly like the built-in build `id` (talent order, rotation template and its flags). */
export function copyOfBuiltIn(id: string, name: string): CustomBuildData {
  const v = loadVariant(id);
  const flags = checkFlags({ ...v, ...(v.pet_rules ? { pet_rules: v.pet_rules.map((r) => ({ ...r })) } : {}) });
  return { name, picks: picksAt(v, 60), rotation: v.rotation, filler: v.filler, rank: v.rank, pet: v.pet, sacrificed: v.sacrificed, ...flags };
}

export const exportBuild = (b: CustomBuildData): string => JSON.stringify(b, null, 2);

/** A name not used by `existing` ("Build", "Build 2", ...). */
export function uniqueName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

export interface CustomState {
  builds: CustomBuildData[];
  /** The build being edited (a name), or null. */
  active: string | null;
  /** Names of the builds that join the ranking. */
  included: string[];
}

export const EMPTY_CUSTOM: CustomState = { builds: [], active: null, included: [] };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The saved state; unreadable or invalid parts are dropped. */
export function loadCustom(storage: Store | null): CustomState {
  try {
    const raw = storage?.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return EMPTY_CUSTOM;
    const o = JSON.parse(raw) as Partial<CustomState>;
    const builds: CustomBuildData[] = [];
    for (const b of Array.isArray(o.builds) ? o.builds : []) {
      try {
        const p = parseBuild(b);
        if (!builds.some((x) => x.name === p.name)) builds.push(p);
      } catch {
        /* a corrupt entry is skipped */
      }
    }
    const names = builds.map((b) => b.name);
    return {
      builds,
      active: typeof o.active === 'string' && names.includes(o.active) ? o.active : (names[names.length - 1] ?? null),
      included: (Array.isArray(o.included) ? o.included : []).filter((n): n is string => typeof n === 'string' && names.includes(n)),
    };
  } catch {
    return EMPTY_CUSTOM;
  }
}

export function saveCustom(storage: Store | null, state: CustomState): void {
  try {
    storage?.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: not remembered */
  }
}

export { customId };
