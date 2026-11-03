// The multi-run simulator core (simulator Task 2; design spec §2 B and §3; docs/data-sources.md
// Part H): applies the request's setup once, plays N fights with the bot (`runBot`) on fresh
// Simulations built exactly as the game builds them (`createFightSimulation`), with per-run seeds
// `mixSeed(seed, i)`, extracts per-run numbers from each log without keeping it, and aggregates
// them (`Aggregator`, Welford). Framework-free: no DOM, no React, no wall clock; the only
// randomness is each Simulation's seeded Rng. The item database comes IN with the request (this
// module never loads it).

import { runBot } from '../bot/bot';
import { buildDestructionWarlock, type WarlockOptions } from '../data/classes/warlock/destruction';
import type { ItemDb } from '../data/items/types';
import type { EquippedItem } from '../engine/types';
import { applySetup } from '../setup/applySetup';
import { normalizeSetup, SETUP_CATALOG, STATIC_SETUP_CATALOG } from '../setup/defaults';
import { gearNeedsDb } from '../setup/gear';
import type { PriorityStep } from '../data/types';
import type { AppliedSetup, SetupConfig } from '../setup/types';
import { createFightSimulation } from './fight';
import { SIM_LIMITS } from './limits';
import { Aggregator } from './stats';
import type { RunSample, SimOptions, SimRequest, SimResult, SpellTotals } from './types';

export { SIM_LIMITS };

/** Runs per chunk between yields to the event loop, unless `SimOptions.chunk` says otherwise. */
export const DEFAULT_CHUNK = 50;

/** Life Tap's spell id (src/data/classes/warlock/rotation.ts): counted per run. */
const LIFE_TAP_SPELL_ID = 'life-tap';

/** Golden-ratio increment of splitmix32 (2^32 / phi). */
const GOLDEN_GAMMA = 0x9e3779b9;

/**
 * The seed of run `i` of a request with base `seed`: z = (seed + (i + 1) x 0x9e3779b9) mod 2^32,
 * then the MurmurHash3 fmix32 finalizer (z ^= z >>> 16; z *= 0x85ebca6b; z ^= z >>> 13;
 * z *= 0xc2b2ae35; z ^= z >>> 16), i.e. the (i + 1)-th output of a splitmix32-style generator
 * seeded with `seed`. Both steps are bijections of 32-bit integers, so for one base seed the
 * first 2^32 runs get distinct seeds, and neighbouring runs (and neighbouring base seeds) get
 * unrelated ones; mulberry32 (rng.ts) seeded with s and s + 1 would otherwise share most of their
 * stream shifted by one draw. Unsigned 32-bit result. Stable forever (pinned by a test): changing
 * it changes every simulator result.
 */
export function mixSeed(seed: number, i: number): number {
  let z = ((seed >>> 0) + Math.imul((i + 1) >>> 0, GOLDEN_GAMMA)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Everything one fight needs, prepared once per request (`prepareRun`). Read-only. */
export interface RunFactory {
  readonly runs: number;
  readonly seed: number;
  readonly spellQueueWindowMs: number;
  /** The normalized setup the fights are built from. */
  readonly config: SetupConfig;
  /**
   * `applySetup`'s result: the spec and fight settings, plus (passed through, rotation scripts
   * Task 2) the script context with what compiling the setup's script reported, and the basic rotation.
   */
  readonly fight: AppliedSetup;
  /** Mana at the start of every fight (max mana with the auras applied at 0). */
  readonly startMana: number;
  /** Ids of the item actions (`SpellDef.item`): counted as item uses, not as spells. */
  readonly itemActionIds: ReadonlySet<string>;
  /** Ids of the auras whose uptime is measured (every aura that is not `hidden`). */
  readonly visibleAuraIds: ReadonlySet<string>;
  readonly labels: SimResult['labels'];
  /**
   * The pressing rules of the priority list in list order (`ruleKeysOf`): the `SimResult.ruleFires`
   * keys, their labels and the index of their step in `fight.spec.priority`.
   */
  readonly rules: readonly RuleSlot[];
  /** Per priority step: its index in `rules`, or -1 for a wait step. */
  readonly ruleOfStep: Int32Array;
}

/** One pressing rule of a fight's priority list (`RunFactory.rules`). */
export interface RuleSlot {
  key: string;
  label: string;
  step: number;
}

/**
 * The pressing rules of `priority` (every step but `wait` steps), keyed: a script step by its rule
 * key (`step.key`, `rules[i]`); a basic step by its item's catalog entry id when it presses one of
 * `itemActions` (`destruction-potion`, `item:29370`), else by its spell id (`shadow-bolt`). A key
 * already taken gets `#2`, `#3` (the basic list never repeats one).
 */
export function ruleKeysOf(
  priority: readonly PriorityStep[],
  itemActions: readonly { id: string; spellId: string }[],
): { rules: RuleSlot[]; ruleOfStep: Int32Array } {
  const rules: RuleSlot[] = [];
  const ruleOfStep = new Int32Array(priority.length).fill(-1);
  const taken = new Set<string>();
  priority.forEach((step, i) => {
    if (step.kind === 'wait') return;
    const base = step.key ?? itemActions.find((a) => a.spellId === step.spellId)?.id ?? step.spellId;
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}#${n}`;
    taken.add(key);
    ruleOfStep[i] = rules.length;
    rules.push({ key, label: step.label, step: i });
  });
  return { rules, ruleOfStep };
}

const describe = (v: unknown) => (typeof v === 'number' ? String(v) : typeof v);

function finiteNumber(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`Simulation request: ${name} must be a finite number, got ${describe(v)}`);
  }
  return v;
}

