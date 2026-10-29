// Fetches the spell/aura icons used by the UI into public/icons/spells/ (committed to the repo).
//
// Usage: npm run icons            (downloads missing icons, verifies every icon name)
//        npm run icons -- --force (re-downloads all)
//
// For every spell and aura with a `wowheadId` it asks Wowhead's tooltip API for the real icon
// name, compares it with the `icon` in the data (a mismatch is reported and exits 1: fix the
// data, the script never edits source files) and downloads the JPG from Wowhead's CDN.
// Icons are Blizzard artwork served by Wowhead: this is for the author's personal use.
// Run it with tsx (it imports the TypeScript data directly).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destructionWarlock } from '../src/data/classes/warlock/destruction.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons', 'spells');
const force = process.argv.includes('--force');
const TOOLTIP = (id) => `https://nether.wowhead.com/tbc/tooltip/spell/${id}?dataEnv=5&locale=0`;
const CDN = (icon) => `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One entry per distinct wowheadId; remember every def that claims it.
const byId = new Map();
for (const [kind, defs] of [['spell', destructionWarlock.spells], ['aura', destructionWarlock.auras]]) {
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
  try {
    const res = await fetch(TOOLTIP(wowheadId), { headers: { 'user-agent': 'rotation-trainer personal icon fetch' } });
    if (!res.ok) throw new Error(`tooltip API HTTP ${res.status}`);
    const real = (await res.json()).icon;
    if (typeof real !== 'string' || !/^[a-z0-9_]+$/.test(real)) throw new Error(`unexpected icon name ${JSON.stringify(real)}`);

    for (const claim of claims) {
      if (claim.icon !== real) {
        console.error(`MISMATCH ${claim.kind} ${claim.id} (spell ${wowheadId}): data says "${claim.icon}", Wowhead says "${real}"`);
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
    console.error(`FAIL  ${label} (spell ${wowheadId}): ${error.message}`);
    problems++;
  }
  await sleep(200); // be polite to the CDN
}

if (problems > 0) {
  console.error(`\n${problems} problem(s). Fix the data (icon / wowheadId) and run again.`);
  process.exit(1);
}
console.log(`\nAll ${byId.size} icons verified and present in public/icons/spells/.`);
