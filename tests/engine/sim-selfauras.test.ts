import { describe, expect, it } from 'vitest';
import { CRIT_RATING_PER_PCT } from '../../src/data/common/ratings';
import type { SpecData } from '../../src/data/types';
import { Simulation } from '../../src/engine/sim';
import { computeStats } from '../../src/engine/stats';
import type { AuraDef, LogEvent, SpecHooks, SpellDef } from '../../src/engine/types';
import { TEST_TARGET, makeTestSpec, pumpProcHooks } from '../fixtures/testSpec';

/** infiniteMana by default, so mana never blocks and no regen entries appear. */
function newSim(
  opts: { spec?: SpecData; infiniteMana?: boolean; spellQueueWindowMs?: number } = {},
): Simulation {
  return new Simulation({
    spec: opts.spec ?? makeTestSpec(),
    target: TEST_TARGET,
    seed: 1,
    infiniteMana: opts.infiniteMana ?? true,
    spellQueueWindowMs: opts.spellQueueWindowMs ?? 0,
  });
}

/** The fixture spec with some spells or auras patched and extra auras appended. */
function patchedSpec(
  p: {
    spells?: Record<string, Partial<SpellDef>>;
    auras?: Record<string, Partial<AuraDef>>;
    extraAuras?: AuraDef[];
  },
  spec: Partial<SpecData> = {},
): SpecData {
  const base = makeTestSpec();
  return makeTestSpec({
    spells: base.spells.map((s) => ({ ...s, ...p.spells?.[s.id] })),
    auras: [...base.auras.map((a) => ({ ...a, ...p.auras?.[a.id] })), ...(p.extraAuras ?? [])],
    ...spec,
  });
}

/** The fixture with `free` applying the extra self aura `aura` (free is instant, off-GCD, no draws). */
function freeAppliesSpec(aura: AuraDef, freeManaCost = 0): SpecData {
  return patchedSpec({
    spells: { free: { applyAura: { auraId: aura.id, on: 'self' }, manaCost: freeManaCost } },
    extraAuras: [aura],
  });
}

function ofType(sim: Simulation, type: LogEvent['type'], spellId?: string): LogEvent[] {
  return sim.log().filter((e) => e.type === type && (spellId === undefined || e.spellId === spellId));
}

function damageOf(sim: Simulation, spellId: string): number[] {
  return ofType(sim, 'damage', spellId).map((e) => e.amount ?? NaN);
}

const FIXTURE_MAX_MANA = computeStats(makeTestSpec().setup).maxMana;
const icon = 'test';

describe('Simulation self auras: stat bonuses', () => {
  it('scaled deals 0 before pump, 100 during pumped, 0 again after it fades at +10000', () => {
    const sim = newSim();
    sim.cast('scaled');
    sim.advanceTo(1000);
    sim.cast('pump');
    sim.cast('scaled');
    sim.advanceTo(10999);
    sim.cast('scaled');
    sim.advanceTo(11000);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([0, 100, 100, 0]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 11000, type: 'aura-fade', auraId: 'pumped' }]);
  });

  it('refreshing pumped extends the duration and still adds 100 only once', () => {
    const sim = newSim();
    sim.cast('pump');
    sim.advanceTo(5000);
    sim.cast('pump');
    expect(sim.snapshot().selfAuras).toEqual({
      pumped: { auraId: 'pumped', stacks: 1, charges: 0, remainingMs: 10000 },
    });
    sim.cast('scaled');
    sim.advanceTo(10000); // the first application would have faded here
    sim.cast('scaled');
    sim.advanceTo(15000);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100, 100, 0]);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 15000, type: 'aura-fade', auraId: 'pumped' }]);
  });

  it('a stackable self aura adds its stat bonuses once, whatever its stacks', () => {
    const sim = newSim({ spec: patchedSpec({ auras: { pumped: { maxStacks: 3 } } }) });
    sim.cast('pump');
    sim.cast('pump');
    sim.cast('pump');
    expect(sim.snapshot().selfAuras.pumped?.stacks).toBe(3);
    sim.cast('scaled');
    expect(damageOf(sim, 'scaled')).toEqual([100]);
  });

  it('a dot applied before pumped keeps its original power in later ticks, a dot applied during pumped uses power +100', () => {
    // coeffTotal 3 over 3 ticks: each tick gains exactly the power (+100 under pumped).
    const tick = { intervalMs: 2000, total: 300, coeffTotal: 3, school: 'shadow' as const };
    const sim = newSim({ spec: patchedSpec({ auras: { dotAura: { tick } } }) });
    sim.cast('dot'); // ticks at 2000, 4000, 6000
    sim.advanceTo(1000);
    sim.cast('pump'); // pumped until 11000
    sim.advanceTo(7000);
    sim.cast('dot'); // ticks at 9000, 11000, 13000 (snapshotted while pumped)
    sim.advanceTo(13000);
    expect(ofType(sim, 'tick').map((e) => [e.atMs, e.amount])).toEqual([
      [2000, 100],
      [4000, 100],
      [6000, 100],
      [9000, 200],
      [11000, 200],
      [13000, 200],
    ]);
    expect(ofType(sim, 'aura-fade').filter((e) => e.auraId === 'pumped').map((e) => e.atMs)).toEqual([11000]);
  });

  it('a critRating self aura makes later rolls crit, and they stop after it fades', () => {
    const keen: AuraDef = {
      id: 'keen',
      name: 'Keen',
      icon,
      durationMs: 10000,
      selfStatBonuses: { critRating: 100 * CRIT_RATING_PER_PCT },
    };
    const sim = newSim({ spec: freeAppliesSpec(keen) });
    sim.cast('free');
    sim.cast('zap'); // 50 shadow, crit ×1.5
    sim.advanceTo(10000);
    sim.cast('zap');
    expect(ofType(sim, 'damage', 'zap').map((e) => [e.amount, e.crit])).toEqual([
      [75, true],
      [50, false],
    ]);
  });
});