const clampInt = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, Math.round(v)));

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `db` as an item database, or null when absent; anything else is a TypeError. */
function readDb(v: unknown): ItemDb | null {
  if (v === undefined || v === null) return null;
  let ok = false;
  try {
    ok = isObject(v) && isObject(v.items) && isObject(v.gems) && isObject(v.enchants);
  } catch {
    ok = false;
  }
  if (!ok) throw new TypeError('Simulation request: db must be an item database (an object with items, gems and enchants)');
  return v as unknown as ItemDb;
}

/**
 * Validates the request and prepares the fights:
 * - `runs`, `seed`, `spellQueueWindowMs` must be finite numbers (else a TypeError naming the
 *   field); `runs` is rounded and clamped to 1-100 000, `seed` truncated and reduced modulo 2^32
 *   (`>>> 0`: -1 -> 4294967295), the window rounded and clamped to 0-1000 ms.
 * - A request that is not an object, or whose fields throw when read, is a TypeError; so is a
 *   `db` that is not an item database.
 * - `setup` goes through `normalizeSetup(setup, SETUP_CATALOG, db)` like stored data: garbage
 *   gives the default setup, never an error. A normalized gear the embedded author tables cannot
 *   build (`gearNeedsDb`) without `db` is an Error (the game would play the author's gear until
 *   the database loads; a simulator result must not silently be another gear's).
 * - The setup is applied once exactly as GameView applies it (`applySetup` with
 *   `STATIC_SETUP_CATALOG`, the spec built with the database only when there is a gear and a
 *   database, and with the setup's talents: `SetupConfig.talents`), and one Simulation is built and started to read the start mana (this also
 *   surfaces data errors here rather than in the first run).
 */
