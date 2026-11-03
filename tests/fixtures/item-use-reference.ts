// Reference data for the item-use rules (simulator Task 1): the pre-change item rules of
// src/data/classes/warlock/itemRules.ts as a LITERAL COPY (captured at c121206), a deterministic
// random snapshot generator, the scenarios whose bot logs must stay byte-identical, and a bot
// runner that records per seed the log hash, its length and the number of RNG draws.

import { runBot } from '../../src/bot/bot';
import { buildDestructionWarlock, destructionEquipped, DEFAULT_WARLOCK_OPTIONS } from '../../src/data/classes/warlock/destruction';
import { SPELL_QUEUE_WINDOW_MS } from '../../src/data/common/ratings';
import { BOSS_TARGET } from '../../src/data/common/target';
import { ITEM_SLOTS } from '../../src/data/items/db';
import type { ItemDb } from '../../src/data/items/types';
import type { PriorityStep } from '../../src/data/types';
import { createRng, type Rng } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/sim';
import type { EquippedItem, SimSnapshot } from '../../src/engine/types';
import { applySetup } from '../../src/setup/applySetup';
import { DEFAULT_SETUP, SETUP_CATALOG } from '../../src/setup/defaults';
import { SETUP_PRESETS } from '../../src/setup/presets';
import type { SetupConfig } from '../../src/setup/types';

// ---------------------------------------------------------------------------
// The pre-change rules (literal copy of itemRules.ts @ c121206; comments trimmed)
// ---------------------------------------------------------------------------

export const OLD_SUPER_MANA_POTION_MISSING_MANA = 3000;
export const OLD_DARK_RUNE_MISSING_MANA = 1500;

function itemPressFree(s: SimSnapshot, spellId: string): boolean {
  return s.cast === null || s.queuedSpellId === null || s.queuedSpellId === spellId;
}

const missingMana = (s: SimSnapshot) => s.maxMana - s.mana;
const heroismUp = (s: SimSnapshot) => s.selfAuras['heroism'] !== undefined;

type HeroismEndMs = number | null;

export interface OldItemRule {
  label: string;
  hint(heroismEndMs: HeroismEndMs): string;
  wanted(heroismEndMs: HeroismEndMs): (s: SimSnapshot) => boolean;
}

