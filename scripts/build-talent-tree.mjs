// Generates the Warlock talent tree (src/data/classes/warlock/talentTree.json: the structure, which
// the codec, the effects, the setup and the simulator worker import) and the talent descriptions
// (talentDescriptions.json: the tooltip text per rank, loaded lazily by the talent editor, stage 2b
// Task 3) from a local clone of
// github.com/wowsims/tbc-new (MIT licence) and Wowhead's TBC tooltip API. Run by hand when the
// source changes; the output is committed (neither the clone nor the network is needed at runtime):
//
//   npm run talents:build -- <path to the tbc-new clone>             (reuses the committed tooltips)
//   npm run talents:build -- <path to the tbc-new clone> --refresh   (asks Wowhead for every rank)
//
// From the clone it only READS JSON/text (ui/sim/talents/trees/warlock.json, proto/warlock.proto,
// .git/HEAD for the commit id); it never runs code from the clone. Per talent: wowsims `fieldName`
// (the id), `fancyName`, `location` {rowIdx, colIdx}, `prereqLocation` (resolved to the id of the
// talent in that cell of the same tree), `maxPoints` and `spellIds` (one TBC spell id per rank).
// The order of the talents is the order of the talent string and of proto WarlockTalents fields
// 1-64; the script checks both (3 trees, 21/22/21 talents) and exits 1 on any difference.
//
// Wowhead (https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5&locale=0), one request per
// rank, sequential with a pause and retries: `icon` of the rank 1 spell (the talent's icon) and the
// tooltip's description (`<div class="q">` blocks, HTML stripped to plain text). A rank whose
// tooltip stays unavailable gets an empty description (counted and printed; tests pin the count).
// Without --refresh the descriptions and icons already in the committed JSON files are reused (keyed
// by spell id), so a second run is byte-identical and makes no request; only new spell ids are asked.
// Exits 1 when the clone data is malformed or an icon cannot be resolved.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'src', 'data', 'classes', 'warlock', 'talentTree.json');
const descriptionsPath = join(root, 'src', 'data', 'classes', 'warlock', 'talentDescriptions.json');
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const clone = args.find((a) => !a.startsWith('--'));
if (!clone) {
  console.error('usage: npm run talents:build -- <path to a wowsims/tbc-new clone> [--refresh]');
  process.exit(2);
}

const TOOLTIP = (id) => `https://nether.wowhead.com/tbc/tooltip/spell/${id}?dataEnv=5&locale=0`;
const PLACEHOLDER_ICON = 'classic_temp';
const ATTEMPTS = 3;
const PAUSE_MS = 250;
const TREE_NAMES = ['Affliction', 'Demonology', 'Destruction'];
const TREE_SIZES = [21, 22, 21];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};

const treePath = join(clone, 'ui', 'sim', 'talents', 'trees', 'warlock.json');
const protoPath = join(clone, 'proto', 'warlock.proto');
if (!existsSync(treePath) || !existsSync(protoPath)) fail(`not a tbc-new clone: ${clone}`);

