import { describe, expect, it } from 'vitest';
import {
  TALENT_TREE,
  TALENT_POINTS_MAX,
  TALENT_STRING_MAX_LENGTH,
  canAddPoint,
  canRemovePoint,
  decodeTalents,
  encodeTalents,
  talentById,
  talentIconPath,
  validateTalents,
} from '../../src/data/classes/warlock/talentTree';
import {
  TALENT_ORDER,
  destructionTalentString,
  parseTalentString,
} from '../../src/data/classes/warlock/talents';

const all = TALENT_TREE.trees.flatMap((t) => t.talents);
const ids = all.map((t) => t.id);
const author = destructionTalentString;

/** The author's build with `changes` applied (ranks by id). */
function authorWith(changes: Record<string, number>): Record<string, number> {
  return { ...decodeTalents(author).ranks, ...changes };
}

// wowsims tbc-new ui/specs/warlock/dps/presets.ts `talentsString` of every talent preset.
const WOWSIMS_PRESETS: Record<string, string> = {
  Affliction: '05022221112351055003--50500051220001',
  'Demo/Ruin': '01-205003213305010150134-50500251020001',
  'Demonology Felguard': '01-2050030133250101501351-5050005112',
  'Destro/Nightfall': '150222201023--505020510200510531051',
  Destruction: '-20500301332101-50500051220051053105',
};

