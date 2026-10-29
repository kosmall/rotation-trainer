import { describe, expect, it } from 'vitest';
import sample from '../../docs/samples/wowsimsexporter-destruction-warlock.json';
import {
  BASE_CRIT_PCT,
  CRIT_RATING_PER_PCT,
  HASTE_RATING_PER_PCT,
  HIT_RATING_PER_PCT,
  INT_PER_CRIT_PCT,
} from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import {
  destructionBaseStats,
  destructionEquipped,
  destructionWarlock,
} from '../../src/data/classes/warlock/destruction';
import { enchants, gems, items } from '../../src/data/classes/warlock/items';
import { warlockSets } from '../../src/data/classes/warlock/sets';
import type { SpecData } from '../../src/data/types';
import { buildSetup } from '../../src/engine/gear';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { HitOutcome, SetBonusDef, TargetData } from '../../src/engine/types';

const NEVER_MISS: TargetData = { ...BOSS_TARGET, missPct: 0, minMissPct: 0 };

const sampleItems = sample.gear.items as { id: number; enchant?: number; gems?: number[] }[];
const sampleItemIds = sampleItems.map((e) => e.id);
const sampleGemIds = [...new Set(sampleItems.flatMap((e) => e.gems ?? []))];
const sampleEnchantIds = [...new Set(sampleItems.flatMap((e) => (e.enchant === undefined ? [] : [e.enchant])))];

const sortNum = (xs: number[]) => [...xs].sort((a, b) => a - b);
const keysOf = (r: Record<number, unknown>) => sortNum(Object.keys(r).map(Number));

/**
 * Items whose source lists no stat the engine models. Riding Crop (25653): wowsims tbc-new db.json
 * has no stats, only "Mount Speed" (48776); stat_bonus_procs_auto_gen.go "Not simulated".
 */
const NO_MODELED_STATS = [25653];

/**
 * Set bonuses with no effect on damage (no modifiers, statBonuses or hooks), kept for their
 * description. Malefic Raiment 2pc heals 70 per Corruption/Immolate tick: the engine has no
 * health (docs/data-sources.md, Task 12b).
 */
const NO_DAMAGE_EFFECT = ['malefic-raiment:2'];
const bonusKey = (b: SetBonusDef) => `${b.setId}:${b.pieces}`;
const hasEffect = (b: SetBonusDef) =>
  (b.modifiers?.length ?? 0) > 0 || Object.keys(b.statBonuses ?? {}).length > 0 || b.hooks !== undefined;

/** Scripted 60 s run: every 100 ms press the first priority step whose rule holds and that is accepted. */
function scriptedDamage(spec: SpecData): number {
  const sim = new Simulation({ spec, target: BOSS_TARGET, seed: 42 });
  for (let t = 0; sim.snapshot().phase !== 'ended'; t += 100) {
    const s = sim.snapshot();
    for (const step of spec.priority) {
      if (step.when && !step.when(s)) continue;
      if (sim.cast(step.spellId).ok) break;
    }
    sim.advanceTo(t + 100);
  }
  return sim.snapshot().damageTotal;
}

