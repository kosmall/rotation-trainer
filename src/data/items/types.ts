import type { EnchantDef, GemDef, ItemDef, RawStats } from '../../engine/types';

/**
 * The 17 equipment slots, in WowSimsExporter / wowsims `ItemSlot` order (proto/common.proto):
 * head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet, finger1, finger2, trinket1,
 * trinket2, mainHand, offHand, ranged.
 */
export type SlotKey =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'back'
  | 'chest'
  | 'wrist'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'finger1'
  | 'finger2'
  | 'trinket1'
  | 'trinket2'
  | 'mainHand'
  | 'offHand'
  | 'ranged';

/**
 * The slot an item record stores: a slot key, except that rings and trinkets have one logical slot
 * (`finger`, `trinket`) and fit either of the two slots. Same names as the stage 1 `ItemDef.slot`.
 */
export type ItemSlot = Exclude<SlotKey, 'finger1' | 'finger2' | 'trinket1' | 'trinket2'> | 'finger' | 'trinket';

export type PrimaryGemColor = 'red' | 'blue' | 'yellow';

export interface ItemRecord extends ItemDef {
  slot: ItemSlot;
  /** Icon name on the Wowhead CDN; committed as public/icons/items/<icon>.jpg (npm run icons). */
  icon: string;
  /** wowsims content phase (1-5). */
  phase: number;
  /** `setId` is the slug of this name (e.g. 'malefic-raiment'), the key of `SetBonusDef.setId`. */
  setName?: string;
  /** Unique (one per character). */
  unique?: boolean;
  /** Faction-only item (db.json `factionRestriction`: 1 Alliance, 2 Horde). */
  faction?: 'alliance' | 'horde';
  /** Profession needed to equip it (proto/common.proto `Profession` id, e.g. 11 Tailoring). */
  requiredProfession?: number;
  /** Staff: occupies the main hand and leaves the off hand empty. */
  twoHand?: boolean;
  /**
   * Short readable text of the item's on-use, proc and equip effects (wowsims `itemEffects`) that
   * are NOT structured below: one line per effect. An effect that is in `useEffects` or
   * `procEffects` is never also listed here (docs/data-sources.md, "Part F: gear item effects").
   */
  effects?: string[];
  /** On-use stat buffs the trainer can model (absent when none). */
  useEffects?: ItemUseEffect[];
  /** Proc stat buffs the trainer can model, with their trigger (absent when none). */
  procEffects?: ItemProcEffect[];
}

/**
 * The stats of an item effect's buff: only modelled `RawStats` keys (never `baseMana`), all
 * positive. A wowsims buff that also gives healing power (stat 4, "damage and healing") keeps only
 * its spell damage; a buff with any other unmodelled stat stays text.
 */
export type ItemEffectStats = Partial<Omit<RawStats, 'baseMana'>>;

/** An on-use stat buff (wowsims `itemEffects[].onUse`). */
export interface ItemUseEffect {
  /** The buff's name (db.json `buffName` without its "(spell id)" suffix). */
  buffName: string;
  /** Wowhead (TBC) spell id of the buff (db.json `buffId`). */
  buffId: number;
  stats: ItemEffectStats;
  durationMs: number;
  /** The item's own cooldown. */
  cooldownMs: number;
  /**
   * Shared cooldown category (db.json `onUse.categoryId`, e.g. 1141 the on-use trinkets) and the
   * time it blocks the category: `categoryCooldownMs`, or the buff's duration when that is not
   * positive (wowsims sim/common/shared/shared_utils.go `sharedCooldown`). Absent: no category.
   */
  group?: { id: number; ms: number };
}

/**
 * What a proc rolls on (one roll per event, only while its internal cooldown is not running):
 * - `cast`: every completed player spell, whatever its outcome (a miss too); not items, not DoT
 *   ticks (wowsims `CallbackOnCastComplete`).
 * - `hit`: a landed (hit or crit) offensive player spell: one with a direct damage part or one
 *   applying a DoT on the target; not a miss, not Life Tap or Curse of the Elements (the stage F
 *   Band rule, `BAND_PROC_SPELL_IDS`; wowsims `CallbackOnSpellHitDealt` + `OutcomeLanded`).
 * - `crit`: a critical hit of a player spell (wowsims `OutcomeCrit`).
 */
export type ItemProcTrigger = 'cast' | 'hit' | 'crit';

/** A proc stat buff (wowsims `itemEffects[].proc` + the item's Go registration for the trigger). */
export interface ItemProcEffect {
  /** The buff's name (db.json `buffName` without its "(spell id)" suffix). */
  buffName: string;
  /** Wowhead (TBC) spell id of the buff (db.json `buffId`). */
  buffId: number;
  stats: ItemEffectStats;
  durationMs: number;
  /** Chance per roll, in (0, 1] (db.json `proc.procChance`). */
  chance: number;
  /** Internal cooldown from a proc (db.json `proc.icdMs`); 0: none. */
  icdMs: number;
  trigger: ItemProcTrigger;
}

export interface GemRecord extends GemDef {
  icon: string;
  phase: number;
  unique?: boolean;
  /** Profession needed to use the gem (proto `Profession` id: 7 Jewelcrafting). */
  requiredProfession?: number;
  /**
   * Meta gems whose requirement compares two colours ("more blue gems than yellow gems"), which
   * `metaRequires` (minimum counts) cannot express. Evaluated by `buildSetup` (strictly "more than").
   */
  metaCompare?: { more: PrimaryGemColor; than: PrimaryGemColor };
}

export interface EnchantRecord extends EnchantDef {
  icon: string;
  /** The logical slot the enchant goes on (`mainHand`: weapon enchants). */
  slot: ItemSlot;
  /** Further slots (armor kits; db.json effect ids listed for two slots, e.g. Fortitude). */
  extraSlots?: ItemSlot[];
  /** 2H weapon enchants: staves only. */
  twoHandOnly?: boolean;
  /** Profession needed (proto `Profession` id: 3 Enchanting, the ring enchants). */
  requiredProfession?: number;
}

export interface ItemDb {
  /** Provenance of the generated data (source repository and commit). */
  source?: string;
  items: Record<number, ItemRecord>;
  gems: Record<number, GemRecord>;
  /** Keyed by enchant effect id (the export's `enchant`). */
  enchants: Record<number, EnchantRecord>;
}
