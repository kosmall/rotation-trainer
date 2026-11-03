// Every documented variable of the script language against a hand-built snapshot (units, inactive
// auras, counters, heroism.over, fight.last), defs, has(id), and run-time safety (unknown ids are
// false / 0, never a throw).

import { describe, expect, it } from 'vitest';
import type { SimSnapshot } from '../../src/engine/types';
import { compileExpr, EMPTY_EXT } from '../../src/script/evaluate';
import { parseExpr } from '../../src/script/parser';
import type { Expr, ScriptContext } from '../../src/script/types';
import { VARIABLE_DOCS } from '../../src/script/vars';

const CTX: ScriptContext = {
  spellIds: ['shadow-bolt', 'immolate', 'corruption', 'curse-of-doom', 'life-tap', 'shadowburn', 'incinerate'],
  auraIds: ['heroism', 'shadow-vulnerability', 'immolate', 'corruption', 'curse-of-doom', 'item-buff:35163', 'backlash'],
  itemActions: [
    { id: 'item:29370', spellId: 'use-item-29370' },
    { id: 'destruction-potion', spellId: 'use-destruction-potion' },
  ],
  heroismEndMs: 40000,
};

function snap(p: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    nowMs: 12500,
    phase: 'running',
    durationMs: 60000,
    gcdEndsAtMs: 13250,
    cast: { spellId: 'shadow-bolt', startMs: 12000, endMs: 14500 },
    mana: 7500,
    maxMana: 10000,
    cooldownRemainingMs: { 'shadow-bolt': 0, shadowburn: 4500, 'use-item-29370': 0, 'use-destruction-potion': 90250 },
    spells: {},
    gcdMs: 1500,
    targetAuras: {
      'shadow-vulnerability': { auraId: 'shadow-vulnerability', stacks: 1, charges: 3, remainingMs: 8750 },
      immolate: { auraId: 'immolate', stacks: 1, charges: 0, remainingMs: 1500 },
    },
    selfAuras: {
      heroism: { auraId: 'heroism', stacks: 1, charges: 0, remainingMs: 27500 },
      backlash: { auraId: 'backlash', stacks: 2, charges: 1, remainingMs: 250 },
    },
    damageTotal: 0,
    dps: 0,
    queuedSpellId: null,
    inFlight: [{ spellId: 'incinerate', landsAtMs: 12900 }],
    castCounts: { 'shadow-bolt': 4, immolate: 1 },
    useCounts: { 'use-item-29370': 1 },
    ...p,
  };
}

function compile(text: string, defs?: Record<string, string>) {
  const r = parseExpr(text);
  if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
  const parsedDefs: Record<string, Expr> = {};
  for (const [k, t] of Object.entries(defs ?? {})) {
    const d = parseExpr(t);
    if (!d.ok) throw new Error(`${k}: ${d.error.message}`);
    parsedDefs[k] = d.ast;
  }
  return compileExpr(r.ast, CTX, parsedDefs);
}
const ev = (text: string, s = snap(), defs?: Record<string, string>) => compile(text, defs)(s, EMPTY_EXT);