describe('warlock items, gems and enchants (stage 1: the default gear only)', () => {
  it('the tables hold exactly the item, gem and enchant ids of the sample export', () => {
    expect(keysOf(items)).toEqual(sortNum([...new Set(sampleItemIds)]));
    expect(keysOf(gems)).toEqual(sortNum(sampleGemIds));
    expect(keysOf(enchants)).toEqual(sortNum(sampleEnchantIds));
  });

  it('every table entry is keyed by its own id and named', () => {
    for (const table of [items, gems, enchants] as Record<number, { id: number; name: string }>[]) {
      for (const [key, def] of Object.entries(table)) {
        expect(def.id).toBe(Number(key));
        expect(def.name).not.toBe('');
      }
    }
  });

  it('every item has a slot and non-empty stats (Riding Crop has no modeled stat)', () => {
    for (const item of Object.values(items)) {
      expect(item.slot, `${item.id}`).not.toBe('');
      if (NO_MODELED_STATS.includes(item.id)) {
        expect(item.stats, `${item.id}`).toEqual({});
      } else {
        expect(Object.keys(item.stats).length, `${item.id} ${item.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('every setId on an item has at least one bonus in warlockSets', () => {
    const setIds = new Set(warlockSets.map((b) => b.setId));
    for (const item of Object.values(items)) {
      if (item.setId !== undefined) expect(setIds.has(item.setId), `${item.id}`).toBe(true);
    }
  });

  it('the default gear is exactly the 17 entries of the sample file (same ids, enchants and gems)', () => {
    expect(destructionEquipped).toHaveLength(17);
    expect(destructionEquipped).toEqual(sampleItems);
  });

  it('the default gear has nothing unknown', () => {
    const { unknown } = buildSetup({ baseStats: destructionBaseStats, equipped: destructionEquipped, items, gems, enchants });
    expect(unknown).toEqual({ items: [], gems: [], enchants: [] });
  });
});

describe('warlock set bonuses', () => {
  it('every set bonus has a unique (setId, pieces) pair and a description', () => {
    const keys = warlockSets.map(bonusKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of warlockSets) expect(b.description).not.toBe('');
  });

  it('setup.setPieces only references known set ids and is derived from the items (4 Malefic pieces)', () => {
    const setIds = new Set(warlockSets.map((b) => b.setId));
    for (const id of Object.keys(destructionWarlock.setup.setPieces)) expect(setIds.has(id)).toBe(true);
    // Hood 31051, Mantle 31054, Gloves 31050, Leggings 31053.
    expect(destructionWarlock.setup.setPieces).toEqual({ 'malefic-raiment': 4 });
    expect(destructionWarlock.sets).toBe(warlockSets);
  });

  it('every aura id used by set hooks or bonuses is defined', () => {
    const auraIds = new Set(destructionWarlock.auras.map((a) => a.id));
    const used: string[] = [];
    const api = {
      applyTargetAura: (id: string) => used.push(id),
      applySelfAura: (id: string) => used.push(id),
      roll: () => 0,
      hasSelfAura: () => false,
      hasTargetAura: () => false,
      addMana: () => 0,
    };
    const outcomes: HitOutcome[] = ['miss', 'hit', 'crit'];
    for (const b of warlockSets) {
      for (const s of destructionWarlock.spells) {
        for (const outcome of outcomes) b.hooks?.onSpellResolved?.({ spellId: s.id, outcome, damage: 1000 }, api);
      }
    }
    for (const id of used) expect(auraIds.has(id), id).toBe(true);
  });

  it('every bonus without a damage effect is a documented one', () => {
    expect(warlockSets.filter((b) => !hasEffect(b)).map(bonusKey)).toEqual(NO_DAMAGE_EFFECT);
  });

  it('with the default setPieces each active set bonus changes the damage of a scripted 60 s run', () => {
    const full = scriptedDamage(destructionWarlock);
    const active = warlockSets.filter((b) => b.pieces <= (destructionWarlock.setup.setPieces[b.setId] ?? 0));
    expect(active.map(bonusKey)).toEqual(['malefic-raiment:2', 'malefic-raiment:4']);
    for (const bonus of active) {
      const without = scriptedDamage({ ...destructionWarlock, sets: warlockSets.filter((b) => b !== bonus) });
      if (NO_DAMAGE_EFFECT.includes(bonusKey(bonus))) expect(without, bonusKey(bonus)).toBe(full);
      else expect(without, bonusKey(bonus)).not.toBe(full);
    }
    // The same through setPieces: 3 Malefic pieces drop the 4pc.
    const threePieces = scriptedDamage({
      ...destructionWarlock,
      setup: { ...destructionWarlock.setup, setPieces: { 'malefic-raiment': 3 } },
    });
    expect(threePieces).toBeLessThan(full);
  });

  it('Malefic 4pc: Shadow Bolt deals 6% more (one hit, same seed)', () => {
    const firstBolt = (spec: SpecData) => {
      const sim = new Simulation({ spec, target: NEVER_MISS, seed: 3, infiniteMana: true });
      sim.cast('shadow-bolt');
      sim.advanceTo(2500);
      return sim.log().find((e) => e.type === 'damage' && e.spellId === 'shadow-bolt');
    };
    const withSet = firstBolt(destructionWarlock);
    const without = firstBolt({ ...destructionWarlock, sets: [] });
    expect(withSet?.crit).toBe(without?.crit);
    // Both amounts are rounded to whole points: |round(1.06 x) - 1.06 x round(x)| <= 0.5 + 1.06 x 0.5.
    expect(Math.abs((withSet?.amount ?? 0) - 1.06 * (without?.amount ?? 0))).toBeLessThanOrEqual(0.5 + 1.06 * 0.5);
    expect(without?.amount).toBeGreaterThan(1000); // so 1.05 or 1.07 would be far outside that bound
  });
});

describe('default gear totals (wowsims tbc-new assets/database/db.json; arithmetic in docs/data-sources.md, Task 12b)', () => {
  const stats = destructionWarlock.setup.stats;

  it('gear stats before talents and multipliers', () => {
    // Spell damage: items 869 (63+46+46+81+34+46+50+62+26+34+42+43+236+37+23)
    //   + gems 67 (6+6+6+12+5+6+12+14) + socket bonuses 13 (Hood 5, Mantle 4, Belt 4)
    //   + enchants 168 (22+12+15+20+35+12+12+40) = 1117.
    expect(stats.spellPower).toBe(1117);
    // Nethervoid Cloak +53 shadow damage.
    expect(stats.shadowPower).toBe(53);
    expect(stats.firePower).toBe(0);
    // Crit: items 287 (32+24+13+24+19+30+37+19+24+29+22+14) + gems 37 (12+5+5+10+5)
    //   + Greater Inscription of the Orb 15 = 339.
    expect(stats.critRating).toBe(339);
    // Hit: items 180 (16+15+21+18+27+11+23+19+19+11) + Leggings socket bonus 2
    //   + Glyph of Power 14 = 196 (Gloves and Boots sockets are not matched: no bonus).
    expect(stats.hitRating).toBe(196);
    // Haste: Bracers of Nimble Thought 28 + Fetish of the Primal Gods 17.
    expect(stats.hasteRating).toBe(45);
    // Intellect: base 136 + items 291 (36+22+18+38+20+27+44+23+25+21+17) + Exceptional Stats 6.
    expect(stats.intellect).toBe(433);
    // Spirit: base 139 + Exceptional Stats 6.
    expect(stats.spirit).toBe(145);
    expect(stats.mp5).toBe(0);
    expect(stats.baseMana).toBe(2615);
  });

  it('derived totals with Fel Armor and the race/talent multipliers', () => {
    expect(destructionWarlock.setup.statMultipliers).toEqual({ intellect: 1.05, spirit: 0.95, maxMana: 1.03 });
    const d = computeStats(destructionWarlock.setup, destructionWarlock.statBonuses);
    const intellect = 433 * 1.05; // 454.65 (Expansive Mind)
    // (2615 + 20 + 15 x (454.65 - 20)) x 1.03 (Fel Intellect) = 9154.75 x 1.03 = 9429.3925
    expect(d.maxMana).toBeCloseTo(9429.3925, 9);
    expect(d.power.shadow).toBe(1117 + 130 + 53); // + Fel Armor 130
    expect(d.power.fire).toBe(1117 + 130);
    expect(d.critPct).toBeCloseTo(BASE_CRIT_PCT + 339 / CRIT_RATING_PER_PCT + intellect / INT_PER_CRIT_PCT, 9);
    expect(d.hitPct).toBeCloseTo(196 / HIT_RATING_PER_PCT, 9);
    expect(d.hastePct).toBeCloseTo(45 / HASTE_RATING_PER_PCT, 9);
  });

  it('Chaotic Skyfire Diamond is active (2 blue: two purple gems) and crits of Destruction spells deal x2.09', () => {
    expect(destructionWarlock.setup.modifiers).toEqual(gems[34220]?.metaModifiers);
    // Same seed, forced crit vs forced non-crit: identical draws, so the ratio is the multiplier.
    const firstHit = (critPctDelta: number, spellId: string, castMs: number) => {
      const spec: SpecData = {
        ...destructionWarlock,
        modifiers: [...destructionWarlock.modifiers, { spellIds: [spellId], critPctDelta }],
      };
      const sim = new Simulation({ spec, target: NEVER_MISS, seed: 5, infiniteMana: true });
      sim.cast(spellId);
      sim.advanceTo(castMs);
      return sim.log().find((e) => e.type === 'damage' && e.spellId === spellId)?.amount ?? 0;
    };
    // wowsims: (1.5 x 1.03 - 1) x (1 + Ruin 1.0) + 1 = 2.09. Both amounts are rounded to whole
    // points: |round(2.09 x) - 2.09 x round(x)| <= 0.5 + 2.09 x 0.5. With hits above 1000, 2.045
    // (meta without the Ruin term) or 2.0 (no meta) would miss that bound by 40+ points.
    for (const [spellId, castMs] of [['shadow-bolt', 2500], ['shadowburn', 0]] as const) {
      const crit = firstHit(100, spellId, castMs);
      const hit = firstHit(-100, spellId, castMs);
      expect(hit, spellId).toBeGreaterThan(1000);
      expect(Math.abs(crit - 2.09 * hit), spellId).toBeLessThanOrEqual(0.5 + 2.09 * 0.5);
    }
  });

  it('a Simulation built from destructionWarlock with the default gear runs a scripted 60 s fight', () => {
    expect(scriptedDamage(destructionWarlock)).toBeGreaterThan(0);
  });
});
