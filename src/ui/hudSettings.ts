// Combat text HUD preferences (scrolling combat text Task 1). Interface preferences, not part of the
// fight setup: stored under their own key. Framework-free; nothing here throws. Stored data is
// never trusted: every load and every save goes through `normalizeHudSettings` (the same patterns
// as src/setup/storage.ts). Defaults and ranges: docs/data-sources.md, "Part G: combat text HUD".

export type HudAnimation = 'straight' | 'parabola';

export interface HudSettings {
  /** The whole HUD. */
  enabled: boolean;
  // Categories (each switches exactly its own texts).
  /** Direct hits (not crits). */
  damage: boolean;
  /** Direct critical hits. */
  crits: boolean;
  /** DoT ticks. */
  ticks: boolean;
  misses: boolean;
  /** A player buff coming up ("+Name"). */
  buffsOn: boolean;
  /** A player buff fading ("-Name"; proc buffs included). */
  buffsOff: boolean;
  /** A proc aura coming up ("Name!"). */
  procs: boolean;
  /** The player's auras on the target coming up and fading (default off). */
  targetDebuffs: boolean;
  /** Mana gains from spells and items ("+N Mana"; never the regen ticks). */
  mana: boolean;
  /** An item action used. */
  itemUse: boolean;
  /** A tracked cooldown becoming ready. */
  cooldownReady: boolean;
  /** "Low Mana" once per crossing below `lowManaPct`. */
  lowMana: boolean;
  animation: HudAnimation;
  /** How long a text lives, ms (600-4000). */
  durationMs: number;
  /** Base font size, px (10-32). */
  fontPx: number;
  /** Crit size relative to `fontPx` (1-2.5). */
  critScale: number;
  showIcons: boolean;
  /** "Shadow Bolt 3,141" instead of "3,141". */
  showSpellNames: boolean;
  /** Hits, crits and ticks below this amount are not shown (0-100000). */
  minDamage: number;
  /** Merge window for the ticks of one DoT, ms of fight time (0 = no merging, max 2000). */
  mergeTicks: number;
  /** Mana gains below this amount merge within `MANA_MERGE_WINDOW_MS` (0 = no merging, max 10000). */
  mergeManaBelow: number;
  /** Most texts on screen at once (4-60). */
  maxTexts: number;
  /** "Low Mana" threshold, percent of max mana (5-80). */
  lowManaPct: number;
}

/** The defaults (deep-frozen; `normalizeHudSettings` always returns a fresh object). */
export const DEFAULT_HUD_SETTINGS: Readonly<HudSettings> = Object.freeze({
  enabled: true,
  damage: true,
  crits: true,
  ticks: true,
  misses: true,
  buffsOn: true,
  buffsOff: true,
  procs: true,
  targetDebuffs: false,
  mana: true,
  itemUse: true,
  cooldownReady: true,
  lowMana: true,
  animation: 'straight',
  durationMs: 1600,
  fontPx: 16,
  critScale: 1.5,
  showIcons: true,
  showSpellNames: false,
  minDamage: 0,
  mergeTicks: 250,
  mergeManaBelow: 100,
  maxTexts: 24,
  lowManaPct: 20,
});

type NumberKey = 'durationMs' | 'fontPx' | 'critScale' | 'minDamage' | 'mergeTicks' | 'mergeManaBelow' | 'maxTexts' | 'lowManaPct';
type BooleanKey = { [K in keyof HudSettings]: HudSettings[K] extends boolean ? K : never }[keyof HudSettings];

