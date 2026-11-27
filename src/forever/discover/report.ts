// The Markdown report and JSON of a build discovery run. Framework-free.

import { loadParams } from '../data/load';
import type { Cond } from '../rotation-spec';
import { getSpell } from '../spells';
import { TALENT_BY_ID, TALENTS } from '../talents';
import type { Params, Tree } from '../types';
import { collectVerify } from '../verify';
import type { DiscoverResult, TopRow } from './engine';
import { buildRotation, liveSteps, sacrificeLive } from './space';

const VERIFY = collectVerify();
const flagged = (file: string, name: string): boolean => VERIFY.some((a) => a.file === file && a.name === name);

/** The estimated (`verify: true`) values a result depends on, as `file:name`. */
export function verifyFor(row: TopRow, level: number): string[] {
  const out: string[] = [];
  const add = (file: string, name: string): void => {
    const k = `${file}:${name}`;
    if (flagged(file, name) && !out.includes(k)) out.push(k);
  };
  const spells = new Set(liveSteps(row.combo, level, row.ranks).map((s) => s.spell));
  spells.add('life_tap');
  for (const s of [...spells].sort()) add('spells.json', s);
  for (const t of TALENTS) if ((row.ranks[t.id] ?? 0) > 0) add('talents.json', t.id);
  const pets = row.combo.pets.pet !== null || sacrificeLive(row.combo, row.ranks);
  if (pets) add('levels.json', 'levels.pets');
  add('params.json', 'mob_hp_mult');
  add('params.json', 'mob_dmg_mult');
  if (spells.has('wrack')) add('params.json', 'wrack_dmg_mult');
  if (spells.has('drain_life') || spells.has('drain_soul')) add('params.json', 'drain_dmg_mult');
  if (row.combo.pets.pet !== null) {
    add('params.json', 'pet_dmg_mult');
    add('params.json', 'pet_hit_chance');
  }
  if ((row.ranks.demonic_brand ?? 0) > 0) {
    add('params.json', 'brand_mult');
    add('params.json', 'brand_scale');
  }
  const est = buildRotation(row.combo.genes, loadParams()).estimate;
  if (est.filler === 'shadow_bolt' && est.fillerRank === 1) add('params.json', 'sb_r1_coeff_mult');
  if (est.filler === 'shadow_bolt' && est.fillerRank === 2) add('params.json', 'sb_r2_coeff_mult');
  return out;
}

const f1 = (x: number): string => x.toFixed(1);
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const TREE_NAME: Record<Tree, string> = { aff: 'Affliction', demo: 'Demonology', destro: 'Destruction' };

function duration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function petText(row: TopRow): string {
  const pet = row.combo.pets.pet ? cap(row.combo.pets.pet) : 'none';
  const sac = sacrificeLive(row.combo, row.ranks) ? row.combo.pets.sacrificed : null;
  return sac ? `${pet} (sacrificed ${cap(sac)})` : pet;
}

const spellName = (id: string): string => getSpell(id).name;
const talentName = (id: string): string => TALENT_BY_ID.get(id)?.name ?? id;

function condText(c: Cond): string {
  switch (c.op) {
    case 'true':
      return 'always';
    case 'all': {
      const parts = c.of.filter((x) => x.op !== 'knows').map(condText);
      return parts.length ? parts.join(' and ') : 'always';
    }
    case 'any':
      return `(${c.of.map(condText).join(' or ')})`;
    case 'not':
      return c.of.op === 'target_has_dot' ? `target lacks ${spellName(c.of.spell)}` : c.of.op === 'target_has_curse' ? 'target has no curse' : `not ${condText(c.of)}`;
    case 'proc':
      return 'Shadow Trance';
    case 'knows':
      return 'always';
    case 'target_has_dot':
      return `target has ${spellName(c.spell)}`;
    case 'target_has_curse':
      return 'target has a curse';
    case 'ttk_at_least':
      return `TTK ≥ ${c.sec} s`;
    case 'ttk_at_most':
      return `TTK ≤ ${c.sec} s`;
    case 'pet_alive':
      return 'pet alive';
    case 'talent_rank_at_least':
      return `with ${talentName(c.id)}`;
    case 'brand_needs_refresh':
      return 'Demonic Brand needs a refresh';
    case 'drain_soul_kills_within':
      return `Drain Soul kills in ${c.minSec}-${c.maxSec} s`;
    case 'mobs_in_pull_is':
      return `${c.count} mob${c.count === 1 ? '' : 's'} in the pull`;
    case 'mana_pct_below':
      return `mana < ${c.pct}%`;
    case 'hp_pct_above':
      return `health > ${c.pct}%`;
    default:
      return c.op;
  }
}