export function prepareRun(request: SimRequest): RunFactory {
  if (!isObject(request)) throw new TypeError('Simulation request must be an object');
  let fields: { setup: unknown; db: unknown; runs: unknown; seed: unknown; window: unknown };
  try {
    const r = request as unknown as Record<string, unknown>;
    fields = { setup: r.setup, db: r.db, runs: r.runs, seed: r.seed, window: r.spellQueueWindowMs };
  } catch {
    throw new TypeError('Simulation request could not be read');
  }
  const runs = clampInt(finiteNumber('runs', fields.runs), SIM_LIMITS.runs);
  const seed = finiteNumber('seed', fields.seed) >>> 0;
  const spellQueueWindowMs = clampInt(finiteNumber('spellQueueWindowMs', fields.window), SIM_LIMITS.spellQueueWindowMs);
  const db = readDb(fields.db);
  const config = normalizeSetup(fields.setup, SETUP_CATALOG, db ?? undefined);
  if (config.gear !== undefined && db === null && gearNeedsDb(config.gear)) {
    throw new Error('Simulation request: this gear needs the item database (pass request.db)');
  }
  const buildSpec = (w: WarlockOptions, gear?: readonly (EquippedItem | null)[], talents?: string) =>
    gear === undefined || db === null
      ? buildDestructionWarlock(w, gear, undefined, talents)
      : buildDestructionWarlock(w, gear, db, talents);
  const fight = applySetup({ buildSpec, catalog: STATIC_SETUP_CATALOG, config, db });

  const probe = createFightSimulation(fight, seed, spellQueueWindowMs);
  probe.start();
  const startMana = probe.snapshot().mana;

  const itemActionIds = new Set<string>();
  const labels: SimResult['labels'] = { spells: {}, items: {}, auras: {} };
  for (const s of fight.spec.spells) {
    if (s.item) {
      itemActionIds.add(s.id);
      labels.items[s.id] = s.name;
    } else {
      labels.spells[s.id] = s.name;
    }
  }
  const visibleAuraIds = new Set<string>();
  for (const a of fight.spec.auras) {
    if (a.hidden || visibleAuraIds.has(a.id)) continue;
    visibleAuraIds.add(a.id);
    labels.auras[a.id] = a.name;
  }
  const { rules, ruleOfStep } = ruleKeysOf(fight.spec.priority, fight.basic.itemActions);
  return { runs, seed, spellQueueWindowMs, config, fight, startMana, itemActionIds, visibleAuraIds, labels, rules, ruleOfStep };
}

/** Run `index` of the request: the fight with seed `mixSeed(factory.seed, index)`. */
export function runOnce(factory: RunFactory, index: number): RunSample {
  return runWithSeed(factory, mixSeed(factory.seed, index), index);
}

/**
 * Plays one fight with `seed` (a fresh Simulation, `runBot` with the setup's priority) and
 * extracts from its log, which is then dropped:
 * - per spell id (item actions excluded, keys in order of first appearance): direct damage
 *   (`damage`), tick damage (`tick`, keyed by its source spell, else its aura id), completed casts
 *   (`cast-complete`), hits (direct damage events), crits, misses;
 * - item uses: `cast-complete` of the item actions;
 * - Life Taps: `cast-complete` of `life-tap`;
 * - aura uptime per visible aura: from an `aura-apply` (a refresh applies again without a fade:
 *   ignored) to its `aura-fade`, or to the fight's end when still up;
 * - mana spent: start mana + every logged gain (`mana`) - the mana at the end; this is the sum
 *   of the completed casts' costs, except when a self aura that raised max mana fades with the
 *   bar above the new max (the engine clamps it without a log: counted as spent);
 * - rule fires: the bot reports each accepted press's step (`runBot`'s read-only `onPress`); the
 *   log then tells when each press STARTED its cast or use. An accepted press logs at once either
 *   its start (`cast-start`, or `cast-complete` of an instant / item action) or `queue`; a queued
 *   spell starts later when its block ends (the same start events) or is dropped (`queue-drop`:
 *   replaced, or rejected when it fires; a queued spell discarded at the fight end never starts).
 *   Walking the log with the presses in order: a `queue` takes the next press as the pending one;
 *   a `queue-drop` clears it; a start is the pending press's when one is pending for that spell,
 *   else the next press's; a `cast-complete` while a cast is in progress is its completion, not a
 *   start (nothing else can complete during a cast: every press is busy or queued then).
 */