/** Range of each numeric setting; `step` 1 rounds to whole numbers, 0.01 to two decimals. */
export const HUD_SETTING_LIMITS: Readonly<Record<NumberKey, Readonly<{ min: number; max: number; step: number }>>> = Object.freeze({
  durationMs: Object.freeze({ min: 600, max: 4000, step: 1 }),
  fontPx: Object.freeze({ min: 10, max: 32, step: 1 }),
  critScale: Object.freeze({ min: 1, max: 2.5, step: 0.01 }),
  minDamage: Object.freeze({ min: 0, max: 100000, step: 1 }),
  mergeTicks: Object.freeze({ min: 0, max: 2000, step: 1 }),
  mergeManaBelow: Object.freeze({ min: 0, max: 10000, step: 1 }),
  maxTexts: Object.freeze({ min: 4, max: 60, step: 1 }),
  lowManaPct: Object.freeze({ min: 5, max: 80, step: 1 }),
});

const BOOLEAN_KEYS: readonly BooleanKey[] = [
  'enabled',
  'damage',
  'crits',
  'ticks',
  'misses',
  'buffsOn',
  'buffsOff',
  'procs',
  'targetDebuffs',
  'mana',
  'itemUse',
  'cooldownReady',
  'lowMana',
  'showIcons',
  'showSpellNames',
];

const ANIMATIONS: readonly HudAnimation[] = ['straight', 'parabola'];

/** An own property of a plain record, or undefined (inherited, accessor that throws, not a record). */
function own(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  try {
    return Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Untrusted input -> valid settings, field by field: a boolean field takes only a boolean; a
 * number field only a finite number, clamped to `HUD_SETTING_LIMITS` and rounded to its step;
 * `animation` only a known style. Anything else (missing, NaN, a string, null, an array, an
 * inherited or `__proto__` property) is the default. Never throws; returns a new plain object with
 * exactly the `HudSettings` keys.
 */
export function normalizeHudSettings(input: unknown): HudSettings {
  const out: HudSettings = { ...DEFAULT_HUD_SETTINGS };
  for (const key of BOOLEAN_KEYS) {
    const v = own(input, key);
    if (typeof v === 'boolean') out[key] = v;
  }
  for (const key of Object.keys(HUD_SETTING_LIMITS) as NumberKey[]) {
    const v = own(input, key);
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const { min, max, step } = HUD_SETTING_LIMITS[key];
    const clamped = Math.min(max, Math.max(min, v));
    out[key] = step === 1 ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  }
  const animation = own(input, 'animation');
  if (ANIMATIONS.includes(animation as HudAnimation)) out.animation = animation as HudAnimation;
  return out;
}

/** The localStorage key (its own: interface preferences, not the fight setup). */
export const HUD_STORAGE_KEY = 'rotation-trainer:hud:v1';

/**
 * Longest stored text (UTF-16 code units) that is parsed or written. The full settings are about
 * 400 characters; anything longer is ignored before `JSON.parse`.
 */
export const HUD_STORAGE_MAX_CHARS = 10_000;

/** The part of the Web Storage API the HUD settings use (tests pass in-memory fakes). */
export type HudStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The stored settings, normalized. Never throws: no storage, nothing stored, a throwing storage, a
 * non-string, text over `HUD_STORAGE_MAX_CHARS`, invalid JSON (or a parser stack overflow) give the
 * defaults; a partly valid object keeps its valid fields. Reads only `HUD_STORAGE_KEY`.
 */
export function loadHudSettings(storage: HudStorage | null): HudSettings {
  let parsed: unknown;
  try {
    const text: unknown = storage?.getItem(HUD_STORAGE_KEY);
    if (typeof text === 'string' && text.length <= HUD_STORAGE_MAX_CHARS) parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return normalizeHudSettings(parsed);
}

/**
 * Saves `settings`, normalized first, as JSON under `HUD_STORAGE_KEY`. False (never a throw) when
 * there is no storage, the text would be over the cap or the storage refuses it.
 */
export function saveHudSettings(storage: HudStorage | null, settings: HudSettings): boolean {
  if (!storage) return false;
  try {
    const text = JSON.stringify(normalizeHudSettings(settings));
    if (text.length > HUD_STORAGE_MAX_CHARS) return false;
    storage.setItem(HUD_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}