function commitOf(dir) {
  try {
    const head = readFileSync(join(dir, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 7);
    const ref = head.slice(5);
    const refFile = join(dir, '.git', ref);
    if (existsSync(refFile)) return readFileSync(refFile, 'utf8').trim().slice(0, 7);
    const packed = readFileSync(join(dir, '.git', 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 7) : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------------------------
// The tree JSON (untrusted data: every field is checked before use).
const source = JSON.parse(readFileSync(treePath, 'utf8'));
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
if (!Array.isArray(source) || source.length !== 3) fail('warlock.json: expected 3 trees');

const trees = source.map((tree, t) => {
  if (tree?.name !== TREE_NAMES[t]) fail(`tree ${t}: name ${JSON.stringify(tree?.name)}, expected ${TREE_NAMES[t]}`);
  if (!Array.isArray(tree.talents) || tree.talents.length !== TREE_SIZES[t]) {
    fail(`${tree.name}: ${tree.talents?.length} talents, expected ${TREE_SIZES[t]}`);
  }
  const talents = tree.talents.map((raw) => {
    const { fieldName, fancyName, location, prereqLocation, maxPoints, spellIds } = raw ?? {};
    if (typeof fieldName !== 'string' || !/^[a-z][A-Za-z]{1,40}$/.test(fieldName)) fail(`${tree.name}: bad fieldName ${JSON.stringify(fieldName)}`);
    if (typeof fancyName !== 'string' || !/^[A-Za-z' ]{1,60}$/.test(fancyName)) fail(`${fieldName}: bad fancyName`);
    if (!isInt(location?.rowIdx, 0, 8) || !isInt(location?.colIdx, 0, 3)) fail(`${fieldName}: bad location`);
    if (!isInt(maxPoints, 1, 5)) fail(`${fieldName}: bad maxPoints`);
    if (!Array.isArray(spellIds) || spellIds.length !== maxPoints || !spellIds.every((id) => isInt(id, 1, 1_000_000))) {
      fail(`${fieldName}: spellIds must be ${maxPoints} spell ids`);
    }
    if (prereqLocation !== undefined && (!isInt(prereqLocation?.rowIdx, 0, 8) || !isInt(prereqLocation?.colIdx, 0, 3))) {
      fail(`${fieldName}: bad prereqLocation`);
    }
    return { fieldName, fancyName, row: location.rowIdx, col: location.colIdx, prereqLocation, maxPoints, spellIds };
  });
  // Resolve prerequisites to talent ids (a cell of the same tree, in a higher row).
  for (const d of talents) {
    if (d.prereqLocation === undefined) continue;
    const p = talents.find((o) => o.row === d.prereqLocation.rowIdx && o.col === d.prereqLocation.colIdx);
    if (!p || p.row >= d.row) fail(`${d.fieldName}: prerequisite cell ${JSON.stringify(d.prereqLocation)} not found above it`);
    d.prereq = p.fieldName;
  }
  const cells = talents.map((d) => d.row * 4 + d.col);
  if (new Set(cells).size !== cells.length) fail(`${tree.name}: two talents share a cell`);
  if (cells.some((c, i) => i > 0 && c < cells[i - 1])) fail(`${tree.name}: talents not in row/column order`);
  return { name: tree.name, talents };
});

// proto/warlock.proto: WarlockTalents fields 1-64, same order as the talent string.
const protoText = readFileSync(protoPath, 'utf8');
const block = /message WarlockTalents \{([\s\S]*?)\n\}/.exec(protoText)?.[1];
if (!block) fail('proto/warlock.proto: no WarlockTalents message');
const protoFields = [...block.matchAll(/^\s*(?:int32|bool)\s+([a-z_]+)\s*=\s*(\d+);/gm)].map((m) => ({
  name: m[1].replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
  number: Number(m[2]),
}));
const fieldNames = trees.flatMap((t) => t.talents.map((d) => d.fieldName));
if (protoFields.length !== 64 || fieldNames.length !== 64) fail(`expected 64 talents (proto ${protoFields.length}, json ${fieldNames.length})`);
protoFields.forEach((f, i) => {
  if (f.number !== i + 1 || f.name !== fieldNames[i]) fail(`talent ${i + 1}: proto ${f.name} = ${f.number}, json ${fieldNames[i]}`);
});

// ---------------------------------------------------------------------------------------------
// Wowhead tooltips (reused from the committed output unless --refresh).
const known = new Map(); // spell id -> description
const knownIcons = new Map(); // talent id -> icon
if (!refresh && existsSync(outPath)) {
  const previous = JSON.parse(readFileSync(outPath, 'utf8'));
  const previousDescriptions = existsSync(descriptionsPath) ? JSON.parse(readFileSync(descriptionsPath, 'utf8')).descriptions : {};
  for (const d of previous.trees.flatMap((t) => t.talents)) {
    // Before stage 2b Task 3 the descriptions were in the tree file itself.
    const texts = Object.hasOwn(previousDescriptions, d.id) ? previousDescriptions[d.id] : d.descriptions;
    if (Array.isArray(texts)) d.wowheadIds.forEach((id, i) => typeof texts[i] === 'string' && known.set(id, texts[i]));
    knownIcons.set(d.id, d.icon);
  }
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** The plain text of a tooltip's description blocks (`<div class="q">`). */
function descriptionOf(html) {
  const blocks = [...html.matchAll(/<div class="q">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  return blocks
    .join(' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

let requests = 0;
async function tooltip(id) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (requests++ > 0) await sleep(PAUSE_MS);
    try {
      const res = await fetch(TOOLTIP(id), { headers: { 'user-agent': 'rotation-trainer personal talent data' } });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (typeof json?.tooltip !== 'string' || typeof json?.icon !== 'string') throw new Error('unexpected tooltip shape');
      return { name: String(json.name ?? ''), icon: json.icon, description: descriptionOf(json.tooltip) };
    } catch (error) {
      lastError = error;
      await sleep(1000 * 3 ** (attempt - 1));
    }
  }
  console.error(`WARN  spell ${id}: tooltip unavailable (${lastError?.message})`);
  return undefined;
}

let emptyDescriptions = 0;
for (const tree of trees) {
  for (const d of tree.talents) {
    d.descriptions = [];
    let icon = knownIcons.get(d.fieldName);
    for (const [rank, id] of d.spellIds.entries()) {
      let description = known.get(id);
      if (description === undefined || (rank === 0 && icon === undefined)) {
        const tip = await tooltip(id);
        description = tip?.description ?? '';
        if (tip && icon === undefined && /^[a-z0-9_]+$/.test(tip.icon) && tip.icon !== PLACEHOLDER_ICON) icon = tip.icon;
        if (tip && tip.name !== d.fancyName) console.log(`note  ${d.fieldName} rank ${rank + 1}: Wowhead names it "${tip.name}"`);
      }
      if (description === '') emptyDescriptions++;
      d.descriptions.push(description);
    }
    if (icon === undefined) fail(`${d.fieldName}: no icon from Wowhead for spell ${d.spellIds[0]} (or any rank)`);
    d.icon = icon;
  }
}

// ---------------------------------------------------------------------------------------------
// Output: one talent per line, fixed key order (deterministic, diff-friendly).
const commit = commitOf(clone);
const sourceText =
  `wowsims/tbc-new @ ${commit} ui/sim/talents/trees/warlock.json (MIT licence); ` +
  'icons: Wowhead TBC tooltips (nether.wowhead.com/tbc/tooltip/spell/<id>); descriptions: talentDescriptions.json';
const descriptionsSource = 'Wowhead TBC tooltips (nether.wowhead.com/tbc/tooltip/spell/<id>), one per rank, plain text';
const talentLine = (d, t) =>
  JSON.stringify({
    id: d.fieldName,
    name: d.fancyName,
    tree: t,
    row: d.row,
    col: d.col,
    maxRank: d.maxPoints,
    ...(d.prereq ? { prereq: d.prereq } : {}),
    icon: d.icon,
    wowheadIds: d.spellIds,
  });
const out =
  `{"source":${JSON.stringify(sourceText)},\n"trees":[\n` +
  trees
    .map((tree, t) => `{"name":${JSON.stringify(tree.name)},"talents":[\n${tree.talents.map((d) => talentLine(d, t)).join(',\n')}\n]}`)
    .join(',\n') +
  '\n]}\n';
const all = trees.flatMap((tree) => tree.talents);
const descriptionsOut =
  `{"source":${JSON.stringify(descriptionsSource)},\n"descriptions":{\n` +
  all.map((d) => `${JSON.stringify(d.fieldName)}:${JSON.stringify(d.descriptions)}`).join(',\n') +
  '\n}}\n';
writeFileSync(outPath, out);
writeFileSync(descriptionsPath, descriptionsOut);
console.log(
  `Wrote ${outPath} (${out.length} bytes) and ${descriptionsPath} (${descriptionsOut.length} bytes): ` +
    `64 talents (21/22/21), ${requests} tooltip request(s), ${emptyDescriptions} rank(s) without a description.`,
);
