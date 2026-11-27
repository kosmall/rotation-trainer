import { describe, expect, it } from 'vitest';
import { compareBuilds, renderMarkdownTable } from '../../src/forever/compare';
import { collectVerify } from '../../src/forever/verify';

const base = { sessions: 6, seed: 1, params: { session_pulls: 6 } };

describe('compare and verify registry', () => {
  it('returns one row per build x level x profile', () => {
    const rows = compareBuilds({ ...base, levels: [45, 50], profiles: ['quest', 'good'] });
    expect(rows).toHaveLength(22 * 2 * 2);
  });
  it('renders a markdown block per level and profile with all builds', () => {
    const md = renderMarkdownTable(compareBuilds({ ...base, levels: [50], profiles: ['average'] }));
    expect(md).toContain('#### Level 50, gear: average');
    expect(md.match(/^\| (AFF|DT|DEMO)/gm)).toHaveLength(22);
  });
  it('overriding bane_per_rank changes the Bane 5/5 build but not the Bane 2/5 one beyond its cast', () => {
    const at = (bane: number) => compareBuilds({ ...base, levels: [50], profiles: ['average'], builds: ['DEMO_PACT_VIDEO'], params: { ...base.params, bane_per_rank: bane } })[0]!;
    expect(at(0.2).gcdWasteSecPerKill).toBeGreaterThan(at(0.1).gcdWasteSecPerKill);
  });
  it('the verify registry lists params, talents and spells with sources', () => {
    const items = collectVerify();
    expect(items.length).toBeGreaterThan(40);
    expect(items.some((i) => i.name === 'life_tap_spirit_coeff')).toBe(true);
    expect(items.some((i) => i.file === 'talents.json' && i.name === 'demonic_brand')).toBe(true);
    expect(items.some((i) => i.name === 'bane_per_rank')).toBe(false);
    for (const i of items) expect(i.source.length, `${i.file}:${i.name}`).toBeGreaterThan(3);
  });
});
