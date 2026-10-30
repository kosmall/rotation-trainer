// Fetches the spell/aura icons used by the UI into public/icons/spells/ (committed to the repo).
//
// Usage: npm run icons            (downloads missing icons, verifies every icon name)
//        npm run icons -- --force (re-downloads all)
//
// For every spell and aura of the spec, every buff of the setup catalog (the buff, the auras it
// applies, its item action) and the warlock options, each with a `wowheadId`, it asks Wowhead's
// tooltip API for the real icon name, compares it with the `icon` in the data (a mismatch is reported and exits 1: fix the
// data, the script never edits source files) and downloads the JPG from Wowhead's CDN.
// Icons are Blizzard artwork served by Wowhead: this is for the author's personal use.
// Run it with tsx (it imports the TypeScript data directly).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destructionWarlock } from '../src/data/classes/warlock/destruction.ts';
import { SACRIFICE_SUCCUBUS_OPTION, WARLOCK_ARMOR_OPTIONS } from '../src/data/classes/warlock/buffs.ts';
import { SETUP_CATALOG } from '../src/setup/defaults.ts';

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

// The setup catalog's buffs and the auras they apply (debuffs, timed buffs, item procs).
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
      console.log(`ok    ${real}.jpg (${label}) already present`);
    } else {
      const img = await fetch(CDN(real));
      const type = img.headers.get('content-type') ?? '';
      if (!img.ok || !type.startsWith('image/')) throw new Error(`CDN HTTP ${img.status} ${type}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      if (bytes.length < 200) throw new Error(`suspiciously small image (${bytes.length} bytes)`);
      writeFileSync(file, bytes);
      console.log(`saved ${real}.jpg (${label}) ${bytes.length} bytes`);
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
