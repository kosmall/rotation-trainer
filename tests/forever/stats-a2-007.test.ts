// A2-007 / A3-009 / A4-015: the talent constants of stats.ts come from talents.json (one source), and the
// simulator's effective values stay exactly what they were (ledger section 1: +3% Stamina per rank Demonic
// Embrace, +5% mana per rank Fel Vitality, +15% Demon Armor per rank Demonic Aegis, +10% Life Tap mana per rank).
import { describe, expect, it } from 'vitest';
import { loadParams } from '../../src/forever/data/load';
import { effectNum } from '../../src/forever/effects';
import { TALENTS } from '../../src/forever/talents';
import { demonArmorOf, lifeTapGain, playerStatsFor } from '../../src/forever/stats';

describe('pinned effective values of the stats.ts talent constants (no value change)', () => {
  it('Demonic Embrace: +3% Stamina per rank', () => {
    const exact: [number, number, number, number][] = [
      // level, stamina at 5/5, max HP at 0/5, max HP at 5/5
      [40, 97.75, 1304, 1432],
      [50, 125.35, 1889, 2053],
      [59, 151.225, 2501, 2698],
    ];
    for (const [L, sta5, hp0, hp5] of exact) {
      const a = playerStatsFor(L, 'average', {});
      const b = playerStatsFor(L, 'average', { demonic_embrace: 5 });
      expect(b.stamina, `level ${L}`).toBeCloseTo(sta5, 9);
      expect(b.stamina / a.stamina, `level ${L}`).toBeCloseTo(1.15, 9);
      expect([a.maxHp, b.maxHp], `level ${L}`).toEqual([hp0, hp5]);
    }
  });
  it('Fel Vitality: +5% maximum mana per rank, nothing else of the player changes', () => {
    const mana: [number, number, number][] = [[40, 2628, 3022], [50, 3463, 3982], [59, 4216, 4848]];
    for (const [L, m0, m3] of mana) {
      const a = playerStatsFor(L, 'average', {});
      const b = playerStatsFor(L, 'average', { fel_vitality: 3 });
      expect([a.maxMana, b.maxMana], `level ${L}`).toEqual([m0, m3]);
      expect(b.maxHp).toBe(a.maxHp);
      expect(b.stamina).toBe(a.stamina);
    }
  });
  it('Demonic Aegis: +15% Demon Armor per rank', () => {
    const armor: [number, number[]][] = [[40, [390, 448.5, 507]], [50, [480, 552, 624]], [59, [480, 552, 624]]];
    for (const [L, vals] of armor) vals.forEach((v, r) => expect(demonArmorOf(L, { demonic_aegis: r }), `level ${L} rank ${r}`).toBeCloseTo(v, 9));
  });
  it('Improved Life Tap: +10% mana per rank', () => {
    const p = loadParams();
    [180, 198, 216].forEach((v, r) => expect(lifeTapGain(100, 80, { improved_life_tap: r }, p), `rank ${r}`).toBeCloseTo(v, 9));
  });
});

describe('the constants live in talents.json and stats.ts reads them', () => {
  it('data keys hold the ledger values', () => {
    expect(effectNum('demonic_embrace', 'staminaMultPerRank')).toBe(0.03);
    expect(effectNum('fel_vitality', 'playerManaPerRank')).toBe(0.05);
    expect(effectNum('demonic_aegis', 'demonArmorMultPerRank')).toBe(0.15);
    expect(effectNum('improved_life_tap', 'gainMultPerRank')).toBe(0.1);
  });
  it('Demonic Embrace no longer carries the dead, contradicting maxHpMultPerRank key', () => {
    expect(TALENTS.find((t) => t.id === 'demonic_embrace')?.effect).not.toHaveProperty('maxHpMultPerRank');
  });
});

describe('every numeric talent effect key is read by code (A3-009)', () => {
  /** Documented values of unmodelled sub-effects: kept for the owner's decision list, deliberately not read. */
  const DOCUMENTED_ONLY: Record<string, string[]> = {
    suppression: ['threatReducePerRank'], // threat reduction is not modelled (only the hit part is)
    master_demonologist: ['felhunterMagicReduce'], // Felhunter damage reduction is not modelled
  };
  const files = import.meta.glob(['../../src/**/*.{ts,tsx}', '../../scripts/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const code = Object.values(files).join('\n');
  it('no numeric effect key is unread unless it is listed as documented-only', () => {
    const unread: string[] = [];
    for (const t of TALENTS) {
      for (const [k, v] of Object.entries(t.effect ?? {})) {
        if (typeof v !== 'number') continue;
        if (DOCUMENTED_ONLY[t.id]?.includes(k)) continue;
        if (!code.includes(`'${k}'`)) unread.push(`${t.id}.${k}`);
      }
    }
    expect(unread).toEqual([]);
  });
  it('documented-only keys really are unread (the list does not go stale)', () => {
    for (const keys of Object.values(DOCUMENTED_ONLY)) for (const k of keys) expect(code.includes(k), k).toBe(false);
  });
});