export function renderDiscoverReport(r: DiscoverResult, runSec: number): string {
  const m = r.meta;
  const params = loadParams(m.changedParams as Partial<Params>);
  const L: string[] = [];
  L.push(`# Build discovery: level ${m.level}`, '');
  L.push(`Talents × rotations composed from the simulator's spells × pet setups, ranked by kills per hour at level ${m.level} (${m.points} talent points).`, '');
  L.push(`- Gear profile: ${m.profile}; mobs per pull: ${m.mobs}; seed: ${m.seed}; Talented perk: ${m.perk}`);
  const changed = Object.entries(m.changedParams);
  L.push(`- Changed parameters: ${changed.length ? changed.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ') : 'none (params.json defaults)'}`);
  L.push(`- Searched: ${m.combos} rotation × pet combinations screened${m.mixed ? ` plus ${m.mixed} mixed variants (second filler, other effect floors) of the best ones` : ''}, ${m.searched} searched in depth, ${m.evaluations} simulations; run time ${duration(runSec)}`);
  L.push(`- Data and settings hash: \`${m.hash}\``, '');
  L.push('How to read: **✓** the difference to the best known build is significant (95% CI on paired sessions), **~** it is within the noise; **≈#1** the row is not significantly worse than row 1. "Nearest known" is the known build with the fewest talent points moved (in brackets).', '');

  L.push('## Known builds (baseline)', '', '| Build | Kills/h | 95% CI |', '|---|---:|---|');
  for (const b of r.baseline) L.push(`| ${b.id} | ${f1(b.metrics.killsPerHour)} | ${f1(b.kphCi[0])}–${f1(b.kphCi[1])} |`);
  L.push('');

  const vs = r.top[0]?.gainVsBest.vs ?? '';
  L.push(`## Top ${r.top.length}`, '');
  L.push(`| # | Kills/h | ± CI | vs ${vs || 'best known'} | Trees | Pet | Rotation | TTK s | Downtime % | Deaths/h | Nearest known |`);
  L.push('|---|---:|---:|---:|---|---|---|---:|---:|---:|---|');
  for (const t of r.top) {
    const g = t.gainVsBest;
    L.push(
      `| ${t.rank}${t.tiedWithFirst ? ' ≈#1' : ''} | ${f1(t.metrics.killsPerHour)} | ${f1((t.kphCi[1] - t.kphCi[0]) / 2)} | ${signed(g.pct)}% ${g.significant ? '✓' : '~'} | ${t.perTree.aff}/${t.perTree.demo}/${t.perTree.destro} | ${petText(t)} | ${t.label} | ${f1(t.metrics.ttkMean)} | ${f1(t.metrics.downtimeShare * 100)} | ${t.metrics.deathsPerHour.toFixed(2)} | ${t.nearestKnown.id} (${t.nearestKnown.distance}) |`,
    );
  }
  L.push('');

  L.push('## Details', '');
  for (const t of r.top) {
    L.push(`### ${t.rank}. ${t.label}, ${petText(t)}`, '');
    L.push(`${f1(t.metrics.killsPerHour)} kills/h (95% CI ${f1(t.kphCi[0])}–${f1(t.kphCi[1])}), ${signed(t.gainVsBest.pct)}% vs ${t.gainVsBest.vs}.`, '');
    for (const tree of ['aff', 'demo', 'destro'] as Tree[]) {
      const list = TALENTS.filter((x) => x.tree === tree && (t.ranks[x.id] ?? 0) > 0).map((x) => `${x.name} ${t.ranks[x.id]}${x.status === 'modelled' ? '' : '*'}`);
      if (list.length) L.push(`- **${TREE_NAME[tree]} (${t.perTree[tree]}):** ${list.join(', ')}`);
    }
    L.push(`- Free points (no modelled effect, marked *): ${t.freePoints}`);
    if (t.insensitive) L.push(`- Insensitive (a point moved to a dead talent costs nothing significant): ${t.insensitive.length ? t.insensitive.map(talentName).join(', ') : 'none'}`);
    L.push('', 'Rotation (first castable step wins; Life Tap and Eureka! follow the parameters):', '');
    liveSteps(t.combo, m.level, t.ranks, params).forEach((s, i) => {
      L.push(`${i + 1}. ${spellName(s.spell)}${s.rank === 'max' ? '' : ` r${s.rank}`}: ${condText(s.when)}${s.filler ? ' (filler)' : ''}`);
    });
    const v = verifyFor(t, m.level);
    L.push('', `Leans on estimates: ${v.length ? v.map((x) => `\`${x}\``).join(', ') : 'none'}`, '');
  }
  return L.join('\n');
}

/** The result as JSON (no raw sessions). */
export function toJson(r: DiscoverResult): string {
  return JSON.stringify(r, null, 2);
}
