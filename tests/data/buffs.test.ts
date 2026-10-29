import { describe, expect, it } from 'vitest';
import { destructionWarlock } from '../../src/data/classes/warlock/destruction';
import { commonBuffs } from '../../src/data/common/buffs';
import { CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { BuffDef } from '../../src/data/types';
import { combineStatMultipliers, computeStats } from '../../src/engine/stats';
import type { CharacterSetup } from '../../src/engine/types';

const byId = (id: string): BuffDef => {
  const buff = commonBuffs.find((b) => b.id === id);
  if (!buff) throw new Error(`no buff ${id}`);
  return buff;
};

const GROUPS = ['raid', 'party', 'individual', 'consumable', 'debuff', 'item', 'warlock'];

/** True when an effect value carries something (a non-empty object or array, or a function). */
const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'object' && v !== null ? Object.keys(v).length > 0 : v !== undefined;

/** Derived stats of a bare setup with one buff's flat bonuses and multipliers applied. */
function statsWith(buff: BuffDef | undefined, setup: CharacterSetup = destructionWarlock.setup) {
  const derivedSetup: CharacterSetup = {
    ...setup,
    statMultipliers: combineStatMultipliers(setup.statMultipliers, buff?.effect.statMultipliers),
  };
  return computeStats(derivedSetup, buff?.effect.statBonuses ?? {});
}

const critDelta = (buff: BuffDef): number =>
  (buff.effect.modifiers ?? []).reduce((sum, m) => sum + (m.critPctDelta ?? 0), 0);

describe('common buff catalog', () => {
  it('ids are unique; every buff has name, icon, group and a non-empty effect', () => {
    const ids = commonBuffs.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(commonBuffs.length).toBeGreaterThanOrEqual(10);
    for (const b of commonBuffs) {
      expect(b.id, 'id').toMatch(/^[a-z0-9-]+$/);
      expect(b.name.length, `${b.id} name`).toBeGreaterThan(0);
      expect(b.icon, `${b.id} icon`).toMatch(/^[a-z0-9_]+$/);
      expect(b.wowheadId, `${b.id} wowheadId`).toBeGreaterThan(0);
      expect(GROUPS, `${b.id} group`).toContain(b.group);
      const parts = Object.values(b.effect).filter(nonEmpty);
      expect(parts.length, `${b.id} effect`).toBeGreaterThan(0);
    }
  });

  it('static buffs carry no timed field, timed ones carry both selfAura and timed', () => {
    for (const b of commonBuffs) {
      if (b.timed) {
        expect(b.effect.selfAura, `${b.id} selfAura`).toBeDefined();
        expect(b.timed.durationSec, `${b.id} duration`).toBeGreaterThan(0);
        expect(b.timed.defaultStartSec, `${b.id} start`).toBeGreaterThanOrEqual(0);
      } else {
        expect(b.effect.selfAura, `${b.id} selfAura without timed`).toBeUndefined();
      }
    }
    // Task 6 adds only static buffs (the timed ones come with Task 8).
    for (const id of ['arcane-brilliance', 'blessing-of-kings', 'mana-spring-totem', 'moonkin-aura']) {
      expect(byId(id).timed).toBeUndefined();
    }
  });

  it('every BuffDef has a non-empty description and source', () => {
    for (const b of commonBuffs) {
      expect(b.description.trim().length, `${b.id} description`).toBeGreaterThan(0);
      expect(b.source.trim().length, `${b.id} source`).toBeGreaterThan(0);
    }
  });

  it('the catalog and its effects are frozen (shared data)', () => {
    expect(Object.isFrozen(commonBuffs)).toBe(true);
    for (const b of commonBuffs) {
      expect(Object.isFrozen(b), b.id).toBe(true);
      expect(Object.isFrozen(b.effect), `${b.id} effect`).toBe(true);
    }
  });

  it('Mana Spring Totem gives 50 mp5 (20 mana per 2 s)', () => {
    const buff = byId('mana-spring-totem');
    expect(buff.effect.statBonuses).toEqual({ mp5: 50 });
    const gain = statsWith(buff).mp5RegenPerSec - statsWith(undefined).mp5RegenPerSec;
    // The engine's regen tick is 2 s (sim.ts MANA_TICK_MS): 10 mana/s x 2 = 20 per tick (log checkpoint).
    expect(gain * 2).toBeCloseTo(20, 10);
  });

  it('Blessing of Kings multiplies intellect and spirit by 1.1', () => {
    const buff = byId('blessing-of-kings');
    expect(buff.effect.statMultipliers).toEqual({ intellect: 1.1, spirit: 1.1 });
    expect(buff.effect.statBonuses).toBeUndefined();
  });

  it('flat Int/Spirit buffs are added first, then every multiplier (Gnome x1.05, Kings x1.1) scales the total', () => {
    const setup = destructionWarlock.setup;
    const bonuses = {
      intellect: 40 + 18, // Arcane Brilliance + improved Gift of the Wild
      spirit: 18 + 50, // improved Gift of the Wild + Prayer of Spirit
    };
    const mults = combineStatMultipliers(
      setup.statMultipliers,
      byId('blessing-of-kings').effect.statMultipliers,
    );
    const stats = computeStats({ ...setup, statMultipliers: mults }, bonuses);
    const expectedInt = (433 + 58) * 1.05 * 1.1;
    const expectedSpirit = (145 + 68) * 0.95 * 1.1;
    // maxMana = (2615 + 20 + 15 x (int - 20)) x 1.03 (Fel Intellect)
    expect(stats.maxMana).toBeCloseTo((2615 + 20 + 15 * (expectedInt - 20)) * 1.03, 6);
    // Each catalog value feeds exactly that sum.
    expect(byId('arcane-brilliance').effect.statBonuses).toEqual({ intellect: 40 });
    expect(byId('gift-of-the-wild').effect.statBonuses).toEqual({ intellect: 18, spirit: 18 });
    expect(byId('prayer-of-spirit').effect.statBonuses).toEqual({ spirit: 50 });
    // Spirit regen uses the multiplied spirit and intellect.
    expect(stats.spiritRegenPerSec).toBeCloseTo(0.001 + expectedSpirit * Math.sqrt(expectedInt) * 0.009327, 9);
  });

  it('Blessing of Wisdom gives 49 mp5 (improved rank)', () => {
    expect(byId('blessing-of-wisdom').effect.statBonuses).toEqual({ mp5: 49 });
  });

  it('Moonkin Aura gives +5% spell crit on every spell plus 20 crit rating (Idol of the Raven Goddess)', () => {
    const buff = byId('moonkin-aura');
    expect(critDelta(buff)).toBe(5);
    for (const m of buff.effect.modifiers ?? []) {
      expect(m.spellIds, 'applies to every spell').toBeUndefined();
      expect(m.schools, 'applies to every school').toBeUndefined();
    }
    expect(buff.effect.statBonuses).toEqual({ critRating: 20 });
    const gain = statsWith(buff).critPct - statsWith(undefined).critPct;
    expect(gain).toBeCloseTo(20 / CRIT_RATING_PER_PCT, 10);
  });

  it('Wrath of Air Totem gives 121 spell power (with Improved Wrath of Air Totem)', () => {
    const buff = byId('wrath-of-air-totem');
    expect(buff.effect.statBonuses).toEqual({ spellPower: 121 });
    expect(statsWith(buff).power.shadow - statsWith(undefined).power.shadow).toBe(121);
  });

  it('Totem of Wrath gives exactly +3% spell crit and +3% spell hit', () => {
    const buff = byId('totem-of-wrath');
    expect(critDelta(buff)).toBe(3);
    expect(statsWith(buff).hitPct - statsWith(undefined).hitPct).toBeCloseTo(3, 10);
  });

  it('Inspiring Presence gives exactly +1% spell hit (1% = HIT_RATING_PER_PCT rating)', () => {
    const buff = byId('inspiring-presence');
    expect(statsWith(buff).hitPct - statsWith(undefined).hitPct).toBeCloseTo(1, 10);
    expect(buff.effect.modifiers).toBeUndefined();
  });

  it('groups follow wowsims RaidBuffs / PartyBuffs / IndividualBuffs', () => {
    const groups = Object.fromEntries(commonBuffs.map((b) => [b.id, b.group]));
    expect(groups).toEqual({
      'arcane-brilliance': 'raid',
      'gift-of-the-wild': 'raid',
      'prayer-of-spirit': 'raid',
      'blessing-of-kings': 'individual',
      'blessing-of-wisdom': 'individual',
      'moonkin-aura': 'party',
      'mana-spring-totem': 'party',
      'wrath-of-air-totem': 'party',
      'totem-of-wrath': 'party',
      'inspiring-presence': 'party',
    });
  });

  it('no static buff of this catalog duplicates a stat effect already in the destruction spec', () => {
    // The spec's own setup carries Expansive Mind, Demonic Embrace and Fel Intellect (not Kings),
    // and its statBonuses carry Fel Armor (+130 spell power), not a raid buff.
    expect(destructionWarlock.setup.statMultipliers).toEqual({ intellect: 1.05, spirit: 0.95, maxMana: 1.03 });
    expect(destructionWarlock.statBonuses).toEqual({ spellPower: 130 });
  });
});