describe('talent tree data (generated from wowsims tbc-new)', () => {
  it('64 talents, 21/22/21 per tree, order equal to TALENT_ORDER', () => {
    expect(TALENT_TREE.trees.map((t) => t.name)).toEqual(['Affliction', 'Demonology', 'Destruction']);
    expect(TALENT_TREE.trees.map((t) => t.talents.length)).toEqual([21, 22, 21]);
    expect(all).toHaveLength(64);
    expect(TALENT_TREE.trees.map((t) => t.talents.map((d) => d.id))).toEqual(TALENT_ORDER.map((t) => [...t]));
    expect(new Set(ids).size).toBe(64);
  });

  it('every talent is well formed: tree index, rows 0-8, columns 0-3, ranks, ids, prerequisites', () => {
    TALENT_TREE.trees.forEach((tree, t) => {
      const seen = new Set<string>();
      for (const d of tree.talents) {
        expect(d.tree, d.id).toBe(t);
        expect(d.row).toBeGreaterThanOrEqual(0);
        expect(d.row).toBeLessThanOrEqual(8);
        expect(d.col).toBeGreaterThanOrEqual(0);
        expect(d.col).toBeLessThanOrEqual(3);
        expect(d.maxRank).toBeGreaterThanOrEqual(1);
        expect(d.maxRank).toBeLessThanOrEqual(5);
        expect(d.wowheadIds, d.id).toHaveLength(d.maxRank);
        expect(d.descriptions, d.id).toHaveLength(d.maxRank);
        for (const id of d.wowheadIds) expect(Number.isInteger(id) && id > 0, `${d.id} ${id}`).toBe(true);
        expect(d.name).not.toBe('');
        expect(d.icon, d.id).toMatch(/^[a-z0-9_]+$/);
        // A prerequisite is an earlier talent of the same tree, in a higher row.
        if (d.prereq !== undefined) {
          const p = talentById(d.prereq);
          expect(p?.tree, d.id).toBe(t);
          expect(p!.row).toBeLessThan(d.row);
          expect(seen.has(d.prereq)).toBe(true);
        }
        seen.add(d.id);
      }
      // No two talents share a cell; talents are ordered by row, then column.
      const cells = tree.talents.map((d) => d.row * 4 + d.col);
      expect([...cells].sort((a, b) => a - b)).toEqual(cells);
      expect(new Set(cells).size).toBe(cells.length);
    });
  });

  it('prerequisites match the wowsims prereqLocation entries', () => {
    const prereqs = Object.fromEntries(all.filter((d) => d.prereq).map((d) => [d.id, d.prereq]));
    expect(prereqs).toEqual({
      curseOfExhaustion: 'amplifyCurse',
      shadowMastery: 'siphonLife',
      unstableAffliction: 'contagion',
      masterSummoner: 'felDomination',
      masterDemonologist: 'unholyPower',
      soulLink: 'demonicSacrifice',
      pyroclasm: 'intensity',
      ruin: 'devastation',
      conflagrate: 'improvedImmolate',
      shadowfury: 'shadowAndFlame',
    });
  });

  it('spot checks against wowsims and Wowhead: Suppression, Ruin, Emberstorm, Shadowfury', () => {
    const s = talentById('suppression')!;
    expect([s.name, s.row, s.col, s.maxRank, s.wowheadIds]).toEqual([
      'Suppression', 0, 1, 5, [18174, 18175, 18176, 18177, 18178],
    ]);
    expect(s.icon).toBe('spell_shadow_unsummonbuilding');
    expect(s.descriptions[0]).toBe('Reduces the chance for enemies to resist your Affliction spells by 2%.');
    expect(talentById('ruin')).toMatchObject({ name: 'Ruin', tree: 2, row: 4, col: 2, maxRank: 1 });
    // Emberstorm rank 3 = 17956 (talents.ts, Task 12a).
    expect(talentById('emberstorm')?.wowheadIds[2]).toBe(17956);
    expect(talentById('shadowfury')).toMatchObject({ row: 8, col: 1, maxRank: 1, prereq: 'shadowAndFlame' });
  });

  it('descriptions are plain text; unavailable tooltips are counted (empty strings)', () => {
    const descriptions = all.flatMap((d) => d.descriptions);
    expect(descriptions).toHaveLength(all.reduce((n, d) => n + d.maxRank, 0));
    for (const text of descriptions) {
      expect(text).not.toMatch(/[<>]|&[a-z]+;|&#\d+;|<!--/);
      expect(text).toBe(text.trim());
    }
    const empty = descriptions.filter((text) => text === '').length;
    // Pinned count of ranks whose Wowhead tooltip was unavailable when the generator ran.
    expect(empty).toBe(0);
  });

  it('records its source (wowsims commit and Wowhead)', () => {
    expect(TALENT_TREE.source).toMatch(/^wowsims\/tbc-new @ [0-9a-f]{7} ui\/sim\/talents\/trees\/warlock\.json/);
  });
});

describe('talent string codec', () => {
  it("the author's build string decodes to 0/21/40 and re-encodes identically", () => {
    const d = decodeTalents(author);
    expect(d.errors).toEqual([]);
    expect(d.points).toEqual([0, 21, 40]);
    expect(Object.keys(d.ranks)).toEqual(ids);
    expect(d.ranks.ruin).toBe(1);
    expect(d.ranks.emberstorm).toBe(3);
    expect(d.ranks.demonicSacrifice).toBe(1);
    expect(d.ranks.conflagrate).toBe(0);
    expect(encodeTalents(d.ranks)).toBe(author);
  });

  it('decoding agrees with parseTalentString (its behaviour is unchanged) for valid strings', () => {
    for (const s of [author, ...Object.values(WOWSIMS_PRESETS)]) {
      const old = parseTalentString(s);
      const d = decodeTalents(s);
      expect(d.points).toEqual(old.points);
      TALENT_ORDER.forEach((names, t) =>
        names.forEach((name, i) => expect(d.ranks[name], `${s} ${name}`).toBe(old.trees[t]?.[i] ?? 0)),
      );
    }
    // parseTalentString still throws on the inputs it threw on before.
    expect(() => parseTalentString('abc')).toThrow('talent string needs 3 trees');
    expect(() => parseTalentString('1-x-')).toThrow("bad talent rank 'x'");
    expect(parseTalentString('--').points).toEqual([0, 0, 0]);
  });

  it('encodes every tree at full width: trailing zeros are kept, missing trailing digits decode as 0', () => {
    expect(encodeTalents({})).toBe(`${'0'.repeat(21)}-${'0'.repeat(22)}-${'0'.repeat(21)}`);
    const short = decodeTalents('-20500301332101-50500051220051053105');
    expect(short.errors).toEqual([]);
    expect(encodeTalents(short.ranks)).toBe(`${'0'.repeat(21)}-2050030133210100000000-505000512200510531050`);
    expect(decodeTalents(encodeTalents(short.ranks)).ranks).toEqual(short.ranks);
  });

  it.each(Object.entries(WOWSIMS_PRESETS))('wowsims preset %s validates with 0 errors and at most 61 points', (_, s) => {
    const d = decodeTalents(s);
    expect(d.errors).toEqual([]);
    expect(validateTalents(d.ranks)).toEqual([]);
    expect(validateTalents(s)).toEqual([]);
    expect(d.points[0] + d.points[1] + d.points[2]).toBeLessThanOrEqual(TALENT_POINTS_MAX);
    expect(TALENT_POINTS_MAX).toBe(61);
  });

  it('accepts surrounding whitespace (a pasted string) but nothing else around the digits', () => {
    expect(decodeTalents(`  ${author}\n`).errors).toEqual([]);
    expect(decodeTalents(`${author}x`).errors).not.toEqual([]);
  });
});

describe('validation: each rule on its own', () => {
  it('a row needs 5 points per row in its tree above it (6 points in row 2 without 5 in rows 0-1)', () => {
    // Improved Curse of Agony (row 2) 2 + Fel Concentration (row 2) 4: 6 points, none above.
    const errors = validateTalents({ improvedCurseOfAgony: 2, felConcentration: 4 });
    expect(errors).toEqual([
      'Improved Curse of Agony needs 10 points in Affliction rows above it (has 0).',
      'Fel Concentration needs 10 points in Affliction rows above it (has 0).',
    ]);
    // With 4 above, still short; with 10 above, fine.
    expect(validateTalents({ suppression: 4, felConcentration: 1 })).toEqual([
      'Fel Concentration needs 10 points in Affliction rows above it (has 4).',
    ]);
    expect(validateTalents({ suppression: 5, improvedCorruption: 5, felConcentration: 1 })).toEqual([]);
  });

  it('points in the same or lower rows do not count toward a row requirement', () => {
    // Row 1 talent with only row-1 and row-2 points: Improved Life Tap needs 5 above it.
    expect(validateTalents({ improvedLifeTap: 2, soulSiphon: 2, improvedDrainSoul: 2 })).toEqual([
      'Improved Drain Soul needs 5 points in Affliction rows above it (has 0).',
      'Improved Life Tap needs 5 points in Affliction rows above it (has 0).',
      'Soul Siphon needs 5 points in Affliction rows above it (has 0).',
    ]);
  });

  it('a talent with a prerequisite needs it at full rank (Conflagrate without Improved Immolate 5/5)', () => {
    const ranks = authorWith({ conflagrate: 1, improvedImmolate: 4, shadowAndFlame: 0 });
    expect(validateTalents(ranks)).toEqual(['Conflagrate needs Improved Immolate at full rank (4/5).']);
    expect(validateTalents(authorWith({ conflagrate: 1, improvedImmolate: 5, shadowAndFlame: 0 }))).toEqual([
      'Too many points: 62 spent, at most 61.',
    ]);
    expect(validateTalents(authorWith({ conflagrate: 1, improvedImmolate: 5, shadowAndFlame: 0, intensity: 0 }))).toEqual([]);
  });

  it('a rank above the maximum (maxRank + 1) is an error', () => {
    expect(validateTalents(authorWith({ ruin: 2, shadowAndFlame: 4 }))).toEqual(['Ruin: rank 2 is above the maximum 1.']);
    expect(validateTalents(authorWith({ bane: 6, shadowAndFlame: 4 }))).toEqual(['Bane: rank 6 is above the maximum 5.']);
  });

  it('more than 61 points is an error (62 points)', () => {
    // The author's 61 points (0/21/40) + Suppression 1 = 62.
    expect(validateTalents(authorWith({ suppression: 1 }))).toEqual(['Too many points: 62 spent, at most 61.']);
    const d = decodeTalents('100000000000000000000-2050130133200100000000-555000512200013330050');
    expect(d.points).toEqual([1, 21, 40]);
    expect(d.errors).toEqual(['Too many points: 62 spent, at most 61.']);
  });

  it('unknown talents and malformed ranks are errors; prototype keys are never trusted', () => {
    expect(validateTalents({ notATalent: 1 })).toEqual(["Unknown talent 'notATalent'."]);
    expect(validateTalents({ suppression: 1.5 })).toEqual(['Suppression: rank must be a whole number from 0 to 5.']);
    expect(validateTalents({ suppression: -1 })).toEqual(['Suppression: rank must be a whole number from 0 to 5.']);
    expect(validateTalents({ suppression: Number.NaN })).toEqual(['Suppression: rank must be a whole number from 0 to 5.']);
    expect(validateTalents({ suppression: '1' as unknown as number })).toEqual([
      'Suppression: rank must be a whole number from 0 to 5.',
    ]);
    const proto = JSON.parse('{"__proto__": {"ruin": 1}, "constructor": 1}') as Record<string, number>;
    expect(validateTalents(proto)).toEqual(["Unknown talent '__proto__'.", "Unknown talent 'constructor'."]);
    // An inherited rank is not a rank.
    const inherited = Object.create({ suppression: 5 }) as Record<string, number>;
    expect(validateTalents(inherited)).toEqual([]);
    expect(encodeTalents(inherited)).toBe(encodeTalents({}));
    expect(validateTalents(null as unknown as Record<string, number>)).toEqual(['Talent ranks must be an object.']);
    expect(validateTalents([] as unknown as Record<string, number>)).toEqual(['Talent ranks must be an object.']);
  });

  it('the error list is capped', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) many[`x${i}`] = 1;
    const errors = validateTalents(many);
    expect(errors.length).toBeLessThanOrEqual(21);
    expect(errors[errors.length - 1]).toBe('... and 980 more problems.');
  });
});

