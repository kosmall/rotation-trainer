// The pure part of the charts: which series get a colour, what a gap to the leader is, what the tooltip lists.
import { describe, expect, it } from 'vitest';
import { familyOf, rankingLabel, assignSlots, axisDomain, axisTicks, nameAxis, defaultShown, epRows, MAX_COLOURED, rankingRows, shortName, toggleShown, tooltipRows, trendRows, type Series } from '../../../src/ui/forever/charts/chartModel';
import type { EpResult } from '../../../src/forever/ep';
import type { RankedBuild } from '../../../src/forever/web/api';

const series = (values: Record<string, number[]>): Series[] => Object.entries(values).map(([id, v]) => ({ id, label: id, values: v }));
const many = (n: number): Series[] => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, label: `b${i}`, values: [100 + i, 100 + i] }));

describe('which builds are drawn in colour', () => {
  it('all of them when they fit the palette, in the order given', () => {
    expect(defaultShown(series({ A: [1], B: [3], C: [2] }))).toEqual(['A', 'B', 'C']);
    expect(defaultShown(many(MAX_COLOURED))).toHaveLength(MAX_COLOURED);
  });
  it('the five with the best mean when there are too many', () => {
    expect(defaultShown(many(12))).toEqual(['b11', 'b10', 'b9', 'b8', 'b7']);
  });
  it('for a metric where less is better the five lowest', () => {
    expect(defaultShown(many(12), false)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4']);
  });
  it('toggling adds and removes, never beyond the palette', () => {
    expect(toggleShown(['A'], 'B')).toEqual(['A', 'B']);
    expect(toggleShown(['A', 'B'], 'A')).toEqual(['B']);
    const full = many(MAX_COLOURED).map((s) => s.id);
    expect(toggleShown(full, 'x')).toEqual(full);
    expect(toggleShown(full, 'b0')).toHaveLength(MAX_COLOURED - 1);
  });
  it('a build keeps its colour while others come and go', () => {
    const first = assignSlots({}, ['A', 'B', 'C']);
    expect(first).toEqual({ A: 0, B: 1, C: 2 });
    const without = assignSlots(first, ['A', 'C']);
    expect(without).toEqual({ A: 0, C: 2 });
    // the freed colour goes to the newcomer
    expect(assignSlots(without, ['A', 'C', 'D'])).toEqual({ A: 0, C: 2, D: 1 });
  });
});

describe('trend rows', () => {
  const s = series({ A: [100, 50], B: [80, 60] });
  it('hold the values per level', () => {
    expect(trendRows([40, 41], s, 'value')).toEqual([
      { level: 40, values: { A: 100, B: 80 } },
      { level: 41, values: { A: 50, B: 60 } },
    ]);
  });
  it('or the percent behind the leader of each level', () => {
    const rows = trendRows([40, 41], s, 'gap');
    expect(rows[0]!.values.A).toBe(0);
    expect(rows[0]!.values.B).toBeCloseTo(-20, 6);
    expect(rows[1]!.values.A).toBeCloseTo(-16.6667, 3);
    expect(rows[1]!.values.B).toBe(0);
  });
  it('count the lowest as the leader when less is better', () => {
    const rows = trendRows([40], series({ A: [10], B: [12] }), 'gap', false);
    expect(rows[0]!.values).toEqual({ A: 0, B: -20 });
  });
  it('the tooltip lists the builds of a level best first, each with its distance to the leader', () => {
    expect(tooltipRows(s, 1)).toEqual([
      { id: 'B', label: 'B', value: 60, gapPct: 0 },
      { id: 'A', label: 'A', value: 50, gapPct: expect.closeTo(-16.6667, 3) },
    ]);
  });
});

describe('axis domain', () => {
  it('leaves room around the values and ends on round numbers', () => {
    expect(axisDomain([101, 149])).toEqual([95, 155]);
    expect(axisDomain([-12.3, 0])).toEqual([-14, 0]);
    expect(axisDomain([7, 7])).toEqual([6, 8]);
    expect(axisDomain([])).toEqual([0, 1]);
  });
});

describe('axis ticks and long names', () => {
  it('ticks are even round numbers inside the range, zero among them', () => {
    expect(axisTicks([-90, 0])).toEqual([-80, -60, -40, -20, 0]);
    expect(axisTicks([95, 155])).toEqual([100, 110, 120, 130, 140, 150]);
    // a wide kills-per-hour axis still gets a line every 20, not only two
    expect(axisTicks([80, 190])).toEqual([80, 100, 120, 140, 160, 180]);
    expect(axisTicks([0, 1])).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(axisTicks([-14, 0])).toEqual([-10, -5, 0]);
  });
  it('a long build name is cut for the axis', () => {
    expect(shortName('DT_SS')).toBe('DT_SS');
    const long = '★ L41→59 #7 Agony → Shadow Bolt r1; Do';
    expect(shortName(long)).toHaveLength(32);
    expect(shortName(long).endsWith('…')).toBe(true);
    expect(shortName('DEMO_PACT_VIDEO_NOCOE', 12)).toBe('DEMO_PACT_V…');
  });
  it('on a narrow screen the names take less than half of the chart', () => {
    const ids = ['DT_SS', 'DEMO_PACT_VIDEO_NOCOE'];
    expect(nameAxis(ids, 800)).toEqual({ width: 167, max: 21 });
    const narrow = nameAxis(ids, 320);
    expect(narrow.width).toBeLessThanOrEqual(144);
    expect(narrow.max).toBeLessThan(21);
    expect(nameAxis(['A'], 320).max).toBeGreaterThanOrEqual(8);
  });
});

const ranked = (variant: string, kph: number, vs: number | null): RankedBuild =>
  ({
    metrics: { variant, killsPerHour: kph, ttkMean: 20 - kph / 20, deathsPerHour: 0.1, downtimeShare: 0.25, breaksPerHour: 3 },
    vsBest: vs === null ? null : { mean: vs, ci95: [vs - 1, vs + 2], significant: true },
  }) as unknown as RankedBuild;

describe('ranking rows', () => {
  const rows = [ranked('A', 150, null), ranked('B', 140, -10), ranked('C', 145, -5)];
  it('kills per hour: the value itself, most first', () => {
    expect(rankingRows(rows, 'kph').map((r) => [r.id, r.value])).toEqual([
      ['A', 150],
      ['C', 145],
      ['B', 140],
    ]);
  });
  it('the text at the end of a bar: the value, and for kills per hour how far from the best', () => {
    const [a, c] = rankingRows(rows, 'kph');
    expect(rankingLabel(a!, 'kph')).toEqual({ value: '150.0', gap: 'najlepszy' });
    expect(rankingLabel(c!, 'kph')).toEqual({ value: '145.0', gap: '-5.0' });
    const near = { ...c!, vsBest: { mean: -0.4, ci95: [-1, 0.2] as [number, number], significant: false } };
    expect(rankingLabel(near, 'kph').gap).toBe('-0.4 ≈');
    expect(rankingLabel(rankingRows(rows, 'ttk')[0]!, 'ttk')).toEqual({ value: '12.5 s', gap: '' });
    expect(rankingLabel(rankingRows(rows, 'downtime')[0]!, 'downtime').value).toBe('25%');
  });
  it('another metric: its own value, best first', () => {
    expect(rankingRows(rows, 'ttk').map((r) => r.id)).toEqual(['A', 'C', 'B']);
    expect(rankingRows(rows, 'downtime')[0]!.value).toBe(25);
  });
  it('a build belongs to a family: a built-in affliction or demonology build, or one of yours', () => {
    expect(familyOf('DT_SS_NOCOE')).toBe('affliction');
    expect(familyOf('DEMO_FIRE')).toBe('demonology');
    expect(familyOf('★ My build')).toBe('own');
  });
});

describe('EP rows', () => {
  const weight = (w: number | null, capped = false) => ({ weight: w, ci95: w === null ? null : [w - 0.5, w + 1], capped, nonlinear: false });
  const result = (build: string, stamina: number | null, hitCapped: boolean) =>
    ({
      build,
      valid: true,
      weights: { spellPower: weight(1), intellect: weight(0.2), spirit: weight(-0.4), stamina: weight(stamina), critPct: weight(2), hitPct: weight(hitCapped ? 0 : 3, hitCapped) },
    }) as unknown as EpResult;
  it('has a row per stat without spell power (it is the unit), a value and interval per build', () => {
    const rows = epRows([result('A', 2, true), result('B', null, false)]);
    expect(rows.map((r) => r.stat)).toEqual(['intellect', 'spirit', 'stamina', 'critPct', 'hitPct']);
    const stamina = rows.find((r) => r.stat === 'stamina')!;
    expect(stamina.cells.A).toEqual({ value: 2, error: [0.5, 1], note: undefined });
    expect(stamina.cells.B).toEqual({ value: undefined, error: undefined, note: 'n/a' });
    expect(rows.find((r) => r.stat === 'hitPct')!.cells.A).toEqual({ value: 0, error: undefined, note: 'capped' });
  });
});
