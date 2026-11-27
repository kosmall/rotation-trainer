import { describe, expect, it } from 'vitest';
import { GEAR_STORAGE_KEY, fetchGear, gearIdsOf, loadGear, parseTooltip, saveGear, totalsOf, type MyGear } from '../../src/forever/web/gear';
import i253981 from './fixtures/items/253981.json';
import i7057 from './fixtures/items/7057.json';
import i5246 from './fixtures/items/5246.json';
import i280766 from './fixtures/items/280766.json';
import i271096 from './fixtures/items/271096.json';
import i271670 from './fixtures/items/271670.json';
import i4505 from './fixtures/items/4505.json';
const FIXTURES: Record<number, unknown> = { 253981: i253981, 7057: i7057, 5246: i5246, 280766: i280766, 271096: i271096, 271670: i271670, 4505: i4505 };
const fx = (id: number): unknown => FIXTURES[id] ?? { error: 'Entity not found' };
const PAYLOAD = { class: 'warlock', gear: { items: [{ id: 253981 }, { id: 281321 }, { id: 7057 }, null, null, { id: 271096 }, null, null, { id: 4505 }, null, { id: 271670 }, null, { id: 280766 }, null, null, null, { id: 5246 }] } };

describe('item tooltips', () => {
  it('reads stats of a plain item', () => {
    const i = parseTooltip(253981, 'head', fx(253981));
    expect(i.name).toBe('Filigreed Shadow Circlet');
    expect(i.stats).toMatchObject({ stamina: 12, shadowSpellPower: 14, armor: 38, spellPower: 0 });
  });
  it('reads generic spell power and intellect', () => {
    expect(parseTooltip(7057, 'shoulder', fx(7057)).stats).toMatchObject({ intellect: 11, spellPower: 8 });
  });
  it('adds base and bonus armor', () => {
    expect(parseTooltip(271096, 'wrist', fx(271096)).stats.armor).toBe(45);
  });
  it('lists on-use effects as not modelled and has no stats', () => {
    const i = parseTooltip(280766, 'trinket1', fx(280766));
    expect(i.unmodelled.join(' ')).toMatch(/Use: Reach into the bag/);
    expect(i.stats).toMatchObject({ stamina: 0, spellPower: 0 });
  });
  it('a broken answer gives an error item, not a throw', () => {
    const i = parseTooltip(1, 'head', { error: 'Entity not found' });
    expect(i.name).toBeNull();
    expect(i.error).toMatch(/not found/);
  });
});

describe('gear', () => {
  it('finds the ids of the export by slot', () => {
    const ids = gearIdsOf(PAYLOAD);
    expect(ids).toHaveLength(17);
    expect(ids?.[0]).toBe(253981);
    expect(ids?.[3]).toBeNull();
    expect(gearIdsOf({ class: 'warlock' })).toBeNull();
    expect(gearIdsOf({ gear: { items: [null, null] } })).toBeNull();
  });
  it('fetches, keeps going after a failure and sums', async () => {
    const ids = gearIdsOf(PAYLOAD) as (number | null)[];
    const gear = await fetchGear(ids, async (id) => {
      if (id === 281321) throw new Error('offline');
      return fx(id);
    });
    expect(gear.items).toHaveLength(8);
    expect(gear.items.find((i) => i.id === 281321)?.error).toMatch(/offline/);
    expect(gear.items.find((i) => i.id === 271096)?.slot).toBe('wrist');
    const t = totalsOf(gear);
    expect(t.stamina).toBe(12 + 11 + 5 + 2);
    expect(t.shadowSpellPower).toBe(14);
    expect(t.spellPower).toBe(8 + 3 + 5 + 2);
    expect(t.armor).toBe(38 + 45 + 38 + 36 + 0 + 0);
    expect(t.critPct).toBe(5);
    expect(t.hitPct).toBe(0);
  });
  it('stores and restores, ignoring corrupt data', async () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const gear: MyGear = await fetchGear([253981], async (id) => fx(id));
    saveGear(st, gear);
    expect(loadGear(st)).toEqual(gear);
    st.setItem(GEAR_STORAGE_KEY, '{nope');
    expect(loadGear(st)).toBeNull();
    saveGear(st, null);
    expect(loadGear(st)).toBeNull();
  });
});
