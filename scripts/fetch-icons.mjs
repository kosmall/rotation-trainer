// Fetches the icons used by the UI (committed to the repo):
// - spell/aura icons into public/icons/spells/ (verified against Wowhead's tooltip API, below);
// - item, gem and enchant icons into public/icons/items/: every distinct `icon` of the item
//   database (src/data/items/db.json, `npm run db:build`). The database already holds the icon
//   names (wowsims db.json), so no tooltip call is made for them.
//
// Usage: npm run icons            (downloads missing icons, verifies every icon name)
//        npm run icons -- --force (re-downloads all)
//
// Idempotent: present files are kept. Exits 0 only when every expected icon is present (and the
// item icons stay within ITEM_ICON_BUDGET_BYTES).
// For every spell and aura of the spec, the self auras of the set bonus procs (`warlockSetAuras`:
// a gear wearing those sets adds them to the spec), every buff of the setup catalog (the buff, the
// auras it applies, its item action) and the warlock options, each with a `wowheadId`, it asks Wowhead's
// tooltip API for the real icon name, compares it with the `icon` in the data (a mismatch is reported and exits 1: fix the
// data, the script never edits source files) and downloads the JPG from Wowhead's CDN.
// Icons are Blizzard artwork served by Wowhead: this is for the author's personal use.
// Run it with tsx (it imports the TypeScript data directly).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destructionWarlock } from '../src/data/classes/warlock/destruction.ts';
import { SACRIFICE_SUCCUBUS_OPTION, WARLOCK_ARMOR_OPTIONS } from '../src/data/classes/warlock/buffs.ts';
import { warlockSetAuras } from '../src/data/classes/warlock/sets.ts';
import { SETUP_CATALOG as FULL_SETUP_CATALOG } from '../src/setup/defaults.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons', 'spells');
const force = process.argv.includes('--force');
const TOOLTIP = (kind, id) => `https://nether.wowhead.com/tbc/tooltip/${kind}/${id}?dataEnv=5&locale=0`;
const CDN = (icon) => `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Wowhead's "no icon" placeholder: never a real icon, never saved. */
const PLACEHOLDER_ICON = 'classic_temp';
/**
 * Use spells whose Wowhead spell tooltip has only the placeholder icon: the icon comes from the
 * item's tooltip instead (spell id -> item id). Super Mana Potion: spell 28499 "Restore Mana" ->
 * item 22832 (inv_potion_137).
 */
const ICON_FROM_ITEM = new Map([[28499, 22832]]);

// The setup catalog's buffs with spell icons: the gear's item effects (`iconKind: 'item'`, derived
// from the worn gear) carry the item's icon, which the item half below fetches from the database.
const SETUP_CATALOG = FULL_SETUP_CATALOG.filter((b) => b.iconKind !== 'item');
// The setup catalog's buffs and the auras they apply (debuffs, timed buffs).
const buffAuras = SETUP_CATALOG.flatMap((b) =>
  [b.effect.targetAura, b.effect.selfAura, ...(b.effect.auras ?? [])].filter((a) => a !== undefined),
);
// The item actions of the catalog (item bar); usually the same wowheadId as their buff.
const itemActions = SETUP_CATALOG.flatMap((b) => (b.effect.action ? [b.effect.action] : []));
// Warlock options with an icon ('No armor' has none).
const warlockOptions = [
  ...Object.entries(WARLOCK_ARMOR_OPTIONS).map(([id, o]) => ({ ...o, id: `armor-${id}` })),
  { ...SACRIFICE_SUCCUBUS_OPTION, id: 'sacrifice-succubus' },
].filter((o) => o.icon !== '');

// One entry per distinct wowheadId; remember every def that claims it.
const byId = new Map();
for (const [kind, defs] of [
  ['spell', destructionWarlock.spells],
  ['aura', destructionWarlock.auras],
  ['set aura', warlockSetAuras],
  ['buff', SETUP_CATALOG],
  ['buff aura', buffAuras],
  ['item action', itemActions],
  ['warlock option', warlockOptions],
]) {
  for (const def of defs) {
    if (!def.wowheadId) {
      console.error(`FAIL ${kind} ${def.id}: no wowheadId`);
      process.exitCode = 1;
      continue;
    }
    const entry = byId.get(def.wowheadId) ?? { wowheadId: def.wowheadId, claims: [] };
    entry.claims.push({ kind, id: def.id, icon: def.icon });
    byId.set(def.wowheadId, entry);
  }
}

mkdirSync(outDir, { recursive: true });
let problems = process.exitCode === 1 ? 1 : 0;

for (const { wowheadId, claims } of byId.values()) {
  const label = claims.map((c) => `${c.kind} ${c.id}`).join(', ');
  const itemId = ICON_FROM_ITEM.get(wowheadId);
  const source = itemId === undefined ? `spell ${wowheadId}` : `spell ${wowheadId} via item ${itemId}`;
  try {
    const url = itemId === undefined ? TOOLTIP('spell', wowheadId) : TOOLTIP('item', itemId);
    const res = await fetch(url, { headers: { 'user-agent': 'rotation-trainer personal icon fetch' } });
    if (!res.ok) throw new Error(`tooltip API HTTP ${res.status}`);
    const real = (await res.json()).icon;
    if (typeof real !== 'string' || !/^[a-z0-9_]+$/.test(real)) throw new Error(`unexpected icon name ${JSON.stringify(real)}`);
    if (real === PLACEHOLDER_ICON) {
      throw new Error(`Wowhead has only the placeholder icon "${PLACEHOLDER_ICON}": add the item id to ICON_FROM_ITEM`);
    }

    for (const claim of claims) {
      if (claim.icon !== real) {
        console.error(`MISMATCH ${claim.kind} ${claim.id} (${source}): data says "${claim.icon}", Wowhead says "${real}"`);
        problems++;
      }
    }

    const file = join(outDir, `${real}.jpg`);
    if (!force && existsSync(file)) {
      console.log(`ok    ${real}.jpg (${label}; ${source}) already present`);
    } else {
      const img = await fetch(CDN(real));
      const type = img.headers.get('content-type') ?? '';
      if (!img.ok || !type.startsWith('image/')) throw new Error(`CDN HTTP ${img.status} ${type}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      if (bytes.length < 200) throw new Error(`suspiciously small image (${bytes.length} bytes)`);
      writeFileSync(file, bytes);
      console.log(`saved ${real}.jpg (${label}; ${source}) ${bytes.length} bytes`);
    }
  } catch (error) {
    console.error(`FAIL  ${label} (${source}): ${error.message}`);
    problems++;
  }
  await sleep(200); // be polite to the CDN
}

