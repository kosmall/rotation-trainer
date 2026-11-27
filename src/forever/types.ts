// Shared types of the WoW Forever leveling simulator. Framework-free; no React or DOM.

export interface Sourced<T> {
  value: T;
  verify?: boolean;
  source: string;
  options?: T[];
}

export type DownrankModel = 'none' | 'classic' | 'partial';
export type BrandScale = 'fixed_60' | 'level_scaled';

/** Resolved simulation parameters (plain values; the verify flags live in params.json). */
export interface Params {
  downrank_penalty_model: DownrankModel;
  bane_per_rank: number;
  haste_shortens_gcd: boolean;
  gcd_ms: number;
  min_gcd_ms: number;
  haste_pct: number;
  /** Extra spell power for Shadow spells only (Major Spellstone: +21). */
  shadow_spell_power_bonus: number;
  cast_floor_ms: number;
  mobs_per_pull: 1 | 2 | 3;
  skip_agony_if_ttk_below: number;
  use_curse_of_elements: boolean;
  demo_use_agony: boolean;
  lt_combat_mana_pct: number;
  lt_combat_hp_pct: number;
  lt_low_mana_pct: number;
  lt_low_hp_pct: number;
  lt_between_mana_pct: number;
  lt_between_hp_pct: number;
  break_mana_pct: number;
  drink_to_mana_pct: number;
  break_hp_pct: number;
  lt_safety_hp_pct: number;
  /** The demon between pulls: share of its health regained per second, and when Health Funnel starts and stops (fractions). */
  pet_ooc_regen_pct_per_sec: number;
  /** The demon's mana regained per second out of combat (mana points). */
  pet_ooc_mana_per_sec: number;
  pet_funnel_below_pct: number;
  pet_funnel_to_pct: number;
  rest_to_mana_pct: number;
  rest_to_hp_pct: number;
  eat_and_drink_together: boolean;
  transition_sec: number;
  death_penalty_sec: number;
  pet_resummon_sec: number;
  pull_time_limit_sec: number;
  mob_miss_pct: number;
  mob_swing_sec: number;
  pushback_ms: number;
  base_crit_mult: number;
  life_tap_spirit_coeff: number;
  drain_soul_window_sec: number;
  use_drain_soul_finisher: boolean;
  agony_ramp: 'classic_thirds' | 'flat';
  life_tap_mana_per_health: number;
  searing_pain_threat_mult: number;
  threat_overtake_ranged: number;
  threat_overtake_melee: number;
  pet_opens: boolean;
  brand_scale: BrandScale;
  brand_mult: number;
  wrack_dmg_mult: number;
  mob_hp_mult: number;
  mob_dmg_mult: number;
  sb_r1_coeff_mult: number;
  sb_r2_coeff_mult: number;
  fsr_sec: number;
  drink_adds_spirit_regen: boolean;
  fsr_regen_fraction: number;
  sb_filler_lifetap_when_oom: boolean;
  pet_hit_chance: number;
  pet_initial_threat_per_level: number;
  corruption_min_ttk_sec: number;
  aff_use_immolate: boolean;
  wrack_min_hp_pct: number;
  fire_filler: 'searing_pain' | 'shadow_bolt_r1';
  session_pulls: number;
  drain_dmg_mult: number;
  pet_dmg_mult: number;
  /** Gnome racial Eureka!: when the warlock uses it (off = never). */
  eureka_policy: EurekaPolicy;
  /** `delay` policy: seconds into the pull before Eureka! is used. */
  eureka_delay_sec: number;
  eureka_cd_sec: number;
  eureka_dur_sec: number;
  /** Mana cost reduction and damage increase of the affected spells while Eureka! is up (0.1 = 10%). */
  eureka_mod: number;
}

export type EurekaPolicy = 'off' | 'pull_start' | 'first_affected' | 'filler' | 'delay' | 'ttk';

export type PetKind = 'imp' | 'voidwalker' | 'succubus' | 'felhunter';
export type Tree = 'aff' | 'demo' | 'destro';

export interface SpellRank {
  rank: number;
  level: number;
  mana: number;
  min?: number;
  max?: number;
  dotTotal?: number;
  castMs?: number;
  coeff?: number;
  base?: number;
  damageTaken?: number;
  tickDmg?: number;
  durationMs?: number;
  baseAt40?: number;
  perLevel?: number;
  hotfixMult?: number;
}

export interface SpellData {
  id: string;
  name: string;
  school: 'shadow' | 'fire';
  kind: 'direct' | 'dot' | 'direct+dot' | 'channel' | 'utility' | 'curse';
  onGcd: boolean;
  banable?: boolean;
  baseCastMs?: number;
  channelMs?: number;
  durationMs?: number;
  tickMs?: number;
  coeffDirect?: number;
  coeffTick?: number;
  rampFactors?: number[];
  accelerates?: string[];
  healFrac?: number;
  teachesTalent?: string;
  verify?: boolean;
  source: string;
  ranks: SpellRank[];
}

/** Player stats a gear delta can change (equivalency points). */
export type StatKey = 'spellPower' | 'intellect' | 'spirit' | 'stamina' | 'critPct' | 'hitPct';
/** Extra stats on top of the gear profile, added before the Stamina/Intellect conversions. */
export type StatDelta = Partial<Record<StatKey, number>>;