export function runWithSeed(factory: RunFactory, seed: number, index: number): RunSample {
  const sim = createFightSimulation(factory.fight, seed, factory.spellQueueWindowMs);
  const priority = factory.fight.spec.priority;
  const presses: number[] = [];
  const { dps, damageTotal } = runBot(sim, priority, undefined, (step) => presses.push(step));
  const ruleFires = new Array<number>(factory.rules.length).fill(0);
  const { ruleOfStep } = factory;
  let nextPress = 0;
  let pending = -1;
  let casting = false;
  const started = (spellId: string) => {
    let step: number | undefined;
    if (pending >= 0 && priority[pending]!.spellId === spellId) {
      step = pending;
      pending = -1;
    } else {
      step = presses[nextPress++];
    }
    if (step === undefined) return;
    const slot = ruleOfStep[step]!;
    if (slot >= 0) ruleFires[slot]! += 1;
  };
  const endMana = sim.snapshot().mana;
  const durationMs = factory.fight.sim.durationMs;
  const spells: Record<string, SpellTotals> = {};
  const totals = (id: string): SpellTotals =>
    (spells[id] ??= { damage: 0, tickDamage: 0, casts: 0, hits: 0, crits: 0, misses: 0 });
  const itemUses: Record<string, number> = {};
  const auraUpMs: Record<string, number> = {};
  const upSince = new Map<string, number>();
  let gains = 0;
  let lifeTaps = 0;
  for (const e of sim.log()) {
    switch (e.type) {
      case 'cast-start':
        started(e.spellId!);
        casting = true;
        break;
      case 'cast-cancel':
        casting = false;
        break;
      case 'queue': {
        const step = presses[nextPress++];
        pending = step === undefined ? -1 : step;
        break;
      }
      case 'queue-drop':
        pending = -1;
        break;
      case 'cast-complete': {
        const id = e.spellId!;
        if (casting) casting = false;
        else started(id);
        if (factory.itemActionIds.has(id)) itemUses[id] = (itemUses[id] ?? 0) + 1;
        else totals(id).casts += 1;
        if (id === LIFE_TAP_SPELL_ID) lifeTaps += 1;
        break;
      }
      case 'damage': {
        const t = totals(e.spellId!);
        t.damage += e.amount ?? 0;
        t.hits += 1;
        if (e.crit) t.crits += 1;
        break;
      }
      case 'tick': {
        const t = totals((e.spellId ?? e.auraId)!);
        t.damage += e.amount ?? 0;
        t.tickDamage += e.amount ?? 0;
        break;
      }
      case 'miss':
        totals(e.spellId!).misses += 1;
        break;
      case 'mana':
        gains += e.amount ?? 0;
        break;
      case 'aura-apply': {
        const id = e.auraId!;
        if (!factory.visibleAuraIds.has(id)) break;
        auraUpMs[id] ??= 0;
        if (!upSince.has(id)) upSince.set(id, e.atMs);
        break;
      }
      case 'aura-fade': {
        const id = e.auraId!;
        const since = upSince.get(id);
        if (since === undefined) break;
        auraUpMs[id] = (auraUpMs[id] ?? 0) + (e.atMs - since);
        upSince.delete(id);
        break;
      }
      default:
        break;
    }
  }
  for (const [id, since] of upSince) auraUpMs[id] = (auraUpMs[id] ?? 0) + (durationMs - since);
  return {
    index,
    seed,
    dps,
    damageTotal,
    spells,
    itemUses,
    auraUpMs,
    manaSpent: factory.startMana + gains - endMana,
    lifeTaps,
    ruleFires,
  };
}

/** The error an aborted `simulate` rejects with. */
function abortError(): DOMException {
  return new DOMException('The simulation was aborted', 'AbortError');
}

/** Lets other tasks (messages, rendering, an abort) run between chunks. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs the request's fights 0..runs-1 in order, in chunks of `chunk` (default 50; non-finite or
 * below 1: the default / 1), calling `onProgress(done, runs)` after each chunk and yielding to the
 * event loop between chunks. The samples are aggregated in index order, so the result does not
 * depend on the chunk size (byte-equal). Abort: the signal is checked before the first run, after
 * each `onProgress` and after each yield; an aborted run rejects with a DOMException named
 * 'AbortError' and no partial result, and nothing runs or reports after that. An invalid request
 * rejects with `prepareRun`'s error.
 */
export async function simulate(request: SimRequest, options: SimOptions = {}): Promise<SimResult> {
  const { onProgress, signal } = options;
  const chunk = Number.isFinite(options.chunk) ? Math.max(1, Math.floor(options.chunk!)) : DEFAULT_CHUNK;
  if (signal?.aborted) throw abortError();
  const factory = prepareRun(request);
  const aggregator = new Aggregator({
    runs: factory.runs,
    seed: factory.seed,
    fightMs: factory.fight.sim.durationMs,
    spellQueueWindowMs: factory.spellQueueWindowMs,
    labels: factory.labels,
    rules: factory.rules,
  });
  for (let i = 0; i < factory.runs; ) {
    const end = Math.min(factory.runs, i + chunk);
    for (; i < end; i++) aggregator.add(runOnce(factory, i));
    onProgress?.(i, factory.runs);
    if (signal?.aborted) throw abortError();
    if (i < factory.runs) {
      await yieldToEventLoop();
      if (signal?.aborted) throw abortError();
    }
  }
  return aggregator.result();
}