if (problems > 0) {
  console.error(`\n${problems} problem(s). Fix the data (icon / wowheadId) and run again.`);
  process.exit(1);
}
console.log(`\nAll ${byId.size} icons verified and present in public/icons/spells/.`);

// ---------------------------------------------------------------------------------------------
// Item, gem and enchant icons (public/icons/items/). Small concurrency, a pause between requests
// and retries with backoff: be gentle with the CDN.

/** Budget for public/icons/items/ (the UI shows an initials tile for a missing icon). */
const ITEM_ICON_BUDGET_BYTES = 6_000_000;
const ITEM_ICON_CONCURRENCY = 3;
const ITEM_ICON_ATTEMPTS = 3;
const itemOutDir = join(root, 'public', 'icons', 'items');
const itemDb = JSON.parse(readFileSync(join(root, 'src', 'data', 'items', 'db.json'), 'utf8'));
const itemIcons = [
  ...new Set(
    [itemDb.items, itemDb.gems, itemDb.enchants].flatMap((records) => Object.values(records).map((r) => r.icon)),
  ),
].sort();
mkdirSync(itemOutDir, { recursive: true });

async function downloadIcon(icon) {
  let lastError;
  for (let attempt = 1; attempt <= ITEM_ICON_ATTEMPTS; attempt++) {
    try {
      const img = await fetch(CDN(icon));
      const type = img.headers.get('content-type') ?? '';
      if (img.status === 404) throw Object.assign(new Error('CDN HTTP 404'), { permanent: true });
      if (!img.ok || !type.startsWith('image/')) throw new Error(`CDN HTTP ${img.status} ${type}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      if (bytes.length < 200) throw new Error(`suspiciously small image (${bytes.length} bytes)`);
      return bytes;
    } catch (error) {
      lastError = error;
      if (error.permanent) break;
      await sleep(1000 * 3 ** (attempt - 1));
    }
  }
  throw lastError;
}

let itemProblems = 0;
let saved = 0;
const queue = [...itemIcons];
async function worker() {
  for (let icon = queue.shift(); icon !== undefined; icon = queue.shift()) {
    if (!/^[a-z0-9_-]+$/.test(icon)) {
      console.error(`FAIL  item icon ${JSON.stringify(icon)}: unexpected icon name`);
      itemProblems++;
      continue;
    }
    const file = join(itemOutDir, `${icon}.jpg`);
    if (!force && existsSync(file)) continue;
    try {
      const bytes = await downloadIcon(icon);
      writeFileSync(file, bytes);
      saved++;
      console.log(`saved items/${icon}.jpg ${bytes.length} bytes`);
    } catch (error) {
      console.error(`FAIL  items/${icon}.jpg: ${error.message}`);
      itemProblems++;
    }
    await sleep(150);
  }
}
await Promise.all(Array.from({ length: ITEM_ICON_CONCURRENCY }, worker));

const missing = itemIcons.filter((icon) => !existsSync(join(itemOutDir, `${icon}.jpg`)));
const itemBytes = itemIcons
  .filter((icon) => !missing.includes(icon))
  .reduce((sum, icon) => sum + statSync(join(itemOutDir, `${icon}.jpg`)).size, 0);
console.log(
  `\nItem icons: ${itemIcons.length - missing.length}/${itemIcons.length} present in public/icons/items/ ` +
    `(${saved} downloaded now), ${itemBytes} bytes of ${ITEM_ICON_BUDGET_BYTES} budget.`,
);
if (missing.length > 0) console.error(`Missing: ${missing.join(', ')}`);
if (itemBytes > ITEM_ICON_BUDGET_BYTES) {
  console.error('Over the item icon budget: restrict the icon list (presets and top items per slot).');
  itemProblems++;
}
if (itemProblems > 0 || missing.length > 0) process.exit(1);
