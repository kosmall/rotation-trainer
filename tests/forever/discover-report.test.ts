import { describe, expect, it } from 'vitest';
import type { DiscoverResult, TopRow } from '../../src/forever/discover/engine';
import { renderDiscoverReport, toJson, verifyFor } from '../../src/forever/discover/report';
import { enumerateCombos } from '../../src/forever/discover/space';
import type { CellMetrics } from '../../src/forever/runner';

const m = (kph: number): CellMetrics => ({
  variant: 'x', level: 40, profile: 'average', sessions: 200, kills: 1000, killsPerHour: kph, killsPerHourStd: 5, ttkMean: 21.5, ttkStd: 3, manaPerKill: 0, netManaPerKill: 0, hpPerKill: 0,
  drinkSecPerKill: 0, eatSecPerKill: 0, lifeTapSecPerKill: 0, restSecPerKill: 0, downtimeShare: 0.123, breaksPerHour: 0, killsPerBreak: 0, breakFreePullPct: 0, gcdUtil: 0,
  gcdWasteSecPerKill: 0, gcdWasteShare: 0, deathsPerHour: 0.5, petDeathsPerHour: 0, threatSwitchesPerKill: 0, timeoutPct: 0, eurekaPerHour: 0,
});
const [wrackCombo] = enumerateCombos(40, { fillers: ['wrack'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 0 }).filter((c) => !c.genes.drainSoulFinisher);
const [sbCombo] = enumerateCombos(40, { fillers: ['sb_r1'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 0 }).filter((c) => !c.genes.drainSoulFinisher);
const row = (rank: number, combo: typeof wrackCombo, ranks: Record<string, number>, kph: number, significant: boolean): TopRow => ({
  rank, combo: combo!, ranks, label: 'label ' + rank, perTree: { aff: 31, demo: 0, destro: 0 }, freePoints: 2, metrics: m(kph), kphCi: [kph - 1, kph + 1],
  gainVsBest: { mean: kph - 100, ci95: [kph - 101, kph - 99], significant, pct: kph - 100, vs: 'DEMO_FIRE' }, tiedWithFirst: rank === 2,
  nearestKnown: { id: 'AFF_WRACK', distance: 4 }, ...(rank === 1 ? { insensitive: ['suppression'] } : {}),
});
const wrackRanks = { siphon_life: 1, wrack: 1, improved_corruption: 5, suppression: 5, shadow_mastery: 5, malevolence: 5, nightfall: 2, soul_siphon: 3, grim_reach: 2, amplify_curse: 1, improved_drains: 2 };
const result: DiscoverResult = {
  meta: { level: 40, points: 31, profile: 'average', mobs: 1, seed: 1, perk: 0, changedParams: { mob_hp_mult: 1.1 }, hash: 'abc-def', combos: 36288, searched: 227, evaluations: 123456 },
  baseline: [{ id: 'DEMO_FIRE', metrics: m(100), kphCi: [99, 101] }, { id: 'AFF_WRACK', metrics: m(90), kphCi: [89, 91] }],
  top: [row(1, wrackCombo, wrackRanks, 112.3, true), row(2, sbCombo, { improved_shadow_bolt: 5, bane: 5, ruin: 1 }, 101, false)],
};

describe('discovery report', () => {
  const md = renderDiscoverReport(result, 3725);
  it('has the sections', () => {
    for (const h of ['# Build discovery: level 40', '## Known builds (baseline)', '## Top 2', '## Details', '### 1.']) expect(md).toContain(h);
    expect(md).toContain('mob_hp_mult = 1.1');
    expect(md).toContain('1 h 2 min');
  });
  it('marks significance and ties', () => {
    expect(md).toContain('+12.3% ✓');
    expect(md).toContain('+1.0% ~');
    expect(md).toContain('2 ≈#1');
    expect(md).toContain('31/0/0');
    expect(md).toContain('AFF_WRACK (4)');
  });
  it('lists insensitive talents and assumptions', () => {
    expect(md).toContain('Suppression');
    expect(md).toContain('Leans on estimates');
  });
  it('names the estimates a build leans on', () => {
    const v = verifyFor(result.top[0]!, 40);
    expect(v).toContain('params.json:wrack_dmg_mult');
    expect(v).toContain('params.json:pet_dmg_mult');
    expect(v).toContain('spells.json:wrack');
    expect(v).toContain('talents.json:suppression');
    expect(v).toContain('levels.json:levels.pets');
    expect(v).not.toContain('params.json:sb_r1_coeff_mult');
    expect(verifyFor(result.top[1]!, 40)).toContain('params.json:sb_r1_coeff_mult');
  });
  it('shows the conditions with the run parameters', () => {
    const [ds] = enumerateCombos(40, { fillers: ['drain_life'], minTtk: [6], pets: ['succubus'], sacrifice: false, maxDots: 0 }).filter((c) => c.genes.drainSoulFinisher);
    const r: DiscoverResult = { ...result, meta: { ...result.meta, changedParams: { drain_soul_window_sec: 3 } }, top: [row(1, ds, { soul_harvest: 2, improved_drains: 3 }, 105, true)] };
    expect(renderDiscoverReport(r, 60)).toContain('Drain Soul kills in 1-3 s');
  });
  it('writes JSON that round-trips', () => {
    const j = toJson(result);
    expect(JSON.parse(j)).toEqual(result);
    expect(j).not.toContain('"raw"');
  });
});
