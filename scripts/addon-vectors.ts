// `npm run addon:vectors [-- --out <file>]`
// Test vectors for the LifeTapAdvisor addon: random fight states with the next action that the rotation
// spec (the one checked against the simulator) gives. The addon's Lua tests must reach the same answer.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRng } from '../src/engine/rng';
import { loadVariant, ranksAt } from '../src/forever/builds';
import { loadParams } from '../src/forever/data/load';
import { simulatePull } from '../src/forever/fight';
import { evalCond, rotationSpec, type SpecCtx } from '../src/forever/rotation-spec';
import type { EurekaPolicy } from '../src/forever/types';
import { POLICIES } from '../src/forever/web/api';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
};
const ADDON_TESTS = 'C:/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/LifeTapAdvisor/tests';
const out = arg('out', existsSync(ADDON_TESTS) ? join(ADDON_TESTS, 'vectors.lua') : 'addon-out/vectors.lua');

const BUILDS = ['DT_SS', 'DT_SS_WRACK_70', 'DT_SS_WRACK_50', 'AFF_WRACK', 'DEMO_PACT_R1', 'DEMO_FIRE', 'CWF_DESTRO_IMP', 'TF_DEMO_FEL'];
const LEVELS = [14, 36, 45, 58];
const POLICY_LIST: EurekaPolicy[] = ['first_affected', 'filler', 'ttk', 'pull_start', 'delay'];
const SPELLS = ['shadow_bolt', 'corruption', 'bane_of_agony', 'immolate', 'searing_pain', 'drain_life', 'drain_soul', 'siphon_life', 'wrack', 'curse_of_elements', 'eureka'];
const DOTS = ['corruption', 'bane_of_agony', 'immolate', 'siphon_life'];

const base = POLICIES.BEST_1MOB!.params;
const rng = createRng(20261126);
const b = (p = 0.5): boolean => rng.next() < p;
const pick = (list: readonly string[], p: number): string[] => list.filter(() => b(p));

const commons: Record<string, unknown> = {};
const rows: unknown[] = [];
for (const policy of POLICY_LIST) {
  const params = loadParams({ ...base, eureka_policy: policy });
  commons[policy] = rotationSpec(loadVariant('DT_SS'), params).eureka;
  for (const buildId of BUILDS) {
    const v = loadVariant(buildId);
    const spec = rotationSpec(v, params);
    for (const level of LEVELS) {
      const r = simulatePull({ variant: v, level, profile: 'average', params, mobs: 1 }, 1).rates;
      const hpPerSec = (100 * r.dpsEstimate) / r.mobHp;
      const fin = (100 * (r.dotsDps + r.petDps + r.drainSoulDps)) / r.mobHp;
      const ranks = ranksAt(v, level);
      const talents = { soul_harvest: ranks['soul_harvest'] ?? 0, demonic_brand: ranks['demonic_brand'] ?? 0 };
      for (let n = 0; n < 3; n++) {
        const knows = pick(SPELLS, 0.85);
        const afford = pick(SPELLS, 0.9);
        const dots = pick(DOTS, 0.4);
        const curse = b(0.3);
        const trance = b(0.2);
        const pet = b(0.7);
        const mobs = b() ? 1 : 2;
        const eurekaReady = b(0.6);
        const brand = b(0.5);
        const firstAction = b(0.3);
        const combatSec = Math.round(rng.next() * 20 * 10) / 10;
        // keep the readable inputs and the health at 2 decimals, as the Lua side reads them
        const hp = Math.round(rng.next() * 10000) / 100;
        // the player's own health (the Wrack builds channel Wrack only above a floor)
        const playerHp = Math.round(rng.next() * 10000) / 100;
        const level2 = { hpPerSec: Math.round(hpPerSec * 100) / 100, fin: Math.round(fin * 100) / 100 };
        const ctx: SpecCtx = {
          params, variant: v, mobsInPull: mobs, petAlive: pet, hasShadowTrance: trance,
          known: (id) => knows.includes(id),
          talentRank: (id) => (talents as Record<string, number>)[id] ?? 0,
          targetHasDot: (id) => dots.includes(id),
          targetDotRemainingMs: () => 0,
          targetHasCurse: () => curse,
          targetBrandRemainingMs: () => (brand ? 0 : 5000),
          targetBrandCharges: () => (brand ? 0 : 3),
          targetHp: () => hp,
          estTtkSec: () => hp / level2.hpPerSec,
          drainSoulKillSec: () => hp / level2.fin,
          hpPct: playerHp,
          drainSoulExpected: () => 0,
          fillerExpected: () => 0,
        };
        const step = spec.steps.find((s) => afford.includes(s.spell) && evalCond(s.when, ctx));
        let eureka = false;
        if (step && spec.eureka.enabled && knows.includes('eureka')) {
          eureka = evalCond(spec.eureka.when, {
            ...ctx,
            cooldownReady: () => eurekaReady,
            firstActionOfPull: firstAction,
            nextSpell: step.spell,
            nextIsFiller: step.filler === true,
            combatSec,
          });
        }
        rows.push({ policy, build: buildId, level, hp, playerHp, hpPerSec: level2.hpPerSec, fin: level2.fin, talents, knows, afford, dots, curse, trance, pet, mobs, eurekaReady, brand, firstAction, combatSec, expect: step ? step.id : null, eureka });
      }
    }
  }
}

const luaInline = (v: unknown): string => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  const key = (k: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`);
  if (Array.isArray(v)) return `{ ${v.map(luaInline).join(', ')} }`;
  return `{ ${Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => `${key(k)} = ${luaInline(x)}`).join(', ')} }`;
};
const text = `-- Generated by \`npm run addon:vectors\` in the rotation-trainer app. Do not edit by hand.
-- Fight states and the next action the app's rotation spec gives for them.
return {
  commons = ${luaInline(commons)},
  rows = {
${rows.map((r) => `    ${luaInline(r)},`).join('\n')}
  },
}
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.log(`wrote ${out} (${rows.length} states)`);
