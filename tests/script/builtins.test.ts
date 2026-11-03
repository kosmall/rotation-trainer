// The basic rotation's built-in functions (Task 2): dotRefreshDue(id), finisherWindow(),
// manaCost(id), minGap(id, N). They run the very closures and numbers of rotation.ts / itemUse.ts,
// so a converted script compares exactly what the basic rotation compares.

import { describe, expect, it } from 'vitest';
import { minGapCheck } from '../../src/data/classes/warlock/itemUse';
import { buildPriority, rotationScriptFacts, shadowburnFinisherWindowMs } from '../../src/data/classes/warlock/rotation';
import { rotationTalentsFor } from '../../src/data/classes/warlock/destruction';
import { talentPresetById } from '../../src/data/classes/warlock/talentPresets';
import type { SimSnapshot } from '../../src/engine/types';
import { compileExpr, EMPTY_EXT } from '../../src/script/evaluate';
import { parseExpr } from '../../src/script/parser';
import { printExpr } from '../../src/script/printer';
import type { Expr, ScriptContext } from '../../src/script/types';
import { validateScript } from '../../src/script/validate';
import { createRng } from '../../src/engine/rng';

const FACTS = rotationScriptFacts(28);
const CTX: ScriptContext = {
  spellIds: ['shadow-bolt', 'immolate', 'corruption', 'curse-of-doom', 'life-tap', 'shadowburn'],
  auraIds: ['immolate', 'corruption', 'heroism'],
  itemActions: [
    { id: 'item:29370', spellId: 'use-item-29370', cooldownMs: 120000 },
    { id: 'super-mana-potion', spellId: 'use-super-mana-potion', cooldownMs: 120000 },
    { id: 'no-cd', spellId: 'use-no-cd' },
  ],
  heroismEndMs: null,
  rotation: FACTS,
};

function snap(p: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    nowMs: 10000,
    phase: 'running',
    durationMs: 60000,
    gcdEndsAtMs: 0,
    cast: null,
    mana: 5000,
    maxMana: 10000,
    cooldownRemainingMs: {},
    spells: {},
    gcdMs: 1500,
    targetAuras: {},
    selfAuras: {},
    damageTotal: 0,
    dps: 0,
    queuedSpellId: null,
    inFlight: [],
    castCounts: {},
    useCounts: {},
    ...p,
  };
}

const ast = (text: string): Expr => {
  const p = parseExpr(text);
  if (!p.ok) throw new Error(`${text}: ${p.error.message}`);
  return p.ast;
};
const ev = (text: string, s = snap(), ctx = CTX) => compileExpr(ast(text), ctx)(s, EMPTY_EXT);

describe('built-in functions: syntax', () => {
  it('ids may be bare or quoted; the printer writes them bare when they read as a path', () => {
    expect(ast('dotRefreshDue(immolate)')).toEqual(ast("dotRefreshDue('immolate')"));
    expect(printExpr(ast("manaCost('shadow-bolt')"))).toBe('manaCost(shadow-bolt)');
    expect(printExpr(ast("minGap('item:29370', 30)"))).toBe('minGap(item:29370, 30)');
    expect(printExpr(ast('time.remaining <= finisherWindow()'))).toBe('time.remaining <= finisherWindow()');
    expect(printExpr(ast("minGap('a b', 3)"))).toBe("minGap('a b', 3)");
    for (const t of ['dotRefreshDue(corruption)', 'mana < manaCost(shadow-bolt)', 'minGap(item:29370, 30.5) && finisherWindow() > 1']) {
      expect(printExpr(ast(printExpr(ast(t))))).toBe(printExpr(ast(t)));
    }
  });

  it('validation: argument errors, unknown ids (warnings), unavailable facts', () => {
    const v = (cond: string, ctx = CTX) => validateScript({ rules: [{ action: 'cast', id: 'shadow-bolt', if: cond }] }, ctx);
    expect(v('dotRefreshDue(immolate) && mana < manaCost(shadow-bolt) && time.remaining <= finisherWindow() && minGap(item:29370, 30)')).toEqual({
      errors: [],
      warnings: [],
    });
    expect(v('dotRefreshDue()').errors[0]!.message).toMatch(/dotRefreshDue\(id\) needs one spell id/);
    expect(v('finisherWindow(3) > 1').errors[0]!.message).toMatch(/takes no argument/);
    expect(v('minGap(item:29370)').errors[0]!.message).toMatch(/minGap\(id, N\) needs/);
    expect(v("minGap(item:29370, 'x')").errors[0]!.message).toMatch(/needs a number of seconds/);
    expect(v('manaCost(shadow-bolt)').errors[0]!.message).toMatch(/a condition must be true\/false/);
    expect(v('dotRefreshDue(shadow-bolt)').warnings[0]).toMatchObject({ message: expect.stringMatching(/'shadow-bolt' is no DoT spell/) });
    expect(v('mana < manaCost(shadow-blot)').warnings[0]).toMatchObject({ suggestion: 'shadow-bolt' });
    expect(v('minGap(item:29371, 3)').warnings[0]!.message).toMatch(/not in this setup.*minGap\(\) is false/);
    const { rotation: _r, ...bare } = CTX;
    expect(v('dotRefreshDue(immolate)', bare).warnings[0]!.message).toMatch(/not available here/);
    expect(ev('dotRefreshDue(immolate)', snap(), bare)).toBe(false);
    expect(ev('finisherWindow() == 0', snap(), bare)).toBe(true);
  });
});

