// Property test (Task 2, Review Focus 1): the bot's step skipping stays exact with scripts. 200
// random valid scripts (random cast / use / wait rules with random conditions over the whole
// variable set, defs included) are played by the optimised bot (src/bot/bot.ts: skips to the next
// press opportunity) and by a bot that walks the priority at EVERY step (10 ms, and 1 ms for a
// subset): full logs, RNG draws and results must be identical.

import { describe, expect, it } from 'vitest';
import { runBot } from '../../src/bot/bot';
import { destructionEquipped } from '../../src/data/classes/warlock/destruction';
import { ITEM_SLOTS } from '../../src/data/items/db';
import { itemDbSync } from '../../src/data/items/dbSync';
import { createRng } from '../../src/engine/rng';
import type { EquippedItem } from '../../src/engine/types';
import { compileScript } from '../../src/script/compile';
import type { Script, ScriptContext, ScriptRule } from '../../src/script/types';
import { validateScript } from '../../src/script/validate';
import { DEFAULT_SETUP } from '../../src/setup/defaults';
import type { SetupConfig } from '../../src/setup/types';
import { applyConfig, fullSteppingBot, newFight } from '../fixtures/script-fights';

const db = itemDbSync();

function gear(): (EquippedItem | null)[] {
  const g: (EquippedItem | null)[] = structuredClone(destructionEquipped);
  g[ITEM_SLOTS.indexOf('trinket1')] = { id: 281735 }; // Dark Iron Smoking Pipe (on use)
  g[ITEM_SLOTS.indexOf('trinket2')] = { id: 29370 }; // Icon of the Silver Crescent (on use)
  return g;
}

type Gen = { next(): number };
const pick = <T>(r: Gen, xs: readonly T[]): T => xs[Math.floor(r.next() * xs.length)]!;
const int = (r: Gen, lo: number, hi: number) => lo + Math.floor(r.next() * (hi - lo + 1));

/** A random number-valued expression and a plausible range for it. */
function numExpr(r: Gen, ctx: ScriptContext): [string, number] {
  const spell = pick(r, ctx.spellIds);
  const item = pick(r, ctx.itemActions).id;
  const aura = pick(r, ctx.auraIds);
  return pick(r, [
    ['time.elapsed', 60],
    ['time.remaining', 60],
    ['time.elapsedMs', 60000],
    ['mana', 12000],
    ['mana.pct', 100],
    ['mana.missing', 6000],
    ['mana.max', 14000],
    [`target.aura.${aura}.remaining`, 30],
    [`self.aura.${aura}.remaining`, 30],
    [`target.aura.${aura}.stacks`, 3],
    [`self.aura.${aura}.charges`, 3],
    [`cd.${spell}.remaining`, 60],
    [`cd.${item}.remaining`, 120],
    [`cast.${spell}.count`, 10],
    [`use.${item}.count`, 2],
    ['gcd.remaining', 1.5],
    ['finisherWindow()', 5],
    [`manaCost(${pick(r, ['shadow-bolt', 'immolate', 'life-tap'])})`, 500],
  ] as [string, number][]);
}

function boolExpr(r: Gen, ctx: ScriptContext, depth: number, defs: readonly string[]): string {
  const k = r.next();
  if (depth > 0 && k < 0.25) {
    const n = int(r, 2, 3);
    const parts = Array.from({ length: n }, () => boolExpr(r, ctx, depth - 1, defs));
    return `(${parts.join(r.next() < 0.5 ? ' && ' : ' || ')})`;
  }
  if (depth > 0 && k < 0.32) return `!(${boolExpr(r, ctx, depth - 1, defs)})`;
  if (defs.length > 0 && k < 0.37) return `$${pick(r, defs)}`;
  if (k < 0.7) {
    const [e, range] = numExpr(r, ctx);
    const rhs = r.next() < 0.2 ? numExpr(r, ctx)[0] : String(Math.round(r.next() * range * 100) / 100);
    return `${e} ${pick(r, ['<', '<=', '>', '>=', '==', '!='])} ${rhs}`;
  }
  const spell = pick(r, ctx.spellIds);
  const item = pick(r, ctx.itemActions).id;
  const aura = pick(r, ctx.auraIds);
  return pick(r, [
    'heroism.active',
    'heroism.over',
    `target.aura.${aura}.active`,
    `self.aura.${aura}.active`,
    `cd.${spell}.ready`,
    `cd.${item}.ready`,
    `casting.${spell}`,
    `casting == '${spell}'`,
    "casting == ''",
    `inflight.${spell}`,
    `fight.last(${int(r, 1, 30)})`,
    `has(${spell})`,
    `dotRefreshDue(${pick(r, ['immolate', 'corruption'])})`,
    `minGap(${item}, ${int(r, 0, 150)})`,
  ]);
}

