import { describe, expect, it } from 'vitest';
import { TALENTS, validatePicks } from '../../src/forever/talents';
import { isAddonExport, parseAddonExport } from '../../src/forever/web/addon-import';
import { emptyBuild } from '../../src/forever/web/custom';

const SAMPLE = { class: 'warlock', flavor: 'forever', level: 33, name: 'Feliczita', spec: 'affliction', talents: '245202200300013' };
const count = (a: readonly string[], id: string) => a.filter((x) => x === id).length;

describe('addon export import', () => {
  it('parses the sample', () => {
    const r = parseAddonExport(SAMPLE);
    expect(r.points).toBe(24);
    expect(r.gameLevel).toBe(33);
    expect(r.build.name).toBe('Feliczita (affliction)');
    expect(r.build.rotation).toBe('affliction');
    expect(r.build.picks.slice(0, 3)).toEqual(['improved_life_tap', 'improved_life_tap', 'suppression']);
    expect(count(r.build.picks, 'soul_siphon')).toBe(3);
    expect(r.build.picks).not.toContain('soul_harvest');
    expect(validatePicks(r.build.picks).ok).toBe(true);
  });
  it('the screenshot string adds Soul Harvest', () => {
    const r = parseAddonExport({ ...SAMPLE, talents: '245212200300013' });
    expect(r.points).toBe(25);
    expect(count(r.build.picks, 'soul_harvest')).toBe(1);
    expect(validatePicks(r.build.picks).ok).toBe(true);
  });
  it('trailing zeros do not matter', () => {
    expect(parseAddonExport({ ...SAMPLE, talents: '2452022003000130000' }).build.picks).toEqual(parseAddonExport(SAMPLE).build.picks);
  });
  it('spec decides the rotation', () => {
    const demo = parseAddonExport({ ...SAMPLE, spec: 'demonology', talents: '' }).build;
    expect([demo.rotation, demo.filler, demo.rank, demo.pet]).toEqual(['demonology', 'shadow_bolt', 1, 'succubus']);
    const fire = parseAddonExport({ ...SAMPLE, spec: 'destruction', talents: '' }).build;
    expect([fire.rotation, fire.filler, fire.rank, fire.pet]).toEqual(['fire', 'searing_pain', 'max', 'imp']);
    const unknown = parseAddonExport({ ...SAMPLE, spec: 'x', talents: '' }).build;
    expect([unknown.rotation, unknown.filler, unknown.pet]).toEqual(['affliction', 'wrack', 'voidwalker']);
  });
  it('rejects bad input', () => {
    expect(() => parseAddonExport({ ...SAMPLE, class: 'mage' })).toThrow(/warlock/);
    expect(() => parseAddonExport({ ...SAMPLE, talents: '24x' })).toThrow(/x/);
    expect(() => parseAddonExport({ ...SAMPLE, talents: '9' })).toThrow(/Improved Life Tap/);
    expect(() => parseAddonExport({ ...SAMPLE, talents: '1'.repeat(53) })).toThrow(/52/);
    expect(() => parseAddonExport(null)).toThrow();
  });
  it('rejects more than 51 points and ignores inherited spec keys', () => {
    expect(() => parseAddonExport({ ...SAMPLE, talents: TALENTS.map((t) => t.maxRank).join('') })).toThrow(/51/);
    expect(parseAddonExport({ ...SAMPLE, spec: 'constructor', talents: '' }).build.rotation).toBe('affliction');
  });
  it('empty or missing talents give an empty build; missing name falls back', () => {
    const r = parseAddonExport({ class: 'warlock', spec: 'affliction' });
    expect(r.points).toBe(0);
    expect(r.build.picks).toEqual([]);
    expect(r.build.name).toBe('Import z addonu (affliction)');
  });
  it('a long character name keeps the spec suffix within 40 characters', () => {
    const r = parseAddonExport({ ...SAMPLE, spec: 'destruction', name: 'A'.repeat(60), talents: '' });
    expect(r.build.name).toHaveLength(40);
    expect(r.build.name.endsWith(' (destruction)')).toBe(true);
  });
  it('detects an export', () => {
    expect(isAddonExport(SAMPLE)).toBe(true);
    expect(isAddonExport(emptyBuild('x'))).toBe(false);
    expect(isAddonExport(null)).toBe(false);
  });
});