describe('variables', () => {
  it('time: seconds as numbers, ms only in time.elapsedMs', () => {
    expect(ev('time.elapsed')).toBe(12.5);
    expect(ev('time.remaining')).toBe(47.5);
    expect(ev('time.elapsedMs')).toBe(12500);
  });

  it('mana, mana.pct, mana.missing, mana.max (pct 0 with no max mana)', () => {
    expect(ev('mana')).toBe(7500);
    expect(ev('mana.pct')).toBe(75);
    expect(ev('mana.missing')).toBe(2500);
    expect(ev('mana.max')).toBe(10000);
    expect(ev('mana.pct', snap({ mana: 0, maxMana: 0 }))).toBe(0);
  });

  it('self.aura.<id>: active, remaining (s), stacks, charges; inactive aura 0 / false', () => {
    expect(ev('self.aura.heroism.active')).toBe(true);
    expect(ev('self.aura.heroism.remaining')).toBe(27.5);
    expect(ev('self.aura.backlash.stacks')).toBe(2);
    expect(ev('self.aura.backlash.charges')).toBe(1);
    expect(ev('self.aura.backlash.remaining')).toBe(0.25);
    for (const f of ['remaining', 'stacks', 'charges']) expect(ev(`self.aura.item-buff:35163.${f}`)).toBe(0);
    expect(ev('self.aura.item-buff:35163.active')).toBe(false);
    // A target aura is not a self aura.
    expect(ev('self.aura.immolate.active')).toBe(false);
  });

  it('target.aura.<id>: active, remaining, stacks, charges', () => {
    expect(ev('target.aura.shadow-vulnerability.active')).toBe(true);
    expect(ev('target.aura.shadow-vulnerability.charges')).toBe(3);
    expect(ev('target.aura.shadow-vulnerability.stacks')).toBe(1);
    expect(ev('target.aura.immolate.remaining')).toBe(1.5);
    expect(ev('target.aura.immolate.remaining < 2')).toBe(true);
    expect(ev('target.aura.corruption.active')).toBe(false);
    expect(ev('target.aura.corruption.remaining')).toBe(0);
    expect(ev('target.aura.curse-of-doom.charges')).toBe(0);
  });

  it('cd.<id>: ready, remaining (s); an item entry id maps to its action', () => {
    expect(ev('cd.shadow-bolt.ready')).toBe(true);
    expect(ev('cd.shadowburn.ready')).toBe(false);
    expect(ev('cd.shadowburn.remaining')).toBe(4.5);
    expect(ev('cd.item:29370.ready')).toBe(true);
    expect(ev('cd.use-item-29370.ready')).toBe(true);
    expect(ev('cd.destruction-potion.remaining')).toBe(90.25);
    expect(ev('cd.destruction-potion.ready')).toBe(false);
  });

  it('cast.<id>.count and use.<id>.count (entry id or action id), 0 when never', () => {
    expect(ev('cast.shadow-bolt.count')).toBe(4);
    expect(ev('cast.immolate.count')).toBe(1);
    expect(ev('cast.corruption.count')).toBe(0);
    expect(ev('use.item:29370.count')).toBe(1);
    expect(ev('use.use-item-29370.count')).toBe(1);
    expect(ev('use.destruction-potion.count')).toBe(0);
  });

  it("casting (id or ''), casting.<id>, inflight.<id>, gcd.remaining (s)", () => {
    expect(ev('casting')).toBe('shadow-bolt');
    expect(ev("casting == 'shadow-bolt'")).toBe(true);
    expect(ev('casting', snap({ cast: null }))).toBe('');
    expect(ev("casting == ''", snap({ cast: null }))).toBe(true);
    expect(ev('casting.shadow-bolt')).toBe(true);
    expect(ev('casting.immolate')).toBe(false);
    expect(ev('casting.shadow-bolt', snap({ cast: null }))).toBe(false);
    expect(ev('inflight.incinerate')).toBe(true);
    expect(ev('inflight.shadow-bolt')).toBe(false);
    expect(ev('gcd.remaining')).toBe(0.75);
    expect(ev('gcd.remaining', snap({ gcdEndsAtMs: 1000 }))).toBe(0);
  });

  it('heroism.active and heroism.over (over = ended or not in the fight, as the item-use rules)', () => {
    expect(ev('heroism.active')).toBe(true);
    expect(ev('heroism.over')).toBe(false);
    expect(ev('heroism.active', snap({ selfAuras: {} }))).toBe(false);
    expect(ev('heroism.over', snap({ nowMs: 39999, selfAuras: {} }))).toBe(false);
    expect(ev('heroism.over', snap({ nowMs: 40000, selfAuras: {} }))).toBe(true);
    const noHero = compileExpr((parseExpr('heroism.over') as { ast: Expr }).ast, { ...CTX, heroismEndMs: null });
    expect(noHero(snap({ nowMs: 0 }), EMPTY_EXT)).toBe(true);
  });

  it('fight.last(N): the last N seconds of the fight (remaining <= N)', () => {
    expect(ev('fight.last(20)', snap({ nowMs: 39999 }))).toBe(false);
    expect(ev('fight.last(20)', snap({ nowMs: 40000 }))).toBe(true);
    expect(ev('fight.last(47.5)')).toBe(true);
    expect(ev('fight.last(47.4)')).toBe(false);
  });

  it('has(id): spell, item entry id or item action id of the context', () => {
    expect(ev('has(shadowburn)')).toBe(true);
    expect(ev('has(conflagrate)')).toBe(false);
    expect(ev('has(item:29370)')).toBe(true);
    expect(ev("has('use-destruction-potion')")).toBe(true);
    expect(ev('has(item:12345)')).toBe(false);
    expect(ev('has(heroism)')).toBe(false);
  });

  it('every documented variable family is covered here', () => {
    const covered = [
      'time.elapsed', 'time.remaining', 'time.elapsedMs', 'mana', 'mana.pct', 'mana.missing', 'mana.max',
      'self.aura.<id>.active', 'self.aura.<id>.remaining', 'self.aura.<id>.stacks', 'self.aura.<id>.charges',
      'target.aura.<id>.active', 'target.aura.<id>.remaining', 'target.aura.<id>.stacks', 'target.aura.<id>.charges',
      'cd.<id>.ready', 'cd.<id>.remaining', 'cast.<id>.count', 'use.<id>.count', 'casting', 'casting.<id>',
      'inflight.<id>', 'gcd.remaining', 'heroism.active', 'heroism.over', 'fight.last(N)', 'has(id)',
    ];
    expect(VARIABLE_DOCS.map((d) => d.name).sort()).toEqual([...covered].sort());
  });
});

