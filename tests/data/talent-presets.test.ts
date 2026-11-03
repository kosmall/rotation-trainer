// Talent presets (stage 2b Task 3): the wowsims tbc-new builds plus the author's export, each a
// valid build that the spec and the priority follow.

import { describe, expect, it } from 'vitest';
import { buildDestructionWarlock, DEFAULT_WARLOCK_OPTIONS, destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { offeredTalentPresets, TALENT_PRESETS, talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import { decodeTalents, encodeTalents, TALENT_POINTS_MAX, validateTalents } from '../../src/data/classes/warlock/talentTree';
import { destructionTalentString } from '../../src/data/classes/warlock/talents';

// wowsims tbc-new @ 91f869a ui/specs/warlock/dps/presets.ts, `talentsString` of every talent preset
// (copied by hand from the clone; the module under test has its own copy).
const WOWSIMS: Record<string, string> = {
  Affliction: '05022221112351055003--50500051220001',
  'Demo/Ruin': '01-205003213305010150134-50500251020001',
  'Demonology Felguard': '01-2050030133250101501351-5050005112',
  'Destro/Nightfall': '150222201023--505020510200510531051',
  Destruction: '-20500301332101-50500051220051053105',
};

describe('TALENT_PRESETS', () => {
  it('has the five wowsims builds and the author export, ids unique, in a fixed order', () => {
    expect(TALENT_PRESETS.map((p) => p.id)).toEqual([
      'my-build',
      'destruction',
      'destro-nightfall',
      'affliction',
      'demo-ruin',
      'demo-felguard',
    ]);
    expect(new Set(TALENT_PRESETS.map((p) => p.id)).size).toBe(TALENT_PRESETS.length);
    expect(TALENT_PRESETS.map((p) => p.name)).toEqual([
      'My build (export)',
      'Destruction',
      'Destro/Nightfall',
      'Affliction',
      'Demo/Ruin',
      'Demonology Felguard',
    ]);
  });

  it('each wowsims preset carries the wowsims string verbatim and the full-width encoding of it', () => {
    for (const [name, text] of Object.entries(WOWSIMS)) {
      const p = TALENT_PRESETS.find((x) => x.name === name)!;
      expect(p, name).toBeDefined();
      expect(p.wowsimsString).toBe(text);
      expect(p.talents).toBe(encodeTalents(decodeTalents(text).ranks));
      expect(p.source).toMatch(/wowsims\/tbc-new @ 91f869a ui\/specs\/warlock\/dps\/presets\.ts/);
    }
  });

  it('"My build (export)" is the author string (WowSimsExporter export)', () => {
    const mine = talentPresetById('my-build')!;
    expect(mine.talents).toBe(destructionTalentString);
    expect(mine.wowsimsString).toBeUndefined();
    expect(mine.source).toMatch(/wowsimsexporter-destruction-warlock\.json/);
  });

  it.each(TALENT_PRESETS.map((p) => [p.id, p] as const))('%s: valid (0 errors), at most 61 points, notes present', (_id, p) => {
    expect(validateTalents(p.talents)).toEqual([]);
    const d = decodeTalents(p.talents);
    expect(d.errors).toEqual([]);
    expect(d.points.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(TALENT_POINTS_MAX);
    expect(p.talents).toMatch(/^\d{21}-\d{22}-\d{21}$/);
    expect(p.phaseNote.length).toBeGreaterThan(10);
    expect(['affliction', 'demonology', 'destruction']).toContain(p.spec);
  });

  it('spec follows the tree with the most points', () => {
    for (const p of TALENT_PRESETS) {
      const pts = decodeTalents(p.talents).points;
      expect(p.spec, p.id).toBe(['affliction', 'demonology', 'destruction'][pts.indexOf(Math.max(...pts))]);
    }
  });

  it('every preset builds a spec; derived numbers follow the build', () => {
    for (const p of TALENT_PRESETS) {
      const spec = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, p.talents);
      expect(spec.priority.length, p.id).toBeGreaterThan(0);
      expect(spec.keybinds[0]).toBe('shadow-bolt');
    }
    // My build = the default spec, field for field.
    expect(buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, talentPresetById('my-build')!.talents)).toEqual(
      destructionWarlock,
    );
    // Destro/Nightfall: Conflagrate talented (slot 8), no Demonic Aegis (Fel Armor 100), Corruption instant.
    const nf = buildDestructionWarlock(DEFAULT_WARLOCK_OPTIONS, undefined, undefined, talentPresetById('destro-nightfall')!.talents);
    expect(nf.keybinds[7]).toBe('conflagrate');
    expect(nf.statBonuses.spellPower).toBe(100);
    expect(destructionWarlock.statBonuses.spellPower).toBe(130);
    expect(nf.modifiers).toContainEqual({ spellIds: ['corruption'], castTimeMsDelta: -2000 });
  });

  it('wowsims has no separate Fire talent build (Destruction (Fire) reuses the Destruction string): nothing hidden', () => {
    expect(TALENT_PRESETS.some((p) => p.fire)).toBe(false);
    expect(offeredTalentPresets()).toEqual(TALENT_PRESETS.filter((p) => !p.fire));
    expect(offeredTalentPresets()).toHaveLength(6);
  });

  it('presets are frozen; offeredTalentPresets returns a new array each call', () => {
    expect(Object.isFrozen(TALENT_PRESETS)).toBe(true);
    expect(Object.isFrozen(TALENT_PRESETS[0])).toBe(true);
    expect(offeredTalentPresets()).not.toBe(offeredTalentPresets());
    expect(talentPresetById('__proto__')).toBeUndefined();
    expect(talentPresetById('nope')).toBeUndefined();
  });
});
