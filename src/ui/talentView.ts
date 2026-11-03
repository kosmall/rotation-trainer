// The Talents panel's view model (stage 2b Task 4): pure helpers over the talent tree, the codec
// and the talent effects. Every edit goes through the validators (`canAddPoint` / `canRemovePoint`,
// then `validateTalents`) and comes out as a full-width talent string (`encodeTalents`); the caller
// puts it into `SetupConfig.talents` and runs `normalizeSetup`. Never throws on hostile text.

import { UNMODELLED_TALENTS } from '../data/classes/warlock/talentEffects';
import type { TalentPreset } from '../data/classes/warlock/talentPresets';
import {
  canAddPoint,
  canRemovePoint,
  decodeTalents,
  encodeTalents,
  TALENT_POINTS_MAX,
  TALENT_TREE,
  validateTalents,
  type TalentCheck,
  type TalentDef,
} from '../data/classes/warlock/talentTree';
import { applyImportedTalents, IMPORT_MAX_CHARS, type ImportedTalents } from '../setup/wowsimsGear';

/** The name shown when the build matches no talent preset. */
export const CUSTOM_TALENTS_NAME = 'Custom';

/** Every talent's rank in a talent string (all 0 for a malformed one; read as written otherwise). */
export function ranksOf(talents: string): Record<string, number> {
  return decodeTalents(talents).ranks;
}

/** Points per tree (Affliction, Demonology, Destruction). */
export function treePoints(ranks: Readonly<Record<string, number>>): [number, number, number] {
  const sum = (t: number) => (TALENT_TREE.trees[t]?.talents ?? []).reduce((n, d) => n + (ranks[d.id] ?? 0), 0);
  return [sum(0), sum(1), sum(2)];
}

/** "0 / 21 / 40 · 0 left". */
export function pointsText(points: readonly number[]): string {
  const spent = points.reduce((a, b) => a + b, 0);
  return `${points.join(' / ')} · ${TALENT_POINTS_MAX - spent} left`;
}

/** The reason a talent is not modelled, or undefined when it is. */
export function unmodelledReason(id: string): string | undefined {
  return Object.hasOwn(UNMODELLED_TALENTS, id) ? UNMODELLED_TALENTS[id] : undefined;
}

export interface TalentView {
  def: TalentDef;
  rank: number;
  add: TalentCheck;
  remove: TalentCheck;
  /** Not modelled: why. */
  unmodelled?: string;
  /** 'available' (a point can go in), 'full' (max rank), 'locked' (rank 0, no point can go in), 'blocked' (points in, no more allowed). */
  state: 'available' | 'full' | 'locked' | 'blocked';
  /** The button's accessible name: "Bane, rank 5 of 5, full rank", "Intensity, rank 2 of 2, not modelled, full rank". */
  label: string;
}

/** What the editor shows for one talent of the build. */
export function talentView(ranks: Readonly<Record<string, number>>, def: TalentDef): TalentView {
  const rank = ranks[def.id] ?? 0;
  const add = canAddPoint(ranks, def.id);
  const remove = canRemovePoint(ranks, def.id);
  const unmodelled = unmodelledReason(def.id);
  const state: TalentView['state'] = add.ok ? 'available' : rank >= def.maxRank ? 'full' : rank === 0 ? 'locked' : 'blocked';
  const stateText =
    state === 'available'
      ? 'available'
      : state === 'full'
        ? 'full rank'
        : `${state === 'locked' ? 'locked' : 'no more points'}: ${add.ok ? '' : add.reason}`;
  const label = `${def.name}, rank ${rank} of ${def.maxRank}, ${unmodelled !== undefined ? 'not modelled, ' : ''}${stateText}`;
  return { def, rank, add, remove, ...(unmodelled !== undefined && { unmodelled }), state, label };
}

export type TalentEdit = { ok: true; talents: string; message: string } | { ok: false; reason: string };

/** One more point in `id`: through `canAddPoint`, then the whole build through `validateTalents`. */
export function addPoint(talents: string, id: string): TalentEdit {
  const ranks = ranksOf(talents);
  const check = canAddPoint(ranks, id);
  if (!check.ok) return check;
  return commit(ranks, id, 1);
}

/** One point out of `id`: through `canRemovePoint`, then the whole build through `validateTalents`. */
export function removePoint(talents: string, id: string): TalentEdit {
  const ranks = ranksOf(talents);
  const check = canRemovePoint(ranks, id);
  if (!check.ok) return check;
  return commit(ranks, id, -1);
}