describe('canAddPoint / canRemovePoint', () => {
  it('adding: row requirement, prerequisite, max rank, 61 points, unknown talent', () => {
    expect(canAddPoint({}, 'suppression')).toEqual({ ok: true });
    expect(canAddPoint({}, 'felConcentration')).toEqual({
      ok: false,
      reason: 'Fel Concentration needs 10 points in Affliction rows above it (has 0).',
    });
    expect(canAddPoint({ suppression: 5 }, 'suppression')).toEqual({ ok: false, reason: 'Suppression is at its maximum rank (5/5).' });
    const noImmolate = authorWith({ shadowAndFlame: 0 });
    expect(canAddPoint(noImmolate, 'conflagrate')).toEqual({
      ok: false,
      reason: 'Conflagrate needs Improved Immolate at full rank (0/5).',
    });
    expect(canAddPoint(decodeTalents(author).ranks, 'suppression')).toEqual({
      ok: false,
      reason: 'All 61 talent points are spent.',
    });
    expect(canAddPoint({}, 'nope')).toEqual({ ok: false, reason: "Unknown talent 'nope'." });
    expect(canAddPoint({}, '__proto__')).toEqual({ ok: false, reason: "Unknown talent '__proto__'." });
  });

  it('removing a Cataclysm point that supports a lower row is blocked; one that does not is allowed', () => {
    const ranks = decodeTalents(author).ranks;
    // Author's Destruction points per row 0-7: 10, 5, 6, 4, 1, 6, 3, 5. Cumulative above each row:
    // Emberstorm (row 5) needs 25, has 26; Backlash (row 6) needs 30, has 32; Shadow and Flame (row 7)
    // needs 35, has exactly 35, so any point above row 7 is load-bearing.
    expect(canRemovePoint(ranks, 'cataclysm')).toEqual({
      ok: false,
      reason: 'Shadow and Flame needs 35 points in Destruction rows above it: Cataclysm is one of them.',
    });
    // Shadow and Flame itself (the deepest row) can lose a point.
    expect(canRemovePoint(ranks, 'shadowAndFlame')).toEqual({ ok: true });
    // Without Shadow and Flame, Cataclysm can go down to 4/5 (Nether Protection, row 5, then has 25
    // of the 25 it needs) but not to 3/5.
    const lighter = { ...ranks, shadowAndFlame: 0, cataclysm: 4 };
    expect(canRemovePoint({ ...ranks, shadowAndFlame: 0 }, 'cataclysm')).toEqual({ ok: true });
    expect(canRemovePoint(lighter, 'cataclysm')).toEqual({
      ok: false,
      reason: 'Nether Protection needs 25 points in Destruction rows above it: Cataclysm is one of them.',
    });
  });

  it('removing a point from a talent another one depends on is blocked', () => {
    const ranks = authorWith({ improvedImmolate: 5, conflagrate: 1, shadowAndFlame: 0, intensity: 0 });
    expect(validateTalents(ranks)).toEqual([]);
    expect(canRemovePoint(ranks, 'improvedImmolate')).toEqual({
      ok: false,
      reason: 'Conflagrate depends on Improved Immolate at full rank.',
    });
    expect(canRemovePoint(ranks, 'conflagrate')).toEqual({ ok: true });
    expect(canRemovePoint(decodeTalents(author).ranks, 'devastation')).toEqual({
      ok: false,
      reason: 'Ruin depends on Devastation at full rank.',
    });
  });

  it('removing from a talent with no points, or an unknown one, is refused with a reason', () => {
    expect(canRemovePoint({}, 'suppression')).toEqual({ ok: false, reason: 'Suppression has no points to remove.' });
    expect(canRemovePoint({}, 'constructor')).toEqual({ ok: false, reason: "Unknown talent 'constructor'." });
  });

  it('every point of a valid build can be added back one by one in row order (the checks agree with validateTalents)', () => {
    for (const s of [author, ...Object.values(WOWSIMS_PRESETS)]) {
      const target = decodeTalents(s).ranks;
      const ranks: Record<string, number> = {};
      for (const d of [...all].sort((a, b) => a.row - b.row)) {
        for (let r = 0; r < (target[d.id] ?? 0); r++) {
          expect(canAddPoint(ranks, d.id), `${s} ${d.id}`).toEqual({ ok: true });
          ranks[d.id] = r + 1;
        }
      }
      expect(encodeTalents(ranks)).toBe(encodeTalents(target));
      // And removed again from the deepest row first.
      for (const d of [...all].sort((a, b) => b.row - a.row)) {
        while ((ranks[d.id] ?? 0) > 0) {
          expect(canRemovePoint(ranks, d.id), `${s} -${d.id}`).toEqual({ ok: true });
          ranks[d.id]! -= 1;
          expect(validateTalents(ranks)).toEqual([]);
        }
      }
    }
  });
});

