// `npm run addon:export [-- --out <file> --eureka first_affected]`
// Writes RotationData.lua for the LifeTapAdvisor addon: the rotation JSON of every build (steps with
// explicit conditions) plus the numbers the addon cannot read in the game (the client hides health):
// per level, how many percent of a mob's health one second of your damage is, so that "the target
// lives 6 s or longer" becomes "target health is at least X%". Also the talents (layout, spell ids,
// icons) and the order every build spends its points in, for the talent trees in the settings window.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { effectNum } from '../src/forever/effects';
import { loadOrder, ranksAt, loadVariant, VARIANT_IDS } from '../src/forever/builds';
import { loadParams } from '../src/forever/data/load';
import { simulatePull } from '../src/forever/fight';
import { rotationSpec } from '../src/forever/rotation-spec';
import { getSpell } from '../src/forever/spells';
import { TALENTS, validatePicks } from '../src/forever/talents';
import type { EurekaPolicy } from '../src/forever/types';
import { TALENT_ICONS } from '../src/ui/forever/icons';
import { TALENT_WOWHEAD_IDS } from '../src/ui/forever/wowheadIds';
import { POLICIES } from '../src/forever/web/api';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
};
const ADDON_DIR = 'C:/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/LifeTapAdvisor';
const out = arg('out', existsSync(ADDON_DIR) ? join(ADDON_DIR, 'RotationData.lua') : 'addon-out/RotationData.lua');
const eurekaPolicy = arg('eureka', 'first_affected') as EurekaPolicy;
const levels = Array.from({ length: 50 }, (_, i) => 10 + i);

/** Spell ranks (ids from Wowhead Forever, see data/spells.json) and names. Wrack and Curse of the Elements: the addon looks them up by name. */
const SPELL_IDS: Record<string, number[]> = {
  shadow_bolt: [686, 695, 705, 1088, 1106, 7641, 11659, 11660, 11661, 25307],
  corruption: [172, 6222, 6223, 7648, 11671, 11672, 25311],
  bane_of_agony: [980, 1014, 6217, 11711, 11712, 11713],
  immolate: [348, 707, 1094, 2941, 11665, 11667, 11668, 25309],
  searing_pain: [5676, 17919, 17920, 17921, 17922, 17923],
  drain_life: [689, 699, 709, 7651, 11699, 11700],
  drain_soul: [1120, 8288, 8289, 11675],
  siphon_life: [18265, 18879, 18880, 18881],
  life_tap: [1454, 1455, 1456, 11687, 11688, 11689],
  curse_of_elements: [440892, 1311676, 1311677, 1311680],
  wrack: [],
  eureka: [1259821],
};
const NAMES: Record<string, string> = { eureka: 'Eureka!', curse_of_elements: 'Curse of the Elements' };

const luaInline = (v: unknown): string => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  const key = (k: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${/^\d+$/.test(k) ? k : JSON.stringify(k)}]`);
  if (Array.isArray(v)) return `{ ${v.map(luaInline).join(', ')} }`;
  return `{ ${Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => `${key(k)} = ${luaInline(x)}`).join(', ')} }`;
};

const lua = (v: unknown, indent = 0): string => {
  const flat = luaInline(v);
  if (flat.length <= 110) return flat;
  const pad = '  '.repeat(indent + 1);
  const end = '  '.repeat(indent);
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return v.length === 0 ? '{}' : `{\n${v.map((x) => `${pad}${lua(x, indent + 1)}`).join(',\n')},\n${end}}`;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  const key = (k: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${/^\d+$/.test(k) ? k : JSON.stringify(k)}]`);
  return entries.length === 0 ? '{}' : `{\n${entries.map(([k, x]) => `${pad}${key(k)} = ${lua(x, indent + 1)}`).join(',\n')},\n${end}}`;
};

const params = loadParams({ ...POLICIES.BEST_1MOB!.params, eureka_policy: eurekaPolicy });
const spells: Record<string, { name: string; ids: number[]; durationSec?: number; rankDurationSec?: Record<number, number> }> = {};
for (const id of Object.keys(SPELL_IDS)) {
  let name = NAMES[id];
  if (!name) name = getSpell(id).name;
  // How long a DoT or curse of yours lasts on the target (the addon cannot read the target's auras when the client hides them).
  // `durationSec` is the highest rank's; ranks that last differently (Corruption 1 and 2) are listed by their spell id.
  let durationSec: number | undefined;
  let rankDurationSec: Record<number, number> | undefined;
  const ids = SPELL_IDS[id] as number[];
  let spell: ReturnType<typeof getSpell> | undefined;
  try {
    spell = getSpell(id);
  } catch {
    /* spells outside the model have no duration */
  }
  if (spell && (spell.kind === 'dot' || spell.kind === 'direct+dot' || spell.kind === 'curse')) {
    const perRank = spell.ranks.map((r) => r.durationMs ?? spell.durationMs);
    const ms = perRank[perRank.length - 1];
    if (ms !== undefined) durationSec = ms / 1000;
    const other = perRank.map((x, i) => [i, x] as const).filter(([, x]) => x !== undefined && x !== ms);
    if (other.length > 0) {
      if (perRank.length !== ids.length) throw new Error(`${id}: ${perRank.length} ranks but ${ids.length} spell ids, cannot tell which id lasts how long`);
      rankDurationSec = Object.fromEntries(other.map(([i, x]) => [ids[i] as number, (x as number) / 1000]));
    }
  }
  spells[id] = { name, ids, durationSec, rankDurationSec };
}

