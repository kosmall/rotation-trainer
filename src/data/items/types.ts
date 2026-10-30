import type { EnchantDef, GemDef, ItemDef } from '../../engine/types';

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
  /** Staff: occupies the main hand and leaves the off hand empty. */
  twoHand?: boolean;
  /**
   * Short readable text of the item's on-use, proc and equip effects (wowsims `itemEffects`), which
   * the trainer does not model unless a setup entry does (e.g. Icon of the Silver Crescent).
   */
  effects?: string[];
}

export interface GemRecord extends GemDef {
  icon: string;
  phase: number;
  unique?: boolean;
  /**
   * Meta gems whose requirement compares two colours ("more blue gems than yellow gems"), which
   * `metaRequires` (minimum counts) cannot express. Not evaluated by the stage 1 `buildSetup`.
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
}

export interface ItemDb {
  /** Provenance of the generated data (source repository and commit). */
  source?: string;
  items: Record<number, ItemRecord>;
  gems: Record<number, GemRecord>;
  /** Keyed by enchant effect id (the export's `enchant`). */
  enchants: Record<number, EnchantRecord>;
}
