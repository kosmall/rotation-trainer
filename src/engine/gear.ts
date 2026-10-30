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

/**
 * Which gem colors satisfy a socket of the given color for its socket bonus (wowsims tbc-new
 * sim/core/database.go `ColorIntersects`): a primary socket takes its color and the two secondary
 * colors that contain it, and a prismatic gem matches every colored socket. A meta socket only
 * takes a meta gem (a prismatic gem does not even fit there: `gemFitsSocket`). Items only have
 * meta, red, blue and yellow sockets; the other rows are kept for completeness.
 */
const SOCKET_MATCH: Record<GemColor, readonly GemColor[]> = {
  red: ['red', 'orange', 'purple', 'prismatic'],
  blue: ['blue', 'purple', 'green', 'prismatic'],
  yellow: ['yellow', 'orange', 'green', 'prismatic'],
  meta: ['meta'],
  orange: ['orange', 'prismatic'],
  purple: ['purple', 'prismatic'],
  green: ['green', 'prismatic'],
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

/**
 * Whether a gem of `gem` color can be put into a socket of `socket` color at all. In the game a
 * meta gem only fits a meta socket and a meta socket only takes a meta gem; every other gem
 * (prismatic included) fits every other socket, matching its color or not.
 */
export function gemFitsSocket(gem: GemColor, socket: GemColor): boolean {
  return (gem === 'meta') === (socket === 'meta');
}

/** Whether a gem of `gem` color counts as matching a `socket` socket for the socket bonus. */
export function socketMatches(socket: GemColor, gem: GemColor): boolean {
  return SOCKET_MATCH[socket].includes(gem);
}

/** Red, blue and yellow gem counts toward meta requirements (secondary colors count for both). */
export type MetaColorCounts = Record<PrimaryColor, number>;

/** Adds one gem's color to the meta requirement counts (meta and prismatic gems add nothing). */
export function countGemColor(counts: MetaColorCounts, color: GemColor): void {
  for (const c of PRIMARY_COLORS[color] ?? []) counts[c] += 1;
}

/**
 * Whether a meta gem's requirement holds for the given counts: every `metaRequires` minimum, and
 * for `metaCompare` strictly more `more` gems than `than` gems. An inactive meta gem gives nothing
 * in the game: no stats, no effect (wowsims tbc-new sim/core/database.go
 * `ItemEquipmentGemAndEnchantStats` skips a disabled meta gem).
 */
export function metaRequirementMet(gem: GemDef, counts: MetaColorCounts): boolean {
  const requires = gem.metaRequires ?? {};
  const minimums = (Object.keys(requires) as PrimaryColor[]).every((c) => counts[c] >= (requires[c] ?? 0));
  const compare = gem.metaCompare === undefined || counts[gem.metaCompare.more] > counts[gem.metaCompare.than];
  return minimums && compare;
}

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
 * entirely; gem id 0 is an empty socket (the WowSimsExporter convention); an unknown
 * gem inside a socket leaves that socket unfilled. A gem that does not fit its socket
 * (`gemFitsSocket`: a meta gem outside a meta socket, any other gem in a meta socket)
 * counts as an empty socket: no stats, no color, no socket bonus.
 * Meta gems give their stats and `metaModifiers` only when their requirement holds
 * (`metaRequirementMet`) over the colors of every socketed non-meta gem; an inactive
 * meta gem still fills its meta socket for the item's socket bonus.
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
  const colorCounts: MetaColorCounts = { red: 0, blue: 0, yellow: 0 };

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
      if (gemId === undefined || gemId === 0) {
        allMatched = false;
        return;
      }
      const gem = p.gems[gemId];
      if (!gem) {
        pushUnique(unknown.gems, gemId);
        allMatched = false;
        return;
      }
      if (!gemFitsSocket(gem.color, socketColor)) {
        allMatched = false;
        return;
      }
      if (!socketMatches(socketColor, gem.color)) allMatched = false;
      if (gem.color === 'meta') {
        // Stats and modifiers once every gem has been counted (the requirement may not hold).
        metaGems.push(gem);
        return;
      }
      addStats(stats, gem.stats);
      countGemColor(colorCounts, gem.color);
    });
    if (allMatched) addStats(stats, item.socketBonus);
  }

  const modifiers: SpellModifier[] = [];
  for (const meta of metaGems) {
    if (!metaRequirementMet(meta, colorCounts)) continue;
    addStats(stats, meta.stats);
    if (meta.metaModifiers) modifiers.push(...meta.metaModifiers);
  }

  return { setup: { stats, setPieces, modifiers }, unknown };
}