// The addon finds a talent of the game by its spell id (rank 1), or by its English name.
const talents = TALENTS.map((t) => ({ id: t.id, name: t.name, tree: t.tree, row: t.row, col: t.col, max: t.maxRank, spell: TALENT_WOWHEAD_IDS[t.id], icon: TALENT_ICONS[t.id], requires: t.requires }));
/** Talent orders as `[talent, points]` runs, the first point at level 10; builds that share an order name the same one. */
const talentOrders: Record<string, [string, number][]> = {};

const builds: Record<string, unknown> = {};
let common: unknown = null;
for (const id of VARIANT_IDS) {
  const v = loadVariant(id);
  const spec = rotationSpec(v, params);
  // The addon shows one order per build; a build that respecs on the way would need both.
  if (v.pre_respec_build) throw new Error(`${id}: the talent view does not support pre_respec_build yet`);
  const picks = loadOrder(v.order);
  const check = validatePicks(picks);
  if (!check.ok) throw new Error(`${id}: ${check.errors.join('; ')}`);
  talentOrders[v.order] = picks.reduce<[string, number][]>((runs, t) => {
    const last = runs[runs.length - 1];
    if (last && last[0] === t) last[1] += 1;
    else runs.push([t, 1]);
    return runs;
  }, []);
  const hpPerSec: number[] = [];
  const finisherHpPerSec: number[] = [];
  const soulHarvest: number[] = [];
  const demonicBrand: number[] = [];
  for (const level of levels) {
    const r = simulatePull({ variant: v, level, profile: 'average', params, mobs: 1 }, 1).rates;
    const ranks = ranksAt(v, level);
    // Percent of a mob's health that one second of damage is: the filler estimate (as `estTtkSec`), and the total with DoTs, pet and Drain Soul (as `drainSoulKillSec`).
    const round = (x: number): number => Math.round(x * 100) / 100;
    hpPerSec.push(round((100 * r.dpsEstimate) / r.mobHp));
    finisherHpPerSec.push(round((100 * (r.dotsDps + r.petDps + r.drainSoulDps)) / r.mobHp));
    soulHarvest.push(ranks['soul_harvest'] ?? 0);
    demonicBrand.push(ranks['demonic_brand'] ?? 0);
  }
  builds[id] = {
    // the demon by level and pull size, in words for the settings window
    petNote: (v.pet_rules?.length ? v.pet_rules : undefined)?.map((r) => `${r.pet}${r.fromLevel ? ` from ${r.fromLevel}` : ''}${r.toLevel ? ` to ${r.toLevel}` : ''}${r.maxMobs === 1 ? ' (1 mob)' : r.minMobs ? ` (${r.minMobs}${r.maxMobs === r.minMobs ? '' : '+'} mobs)` : ''}`).join(', '),
    kind: spec.kind,
    pet: v.pet,
    talentOrder: v.order,
    steps: spec.steps,
    // Index = level - firstLevel. Percent of a mob's health: one second of your damage (the estimate behind "target lives N s"), and of damage with DoTs, pet and Drain Soul (behind the Drain Soul finisher).
    perLevel: { firstLevel: levels[0], hpPerSec, finisherHpPerSec, soulHarvest, demonicBrand },
  };
  common = { eureka: spec.eureka, lifeTap: spec.lifeTap, fallback: spec.fallback, brandWindowSec: effectNum('demonic_brand', 'durationMs') / 1000 };
}

// Eureka! timings the panel offers (the steps do not depend on them): off, with the first modified spell, with the filler, at the end of the fight, at the start of the pull.
const eurekaPolicies: Record<string, unknown> = {};
for (const policy of ['off', 'first_affected', 'filler', 'ttk', 'pull_start'] as EurekaPolicy[]) {
  eurekaPolicies[policy] = rotationSpec(loadVariant('DT_SS'), loadParams({ ...POLICIES.BEST_1MOB!.params, eureka_policy: policy })).eureka;
}

const text = `-- Generated by \`npm run addon:export\` from the rotation-trainer app. Do not edit by hand.
-- Rotation steps with explicit conditions per build; \`perLevel\` converts times to percent of target health.
-- \`talents\` and \`talentOrders\` describe the talent trees and the order each build spends its points in.
local ADDON, ns = ...
ns.RotationData = ${lua({ schema: 'forever-rotation/1', eurekaPolicy, buildOrder: VARIANT_IDS, eurekaPolicies, spells, common, talents, talentOrders, builds })}
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.log(`wrote ${out} (${Object.keys(builds).length} builds, ${(text.length / 1024).toFixed(0)} KB)`);