describe('hostile talent strings: errors, never a throw, idempotent re-encode', () => {
  const hostile: unknown[] = [
    '',
    'abc',
    '--',
    '9-9-9',
    '-'.repeat(5),
    '1'.repeat(10_000),
    `${'0'.repeat(30)}--`,
    '５--',
    '0-0-0\u0000',
    '😀-1-1',
    '__proto__',
    'constructor-toString-valueOf',
    ' - - ',
    undefined,
    null,
    42,
    { toString: () => author },
  ];

  it.each(hostile.map((h) => [typeof h === 'string' && h.length > 40 ? `${h.slice(0, 20)}... (${h.length})` : String(h), h]))(
    '%s',
    (_, input) => {
      const d = decodeTalents(input as string);
      expect(Array.isArray(d.errors)).toBe(true);
      expect(Object.keys(d.ranks)).toEqual(ids);
      for (const id of ids) expect(Number.isInteger(d.ranks[id])).toBe(true);
      for (const e of d.errors) expect(e.length).toBeLessThanOrEqual(200);
      const once = encodeTalents(d.ranks);
      expect(encodeTalents(decodeTalents(once).ranks)).toBe(once);
      expect(once).toMatch(/^\d{21}-\d{22}-\d{21}$/);
    },
  );

  it('the expected inputs are rejected with the stable messages', () => {
    expect(decodeTalents('--').errors).toEqual([]);
    expect(decodeTalents('').errors).toEqual(["Talent string needs 3 trees separated by '-' (got 1)."]);
    expect(decodeTalents('abc').errors).toEqual(["Talent string needs 3 trees separated by '-' (got 1)."]);
    expect(decodeTalents('a-b-c').errors).toEqual(["Affliction: unexpected character 'a' at position 1."]);
    expect(decodeTalents('1'.repeat(10_000)).errors).toEqual([
      `Talent string is too long (10000 characters, at most ${TALENT_STRING_MAX_LENGTH}).`,
    ]);
    expect(decodeTalents(`${'0'.repeat(22)}--`).errors).toEqual(['Affliction: 22 digits, the tree has 21 talents.']);
    expect(decodeTalents('😀-1-1').errors).toEqual(["Affliction: unexpected character U+1F600 at position 1."]);
    expect(decodeTalents('0-0-0\u0000').errors).toEqual(["Destruction: unexpected character U+0000 at position 2."]);
    expect(decodeTalents(undefined as unknown as string).errors).toEqual(['Talent string must be text.']);
    // '9-9-9' parses (digits) but breaks the rank and row rules; its ranks are kept as read.
    const nine = decodeTalents('9-9-9');
    expect(nine.ranks.suppression).toBe(9);
    expect(nine.points).toEqual([9, 9, 9]);
    expect(nine.errors).toEqual([
      'Suppression: rank 9 is above the maximum 5.',
      'Improved Healthstone: rank 9 is above the maximum 2.',
      'Improved Shadow Bolt: rank 9 is above the maximum 5.',
    ]);
    // encodeTalents clamps what it cannot represent: ranks to 0..maxRank, unknown keys dropped.
    expect(encodeTalents(nine.ranks)).toBe(`5${'0'.repeat(20)}-2${'0'.repeat(21)}-5${'0'.repeat(20)}`);
    expect(encodeTalents({ suppression: Number.NaN, ruin: 1.5, bane: -2, x: 3 } as Record<string, number>)).toBe(
      encodeTalents({}),
    );
  });

  it('never throws on a throwing ranks object', () => {
    const evil = new Proxy({}, {
      get() {
        throw new Error('boom');
      },
      ownKeys() {
        throw new Error('boom');
      },
    }) as Record<string, number>;
    expect(validateTalents(evil)).toEqual(['Talent ranks could not be read.']);
    expect(encodeTalents(evil)).toBe(encodeTalents({}));
    expect(canAddPoint(evil, 'suppression')).toEqual({ ok: false, reason: 'Talent ranks could not be read.' });
    expect(canRemovePoint(evil, 'suppression')).toEqual({ ok: false, reason: 'Talent ranks could not be read.' });
    expect(canAddPoint({}, undefined as unknown as string)).toEqual({ ok: false, reason: 'Unknown talent.' });
  });
});

