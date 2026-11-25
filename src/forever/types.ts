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
  cast_floor_ms: number;
  mobs_per_pull: 1 | 2 | 3;
  skip_agony_if_ttk_below: number;
  use_curse_of_elements: boolean;
  demo_use_agony: boolean;
  life_tap_mana_below: number;
  life_tap_hp_above: number;
  rest_use_life_tap: boolean;
  rest_life_tap_hp_floor: number;
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
  life_tap_hp_cost_frac: number;
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
  malevolence_crit_pct_per_rank: number;
  spirit_regen_per_spirit: number;
  fsr_regen_fraction: number;
  sb_filler_lifetap_when_oom: boolean;
  pet_hit_chance: number;
  pet_initial_threat_per_level: number;
  corruption_min_ttk_sec: number;
  aff_use_immolate: boolean;
  fire_filler: 'searing_pain' | 'shadow_bolt_r1';
  pull_min_mana_pct: number;
  pull_min_hp_pct: number;
  session_pulls: number;
  drain_dmg_mult: number;
  pet_dmg_mult: number;
}

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
  coeffDot?: number;
  healFrac?: number;
  teachesTalent?: string;
  verify?: boolean;
  source: string;
  ranks: SpellRank[];
}
