// Generates the trainer's item database (src/data/items/db.json) from a local clone of
// github.com/wowsims/tbc-new (MIT licence). Run by hand when the source changes; the output is
// committed (the clone is not a dependency of the repo):
//
//   npm run db:build -- <path to the tbc-new clone>
//
// It only READS JSON files of the clone (assets/database/db.json, ui/specs/warlock/dps/gear_sets/
// *.gear.json) and its .git/HEAD for the commit id; it never runs code from the clone. It also
// writes tests/fixtures/wowsims-warlock-gear-sets.json (a copy of the warlock gear sets: the
// database must contain every item, gem and enchant they reference; Task 3 builds presets from it).
//
// Mapping (verified against proto/common.proto and by hand on Voidheart Crown 28963, Icon of the
// Silver Crescent 29370 and Band of the Eternal Sage 29305; see docs/data-sources.md, Part E):
// - stats: proto `Stat` index -> RawStats key (STAT_KEYS below); every other stat is not modelled
//   by the engine and dropped (stamina 2, healing 4, armor 31, spell penetration 15, ...).
// - sockets: `gemSockets` and gem `color` use proto `GemColor` (1 meta, 2 red, 3 blue, 4 yellow,
//   5 green, 6 orange, 7 purple, 8 prismatic).
// - slot: proto `ItemType` (+ `handType` / `weaponType` for weapons), see slotOf().
// - set: `setId` = slug of `setName` (e.g. 'malefic-raiment'), the stage 1 `SetBonusDef.setId`.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clone = process.argv[2];
if (!clone) {
  console.error('usage: npm run db:build -- <path to a wowsims/tbc-new clone>');
  process.exit(2);
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------------------------
// proto/common.proto enums used here.
const STAT_KEYS = {
  3: 'intellect', // StatIntellect
  16: 'spirit', // StatSpirit
  5: 'spellPower', // StatSpellDamage
  11: 'shadowPower', // StatShadowDamage
  7: 'firePower', // StatFireDamage
  12: 'hitRating', // StatSpellHitRating
  13: 'critRating', // StatSpellCritRating
  14: 'hasteRating', // StatSpellHasteRating
  35: 'mp5', // StatMP5
};
const STAT_ORDER = ['intellect', 'spirit', 'spellPower', 'shadowPower', 'firePower', 'hitRating', 'critRating', 'hasteRating', 'mp5'];
const STAT_LABEL = {
  intellect: 'Intellect',
  spirit: 'Spirit',
  spellPower: 'spell damage',
  shadowPower: 'shadow damage',
  firePower: 'fire damage',
  hitRating: 'hit rating',
  critRating: 'crit rating',
  hasteRating: 'haste rating',
  mp5: 'mana per 5 s',
};
const GEM_COLOR = { 1: 'meta', 2: 'red', 3: 'blue', 4: 'yellow', 5: 'green', 6: 'orange', 7: 'purple', 8: 'prismatic' };
// ItemType -> logical slot (armour, jewellery, ranged); weapons (13) are resolved in slotOf().
const TYPE_SLOT = {
  1: 'head', 2: 'neck', 3: 'shoulder', 4: 'back', 5: 'chest', 6: 'wrist', 7: 'hands', 8: 'waist',
  9: 'legs', 10: 'feet', 11: 'finger', 12: 'trinket', 13: 'mainHand', 14: 'ranged',
};
const CLASS_WARLOCK = 9; // Class.ClassWarlock
const ITEM_TYPE = { finger: 11, trinket: 12, weapon: 13, ranged: 14 };
const ARMOR_CLOTH = 1; // ArmorType.ArmorTypeCloth
const HAND = { mainHand: 1, oneHand: 2, offHand: 3, twoHand: 4 }; // HandType
const WEAPON = { dagger: 2, offHand: 5, shield: 7, staff: 8, sword: 9 }; // WeaponType
const RANGED_WAND = 5; // RangedWeaponType.RangedWeaponTypeWand
const ENCHANT_TYPE = { twoHand: 1, shield: 2, staff: 4, offHand: 5 }; // EnchantType
const FACTION_HORDE_ONLY = 2; // proto/ui.proto FactionRestriction.FACTION_RESTRICTION_HORDE_ONLY

// Warlock capabilities: tbc-new sim/core/character_constants.go (ClassArmorTypeCapabilities,
// ClassWeaponTypeCapabilities, ClassRangedWeaponTypeCapabilities) = ui/sim/player/classes/
// capabilities_auto_gen.ts: cloth; dagger, held-in-off-hand, staff (two-hand allowed), sword
// (one-hand only); wands. The Warlock spec cannot dual wield (SPEC_CAN_DUAL_WIELD).
const WARLOCK_WEAPONS = new Set([WEAPON.dagger, WEAPON.offHand, WEAPON.staff, WEAPON.sword]);
const WARLOCK_TWO_HAND = new Set([WEAPON.staff]);

// Meta gem activation: tbc-new sim/core/reforge_optimizer/meta_gem_constraints.go
// (tbcMetaGemConstraintsByID), copied by hand: the Go file is source code, not data.
const META_REQUIRES = {
  25899: { red: 2, yellow: 2, blue: 2 },
  34220: { blue: 2 },
  25890: { red: 2, yellow: 2, blue: 2 },
  35503: { red: 3 },
  35501: { yellow: 1, blue: 2 },
  32641: { yellow: 3 },
  25901: { red: 2, yellow: 2, blue: 2 },
  25896: { blue: 3 },
  32409: { red: 2, yellow: 2, blue: 2 },
  25894: { red: 1, yellow: 2 },
  28557: { red: 1, yellow: 2 },
  28556: { red: 1, yellow: 2 },
  25898: { blue: 5 },
  32410: { red: 2, yellow: 2, blue: 2 },
};
const META_COMPARE = {
  25897: { more: 'red', than: 'blue' },
  25895: { more: 'red', than: 'yellow' },
  25893: { more: 'blue', than: 'yellow' },
  32640: { more: 'blue', than: 'yellow' },
};

/** Effect-only items (no stat anywhere) are kept from this item level up (see Part E). */
const EFFECT_ONLY_MIN_ILVL = 90;
const MAX_PHASE = 5;

// ---------------------------------------------------------------------------------------------

const fail = (message) => {
  console.error(`build-item-db: ${message}`);
  process.exit(1);
};

/** RawStats from a proto stat array (gems, enchants, socket bonus) or a sparse {index: value} map. */
function statsOf(source) {
  const out = {};
  if (!source) return out;
  const entries = Array.isArray(source) ? source.map((v, i) => [i, v]) : Object.entries(source);
  for (const [index, value] of entries) {
    const key = STAT_KEYS[index];
    if (key && typeof value === 'number' && value > 0) out[key] = value;
  }
  return Object.fromEntries(STAT_ORDER.filter((k) => out[k] !== undefined).map((k) => [k, out[k]]));
}
const isEmpty = (stats) => Object.keys(stats).length === 0;

function slug(name) {
  return name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatMs(ms) {
  if (ms % 60000 === 0) return `${ms / 60000} min`;
  return `${ms / 1000} s`;
}

/** Short readable text of one wowsims item effect; structured fields only, no text parsing. */
function effectText(effect) {
  const raw = (effect.buffName ?? '').trim();
  const idMatch = raw.match(/\((\d+)\)$/);
  const name = raw.replace(/\s*\(\d+\)$/, '').trim() || (idMatch ? `spell ${idMatch[1]}` : 'unnamed effect');
  const stats = statsOf(effect.scalingOptions?.['0']?.stats);
  const parts = Object.entries(stats).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`);
  if (effect.maxCumulativeStacks) parts.push(`up to ${effect.maxCumulativeStacks} stacks`);
  if (effect.effectDurationMs > 0) parts.push(formatMs(effect.effectDurationMs));
  if (effect.onUse?.cooldownMs > 0) parts.push(`${formatMs(effect.onUse.cooldownMs)} cooldown`);
  const kind = effect.onUse ? 'On use' : effect.proc || effect.stackProc ? 'Proc' : 'Equip';
  return `${kind}: ${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/** Why a Warlock cannot equip the item (wowsims ui/sim/proto/items.ts canEquipItem), or null. */
function equipRejection(item) {
  if (item.classAllowlist?.length && !item.classAllowlist.includes(CLASS_WARLOCK)) return 'class allowlist excludes Warlock';
  const type = item.type ?? 0;
  if (!TYPE_SLOT[type]) return 'no item type';
  if (type === ITEM_TYPE.finger || type === ITEM_TYPE.trinket) return null;
  if (type === ITEM_TYPE.weapon) {
    const weaponType = item.weaponType ?? 0;
    const handType = item.handType ?? 0;
    if (!WARLOCK_WEAPONS.has(weaponType)) return 'weapon type (axe, fist, mace, polearm, shield, unknown)';
    if (handType === HAND.offHand && weaponType !== WEAPON.offHand && weaponType !== WEAPON.shield) {
      return 'off-hand-only weapon (Warlocks do not dual wield)';
    }
    if (handType === HAND.twoHand && !WARLOCK_TWO_HAND.has(weaponType)) return 'two-hand weapon other than a staff';
    return null;
  }
  if (type === ITEM_TYPE.ranged) return item.rangedWeaponType === RANGED_WAND ? null : 'ranged type other than wand';
  if ((item.armorType ?? 0) > ARMOR_CLOTH) return 'armour heavier than cloth';
  return null;
}

/** Logical slot of an equippable item; weapons: staff = two-hand main hand, frills = off hand. */
function slotOf(item) {
  if (item.type !== ITEM_TYPE.weapon) return { slot: TYPE_SLOT[item.type] };
  if (item.weaponType === WEAPON.offHand) return { slot: 'offHand' };
  if (item.handType === HAND.twoHand) return { slot: 'mainHand', twoHand: true };
  // Main-hand and one-hand daggers and swords: the main hand (no dual wield, so never the off hand).
  return { slot: 'mainHand' };
}

// ---------------------------------------------------------------------------------------------
// Sources.

const dbPath = join(clone, 'assets', 'database', 'db.json');
const setsDir = join(clone, 'ui', 'specs', 'warlock', 'dps', 'gear_sets');
if (!existsSync(dbPath) || !existsSync(setsDir)) fail(`not a tbc-new clone: ${clone}`);
const source = readJson(dbPath);

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
const commit = commitOf(clone);
const sourceText = `wowsims/tbc-new @ ${commit} assets/database/db.json (MIT licence)`;

// Gear sets of the wowsims Warlock UI and the author's export: everything they reference is kept.
const gearSets = {};
for (const file of readdirSync(setsDir).filter((f) => f.endsWith('.gear.json')).sort()) {
  gearSets[basename(file, '.gear.json')] = readJson(join(setsDir, file));
}
const authorExport = readJson(join(root, 'docs', 'samples', 'wowsimsexporter-destruction-warlock.json'));
const referencedEntries = [...Object.values(gearSets).flatMap((s) => s.items ?? []), ...authorExport.gear.items];
const refItems = new Set(referencedEntries.map((e) => e.id).filter((id) => id));
const refGems = new Set(referencedEntries.flatMap((e) => e.gems ?? []).filter((id) => id));
const refEnchants = new Set(referencedEntries.map((e) => e.enchant).filter((id) => id));

// ---------------------------------------------------------------------------------------------
// Items.

const counts = { sourceItems: source.items.length, dropped: {}, keptByReference: [] };
const drop = (reason) => {
  counts.dropped[reason] = (counts.dropped[reason] ?? 0) + 1;
};
const items = {};
const setSlugs = new Map();

for (const item of source.items) {
  const forced = refItems.has(item.id);
  const rejection = equipRejection(item);
  if (rejection) {
    if (forced) fail(`referenced item ${item.id} ${item.name} is not equippable: ${rejection}`);
    drop(rejection);
    continue;
  }
  const scaling = item.scalingOptions?.['0'] ?? {};
  const stats = statsOf(scaling.stats);
  const socketBonus = statsOf(item.socketBonus);
  const effects = (item.itemEffects ?? []).map(effectText);
  const effectStats = (item.itemEffects ?? []).map((e) => statsOf(e.scalingOptions?.['0']?.stats));
  const hasAnyStat = Object.keys(scaling.stats ?? {}).length > 0 || (item.itemEffects ?? []).some((e) => e.scalingOptions?.['0']?.stats);
  const relevant =
    !isEmpty(stats) ||
    effectStats.some((s) => !isEmpty(s)) ||
    (!hasAnyStat && effects.length > 0 && (scaling.ilvl ?? 0) >= EFFECT_ONLY_MIN_ILVL);

  let reason = null;
  if (item.factionRestriction === FACTION_HORDE_ONLY) reason = 'Horde only (the trainer models a Gnome)';
  else if (item.randomSuffixOptions) reason = 'random suffix item';
  else if (item.phase > MAX_PHASE) reason = 'phase above 5';
  else if (!relevant) reason = 'no modelled stat';
  if (reason) {
    if (!forced) {
      drop(reason);
      continue;
    }
    counts.keptByReference.push(`${item.id} ${item.name} (${reason})`);
  }

  const record = { id: item.id, name: item.name, ...slotOf(item), icon: item.icon.toLowerCase(), phase: item.phase, stats };
  if (item.gemSockets?.length) {
    record.sockets = item.gemSockets.map((c) => GEM_COLOR[c] ?? fail(`item ${item.id}: socket colour ${c}`));
    if (!isEmpty(socketBonus)) record.socketBonus = socketBonus;
  }
  if (item.setName) {
    const id = slug(item.setName);
    const known = setSlugs.get(id);
    if (known !== undefined && known !== item.setId) fail(`set slug ${id} used by wowsims sets ${known} and ${item.setId}`);
    setSlugs.set(id, item.setId);
    record.setId = id;
    record.setName = item.setName;
  }
  if (item.unique) record.unique = true;
  // Order the keys like the test fixtures: slot info, then optional fields.
  const { twoHand, ...rest } = record;
  const ordered = { ...rest, ...(twoHand ? { twoHand } : {}) };
  if (effects.length) ordered.effects = effects;
  if (isEmpty(stats) && !effects.length) fail(`item ${item.id} ${item.name}: no modelled stat and no effect`);
  items[item.id] = ordered;
}
for (const id of refItems) if (!items[id]) fail(`referenced item ${id} missing from the source database`);

// ---------------------------------------------------------------------------------------------
// Gems: all of them (214, small); stats beyond the modelled ones dropped.

const gems = {};
for (const gem of source.gems) {
  if (gem.phase > MAX_PHASE) continue;
  const color = GEM_COLOR[gem.color] ?? fail(`gem ${gem.id}: colour ${gem.color}`);
  const record = { id: gem.id, name: gem.name, icon: gem.icon.toLowerCase(), phase: gem.phase, color, stats: statsOf(gem.stats) };
  if (color === 'meta') {
    if (META_REQUIRES[gem.id]) record.metaRequires = META_REQUIRES[gem.id];
    else if (META_COMPARE[gem.id]) record.metaCompare = META_COMPARE[gem.id];
    else fail(`meta gem ${gem.id} ${gem.name}: no requirement in META_REQUIRES / META_COMPARE`);
  }
  if (gem.unique) record.unique = true;
  gems[gem.id] = record;
}
for (const id of refGems) if (!gems[id]) fail(`referenced gem ${id} missing from the source database`);

// ---------------------------------------------------------------------------------------------
// Enchants: every enchant a Warlock slot can take, keyed by effect id. Dropped: scopes (ranged:
// wands take no enchant), shield enchants. Effect ids listed twice in db.json are merged.

const enchants = {};
const enchantDropped = {};
for (const enchant of source.enchants) {
  let reason = null;
  if (enchant.type === ITEM_TYPE.ranged) reason = 'scope (wands take no enchant)';
  else if (enchant.enchantType === ENCHANT_TYPE.shield) reason = 'shield enchant';
  else if (enchant.enchantType === ENCHANT_TYPE.offHand) reason = 'off-hand (shield/frill) enchant';
  else if (!TYPE_SLOT[enchant.type] || enchant.type === ITEM_TYPE.trinket) reason = 'slot';
  if (reason) {
    if (refEnchants.has(enchant.effectId)) fail(`referenced enchant ${enchant.effectId} dropped: ${reason}`);
    enchantDropped[reason] = (enchantDropped[reason] ?? 0) + 1;
    continue;
  }
  const slots = [enchant.type, ...(enchant.extraTypes ?? [])].map((t) => TYPE_SLOT[t] ?? fail(`enchant ${enchant.effectId}: type ${t}`));
  const stats = statsOf(enchant.stats);
  const twoHandOnly = enchant.enchantType === ENCHANT_TYPE.twoHand || enchant.enchantType === ENCHANT_TYPE.staff;
  const known = enchants[enchant.effectId];
  if (known) {
    if (JSON.stringify(known.stats) !== JSON.stringify(stats)) fail(`enchant ${enchant.effectId}: duplicates with different stats`);
    if (known.name !== enchant.name) known.name = `${known.name} / ${enchant.name}`;
    const extra = slots.filter((s) => s !== known.slot && !(known.extraSlots ?? []).includes(s));
    if (extra.length) known.extraSlots = [...(known.extraSlots ?? []), ...extra];
    if (!twoHandOnly) delete known.twoHandOnly;
    continue;
  }
  const record = { id: enchant.effectId, name: enchant.name, icon: enchant.icon.toLowerCase(), slot: slots[0], stats };
  const extraSlots = [...new Set(slots.slice(1))].filter((s) => s !== slots[0]);
  if (extraSlots.length) record.extraSlots = extraSlots;
  if (twoHandOnly) record.twoHandOnly = true;
  enchants[enchant.effectId] = record;
}
for (const id of refEnchants) if (!enchants[id]) fail(`referenced enchant ${id} missing from the source database`);

// ---------------------------------------------------------------------------------------------
// Output: one record per line (readable diffs, compact).

function table(records) {
  const lines = Object.values(records)
    .sort((a, b) => a.id - b.id)
    .map((r) => `${JSON.stringify(String(r.id))}:${JSON.stringify(r)}`);
  return `{\n${lines.join(',\n')}\n}`;
}
const out = `{"source":${JSON.stringify(sourceText)},\n"items":${table(items)},\n"gems":${table(gems)},\n"enchants":${table(enchants)}}\n`;
const outPath = join(root, 'src', 'data', 'items', 'db.json');
writeFileSync(outPath, out);

const fixture = {
  source: `wowsims/tbc-new @ ${commit} ui/specs/warlock/dps/gear_sets/*.gear.json (MIT licence), copied by scripts/build-item-db.mjs`,
  sets: gearSets,
};
writeFileSync(join(root, 'tests', 'fixtures', 'wowsims-warlock-gear-sets.json'), `${JSON.stringify(fixture, null, 2)}\n`);

const icons = new Set([...Object.values(items), ...Object.values(gems), ...Object.values(enchants)].map((r) => r.icon));
console.log(`source: ${sourceText}`);
console.log(`items: ${Object.keys(items).length} kept of ${counts.sourceItems} (${counts.keptByReference.length} kept only because a gear set or the author's export references them)`);
for (const line of counts.keptByReference) console.log(`  kept by reference: ${line}`);
for (const [reason, n] of Object.entries(counts.dropped).sort((a, b) => b[1] - a[1])) console.log(`  dropped ${n}: ${reason}`);
console.log(`gems: ${Object.keys(gems).length} of ${source.gems.length}`);
console.log(`enchants: ${Object.keys(enchants).length} records from ${source.enchants.length} entries`);
for (const [reason, n] of Object.entries(enchantDropped)) console.log(`  dropped ${n}: ${reason}`);
console.log(`distinct icons: ${icons.size}`);
console.log(`wrote ${outPath} (${Buffer.byteLength(out)} bytes)`);