describe('Simulation self auras: haste', () => {
  it('hasteUp shortens a bolt started after it (round(2000/1.1)) but not a bolt already in progress', () => {
    const sim = newSim({ spellQueueWindowMs: 400 });
    sim.cast('bolt'); // 0 -> 2000
    sim.advanceTo(1800);
    // Pressed while the bolt is in progress: queued, it lands when the bolt completes.
    expect(sim.cast('hasteUp')).toEqual({ ok: true, queued: true });
    sim.advanceTo(2000);
    expect(ofType(sim, 'cast-complete', 'bolt').map((e) => e.atMs)).toEqual([2000]);
    expect(sim.snapshot().selfAuras.hasteUp).toBeDefined();
    expect(sim.cast('bolt')).toEqual({ ok: true });
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 2000, endMs: 2000 + Math.round(2000 / 1.1) });
    // The GCD is hasted too: round(1500 / 1.1).
    expect(sim.snapshot().gcdEndsAtMs).toBe(2000 + Math.round(1500 / 1.1));
  });

  it('a bolt started under hasteUp keeps its hasted cast time when hasteUp fades mid-cast; the next bolt is unhasted', () => {
    const sim = newSim();
    sim.cast('hasteUp'); // until 10000
    sim.advanceTo(9000);
    sim.cast('bolt');
    expect(sim.snapshot().cast?.endMs).toBe(9000 + 1818);
    sim.advanceTo(10818);
    expect(ofType(sim, 'aura-fade')).toEqual([{ atMs: 10000, type: 'aura-fade', auraId: 'hasteUp' }]);
    expect(ofType(sim, 'cast-complete', 'bolt').map((e) => e.atMs)).toEqual([10818]);
    sim.cast('bolt');
    expect(sim.snapshot().cast).toEqual({ spellId: 'bolt', startMs: 10818, endMs: 12818 });
    expect(sim.snapshot().gcdEndsAtMs).toBe(10818 + 1500);
  });
});

describe('Simulation self auras: modifiers', () => {
  it('dmgUp multiplies shadow damage by 1.5 while active and not after it fades', () => {
    const sim = newSim();
    sim.cast('dmgUp'); // until 10000
    sim.cast('zap'); // shadow 50
    sim.advanceTo(1500);
    sim.cast('scorch'); // fire 100: not affected
    sim.advanceTo(10000);
    sim.cast('zap');
    expect(damageOf(sim, 'zap')).toEqual([75, 50]);
    expect(damageOf(sim, 'scorch')).toEqual([100]);
  });

  it('a manaCostMult self aura fading during a cast does not change what that cast spends', () => {
    const cheap: AuraDef = {
      id: 'cheap',
      name: 'Cheap',
      icon,
      durationMs: 1000,
      selfModifiers: [{ spellIds: ['bolt'], manaCostMult: 0.5 }],
    };
    const sim = newSim({ spec: freeAppliesSpec(cheap), infiniteMana: false });
    sim.cast('free');
    sim.cast('bolt'); // checked cost 25; cheap fades at 1000, the bolt completes at 2000
    sim.advanceTo(1000);
    expect(sim.snapshot().selfAuras).toEqual({});
    sim.advanceTo(2000);
    expect(ofType(sim, 'cast-complete', 'bolt').map((e) => e.atMs)).toEqual([2000]);
    expect(sim.snapshot().mana).toBe(FIXTURE_MAX_MANA - 25);
  });
});

