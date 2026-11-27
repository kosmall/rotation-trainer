// "Mój sprzęt": the items of the wowsims addon export, their stats read from Wowhead tooltips, and the totals the
// simulation uses as a gear profile. Framework-free (the fetch function is injected).

export const SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'] as const;
export type Slot = (typeof SLOTS)[number];

export interface ItemStats {
  stamina: number;
  intellect: number;
  spirit: number;
  armor: number;
  /** "Increases damage and healing done by magical spells". */
  spellPower: number;
  /** "Increases damage done by Shadow spells". */
  shadowSpellPower: number;
  critPct: number;
  hitPct: number;
}
const ZERO: ItemStats = { stamina: 0, intellect: 0, spirit: 0, armor: 0, spellPower: 0, shadowSpellPower: 0, critPct: 0, hitPct: 0 };

export interface GearItem {
  id: number;
  slot: Slot;
  /** null when the item could not be read. */
  name: string | null;
  stats: ItemStats;
  /** Effect lines the simulator does not model. */
  unmodelled: string[];
  error?: string;
}
export interface MyGear {
  items: GearItem[];
}
/** The gear profile the simulation reads (constant, not scaled by level). */
export type GearTotals = ItemStats;

/** The crit chance of the `average` profile: there is no base crit source, so items add to it. */
export const BASE_CRIT_PCT = 5;

const text = (html: string): string[] =>
  html
    .replace(/<!--.*?-->/g, '')
    .replace(/<br\s*\/?>|<\/tr>|<\/td>|<\/th>|<\/div>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const num = (s: string | undefined): number => Number(s ?? 0);

/** One item from a Wowhead tooltip answer (`{name, tooltip}`); an error answer gives an item with `error`. */
export function parseTooltip(id: number, slot: Slot, json: unknown): GearItem {
  const o = (json ?? {}) as { name?: unknown; tooltip?: unknown; error?: unknown };
  if (typeof o.tooltip !== 'string' || typeof o.name !== 'string') return { id, slot, name: null, stats: { ...ZERO }, unmodelled: [], error: typeof o.error === 'string' ? o.error : 'no tooltip' };
  const stats: ItemStats = { ...ZERO };
  const unmodelled: string[] = [];
  for (const line of text(o.tooltip)) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\+(\d+) (Stamina|Intellect|Spirit|Armor)$/))) stats[(m[2] as string).toLowerCase() as 'stamina'] += num(m[1]);
    else if ((m = line.match(/^(\d+) Armor$/))) stats.armor += num(m[1]);
    else if ((m = line.match(/^Equip: Increases damage and healing done by magical spells and effects by up to (\d+)\./))) stats.spellPower += num(m[1]);
    else if ((m = line.match(/^Equip: Increases damage done by Shadow spells and effects by up to (\d+)\./))) stats.shadowSpellPower += num(m[1]);
    else if ((m = line.match(/^Equip: Improves your chance to get a critical strike with spells by (\d+(?:\.\d+)?)%/))) stats.critPct += num(m[1]);
    else if ((m = line.match(/^Equip: Improves your chance to hit with spells by (\d+(?:\.\d+)?)%/))) stats.hitPct += num(m[1]);
    else if (/^(Equip|Use|Chance on hit):/.test(line)) unmodelled.push(line);
  }
  return { id, slot, name: o.name, stats, unmodelled };
}

export function totalsOf(g: MyGear): GearTotals {
  const t: GearTotals = { ...ZERO };
  for (const i of g.items) for (const k of Object.keys(t) as (keyof ItemStats)[]) t[k] += i.stats[k];
  t.critPct += BASE_CRIT_PCT;
  return t;
}

/** Item ids of the export by slot (null = empty slot), or null when the export has no items. */
export function gearIdsOf(raw: unknown): (number | null)[] | null {
  const items = (raw as { gear?: { items?: unknown } } | null)?.gear?.items;
  if (!Array.isArray(items)) return null;
  const ids = items.slice(0, SLOTS.length).map((x) => (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'number' ? (x as { id: number }).id : null));
  return ids.some((i) => i !== null) ? ids : null;
}

/** Fetches every item; one that fails stays in the list with an error and zero stats. */
export async function fetchGear(ids: readonly (number | null)[], fetcher: (id: number) => Promise<unknown>): Promise<MyGear> {
  const items = await Promise.all(
    ids.map(async (id, k): Promise<GearItem | null> => {
      if (id === null) return null;
      const slot = SLOTS[k] as Slot;
      try {
        return parseTooltip(id, slot, await fetcher(id));
      } catch (e) {
        return { id, slot, name: null, stats: { ...ZERO }, unmodelled: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return { items: items.filter((i): i is GearItem => i !== null) };
}

/** The real fetcher: Wowhead's tooltip service (Forever and Classic ids; it allows requests from any origin). */
export const wowheadFetcher = async (id: number): Promise<unknown> => {
  const r = await fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}`);
  if (!r.ok && r.status !== 404) throw new Error(`Wowhead: HTTP ${r.status}`);
  return r.json();
};

export const GEAR_STORAGE_KEY = 'wow-forever-sim:gear:v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadGear(storage: Store | null): MyGear | null {
  try {
    const raw = storage?.getItem(GEAR_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(o.items)) return null;
    const items = o.items.filter((i): i is GearItem => !!i && typeof i.id === 'number' && SLOTS.includes(i.slot) && !!i.stats);
    return items.length > 0 ? { items } : null;
  } catch {
    return null;
  }
}

export function saveGear(storage: Store | null, gear: MyGear | null): void {
  try {
    storage?.setItem(GEAR_STORAGE_KEY, gear ? JSON.stringify(gear) : '');
  } catch {
    /* private mode: not remembered */
  }
}