describe('operators, defs and run-time safety', () => {
  it('logic and comparisons (strict types, no coercion)', () => {
    expect(ev('heroism.active && target.aura.shadow-vulnerability.active')).toBe(true);
    expect(ev('!heroism.active || mana < 100')).toBe(false);
    expect(ev('mana >= 7500 && mana <= 7500 && mana != 1 && !(mana > 7500)')).toBe(true);
    expect(ev('true == !false')).toBe(true);
    expect(ev("'a' != 'b'")).toBe(true);
  });

  it('defs expand by reference (nested defs included)', () => {
    const defs = { burst: 'heroism.active && $isb', isb: 'target.aura.shadow-vulnerability.active', low: 'mana.pct' };
    expect(ev('$burst', snap(), defs)).toBe(true);
    expect(ev('$burst', snap({ targetAuras: {} }), defs)).toBe(false);
    expect(ev('$low < 80', snap(), defs)).toBe(true);
  });

  it('the user example: trinket 1 with Heroism and Shadow Vulnerability, trinket 2 after trinket 1', () => {
    const t1 = compile('heroism.active && target.aura.shadow-vulnerability.active');
    const t2 = compile('use.item:29370.count >= 1');
    expect(t1(snap(), EMPTY_EXT)).toBe(true);
    expect(t1(snap({ targetAuras: {} }), EMPTY_EXT)).toBe(false);
    expect(t2(snap({ useCounts: {} }), EMPTY_EXT)).toBe(false);
    expect(t2(snap(), EMPTY_EXT)).toBe(true);
  });

  it('unknown ids, invalid variables, type errors and def cycles evaluate to false / 0 and never throw', () => {
    expect(ev('self.aura.nope.active')).toBe(false);
    expect(ev('self.aura.constructor.remaining')).toBe(0);
    expect(ev('self.aura.__proto__.stacks')).toBe(0);
    expect(ev('cd.toString.ready')).toBe(false);
    expect(ev('cd.nope.remaining')).toBe(0);
    expect(ev('cast.hasOwnProperty.count')).toBe(0);
    expect(ev('use.valueOf.count')).toBe(0);
    expect(ev('mana.nope')).toBe(false);
    expect(ev('mana < true')).toBe(false);
    expect(ev('$a', snap(), { a: '$b', b: '$a' })).toBe(false);
    expect(ev('$missing')).toBe(false);
    expect(ev('nope(1)')).toBe(false);
    expect(ev('fight.last(true)')).toBe(false);
  });

  it('a compiled condition does not allocate per call (same results over 100 000 calls, pure)', () => {
    const f = compile('heroism.active && target.aura.shadow-vulnerability.remaining > 2 && use.item:29370.count >= 1 && !inflight.shadow-bolt && fight.last(50)');
    const s = snap();
    let trues = 0;
    for (let i = 0; i < 100000; i++) if (f(s, EMPTY_EXT) === true) trues++;
    expect(trues).toBe(100000);
  });
});
