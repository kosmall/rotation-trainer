// Curse of the Elements: its four Forever ranks, what it raises, and builds that leave it out.
import { describe, expect, it } from 'vitest';
import { loadOrder, loadVariant, VARIANT_IDS, type BuildVariant } from '../../src/forever/builds';
import { loadParams } from '../../src/forever/data/load';
import { simulatePull } from '../../src/forever/fight';
import { rotationSpec } from '../../src/forever/rotation-spec';
import { rankAt } from '../../src/forever/spells';

describe('Curse of the Elements ranks (Wowhead Forever 440892, 1311676, 1311677, 1311680)', () => {
  it.each([
    [20, 0.04, 50],
    [29, 0.04, 50],
    [30, 0.06, 100],
    [40, 0.08, 150],
    [49, 0.08, 150],
    [50, 0.1, 200],
    [59, 0.1, 200],
  ])('level %i: +%f damage taken for %i mana', (level, taken, mana) => {
    const r = rankAt('curse_of_elements', 'max', level)!;
    expect(r.damageTaken).toBeCloseTo(taken, 6);
    expect(r.mana).toBe(mana);
  });
  it('is not known before level 20', () => {
    expect(rankAt('curse_of_elements', 'max', 19)).toBeUndefined();
  });
});

describe('Curse of the Elements and the demon', () => {
  /** The demon's hits of a kind that land after the curse, in a pull with or without the curse. */
  const hit = (pet: 'imp' | 'succubus', kind: string, curse: boolean): number => {
    const variant: BuildVariant = { ...loadVariant('DEMO_PACT_R1'), pet, sacrificed: null, pet_rules: undefined };
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulatePull({ variant, level: 50, profile: 'average', params: loadParams({ use_curse_of_elements: curse, mob_hp_mult: 3 }), trace: true, ranks: { demonic_brand: 3 } }, seed);
      const from = curse ? r.trace.findIndex((l) => l.includes('curse_of_elements') && l.includes('lands')) : 0;
      if (from < 0) continue;
      const line = r.trace.slice(from).find((l) => l.includes(` pet ${kind} `));
      if (line) return Number(line.split(` pet ${kind} `)[1]);
    }
    throw new Error(`no ${kind} hit of the ${pet}`);
  };
  const ratio = (pet: 'imp' | 'succubus', kind: string): number => hit(pet, kind, true) / hit(pet, kind, false);

  it('raises the demon\'s magic damage: Firebolt, Lash of Pain and the brand', () => {
    expect(ratio('imp', 'firebolt')).toBeCloseTo(1.1, 3);
    expect(ratio('imp', 'brand')).toBeCloseTo(1.1, 3);
    expect(ratio('succubus', 'lash')).toBeCloseTo(1.1, 3);
    expect(ratio('succubus', 'brand')).toBeCloseTo(1.1, 3);
  });
  it('does not raise the demon\'s melee attacks', () => {
    expect(ratio('succubus', 'melee')).toBeCloseTo(1, 3);
  });
});

describe('builds without Curse of the Elements', () => {
  const BASES = ['AFF_DRAINTANK', 'DT_SS', 'DT_SS_WRACK_70', 'DT_SS_WRACK_50', 'DEMO_PACT_R1', 'DEMO_PACT_VIDEO'];
  it('each sits right after its base build and differs only in the curse', () => {
    for (const base of BASES) {
      const id = `${base}_NOCOE`;
      expect(VARIANT_IDS[VARIANT_IDS.indexOf(base) + 1], id).toBe(id);
      const { coe, ...rest } = loadVariant(id);
      expect(coe, id).toBe(false);
      expect({ ...rest, id: base }, id).toEqual(loadVariant(base));
      expect(loadOrder(rest.order), id).toEqual(loadOrder(loadVariant(base).order));
    }
  });
  it('never casts the curse, its base does', () => {
    const casts = (id: string): number =>
      simulatePull({ variant: loadVariant(id), level: 50, profile: 'average', params: loadParams({ mob_hp_mult: 2 }), trace: true }, 1).trace.filter((l) => l.includes('cast curse_of_elements ')).length;
    for (const base of BASES) {
      expect(casts(base), base).toBe(1);
      expect(casts(`${base}_NOCOE`), base).toBe(0);
    }
  });
  it('its rotation description has every step of the base except the curse', () => {
    const p = loadParams();
    const ids = (id: string): string[] => rotationSpec(loadVariant(id), p).steps.map((s) => s.id);
    for (const base of BASES) expect(ids(`${base}_NOCOE`), base).toEqual(ids(base).filter((s) => s !== 'curse_of_elements'));
  });
});