// node:fs without @types/node (tsconfig `types: []`): a dynamic import typed by hand.
type Fs = {
  readFileSync(path: URL): Uint8Array;
  readdirSync(path: URL): string[];
  statSync(path: URL): { size: number };
};
const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as Fs;

describe('talent icons (npm run icons)', () => {
  const dir = new URL('../../public/icons/talents/', import.meta.url);
  const file = (name: string) => new URL(name, dir);
  let listed: string[] = [];
  try {
    listed = fs.readdirSync(dir);
  } catch {
    // No folder yet: the tests below fail with the missing file names.
  }
  const files = new Set(listed);

  it('every talent icon is committed as public/icons/talents/<icon>.jpg, a real JPEG', () => {
    for (const d of all) {
      expect(files.has(`${d.icon}.jpg`), `${d.id}: missing ${d.icon}.jpg (run npm run icons)`).toBe(true);
      const bytes = fs.readFileSync(file(`${d.icon}.jpg`));
      expect([...bytes.subarray(0, 3)], d.icon).toEqual([0xff, 0xd8, 0xff]);
      expect(talentIconPath(d.icon)).toBe(`icons/talents/${d.icon}.jpg`);
    }
  });

  it('the folder holds only the talent icons, within the ~150 KB budget', () => {
    const icons = new Set(all.map((d) => `${d.icon}.jpg`));
    expect([...files].sort()).toEqual([...icons].sort());
    const bytes = [...files].reduce((n, f) => n + fs.statSync(file(f)).size, 0);
    expect(bytes).toBeLessThanOrEqual(150_000);
  });
});
