import { describe, expect, it } from 'vitest';
import { buildReport, formatRunHeader } from '../../src/forever/report';
import { collectVerify } from '../../src/forever/verify';

const quick = { levels: [45, 50], respecLevels: [38, 40, 45], sessions: 4, sensSessions: 3, sensLevels: [45, 50], optSessions: 3, optToLevel: 33 + 28, seed: 1, quick: true };

describe('report', () => {
  const text = buildReport({ ...quick, optToLevel: 60 });
  it('has the sections the task asks for', () => {
    for (const h of ['## 1. Comparison of all builds', '## 2. Respec to Demonology', '## 3. Bane 2/5 + Shadow Bolt rank 1', '## 6. Sensitivity', '## 7. All assumptions', '## 8. What is not modelled']) expect(text).toContain(h);
  });
  it('lists every verify assumption', () => {
    for (const a of collectVerify()) expect(text).toContain(`| ${a.file} | ${a.name} |`);
  });
  it('states the answer to the Bane question and a respec recommendation', () => {
    expect(text).toMatch(/Recommendation\./);
    expect(text).toContain('Bane 5/5 + rank 2');
  });
  it('contains a table row per build', () => {
    expect(text.match(/^\| DEMO_PACT_R1 \|/gm)!.length).toBeGreaterThan(2);
  });
});

describe('A5-010 / A5-018: run header and report text', () => {
  it('formatRunHeader names levels, gear, mobs, sessions, seed, Life Tap policy, Eureka! and Spellstone', () => {
    const h = formatRunHeader({ levels: [40, 50, 59], profiles: ['average'], mobs: 1, sessions: 100, seed: 7, params: {} });
    expect(h).toContain('levels 40, 50, 59');
    expect(h).toContain('gear average');
    expect(h).toContain('1 mob per pull');
    expect(h).toContain('100 sessions');
    expect(h).toContain('seed 7');
    expect(h).toContain('Life Tap policy: default rules');
    expect(h).toContain('Eureka! timing: off');
    expect(h).toContain('Spellstone: no');
    expect(h).toContain('parameter overrides: none');
  });
  it('formatRunHeader reports overrides, a changed Life Tap policy and the Spellstone', () => {
    const h = formatRunHeader({ levels: [45], profiles: ['average', 'good'], mobs: 2, sessions: 10, seed: 1, params: { lt_combat_mana_pct: 0.5, bane_per_rank: 0.2, haste_pct: 2, shadow_spell_power_bonus: 21 } });
    expect(h).toContain('Life Tap policy: overridden (lt_combat_mana_pct=0.5)');
    expect(h).toContain('bane_per_rank=0.2');
    expect(h).toContain('Spellstone: yes');
    expect(h).toContain('2 mob per pull');
    expect(h).toContain('gear average, good');
  });
  it('does not claim that out-of-combat HP regeneration is zero (the runner applies it)', () => {
    expect(buildReport({ ...quick, optToLevel: 60 })).not.toMatch(/regeneration is assumed to be zero/);
  });
});
