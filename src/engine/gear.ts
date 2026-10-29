import type {
  CharacterSetup,
  EnchantDef,
  EquippedItem,
  GemColor,
  GemDef,
  ItemDef,
  RawStats,
  SpellModifier,
} from './types';

type PrimaryColor = 'red' | 'blue' | 'yellow';

/** Which gem colors satisfy a socket of the given color. */
const SOCKET_MATCH: Record<GemColor, readonly GemColor[]> = {
  red: ['red', 'orange', 'purple'],
  blue: ['blue', 'purple', 'green'],
  yellow: ['yellow', 'orange', 'green'],
  meta: ['meta'],
  orange: ['orange'],
  purple: ['purple'],
  green: ['green'],
  prismatic: ['red', 'blue', 'yellow', 'orange', 'purple', 'green', 'prismatic'],
};

/** Primary colors a gem contributes toward a meta gem's requirements. */
const PRIMARY_COLORS: Partial<Record<GemColor, readonly PrimaryColor[]>> = {
  red: ['red'],
  blue: ['blue'],
  yellow: ['yellow'],
  orange: ['red', 'yellow'],
  purple: ['red', 'blue'],
  green: ['blue', 'yellow'],
};

function addStats(target: RawStats, extra: Partial<RawStats> | undefined): void {
  if (!extra) return;
  for (const key of Object.keys(extra) as (keyof RawStats)[]) {
    target[key] += extra[key] ?? 0;
  }
}

function pushUnique(list: number[], id: number): void {
  if (!list.includes(id)) list.push(id);
}

/**
 * Builds a CharacterSetup from equipped item ids. Ids missing from the tables are
 * skipped and reported in `unknown`. An unknown item skips its whole entry (its
 * enchant and gems are not applied). Gems beyond an item's sockets are ignored
 * entirely; an unknown gem inside a socket leaves that socket unfilled.
 */
export function buildSetup(p: {
  baseStats: RawStats;
  equipped: EquippedItem[];
  items: Record<number, ItemDef>;
  gems: Record<number, GemDef>;
  enchants: Record<number, EnchantDef>;
}): {
  setup: CharacterSetup;
  unknown: { items: number[]; gems: number[]; enchants: number[] };
} {
  const stats: RawStats = { ...p.baseStats };
  const setPieces: Record<string, number> = {};
  const unknown = { items: [] as number[], gems: [] as number[], enchants: [] as number[] };
  const metaGems: GemDef[] = [];
  const colorCounts: Record<PrimaryColor, number> = { red: 0, blue: 0, yellow: 0 };

  for (const entry of p.equipped) {
    const item = p.items[entry.id];
    if (!item) {
      pushUnique(unknown.items, entry.id);
      continue;
    }
    addStats(stats, item.stats);
    if (item.setId !== undefined) {
      setPieces[item.setId] = (setPieces[item.setId] ?? 0) + 1;
    }

    if (entry.enchant !== undefined) {
      const enchant = p.enchants[entry.enchant];
      if (enchant) addStats(stats, enchant.stats);
      else pushUnique(unknown.enchants, entry.enchant);
    }

    const sockets = item.sockets ?? [];
    let allMatched = sockets.length > 0;
    sockets.forEach((socketColor, i) => {
      const gemId = entry.gems?.[i];
      if (gemId === undefined) {
        allMatched = false;
        return;
      }
      const gem = p.gems[gemId];
      if (!gem) {
        pushUnique(unknown.gems, gemId);
        allMatched = false;
        return;
      }
      addStats(stats, gem.stats);
      if (!SOCKET_MATCH[socketColor].includes(gem.color)) allMatched = false;
      if (gem.color === 'meta') metaGems.push(gem);
      for (const c of PRIMARY_COLORS[gem.color] ?? []) colorCounts[c] += 1;
    });
    if (allMatched) addStats(stats, item.socketBonus);
  }

  const modifiers: SpellModifier[] = [];
  for (const meta of metaGems) {
    const requires = meta.metaRequires ?? {};
    const met = (Object.keys(requires) as PrimaryColor[]).every(
      (c) => colorCounts[c] >= (requires[c] ?? 0),
    );
    if (met && meta.metaModifiers) modifiers.push(...meta.metaModifiers);
  }

  return { setup: { stats, setPieces, modifiers }, unknown };
}