describe('built-in functions: values', () => {
  it('finisherWindow() is the Shadowburn window in seconds (talents and distance)', () => {
    expect(ev('finisherWindow() == 3.9')).toBe(true); // 2500 + 1400 ms at 28 yd
    const destro = rotationTalentsFor(talentPresetById('affliction')!.talents)!;
    for (const [d, t] of [[0, undefined], [40, undefined], [28, destro]] as const) {
      const f = rotationScriptFacts(d, {}, t);
      expect(f.finisherWindowMs).toBe(shadowburnFinisherWindowMs(d, t));
    }
  });

  it('time.remaining <= finisherWindow() equals remaining ms <= window ms at every ms around the edge', () => {
    for (const [d, w] of [[28, 3900], [0, 2500], [40, 4500], [13, 3150]] as const) {
      const ctx = { ...CTX, rotation: rotationScriptFacts(d) };
      const read = compileExpr(ast('time.remaining <= finisherWindow()'), ctx);
      const windowMs = rotationScriptFacts(d).finisherWindowMs;
      expect(windowMs).toBe(w);
      for (let left = windowMs - 50; left <= windowMs + 50; left++) {
        for (const durationMs of [60000, 300000, 600000]) {
          const s = snap({ durationMs, nowMs: durationMs - left });
          expect(read(s, EMPTY_EXT)).toBe(left <= windowMs);
        }
      }
    }
  });

  it('dotRefreshDue(id) is the basic rotation step condition (same closure behaviour on random snapshots)', () => {
    const steps = buildPriority({ curse: 'none', immolate: true, corruption: true, shadowburnFinisher: false, lifeTapBelowMana: 'auto' }, 28, { immolate: 1, corruption: 1 });
    const facts = rotationScriptFacts(28, { immolate: 1, corruption: 1 });
    const ctx = { ...CTX, rotation: facts };
    const rng = createRng(7);
    for (const spell of ['immolate', 'corruption']) {
      const when = steps.find((s) => s.spellId === spell)!.when!;
      const read = compileExpr(ast(`dotRefreshDue(${spell})`), ctx);
      for (let i = 0; i < 3000; i++) {
        const durationMs = [60000, 300000][Math.floor(rng.next() * 2)]!;
        const nowMs = Math.floor(rng.next() * durationMs);
        const s = snap({
          nowMs,
          durationMs,
          cast: rng.next() < 0.2 ? { spellId: rng.next() < 0.5 ? spell : 'shadow-bolt', startMs: nowMs, endMs: nowMs + 1500 } : null,
          inFlight: rng.next() < 0.1 ? [{ spellId: spell, landsAtMs: nowMs + 100 } as SimSnapshot['inFlight'][number]] : [],
          targetAuras:
            rng.next() < 0.7 ? { [spell]: { auraId: spell, stacks: 1, charges: 0, remainingMs: Math.floor(rng.next() * 4000) } } : {},
        });
        expect(read(s, EMPTY_EXT)).toBe(when(s));
      }
    }
  });

  it("manaCost(id): the talents' cost (Cataclysm: 399 for Shadow Bolt)", () => {
    expect(ev('manaCost(shadow-bolt) == 399')).toBe(true);
    expect(ev('mana < manaCost(shadow-bolt)', snap({ mana: 398.5 }))).toBe(true);
    expect(ev('mana < manaCost(shadow-bolt)', snap({ mana: 399 }))).toBe(false);
    const affl = rotationScriptFacts(28, {}, rotationTalentsFor(talentPresetById('affliction')!.talents)!);
    expect(affl.manaCost('shadow-bolt')).toBe(420);
    expect(affl.manaCost('shadowburn')).toBe(515); // spells.ts, no Cataclysm
    // No talents at all: no Shadowburn (a talent spell), Shadow Bolt 3 s.
    const none = rotationScriptFacts(28, {}, { modifiers: [], spells: [] });
    expect(none.manaCost('shadowburn')).toBeUndefined();
    expect(none.dotRefreshDue('immolate')).toBeDefined();
    expect(none.finisherWindowMs).toBe(4400);
  });

  it('minGap(id, N) runs itemUse.ts minGapCheck (cooldown - remaining >= min(N s, cooldown)); always true without a cooldown or N <= 0', () => {
    const check = minGapCheck('use-item-29370', 120000, 30)!;
    for (const rem of [0, 1, 89999, 90000, 90001, 120000]) {
      const s = snap({ cooldownRemainingMs: { 'use-item-29370': rem } });
      expect(ev('minGap(item:29370, 30)', s)).toBe(check(s));
      expect(ev('minGap(item:29370, 30)', s)).toBe(rem <= 90000);
      // A gap over the cooldown is capped at it; a non-literal N runs the same arithmetic.
      expect(ev('minGap(item:29370, 500)', s)).toBe(rem === 0);
      expect(ev('minGap(item:29370, mana.pct)', snap({ mana: 3000, cooldownRemainingMs: { 'use-item-29370': rem } }))).toBe(rem <= 90000);
    }
    expect(ev('minGap(item:29370, 30)')).toBe(true); // no cooldown entry: elapsed = the whole cooldown
    expect(ev('minGap(no-cd, 30)', snap({ cooldownRemainingMs: { 'use-no-cd': 5 } }))).toBe(true);
    expect(ev('minGap(item:29370, 0)', snap({ cooldownRemainingMs: { 'use-item-29370': 100000 } }))).toBe(true);
    expect(ev('minGap(use-item-29370, 30)', snap({ cooldownRemainingMs: { 'use-item-29370': 100000 } }))).toBe(false);
  });
});