function commit(ranks: Record<string, number>, id: string, delta: 1 | -1): TalentEdit {
  const def = TALENT_TREE.trees.flatMap((t) => t.talents).find((d) => d.id === id);
  if (!def) return { ok: false, reason: 'Unknown talent.' };
  const next = { ...ranks, [id]: (ranks[id] ?? 0) + delta };
  const errors = validateTalents(next);
  if (errors.length > 0) return { ok: false, reason: errors[0]! };
  const rank = next[id]!;
  const message = `${delta > 0 ? 'Added a point to' : 'Removed a point from'} ${def.name} (${rank}/${def.maxRank}).`;
  return { ok: true, talents: encodeTalents(next), message };
}

/** Whether two builds have the same rank in every talent (deep equality of the rank maps). */
export function sameBuild(a: string, b: string): boolean {
  const ra = ranksOf(a);
  const rb = ranksOf(b);
  return TALENT_TREE.trees.every((t) => t.talents.every((d) => (ra[d.id] ?? 0) === (rb[d.id] ?? 0)));
}

/** The first preset with the same build, or undefined ("Custom"). */
export function matchingTalentPreset<P extends Pick<TalentPreset, 'talents'>>(talents: string, presets: readonly P[]): P | undefined {
  return presets.find((p) => sameBuild(talents, p.talents));
}

/** The build's preset name, or "Custom". */
export function talentBuildName(talents: string, presets: readonly Pick<TalentPreset, 'talents' | 'name'>[]): string {
  return matchingTalentPreset(talents, presets)?.name ?? CUSTOM_TALENTS_NAME;
}

export interface BuildSummary {
  modelledPoints: number;
  unmodelledPoints: number;
  /** The build's not-modelled talents with points: name, rank, why. */
  unmodelled: { id: string; name: string; rank: number; maxRank: number; reason: string }[];
  /** Points not spent (61 - spent). */
  left: number;
}

/** How many of the build's points the trainer models, and which talents it does not. */
export function buildSummary(ranks: Readonly<Record<string, number>>): BuildSummary {
  let modelledPoints = 0;
  let unmodelledPoints = 0;
  const unmodelled: BuildSummary['unmodelled'] = [];
  for (const t of TALENT_TREE.trees) {
    for (const d of t.talents) {
      const rank = ranks[d.id] ?? 0;
      if (rank === 0) continue;
      const reason = unmodelledReason(d.id);
      if (reason === undefined) modelledPoints += rank;
      else {
        unmodelledPoints += rank;
        unmodelled.push({ id: d.id, name: d.name, rank, maxRank: d.maxRank, reason });
      }
    }
  }
  return { modelledPoints, unmodelledPoints, unmodelled, left: TALENT_POINTS_MAX - modelledPoints - unmodelledPoints };
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A pasted import: a WowSimsExporter export (JSON with a `talents` string) or a bare talent string
 * (`-20500301332101-50500051220051053105`, short or full width). The build goes through
 * `applyImportedTalents` (the validator); the result is the build to apply or every violation.
 * Hostile text is safe: length-capped, JSON parsed in a try, own properties only. Empty text: null.
 */
export function readTalentImport(text: string): ImportedTalents | null {
  if (typeof text !== 'string') return { ok: false, errors: ['Nothing to import.'] };
  if (text.length > IMPORT_MAX_CHARS) {
    return { ok: false, errors: [`The text is longer than ${IMPORT_MAX_CHARS} characters; an export is far shorter.`] };
  }
  const trimmed = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
  if (trimmed === '') return null;
  if (!trimmed.startsWith('{')) return applyImportedTalents({ talents: trimmed });
  let root: unknown;
  try {
    root = JSON.parse(trimmed);
  } catch {
    return { ok: false, errors: ['The text is not valid JSON: paste the whole export, or the talent string alone.'] };
  }
  if (!isRecord(root)) return { ok: false, errors: ['The export has no talent string.'] };
  const talents = Object.hasOwn(root, 'talents') ? root.talents : undefined;
  const cls = Object.hasOwn(root, 'class') ? root.class : undefined;
  if (typeof cls === 'string' && cls.trim() !== '' && cls.trim().toLowerCase() !== 'warlock') {
    return { ok: false, errors: [`The export is of a ${cls.trim().slice(0, 32)}, not a warlock: its talents do not fit the warlock tree.`] };
  }
  return applyImportedTalents({ talents: typeof talents === 'string' ? talents : undefined });
}