function randomScript(r: Gen, ctx: ScriptContext): Script {
  const defNames = r.next() < 0.4 ? ['a', 'b'].slice(0, int(r, 1, 2)) : [];
  const defs: Record<string, string> = {};
  defNames.forEach((name, i) => {
    defs[name] = boolExpr(r, ctx, 2, defNames.slice(0, i));
  });
  const rules: ScriptRule[] = [];
  const n = int(r, 1, 8);
  for (let i = 0; i < n; i++) {
    const a = r.next();
    const cond = r.next() < 0.85 ? boolExpr(r, ctx, 3, defNames) : undefined;
    if (a < 0.15) rules.push({ action: 'wait', if: cond ?? `time.elapsed < ${int(r, 1, 30)}` });
    else if (a < 0.4) rules.push({ action: 'use', id: pick(r, ctx.itemActions).id, ...(cond !== undefined && { if: cond }) });
    else rules.push({ action: 'cast', id: pick(r, ctx.spellIds), ...(cond !== undefined && { if: cond }) });
    if (r.next() < 0.05) rules[rules.length - 1]!.enabled = false;
  }
  if (r.next() < 0.7) rules.push({ action: 'cast', id: 'life-tap', if: 'mana < 500' });
  rules.push({ action: 'cast', id: 'shadow-bolt' });
  return defNames.length > 0 ? { rules, defs } : { rules };
}

function config(r: Gen, script: Script): SetupConfig {
  return {
    ...(structuredClone(DEFAULT_SETUP) as SetupConfig),
    gear: gear(),
    enabledBuffs: ['heroism', 'destruction-potion', 'super-mana-potion', 'dark-rune'],
    timed: { ...structuredClone(DEFAULT_SETUP.timed), heroism: { startSec: int(r, 0, 30), durationSec: 40 } },
    fightDurationSec: pick(r, [20, 45, 60]),
    distanceYd: pick(r, [0, 28, 40]),
    script,
  };
}

describe('random scripts: the step-skipping bot equals walking every step', () => {
  it('200 random valid scripts, 10 ms steps (and 1 ms for every 8th): identical logs, RNG draws and results', () => {
    const r = createRng(20261103);
    const ctx = applyConfig(config(r, { rules: [{ action: 'cast', id: 'shadow-bolt' }] }), db).script.context;
    let waits = 0;
    let uses = 0;
    for (let i = 0; i < 200; i++) {
      const script = randomScript(r, ctx);
      expect(validateScript(script, ctx).errors, JSON.stringify(script)).toEqual([]);
      const c = config(r, script);
      const applied = applyConfig(c, db);
      expect(applied.script.active).toBe(true);
      expect(compileScript(script, applied.script.context).errors).toEqual([]);
      const window = pick(r, [0, 400]);
      const seed = int(r, 1, 1000);
      for (const stepMs of i % 8 === 0 ? [10, 1] : [10]) {
        const fast = newFight(applied, seed, window);
        const full = newFight(applied, seed, window);
        const a = runBot(fast.sim, applied.spec.priority, stepMs);
        const b = fullSteppingBot(full.sim, applied.spec.priority, stepMs);
        const tag = `script ${i} step ${stepMs}: ${JSON.stringify(script)}`;
        expect(a, tag).toEqual(b);
        expect(fast.counter.draws, tag).toBe(full.counter.draws);
        expect(fast.sim.log(), tag).toEqual(full.sim.log());
        expect(fast.sim.snapshot(), tag).toEqual(full.sim.snapshot());
      }
      waits += applied.spec.priority.filter((s) => s.kind === 'wait').length;
      uses += applied.spec.priority.filter((s) => s.kind === 'use').length;
    }
    // The scripts do exercise wait and use steps.
    expect(waits).toBeGreaterThan(50);
    expect(uses).toBeGreaterThan(100);
  }, 300000);
});