describe('Simulation self auras: max mana', () => {
  const brainy: AuraDef = {
    id: 'brainy',
    name: 'Brainy',
    icon,
    durationMs: 10000,
    selfStatBonuses: { intellect: 100 },
  };

  it('with infiniteMana, mana stays pinned to maxMana when an intellect aura raises and lowers it', () => {
    const sim = newSim({ spec: freeAppliesSpec(brainy) });
    sim.cast('free');
    const raised = sim.snapshot();
    expect(raised.maxMana).toBe(FIXTURE_MAX_MANA + 1500);
    expect(raised.mana).toBe(raised.maxMana);
    sim.advanceTo(10000);
    const lowered = sim.snapshot();
    expect(lowered.maxMana).toBe(FIXTURE_MAX_MANA);
    expect(lowered.mana).toBe(lowered.maxMana);
  });

  it('raising maxMana adds no mana; lowering it clamps mana to the new maxMana', () => {
    const sim = newSim({ spec: freeAppliesSpec(brainy), infiniteMana: false });
    sim.cast('free');
    expect(sim.snapshot().maxMana).toBe(FIXTURE_MAX_MANA + 1500);
    expect(sim.snapshot().mana).toBe(FIXTURE_MAX_MANA);
    sim.cast('tap'); // +300, room up to the raised maxMana
    expect(sim.snapshot().mana).toBe(FIXTURE_MAX_MANA + 300);
    sim.advanceTo(10000);
    expect(sim.snapshot().maxMana).toBe(FIXTURE_MAX_MANA);
    expect(sim.snapshot().mana).toBe(FIXTURE_MAX_MANA);
  });
});

describe('Simulation self auras: the exact expiry ms', () => {
  it('a cast completing at exactly the aura expiry ms does not see the expiring aura', () => {
    const sim = newSim();
    sim.cast('dmgUp'); // until 10000
    sim.advanceTo(8000);
    sim.cast('bolt'); // completes at 10000
    sim.advanceTo(10000);
    expect(ofType(sim, 'damage', 'bolt')).toEqual([
      { atMs: 10000, type: 'damage', spellId: 'bolt', amount: 100, crit: false },
    ]);
  });

  it('a mana tick at exactly the aura expiry ms (scheduled before the fade) does not see the expiring aura', () => {
    // mp5 50 = 20 mana per 2 s tick. free costs 400 so the bar has room for every tick.
    const flow: AuraDef = { id: 'flow', name: 'Flow', icon, durationMs: 10000, selfStatBonuses: { mp5: 50 } };
    const sim = newSim({ spec: freeAppliesSpec(flow, 400), infiniteMana: false });
    sim.cast('free'); // starts the fight: every regen tick is scheduled before flow's fade at 10000
    sim.advanceTo(10000);
    const spiritTick = computeStats(makeTestSpec().setup).spiritRegenPerSec * 2;
    const ticks = ofType(sim, 'mana').map((e) => [e.atMs, e.amount]);
    // 2000 and 4000 are inside the five-second rule (mp5 only); 6000 and 8000 add spirit regen.
    expect(ticks).toEqual([
      [2000, 20],
      [4000, 20],
      [6000, 20 + spiritTick],
      [8000, 20 + spiritTick],
      [10000, spiritTick],
    ]);
  });
});

describe('Simulation self auras: hooks', () => {
  it('a set hook that procs pumped with roll() < 1 and an internal-cooldown aura \'icd\' (duration 5000, checked via hasSelfAura) fires at most once per 5000 ms across repeated casts', () => {
    const spec = makeTestSpec({
      sets: [
        { setId: 'proc-set', name: 'Proc Set 2', pieces: 2, description: 'Procs pumped.', hooks: pumpProcHooks() },
      ],
      setup: { ...makeTestSpec().setup, setPieces: { 'proc-set': 2 } },
    });
    const sim = newSim({ spec });
    for (let t = 0; t <= 12000; t += 1000) {
      sim.advanceTo(t);
      expect(sim.cast('scaled')).toEqual({ ok: true });
    }
    const applies = (auraId: string) => ofType(sim, 'aura-apply').filter((e) => e.auraId === auraId).map((e) => e.atMs);
    expect(applies('pumped')).toEqual([0, 5000, 10000]);
    expect(applies('icd')).toEqual([0, 5000, 10000]);
    // The proc lands after the first scaled's damage; every later scaled sees spell power 100.
    expect(damageOf(sim, 'scaled')).toEqual([0, ...Array<number>(12).fill(100)]);
  });

  it('the hook api object is frozen', () => {
    let frozen: boolean | undefined;
    const hooks: SpecHooks = {
      onSpellResolved(_e, api) {
        frozen = Object.isFrozen(api);
      },
    };
    const sim = newSim({ spec: makeTestSpec({ hooks }) });
    sim.cast('scaled');
    expect(frozen).toBe(true);
  });
});