const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`;

export function oldBurstRule(label: string, effect: string, cooldown: string): OldItemRule {
  return {
    label,
    hint: (heroismEndMs) =>
      heroismEndMs !== null
        ? `Use it while Heroism is up, then whenever it is ready once Heroism has ended at ${seconds(heroismEndMs)} (off the GCD): ${effect}. ${cooldown}`
        : `Use it at the pull and whenever it is ready (off the GCD): ${effect}. ${cooldown}`,
    wanted: (heroismEndMs) =>
      heroismEndMs !== null ? (s) => heroismUp(s) || s.nowMs >= heroismEndMs : () => true,
  };
}

export const OLD_ITEM_RULES: Readonly<Record<string, Readonly<OldItemRule>>> = Object.freeze({
  'use-destruction-potion': oldBurstRule(
    'Destruction Potion',
    '+120 spell power and +2% crit for 15 s',
    'Shares the 2 min potion cooldown with Super Mana Potion.',
  ),
  'use-super-mana-potion': {
    label: 'Super Mana Potion',
    hint: () =>
      `When at least ${OLD_SUPER_MANA_POTION_MISSING_MANA} mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.`,
    wanted: () => (s) => missingMana(s) >= OLD_SUPER_MANA_POTION_MISSING_MANA,
  },
  'use-dark-rune': {
    label: 'Dark Rune',
    hint: () =>
      `When at least ${OLD_DARK_RUNE_MISSING_MANA} mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.`,
    wanted: () => (s) => missingMana(s) >= OLD_DARK_RUNE_MISSING_MANA,
  },
});

export function oldBuildItemSteps(
  enabledActionIds: readonly string[],
  heroismEndMs: number | null,
  gearRules: Readonly<Record<string, Readonly<OldItemRule>>> = {},
): PriorityStep[] {
  const steps: PriorityStep[] = [];
  for (const spellId of enabledActionIds) {
    const rule = Object.hasOwn(OLD_ITEM_RULES, spellId) ? OLD_ITEM_RULES[spellId] : Object.hasOwn(gearRules, spellId) ? gearRules[spellId] : undefined;
    if (rule === undefined) continue;
    const wanted = rule.wanted(heroismEndMs);
    steps.push({
      spellId,
      label: rule.label,
      hint: rule.hint(heroismEndMs),
      when: (s) => itemPressFree(s, spellId) && wanted(s),
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Random snapshots
// ---------------------------------------------------------------------------

/** Item action ids the generator puts into casts and the queue. */
export const SNAPSHOT_ITEM_IDS = ['use-item-29370', 'use-destruction-potion', 'use-super-mana-potion', 'use-dark-rune', 'use-item-29132'];
const SELF_AURA_IDS = ['heroism', 'item-buff:35163', 'destruction-potion', 'item-buff:35337', 'item-buff:35084'];

/**
 * `n` deterministic pseudo-random snapshots (seeded mulberry32): times spread over a 300 s fight
 * with extra weight on the edges that matter (0, the pull, Heroism's end 46.4 s, the fight's end),
 * random casts, queue, mana, self auras and item cooldowns. Only the fields the item rules read
 * are meaningful; the rest is filled with plausible constants.
 */
export function randomSnapshots(seed: number, n: number): SimSnapshot[] {
  const rng: Rng = createRng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
  const out: SimSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const durationMs = pick([60000, 60000, 90000, 300000, 600000]);
    const r = rng.next();
    const nowMs =
      r < 0.1
        ? Math.floor(rng.next() * 2000)
        : r < 0.2
          ? 46400 + Math.floor(rng.next() * 41) - 20
          : r < 0.3
            ? durationMs - Math.floor(rng.next() * 30000)
            : r < 0.33
              ? pick([0, 1, 1499, 1500, 1501, 30000, 46399, 46400, 46401, durationMs - 20000, durationMs])
              : Math.floor(rng.next() * (durationMs + 1));
    const maxMana = pick([9000, 10000, 12000, 15000]);
    const mana = rng.next() < 0.1 ? pick([0, maxMana, maxMana - 1500, maxMana - 1499, maxMana - 3000, maxMana - 2999]) : Math.floor(rng.next() * (maxMana + 1));
    const castR = rng.next();
    const cast = castR < 0.5 ? null : { spellId: pick(['shadow-bolt', 'immolate', 'curse-of-the-elements', ...SNAPSHOT_ITEM_IDS]), startMs: nowMs, endMs: nowMs + 2000 };
    const qR = rng.next();
    const queuedSpellId = qR < 0.5 ? null : pick(['shadow-bolt', 'immolate', ...SNAPSHOT_ITEM_IDS]);
    const selfAuras: SimSnapshot['selfAuras'] = {};
    for (const id of SELF_AURA_IDS) {
      if (rng.next() < 0.3) selfAuras[id] = { auraId: id, stacks: 1, charges: 0, remainingMs: 1 + Math.floor(rng.next() * 40000) };
    }
    const cooldownRemainingMs: Record<string, number> = { 'shadow-bolt': 0 };
    for (const id of SNAPSHOT_ITEM_IDS) {
      const c = rng.next();
      cooldownRemainingMs[id] = c < 0.5 ? 0 : c < 0.6 ? 120000 : Math.floor(rng.next() * 120001);
    }
    out.push({
      nowMs,
      phase: nowMs === 0 && rng.next() < 0.5 ? 'ready' : nowMs >= durationMs ? 'ended' : 'running',
      durationMs,
      gcdEndsAtMs: nowMs + 500,
      cast,
      mana,
      maxMana,
      cooldownRemainingMs,
      spells: {},
      gcdMs: 1500,
      targetAuras: {},
      selfAuras,
      damageTotal: 0,
      dps: 0,
      queuedSpellId,
      inFlight: [],
      castCounts: {},
      useCounts: {},
    });
  }
  return out;
}

/** The when() results of `steps` over `snapshots` as one string ('1'/'0' per step and snapshot). */
export function whenBits(steps: readonly PriorityStep[], snapshots: readonly SimSnapshot[]): string {
  let out = '';
  for (const s of snapshots) for (const step of steps) out += step.when === undefined || step.when(s) ? '1' : '0';
  return out;
}

// ---------------------------------------------------------------------------
// Hash and scenarios
// ---------------------------------------------------------------------------

/** cyrb53: a 53-bit string hash (pins logs without committing them). */
export function hash(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const slot = (s: (typeof ITEM_SLOTS)[number]) => ITEM_SLOTS.indexOf(s);

/** The author's gear with Quagmirran's Eye (proc) and Scryer's Bloodgem (on use) as trinkets. */
export function quagBloodgemGear(): (EquippedItem | null)[] {
  const gear: (EquippedItem | null)[] = structuredClone(destructionEquipped);
  gear[slot('trinket1')] = { id: 27683 };
  gear[slot('trinket2')] = { id: 29132 };
  return gear;
}

const heroismAt = (startSec: number) => ({ ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec, durationSec: 40 } });

/** The scenarios whose bot logs, means and RNG draw counts are pinned. */
export function scenarios(): Record<string, SetupConfig> {
  const base = (): SetupConfig => structuredClone(DEFAULT_SETUP);
  return {
    default: base(),
    iconBand: { ...base(), enabledBuffs: ['item:29370', 'item:29305'] },
    raidLog: structuredClone(SETUP_PRESETS['raid-log'].config) as SetupConfig,
    consumables: { ...base(), enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune'], timed: heroismAt(6.4) },
    consumablesNoHeroism: { ...base(), enabledBuffs: ['destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370'] },
    long300: {
      ...base(),
      enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune', 'item:29370', 'item:29305'],
      timed: heroismAt(6.4),
      fightDurationSec: 300,
    },
    quagBloodgem: {
      ...base(),
      gear: quagBloodgemGear(),
      enabledBuffs: ['heroism', 'destruction-potion', 'item:27683', 'item:29132', 'item:29305'],
      timed: heroismAt(6.4),
    },
  };
}

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const WINDOWS = [SPELL_QUEUE_WINDOW_MS, 0] as const;

export interface BotReference {
  /** Mean DPS over seeds 1-10. */
  mean: number;
  /** Per seed: [hash(JSON.stringify(log)), log length, RNG draws]. */
  runs: [number, number, number][];
}

/** The applied setup of a scenario (with the item database: the Quagmirran's Eye gear needs it). */
export function applyScenario(config: SetupConfig, db: ItemDb) {
  return applySetup({
    buildSpec: (w = DEFAULT_WARLOCK_OPTIONS, g) => (g === undefined ? buildDestructionWarlock(w) : buildDestructionWarlock(w, g, db)),
    catalog: SETUP_CATALOG,
    config,
    db,
  });
}

/** The bot over seeds 1-10 at both windows, counting the RNG draws of each fight. */
export function botReference(config: SetupConfig, db: ItemDb): Record<number, BotReference> {
  const { spec, sim } = applyScenario(config, db);
  const out: Record<number, BotReference> = {};
  for (const w of WINDOWS) {
    let total = 0;
    const runs: [number, number, number][] = [];
    for (const seed of SEEDS) {
      const fight = new Simulation({
        spec,
        target: BOSS_TARGET,
        seed,
        spellQueueWindowMs: w,
        infiniteMana: false,
        distanceFromTarget: sim.distanceFromTarget,
        scheduledAuras: sim.scheduledAuras,
        durationMs: sim.durationMs,
      });
      // Count the draws: wrap the private seeded Rng's next().
      const rng = (fight as unknown as { rng: Rng }).rng;
      const next = rng.next.bind(rng);
      let draws = 0;
      rng.next = () => {
        draws++;
        return next();
      };
      total += runBot(fight, spec.priority).dps;
      const log = fight.log();
      runs.push([hash(JSON.stringify(log)), log.length, draws]);
    }
    out[w] = { mean: total / SEEDS.length, runs };
  }
  return out;
}
